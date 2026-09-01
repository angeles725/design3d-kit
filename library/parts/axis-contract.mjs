// library: axis-contract (parts/axis-contract.mjs) — canonical world↔model transform (GR2).
// Fixes the single Y-up world↔model mapping for the voxel→realista axis.
// Convention: world.z = D − (iz + 0.5)*h  (CAD mirror applied exactly once).
// Re-exports cellOf/centerOf from voxelize.mjs (value match, no import cycle).
// deps: voxelize.mjs (same parts/ directory).

export { cellOf, centerOf } from './voxelize.mjs';

/**
 * Convert a world-space point to voxel grid indices using the canonical axis convention.
 * Mapping:
 *   ix = floor(wx / h)
 *   iy = floor(wy / h)
 *   iz = floor((D − wz) / h)  ← world.z = D − iz convention (CAD mirror)
 *
 * @param {number[]} worldPt  [wx, wy, wz] world coordinates.
 * @param {number}   h        voxel edge length.
 * @param {number}   D        scene depth (world Z extent), the CAD mirror offset.
 * @returns {number[]} [ix, iy, iz] integer voxel indices.
 */
export function worldToModel([wx, wy, wz], h, D) {
  return [
    Math.floor(wx / h),
    Math.floor(wy / h),
    Math.floor((D - wz) / h),
  ];
}

/**
 * Convert voxel grid indices to the world-space center of that cell.
 * Inverse of worldToModel: the center is at (v + 0.5)*h (or D - (iz+0.5)*h for Z).
 *
 * @param {number[]} voxelPt  [ix, iy, iz] integer voxel indices.
 * @param {number}   h        voxel edge length.
 * @param {number}   D        scene depth, the CAD mirror offset.
 * @returns {number[]} [wx, wy, wz] world-space center of the voxel.
 */
export function modelToWorld([ix, iy, iz], h, D) {
  return [
    (ix + 0.5) * h,
    (iy + 0.5) * h,
    D - (iz + 0.5) * h,   // CAD mirror: world.z = D − iz·h (center at D − (iz+0.5)·h)
  ];
}
