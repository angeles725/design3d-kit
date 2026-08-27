# FINDINGS — inv4 — SPATIAL GROUNDING (deltas for v1.18 consolidation)

Lane: spatial grounding. All repo/paper claims verified against real source, not READMEs.
Target paths named per delta. Verdicts: ADOPT / ADAPT / REFERENCE-ONLY.

## Verified sources
| Claim | Verdict | Evidence |
|---|---|---|
| 3DGraphLLM = scene-graph→token-space, semantic relations help | TRUE | repo `CognitiveAISystems/3DGraphLLM` (doc guessed wrong org), ICCV 2025, arXiv 2412.18450, MIT, active. +7.5% F1@0.5 Multi3DRefer |
| 3DSRBench: LMMs fail height/orientation/location/multi-object | TRUE | arXiv 2412.07825, ICCV 2025, 2772 VQA triplets, 4 axes. Benchmark only |
| SpatialRGPT: scene-graph + depth improves spatial reasoning | TRUE | `AnjieCheng/SpatialRGPT`, NeurIPS 2024, Apache-2.0 |
| Agentic scene-HYPERGRAPH: clearance/contact/alignment/symmetry/equidistance | TRUE (verbatim) | arXiv 2505.20129 (HKUST/Dartmouth 2025). **NO CODE released** — design reference only |
| Self-Refine beats single-pass | TRUE | `madaan/self-refine`, NeurIPS 2023, Apache-2.0, ~20% avg gain |

Key framing: these are VLM-PERCEPTION papers (image→3D understanding). Our kit is spec-first and OWNS exact geometry, so adopt the **representations and loops**, NOT the neural perception stacks (open-vocab detection, metric depth, point-cloud lifting = academic-only for us).

## Verified sources (2nd-pass additions)
| Claim | Verdict | Evidence |
|---|---|---|
| Open3D-VQA: models better at RELATIVE relations than ABSOLUTE distances | TRUE | arXiv 2503.11094, ACM MM'25, EmbodiedCity/Open3D-VQA. 73k-QA benchmark; also found 3D-LLMs show no significant edge over 2D-LLMs |
| SpatialLLM: 3D-informed design beats 2D-biased LMMs | TRUE | arXiv 2505.00788, CVPR 2025 (Ma et al.); SpatialVQA benchmark, +8.7% over GPT-4o |
| SpatialRGPT (re-confirm): LLMs can't use raw text coordinates well | TRUE (verbatim) | NeurIPS 2024: "LLMs struggle to utilize coordinate information effectively when presented in text"; fix = depth + 3D scene-graph regions |
| "ImperativeScene" (doc name invented) = imperative sequential placement + LLM-free error correction | TRUE (real title differs) | Real: "Procedural Scene Programs … LLM-Free Error Correction via Program Search", arXiv 2510.16147, SIGGRAPH Asia 2025. Each object's pose = f(previously-placed objects) + program-space search correction |
| three.js spatial primitives are real vendored APIs | TRUE | Box3/intersectsBox, examples/jsm/math/OBB, examples/jsm/math/Octree, getWorldPosition/localToWorld/worldToLocal/matrixWorld. NOTE three.js Octree ≠ OctoMap |

Cross-lane note (NOT claimed by me): SpatialGrammar (arXiv 2604.27555, BEV-grid DSL + deterministic compiler + SG-Agent) and WorldGen (arXiv 2511.16825, CVPR 2026, text→navigable worlds) appear in my sections but belong to inv2's agentic lane; three-mesh-bvh/ObjectBVH is inv3's collision lane. Flagged, not duplicated. Research-repo licenses UNVERIFIED — only matters if VENDORED (none are; design references only — vendored deps stay three.js MIT + optional Rapier Apache-2.0).

S-CITE — extra evidence backing S2 (AI must not own raw coordinates): Open3D-VQA (relative>absolute → prefer relational ops), SpatialLLM (2D-bias is the root cause → give explicit 3D structure), SpatialRGPT (raw text coords underused → high-level ops beat coordinate strings), Procedural Scene Programs (academic precedent for sequential reserve→validate→commit imperative placement + LLM-free correction = our compiler-oracle).

## DELTAS

### S1 — Typed scene-graph/hypergraph as persistent spatial memory  [ADOPT]
Because we own geometry, the paper's *learned* edges become *deterministic computed predicates*:
`clearance` (unary), `contact`/`alignment` (binary), `symmetry`/`equidistance` (higher-order).
Store alongside `design-spec.yaml`; passes read/update it as the persistent spatial state.
- Paths: new concept doc under `references/` (e.g. TRACK-THREEJS §Spatial-memory) + a `design-spec.yaml` schema field (`references/DESIGNSPEC.md §Schema`) + candidate `library/` module `spatial-engine/`.
- Evidence: arXiv 2505.20129, 3DGraphLLM (ICCV 2025).

### S2 — External deterministic Spatial Engine owns coordinates; LLM never writes raw XYZ  [ADOPT — highest value]
High-level ops (placeAgainstWall, placeNextTo, connectPorts, routePipe, findFreePosition, canPlace) +
transaction PROPOSE→AABB/OBB→clearance→occupancy→BVH→COMMIT; feed a fresh spatial snapshot back after each move.
Directly fixes the two named failure modes (everything at origin; unaware of occupied space).
- Paths: `library/spatial-engine/` (new) + a hard rule in `SKILL.md` (AI emits ops/Scene-JSON, never `object.position.set`) + `references/PIPELINE.md` placement pass.
- Evidence: 3DSRBench (ICCV 2025) + Exercise A1 (see below).
- **PROMOTABILITY CAVEAT (measured):** A1 is a NULL RESULT at N=4 — see RESULTS. S2's benefit must be shown on a denser instance (A2) before promotion.

### S3 — Objects are VOLUMES not points  [ADOPT]
Each element stores center + size + AABB/OBB + physical volume AND a SEPARATE service/clearance volume (two bboxes).
Distinguish allowed CONTACT (port mating) from ILLEGAL_COLLISION. Collision cascade broad(voxel/hash)→AABB→OBB→BVH(three-mesh-bvh).
- Paths: `references/DESIGNSPEC.md §Schema` (per-object physical+clearance bbox + ports) + `library/spatial-engine/`.
- Converges with inv3's three-mesh-bvh clash-detection PoC — coordinate the BVH layer with inv3.

### S4 — Self-Refine gate loop  [ADAPT]
Reframe a failed gate as STRUCTURED critique fed back to the generator (not binary reject). Ties to the kit's existing max-2-retry pass gate.
- Paths: `references/GATES.md §Self-correction loop`. Converges with i1's 3-review QA delta and inv3's QC metrics — merge into ONE GATES delta (i1 owns).
- Evidence: Self-Refine (NeurIPS 2023).

### S5 — 3DSRBench 4-axis spatial-QC checklist as HARD constraints  [ADOPT]
Enforce height / orientation / location / multi-object-relations deterministically (we own coordinates); any critical violation caps score at 7.9 (matches kit hard-fail rubric).
- Paths: `references/GATES.md` (hard-fail list: overlap=0, disconnected-ports=0, out-of-bounds=0, clearance-intrusion). Merge with i1's HARD-FAILS delta.

## Exercise A1 (evidence for S2) — see exercise-A1/RESULTS.md
Controlled A/B, model held constant (both opus), method varied. Deterministic verifier (verify.mjs).
Result: NAIVE=10 PASS, SPATIAL-ENGINE=10 PASS. Null at N=4 → propose A2 (denser) to find the discriminating regime.
