// library: paint-roughness-canvas-tex  (materials-textures/paint-roughness-canvas-tex.mjs)
// source: edificio-hotel-realista · edificio-hotel-realista-v1.html:152-207 · realistic track
//         evidence (2026)
// what: dataTex(w,h,draw) generic CanvasTexture helper + procedural "sand paint" roughness map
//       (mid-grey base + random speckle, RepeatWrapping) that breaks up flat painted PBR surfaces.
// params: size, base grey, speckle count/alpha, repeat — defaults are the source values (256px,
//         #8f8f8f, 2600 speckles, repeat 6x4 over a facade bay of ~4 m).
// deps: three (CanvasTexture, RepeatWrapping) + 2D canvas.
// coupling notes:
//   - THE PBR PALETTE LESSON (documented at source:172-174): metalness 0 = painted surface,
//     metalness 1 = bare metal. A mid-grey albedo with metalness 1 reads BLACK in a dark
//     environment — painted body = metalness 0 + roughness ~1.0 (+ this roughnessMap);
//     bare aluminum = metalness 1 + a LIGHT tone (e.g. 0xc0c5ca) + roughness ~0.32.
//   - Roughness maps are LINEAR data: do NOT set SRGBColorSpace on this texture (the source leaves
//     CanvasTexture at its default no-color-space, which is correct for scalar maps).
//   - repeat is set for ~4 m facade bays at 1 unit = 1 m; retune per surface size.
//   - The speckle uses Math.random(): the map differs per load. Fine for roughness noise; seed your
//     own draw callback via dataTex() if a capture pipeline requires byte-identical frames.
//   - toneMapped is irrelevant here (not a color map); the ACES note applies to color/canvas sprites,
//     not data textures.

import * as THREE from 'three';

/**
 * Generic CanvasTexture builder: create a canvas, hand its 2D context to `draw`, wrap as a texture.
 * @param {number} w
 * @param {number} h
 * @param {(g:CanvasRenderingContext2D, w:number, h:number)=>void} draw
 * @param {number} [anisotropy=4]
 * @returns {THREE.CanvasTexture}
 */
export function dataTex(w, h, draw, anisotropy = 4) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = anisotropy;
  return t;
}

/**
 * Procedural sand-paint roughness variation map (linear scalar around ~1.0 roughness).
 * Assign as `roughnessMap` on a painted MeshStandardMaterial (metalness 0, roughness 1.0).
 * @param {object} [opts]
 * @param {number} [opts.size=256]
 * @param {string} [opts.base='#8f8f8f']       mid-grey ≈ neutral multiplier.
 * @param {number} [opts.speckles=2600]
 * @param {number} [opts.speckleAlpha=0.14]
 * @param {[number,number]} [opts.repeat=[6,4]]  tiles per surface (source: facade bay at 1 m/unit).
 * @param {()=>number} [opts.random=Math.random] inject a seeded PRNG for deterministic captures.
 * @returns {THREE.CanvasTexture}
 */
export function makePaintRoughnessTexture({
  size = 256,
  base = '#8f8f8f',
  speckles = 2600,
  speckleAlpha = 0.14,
  repeat = [6, 4],
  random = Math.random,
} = {}) {
  const tex = dataTex(size, size, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < speckles; i++) {
      const v = 120 + Math.floor(random() * 60);
      g.fillStyle = `rgba(${v},${v},${v},${speckleAlpha})`;
      g.fillRect(random() * size, random() * size, 1 + random() * 3, 1 + random() * 3);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  return tex;
}
