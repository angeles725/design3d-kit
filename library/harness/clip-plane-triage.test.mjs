import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipPlaneTriage, signedDistanceToPlane } from './clip-plane-triage.mjs';
import { expectedOpenLoopsFromDegrees } from './open-edge-cap.mjs';

const HIGH = { axis: 'x', value: 7.072 };  // Revisor's high plane
const LOW = { axis: 'x', value: -4.991 };  // Revisor's low plane

test('signedDistanceToPlane: axis-aligned and general plane', () => {
  assert.equal(signedDistanceToPlane([8, 0, 0], HIGH), 8 - 7.072);
  assert.equal(signedDistanceToPlane([6, 0, 0], HIGH), 6 - 7.072);
  // general plane x=+7.072 as {normal:[1,0,0], constant:7.072}
  assert.ok(Math.abs(signedDistanceToPlane([8, 0, 0], { normal: [1, 0, 0], constant: 7.072 }) - 0.928) < 1e-9);
});

test('centerline straddle: a run spanning the plane is CUT; runs entirely on one side are not', () => {
  const runs = [
    { id: 'cross', p0: [6, 0, 0], p1: [8, 0, 0] },     // straddles x=7.072
    { id: 'above', p0: [8, 0, 0], p1: [10, 0, 0] },    // both > 7.072
    { id: 'below', p0: [5, 0, 0], p1: [7, 0, 0] },     // both < 7.072
  ];
  const r = clipPlaneTriage(runs, HIGH);
  assert.deepEqual(r.crossing, ['cross']);
  assert.equal(r.method, 'centerline');
});

test('a run whose endpoint lies ON the plane (within tol) is CUT', () => {
  const r = clipPlaneTriage([{ id: 'touch', p0: [7.072, 0, 0], p1: [9, 0, 0] }], HIGH);
  assert.deepEqual(r.crossing, ['touch']);
});

test('two planes select different run sets', () => {
  const runs = [
    { id: 'h', p0: [6, 0, 0], p1: [8, 0, 0] },       // crosses HIGH only
    { id: 'l', p0: [-6, 0, 0], p1: [-4, 0, 0] },     // crosses LOW only
    { id: 'mid', p0: [0, 0, 0], p1: [1, 0, 0] },     // crosses neither
  ];
  assert.deepEqual(clipPlaneTriage(runs, HIGH).crossing, ['h']);
  assert.deepEqual(clipPlaneTriage(runs, LOW).crossing, ['l']);
});

test('bbox method: a run whose bbox spans the plane is CUT', () => {
  const runs = [
    { id: 'span', bbox: { min: [6.5, 0, 0], max: [7.5, 1, 1] } },   // spans x=7.072
    { id: 'clear', bbox: { min: [8, 0, 0], max: [9, 1, 1] } },      // clears it
  ];
  const r = clipPlaneTriage(runs, HIGH, { useBbox: true });
  assert.deepEqual(r.crossing, ['span']);
  assert.equal(r.method, 'bbox');
});

test('general (non-axis-aligned) plane via normal/constant', () => {
  // plane through origin with normal (1,1,0)/√2: a run from (-1,-1,0) to (1,1,0) straddles it.
  const plane = { normal: [1, 1, 0], constant: 0 };
  const r = clipPlaneTriage([{ id: 'diag', p0: [-1, -1, 0], p1: [1, 1, 0] }, { id: 'off', p0: [2, 2, 0], p1: [3, 3, 0] }], plane);
  assert.deepEqual(r.crossing, ['diag']);
});

test('numeric run ids sort numerically (matches system-3d runId), not lexically', () => {
  const runs = [845, 782, 800, 775, 788].map((id) => ({ id, p0: [7, 0, 0], p1: [7.1, 0, 0] }));
  const r = clipPlaneTriage(runs, HIGH);
  assert.deepEqual(r.crossing, [775, 782, 788, 800, 845]); // numeric order, not '775','782'... lexical
});

