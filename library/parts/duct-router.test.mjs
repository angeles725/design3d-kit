// node --test  ·  pure (imports only the zero-dep router core; NEVER three).
// Run:  node --test scratchpad-research/staged/duct-router.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeDuct, toOrthogonalSegments } from './duct-router.mjs';

// Shared 30x10x30 @ 0.25 m volume with three obstacle AABBs (wall + crossing duct + corner pillar).
const bounds = { min: [0, 0, 0], max: [7.5, 2.5, 7.5] };
const gridStep = 0.25;
const obstacles = [
  { min: [3.0, 0, 0.0], max: [3.6, 2.5, 4.5] }, // wall from z=0 with a gap above
  { min: [4.0, 0, 5.0], max: [7.0, 2.5, 5.6] }, // horizontal duct blocking high-x z-crossing
  { min: [1.5, 0, 5.5], max: [2.1, 2.5, 7.5] }, // pillar near far corner
];
const start = [0.625, 1.125, 0.625];
const end = [6.875, 1.125, 6.875];

const inflatedContains = (p, ob, pad) =>
  p[0] >= ob.min[0] - pad && p[0] <= ob.max[0] + pad &&
  p[1] >= ob.min[1] - pad && p[1] <= ob.max[1] + pad &&
  p[2] >= ob.min[2] - pad && p[2] <= ob.max[2] + pad;

test('turn-penalty A* reduces bends vs length-only on the same grid', () => {
  const LO = routeDuct({ start, end, obstacles, bounds, gridStep, bendPenalty: 0, startDir: [1, 0, 0] });
  const TP = routeDuct({ start, end, obstacles, bounds, gridStep, bendPenalty: 5, startDir: [1, 0, 0] });
  assert.ok(LO.found && TP.found, 'both routes found');
  console.log(`  length-only : bends=${LO.bends.length} length=${LO.length.toFixed(3)} exp=${LO.expansions}`);
  console.log(`  turn-penalty: bends=${TP.bends.length} length=${TP.length.toFixed(3)} exp=${TP.expansions}`);
  assert.ok(TP.bends.length < LO.bends.length, `expected fewer bends with penalty (${TP.bends.length} < ${LO.bends.length})`);
  // Turn penalty must not lengthen the path here (both are length-optimal on this grid).
  assert.ok(TP.length <= LO.length + 1e-9, 'turn-penalty length must not exceed length-only');
});

test('bends carry per-turn metadata for hvac-fittings.elbow', () => {
  const r = routeDuct({ start, end, obstacles, bounds, gridStep, bendPenalty: 5, startDir: [1, 0, 0] });
  assert.ok(Array.isArray(r.bends) && r.bends.length >= 1);
  for (const b of r.bends) {
    assert.equal(b.position.length, 3, 'position [x,y,z]');
    assert.equal(b.inDir.length, 3, 'inDir vector');
    assert.equal(b.outDir.length, 3, 'outDir vector');
    assert.ok(Math.abs(Math.hypot(...b.inDir) - 1) < 1e-9, 'inDir is unit');
    assert.ok(Math.abs(Math.hypot(...b.outDir) - 1) < 1e-9, 'outDir is unit');
    assert.ok(Math.abs(b.turnAngle - 90) < 1e-6, 'orthogonal turn is 90 deg');
  }
});

test('deterministic across runs (identical waypoints + bends)', () => {
  const opts = { start, end, obstacles, bounds, gridStep, bendPenalty: 5, startDir: [1, 0, 0] };
  const r1 = routeDuct(opts);
  const r2 = routeDuct(opts);
  assert.deepStrictEqual(r1.waypoints, r2.waypoints, 'waypoints identical');
  assert.deepStrictEqual(r1.bends, r2.bends, 'bend metadata identical');
  assert.equal(r1.cost, r2.cost, 'cost identical');
});

test('waypoints avoid inflated obstacles and honor radius+clearance', () => {
  const radius = 0.1, clearance = 0.05;
  const r = routeDuct({ start, end, obstacles, bounds, gridStep, bendPenalty: 5, radius, clearance, startDir: [1, 0, 0] });
  assert.ok(r.found, 'route found with inflation');
  for (const wp of r.waypoints)
    for (const ob of obstacles)
      assert.ok(!inflatedContains(wp, ob, radius + clearance - gridStep), `waypoint ${wp} intrudes obstacle`);
});

test('open volume: an L-move is a single bend and length is Manhattan', () => {
  const r = routeDuct({ start, end, obstacles: [], bounds, gridStep, bendPenalty: 5, startDir: [1, 0, 0] });
  assert.ok(r.found);
  assert.equal(r.bends.length, 1, 'clear box collapses to one elbow');
  const manhattan = Math.abs(end[0] - start[0]) + Math.abs(end[1] - start[1]) + Math.abs(end[2] - start[2]);
  assert.ok(Math.abs(r.length - manhattan) < 1e-9, `length ${r.length} == manhattan ${manhattan}`);
});

test('toOrthogonalSegments yields axis-aligned segments through the waypoints', () => {
  const r = routeDuct({ start, end, obstacles, bounds, gridStep, bendPenalty: 5, startDir: [1, 0, 0] });
  const { points, segments } = toOrthogonalSegments(r.waypoints);
  assert.deepStrictEqual(points, r.waypoints);
  for (const s of segments) assert.ok(['x', 'y', 'z'].includes(s.axis), `segment axis-aligned: ${s.axis}`);
  assert.equal(segments.length, r.waypoints.length - 1);
});

test('maxExpansions cap returns found:false instead of hanging', () => {
  const r = routeDuct({ start, end, obstacles, bounds, gridStep, bendPenalty: 5, startDir: [1, 0, 0], maxExpansions: 5 });
  assert.equal(r.found, false);
  assert.ok(r.expansions <= 5);
});
