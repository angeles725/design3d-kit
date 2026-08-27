// library: framing-compose  (harness/framing-compose.mjs) — HUD-aware composition + render-CALIBRATED fit loop (investigador3, v1.19).
// source: Revisor's COB-IM2 WU-L4-A retro P7 (2026-08-27). A fitBox that applies a HUD-clear offset in ONE
//         open-loop pass is wrong: it is only correct if the subject is centred at NDC 0 AND translates 1:1
//         with the camera offset. In PERSPECTIVE the 8 AABB corners sit at different depths, so the projected
//         extent has a gain != 1 (typically < 1) and does not centre on target — a pure loop SIMULATION
//         mis-predicted the real render by ~0.075 NDC. Two fixes, both here as PURE, testable helpers:
//         (1) compose in VIEWPORT-MINUS-HUD (aim the subject at the clear region's centre, not the full
//             viewport centre), so a design does not re-derive HUD-aware composition every time; and
//         (2) a CLOSED, CALIBRATED loop that measures the REAL projected centre for a trial offset, estimates
//             the gain from successive samples, and iterates until the MEASURED centre is on target — capping
//             on the measured value, never the offset parameter. THE RENDER IS THE AUTHORITY: the measurement
//             is injected as a callback so this module stays pure; it computes the next offset, it does not
//             render. A mechanical/simulated centre is NOT a verdict (same lesson as the blind-review gate).
// deps: NONE. Pure scalar/vector math. Node-testable in the kit tree; the caller supplies the render probe.

/**
 * The largest axis-aligned CLEAR rectangle of a viewport once an edge-anchored HUD is removed, plus that
 * region's centre in CSS px and in NDC. Composing the subject at THIS centre (not the viewport centre) is
 * what keeps it out from under an opaque HUD without a post-hoc offset. Assumes the HUD is a band anchored to
 * one edge (the common case); for a floating/centre HUD it returns the larger of the four complementary
 * bands. NDC uses the usual mapping x=2*px/W-1, y=1-2*px/H (y up).
 * @param {{width:number, height:number}} viewport  CSS px.
 * @param {{left:number, right:number, top:number, bottom:number}} hud  CSS-px rect, or null for no HUD.
 * @returns {{left:number,right:number,top:number,bottom:number, cx:number, cy:number,
 *            ndc:{cx:number,cy:number}, areaFrac:number}}
 */
export function hudClearRegion(viewport, hud) {
  const W = viewport.width, H = viewport.height;
  const toNdc = (cx, cy) => ({ cx: (2 * cx) / W - 1, cy: 1 - (2 * cy) / H });
  const full = { left: 0, right: W, top: 0, bottom: H };
  if (!hud) { const r = { ...full }; r.cx = W / 2; r.cy = H / 2; r.ndc = toNdc(r.cx, r.cy); r.areaFrac = 1; return r; }

  // Four complementary bands around the HUD; take the largest-area one as the clear region.
  const bands = [
    { left: 0, right: W, top: 0, bottom: Math.max(0, hud.top) },              // above
    { left: 0, right: W, top: Math.min(H, hud.bottom), bottom: H },           // below
    { left: 0, right: Math.max(0, hud.left), top: 0, bottom: H },             // left
    { left: Math.min(W, hud.right), right: W, top: 0, bottom: H },            // right
  ];
  let best = full, bestArea = -1;
  for (const b of bands) {
    const area = Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);
    if (area > bestArea) { bestArea = area; best = b; }
  }
  const r = { ...best, cx: (best.left + best.right) / 2, cy: (best.top + best.bottom) / 2 };
  r.ndc = toNdc(r.cx, r.cy);
  r.areaFrac = bestArea / (W * H);
  return r;
}

/**
 * Closed, calibrated fit loop. Drives a scalar camera PARAMETER (an offset/pan) until the MEASURED projected
 * centre of the subject reaches `target`, estimating the perspective gain (Δmeasured / Δparam) from real
 * samples via the secant method. The measurement is the caller's RENDER probe — this never assumes the gain
 * is 1 and never caps on the parameter; it caps on what the render actually reports.
 *
 * @param {(param:number)=>number} measure  render the scene at this parameter, return the subject's measured
 *        centre (e.g. NDC x). THE AUTHORITY — a real capture, not a simulation.
 * @param {number} target  desired measured centre (e.g. hudClearRegion(...).ndc.cx).
 * @param {{x0?:number, x1?:number, tol?:number, maxIter?:number, minGain?:number, clampStep?:number}} [opts]
 *        x0/x1 two initial trial params (default 0 and a small probe step to seed the secant); tol accept
 *        window on |measured - target| (default 0.01 NDC); maxIter (default 8); minGain floor below which the
 *        subject is deemed non-responsive and the loop bails (default 1e-4); clampStep caps a single step so a
 *        bad gain estimate can't fling the camera (default Infinity).
 * @returns {{param:number, measured:number, target:number, converged:boolean, iterations:number,
 *            gain:number|null, samples:{param:number, measured:number}[], reason?:string}}
 */
export function calibratedFit(measure, target, opts = {}) {
  const tol = opts.tol ?? 0.01;
  const maxIter = opts.maxIter ?? 8;
  const minGain = opts.minGain ?? 1e-4;
  const clampStep = opts.clampStep ?? Infinity;
  let x0 = opts.x0 ?? 0;
  let x1 = opts.x1 ?? (x0 + (opts.probe ?? 0.05));
  const samples = [];

  let m0 = measure(x0); samples.push({ param: x0, measured: m0 });
  if (Math.abs(m0 - target) <= tol) return { param: x0, measured: m0, target, converged: true, iterations: 0, gain: null, samples };
  let m1 = measure(x1); samples.push({ param: x1, measured: m1 });

  let iterations = 1, gain = null;
  for (; iterations < maxIter; iterations++) {
    if (Math.abs(m1 - target) <= tol) return { param: x1, measured: m1, target, converged: true, iterations, gain, samples };
    gain = (m1 - m0) / (x1 - x0);                         // real, render-measured perspective gain
    if (!Number.isFinite(gain) || Math.abs(gain) < minGain) {
      return { param: x1, measured: m1, target, converged: false, iterations, gain, samples, reason: 'subject non-responsive to the parameter (gain ~ 0)' };
    }
    let step = (target - m1) / gain;                      // Newton/secant step toward the MEASURED target
    if (Math.abs(step) > clampStep) step = Math.sign(step) * clampStep;
    const x2 = x1 + step;
    const m2 = measure(x2); samples.push({ param: x2, measured: m2 });
    x0 = x1; m0 = m1; x1 = x2; m1 = m2;
  }
  const converged = Math.abs(m1 - target) <= tol;
  return { param: x1, measured: m1, target, converged, iterations, gain,
    samples, reason: converged ? undefined : 'max iterations reached before tol' };
}
