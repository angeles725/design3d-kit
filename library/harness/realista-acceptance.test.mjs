import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptRealista, bestOfN, HARD_FAIL_RULES, HARD_FAIL_CAP, ACCEPT_THRESHOLD } from './realista-acceptance.mjs';

// A fully-clean bundle across every dimension (all gates green).
const CLEAN = {
  parity: { ok: true, missing: [], extra: [], drifts: [] },
  winding: { ok: true, insideOut: [], open: [], checked: 3 },
  integrity: [{ id: 'a', closed: true, nonManifoldEdges: 0, signedVolume: 1, insideOut: false }],
  clashes: { clashes: [] },
  junctions: [{ label: 'j1', ok: true, gap: 0 }],
  coplanar: { ok: true, count: 0, findings: [] },
  views: { adjusted: 10, worstView: 2 },
  perf: { drawCalls: 300, triangles: 1_000_000, budget: { drawCalls: 500, triangles: 2_000_000 } },
  bounds: { outOfBounds: [] },
};

test('all gates green → score 10, accepted, no hard fails', () => {
  const v = acceptRealista(CLEAN);
  assert.equal(v.score, 10);
  assert.equal(v.score01, 1);
  assert.equal(v.accepted, true);
  assert.deepEqual(v.hardFails, []);
  assert.equal(v.capped, false);
  assert.deepEqual(v.failed, []);
});

test('inside-out winding → InvalidGeometry hard-fail, capped at 7.9, rejected', () => {
  const v = acceptRealista({ ...CLEAN, winding: { ok: false, insideOut: [{ id: 'SQ', signedVolume: -4.12 }], open: [], checked: 3 } });
  assert.ok(v.hardFails.includes('InvalidGeometry'));
  assert.equal(v.capped, true);
  assert.ok(v.score <= HARD_FAIL_CAP, `score ${v.score} must be <= ${HARD_FAIL_CAP}`);
  assert.equal(v.accepted, false);
  assert.ok(v.failed.some((f) => f.rule === 'InvalidGeometry' && f.hard && f.object === 'SQ'));
});

test('missing element → DisconnectedPipes hard-fail, capped', () => {
  const v = acceptRealista({ ...CLEAN, parity: { ok: false, missing: ['duct-7'], extra: [], drifts: [] } });
  assert.ok(v.hardFails.includes('DisconnectedPipes'));
  assert.ok(v.score <= HARD_FAIL_CAP);
  assert.equal(v.accepted, false);
});

test('interior clash → CriticalClashes hard-fail, capped', () => {
  const v = acceptRealista({ ...CLEAN, clashes: { clashes: [{ a: 'pipe-3', b: 'ahu-1', depth: 0.08 }] } });
  assert.ok(v.hardFails.includes('CriticalClashes'));
  assert.ok(v.score <= HARD_FAIL_CAP);
});

test('out-of-bounds → OutOfBounds hard-fail, capped', () => {
  const v = acceptRealista({ ...CLEAN, bounds: { outOfBounds: ['valve-9'] } });
  assert.ok(v.hardFails.includes('OutOfBounds'));
  assert.ok(v.score <= HARD_FAIL_CAP);
});

test('every hard-fail rule name is a CANONICAL GATES.md §370 rule (or the critical-floor rule) — no parallel set', () => {
  const allowed = new Set([...HARD_FAIL_RULES, 'CriticalBelowFloor']);
  const bundles = [
    { ...CLEAN, winding: { ok: false, insideOut: [{ id: 'x', signedVolume: -1 }], open: [], checked: 1 } },
    { ...CLEAN, parity: { ok: false, missing: ['m'], extra: [], drifts: [{ id: 'p', field: 'portMissing', port: 'IN' }] } },
    { ...CLEAN, clashes: { clashes: [{ a: 'a', b: 'b', depth: 0.1 }] } },
    { ...CLEAN, bounds: { outOfBounds: ['z'] } },
  ];
  for (const b of bundles) for (const rule of acceptRealista(b).hardFails) assert.ok(allowed.has(rule), `hard-fail "${rule}" is not canonical`);
});

test('SOFT DN drift only → NOT capped, no hard fail, but connectivity sub-score and total drop', () => {
  const v = acceptRealista({ ...CLEAN, parity: { ok: false, missing: [], extra: [], drifts: [{ id: 'r1', field: 'dn', port: 'OUT', expected: 150, actual: 152 }] } });
  assert.equal(v.capped, false);
  assert.deepEqual(v.hardFails, []);
  assert.ok(v.subscores.connectivity < 1);
  assert.ok(v.score < 10 && v.score > HARD_FAIL_CAP, `a soft-only drift stays above the hard cap (got ${v.score})`);
  assert.ok(v.failed.some((f) => f.rule === 'DataDrift' && !f.hard));
});

test('enough soft connectivity drift to sink the critical sub-score below 0.8 → CriticalBelowFloor hard-fail', () => {
  const drifts = Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, field: 'dn', port: 'OUT', expected: 150, actual: 152 }));
  const v = acceptRealista({ ...CLEAN, parity: { ok: false, missing: [], extra: [], drifts } });
  assert.ok(v.subscores.connectivity < 0.8);
  assert.ok(v.hardFails.includes('CriticalBelowFloor'));
  assert.ok(v.score <= HARD_FAIL_CAP);
});

