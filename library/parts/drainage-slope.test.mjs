// node --test  ·  pure (zero-dep). Run: node --test scratchpad-research/staged/v1.19/drainage-slope.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDrainageSlope } from './drainage-slope.mjs';

// Flat-runs-then-drop route (what the orthogonal router emits): three runs at Y=2, one drop at the end.
const flatThenDrop = [[0, 2, 0], [3, 2, 0], [3, 2, 1], [6, 2, 1], [6, 0.2, 1]];

test('every horizontal run descends >= minGrade after transform', () => {
  const r = applyDrainageSlope(flatThenDrop, { axis: 'y', minGrade: 0.02 });
  assert.equal(r.ok, true);
  assert.ok(r.perRunGrade.length === 3, 'three horizontal runs');
  for (const g of r.perRunGrade) assert.ok(g >= 0.02 - 1e-12, `per-run grade ${g} >= 0.02`);
});

test('net drop unchanged and endpoints preserved', () => {
  const r = applyDrainageSlope(flatThenDrop, { axis: 'y', minGrade: 0.02 });
  assert.ok(Math.abs(r.netDrop - 1.8) < 1e-9);
  assert.deepEqual(r.waypoints[0], [0, 2, 0]);
  assert.ok(Math.abs(r.waypoints[r.waypoints.length - 1][1] - 0.2) < 1e-12); // exact end Y
  // X/Z path preserved exactly (only the fall axis is re-profiled)
  for (let i = 0; i < flatThenDrop.length; i++) {
    assert.equal(r.waypoints[i][0], flatThenDrop[i][0]);
    assert.equal(r.waypoints[i][2], flatThenDrop[i][2]);
  }
});

test('monotonic descent preserved (no uphill on the fall axis)', () => {
  const r = applyDrainageSlope(flatThenDrop, { axis: 'y', minGrade: 0.02 });
  for (let i = 1; i < r.waypoints.length; i++) assert.ok(r.waypoints[i][1] <= r.waypoints[i - 1][1] + 1e-12);
});

test('input is not mutated (REPORTS a new array)', () => {
  const snapshot = JSON.stringify(flatThenDrop);
  applyDrainageSlope(flatThenDrop, { axis: 'y', minGrade: 0.02 });
  assert.equal(JSON.stringify(flatThenDrop), snapshot);
});

test('infeasible: not enough drop to give every run minGrade -> ok:false', () => {
  const tiny = [[0, 0.5, 0], [10, 0.5, 0], [10, 0.45, 0]]; // netDrop 0.05 < 0.02*10 = 0.2
  const r = applyDrainageSlope(tiny, { axis: 'y', minGrade: 0.02 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'insufficient-drop');
  assert.ok(r.needed > r.available);
  assert.deepEqual(r.waypoints, tiny); // input echoed back unchanged
});

test('descending "+" (fall axis increases downhill) works symmetrically', () => {
  const up = [[0, 0, 0], [3, 0, 0], [3, 0, 1], [3, 2, 1]]; // ends higher on Y; downhill = +y
  const r = applyDrainageSlope(up, { axis: 'y', minGrade: 0.02, descending: '+' });
  assert.equal(r.ok, true);
  for (const g of r.perRunGrade) assert.ok(g >= 0.02 - 1e-12);
  for (let i = 1; i < r.waypoints.length; i++) assert.ok(r.waypoints[i][1] >= r.waypoints[i - 1][1] - 1e-12); // monotone up
});
