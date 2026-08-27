# MATH/QC — two net-new QC deltas from investigacion.md §4 (Decision Framework / Scoring)

**Tag:** MATH/QC
**Subject:** two scoring/analysis ideas from the source doc's §4.3, judged for adoption against the
design3d-kit's EXISTING gate system (`references/GATES.md`, `SKILL.md` Hard Rules) and its hard
constraints (zero-dep, offline single-file, WSL2-no-GPU/SwiftShader, deterministic capture).

- **Delta A** — multi-view statistical scoring `Score_visual = μ − λσ` (λ≈0.5)
  (source: `investigacion-digest.md` §4.3 line 196; original file lines 1288–1322, 4384–4432, 5679–5701).
- **Delta B** — Monte Carlo tolerance → interference probability P(clash)
  (source: `investigacion-digest.md` §4.3 line 198; original file lines 6851–6895).

**Deltas-only against v1.17.** Every verdict is anchored in the real kit files, cited file:line.

**The one non-negotiable the kit imposes on BOTH deltas** (`GATES.md:3-6`): *"Screenshots are evidence
packaging; blind vision review is the ONLY acceptance authority — never pixel-diff or heuristic
auto-acceptance."* Reinforced at `GATES.md:192` (*"the blind review remains the only acceptance
authority"*) and `GATES.md:204` (*"the blind reviewer's view of that capture is the ONLY acceptance
authority"*). Neither delta may become a new acceptance authority. Both must be either (a) an
aggregation FEEDING the existing scoring, or (b) an advisory/deterministic detector in the mechanical
(TEST) column — never a heuristic that auto-accepts or auto-rejects a visual pass on its own.

---

## DELTA A — `Score_visual = μ − λσ` multi-view statistical scoring

### A.1 Is the statistics sound? What does σ actually catch?

**Sound, as an AGGREGATION — not novel, and correctly motivated.** `μ − λσ` is a *risk-adjusted /
pessimistic aggregate*: it rewards a design whose quality is CONSISTENT across viewpoints and
penalizes one whose mean is propped up by a single flattering angle. It is the same family as a
one-sided lower-confidence bound or a mean–variance (Markowitz-style) penalty — a standard, defensible
way to summarize a sample when you distrust the max. With λ≈0.5 the penalty is mild (half a standard
deviation), so it nudges rather than dominates. The source's own justification is correct: *"penalizes
inconsistency so one pretty photo can't earn a 9 … benchmarks show models drop on viewpoint change"*
(`investigacion-digest.md:196`).

**What σ catches (the load-bearing question):** cross-view σ is high exactly when quality is
**view-dependent** — the failure class a single hero shot hides:
- missing / un-modeled **back faces** and rear geometry (looks finished head-on, hollow from behind);
- **one-sided materials** / flipped winding / inverted normals visible only from certain angles;
- **billboard/sprite labels** (drei `<Html>` / canvas sprites) that only read when faced head-on;
- an asset that is genuinely *"only looks right head-on."*

**What σ does NOT catch (and why that's fine):** a defect present *equally in every view* (uniformly
wrong proportions, uniformly wrong material) lowers **μ**, not σ. So μ and σ are **complementary, not
redundant** — μ measures overall quality, σ measures its *variance across viewpoint*. That is precisely
the decomposition you want.

**Caveats to state honestly:**
1. With a small camera set (4–8 views) σ is a **noisy estimator** — few samples. λ≈0.5 keeps it a soft
   signal, which is the right call; do not gate hard on it (see A.2).
2. σ **conflates** "genuinely inconsistent quality" with "legitimately different but all-acceptable
   views" — a top-down view honestly shows less detail than a 3/4 hero because that is what the top
   *is*, not because of a defect. ⇒ **σ is a defect FLAG, not proof of a defect.** This maps 1:1 onto
   the kit's existing discipline for `checkGeometry`: *"ADVISORY, not a hard fail … REPORTS candidates
   for the modeler … NEVER mutates the scene"* (`GATES.md:52-54`).

