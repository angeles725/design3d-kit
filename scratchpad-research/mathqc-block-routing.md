# MATH/QC — Automatic duct/pipe ROUTING via grid pathfinding (3D A* with turn-penalty) for the design3d-kit HVAC pipeline

> **Subject.** The kit can already *render* a duct/pipe run (`library/parts/pipe-run.mjs` cylinders+elbows;
> `library/parts/rmf-frames.mjs` smooth swept tube) and already *sweeps a centerline* (Block 51:
> CatmullRomCurve3 centripetal → TubeGeometry). The MISSING capability is **COMPUTING** the centerline:
> given two connection ports (AHU supply → diffuser) and obstacle boxes (beams, other ducts, walls), find an
> orthogonal (Manhattan) route that minimizes **bends**, not just length. `scratchpad-research/investigacion-digest.md`
> §2.6 recommends "Occupancy grid → A*". This block verifies that against real algorithm references, extracts a
> concrete pure-JS kit delta, and judges it for a **zero-dependency, offline, deterministic, WSL2-no-GPU** kit.
>
> **Method / markers.** Every load-bearing algorithmic claim was verified against a primary reference fetched live
> this session (2026-08-26) BEFORE citing. Markers:
> `[CERT-web]` = statement quoted from an official/primary web reference fetched this session (URL in §7);
> `[CERT-kit]` = `file:line` of a preserved kit source read this session;
> `[INFER]` = deduction (algebra, algorithm knowledge, kit-fit judgment) — NOT exhaustion; a DESIGN/APPLIED block
> is expected to carry a high `[INFER]/[CERT]` ratio.
> **No invented citations.** Where the digest already states something, it is quoted as digest text, not re-attributed
> to a paper I did not read.

---

## 1. Algorithm reality — the correct search is A* with a Manhattan heuristic AND a direction-augmented state carrying a turn penalty (NOT plain A*, NOT JPS)

### 1.1 The three candidates, decided

- **Dijkstra** expands outward by cost-so-far only: *"Dijkstra's Algorithm calculates the distance from the start
  point"* `[CERT-web]` (Red Blob Games, *Introduction to A\**). It is correct but explores uniformly in all
  directions — wasteful when you have a single known goal. Use it only when there is no usable heuristic or many
  goals `[INFER]`.
