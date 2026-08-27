# MATH/QC — Adoption-fit verdicts: solvers & QC/similarity metrics vs the zero-dep design3d-kit

> Research-SDD-style block. Verify-before-cite; typed walls; NO invented `[INFER]` dressed as fact.
> Judges the `investigacion.md` digest's recommended HEAVY stack (§2.6 optimizers, §4.3 metrics) against
> the REAL design3d-kit constraints and its EXISTING QC surface, then proposes pure-JS equivalents where
> a metric is genuinely needed.
>
> Kit constraints (grounded, non-negotiable): **zero runtime dependency** in the pure core; **offline**
> (esbuild single-file builds, `assertNoNetwork`); **deterministic**; QA runs **headless on WSL2 with NO
> GPU** (SwiftShader software rasterizer). Kit is **v1.17**, not greenfield — verdicts are DELTAS onto an
> existing surface, not a new architecture.
>
> Markers: `[CERT-web]` official web source, URL + date 2026-08-26 · `[CERT]` local kit file:line ·
> `[INFER]` explicit deduction (labelled, never smuggled).

---

## 0. What the kit's QC surface ACTUALLY is (grounding — read this first)

Two load-bearing corrections to the task's own framing, both from the primary files:

1. **The kit does NOT do "golden-screenshot pixel-diff" as an acceptance gate.** `references/GATES.md:3-6`
   states verbatim: *"Screenshots are evidence packaging; blind vision review is the ONLY acceptance
   authority — never pixel-diff or heuristic auto-acceptance."* `[CERT]` The pixel-diff path (mapbox
   `pixelmatch`) exists ONLY as a **golden-regression DETECTOR recipe** (threejs-block38 §38.5), and even
   that is *"not yet wired to any CI ... a documented recipe, not a verified pipeline."* `[CERT]` So the
   kit's real perceptual QC is: **CIEDE2000 ΔE00** (deterministic colour/value anchor,
   `material-color-probe.mjs`, `GATES.md:284-294`) + **blind VLM review** (gestalt/identity). Any
   perceptual metric evaluated below (LPIPS, SSIM) can only slot into the **regression-detector** role,
   NEVER the acceptance role — the kit forbids heuristic auto-acceptance by contract.

2. **The kit's normal case is NO reference image / NO reference scan.** `GATES.md:232-242`: *"When there
   are NO reference images — the normal case for a spec-driven synthetic scene ... say so, do not fake
   it."* `[CERT]` This guts the premise of every "compare generated mesh vs reference point cloud" metric
   (Chamfer/ICP/Hausdorff): there is usually **no external reference to align to or measure against**. The
   comparisons the kit CAN make are **self-referential** (blockout-vs-final massing drift; pre- vs
   post-simplify deviation) — which need no scan and no alignment.

3. **`geom-verify.mjs` is the exact, correct home for new numeric geometry verifiers.** Its architecture is
   explicitly a **pure-math core that imports nothing** (`geom-verify.mjs:11-16,25-27` `[CERT]`) plus
   thin three.js wrappers that `await import('three')` at call time. Every function **REPORTS, never
   mutates** (`geom-verify.mjs:5-7` `[CERT]`). A pure-JS `chamfer()` / `hausdorff()` drops straight into
   the pure core; it already carries `signedVolume`, `edgeManifold`, `aabbIoU`, `gap3D` in exactly this
   shape.

Everything below is judged against those three facts.

---

## OPTIMIZATION / SOLVERS

### 1. Google OR-Tools CP-SAT — **SKIP-heavy-dep** (over-engineering for the current kit; A* covers 80%)

**Claim vs reality.** Real, Google, **Apache-2.0**. `[CERT-web]` OR-Tools is a C++ core with official
wrappers for **Python, Java, .NET, C++ only** — there is **no official JavaScript/Node binding**; the
standing request is google/or-tools issue #94, unfulfilled. `[CERT-web]` CP-SAT is a
constraint-programming SAT-based solver for **discrete/combinatorial** problems (assignment, scheduling,
packing, boolean/integer constraints) — in the doc it is proposed for *"discrete choices (left/right, pump
model, route A/B/C, number of elbows, pipe level)"* (`investigacion-digest.md:141`). Community WASM ports
exist — **cpsat-js** and **Axelwickm/or-tools-wasm** (both Apache-2.0); `mapbox/node-or-tools` is
VRP-only, MIT. `[CERT-web]`

