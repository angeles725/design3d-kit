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
export function runSpine({ scene, voxelize = null, deBox = null, gateOpts = {}, strict = true } = {}) {
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

  // BLOCKOUT — the certified scene_graph is the carrier every downstream stage must preserve.
  const blockout = harness.toScene();
  report.stages.blockout = { source: 'harness.toScene', objects: blockout.objects.length };

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
