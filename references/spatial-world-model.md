# spatial-world-model — external spatial engine & placement-API contract

Design guidance (reference, not a gate) for MULTI-ASSET scenes: how a spec-first design holds SPACE
without letting the LLM invent world coordinates. Everything here is ADAPTED to the kit's offline-first,
spec-first, Node/browser constraints — not copied from any source document. The deterministic engines it
names are the same ones the clash / spatial gate runs (GATES.md §Spatial, clash & mechanical-integrity
gate); the schema fields it needs are `scene_graph` / `upAxis` / `clearanceRisk` (DESIGNSPEC.md §Schema).

## Source of truth — the semantic model, not the render

The canonical model is the SEMANTIC scene (typed nodes + volumes + ports + relations, stored alongside
`design-spec.yaml`). three.js only RENDERS it; the `Object3D` tree is a projection, never the source.
This keeps the certified DATA layer decoupled from the view layer (the same discipline as the CAD→3D
two-phase architecture, TRACK-THREEJS) — the model is authored and validated once, and any renderer
(vanilla three, R3F) draws from it.

## The AI does not own space

An external DETERMINISTIC Spatial Engine owns all coordinates. The LLM proposes edits to a compact
Scene-JSON and reads state back; it NEVER writes `object.position.set(x,y,z)` and never invents world
coordinates. This is the compiler-ORACLE invariant:

> The engine REPORTS violations; it NEVER silently repositions. The AI edits the spec, the engine
> compiles geometry + a violation report, the AI fixes the spec. Auto-repositioning would HIDE the
> error the AI must learn to avoid.

Two consequences: every placement is AUDITABLE (a spec edit + an engine verdict), and the engine is pure
and testable in isolation. On REJECT the engine returns a TYPED report, never a silent move —
`{rejected:[x,y,z], reason:"occupied", occupied_by:"AHU-01", occupied_volume:{...}}` — which is exactly
the shape `geom-verify.mjs` violations already emit, so the verifier IS a reference implementation of the
oracle's report.

## Placement is a transaction: reserve → validate → commit → snapshot

Every placement is a TRANSACTION, not an assignment:

```
PROPOSE(candidate) → check cascade → COMMIT | REJECT(reason)
  cascade: bounds ⊆ room → broad-phase (occupancy/hash) → AABB → OBB → narrow-phase (BVH/Rapier)
                         → clearance-box free → own-clearance ⊆ room
```

Sequential reservation is what kills the "everything at (0,0,0)" stacking failure: object N+1 is placed
against the COMMITTED state of 1..N, and after each commit the AI receives a fresh spatial snapshot
(+ optional top/side mini-map) so its next decision is grounded in real occupied state, not a stale
mental model.

## Volumes, not points

Each object carries `size` + `center` + optional `rotationQuat` (never Euler — three.js gimbal-lock
warning), a derived `physicalAABB` / `OBB` (the solid body), and a SEPARATE `clearance` volume (a second
box for maintenance / electrical working space — a first-class constraint distinct from the body). Ports
are LOCAL offsets carrying a DIRECTION; world port = center (+ rotation) + offset.

**CONTACT vs ILLEGAL_COLLISION.** Legal CONTACT (a pipe entering a port on a service face, two bodies
touching by design) is DISTINCT from ILLEGAL_COLLISION (two physical AABBs overlapping in their
interiors). The engine must never conflate them — the same `touching` (weld, allowed) vs `overlapping`
(interior defect) distinction the clash gate enforces with `depth > tolerance` (GATES.md).

## The placement API — high-level ops + read-only "senses"

The AI works in RELATIONS; the engine works in COORDINATES. Two op surfaces:

- **QUERY ops (read-only "senses" — perception before acting):** `LOOK_AT`, `WHAT_IS_HERE`,
  `DISTANCE_TO`, `NEAREST_OBJECT`, `IS_SPACE_FREE`, `OBJECTS_WITHIN(radius)`, `CAN_PLACE(asset,pose)`,
  `FIND_FREE_SPACE(bounds)`, `PATH_FREE(start,end)`, `WHAT_IS_ABOVE/BELOW`, `CONNECTED_TO`. These let the
  AI interrogate the world instead of imagining it.
- **MUTATION ops (transactional):** `placeAgainstWall(id, wall)` / `placeNextTo(id, ref, side, gap)`
  (anchored relative placement) · `findFreeSpace(size, near?, clearance?)` (grid search for the first
  cell passing `canPlace`) · `connectPorts(portA, portB)` — connect by port IDENTITY
  (`connect(CH-01.CHWS_out, P-01.suction)`), NEVER by guessing coordinates; endpoints read from committed
  world ports · `routeDuct(portA, portB, constraints)` — hands off to the A* router, returns a polyline
  the engine validates endpoint-matches the ports · `commit()` / `rollback()`. `routeDuct` takes a
  CONSTRAINT SET, not a path — `{ceiling_clearance≥200mm, wall_clearance≥100mm, max_bends=5,
  no_collision, orthogonal_preference}` — the solver computes XYZ.

