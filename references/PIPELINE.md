# design3d PIPELINE — phases, pass lock, triage, resume, modes

Runtime contract for the P0–P8 DAG. Execute phases in order; tracks diverge only at P4–P5.

## Phase DAG

```
P0 INTAKE & TRIAGE ─ P1 REFERENCE RESEARCH ─ P2 DESIGNSPEC ─ P3 SPEC GATE
   ├─ threejs: P4a BLOCKOUT (voxel massing) ─ P5a BUILD-OUT passes
   └─ blender: P4b BLOCKOUT (primitives)    ─ P5b BUILD-OUT passes
P6 FINAL REVIEW ─ P7 DELIVERY KIT ─ P8 RETRO
```

| Phase | Purpose | Inputs | Outputs | Gate | Executor | Model tier |
|---|---|---|---|---|---|---|
| P0 | Triage track/mode/new-vs-continue; discover overlays; load LEARNINGS **§Active only** | request, cwd | announced 1-line plan, `environment` block | none | inline | session |
| P1 | Reference research: real dimensions, part census, per-surface PBR evidence, reference images | web/context7/user images | `references[]` + `dimensions_real` for the spec | none | inline (heavy: delegate sweep) | session |
| P2 | Author DesignSpec from template | P1 evidence, `assets/designspec.template.yaml` | `<design-dir>/design-spec.yaml` | — | spec-writer role | session (heavy: opus) |
| P3 | Spec gate: completeness checklist per DESIGNSPEC.md authoring rules. A mid-run `refine-spec` re-gates as a **scoped P3** — validator sees ONLY the touched fields (GATES.md §Verdict) | spec | approved spec | checklist; heavy: fresh-context validator agent | inline / agent | sonnet |
| P4a/P4b | Blockout: silhouette + proportions + part massing only | spec | blockout build | full gate (GATES.md) | modeler role | session |
| P5a/P5b | Build-out passes (track file defines the ladder), each pass gate-locked | prior pass | per-pass builds | full gate per pass | modeler/texturer roles | session |
| P6 | Final blind review vs references: critical features + global score | all screenshots, spec | final review JSON | full gate, ≤2 fix loops | blind reviewer agent | sonnet |
| P7 | Delivery kit (track-specific) + `runs/REPORT.md` (per-pass table: score, attempts, screenshot link) + **library extraction** (newly gated reusable mechanisms → `library/` per LIBRARY.md; an unpreserved mechanism is a rebuild tax on the next design) | passed build | kit files, REPORT.md, library rows | files exist | inline | session |
| P8 | Retro + LEARNINGS **staged** (never appended to §Active) + proposed kit deltas | run history | retro file (`review-status: pending`), staged ledger rows | — | inline | session |

## Pass state machine (pass lock)

States: `locked → active → in-review → passed | failed(n)`.

- **State is RE-DERIVED, never asserted** (adapted from Object Sculptor): a pass counts as
  `passed` only if a review JSON with `action: continue` / `verdict: PASS` AND its screenshot
  exist on disk under `runs/`. Derivation scans passes in order and stops at the first
  incomplete one — no skipping. After a compaction or restart, recompute from these artifacts;
  never trust conversation memory.
- Only ONE pass `active` at a time. The next pass stays `locked` until the current is `passed`.
- **On `locked → active`, update the track's HUD pass-label (and any per-pass HUD copy) BEFORE the
  pass's first capture.** The dynamic-label rule needs this owner moment: cinemex froze the label at
  the previous pass's code close and shipped it stale into a 31-shot full-page P6 set — caught only
  by the pre-look, at the cost of a full recapture.
- `in-review` = gate running (mechanical checks + capture + blind review, see GATES.md).
- `failed(n)`: apply the review's `corrections` — prefer the NAMED resets of GATES.md
  (`Silhouette Reset`, `Material Realism Reset`) over vague retries — then re-gate. Max 2
  correction retries per pass; after `failed(3)` → STOP the run, present the review JSON +
  screenshots to the user, await direction. Never silently lower a threshold or skip a
  critical feature.
