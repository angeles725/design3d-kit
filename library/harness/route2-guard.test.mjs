import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route2Guard, applyRoute2Scale } from './route2-guard.mjs';

const cvScene = (extra = {}) => ({
  provenance: { route: 2, source: 'cv' },
  objects: [{ id: 'CH?', size: [120, 48, 72] }], // pixel-space lengths
  geometry: [],
  ...extra,
});

test('a Route-2 scene with lengths but NO recalibration is refused (scale UNKNOWN)', () => {
  const r = route2Guard(cvScene());
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.reason === 'no-recalibration'));
  assert.equal(r.scale, null);
});

test('with ONE known dimension, scale is derived but stays [INFER] (never measured)', () => {
  const r = route2Guard(cvScene(), { recalibration: { ref: 'door', realLength: 0.9, pixelLength: 45 } });
  assert.equal(r.ok, true);
  assert.equal(r.scale.certainty, 'INFER');
  assert.ok(Math.abs(r.scale.value - 0.02) < 1e-9); // 0.9 m / 45 px
});

test('a scene claiming a MEASURED scale is rejected (CV can only be [INFER])', () => {
  const r = route2Guard(cvScene({ scale: { value: 0.02, certainty: 'CERT' } }),
    { recalibration: { realLength: 0.9, pixelLength: 45 } });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.reason === 'measured-scale-forbidden'));
});

test('a NON-Route-2 scene is the wrong guard (error not-route-2)', () => {
  const r = route2Guard({ provenance: { route: 1, source: 'dxf' }, objects: [{ id: 'A', size: [3, 1, 1] }] });
  assert.ok(r.errors.some(e => e.reason === 'not-route-2'));
});

test('an insufficient raster (embedded thumbnail ~256×115) is rejected', () => {
  const r = route2Guard(cvScene({ raster: { width: 256, height: 115 } }),
    { recalibration: { realLength: 0.9, pixelLength: 45 } });
  assert.ok(r.errors.some(e => e.reason === 'insufficient-raster'));
  // a full-resolution raster passes the raster check
  const ok = route2Guard(cvScene({ raster: { width: 2048, height: 1536 } }),
    { recalibration: { realLength: 0.9, pixelLength: 45 } });
  assert.ok(!ok.errors.some(e => e.reason === 'insufficient-raster'));
});

test('a CV object claiming certainty other than INFER warns', () => {
  const r = route2Guard(cvScene({ objects: [{ id: 'X', size: [1, 1, 1], certainty: 'CERT' }] }),
    { recalibration: { realLength: 0.9, pixelLength: 45 } });
  assert.ok(r.warnings.some(w => w.reason === 'cv-field-not-infer'));
});

test('applyRoute2Scale scales every length and tags the scene [INFER]', () => {
  const r = route2Guard(cvScene(), { recalibration: { realLength: 0.9, pixelLength: 45 } }); // scale 0.02
  const scaled = applyRoute2Scale(cvScene(), r.scale);
  assert.deepEqual(scaled.objects[0].size.map(v => +v.toFixed(3)), [2.4, 0.96, 1.44]); // 120*0.02 etc.
  assert.equal(scaled.objects[0].certainty, 'INFER');
  assert.equal(scaled.provenance.certainty, 'INFER');
});

test('applyRoute2Scale refuses a non-INFER scale', () => {
  assert.throws(() => applyRoute2Scale(cvScene(), { value: 0.02, certainty: 'CERT' }), /INFER/);
});
