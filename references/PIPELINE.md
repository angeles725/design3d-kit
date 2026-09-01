# design3d PIPELINE — doctrine, lanes, phases, pass lock, triage, resume, modes

## §1 Doctrine — the guiding principle (read this first, every run)

> **The shortest path from intent to a 3D artifact you LOOKED AT and that is NOT broken.**

Not "the fastest way to make a 3D design" — the fastest way to make one that is **not broken**.
Speed is the default and a hard budget (~5 min/turn, claude.ai parity); four cheap guard-rails are
the floor that keeps speed from shipping garbage. Everything else in this file derives from these
three commitments, in priority order:

1. **FAST by default — proceed, do not interrogate.** Reach a delivered artifact by the shortest
   route: a one-line intent, reuse before building, one artifact and not a ceremony. Do not stop to
   ask, do not spec what a sentence settles, do not run a phase whose cost the request does not earn.
   (Mirrors research-sdd's PROCEED-don't-interrogate: the work is meant to run, not to interview.)

2. **A cheap, NON-NEGOTIABLE floor — the four guard-rails.** Before delivering, ALWAYS:
   - **GR1 — you LOOKED at it.** A visual/raster check (`library/harness/soft-raster.mjs`), never
     delivered blind. The raster is a forced-look aid; the machine verdict is the numeric
     geom-verify framing/inside-out check — never assert a pixel.
   - **GR2 — the axes and dimensions are REAL.** One coordinate contract
     (`library/parts/axis-contract.mjs`): the CAD mirror `world.z = D − y` applied in exactly ONE
     place, round-trip-tested with a negative mirror control.
   - **GR3 — you did NOT invent geometry.** Every built piece traces to a source (voxel/CAD/spec),
     ±1 voxel (`pass-parity` `extra` set = the invention signal).
   - **GR4 — the intent is PINNED.** "realista = parametric geometry, not PBR-on-voxel" and the
     like, fixed up front and unchanged across the turn.

   These run as one harness — `node library/harness/turn-guard.mjs <artifact>` — in seconds, and
   they catch the disasters that actually recur (mirrored axis, invented tower, zero-voxel damper,
   PBR-on-voxel disguised as parametric). NEVER trade them away for speed; NEVER inflate them into
   the heavy gate ladder. This is design3d's "never fabricate": the floor you do not cross.

3. **RIGOR is ON-SIGNAL, never the default.** The gated P0–P8 pipeline (§4) is the RIGOROUS lane.
   Enter it ONLY when a signal fires — announce the escalation and proceed (do not ask permission
   unless it crosses a stated cost limit):
   - the input is real **CAD / measured drawings** where a wrong cota is a real-world error
     (COB-IM2, Ford, Nave Panccadia — dimensional truth is load-bearing);
   - a cheap **floor check FAILS** and the fix is non-obvious;
   - the **user asks** for the rigorous pass, or for a certified/`[CERT]` deliverable.

   (Mirrors research-sdd's light→heavy auto-escalation: a light pass promotes itself on depth
   signals, announcing not re-asking.)

**The failure this doctrine is built against:** claude.ai is FAST but ships broken (mirrored axis,
invented geometry, delivered-without-looking); the old design3d was CORRECT but cost 30+ minutes
because it forced the RIGOROUS lane onto every request (measured: ~5 min just reading the kit +
~5 min gate ceremony before the voxel was even done). The floor makes fast safe; on-signal rigor
keeps the heavy machinery for the work that earns it.

## §2 Lane routing (P0) — pick the lane, announce, PROCEED

Classify in one cheap look, state a one-line plan, and run. Default is FAST.

| | **FAST lane (default)** | **RIGOROUS lane (on-signal)** |
|---|---|---|
| When | A model/equipment/scene from intent, a photo, a terse ask ("hazme un catálogo/equipo"); a tweak on an existing design | Real CAD/DXF intake; a floor check failed non-obviously; user asked for rigor or a `[CERT]` deliverable |
| Spec | One-line pinned intent (GR4) + track + real dimensions if known | Full DesignSpec, P2/P3 gated (`DESIGNSPEC.md`) |
| Build | Direct: reuse from `library/INDEX.md` first, then author | Blockout → gate-locked build-out passes (§4) |
| Check | The four guard-rails (`turn-guard.mjs`) — seconds | Full blind-review gate ladder per pass (`GATES.md`) |
| Budget | ~5 min/turn | as long as correctness needs; announce the forecast |
| Deliver | The artifact + the GR1 look + the 4 verdicts | Delivery kit + REPORT.md + library extraction (P7) |

