# recipe: qa-framing-hook

Expose `window.__qaFraming = () => ({ mvpElements, corners, W, H, hud })` so an external probe can
prove the equipment SUBJECT is on-screen, well composed, and not hidden behind the HUD — the framing
analog of `qa-render-info-hook`. The hook exports RAW geometry; it computes NO verdict.

**Why raw data, not a verdict**: the design must not mark its own homework. If the page decided
"framing ok" and returned a boolean, a framing bug in the page would certify itself. Instead the hook
hands out the camera MVP and the subject's 8 world-space AABB corners, and
`research/tools/framing-probe.mjs` runs the numerics against them using `geom-verify`'s PURE CORE
(`projectCornersNDC` + `framingMetrics`) — the SAME math the in-page `checkFraming` wrapper uses, so
there is one source of truth and zero drift. `page.evaluate` can only return JSON, so the payload is
plain numbers and nested plain objects — never a THREE object.

**The contract** — a zero-arg closure installed once at boot, AFTER the camera and the equipment root
exist:

```js
// SUBJECT = the equipment root Object3D the gate should frame (the design designates it).
window.__qaFraming = () => {
  camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  const mvp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const b = new THREE.Box3().setFromObject(SUBJECT, true);
  const mn = b.min, mx = b.max;
  const corners = [
    [mn.x,mn.y,mn.z],[mx.x,mn.y,mn.z],[mn.x,mx.y,mn.z],[mx.x,mx.y,mn.z],
    [mn.x,mn.y,mx.z],[mx.x,mn.y,mx.z],[mn.x,mx.y,mx.z],[mx.x,mx.y,mx.z],
  ];
  const hudEl = document.querySelector('#hud');
  const hud = hudEl ? (r => ({left:r.left,right:r.right,top:r.top,bottom:r.bottom}))(hudEl.getBoundingClientRect()) : null;
  return { mvpElements: Array.from(mvp.elements), corners, W: innerWidth, H: innerHeight, hud };
};
```

`mvpElements` is `projection * matrixWorldInverse` as a column-major length-16 array; `corners` are
the 8 world-space AABB corners as `[x,y,z]` triples; `hud` is the `#hud` element's CSS-px rect (or
`null`).

**Rules a re-implementation must keep**

1. Return RAW geometry (MVP elements + 8 corner triples + viewport size + HUD rect) — NEVER a verdict
   boolean. The consumer computes ok/fail. A page that grades itself hides its own framing bug.
2. Zero-arg closure over the live `camera` + `SUBJECT`, installed once at boot after both exist, so a
   probe can call it on any settled frame. Update the camera matrices INSIDE the closure (the camera
   may have moved since boot via OrbitControls or a `?view=` preset).
3. `SUBJECT` is the equipment root the gate frames — the design designates it explicitly; do not
   default to the whole scene (the ground plane and rig would blow up the AABB).
4. Emit only JSON-serializable values (`Array.from(mvp.elements)`, plain corner arrays, plain hud
   object) — `page.evaluate` cannot return THREE objects.

**Consumer**: `research/tools/framing-probe.mjs` reads this hook and runs `geom-verify`'s pure core;
`ok` requires `fullyVisible && wellFramed && !overlapsHUD`, a corner behind the near plane yields
`straddles-near-plane`, and a design with NO hook is a SKIP (never a fabricated pass). A framing
failure exits nonzero and is recorded as `mechanical.framing`.

**Evidence**: distilled from 5 retro framing/occlusion misses (the `w<=0` near-plane sign-flip that
reads an off-frame subject as false-green "well framed"); pairs with `harness/geom-verify` and
`harness/stainless-equipment-shell`.
