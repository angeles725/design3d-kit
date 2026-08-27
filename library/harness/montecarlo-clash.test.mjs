import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, gaussian, monteCarloClash } from './montecarlo-clash.mjs';

test('mulberry32 deterministic + in [0,1)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 100; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
});

test('gaussian ~ standard normal (mean≈0, std≈1 over many draws)', () => {
  const rng = mulberry32(7);
  let sum = 0, sq = 0; const N = 20000;
  for (let i = 0; i < N; i++) { const g = gaussian(rng); sum += g; sq += g * g; }
  const mean = sum / N, std = Math.sqrt(sq / N - mean * mean);
  assert.ok(Math.abs(mean) < 0.05, `mean ${mean}`);
  assert.ok(Math.abs(std - 1) < 0.05, `std ${std}`);
});

test('P(clash) ≈ expected frequency for a known 1-D threshold', () => {
  // one part, 1σ=1 on x; "clash" iff x-offset pushes past a +2mm nominal gap (i.e. offset.x > 2? no —
  // gap is 2 units, clash iff offset.x > 2). P(N(0,1) > 2) ≈ 0.02275.
  const r = monteCarloClash({
    parts: [{ id: 'A', sigma: [1, 0, 0] }],
    clashFn: (o) => o.A[0] > 2,
    samples: 40000, seed: 1,
  });
  assert.ok(Math.abs(r.pClash - 0.02275) < 0.005, `pClash ${r.pClash}`);
});

test('deterministic: same seed → identical pClash', () => {
  const cfg = { parts: [{ id: 'A', sigma: 1 }], clashFn: (o) => o.A[0] > 1.5, samples: 5000, seed: 99 };
  assert.equal(monteCarloClash(cfg).pClash, monteCarloClash(cfg).pClash);
});

test('opt-in hard-gate via pClashMax', () => {
  const base = { parts: [{ id: 'A', sigma: 1 }], clashFn: (o) => o.A[0] > 1, samples: 5000, seed: 3 };
  assert.equal(monteCarloClash({ ...base }).gate, null); // no threshold → advisory
  assert.equal(monteCarloClash({ ...base, pClashMax: 0.001 }).gate, 'FAIL'); // ~0.16 > 0.001
  assert.equal(monteCarloClash({ ...base, pClashMax: 0.9 }).gate, 'PASS');
});

test('nominal-clear-but-tolerance-risky is caught (the whole point)', () => {
  // nominal gap 3mm, 1σ=2mm; nominal never clashes (offset 0 → 0 < 3) but tails do.
  const r = monteCarloClash({
    parts: [{ id: 'A', sigma: [2, 0, 0] }],
    clashFn: (o) => o.A[0] > 3,
    samples: 40000, seed: 5,
  });
  assert.ok(r.pClash > 0.02 && r.pClash < 0.10, `pClash ${r.pClash}`); // P(N(0,2)>3)=P(Z>1.5)≈0.0668
});
