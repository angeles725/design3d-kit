// library: rmf-frames  (parts/rmf-frames.mjs)
// source: design3d numerical-methods pass · distilled from tube/hose sweep twist artifacts
//         (a swept cross-section ring that spirals or flips where the guide curve straightens).
// what: Rotation-Minimizing Frames (RMF) along a sampled curve via the DOUBLE-REFLECTION method
//       (Wang, Jüttler, Zheng, Liu, "Computation of Rotation Minimizing Frames", ACM TOG 27(1), 2008).
//       A moving orthonormal frame {r, s, t} per sample whose reference axis r does NOT rotate about
//       the tangent t — the frame you want to extrude a tube/hose cross-section ring along without
//       introducing spurious twist.
// deps: NONE for the pure core. Imports nothing (a tiny inline vec helper set below), so it is
//       unit-testable in plain Node with no three.js resolution needed. Feed it {x,y,z} plain
//       objects; get {x,y,z} back.
// ALSO IN THIS FILE: a PURE tube-geometry core (`tubeGeometryFromFrames`, imports nothing) that
//       rings the RMF frames into a circular tube, plus an in-page swept-tube builder (`makeSweptTube`,
//       ASYNC — loads three via a dynamic `import('three')` INSIDE the function, so the pure core above
//       stays Node-importable/testable). The builder may top-level import the pure `adaptive-segments`
//       module (it imports nothing); it must NEVER add a top-level `import * as THREE`.
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

// Pure adaptive-segment helpers (that module imports nothing, so a top-level import here is safe and
// does NOT pull three.js into this file's import graph). Used only by the in-page builder below.
import { radialSegmentsFor, lengthSegmentsFor } from './adaptive-segments.mjs';

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

// -------- PURE tube-geometry core (imports nothing; Node-testable) ---------------------------------
/**
 * Turn RMF frames + their centerline samples into a circular tube's flat position/index arrays.
 * For each sample i a ring of `radialSegments` verts is placed at `radius` in that frame's (r,s)
 * plane; consecutive rings are joined into quads (two triangles each). Open tube by default; pass
 * `capEnds=true` to add a triangle-fan cap at each end so the tube reads as a closed solid (an open
 * bore looks hollow / "missing a wall" from grazing angles).
 * @param {{x:number,y:number,z:number}[]} points        n centerline samples.
 * @param {{r:{x,y,z}, s:{x,y,z}, t:{x,y,z}}[]} frames    one frame per sample (same length as points).
 * @param {number} radius                                 tube radius, caller units.
 * @param {number} radialSegments                         verts per ring around the tube.
 * @param {boolean} [capEnds=false]                       add outward-facing fan caps at both ends.
 * @returns {{positions:number[], indices:number[]}}  positions flat [x,y,z, ...], indices flat tri ids.
 */
export function tubeGeometryFromFrames(points, frames, radius, radialSegments, capEnds = false) {
  const positions = [];
  // One ring of `radialSegments` verts per sample, in the frame's (r,s) plane at `radius`.
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const { r, s } = frames[i];
    for (let k = 0; k < radialSegments; k++) {
      const angle = (2 * Math.PI * k) / radialSegments;
      const ca = Math.cos(angle), sa = Math.sin(angle);
      positions.push(
        p.x + radius * (ca * r.x + sa * s.x),
        p.y + radius * (ca * r.y + sa * s.y),
        p.z + radius * (ca * r.z + sa * s.z),
      );
    }
  }

  // Join ring i to ring i+1: quad over columns k and (k+1)%radialSegments → two triangles.
  const indices = [];
  for (let i = 0; i < points.length - 1; i++) {
    for (let k = 0; k < radialSegments; k++) {
      const kNext = (k + 1) % radialSegments;
      const a = i * radialSegments + k;
      const b = i * radialSegments + kNext;
      const c = (i + 1) * radialSegments + k;
      const d = (i + 1) * radialSegments + kNext;
      indices.push(a, c, d);
      indices.push(a, d, b);
    }
  }

  // Optional end caps: a triangle fan from a center vertex to each end ring, wound so the cap face
  // points OUTWARD (start-cap normal along -t[0]; end-cap along +t[last]). Wind it the other way and
  // the cap faces inward, is back-face culled, and the open bore stays visible from grazing angles.
  // The fan reuses the existing rim ring verts (only 2 new center verts); computeVertexNormals then
  // smooths the rim — the cap FACE winding (not the averaged normal) is what closes the see-through.
  if (capEnds && points.length >= 2) {
    const nRings = points.length;
    const c0 = positions.length / 3;                    // start-cap center vertex index
    positions.push(points[0].x, points[0].y, points[0].z);
    const cL = positions.length / 3;                    // end-cap center vertex index
    const last = points[nRings - 1];
    positions.push(last.x, last.y, last.z);
    const endBase = (nRings - 1) * radialSegments;
    for (let k = 0; k < radialSegments; k++) {
      const kNext = (k + 1) % radialSegments;
      indices.push(c0, kNext, k);                       // start cap: reversed winding -> normal -t[0]
      indices.push(cL, endBase + k, endBase + kNext);   // end cap: forward winding -> normal +t[last]
    }
  }

  return { positions, indices };
}

