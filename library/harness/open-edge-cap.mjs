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
