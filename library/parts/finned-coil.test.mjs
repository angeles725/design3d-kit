// Pure-Node test for parts/finned-coil.mjs — imports only the pure core (no three).
// Run: node --test library/parts/finned-coil.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finLayout, coilRowYs, serpentinePlan, tubeSheets } from './finned-coil.mjs';

const EPS = 1e-9;
const finite = (arr) => arr.every((n) => Number.isFinite(n));
const flat = (objs, key = 'position') => objs.flatMap((o) => o[key]);

test('finLayout: count, spacing, centred + symmetric about 0', () => {
  const { spacing, xs } = finLayout({ width: 1.16, finCount: 104 });
  assert.equal(xs.length, 104);
  assert.ok(Math.abs(spacing - 1.16 / 104) < EPS);
  assert.ok(finite(xs));
  // symmetric: xs[i] + xs[n-1-i] ≈ 0
  for (let i = 0; i < xs.length; i++) assert.ok(Math.abs(xs[i] + xs[xs.length - 1 - i]) < EPS, `symmetry at ${i}`);
  // within [-w/2, w/2]
  assert.ok(xs.every((x) => x > -0.58 && x < 0.58));
});

test('finLayout: monotonically increasing (no overlap)', () => {
  const { xs } = finLayout({ width: 1.0, finCount: 20 });
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1], `ascending at ${i}`);
});

test('finLayout: guards', () => {
  assert.throws(() => finLayout({ width: 0, finCount: 10 }));
  assert.throws(() => finLayout({ width: 1, finCount: 0 }));
  assert.throws(() => finLayout({ width: 1, finCount: 2.5 }));
});

test('coilRowYs: count, symmetry, span, single-row', () => {
  const ys = coilRowYs({ height: 0.32, rows: 5 });
  assert.equal(ys.length, 5);
  assert.ok(finite(ys));
  assert.ok(Math.abs(ys[0] + ys[4]) < EPS, 'symmetric ends');
  assert.ok(Math.abs(ys[2]) < EPS, 'middle at 0');
  assert.ok(Math.abs(ys[0] + 0.16) < EPS && Math.abs(ys[4] - 0.16) < EPS, 'spans ±height/2');
  assert.deepEqual(coilRowYs({ height: 0.3, rows: 1 }), [0]);
});

test('serpentinePlan: counts (tubes, U-bends, risers) + no-NaN', () => {
  const rows = 5;
  const plan = serpentinePlan({ width: 1.16, height: 0.32, depth: 0.085, rows, tubeRadius: 0.0085 });
  assert.equal(plan.tubes.length, rows * 2, '2 tube planes per row');
  assert.equal(plan.uBends.length, rows, 'one U-bend per row');
  assert.equal(plan.risers.length, rows - 1, 'riser between adjacent rows');
  assert.ok(finite(flat(plan.tubes)));
  assert.ok(finite(flat(plan.uBends)));
  assert.ok(finite(flat(plan.risers)));
  assert.ok(finite(plan.tubes.map((t) => t.length)));
});

test('serpentinePlan: U-bends alternate ends', () => {
  const plan = serpentinePlan({ width: 1.16, height: 0.32, depth: 0.085, rows: 4, tubeRadius: 0.0085 });
  const signs = plan.uBends.map((u) => u.endSign);
  assert.deepEqual(signs, [1, -1, 1, -1]);
  // each U-bend x is at ±(width/2 - tubeRadius)
  const endX = 1.16 / 2 - 0.0085;
  for (const u of plan.uBends) assert.ok(Math.abs(Math.abs(u.position[0]) - endX) < EPS);
});

test('serpentinePlan: two tube planes straddle depth centre symmetrically', () => {
  const plan = serpentinePlan({ width: 1, height: 0.3, depth: 0.08, rows: 3, tubeRadius: 0.008 });
  assert.ok(Math.abs(plan.zFront + plan.zBack) < EPS, 'front/back symmetric about 0');
  assert.ok(plan.zFront > 0 && plan.zBack < 0);
  assert.ok(plan.tubeLen < 1 && plan.tubeLen > 0);
});

test('serpentinePlan: guards', () => {
  assert.throws(() => serpentinePlan({ width: 0, height: 0.3, depth: 0.08, rows: 3, tubeRadius: 0.008 }));
  assert.throws(() => serpentinePlan({ width: 1, height: 0.3, depth: 0.08, rows: 3, tubeRadius: 0 }));
  assert.throws(() => serpentinePlan({ width: 1, height: 0.3, depth: 0.08, rows: 0, tubeRadius: 0.008 }));
});

test('tubeSheets: 2 plates symmetric about x=0 + no-NaN', () => {
  const sheets = tubeSheets({ width: 1.16, height: 0.4, depth: 0.085 });
  assert.equal(sheets.length, 2);
  assert.ok(Math.abs(sheets[0].position[0] + sheets[1].position[0]) < EPS, 'symmetric');
  assert.ok(finite(flat(sheets)));
  assert.ok(finite(flat(sheets, 'size')));
  assert.ok(sheets[0].size.every((s) => s > 0));
});

// three-integration: real build (skips if three unresolvable in bare CI)
test('makeFinnedCoil builds a Group with instanced fins/tubes/sheets', async () => {
  let THREE; try { THREE = await import('three'); } catch { return; }
  const { makeFinnedCoil } = await import('./finned-coil.mjs');
  const mat = () => new THREE.MeshStandardMaterial();
  const g = await makeFinnedCoil({
    width: 1.16, height: 0.4, depth: 0.085, finCount: 40, rows: 5, tubeRadius: 0.0085,
    materials: { fin: mat(), tube: mat(), endPlate: mat() },
  });
  const instanced = g.children.filter((c) => c.isInstancedMesh);
  assert.ok(instanced.length >= 4, 'fins + tubes + U-bends + risers instanced');
  const meshes = g.children.filter((c) => c.isMesh && !c.isInstancedMesh);
  assert.equal(meshes.length, 2, 'two tube sheets');
  assert.ok(g.userData.plan, 'plan carried on userData');
});
