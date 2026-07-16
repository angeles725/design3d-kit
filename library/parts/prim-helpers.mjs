// library: prim-helpers  (parts/prim-helpers.mjs)
// source: cuarto-frio-safran · cuarto-3d.html:31616-31619 · client-shipped (2026)
// what: one-line box/panel/cyl/tube primitive builders with shadow flags — the base of every part builder.
// params: dimensions + material are ALWAYS injected per call; segment counts default to source values (cyl 20, tube 12).
// deps: three (BoxGeometry, CylinderGeometry, quaternion orientation).
// coupling notes:
//   - Source scene used a custom scale (~1 unit ≈ 0.3 m, room 117x65x90 units); all dims here are
//     caller-provided so no scale is baked in.
//   - box/cyl/tube set castShadow=true, receiveShadow=true; panel is a box with castShadow=false
//     (thin cladding that must not self-shadow).
//   - BAKED-SHADOW scenes (`shadowMap.autoUpdate=false` + one needsUpdate): meshes created AFTER the
//     first frame cast nothing until the caller re-bakes (`renderer.shadowMap.needsUpdate = true`).
//   - Builders RETURN the Mesh; the caller adds it to its parent (never scene.add here).

import * as THREE from 'three';

/** Solid box centered at (x,y,z). Casts and receives shadow. */
export function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Box variant for thin cladding: receives but does NOT cast shadow. */
export function panel(w, h, d, mat, x, y, z) {
  const m = box(w, h, d, mat, x, y, z);
  m.castShadow = false;
  return m;
}

/**
 * Y-axis cylinder (or cone: r0 top, r1 bottom) centered at (x,y,z).
 * `open=true` skips the caps (venturi rings, ducts).
 */
export function cyl(r0, r1, h, mat, x, y, z, open = false, radialSegments = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, radialSegments, 1, !!open), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * Straight tube between two THREE.Vector3 points, radius r.
 * Oriented via quaternion.setFromUnitVectors(+Y, dir).
 */
export function tube(p0, p1, r, mat, radialSegments = 12) {
  const dir = new THREE.Vector3().subVectors(p1, p0);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, radialSegments), mat);
  m.position.copy(p0).add(dir.clone().multiplyScalar(0.5));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = true;
  return m;
}
