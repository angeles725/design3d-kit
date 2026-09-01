// Pure-Node test for parts/fan-assembly.mjs — imports only the pure core (no three).
// Run: node --test library/parts/fan-assembly.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bladeAngles, bladeProfile2D, bladeAnchors, polygonSignedArea,
  guardRingRadii, guardSpokeAngles, strutAngles, boltCircle,
} from './fan-assembly.mjs';

const EPS = 1e-9;
const finite = (arr) => arr.every((n) => Number.isFinite(n));

test('bladeAngles: count, evenly spaced, in [0,2π), no-NaN', () => {
  const a = bladeAngles(5);
  assert.equal(a.length, 5);
  assert.ok(finite(a));
  assert.equal(a[0], 0);
  for (let i = 0; i < 5; i++) assert.ok(Math.abs(a[i] - (i / 5) * 2 * Math.PI) < EPS);
  assert.ok(a.every((x) => x >= 0 && x < 2 * Math.PI));
  assert.throws(() => bladeAngles(1));
});

test('blade profile: non-degenerate closed polygon with consistent winding', () => {
  const { start, quads } = bladeProfile2D();
  assert.equal(quads.length, 4);
  assert.ok(finite(start));
  assert.ok(finite(quads.flatMap((q) => [...q.c, ...q.p])));
  const anchors = bladeAnchors();
  assert.equal(anchors.length, 5, 'start + 4 segment ends');
  const area = polygonSignedArea(anchors);
  assert.ok(Math.abs(area) > 1e-4, 'blade has real area (not collapsed)');
  // winding sign is deterministic — record it so a future edit that flips it is caught
  assert.ok(area > 0, 'blade anchor polygon is CCW (area > 0)');
});

test('polygonSignedArea: unit square = 1 (CCW)', () => {
  const sq = [[0, 0], [1, 0], [1, 1], [0, 1]];
  assert.ok(Math.abs(polygonSignedArea(sq) - 1) < EPS);
  // reversed winding flips the sign
  assert.ok(Math.abs(polygonSignedArea([...sq].reverse()) + 1) < EPS);
});

test('guardRingRadii: count, ascending, last = radius+rim', () => {
  const R = 0.15;
  const radii = guardRingRadii({ radius: R, ringCount: 5 });
  assert.equal(radii.length, 5);
  assert.ok(finite(radii));
  for (let i = 1; i < radii.length; i++) assert.ok(radii[i] > radii[i - 1], `ascending at ${i}`);
  assert.ok(Math.abs(radii[radii.length - 1] - (R + R * 0.2)) < EPS, 'last is the rim ring');
  assert.throws(() => guardRingRadii({ radius: R, ringCount: 1 }));
  assert.throws(() => guardRingRadii({ radius: 0, ringCount: 5 }));
});

test('guardSpokeAngles / strutAngles: count, span [0,π), no-NaN', () => {
  const s = guardSpokeAngles(10);
  assert.equal(s.length, 10);
  assert.ok(finite(s));
  assert.ok(s.every((a) => a >= 0 && a < Math.PI));
  const st = strutAngles(3);
  assert.equal(st.length, 3);
  assert.deepEqual(st, [0, Math.PI / 3, 2 * Math.PI / 3]);
  assert.throws(() => guardSpokeAngles(0));
});

test('boltCircle: count, symmetric about centre (sum ≈ 0), on the circle', () => {
  const bolts = boltCircle(6, 0.04, -0.002);
  assert.equal(bolts.length, 6);
  let sx = 0, sy = 0;
  for (const b of bolts) {
    assert.ok(finite(b.position));
    assert.ok(Math.abs(Math.hypot(b.position[0], b.position[1]) - 0.04) < EPS, 'on the radius');
    assert.equal(b.position[2], -0.002, 'z depth carried');
    sx += b.position[0]; sy += b.position[1];
  }
  assert.ok(Math.abs(sx) < EPS && Math.abs(sy) < EPS, 'symmetric bolt circle sums to centre');
  assert.throws(() => boltCircle(0, 0.04));
  assert.throws(() => boltCircle(6, 0));
});

// three-integration: real build (skips if three unresolvable in bare CI)
test('makeFanAssembly builds a Group with a spin rotor + injected materials', async () => {
  let THREE; try { THREE = await import('three'); } catch { return; }
  const { makeFanAssembly } = await import('./fan-assembly.mjs');
  const mat = () => new THREE.MeshStandardMaterial();
  const g = await makeFanAssembly({
    radius: 0.15, bladeCount: 5, guardRings: 5, guardSpokes: 10, strutCount: 3, bossBoltCount: 6,
    materials: { blade: mat(), bladeTip: mat(), hub: mat(), bell: mat(), guard: mat(), motor: mat() },
  });
  assert.ok(g.userData.spin, 'rotor sub-group exposed for animation');
  // rotor holds hub + nose cap + 5 blade arms
  assert.equal(g.userData.spin.children.filter((c) => c.isGroup).length, 5, '5 blade arms');
  // missing materials must throw
  await assert.rejects(() => makeFanAssembly({ radius: 0.15, materials: { blade: mat() } }));
});