test('reports-only + deterministic', () => {
  const runs = [{ id: 1, p0: [6, 0, 0], p1: [8, 0, 0] }];
  assert.equal(JSON.stringify(clipPlaneTriage(runs, HIGH)), JSON.stringify(clipPlaneTriage(runs, HIGH)));
});

// ---- REAL-DATA acceptance (Revisor's certified L4-full.json fixture; runId = index in DATA.runs) ----
// The crossing is defined by each run's x-EXTENT INCLUDING the perpendicular width (Revisor), which is the
// bbox method — a run tangent to the plane by its width still needs a cap. All 7 here are x-aligned so their
// centerline x-extent equals their x-extent, but the bbox method is the correct general test.
const CERT_HI = { axis: 'x', value: 123.057 }; // three +7.072
const CERT_LO = { axis: 'x', value: 110.994 }; // three −4.991
// Node degrees (n0/n1) from the certified L4-full.json degree-subgraph (Revisor). freeEnds = # endpoints
// with node degree < 2. system-3d space (2033 runs) — NOT mixed with full-3d (2132, other node space).
const FIX = [
  { id: 788, xext: [119.531, 123.368], deg: [2, 2], freeEnds: 0 }, // through-run, both ends covered
  { id: 782, xext: [118.839, 124.101], deg: [1, 3], freeEnds: 1 },
  { id: 800, xext: [122.753, 126.104], deg: [1, 5], freeEnds: 1 }, // farthest max
  { id: 775, xext: [120.067, 125.998], deg: [2, 1], freeEnds: 1 },
  { id: 845, xext: [121.910, 124.536], deg: [1, 6], freeEnds: 1 }, // EDGE CASE: h=null (height absent-in-source)
  { id: 841, xext: [110.594, 112.878], deg: [1, 1], freeEnds: 2 }, // two legitimate open terminals
  { id: 797, xext: [110.777, 114.072], deg: [1, 1], freeEnds: 2 },
];
const asBbox = (r, dx = 0) => ({ id: r.id, bbox: { min: [r.xext[0] + dx, 0, 0], max: [r.xext[1] + dx, 1, 1] } });

test('REAL-DATA (certified frame): x=123.057 selects 788,782,800,775,845; x=110.994 selects 841,797', () => {
  const runs = FIX.map((r) => asBbox(r));
  assert.deepEqual(clipPlaneTriage(runs, CERT_HI, { useBbox: true }).crossing, [775, 782, 788, 800, 845]);
  assert.deepEqual(clipPlaneTriage(runs, CERT_LO, { useBbox: true }).crossing, [797, 841]);
});

test('REAL-DATA: no run crosses BOTH planes (the two bays are disjoint on x)', () => {
  const runs = FIX.map((r) => asBbox(r));
  const hi = new Set(clipPlaneTriage(runs, CERT_HI, { useBbox: true }).crossing);
  const lo = clipPlaneTriage(runs, CERT_LO, { useBbox: true }).crossing;
  assert.ok(lo.every((id) => !hi.has(id)));
});

test('REAL-DATA (three frame): three_x = certified_x − 115.985 gives the SAME crossing (frame-consistent)', () => {
  const DX = -115.985;
  const runs = FIX.map((r) => asBbox(r, DX));
  assert.deepEqual(clipPlaneTriage(runs, { axis: 'x', value: 7.072 }, { useBbox: true }).crossing, [775, 782, 788, 800, 845]);
  assert.deepEqual(clipPlaneTriage(runs, { axis: 'x', value: -4.991 }, { useBbox: true }).crossing, [797, 841]);
});

