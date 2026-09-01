// Pure-Node test for parts/refrig-cluster.mjs — imports only the pure core (no three).
// Run: node --test library/parts/refrig-cluster.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineGauge, distributorFeeders, servicePorts, foamLagWraps } from './refrig-cluster.mjs';

const EPS = 1e-9;
const finite = (arr) => arr.every((n) => Number.isFinite(n));

test('lineGauge: positivity + suction>=liquid flag', () => {
  assert.deepEqual(lineGauge({ liquidDN: 0.02, suctionDN: 0.038 }), { valid: true, suctionLargerThanLiquid: true });
  assert.equal(lineGauge({ liquidDN: 0.04, suctionDN: 0.02 }).suctionLargerThanLiquid, false);
  assert.equal(lineGauge({ liquidDN: 0, suctionDN: 0.02 }).valid, false);
  assert.equal(lineGauge({ liquidDN: 0.02, suctionDN: -1 }).valid, false);
});

test('distributorFeeders: one 3-point triple per row, no-NaN, targets the row Y', () => {
  const rowYs = [-0.16, -0.08, 0, 0.08, 0.16];
  const feeders = distributorFeeders({ rowYs, origin: [0.5, 0.48, 0.02], coilFaceZ: -0.3, coilRightX: 0.56 });
  assert.equal(feeders.length, rowYs.length);
  for (let i = 0; i < feeders.length; i++) {
    const f = feeders[i];
    assert.equal(f.points.length, 3, '3 control points');
    assert.ok(finite(f.points.flat()));
    // final control point lands at the row's Y on the coil face
    assert.ok(Math.abs(f.points[2][1] - rowYs[i]) < EPS, `feeder ${i} ends at row Y`);
    assert.ok(Math.abs(f.points[2][0] - 0.56) < EPS, 'feeder ends at coil right edge');
  }
  assert.throws(() => distributorFeeders({ rowYs: [], origin: [0, 0, 0], coilFaceZ: 0, coilRightX: 0 }));
  assert.throws(() => distributorFeeders({ rowYs: [0], origin: [0, 0], coilFaceZ: 0, coilRightX: 0 }));
});

test('servicePorts: count, spacing along axis, cap offset, no-NaN', () => {
  const ports = servicePorts({ count: 3, start: [0.1, 0.4, 0.06], spacing: 0.03, axis: 'x' });
  assert.equal(ports.length, 3);
  for (let i = 0; i < ports.length; i++) {
    assert.ok(finite(ports[i].position));
    assert.ok(finite(ports[i].capPosition));
    assert.ok(Math.abs(ports[i].position[0] - (0.1 + i * 0.03)) < EPS, 'even spacing on x');
    assert.ok(ports[i].capPosition[0] > ports[i].position[0], 'cap sits outboard of the port');
  }
  assert.deepEqual(servicePorts({ count: 0, start: [0, 0, 0], spacing: 0.03 }), []);
  assert.throws(() => servicePorts({ count: 2, start: [0, 0, 0], spacing: 0.03, axis: 'q' }));
});

test('foamLagWraps: count, strictly interior + ascending', () => {
  const ts = foamLagWraps({ count: 5 });
  assert.equal(ts.length, 5);
  assert.ok(finite(ts));
  assert.ok(ts.every((t) => t > 0 && t < 1), 'all strictly in (0,1)');
  for (let i = 1; i < ts.length; i++) assert.ok(ts[i] > ts[i - 1], 'ascending');
  assert.throws(() => foamLagWraps({ count: 0 }));
});

// three-integration: real build (skips if three unresolvable in bare CI)
test('makeRefrigCluster builds a Group; missing materials throw', async () => {
  let THREE; try { THREE = await import('three'); } catch { return; }
  const { makeRefrigCluster } = await import('./refrig-cluster.mjs');
  const mat = () => new THREE.MeshStandardMaterial();
  const materials = { copper: mat(), copperDark: mat(), brass: mat(), foam: mat(), rubber: mat(), glass: mat() };
  const g = await makeRefrigCluster({
    origin: [0.5, 0.48, 0.02], rowYs: [-0.16, -0.08, 0, 0.08, 0.16], coilFaceZ: -0.3, coilRightX: 0.56,
    liquidDN: 0.02, suctionDN: 0.038, portCount: 2, materials,
  });
  assert.ok(g.children.length > 5, 'TXV + feeders + drier + suction present');
  assert.ok(g.userData.gauge.valid);
  await assert.rejects(() => makeRefrigCluster({ origin: [0, 0, 0], rowYs: [0], coilFaceZ: 0, coilRightX: 0, materials: { copper: mat() } }));
});