**Escalation is one-directional and announced.** A FAST run escalates to RIGOROUS the moment a
signal fires (`CAD source detected → escalating to rigorous`; `GR1 flagged inside-out and the fix is
structural → escalating`). It does NOT silently drift the other way: once you are in the rigorous
lane for a real-cota reason, you do not drop the gates to save time.

**CAD→3D intake ranking (DWG/DXF source) — always prefer Route 1.** (CAD intake is itself a
rigorous-lane signal.)
- **Route 1 (default, certified):** read the real entities — DWG→DXF via a reader ladder (system
  libredwg `dwg2dxf` → ODA File Converter → compile libredwg from source) → `ezdxf`. Coordinates,
  units, elevations, layers, sections, and multi-sheet co-registration come from the drawing (sheets
  sharing one CAD frame co-register by pure TRANSLATION, verified by content overlap — no scale/rot).
  Cross-validate the converter cheaply (`dwgread -O JSON` filtered to `entmode==2`, or ODA) — all
  faithful readers agree on the modelspace payload.
- **Route 2 (last resort, everything `[INFER]`):** computer vision on a raster (colour masks →
  `HoughLinesP` → connected-components; SIFT/Lowe/RANSAC to co-register sheets). Use ONLY when no
  reader can run AND a sufficient-resolution raster exists — a DWG's EMBEDDED thumbnail (~256×115)
  does NOT qualify. CV INVENTS scale, elevation, semantics, and co-registration. Never present CV
  lengths as measured; expose a scale control and recalibrate from ONE known real dimension.
  Provenance: `disenos/COB-IM2/runs/2026-08-21-cv-fallback-retro.md` + `-cv-coregistration-retro.md`.

## §3 FAST lane (default) — intent → build → floor → deliver

The common path. No DesignSpec ceremony, no pass lock, no watchdog — those are rigorous-lane tools.

1. **Pin the intent (GR4).** One line: what the thing is, the track (threejs/blender), and whether
   "realista" means parametric geometry (not PBR-on-voxel). Real dimensions if the user gave them.
   Don't interrogate — state your reading and proceed.
2. **Reuse before building.** Check `library/INDEX.md`; a gated reusable beats re-authoring (this is
   where the "rebuild tax" is paid or avoided).
3. **Build the one artifact.** Voxel massing as the dimensional source of truth, then — if asked —
   the realista/PBR pass by the conversion contract (`PROVENANCE-CONTRACT.md`: voxel is truth, the
   realista TRANSLATES its cotas, never re-invents them).
4. **Run the floor once** — `node library/harness/turn-guard.mjs <artifact>` — GR1 look + GR2 axis +
   GR3 anti-invention + GR4 intent, plus the wall-time budget assertion. All four must pass.
5. **Deliver** the artifact, the GR1 look image, and the four verdicts. If GR1/GR2/GR3 fail and the
   fix is obvious, fix and re-run the floor (still fast). If a failure is structural/non-obvious →
   escalate to the RIGOROUS lane with the failing check as the entry evidence.

A tweak on an existing design ("make the fans bigger", "fix the coil color") stays in the FAST
lane: change the one thing, re-run the floor, deliver. No spec churn.

## §4 RIGOROUS lane (on-signal) — the gated P0–P8 DAG

Entered only by a §2 signal. This is the load-bearing pipeline for real engineering (CAD-traced
ductwork, measured plants) where a wrong dimension is a real-world defect. Execute phases in order;
tracks diverge only at P4–P5.

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
| P7 | Delivery kit (track-specific) + `runs/REPORT.md` (per-pass table: score, attempts, screenshot link) + **library extraction** (newly gated reusable mechanisms → `library/` per LIBRARY.md; an unpreserved mechanism is a rebuild tax on the next design) + **self-contained offline build** for modular threejs designs (`research/tools/build-offline.mjs` → a `dist/index.html` that opens by double-click, offline; verify visual parity vs the gate capture) | passed build | kit files, REPORT.md, library rows | files exist | inline | session |
| P8 | Retro + LEARNINGS **staged** (never appended to §Active) + proposed kit deltas | run history | retro file (`review-status: pending`), staged ledger rows | — | inline | session |

