import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathFree, findFreeRegion, gridFromScene } from './occupancy-accel.mjs';
import { OccupancyGrid, CELL } from './occupancy-grid.mjs';

test('pathFree: clear across an empty grid', () => {
  const g = new OccupancyGrid([10, 6, 3], 0.25);
  const r = pathFree(g, [0.5, 3, 1], [9.5, 3, 1]);
  assert.equal(r.clear, true);
  assert.equal(r.blockedAt, null);
});

test('pathFree: blocked when the segment crosses an occupied body', () => {
  const g = new OccupancyGrid([10, 6, 3], 0.25);
  g.markObject({ size: [1, 4, 2], center: [5, 3, 1] }); // a wall mid-room
  const r = pathFree(g, [0.5, 3, 1], [9.5, 3, 1]);
  assert.equal(r.clear, false);
  assert.equal(r.code, CELL.OCCUPIED);
  assert.ok(r.blockedAt[0] > 3 && r.blockedAt[0] < 7); // blocked near the wall
});

test('pathFree: clearance is passable only when explicitly allowed', () => {
  const g = new OccupancyGrid([8, 4, 3], 0.25);
  g.markObject({ size: [1, 1, 2], center: [4, 2, 1], clearance: { '+x': 1 } });
  g.markClearance({ size: [1, 1, 2], center: [4, 2, 1], clearance: { '+x': 1 } });
  const a = [5, 2, 1], b = [5, 2, 1]; // a point inside the +x clearance band (x[4.5,5.5])
  assert.equal(pathFree(g, a, b).clear, false);                          // FREE-only: clearance blocks
  assert.equal(pathFree(g, a, b, { allow: [CELL.FREE, CELL.CLEARANCE] }).clear, true); // allowed: passes
});

test('findFreeRegion: finds a spot in a partially-occupied grid', () => {
  const g = new OccupancyGrid([10, 6, 3], 0.5);
  g.markObject({ size: [3, 6, 2], center: [1.5, 3, 1] }); // west block occupied
  const c = findFreeRegion(g, [1, 1, 1], { step: 0.5 });
  assert.ok(c, 'a free region exists');
  assert.ok(g.areCellsFree(OccupancyGrid.aabbOf({ size: [1, 1, 1], center: c })));
  assert.ok(c[0] >= 3, 'placed east of the occupied west block');
});

test('findFreeRegion: returns null when nothing fits', () => {
  const g = new OccupancyGrid([2, 2, 2], 0.5);
  g.markObject({ size: [2, 2, 2], center: [1, 1, 1] }); // whole room occupied
  assert.equal(findFreeRegion(g, [1, 1, 1], { step: 0.5 }), null);
});

test('gridFromScene builds a queryable grid from a scene', () => {
  const scene = { room: { size: [8, 4, 3] }, objects: [{ id: 'A', size: [2, 2, 2], center: [1, 2, 1] }] };
  const g = gridFromScene(scene, { h: 0.5, markClearance: false });
  assert.equal(g.cellAt([1, 2, 1]), CELL.OCCUPIED);
  assert.equal(pathFree(g, [7, 2, 1], [7.5, 2, 1]).clear, true); // open east side
});
