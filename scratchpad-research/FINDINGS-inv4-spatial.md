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