// -------- in-page swept-tube builder (dynamic three import; async) ---------------------------------
/**
 * Build a SMOOTH swept tube along a curve as a single Mesh, using rotation-minimizing frames (no
 * spiral twist where the path straightens) + adaptive segment counts. This is for curved hoses/pipes
 * that the discrete cylinder+elbow `pipe-run` builder cannot render smoothly — the RMF sweep keeps the
 * cross-section coherent through inflections instead of pinching or flipping.
 *
 * ASYNC: loads three via a dynamic `import('three')` INSIDE the function so this file's pure core
 * (`rmfFrames`, `tubeGeometryFromFrames`) stays Node-importable/testable. The caller injects the
 * material and parents the returned Mesh.
 * @param {(THREE.Vector3|number[])[]} curvePoints  control points (Vector3 or [x,y,z]).
 * @param {object} [opts]
 * @param {number} [opts.radius=0.05]           tube radius, caller units.
 * @param {number} [opts.targetEdgeLength]       when set, radial + tubular counts derive from it.
 * @param {number} [opts.radialSegments]         explicit ring count override.
 * @param {number} [opts.tubularSegments]        explicit lengthwise sample count override.
 * @param {boolean} [opts.closed=false]          close the CatmullRom curve into a loop.
 * @param {boolean} [opts.capEnds]               cap both open ends (defaults to true for an open tube,
 *                                               false for a closed loop) so a bore never reads hollow.
 * @param {THREE.Material} material              injected material.
 * @returns {Promise<THREE.Mesh>}  a shadow-casting Mesh the caller parents.
 */
export async function makeSweptTube(curvePoints, opts = {}, material) {
  const THREE = await import('three');
  const { radius = 0.05, targetEdgeLength, radialSegments, tubularSegments, closed = false, capEnds } = opts;
  const curve = new THREE.CatmullRomCurve3(curvePoints.map(p => p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2])), closed, 'centripetal');
  const nT = tubularSegments ?? (lengthSegmentsFor(curve.getLength(), targetEdgeLength) ?? 64);
  const pts = [], tans = [];
  for (let i = 0; i <= nT; i++) { const u = i / nT; pts.push(curve.getPointAt(u)); tans.push(curve.getTangentAt(u).normalize()); }
  // seed normal perpendicular to the first tangent (use the world axis least aligned with it)
  const t0 = tans[0]; const ax = Math.abs(t0.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const r0 = new THREE.Vector3().crossVectors(t0, ax).normalize();
  const frames = rmfFrames(pts.map(v => ({ x: v.x, y: v.y, z: v.z })), tans.map(v => ({ x: v.x, y: v.y, z: v.z })), { x: r0.x, y: r0.y, z: r0.z });
  const radSeg = radialSegments ?? (radialSegmentsFor(radius, targetEdgeLength) ?? 12);
  const { positions, indices } = tubeGeometryFromFrames(pts.map(v => ({ x: v.x, y: v.y, z: v.z })), frames, radius, radSeg, capEnds ?? !closed);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material); mesh.castShadow = true;
  return mesh;
}
