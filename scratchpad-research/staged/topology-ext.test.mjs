// node --test  ·  pure (imports only the zero-dep topology-ext core; never three).
// Run:  node --test scratchpad-research/staged/topology-ext.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { triangleQuality, normalConsistency, nonManifoldVertex, fScore, topologyReport } from './topology-ext.mjs';

const approx = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// ---- FIXTURES ------------------------------------------------------------------------------------
// Clean unit quad: 2 right-isosceles tris, consistent winding, shared edge 0-2.
const quadPos = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0];
const quadIdx = [0, 1, 2, 0, 2, 3];
// Same quad but the SECOND triangle's winding is reversed (local flip on the shared edge).
const flippedIdx = [0, 1, 2, 0, 3, 2];
// Bowtie: two tris pinched at vertex 0 only (no shared edge).
const bowPos = [0, 0, 0, 1, 0, 0, 0, 1, 0, -1, 0, 0, 0, -1, 0];
const bowIdx = [0, 1, 2, 0, 3, 4];
// Sliver: a thin (but non-zero-area) triangle.
const sliverPos = [0, 0, 0, 1, 0, 0, 0.5, 0.001, 0];
const sliverIdx = [0, 1, 2];
// Degenerate: three collinear points => zero area.
const collinearPos = [0, 0, 0, 1, 0, 0, 2, 0, 0];
const collinearIdx = [0, 1, 2];

// ---- triangleQuality -----------------------------------------------------------------------------
test('triangleQuality: clean quad — 45° min angle, no degenerates', () => {
  const q = triangleQuality(quadPos, quadIdx);
  assert.ok(approx(q.minAngleDeg, 45, 1e-6), `minAngleDeg ${q.minAngleDeg} ~ 45`);
  assert.equal(q.degenerateCount, 0);
  assert.equal(q.triangles, 2);
  assert.ok(q.maxAspectRatio > 1 && q.maxAspectRatio < 1.5, `aspect ${q.maxAspectRatio}`); // right-iso ≈1.393
});

test('triangleQuality: sliver — tiny min angle, huge aspect, NOT degenerate', () => {
  const q = triangleQuality(sliverPos, sliverIdx);
  assert.ok(q.minAngleDeg < 1, `sliver minAngleDeg ${q.minAngleDeg} < 1`);
  assert.equal(q.degenerateCount, 0);          // non-zero area
  assert.ok(q.maxAspectRatio > 100, `sliver aspect ${q.maxAspectRatio} large`);
});

test('triangleQuality: collinear — counted degenerate, not a sliver', () => {
  const q = triangleQuality(collinearPos, collinearIdx);
  assert.equal(q.degenerateCount, 1);
  assert.equal(q.minAngleDeg, 0);              // no non-degenerate triangle contributed
  assert.equal(q.maxAspectRatio, Infinity);
});

// ---- normalConsistency ---------------------------------------------------------------------------
test('normalConsistency: clean quad is consistent (shared edge traversed oppositely)', () => {
  const r = normalConsistency(quadPos, quadIdx);
  assert.equal(r.consistent, true);
  assert.equal(r.flippedPairs, 0);
  assert.equal(r.sharedEdges, 1);              // only edge 0-2 is shared
});

test('normalConsistency: flipped second triangle is a local flip', () => {
  const r = normalConsistency(quadPos, flippedIdx);
  assert.equal(r.consistent, false);
  assert.equal(r.flippedPairs, 1);
  assert.equal(r.sharedEdges, 1);
});

// ---- nonManifoldVertex ---------------------------------------------------------------------------
test('nonManifoldVertex: bowtie flagged at the shared vertex', () => {
  const r = nonManifoldVertex(bowPos, bowIdx);
  assert.equal(r.count, 1);
  assert.deepEqual(r.vertices, [0]);
});

test('nonManifoldVertex: clean quad has no bowtie', () => {
  const r = nonManifoldVertex(quadPos, quadIdx);
  assert.equal(r.count, 0);
  assert.deepEqual(r.vertices, []);
});

// ---- fScore --------------------------------------------------------------------------------------
test('fScore: known overlap — precision 1, recall 2/3, fscore 0.8', () => {
  const A = [0, 0, 0, 1, 0, 0];                 // both points also in B
  const B = [0, 0, 0, 1, 0, 0, 5, 0, 0];        // extra far point -> recall drops
  const r = fScore(A, B, 0.1);
  assert.ok(approx(r.precision, 1), `precision ${r.precision}`);
  assert.ok(approx(r.recall, 2 / 3), `recall ${r.recall}`);
  assert.ok(approx(r.fscore, 0.8), `fscore ${r.fscore}`);
});

test('fScore: identical sets -> 1; disjoint sets -> 0', () => {
  const P = [0, 0, 0, 1, 1, 1];
  assert.ok(approx(fScore(P, P, 1e-6).fscore, 1));
  const far = [100, 100, 100, 200, 200, 200];
  assert.equal(fScore(P, far, 0.1).fscore, 0);
});

// ---- topologyReport (combined verdict) -----------------------------------------------------------
// Clean CLOSED tetrahedron: outward-consistent winding, watertight -> perfect 10, no hard-fail, no flags.
const tetraPos = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
const tetraIdx = [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3];

test('topologyReport: clean closed tetra -> score 10, no hardFail, no flags', () => {
  const r = topologyReport(tetraPos, tetraIdx);
  assert.equal(r.hardFail, false);
  assert.equal(r.score, 10);
  assert.equal(r.flags.insideOut, false);
  assert.equal(r.flags.openEdges, false);   // watertight
  assert.equal(r.flags.degenerate, false);
  assert.equal(r.flags.bowtie, false);
  assert.equal(r.flags.localFlip, false);
});

test('topologyReport: local flip -> hardFail, score <= 5', () => {
  const r = topologyReport(quadPos, flippedIdx);
  assert.equal(r.flags.localFlip, true);
  assert.equal(r.hardFail, true);
  assert.ok(r.score <= 5, `score ${r.score} <= 5`);
});

test('topologyReport: bowtie -> hardFail, score <= 5', () => {
  const r = topologyReport(bowPos, bowIdx);
  assert.equal(r.flags.bowtie, true);
  assert.equal(r.hardFail, true);
  assert.ok(r.score <= 5);
});

test('topologyReport: degenerate triangle -> hardFail', () => {
  const r = topologyReport(collinearPos, collinearIdx);
  assert.equal(r.flags.degenerate, true);
  assert.equal(r.hardFail, true);
  assert.ok(r.score <= 5);
});

test('topologyReport: sliver -> deduction, NOT hardFail', () => {
  const r = topologyReport(sliverPos, sliverIdx);
  assert.equal(r.flags.sliver, true);
  assert.equal(r.hardFail, false);           // a thin-but-valid triangle is not a hard fail
  assert.ok(r.score < 10, `score ${r.score} deducted`);
});

test('topologyReport: open surface (quad) -> openEdges deduction, NOT hardFail', () => {
  const r = topologyReport(quadPos, quadIdx);
  assert.equal(r.flags.openEdges, true);     // a cut duct end legitimately has open edges
  assert.equal(r.hardFail, false);
  assert.equal(r.score, 9);                  // 10 - 1 (open-edge deduction), still a pass
});
