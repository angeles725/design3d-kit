import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundaryLoops, checkOpenEdgeCaps, expectedOpenLoopsFromDegrees, segmentTrianglesByRunId, checkFusedShellOpenEdges, weldByPosition, checkFusedMeshClosed } from './open-edge-cap.mjs';

// Closed unit cube (watertight, outward) — the same fixture debox-winding uses.
const CUBE = [0,0,0, 1,0,0, 1,1,0, 0,1,0, 0,0,1, 1,0,1, 1,1,1, 0,1,1];
const CUBE_OUT = [0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7];

// An OPEN tube = a prism side wall, `seg` sides, two rings, NO end caps → this is the see-through duct.
function openTube(seg = 8) {
  const positions = [], index = [];
  for (let i = 0; i < seg; i++) { const a = (2 * Math.PI * i) / seg; positions.push(Math.cos(a), Math.sin(a), 0); }
  for (let i = 0; i < seg; i++) { const a = (2 * Math.PI * i) / seg; positions.push(Math.cos(a), Math.sin(a), 1); }
  for (let i = 0; i < seg; i++) {
    const a = i, b = (i + 1) % seg, c = seg + i, d = seg + (i + 1) % seg;
    index.push(a, c, b, b, c, d);
  }
  return { positions, index, seg };
}

// Same tube with ONE end (ring 0) closed by a triangle fan to a center vertex → 1 open loop remains.
function tubeCappedOneEnd(seg = 8) {
  const t = openTube(seg);
  const center = t.positions.length / 3;
  t.positions.push(0, 0, 0);
  for (let i = 0; i < seg; i++) t.index.push(center, (i + 1) % seg, i); // fan closes ring 0
  return t;
}

test('closed cube → 0 open edges, 0 open loops', () => {
  const b = boundaryLoops(CUBE_OUT);
  assert.equal(b.openEdges, 0);
  assert.equal(b.openLoops, 0);
  assert.equal(b.nonManifoldEdges, 0);
});

test('open tube → exactly 2 clean open loops (both cut ends), no tears', () => {
  const t = openTube(10);
  const b = boundaryLoops(t.index);
  assert.equal(b.openLoops, 2);
  assert.equal(b.cleanLoops, 2);
  assert.equal(b.torn, 0);
  assert.equal(b.openEdges, 2 * 10);
});

const reverseIndex = (idx) => { const r = []; for (let i = 0; i < idx.length; i += 3) r.push(idx[i], idx[i + 2], idx[i + 1]); return r; };

test('THE DEFECT: open-edge is a DIFFERENT axis from winding — it catches the see-through end in EITHER orientation', () => {
  // Revisor measured on 1028 real runs that signedVolume was 583+/0- (winding CORRECT) yet the ducts were
  // see-through. Cap-completeness is topological and INDEPENDENT of winding: reversing the winding leaves the
  // boundary (the open ends) identical, so the open-edge gate flags the tube in both orientations — which is
  // exactly why signedVolume/debox-winding cannot see this defect and this gate can.
  const t = openTube(12);
  const rev = reverseIndex(t.index);
  assert.equal(boundaryLoops(t.index).openLoops, boundaryLoops(rev).openLoops); // winding-agnostic topology
  const a = checkOpenEdgeCaps([{ id: 'duct', index: t.index }]);
  const b = checkOpenEdgeCaps([{ id: 'duct', index: rev }]);
  assert.equal(a.ok, false);
  assert.equal(b.ok, false);
  assert.ok(a.findings.some((f) => f.kind === 'uncapped' && f.hard && f.extra === 2));
});

test('declared expectation: the SAME tube with expectedOpenLoops:2 (both ends covered by neighbours) → ok', () => {
  const t = openTube(10);
  const r = checkOpenEdgeCaps([{ id: 'duct', index: t.index, expectedOpenLoops: 2 }]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.findings.filter((f) => f.hard), []);
});

