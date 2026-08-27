// library: open-edge-cap  (harness/open-edge-cap.mjs) — realista SEE-THROUGH / UNCAPPED-SHELL gate (investigador3, v1.19).
// source: Revisor's COB-IM2 L4 real-project retro P6 (2026-08-27, routed via inv1). The live viewer showed
//         "see-through / hollow duct" shells. Revisor MEASURED that it is NOT a winding defect: signedVolume
//         over 1028 runs was 583+/0- (winding correct), and FrontSide vs DoubleSide differ only 1.3% of
//         pixels. The real cause is OPEN-ENDED duct shells — you see through the CUTS. So debox-winding /
//         geom-verify signedVolume PASS this defect (they protect a future winding regression, not this one).
//         The fix in the renderer is section/stencil CAPS, not winding reversal; this gate is the deterministic
//         detector that tells the modeler WHICH shells are missing a cap.
// what: checkOpenEdgeCaps(parts, opts) counts each shell's OPEN BOUNDARY LOOPS (connected components of its
//       valence-1 edges) and gates them AGAINST THE DECLARED EXPECTATION — a legitimately-cut duct HAS open
//       edges (its ends are covered by the neighbouring fitting/run), so the gate must NOT demand
//       zero-open-edges. It flags only the EXTRA open loops beyond what the run declares as covered
//       (`expectedOpenLoops`) — those are the uncapped, see-through ends — plus genuine TEARS (a boundary
//       that is not a clean cycle = a hole in the middle of a surface) and non-manifold edges. REPORTS-ONLY,
//       zero-dep, deterministic. The topology companion to debox-winding (orientation) and geom-verify
//       (integrity): together they fully gate a realista shell (wound right + not torn + ends accounted for).
// deps: NONE. Pure integer/graph math over a flat triangle index. Node-testable in the kit tree.

/**
 * Trace the open boundary of a triangle mesh and classify its openings.
 * An OPEN edge is an undirected edge shared by exactly ONE triangle (valence 1); a MANIFOLD interior edge
 * has valence 2; valence >= 3 is NON-MANIFOLD. The open edges form the shell's boundary; their connected
 * components are its OPENINGS. A clean opening is a simple CYCLE (every boundary vertex has open-degree 2);
 * anything else (a vertex with open-degree 1 = a dangling path, or >2 = a pinch) is a genuine TEAR, not a
 * legitimate cut end.
 * @param {ArrayLike<number>} index  flat triangle indices (length a multiple of 3).
 * @returns {{openEdges:number, nonManifoldEdges:number, openLoops:number, cleanLoops:number, torn:number}}
 */
export function boundaryLoops(index) {
  const val = new Map();               // "a_b" (a<b) -> valence
  const ekey = (p, q) => (p < q ? `${p}_${q}` : `${q}_${p}`);
  for (let i = 0; i < index.length; i += 3) {
    const t = [index[i], index[i + 1], index[i + 2]];
    for (let k = 0; k < 3; k++) { const kk = ekey(t[k], t[(k + 1) % 3]); val.set(kk, (val.get(kk) || 0) + 1); }
  }
  // Boundary graph: adjacency among vertices joined by an OPEN (valence-1) edge.
  const adj = new Map();               // vertex -> Set(neighbour vertex)
  let openEdges = 0, nonManifoldEdges = 0;
  for (const [kk, v] of val) {
    if (v === 1) {
      openEdges++;
      const [a, b] = kk.split('_').map(Number);
      if (!adj.has(a)) adj.set(a, new Set());
      if (!adj.has(b)) adj.set(b, new Set());
      adj.get(a).add(b); adj.get(b).add(a);
    } else if (v >= 3) nonManifoldEdges++;
  }
  // Connected components of the boundary graph = openings. A component is a CLEAN loop iff every vertex in
  // it has degree exactly 2 (a simple cycle); otherwise it is TORN.
  const seen = new Set();
  let openLoops = 0, cleanLoops = 0, torn = 0;
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    openLoops++;
    let clean = true;
    const stack = [start]; seen.add(start);
    while (stack.length) {
      const u = stack.pop();
      if (adj.get(u).size !== 2) clean = false;      // dangling (1) or pinch (>2) => not a simple cycle
      for (const w of adj.get(u)) if (!seen.has(w)) { seen.add(w); stack.push(w); }
    }
    if (clean) cleanLoops++; else torn++;
  }
  return { openEdges, nonManifoldEdges, openLoops, cleanLoops, torn };
}

