// library: superquadric  (parts/superquadric.mjs)
// source: design3d numerical-methods pass · distilled from the repeated boolean-fillet churn on
//         industrial housings/tanks/chamfered bodies (a rounded box built from box + 12 edge cylinders
//         + 8 corner spheres, then CSG-unioned — slow to author, fragile to tune).
// what: a superellipsoid (superquadric) sampler — ONE roundness knob per angular direction turns a
//       single parametric surface from a sphere/ellipsoid into a rounded box or a chamfered cylinder,
//       replacing a stack of boolean fillet ops with two exponents.
// deps: NONE. Imports nothing (a tiny inline signed-power helper), so it is unit-testable in plain
//       Node with no three.js resolution needed. Returns flat position/index arrays you can hand to a
//       BufferGeometry (setAttribute('position', ...) + setIndex(...)).
//
// THE SHAPE. Implicit form of an axis-aligned superellipsoid:
//     |x/a|^r + |y/b|^r + |z/c|^r = 1
// with a,b,c the semi-axes and r the roundness exponent. The parametric form used here (Barr 1981)
// splits the roundness into a latitude exponent e1 and a longitude exponent e2, using the SIGNED
// power  sp(base, e) = sign(base) * |base|^e  (plain Math.pow would drop the sign for the negative
// halves of cos/sin and collapse the surface onto one octant):
//     x = a * sp(cos v, e1) * sp(cos u, e2)
//     y = b * sp(cos v, e1) * sp(sin u, e2)
//     z = c * sp(sin v, e1)
//   u ∈ [-π, π]  (longitude),  v ∈ [-π/2, π/2]  (latitude).
// e ≈ 1 → an ellipsoid; e small (≈0.2–0.4) → a rounded box; a large e → a pinched/octahedral shape.
// One exponent per axis replaces multiple boolean fillet operations and stays a single watertight
// surface with no CSG seams.

// -------- tiny inline helper (import nothing) ------------------------------------------------------
/**
 * Signed power: keeps the sign of `base` and raises its magnitude to `e`.
 * @param {number} base
 * @param {number} e
 * @returns {number}  sign(base) * |base|^e ; exactly 0 when base is 0.
 */
export function signedPow(base, e) {
  if (base === 0) return 0;
  return Math.sign(base) * Math.pow(Math.abs(base), e);
}

/**
 * A single point on a superellipsoid surface.
 * @param {number} u  longitude in [-π, π].
 * @param {number} v  latitude in [-π/2, π/2].
 * @param {{a:number,b:number,c:number,e1:number,e2:number}} p  semi-axes + roundness exponents.
 * @returns {{x:number,y:number,z:number}}
 */
export function superquadricPoint(u, v, { a, b, c, e1, e2 }) {
  const cv = signedPow(Math.cos(v), e1);
  const sv = signedPow(Math.sin(v), e1);
  const cu = signedPow(Math.cos(u), e2);
  const su = signedPow(Math.sin(u), e2);
  return { x: a * cv * cu, y: b * cv * su, z: c * sv };
}

/**
 * Tessellate a superellipsoid into flat position + triangle-index arrays (row-major grid).
 * @param {{a:number,b:number,c:number,e1:number,e2:number,uSeg?:number,vSeg?:number}} p
 * @returns {{positions:number[], indices:number[]}}  positions flat [x,y,z, ...], indices flat tri ids.
 */
export function superquadricGrid({ a, b, c, e1, e2, uSeg = 24, vSeg = 16 }) {
  if (!(a > 0) || !(b > 0) || !(c > 0)) {
    throw new RangeError(`superquadricGrid: a,b,c must be > 0 (got a=${a}, b=${b}, c=${c})`);
  }
  if (!(e1 > 0) || !(e2 > 0)) {
    throw new RangeError(`superquadricGrid: e1,e2 must be > 0 (got e1=${e1}, e2=${e2})`);
  }
  if (!(uSeg >= 3) || !(vSeg >= 3)) {
    throw new RangeError(`superquadricGrid: uSeg,vSeg must be >= 3 (got uSeg=${uSeg}, vSeg=${vSeg})`);
  }

  const positions = [];
  // (vSeg+1) rows (latitude) x (uSeg+1) cols (longitude), row-major.
  for (let j = 0; j <= vSeg; j++) {
    const v = -Math.PI / 2 + (Math.PI * j) / vSeg;
    for (let k = 0; k <= uSeg; k++) {
      const u = -Math.PI + (2 * Math.PI * k) / uSeg;
      const pt = superquadricPoint(u, v, { a, b, c, e1, e2 });
      positions.push(pt.x, pt.y, pt.z);
    }
  }

  const cols = uSeg + 1;
  const indices = [];
  for (let j = 0; j < vSeg; j++) {
    for (let k = 0; k < uSeg; k++) {
      const v00 = j * cols + k;
      const v01 = j * cols + (k + 1);
      const v10 = (j + 1) * cols + k;
      const v11 = (j + 1) * cols + (k + 1);
      // two triangles over the quad's four corner vertex ids
      indices.push(v00, v10, v11);
      indices.push(v00, v11, v01);
    }
  }

  return { positions, indices };
}

// -------- in-page builder (dynamic three import; async) --------------------------------------------
/**
 * Build a rounded housing/tank as a single Mesh in ONE call — a superellipsoid surface instead of a
 * box + edge cylinders + corner spheres CSG-unioned. Pick e1/e2 for the silhouette: e≈1 → ellipsoid,
 * e≈0.2–0.4 → rounded box (soft chamfer), larger e → pinched/octahedral. The caller injects the
 * material (never a global registry) and parents the returned Mesh.
 *
 * ASYNC: loads three via a dynamic `import('three')` INSIDE the function so this module stays
 * pure-Node importable and its pure exports (signedPow/superquadricPoint/superquadricGrid) remain
 * unit-testable without three.js resolution.
 * @param {{a:number,b:number,c:number,e1:number,e2:number,uSeg?:number,vSeg?:number}} p
 *   semi-axes a/b/c + roundness exponents e1 (latitude) / e2 (longitude); uSeg/vSeg grid resolution.
 * @param {THREE.Material} material  injected material.
 * @returns {Promise<THREE.Mesh>}  a shadow-casting/receiving Mesh the caller parents.
 */
export async function makeSuperquadric({ a, b, c, e1, e2, uSeg = 24, vSeg = 16 }, material) {
  const THREE = await import('three');
  const { positions, indices } = superquadricGrid({ a, b, c, e1, e2, uSeg, vSeg });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
