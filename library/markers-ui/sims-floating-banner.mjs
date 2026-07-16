// library: sims-floating-banner  (markers-ui/sims-floating-banner.mjs)
// source: cuarto-frio-safran · cuarto-3d.html:32109-32189 (+ roundRect 31937) · client-shipped,
//         client-validated look (2026)
// what: "SIMS-style" floating billboard — canvas badge (rounded card + inverted pointer arrow +
//       brand line with optional logo + big glowing main line) rendered on a camera-facing Sprite,
//       backed by an additive pulsing halo Sprite; vertical bob + subtle sway loop.
// params: position, lines [brandLine, mainLine], logoTexture?, colors?, scale?/width?, haloEnabled?.
// deps: three (Sprite, SpriteMaterial, CanvasTexture) + 2D canvas.
// coupling notes:
//   - DECOUPLED from the source wall-sign closure: no glyph-reveal, no PointLight wall wash, no DOM
//     sliders — those belong to backlit-sign-glyph-reveal (separate recipe).
//   - DETERMINISTIC-CAPTURE RULE: the source ran its own rAF + performance.now(); here ALL animation
//     is driven by the caller via update(dtSeconds) from the scene clock. No internal rAF, no Date.now.
//   - `toneMapped:false` on BOTH sprite materials is mandatory under the house ACES rig (canvas colors
//     wash out without it); in a non-ACES scene the same sprites will read oversaturated.
//   - Sprite ordering: halo renderOrder 998, badge 999, both depthWrite:false — scenes with heavy
//     transparency need global renderOrder management around these values.
//   - SCALE: defaults are SOURCE units (banner width 46 in cuarto-3d's custom ~0.3 m/unit scale,
//     floating ~15 units above a 65-unit-tall room). In a 1 m/unit scene start near scale ≈ 0.15.
//   - The badge texture is drawn ONCE (and on setText) — never per frame; re-uploading a 2048x1024
//     canvas each frame caused periodic jank in the source (perf lesson at cuarto-3d.html:32033-32036).
//   - logoTexture: a THREE.Texture (its .image is drawn) or any CanvasImageSource, already LOADED —
//     the factory draws synchronously and does not wait for images.

import * as THREE from 'three';