test('one uncapped end: tube capped on one side, expected 1 → ok; expected 0 → 1 uncapped end', () => {
  const t = tubeCappedOneEnd(8);
  assert.equal(boundaryLoops(t.index).openLoops, 1);
  assert.equal(checkOpenEdgeCaps([{ id: 'd', index: t.index, expectedOpenLoops: 1 }]).ok, true);
  const bad = checkOpenEdgeCaps([{ id: 'd', index: t.index, expectedOpenLoops: 0 }]);
  assert.equal(bad.ok, false);
  assert.ok(bad.findings.some((f) => f.kind === 'uncapped' && f.extra === 1));
});

test('TORN surface (two triangles joined at a single vertex) → torn hard-fail, NOT non-manifold', () => {
  // tris (0,1,2) and (0,3,4) share only vertex 0 → boundary has a degree-4 vertex, not a simple cycle.
  const index = [0,1,2, 0,3,4];
  const b = boundaryLoops(index);
  assert.equal(b.nonManifoldEdges, 0);
  assert.equal(b.torn, 1);
  const r = checkOpenEdgeCaps([{ id: 'tear', index }]);
  assert.ok(r.findings.some((f) => f.kind === 'torn' && f.hard));
  assert.equal(r.ok, false);
});

test('NON-MANIFOLD edge (three triangles share one edge) → non-manifold hard-fail', () => {
  const index = [0,1,2, 0,1,3, 0,1,4]; // edge 0-1 has valence 3
  const b = boundaryLoops(index);
  assert.ok(b.nonManifoldEdges >= 1);
  const r = checkOpenEdgeCaps([{ id: 'nm', index }]);
  assert.ok(r.findings.some((f) => f.kind === 'non-manifold' && f.hard));
});

test('over-capped is SOFT: a watertight shell where 1 open end was declared → advisory, still ok', () => {
  const r = checkOpenEdgeCaps([{ id: 'cube', index: CUBE_OUT, expectedOpenLoops: 1 }]);
  assert.equal(r.ok, true);
  assert.ok(r.findings.some((f) => f.kind === 'over-capped' && !f.hard));
});

test('no index → SKIPPED (reported), never silently passed', () => {
  const r = checkOpenEdgeCaps([{ id: 'soup' }, { id: 'ok', index: CUBE_OUT }]);
  assert.deepEqual(r.skipped, ['soup']);
  assert.equal(r.checked, 1);
  assert.equal(r.ok, true);
});

test('mixed batch names only the uncapped part; hard findings sort first', () => {
  const t = openTube(6);
  const r = checkOpenEdgeCaps([
    { id: 'good', index: CUBE_OUT },
    { id: 'leaky', index: t.index },
  ]);
  assert.equal(r.ok, false);
  assert.equal(r.findings[0].hard, true);
  assert.equal(r.findings[0].id, 'leaky');
});

// ---- Revisor's rule: expected free ends DERIVED from endpoint node degree (never a blind default) ----

test('expectedOpenLoopsFromDegrees counts endpoints with degree < 2 (free ends)', () => {
  assert.equal(expectedOpenLoopsFromDegrees([2, 2]), 0);   // through-run, both ends joined
  assert.equal(expectedOpenLoopsFromDegrees([2, 1]), 1);   // terminal, one free end
  assert.equal(expectedOpenLoopsFromDegrees([1, 1]), 2);   // isolated run, both free
  assert.equal(expectedOpenLoopsFromDegrees([3, 2, 0]), 1);
});

test('THROUGH-RUN (endpointDegrees [2,2] → expected 0): both open shell ends are should-be-covered defects', () => {
  const t = openTube(12);
  const r = checkOpenEdgeCaps([{ id: 'run-through', index: t.index, endpointDegrees: [2, 2] }]);
  assert.equal(r.ok, false);
  const f = r.findings.find((x) => x.kind === 'uncapped');
  assert.equal(f.expected, 0);
  assert.equal(f.extra, 2);
  assert.equal(f.expectedSource, 'degree');
});

test('TERMINAL run (endpointDegrees [2,1] → expected 1): only the CONNECTED end is a defect, the free end is fine', () => {
  const t = openTube(12); // 2 open loops
  const r = checkOpenEdgeCaps([{ id: 'run-terminal', index: t.index, endpointDegrees: [2, 1] }]);
  assert.equal(r.ok, false);
  const f = r.findings.find((x) => x.kind === 'uncapped');
  assert.equal(f.expected, 1);
  assert.equal(f.extra, 1); // 2 open - 1 free = 1 connected-but-open end to cap
});

