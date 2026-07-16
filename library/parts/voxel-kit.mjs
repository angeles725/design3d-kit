// library: voxel-kit  (parts/voxel-kit.mjs)
// source: hotel-torre-voxel · hotel-torre-voxel.optimized.html:160-171 (store) + 537-605 (mesher) ·
//         optimization round evidence (draw calls collapsed to ~1 mesh per color) (2026)
// what: color-bucketed voxel store (addVox / inclusive-range fill) + hidden-face mesher — emits ONLY
//       faces without an opaque neighbor into ONE BufferGeometry per color. The perf leap of the
//       voxel track.
// params: materialFor(colorInt) → Material (injected — the source's TRANSP/EMIS/METAL material policy
//         lives with the CALLER now), voxelSize, optional castShadowFor(colorInt, material).
// deps: three (BufferGeometry, Float32BufferAttribute, Mesh).
// coupling notes:
//   - SCALE: 1 voxel = 1 world unit at integer grid coords; voxel center sits at (x+0.5, y+0.5, z+0.5).
//     The house voxel scale is ≈ 0.25 m/unit — scale the returned meshes' PARENT, or pass voxelSize.
//   - TRANSPARENT VOXELS NEVER OCCLUDE: only voxels whose material is opaque enter the occlusion set,
//     so glass shows the geometry behind it (documented visual-quality decision, not a bug).
//     Transparency is read from materialFor(color).transparent.
//   - Per-color castShadow policy is the CALLER's: default here is castShadow only for opaque colors
//     (the source additionally excluded its floor color — express that via castShadowFor).
//   - The source's two-store pattern (static + hideable facade) = create TWO stores and buildStore
//     each into its own parent Group; toggle the facade group's .visible.
//   - Meshes are RETURNED (array, one per color); optional `parent` convenience param.
//   - Materials created by materialFor are per-color and owned by the caller (keep your own registry
//     if you mutate emissives for day/night — beware color-int key collisions across semantic uses).

import * as THREE from 'three';

const FACE_DIRS = [
  { n: [1, 0, 0],  u: [0, 1, 0], v: [0, 0, 1] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0],  u: [0, 0, 1], v: [1, 0, 0] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1],  u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] },
];

/**
 * Color-bucketed voxel store.
 * The source exposed two pre-bound stores (fillS/fillF for static/facade); here you create one store
 * per render bucket and bind your own shorthands.
 * @returns {{ data: object, addVox(x,y,z,color:number):void,
 *             fill(x0,x1,y0,y1,z0,z1,color:number):void }}  fill ranges are INCLUSIVE (source semantics).
 */
export function createVoxelStore() {
  const data = {};
  function addVox(x, y, z, color) {
    const k = color.toString();
    if (!data[k]) data[k] = { color, positions: [] };
    data[k].positions.push([x, y, z]);
  }
  function fill(x0, x1, y0, y1, z0, z1, color) {
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) addVox(x, y, z, color);
  }
  return { data, addVox, fill };
}

/**
 * Hidden-face mesher: one Mesh (one BufferGeometry + one Material) per color bucket.
 * Only faces without an OPAQUE neighbor are emitted (transparent voxels never occlude).
 * @param {object} store              store from createVoxelStore() (or its .data).
 * @param {object} opts
 * @param {(color:number)=>THREE.Material} opts.materialFor  injected material policy; .transparent
 *        decides occlusion membership. Called once per color.
 * @param {number} [opts.voxelSize=1]  world units per voxel (source: 1 unit ≈ 0.25 m).
 * @param {(color:number, mat:THREE.Material)=>boolean} [opts.castShadowFor]  per-color shadow policy;
 *        default: opaque colors cast, transparent don't.
 * @param {THREE.Object3D} [opts.parent]  convenience; meshes are returned regardless.
 * @returns {THREE.Mesh[]}  one mesh per color; all receiveShadow=true.
 */
export function buildStore(store, { materialFor, voxelSize = 1, castShadowFor, parent } = {}) {
  const data = store.data || store;

  // resolve materials first: transparency decides occlusion membership
  const buckets = [];
  for (const k in data) {
    const { color, positions } = data[k];
    buckets.push({ color, positions, mat: materialFor(color) });
  }

  const OCC = new Set(); // only OPAQUE voxels block faces
  for (const b of buckets) {
    if (b.mat.transparent) continue;
    for (const p of b.positions) OCC.add(p[0] + ',' + p[1] + ',' + p[2]);
  }

  const meshes = [];
  for (const b of buckets) {
    const pos = [], nor = [], idx = [];
    let base = 0;
    for (const p of b.positions) {
      const x = p[0], y = p[1], z = p[2];
      for (const f of FACE_DIRS) {
        if (OCC.has((x + f.n[0]) + ',' + (y + f.n[1]) + ',' + (z + f.n[2]))) continue;
        const cx = x + 0.5 + f.n[0] * 0.5, cy = y + 0.5 + f.n[1] * 0.5, cz = z + 0.5 + f.n[2] * 0.5;
        const ux = f.u[0] * 0.5, uy = f.u[1] * 0.5, uz = f.u[2] * 0.5;
        const vx = f.v[0] * 0.5, vy = f.v[1] * 0.5, vz = f.v[2] * 0.5;
        pos.push(cx - ux - vx, cy - uy - vy, cz - uz - vz,  cx + ux - vx, cy + uy - vy, cz + uz - vz,
                 cx + ux + vx, cy + uy + vy, cz + uz + vz,  cx - ux + vx, cy - uy + vy, cz - uz + vz);
        nor.push(f.n[0], f.n[1], f.n[2], f.n[0], f.n[1], f.n[2],
                 f.n[0], f.n[1], f.n[2], f.n[0], f.n[1], f.n[2]);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        base += 4;
      }
    }
    const geo = new THREE.BufferGeometry();
    if (voxelSize !== 1) for (let i = 0; i < pos.length; i++) pos[i] *= voxelSize;
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, b.mat);
    mesh.castShadow = castShadowFor ? castShadowFor(b.color, b.mat) : !b.mat.transparent;
    mesh.receiveShadow = true;
    if (parent) parent.add(mesh);
    meshes.push(mesh);
  }
  return meshes;
}
