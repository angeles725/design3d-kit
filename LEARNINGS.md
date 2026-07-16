# design3d LEARNINGS ledger

Two sections, two different powers. **A run may only write to §Staged.** Nothing a run learns becomes
binding until the USER promotes it. See `references/SELF-IMPROVEMENT.md` §Hard boundary.

## Load rule (binding)

At run start (P0), read **§Active ledger ONLY**. Every Active entry with status `confirmed×N` (N≥1)
or `PROMOTE` is a BINDING house rule for the run — treat it as if written in the active TRACK file.
Active entries with status `new` are advisory. `rejected` entries are dead — do not apply.

**§Staged is invisible to a run.** It is a review queue for the user, not a rulebook. Never load it,
never cite it as authority, never let a run promote its own row.

## Entry format

One table row per learning:

| date | project | design | track | pass | origin | how | learning | evidence | status |
|---|---|---|---|---|---|---|---|---|---|

- **project** — the repo/project the run lived in. A lesson from a Three.js HVAC scene is not
  automatically law for a Blender character run; the reader must be able to see the blast radius.
- **origin** — run + lineage + attempt (e.g. `surface L2 a3`) so the claim is auditable.
- **how** — how it surfaced: `blind-review-defect` · `wasted-retry` · `mechanical-failure` ·
  `user-correction` · `pre-review-catch` · `improvised-win` (a practice the run invented that
  measurably worked — not every lesson is a failure, and a vocabulary of only failure modes forces
  a false provenance onto the ones that are not). A rule you cannot trace is a rule you cannot
  revoke.
- **learning** — one imperative sentence (a rule, not a story).
- **evidence** — file/screenshot/review pointer that proves it, graded with a certainty marker:
  `[measured]` (an artifact on disk anyone can re-open — the pointer IS the proof) >
  `[session-observed]` (really happened, but left no artifact; the observation is testimony) >
  `[inferred]` (deduced, never directly seen). **A claim with no citation takes the LOWEST
  marker.** Existing rows already use this grading informally (`measured:` / `session-observed`
  prefixes) — they remain valid as written; do NOT rewrite existing rows to the bracketed form.
- **status lifecycle** — `staged` → *(USER promotes)* → `new` → `confirmed×N` (bumped when a later
  run re-observes it) → `PROMOTE` (at ×2, flag for folding into the proper `references/` file) →
  `promoted` (folded; prune the row on the next retro) · `rejected` (disproven — keep as tombstone).

## Staged (pending user decision — NOT loaded at P0, NOT binding)

| date | project | design | track | pass | origin | how | learning | evidence | status |
|---|---|---|---|---|---|---|---|---|---|
| 2026-07-16 | design3d-kit | (synthetic fixtures) | blender | (tooling) | fixtures round, blender-track test | pre-review-catch | Document what a Blender-track reviewer truthfully records for `mechanical.console_clean`/`budget_pass` — gate-state requires both `=== true` on EVERY PASS review, but the Blender track has no browser console or probe, so today a truthful reviewer cannot satisfy the checker without inventing values. | [measured] first synthetic exercise of the blender ladder: tests/gate-state.test.mjs blender-track scenario (its fixture had to hardcode console_clean/budget_pass true to derive clean), 2026-07-16 | staged |

## Active ledger

Two tables, BOTH Active, BOTH loaded at P0. Only the USER writes here — a run never edits an Active
row, not even to bump a status (`confirmed×N` is binding, so a bump is a run writing law).

Rows marked `promoted (fixed: …)` were already folded into a `references/` file and remain only as
tombstones — they are NOT re-applied as rules. Prune them at the next retro.

### Active — current schema (10 columns)

Promoted §Staged rows land HERE, keeping their provenance intact.