test('a WELL-CONNECTED through-run whose ends ARE capped (0 open loops, [2,2]) → ok, no false positive', () => {
  // both ends closed → boundaryLoops openLoops 0; expected 0 → nothing to flag.
  const capped = tubeCappedOneEnd(8);
  // cap the other end too by mirroring the fan (reuse fixture: cube stands in as a fully-closed shell)
  const r = checkOpenEdgeCaps([{ id: 'run', index: CUBE_OUT, endpointDegrees: [2, 2] }]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.findings.filter((x) => x.hard), []);
});

test('blind fallback is TAGGED so it is never mistaken for degree-derived truth', () => {
  const t = openTube(8);
  const r = checkOpenEdgeCaps([{ id: 'd', index: t.index }]); // no degree/freeEnds/declared
  const f = r.findings.find((x) => x.kind === 'uncapped');
  assert.equal(f.expectedSource, 'blind-default');
});

test('deterministic', () => {
  const t = openTube(9);
  assert.equal(JSON.stringify(checkOpenEdgeCaps([{ id: 'd', index: t.index, endpointDegrees: [2, 2] }])),
               JSON.stringify(checkOpenEdgeCaps([{ id: 'd', index: t.index, endpointDegrees: [2, 2] }])));
});

// ---- FUSED-MESH gate (Revisor WU-L4-B): per-vertex runId attribute, -1 accessory policy, 4 categories ----
// Fuse several sub-meshes into one buffer, stamping every vertex of a part with that part's runId.
function fuse(parts) {
  const positions = [], index = [], runId = [];
  let voff = 0;
  for (const p of parts) {
    const vc = p.positions.length / 3;
    for (const x of p.positions) positions.push(x);
    for (let k = 0; k < vc; k++) runId.push(p.runId);
    for (const ix of p.index) index.push(ix + voff);
    voff += vc;
  }
  return { positions, index, runId };
}

test('segmentTrianglesByRunId groups triangles by per-vertex runId; a cross-run triangle is mixed', () => {
  // two 1-triangle runs sharing no vertices + one triangle whose vertices span both → mixed.
  const positions = [0,0,0, 1,0,0, 0,1,0,  2,0,0, 3,0,0, 2,1,0];
  const runId = [0,0,0, 1,1,1];
  const index = [0,1,2, 3,4,5, 0,3,1]; // last spans run 0 and run 1
  const { groups, mixed } = segmentTrianglesByRunId(index, runId);
  assert.equal(groups.get(0).length, 3);
  assert.equal(groups.get(1).length, 3);
  assert.equal(mixed, 1);
});

test('fused mesh: a through-run open tube (degree [2,2]→0) → connected-open; a capped run → ok; accessory (-1) open → advisory', () => {
  const g = fuse([
    { ...openTube(10), runId: 0 },        // through-run, see-through
    { positions: CUBE, index: CUBE_OUT, runId: 1 }, // watertight run
    { ...openTube(8), runId: -1 },        // accessory loft, open (constructor bug)
  ]);
  const r = checkFusedShellOpenEdges(g, { degreesByRun: { 0: [2, 2], 1: [2, 2] } });
  assert.equal(r.ok, false); // run 0 hard
  const f0 = r.findings.find((f) => f.runId === 0);
  assert.equal(f0.kind, 'connected-open');
  assert.equal(f0.expected, 0);
  assert.equal(f0.extra, 2);
  assert.equal(f0.expectedSource, 'degree');
  assert.ok(!r.findings.some((f) => f.runId === 1 && f.hard)); // watertight run clean
  const acc = r.findings.find((f) => f.runId === -1);
  assert.equal(acc.kind, 'accessory-open');
  assert.equal(acc.hard, false);              // advisory by default
  assert.equal(r.accessoryOpenLoops, 2);
});