test('REAL-DATA: 800 (farthest, xext→126.104) and 845 (h=null) are both correctly selected by HI', () => {
  const runs = [asBbox(FIX[2]), asBbox(FIX[4])]; // 800, 845
  assert.deepEqual(clipPlaneTriage(runs, CERT_HI, { useBbox: true }).crossing, [800, 845]);
  // NOTE: 845 has h=null — the triage SELECTS it fine (x-extent only); the downstream GEOMETRY cap must
  // handle the absent height (viewer nominal or mark "assumed height"), never fabricate one (pass-parity P3).
});

// ---- REAL-DATA: degree-subgraph → free ends (validates expectedOpenLoopsFromDegrees on real node degrees) ----
// Pairs with the clip-cut fixture above (Revisor): each of the 7 runs' node degrees (n0/n1 from DATA.runs)
// gives its legitimate free-end count. Previously only synthetic-tested; this locks it on real data.
test('REAL-DATA degrees: expectedOpenLoopsFromDegrees matches Revisor free-ends for all 7 certified runs', () => {
  for (const r of FIX) {
    assert.equal(expectedOpenLoopsFromDegrees(r.deg), r.freeEnds, `run ${r.id} deg ${r.deg} → free_ends ${r.freeEnds}`);
  }
});

test('REAL-DATA composition: triage + degrees yield all three category signals on the certified pair', () => {
  const runs = FIX.map((r) => asBbox(r));
  const hiCut = new Set(clipPlaneTriage(runs, CERT_HI, { useBbox: true }).crossing);
  const loCut = new Set(clipPlaneTriage(runs, CERT_LO, { useBbox: true }).crossing);
  const cross = (id) => hiCut.has(id) || loCut.has(id);
  // 788: through-run (freeEnds 0) but the HI plane cuts it → a clip-crossing (category b), 0 legit terminals.
  const r788 = FIX.find((r) => r.id === 788);
  assert.equal(r788.freeEnds, 0);
  assert.ok(cross(788));
  // 841: two legitimate open terminals (freeEnds 2, category a) AND the LO plane cuts it (category b).
  const r841 = FIX.find((r) => r.id === 841);
  assert.equal(r841.freeEnds, 2);
  assert.ok(loCut.has(841));
  // every certified run crosses exactly one plane (the two bays are disjoint on x).
  for (const r of FIX) assert.equal(Number(hiCut.has(r.id)) + Number(loCut.has(r.id)), 1, `run ${r.id} crosses exactly one plane`);
});

// ---- run-shape consistency: accept {a,b} (duct-vectorize shape) as well as {p0,p1} ----
test('clipPlaneTriage accepts {a,b} endpoints (the canonical duct-vectorize run shape) identically to {p0,p1}', () => {
  const ab = [{ id: 'cross', a: [6, 0, 0], b: [8, 0, 0] }, { id: 'above', a: [8, 0, 0], b: [10, 0, 0] }];
  const p = [{ id: 'cross', p0: [6, 0, 0], p1: [8, 0, 0] }, { id: 'above', p0: [8, 0, 0], p1: [10, 0, 0] }];
  assert.deepEqual(clipPlaneTriage(ab, HIGH).crossing, ['cross']);
  assert.deepEqual(clipPlaneTriage(ab, HIGH).crossing, clipPlaneTriage(p, HIGH).crossing); // same result, either shape
});

test('the SAME runs array (a/b) feeds clipPlaneTriage AND endpointDegreesFromRuns without re-mapping', () => {
  // duct-vectorize's endpointDegreesFromRuns needs {id,a,b}; the triage now reads the same shape.
  const runs = [
    { id: 'r1', a: [0, 0, 0], b: [7, 0, 0], radius: 0.1 },  // crosses x=7.072? no (b.x=7 < 7.072)
    { id: 'r2', a: [7, 0, 0], b: [9, 0, 0], radius: 0.1 },  // crosses x=7.072 (7..9)
  ];
  assert.deepEqual(clipPlaneTriage(runs, HIGH).crossing, ['r2']);
  assert.equal(expectedOpenLoopsFromDegrees([2, 2]), 0); // both endpoints connected → through-run, 0 free
});