/**
 * How many of a run's boundary openings are LEGITIMATELY open — i.e. genuinely FREE ends, not covered by a
 * neighbour/fitting. Revisor's COB-IM2 rule: a free end is a run endpoint whose connectivity DEGREE is < 2
 * (degree>=2 means another run/fitting joins there and must cover that opening). A through-run (both ends
 * degree>=2) has 0 free ends → BOTH its shell openings should be covered; a terminal (one end degree<2) has
 * 1 free end. A fixed default (e.g. 2) would false-flag every well-connected through-run and report the whole
 * network as broken — so the expectation is DERIVED from topology, never assumed.
 * @param {number[]} endpointDegrees  connectivity degree at each of the run's endpoints.
 * @returns {number} count of free ends (degree < 2).
 */
export function expectedOpenLoopsFromDegrees(endpointDegrees) {
  return (endpointDegrees || []).filter((d) => d < 2).length;
}

// Resolve a part's expected free-open-loop count, preferring real topology over any assumption.
function resolveExpected(p, defExp) {
  if (Array.isArray(p.endpointDegrees)) return { expected: expectedOpenLoopsFromDegrees(p.endpointDegrees), source: 'degree' };
  if (typeof p.freeEnds === 'number') return { expected: p.freeEnds, source: 'freeEnds' };
  if (typeof p.expectedOpenLoops === 'number') return { expected: p.expectedOpenLoops, source: 'declared' };
  return { expected: defExp, source: 'blind-default' };
}

/**
 * Gate a set of realista shells for uncapped / see-through ends and tears, against each shell's expected
 * FREE-open-loop count. REPORTS-ONLY: it names the shells a modeler must cap; it never mutates or adds a cap.
 *
 * The expectation is DERIVED per part, in priority order (Revisor's rule — never a blind default):
 *   1. `endpointDegrees:number[]` → expected = count of endpoints with degree < 2 (the correct source).
 *   2. `freeEnds:number`          → use it directly (precomputed free-end count).
 *   3. `expectedOpenLoops:number` → an explicitly declared count.
 *   4. otherwise `opts.defaultExpectedOpenLoops` — a BLIND fallback; such findings are tagged
 *      `expectedSource:'blind-default'` so they are never mistaken for topology-derived truth.
 * A shell needs a run-id→degree mapping threaded from the build to use path 1; without it the gate falls back
 * and says so. The gate flags:
 *   - EXTRA open loops   (openLoops - expectedOpenLoops > 0)  → uncapped, see-through ends  → HARD
 *   - TORN boundaries    (an opening that is not a clean cycle = a hole in a surface)        → HARD
 *   - NON-MANIFOLD edges (a shared edge with valence >= 3)                                   → HARD
 *   - MISSING openings   (openLoops < expectedOpenLoops = a cap where a connection was meant) → SOFT/advisory
 * A part with no index (non-indexed soup) has no shared-edge topology to trace → SKIPPED (reported), never
 * silently passed (mirrors the kit's "no-hook = SKIP not pass" rule).
 *
 * @param {{id:string, index?:ArrayLike<number>|null, expectedOpenLoops?:number, closed?:boolean}[]} parts
 * @param {{defaultExpectedOpenLoops?:number, emit?:boolean}} [opts]
 *        defaultExpectedOpenLoops — used when a part omits `expectedOpenLoops`. Default 0 (a shell with no
 *        declared connections must be watertight); set per-scene when most parts are through-runs.
 * @returns {{ok:boolean, checked:number, skipped:string[],
 *            findings:{id:string, kind:'uncapped'|'torn'|'non-manifold'|'over-capped', hard:boolean,
 *                      openLoops:number, expected:number, extra:number, reason:string, suggestion:string}[]}}
 */
