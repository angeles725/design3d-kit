// library: rect-duct  (parts/rect-duct.mjs) — RMF-swept RECTANGULAR HVAC duct (investigador1, v1.19).
// source: design3d numerical pass · investigacion3.md engines audit (2026-08-26). The doc's real
//         geometry insight for ductwork: a RECTANGULAR duct swept along a path must PRESERVE its
//         width/height/forward axes or the profile twists ~90° mid-run — the exact twist the round-tube
//         `rmf-frames` (double-reflection Rotation-Minimizing Frames) already kills. This is the
//         rect-profile counterpart to `rmf-frames`/`makeSweptTube`: same twist-free frames, a rectangular
//         cross-section instead of a circle. Real HVAC trunks are BOX ducts, not round pipe.
// what: a rectangular tube swept along a centerline using RMF frames — the cross-section stays
//       axis-coherent (width along the frame's r axis, height along s) through bends and inflections, so
//       the duct never spirals. Pure zero-import geometry core (Node-testable) + async three builder.
// deps: NONE for the pure core. It imports the PURE `rmf-frames` + `adaptive-segments` helpers (both
//       import nothing), so this file stays Node-loadable. The async builder dynamic-imports three INSIDE
//       the function; this file must NEVER carry a top-level `import * as THREE`.

import { rmfFrames } from './rmf-frames.mjs';
import { lengthSegmentsFor } from './adaptive-segments.mjs';

// The 4 corner sign-pairs of a w×h rectangle in a frame's (r,s) plane, ordered CCW looking down +t so the
// wall quads wind OUTWARD: 0:(+w/2,+h/2) 1:(-w/2,+h/2) 2:(-w/2,-h/2) 3:(+w/2,-h/2).
const RECT_CORNERS = [[1, 1], [-1, 1], [-1, -1], [1, -1]];

/**
 * Ring a sequence of RMF frames into a rectangular tube's flat position/index arrays. For each sample i a
 * 4-vertex rectangle (width along frame.r, height along frame.s) is placed at points[i]; consecutive rings
 * are joined into 4 wall quads (2 triangles each). Open by default; `capEnds` adds a flat 2-triangle cap
 * at each end so the bore does not read hollow.
 * PURE: imports nothing, operates on {x,y,z} points + {r,s,t} frames. Node-testable.
 * @param {{x:number,y:number,z:number}[]} points        n centerline samples.
 * @param {{r:{x,y,z}, s:{x,y,z}, t:{x,y,z}}[]} frames    one RMF frame per sample (same length as points).
 * @param {number} width                                  duct width (along frame.r), caller units.
 * @param {number} height                                 duct height (along frame.s), caller units.
 * @param {boolean} [capEnds=false]                        add flat caps at both ends.
 * @returns {{positions:number[], indices:number[]}}  positions flat [x,y,z,...], indices flat tri ids.
 */
export function rectDuctGeometryFromFrames(points, frames, width, height, capEnds = false) {
  if (!(width > 0) || !(height > 0)) throw new RangeError('rectDuctGeometryFromFrames: width>0 and height>0 required');
  const hw = width / 2, hh = height / 2;
  const positions = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i], { r, s } = frames[i];
    for (const [cr, cs] of RECT_CORNERS) {
      positions.push(
        p.x + hw * cr * r.x + hh * cs * s.x,
        p.y + hw * cr * r.y + hh * cs * s.y,
        p.z + hw * cr * r.z + hh * cs * s.z,
      );
    }
  }
  // Join ring i to ring i+1: 4 wall quads (columns k, (k+1)%4) → 2 triangles each, wound outward.
  const indices = [];
  for (let i = 0; i < points.length - 1; i++) {
    for (let k = 0; k < 4; k++) {
      const kNext = (k + 1) % 4;
      const a = i * 4 + k, b = i * 4 + kNext, c = (i + 1) * 4 + k, d = (i + 1) * 4 + kNext;
      // Wall quad wound so the face normal points OUTWARD (verified: capped straight duct signedVolume
      // > 0). The naive (a,c,d)/(a,d,b) order winds the walls INWARD → inside-out mesh (inv3 caught it
      // with geom-metrics.signedVolume<0 + normalConsistency=false; the winding regression below guards it).
      indices.push(a, d, c);
      indices.push(a, b, d);
    }
  }
  // Optional flat caps: start cap wound reversed so its face normal points along −t[0]; end cap along +t.
  if (capEnds && points.length >= 2) {
    const base = (points.length - 1) * 4;
    indices.push(0, 2, 1, 0, 3, 2);                                   // start cap (outward = −t[0])
    indices.push(base + 0, base + 1, base + 2, base + 0, base + 2, base + 3); // end cap (outward = +t[last])
  }
  return { positions, indices };
}

// -------- in-page rectangular-duct builder (dynamic three import; async) ---------------------------
/**
 * Build a SMOOTH rectangular duct swept along a centerline as one Mesh, using RMF frames so the box
 * cross-section never spirals (the twist a naive Frenet/Euler sweep introduces at inflections). The
 * counterpart to `rmf-frames.makeSweptTube` for rectangular HVAC trunks/branches. ASYNC: loads three via
 * a dynamic `import('three')` INSIDE the function so the pure core above stays Node-importable.
 * @param {(THREE.Vector3|number[])[]} curvePoints  centerline control points (Vector3 or [x,y,z]).
 * @param {object} [opts]
 * @param {number} [opts.width=0.4]              duct width (frame.r axis), caller units (1u=1m).
 * @param {number} [opts.height=0.3]             duct height (frame.s axis).
 * @param {number} [opts.targetEdgeLength]        when set, the lengthwise sample count derives from it.
 * @param {number} [opts.tubularSegments]         explicit lengthwise sample count override.
 * @param {boolean} [opts.closed=false]           close the CatmullRom centerline into a loop.
 * @param {boolean} [opts.capEnds]                cap both ends (defaults true for an open duct).
 * @param {THREE.Material} material               injected material.
 * @returns {Promise<THREE.Mesh>}  a shadow-casting Mesh the caller parents.
 */
export async function makeRectDuct(curvePoints, opts = {}, material) {
  const THREE = await import('three');
  const { width = 0.4, height = 0.3, targetEdgeLength, tubularSegments, closed = false, capEnds } = opts;
  const curve = new THREE.CatmullRomCurve3(
    curvePoints.map(p => (p && p.isVector3) ? p : new THREE.Vector3(p[0], p[1], p[2])), closed, 'centripetal');
  const nT = tubularSegments ?? (lengthSegmentsFor(curve.getLength(), targetEdgeLength) ?? 48);
  const pts = [], tans = [];
  for (let i = 0; i <= nT; i++) { const u = i / nT; pts.push(curve.getPointAt(u)); tans.push(curve.getTangentAt(u).normalize()); }
  // Seed r0 perpendicular to the first tangent (world axis least aligned with it) — the width axis.
  const t0 = tans[0];
  const ax = Math.abs(t0.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const r0 = new THREE.Vector3().crossVectors(t0, ax).normalize();
  const frames = rmfFrames(
    pts.map(v => ({ x: v.x, y: v.y, z: v.z })),
    tans.map(v => ({ x: v.x, y: v.y, z: v.z })),
    { x: r0.x, y: r0.y, z: r0.z });
  const { positions, indices } = rectDuctGeometryFromFrames(
    pts.map(v => ({ x: v.x, y: v.y, z: v.z })), frames, width, height, capEnds ?? !closed);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material); mesh.castShadow = true;
  return mesh;
}