- **A\*** adds a goal estimate: *"A\* is using the sum of those two distances"* (`priority = new_cost +
  heuristic(goal, next)`, i.e. `f = g + h`) `[CERT-web]`. It is **guaranteed optimal iff the heuristic never
  overestimates**: *"A\* is guaranteed to find the shortest path if the heuristic is never larger than the true
  distance"* `[CERT-web]` (admissibility). For a grid whose moves are only ±x/±y/±z, the correct admissible
  heuristic is the **Manhattan / taxicab** distance: *"Manhattan distance on a square grid … `abs(a.x−b.x) +
  abs(a.y−b.y)`"*, which applies *"on square grids with 4-way movement"* `[CERT-web]`. Extended to a 6-connected
  3D orthogonal grid, `h = (|dx|+|dy|+|dz|) · stepCost` is exact obstacle-free graph distance, hence a valid lower
  bound → admissible **and** consistent `[INFER]`.
- **JPS (Jump Point Search)** is a *speed optimization of A\**, not a different objective: *"a technique for
  identifying and eliminating path symmetries … combination of A\* search with two neighbour-pruning rules …
  can speed up A\* by an order of magnitude"* `[CERT-web]` (Harabor & Grastien, AAAI 2011). **Its pruning is only
  valid on a uniform-cost grid:** *"Jump point search is limited to uniform cost grids and homogeneously sized
  agents … initially introduced for uniform cost 8-connected grids"* `[CERT-web]`. **This is exactly what a
  turn penalty destroys** (§1.2): once a straight step is cheaper than a turning step, the grid is no longer
  uniform-cost and JPS's symmetry-breaking is unsound `[INFER]`. **→ JPS is the wrong tool for bend-minimizing
  duct routing.**

### 1.2 The domain nuance the naive claim misses: minimizing BENDS ≠ minimizing LENGTH

Each elbow is a real fitting (cost) and a real pressure drop, so the engineering objective is *few bends*, and a
short-but-writhing route with 8 elbows is WORSE than a slightly longer route with 3. The digest already captures
this exactly: *"A\* cost modified: `C = wL·L + wB·bends + wV·verticalChanges + wC·clearance + wP·proximity` —
19 m/3 elbows beats 18 m/8 elbows"* (`investigacion-digest.md` §2.6). The mathematics of *how you actually
search that cost* is the part the one-liner omits:

> **A memoryless node cannot count bends.** Plain A*/Dijkstra label a node by its **cell** only. The cost `g(cell)`
> has no way to know *which direction you arrived from*, so it cannot tell whether the next step continues straight
> (free) or turns (penalized). Writing `+ wB·bends` in a cost formula does not, by itself, define a searchable
> graph. `[INFER]`

**The correct, standard fix is state-space augmentation:** the search node is the pair **(cell, incoming
direction)**, not the cell alone. Public grid-routing practice confirms direction-in-the-state as the technique
for turn minimization: *"tracking direction as part of the search state … keep the number of turns to a possible
minimum"*, via *"steering cost models and adaptive cost functions"* `[CERT-web]` (survey of turn-minimizing grid
pathfinding). Concretely:

- **State:** `(x, y, z, dirIn)` where `dirIn ∈ {+x,−x,+y,−y,+z,−z, NONE}` (7 values; `NONE` = at the start port).
  The search graph has `|cells| × 7` states `[INFER]`.
- **Edge cost** from `(cell, dIn)` stepping to `(neighbor, dOut)`:
  `cost = stepLen + (dIn ≠ NONE && dOut ≠ dIn ? bendPenalty : 0)`. A straight continuation pays only `stepLen`;
  a 90° turn additionally pays `bendPenalty` `[INFER]`.
- **Heuristic stays admissible:** `h = Manhattan · stepCost` never overestimates because the true remaining cost is
  `length·stepCost + bends·bendPenalty ≥ length·stepCost ≥ Manhattan·stepCost` (bends only ADD cost) `[INFER]`.
  A* therefore still returns the **provably minimum-cost** route under the combined length+bend objective. (You may
  tighten `h` with a "≥1 bend if the goal is off-axis in ≥2 dimensions" lower bound, but plain Manhattan is safe
  and simplest `[INFER]`.)

This "cell + direction" state is the classical **minimum-bend maze router** idea from VLSI (Lee/Hadlock-family
grid routing), reframed for 3D orthogonal HVAC `[INFER]`. **The cost model is the answer to the question — the
container (A\* vs Dijkstra) is secondary; the direction-augmented state + turn penalty is the load-bearing part.**

---

## 2. Pure-JS feasibility, determinism, and the pathfinding.js question

### 2.1 A few hundred lines, zero deps, CPU-only — confirmed feasible

3D A* over `(cell, dir)` is: a binary-heap priority queue (~40 lines), a `Map` of best-g per visited state, the
6-neighbor expansion with the turn-penalty edge cost, an `isFree(x,y,z)` obstacle predicate, and a
parent-backtrace + collinear-simplify. That is **~200–300 lines of pure arithmetic** with **no `three` import at
all** — it runs identically in Node (for `.test.mjs`) and in the browser, uses **no GPU**, and fits the WSL2-no-GPU
offline constraint trivially `[INFER]`. It matches the kit's established "**pure core, zero-imports,
Node-testable, + optional thin async `three` wrapper**" pattern already used by `adaptive-segments.mjs`,
`rmf-frames.mjs`, `superquadric.mjs`, and `lathe-body.mjs` `[CERT-kit]` (`library/INDEX.md` parts/ rows).

### 2.2 Determinism — the tie-break is mandatory, and it is the whole game

A* is deterministic **only if ties are broken deterministically.** Two frontier states with equal `f` can be
popped in either order depending on heap internals and insertion sequence, yielding **different-but-equal-cost**
routes across runs — fatal for the kit's deterministic-capture ethos (`deterministic-tick-pools`: *"draws
identical at any tick"*, and query-state `tick` pinning so *"captures never race"*, `library/INDEX.md`) `[CERT-kit]`.
Requirements `[INFER]`:

1. **Total-order comparator on the frontier:** compare `f`; break `f`-ties by **lower `h`** (prefer nearer the
   goal — also a speed win and it hugs the goal cleanly); break remaining ties by a **monotone insertion counter**
   (or a lexicographic `(x,y,z,dir)` key). No two states ever compare "equal".
2. **No `Math.random`, no `Date`, no reliance on `Set`/`Map` iteration order** for frontier ordering.
3. Deterministic neighbor iteration order (fixed `[+x,−x,+y,−y,+z,−z]` array).

Result: **same ports + same obstacles + same params → byte-identical waypoints, every run** — a pure function,
exactly what the capture harness needs.

### 2.3 pathfinding.js — verified, and it does NOT fit

`qiao/PathFinding.js` is real and **MIT-licensed** `[CERT-web]`. But: it is **"2D space" only** (*"If you need to
work in a 3D environment, then you may use [@schteppe]'s fork"*) `[CERT-web]`; it bundles A*/Dijkstra/JPS/etc. but
**"does not mention turn penalties or bend costs"** `[CERT-web]`. So for our need it is disqualified twice — no
3D and no bend cost — and the 3D fork is an unmaintained third-party fork that still would not model turns
`[INFER]`. Pulling it in would add a dependency, a build step, and a 2D→3D adapter and STILL leave the
turn-penalty (the actual engineering objective) unimplemented. **Hand-rolling is both smaller and strictly more
capable here** `[INFER]`.

---

## 3. Grid vs continuous — discrete voxel grid is the right call, plus the post-process to Block 51

### 3.1 Why discrete wins for THIS domain

HVAC ducts **are** axis-aligned orthogonal runs, so a grid's discreteness is not a limitation — it *matches the
constraint* (the route must be Manhattan anyway) `[INFER]`. Continuous/sampling planners (RRT is random → breaks
determinism; visibility-graph/any-angle produce diagonal cuts we do not want for ducts) are more code and the
wrong shape of output `[INFER]`.

### 3.2 Resolution & memory tradeoff

- `gridStep` must be **≤ the tightest gap you must thread** and should **divide the port spacing** so ports land on
  cell centers `[INFER]`. Too coarse → can't fit through a gap, or ports misalign; too fine → state count explodes
  (halving `gridStep` ≈ **8× states** in 3D) `[INFER]`.
- **Do NOT materialize a dense 3D array.** With few obstacles in a large volume, store nothing: make `isFree(x,y,z)`
  a **lazy predicate** that tests the cell center against the (inflated) obstacle AABBs on demand, and keep only the
  *visited* states in a `Map` keyed by `(x,y,z,dir)`. Memory is then O(states actually expanded), not O(volume)
  `[INFER]`. (The kit's `voxel-kit.mjs` is a **color-bucketed mesher store, not a boolean occupancy for search**
  `[CERT-kit]` `library/parts/voxel-kit.mjs:1-14` — the router wants its own thin occupancy predicate, not
  voxel-kit's face-mesher.)

### 3.3 Obstacle inflation by duct radius (configuration-space)

A* routes the **centerline (a point)**; the physical duct has radius `r`. To guarantee the duct body clears
obstacles, **inflate every obstacle AABB by `r + clearance + 0.5·gridStep` before testing** (Minkowski grow →
route a point through the grown obstacles) and keep the route ≥ `r` from the domain bounds `[INFER]`. This is the
kit's own §2.5 thesis in the digest — *"Physical volume vs clearance/service volume … a pipe can miss the chiller
physically yet block maintenance"* (`investigacion-digest.md` §2.5): inflate by the **clearance/service** volume,
not just the geometric radius, when maintenance access matters.

### 3.4 Post-process → hand off to `pipe-run.mjs` / Block 51 (do NOT re-cover curve math)

The raw A* path is one cell per step. Post-process `[INFER]`:

1. **Collinear-simplify:** walk the cell path, drop any point whose incoming and outgoing directions are equal.
   The survivors are exactly the **corners = elbows**; `bendCount = survivors − 2` (exclude the two endpoints).
2. **Emit ordered world-space waypoints.** These feed directly into either output path:
   - **Hard orthogonal elbows (exact):** `createPipeRun({ points: waypoints, radius, material })` — oriented
     cylinders + sphere elbows at each corner `[CERT-kit]` `library/parts/pipe-run.mjs:37-84`.
   - **Rounded/swept look:** the waypoints become `CatmullRomCurve3` control points (centripetal α=0.5, the
     three.js default — cusp-free through elbows) → `TubeGeometry`, or `rmf-frames.mjs makeSweptTube` for a
     twist-free RMF sweep. **This is Block 51 §51.8 exactly — its input is these waypoints; do not re-derive the
     curve math here.** One caveat to preserve straight legs: centripetal Catmull-Rom will *round* every corner, so
     if you need long runs dead-straight and rounding confined to a fixed elbow radius, insert two guard points a
     small distance either side of each corner along its legs, then the curve rounds only within the elbow and the
     straights stay pinned `[INFER]`.

---

## 4. CONCRETE KIT DELTA (exact paths)

### 4.1 NEW — `library/parts/duct-router.mjs` (pure-JS 3D A* with turn penalty + collinear-simplify)

Follows the kit's pure-core-zero-imports + Node-testable pattern (no `three` needed in the core). Ships with
`library/parts/duct-router.test.mjs`.

**Header (mandatory kit format):**
```
// library: duct-router  (parts/duct-router.mjs)
// source: design3d numerical pass · verifies investigacion-digest §2.6 "occupancy grid → A*"
// what: pure-JS 3D orthogonal A* that routes a duct/pipe CENTERLINE between two ports around obstacle
//       AABBs, minimizing BENDS (state = cell+incoming-direction, turn-penalty cost) not just length;
//       outputs ordered world-space waypoints ready for pipe-run.mjs or a CatmullRomCurve3 (Block 51).
// params: gridStep, bendPenalty, clearance, radius, bounds — all caller world units.
// deps: NONE (pure arithmetic; Node-testable). Optional thin wrapper accepts THREE.Box3[]/Vector3.
// coupling notes:
//   - Routes the CENTERLINE (a point); obstacles are inflated by radius+clearance+0.5*gridStep so the
//     swept body clears. Route is a PURE FUNCTION of inputs (deterministic tie-break) -> byte-identical
//     waypoints every run (capture-safe). Ports snap to grid; pick gridStep to divide port spacing.
//   - Output waypoints feed createPipeRun (exact elbows) or CatmullRomCurve3+TubeGeometry (rounded, B51).
```

**Function contract:**
```js
routeDuct({
  start,          // { position:[x,y,z], dir?:[dx,dy,dz] }  port + optional OUTGOING normal
  end,            // { position:[x,y,z], dir?:[dx,dy,dz] }  port + optional INCOMING normal
  obstacles,      // [{ min:[x,y,z], max:[x,y,z] }]         AABBs (Box3-shaped)
  bounds,         // { min:[x,y,z], max:[x,y,z] }           routable domain box
  gridStep,       // world units per cell
  bendPenalty,    // cost added per 90° turn, in LENGTH units (see playbook for tuning)
  radius = 0,     // duct radius -> obstacle inflation
  clearance = 0,  // extra service/maintenance margin -> obstacle inflation
  maxExpansions,  // safety cap; returns {found:false} instead of hanging
}) => {
  found,          // bool
  waypoints,      // [[x,y,z], ...] ordered, collinear-simplified corners (world units)
  bends,          // integer elbow count = corners between the endpoints
  length,         // summed straight run length
  cost,           // length + bends*bendPenalty (the minimized objective)
  expansions,     // states expanded (for the cost ledger)
}
```
- `start.dir` / `end.dir` seed/require the first/last segment direction so the duct **leaves the AHU face and
  meets the diffuser perpendicular** (a real duct exits a plenum normal to it) — model as: the start state's
  `dirIn` is `start.dir` (turning off it on step 1 is penalized), and the goal is only accepted when reached with
  `dirIn == end.dir`. Omit `dir` to let the router pick freely `[INFER]`.
- Internals: binary-heap frontier; comparator `(f, then h, then insertion-id)` for determinism (§2.2); 6-neighbor
  orthogonal expansion; `h = Manhattan·gridStep`; edge cost `= gridStep + (turned ? bendPenalty : 0)`;
  `isFree` = cell center outside every obstacle inflated by `radius+clearance+0.5·gridStep` and inside `bounds`.
- Also exports the pure helpers `simplifyCollinear(cellPath)` and `inflateAABB(box, m)` for direct testing.

### 4.2 NEW — `library/recipes/duct-routing-playbook.md`

Sibling to the existing `parts` recipes. Covers `[INFER]`:
- **When to auto-route vs hand-author.** Auto-route when there are real obstacles to thread or many parallel runs;
  **hand-author** (drop straight into `pipe-run.mjs`) for a short, visibly-clear run — auto-routing a trivial run
  just spends CPU and can pick an ugly-but-optimal zig. The router's output is *a proposal*; a designer may pin
  waypoints.
- **Grid-resolution guidance.** `gridStep` ≤ tightest gap, divides port spacing, start coarse (fast) and only
  refine if no route is found; remember halving `gridStep` ≈ 8× cost in 3D.
- **Bend-penalty tuning.** `bendPenalty` is in length units. From the digest anchor ("19 m/3 elbows beats
  18 m/8 elbows" ⇒ removing 5 elbows is worth ≥1 m ⇒ per-elbow value > ~0.2 m), set `bendPenalty` to **a few ×
  `gridStep`** so the router trades a handful of cells of extra length to delete one elbow; raise it when fittings
  dominate cost, lower it when space is tight and you'd rather zig than collide.
- **Obstacle inflation** by `radius + clearance + 0.5·gridStep`, and using the **service/clearance** volume when
  maintenance access matters (digest §2.5).
- **Determinism** contract (tie-break) and the **hand-off** to `pipe-run.mjs` (exact elbows) or Block 51
  Catmull-Rom/`rmf-frames` (rounded), including the guard-point trick for pinned straights.

### 4.3 UPDATE — `library/INDEX.md`

Add one `parts/` row:
`| duct-router | module | Pure-JS 3D orthogonal A* routing a duct/pipe centerline around obstacle AABBs,
minimizing BENDS via a cell+direction state and a turn penalty (not length); deterministic tie-break → capture-safe
waypoints for pipe-run.mjs / CatmullRomCurve3 (Block 51). Pure core zero-imports, Node-testable. | design3d
numerical pass · verifies investigacion-digest §2.6 | ready |`

*(Extraction rule: a `library/` module row enters only after a gate judged it in pixels — `LIBRARY.md`
§Lifecycle. Land the row as this delta is applied through the numerical pass, same as the other pure-math parts.)*

---

## 5. Verify / refute the investigacion.md claim

**Claim (digest §2.6):** *"Occupancy grid → A\* pathfinding; cells coded 0 free / 1 wall / 2 equipment / 3 duct /
4 pipe / 5 clearance / 6 structure; orthogonal path then converted to pipe + real elbows."* plus *"A\* cost
modified: `C = wL·L + wB·bends + wV·verticalChanges + wC·clearance + wP·proximity`."*

**Verdict: ACCURATE and, unusually, already complete on the key nuance — with three refinements, not a refutation.**

- ✅ **Grid + A\* is the right family** (§1): correct, optimal with an admissible Manhattan heuristic, pure-JS,
  deterministic. Confirmed against Red Blob Games (`f=g+h`, admissibility, Manhattan-for-4/6-connected) `[CERT-web]`.
- ✅ **The digest is NOT missing the turn penalty** — it explicitly carries `wB·bends` and the "19 m/3 elbows beats
  18 m/8 elbows" example. So the common critique ("A* on a grid only minimizes length") does **not** apply to the
  full digest; it would apply only to the compressed one-liner "A*/Dijkstra grid pipe routing." **Refinement 1
  (the real gap):** the digest states the *cost* but not the *search mechanism* that makes `bends` a first-class
  term — namely the **(cell, incoming-direction) state augmentation**. Without it, `wB·bends` is un-searchable
  (§1.2). That is the one thing this block adds.
- ⚠️ **Refinement 2 — JPS is a trap here.** If anyone "optimizes" this A* with Jump Point Search, it silently
  breaks: JPS requires uniform-cost grids `[CERT-web]`, and the turn penalty makes the grid non-uniform. Keep plain
  A* (Dijkstra only as the heuristic-free fallback).
- ⚠️ **Refinement 3 — the digest's broader §2.6 stack is out of scope for the kit.** CP-SAT / OR-Tools, SciPy/Ceres
  least-squares, Optuna/NSGA-II are heavyweight native dependencies (`investigacion-digest.md` §2.6) — they violate
  the zero-dependency / offline / WSL2-no-GPU constraint and are **not** part of this delta. The bend-aware A* alone
  delivers the "few-elbows orthogonal route" outcome; the optimizer zoo is a separate, much larger, dependency-heavy
  question `[INFER]`.

**So:** the claim is *correct and well-specified*; the kit delta's contribution is (a) naming the **direction-
augmented-state** mechanism the cost formula needs, (b) the **determinism** tie-break, (c) the **obstacle-inflation**
+ **hand-off** wiring to existing kit parts, and (d) the explicit **JPS-is-wrong** and **no-heavy-optimizer**
guardrails.

---

## 6. Verdict — **ADOPT (pure-JS, no dependency)**

- **ADOPT:** hand-roll `library/parts/duct-router.mjs` — 3D A*, `(cell, direction)` state, Manhattan heuristic,
  turn penalty, deterministic tie-break, collinear-simplify. ~200–300 lines, zero deps, CPU-only, Node-testable,
  offline, deterministic. Outputs waypoints straight into the **existing** `pipe-run.mjs` / Block 51 sweep — it
  fills the one missing stage (compute the centerline) without touching the render stages.
- **do NOT BORROW** pathfinding.js: 2D-only, MIT but no turn penalty; the 3D fork is unmaintained and still lacks
  bends `[CERT-web]`. It would add a dependency and an adapter and still not solve the actual objective.
- **SKIP** the CP-SAT/OR-Tools/SciPy/Ceres/Optuna optimizer stack from digest §2.6 for now — native, heavy, and
  contrary to the zero-dep offline WSL2-no-GPU constraint. Revisit only if multi-run global layout optimization
  becomes a stated requirement.

---

## 7. Sources (verified this session, 2026-08-26 — fetched/quoted before citing)

- `[CERT-web]` Amit Patel, *Introduction to the A\* Algorithm*, Red Blob Games — `f=g+h`, Dijkstra vs Greedy vs A*,
  admissibility ("never larger than the true distance"), Manhattan heuristic for 4-way grids.
  https://www.redblobgames.com/pathfinding/a-star/introduction.html
- `[CERT-web]` Harabor & Grastien, *Online Graph Pruning for Pathfinding on Grid Maps*, AAAI 2011 (JPS) — "limited
  to uniform cost grids … uniform cost 8-connected grids"; A*-speedup framing.
  https://ojs.aaai.org/index.php/AAAI/article/view/7994 · https://en.wikipedia.org/wiki/Jump_point_search
- `[CERT-web]` Red Blob Games, *Grid pathfinding optimizations*, and turn-minimizing grid-routing survey results —
  "tracking direction as part of the search state", steering/adaptive cost models to reduce turns.
  https://www.redblobgames.com/pathfinding/grids/algorithms.html
- `[CERT-web]` `qiao/PathFinding.js` — MIT license; "2D space" only ("3D … use [@schteppe]'s fork"); bundles
  A*/Dijkstra/JPS/etc.; no turn/bend cost. https://github.com/qiao/PathFinding.js
- `[CERT-kit]` `library/parts/pipe-run.mjs:37-84` (waypoint → cylinders+elbows), `library/parts/voxel-kit.mjs:1-14`
  (color-bucketed mesher, not a search occupancy), `library/INDEX.md` (pure-core parts pattern; determinism ethos),
  `references/PIPELINE.md` (deterministic capture), `scratchpad-research/investigacion-digest.md` §2.5–§2.6 (the
  claim under test).
- Curve/sweep hand-off math is **Block 51** (`threejs-block51.md` §51.4–51.8, CatmullRomCurve3 centripetal +
  TubeGeometry) — deliberately NOT re-covered here; this block's OUTPUT (waypoints) is that block's INPUT.

## 8. Connections

- **[Block 51]** (curves/CatmullRomCurve3/TubeGeometry) — the direct downstream consumer: this router's
  collinear-simplified waypoints are Block 51's control points; centripetal α=0.5 keeps the elbows cusp-free.
- **`library/parts/pipe-run.mjs` / `rmf-frames.mjs`** — the two render backends the waypoints feed (exact elbows vs
  smooth swept tube).
- **`library/parts/voxel-kit.mjs`** — adjacent (voxelization) but NOT reused: its store meshes faces; the router
  wants a boolean `isFree` predicate, ideally lazy over inflated AABBs, not a materialized voxel array.
- **digest §2.5 Spatial World Model** — obstacle inflation by the clearance/service volume (not just radius) is the
  same "physical vs service volume" rule; ports-with-direction is the same "ports{worldPosition, direction}" idea.
- **Determinism family** — `deterministic-tick-pools`, `query-state` `tick` pinning, PIPELINE deterministic capture:
  the router's stable tie-break is the same discipline (pure function of inputs → identical evidence every run).
</content>
</invoke>
