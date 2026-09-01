// Pure-Node test for parts/fastener-kit.mjs — imports only the pure core (no three).
// Run: node --test library/parts/fastener-kit.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexBoltDims, boltCircle, cornerBolts, rivetLine, gridPattern } from './fastener-kit.mjs';

const EPS = 1e-9;
const finite = (arr) => arr.every((n) => Number.isFinite(n));
const flat = (objs) => objs.flatMap((o) => o.position);

test('hexBoltDims', () => {
  assert.ok(hexBoltDims({ headRadius: 0.007, height: 0.006 }));
  assert.ok(!hexBoltDims({ headRadius: 0, height: 0.006 }));
  assert.ok(!hexBoltDims({ headRadius: 0.007, height: -1 }));
});

test('boltCircle: count, on-circle, symmetric sum, plane selection', () => {
  const b = boltCircle({ count: 6, radius: 0.04, center: [0, 0, -0.002], plane: 'xy' });
  assert.equal(b.length, 6);
  assert.ok(finite(flat(b)));
  let sx = 0, sy = 0;
  for (const p of b) {
    assert.ok(Math.abs(Math.hypot(p.position[0], p.position[1]) - 0.04) < EPS, 'on radius');
    assert.equal(p.position[2], -0.002);
    sx += p.position[0]; sy += p.position[1];
  }
  assert.ok(Math.abs(sx) < EPS && Math.abs(sy) < EPS, 'symmetric');
  // xz plane places the varying components on x and z, constant y
  const bz = boltCircle({ count: 4, radius: 0.05, plane: 'xz' });
  assert.ok(bz.every((p) => Math.abs(p.position[1]) < EPS), 'xz plane holds y=const');
  assert.throws(() => boltCircle({ count: 0, radius: 0.04 }));
  assert.throws(() => boltCircle({ count: 4, radius: 0, plane: 'xy' }));
  assert.throws(() => boltCircle({ count: 4, radius: 0.04, plane: 'zz' }));
});

test('cornerBolts: 4 corners inset, symmetric, plane', () => {
  const c = cornerBolts({ min: [-0.5, -0.4], max: [0.5, 0.4], depth: 0.01, inset: 0.03, plane: 'xy' });
  assert.equal(c.length, 4);
  assert.ok(finite(flat(c)));
  const xs = c.map((p) => p.position[0]), ys = c.map((p) => p.position[1]);
  assert.ok(Math.abs(Math.max(...xs) + Math.min(...xs)) < EPS, 'x symmetric');
  assert.ok(Math.abs(Math.max(...ys) + Math.min(...ys)) < EPS, 'y symmetric');
  assert.ok(Math.max(...xs) < 0.5 && Math.min(...xs) > -0.5, 'inset from edges');
  assert.ok(c.every((p) => Math.abs(p.position[2] - 0.01) < EPS), 'depth carried');
  assert.throws(() => cornerBolts({ min: [0], max: [1, 1], depth: 0 }));
});

test('rivetLine: count, endpoints inclusive, even spacing, midpoint on N=1', () => {
  const r = rivetLine({ a: [-0.5, 1, 0], b: [0.5, 1, 0], count: 22 });
  assert.equal(r.length, 22);
  assert.ok(finite(flat(r)));
  assert.deepEqual(r[0].position, [-0.5, 1, 0]);
  assert.deepEqual(r[21].position, [0.5, 1, 0]);
  // even spacing on x
  const dx = r[1].position[0] - r[0].position[0];
  for (let i = 1; i < r.length; i++) assert.ok(Math.abs((r[i].position[0] - r[i - 1].position[0]) - dx) < EPS, `even at ${i}`);
  assert.deepEqual(rivetLine({ a: [0, 0, 0], b: [2, 0, 0], count: 1 }), [{ position: [1, 0, 0] }]);
  assert.throws(() => rivetLine({ a: [0, 0, 0], b: [1, 0, 0], count: 0 }));
});

test('gridPattern: nx*nz count, spacing, no-NaN', () => {
  const g = gridPattern({ origin: [0, 0.5, 0], nx: 3, nz: 4, dx: 0.1, dz: 0.2 });
  assert.equal(g.length, 12);
  assert.ok(finite(flat(g)));
  assert.ok(g.every((p) => Math.abs(p.position[1] - 0.5) < EPS), 'fixed height');
  // last point at (2*dx, y, 3*dz)
  const last = g[g.length - 1].position;
  assert.ok(Math.abs(last[0] - 0.2) < EPS && Math.abs(last[1] - 0.5) < EPS && Math.abs(last[2] - 0.6) < EPS, 'last grid point');
  assert.throws(() => gridPattern({ origin: [0, 0, 0], nx: 0, nz: 4, dx: 0.1, dz: 0.2 }));
});

// three-integration: real build (skips if three unresolvable in bare CI)
test('instanceFasteners/makeHexBolts/makeRivets emit one InstancedMesh per set', async () => {
  let THREE; try { THREE = await import('three'); } catch { return; }
  const { makeHexBolts, makeRivets, instanceFasteners } = await import('./fastener-kit.mjs');
  const mat = new THREE.MeshStandardMaterial();
  const bolts = await makeHexBolts({ placements: boltCircle({ count: 6, radius: 0.04 }), material: mat });
  assert.ok(bolts.isInstancedMesh && bolts.count === 6);
  const rivets = await makeRivets({ placements: rivetLine({ a: [0, 0, 0], b: [1, 0, 0], count: 10 }), material: mat });
  assert.ok(rivets.isInstancedMesh && rivets.count === 10);
  // empty placements → null (nothing to draw)
  const none = await instanceFasteners({ geometry: new THREE.BoxGeometry(), material: mat, placements: [] });
  assert.equal(none, null);
});
