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

// ---- GATES §440: size + rotation drift (i2 review) ----
const box = (over = {}) => ({ id: 'CH-01', type: 'chiller', center: [3.5, 8, 0.9], size: [3, 1.2, 1.8],
  rotation: [0, 0, 0], ports: { CHWS: [1.5, -0.6, 0.5] }, portDN: { CHWS: 0.2 }, ...over });

test('size drift: a proxy larger than its blockout bbox is caught (invalidates clearance)', () => {
  const r = checkPassParity(scene([box()]), scene([box({ size: [3.1, 1.2, 1.8] })]));
  assert.equal(r.ok, false);
  const d = r.drifts.find((x) => x.field === 'size');
  assert.ok(d && Math.abs(d.delta - 0.1) < 1e-9);
});

test('size within tol → ok', () => {
  assert.equal(checkPassParity(scene([box()]), scene([box({ size: [3.0005, 1.2, 1.8] })])).ok, true);
});

test('rotation drift: a re-oriented proxy (ports face wrong way) is caught', () => {
  const r = checkPassParity(scene([box()]), scene([box({ rotation: [0, Math.PI / 2, 0] })]));
  assert.equal(r.ok, false);
  assert.ok(r.drifts.some((x) => x.field === 'rotation'));
});

test('rotation within rotTol → ok', () => {
  assert.equal(checkPassParity(scene([box()]), scene([box({ rotation: [0, 5e-5, 0] })]), { rotTol: 1e-4 }).ok, true);
});

test('absent size/rotation fields are ignored (backward compatible with duct scenes)', () => {
  const s = scene([{ id: 'ELB-0001', type: 'elbow', center: [2, 0, 0], ports: { A: [-0.15, 0, 0] }, portDN: { A: 0.3 } }]);
  assert.equal(checkPassParity(s, s).ok, true); // no size/rotation → no size/rotation drift
});

test('shared fixture: duct-network.json parses and self-compares with zero drift', async () => {
  const fs = await import('node:fs/promises');
  const url = new URL('./__fixtures__/duct-network.json', import.meta.url);
  const fixture = JSON.parse(await fs.readFile(url, 'utf8'));
  assert.ok(fixture.objects.length >= 6);
  const r = checkPassParity(fixture, fixture);
  assert.equal(r.ok, true); // identical → zero drift (the reference is internally consistent)
});

// ---- PROVENANCE ENVELOPE preservation (contract §2 / retro P3) ----
// A duct whose width was measured but whose HEIGHT is absent-in-source (evidence below chance) — Revisor's case.
const provDuct = (over = {}) => ({
  id: 'DUCT-0001', type: 'duct', center: [0, 0, 0],
  fieldProvenance: {
    width: { v: 0.105, prov: 'measured', raw: 0.105, snap: 0.1016, deltaMm: 3.4 },
    height: { v: null, prov: 'absent-in-source', raw: null, snap: null, deltaMm: null },
    bod: { v: 3.2, prov: 'measured' },
    topExtent: { v: null, prov: 'absent-in-source' },
  },
  ...over,
});
const dp = (fp) => scene([provDuct({ fieldProvenance: fp })]);

test('provenance: identical envelopes → no drift', () => {
  const r = checkPassParity(scene([provDuct()]), scene([provDuct()]));
  assert.equal(r.ok, true);
  assert.deepEqual(r.drifts, []);
});

test('provenance: a legitimately absent-in-source field kept null → NO drift (h=None is correct)', () => {
  const r = checkPassParity(scene([provDuct()]), scene([provDuct()]));
  assert.ok(!r.drifts.some((d) => String(d.field).startsWith('prov')));
});

test('provenance: FABRICATED height (source absent-in-source/null → built invents 0.30) → provFabricated drift', () => {
  const built = provDuct();
  built.fieldProvenance = JSON.parse(JSON.stringify(built.fieldProvenance));
  built.fieldProvenance.height = { v: 0.30, prov: 'inferred', raw: null, snap: null, deltaMm: null };
  const r = checkPassParity(scene([provDuct()]), scene([built]));
  assert.equal(r.ok, false);
  assert.ok(r.drifts.some((d) => d.field === 'provFabricated' && d.port === 'height' && d.actual === 0.30));
});

test('provenance: LOST measurement (source measured width → built nulls it) → provLost drift', () => {
  const r = checkPassParity(scene([provDuct()]), dp({
    width: { v: null, prov: 'absent-in-source', raw: null, snap: null, deltaMm: null },
    height: { v: null, prov: 'absent-in-source' }, bod: { v: 3.2, prov: 'measured' }, topExtent: { v: null, prov: 'absent-in-source' },
  }));
  assert.ok(r.drifts.some((d) => d.field === 'provLost' && d.port === 'width'));
});

test('provenance: dropped envelope entirely → provDropped drift', () => {
  const built = provDuct(); delete built.fieldProvenance;
  const r = checkPassParity(scene([provDuct()]), scene([built]));
  assert.ok(r.drifts.some((d) => d.field === 'provDropped'));
});

test('provenance: dropped one field → provFieldMissing drift', () => {
  const built = provDuct();
  built.fieldProvenance = { ...built.fieldProvenance }; delete built.fieldProvenance.bod;
  const r = checkPassParity(scene([provDuct()]), scene([built]));
  assert.ok(r.drifts.some((d) => d.field === 'provFieldMissing' && d.port === 'bod'));
});

test('provenance: raw/deltaMm histogram data changed → provRaw + provDelta drift (Revisor snap histogram)', () => {
  const r = checkPassParity(scene([provDuct()]), dp({
    width: { v: 0.105, prov: 'measured', raw: 0.082, snap: 0.1016, deltaMm: 19.6 }, // interior-pair error masked
    height: { v: null, prov: 'absent-in-source' }, bod: { v: 3.2, prov: 'measured' }, topExtent: { v: null, prov: 'absent-in-source' },
  }));
  assert.ok(r.drifts.some((d) => d.field === 'provRaw' && d.port === 'width'));
  assert.ok(r.drifts.some((d) => d.field === 'provDelta' && d.port === 'width'));
});

test('provenance: prov-class change (measured → inferred) → provClass drift', () => {
  const r = checkPassParity(scene([provDuct()]), dp({
    width: { v: 0.105, prov: 'inferred', raw: 0.105, snap: 0.1016, deltaMm: 3.4 },
    height: { v: null, prov: 'absent-in-source' }, bod: { v: 3.2, prov: 'measured' }, topExtent: { v: null, prov: 'absent-in-source' },
  }));
  assert.ok(r.drifts.some((d) => d.field === 'provClass' && d.port === 'width'));
});

test('provenance: requireProv:false disables the envelope check', () => {
  const built = provDuct(); delete built.fieldProvenance;
  const r = checkPassParity(scene([provDuct()]), scene([built]), { requireProv: false });
  assert.ok(!r.drifts.some((d) => String(d.field).startsWith('prov')));
});

test('provenance: objects without fieldProvenance are unaffected (back-compat)', () => {
  const r = checkPassParity(scene([elbow()]), scene([elbow()]));
  assert.equal(r.ok, true);
});