**Heavy shapes (rigorous lane):**
- **standard** — one new design: full DAG.
- **heavy** — a scene or ≥3 assets: per-asset P4/P5 loops (sequential, one asset at a time), then a
  scene-assembly pass, then P6. Fan out roles per ROLES.md.
  - **flat-catalog shape** — N independent SIMPLE assets with no scene assembly (a standalone
    equipment library, e.g. `equipos/<slug>/<slug>.html`): each asset closes on ONE gate, not the
    full 8-pass ladder. Declare the subset EXPLICITLY in each asset's spec via `gate_passes:`
    (e.g. `gate_passes: [materials]`, DESIGNSPEC.md) so `gate-state.mjs` derives a green, auditable
    subset ladder instead of reporting the absent passes as `locked`.
  - **catalog extraction checkpoint** — a flat-catalog run has no scene, so it never reaches P7 and
    extracts nothing. It still owes a library-extraction pass PER GATED ASSET (or once at run end),
    else gate-passed reusables are never extracted (LIBRARY.md exists to stop that rebuild tax).
  - **CAD-placeholder pre-check** (generated-scene integration): before placing a new master into a
    generated scene, check whether the generator's CAD layer or furniture dictionary already carries
    a placeholder for the same object. Guard with a geometric filter that FAILS LOUD if it suppresses
    zero matches — a zero match means the guard measured nothing (GATES.md §Instrument corollaries).
- AUTO-ESCALATE standard→heavy when P2 reveals ≥3 assets or a full scene: announce
  (`spec shows N assets → escalating to heavy`) and continue. Ask ONLY if escalation crosses an
  explicit user cost/scope limit.

### Pass state machine (pass lock) — RIGOROUS lane only

States: `locked → active → in-review → passed | failed(n)`.

- **State is RE-DERIVED, never asserted** (adapted from Object Sculptor): a pass counts as
  `passed` only if a review JSON with `action: continue` / `verdict: PASS` AND its screenshot
  exist on disk under `runs/`. Derivation scans passes in order and stops at the first
  incomplete one — no skipping. After a compaction or restart, recompute from these artifacts;
  never trust conversation memory.
- Only ONE pass `active` at a time. The next pass stays `locked` until the current is `passed`.
- **On `locked → active`, update the track's HUD pass-label BEFORE the pass's first capture.** The
  dynamic-label rule needs this owner moment: cinemex froze the label at the previous pass's code
  close and shipped it stale into a 31-shot full-page P6 set — caught only by the pre-look, at the
  cost of a full recapture.
- `in-review` = gate running (mechanical checks + capture + blind review, see GATES.md).
- `failed(n)`: apply the review's `corrections` — prefer the NAMED resets of GATES.md
  (`Silhouette Reset`, `Material Realism Reset`) over vague retries — then re-gate. Max 2
  correction retries per pass; after `failed(3)` → STOP the run, present the review JSON +
  screenshots to the user, await direction. Never silently lower a threshold or skip a
  critical feature.
- Record every transition in `<design-dir>/runs/progress.yaml` — a cache of the derivation above,
  not an authority. BLOCK style, 2-space pass / 4-space field indentation (`gate-state.mjs` cannot
  parse flow-style maps); the cache persists only `locked | passed | failed(n)` — transient states
  live in the conversation, never in the cache:

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
  blind sleep measured 3x slower still. Both caught only because someone typed `time`.) Update it
  ATOMICALLY at each transition (write full file, temp + rename), and VALIDATE it against the
  derivation with `assets/gate-state.mjs <design-dir>` at every resume and gate close — drift means
  the cache is corrupt: rebuild it from the derivation, never the reverse.

## Three kinds of error, three different responses (binding, BOTH lanes)

Not every defect is fixed the same way. Confusing them either poisons the evidence or lets the run
self-approve. Classify first, then act.