export function checkOpenEdgeCaps(parts, opts = {}) {
  const defExp = opts.defaultExpectedOpenLoops ?? 0;
  const emit = opts.emit ?? true;
  const findings = [];
  const skipped = [];
  let checked = 0;

  for (const p of parts || []) {
    if (!p || p.index == null) { if (p) skipped.push(p.id); continue; }
    checked++;
    const b = boundaryLoops(p.index);
    const { expected, source } = resolveExpected(p, defExp);
    const extra = Math.max(0, b.openLoops - expected);

    if (extra > 0) findings.push({ id: p.id, kind: 'uncapped', hard: true, expectedSource: source,
      openLoops: b.openLoops, expected, extra,
      reason: `${b.openLoops} open boundary loop(s) but only ${expected} free end(s) expected (${source}) — ${extra} connected end(s) render open/see-through and must be covered`,
      suggestion: 'add a section/stencil cap to the connected end(s) that a neighbour/fitting should cover (do NOT reverse winding); a genuinely terminal free end may stay open' });

    if (b.torn > 0) findings.push({ id: p.id, kind: 'torn', hard: true, expectedSource: source,
      openLoops: b.openLoops, expected, extra: 0,
      reason: `${b.torn} boundary opening(s) are not clean cycles — a hole/tear in the surface, not a cut end`,
      suggestion: 'weld duplicate vertices along the tear / close the hole; a legitimate cut end is a simple loop' });

    if (b.nonManifoldEdges > 0) findings.push({ id: p.id, kind: 'non-manifold', hard: true, expectedSource: source,
      openLoops: b.openLoops, expected, extra: 0,
      reason: `${b.nonManifoldEdges} non-manifold edge(s) (valence >= 3)`,
      suggestion: 'split the shared edge / remove the extra coincident face' });

    if (b.openLoops < expected) findings.push({ id: p.id, kind: 'over-capped', hard: false, expectedSource: source,
      openLoops: b.openLoops, expected, extra: 0,
      reason: `only ${b.openLoops} open loop(s) but ${expected} free end(s) expected (${source}) — an end may be capped where a free terminal/connection was expected`,
      suggestion: 'confirm the run topology; a cap over a real free terminal or port hides/blocks it' });
  }

  // Stable order: hard first, then by id, then kind.
  findings.sort((a, c) => (c.hard - a.hard) || String(a.id).localeCompare(String(c.id)) || a.kind.localeCompare(c.kind));
  const ok = findings.every((f) => !f.hard);
  if (emit && !ok) console.error('[open-edge-cap] uncapped/torn shells (see-through defect, NOT winding): '
    + JSON.stringify(findings.filter((f) => f.hard)));
  return { ok, checked, skipped, findings };
}

/**
 * Thin three adapter: extract each mesh's index (welded geometry required for a meaningful boundary) and gate.
 * A mesh with no index is reported as skipped — weld by distance first, then gate.
 * @param {import('three').Object3D} group  a deBox() output group.
 * @param {(o:import('three').Object3D)=>number} [expectedOf]  optional: derive expectedOpenLoops per mesh.
 * @returns {ReturnType<typeof checkOpenEdgeCaps>}
 */
export function checkGroupOpenEdgeCaps(group, expectedOf = null, opts = {}) {
  const parts = [];
  group.traverse?.((o) => {
    const g = o.geometry;
    if (g && g.attributes && g.attributes.position) {
      parts.push({ id: o.name || o.uuid, index: g.index ? g.index.array : null,
        expectedOpenLoops: expectedOf ? expectedOf(o) : undefined });
    }
  });
  return checkOpenEdgeCaps(parts, opts);
}

