// fitting-select.mjs — STAGED delta (investigador3, MATH/QC §3.1 #13).
// The deterministic BRIDGE from duct-router bend metadata to the hvac-fittings builder: given a bend
// {position,inDir,outDir,turnAngle}, pick WHICH fitting variant + its orientation plane. i1's
// elbowAtBend(bend,...) then PLACES the chosen exact-arc elbow. Clean split: i3 owns selection
// (which/what-angle), i1 owns geometry (exact arc). Pure, REPORTS-ONLY, deterministic (no three).
//
// Source: investigacion.md ~6703-6738 (dot(inDir,outDir)->angle; cross->perpendicular plane).

const EPS_ANGLE = 0.5; // degrees: snap tolerance to a named fitting

function norm3(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 0 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 0];
}
function cross3(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * Pick the fitting for one router bend. turnAngle (deg) chooses the family; cross(inDir,outDir)
 * gives the bend PLANE normal (for orienting the elbow). A straight (angle≈0) needs no fitting;
 * a reversal (angle≈180) is a U-turn = two elbows, flagged for the caller.
 * @param {{position:number[], inDir:number[], outDir:number[], turnAngle:number}} bend
 * @returns {{type:'none'|'elbow45'|'elbow90'|'elbowN'|'uturn', angle:number, plane:number[], position:number[]}}
 */
export function fittingForBend(bend) {
  const angle = bend.turnAngle;
  const plane = norm3(cross3(bend.inDir, bend.outDir)); // [0,0,0] when collinear (straight or reversal)
  let type;
  if (angle <= EPS_ANGLE) type = 'none';
  else if (Math.abs(angle - 45) <= EPS_ANGLE) type = 'elbow45';
  else if (Math.abs(angle - 90) <= EPS_ANGLE) type = 'elbow90';
  else if (angle >= 180 - EPS_ANGLE) type = 'uturn'; // straight reversal: caller splits into 2 elbows
  else type = 'elbowN';
  return { type, angle, plane, position: bend.position.slice() };
}

/**
 * Map a whole route's bends → fitting selections, in order. Straight/degenerate bends drop out as
 * type 'none' but stay in the array so indices line up with the router's bends[].
 * @param {Array<{position:number[],inDir:number[],outDir:number[],turnAngle:number}>} bends
 * @returns {Array<ReturnType<typeof fittingForBend>>}
 */
export function fittingsForRoute(bends) {
  return bends.map(fittingForBend);
}
