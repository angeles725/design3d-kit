// library: pipeline-spine  (harness/pipeline-spine.mjs) — {CAD/foto/spec}→voxel→realista end-to-end orchestrator (investigador2, v1.19).
// source: the four investigations' unifying thesis — AI proposes via tools, a deterministic engine owns
//         coordinates, three.js only renders. This wires the CORE AXIS the doc calls the weak link:
//         intake → voxel/blockout → realista, with the scene_graph as the SINGLE carrier and a transform
//         gate guarding the realista step. Modules are INJECTED (pluggable, dependency-free): inv4
//         dxf-intake emits the entry scene, inv1 voxelize, inv3 de-box/realista. This closes the axis
//         demonstrated end-to-end (self-verifying, spatial-harness.example.mjs style).
// deps: spatial-harness (scene_graph carrier + validation), pass-parity (the transform gate, GATES §440).
import { SpatialHarness } from './spatial-harness.mjs';
import { checkPassParity } from './pass-parity.mjs';
import { checkDeBoxWinding } from './debox-winding.mjs';

// Object-level certainty SUMMARY (PROVENANCE-CONTRACT §2): an object's certainty is the WEAKEST prov among
// its per-quantity envelopes — absent-in-source (0) < inferred (1) < measured (2). A run that is
// width-MEASURED but height-ABSENT summarizes as 'absent-in-source' (the viewer must paint an object by its
// WORST field, never its best — a partly-unknown run is not "measured"). Returns null when the object carries
// no valid envelopes (untagged — distinct from a fully-measured object). Pure.
const _PROV_RANK = { 'absent-in-source': 0, inferred: 1, measured: 2 };
export function objectCertainty(fieldProvenance) {
  if (!fieldProvenance || typeof fieldProvenance !== 'object') return null;
  let weakest = null, weakestRank = Infinity;
  for (const env of Object.values(fieldProvenance)) {
    if (!env || typeof env !== 'object' || !(env.prov in _PROV_RANK)) continue;
    const rank = _PROV_RANK[env.prov];
    if (rank < weakestRank) { weakestRank = rank; weakest = env.prov; }
  }
  return weakest;
}

// PROVENANCE scan (references/PROVENANCE-CONTRACT.md §2/§3). Each per-quantity envelope on an object's
// `fieldProvenance` is {v, prov, raw?, snap?, deltaMm?}. Three spine duties here:
//  §2 invariant — `v === null` IFF `prov === 'absent-in-source'`; a violation is malformed provenance
//     (an INFER/MEASURED with a null value, or an absent field carrying a fabricated number) → block.
//  §2 summary  — per-object certainty = weakest envelope prov (objectCertainty), for the viewer legend.
//  §3 divergence — when a snap retained a raw, `deltaMm = |v−raw|·1000` is a SIGNAL a snap may have
//     masked a raw measurement error (P4); flag when `deltaMm >= snapDivergenceGateMm`.
// Pure/synchronous; reports only. Envelopes are threaded untouched (never collapsed to a bare number, §5.1).
export function scanProvenance(objects, gateMm) {
  const flags = [], malformed = [], certainty = {};
  for (const o of (objects || [])) {
    const fp = o?.fieldProvenance; if (!fp || typeof fp !== 'object') continue;
    const c = objectCertainty(fp); if (c) certainty[o.id] = c;                                  // §2 summary
    for (const [quantity, env] of Object.entries(fp)) {
      if (!env || typeof env !== 'object') continue;
      const absent = env.prov === 'absent-in-source';
      const isNull = env.v === null || env.v === undefined;
      if (absent !== isNull) malformed.push({ id: o.id, quantity, prov: env.prov, v: env.v }); // §2 invariant
      if (typeof env.deltaMm === 'number' && env.deltaMm >= gateMm)                             // §3 divergence
        flags.push({ id: o.id, quantity, deltaMm: env.deltaMm, v: env.v, raw: env.raw, snap: env.snap });
    }
  }
  return { flags, malformed, certainty };
}