### A.2 Fit: does μ−λσ REPLACE, WRAP, or FEED the existing gate?

**It FEEDS. Confirmed — the prompt's framing is correct, with one important sharpening.**

The kit's acceptance authority is the **blind VLM** plus the deterministic mechanical checks
(`GATES.md:3-6`, `:263-273`). μ−λσ **cannot** be a new acceptance authority (that would be the
forbidden "heuristic auto-acceptance"). Its correct role: **a scoring aggregation computed over a fixed
multi-cam capture set from the VLM's own per-view scores**, plus σ surfaced as an advisory
`view_variance` defect flag. The VLM still judges; μ−λσ does arithmetic on what it returned.

**The sharpening (this is the real win, and it is NOT μ−λσ itself):** to compute μ−λσ you need
*per-view* scores `s_i`. Today the reviewer receives the capture SET and returns **one** review JSON —
one `global_score`, one set of `layer_scores`, judging *"pose coherence ACROSS captures"*
(`GATES.md:253`) — it does **not** emit a per-view score array. Delta A therefore requires the reviewer
contract to emit **one score per view**. Once it does, the biggest gain is on the **hard-fail rule**,
not on the gestalt average:

> Today a critical feature *"reads correctly from the front, missing from the back"* is averaged into a
> single global gestalt and can survive. With per-view scoring, the back view scores that critical
> feature **below its threshold**, and the existing rule *"A critical feature below threshold FAILS the
> pass even with a high global score"* (`GATES.md:273`, `SKILL.md:31-33` Rule 3) fires on that view.

So the multi-view capture set upgrades **critical-feature hard-fail COVERAGE** (a feature invisible
from behind is now caught deterministically per-view), and **μ−λσ is the gestalt/global summary layered
on top** while **σ is the advisory `view_variance` flag**. The hard-fail rule stays supreme and is
*strengthened*, not bypassed; μ−λσ operates on the global/visual gestalt axis only.

**Where μ−λσ plugs in numerically:** it is the natural definition of the multi-view `global_score`. The
kit already treats multi-view specially — it lifts the score cap from **0.85 (single-view gates) to
0.90 (a multi-view capture set)** (`GATES.md:258`). μ−λσ is exactly the aggregate that 0.90-capped
axis should carry. Clean, pre-existing hook — no new axis invented.

**Interaction with the panel/escalation machinery:** a **high σ** is a natural, cheap trigger for the
kit's existing escalation — *"run THREE independent judges … escalate the FINAL verdict to a 2/3-judge
blind PANEL when a feature has BOUNCED"* (`GATES.md:213-220`). High cross-view variance is the
same signal ("the model is unstable at the margin") the panel rule already responds to.

### A.3 Determinism tie-in (Rule 9) — the capture contract

**Non-negotiable: the N cameras MUST be a fixed, scripted set, or σ measures camera noise, not model
quality.** `SKILL.md:54-57` Rule 9: *"every Three.js scene must expose a `window.__cam` accessor and
honour a `--cam <x,y,z,tx,ty,tz>` flag so captures are taken from an identical, scripted viewpoint —
never an interactively-nudged one."* If a camera drifts by a degree between runs, σ picks up the drift
and the score is irreproducible.

**Capture contract for Delta A:**
- The multi-cam set is **declared in the spec's evidence contract** and driven deterministically by
  `research/tools/capture.mjs` — either `--cam <x,y,z,tx,ty,tz>` per shot (Rule 9), or the existing
  `--shots <shots.json> --page` / `--url-suffix "view=..."` machinery where the page reads `?view=`
  (`TRACK-THREEJS.md:173-182`, GATES look-dev/kinematic evidence `GATES.md:95-101`).
- It reuses the **same fixed set** that already lifts the cap to 0.90 (`GATES.md:258`) — this is not a
  new capture concept, it is per-view *scoring* added onto the multi-view *set* the kit already has.
