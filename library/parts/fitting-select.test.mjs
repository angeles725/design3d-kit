import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fittingForBend, fittingsForRoute } from './fitting-select.mjs';

const bend = (inDir, outDir, turnAngle) => ({ position: [1, 2, 3], inDir, outDir, turnAngle });

test('90° orthogonal bend → elbow90 with correct plane normal', () => {
  const f = fittingForBend(bend([1, 0, 0], [0, 1, 0], 90));
  assert.equal(f.type, 'elbow90');
  // cross([1,0,0],[0,1,0]) = [0,0,1]
  assert.deepEqual(f.plane, [0, 0, 1]);
  assert.deepEqual(f.position, [1, 2, 3]);
});

test('45° bend → elbow45', () => {
  assert.equal(fittingForBend(bend([1, 0, 0], norm([1, 1, 0]), 45)).type, 'elbow45');
});

test('straight (0°) → none', () => {
  assert.equal(fittingForBend(bend([1, 0, 0], [1, 0, 0], 0)).type, 'none');
});

test('reversal (180°) → uturn', () => {
  assert.equal(fittingForBend(bend([1, 0, 0], [-1, 0, 0], 180)).type, 'uturn');
});

test('arbitrary angle → elbowN', () => {
  assert.equal(fittingForBend(bend([1, 0, 0], norm([1, 0, 1]), 30)).type, 'elbowN');
});

test('fittingsForRoute preserves index alignment with bends[]', () => {
  const bends = [bend([1, 0, 0], [0, 1, 0], 90), bend([0, 1, 0], [0, 1, 0], 0)];
  const out = fittingsForRoute(bends);
  assert.equal(out.length, 2);
  assert.equal(out[0].type, 'elbow90');
  assert.equal(out[1].type, 'none');
});

test('deterministic', () => {
  const b = bend([1, 0, 0], [0, 1, 0], 90);
  assert.equal(JSON.stringify(fittingForBend(b)), JSON.stringify(fittingForBend(b)));
});

function norm(v) { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; }