## The engines underneath — deterministic, offline, zero new dep

- **Clash / narrow-phase:** `library/harness/clash-detect.mjs` (three-mesh-bvh, headless, REPORTS ONLY).
  Broad-phase is the occupancy grid / spatial hash, then AABB → OBB → BVH only on survivors.
- **Routing:** `library/parts/duct-router.mjs` (pure-JS 3D A* on the occupancy grid, turn-penalty + slope
  constraint, deterministic byte-identical waypoints) is `routeDuct`'s implementation; its bend metadata
  drives `hvac-fittings` elbow selection.
- **Occupancy grid:** hand-rolled tri-state {UNKNOWN, FREE, OCCUPIED} (optionally a semantic per-cell
  enum: free / occupied / clearance / reserved / structure …) set by AABB/OBB rasterization from known
  volumes — deterministic, NO probabilistic log-odds (we know the geometry, not sensor readings).
- **Orientation:** three.js `Quaternion` (vendored). The core is buildable entirely from primitives the
  kit already vendors (`Box3`/`intersectsBox`, `examples/jsm/math/OBB`, `Octree`) — **no new dep**.

**Default engine = hand-rolled AABB / OBB + the BVH cascade (zero new binary dep, fully offline).**
`@dimforge/rapier3d` (Apache-2.0, WASM) is an OPTIONAL upgrade ONLY when a scene needs true swept /
rotated-body queries the BVH cascade cannot cover — and its `.wasm` MUST be vendored locally (never a
CDN) or it trips `assertNoNetwork`. Keep the engine dependency-light.

## Coordinate frames

The RENDER layer is Y-up, 1u = 1m — UNCHANGED (TRACK-THREEJS, every shipped design). The DATA layer MAY
be Z-up CAD-logical, declared by `upAxis` (DESIGNSPEC.md §Schema); when `upAxis: "Z"`, the Z→Y conversion
REUSES the single existing `cadToRender()` intake transform, never a second mapping. The transform tree
IS the three.js `Object3D` / `matrixWorld` hierarchy (WORLD→Building→Room→Equipment→Port) — adopt it
directly; do NOT build tf2-style time-buffered transforms (a static generator has no temporal frames).
Units: meters for render, integer millimeters (or voxel indices) for the exact CAD layer, to avoid float
drift on equality checks.

## Multi-agent reservations

When parallel discipline agents (Architect / HVAC / Piping / Electrical / Structural) place into one
room, a shared `ReserveSpace(bbox)` + spatial lock stops two agents claiming the same zone (reservation
is a first-class occupancy code): Agent A → reserved, Agent B → denied → reroute or leave UNPLACED — the
lock never yields an illegal state, only reroutes.

## Promotion verdict (S2 — honest, evidence-gated)

The typed scene-graph (S1), volumes-not-points (S3), the compiler-oracle invariant and the
coordinate-frame discipline are low-risk and well-evidenced → **ADOPT**. The external Spatial Engine that
OWNS coordinates (S2, reserve→commit) carries a THREE-PART, data-backed label:

> **ADOPT S2 — a GUARANTEE + clearance-awareness in the SINGLE-AGENT regime (A1 N=4 and A2 N=12 both
> NULL — a strong model placed every object cleanly with NO engine, matching it exactly; A3 SOFT
> non-null — with a fixed column splitting the room, naive left ~0.75 m of a unit's service clearance
> eaten while the engine reserved the clearance VOLUME before commit, BOTH still PASS), REQUIRED for
> CORRECTNESS in the MULTI-AGENT regime (E4 HARD non-null: two blind parallel creadores' primaries
> collided — naive-parallel merge = 2 overlaps / FAIL, the ReserveEngine-lock run = 6/6 placed / 0 hard /
> 0 soft / 10.0 / PASS — an OBSERVABILITY limit no stronger model reasons away, since blind agents cannot
> see each other's in-context state).**

So S2 is NOT shipped as a core "the AI needs this to place objects" rule — the data REFUTES the doc's
blanket "AI can't hold space" claim for a strong single agent. It earns its place as a GUARANTEE mechanism
for weaker / faster models, denser scenes, and auditability, and as a genuine CORRECTNESS requirement only
under multi-agent concurrency. (Aside: this is literally how a multi-agent team avoids collisions —
SendMessage + a shared repo is a human ReserveEngine.)