| kind | response | why |
|---|---|---|
| **Instrument** — the harness, the probe, the validator, the state checker | **FIX IT NOW.** Stop the gate; the tool is not a deliverable, it is the measuring device. | A tool that lies poisons everything downstream. And **a wrong tool costs more than a missing one** — it sends you to fix code that is not broken, with total confidence. |
| **Design** — geometry, materials, lighting, interaction, the built thing | In the FAST lane: fix and re-run the floor. In the RIGOROUS lane: **follow the pass protocol** (diagnose → apply only the review's corrections → re-gate). Never hand-patch around a gate. | Patching the design outside the gate IS self-approval: the blind reviewer stops being the authority and the orchestrator becomes it. The discipline is the quality. |
| **Lesson** — a rule the kit should have had | **STAGE it** (`LEARNINGS.md` §Staged + a retro delta). Never apply it to the kit from inside a run. | A run that writes its own binding rules is not learning, it is drift. See SELF-IMPROVEMENT.md §Hard boundary. |

**And the exception that binds both lanes: NEVER capture/look while code is in flight.** Evidence
taken over a half-changed build is born dead. The order is not negotiable:

> **code closed → preflight → capture/look → judge.** Never overlapped.

**"Fix the instrument NOW" does not override this — and the two rules WILL collide.** An instrument
fix that touches the SUBJECT (a QA hook, an exposed counter, a debug flag) is a code change like any
other. Before touching anything: **is a capture/look in flight? If yes, stop it first.** (cinemex
paid twice: a deferred fix landed mid-way through a 24-shot lighting set; a 27-shot interaction set
was nearly taken while an alarm-copy fix in flight was about to change text visible in 10 of them.)

## Crash contract (agent death / spend limit / session restart) — RIGOROUS lane

- Evidence (capture PNG, console sidecar, review JSON) is written to disk BEFORE corrections
  begin — a crash mid-correction must never lose the failed attempt's evidence.
- Delegated scope = exactly ONE pass-attempt (build + capture; see ROLES.md). Mechanical checks run
  inline (cheap); only the blind review is delegated.
- On resume, re-derive state from `runs/` artifacts (pass lock above); `progress.yaml` is a cache —
  cross-check it with `assets/gate-state.mjs` before trusting it.

## Resume protocol (never bake stale state) — RIGOROUS lane

On `continue` (or when `design-spec.yaml` exists):
1. Read `design-spec.yaml` + `runs/progress.yaml`; derive the next unlocked pass from pass states —
   never from memory or conversation history.
2. Cross-check engram `design3d/{design}/progress` pointer; files win on conflict.
3. Re-run overlay discovery (paths may have moved).

## Execution modes

- **self-paced** (default) — run in this session, announcing each result.
- **interactive** — pause for user OK at every gate (use when the user is actively reviewing).
- **/loop-driven** — for long unattended RIGOROUS runs (heavy scenes), wrap with the `/loop` skill;
  each iteration = one pass + its gate. Most robust against stalls.

Do not ask which mode; default self-paced, mention `/loop` when a heavy rigorous run is announced.

**Never block the orchestrator on a long shell command** (preflight contracts, capture sets, probes,
test suites beyond a few seconds): run it in the background and keep orchestrating. Servers ALWAYS
run detached (`setsid ... & disown`). The no-overlap rule still binds: background ≠ concurrent code
edits — never touch the build while its evidence is being captured (§Three kinds of error).

**Every long-running gate tool gets a WATCHDOG, armed at launch** — not polled by goodwill. It fires
on any problem line (`bad`/`FAIL`/`Error`), the final verdict, and — the case that costs the most —
the process dying WITHOUT a verdict. Silence is not success: a 40-minute capture that died at minute
3 looks identical to one that is working (cinemex L3). **The liveness pattern must EXCLUDE the
watchdog itself** — match the interpreter+script (`pgrep -f "node.*capture.mjs"`) or exclude own PID;
a bare `pgrep -f "capture.mjs"` also matches the watcher's OWN command line and reports motion in an
empty room. **A gating command may NEVER sit behind a pipe inside a `&&` chain** — `preflight | tail
-4 && capture` gates on TAIL's exit code, so a FAILED preflight flows straight into a long capture of
dead evidence (cinemex L3: 46 minutes, 14 dead shots). Run the gate standalone with full output to a
log file, test its exit code explicitly (or `set -o pipefail`), and tail the FILE for display.