// ---- FUSED-MESH gate (Revisor WU-L4-B). ---------------------------------------------------------------
// system-3d builds 2033 ducts as 4 FUSED meshes; run identity is a PER-VERTEX `runId` Float32 attribute
// (NOT .name / userData — @3D measured this). Accessories push runId=-1 (2413 mitered stubs + 124
// constructor-open lofts) and are unmappable to a run by design. This gate SEGMENTS a fused mesh by that
// attribute and gates each run's boundary against its expected free ends, with the -1 accessory policy.
// Run it on the ACTIVE-CLIPPED (visible) geometry so a clip plane's cuts surface as real open loops.

/**
 * Group a fused mesh's triangles by their per-vertex runId. A triangle is assigned to a run only when all
 * three vertices agree; a triangle spanning two runs is a SEAM triangle (counted, not per-run gated).
 * @param {ArrayLike<number>} index  flat triangle indices.
 * @param {ArrayLike<number>} runId  per-vertex run id (length = vertex count); accessories carry -1.
 * @returns {{groups:Map<number, number[]>, mixed:number}}  runId -> flat sub-index; mixed = seam-tri count.
 */
export function segmentTrianglesByRunId(index, runId) {
  const groups = new Map();
  let mixed = 0;
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i], b = index[i + 1], c = index[i + 2];
    const ra = runId[a];
    if (ra === runId[b] && ra === runId[c]) {
      let g = groups.get(ra);
      if (!g) { g = []; groups.set(ra, g); }
      g.push(a, b, c);
    } else mixed++;
  }
  return { groups, mixed };
}

/**
 * Per-run topological open-shell gate over a fused duct mesh (segments by the per-vertex runId attribute).
 *
 * ⚠️ SCOPE CORRECTION (@3D measured the real system-3d build, 2026-08-27 — earlier claims were wrong):
 *   1. CLIP-CUTS ARE RENDER-TIME, NOT TOPOLOGY. system-3d's bay clip is a render clipping plane; the fused
 *      solid is WHOLE, so a clip cut is NEVER an open edge in the mesh. This gate CANNOT and MUST NOT be
 *      used to catch the WU-L4-B "see-through" defect — that is a RENDER/PIXEL check (framebuffer,
 *      render-is-authority), outside the kit's offline topology surface. A topology gate claiming to catch
 *      a render-time defect goes green and MISLEADS.
 *   2. NON-INDEXED input: system-3d's mesh has NO index — every triangle is an island, so this gate is only
 *      meaningful after WELD-BY-POSITION (see `weldByPosition` / `checkFusedMeshClosed`). Feed a welded index.
 *   3. VALIDITY DEPENDS ON STRUCTURE: per-run segmentation is correct ONLY when each run is a SEPARATE
 *      self-closed shell. On a CONTINUOUS manifold it false-positives at every junction seam — use the
 *      whole-mesh `checkFusedMeshClosed` there instead.
 * What it legitimately does (welded, separate-shell inputs): flags a run whose shell is genuinely
 * TOPOLOGICALLY OPEN — a missing cap, e.g. the pre-B1 constructor-open lofts (`accessory-open`). It is a
 * closedness / regression check, NOT a clip-cut or see-through detector.
 *
 * REPORTS-ONLY, deterministic. Categories: (a) TERMINAL free end (degree<2) not flagged; degree>=2 openings
 * `connected-open`; runId===accessoryRunId open shells `accessory-open` (advisory unless opts.accessoryHard).
 *
 * @param {{positions?:ArrayLike<number>, index:ArrayLike<number>, runId:ArrayLike<number>}} geom
 * @param {{degreesByRun?:Record<number,number[]>, accessoryRunId?:number, defaultExpectedOpenLoops?:number,
 *          accessoryHard?:boolean, emit?:boolean}} [opts]
 * @returns {{ok:boolean, runs:{runId:number, openLoops:number, expected:number, extra:number, source:string}[],
 *            findings:object[], accessoryOpenLoops:number, mixedTriangles:number, checkedRuns:number}}
 */
