// library: adaptive-segments  (parts/adaptive-segments.mjs)
// source: design3d numerical-methods pass · distilled from the "fixed radialSegments=12" cost waste
//         in pipe-run/tube/lathe builders (a thin pipe and a fat header paid the same tri budget).
// what: pure tessellation math — pick segment counts from a TARGET EDGE LENGTH so round geometry
//       scales its triangle budget with its actual radius instead of a hard-coded constant.
// params: see each function.
// deps: NONE. Imports nothing, so it is unit-testable in plain Node (no three.js resolution needed).
//
// THE FORMULA (and a correction). A regular N-gon inscribed in a circle of radius r has edge
// (chord) length ≈ perimeter / N = 2*pi*r / N. To make each edge ≈ targetEdgeLength, solve for N:
//     N = round( (2*pi*r) / targetEdgeLength )
// (An earlier draft used pi*r/L, which understates the count ~2x — it is not the perimeter edge
//  length. This module uses the geometrically honest 2*pi*r.) A sphere's "height" band runs pole to
// pole over a HALF circle (pi*r), so its height-segment count uses pi*r, not 2*pi*r.
//
// Each helper returns `null` when it cannot derive a count (non-positive radius or no target). A
// caller MUST treat null as "keep my own default" — never as 0 — so an adaptive param is a pure
// superset: omit targetEdgeLength and behavior is byte-identical to the old fixed constant.

/**
 * Segment count around a full circle (cylinder radial, tube radial) for a target edge length.
 * @param {number} radius              circle radius, caller units.
 * @param {number} [targetEdgeLength]  desired world-space length of each perimeter edge.
 * @param {{min?:number, max?:number}} [bounds]  clamp range (default 4..16).
 * @returns {number|null}  clamped segment count, or null when inputs cannot derive one.
 */
export function radialSegmentsFor(radius, targetEdgeLength, { min = 4, max = 16 } = {}) {
  if (!(radius > 0) || !(targetEdgeLength > 0)) return null;
  const n = Math.round((2 * Math.PI * radius) / targetEdgeLength);
  return Math.max(min, Math.min(max, n));
}

/**
 * Width/height segment counts for a sphere (elbow/fitting) at a target edge length.
 * width  = around the equator (full circle, 2*pi*r); height = pole to pole (half circle, pi*r).
 * @param {number} radius
 * @param {number} [targetEdgeLength]
 * @param {{widthMin?:number,widthMax?:number,heightMin?:number,heightMax?:number}} [bounds]
 * @returns {{width:number, height:number}|null}
 */
export function sphereSegmentsFor(radius, targetEdgeLength,
  { widthMin = 6, widthMax = 24, heightMin = 4, heightMax = 16 } = {}) {
  if (!(radius > 0) || !(targetEdgeLength > 0)) return null;
  const width = Math.max(widthMin, Math.min(widthMax, Math.round((2 * Math.PI * radius) / targetEdgeLength)));
  const height = Math.max(heightMin, Math.min(heightMax, Math.round((Math.PI * radius) / targetEdgeLength)));
  return { width, height };
}

/**
 * Segment count along a curve/path of a given arc length for a target edge length.
 * @param {number} arcLength           total length of the run/curve, caller units.
 * @param {number} [targetEdgeLength]
 * @param {{min?:number, max?:number}} [bounds]  clamp range (default 1..256).
 * @returns {number|null}
 */
export function lengthSegmentsFor(arcLength, targetEdgeLength, { min = 1, max = 256 } = {}) {
  if (!(arcLength > 0) || !(targetEdgeLength > 0)) return null;
  const n = Math.round(arcLength / targetEdgeLength);
  return Math.max(min, Math.min(max, n));
}
