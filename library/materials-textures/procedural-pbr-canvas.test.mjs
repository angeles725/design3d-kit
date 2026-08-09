// Pure-Node test for materials-textures/procedural-pbr-canvas.mjs — imports ONLY the pure noise
// core (no three, no DOM). Run: node library/materials-textures/procedural-pbr-canvas.test.mjs
// (exit 0 = all green)
import { hash2, valueNoise2, fbm2 } from './procedural-pbr-canvas.mjs';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('FAIL: ' + msg); } }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, want ~${b} ±${tol})`); }
function inRange01(v, msg) { ok(v >= 0 && v < 1.0000001, `${msg} in [0,1] (got ${v})`); }

// --- hash2 -------------------------------------------------------------------
ok(hash2(3, 7) === hash2(3, 7), 'hash2 deterministic');
ok(hash2(3, 7) >= 0 && hash2(3, 7) < 1, 'hash2 in [0,1)');
ok(hash2(3, 7) !== hash2(7, 3), 'hash2 order matters (well mixed)');
// distribution sanity: 100 hashes span the range
{
  let lo = 1, hi = 0;
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
    const h = hash2(i, j); if (h < lo) lo = h; if (h > hi) hi = h;
  }
  ok(lo < 0.2 && hi > 0.8, `hash2 spans the range (lo ${lo.toFixed(3)}, hi ${hi.toFixed(3)})`);
}

// --- valueNoise2 -------------------------------------------------------------
for (let i = 0; i < 6; i++) {
  const x = i * 1.37 + 0.4, y = i * 0.91 + 0.2;
  inRange01(valueNoise2(x, y), `valueNoise2(${x.toFixed(2)},${y.toFixed(2)})`);
}
// continuity: a tiny step in x changes the value only a little
for (let i = 0; i < 6; i++) {
  const x = i * 1.31 + 0.13, y = i * 0.77 + 0.05;
  const d = Math.abs(valueNoise2(x, y) - valueNoise2(x + 0.01, y));
  ok(d < 0.1, `valueNoise2 continuous at x=${x.toFixed(2)} (|Δ|=${d.toFixed(4)})`);
}
// at integer lattice points the fade is 0 → value equals the corner hash exactly
for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
  near(valueNoise2(i, j), hash2(i, j), 1e-9, `valueNoise2(${i},${j}) == hash2(${i},${j})`);
}

// --- fbm2 --------------------------------------------------------------------
ok(fbm2(1.5, 2.5) === fbm2(1.5, 2.5), 'fbm2 deterministic');
ok(typeof fbm2(0.3, 0.7) === 'number', 'fbm2 default opts callable');
for (let i = 0; i < 6; i++) {
  const x = i * 1.21 + 0.3, y = i * 0.83 + 0.6;
  inRange01(fbm2(x, y, { octaves: 4 }), `fbm2(${x.toFixed(2)},${y.toFixed(2)})`);
}
// octaves param changes the output at some sample
{
  let changed = false;
  for (let i = 0; i < 6 && !changed; i++) {
    const x = i * 1.11 + 0.37, y = i * 0.67 + 0.23;
    if (fbm2(x, y, { octaves: 1 }) !== fbm2(x, y, { octaves: 4 })) changed = true;
  }
  ok(changed, 'fbm2 octaves param changes the output');
}

console.log(`\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail > 0 ? 1 : 0);