- GATES step-0 **contract check already enforces the pre-conditions** σ needs: every shot must render a
  view that is *"(a) not the default and (b) not a duplicate of another shot"* (`GATES.md:14`). A
  duplicate or default-reset shot would corrupt σ; the preflight already refuses it.
- Under WSL2/no-GPU this runs headless via SwiftShader over a local http server — never `file://`
  (`SKILL.md:35-36` Rule 5). No new environment surface.

### A.4 Kit delta (exact paths) + jurisdiction

**New scorer — `library/harness/view-variance.mjs`** (sibling of `geom-verify.mjs`). Unlike
`geom-verify.mjs` / `clash-detect.mjs` it needs **no three.js** — it is pure arithmetic over a score
array, so it is a **pure-core-only** module, unit-testable in bare Node exactly like
`geom-verify.test.mjs` (`geom-verify.mjs:9-16` split rationale).

```
scoreViews(perViewScores, opts) → { mu, sigma, scoreVisual, highVariance, worstView }

INPUTS
  perViewScores : Array<{ view:string, score:number }>   // per-view VLM scores s_i (the global/visual axis)
  opts.lambda        (default 0.5)          // μ − λσ penalty weight
  opts.sigmaWarn     (default e.g. 0.10)    // σ above this ⇒ highVariance flag (ADVISORY)

OUTPUT
  mu          = mean(s_i)
  sigma       = population std of s_i
  scoreVisual = mu − lambda*sigma           // the multi-view global_score (0.90-cap axis, GATES:258)
  highVariance= sigma > opts.sigmaWarn       // advisory defect FLAG, not a verdict
  worstView   = argmin_i score               // where to look / what to recapture

DISCIPLINE (same as geom-verify.mjs:5-7): REPORTS ONLY. Never mutates the scene, never auto-accepts,
never auto-rejects. It computes numbers over VLM output; the VLM owns acceptance.
```

**Record placement + jurisdiction (Rule 7 — I am CORRECTING the prompt's suggested naming):**
- **Jurisdiction is RENDER-review, NOT TEST.** The *aggregation* (μ, σ) is deterministic arithmetic,
  but its **inputs are perceptual** (per-view VLM scores). Rule 7 (`SKILL.md:41-43`, `GATES.md:120-126`)
  puts *"perceived luminance / whether a material convinces / composition"* in the RENDER column. Per-view
  visual scores are RENDER judgments; σ over them is a RENDER-review aggregation.
- Therefore **do NOT record it under `mechanical.*`.** In this kit `mechanical.*` means the deterministic
  hard-gates whose inputs are ground truth — `mechanical.tests`, `mechanical.framing`, `mechanical.clash`,
  `mechanical.color_delta_e00` (`GATES.md:32-66`, `:263-269`). `view_variance`'s inputs are VLM scores,
  so filing it as `mechanical.view_variance` would be a category error that invites treating it as a hard
  gate. Record it instead as a **scoring/aggregation block in the review JSON**, e.g.
  `view_variance: { mu, sigma, score_visual, lambda, high_variance, worst_view, per_view:[...] }`
  (add to `assets/review.schema.json`), computed by the harness scorer AFTER the VLM returns.
- **It does NOT hard-gate.** The high-σ flag is **advisory** — it surfaces a defect for the orchestrator
  / next judge (and is a natural panel-escalation trigger, A.2). What DOES hard-gate is the **existing
  per-critical-feature rule applied per view** (`GATES.md:273`) — that is where multi-view earns its
  keep, and it needs no new mechanical field at all.

### A.5 Verdict — Delta A

- **Classification: BORROW-concept (adapt).** Adopt the μ−λσ *aggregation* and the σ *flag*; do not
  adopt the doc's generic "score N arbitrary cameras in a loop" as a standalone scorer.
- **Advisory detector + scoring aggregation — NOT an acceptance gate.** The blind VLM keeps sole visual
  acceptance authority (`GATES.md:3-6`).
- **Adapt-don't-copy mapping** (doc idea → OUR gated deterministic pipeline):
  1. The doc's cameras are arbitrary; **ours is a FIXED scripted `--cam`/`--shots` set** (Rule 9,
     `GATES.md:14` distinctness) so σ is signal, not camera noise.
  2. The doc implies a *new* scoring loop; **ours routes per-view scores through the EXISTING blind
     VLM** (one review call emitting a per-view array — respects the kit's judge-cost discipline,
     `GATES.md:211-220`, rather than N× separate reviews).
  3. The doc treats μ−λσ as *the* score; **ours keeps the EXISTING per-critical-feature hard-fail
     supreme** (`GATES.md:273`), now applied per view — that is the real win, μ−λσ is the gestalt
     summary on the 0.90-capped multi-view axis (`GATES.md:258`).
  4. σ is an **ADVISORY flag** consistent with the kit's "report candidates, never auto-accept"
     discipline (`GATES.md:52-54`), and a **panel-escalation trigger** (`GATES.md:213-220`) — never a
     new verdict.