test('absent dimensions → weight redistributes; a data-only de-box scores on parity alone', () => {
  const v = acceptRealista({ parity: { ok: true, missing: [], extra: [], drifts: [] } });
  assert.equal(v.subscores.geometry, null);
  assert.equal(v.subscores.visual, null);
  assert.equal(v.subscores.performance, null);
  // only connectivity present → it carries 100% of the weight
  assert.ok(Math.abs(v.weightsUsed.connectivity - 1) < 1e-9);
  assert.equal(v.score, 10);
  assert.equal(v.accepted, true);
});

test('raw per-view scores are reduced by mu - lambda*sigma (view-variance parity)', () => {
  // front 9, back 3 → mean 6, sigma 3 → adjusted 6 - 0.5*3 = 4.5 → 0.45 sub-score, flags worst view
  const v = acceptRealista({ parity: CLEAN.parity, views: { scores: [9, 3] } }, { lambda: 0.5 });
  assert.ok(Math.abs(v.subscores.visual - 0.45) < 1e-6);
  assert.ok(v.failed.some((f) => f.rule === 'VisualBelowThreshold' && f.object === 'view 1'));
});

test('structured failure is ordered hard-first and is router-facing (rule/object/reason/suggestion)', () => {
  const v = acceptRealista({ ...CLEAN,
    winding: { ok: false, insideOut: [{ id: 'SQ', signedVolume: -1 }], open: [], checked: 2 },
    parity: { ok: false, missing: [], extra: [], drifts: [{ id: 'r1', field: 'center', delta: 0.02 }] } });
  assert.ok(v.failed.length >= 2);
  assert.equal(v.failed[0].hard, true, 'hard failures sort first');
  for (const f of v.failed) for (const k of ['rule', 'object', 'reason', 'suggestion']) assert.ok(k in f, `failure missing "${k}"`);
});

test('deterministic', () => {
  assert.equal(JSON.stringify(acceptRealista(CLEAN)), JSON.stringify(acceptRealista(CLEAN)));
});

// ---- bestOfN ----
test('bestOfN keeps the max-scoring pass; ties resolve to the EARLIEST', () => {
  const r = bestOfN([{ score: 7.2 }, { score: 9.1 }, { score: 9.1 }, { score: 8.0 }]);
  assert.equal(r.bestIndex, 1);
  assert.equal(r.best.score, 9.1);
  assert.equal(r.improved, true);
  assert.deepEqual(r.deltas, [1.9, 0, -1.1]);
});

test('bestOfN: a correction that only regresses keeps attempt 0', () => {
  const r = bestOfN([{ score: 8.5 }, { score: 6.0 }]);
  assert.equal(r.bestIndex, 0);
  assert.equal(r.improved, false);
});

test('bestOfN: empty / non-array → null', () => {
  assert.equal(bestOfN([]), null);
  assert.equal(bestOfN(undefined), null);
});

test('ACCEPT_THRESHOLD is 8.0 and cap is 7.9 (GATES.md §370)', () => {
  assert.equal(ACCEPT_THRESHOLD, 8.0);
  assert.equal(HARD_FAIL_CAP, 7.9);
});

// ---- P6 open-edge/cap findings fold into the geometry sub-score under InvalidGeometry ----
test('openEdge: an uncapped see-through shell caps under InvalidGeometry (GATES.md fold)', () => {
  const v = acceptRealista({ ...CLEAN,
    openEdge: { ok: false, findings: [{ id: 'duct-3', kind: 'uncapped', hard: true, reason: '2 uncapped ends', suggestion: 'cap them' }] } });
  assert.ok(v.hardFails.includes('InvalidGeometry'));
  assert.equal(v.capped, true);
  assert.ok(v.score <= HARD_FAIL_CAP);
  assert.ok(v.failed.some((f) => f.rule === 'InvalidGeometry' && /uncapped shell/.test(f.reason) && f.object === 'duct-3'));
});

test('openEdge: only an over-capped (soft) finding → advisory, NOT capped', () => {
  const v = acceptRealista({ ...CLEAN,
    openEdge: { ok: true, findings: [{ id: 'd', kind: 'over-capped', hard: false, reason: 'end capped where connection expected', suggestion: 'check topology' }] } });
  assert.equal(v.capped, false);
  assert.deepEqual(v.hardFails, []);
  assert.ok(v.failed.some((f) => f.rule === 'OpenEdgeAdvisory' && !f.hard));
});

test('openEdge: a data-only de-box with ONLY open-edge input still scores geometry (not null)', () => {
  const v = acceptRealista({ parity: { ok: true, missing: [], extra: [], drifts: [] },
    openEdge: { ok: false, findings: [{ id: 'x', kind: 'torn', hard: true, reason: 'torn', suggestion: 'weld' }] } });
  assert.notEqual(v.subscores.geometry, null);
  assert.ok(v.hardFails.includes('InvalidGeometry'));
});

test('openEdge: clean (no findings) → no effect on the verdict', () => {
  const v = acceptRealista({ ...CLEAN, openEdge: { ok: true, findings: [] } });
  assert.equal(v.score, 10);
  assert.equal(v.accepted, true);
});
