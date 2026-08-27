import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toBlockout, sceneToBlockout, blockoutStats } from './voxel-blockout.mjs';
import { OccupancyGrid, CELL } from './occupancy-grid.mjs';

test('toBlockout enumerates OCCUPIED cells as world-center voxels', () => {
  const g = new OccupancyGrid([4, 4, 2], 1);
  g.markObject({ size: [2, 2, 1], center: [1, 1, 0.5] }); // cells x[0,2) y[0,2) z[0,1)
  const b = toBlockout(g);
  assert.equal(b.voxelSize, 1);
  assert.equal(b.count, 4);                    // 2x2x1 cells
  assert.ok(b.byCode.OCCUPIED.some(v => v[0] === 0.5 && v[1] === 0.5 && v[2] === 0.5));
});

test('sceneToBlockout: spec → voxel blockout in one call, services differentiated by colour code', () => {
  const scene = { room: { size: [8, 4, 3] }, objects: [
    { id: 'CH-01', size: [2, 2, 2], center: [1, 2, 1] },                       // default OCCUPIED
    { id: 'DUCT-1', size: [4, 0.5, 0.5], center: [5, 2, 1], systemCode: CELL.HVAC }, // HVAC colour block
  ] };
  const b = sceneToBlockout(scene, { h: 0.5 });
  assert.ok(b.byCode.OCCUPIED.length > 0, 'chiller voxels');
  assert.ok(b.byCode.HVAC.length > 0, 'duct voxels in a distinct code group');
  // the two services live in different code groups (differentiated for the massing render)
  assert.notEqual(CELL.OCCUPIED, CELL.HVAC);
});

test('blockoutStats reports per-code counts + occupied volume', () => {
  const scene = { room: { size: [4, 4, 2] }, objects: [{ id: 'A', size: [2, 2, 2], center: [1, 1, 1] }] };
  const b = sceneToBlockout(scene, { h: 1 });
  const s = blockoutStats(b);
  assert.equal(s.perCode.OCCUPIED, 8);         // size[2,2,2] center[1,1,1] → x[0,2]y[0,2]z[0,2] = 2×2×2 = 8 cells at h=1
  assert.equal(s.voxels, 8);
  assert.equal(s.volume, 8);                    // 8 cells × 1 m³
});

test('includeClearance adds a CLEARANCE colour group', () => {
  const scene = { room: { size: [8, 4, 3] }, objects: [
    { id: 'CH-01', size: [2, 2, 2], center: [1, 2, 1], clearance: { '+x': 1 } },
  ] };
  const b = sceneToBlockout(scene, { h: 0.5, includeClearance: true });
  assert.ok(b.byCode.CLEARANCE && b.byCode.CLEARANCE.length > 0, 'clearance voxels present as their own group');
});