| date | project | design | track | pass | origin | how | learning | evidence | status |
|---|---|---|---|---|---|---|---|---|---|
| 2026-07-14 | threejs-hvac-prototipos | cinemex-hvac-lorawan | threejs | (tooling) | X1 closure, pre-P6 | pre-review-catch | An instrument that iterates "every X" must FAIL LOUD when it finds zero X — assert and report the input census; a "no differences" report over an empty set is a false green. | measured: 84-combo diff (DEFERRED-CORRECTIONS X1); first version resolved 0 presets and reported vacuous green | promoted (fixed: GATES.md §instrument corollaries, 2026-07-14 user-delegated) |
| 2026-07-14 | threejs-hvac-prototipos | cinemex-hvac-lorawan | threejs | surface/(spec) | X1 closure | mechanical-failure | When two instruments disagree about evidence geometry, MEASURE the gated artifact and re-express dependent thresholds as UNIT CONVERSIONS — never adopt either claim, never recalibrate. | measured: canvas 1.0818 vs test 0.8 vs ledger "4:3"; floors ×(636/900); 211/211 | promoted (fixed: GATES.md §instrument corollaries, 2026-07-14 user-delegated) |
| 2026-07-14 | threejs-hvac-prototipos | cinemex-hvac-lorawan | threejs | p7-delivery | P7 GLB export | wasted-retry | Preserve every P7 harness as a repo tool next to probe/capture/preflight — an unpreserved harness is a rebuild tax on the next design's P7. | research/tools/export-glb.mjs:5-7 (damper preserved nothing; cinemex rebuilt) | promoted (fixed: TRACK-THREEJS.md §Delivery kit, 2026-07-14 user-delegated) |
| 2026-07-14 | threejs-hvac-prototipos | cinemex-hvac-lorawan | threejs | p7-delivery | P7 GLB export | mechanical-failure | GLTFExporter throws on non-drawable textures (DataTexture/PMREM): strip those slots + environment/background, and import it through the PAGE's importmap so exporter and scene share one three.js. | research/tools/export-glb.mjs:44-68 | promoted (fixed: TRACK-THREEJS.md §Delivery kit caveats, 2026-07-14 user-delegated) |
| 2026-07-14 | threejs-hvac-prototipos | cinemex-hvac-lorawan | threejs | p6-final | p6 a1 capture | pre-review-catch | Updating the HUD pass-label is part of OPENING a pass (locked→active, before its first capture) — a dynamic-label rule with no owner moment ships stale labels into full-page sets. | measured: stale "Pase INTERACTION-UI" in P6's 31-shot set; pre-look caught it; one recapture (p6-final mechanical.json) | promoted (fixed: PIPELINE.md §Pass state machine, 2026-07-14 user-delegated) |
| 2026-07-14 | threejs-hvac-prototipos | cinemex-hvac-lorawan | threejs | (state) | interaction-ui gate close | mechanical-failure | Multi-shot gates COPY the representative capture to the exact canonical `<pass>[-l<L>]-attempt<N>.png` name — gate-state derives from that basename; suffix-only sets read as false failed(1)+drift. | measured: gate-state exit 1 → clean after the copy (2026-07-14) | promoted (fixed: GATES.md §Artifacts, 2026-07-14 user-delegated) |
| 2026-07-14 | threejs-hvac-prototipos | cinemex-hvac-lorawan | threejs | (orchestration) | L3 evidence chain, preflight→capture | mechanical-failure | A gating command may NEVER sit behind a pipe inside an `&&` chain — the chain gates on the PIPE's exit code, not the gate's. Run it standalone with FULL output to a log file and test `$?` (or `set -o pipefail`); tail the FILE, never truncate a gate tool's stream. | measured: `preflight 2>&1 \| tail -4 && capture` let a FAILED preflight ("Do NOT spend a gate attempt on this evidence chain") flow into a 46-min capture of dead evidence; 14 PNGs+sidecars deleted, capture needed SIGKILL; the same `tail` hid WHICH 2 checks failed | promoted (fixed: PIPELINE.md §Execution modes, 2026-07-15 unversioned edit — mtime observed 2026-07-16 (PIPELINE.md 00:07 on 07-15 vs the v1.5 SKILL.md bump 23:07 on 07-14), recorded then, no longer re-verifiable; traceability recorded 2026-07-16 user-delegated) |
| 2026-07-15 | threejs-hvac-prototipos | cinemex-hvac-lorawan | threejs | (tooling) | L4 GPU capture | pre-review-catch | QUALIFY a renderer before a renderer/driver switch produces gate evidence: pilot EVERY content class the evidence contract uses (canvas textures, sprites, DOM raster in `--page`, full DPR) and pixel-compare per class — a single-shot pilot qualifies nothing. | measured: `--gpu` adopted on a 0.61% single-shot delta (AA edges only), then rendered canvas-texture sprites + inactive DOM buttons as Chromium's failed-texture placeholder in its first DPR-3 `--page` set; pre-look caught it, set deleted, SwiftShader recapture, flag demoted to experimental-not-gate-safe in capture.mjs (its 4.5x speedup remains real) | promoted (fixed: GATES.md §Gate steps 2 Capture, 2026-07-16 user-delegated) |
| 2026-07-15 | threejs-hvac-prototipos | cinemex-hvac-lorawan | threejs | (tooling) | re-armed capture watchdog | mechanical-failure | A watchdog's liveness pattern must EXCLUDE the watchdog itself — match the interpreter+script (`pgrep -f "node.*capture.mjs"`) or exclude own PID. A watcher that can see itself reports motion in an empty room. | measured: the watchdog polled `pgrep -f "capture.mjs"`, a pattern its OWN command line contained → matched itself forever, never detected completion, timed out instead of reporting, then read as a phantom in-flight capture at the next status check | promoted (fixed: PIPELINE.md §Execution modes watchdog + GATES.md §instrument corollaries, 2026-07-16 user-delegated) |
| 2026-07-14 | threejs-hvac-prototipos | cinemex-hvac-lorawan | threejs | p6-final | p6 a1 vs p6 L2 a1 | mechanical-failure | Embed the judge output contract — `review.schema.json`'s EXACT field names — VERBATIM in every reviewer brief; never point a judge at the schema file. The judge returns that schema and nothing invented. | A/B measured in one round: p6-final-attempt1 + its predecessor returned off-schema JSON (invented layer keys, `evidence`/`expectation` fields) and were normalized BY HAND (mechanical.note); the L2 brief embedded the exact field names → p6-final-l2-attempt1 came back schema-clean on the first try | promoted (fixed: ROLES.md §render-reviewer, 2026-07-16 user-delegated) |
| 2026-07-14 | threejs-hvac-prototipos | cinemex-hvac-lorawan | threejs | (spec) | P6 L2, RTU amendment | improvised-win | After a mid-run spec refinement, P3 revalidation is SCOPED to the touched fields (post-refine-spec scoped P3) — the validator sees only what changed. A full re-sweep is cost with no signal. | measured: the RTU amendment's FAIL → prescribed-fix → PASS cycle took minutes because the validator saw only the touched fields (retro §Appended live 2026-07-14 night, item 4) | promoted (fixed: GATES.md §Verdict refine-spec + PIPELINE.md P3 row, 2026-07-16 user-delegated) |
| 2026-07-14 | threejs-hvac-prototipos | cinemex-hvac-lorawan | threejs | (orchestration) | P6 L2 correction round | improvised-win | ONE writer owns the working tree for a correction round; the orchestrator EXTENDS its scope with numbered extensions carrying pre-diagnosed root causes — never a second writer on the same tree. | measured: 11 items through one tree owner via numbered SendMessage extensions with pre-diagnosed root causes → 234/234 green (retro §Appended live 2026-07-14 night, item 5) | promoted (fixed: ROLES.md §Fan-out decision table, 2026-07-16 user-delegated) |
| 2026-07-16 | design3d-kit | (synthetic fixtures) | both | (tooling) | fixtures round, intentional RED test | pre-review-catch | A checker that resolves its threshold to null must FLAG, not skip — a PASS review with neither spec `quality_contract.global_min` nor `assumed_thresholds.global_min` is a contract violation (GATES.md §Retrofit gate mandates one of the two), never a silently skipped check. | [measured] the intentional RED test (globalmin-nomin fixture: verdict PASS at global_score 0.4 exited 0 "clean") + pre-fix assets/gate-state.mjs:124 `gmin ... ?? null` skip | promoted (fixed: assets/gate-state.mjs global_min contract flag, 2026-07-16 user-delegated) |
| 2026-07-16 | design3d-kit + anti-ai-ui-kit | (kit maintenance) | both | (kit hygiene) | 2026-07-16 session kit sweep | mechanical-failure | A kit that accepts a delta COMMITS it in the same session — accepted-but-uncommitted kit work was found in TWO kits the same session, and verify-kit-clean at SessionStart is the backstop that keeps it from recurring. | [measured] git status: design3d's unversioned 2026-07-15 PIPELINE.md edit (v1.6 changelog records the skipped traceability) + anti-ai-ui's 3 accepted deltas dirty since 07-15, landed as commit 02c8aef | promoted (fixed: assets/toolbelt/verify-kit-clean.sh both-kits SessionStart check, 2026-07-16 user-delegated) |

