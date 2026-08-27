import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewVariance } from './view-variance.mjs';

test('uniform scores → std 0, adjusted == mean, no flag', () => {
  const r = viewVariance([8, 8, 8, 8]);
  assert.equal(r.mean, 8);
  assert.equal(r.std, 0);
  assert.equal(r.adjusted, 8);
  assert.equal(r.highVariance, false);
});

test('one bad view → high variance flagged + worstView index + adjusted below mean', () => {
  // reads great from 3 sides, missing from the 4th
  const r = viewVariance([9, 9, 9, 3]);
  assert.equal(r.worstView, 3);
  assert.equal(r.min, 3);
  assert.ok(r.range === 6);
  assert.ok(r.std > 1.0);
  assert.equal(r.highVariance, true);
  assert.ok(r.adjusted < r.mean, 'pessimistic score penalizes variance');
});

test('lambda scales the penalty', () => {
  const scores = [9, 9, 9, 5];
  const a = viewVariance(scores, { lambda: 0 }).adjusted;   // = mean
  const b = viewVariance(scores, { lambda: 1 }).adjusted;   // mean - std
  assert.ok(Math.abs(a - viewVariance(scores).mean) < 1e-12);
  assert.ok(b < a, 'higher lambda penalizes more');
});

test('varianceFlag threshold configurable', () => {
  const scores = [8, 8.5, 7.5, 8]; // small spread
  assert.equal(viewVariance(scores, { varianceFlag: 1.0 }).highVariance, false);
  assert.equal(viewVariance(scores, { varianceFlag: 0.1 }).highVariance, true);
});

test('empty input safe', () => {
  const r = viewVariance([]);
  assert.equal(r.n, 0);
  assert.equal(r.worstView, -1);
});

test('deterministic', () => {
  const s = [9, 7, 8, 6];
  assert.equal(JSON.stringify(viewVariance(s)), JSON.stringify(viewVariance(s)));
});