---

## DELTA B — Monte Carlo tolerance → interference probability P(clash)

### B.1 Is it the right way to catch "clears by 2 mm nominal, clashes in 30 % of draws"?

**Yes — textbook statistical tolerance analysis, and it catches exactly the case a nominal check
cannot.** The kit's §1 clash primitive (proposed `clash-detect.mjs`, `mathqc-block-bvh-clash.md`)
tests the **ideal, nominal** assembly — every part at its exact designed pose. Real installs carry
**positional tolerance**; accumulated tolerances (tolerance stack-up) can push a joint that clears by
2 mm nominal into interference on some fraction of realized assemblies. Monte Carlo tolerance analysis
**samples the tolerance distributions** and estimates **P(interference)** over realized draws.

This is the accepted statistical alternative to **worst-case stack-up** (which sums all tolerances at
their extremes and is usually over-conservative — it flags assemblies that would essentially never
occur) and to **root-sum-square (RSS)** (which assumes linear, normal stack-ups). **Monte Carlo is the
general method** because it handles the **non-linear** geometry of a 3-D clash test (a rotated-box /
triangle-triangle interference is not a linear function of the input offsets, so RSS does not apply
cleanly) and arbitrary per-part distributions. The source states the method and the tolerances
correctly: *"install ±20 mm / equipment ±10 mm / structure ±15 mm; 10,000 sims → interference
probability (e.g. 1.6 %) → '22 mm nominal, 1.6 % risk → too tight'"* (`investigacion-digest.md:198`;
original lines 6851–6895). That is precisely the "clears nominally, risky in practice" detector.

**Caveats to state:**
1. The result depends on the assumed tolerance **distribution** (uniform half-width vs normal, and
   whether ±20 mm is a 3σ bound or a hard limit). This materially changes P. ⇒ **the distribution and
   the per-class σ must be DECLARED in the spec, never hard-coded** — same posture the kit already
   takes for `colorTarget` (`GATES.md:284-290`).
2. P(clash) is an **estimate** with Monte Carlo error ≈ √(p(1−p)/K). At K=1 000 and p≈0.02 the 95 % CI
   is ≈ ±0.9 % absolute. ⇒ **report a confidence interval**, not a bare percentage.

### B.2 Pure-JS + deterministic feasibility, and the cost model

**Deterministic: YES, cleanly.** A seeded PRNG makes the whole thing reproducible with **no
dependency**. **mulberry32** is a ~5-line deterministic 32-bit generator — no dep, matching the kit's
zero-dep posture. Determinism contract: **`{seed, samples, sigmas, distribution}` fully determine the
output** — same seed → same perturbation sequence → same per-draw clash booleans → same P(clash),
run-to-run and machine-to-machine. This composes with the §1 finding that three-mesh-bvh's clash path
has **zero `Math.random`/`Date.now`** (`mathqc-block-bvh-clash.md` §3, lines 145–153) — the ONLY
randomness is the seeded draw we introduce. The residual FP-at-the-seam caveat is already handled by
the §1 `touchEps` allowed-touch tolerance (`mathqc-block-bvh-clash.md:198-206`, §3): **same seed + same
touchEps → same P(clash)**.