function roundRect(c, x, y, w, h, rr) {
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

const DEFAULT_COLORS = {
  badgeTop: '#ffffff',
  badgeBottom: '#e9f1fb',
  border: '#7fc4ff',
  badgeGlow: 'rgba(40,150,255,0.55)',
  pointerTop: '#5ab0f7',
  pointerBottom: '#1457b6',
  pointerBorder: '#bfe0ff',
  pointerGlow: 'rgba(46,150,255,0.9)',
  brandText: '#11459a',
  mainTop: '#46a6f2',
  mainBottom: '#1457b6',
  mainGlow: 'rgba(46,150,255,0.95)',
  halo: 'rgba(96,182,255,0.9)',
  haloShadow: 'rgba(96,182,255,1)',
};

/**
 * Floating billboard banner (always camera-facing).
 * @param {object} opts
 * @param {THREE.Vector3|{x,y,z}} opts.position   anchor point the banner bobs around.
 * @param {string[]} [opts.lines]                 [brandLine, mainLine]; default ['SAFRAN','FREEZER'].
 * @param {THREE.Texture|CanvasImageSource} [opts.logoTexture]  optional loaded logo, drawn left of the brand line.
 * @param {object} [opts.colors]                  overrides merged over the source blue palette.
 * @param {number} [opts.scale=1]                 multiplies `width` (source width 46 units).
 * @param {number} [opts.width=46]                banner width in world units at scale 1.
 * @param {boolean} [opts.haloEnabled=true]
 * @returns {{ group: THREE.Group, update(dtSeconds:number):void, setHalo(on:boolean):void,
 *             setText(lines:string[]):void, dispose():void }}
 *          Caller adds `group` to the scene and calls update(dt) each frame from its own clock.
 */
export function createFloatingBanner({
  position,
  lines = ['SAFRAN', 'FREEZER'],
  logoTexture = null,
  colors = {},
  scale = 1,
  width = 46,
  haloEnabled = true,
} = {}) {
  const C = { ...DEFAULT_COLORS, ...colors };
  const logoImage = (logoTexture && logoTexture.isTexture) ? logoTexture.image : logoTexture;
  let currentLines = lines.slice();

  // ---- badge canvas (drawn once; redrawn only by setText) ----
  const fcv = document.createElement('canvas');
  fcv.width = 2048;
  fcv.height = 1024;
  const fg2 = fcv.getContext('2d');
  const fTex = new THREE.CanvasTexture(fcv);
  fTex.colorSpace = THREE.SRGBColorSpace;
  fTex.anisotropy = 16;

  function drawBadge() {
    const W = fcv.width, H = fcv.height;
    const [brandLine = '', mainLine = ''] = currentLines;
    fg2.clearRect(0, 0, W, H);

    // rounded card
    const bx = 46, by = 34, bw = W - 92, bh = H * 0.60;
    fg2.save();
    fg2.shadowColor = C.badgeGlow;
    fg2.shadowBlur = 42;
    fg2.shadowOffsetY = 6;
    const grad = fg2.createLinearGradient(0, by, 0, by + bh);
    grad.addColorStop(0, C.badgeTop);
    grad.addColorStop(1, C.badgeBottom);
    fg2.fillStyle = grad;
    roundRect(fg2, bx, by, bw, bh, 44);
    fg2.fill();
    fg2.restore();
    fg2.lineWidth = 5;
    fg2.strokeStyle = C.border;
    roundRect(fg2, bx, by, bw, bh, 44);
    fg2.stroke();

    // inverted pointer arrow (points at the anchored equipment/room)
    const tcx = W / 2, tw = 150, ty0 = by + bh - 2, ty1 = H - 24;
    fg2.save();
    fg2.shadowColor = C.pointerGlow;
    fg2.shadowBlur = 26;
    const tg = fg2.createLinearGradient(0, ty0, 0, ty1);
    tg.addColorStop(0, C.pointerTop);
    tg.addColorStop(1, C.pointerBottom);
    fg2.fillStyle = tg;
    fg2.beginPath();
    fg2.moveTo(tcx - tw / 2, ty0);
    fg2.lineTo(tcx + tw / 2, ty0);
    fg2.lineTo(tcx, ty1);
    fg2.closePath();
    fg2.fill();
    fg2.lineWidth = 5;
    fg2.strokeStyle = C.pointerBorder;
    fg2.stroke();
    fg2.restore();

    // brand line: [logo] BRAND
    const topY = by + bh * 0.34, logoSz = bh * 0.34;
    let cur = W * 0.31;
    if (logoImage) fg2.drawImage(logoImage, cur, topY - logoSz / 2, logoSz, logoSz);
    cur += logoSz + 16;
    fg2.font = '700 ' + Math.round(bh * 0.17) + "px Arial, 'Helvetica Neue', sans-serif";
    fg2.textBaseline = 'middle';
    fg2.textAlign = 'left';
    fg2.fillStyle = C.brandText;
    if ('letterSpacing' in fg2) fg2.letterSpacing = '6px';
    fg2.fillText(brandLine, cur, topY);
    if ('letterSpacing' in fg2) fg2.letterSpacing = '0px';

    // main line: big, glowing, double-pass fill
    const fY = by + bh * 0.70;
    fg2.font = '800 ' + Math.round(bh * 0.29) + "px Arial, 'Helvetica Neue', sans-serif";
    fg2.textAlign = 'center';
    fg2.textBaseline = 'middle';
    if ('letterSpacing' in fg2) fg2.letterSpacing = '10px';
    fg2.save();
    fg2.shadowColor = C.mainGlow;
    fg2.shadowBlur = 28;
    const fgr = fg2.createLinearGradient(0, fY - 55, 0, fY + 55);
    fgr.addColorStop(0, C.mainTop);
    fgr.addColorStop(1, C.mainBottom);
    fg2.fillStyle = fgr;
    fg2.fillText(mainLine, W / 2 + 8, fY);
    fg2.shadowBlur = 16;
    fg2.fillText(mainLine, W / 2 + 8, fY); // second pass thickens the glow
    fg2.restore();
    if ('letterSpacing' in fg2) fg2.letterSpacing = '0px';

    fTex.needsUpdate = true;
  }
  drawBadge();

  // ---- halo canvas (additive pulsing glow behind the badge), drawn once ----
  const hcv = document.createElement('canvas');
  hcv.width = 512;
  hcv.height = 256;
  const hg = hcv.getContext('2d');
  hg.shadowColor = C.haloShadow;
  hg.shadowBlur = 110;
  hg.fillStyle = C.halo;
  roundRect(hg, 120, 72, 512 - 240, 256 - 144, 52);
  hg.fill();
  hg.shadowBlur = 60;
  hg.fill();
  const hTex = new THREE.CanvasTexture(hcv);
  hTex.colorSpace = THREE.SRGBColorSpace;

  // ---- sprites (renderOrder pair 998/999, depthWrite:false, toneMapped:false) ----
  const hMat = new THREE.SpriteMaterial({
    map: hTex, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true, opacity: 0.55, toneMapped: false,
  });
  const hSpr = new THREE.Sprite(hMat);
  hSpr.renderOrder = 998;

  const fMat = new THREE.SpriteMaterial({
    map: fTex, transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
  });
  const fSpr = new THREE.Sprite(fMat);
  fSpr.renderOrder = 999;

  const group = new THREE.Group();
  const FW = width * scale;
  const FH = FW * fcv.height / fcv.width;
  fSpr.scale.set(FW, FH, 1);
  hSpr.scale.set(FW * 1.3, FH * 1.7, 1);
  group.add(hSpr);
  group.add(fSpr);

  const basePos = new THREE.Vector3(
    position?.x ?? 0, position?.y ?? 0, position?.z ?? 0,
  );
  group.position.copy(basePos);

  let haloOn = haloEnabled;
  hSpr.visible = haloOn;

  // ---- caller-clock animation (bob + sway + halo pulse; amplitudes scale with the banner) ----
  let t = 0;
  const bobAmp = 1.8 * scale; // source: ±1.8 units at scale 1
  function update(dtSeconds) {
    t += dtSeconds;
    group.position.set(basePos.x, basePos.y + Math.sin(t * 1.4) * bobAmp, basePos.z);
    fMat.rotation = Math.sin(t * 0.6) * 0.05;
    hMat.rotation = fMat.rotation;
    if (haloOn) hMat.opacity = 0.4 + (0.5 + Math.sin(t * 2.2) * 0.5) * 0.35;
  }

  function setHalo(on) {
    haloOn = !!on;
    hSpr.visible = haloOn;
  }

  function setText(newLines) {
    currentLines = newLines.slice();
    drawBadge();
  }

  function dispose() {
    group.removeFromParent();
    fTex.dispose();
    hTex.dispose();
    fMat.dispose();
    hMat.dispose();
  }

  return { group, update, setHalo, setText, dispose };
}
