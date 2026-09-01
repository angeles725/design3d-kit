// Pure-Node test for parts/electrical-box.mjs — imports only the pure core (no three).
// Run: node --test library/parts/electrical-box.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boxDimsValid, lidBolts, cableGlands, terminalScrews, flexRibParams } from './electrical-box.mjs';

const EPS = 1e-9;
const finite = (arr) => arr.every((n) => Number.isFinite(n));
const flat = (objs) => objs.flatMap((o) => o.position);

test('boxDimsValid', () => {
  assert.ok(boxDimsValid({ w: 0.11, h: 0.16, d: 0.10 }));
  assert.ok(!boxDimsValid({ w: 0, h: 0.16, d: 0.10 }));
  assert.ok(!boxDimsValid({ w: 0.11, h: -1, d: 0.10 }));
});

test('lidBolts: 4 corners, symmetric in y and z, no-NaN', () => {
  const bolts = lidBolts({ height: 0.16, depth: 0.10, lidX: 0.07, inset: 0.02 });
  assert.equal(bolts.length, 4);
  assert.ok(finite(flat(bolts)));
  const ys = bolts.map((b) => b.position[1]), zs = bolts.map((b) => b.position[2]);
  assert.ok(Math.abs(Math.max(...ys) + Math.min(...ys)) < EPS, 'y symmetric');
  assert.ok(Math.abs(Math.max(...zs) + Math.min(...zs)) < EPS, 'z symmetric');
  assert.ok(bolts.every((b) => Math.abs(b.position[0] - 0.07) < EPS), 'all on the lid plane');
  assert.throws(() => lidBolts({ height: 0, depth: 0.1, lidX: 0.07 }));
});

test('cableGlands: count, even spacing, symmetric about centre, no-NaN', () => {
  const glands = cableGlands({ count: 3, y: -0.088, spacing: 0.03, axis: 'z' });
  assert.equal(glands.length, 3);
  assert.ok(finite(flat(glands)));
  const zs = glands.map((g) => g.position[2]);
  assert.ok(Math.abs(zs[0] + zs[2]) < EPS, 'symmetric about centre');
  assert.ok(Math.abs(zs[1]) < EPS, 'middle centred');
  assert.ok(glands.every((g) => Math.abs(g.position[1] + 0.088) < EPS), 'y carried');
  assert.deepEqual(cableGlands({ count: 0, y: 0, spacing: 0.03 }), []);
});

test('terminalScrews: count, spacing along axis, no-NaN', () => {
  const s = terminalScrews({ count: 6, start: [0, 0.09, 0.02], spacing: 0.008, axis: 'x' });
  assert.equal(s.length, 6);
  assert.ok(finite(flat(s)));
  for (let i = 0; i < 6; i++) assert.ok(Math.abs(s[i].position[0] - i * 0.008) < EPS, `spacing at ${i}`);
  assert.throws(() => terminalScrews({ count: 3, start: [0, 0], spacing: 0.008 }));
});

test('flexRibParams: count, endpoints inclusive [0,1], ascending', () => {
  const ts = flexRibParams({ count: 46 });
  assert.equal(ts.length, 46);
  assert.ok(finite(ts));
  assert.equal(ts[0], 0);
  assert.equal(ts[ts.length - 1], 1);
  for (let i = 1; i < ts.length; i++) assert.ok(ts[i] > ts[i - 1], 'ascending');
  assert.deepEqual(flexRibParams({ count: 1 }), [0.5]);
  assert.throws(() => flexRibParams({ count: 0 }));
});

// three-integration: real build (skips if three unresolvable in bare CI)
test('makeElectricalBox builds a Group with instanced bolts/screws/ribs', async () => {
  let THREE; try { THREE = await import('three'); } catch { return; }
  const { makeElectricalBox } = await import('./electrical-box.mjs');
  const mat = () => new THREE.MeshStandardMaterial();
  const materials = { body: mat(), lid: mat(), bolt: mat(), label: mat(), lever: mat(), conduit: mat(), rubber: mat(), rib: mat() };
  const g = await makeElectricalBox({ box: { w: 0.11, h: 0.16, d: 0.10 }, glandCount: 3, terminalCount: 6, materials });
  const instanced = g.children.filter((c) => c.isInstancedMesh);
  assert.ok(instanced.length >= 3, 'lid bolts + terminal screws + flex ribs instanced');
  assert.ok(g.children.some((c) => c.isMesh && c.geometry.type === 'BoxGeometry'), 'box body present');
  await assert.rejects(() => makeElectricalBox({ materials: { body: mat() } }));
});
