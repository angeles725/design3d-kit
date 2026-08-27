import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hudClearRegion, calibratedFit } from './framing-compose.mjs';

const VP = { width: 1600, height: 900 };

test('no HUD → full viewport, centre at NDC (0,0)', () => {
  const r = hudClearRegion(VP, null);
  assert.equal(r.cx, 800); assert.equal(r.cy, 450);
  assert.ok(Math.abs(r.ndc.cx) < 1e-9 && Math.abs(r.ndc.cy) < 1e-9);
  assert.equal(r.areaFrac, 1);
});

test('TOP HUD band → clear region is BELOW it, composition centre drops (ndc.cy < 0)', () => {
  const r = hudClearRegion(VP, { left: 0, right: 1600, top: 0, bottom: 200 });
  assert.equal(r.top, 200); assert.equal(r.bottom, 900);
  assert.ok(r.cy > 450, 'centre is in the lower half');
  assert.ok(r.ndc.cy < 0, 'aim below viewport centre so the subject clears the top HUD');
});

test('RIGHT HUD panel → clear region is to the LEFT, ndc.cx < 0', () => {
  const r = hudClearRegion(VP, { left: 1200, right: 1600, top: 0, bottom: 900 });
  assert.equal(r.left, 0); assert.equal(r.right, 1200);
  assert.ok(r.ndc.cx < 0);
  assert.ok(Math.abs(r.areaFrac - (1200 * 900) / (1600 * 900)) < 1e-9);
});

test('gain==1 subject → converges to target immediately', () => {
  const r = calibratedFit((x) => x, 0.3, { x0: 0, x1: 0.1, tol: 1e-6 });
  assert.ok(r.converged);
  assert.ok(Math.abs(r.measured - 0.3) <= 1e-6);
});

test('THE FIX: perspective gain < 1 — a one-pass offset MISSES, the calibrated loop hits the MEASURED target', () => {
  // Real render responds with gain 0.6 and a root at param=2: measured(x) = 0.6*(x - 2). A naive one-pass
  // "move by (target - measured0)" assumes gain 1 and lands short; the calibrated loop measures the real gain
  // and converges on the RENDERED centre.
  const measure = (x) => 0.6 * (x - 2);
  const target = 0;
  // one-pass (gain-1 assumption) from x0=0: m0 = -1.2, step = target - m0 = 1.2 -> x=1.2 -> measured -0.48 (MISS)
  assert.ok(Math.abs(measure(0 + (target - measure(0))) - target) > 0.01, 'one-pass offset must miss under gain<1');
  const r = calibratedFit(measure, target, { x0: 0, x1: 0.5, tol: 1e-4 });
  assert.ok(r.converged, 'calibrated loop converges on the measured centre');
  assert.ok(Math.abs(r.measured - target) <= 1e-4);
  assert.ok(Math.abs(r.param - 2) < 1e-3, 'finds the true param (~2)');
  assert.ok(Math.abs(r.gain - 0.6) < 1e-6, 'recovers the real perspective gain');
});

test('non-responsive subject (constant measurement) → bails, converged:false, gain~0 reason', () => {
  const r = calibratedFit(() => 0.4, 0, { x0: 0, x1: 0.1 });
  assert.equal(r.converged, false);
  assert.match(r.reason, /non-responsive|gain/);
});

test('already on target at x0 → 0 iterations, no wasted render', () => {
  const r = calibratedFit((x) => x, 0.0, { x0: 0, tol: 1e-3 });
  assert.equal(r.converged, true);
  assert.equal(r.iterations, 0);
  assert.equal(r.samples.length, 1);
});

test('clampStep caps a single step so a bad gain estimate cannot fling the camera', () => {
  // tiny gain would produce a huge secant step; clampStep bounds it.
  const measure = (x) => 0.001 * x;
  const r = calibratedFit(measure, 5, { x0: 0, x1: 1, clampStep: 10, maxIter: 3 });
  for (let i = 1; i < r.samples.length; i++) {
    assert.ok(Math.abs(r.samples[i].param - r.samples[i - 1].param) <= 10 + 1e-9);
  }
});

test('records every sample (param, measured) for auditability', () => {
  const r = calibratedFit((x) => 0.8 * x, 0.4, { x0: 0, x1: 0.2 });
  assert.ok(r.samples.length >= 2);
  for (const s of r.samples) { assert.ok('param' in s && 'measured' in s); }
});

test('deterministic', () => {
  const f = () => calibratedFit((x) => 0.7 * (x - 1), 0, { x0: 0, x1: 0.3 });
  assert.equal(JSON.stringify(f()), JSON.stringify(f()));
});