// CO-REGISTRATION cross-check (PROVENANCE-CONTRACT §6, P5). Multi-sheet co-registration is a pure
// translation from ONE authoritative frame (meta.sheets). When two pipelines each carry an offset for the
// SAME source, they must AGREE within the audit gate — a larger gap is a co-registration DISAGREEMENT
// (fail-loud), never a silently-picked winner (Revisor COB-IM2: 20.1mm on sheet 14C at the 20mm gate).
// frames: [{ source, offset:[x,y,z]|number, pipeline }]. Offsets are meters (kit convention);
// deltaMm = ||Δoffset||·1000. Pure/synchronous; reports only.
export function crossCheckFrames(frames, gateMm = 20) {
  const offVec = (o) => Array.isArray(o) ? [o[0]||0, o[1]||0, o[2]||0] : [Number(o)||0, 0, 0];
  const bySource = new Map();
  for (const f of (frames || [])) { if (!f || f.source == null) continue;
    if (!bySource.has(f.source)) bySource.set(f.source, []); bySource.get(f.source).push(f); }
  const disagreements = []; let checked = 0;
  for (const [source, list] of bySource) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      checked++;
      const a = offVec(list[i].offset), b = offVec(list[j].offset);
      const deltaMm = Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]) * 1000;
      if (deltaMm > gateMm) disagreements.push({ source, pipelineA: list[i].pipeline, pipelineB: list[j].pipeline, deltaMm: Number(deltaMm.toFixed(2)) });
    }
  }
  return { ok: disagreements.length === 0, disagreements, checked };
}

/**
 * Run the CAD/foto/spec → voxel → realista spine. Each downstream module is injected; without it the
 * stage is marked PENDING (so the skeleton runs the parts that exist and shows what's still to plug in).
 * @param {{scene:object, voxelize?:Function, deBox?:Function, gateOpts?:object}} cfg
 *   scene    — inv4 dxf-intake emit shape OR a spec scene_graph. `objects[]` is the shared schema;
 *              `geometry[]`/`schedule[]`/`provenance` are additive and threaded through untouched.
 *   voxelize — (blockout) => voxels           (inv1 module; geometry/blockout → occupancy voxel)
 *   deBox    — (voxels, blockout) => realista  (inv3 module; voxel → realistic scene, transforms preserved)
 *   gateOpts — passed to checkPassParity (posTol, requireDN)
 * @returns {{stages:object, gate:object|null, ok:boolean, blockedAt?:string, provenance?:object}}
 */