- Record every transition in `<design-dir>/runs/progress.yaml` — a cache of the derivation above,
  not an authority. BLOCK style, 2-space pass / 4-space field indentation (`gate-state.mjs` cannot
  parse flow-style maps); the cache persists only `locked | passed | failed(n)` — transient states
  (`active`, `in-review`) live in the conversation, never in the cache, so the checker never sees
  a state it cannot derive:

  ```yaml
  passes:
    <pass>:
      status: passed
      attempts: 1
      score: 0.80
      action: continue
      screenshot: runs/<...>.png
      review: runs/<...>.review.json
  ```
- **Record the COST of every attempt**, or every optimization you propose later is an opinion:
  `cost: {writer_min, capture_min, review_min, writer_tokens}`. Without a before/after number you
  cannot tell whether a kit delta helped, and you WILL ship one that hurts. (cinemex: capture
  batching was proposed as a speedup and measured 2x SLOWER; the readiness check that replaced a
  blind sleep measured 3x slower still. Both were caught only because someone typed `time`.) Update it ATOMICALLY at each transition (write full file,
  temp + rename), and VALIDATE it against the derivation with `assets/gate-state.mjs
  <design-dir>` at every resume and gate close — drift means the cache is corrupt: rebuild it
  from the derivation, never the reverse.

## Three kinds of error, three different responses (binding)

Not every defect is fixed the same way. Confusing them either poisons the evidence or lets the run
self-approve. Classify first, then act.

| kind | response | why |
|---|---|---|
| **Instrument** — the harness, the probe, the validator, the state checker | **FIX IT NOW.** Stop the gate; the tool is not a deliverable, it is the measuring device. | A tool that lies poisons everything downstream: every capture, every verdict, every attempt after it. Waiting only accumulates false evidence. And **a wrong tool costs more than a missing one** — it sends you to fix code that is not broken, with total confidence. |
| **Design** — geometry, materials, lighting, interaction, the built thing | **Follow the pass protocol**: diagnose → apply only the review's corrections → re-gate. Never hand-patch around a gate. | Patching the design outside the gate IS self-approval: the blind reviewer stops being the authority and the orchestrator becomes it. The discipline is the quality. |
| **Lesson** — a rule the kit should have had | **STAGE it** (`LEARNINGS.md` §Staged + a retro delta). Never apply it to the kit from inside a run. | A run that writes its own binding rules is not learning, it is drift. See SELF-IMPROVEMENT.md §Hard boundary. |

**And the exception that binds all three: NEVER capture while code is in flight.** Evidence taken over
a half-changed build is born dead — it will be re-shot, and if it is not, it will be judged as if it
were current. The order is not negotiable:

> **code closed → preflight → capture → judge.** Never overlapped.

**"Fix the instrument NOW" does not override this — and the two rules WILL collide.** An instrument
fix that touches the SUBJECT (a QA hook in the app, an exposed counter, a debug flag) is a code change
like any other. Before touching anything: **is a capture in flight? If yes, stop it first.** The
orchestrator wrote this rule and then broke it within the hour, editing `main.js` to expose
`renderer.info` while a 27-shot set was being captured — because "instrument" felt like a category
that was exempt. It is not. The evidence does not care why the build moved.

(cinemex paid for this twice: a deferred fix landed mid-way through a 24-shot lighting set, forcing a
full recapture; and a 27-shot interaction set was nearly taken while an alarm-copy fix in flight was
about to change the text visible in 10 of them.)

## Crash contract (agent death / spend limit / session restart)

- Evidence (capture PNG, console sidecar, review JSON) is written to disk BEFORE corrections
  begin — a crash mid-correction must never lose the failed attempt's evidence.
- Delegated scope = exactly ONE pass-attempt (build + capture; see ROLES.md). Mechanical
  checks run inline (cheap); only the blind review is delegated.
- On resume, re-derive state from `runs/` artifacts (pass lock above); `progress.yaml` is a
  cache — cross-check it with `assets/gate-state.mjs` before trusting it.

## Triage (P0) — announce and PROCEED, do not interrogate

- **quick** — a tweak/fix on an existing design ("make the fans bigger", "fix the coil color"):
  jump to the one relevant pass, run its gate, finish with P8-lite (LEARNINGS **staged** + engram
  mirror per SELF-IMPROVEMENT.md).
  No spec churn beyond updating the touched fields. Spec-less legacy design → apply the
  Retrofit gate rule in GATES.md before gating.
