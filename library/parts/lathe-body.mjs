// library: lathe-body  (parts/lathe-body.mjs)
// source: design3d numerical-methods pass · distilled from the "everything is a box" problem on
//         axially symmetric equipment — tanks, pressure vessels, domes/tank-tops, flanges, bottles,
//         rollers — modeled as stacked boxes/cylinders that read faceted and wrong from every angle.
// what: a REVOLUTION BODY (lathe/surface-of-revolution) helper. Revolve a 2D profile around the Y
//       axis into a single round watertight body. Any object with rotational symmetry about one axis
//       is ONE Lathe surface instead of a stack of primitives — the honest shape, one draw, one mesh.
// deps: NONE for the PURE core. The profile validator + the two profile generators import nothing, so
//       they are unit-testable in plain Node with no three.js resolution needed. They return plain
//       {x,y} points (x = radius from the axis, y = height). Only the in-page builder touches three.
// ALSO IN THIS FILE: an in-page async builder (`makeLatheBody`, dynamic `import('three')` INSIDE the
//       function, so the pure core above stays Node-importable/testable). The builder top-level imports
//       the PURE `adaptive-segments` module (it imports nothing); it must NEVER add a top-level
//       `import * as THREE`.
//
// THE SHAPE. LatheGeometry sweeps a polyline of {x,y} points around the Y axis. Its x is the RADIUS
// from the axis (so every x must be >= 0 — a negative x would fold the surface through the axis) and
// its y is the height. A profile that climbs the outer wall then curves inward at the top revolves
// into a filleted cylinder; a quarter ellipse revolves into a dome / dished tank-head. Because it is
// one continuous surface, it beats stacked boxes/cylinders for ANY axially symmetric equipment: no
// seams, no z-fighting between stacked caps, and the silhouette is genuinely round rather than a
// staircase of primitives.
//
// PURE/ASYNC SPLIT (same idiom as superquadric.mjs / rmf-frames.mjs). The profile math is separated
// from the mesh build so the geometry can be validated and unit-tested in plain Node. `makeLatheBody`
// loads three via a dynamic `import('three')` INSIDE the function, so importing this module never
// forces three.js resolution on the test runner.

// Pure adaptive-segment helper (that module imports nothing, so this top-level import does NOT pull
// three.js into this file's import graph). Used only by the in-page builder below.
import { radialSegmentsFor } from './adaptive-segments.mjs';

// -------- PURE profile validation + generators (import nothing; Node-testable) ---------------------

/**
 * Read an {x,y} or [x,y] profile point's x/y. (Profiles may be authored either way.)
 * @param {{x:number,y:number}|number[]} p
 * @returns {{x:number,y:number}}
 */
function xy(p) {
  return { x: p.x ?? p[0], y: p.y ?? p[1] };
}

/**
 * Validate a 2D profile for LatheGeometry (revolution around the Y axis).
 * Requires: at least 2 points; every x >= 0 (a negative radius folds the surface through the axis and
 * is invalid); and not every y identical (an all-same-y profile is degenerate — it revolves to a flat
 * ring or nothing, never a body).
 * @param {({x:number,y:number}|number[])[]} points
 * @returns {{valid:boolean, reason?:string}}
 */
export function latheProfileValid(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return { valid: false, reason: 'need at least 2 points' };
  }
  let y0 = null, allSameY = true;
  for (const raw of points) {
    const { x, y } = xy(raw);
    if (!(x >= 0)) {
      return { valid: false, reason: `x must be >= 0 (radius from the Y axis), got x=${x}` };
    }
    if (y0 === null) y0 = y;
    else if (y !== y0) allSameY = false;
  }
  if (allSameY) {
    return { valid: false, reason: 'all points share one y (degenerate — no body of revolution)' };
  }
  return { valid: true };
}

/**
 * Profile of a capped cylinder with a rounded TOP outer edge, for LatheGeometry (revolve around Y).
 * The wall climbs from the base, a quarter arc rolls the top outer edge inward, then the top closes to
 * the center. Point order: bottom center → bottom outer → wall top → arc(filletSegments) → top center.
 * @param {{radius:number, height:number, fillet:number, filletSegments?:number}} p
 * @returns {{x:number,y:number}[]}  point count = 3 + filletSegments + 1.
 */
