# design3d-kit v1.18 — consolidated delta proposal (multi-session research)

Status: **DRAFT — awaiting user approval before any write to the live kit.**
Owner: investigador1 (integrator/writer). Source: `investigacion.md` (8110-line transcript) audited de-pies-a-cabeza against real repo source + the mature three.js `[CERT]` corpus (target #13, 80 blocks).

Integration mechanism (decided): collect all four slices as structured notes → ONE deduped v1.18 proposal (this file) → **user approval** → branch + implement + PR. The kit's own rule is "nothing is binding until the user promotes it"; every version bump v1.13→v1.17 was an explicit user-directed delta. No piecemeal writes to the live kit.

Verdict legend: **ADOPT** (build/write it) · **ADAPT** (borrow the pattern/data-format, not the tool) · **REJECT** (does not fit) · **DEV-AID** (optional, outside the gated run).

---

## 0. Grounding facts (decisive, verified)

- The three.js **core** is already a mature `[CERT]` corpus at `threejs-hvac-prototipos/research/` (80 blocks). Most of the doc's "three.js core" claims are already covered — cite, don't re-derive:
  - **block51** — Bézier / Catmull-Rom (centripetal) / B-spline/NURBS, **rational weight for EXACT conics/arcs**.
  - **block46** — three-bvh-csg booleans + honest float-robustness ceiling.
  - **block49** (simplification: Melax+meshopt, NOT hand-QEM) · **block50** (marching cubes / dual contouring) · **block45/47/48** (polygon offset, earcut vs CDT, robust predicates) · **block32** (BIM shells) · **block55** (Turf is geospatial, not planar-CAD).
- Kit **hard constraints** that gate every adoption: zero runtime dependency · offline SINGLE-FILE build (esbuild inlines all; `assertNoNetwork` fails on any remote dep; largest shipped dist = **766 kB**) · WSL2 **no-GPU** headless gating (SwiftShader stalls `transmission`/`RectAreaLight`; progressive effects non-deterministic).

---

## 1. LOCKED — Ecosystem slice (investigador1): three.js core · R3F · drei · editors · CAD kernels

### 1a. Exact-arc HVAC fittings — the doc's #1 geometric requirement (NET-NEW)
The doc's strongest, correct engineering point: real HVAC elbows are **exact constant-radius arcs** (x²+y²=R²), not splines/CSG "melted pipe". The kit's `rmf-frames.makeSweptTube` sweeps a Catmull-Rom/arbitrary polyline centerline → a spline approximation → **structurally cannot emit a constant-radius arc**. This is the single real geometry gap.

- **ADOPT — DELTA 1.** NEW `library/parts/hvac-fittings.mjs` (+ `.test.mjs`), following the `pipe-run`/`gooseneck-spout`/`adaptive-segments` precedent (pure zero-import core + async three builder):
  - `elbow(bendRadius, pipeRadius, arcAngle, {radialSeg, tubularSeg})` — exact circular-arc centerline via `TorusGeometry(bendRadius, pipeRadius, radialSeg, tubularSeg, arcAngle)`; centerline exactly on x²+y²=bendRadius². (`gooseneck-spout` already uses arc-swept `TorusGeometry`.)
  - `reducer(r1, r2, length, seg)` — concentric/eccentric truncated cone (`CylinderGeometry`/`LatheGeometry`).
  - `tee(runR, branchR)` / `lateral(angle)` — cylinder legs + junction; true cut-in penetration → build-time `three-bvh-csg` SUBTRACTION per block46 rule (oblique/curved → mesh CSG; prismatic → 2D-union+extrude).
  - Pure-core exports (`elbowCenterline`, `reducerProfile`) Node-testable with zero imports.
- **ADOPT — DELTA 2.** Register in `library/INDEX.md` `parts/` table + a one-line cross-note under `rmf-frames` (smooth-hose spline vs exact-elbow torus arc).
- **ADOPT — DELTA 3.** `references/TRACK-THREEJS.md` new short section **"three.js is NOT a CAD (BREP) kernel — boundary & the OCCT-WASM escape hatch."** States what three.js gives natively/offline (exact arcs/conics via `EllipseCurve`/`ArcCurve`/`TorusGeometry` arc/`NURBSCurve` rational weight [block51]; swept solids; mesh booleans [block46]) and records OCCT-WASM as an OPTIONAL online research-only track (measured 48.9 MB / 7.1 MB-min WASM = ~9× the entire 766 kB dist, opaque binary esbuild can't inline → fails `assertNoNetwork`).
- **ADAPT — DELTA 4.** Exact-arc-vs-spline decision rule (fold into DELTA 1's module header, or `library/recipes/exact-arc-vs-spline.md`): constant-radius bend → `hvac-fittings.elbow`; free-form varying-curvature hose/cable → `rmf-frames.makeSweptTube`. Never a spline sweep for a fixed-bend-radius fitting.

**FLOW-CHECK VALIDATED (creador1, end-to-end, 2026-08-26).** Built a real DN150 elbow+reducer+pipe-run design through the pipeline (spec→geometry→geom-verify→headless capture, clean gate: draws=10/tris=2746, console_clean). Results: makeElbow holds x²+y²=R² to **5.55e-17**; the spline sweep (makeSweptTube) drifts **0.0932 m = R·(√2−1) = 41%-of-R overshoot** through the same 90° corner AND produces a **degenerate torn-ring mesh** on the sharp turn — two independent, quantified reasons the spline is wrong for fixed-radius fittings. Ports connect (checkJunction gap=0 on all 3 joints). **hvac-fittings needs NO fix.** ONE real pipeline friction surfaced (see 1e).

### 1e. Vendoring/tooling friction (NEW doc-delta, from the flow-check)
The kit tree cannot render-validate its own library modules: no vendored three / no capture harness live in the kit repo — they live in the OVERLAY (threejs-hvac-prototipos), and kit modules use bare `import 'three'` resolved only via a browser importmap. So a fittings/render validation must be authored in an overlay design (vendor three + copy the module with a provenance pointer, as creador1 did @8652a2a). This is the kit's designed overlay model but under-documented. **ADOPT (doc-only):** a `library/LIBRARY.md` note — "a module's RENDER gate is an overlay-repo activity; the kit tree validates only the pure Node core (`node <part>.test.mjs`)." Zero code change. (Decision deferred to user: ship a kit-self-contained harness later, or keep render-validation officially overlay-scoped.)

### 1f. Pascal Editor — the doc's #1 CAD pick (was deferred; now verdicted)
`pascalorg/editor`, ~18k★, **MIT** (license clean, unlike the AGPL editors), R3F + WebGPU CAD/BIM editor APPLICATION with a real `@pascal-app/mcp` server (~30 tools incl. `check_collisions`, hooks Claude Code). The doc ranks it #1 as a starting BASE to fork.
- **REJECT as a base/dependency.** It is a full INTERACTIVE WebGPU GUI editor app — the wrong shape for a headless, offline, WSL2-no-GPU (SwiftShader), spec-gated GENERATION pipeline. We are not building a standalone CAD app; forking a WebGPU editor is orthogonal to our model, and WebGPU-under-SwiftShader is even more constrained.
- **BORROW-PATTERN (reference only, MIT):** (a) its `@pascal-app/mcp` high-level tool surface (`check_collisions` et al.) is a real-world validation of the doc's "AI manipulates the scene via high-level tools, never raw XYZ" thesis → reference for inv4's Spatial World Model placement/query API (S1-S3, 9c). (b) its Site→Building→Level→Zone→Items hierarchy → reference for the scene-graph/DESIGNSPEC hierarchy. Neither is a dependency; both inform inv4's design.

### 1b. CAD kernels — REJECT (evidence-backed)
- **REJECT** Chili3D (**AGPL-3.0** + heavy OCCT-WASM), CascadeStudio (MIT but an IDE app, heavy WASM), Replicad (MIT, cleanest code-first — note only as optional online track), JSCAD (pure-JS but **mesh-CSG only, no BREP, no exact arcs** — already covered by three-bvh-csg [block46]). None survives the offline-single-file + zero-dep constraint. The doc's abstract insight ("three.js is not a CAD kernel") is true but its own #1 requirement needs zero of these — see 1a.

### 1c. R3F + drei — verified TRUE; thin bridge, not a new framework
Every R3F claim in TRACK-THREEJS.md verified TRUE against current source (fiber@9.7.0 / React 19 / drei@10.7.8 / three 0.185; kit r0.160 satisfies drei floor).
- **ADOPT — D1.** Phase-2 version pins: `@react-three/fiber@9` (React ≥19 <19.3, three ≥0.156), `@react-three/drei@10` (three ≥0.159, fiber ^9). R3F v8 = React 18 — do not mix.
- **ADOPT (firm) — D2.** HVAC parametric builders live in **Phase-1 as framework-agnostic pure functions** returning a three `Group`/`BufferGeometry` **+ a plain data object** `{diameter,from,to,system,material,insulation}`. R3F only renders via `<primitive object={group}/>` and carries data by prop, never React state. Geometry is never re-authored as JSX.
- **ADAPT — D3.** NEW `library/recipes/r3f-primitive-bridge.md`: Phase-1 builder returns `{group,data}`; R3F does `<primitive>` + `useFrame` reading `userData` + drei `<Html>` label + `<Select>`/`useCursor` pick + `<Outlines>` selection (Phase-2 analog of `fx/status-overlay-instancing`).
- **ADOPT (selective) — D4.** TRACK-THREEJS "drei helpers for an HVAC/BMS viewer (Phase-2 online only)" table, each with a clash flag. Key clashes: `Environment` presets fetch HDRIs from pmndrs CDN → use `<Lightformer>`/local `files=` offline; `useGLTF` default Draco decoder is `gstatic.com` → self-host (D7); `MeshTransmissionMaterial` + `AccumulativeShadows` REJECT in headless gate (SwiftShader stall / non-deterministic), Phase-2-online only.
- **REJECT — D5.** The doc's design where each node bundles `geometry()`+`renderer()`+`floorplan()`+`mcp()` inside an R3F class — couples certified geometry to React, breaks headless GLB export + offline dist + gate capture.
- **ADAPT — D8.** `library/INDEX.md` `merge-instancing-kit` row → cross-note Phase-2 = drei `<Instances>/<Instance>`/`<Merged>`; bridge via `<primitive>`, don't re-author instancing in JSX.

### 1d. Editors — 0 tool adoptions (two converging blind audits)
- **DEV-AID** Triplex — optional author-time aid outside the gated run only; **null/AGPL license** caution (Hard Rule 8 risk).
- **REJECT** PolygonJS — maintenance-mode v1 (superseded by closed v2); its node-graph pattern already realized by the kit's code builders.
- **ADAPT (narrow)** Theatre.js — reject the AGPL `@theatre/studio`; borrow ONLY the concept of `@theatre/core`'s (Apache-2.0) serializable keyframe/sequence format as an OPTIONAL animation-pass spec field (`references/DESIGNSPEC.md` §Schema + TRACK-THREEJS §Pass-ladder). No runtime dep.

---

### 1g. Completeness-pass closures — ecosystem/CAD/viewer/asset one-liners (whole-doc critic)
Every doc-named tool now carries a verdict (no name-drop left un-triaged):
- **Online3DViewer** (`kovacsv`, 3.6k★, MIT) — the doc says "copy its import system" (13 formats: 3DM/STEP/IFC/FBX/…). **REFERENCE-ONLY / DEV-AID** — a format-parser catalog to study for the intake track; NOT a bundled dep (offline-single-file). Intake stays the DWG ladder + optional web-ifc.
- **CADAM** (`Adam-CAD/CADAM`, ~5k★) — React19+Three+**OpenSCAD-WASM**+Supabase+cloud-AI. **REJECT-as-dep / prior-art REFERENCE** — WASM+cloud is antithetical to zero-dep offline; note only as a prompt→CAD datapoint.
- **xeokit** (`xeokit-sdk`, ~900★) — AEC/BIM viewer (XKT streaming) for EXISTING BIM. **REJECT / REFERENCE** — a viewer, not a creator; overlaps web-ifc intake (inv4).
- **Goxel + three.js `interactive/voxelpainter`** — voxel authoring references. **REFERENCE / ADAPT (Phase-2)** — the click-add/shift-remove painter UI + the chunked-mesh "drop internal faces" guidance are usable for a Phase-2 voxel-paint UI; the kit's `voxel-kit.mjs` mesher already does hidden-face removal.
- **glTF-Transform** (~1.9k★) — GLB dedup→weld→prune→simplify→meshopt→KTX2 chain. **DEV-AID** (outside the gated run) — reproducible catalog-asset optimization; not a runtime dep (block25/49 already cover meshopt/simplification).
- **WebGPURenderer + CAD-mode/Presentation-mode split** — **ADAPT (Phase-2 online only)** — the two-mode idea is sound, but WebGPU + combined-pass effects are non-deterministic under SwiftShader → mirrors the existing transmission/AccumulativeShadows Phase-2-only REJECT.

**CANDIDATE DELTA (substantive, user decision) — voxel→parametric VECTORIZER.** The doc's recurring thesis "the voxel IS the CAD drawing interface" (recognize voxel runs→centerlines, corner→elbow, split→tee, resize→reducer; keep INTENT not cubes; [BLOCK]⇄[CAD]⇄[REALISTIC] without rebuild). NOT covered by 1a (fitting builders) or the A*-router (waypoints). Proposed `library/parts/voxel-vectorizer.mjs`: run/corner/split/resize detection → emits `hvac-fittings` builder calls (dot/cross-product angle → fitting type per the doc). **ADAPT — needs its own design + PoC before building; NOT a drop-in v1.18 delta.** Recommend staging as the first v1.19 item, or a creador PoC if the user wants it in-scope now.

## 2. CONVERGENT cross-slice themes (integrator's merge — avoid competing rewrites)

These arrived from multiple slices and MUST be merged into single coherent deltas, not three overlapping ones.

### 2a. External Spatial Engine + typed scene-graph  (inv4 S1-S3 + inv2 Delta B/F) — doc's central thesis, highest value
- Typed **scene-graph/hypergraph** as persistent spatial memory with **computed** predicates (clearance/contact/alignment/symmetry/equidistance) — NOT learned edges (we own geometry). → `references/` concept + `design-spec` schema field + candidate `library/` spatial-engine module.
- External **Spatial Engine owns coordinates**; LLM never writes raw XYZ; high-level ops + **reserve→validate→commit→snapshot**.
- Objects are **VOLUMES not points** (center+size+AABB/OBB + separate clearance volume); **CONTACT vs ILLEGAL_COLLISION**; collision cascade voxel→AABB→OBB→BVH (BVH = inv3 lane, block46).
- High-level placement API block in `library/INDEX.md` (placeNextTo/connectPorts/findFreeSpace…); `routePipe/routeDuct` (A*) = inv3 lane.

**S2 PROMOTION VERDICT (evidence-gated, decided).** A1 (N=4) and A2 (N=12) BOTH came back NULL — naive opus placed every object cleanly with NO engine (0 hard/0 soft, all clearances), matching the engine exactly. So the doc's blanket "AI can't hold space / stacks objects at 0,0,0" is **contradicted by data at N≤12 for a strong model.** → **S1 (typed scene-graph), S3 (volumes-not-points), hierarchical frames = ADOPT** (they're cheap, correct, useful memory). **S2 (external Spatial Engine that OWNS coordinates + reserve→commit) = ADOPT-but-LABELED "optional, density/robustness-gated — a GUARANTEE mechanism, not a correctness patch"**: it earns its place for weaker/faster models, denser scenes, multi-agent races (E4), and auditability — NOT as a fix for a capability the strong model lacks. Do NOT ship it as a core "the AI needs this to place objects" rule. A3 (adversarial column-forces-collision) is confirmatory for the SINGLE-AGENT regime; even a null A3 keeps this label.

**REGIME SPLIT (the precise, data-driven verdict — inv2's key refinement).** Every null so far (A1, A2) is SINGLE-AGENT: one model holds the whole scene state in-context and copes, so S2 there is a guarantee, not a fix. The regime where S2 is a genuine CORRECTNESS REQUIREMENT is MULTI-AGENT concurrency: two independent sessions cannot see each other's in-context state, so without a shared ReserveEngine/lock they WILL claim overlapping zones — an observability limit no stronger model can reason away. So the honest S2 label is THREE-PART, each part backed by a measured A/B: (i) single-agent placement, N≤12, strong model → guarantee/robustness only (A1 & A2 both NULL — naive = engine); (i-b) single-agent WITH A FIXED OBSTACLE splitting the room → a measurable CLEARANCE-AWARENESS quality improver (A3 NON-NULL on the SOFT dimension: naive 8.5/0-hard/3-soft let the column eat ~0.75 m of a unit's service clearance; the engine 10/0-hard/0-soft reserved the clearance VOLUME before commit and pushed equipment out of the column's y-band — BOTH still PASS, so naive is not broken, it leaves clearance quality on the table); (ii) MULTI-AGENT (or weak/fast model, or very dense) → correctness-required (cross-session reserve/lock is the fix). **E4 CONFIRMS (ii) — the first multi-agent HARD non-null:** two real creadores placed blind, BOTH careful (both supplied full ranked fallbacks — not an agent-quality failure), yet their primaries still collided — naive-parallel merge = 2 hard overlaps / score 6.0 / FAIL (creador1:CH-01↔creador2:AHU-02 + P-01↔AHU-02 in the shared north band); the ReserveEngine-lock run = 6/6 placed / 0 hard / 0 soft / 10.0 / PASS (AHU-02 denied 3× — primary + fallbacks #1,#2 all hit creador1's committed objects — granted at fallback #3; the lock never yields an illegal state, only reroutes or leaves UNPLACED). It's a pure OBSERVABILITY limit (blind agents cannot see each other's in-context state), NOT density or agent quality — no stronger model reasons it away. Net FINAL promotion label: **"ADOPT S2 — guarantee + clearance-awareness single-agent (A1/A2 null, A3 soft-nonnull), REQUIRED for correctness multi-agent (E4 hard-nonnull)."** Aside (inv2): this is literally how THIS team avoids collisions — SendMessage + shared repo = a human ReserveEngine. This is the sharpest example of "adapt, don't copy": the doc's #1 thesis, tested across 4 A/Bs, and resolved into the exact regime where it's true (multi-agent) vs where the data refutes the doc's blanket claim (single-agent, strong model).

### 2b. Deterministic Spatial gate/compiler  (inv2 Delta B) — new GATES §Spatial + `research/tools/spatial-check.mjs`
Checks overlap/clearance/bounds/floating/port-match≤50mm/min-elevation; emits structured violations; **ORACLE (reports, never repositions)**; AI edits JSON; bounded by existing retry cap. **HVAC adaptation: 3D occupancy grid with real elevations — REJECT SpatialGrammar's 2D BEV** (fixed-vertical-axis breaks on overhead racks/risers/sloped drains). This is the kit's existing TEST-vs-RENDER jurisdiction (HR7) applied to geometry.

### 2c. Single GATES merge  (inv2 Delta E + inv4 S4/S5 + doc's 3-review QA + inv3 QC metrics)
All land on `references/GATES.md` — merge into ONE review-protocol delta, EXTENDING the existing blind-review + ΔE00 gate:
- 8-view μ−λσ consistency score; split deterministic-vs-VLM reviewer; **BEST_VERSION = max(Q1,Q2,Q3)** retention on retry exhaustion (a correction can regress).
- **HARD-FAILS cap score 7.9** regardless of beauty: CriticalClashes=0, DisconnectedPipes=0, InvalidGeometry=0, OutOfBounds=0; critical sub-scores (Geometry/Connectivity/Collision/Spatial) each ≥8.
- Track **ΔQ**, stop on diminishing returns; reject an improvement that badly regresses another category.
- **Self-Refine**: failed gate = structured critique fed back, not binary reject (ties to existing max-2-retry).
- 3DSRBench 4-axis spatial-QC (height/location/orientation/multi-object) as HARD constraints.

### 2d. Semantic proxies + transform-preservation invariant  (inv2 Delta C/D)
- TRACK-THREEJS §Pass-ladder + PIPELINE: blockout pass with **SEMANTIC proxies** (box carries bbox+ports; pipe centerline carries DN).
- GATES/PIPELINE: **proxy→realistic TRANSFORM-PRESERVATION invariant** — diff center/rot/size/ports before-vs-after; any delta > eps = FAIL. (The doc's own diagnosed failure point.)

### 2e. INTEGRITY guard — fabricated repo names  (inv2)  ⚠️
The doc invents repo names that DON'T resolve: **SCRIPT3D → SceneCraft (2403.01248)+SEIG · ImperativeScene → LayoutGPT/"Procedural Scene Programs" (SIGGRAPH Asia 2025) · Compos3D → Infinigen + JSON-IR**. Also inv4: 3DGraphLLM real org = CognitiveAISystems (doc guessed wrong). **The kit must ship only real, verified citations** — add a note to the synthesis/LEARNINGS staging.

### 2f. Asset-license correction  (inv4)  ⚠️
AI-generated meshes VIOLATE Hard Rule 8 — the trap is uniform across all three generators: a MIT/permissive **code** repo does NOT license the generated mesh **output**.
- **Hunyuan3D** — EU/UK/Korea territorial exclusions on the model.
- **Rodin (Hyper3D)** — trial-output license unknown; "no rights claimed" ≠ CC0/CC-BY.
- **TRELLIS / TRELLIS.2** (microsoft, MIT *code*) — repo specifies NO license for the generated mesh output; "MIT repo = free assets" is a Rule-8 violation made unknowingly.
→ SKILL Hard Rule 8 + `disenos/catalog/EXTERNAL-ASSETS.md`: **all three BLOCKED from the CERT track** (tier-C props only, never certified). Poly Haven CC0 = only clean auto-source; Sketchfab = per-model manual capture.

---

## 3. STATUS — all four lanes reported + completeness pass done
- **inv1 [ECOSYSTEM]** ✅ CLOSED: hvac-fittings built+validated (flow-check GREEN); CAD kernels REJECT; R3F/drei verified; editors 0-adopt; Pascal Editor + all CAD/viewer name-drops verdicted (§1f/§1g).
- **inv3 [MATH/QC]** ✅ CLOSED: 7 deltas settled+PoC-validated — clash-detect (sampled ray-parity depth, NOT AABB proxy), duct-router (pure-JS A* turn-penalty + fittingForBend selection + slope constraint), Chamfer/Hausdorff/SSIM advisory, topology-gate wiring (§7), μ−λσ view-variance, Monte-Carlo P(clash) opt-in, OBB cascade tier. SKIP all heavy deps (OR-Tools/Ceres/SciPy/Open3D/PyTorch3D/LPIPS/Optuna) + REJECT GA/ACO + learned-predictor.
- **inv4 [SPATIAL+BIM+ASSETS]** ✅ CLOSED: Spatial World Model design (S1/S3/frames ADOPT; S2 guarantee-labeled per A1+A2 null); BIM = web-ifc INTAKE + optional IFC-EXPORT track (B2: emit IfcDistributionPort via web-ifc write path); engine_components REJECT (unpkg CDN); Isaac REFERENCE; BACnet/Niagara OUT-OF-SCOPE; Hunyuan3D/Rodin/TRELLIS blocked from CERT (§2f).
- **inv2 [AGENTIC]** ✅ CLOSED: 5 systems verified + 3 fabricated names caught (§2e); compiler-ORACLE mechanism; semantic proxies + transform-preservation (§2d); multi-agent locks + two-phase reserve/commit (folds into S2).
- **Completeness pass** ✅: whole-doc critic (17 gaps, all now verdicted) + all 4 lanes self-re-verified. Two substantive CANDIDATES deferred to v1.19 (voxel-vectorizer §1g, and the export track gated behind real need).

## 4. Creador validation plan (empirical, before promoting buildable deltas)
- inv3 already has: creador1 = headless three-mesh-bvh clash PoC; creador2 = pure-JS 3D A* duct-router PoC.
- QUEUED (investigador1): build + headless-gate `library/parts/hvac-fittings.mjs` (DELTA 1) — a creador builds the exact-arc elbow/tee/reducer, runs `geom-verify` + a numerical test (assert centerline points satisfy x²+y²=R² within eps), proving the delta before it's written to the kit. Sequence behind inv3's PoCs so workers are never double-loaded.
