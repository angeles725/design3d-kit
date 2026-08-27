// library: rekey-run-id  (harness/rekey-run-id.mjs) — string-run-id → numeric-run-id degrees adapter (investigador2).
// source: P6 open-edge-cap seam, corrected to the real build (inv3 + @3D + Revisor measurement, 2026-08-27).
//   system-3d fuses 2033 ducts into 4 meshes; run identity lives in a PER-VERTEX `runId` attribute (Float32),
//   NOT in mesh.name/userData. inv3's fused-mesh gate checkFusedShellOpenEdges({positions,index,runId},
//   {degreesByRun, accessoryRunId:-1}) segments the fused mesh by that numeric attribute and looks up expected
//   open loops by NUMERIC runId. But endpoint topology is computed over the vectorizer's runs, keyed by inv3's
//   STRING run ids (endpointDegreesFromRuns(runs) → {stringRunId: endpointDegrees[]}). This adapter bridges the
//   two id spaces so the gate can consume degrees keyed exactly like its vertex attribute.
// deps: NONE. Pure, deterministic, offline. REPORTS the unmapped set; NEVER fabricates a numeric id.
//
// SPLIT (with inv3): inv3 owns endpointDegreesFromRuns (topology, string-keyed); inv2 owns this numeric re-key.
// The string↔numeric identity is @3D's (it is how system-3d assigns the per-vertex runId attribute).
// Accessories (2413 mitered stubs + 124 lofts) carry runId = -1 and are UNMAPPABLE by design: the gate excludes
// them via accessoryRunId:-1. This adapter passes a -1 mapping THROUGH untouched (it never invents or drops it)
// and never coerces a run with no mapping into a number — an unmapped string is reported, not guessed.

/**
 * Build the string→numeric runId map the SAME way system-3d assigns its per-vertex `runId` attribute: the
 * numeric runId IS THE INDEX into DATA.runs (`runs.forEach((r,i) => pushTube/pushBox(..., i))`, @3D verified
 * against all four geometry call sites). Derive from the ARRAY INDEX — never by parsing the string id: the
 * `'L4_' + 4-digit-index` correspondence is true today but is a NAMING property, not a contract; an inserted
 * or deleted run silently desyncs a parsed map while the array index stays correct. `geo` (network) and
 * `geoT` (terminals) SHARE this one index space over the same DATA.runs array (split by class, index NOT
 * reset), so the map is global and numeric ids are unique across both fused meshes.
 * @param {Array<{id:string}>} runs  DATA.runs (system-3d's run array; order defines the numeric id)
 * @returns {Object<string, number>}  {stringRunId: numericRunId=arrayIndex} — the idMap for reKeyToNumericRunId
 */
export function buildNumericRunIdMap(runs) {
  const map = {};
  (runs || []).forEach((r, i) => { if (r && r.id != null) map[r.id] = i; });
  return map;
}

const _d3 = (p, q) => Math.hypot(p[0]-q[0], p[1]-q[1], p[2]-q[2]);
// endpoint delta between two runs, orientation-agnostic (p0/p1 may be stored either way): the smaller of the
// parallel (p0-p0,p1-p1) and swapped (p0-p1,p1-p0) max-endpoint distance, plus a length delta.
function _endpointDelta(a, b) {
  const parallel = Math.max(_d3(a.p0, b.p0), _d3(a.p1, b.p1));
  const swapped  = Math.max(_d3(a.p0, b.p1), _d3(a.p1, b.p0));
  const maxPos = Math.min(parallel, swapped);
  const lenA = a.L ?? _d3(a.p0, a.p1), lenB = b.L ?? _d3(b.p0, b.p1);
  return { maxPos: Number(maxPos.toFixed(4)), lenDelta: Number(Math.abs(lenA - lenB).toFixed(4)) };
}

