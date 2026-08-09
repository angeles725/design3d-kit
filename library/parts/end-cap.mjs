// library: end-cap  (parts/end-cap.mjs)
// source: design3d numerical-methods pass · distilled from the recurring "open cylinder" defect —
//         an openEnded CylinderGeometry (or a LatheGeometry left un-closed) reads as a hollow tube
//         with a see-through hole at the end, and no per-item count catches the missing lid.
// what: an END CAP — a flat annular (or solid disk) lid that closes the end of a tube/cylinder. Cap a
//       hollow pipe with an annulus (inner + outer radius), or a solid rod with a disk (innerRadius=0).
//       ONE watertight fan/ring instead of a stray plane that never quite lines up.
// deps: NONE for the PURE core (`annularCapData` imports nothing — Node-testable with no three.js
//       resolution). Only the in-page builder touches three, via a DYNAMIC import INSIDE the function.
//
// THE SHAPE. The cap lies in the XY plane (z = 0), centered at the origin; the caller orients its
// +Z normal onto any axis and translates it into place. A DISK (innerRadius = 0) is a triangle fan:
// one center vertex + `segments` rim vertices, `segments` triangles. An ANNULUS (innerRadius > 0) is
// two concentric rings of `segments` vertices each, 2 triangles per segment — the flat washer that
// seals the wall of a hollow tube without covering its bore.
//
// PURE/ASYNC SPLIT (same idiom as lathe-body.mjs / superquadric.mjs). The vertex/index math is
// separated from the mesh build so it can be validated in plain Node; `makeEndCap` loads three via a
// dynamic `import('three')` INSIDE the function, so importing this module never forces three.js
// resolution on the test runner and never adds a top-level `import * as THREE`.

// Pure guard (that module imports nothing, so this top-level import does NOT pull three into the graph).
import { assertPositive } from '../harness/geom-verify.mjs';

// -------- PURE cap tessellation (imports nothing; Node-testable) -----------------------------------

/**
 * Flat position/index arrays for an end cap in the XY plane (z = 0), centered at the origin.
 * innerRadius === 0 → a DISK triangle fan: 1 center vertex + `segments` rim vertices, `segments`
 * triangles (index length 3*segments). innerRadius > 0 → an ANNULUS: an inner ring + an outer ring,
 * `segments` vertices each (2*segments total), 2 triangles per segment (index length 6*segments).
 * Winding is CCW as seen from +Z so the outward normal is +Z after `computeVertexNormals`.
 * @param {{innerRadius:number, outerRadius:number, segments?:number}} p
 * @returns {{positions:number[], index:number[], area:number}}  positions flat [x,y,z, ...].
 */
export function annularCapData({ innerRadius, outerRadius, segments = 24 }) {
  // A degenerate/negative annulus (inner >= outer) has no lid to build — guard the derived width.
  assertPositive(outerRadius - innerRadius, 'outerRadius-innerRadius');
  if (!(segments >= 3)) throw new RangeError(`annularCapData: segments must be >= 3 (got ${segments})`);

  const area = Math.PI * (outerRadius ** 2 - innerRadius ** 2);
  const positions = [];
  const index = [];

  if (innerRadius === 0) {
    // DISK fan: vertex 0 = center, vertices 1..segments = rim.
    positions.push(0, 0, 0);
    for (let i = 0; i < segments; i++) {
      const a = (2 * Math.PI * i) / segments;
      positions.push(outerRadius * Math.cos(a), outerRadius * Math.sin(a), 0);
    }
    for (let i = 0; i < segments; i++) {
      const rim = 1 + i;
      const next = 1 + ((i + 1) % segments);
      index.push(0, rim, next); // CCW from +Z
    }
    return { positions, index, area };
  }

  // ANNULUS: inner ring = vertices 0..segments-1, outer ring = vertices segments..2*segments-1.
  for (let i = 0; i < segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    positions.push(innerRadius * Math.cos(a), innerRadius * Math.sin(a), 0);
  }
  for (let i = 0; i < segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    positions.push(outerRadius * Math.cos(a), outerRadius * Math.sin(a), 0);
  }
  for (let i = 0; i < segments; i++) {
    const inA = i;
    const inB = (i + 1) % segments;
    const outA = segments + i;
    const outB = segments + ((i + 1) % segments);
    // Two triangles per quad, wound CCW from +Z: (inA, outA, outB) + (inA, outB, inB).
    index.push(inA, outA, outB);
    index.push(inA, outB, inB);
  }
  return { positions, index, area };
}

// -------- in-page end-cap builder (dynamic three import; async) ------------------------------------
/**
 * Build a flat end cap (disk or annulus) as a single Mesh and orient it onto `axis` at `center`. The
 * cap is generated in the XY plane (normal +Z), then its +Z normal is rotated onto the normalized
 * `axis` via Quaternion.setFromUnitVectors and translated to `center`. The caller injects the material
 * (never a global registry) and parents the returned Mesh.
 *
 * ASYNC: loads three via a dynamic `import('three')` INSIDE the function so this module stays
 * pure-Node importable and its pure export (`annularCapData`) remains unit-testable without three.js.
 * @param {{innerRadius:number, outerRadius:number, segments?:number, center?:{x:number,y:number,z:number}, axis?:{x:number,y:number,z:number}}} p
 * @param {THREE.Material} material  injected material.
 * @returns {Promise<THREE.Mesh>}  a shadow-casting/receiving Mesh the caller parents.
 */
export async function makeEndCap(
  { innerRadius, outerRadius, segments = 24, center = { x: 0, y: 0, z: 0 }, axis = { x: 0, y: 1, z: 0 } },
  material,
) {
  const THREE = await import('three');
  const { positions, index } = annularCapData({ innerRadius, outerRadius, segments });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();

  const mesh = new THREE.Mesh(g, material);
  const axisN = new THREE.Vector3(axis.x, axis.y, axis.z).normalize();
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axisN);
  mesh.position.set(center.x, center.y, center.z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