**Adoption path into the kit = none that respects the constraints.** A WASM blob is not zero-dep, is a
multi-MB artifact hostile to the esbuild single-file offline build, and pulls a whole CP solver runtime
for a problem the kit currently **does not have**: the kit PLACES parts from a spec deterministically
(`GATES.md`, DESIGNSPEC flow) — layout is *authored*, not *solved*. CP-SAT earns its keep only when you are
genuinely solving NP-hard discrete layout/routing at scale.

**Verdict: SKIP-heavy-dep.** If discrete routing ever becomes real, the doc's own §2.6 already names the
pure-JS 80% answer: **A\* on an occupancy grid** (`investigacion-digest.md:140`) — a few hundred lines of
dependency-free JS that yields orthogonal pipe/duct paths with a bend-penalized cost, no solver runtime.
BORROW the *concept* (discrete cost minimization), not the dependency.

### 2. Ceres Solver — **SKIP-heavy-dep** (no JS path; the need it targets is designed away)

**Claim vs reality.** Real, Google, C++ nonlinear-least-squares library. License verified from the LICENSE
file: **BSD-3-Clause (©Google Inc.)**, now dual-offered with Apache-2.0; example code from libmv is MIT.
`[CERT-web]` (Note: the doc/ecosystem often say "BSD" — that is correct for the core.) C++ only; **no
Python-free JS path, no maintained WASM port.** The doc frames it for *"least-squares connection fitting
`E = ‖P_pipe − P_port‖² → 0` ... snap 87 mm gap → 0.3 mm"* and continuous alignment/calibration
(`investigacion-digest.md:144`).

