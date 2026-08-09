// library: rmf-frames  (parts/rmf-frames.mjs)
// source: design3d numerical-methods pass · distilled from tube/hose sweep twist artifacts
//         (a swept cross-section ring that spirals or flips where the guide curve straightens).
// what: Rotation-Minimizing Frames (RMF) along a sampled curve via the DOUBLE-REFLECTION method
//       (Wang, Jüttler, Zheng, Liu, "Computation of Rotation Minimizing Frames", ACM TOG 27(1), 2008).
//       A moving orthonormal frame {r, s, t} per sample whose reference axis r does NOT rotate about
//       the tangent t — the frame you want to extrude a tube/hose cross-section ring along without
//       introducing spurious twist.
// deps: NONE. Imports nothing (a tiny inline vec helper set below), so it is unit-testable in plain
//       Node with no three.js resolution needed. Feed it {x,y,z} plain objects; get {x,y,z} back.
//
// WHY RMF BEATS FRENET. The Frenet frame builds its normal from the curve's second derivative
// (the principal normal), so at an inflection point where curvature κ→0 the normal is undefined and
// the frame TWISTS or FLIPS 180°. Sweeping a ring along Frenet frames therefore pinches or spirals a
// tube wherever the guide path straightens out. RMF instead TRANSPORTS the reference axis with
// minimal rotation about the tangent — it stays coherent through straight segments and inflections,
// because it never consults curvature at all. On a planar curve the RMF reference stays exactly the
// (fixed) out-of-plane normal: zero twist.
//
// THE DOUBLE-REFLECTION STEP (why it is exact and cheap). Going from sample i to i+1, reflect the
// frame across the bisecting plane of the two points, then reflect across the bisecting plane of the
// two tangents. Two reflections compose into a rotation that maps t[i]→t[i+1] with no residual spin
// about the tangent — the rotation-minimizing transport, computed with only dot/sub/scale (no sqrt in
// the transport itself; one normalize per step for numerical hygiene). This is O(n), stable, and
// second-order accurate — the method of choice over the older projection/Bishop integration.

// -------- tiny inline vec helpers (operate on {x,y,z}; import nothing) -----------------------------
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const len = (a) => Math.sqrt(dot(a, a));
const normalize = (a) => {
  const l = len(a);
  if (!(l > 0)) return { x: 0, y: 0, z: 0 };
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

/**
 * Rotation-Minimizing Frames along a sampled curve via double reflection.
 * @param {{x:number,y:number,z:number}[]} points    n+1 samples along the curve.
 * @param {{x:number,y:number,z:number}[]} tangents   UNIT tangents, tangents[i] at points[i], same length.
 * @param {{x:number,y:number,z:number}} r0           initial reference normal; ~unit & ~perpendicular to
 *                                                     tangents[0]. Defensively normalized, and projected
 *                                                     onto the plane ⊥ tangents[0] and renormalized if it
 *                                                     is not already perpendicular.
 * @returns {{r:{x,y,z}, s:{x,y,z}, t:{x,y,z}}[]}     one frame per sample: t = tangents[i] (passthrough),
 *                                                     r = rotation-minimizing reference, s = cross(t, r).
 */
export function rmfFrames(points, tangents, r0) {
  const n = points.length;
  const frames = new Array(n);

  // Seed r[0]: normalize, then project off any tangential component and renormalize (so r0 ⊥ t0 exactly).
  const t0 = tangents[0];
  let r = normalize(r0);
  r = normalize(sub(r, scale(t0, dot(r, t0))));
  frames[0] = { r, s: cross(t0, r), t: t0 };

  for (let i = 0; i < n - 1; i++) {
    const ti = tangents[i];
    const ri = frames[i].r;

    const v1 = sub(points[i + 1], points[i]);
    const c1 = dot(v1, v1);
    if (c1 === 0) {
      // coincident samples — carry the frame forward unchanged.
      frames[i + 1] = { r: ri, s: cross(tangents[i + 1], ri), t: tangents[i + 1] };
      continue;
    }

    // First reflection (across the bisecting plane of the two points).
    const rL = sub(ri, scale(v1, (2 / c1) * dot(v1, ri)));
    const tL = sub(ti, scale(v1, (2 / c1) * dot(v1, ti)));

    // Second reflection (across the bisecting plane of tL and the next tangent).
    const v2 = sub(tangents[i + 1], tL);
    const c2 = dot(v2, v2);
    const rNext = c2 === 0 ? rL : sub(rL, scale(v2, (2 / c2) * dot(v2, rL)));

    const rn = normalize(rNext);
    frames[i + 1] = { r: rn, s: cross(tangents[i + 1], rn), t: tangents[i + 1] };
  }

  return frames;
}
