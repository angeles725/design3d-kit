# DESIGN — Spatial World Model & Transactional Placement (design3d-kit v1.18 candidate)

Author: inv4 (sole author per i1). Integrates inv2's compiler-oracle principle + inv3's deterministic
engines. This is a PROPOSAL for the user to promote — nothing here is binding until promoted (SKILL Hard
Rule 6). Everything is ADAPTED to the kit's offline-first, spec-first, browser/Node constraints — not copied
from the source document.

## 0. Problem (from investigacion.md, verified)
3DSRBench (ICCV 2025) confirms multimodal models fail at height/orientation/location/multi-object relations.
The document's two named failure modes: the model (a) puts everything near one coordinate, and (b) is unaware
of already-occupied space, so objects overlap. **A1 empirical caveat (measured):** at N=4 a strong model
(opus) avoids both failures unaided — so this is a DENSITY problem, and the engine is justified as scenes grow,
not as a blanket rule. Promotion of S2 is gated on A2 (N=12) showing the engine beats naive at density.

## 1. Core principle — the AI does not own space
An external **deterministic Spatial Engine** owns all coordinates. The AI (LLM) only proposes edits to a
compact **Scene-JSON** and reads back state; it NEVER writes `object.position.set(x,y,z)` and never invents
world coordinates. This is inv2's **compiler-oracle** invariant, adopted verbatim:

> The compiler/engine REPORTS violations; it NEVER silently repositions. The AI edits the spec, the engine
> compiles geometry + a violation report, the AI fixes the spec. Auto-repositioning would hide the error the
> AI must learn to avoid.

Two consequences: (1) every placement is auditable (a spec edit + an engine verdict), and (2) the engine is
pure and testable in isolation (this is why the A1/A2 verifier can score outputs deterministically).

## 2. Representation — objects are VOLUMES, not points (delta S3)
Each object in the spec carries:
- `size: [sx,sy,sz]`, `center: [cx,cy,cz]`, optional `rotationQuat: [x,y,z,w]` (NEVER Euler — three.js manual
  gimbal-lock warning; store orientation as a quaternion, `Quaternion.setFromUnitVectors` for axis-align).
- `physicalAABB` / optional `OBB` (derived) — the solid body.
- `clearance: {"+x":1.0, ...}` → a SEPARATE service/clearance volume (second box). Maintenance/electrical
  working space (e.g. VFD +x:0.9) is a first-class constraint, distinct from the body.
- `ports: {NAME: [lx,ly,lz]}` — LOCAL offsets from center; world port = center (+ rotation) + offset.
- `occupiedVoxels` (derived) — the object's footprint rasterized into the occupancy grid.

Legal CONTACT (a pipe entering a port on a service face, two bodies touching by design) is distinct from
ILLEGAL_COLLISION (two physical AABBs overlapping). The engine must not conflate them.

## 3. Three spatial memories (delta S1)
1. **Scene graph (typed relations)** — the "what/how-related" memory. Because we own exact geometry, the
   scene-hypergraph relations from arXiv 2505.20129 become DETERMINISTIC COMPUTED PREDICATES, not learned
   edges: `clearance` (unary), `contact`/`alignment` (binary), `symmetry`/`equidistance` (higher-order).
   Stored alongside `design-spec.yaml`; passes read/update it. (3DGraphLLM/SpatialRGPT show relations add
   signal beyond raw coordinates — for us they are QC predicates, not model inputs.)
2. **Occupancy grid** — the "what-space" memory. Hand-rolled tri-state {UNKNOWN, FREE, OCCUPIED} (OctoMap's
   idea, NOT the C++ lib). Deterministic: cells set by AABB/OBB rasterization from known volumes — skip
   OctoMap's probabilistic log-odds (that's for sensor fusion; we know the geometry). Dual resolution: world
   meters for render, integer voxel indices for the grid (V = round(world / voxelSize)).
3. **BVH / narrow-phase** — the "exact-geometry" memory for precise clash. See §5 engine layer.

## 4. Placement-API contract (delta S2) — the ops the AI may call
The AI never emits raw XYZ. It calls high-level ops; each is a TRANSACTION:

