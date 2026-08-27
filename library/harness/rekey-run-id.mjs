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