export function runSpine({ scene, voxelize = null, deBox = null, gateOpts = {}, strict = true,
                           snapDivergenceGateMm = 9, divergencePolicy = 'warn', coRegisterGateMm = 20 } = {}) {
  const report = { stages: {}, gate: null, ok: false, provenance: scene?.provenance ?? null };

  // ENTRY — accept the dxf-intake superset (or a spec scene_graph); objects[] plugs straight in.
  const entryScene = { room: scene?.room ?? null, objects: scene?.objects ?? [] };
  // SIZE-RESOLUTION guard (#39 dxf-intake review): a placeholder size ([1,1,1] emitted before ATTRIB SIZE /
  // block-def bbox resolves it, tagged source.sizeSource:'placeholder') is meaningless for clash/clearance/
  // voxelize — it must NEVER silently flow into the voxel stage. Strict (default) blocks it.
  const unresolvedSize = entryScene.objects.filter(o => o?.source?.sizeSource === 'placeholder').map(o => o.id).sort();
  const harness = SpatialHarness.fromScene(entryScene);
  const v = harness.validateAll();
  report.stages.entry = { objects: entryScene.objects.length, valid: v.ok, violations: v.violations, unresolvedSize };
  if (!v.ok) { report.blockedAt = 'entry'; return report; }              // an illegal blockout NEVER proceeds to voxelize
  if (strict && unresolvedSize.length) { report.blockedAt = 'entry:unresolved-size'; return report; } // placeholder size never voxelizes

  // PROVENANCE (contract §2/§3) — surface snap-divergence + enforce the envelope invariant. Additive: the
  // fieldProvenance envelopes thread through untouched (harness toScene passthrough), never collapsed (§5.1).
  const prov = scanProvenance(entryScene.objects, snapDivergenceGateMm);
  report.stages.provenance = { divergenceFlags: prov.flags, malformed: prov.malformed, certainty: prov.certainty, gateMm: snapDivergenceGateMm, policy: divergencePolicy };
  if (prov.malformed.length) { report.blockedAt = 'entry:provenance-malformed'; return report; }        // §2: v null IFF absent-in-source
  if (divergencePolicy === 'block' && prov.flags.length) { report.blockedAt = 'entry:snap-divergence'; return report; } // §3: fail-loud policy

  // CO-REGISTER (contract §6, P5) — multi-sheet co-registration is pure translation from ONE authoritative
  // frame; two pipelines' offsets for the same source must AGREE. A disagreement beyond the audit gate is a
  // FAIL-LOUD, never a silently-picked winner. frames live on provenance.frames (or scene.frames).
  const frames = scene?.provenance?.frames ?? scene?.frames ?? [];
  if (frames.length) {
    const co = crossCheckFrames(frames, coRegisterGateMm);
    report.stages.coregister = { checked: co.checked, disagreements: co.disagreements, gateMm: coRegisterGateMm };
    if (!co.ok) { report.blockedAt = 'entry:coregister-disagreement'; return report; }  // offsets disagree > gate
  }

  // BLOCKOUT — the certified scene_graph is the carrier every downstream stage must preserve.
  const blockout = harness.toScene();
  report.stages.blockout = { source: 'harness.toScene', objects: blockout.objects.length,
    provenanceCarried: blockout.objects.filter(o => o.fieldProvenance).length }; // §5.1 envelopes survive entry→blockout

  // VOXELIZE (inv1) — blockout/geometry → occupancy voxel. PENDING until injected.
  if (typeof voxelize !== 'function') { report.stages.voxelize = { pending: true }; return report; }
  const voxels = voxelize(blockout);
  report.stages.voxelize = { done: true, cells: voxels?.cells ?? voxels?.length ?? null };

  // DE-BOX / REALISTA (inv3) — voxel → realistic scene (mesh detail added, transforms preserved). PENDING until injected.
  if (typeof deBox !== 'function') { report.stages.debox = { pending: true }; return report; }
  const realista = deBox(voxels, blockout);
  report.stages.debox = { done: true, objects: realista?.objects?.length ?? null };

  // GATE 1 — DATA: the realista pass MUST preserve the blockout's engineering data (GATES §440 / pass-parity).
  const parity = checkPassParity(blockout, realista, gateOpts);
  report.gate = parity;
  report.stages.realista_gate = { ok: parity.ok, drifts: parity.drifts.length, missing: parity.missing.length, extra: parity.extra.length };
  // GATE 2 — GEOMETRY: if the de-box emitted BUILT geometry (parts carrying positions/index), NO realista
  // mesh may be inside-out (inv3 checkDeBoxWinding via signedVolume — the superquadric-flip class). A
  // data-only de-box (no geometry) → SKIPPED, not failed.
  const wparts = (realista?.windingParts ?? realista?.parts)?.filter?.(p => p?.positions) ?? null;
  if (wparts && wparts.length) {
    const w = checkDeBoxWinding(wparts, gateOpts.winding ?? {});
    report.windingGate = w;
    report.stages.winding_gate = { ok: w.ok, insideOut: w.insideOut.length, open: w.open.length, checked: w.checked };
    report.ok = parity.ok && w.ok;
  } else {
    report.windingGate = { skipped: true, reason: 'no built geometry (data-only de-box)' };
    report.ok = parity.ok;
  }
  return report;
}
