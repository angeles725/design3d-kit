// library: flange  (parts/flange.mjs)
// source: design3d numerical-methods pass · distilled from the recurring "incoherent unions between
//         cylinders" defect — pipes and nozzles meeting a vessel with a hard, un-detailed seam. A real
//         joint has a raised flange collar or a welded bead ring at the union; without it the junction
//         reads as two primitives clipped through each other.
// what: a FLANGE — a short raised ring that dresses the junction where a pipe/nozzle meets a wall.
//       `style:'collar'` is a short solid annular band (a rectangular cross-section revolved into a
//       watertight ring); `style:'bead'` is a torus weld ring. Either encircles the bore at a joint.
// deps: NONE for the PURE core (`collarProfile` imports nothing but the pure `assertPositive` guard —
//       Node-testable with no three.js resolution). Only the in-page builder touches three, via a
//       DYNAMIC import INSIDE the function (never a top-level `import * as THREE`).
//
// THE SHAPE. `collarProfile` is the 2D lathe profile of a rectangular ring cross-section: the four
// corners (innerRadius,0) → (outerRadius,0) → (outerRadius,height) → (innerRadius,height), where x is
// the radius from the (Y) axis and y is the height. Revolved around Y (LatheGeometry) it sweeps a
// short hollow annular cylinder — a watertight collar with a bore of `innerRadius`. The builder closes
// the profile loop (re-appending the first corner) so the inner wall is swept too and the ring is
// watertight, then orients local +Y onto the joint `axis`.
//
// PURE/ASYNC SPLIT (same idiom as lathe-body.mjs / superquadric.mjs). The profile math is separated
// from the mesh build so it can be validated in plain Node; `makeFlange` loads three via a dynamic
// `import('three')` INSIDE the function, so importing this module never forces three.js resolution on
// the test runner.

// Pure guard (that module imports nothing, so this top-level import does NOT pull three into the graph).
import { assertPositive } from '../harness/geom-verify.mjs';

// -------- PURE flange profile (imports nothing but the pure guard; Node-testable) ------------------

/**
 * The 2D lathe profile of a collar flange — a rectangular ring cross-section for revolution around Y.
 * Corners (in order): (innerRadius,0) → (outerRadius,0) → (outerRadius,height) → (innerRadius,height).
 * x is the radius from the axis, y is the height; y runs monotonically 0 → height. Guards the derived
 * band width (outerRadius - innerRadius) and the height so a degenerate/inverted collar throws.
 * @param {{innerRadius:number, outerRadius:number, height:number}} p
 * @returns {{x:number,y:number}[]}  exactly 4 profile corners.
 */
export function collarProfile({ innerRadius, outerRadius, height }) {
  assertPositive(outerRadius - innerRadius, 'outerRadius-innerRadius');
  assertPositive(height, 'height');
  return [
    { x: innerRadius, y: 0 },
    { x: outerRadius, y: 0 },
    { x: outerRadius, y: height },
    { x: innerRadius, y: height },
  ];
}

// -------- in-page flange builder (dynamic three import; async) -------------------------------------
/**
 * Build a flange ring as a single Mesh and orient it onto `axis` at `center`. `style:'collar'` revolves
 * `collarProfile` into a watertight short annular band (the profile loop is closed so the inner wall is
 * swept too); `style:'bead'` builds a TorusGeometry weld ring (major = outerRadius, minor = height/2).
 * The lathe/collar's local axis is +Y; the torus is pre-rotated so its ring axis is +Y as well, then
 * the mesh maps local +Y onto the normalized `axis` via Quaternion.setFromUnitVectors and translates to
 * `center`. The caller injects the material (never a global registry) and parents the returned Mesh.
 *
 * ASYNC: loads three via a dynamic `import('three')` INSIDE the function so this module stays pure-Node
 * importable and its pure export (`collarProfile`) remains unit-testable without three.js.
 * @param {{innerRadius:number, outerRadius:number, height?:number, segments?:number, center?:{x:number,y:number,z:number}, axis?:{x:number,y:number,z:number}, style?:'collar'|'bead'}} p
 * @param {THREE.Material} material  injected material.
 * @returns {Promise<THREE.Mesh>}  a shadow-casting/receiving Mesh the caller parents.
 */
export async function makeFlange(
  {
    innerRadius, outerRadius, height = 0.03, segments = 24,
    center = { x: 0, y: 0, z: 0 }, axis = { x: 0, y: 1, z: 0 }, style = 'collar',
  },
  material,
) {
  const THREE = await import('three');
  let g;
  if (style === 'bead') {
    // A torus weld ring: major radius = outerRadius, tube (minor) radius = height/2. Its default ring
    // axis is +Z, so rotate it onto +Y to share the collar's local-axis convention before orienting.
    assertPositive(outerRadius, 'outerRadius');
    assertPositive(height, 'height');
    g = new THREE.TorusGeometry(outerRadius, height / 2, 12, segments);
    g.rotateX(Math.PI / 2);
  } else {
    // Watertight collar: close the profile loop (re-append the first corner) so LatheGeometry sweeps
    // the inner wall too, not just the bottom face / outer wall / top face.
    const profile = collarProfile({ innerRadius, outerRadius, height });
    const pts = profile.map((p) => new THREE.Vector2(p.x, p.y));
    pts.push(new THREE.Vector2(profile[0].x, profile[0].y));
    g = new THREE.LatheGeometry(pts, segments);
  }
  g.computeVertexNormals();

  const mesh = new THREE.Mesh(g, material);
  const axisN = new THREE.Vector3(axis.x, axis.y, axis.z).normalize();
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axisN);
  mesh.position.set(center.x, center.y, center.z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
