import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPassParity } from './pass-parity.mjs';

const scene = (objs) => ({ objects: objs });
const elbow = (over = {}) => ({
  id: 'ELB-0001', type: 'elbow', center: [2, 0, 0],
  ports: { A: [-0.15, 0, 0], B: [0, 0.15, 0] }, portDN: { A: 0.3, B: 0.3 }, ...over,
});

test('identical scene → ok, no drift', () => {
  const r = checkPassParity(scene([elbow()]), scene([elbow()]));
  assert.equal(r.ok, true);
  assert.deepEqual(r.drifts, []);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.extra, []);
});

test('nudged center → center drift with delta', () => {
  const r = checkPassParity(scene([elbow()]), scene([elbow({ center: [2.02, 0, 0] })]));
  assert.equal(r.ok, false);
  const d = r.drifts.find((x) => x.field === 'center');
  assert.ok(d && Math.abs(d.delta - 0.02) < 1e-9);
});

test('re-rounded DN → dn drift (the silent engineering loss)', () => {
  const r = checkPassParity(scene([elbow()]), scene([elbow({ portDN: { A: 0.3, B: 0.25 } })]));
  assert.equal(r.ok, false);
  const d = r.drifts.find((x) => x.field === 'dn');
  assert.equal(d.port, 'B'); assert.equal(d.expected, 0.3); assert.equal(d.actual, 0.25);
});

test('realistic pass dropped a fitting → missing', () => {
  const r = checkPassParity(scene([elbow(), { ...elbow(), id: 'TEE-0001', type: 'tee' }]), scene([elbow()]));
  assert.deepEqual(r.missing, ['TEE-0001']);
  assert.equal(r.ok, false);
});

test('realistic pass invented a fitting → extra', () => {
  const r = checkPassParity(scene([elbow()]), scene([elbow(), { ...elbow(), id: 'CRS-0001', type: 'cross' }]));
  assert.deepEqual(r.extra, ['CRS-0001']);
  assert.equal(r.ok, false);
});

test('smoothed-away / moved port → port drift or portMissing', () => {
  const moved = checkPassParity(scene([elbow()]), scene([elbow({ ports: { A: [-0.15, 0, 0], B: [0, 0.25, 0] } })]));
  assert.ok(moved.drifts.some((d) => d.field === 'port' && d.port === 'B'));
  const lost = checkPassParity(scene([elbow()]), scene([elbow({ ports: { A: [-0.15, 0, 0] } })]));
  assert.ok(lost.drifts.some((d) => d.field === 'portMissing' && d.port === 'B'));
});

test('within tolerance → ok (a sub-mm rebuild is not drift)', () => {
  const r = checkPassParity(scene([elbow()]), scene([elbow({ center: [2.0005, 0, 0] })]), { posTol: 1e-3 });
  assert.equal(r.ok, true);
});

test('requireDN=false ignores DN changes', () => {
  const r = checkPassParity(scene([elbow()]), scene([elbow({ portDN: { A: 0.3, B: 0.25 } })]), { requireDN: false });
  assert.equal(r.ok, true);
});

test('type change → type drift', () => {
  const r = checkPassParity(scene([elbow()]), scene([elbow({ type: 'tee' })]));
  assert.ok(r.drifts.some((d) => d.field === 'type' && d.expected === 'elbow' && d.actual === 'tee'));
});

test('deterministic', () => {
  const a = scene([elbow(), { ...elbow(), id: 'TEE-0001' }]);
  const b = scene([elbow({ center: [2.02, 0, 0] })]);
  assert.equal(JSON.stringify(checkPassParity(a, b)), JSON.stringify(checkPassParity(a, b)));
});