**Cost model — the key efficiency point: build each BVH ONCE, perturb only the transform.** The §1 API
is `intersectsGeometry(otherGeometry, geomToMesh)` (`mathqc-block-bvh-clash.md` §1) — it takes the
other geometry's transform *as a matrix argument*. Geometry does not change between draws, only pose
does, so you **build the MeshBVH per part once** and, per sample, compose the perturbed pose into the
`geomToMesh` matrix and re-run `intersectsGeometry` — **no BVH rebuild per draw.**
- Per sample cost = (admitted pairs) × `intersectsGeometry` (fast BVH-vs-BVH descent). An AABB
  broad-phase pre-filter (only run the exact test on pairs whose *perturbed* AABBs are near) cuts it
  further — the same broad→narrow cascade the source itself advocates.
- K=1 000 (default, ≈±1 % CI) to K=10 000 (tight tolerances) × tens of pairs = 10⁴–10⁵
  `intersectsGeometry` calls. **Tractable headless** — seconds to low minutes in the same pure-Node
  context as `geom-verify.test.mjs` (`mathqc-block-bvh-clash.md` §2: entire clash path is geometry math
  over typed arrays, no DOM/GL). K=10 000 is the source's own figure and is fine at these per-call costs.

**Perturbation scope:** the source gives **translation** tolerances only (±20/±10/±15 mm) — implement
translation perturbation per part, mapping each named group to its tolerance class (install / equipment
/ structure). Small **rotation** tolerance is a documented optional extension, not in the source.

### B.3 Kit delta (exact paths), pass rule, jurisdiction

**New mode on the (proposed) §1 file — `monteCarlo(...)` on `library/harness/clash-detect.mjs`.**
NOTE: `clash-detect.mjs` **does not exist yet** — it is the §1 BORROW proposal
(`mathqc-block-bvh-clash.md` §5a). **Delta B is conditional on §1 being adopted** (adopt §1 first, or
the two together); B reuses §1's exact BVH clash primitive rather than introducing a second collision
engine.

```
monteCarlo(groups, opts) → { pClash, samples, seed, ci95, perPair:[...], histogram }

INPUTS
  groups   : same named part-groups as §1 checkClashes (each mapped to a tolerance class)
  opts.sigmas       { install:0.020, equipment:0.010, structure:0.015 }  // metres; per-class
  opts.distribution 'uniform' | 'normal'   (default declared in spec)     // ± = half-width | 3σ
  opts.samples      (default 1000; up to 10000)
  opts.seed         (required; mulberry32)  // determinism contract
  opts.touchEps     inherited from §1 (allowed-touch tolerance at the seam)

METHOD (headless, deterministic)
  build MeshBVH per collider ONCE (§1); for each of K seeded draws: perturb each part's pose within
  its class σ, compose into geomToMesh, run §1 intersectsGeometry per admitted pair (+AABB broad-phase),
  tally clashing draws; aggregate.

OUTPUT
  pClash    : overall P(any admitted pair clashes)     (with ci95 = 1.96·√(p(1−p)/K))
  perPair   : [{ a, b, p, worstDrawPenetration }]      // which joint is the risk, and how bad
  histogram : distribution of clashing-pair count / penetration across draws
  → recorded as review JSON `mechanical.clash_probability: { pClash, ci95, samples, seed, perPair, histogram }`

DISCIPLINE: REPORTS ONLY (same as §1 / geom-verify.mjs:5-7).
```

**Pass rule — advisory by default, opt-in hard-gate via a declared threshold.** This is the critical
judgment, and it **differs from §1's nominal check**:
- §1 nominal clash is a **HARD gate** (`pairs.length > 0` FAILS, `mathqc-block-bvh-clash.md` §5b) —
  correct, because a nominal interpenetration is a *definite* defect.
