import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OccupancyGrid, CELL } from './occupancy-grid.mjs';

const box = (o) => OccupancyGrid.aabbOf(o);

test('new grid: all cells FREE', () => {
  const g = new OccupancyGrid([4, 4, 4], 0.5);
  assert.equal(g.stats().FREE, g.cells.length);
  assert.equal(g.cellAt([2, 2, 2]), CELL.FREE);
});

test('markObject sets body cells OCCUPIED', () => {
  const g = new OccupancyGrid([6, 6, 4], 0.25);
  const o = { size: [2, 1, 1], center: [3, 3, 0.5] };
  g.markObject(o);
  assert.equal(g.cellAt([3, 3, 0.5]), CELL.OCCUPIED);   // inside
  assert.equal(g.cellAt([0.2, 0.2, 0.5]), CELL.FREE);   // outside
  assert.ok(!g.areCellsFree(box(o)));                   // its box is not free
  assert.ok(g.areCellsFree(box({ size: [1, 1, 1], center: [5, 5, 0.5] }))); // empty corner is
});

test('markClearance paints CLEARANCE only where FREE (never clobbers a body)', () => {
  const g = new OccupancyGrid([8, 4, 3], 0.25);
  const a = { size: [2, 1, 1], center: [2, 2, 0.5], clearance: { '+x': 1.0 } };
  const b = { size: [0.5, 0.5, 1], center: [3.5, 2, 0.5] }; // sits INSIDE a's +x clearance band (x[3.25,3.75])
  g.markObject(a); g.markObject(b);
  g.markClearance(a);
  assert.equal(g.cellAt([3.5, 2, 0.5]), CELL.OCCUPIED); // b's body preserved, not overwritten by CLEARANCE
  assert.equal(g.cellAt([3.1, 2, 0.5]), CELL.CLEARANCE); // free part of a's clearance (x=3.1, outside b) is painted
  assert.equal(g.cellAt([2, 2, 0.5]), CELL.OCCUPIED);   // a's body preserved
});

test('reserve is ATOMIC: grants a free box, denies an overlapping one, leaves state unchanged on deny', () => {
  const g = new OccupancyGrid([6, 6, 3], 0.5);
  const r1 = box({ size: [2, 2, 1], center: [2, 2, 0.5] });
  const r2 = box({ size: [2, 2, 1], center: [3, 3, 0.5] }); // overlaps r1
  assert.equal(g.reserve(r1), true);
  assert.equal(g.cellAt([2, 2, 0.5]), CELL.RESERVED);
  const before = g.stats().RESERVED;
  assert.equal(g.reserve(r2), false);          // denied — overlaps r1
  assert.equal(g.stats().RESERVED, before);    // unchanged on deny (no partial reservation)
});

test('release turns RESERVED back to FREE', () => {
  const g = new OccupancyGrid([4, 4, 3], 0.5);
  const r = box({ size: [2, 2, 1], center: [2, 2, 0.5] });
  g.reserve(r);
  g.release(r);
  assert.equal(g.cellAt([2, 2, 0.5]), CELL.FREE);
  assert.equal(g.stats().RESERVED, 0);
});

test('semantic codes are distinct and countable', () => {
  const g = new OccupancyGrid([4, 4, 2], 0.5);
  g.mark(box({ size: [1, 1, 1], center: [1, 1, 0.5] }), CELL.STRUCTURE);
  g.mark(box({ size: [1, 1, 1], center: [3, 3, 0.5] }), CELL.HVAC);
  const s = g.stats();
  assert.ok(s.STRUCTURE > 0 && s.HVAC > 0 && s.FREE > 0);
  assert.notEqual(CELL.STRUCTURE, CELL.HVAC);
});

test('clearObject resets an object body to FREE (only cells still holding its code)', () => {
  const g = new OccupancyGrid([6, 6, 2], 0.5);
  const o = { size: [2, 2, 1], center: [3, 3, 0.5] };
  g.markObject(o);
  assert.ok(!g.areCellsFree(box(o)));
  g.clearObject(o);
  assert.ok(g.areCellsFree(box(o)));           // body freed
  assert.equal(g.cellAt([3, 3, 0.5]), CELL.FREE);
});

test('clearObject does NOT wipe a neighbour cell of a different code inside the AABB', () => {
  const g = new OccupancyGrid([6, 6, 2], 0.5);
  const o = { size: [2, 2, 1], center: [3, 3, 0.5] }; // AABB x[2,4] y[2,4]
  g.markObject(o);
  g.mark(box({ size: [0.5, 0.5, 1], center: [3, 3, 0.5] }), CELL.RESERVED); // a RESERVED patch inside
  g.clearObject(o); // only clears OCCUPIED cells
  assert.equal(g.cellAt([3, 3, 0.5]), CELL.RESERVED); // the RESERVED patch survives
});

test('moveObject clears the old footprint and marks the new one', () => {
  const g = new OccupancyGrid([10, 4, 2], 0.5);
  const oldO = { size: [2, 2, 1], center: [2, 2, 0.5] };
  const newO = { size: [2, 2, 1], center: [7, 2, 0.5] };
  g.markObject(oldO);
  g.moveObject(oldO, newO);
  assert.ok(g.areCellsFree(box(oldO)));         // old spot freed
  assert.equal(g.cellAt([7, 2, 0.5]), CELL.OCCUPIED); // new spot occupied
});
