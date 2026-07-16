// library: merge-instancing-kit  (parts/merge-instancing-kit.mjs)
// source: edificio-hotel-realista · edificio-hotel-realista-v1.html:230-259 · realistic track evidence
//         (88 furnished hotel bays + VAV rendered in ≈15 draws) (2026)
// what: mergeBoxes(defs) + tMat(x,y,z) + makeIM(geo,mat,matrices) — the 12 lines that enable the
//       instanced realistic track: fuse a compound module's boxes into ONE BufferGeometry, then
//       instance it N times with translation matrices.
// params: box defs {w,h,d,x,y,z} in scene units; material injected; matrices via tMat (translation
//         only — compose your own Matrix4 if you need rotation/scale per instance).
// deps: three + three/addons/utils/BufferGeometryUtils.js (mergeGeometries).
// coupling notes:
//   - SCALE: edificio is 1 unit = 1 m; defs carry their own dims so nothing is baked, but source
//     module origins were (bayX, floorY, facadeZ) with +z into the building.
//   - One merged geometry = ONE material for the whole compound module. Split per material and make
//     one InstancedMesh per material with the SAME matrices (that is exactly the 88-bay pattern:
//     bedding IM + pillow IM + TV IM ... all sharing BAY matrices).
//   - makeIM RETURNS the InstancedMesh (source parented into a global staticG — decoupled here;
//     `parent` is an optional convenience).
//   - castShadow defaults true; in baked-shadow scenes add all IMs before the single shadow bake.
//   - InstancedMesh draw/tri counts only read correctly from renderer.info (wrapper counters
//     under-read instancing) — pair with harness/render-stats-hud.mjs.

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Fuse an array of box definitions into one BufferGeometry (one draw per material).
 * @param {{w:number,h:number,d:number,x:number,y:number,z:number}[]} defs
 *        each box's size + its center offset in the module's LOCAL frame.
 * @returns {THREE.BufferGeometry}
 */
export function mergeBoxes(defs) {
  const gs = defs.map(b => {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d);
    g.translate(b.x, b.y, b.z);
    return g;
  });
  return BufferGeometryUtils.mergeGeometries(gs, false);
}

const _q0 = new THREE.Quaternion();
const _s1 = new THREE.Vector3(1, 1, 1);

/** Translation-only instance matrix (identity rotation/scale). */
export function tMat(x, y, z) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q0, _s1);
}

/**
 * InstancedMesh over a list of matrices. Returned, not scene-added.
 * @param {THREE.BufferGeometry} geo   typically from mergeBoxes().
 * @param {THREE.Material} mat         injected.
 * @param {THREE.Matrix4[]} matrices   one per instance (e.g. the shared BAY list).
 * @param {object} [opts]
 * @param {THREE.Object3D} [opts.parent]     convenience parenting.
 * @param {boolean} [opts.castShadow=true]
 * @returns {THREE.InstancedMesh}
 */
export function makeIM(geo, mat, matrices, { parent, castShadow = true } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, matrices.length);
  matrices.forEach((m, i) => im.setMatrixAt(i, m));
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = castShadow;
  im.receiveShadow = true;
  if (parent) parent.add(im);
  return im;
}