- P(clash) over tolerance draws is a **RISK metric**, not a deterministic invariant: a design that
  clears nominally with P=3 % is *risky*, not *broken*, and the number depends on an **assumed
  distribution** (an input, not ground truth). An unconditional auto-fail would gate on that assumption
  and impose a universal threshold the kit cannot justify. The source itself frames it as **advisory
  guidance** ("1.6 % risk → too tight").
- **Adopt the kit's existing optional-declared-threshold pattern** — the exact shape of
  `colorTarget.deltaE00Max` (`GATES.md:284-290`; SKILL v1.10): **absent ⇒ advisory only** (record
  P(clash) + WARN if P exceeds a soft advisory threshold, e.g. 1 %); **declared ⇒ enforced** — when the
  spec declares e.g. `clearanceRisk.pClashMax`, `gate-state.mjs` hard-fails on `pClash > pClashMax`
  (mirroring `dE00 <= deltaE00Max`, and *"declared-but-missing is a contract violation, fail loud …
  ABSENT = byte-identical prior behaviour"*). Pure superset, guarded like `specDeltaE00Max !== null`.

**Jurisdiction (Rule 7): TEST, unambiguously.** P(clash) is deterministic, headless, invisible in a
render — *"a duct clipping 8 mm through a beam three layers deep is invisible in a downscaled
blind-review capture"* and *"you cannot eyeball P(clash)"* (`mathqc-block-bvh-clash.md` §5c;
`SKILL.md:41-43` Rule 7 — *"if a human cannot count it at a glance, TEST it"*). It records under
`mechanical.clash_probability`, **does not consume a blind-review attempt**, and the VLM never sees the
tolerance draws.

### B.4 Verdict — Delta B

- **Classification: ADOPT-pure-JS.** mulberry32 (no dep) + reuse of §1's three-mesh-bvh primitive
  (already argued into `library/harness/`, MIT, headless, deterministic). No new runtime dependency, no
  second collision engine. **Conditional on §1 (`clash-detect.mjs`) being adopted.**
- **TEST-jurisdiction, advisory by default, opt-in acceptance gate** via a spec-declared
  `clearanceRisk.pClashMax` (colorTarget pattern). Never touches the blind VLM.
- **Adapt-don't-copy mapping** (doc idea → OUR gated deterministic pipeline):
  1. The doc reuses no specific engine; **ours reuses the EXACT §1 clash primitive** (one collision
     engine in the kit, not two).
  2. The doc's 10 000-sim loop is not reproducible; **ours is deterministic by contract** (mulberry32
     seed — Rule 9 determinism spirit extended to sampling).
  3. The doc implies re-evaluating from scratch; **ours builds BVHs once and perturbs only the
     transform matrix** (the `geomToMesh` argument, §1) — the efficiency that makes K=10 000 tractable.
  4. The doc reports a bare percentage; **ours records a CI** (√(p(1−p)/K)) and a per-pair/histogram
     breakdown so the risky JOINT is named, not just the global number.
  5. The doc treats it as free-floating guidance; **ours slots it into the kit's optional-declared-
     threshold gate** (absent = advisory superset, declared = hard-fail) instead of an unconditional
     auto-fail.

---

## Combined summary

