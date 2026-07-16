// library: render-stats-hud  (harness/render-stats-hud.mjs)
// source: hotel-torre-voxel · hotel-torre-voxel.optimized.html:43-45 (DOM) + 666-684 (sampler);
//         diagnostico variant .diagnostico.html:633-647 · optimization round evidence (2026)
// what: FPS / draw-calls / triangles / geometries HUD read from `renderer.info` (ground truth —
//       wrapper-based counters under-read InstancedMesh), sampled every 0.5 s, mounted in its own
//       fixed-position DOM node.
// params: renderer, container (default document.body), intervalSeconds (default 0.5, the source
//         cadence), accentColor.
// deps: three renderer.info only + DOM. No three import needed.
// coupling notes:
//   - DETERMINISTIC-CAPTURE RULE: no internal rAF — call update(dtSeconds) once per rendered frame
//     from the caller's loop, AFTER renderer.render() (renderer.info is per-frame).
//   - Mounts its own <div>; dispose() removes it. Harness-only: never ships in a delivery build.
//   - If the app resets renderer.info manually (info.autoReset=false), read order matters: this HUD
//     assumes default autoReset behavior.
//
// DIAGNOSTICO TOGGLES (recipe, from hotel-torre-voxel.diagnostico.html:633-647) — two buttons that
// isolate the bottleneck when FPS drops; wire them to your own UI:
//   // SHADOWS on/off (is it shadow-map cost?)
//   sun.castShadow = !sun.castShadow;
//   renderer.shadowMap.needsUpdate = true;   // mandatory in baked-shadow scenes
//   // RESOLUTION 1x vs devicePixelRatio (is it fill-rate?)
//   renderer.setPixelRatio(hi ? 1 : Math.min(devicePixelRatio, 2));
//   renderer.setSize(innerWidth, innerHeight);

/**
 * @param {object} opts
 * @param {THREE.WebGLRenderer} opts.renderer
 * @param {HTMLElement} [opts.container=document.body]
 * @param {number} [opts.intervalSeconds=0.5]  sampling window.
 * @param {string} [opts.accentColor='#00d4aa']
 * @returns {{ el: HTMLElement, update(dtSeconds:number):void, dispose():void }}
 */
export function createRenderStatsHud({
  renderer,
  container = document.body,
  intervalSeconds = 0.5,
  accentColor = '#00d4aa',
}) {
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;top:14px;left:50%;transform:translateX(-50%);' +
    'font-family:ui-monospace,monospace;font-size:11px;background:rgba(6,8,13,0.85);' +
    `color:${accentColor};padding:8px 14px;border:1px solid ${accentColor}44;` +
    'letter-spacing:0.05em;z-index:99;pointer-events:none;';
  el.innerHTML =
    'FPS <b style="color:#fff">-</b> &middot; DRAW CALLS <b style="color:#fff">-</b>' +
    ' &middot; TRIANGULOS <b style="color:#fff">-</b> &middot; GEOM <b style="color:#fff">-</b>';
  const [bFps, bCalls, bTris, bGeo] = el.querySelectorAll('b');
  container.appendChild(el);

  let frames = 0;
  let acc = 0;

  /** Call once per rendered frame, after renderer.render(). */
  function update(dtSeconds) {
    frames++;
    acc += dtSeconds;
    if (acc >= intervalSeconds) {
      bFps.textContent = String(Math.round(frames / acc));
      bCalls.textContent = String(renderer.info.render.calls);
      bTris.textContent = renderer.info.render.triangles.toLocaleString();
      bGeo.textContent = String(renderer.info.memory.geometries);
      frames = 0;
      acc = 0;
    }
  }

  function dispose() {
    el.remove();
  }

  return { el, update, dispose };
}
