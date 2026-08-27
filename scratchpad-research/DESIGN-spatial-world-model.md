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

## 6. Coordinate frames (from Section 11, adapted)
- One fixed world frame. Logical/CAD model is **Z-up** (BIM/HVAC convention); the three.js RENDER layer is
  **Y-up**. Declare the up-axis explicitly as a single scene-metadata field (OpenUSD `upAxis` convention) and
  convert at the render boundary — do not let the two conventions leak into each other.
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
- **S2 (the full transactional placement engine) is gated on A2.** If A2 (N=12) shows NAIVE hard-failing where
  SPATIAL-ENGINE holds → ADOPT S2 as a core delta. If A2 is ALSO null (both pass) → S2 becomes
  "optional, density-gated" (engage only above an object-count/occupancy threshold), not a core rule.
  A2 SPATIAL dispatched to creador2; NAIVE-at-density run still needed to complete the A/B (flagged to i1).
