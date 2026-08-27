# GATES — unified pass-gate contract (both tracks)

Every pass (P4, each P5 sub-pass, P6) runs the SAME three-step gate. Track files define the
tooling; this file defines the contract. Screenshots are evidence packaging; blind vision
review is the ONLY acceptance authority — never pixel-diff or heuristic auto-acceptance
(adapted from Object Sculptor, research/sources/design3d-skill/NOTES-object-sculptor.md).

## Gate steps

0. **PREFLIGHT the evidence chain — before spending the attempt** (`research/tools/preflight.mjs`, or
   the track's equivalent). Prove the INSTRUMENT works before you trust what it reports:
   - server reachable, page loads, canvas present, console/network clean, probe renders non-zero;
   - **contract check**: drive EVERY shot in the pass's evidence set and prove each one renders a
     view that is (a) not the default and (b) not a duplicate of another shot.
   - **coverage check** (orchestrator, against the spec): every `critical_features[]` entry is
     FRAMED by at least one shot in the set. Distinctness proves the shots differ; only coverage
     proves the JUDGE will see what the gate scores. A feature no shot frames arrives at P6 as a
     cliff, with the whole build stacked on top of it.

   That last check is the one that pays. An unknown value on a known query key can silently reset the
   whole app state to defaults, so a spec-literal capture set becomes N pictures of the default camera
   under N lying filenames — clean console, green exit, and a blind reviewer returning a confident
   verdict on evidence that never showed what it claimed. **P3 validates the spec against itself;
   nothing else validates it against the implementation. This does.**

   In this run one duplicate flagged by the contract check exposed three separate defects: a harness
   that captured only the canvas (blind to the entire DOM deliverable of the interaction pass), a
   validator measuring through a narrower viewport than the gate, and an app bug where all five fault
   states booted announcing "no alarms" — one of them with 14 alarms active. None of the three was
   findable by a judge. All three were found before a single attempt was spent.

1. **Mechanical checks** (hard, no judgment):
   - threejs: console clean — read the `<basename>.console.json` sidecar the capture harness
     writes (errors/warnings/pageerrors AND network failures — failed requests and >=400
     responses — must be empty) — plus `probe.mjs` medians ≤ spec `perf_budget` (draws, tris),
     against a local http server, never `file://`. Probe `fps` is informational only
     (unreliable under SwiftShader) — never gate on it.
   - threejs framing & geometry (numerical, `library/harness/geom-verify.mjs`, r160-vetted): the
     design exposes `window.__qaFraming` (see `library/recipes/qa-framing-hook.md`) — a zero-arg
     closure returning the camera MVP + the SUBJECT's 8 world-AABB corners as RAW plain data (no
     verdict). `research/tools/framing-probe.mjs` loads the page under SwiftShader, reads that hook,
     and runs `geom-verify`'s PURE CORE (`projectCornersNDC` + `framingMetrics`) — the SAME numerics
     the in-page `checkFraming` wrapper uses, so there is one source of truth and zero drift. `ok`
     requires `fullyVisible && wellFramed && !overlapsHUD`; a subject offscreen, cropped at a frame
     edge, straddling the near plane, or hidden behind the HUD makes `ok===false` and the probe exits
     nonzero — record it as `mechanical.framing` (a framing failure FAILS the gate). A design with
     NO `__qaFraming` hook is a SKIP (`status:'no-hook'`), never a fabricated pass. The `w<=0` guard
     is load-bearing: three's `Vector3.project` divides clip x/y by clip-w with NO sign guard, so a
     corner behind the near plane flips the NDC sign and an off-frame subject reads as false-green
     "well framed" — the framing miss recorded across 5 retros; the probe therefore refuses a verdict
     (`straddles-near-plane`) instead of trusting flipped NDC. `checkGeometry` (concentric / high-IoU
     AABB pairs) is ADVISORY, not a hard fail: it REPORTS candidates for the modeler (a bolt
     legitimately sits inside a housing's AABB; an L-shape shares a high AABB IoU with no real
     overlap) and NEVER mutates the scene.
     **Scene-integration framing caveat**: `fullyVisible` checks whether the subject's AABB corners
     project inside the NDC viewport — it does NOT detect physical occlusion by non-subject geometry.
     A scene-integration capture can return `framing: ok` while showing a blank wall (subject projects
     inside frame but a host wall blocks the camera-to-subject ray). Extend `VIEW_HIDE` to include
     EVERY opaque layer between the camera and the subject, not just the subject's own label sprites.
   - blender: scene stats (polys, object count) ≤ budget via MCP scene-inspection code.
   - **Invariant tests** (when the design has a test suite): run it; a red suite BLOCKS the gate.
     Scope them per §Test-vs-render jurisdiction below — deterministic invariants only. Record it in
     the review JSON as `mechanical.tests: {command, pass, fail}` — `fail > 0` makes the gate FAIL
     regardless of the global score. No suite? Record `mechanical.tests: null` and say so in
     `mechanical.note`; never fabricate one to look rigorous. (The Blender track has no suite today:
     `null` is its normal value, not a defect.)