test('fused mesh: TERMINAL run (degree [2,1]→expected 1) flags only the connected end', () => {
  const g = fuse([{ ...openTube(12), runId: 7 }]); // 2 open loops
  const r = checkFusedShellOpenEdges(g, { degreesByRun: { 7: [2, 1] } });
  const f = r.findings.find((f) => f.runId === 7);
  assert.equal(f.expected, 1);
  assert.equal(f.extra, 1);
});

test('fused mesh: accessoryHard makes a -1 open loft BLOCK (opts.accessoryHard)', () => {
  const g = fuse([{ ...openTube(6), runId: -1 }]);
  const soft = checkFusedShellOpenEdges(g, {});
  const hard = checkFusedShellOpenEdges(g, { accessoryHard: true });
  assert.equal(soft.ok, true);   // advisory only
  assert.equal(hard.ok, false);  // blocks
});

test('fused mesh: a run with no degreesByRun entry falls back to blind-default (tagged)', () => {
  const g = fuse([{ ...openTube(8), runId: 3 }]);
  const r = checkFusedShellOpenEdges(g, {}); // no degreesByRun
  assert.equal(r.findings.find((f) => f.runId === 3).expectedSource, 'blind-default');
});

test('fused mesh deterministic', () => {
  const g = fuse([{ ...openTube(9), runId: 0 }, { ...openTube(7), runId: -1 }]);
  const f = () => checkFusedShellOpenEdges(g, { degreesByRun: { 0: [2, 2] } });
  assert.equal(JSON.stringify(f()), JSON.stringify(f()));
});

// ---- WELD + WHOLE-MESH closedness (the correct check for the non-indexed fused solid) ----
// Expand an indexed mesh into a NON-INDEXED triangle soup (every triangle's 3 vertices duplicated) —
// this is the shape system-3d actually produces (makeGeo never calls setIndex).
function soup(positions, index) {
  const out = [];
  for (const vi of index) out.push(positions[vi * 3], positions[vi * 3 + 1], positions[vi * 3 + 2]);
  return out;
}

test('weldByPosition tol 0 = exact: two distinct vertices stay DISTINCT; a slack tol fuses them (the danger)', () => {
  const positions = [0, 0, 0, 0.01, 0, 0]; // 10 mm apart
  assert.equal(weldByPosition(positions, 0).weldedVertices, 2, 'exact keeps distinct points distinct');
  // A slack tolerance near the half-wall ceiling (@3D: 5.08e-2 m) fuses them — closing a real hole by construction.
  assert.equal(weldByPosition(positions, 0.05).weldedVertices, 1, 'slack fuses genuinely distinct points — @3D danger');
});

test('checkFusedMeshClosed: a NON-INDEXED closed cube soup welds (tol 0) to 8 verts and reads CLOSED', () => {
  const cubeSoup = soup(CUBE, CUBE_OUT); // 36 verts, no index
  const r = checkFusedMeshClosed({ positions: cubeSoup });
  assert.equal(r.originalVertices, 36);
  assert.equal(r.weldedVertices, 8);
  assert.equal(r.boundaryEdges, 0);
  assert.equal(r.closed, true); // topologically watertight — proves see-through is NOT an open shell
});

test('checkFusedMeshClosed: a NON-INDEXED open tube soup is NOT closed — welding does NOT fabricate caps', () => {
  const t = openTube(12);
  const r = checkFusedMeshClosed({ positions: soup(t.positions, t.index) });
  assert.equal(r.closed, false);
  assert.ok(r.boundaryEdges > 0); // the two real cut ends survive the weld
});

test('WELDER VALIDATION (@3D): exact-weld distinguishes "welder works" from "welder closes everything"', () => {
  // A genuinely-open shell must STAY open at tol 0 (welder works) — a slack tol would falsely close it.
  const t = openTube(10);
  const exact = checkFusedMeshClosed({ positions: soup(t.positions, t.index) }, { weldTolerance: 0 });
  assert.equal(exact.closed, false, 'exact weld preserves the real hole (does not close everything)');
});

test('checkFusedMeshClosed accepts an already-indexed mesh too (remaps through the weld)', () => {
  const r = checkFusedMeshClosed({ positions: CUBE, index: CUBE_OUT });
  assert.equal(r.closed, true);
  assert.equal(r.weldedVertices, 8);
});
