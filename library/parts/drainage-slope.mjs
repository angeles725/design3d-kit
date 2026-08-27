// library: drainage-slope  (parts/drainage-slope.mjs) — condensate-drain per-run slope (investigador3).
// source: design3d MATHQC §3.1 #14 · condensate-drain pooling fix · PoC by creador1 (2026-08-26).
//         NOT v1.18 (that branch is frozen feature-complete); this is a v1.19 candidate, isolated here.
//         Behind it: the orthogonal router's slope option guarantees monotonic + NET grade but leaves
//         every horizontal RUN flat (0% local) — water pools on the flat runs. Measured on a real drain:
//         netGrade 36% yet min per-run grade 0.0%, 4 flat runs. This post-route transform closes that.
// what: PURE-JS, ZERO-DEP. Re-profiles ONLY the fall axis of an orthogonal route so EVERY horizontal run
//       descends at >= minGrade along its length; the vertical drop-segments shrink to absorb the excess.
//       Net drop, endpoints, and the X/Z path are preserved exactly; monotonic descent is preserved.
//       REPORTS a NEW waypoint array — never mutates the input. The exact-arc elbows (hvac-fittings) absorb
//       the small tilt each corner gains.
// deps: NONE. Waypoint arithmetic only — Node-testable with no three.js resolution.
//
// PLAYBOOK: run applyDrainageSlope on the router waypoints BEFORE building any sloped run — the raw
// orthogonal route is monotonic + net-grade but leaves every horizontal run flat (pools). Then gate the
// built run with drainage-check.checkDrainageSlope so a regression can't silently reintroduce a flat run.
//
// MATH. Fall axis a (default y). For each segment: horizLen = distance in the two non-axis coords,
// runsDrop = minGrade * Σ horizLen over runs. Feasible iff netDrop >= runsDrop (same feasibility the
// router's net-grade check already enforces). Each horizontal run is assigned drop = minGrade*horizLen
// (=> exactly minGrade); the remainder R = netDrop - runsDrop is distributed over the vertical fall
// segments in proportion to their original drop (they shrink by R/V). Σ drops = netDrop, so endpoints
// hold. Axis coord is rebuilt cumulatively (monotonic). If there are no vertical segments to absorb R,
// it is spread over the runs (they then exceed minGrade — still valid).

const AX = { x: 0, y: 1, z: 2 };

/**
 * Re-profile an orthogonal route's fall axis so no horizontal run is flat.
 * @param {number[][]} waypoints  ordered world points [[x,y,z], ...] (NOT mutated).
 * @param {{axis?:'x'|'y'|'z', minGrade?:number, descending?:'-'|'+', eps?:number}} [opts]
 *        axis: fall axis (default 'y'). minGrade: min per-run grade (default 0.02 = 2%).
 *        descending: '-' = axis coord decreases downhill (default), '+' = increases.
 * @returns {{ok:boolean, waypoints:number[][], perRunGrade:number[], netDrop:number, horizontal:number,
 *            reason?:string, needed?:number, available?:number}}
 *          ok=false (with the input echoed back, unmutated) when there is no net descent or not enough
 *          drop to give every run minGrade.
 */
export function applyDrainageSlope(waypoints, opts = {}) {
  const { axis = 'y', minGrade = 0.02, descending = '-', eps = 1e-9 } = opts;
  const a = AX[axis];
  const oth = [0, 1, 2].filter((i) => i !== a);
  const echo = () => waypoints.map((p) => p.slice());
  const n = waypoints.length;
  if (n < 2) return { ok: true, waypoints: echo(), perRunGrade: [], netDrop: 0, horizontal: 0 };

  // classify segments
  const segs = [];
  let H = 0;
  for (let i = 1; i < n; i++) {
    const horizLen = Math.hypot(waypoints[i][oth[0]] - waypoints[i - 1][oth[0]], waypoints[i][oth[1]] - waypoints[i - 1][oth[1]]);
    const descentIn = descending === '-' ? (waypoints[i - 1][a] - waypoints[i][a]) : (waypoints[i][a] - waypoints[i - 1][a]);
    segs.push({ horizLen, descentIn });
    if (horizLen > eps) H += horizLen;
  }
  const netDrop = descending === '-' ? (waypoints[0][a] - waypoints[n - 1][a]) : (waypoints[n - 1][a] - waypoints[0][a]);
  if (netDrop <= eps) return { ok: false, reason: 'no-net-descent', waypoints: echo(), perRunGrade: [], netDrop, horizontal: H };

  const runsDrop = minGrade * H;
  if (netDrop + eps < runsDrop) {
    return { ok: false, reason: 'insufficient-drop', needed: runsDrop, available: netDrop, waypoints: echo(), perRunGrade: [], netDrop, horizontal: H };
  }
  const R = netDrop - runsDrop;                    // remainder for the vertical fall segments
  let V = 0; for (const s of segs) if (s.horizLen <= eps) V += Math.max(0, s.descentIn);

  const dropOf = segs.map((s) => (s.horizLen > eps ? minGrade * s.horizLen : (V > eps ? (Math.max(0, s.descentIn) / V) * R : 0)));
  if (V <= eps && R > eps) {                        // no vertical segments to absorb R -> spread over runs
    for (let i = 0; i < segs.length; i++) if (segs[i].horizLen > eps) dropOf[i] += (segs[i].horizLen / H) * R;
  }

  const out = echo();
  const sign = descending === '-' ? -1 : 1;
  for (let i = 1; i < n; i++) out[i][a] = out[i - 1][a] + sign * dropOf[i - 1];
  // force exact endpoint (guard float drift)
  out[n - 1][a] = waypoints[n - 1][a];

  const perRunGrade = [];
  for (let i = 0; i < segs.length; i++) if (segs[i].horizLen > eps) perRunGrade.push(dropOf[i] / segs[i].horizLen);
  return { ok: true, waypoints: out, perRunGrade, netDrop, horizontal: H };
}