export function checkFusedShellOpenEdges(geom, opts = {}) {
  const { index, runId } = geom;
  const accessoryRunId = opts.accessoryRunId ?? -1;
  const degreesByRun = opts.degreesByRun || {};
  const defExp = opts.defaultExpectedOpenLoops ?? 0;
  const accessoryHard = opts.accessoryHard ?? false;
  const emit = opts.emit ?? true;

  const { groups, mixed } = segmentTrianglesByRunId(index, runId);
  const findings = [];
  const runs = [];
  let accessoryOpenLoops = 0;

  for (const [rid, subIndex] of groups) {
    const b = boundaryLoops(subIndex);

    if (rid === accessoryRunId) {
      accessoryOpenLoops += b.openLoops;
      if (b.openLoops > 0) findings.push({ runId: rid, kind: 'accessory-open', hard: accessoryHard,
        openLoops: b.openLoops, expected: 0, extra: b.openLoops,
        reason: `accessory geometry (runId=${accessoryRunId}) has ${b.openLoops} open loop(s) — constructor-open loft/stub, no end caps`,
        suggestion: 'cap the accessory ends (B1: 2 quads/end); accessory geometry is not per-run coverage-gated' });
      if (b.nonManifoldEdges > 0) findings.push({ runId: rid, kind: 'non-manifold', hard: true,
        openLoops: b.openLoops, expected: 0, extra: 0,
        reason: `${b.nonManifoldEdges} non-manifold edge(s) in accessory geometry`, suggestion: 'split the shared edge' });
      continue;
    }

    const degrees = degreesByRun[rid];
    const expected = degrees ? expectedOpenLoopsFromDegrees(degrees) : defExp;
    const source = degrees ? 'degree' : 'blind-default';
    const extra = Math.max(0, b.openLoops - expected);
    runs.push({ runId: rid, openLoops: b.openLoops, expected, extra, source });

    if (extra > 0) findings.push({ runId: rid, kind: 'connected-open', hard: true, expectedSource: source,
      openLoops: b.openLoops, expected, extra,
      reason: `run ${rid}: ${b.openLoops} open loop(s), ${expected} free end(s) expected (${source}) — ${extra} connected end(s) open/see-through, must be section-capped (clip-induced or lost-neighbour-coverage)`,
      suggestion: 'section/stencil cap the connected open end(s); run on ACTIVE-CLIPPED geometry so clip cuts appear as loops' });
    if (b.torn > 0) findings.push({ runId: rid, kind: 'torn', hard: true, expectedSource: source,
      openLoops: b.openLoops, expected, extra: 0,
      reason: `run ${rid}: ${b.torn} boundary opening(s) are not clean cycles — a tear, not a cut end`, suggestion: 'weld/close the tear' });
    if (b.nonManifoldEdges > 0) findings.push({ runId: rid, kind: 'non-manifold', hard: true, expectedSource: source,
      openLoops: b.openLoops, expected, extra: 0,
      reason: `run ${rid}: ${b.nonManifoldEdges} non-manifold edge(s)`, suggestion: 'split the shared edge' });
  }

  findings.sort((a, c) => (c.hard - a.hard) || (a.runId - c.runId) || String(a.kind).localeCompare(String(c.kind)));
  const ok = findings.every((f) => !f.hard);
  if (emit && !ok) console.error('[open-edge-cap] fused see-through/uncapped shells (WU-L4-B): '
    + JSON.stringify(findings.filter((f) => f.hard)));
  return { ok, runs, findings, accessoryOpenLoops, mixedTriangles: mixed, checkedRuns: runs.length };
}