/**
 * Validate that a MATCHING id actually names the SAME run, BY GEOMETRY (not by name). @3D's catch: the 2033
 * DATA.runs ids are a position template (`'L4_' + 4-digit index`), so if inv3's vectorizer uses the same
 * convention, EVERY id matches and reKey's `unmapped[]` stays empty EVEN IF the two producers (the DATA blob
 * is extracted by `probes-creador`, not necessarily inv3's vectorizer) numbered DIFFERENT run sets. Fail-loud
 * on "id not found" does NOT catch "id found but different run" — that is silent and green. So for each shared
 * id, require the two extractions' endpoints (p0/p1) + length to agree within `posTol`.
 * FRAME TRAP: the DATA blob applies per-plane sheet offsets (14A [0,0], 14B [37.25,-0.5], 14C [33.8,-1.05]).
 * Both sides MUST be compared in the SAME frame — if one isn't offset-aligned, 14B/14C disagree by tens of
 * metres for the same run. A large SYSTEMATIC per-plane delta is itself the diagnostic (frame mismatch, not
 * a wrong run).
 * SAMPLING (@3D): a SINGLE sample does NOT decide same-vs-different producer — two independent extractions
 * agree on the big obvious TRUNKS and diverge on small branches / sheet overlaps / anything threshold-bound,
 * so a lone sample landing on a trunk passes green and proves nothing. Use a small but DELIBERATELY
 * STRATIFIED `sample`: a few runs per SHEET (14A/14B/14C — 14C is INFER not CERT, likeliest to diverge) and
 * per CLASS (trunk/branch/small — small is where vectorization thresholds separate). 10–15 chosen this way
 * beat 100 random. The caller (inv3, who has sheet+class) picks the sample.
 * RESULT IS NOT BINARY (`verdict`): 'all-match' = same producer OR two that converge; 'none-match' =
 * different producers (compose is not a naming problem); 'partial' = the sets OVERLAP but DIVERGE — a 1:1
 * compose is FALSE exactly on the runs that matter, and the ONLY outcome where the gate can look healthy and
 * not be. Treat 'partial' as the alarm, not just `ok:false`.
 * @param {Array<{id:string,p0:number[],p1:number[],L?:number}>} runsA  one extraction (e.g. inv3 vectorizer)
 * @param {Array<{id:string,p0:number[],p1:number[],L?:number}>} runsB  the other (e.g. DATA.runs), same frame
 * @param {{posTol?:number, sample?:string[], key?:string}} [opts]  posTol metres (default 0.05); optional stratified id subset
 * @returns {{ok:boolean, verdict:'all-match'|'none-match'|'partial'|'none-checked', mismatches:Array<{id:string,maxPos:number,lenDelta:number}>, matched:number, checked:number, shared:number}}
 */
export function validateRunIdentityByGeometry(runsA, runsB, opts = {}) {
  const { posTol = 0.05, sample = null, key = 'id' } = opts;
  const byIdB = new Map();
  for (const r of (runsB || [])) if (r && r[key] != null) byIdB.set(String(r[key]), r);
  const mismatches = []; let checked = 0, shared = 0;
  const list = (runsA || []).filter(a => a && a[key] != null && (!sample || sample.map(String).includes(String(a[key]))));
  for (const a of list) {
    const b = byIdB.get(String(a[key]));
    if (!b) continue;                                 // not shared — reKey's unmapped[] owns absence, not this
    shared++;
    if (!a.p0 || !a.p1 || !b.p0 || !b.p1) continue;   // no endpoints to compare — skip (nothing asserted)
    checked++;
    const d = _endpointDelta(a, b);
    if (d.maxPos > posTol) mismatches.push({ id: a[key], ...d });
  }
  const matched = checked - mismatches.length;
  const verdict = checked === 0 ? 'none-checked'
    : mismatches.length === 0 ? 'all-match'
    : matched === 0 ? 'none-match'
    : 'partial';                                       // overlapping-but-diverging — the dangerous case
  return { ok: mismatches.length === 0, verdict, mismatches, matched, checked, shared };
}

/**
 * Re-key per-string-run endpoint degrees into per-NUMERIC-run degrees matching system-3d's per-vertex runId.
 * @param {Object<string, number[]>} degreesByStringId  endpointDegreesFromRuns output ({stringRunId: degrees[]})
 * @param {Object<string, number>} idMap  @3D's string→numeric runId map ({stringRunId: numericRunId})
 * @returns {{ byRun: Object<number, number[]>, unmapped: string[] }}
 *   byRun — {numericRunId: endpointDegrees[]} for inv3's checkFusedShellOpenEdges `degreesByRun`.
 *   unmapped — string run ids with NO numeric mapping (never fabricated; surfaced so the caller decides).
 */
export function reKeyToNumericRunId(degreesByStringId, idMap) {
  const byRun = {}, unmapped = [];
  const map = idMap || {};
  for (const [stringId, degrees] of Object.entries(degreesByStringId || {})) {
    const numericId = map[stringId];
    if (numericId === undefined || numericId === null || Number.isNaN(Number(numericId))) {
      unmapped.push(stringId);                       // no numeric id — report, never fabricate one
      continue;
    }
    byRun[numericId] = degrees;                       // -1 passes through untouched (accessory-marked mapping)
  }
  return { byRun, unmapped };
}