| | Delta A — μ−λσ multi-view | Delta B — Monte Carlo P(clash) |
|---|---|---|
| Source | investigacion §4.3 (`digest:196`) | investigacion §4.3 (`digest:198`) |
| Verdict | **BORROW-concept (adapt)** | **ADOPT-pure-JS** (dep-free) |
| Advisory or gate | **Advisory** flag + scoring aggregation; **NOT** an acceptance gate | **Advisory** by default; **opt-in hard-gate** via declared `clearanceRisk.pClashMax` |
| Jurisdiction (Rule 7) | **RENDER-review** aggregation (inputs are VLM scores) | **TEST** (deterministic, headless, un-eyeballable) |
| Acceptance authority | Blind VLM keeps it (`GATES.md:3-6`) — unchanged | Blind VLM untouched (tolerance risk invisible to it) |
| Kit delta path | new `library/harness/view-variance.mjs` (pure-core) + `view_variance` block in review JSON / `review.schema.json`; per-view reviewer contract | `monteCarlo(...)` mode on the **proposed** `library/harness/clash-detect.mjs` (§1) + `mechanical.clash_probability`; `gate-state.mjs` optional threshold |
| Determinism hook | fixed `--cam`/`--shots` set (Rule 9, `SKILL.md:54-57`) or σ = camera noise | mulberry32 seed + §1 `touchEps`; same seed → same P |
| Real "win" | per-view scoring upgrades **critical-feature hard-fail coverage** (`GATES.md:273`); μ−λσ is the 0.90-cap gestalt (`GATES.md:258`) | catches "clears nominal, clashes under tolerance" that §1 nominal check structurally cannot |
| Depends on | reviewer emitting per-view `s_i` array (contract change) | §1 `clash-detect.mjs` being adopted first |

**Corrections issued to the brief's framing:**
- Delta A should **not** be recorded under `mechanical.*` (its inputs are perceptual VLM scores → it is
  RENDER-review, not a deterministic mechanical hard-gate). Record it as a `view_variance` scoring block;
  the deterministic hard-gate that multi-view actually strengthens is the **existing per-critical-feature
  rule applied per view**, which needs no new mechanical field.
- Delta B's hard-gate must be **opt-in via a declared threshold** (colorTarget pattern), not an
  unconditional auto-fail — because P(clash) is a risk estimate over an *assumed distribution*, not a
  ground-truth invariant like a nominal interpenetration.

### Citations index
- `references/GATES.md` — :3-6 blind-VLM-only / no pixel-diff-or-heuristic-auto-acceptance, :14 step-0
  distinctness+not-default, :32-66 mechanical checks, :52-54 checkGeometry ADVISORY/reports-candidates,
  :95-101 look-dev/kinematic multi-shot evidence, :120-126 test-vs-render table, :192/:204
  blind-review-only acceptance authority, :211-220 panel/escalation, :253 pose-coherence-across-captures,
  :258 cap 0.85 single / 0.90 multi-view, :263-273 verdict + critical-feature hard-fail, :284-290
  colorTarget.deltaE00Max optional-declared-threshold pattern.
- `SKILL.md` — Rule 3 :31-33 (pass-locked, critical-feature hard-fail), Rule 5 :35-36 (capture via
  harness over http, WSL2-no-GPU), Rule 7 :41-43 (test-vs-render), Rule 9 :54-57 (`window.__cam` /
  `--cam` deterministic capture); v1.10 changelog (colorTarget dE00 optional-declared enforcement).
- `references/TRACK-THREEJS.md` — :17 harness paths (`research/tools/capture.mjs`), :163/:173-182
  `--dpr` / `--url-suffix ?view=` / `--shots --page` capture invocations.
- `scratchpad-research/mathqc-block-bvh-clash.md` — §1 `intersectsGeometry(otherGeometry, geomToMesh)` /
  `closestPointToGeometry`, §2 headless pure-Node no-DOM/GL, §3 :145-153 zero-`Math.random` determinism +
  :198-206 `touchEps` allowed-touch, §5a `checkClashes` contract, §5b `mechanical.clash` hard-fail, §5c
  TEST-jurisdiction (un-eyeballable), §7 BORROW verdict.
- `scratchpad-research/investigacion-digest.md` — §4.2 :192-193 hard-fails / Q_max=7.9, §4.3 :196 μ−λσ,
  :198 Monte Carlo tolerance, :202 best-of-3, :204 ΔScore; §5 item 12 deterministic multi-camera scoring.
- `threejs-hvac-prototipos/research/threejs-block38.md` — §38.4 batch capture harness
  (`tools/capture.mjs`, SwiftShader/WSL, per-shot standardized capture), §38.5 golden-diff is
  human-reviewed (NOT auto-accept — consistent with GATES:3-6).