export function filletedCylinderProfile({ radius, height, fillet, filletSegments = 4 }) {
  if (!(radius > 0)) throw new RangeError(`filletedCylinderProfile: radius must be > 0 (got ${radius})`);
  if (!(height > 0)) throw new RangeError(`filletedCylinderProfile: height must be > 0 (got ${height})`);
  if (!(fillet > 0)) throw new RangeError(`filletedCylinderProfile: fillet must be > 0 (got ${fillet})`);
  if (!(fillet < radius)) throw new RangeError(`filletedCylinderProfile: fillet must be < radius (got fillet=${fillet}, radius=${radius})`);
  if (!(fillet < height)) throw new RangeError(`filletedCylinderProfile: fillet must be < height (got fillet=${fillet}, height=${height})`);

  const pts = [
    { x: 0, y: 0 },                     // bottom center
    { x: radius, y: 0 },                // bottom outer
    { x: radius, y: height - fillet },  // wall top (start of the fillet arc)
  ];
  // Quarter arc rounding the top outer edge, centered at (radius - fillet, height - fillet).
  for (let k = 1; k <= filletSegments; k++) {
    const a = (Math.PI / 2) * (k / filletSegments);
    pts.push({
      x: (radius - fillet) + fillet * Math.cos(a),
      y: (height - fillet) + fillet * Math.sin(a),
    });
  }
  pts.push({ x: 0, y: height });        // top center
  return pts;
}

/**
 * Profile of a dome / tank-top (a quarter ellipse) from top center down to the base outer edge, for
 * LatheGeometry (revolve around Y). Revolves into a dished head / dome / hemispherical cap.
 * @param {{radius:number, height:number, segments?:number}} p
 * @returns {{x:number,y:number}[]}  point count = segments + 1; first = (0,height), last = (radius,0).
 */
export function domeProfile({ radius, height, segments = 8 }) {
  if (!(radius > 0)) throw new RangeError(`domeProfile: radius must be > 0 (got ${radius})`);
  if (!(height > 0)) throw new RangeError(`domeProfile: height must be > 0 (got ${height})`);
  if (!(segments >= 3)) throw new RangeError(`domeProfile: segments must be >= 3 (got ${segments})`);

  const pts = [];
  for (let k = 0; k <= segments; k++) {
    const a = (Math.PI / 2) * (k / segments);
    pts.push({ x: radius * Math.sin(a), y: height * Math.cos(a) });
  }
  return pts;
}

// -------- in-page revolution-body builder (dynamic three import; async) -----------------------------
/**
 * Revolve a 2D profile into a round body as a single Mesh — a surface of revolution instead of a stack
 * of boxes/cylinders. The profile's x is the radius from the (Y) axis and y is the height; feed it a
 * hand-authored polyline or one of this file's generators (`filletedCylinderProfile`, `domeProfile`).
 * The caller injects the material (never a global registry) and parents the returned Mesh.
 *
 * Segment count (around the axis) derives from the profile's max radius via the pure `adaptive-segments`
 * helper when `opts.targetEdgeLength` is set, else falls back to 16; clamped to a minimum of 8 so the
 * body always reads round rather than faceted.
 *
 * ASYNC: loads three via a dynamic `import('three')` INSIDE the function so this module stays
 * pure-Node importable and its pure exports (latheProfileValid / filletedCylinderProfile / domeProfile)
 * remain unit-testable without three.js resolution.
 *
 * Cost note: LatheGeometry emits ~2*(N-1)*segments triangles for an N-point profile — keep the profile
 * lean and let segments (not profile density) carry the roundness.
 * @param {({x:number,y:number}|number[])[]} profile  polyline; x = radius from the axis, y = height.
 * @param {object} [opts]
 * @param {number} [opts.segments]           explicit radial segment count override (clamped min 8).
 * @param {number} [opts.targetEdgeLength]   when set, the radial count derives from the max radius.
 * @param {THREE.Material} material          injected material.
 * @returns {Promise<THREE.Mesh>}  a shadow-casting/receiving Mesh the caller parents.
 */
export async function makeLatheBody(profile, opts = {}, material) {
  const THREE = await import('three');
  const v = latheProfileValid(profile);
  if (!v.valid) throw new RangeError('lathe profile: ' + v.reason);
  const maxX = Math.max(...profile.map(p => (p.x ?? p[0])));
  const segments = opts.segments ?? (radialSegmentsFor(maxX, opts.targetEdgeLength) ?? 16);
  const pts2 = profile.map(p => new THREE.Vector2(p.x ?? p[0], p.y ?? p[1]));
  const g = new THREE.LatheGeometry(pts2, Math.max(8, segments));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
