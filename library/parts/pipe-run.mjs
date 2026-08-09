// library: pipe-run  (parts/pipe-run.mjs)
// source: cuarto-frio-safran · cuarto-3d.html:31620-31627 · client-shipped (2026)
// what: waypoint piping — oriented cylinder segments between consecutive points + sphere elbows at
//       every waypoint (slightly oversized so joints read as fittings).
// params: points[] (Vector3 or [x,y,z]), radius, material (injected), elbowRadius (default r*1.16,
//         the source fitting proportion), radialSegments / elbowSegments.
// deps: three (CylinderGeometry, SphereGeometry, quaternion orientation).
// coupling notes:
//   - Source called `scene.add(group)` internally — REMOVED at extraction: this builder RETURNS the
//     Group and the caller parents it.
//   - No scale baked in: radius and points are caller units (source scene was a custom ~0.3 m/unit scale).
//   - All segments castShadow=true; in baked-shadow scenes (`shadowMap.autoUpdate=false`) add the
//     group BEFORE the bake or re-set `renderer.shadowMap.needsUpdate = true`.
//   - Degenerate segments (length < 0.01 in caller units) are skipped, matching source behavior.
//   - One shared material instance across the whole run: recolor affects every piece (use a clone
//     per run if pipes must change state independently).

import * as THREE from 'three';
import { radialSegmentsFor, sphereSegmentsFor } from './adaptive-segments.mjs';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Build a pipe run through `points` and return its Group (caller adds it to the scene).
 * @param {object} opts
 * @param {(THREE.Vector3|number[])[]} opts.points  waypoints, in order.
 * @param {number} opts.radius                      pipe radius (caller units).
 * @param {THREE.Material} opts.material            injected material (never a global registry).
 * @param {number} [opts.elbowRadius]               fitting sphere radius; default radius*1.16.
 * @param {number} [opts.targetEdgeLength]          when set, segment counts derive from it (adaptive
 *                                                  tessellation); omit for the historic fixed 12/12/8.
 * @param {number} [opts.radialSegments]            explicit override; wins over adaptive/default.
 * @param {number} [opts.elbowWidthSegments]        explicit override; wins over adaptive/default.
 * @param {number} [opts.elbowHeightSegments]       explicit override; wins over adaptive/default.
 * @returns {THREE.Group}
 */
export function createPipeRun({
  points,
  radius,
  material,
  elbowRadius = radius * 1.16,
  targetEdgeLength,
  radialSegments,
  elbowWidthSegments,
  elbowHeightSegments,
}) {
  // Adaptive tessellation: with targetEdgeLength, counts scale with radius so a thin pipe and a fat
  // header stop paying the same tri budget. An explicit *Segments override always wins; with neither,
  // counts fall back to the historic fixed 12/12/8 — byte-identical to the pre-adaptive builder.
  const radSeg = radialSegments ?? radialSegmentsFor(radius, targetEdgeLength) ?? 12;
  const elbowSeg = sphereSegmentsFor(elbowRadius, targetEdgeLength);
  const elbowW = elbowWidthSegments ?? elbowSeg?.width ?? 12;
  const elbowH = elbowHeightSegments ?? elbowSeg?.height ?? 8;

  const group = new THREE.Group();
  const pts = points.map(p => (p && p.isVector3) ? p.clone() : new THREE.Vector3(p[0], p[1], p[2]));

  // elbows (one sphere per waypoint, slightly wider than the pipe)
  for (const p of pts) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(elbowRadius, elbowW, elbowH), material);
    s.position.copy(p);
    s.castShadow = true;
    group.add(s);
  }

  // straight segments between consecutive waypoints
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 0.01) continue;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, radSeg), material);
    c.position.copy(a).add(dir.clone().multiplyScalar(0.5));
    c.quaternion.setFromUnitVectors(UP, dir.normalize());
    c.castShadow = true;
    group.add(c);
  }

  return group;
}