- **standard** — one new design: full DAG.
- **heavy** — a scene or ≥3 assets: per-asset P4/P5 loops (sequential, one asset at a time),
  then a scene-assembly pass, then P6. Fan out roles per ROLES.md.
  - **flat-catalog shape** — N independent SIMPLE assets with no scene assembly (a standalone
    equipment library, e.g. `equipos/<slug>/<slug>.html`): each asset closes on ONE gate, not the
    full 8-pass ladder. Declare the subset EXPLICITLY in each asset's spec via `gate_passes:`
    (e.g. `gate_passes: [materials]`, DESIGNSPEC.md) so `gate-state.mjs` derives a green,
    auditable subset ladder instead of reporting the absent passes as `locked`. A simple stainless
    box needs no blockout/structural/surface/lighting/interaction/optimization pass.
  - **catalog extraction checkpoint** — a flat-catalog run has no scene, so it never reaches P7
    and extracts nothing. It still owes a library-extraction pass: run the P7 library-extraction
    step (below) PER GATED ASSET (or once at run end over all gated assets), else gate-passed
    reusables are never extracted (LIBRARY.md exists to stop exactly that rebuild tax).
- AUTO-ESCALATE standard→heavy when P2 reveals ≥3 assets or a full scene: announce
  (`spec shows N assets → escalating to heavy`) and continue. Ask ONLY if escalation crosses an
  explicit user cost/scope limit.

## Resume protocol (never bake stale state)

On `continue` (or when `design-spec.yaml` exists):
1. Read `design-spec.yaml` + `runs/progress.yaml`; derive the next unlocked pass from pass
   states — never from memory or conversation history.
2. Cross-check engram `design3d/{design}/progress` pointer; files win on conflict.
3. Re-run overlay discovery (paths may have moved).

## Execution modes

- **self-paced** (default) — run the DAG in this session, announcing each gate result.
- **interactive** — pause for user OK at every gate (use when the user is actively reviewing).
- **/loop-driven** — for long unattended runs (heavy scenes), wrap with the `/loop` skill; each
  iteration = one pass + its gate. Most robust against stalls.

Do not ask which mode; default self-paced, mention `/loop` when a heavy run is announced.

**Never block the orchestrator on a long shell command** (preflight contracts, capture sets, probes,
test suites beyond a few seconds): run it in the background and keep orchestrating — reconcile state,
read reports, answer the user — while it runs. The orchestrator must stay responsive to mid-run user
input; a foreground capture is 5–10 minutes of deafness. Servers ALWAYS run detached
(`setsid ... & disown`). The no-overlap rule still binds: background ≠ concurrent code edits — never
touch the build while its evidence is being captured (§Three kinds of error, the capture exception).

**Every long-running gate tool gets a WATCHDOG, armed at launch** — not polled by goodwill. The
watcher fires an event on: any problem line in the tool's log (`bad`/`FAIL`/`Error`), the final
verdict (PASS or FAIL), and — the case that costs the most — the process dying WITHOUT a verdict.
Silence is not success: a 40-minute capture that died at minute 3 looks identical to one that is
working, and a FAIL discovered by a casual status peek 46 minutes late already burned the evidence
(cinemex L3). Use the environment's monitor facility (event per matching log line + a liveness
loop on the PID); the watchdog reads the tool's FULL log file, never a truncated stream.

**The liveness pattern must EXCLUDE the watchdog itself.** Match the interpreter+script (`pgrep -f
"node.*capture.mjs"`) or exclude own PID — a bare `pgrep -f "capture.mjs"` also matches the
watcher's OWN command line, so it stays "alive" forever: it never detects completion, times out
instead of reporting, and then reads as a phantom in-flight capture at the next status check
(cinemex, 2026-07-15). A watcher that can see itself reports motion in an empty room — same
instrument family as the fail-loud census (GATES.md §instrument corollaries).

**A gating command may NEVER sit behind a pipe inside a `&&` chain.** `preflight | tail -4 &&
capture` gates on TAIL's exit code: a FAILED preflight (whose verdict line says "do NOT spend a
gate attempt") flows straight into a long capture of dead evidence — and the same pipe truncates
WHICH checks failed (cinemex L3: 46 minutes and 14 dead shots before a routine status peek caught
it). Run the gate standalone with its FULL output redirected to a log file, test its exit code
explicitly (or `set -o pipefail`), and tail the FILE for display — never the live stream. Same
family as the fail-loud-census rule: an instrument's verdict must never be laundered by its own
harness.
