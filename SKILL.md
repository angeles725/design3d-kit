---
name: design3d
description: "Trigger: /design3d, 'create/design a 3D model|equipment|scene', 'voxel/realistic pass', Blender modeling. Dual-track spec-first pipeline with gated passes."
user-invocable: true
license: Apache-2.0
metadata:
  author: cristian-angeles
  version: "1.6"
  changelog: "1.6 (2026-07-16, user-delegated adjudication of the cinemex-hvac-lorawan runs/2026-07-13-retro.md §Appended live sections): applied D2 renderer qualification before a renderer/driver switch produces gate evidence — pilot every content class, pixel-compare per class (GATES §Gate steps 2 Capture; from the 2026-07-15 L4 --gpu incident: broken canvas-texture sprites + DOM buttons after a 0.61% single-shot pilot; the 4.5x speedup stays worth re-qualifying, the flag is not forbidden); D3 a watchdog's liveness pattern must exclude the watchdog itself (PIPELINE §Execution modes watchdog = the executable clause + GATES §instrument corollaries = the family, now three; 2026-07-15 pgrep self-match); D4 the judge output contract is embedded VERBATIM in every reviewer brief, never as a pointer to the schema (ROLES §render-reviewer; A/B: two hand-normalized off-schema judges vs the L2 brief's first-try clean JSON); D5 named the post-refine-spec SCOPED P3 revalidation — validator sees only the touched fields (GATES §Verdict refine-spec + PIPELINE P3 row; the RTU amendment's minutes-long FAIL→fix→PASS); D6 one writer owns the working tree, the orchestrator extends scope with numbered extensions carrying pre-diagnosed root causes (ROLES §Fan-out; P6 L2: 11 items, one tree owner, 234/234 green). D1 (a gating command may never sit behind a pipe inside an && chain — cinemex L3) was found ALREADY LANDED in PIPELINE §Execution modes by an UNVERSIONED 2026-07-15 edit: not re-applied, recorded here + in LEARNINGS for the traceability that edit skipped. REJECTED: preflight/capture double-handling (the retro declares its own measurement debt; same shape as delta #4, which its own measurements killed). DEFERRED as engineering, not a doc delta: synthetic runs/ fixtures + tests for gate-state.mjs. 1.5 (2026-07-14, user feature): reusable-block LIBRARY (library/LIBRARY.md contract: check-before-building, extract-after-gating at P7, evidence-or-no-entry; library/INDEX.md registry seeded with 30+ blocks from cinemex, hotel voxel/realista and cuarto-frio-safran incl. the sims-floating-banner; extraction-traps guide) + SKILL step 0 + PIPELINE P7 extraction step. 1.4 (2026-07-14, user-delegated adjudication of the cinemex retro): applied deltas #4b (gate evidence at --dpr 3), #6 (LINEAGE RESET first-class in GATES), #12 (coverage check in gate step 0), #13 (DEFERRED-CORRECTIONS ledger rule), #14 (canonical representative copy), #15 (pass-label on locked→active), #16 (fail-loud input census), #17 (P7 harnesses are repo tools) + GLTFExporter caveats + measure-the-artifact/unit-conversion corollary; 6 staged learnings promoted→folded (see LEARNINGS §Active provenance); gate-state.mjs hardened per audit D2/D7 (track-aware ladder selection via anim-rig/optimization-export detection — blender path untested until a blender run exists — and PASS reviews now checked against spec quality_contract.global_min with assumed_thresholds fallback; regression-verified clean on cinemex 8/8 + damper 8/8). 1.3 (2026-07-14, user-authorized mid-run): retro deltas #3/#7/#8/#11 + audit fixes S1-S5/S10."
---

# design3d launcher

Thin launcher for the dual-track 3D design pipeline. The kit under `references/` is the single
source of truth — never improvise phases, gates, or track rules from memory.

## Activation Contract

- `/design3d <design> [threejs|blender] [new|continue]`, or any free-form request to create,
  iterate, or review a 3D model/equipment/scene.
- `/design3d <design> status` → run `assets/gate-state.mjs <design-dir>` and report its output.
- Resuming any design directory that contains `design-spec.yaml`.

## Hard Rules

1. Before any work, read `references/PIPELINE.md`, the active `references/TRACK-*.md`, and
   `LEARNINGS.md` **§Active ledger ONLY**. Active entries at `confirmed` or above are BINDING for
   the run. **NEVER read §Staged as authority** — it is the user's review queue, not a rulebook.
2. NO geometry before an approved DesignSpec — including animation-ready hierarchy with named
   pivots and 3–5 critical features, hard max 5 (`references/DESIGNSPEC.md`).
3. Pass-locked pipeline: advance only when the pass gate PASSES (`references/GATES.md`). A
   critical feature below its threshold FAILS the pass even with a high global score. Max 2
   correction retries per pass, then STOP and present evidence.
4. Multi-asset scenes: build ONE asset at a time, gate each before the next.
5. WSL2/no-GPU environments: NEVER screenshot WebGL via chrome-devtools MCP. Capture only via
   the track's harness (`capture.mjs`) over a local http server — never `file://`.
6. Never edit this kit mid-run, and **NEVER integrate your own lessons**. The P8 retro PROPOSES kit
   deltas AND STAGES LEARNINGS entries (`references/SELF-IMPROVEMENT.md` §Hard boundary — propose,
   never apply). **Nothing a run writes is binding until the USER promotes it.** A run may write to
   `LEARNINGS.md` §Staged and nowhere else; it may never promote a row into §Active.
7. Test-vs-render jurisdiction (`references/GATES.md`): if a human can judge it by looking at one
   image, RENDER it; if a human cannot count it at a glance, TEST it. Never simulate the renderer
   inside a test to predict a pixel.

## Decision Gates

| Fork | Rule |
|---|---|
| Track | Blender named or Blender MCP connected → blender · repo has `disenos/` or importmap HTML prototypes → threejs · else ask once |
| Mode | single tweak on existing design → quick · one new design → standard · scene or ≥3 assets → heavy (auto-escalate; announce, don't re-ask) |
| New vs continue | `design-spec.yaml` exists → continue (reconcile live state first) |

## Execution Steps

0. **Check the reusable-block LIBRARY** (`library/INDEX.md`) before authoring any mechanism or
   part it already covers; extract newly gated reusables back into it at P7
   (`library/LIBRARY.md` — check-before-building / extract-after-gating / evidence-or-no-entry).
1. Discover project overlays per the active `references/TRACK-*.md`; record paths (not copies) in the spec.
2. Reconcile live state: `design-spec.yaml` + `runs/progress.yaml` + engram `design3d/{design}/*`.
3. Run the P0–P8 DAG per `references/PIPELINE.md`, gating every pass per `references/GATES.md`.
4. Produce the delivery kit (P7, track-specific).
5. Run the retro (P8) per `references/SELF-IMPROVEMENT.md`.

## Output Contract

Delivery kit artifacts + result contract (`status`, `executive_summary`, `artifacts`,
`next_recommended`, `risks`) + retro written (`review-status: pending`) and LEARNINGS entries STAGED
for the user's decision — never appended to §Active by the run.

## References

`references/PIPELINE.md` · `references/DESIGNSPEC.md` · `references/GATES.md` ·
`references/TRACK-THREEJS.md` · `references/TRACK-BLENDER.md` · `references/ROLES.md` ·
`references/SELF-IMPROVEMENT.md` · templates in `assets/`
