// node --test — pure-core validation of geom-metrics.mjs (no three needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { surfaceArea, centroid, volumeMetrics } from './geom-metrics.mjs';

// Unit cube [0,1]^3, consistently wound (12 tris). Known answers: area=6, |vol|=1, centroid=(.5,.5,.5).
const CUBE_POS = [
  0,0,0, 1,0,0, 1,1,0, 0,1,0, // 0-3 bottom z=0
  0,0,1, 1,0,1, 1,1,1, 0,1,1, // 4-7 top z=1
];
// Outward CCW winding for a right-handed frame.
const CUBE_IDX = [
  0,2,1, 0,3,2, // bottom (-z)
  4,5,6, 4,6,7, // top (+z)
  0,1,5, 0,5,4, // front (-y)
  1,2,6, 1,6,5, // right (+x)
  2,3,7, 2,7,6, // back (+y)
  3,0,4, 3,4,7, // left (-x)
];

// Tetra (O, X, Y, Z) — volume 1/6, used for the winding-sign discriminator.
const TET_POS = [0,0,0, 1,0,0, 0,1,0, 0,0,1];
const TET_IDX = [0,1,2, 0,2,3, 0,3,1, 1,3,2];

test('surfaceArea: unit cube = 6', () => {
  assert.ok(Math.abs(surfaceArea(CUBE_POS, CUBE_IDX) - 6) < 1e-9);
});

test('volumeMetrics: unit cube |vol|=1, centroid at center', () => {
  const m = volumeMetrics(CUBE_POS, CUBE_IDX);
  assert.ok(Math.abs(m.volume - 1) < 1e-9, `vol ${m.volume}`);
  assert.ok(Math.abs(m.centroid.x - 0.5) < 1e-9 && Math.abs(m.centroid.y - 0.5) < 1e-9 && Math.abs(m.centroid.z - 0.5) < 1e-9);
  assert.equal(m.centroid.degenerate, false);
});

test('winding discriminator: reversing every triangle negates signed volume', () => {
  const fwd = volumeMetrics(TET_POS, TET_IDX).signedVolume;
  const revIdx = [];
  for (let i = 0; i < TET_IDX.length; i += 3) revIdx.push(TET_IDX[i], TET_IDX[i + 2], TET_IDX[i + 1]);
  const rev = volumeMetrics(TET_POS, revIdx).signedVolume;
  assert.ok(Math.abs(Math.abs(fwd) - 1 / 6) < 1e-12, `|vol| ${Math.abs(fwd)}`);
  assert.ok(Math.abs(fwd + rev) < 1e-12, 'reversed volume must be the negation');
  // exactly one orientation flags invertedWinding
  assert.notEqual(volumeMetrics(TET_POS, TET_IDX).invertedWinding, volumeMetrics(TET_POS, revIdx).invertedWinding);
});

test('volumeMetrics: expectedVolume gate', () => {
  assert.equal(volumeMetrics(CUBE_POS, CUBE_IDX, { expectedVolume: 1, volumeTol: 1e-6 }).volumeOk, true);
  assert.equal(volumeMetrics(CUBE_POS, CUBE_IDX, { expectedVolume: 2, volumeTol: 1e-6 }).volumeOk, false);
  assert.equal(volumeMetrics(CUBE_POS, CUBE_IDX).volumeOk, null); // no expectation → null
});

test('centroid: open mesh (single triangle) falls back to vertex mean, flagged degenerate', () => {
  const c = centroid([0,0,0, 3,0,0, 0,3,0], [0,1,2]);
  assert.equal(c.degenerate, true);
  assert.ok(Math.abs(c.x - 1) < 1e-9 && Math.abs(c.y - 1) < 1e-9 && Math.abs(c.z - 0) < 1e-9);
});

test('determinism: identical inputs → identical outputs', () => {
  const a = JSON.stringify(volumeMetrics(CUBE_POS, CUBE_IDX));
  const b = JSON.stringify(volumeMetrics(CUBE_POS, CUBE_IDX));
  assert.equal(a, b);
});
