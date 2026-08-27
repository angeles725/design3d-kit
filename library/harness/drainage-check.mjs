// drainage-check.mjs — STAGED v1.19 delta (investigador3, MATH/QC).
// Gate-side COMPLEMENT to the router's slope option + creador1's applyDrainageSlope build transform.
// The drainage flow-check (2026-08-26) proved a real defect: the orthogonal router guarantees
// monotonic descent + net grade, but NOT continuous per-run slope — the whole drop can concentrate in
// one segment, leaving horizontal runs FLAT (0% grade) that POOL condensate. A build-side fix without a
// gate to catch the regression is incomplete. This is that gate: given the BUILT duct waypoints, it
// verifies EVERY horizontal run descends at >= minGrade, and flags the flat runs. Pure, REPORTS-ONLY,
// deterministic, zero-dep.

const AXIS = { x: 0, y: 1, z: 2 };
const GRADE_EPS = 1e-9; // a run exactly at minGrade must pass — never fail on float noise (0.92-0.96 ≠ 0.04)

/**
 * Per-run drainage-slope QC over an ordered polyline of world waypoints.
 * A "horizontal run" is a segment with non-zero horizontal extent (it carries flow along a plane); a
 * near-vertical segment (a pure drop/riser) is not graded. Descent sign follows `descending`
 * ('-' = decreasing coord is down, default; '+' = increasing coord is down).
 * @param {number[][]} waypoints  ordered [[x,y,z], ...] (>=2).
 * @param {{axis?:'x'|'y'|'z', minGrade?:number, descending?:'+'|'-', horizEps?:number}} [opts]
 * @returns {{ok:boolean, horizontalRuns:number, flatRuns:{index:number, grade:number}[],
 *            minRunGrade:number, netGrade:number, monotonic:boolean}}
 */
export function checkDrainageSlope(waypoints, opts = {}) {
  const axis = AXIS[opts.axis || 'y'];
  const minGrade = typeof opts.minGrade === 'number' ? opts.minGrade : 0.02;
  const downDir = opts.descending === '+' ? 1 : -1; // drop = downDir*(p1[axis]-p0[axis]) is positive when descending
  const horizEps = typeof opts.horizEps === 'number' ? opts.horizEps : 1e-6;

  const flatRuns = [];
  let horizontalRuns = 0, minRunGrade = Infinity, monotonic = true;
  let totalDrop = 0, totalHoriz = 0;

  for (let i = 0; i + 1 < waypoints.length; i++) {
    const p0 = waypoints[i], p1 = waypoints[i + 1];
    const drop = downDir * (p1[axis] - p0[axis]); // >0 descends, <0 rises
    if (drop < -horizEps) monotonic = false;       // any uphill breaks monotonic descent
    // horizontal extent = length in the two non-axis dimensions
    let hsq = 0;
    for (let d = 0; d < 3; d++) if (d !== axis) { const dd = p1[d] - p0[d]; hsq += dd * dd; }
    const horiz = Math.sqrt(hsq);
    totalDrop += Math.max(0, drop);
    totalHoriz += horiz;
    if (horiz <= horizEps) continue;                // pure vertical drop/riser — not a graded run
    horizontalRuns++;
    const grade = drop / horiz;                     // rise → negative grade → fails
    if (grade < minRunGrade) minRunGrade = grade;
    if (grade < minGrade - GRADE_EPS) flatRuns.push({ index: i, grade });
  }

  return {
    ok: flatRuns.length === 0 && monotonic,
    horizontalRuns,
    flatRuns,
    minRunGrade: horizontalRuns ? minRunGrade : 0,
    netGrade: totalHoriz > horizEps ? totalDrop / totalHoriz : 0,
    monotonic,
  };
}