// ---- WELD + WHOLE-MESH closedness (the correct topological check for the non-indexed fused solid). ------
// system-3d's fused mesh is NON-INDEXED (position/normal/color/runId per vertex, no setIndex); every triangle
// is an island, so a raw boundary count is ~127,600 false opens. Weld coincident vertices FIRST.
// WELD TOLERANCE = 0 (exact bit-equality) by default, per @3D: within each closed primitive, coincident
// vertices come from the SAME expression (pushBox reuses v[k]; loft caps reuse A[i]/B[i]; pushTube recomputes
// P(t,k) identically) → identical Float32, no drift to weld. A LARGE tolerance is DANGEROUS here, not robust:
// the 2413 mitered stubs INTERPENETRATE the runs they join, so slack welding fuses genuinely distinct surfaces
// and CLOSES A REAL HOLE — the exact defect the gate exists to find (green by construction). Smaller is always
// correct. Safe window if an epsilon is unavoidable: (7.63e-6, 5.08e-2) m; 1e-4 sits mid-decades.

/**
 * Weld coincident vertices, returning a remap old-vertex-index -> welded-vertex-index. Default tolerance 0 =
 * exact equality (string key of the raw coordinates); tolerance > 0 quantizes to a grid of that size.
 * @param {ArrayLike<number>} positions  flat [x,y,z,...].
 * @param {number} [tolerance=0]  metres; 0 = exact. Keep it as SMALL as possible (see the warning above).
 * @returns {{remap:number[], weldedVertices:number, originalVertices:number}}
 */
export function weldByPosition(positions, tolerance = 0) {
  const n = positions.length / 3;
  const map = new Map();
  const remap = new Array(n);
  let next = 0;
  const q = tolerance > 0 ? (v) => Math.round(v / tolerance) : (v) => v;
  for (let i = 0; i < n; i++) {
    const k = `${q(positions[i * 3])},${q(positions[i * 3 + 1])},${q(positions[i * 3 + 2])}`;
    let vi = map.get(k);
    if (vi === undefined) { vi = next++; map.set(k, vi); }
    remap[i] = vi;
  }
  return { remap, weldedVertices: next, originalVertices: n };
}

/**
 * Whole-mesh topological CLOSEDNESS of a fused solid — the correct, non-speculative check for system-3d's
 * continuous non-indexed mesh. Welds by position (default exact), then counts the boundary over the WHOLE
 * mesh (not per-run, which false-positives at junction seams on a continuous manifold). `closed:true` (0
 * boundary edges, no non-manifold) PROVES the see-through is NOT a topological hole — it rules out the
 * open-shell hypothesis (complements Revisor's signedVolume 583+/0-) and points the fix at the render/clip
 * layer. `closed:false` is a genuine topological defect (a real missing-cap hole / regression). REPORTS-ONLY.
 *
 * @param {{positions:ArrayLike<number>, index?:ArrayLike<number>}} geom  index optional (non-indexed => soup).
 * @param {{weldTolerance?:number, emit?:boolean, label?:string}} [opts]  weldTolerance default 0 (exact).
 * @returns {{closed:boolean, boundaryEdges:number, openLoops:number, nonManifoldEdges:number,
 *            weldedVertices:number, originalVertices:number, weldTolerance:number}}
 */
export function checkFusedMeshClosed(geom, opts = {}) {
  const { positions } = geom;
  const tol = opts.weldTolerance ?? 0;
  const { remap, weldedVertices, originalVertices } = weldByPosition(positions, tol);
  // Non-indexed soup -> triangles are consecutive vertex triples (sequential source index).
  const src = geom.index ?? Array.from({ length: originalVertices }, (_, i) => i);
  const index = Array.from(src, (v) => remap[v]);
  const b = boundaryLoops(index);
  const closed = b.openEdges === 0 && b.nonManifoldEdges === 0;
  if ((opts.emit ?? true) && !closed) {
    console.error(`[open-edge-cap] fused mesh NOT closed (${opts.label || 'mesh'}): `
      + `${b.openEdges} boundary edge(s), ${b.openLoops} loop(s), ${b.nonManifoldEdges} non-manifold `
      + `(weld tol ${tol}, ${originalVertices}->${weldedVertices} verts) — a genuine topological hole, NOT a clip-cut`);
  }
  return { closed, boundaryEdges: b.openEdges, openLoops: b.openLoops, nonManifoldEdges: b.nonManifoldEdges,
    weldedVertices, originalVertices, weldTolerance: tol };
}