**Judged against the kit.** That specific "snap gap to zero" problem **does not exist** in the kit's model:
ports are declared at **exact world-mm positions** and `connectPorts` snaps analytically
(`investigacion-digest.md:129,137` — the doc's OWN spatial-engine design). There is no residual to minimize
because nothing was ever fuzzily placed. A browser/Node zero-dep kit has no route to a C++ NLLS library
anyway.

**Verdict: SKIP-heavy-dep; BORROW-concept if a real residual ever appears.** A genuine small NLLS (e.g.
best-fit a plane/axis to sampled points) is a **~30-line pure-JS Gauss-Newton / Levenberg-Marquardt**, not
a Ceres binding.

### 3. SciPy — **SKIP-heavy-dep**; the two real sub-problems map to pure-JS (**ADOPT-pure-JS-equivalent**)

**Claim vs reality.** Real, **BSD-3-Clause**, Python/C/Fortran. `[CERT-web]` The doc leans on
`scipy.optimize` least-squares (continuous fitting, alongside Ceres) and implicitly
`scipy.optimize.linear_sum_assignment` (Hungarian, for matching). **Adoption path into a JS kit = none
without a Python sidecar.**

**When is a Python sidecar justified? For this kit, essentially never.** A sidecar breaks four kit
invariants at once: it defeats the **single-file offline build**, it is a network/IPC surface that fights
**`assertNoNetwork`**, it makes results **environment-dependent** (Python/BLAS build ⇒ non-deterministic
last bits, the exact thing `GATES.md`'s reviewer-variance work fought), and it adds a runtime to a kit
whose whole identity is "zero-dep, headless, deterministic." A sidecar is justifiable ONLY if you had a
heavyweight, well-tested numerical routine with no tractable JS equivalent AND could pin it
reproducibly — not the case for the small problems here.

**Verdict: SKIP the dep; ADOPT-pure-JS for the two problems that are actually small:**
- continuous least-squares → **pure-JS Levenberg-Marquardt (~40 lines)** (shared with the Ceres verdict);
- assignment/matching (`linear_sum_assignment`) → **pure-JS Hungarian algorithm (~60 lines)**, O(n³),
  fine at kit scale (tens–hundreds of parts).

---

## QC / SIMILARITY METRICS

### 4. LPIPS — **SKIP-heavy-dep**; pure-JS **SSIM** is the right lightweight perceptual delta (**ADOPT-pure-JS**)

**Claim vs reality.** Real: Zhang, Isola, Efros, Shechtman, Wang, *"The Unreasonable Effectiveness of Deep
Features as a Perceptual Metric,"* **CVPR 2018**; reference impl `richzhang/PerceptualSimilarity`, PyTorch,
`pip install lpips`. `[CERT-web]` It is a **learned** metric: it runs a **pretrained CNN** (AlexNet/VGG/
SqueezeNet) and compares deep feature activations. So it needs **PyTorch + downloaded net weights**, and is
GPU-friendly by design.

**Against the kit's gate this is triply incompatible:** (a) torch is a heavy native dep, antithetical to
zero-dep; (b) it wants a **GPU** the QA box does not have (SwiftShader, no GPU) — CPU torch is slow and
still a big dep; (c) fetching pretrained weights is a **network fetch that violates `assertNoNetwork`** and
the offline build. And structurally it would be an **auto-acceptance heuristic**, which `GATES.md:3-6`
forbids outright. The kit already answers the "perceptual identity" question the right way for its
constraints: **ΔE00** for colour/value (deterministic) + **blind VLM** for gestalt.

**Verdict: SKIP-heavy-dep. ADOPT-pure-JS SSIM** for the ONE slot a perceptual metric legitimately fills:
the **golden-regression detector** (threejs-block38 §38.5), where `pixelmatch`'s raw mismatch-pixel count
is crude (a global brightness shift trips every pixel). SSIM (Wang et al. 2004) is **pure math over
local luminance/contrast/structure windows** — ~80 lines, deterministic, zero-dep, CPU-trivial — and is a
strict upgrade to pixelmatch for "did this scene structurally change." It stays a **regression detector,
never an acceptance gate** (contract-bound).

**Exact kit path:** new file **`library/harness/perceptual-ssim.mjs`** — pure-math core
`ssim(grayA, grayB, width, height, {win=8})` returning mean SSIM ∈ [-1,1] + an optional SSIM-map, plus a
thin PNG-reading wrapper (reuse whatever `material-color-probe.mjs` already uses to decode the capture
PNG). Wire it as the diff step in the block38 §38.5 golden-regression recipe (replacing/augmenting the raw
pixelmatch count); document a threshold (e.g. flag if mean SSIM < 0.98) that GATES a **human re-baseline
decision**, not an automated pass.

### 5. PyTorch3D Chamfer distance — **ADOPT-pure-JS-equivalent** (the metric is ~40 lines; torch is not needed)

**Claim vs reality.** Real: `facebookresearch/pytorch3d`, **BSD-style license**. `[CERT-web]` Chamfer
distance IS just the **symmetric sum/mean of nearest-neighbour distances**: for point sets A, B,
`CD = mean_{a∈A} min_{b∈B} ‖a−b‖² + mean_{b∈B} min_{a∈A} ‖b−a‖²`. `[CERT-web]` (verified against
`pytorch3d/loss/chamfer.py`). Torch is there for **autograd + GPU batching in training loops** — the metric
itself needs neither. As a pure QC measurement it is a nested nearest-neighbour loop.

**Judged against the kit.** With NO external reference scan (the normal case, grounding #2), Chamfer's
"vs reference point cloud" framing mostly doesn't apply — BUT its self-referential uses are real and
valuable: **blockout-vs-final massing drift as a NUMBER** (the block strip that `GATES.md:229-230` today
judges by eye), and **pre- vs post-simplify deviation** (the meshopt "min visual error" claim,
`investigacion-digest.md:150`, currently unmeasured). Both are pure-geometry, no scan, no alignment.

**Verdict: ADOPT-pure-JS-equivalent.** ~40 lines, no torch.

**Exact kit path:** extend **`library/harness/geom-verify.mjs`** pure core with:
- `samplePoints(positions, index, n)` — deterministic area-weighted surface sampling (seeded, so scores
  are reproducible — same discipline as the rest of the harness);
- `chamfer(ptsA, ptsB)` — symmetric mean-NN (brute force O(N·M) is fine at kit sample counts; if it ever
  bites, bucket into a uniform grid — still pure JS);
- (bonus, same sampling) `hausdorff(ptsA, ptsB)` — `max` instead of `mean` of the NN distances; the doc's
  §4.3 also names Hausdorff (Autodesk mesh-compare) and it is FREE once sampling exists.
Add an ADVISORY three.js wrapper `checkDrift(meshBlockout, meshFinal, {maxChamfer})` mirroring
`checkJunction`'s shape — REPORTS a drift number, does not fail the gate by default (advisory, like
`checkGeometry`).

### 6. Open3D ICP — **SKIP** for the kit as-authored; **BORROW-concept** only if external-scan import ever lands

**Claim vs reality.** Real: `isl-org/Open3D`, **MIT (©www.open3d.org)**. `[CERT-web]` ICP has two standard
variants: **point-to-point** (minimize squared point distances, closed-form per-iter via SVD/Kabsch) and
**point-to-plane** (uses target normals; faster convergence). `[CERT-web]` It **registers/aligns** two
point clouds that sit in **different coordinate frames**.

**The decisive kit fact:** the kit AUTHORS everything in a **single fixed world frame** (world-mm spatial
DB, one axis convention day one — `investigacion-digest.md:123-124`). Two things the kit compares
(blockout vs final, original vs simplified) are **born in the same frame** — there is nothing to align.
ICP solves a problem the kit's coordinate discipline **designs away**. So alignment is not merely
heavy-to-adopt; it is **unneeded by construction**.

**Verdict: SKIP (need designed away); BORROW-concept IF external-scan import appears.** If the kit ever
ingests a real-world scan (foreign frame), a **pure-JS point-to-point ICP is feasible at kit scale**:
per-iteration NN correspondence (reuse the Chamfer NN loop) + a rigid fit via **Kabsch** (3×3 covariance +
SVD). The only non-trivial piece is a 3×3 SVD, which is doable dependency-free (Jacobi eigen-decomposition
of AᵀA). Until an external scan is a real input, do not build it.

---

## Cross-cutting finding (the explicit judgment asked for)

**Every one of the six is DEPENDENCY-INCOMPATIBLE with the kit's zero-dep / offline / no-GPU philosophy —
none is a JS drop-in.** The reason differs by tool, and that difference decides SKIP vs. ADOPT-pure-JS:

| Doc's tool | What it really is | Incompatibility with the kit | Pure-JS 80% equivalent | Verdict |
|---|---|---|---|---|
| **OR-Tools CP-SAT** | Apache-2.0 C++ CP/SAT solver; no official JS binding | WASM blob ≠ zero-dep/offline; solves a problem the kit *authors* away | **A\*** on occupancy grid (doc §2.6) | SKIP-heavy-dep |
| **Ceres** | BSD-3 C++ NLLS; no JS path | native dep; residual designed out by exact ports | **~30-line Gauss-Newton/LM** | SKIP-heavy-dep |
| **SciPy** | BSD-3 Python | needs Python sidecar → breaks single-file/offline/determinism | **LM (~40 ln)** + **Hungarian (~60 ln)** | SKIP dep / ADOPT-pure-JS |
| **LPIPS** | CVPR-2018 learned; PyTorch + weights + GPU | torch dep + GPU + weight fetch (network) + would be auto-accept (forbidden) | **SSIM (~80 ln)**, regression-detector role only | SKIP-heavy-dep / ADOPT-pure-JS SSIM |
| **PyTorch3D Chamfer** | BSD; metric is symmetric mean-NN | torch only needed for training, not the metric | **`chamfer()` (~40 ln)** in geom-verify | **ADOPT-pure-JS** |
| **Open3D ICP** | MIT; aligns two frames | kit authors one fixed world frame → nothing to align | pure-JS ICP *iff* external scan appears | SKIP / BORROW-concept |

**The pattern:** the doc reaches for heavy native/Python/learned tooling to solve problems that the kit's
own architecture (deterministic authored placement in a fixed world-mm frame, spec-first) either **solves
differently** or **never has**. Two — **Chamfer** and **SSIM** — map cleanly to small pure-JS that deliver
~80% of the value inside the existing zero-dep surface; both are worth doing. The solvers (CP-SAT, Ceres,
SciPy) are premature for a kit that authors rather than solves; adopt the *concepts* (A\*, LM, Hungarian)
in pure JS only when a real problem instance shows up. ICP is unneeded by construction.

**Note on the doc's status:** these tools appear in the digest as a *concept menu* (§2.6 optimizers, §4.3
metrics — "LPIPS ... Chamfer (PyTorch3D), ICP (Open3D), Hausdorff"), not as committed adoptions. The doc
itself flags them as undecided (`investigacion-digest.md:235-237`: *"define which exact algorithms ... left
as the explicit next step"; "Optuna in production undecided"*). So the honest verdict is not "the doc is
wrong" but "the doc lists a research-grade heavy stack; for THIS kit the correct subset is two pure-JS
metrics, and the rest are concepts to keep on ice."

---

## Concrete deltas (if promoted — staged proposals, a run never edits the kit)

1. **`library/harness/geom-verify.mjs`** (pure core) — add `samplePoints()`, `chamfer()`, `hausdorff()`;
   add advisory wrapper `checkDrift(meshA, meshB, {maxChamfer})` in the three.js-facing section, mirroring
   `checkJunction`/`checkGeometry` (REPORTS, never mutates, advisory not hard-fail).
2. **`library/harness/perceptual-ssim.mjs`** (new) — pure-math `ssim(grayA, grayB, w, h, opts)` + PNG
   wrapper; wired as the diff step of the threejs-block38 §38.5 golden-regression recipe, **detector role
   only**.
3. **`references/GATES.md` — new §Geometry-QC row.** Proposed text:
   > **Geometry-QC (advisory, deterministic).** Where a design carries a blockout AND a final (or a
   > pre-/post-simplify pair), `geom-verify.chamfer()` reports **massing-drift** as a number over seeded
   > surface samples, and `perceptual-ssim.ssim()` reports **golden-regression** structural similarity of
   > the capture PNG vs its baseline. Both are ADVISORY detectors that flag a **human re-baseline / re-look
   > decision** — never auto-acceptance (that authority stays with the blind vision review, §Gate steps).
   > No external reference scan is required; both compare kit-internal artifacts in the one fixed world
   > frame. ICP/registration is intentionally absent — the kit authors a single world frame, so there is
   > nothing to align.

---

## Sources (preserved before citing, 2026-08-26)

- Kit (local, `[CERT]`): `library/harness/geom-verify.mjs` (pure-core/dynamic-import split :11-16; REPORTS-not-mutates :5-7; existing verifiers), `references/GATES.md` (acceptance-authority :3-6; ΔE00 gate :284-294; no-reference case :232-242; massing strip :229-230), `scratchpad-research/investigacion-digest.md` (§2.6 :140-144, §4.3 :197, open questions :235-240), threejs-block53 (ΔE00 reviewer-variance origin), threejs-block38 (§38.5 golden-regression `pixelmatch` recipe, not-wired-to-CI).
- [OR-Tools license & bindings (Apache-2.0, C++/Python/Java/.NET; no official JS — issue #94)](https://github.com/google/or-tools/issues/94) · [OR-Tools (Wikipedia)](https://en.wikipedia.org/wiki/OR-Tools) · [cpsat-js WASM port](https://www.jsdelivr.com/package/npm/cpsat-js) · [or-tools-wasm](https://github.com/Axelwickm/or-tools-wasm)
- [Ceres Solver repo](https://github.com/ceres-solver/ceres-solver) · [Ceres LICENSE (BSD-3-Clause ©Google, +Apache-2.0, libmv MIT)](https://raw.githubusercontent.com/ceres-solver/ceres-solver/master/LICENSE)
- [LPIPS — richzhang/PerceptualSimilarity (Zhang et al., CVPR 2018, PyTorch)](https://github.com/richzhang/perceptualsimilarity) · [lpips on PyPI](https://pypi.org/project/lpips/)
- [PyTorch3D chamfer.py (symmetric mean-NN definition)](https://github.com/facebookresearch/pytorch3d/blob/main/pytorch3d/loss/chamfer.py)
- [Open3D LICENSE (MIT ©www.open3d.org)](https://raw.githubusercontent.com/isl-org/Open3D/main/LICENSE) · [Open3D ICP tutorial (point-to-point / point-to-plane)](https://www.open3d.org/docs/release/tutorial/pipelines/icp_registration.html)
