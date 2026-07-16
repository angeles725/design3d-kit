# ROLES — role prompts, fan-out policy, model tiers

Roles are HATS by default: run them inline as sequential mindset switches. Fan out to real
sub-agents per the table below — context isolation is the reason to fan out, not ceremony.
In standard mode with a LONG orchestrator context, DELEGATED MODELERS are the default (one
pass-attempt per delegation, per PIPELINE.md crash contract); inline hats remain the low-cost
option for short sessions and quick mode.

## Fan-out decision table

| Situation | Fan out? | Why |
|---|---|---|
| Gate review, mode ≥ standard | YES — fresh-context blind reviewer | kills self-grading bias; reviewer must not have seen the code |
| Gate review, quick mode | inline render-reviewer hat | cheap tweak loop; still rubric-bound |
| Heavy mode, per-asset modeling | YES — one modeler agent per asset, SEQUENTIAL | fresh context per asset; one-asset-at-a-time discipline |
| Heavy mode, P3 spec validation | YES — fresh-context validator | spec errors are cheapest caught before geometry |
| Heavy mode, P1 research | YES — delegated reference sweep | matches PIPELINE.md P1 executor |
| Standard mode, P4/P5 passes, LONG orchestrator context | YES — delegated modeler per pass-attempt | keeps orchestrator thin; state survives agent death via disk artifacts |
| Everything else (P1 research in quick/standard, P2 spec, P5 passes in short-context standard) | inline hats | shared context beats handoff cost |

**ONE writer owns the working tree.** For a correction round, exactly one writer holds the tree for
its duration; the orchestrator EXTENDS that writer's scope with NUMBERED extensions, each carrying
a PRE-DIAGNOSED root cause (SendMessage or the environment's equivalent) — it never spawns a second
writer onto the same tree. Two writers on one tree race on the same files and neither one's summary
describes the tree that actually exists. The extension channel is also what keeps the diagnostician
economics: the orchestrator diagnoses, the writer applies a closed diagnosis, and the round pays
rediscovery once instead of per item. (cinemex P6 L2: 11 items through one tree owner via numbered
extensions with pre-diagnosed root causes → 234/234 green.)

## Model tiers

| Role | Tier |
|---|---|
| spec-writer (standard) | session model |
| spec-writer (heavy scene) | opus |
| modeler / texturer | session model (sonnet when delegated per-asset) |
| blind reviewer / spec validator | sonnet |

## Role prompt blocks

**spec-writer** — "From the P1 evidence, author `design-spec.yaml` per
`references/DESIGNSPEC.md` authoring rules. Every dimension and material carries evidence.
Hierarchy is animation-ready: named nodes, explicit pivots, animation channels. Choose 3–5
critical features (hard max 5) adversarially: what would a lazy model omit that makes this
object stop reading as itself? Output only the YAML."

**modeler** — "Execute pass `<pass>` for `<design>` per the active TRACK file and the spec.
Touch ONLY this pass's scope. Respect binding LEARNINGS (§Active only — §Staged is never authority). Deliver the build + a one-line summary
of what changed. Do not self-score — the gate does that."

**texturer / material-auditor** — "Audit or apply spec `materials[]` on the current build.
Near-binary metalness is LAW (0.0–0.05 dielectric, 0.85–1.0 metal). Flag any material whose
rendered read diverges from its evidence; fix via values, not new textures, unless the spec
cites a texture."

**diagnostician** — runs on every `failed(n)`, BEFORE the modeler. Cheap, short, read-only.
"A gate failed. You get: the review JSON (defects + corrections), the failing capture(s), and the
code. Find the ROOT CAUSE and return ONLY that — do not fix anything, do not write code.

A blind-review correction is a HYPOTHESIS, not a fact: the judge sees pixels, so it reports the
DEFECT accurately and the CAUSE unreliably. Your job is to convert its hypothesis into a diagnosis.
For each correction: is the thing it names actually absent, or present-but-illegible? Does the
correction, applied literally, fix the defect the judge saw — or make it worse? Say so.

Return: root cause (one paragraph, with the file:line and the measured numbers that prove it) ·
per-correction verdict (`confirmed` / `misdiagnosed — real cause is X` / `impossible — arithmetic
proof`) · the minimal change set. Nothing else."

Why this role exists: without it, the modeler pays full rediscovery cost on every attempt — writers
in the cinemex run burned 250k–390k tokens and 30–60 min each, and in every case the load-bearing
output was ONE sentence of root cause buried in an hour of implementation. Diagnose once, cheap;
then hand the modeler a closed diagnosis.

**render-reviewer (blind)** — "You see ONLY: design-spec.yaml, the capture(s), the GATES.md
rubric, and — at P6 — the P1 reference images (same viewpoint). Score global gestalt and every
critical feature 0.0–1.0 against what the spec promises. Return JSON per
`assets/review.schema.json` — defects in pixel terms, corrections imperative and actionable.
You never see code; judge pixels vs promises."

**The reviewer brief EMBEDS the schema's exact field names, VERBATIM — never a pointer to the
schema file.** A judge that is told "conform to `review.schema.json`" invents keys; a judge that is
handed the keys returns them. Paste into every brief: `pass` · `attempt` · `global_score` ·
`layer_scores` {`silhouetteProportion`, `componentStructure`, `formDetail`, `materialSurface`,
`lightingCamera`} · `features[]` {`id`, `score`, `threshold`, `pass`, `note`} ·
`important_features[]` (same shape) · `important_average` · `defects[]` · `corrections[]` ·
`mechanical` {`console_clean`, `budget_pass`, `tests`, `note`} · `verdict` (`PASS`|`FAIL`) ·
`action` (`continue`|`refine-spec`|`refine-code`|`request-input`|`stop`). The judge returns THAT
schema and nothing invented — no extra fields, no renamed layers.

Why, and the A/B that proves it: two consecutive cinemex judges returned off-schema JSON (invented
`layer_scores` keys; extra `evidence`/`expectation` fields) and `p6-final-attempt1` had to be
normalized BY HAND (documented in its `mechanical.note`). The same round, the L2 reviewer prompt
embedded the exact field names verbatim — and the judge returned schema-clean JSON on the FIRST
try (`p6-final-l2-attempt1`). Hand-normalizing a judge's output is the orchestrator editing the
only acceptance authority's verdict: cheap this time, self-approval the time it goes wrong.

**spec validator (heavy)** — "Validate `design-spec.yaml` against DESIGNSPEC.md authoring rules
1–9. Return violations with the rule number and the fix. No style opinions."