### Active — legacy schema (7 columns, pre-provenance)

Already human-reviewed history. Do NOT back-fill provenance into these; do NOT add new rows here.

| date | design | track | pass | learning | evidence | status |
|---|---|---|---|---|---|---|
| 2026-07-12 | chiller-tornillo-agua | threejs | smoke/gate | Verify console-clean from the `<basename>.console.json` sidecar capture.mjs writes — probe/capture success alone never proves console state. | disenos/chiller/runs/smoke-2026-07-12/review.json (mechanical.note) | promoted (fixed: research/tools/capture.mjs + GATES.md §Gate steps) |
| 2026-07-12 | chiller-tornillo-agua | threejs | smoke/gate | Treat probe.mjs `fps` as informational only under SwiftShader (returned 0 with 9 frames); gate on draws/tris. | smoke run probe output | promoted (fixed: GATES.md §Gate steps + TRACK-THREEJS.md §QA commands) |
| 2026-07-12 | chiller-tornillo-agua | threejs | smoke/gate | Gating a spec-less legacy design needs a minimal design-spec.yaml first, or explicitly recorded assumed thresholds (global 0.75 / feature 0.70) in the review JSON. | smoke run had no spec; thresholds were assumed | promoted (fixed: GATES.md §Retrofit gate + PIPELINE.md §Triage quick) |
| 2026-07-12 | chiller-tornillo-agua | threejs | smoke/gate | Serve the REPO ROOT on :8123 and run node FROM the repo root with repo-root-relative paths — probe/capture resolve against the server root. | smoke run resolved the ambiguity by trial | promoted (fixed: TRACK-THREEJS.md §QA commands) |
| 2026-07-12 | chiller-tornillo-agua | threejs | smoke/gate | python3 `jsonschema` is absent in this env — validate review JSON with the node structural fallback one-liner. | smoke run validation step | promoted (fixed: GATES.md §Review validation) |
| 2026-07-12 | chiller-tornillo-agua | threejs | smoke/gate | capture.mjs names outputs after the html basename — copy/rename to `<pass>-attempt<N>.*` gate names before recording the gate. | smoke run artifact naming clash | promoted (fixed: GATES.md §Artifacts + TRACK-THREEJS.md §QA commands) |
| 2026-07-12 | (env) | blender | bootstrap | This machine runs WSL2 mirrored networking: official Lab MCP defaults (localhost:9876) reach Windows Blender directly — skip the NAT/interop workaround; server installed at ~/.local/share/blender-mcp-venv/bin/blender-mcp, registered user-scope. | live send_code test returned Blender 5.1.1 ok | confirmed×1 |
| 2026-07-12 | (policy) | both | gate | On gate close, DELETE superseded capture PNGs (failed attempts) and raw pre-rename capture outputs; keep ONLY the passing attempt's screenshot (required for state derivation) + every review JSON. User mandate: captures must not accumulate garbage. | user instruction 2026-07-12 | promoted (fixed: GATES.md §Artifacts) |
| 2026-07-12 | damper-motorizado | threejs | materials/gate | probe.mjs can report draws/tris = 0 when SwiftShader shader-compile (e.g. MeshPhysicalMaterial clearcoat) stalls past the sampling window — retry once before treating 0 as a broken scene; the capture PNG is the truth check. | materials gate: first probe 0/0, second 123/8158, capture rendered fine | promoted (fixed: TRACK-THREEJS.md §QA commands) |
| 2026-07-12 | damper-motorizado | both | gate | Modeler self-verification (scene-graph facts, luminance measurements) can contradict the SAVED render — corrections must be verified on the saved capture crop; the render seen by the blind reviewer is the only acceptance authority. | Blender blockout att.1 (builder sanity PASS vs judge 0.60 FAIL) + lighting att.1 (claimed 38→47 L vs render still crushed) | promoted (fixed: GATES.md §Blind-review protocol) |
| 2026-07-12 | damper-motorizado | threejs | blockout | Include `<link rel="icon" href="data:,">` in every generated HTML — the browser's automatic favicon 404 pollutes the console sidecar (console path, not network path). | blockout gate attempt 1 console error | promoted (fixed: TRACK-THREEJS.md §Generic defaults) |
| 2026-07-12 | damper-motorizado | threejs | interaction | capture.mjs cannot pass query strings — interaction demo states (?demo=hotspot) need a redirect shim until the tool grows a --url-suffix flag (delta proposed). | interaction gate .demo.html shim | promoted (fixed: research/tools/capture.mjs --url-suffix + TRACK-THREEJS.md §QA commands) |
| 2026-07-12 | damper-motorizado | threejs | lighting | Keep the HUD pass-label dynamic — a stale subtitle reads as evidence-hygiene defect to blind judges. | lighting att.1 defect #6 | promoted (fixed: TRACK-THREEJS.md §Generic defaults) |
| 2026-07-12 | damper-motorizado | both | state | progress.yaml cache corrupted silently during run-1 (indentation nesting bug); gate-state.mjs now validates cache vs derivation at resume/gate close | council #1 finding | promoted (fixed: assets/gate-state.mjs + PIPELINE.md) |
| 2026-07-12 | damper-motorizado | threejs | evidence | Gate evidence must be produced ONLY by the canonical harness (capture.mjs --url-suffix) — temp per-pass scripts create sidecar shape drift (extra fields) that breaks provenance; the 4R reliability lens caught one. | optimization demo sidecar "query" field | promoted (fixed: --url-suffix exists; rule here) |