```
PROPOSE(candidate) -> check cascade -> COMMIT | REJECT(reason)
  cascade: bounds ⊆ room  →  broad-phase (occupancy/hash)  →  AABB  →  OBB  →  narrow-phase (BVH/Rapier)
                            →  clearance-box free  →  own-clearance ⊆ room
```

Ops (the imperative surface; each returns a verdict + fresh snapshot, never a silent move):
- `placeAgainstWall(id, wall)` / `placeNextTo(id, ref, side, gap)` — anchored, relative placement.
- `findFreePosition(size, near?, clearance?)` — grid search returning the first cell that passes canPlace.
- `canPlace(id, center)` — the full cascade as a boolean + reason (this is exactly the A1/A2 verifier's core).
- `connectPorts(portA, portB)` — connect by port identity (`connect(CH-01.CHWS_out, P-01.suction)`), NOT by
  guessing coordinates; endpoints are read from committed world ports.
- `routePipe(portA, portB, constraints)` — hands off to inv3's duct-router (§5); returns a polyline the
  engine validates endpoint-matches the ports.
- `commit()/rollback()` — sequential reserve→validate→commit→snapshot. Sequential reservation is what kills
  the "everything at (0,0,0)" stacking: object N+1 is placed against the COMMITTED state of 1..N.

After every commit the AI receives a fresh spatial snapshot (+ optional top/side mini-map) so its next
decision is grounded in the real occupied state, not its own stale mental model.

## 5. Engine layer — deterministic, offline, cited (inv3 + verified libs)
- **Clash detection:** inv3's `clash-detect.mjs` (three-mesh-bvh headless) is the narrow-phase precise clash
  engine. Broad-phase is the occupancy grid / spatial hash (cheap), then AABB → OBB → BVH only on survivors.
- **Routing:** inv3's `duct-router.mjs` (pure-JS 3D A* on the occupancy grid) is `routePipe`'s implementation.
- **Optional physics narrow-phase:** `@dimforge/rapier3d` (Apache-2.0, WASM) offers `intersectionsWithShape`
  + broad/narrow phase + cross-platform determinism. ADOPTION CAVEAT: it ships a `.wasm` that MUST be vendored
  locally (never a CDN) or it trips `assertNoNetwork`. RECOMMENDATION: prefer the hand-rolled AABB/OBB + inv3's
  BVH cascade as the default (zero new binary dep, fully offline); treat Rapier as an OPTIONAL upgrade only if
  a scene needs true swept/rotated-body queries the BVH cascade can't cover. Keep the engine dependency-light.
- **Orientation:** three.js `Quaternion` (already vendored, MIT). Internal orientation is always a quaternion.

## 6. Coordinate frames (from Section 11, adapted — reconciled with i1's render-invariant)
- **RENDER layer is Y-up, 1u=1m — UNCHANGED and non-negotiable.** This is the existing kit convention
  (TRACK-THREEJS, shared by all ~285 shipped designs); it is NOT touched by this design.
- **DATA/spatial layer** (scene_graph, CAD intake) MAY be **Z-up CAD-logical**. Declare it with an explicit
  scalar field on the spec (OpenUSD `upAxis` convention):
  - Field: **`upAxis: "Y" | "Z"`**, **default `"Y"`** (render-native; a spec authored directly in render
    space needs NO conversion). `"Z"` marks a CAD-logical scene whose data is Z-up.
- **When `upAxis: "Z"`, the Z→Y conversion at the render boundary MUST REUSE the single existing CAD→3D
  intake transform — never a second, independent mapping.** The existing DWG intake already reflects the plan
  (COB-IM2 corpus §369-372: three.js `z` maps to the sheet's plan `+Y`, i.e. `z = y` reflection); a
  spec-authored Z-up scene and a CAD-sourced scene MUST route through the SAME conversion function or they
  will disagree on up/north. Convert ONCE at the render boundary; never mix conventions mid-scene.
- Concretely: expose one shared `cadToRender(v)` (the intake's existing transform) and forbid any other
  up-axis math in the spatial engine. The exact reflection sign is owned by that function, not re-derived here.
- Transform tree = the three.js `Object3D` / `matrixWorld` hierarchy itself (WORLD→Building→Room→Equipment→
  Port). This already IS a tf2-style parent-matrix tree; adopt it directly. Do NOT build tf2's time-buffered/
  interpolated transforms — a static scene generator has no temporal frames.
- Units: meters for render, integer millimeters (or voxel indices) for the exact CAD layer, to avoid float
  drift on equality checks.

## 7. Kit integration (target paths — for i1's v1.18 write)
- `references/DESIGNSPEC.md §Schema` — per-object physical AABB + clearance box + ports + rotationQuat +
  the up-axis metadata field; the typed relation graph.
- `SKILL.md` — a new Hard Rule: "In a spatial/multi-asset scene the AI emits Scene-JSON edits + placement
  ops; it never writes raw world coordinates. The engine reports, never repositions."
- `library/spatial-engine/` (new) — occupancy grid + canPlace cascade + placement ops; depends on inv3's
  clash-detect.mjs + duct-router.mjs.
- `references/GATES.md` — S5 spatial-QC hard-fails (overlap=0, disconnected-ports=0, out-of-bounds=0,
  clearance-intrusion), merged with i1's 3-review/HARD-FAILS delta and S4 self-refine critique loop.

## 8. Promotion gate (honest)
- S1 (typed relations), S3 (volumes), the compiler-oracle invariant, and the coordinate-frame discipline are
  low-risk and well-evidenced → recommend ADOPT.
- **S2 gate — SINGLE-AGENT RESULT (measured).** A1 (N=4) and A2 (N=12) are both null on HARD (10/10 both).
  **A3 (fixed column splitting the room) is the first NON-NULL: naive 8.5 vs engine 10** — HARD still null
  (naive manually detoured the pipe), but naive ate 3 SOFT clearances (the column landed inside CH-01's and
  AHU-01's service-clearance volumes) while the engine, which RESERVES clearance volumes before commit, pushed
  equipment out of the column's band and scored clean. So single-agent, S2 is (a) a guarantee/robustness
  mechanism AND (b) a measurable CLEARANCE-AWARENESS quality improver when a fixed obstacle intrudes
  clearances — not a "naive is broken" story (naive leaves clearance QUALITY on the table, magnitude modest,
  both still PASS). A statistical multi-trial would quantify the single-agent HARD-failure rate further, but A3
  already gives a concrete reproducible single-agent quality delta.
- **S2 in the MULTI-AGENT regime = REQUIRED, not optional (observability argument, inv2).** Every null so far
  is single-agent: ONE model holds the whole scene state in-context, so it can avoid self-collision. Two
  INDEPENDENT agents placing into the same room CANNOT observe each other's in-context state — without a shared
  ReserveEngine/lock (§9f) they WILL claim overlapping zones. This is an OBSERVABILITY limit, not a density
  effect, and a stronger model cannot reason it away. Conclusion: **single-agent → S2 is a guarantee;
  multi-agent concurrent → S2's reserve/lock is REQUIRED for correctness.** This is exactly how our own
  four-agent team avoids collisions (SendMessage + shared-repo coordination = the human analog of a
  ReserveEngine). inv2's E4 (two REAL independent creadores contending for one zone) is the exercise expected
  to yield the first NON-null result — prioritize it over more single-agent density instances.

## 9. Second-pass enrichments (from a full re-read of investigacion.md §11, lines 7182-8110)
Concrete details the first-pass skeleton missed; each refines a section above.

- **9a. Ports carry a DIRECTION, not just a position (refines §2).** Each port = `{position:[lx,ly,lz],
  direction:[dx,dy,dz]}` (unit vector, e.g. `[1,0,0]` = faces +X). Connection/flow orientation and the
  object quaternion derive from directions via `Quaternion.setFromUnitVectors(A,B)` — never authored Euler.
  The AI says a direction; the engine computes the quaternion.

- **9b. Semantic occupancy grid (refines §3.2).** The tri-state {UNKNOWN,FREE,OCCUPIED} is the MINIMUM. The
  doc proposes a richer per-cell code enum: `0 free · 1 occupied · 2 clearance · 3 reserved · 4 structure ·
  5 HVAC · 6 piping · …`. Adopt the semantic enum as an OPTIONAL extension — it lets a query distinguish
  "reserved by another agent" from "solid structure" from "someone's clearance envelope", which the bare
  tri-state cannot. Still deterministic (set from typed volumes), still no probabilistic log-odds.

- **9c. Two op surfaces, not one (refines §4).** Split the placement API into:
  - QUERY ops (read-only "senses" — the AI's perception): `LOOK_AT(pos)`, `WHAT_IS_HERE(pos)`,
    `DISTANCE_TO(obj)`, `NEAREST_OBJECT(pos)`, `IS_SPACE_FREE(box)`, `OBJECTS_WITHIN(radius)`,
    `CAN_PLACE(asset,pose)`, `FIND_FREE_SPACE(bounds)`, `PATH_FREE(start,end)`, `WHAT_IS_ABOVE/BELOW(obj)`,
    `CONNECTED_TO(obj)`. These let the AI interrogate the world before acting instead of imagining it.
  - MUTATION ops (transactional, from §4): place*/connectPorts/routePipe/commit/rollback.

- **9d. routePipe takes a constraint set, not a path (refines §4).** The AI never draws the polyline. It calls
  `connect(AHU-01.SUPPLY, VAV-04.INLET, {ceiling_clearance>=200mm, wall_clearance>=100mm, max_bends=5,
  no_collision=true, orthogonal_preference=true})`; inv3's A* duct-router computes XYZ. AI works in relations,
  the solver works in coordinates.

- **9e. Structured rejection report = the compiler-oracle's output contract (refines §1).** On REJECT the
  engine returns a typed report, never a silent move, e.g.
  `{rejected:(x,y,z), reason:"occupied", occupied_by:"AHU-01", occupied_volume:{x:[9,11],y:[8.5,11.5],z:[0,2.4]}}`.
  This is what the AI reads to fix the spec — and (bonus) it is exactly the shape our verify.mjs violations
  already emit, so the verifier IS a reference implementation of the oracle's report.

- **9f. Multi-agent spatial reservations/locks (refines §4; doc §7818 lock, §7846 discipline split).**
  `ReserveSpace(bbox)` + a spatial lock so two agents can't claim the same zone: Agent A → reserved,
  Agent B → denied. Directly relevant since design3d may run parallel discipline agents (Architect / HVAC /
  Piping / Electrical / Structural) — the same pattern the four of us are using to avoid collisions.
  Reservation is a first-class occupancy code (9b: `3 reserved`). inv2's E4 exercise (ReserveEngine +
  contend.mjs) is the empirical test of this, reusing verify.mjs for the final zero-overlap check.

- **9g. Spatial-Intelligence rubric category (feeds S5 / i1's GATES merge; doc §7908).** Proposed sub-weights
  for a new "Spatial Intelligence" gate category: Collisions 25% · Clearances 20% · Coordinates/frames 15% ·
  Connectivity 15% · Orientations 10% · Routing 10% · Duplicates/overlap 5%. HARD rule: any CRITICAL
  collision caps the whole asset's score at 7.9 regardless of visual/material/lighting scores (a pipe through
  an AHU cannot score ≥8). Hand this to i1 to merge with the 3-review/HARD-FAILS GATES delta.

- **9h. Concrete vendored primitives + academic backing (implementation notes).** The engine is buildable
  from primitives we already vendor (no new deps for the core):
  - three.js `Box3`/`intersectsBox` (AABB broad check), `examples/jsm/math/OBB` (rotated bodies),
    `examples/jsm/math/Octree` (spatial partition), `getWorldPosition`/`localToWorld`/`worldToLocal`/
    `matrixWorld` (the world↔local discipline of §6). CAUTION: three.js `Octree` ≠ OctoMap — different things.
  - Extra evidence for the "AI must not own raw coordinates" thesis (S2): Open3D-VQA (arXiv 2503.11094,
    relative>absolute), SpatialLLM (arXiv 2505.00788, CVPR 2025, 2D-bias is the root cause), SpatialRGPT
    (NeurIPS 2024, verbatim "LLMs struggle to utilize coordinate information … in text").
  - Academic precedent for §4's sequential reserve→validate→commit + the compiler-oracle's LLM-free
    correction: **Procedural Scene Programs** (arXiv 2510.16147, SIGGRAPH Asia 2025) — imperative placement
    where each object's pose is a function of previously-placed objects, corrected by program-space search
    (no LLM in the correction loop). This is the strongest external validation that the imperative +
    deterministic-correction architecture is sound, not just intuitive.