2. **Capture**:
   - **The capture SURFACE is declared by the pass, never chosen ad hoc.** A canvas-only screenshot is
     correct for blockout / structural / materials / surface / lighting — and it is BLIND to every DOM
     overlay: alarm banners, selection panels, HUD readouts, the control panel itself. Capturing the
     `interaction-ui` pass canvas-only means the judge scores the UI pass **without seeing its UI**.
     Passes whose deliverable lives in the DOM (interaction-ui, and P6 when it scores the HUD) capture
     the whole VIEWPORT (`capture.mjs --page`). Any validation harness must use the SAME viewport the
     gate does — a narrower window reflows the panel out of frame and reports a working state as broken.
   - threejs: `capture.mjs` screenshot (SwiftShader — works headless; chrome-devtools MCP does NOT).
   - blender: MCP viewport screenshot per pass; the FINAL gate (P6) uses a real render
     (EEVEE default; Cycles if the spec's `render` demands it).
   - **QUALIFY a renderer BEFORE it produces gate evidence.** A renderer/driver switch (a `--gpu`
     flag, SwiftShader→GPU, EEVEE→Cycles) is NOT qualified by a single-shot pilot. Drive a pilot
     that exercises EVERY content class the evidence contract uses — canvas textures, sprites, DOM
     raster in `--page` mode, full gate DPR — and pixel-compare against the canonical renderer PER
     CLASS. An unqualified renderer breaks in exactly the class the pilot skipped, and it breaks
     silently: the harness exits 0 and the pixels are wrong. (cinemex L4, 2026-07-15: `--gpu` was
     adopted on a measured single-shot pilot showing 0.61% delta — AA edges only — then rendered
     canvas-texture sprites and inactive DOM buttons as Chromium's crossed-out failed-texture
     placeholder in its first real DPR-3 full-page set. Caught by the orchestrator pre-look; set
     deleted, recaptured under SwiftShader, flag demoted to experimental-not-gate-safe in
     `capture.mjs`. Its measured 4.5x in-pipeline speedup is REAL — this rule gates its use as
     evidence, it does not forbid it.) **An experimental/demoted flag carries a DEFINED EXIT
     CONDITION, or the demotion is a permanent limbo nobody re-opens.** `--gpu`'s exit condition:
     it graduates back to gate-safe when it PASSES the per-content-class qualification pilot this
     rule requires — canvas textures, sprites, DOM raster in `--page` mode, full gate DPR —
     pixel-compared clean against SwiftShader per class. Record that pilot as the graduation
     evidence and lift the demotion in `capture.mjs`; until it passes, the flag stays experimental.
   - **QUALIFY a renderer BY TECHNIQUE, not just by content class — and some techniques are
     UNVERIFIABLE by this pipeline.** A fix that changes only what is DRAWN and adds NO geometry —
     stencil/section caps, a shader-only cover, a render-state toggle — is invisible to BOTH the
     headless visual gate (a downscaled render may not resolve it) AND every topology gate
     (`open-edge-cap`, `checkFusedMeshClosed`, `signedVolume` — they read geometry the technique never
     changes). Such a technique goes SILENTLY GREEN while the defect persists. So: (a) mark
     stencil/render-only techniques as **"needs a debug-mode capture or a pixel readback to gate"** —
     they are not gate-verifiable by the default evidence set; and (b) **PREFER A GEOMETRIC solution
     when one exists** (a real cap face over a stencil cap), because geometry IS verifiable by the
     gates already in the kit. (Revisor COB-IM2 WU-L4-B1, 2026-08-27: system-3d stencil caps for the
     see-through duct ends — a render-only technique — could not be gated; a geometric cap can.)
   - **"Prefer geometric" applies when the TECHNIQUE is the obstacle — NOT to escape a
     technique-independent code bug.** The (b) rule above is about gate-verifiability, not a blanket
     "always switch away from stencil". If a render-only failure reproduces IDENTICALLY across renderers
     (GPU == SwiftShader, pixel-for-pixel), it is a CODE bug, not renderer/technique fragility, and
     switching techniques drags the SAME bug into the new one UNFOUND — diagnose it in place first. And a
     stencil/render-only technique CAN be made gateable with the debug-mode/readback rule (a) asks for:
     Revisor's `?capdebug` (paint the caps + a before/after pixel diff) made the stencil verifiable in
     practice and WU-L4-B1 PASSED. (COB-IM2 WU-L4-B1: the stencil no-op was a `renderOrder`-on-Group
     render-order inversion, technique-independent; staying in stencil + fixing the order bug + adding
     `?capdebug` was correct — a geometry switch would have carried the order bug in unfound. See
     TRACK-THREEJS §renderOrder-on-Group.)
   - **To verify a RENDER-only change did something, DIFF before/after on the SAME renderer.** Do not
     interpret pixels or trust a pre-look — capture pre-change and post-change at the SAME camera on the
     SAME renderer and compare: **byte-identical (AE=0) proves a NO-OP**, regardless of how either frame
     looks. (This is how WU-L4-B1's stencil caps were proven a no-op — pre-B1 `git show` vs post-B1, AE=0
     — without any pixel judgement.) Note the corollary to the renderer-qualification rule above:
     SwiftShader vs GPU differed ~152k px on the SAME file (AA/wireframe), so a before/after diff is only
     valid WITHIN one renderer, never across a driver switch.
   - LOOK-DEV EVIDENCE — materials, lighting-camera and P6 REQUIRE the capture set, driven via
     URL params (`?view=...`; threejs: capture.mjs `--url-suffix`): `neutral` + `grazing`
     (low-angle close-up exposing smooth-plastic highlights, weak normals, tiling) +
     `reference-match` (source camera + lighting) wherever references exist. A material that
     only convinces in reference-matched light has NOT passed.
   - KINEMATIC EVIDENCE — any spec `animation` channel requires captures at ≥2 states (e.g.
     `?state=0` / `?state=90`) at its owning pass AND P6; reviewer scores pose coherence across the set.
3. **Blind vision review** → JSON conforming to `assets/review.schema.json`. The brief PASTES that
   schema's exact field names verbatim; it never points the judge at the schema file, which is how
   judges invent keys (`ROLES.md` §render-reviewer).

**Evidence-gated advance**: no pass advances without its screenshot(s) + review JSON on disk —
a verbal "looks good" is not a gate result. Write evidence to disk BEFORE starting corrections.

## Test-vs-render jurisdiction (binding)

Mechanical checks and the blind review are not redundant and not interchangeable. **The blind judge
finds NEW defects; the test suite prevents OLD ones from coming back.** Neither substitutes for the
other, and confusing them wastes attempts.

**The rule:**

> If a human can judge it by looking at one image, RENDER it — do not test it.
> If a human cannot count it at a glance, TEST it — do not eyeball it.

| Test it (deterministic invariants) | Render it (perceptual judgment) |
|---|---|
| topology, counts, bus/set membership | perceived luminance |
| absence of shortcut edges | composition and framing |
| placement validation (size, parent, containment) | brightness hierarchy between zones |
| absence of protected/licensed content | whether a material "convinces" |
| that a derived board/diagram matches its source topology | falloff, specular, shadows |

**THE CAPTURE URL IS A FIRST-CLASS CODE PATH — test the LOAD, not just the interaction.** A blind
reviewer only ever drives the app by URL, on a cold load. A human tester clicks. Those are two
different code paths, and a defect can live in exactly one of them:

> cinemex: all five fault states booted announcing "Sin alarmas" — `fault-internet` said so with **14
> alarms active**. Clicking the fault button repaired the line. So a human tester would NEVER have seen
> it, and it was present on precisely the path every capture takes. The boot sequence ended with a
> hard-coded `status.textContent = 'Sistema listo · Sin alarmas'` used as an "app ready" signal,
> clobbering the derived copy.

So: for every state in the evidence contract, assert the invariant **on load**, not after simulated
interaction. And assert CONSISTENCY BETWEEN SURFACES — if two DOM nodes describe the same state, a test
must prove they cannot contradict each other. Two surfaces, one derivation.

**WHEN THE INSTRUMENT ACCUSES, INTERROGATE THE INSTRUMENT FIRST.** Three times in this run a check
reported a defect that was in the CHECK:
- a readiness check built to prevent half-built captures was *causing* them (it read a cleared WebGL
  buffer, saw a constant hash, and declared the scene settled instantly — flagging 11 of 24 correct
  scenes as blank);
- a validator reported a working feature as broken (it measured through a narrower viewport than the gate);
- and the "fix" for a state-checker that could not model lineage resets was to copy artifacts under
  FAKE NAMES until it went green — a patch that is worse than the bug, because a later reader takes it
  for truth.

A tool that is wrong is more expensive than a tool that is missing: it sends you to fix code that is
not broken, with total confidence.

Three corollaries of interrogating the instrument, all paid for:
- **A watcher that can see itself reports motion in an empty room.** A liveness/wait pattern must
  EXCLUDE the watcher's own command line — match the interpreter+script (`pgrep -f
  "node.*capture.mjs"`) or exclude own PID. (cinemex, 2026-07-15: the re-armed capture watchdog
  polled `pgrep -f "capture.mjs"`, a pattern its OWN shell command line contained, so it matched
  itself forever: it never detected completion, timed out instead of reporting, and then read as a
  phantom in-flight capture at the next status check.) The concrete watchdog contract lives in
  PIPELINE.md §Execution modes.
- **An instrument that iterates "every X" must FAIL LOUD when it finds zero X** — assert and report
  the input census (`N found, N diffed, N covered`); a "no differences" report over an empty set is
  a false green, and a false green leaves no artifact to catch it later. (cinemex X1: the first
  chip-visibility diff resolved 0 camera presets and confidently reported "no changes".)
- **When two instruments disagree about evidence geometry, MEASURE the gated artifact itself** and
  re-express every dependent threshold as a UNIT CONVERSION (same physical meaning, new unit) —
  never adopt either claimed value, never recalibrate to force green. (cinemex X1: test model said
  0.8, ledger said 4:3; the gated PNGs measured 1.0818, and the four legibility floors converted
  ×(636/900) kept their physical meaning — 211/211 stayed green for the right reason.)

**PROHIBITED: perceptual test theater.** Never reimplement the renderer inside a unit test to predict
a pixel (compositing albedo × irradiance through the tone-map chain to assert a luminance number).
It is expensive, it is a second un-QA'd renderer, and it will report GREEN while the judge sees black.
A screenshot answers that question in two seconds and cannot lie. (Evidence: cinemex-hvac-lorawan
lighting L1 — a fully derived, green luminance ladder that the blind judge scored as "two lit tiers
and two black".)

Two corollaries, both learned the hard way:
- A test that COPIES the constant it guards cannot catch a wrong constant. DERIVE the property
  (`dot(normal, board→camera) > 0`), never assert the literal.
- A derived test is only as good as its SAMPLING. An unsampled surface is an unguarded surface —
  if a zone is scored as a whole, sample it as a whole (ceiling, floor, far wall, door), explicitly
  including surfaces NOT under a light.

## Blind-review protocol

**Before spending the review, the ORCHESTRATOR looks at the decisive captures itself** — starting
with whatever the writer declared as this attempt's risk. 30 seconds of looking vs a 45-minute
review cycle on evidence that is visibly broken. This is triage, not acceptance: the blind review
remains the only acceptance authority.

The reviewer (fresh-context agent at mode ≥ standard; inline role hat only in quick mode)
receives ONLY: the DesignSpec (`design-spec.yaml`), the current capture(s) — at P6 plus the P1
reference images (same viewpoint — never judge a front reference against a random render
angle) — and the rubric below.

The reviewer NEVER sees the code, the build history, or the modeler's rationale. It scores what
the pixels show against what the spec promises.

**Render authority**: modeler self-verification (scene-graph facts, measured metrics) never
accepts a pass. Verify corrections on the SAVED capture, not in-memory state; the blind
reviewer's view of that capture is the ONLY acceptance authority.

**The orchestrator PRE-LOOK is triage, never the verdict — on a pre-look ↔ blind discrepancy, an
objective MEASUREMENT of the gated artifact breaks the tie, not credence.** A pre-look opinion (even the
orchestrator's own) carries confirmation bias. In COB-IM2 WU-L4-A the pre-look read "bay isolated" while
the blind read "uniform carpet"; measuring the gated PNG (§measure the artifact) settled it — the
non-bay 2/3-right region dimmed only mean 50.3→45.0 (−10%), std 36.8→25.6, with the bay itself intact
(63.9→63.5). The dim was REAL but too modest, so the blind was right and the pre-look was biased. Resolve
a triage↔blind conflict by measuring the artifact, never by choosing whom to believe. (This is the
orchestrator-side twin of "mechanical-green is not a verdict".)

**ONE judge is a single point of failure — escalate to a PANEL.** A blind reviewer reads a
DOWNSCALED render and reasons from pixels alone, so it can be confidently wrong in three ways:
report a present-but-small feature as ABSENT, name the wrong CAUSE, or demand something the physics
cannot satisfy. All three happened in the cinemex run.

- Default: ONE judge.
- **When the SAME critical feature fails twice in a row: run THREE independent judges on that
  attempt and take the MAJORITY.** A judge costs ~5 min; a wasted attempt costs ~45. The arithmetic
  is not close.
- **Escalate the FINAL verdict to a 2-judge (or 3-judge) blind PANEL when a feature has BOUNCED
  across attempts** (passed then failed, or scored across the threshold), not only after N
  same-feature failures. Single-judge variance at the margin is real (nave-3sistemas: luminaire-grid
  swung 0.76↔0.55, ahu-and-duct-run 0.76↔0.71 across single judges; a 2-judge panel returned a stable
  unanimous 0.79). Take the panel's consensus; a split panel is surfaced to the user, not silently
  resolved.
- **N near-threshold failures of the SAME feature ⇒ interrogate the APPROACH, not the parameter.**
  When a feature keeps failing just under threshold across corrections, the defect is usually the
  ENFOQUE, not the tuning — no amount of the same move clears it (COB-IM2 WU-L4-A: frame+dim cannot
  isolate a 12 m strip of a 153 m plan at 0.31 oblique occupancy; two corrections both stalled
  near-threshold). Treat repeated near-threshold bounce as the signal to SWITCH APPROACH entirely
  (there: hide the non-bay geometry rather than dim it), handled as a user-authorized LINEAGE RESET with
  a fresh budget — not another polish pass on the exhausted retry loop. "Keep tuning the same knob" and
  "the approach is wrong" look identical from a single failure; they separate only across attempts.
- Give the panel members different lenses where the feature allows it (does it READ? is it PRESENT
  at native resolution? does it match the spec's promise?) — three identical judges are one judge
  with extra steps.
- **Fine detail (IDs, arrowheads, terminal cues, small labels): the evidence set MUST include a
  NATIVE-RESOLUTION CROP of that region.** Otherwise the judge scores a defect the downscale
  invented, and the pass burns attempts chasing a ghost. (cinemex: 8 attempts on arrowheads that
  were present and visible at 1:1 in the very capture the judge scored.)

**P6 comparison sheet**: stitch reference|render same-viewpoint pairs into ONE composite + one
blockout-vs-final strip (massing-drift check). Evidence packaging — AI vision judges, never pixel-diff.

**When there are NO reference images** — the normal case for a spec-driven synthetic scene, where P1's
evidence is textual (datasheets, dimensions, standards) rather than photographic: say so, do not fake
it. A `reference-match` camera preset that matches nothing is a lie in the evidence set.
- Check this at **P1/P2**, not at P6. `spec.references[]` with no image sources ⇒ record
  `p6_comparison: spec-only` in the spec and DROP the `reference-match` view from the evidence contract.
- P6 then gates on: the **spec's textual promises** (dimensions, part census, materials evidence) +
  the **blockout-vs-final strip** (massing drift) + the full critical-feature rubric. That is a valid
  P6, and it must be presented as such — never as a reference-backed one.
- (cinemex: discovered at the lighting pass that the design has ZERO reference images, while the kit
  demanded reference|render pairs and the app carried a `reference-match` preset. It would have
  surfaced at P6, with five passes built on top.)

**Rubric** — score 0.0–1.0 per item:
- `layer_scores` — five fixed layers, EVERY review: `silhouetteProportion`,
  `componentStructure`, `formDetail`, `materialSurface`, `lightingCamera`. Never hide a failed
  layer inside a high average.
- `global_score`: silhouette + proportions + material read + composition, as one gestalt.
- Each `critical_features[]` entry: present and reads correctly? Record in the review JSON's
  `features[]` (critical features only). Spec `important_features` → score each in
  `important_features[]` (same shape) plus their AVERAGE in `important_average`.
- `defects` (what is wrong, in pixel terms) + `corrections` (imperative, actionable fixes —
  never "improve quality"). Kinematic/multi-view sets: judge pose coherence ACROSS captures.

**Calibrated fidelity ladder** — a score means the SAME thing at every gate:
`0.2` rough placeholder · `0.4` silhouette recognizable · `0.6` macro/meso correct, weak
material · `0.75` reads correctly · `0.85` strong match · `0.95` near-reference. Cap scores at
0.85 for single-view gates; a multi-view capture set lifts the cap to 0.90.

## Verdict and action

```
PASS  iff  mechanical checks green (console clean AND within perf budget
             AND mechanical.tests is null or mechanical.tests.fail == 0)
       AND global_score >= quality_contract.global_min
       AND every critical feature score >= its threshold
       AND (if spec has important_features) their reviewed AVERAGE >= 0.65
       AND (if spec declares colorTarget.deltaE00Max) mechanical.color_delta_e00 <= that max
```

A critical feature below threshold FAILS the pass even with a high global score — critical
features exist precisely to stop "good enough" gestalt from masking missing identity details.

**Declared pass-subset.** The derived ladder is normally the full track ladder in order. When a
spec declares `gate_passes:` (an OPTIONAL, EXPLICIT subset — e.g. `gate_passes: [materials]` for a
flat-catalog asset, DESIGNSPEC.md / PIPELINE.md §Triage flat-catalog), the derived ladder is exactly
that subset kept in canonical order: passes outside it are absent (not derived, not `locked`), and
progress.yaml is only expected to cover the declared subset. An unknown pass name in `gate_passes`
is a hard error, like an unknown ladder pass in the cache.

**Objective material-colour gate.** The "does bare metal read as satin stainless / the right material"
judgement is measured reviewer-variance-dominated — an identical stainless render (mean gray 91.4 vs
91.6) scored 0.80 PASS by one blind reviewer and 0.57 FAIL by another (research/threejs-block53). When a
spec declares `colorTarget.deltaE00Max`, that axis stops being a reviewer guess: `material-color-probe.mjs`
(a repo tool, CIEDE2000 adapted from the img2threejs upstream) measures the render crop's mean sRGB, records
`mechanical.color_delta_e00`, and `gate-state.mjs` enforces `dE00 <= deltaE00Max` on the materials/surface
PASS — the reviewer still confirms IDENTITY (right shape/part), the SCRIPT judges the value. A colour-gated
PASS that declares the threshold but records no `color_delta_e00` is a contract violation (fail loud, like a
missing `global_min`), never a silent skip. The target is the RENDERED value (differs from the albedo hex
after ACES tonemapping); it may be authored from a golden render's crop when no photo exists.
**Source rule**: when a source photo or video exists, anchor `srgb` to a geometry-anchored crop
of THAT SOURCE — a render-derived target makes the gate tautological (certifies the render
matches itself, not the subject); the golden-render fallback is for genuinely unavailable source
only and must be labelled REGRESSION DETECTOR in both the spec and the review.

**Budget-headroom feedback** (P6 only): if final utilization is <50% of `perf_budget` AND any
layer <0.8, the P6 review must state whether spending headroom would raise the weak layer —
recommendation only, never a gate condition.

Every review ends in exactly ONE `action`:
`continue | refine-spec | refine-code | request-input | stop`.
- `refine-spec` — spec wrong or shallow: fix the YAML first, re-gate P3, THEN touch geometry.
  Never patch code around a bad spec. **ENFORCED: when a defect traces to the spec or the evidence
  contract itself, the gate MUST return `refine-spec` — compensating in code is self-approval of a
  broken contract** (cinemex X1: a viewport-aspect contradiction between test and harness forced
  the facade 4.5 m off-axis to satisfy two truths about one image).
  The re-gate is a **post-refine-spec SCOPED P3**: the validator sees ONLY the fields the refinement
  touched, not the whole spec. Re-validating an unchanged spec is cost with no signal. (cinemex,
  P6 L2: the RTU amendment's FAIL → prescribed-fix → PASS cycle took minutes because the validator
  saw only the touched fields.)
- `refine-code` — spec is right, build is wrong: apply `corrections` only.
- `request-input` — missing reference/dimension: ask the user; do not guess.
- `stop` — requested fidelity unreachable from current inputs — a VALID result; say so with evidence.

## Spatial, clash & mechanical-integrity gate

This section EXTENDS the three-step gate above; it replaces nothing. The blind vision review stays the
SOLE visual-acceptance authority (§Gate steps 3, §Blind-review protocol) and the ΔE00 colour gate stays
as authored (§Verdict and action). Everything added here is either a MECHANICAL check (TEST
jurisdiction, §Test-vs-render — a countable invariant a judge cannot see in one image) or an ADVISORY
aggregation that FEEDS the existing review. All of it obeys the kit's superset discipline: a spec that
DECLARES a threshold but records no measurement fails loud (like a missing `global_min` or an
un-recorded `color_delta_e00`); a spec that declares none of these fields leaves prior gate behaviour
byte-identical.

> **ENFORCEMENT STATUS (v1.18).** The measuring MODULES ship and are tested — `clash-detect.mjs`,
> `geom-metrics.mjs`, `view-variance.mjs`, `fitting-select.mjs`, `duct-router.mjs` (all green). They
> MEASURE and record (`mechanical.clash`, `mechanical.topology`, per-view arrays, …). Wiring the
> `assets/gate-state.mjs` DERIVER to auto-fail on the new spec-declared thresholds
> (`clearanceRisk.pClashMax`, per-device `maxDrawCalls`/`maxVisibleTriangles`, the topology hard-fails)
> — exactly as the ΔE00 `deltaE00Max` precedent does — is the ONE remaining IMPLEMENTATION unit, deferred
> so the deriver's characterization suite gets its own guarded change rather than being rushed into this
> multi-delta commit. Until then these gates are ENFORCED BY THE REVIEWER READING the recorded numbers
> (a critical mechanical zero caps the score per the existing "critical feature below threshold" rule),
> not yet auto-derived. Track this as the first v1.18.x follow-up.

### Deterministic SPATIAL / CLASH gate (mechanical)

`library/harness/clash-detect.mjs` — `detectClashes({groups, allowedContact, tolerance}) →
{clashes:[{a,b,depth}], gate}` — is the narrow-phase interference check, sibling of `geom-verify.mjs`
(same pure-core / dynamic-`import('three'/'three-mesh-bvh')` split). It closes the overlap judgment
`geom-verify` today punts to a human. It is an ORACLE: it REPORTS clashing part pairs + approximate
penetration depth and NEVER repositions geometry (same discipline as `checkGeometry`'s advisory
candidates, and as the spatial compiler in `references/spatial-world-model.md`).

- **`clash-detect` is a NODE-side gate/build tool — NEVER vendored into the offline browser dist.** It
  requires three-mesh-bvh and runs headless in Node (Rule 5 headless-gate); the offline single-file browser
  dist ships RENDER code only. Same for any harness pulling a Node-only dependency (see LIBRARY.md
  §Validating a library module).
- **HARD-FAIL on real interior penetration only.** The pass rule is `intersects && depth > tolerance`,
  never the boolean alone — a coplanar face touch (a welded port) is legal CONTACT, not a clash. Reuse
  `geom-verify`'s `gap3D` vocabulary: `clear | touching` (weld, allowed) `| overlapping` (interior
  defect, `depth > tolerance`). Penetration depth is the sampled ray-parity inside-penetration measure
  (a deterministic LOWER bound), NEVER the AABB-overlap proxy (it fabricates depth on non-contacting
  rotated/curved parts) and NEVER the closest-face-normal-sign test (unreliable at edges/corners).
- **Broad→narrow cascade**: occupancy voxel → AABB → OBB → BVH — cheap convex rejects first, exact
  triangle-triangle (Möller) BVH only on the survivors. The OBB tier keeps a ROTATED body's bounds tight
  so an inflated AABB does not raise a false clash before the BVH pass. This is the same cascade the
  spatial engine runs at placement time (`references/spatial-world-model.md`); here it runs at GATE time
  on built mesh geometry.
- **`allowedContact` is scoped to DIRECT owners only** — auto-populate it from each pipe's `{from,to}`
  equipment and nothing else. A pipe legitimately enters the service FACE of the equipment it connects;
  a pass-through crossing a THIRD body it does NOT connect to is not excluded and HARD-fails.
- **Invariant set — rules 001–010** (the deterministic spatial contract the gate enforces): no
  physical-volume overlap (001) … clearance volumes respected (007) … ports matched within tolerance,
  in-bounds, no floating parts, min-elevation. No named part groups ⇒ SKIP (`mechanical.clash: null`,
  absent — never a fabricated pass). Records `mechanical.clash`; hard-fails like `mechanical.tests`.
  Jurisdiction: TEST (invisible in a single capture, countable) — not a blind-review item.

### Mechanical hard-fails that CAP the score

Mirroring "a critical feature below threshold FAILS the pass even with a high global score" (§Verdict),
these COUNTABLE mechanical zeros cap the asset's Spatial-Intelligence score at **0.79** (7.9/10)
— **Spatial-Intelligence is a NEW proposed review category** scoring the geometry-correctness dimension the
visual gate cannot see (collisions/clearances/coords/connectivity); it sits ALONGSIDE the existing per-pass
quality score / `global_min`, it does not replace them —
regardless of visual quality — a pipe through an AHU cannot score ≥ 0.8 no matter how it renders:
`CriticalClashes = 0`, `DisconnectedPipes = 0`, `InvalidGeometry = 0`, `OutOfBounds = 0`. The critical
sub-scores — Geometry, Connectivity, Collision, Spatial — must EACH be ≥ 0.8 (a weak one is never
averaged away, same rule as `layer_scores`). Proposed Spatial-Intelligence sub-weights when the review
scores this category: Collisions 25 · Clearances 20 · Coordinates/frames 15 · Connectivity 15 ·
Orientations 10 · Routing 10 · Duplicates/overlap 5.

**`InvalidGeometry` sub-conditions** (each is a hard fail in this family):
- **InsideOut** — a built mesh with `signedVolume < 0` (`debox-winding.checkDeBoxWinding`).
- **NonManifold** — open edges / non-manifold vertices where the shell is DECLARED closed (`geom-verify`).
- **UncappedShell** — a shell whose cut ends are OPEN when the part declares them capped (P6, Revisor
  COB-IM2: the "see-through/hollow duct" defect that is NOT a winding bug — `signedVolume` passes on it).
  Gate against the DECLARED cap expectation: a legitimately-cut duct end HAS open edges, so the fail is
  "open where the part says capped", never "open edges exist". Fix is section/stencil caps, not a winding flip.

**Executable node-level impl:** `library/harness/realista-acceptance.mjs` (`acceptRealista`/`bestOfN`) composes
the gates above into one deterministic 0-10 verdict — reusing THIS section's hard-fail set + 0.79 cap + the
≥0.8 critical floors verbatim, REPORTS-only. It is the aggregator; a new failure mode becomes a hard-fail
sub-condition here or a weighted subscore there (Revisor's retro categories plug in as named `opts.weights`).
**Mechanical-green is not a verdict:** the aggregator never accepts — the blind review stays the sole visual
authority (§Blind-review protocol). Revisor COB-IM2 WU-L4-A proved it live: a framing gate went mechanically
green (overlapsHUD false, console clean) yet BLIND-failed 0.57 because the probe is blind to what else is
drawn around the subject (whole floor shown while the HUD claimed "one bay"). Mechanical checks CAP and
report; they never certify a pass on their own.

### BEST_VERSION retention + Self-Refine (extends the retry cap)

A correction can REGRESS (a fresh judge re-scores untouched features; §Self-correction loop already
warns a marginal PASS can flip). So on retry exhaustion RETAIN `BEST_VERSION = max(Q1, Q2, Q3)` — the
highest-scoring version across the max-2 retries, not whichever attempt came last. Track `ΔQ` between
attempts and STOP on diminishing returns (a correction that badly regresses another category is
rejected, not banked). Treat a failed gate as **Self-Refine**: feed the review's structured critique
(`defects` + `corrections`) back as the next attempt's brief, never a binary reject — this is what the
existing max-2-retry loop consumes (§Self-correction loop).

### 8-view multi-view CONSISTENCY score (ADVISORY — not acceptance)

`library/harness/view-variance.mjs` (pure-core, no three) aggregates the per-view blind scores as
`Score = μ − λσ` (λ ≈ 0.5): μ catches uniform wrongness, σ catches VIEW-DEPENDENT defects (missing
back-faces, one-sided materials / flipped normals, head-on-only billboards). It is an ADVISORY
aggregation ONLY — the blind VLM stays the sole visual authority (§Blind-review protocol); σ records a
`view_variance` flag on the existing 0.90 multi-view cap, it does not accept or reject. **Dependency**:
the reviewer brief must emit a per-view SCORE ARRAY (not one aggregate), and the N cameras must be a
fixed scripted shot set (else σ just measures camera noise). The real win is per-view scoring: a "reads
from the front, missing from the back" defect now trips the per-critical-feature FAIL rule PER VIEW
instead of being averaged away.

### Monte-Carlo P(clash) — OPT-IN only

A `monteCarlo({sigmas, samples, seed})` mode on `clash-detect.mjs` perturbs each part's placement within
declared tolerances (install ±20 / equip ±10 / struct ±15 mm) over K seeded draws and records
`mechanical.clash_probability`. It is a RISK ESTIMATE over an ASSUMED distribution, not a ground-truth
invariant — so it is ADVISORY by default and becomes a hard gate ONLY when the spec declares
`clearanceRisk.pClashMax` (DESIGNSPEC.md §Schema), exactly mirroring the optional `colorTarget.deltaE00Max`
pattern: declared ⇒ enforce `p_clash ≤ pClashMax`; declared-but-unrecorded ⇒ fail loud; absent ⇒
byte-identical prior behaviour, never an unconditional auto-fail. Deterministic via a `mulberry32` seed
(same seed → same P); build each `MeshBVH` once and perturb only the transform per draw (K = 1k–10k
tractable headless). Conditional on the CLASH gate above being present (reuses its BVH primitive).

### Topology gate — WIRE the existing checks

`geom-verify.mjs` ALREADY exports `signedVolume` (inside-out / flipped winding), `edgeManifold` (open +
non-manifold edges) and `meshIntegrity` (watertight) — but nothing GATES them today, so a design can
ship non-watertight or inside-out geometry with no record. Wire them into a `mechanical.topology` block
(`assets/review.schema.json` field; `assets/gate-state.mjs` reads it): **`insideOut` = HARD-FAIL** (a
flipped-winding mesh the visual gate misses); **openEdges / non-manifold = REPORT + threshold** against a
declared expectation (a cut duct end legitimately has open edges — gate on the declared expectation, not
absolute closure). TEST jurisdiction. Small pure-JS extensions to `geom-verify.mjs` complete the doc's
10 % Topology rubric component as an objective 0–10 score (`topologyReport()` → `{score:0..10, hardFail, flags}`; hardFail = insideOut/degenerate/bowtie/localFlip, deductions = sliver/openEdges/non-manifold): `triangleQuality()` (sliver/degenerate),
`normalConsistency()` (partial flips `signedVolume`'s global sign misses), `nonManifoldVertex()` (bowtie
fans), `fScore(a,b,τ)` (precision/recall at τ). Zero new deps.

### Auto PERF-BUDGET gate (extends the existing draws/tris budget)

The gate ALREADY compares `probe.mjs` medians against `spec.perf_budget` (draws, tris; §Gate steps 1).
v1.18 makes that budget declarable PER DEVICE CLASS as `maxDrawCalls` / `maxVisibleTriangles`
(DESIGNSPEC.md §Schema, under `quality_contract`), enforced deterministically like `global_min` and
`deltaE00Max`: **declared-but-missing measurement = fail loud; ABSENT = byte-identical prior behaviour**
(the plain `perf_budget` path is unchanged). It is a threshold gate on numbers the kit already records —
no new instrument.

### Proxy→realistic TRANSFORM-PRESERVATION invariant

The realistic (structural / materials) pass may ONLY SUBSTITUTE geometry for a blockout proxy — it must
NOT move it. A mechanical check diffs each node's `center` / `rotation` / `size` / `ports` BEFORE vs
AFTER the substitution and FAILS on any `delta > epsilon`. This catches the doc's own diagnosed failure
point: a proxy carries its bbox + ports as semantic payload, and a realistic pass that silently
re-places it invalidates every clash / clearance result the blockout already certified. TEST
jurisdiction; records `mechanical.transform_preserved`. Pairs with the semantic-proxy blockout pass
(TRACK-THREEJS §Pass ladder).

## Self-correction loop

**On FAIL, DIAGNOSE BEFORE YOU BUILD.** Run the `diagnostician` role (ROLES.md) first: cheap,
read-only, one job — turn the review's corrections into a root cause. It returns, per correction,
`confirmed` / `misdiagnosed — the real cause is X` / `impossible — arithmetic proof`. Only then does
the modeler build, from a CLOSED diagnosis.

Two reasons this is not optional:
- **Cost.** A modeler that must also diagnose pays full rediscovery on every attempt (cinemex: 30–60
  min and 250k–390k tokens per writer, whose load-bearing output was one sentence of root cause).
- **Correctness.** A blind-review correction is a HYPOTHESIS. The judge sees pixels: it reports the
  DEFECT reliably and the CAUSE unreliably. Applied literally, a misdiagnosed correction can make the
  real defect WORSE (cinemex S3: "nudge GATEWAY up, it overlaps RF2" — GATEWAY had 17.5 px of slack;
  the crowded pair was UG67-01/RF1 at 6.0 px, and obeying would have pushed the title into it).

A correction the physics cannot satisfy is a trap, not a task: if the diagnostician returns
`impossible`, the ORCHESTRATOR adjudicates (amend / relax / escalate to the user) — it never burns a
retry chasing it.

**Two failures of the SAME critical feature = STOP AND ASK WHY.** Before spending the third attempt,
the orchestrator MUST run a meta-analysis: *why does this feature keep failing?* Each judge is
fresh-context and does not know it is the Nth attempt — so nobody is counting, and nobody escalates.
The default failure mode is polishing the symptom, forever.

The meta-analysis asks ONE question: **is the defect in the thing being scored, or in what that thing
ANNOTATES?** A critical feature that fails repeatedly at a NEAR-THRESHOLD score (0.77, 0.78, 0.79…)
is the signature: the build is not "almost right", it is right about the wrong object.

> cinemex `canonical-network-endpoints` failed EIGHT consecutive attempts across three lineages,
> scoring 0.77–0.79, while every attempt tuned arrowheads, marker separation and label counts. The
> actual defect: each RS-485 drop terminated in a junction cube LARGER than the 100 mm TC300 it
> annotated — the chain's first node had no pixels at all. Eight attempts polished the annotation of
> an object that was not there.

Then apply the review's `corrections` (only those — no opportunistic rework), verify each
fix on the SAVED capture, re-run the full gate. Attempts are tracked in `runs/progress.yaml`.
Prefer NAMED resets over vague retries — `Silhouette Reset` (re-blockout proportions),
`Material Realism Reset` (rebuild palette from evidence): name the reset in `corrections`.
Max 2 correction retries per pass; after the 3rd failed attempt (`failed(3)`) STOP and
escalate with: the last review JSON, the capture(s), a one-paragraph diagnosis, and 2–3
concrete options (relax which threshold and why / change approach / drop feature). Never
lower a threshold or reinterpret a feature yourself.

**After ANY source change during a correction, RE-CAPTURE and RE-GATE the WHOLE evidence set, never
only the changed feature: a fresh judge re-scores untouched features too and a marginal PASS can
flip.** (nave-3sistemas: luminaire-grid went PASS 0.76 → FAIL 0.55 across attempts with its geometry
unchanged.)

**LINEAGE RESET — the user-authorized escape from `failed(3)`** (first-class, not an exception:
cinemex used four). When the user authorizes a reset instead of accepting a stop: (1) archive the
exhausted lineage's audit artifacts under `runs/**/history/` (derivation skips it); (2) new
artifacts take the next lineage segment (`<pass>-l<N>-attempt<M>`); (3) the new lineage inherits NO
score, NO verdict and a FRESH retry budget — it is a different approach, not attempt 4; (4) the
reset's scope is written down (what it may change, what must not regress). A run NEVER authorizes
its own reset, and `gate-state.mjs` derives from the highest lineage only.

**When a pass PASSES with unapplied corrections**, they do not evaporate: they land in
`<design-dir>/runs/DEFERRED-CORRECTIONS.md` (live ledger — status `open` / `owned-by:<pass>` /
`applied` / `accepted` / `void`). P6 re-scores everything, so an untracked deferred correction
arrives at the final gate as a surprise with the whole build stacked on top of it. A row leaves the
ledger only by being applied-and-re-gated, absorbed by the pass that owns it, or explicitly
accepted by the user.

## Retrofit gate (spec-less legacy designs)

To gate a design that predates its `design-spec.yaml`: EITHER write a minimal spec first
(identity, 3 critical features, budgets from the overlay device table) OR record assumed
thresholds in the review JSON's `assumed_thresholds` object (`{global_min: 0.75,
feature_default: 0.70}` + `mechanical.note: "assumed thresholds — no spec"`). Never write
`global_min` as a root key (`review.schema.json` rejects it); never present the verdict as spec-backed.

## Review validation

Validate every review JSON against `assets/review.schema.json`: `python3 -m jsonschema` when
available; this environment usually lacks it — use the node structural fallback:

```bash
node -e 's=require(process.argv[1]);r=require(process.argv[2]);m=s.required.filter(k=>!(k in r));if(m.length)throw new Error("missing: "+m);console.log("structurally valid")' \
  ~/.claude/skills/design3d/assets/review.schema.json ./review.json
```

`assets/gate-state.mjs <design-dir>` additionally checks reviews SEMANTICALLY — PASS coherence:
criticals ≥ thresholds, `important_average` ≥ 0.65, mechanical green, screenshot exists. Run it at resume and gate close.

## Artifacts

Persist per gate run under `<design-dir>/runs/`. The threejs capture harness names outputs
after the html basename — COPY/RENAME them to the gate names: `<pass>[-l<L>]-attempt<N>.png`,
`<pass>[-l<L>]-attempt<N>.console.json`, `<pass>[-l<L>]-attempt<N>.review.json`. The optional
`-l<L>` segment is the LINEAGE of a user-authorized reset (`gate-state.mjs` derives from the
highest lineage only); superseded lineages archive under `runs/**/history/`, which derivation
skips. **Multi-shot sets**: additionally COPY the representative shot to the exact canonical name
`<pass>[-l<L>]-attempt<N>.png` — `gate-state.mjs` derives pass state from that exact basename, and
a suffix-only set reads as a false `failed(1)` + drift (cinemex interaction-ui, 2026-07-14). Update
`progress.yaml`
with `{status, attempts, score, action, screenshot, review}` — atomically, per PIPELINE.md.

**Capture lifecycle (EVIDENCE vs EPHEMERAL)**: every capture written is one of two things —
EVIDENCE, bound to a run note or gate artifact either by its exact canonical name
(`<pass>[-l<L>]-attempt<N>.*`) or by a glob the note documents explicitly, OR EPHEMERAL, written
to the session scratchpad and NEVER to `runs/assets/`. Route working/throwaway frames to the
scratchpad at write time so they never accumulate under the design dir.

**Capture-GC (at every round/pass close)**: sweep `runs/assets/` for files bound to no note or gate
(no exact canonical name, no documented glob), report the census in the run note
(`kept N / deleted N / bytes freed`), and delete the orphans. Prunable once its attempt closes:
superseded working frames (per-shot `frame0`/`frame1`, `lights-on`/`lights-off` variants of a shot
whose representative already passed). NEVER prunable: the canonical `<pass>[-l<L>]-attempt<N>.*` gate
captures — `gate-state.mjs` derives pass state from those exact basenames, so deleting one silently
rewrites gate history. (Measured 2026-07-18: `runs/assets/` had grown to 432 PNGs / 285 MB with only
28 bound by exact name — the on-gate-close cleanup below is not enough alone; census +
scratchpad-routing + name protection are what bound the growth.)

**Capture cleanup (on gate close)**: delete superseded attempt PNGs/consoles and raw
pre-rename capture duplicates; keep the passing attempt's PNG + ALL review JSONs.
Tool: `node assets/capture-gc.mjs <design-dir|catalog-root> [--apply] [--dedup]` (closes the SKILL
v1.8 DEFERRED `capture-gc` item). Dry-run by default. PRUNE policy — EVIDENCE vs EPHEMERAL:
(A) ALL png/console.json of **fail-attempt bases** (review present, verdict ≠ PASS) are prunable
— "delete superseded attempt PNGs/consoles"; their review.jsons are always kept; gate-state derives
passed state only from the PASS attempt's exact basename, so FAIL-attempt PNGs are not load-bearing.
(B) Suffixed png of a **pass-attempt base** whose md5 == rep png md5 is a redundant byte-copy —
prunable. Distinct-view frames (md5 ≠ rep) are EVIDENCE cited by the review — kept.
(C) Frames with **no review owner** (no sibling review.json) are scratch — prunable.
Never deletes: review.jsons, the passing rep png/console, distinct-view coverage frames, progress.yaml,
*.md/*.yaml, subdirs. v1.14: also handles **full-ladder** design dirs (per-pass names
`<pass>-attempt<N>.png`, no `<slug>.png`) — same policy, PROMOTE step skipped. FLAT-CATALOG path
unchanged. PROMOTE: copies passing rep's review to `<slug>.review.json` (additive, never overwrites).
`--dedup` ALSO prunes the flat-catalog passing rep's unsuffixed PNG (byte-twin of `<slug>.png`):
safe because `gate-state.mjs` accepts the promoted canonical `<slug>.{png,review.json}` as pass
witness (`hasPngWitness`, `canonical-witness` characterization test). Cache retrofit: after a `--dedup`
sweep, `node assets/gate-state.mjs <design-dir> --write-cache` regenerates a missing `runs/progress.yaml`.
First applied 2026-08-07 on nave-panccadia equipos (18 promoted, 18 byte-twins / 7.39 MB freed,
18/18 gate-clean). Repo-wide sweep: `bash assets/toolbelt/sweep-captures.sh [<repo-root>]` — census
all design groups, reports PRUNABLE dirs + total MB freeable, fail-loud zero-census guard (mirrors
sweep-retros.sh); SessionStart hook: `assets/toolbelt/sweep-captures-hook.sh`.
