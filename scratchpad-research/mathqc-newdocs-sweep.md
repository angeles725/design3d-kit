# MATH/QC Sweep — investigacion2/3/4.md vs design3d-kit MATHQC-DELTAS

Tag: **MATH/QC**. Constraints assumed for every verdict: zero-dep, offline, WSL2, no-GPU, deterministic.

Already-captured baseline (NOT re-reported as new): delta 1 three-mesh-bvh clash gate; delta 2 SKIP heavy
solvers/metrics + pure-JS Chamfer/SSIM advisory; delta 3 pure-JS A* duct-router (turn-penalty + fitting-selection +
drainage-slope); delta 5 μ−λσ multi-view; delta 6 Monte-Carlo P(clash); delta 7 topology/mesh-integrity gate + OBB
tier. Mature: three-bvh-csg (B46), curves/TubeGeometry (B51), mesh simplification (B49), marching-cubes/dual-contour
(B50), robust predicates (B45/47/48).

Global note: all three docs are ~95% harness/architecture prose (spatial-graph, BIM semantics, ports, LOD,
instancing). Almost every MATH/QC mention is a re-statement of things already in the kit. The genuinely net-new
surface is small and consists of refinements, not new subsystems.

---

## DOC 2 — investigacion2.md (agentic 3D harnesses)

| Item | Line | Doc claim | Status |
|---|---|---|---|
| Box3 AABB / `intersectsBox` / getSize | 283, 1084-1088 | Three.js already has AABB math for collision | CAPTURED — delta 1 + delta 7 OBB tier |
| Vibe3DScene "geometry penetration check" | 67 | Verification step = VLM visual + geometry penetration | CAPTURED — delta 1 (validates our clash approach) |
| World-space AABB from 8 bound_box corners × matrix_world | 460-472 | BlenderMCP transforms 8 corners to world for contact/containment/collision | CAPTURED — standard AABB, delta 1/7 |
| P_world = M_parent·P_local | 623, 1839 | parent-relative transforms | CAPTURED — basic matrix math |
| AABB broad-phase → precise mesh/BRep narrow-phase | 2098-2115 | cheap AABB test first, exact test only on overlap | CAPTURED — delta 1 two-phase is exactly this |
| Octree / octant partition (Open3D) | 1633-1645, 2258-2300 | 8-way recursive space partition for nearest-object / region queries | NET-NEW (weak) |
| VoxelGrid occupancy (Open3D) + `find_free_space` | 1653, 2117-2152 | uniform 3D grid, cells occupied/free, returns placement candidates | NET-NEW |
| Cell index = floor((x−x0)/s) | 1693, 2111 | point→cell mapping | CAPTURED-trivial |
| B-Rep/NURBS dual representation (OpenCASCADE) | 1529 | keep exact B-Rep + mesh both | CAPTURED-concept (B46) / SKIP-heavy for kernel |

## DOC 3 — investigacion3.md (engines: Godot/Three/Bevy/R3F/Babylon)

| Item | Line | Doc claim | Status |
|---|---|---|---|
| three-mesh-bvh | 1244-1246 | 3.4k★, accel raycast + spatial queries, web-workers | CAPTURED — delta 1 |
| AABB/OBB/BVH + CollisionDetector + SpatialIndex modules | 1128-1132, 1886, 3178 | spatial validator stack | CAPTURED — delta 1 + delta 7 |
| OrthogonalRouter / PathFinder / BendSolver / ClearanceSolver | 1108-1111, 1873 | A* + constraints + cost optimization | CAPTURED — delta 3 |
| Router objective Score = w1·L + w2·Ne + w3·Nc + w4·Po + w5·Ps | 1336-1348 | weighted multi-term routing cost | NET-NEW (refinement to delta 3) |
| TubeGeometry (sweep circle on curve) | 770-778 | circular sweep | CAPTURED — B51 |
| ExtrudeGeometry (2D shape on extrudePath) | 938-955 | rectangular-duct sweep | CAPTURED-ish (B51 family) |
| CatmullRomCurve3 | 796 | smooth curve — but doc warns AGAINST free splines for MEP | CAPTURED — B51 |
| Frenet / corrected-Frenet / fixed-binormal frames; B=T×N | 857, 866-920 | prevent profile twist during sweep (critical for RECT ducts) | NET-NEW (refinement to B51) |
| OCCT MakePipe, profile+spine, G1 tangent continuity | 834-857 | swept solids need G1 continuous spine | CAPTURED-concept (B46 / B51) |
| OpenSCAD CSG union/difference/intersection | 219-226 | boolean solid ops | CAPTURED — B46 |
| OpenSCAD **hull** / **minkowski** | 227-228 | convex hull + Minkowski sum operators | NET-NEW |
| Broad-phase octree/grid → AABB/OBB → BVH/exact | 2943-2962, 3176-3178 | layered collision pipeline | CAPTURED (delta 1/7) + octree layer weak-new |
| InstancedMesh / BatchedMesh / mergeGeometries / LOD | 692, 1385, 1400, 1425 | draw-call reduction | OUT-OF-LANE (rendering, not MATH/QC) |
| renderer.info draw-call/triangle budget | 1572-1618 | auto perf-budget check | OUT-OF-LANE (perf QC, not geometry QC) |
| **Physics engines (Rapier/Cannon/Bevy/Godot physics)** | — | **NOT PRESENT** — "physics" mentioned only abstractly (PlayCanvas Collision component, L163) | NONE — see §Physics |

## DOC 4 — investigacion4.md (CAD viewers + three-mesh-bvh)

| Item | Line | Doc claim | Status |
|---|---|---|---|
| three-mesh-bvh — points, lines, full Object3D-hierarchy BVH | 322-344, 1530 | BVH now covers points/lines/Object3D trees, not just meshes | CAPTURED — delta 1 (minor scope note) |
| AABB overlap → precise geometric analysis | 1100-1131, 1275-1279 | broad→narrow clash for duct-vs-pipe | CAPTURED — delta 1 |
| OCCT `BRepMesh_IncrementalMesh` — linear + angular deviation | 544 | tessellation precision = chordal (linear) + angular deviation | NET-NEW (refinement to delta 7 triangle-quality) |
| getVolume / getArea / getCenter / getDistance / getIntersections | 1249-1257 | per-object geometric-measurement queries | NET-NEW (getVolume/getArea/getCenter) |
| Voxel occupancy VoxelGrid / VoxelBlockGrid (Open3D) | 1576-1590 | occupied/free per voxel, sparse-dense scene grid | NET-NEW (same as doc2) |
| Octree octant bit-encoding (3 bits XYZ → octant 0-7) | 1471-1508 | spatial-address partition | NET-NEW (weak, same as doc2/3) |
| Cost fn Score = w1·L + w2·Ne + w3·Nc + w4·PressureLoss | 1974 | routing cost incl. **pressure-loss** term | NET-NEW (refinement to delta 3) |
| Semantic PMI / GD&T ± tolerances | 708-767 | STEP AP242 carries interpretable ±tolerances, datums | NET-NEW-link (feeds delta 6) |
| occt-import-js / occt-js / Mayo / CQ-editor (OCCT-WASM) | 126-207, 1003 | STEP/IGES/BREP→mesh in browser via OCCT WASM | SKIP-heavy-dep |
| CadQuery / Replicad (OCCT parametric) | 209-291 | parametric B-Rep generation | SKIP-heavy-dep |
| JSCAD CSG union/subtract/intersect/extrude | 235-265 | pure-JS CSG in browser | CAPTURED — B46 (JSCAD is an alt impl) |
| 3D Tiles HLOD / bounding volumes | 1883 | hierarchical LOD | OUT-OF-LANE (rendering) |

---

## §Physics — engine-collision claims vs our BVH

**None of the three docs proposes a physics-engine collision approach.** No Rapier, no Cannon, no Bevy-physics, no
Godot-physics collision method appears. "Physics" surfaces only as abstract DCC capability (Blender physics doc2
L1360; PlayCanvas `Collision` component doc3 L163) with zero method detail. There is therefore **nothing to weigh
against our BVH clash gate** — the docs uniformly converge on exactly our approach (AABB/OBB broad-phase → BVH/exact
narrow-phase), which is the *correct* result for a deterministic, no-GPU, offline kit: rigid-body physics solvers are
non-deterministic across platforms and add a heavy dep for zero clash-detection benefit. **Verdict: BVH clash stands;
no physics engine warranted. REJECT any physics-engine dependency.**

## §CAD-kernel geometry/boolean claims beyond B46

- CSG union/difference/intersection (OpenSCAD, JSCAD) = **already B46** (three-bvh-csg); JSCAD/OpenSCAD are just
  alternative implementations of the same booleans.
- **hull (convex hull)** and **minkowski** (OpenSCAD, doc3 L227-228) are the only boolean-family ops *beyond* B46.
- OCCT MakePipe G1-continuous swept solids = concept already served by B51 sweep + B46; the OCCT kernel itself is
  SKIP-heavy (WASM, ~non-deterministic tessellation, offline-hostile).
- OCCT deviation-controlled tessellation (linear + angular deviation, doc4 L544) is a real **geometry-QC parameter**
  not in B46 — see net-new item below.

---

## NET-NEW MATH/QC items (strict)

Ordered strongest → weakest. "Refinement" = extends an existing delta/block, not a new subsystem.

1. **Mesh volume / surface-area / centroid QC metrics** — ADOPT-pure-JS.
   doc4 L1249-1255 (`getVolume/getArea/getCenter`). Signed-tetrahedron volume + triangle-area sum + area-weighted
   centroid: ~30 lines, deterministic, no dep. Additive to delta 7 mesh-integrity: a closed mesh with volume ≤ 0 (or
   sign-inconsistent tetra contributions) is a direct non-manifold/non-watertight/inverted-winding flag — a cheaper
   discriminator than the current topology count. Also validates reducers/transitions (area ratio) and gives a real
   number for the QC scorecard. **Strongest genuine add.**

2. **Rotation-minimizing / corrected-Frenet sweep frame (fixed binormal)** — ADOPT-pure-JS (refines B51).
   doc3 L857-920. Default Three.js `TubeGeometry` uses Frenet frames that TWIST the profile along the spine; for
   rectangular ducts this rotates the section 90° mid-run (doc L901-914). Parallel-transport (rotation-minimizing)
   frame is pure-JS, deterministic, and fixes a real QC defect (twisted rect-duct meshes) that the mesh-integrity gate
   would otherwise pass as "valid". Directly relevant to the kit's duct geometry.

3. **Convex-hull envelope** — ADOPT-pure-JS (narrow use). / **Minkowski sum** — SKIP-heavy.
   doc3 L227-228. QuickHull is pure-JS, deterministic, and yields a tighter clearance/collision envelope than AABB and
   a data-driven OBB seed (improves delta 7 OBB tier and clearance checks). Minkowski sum (clearance-offset by
   summation) is expensive + robustness-fragile → SKIP; approximate clearance via hull-inflation or BVH closest-point
   instead.

4. **Deviation-controlled tessellation QC (linear + angular deviation)** — BORROW-concept (refines delta 7).
   doc4 L544. Adopt max-chordal-deviation and max-angular-deviation as *triangle-quality/tessellation* QC parameters:
   flag faces whose chord error or dihedral turn exceeds a budget. Deterministic, no dep. Ties tessellation fidelity
   into the mesh-integrity scorecard rather than only counting non-manifold edges.

5. **Voxel occupancy grid for free-space / placement search** — BORROW-concept (placement aid, not clash).
   doc2 L1653/2117-2152, doc4 L1576-1590. Uniform occupancy grid → `find_free_space(dims, zone)` returns candidate
   placements. Pure-JS, deterministic. Value is in *placement/routing*, NOT clash (BVH already wins clash). Partially
   overlaps delta 3's routing grid; worth it only if equipment auto-placement becomes a feature. Medium priority.

6. **Router cost-function extra terms (obstacle penalty, insufficient-space penalty, pressure-loss)** —
   BORROW-concept (refines delta 3).
   doc3 L1336, doc4 L1974. delta 3 already has turn-penalty; add Po (obstacle), Ps (space), and Ps_pressure terms to
   the scalar cost so candidate routes rank on more than length+turns. Pure-JS, deterministic (pressure-loss via
   standard Darcy/equivalent-length lookup, no solver).

7. **Octree broad-phase spatial index** — BORROW-concept (LOW / mostly redundant).
   doc2 L1633, doc3 L2943, doc4 L1471-1508. Recursive 8-way partition as a pre-filter. three-mesh-bvh already provides
   the acceleration structure for clash; a separate octree only helps coarse "objects-in-region" scene queries. Skip
   unless a non-mesh scene-graph query layer is needed.

8. **Semantic PMI/GD&T ±tolerances → Monte-Carlo feed** — NET-NEW-link (note only, currently N/A).
   doc4 L708-767. If CAD import ever lands, semantic ±tolerances/datums are the natural real-world input to delta 6
   Monte-Carlo P(clash) instead of assumed distributions. No action now (kit has no CAD-import path, offline).

**SKIP-heavy-dep (explicit REJECT for zero-dep/offline/no-GPU):** OCCT / occt-import-js / occt-js / CadQuery /
Replicad / Mayo (OCCT-WASM kernels — non-deterministic tessellation, large WASM, offline-hostile); any physics engine
(Rapier/Cannon/etc.); Minkowski-sum boolean.

---

### Bottom line

**NET-NEW MATH/QC items = [**
  (1) mesh volume/area/centroid QC metrics — **ADOPT-pure-JS**;
  (2) rotation-minimizing/corrected-Frenet sweep frame — **ADOPT-pure-JS (refine B51)**;
  (3) convex-hull envelope — **ADOPT-pure-JS (narrow)** / Minkowski-sum — **SKIP-heavy**;
  (4) deviation-controlled tessellation QC — **BORROW-concept (refine delta 7)**;
  (5) voxel-occupancy free-space search — **BORROW-concept (placement, refine delta 3)**;
  (6) router cost obstacle/space/pressure-loss terms — **BORROW-concept (refine delta 3)**;
  (7) octree broad-phase — **BORROW-concept (LOW/redundant)**;
  (8) PMI/GD&T tolerances → Monte-Carlo — **NET-NEW-link, N/A now**
**]**

Everything else in the three docs (spatial graphs, BIM semantics, ports, LOD, instancing, coordinate frames,
octant addressing math, AABB/OBB/BVH broad→narrow clash, A* routing, CSG booleans, TubeGeometry/ExtrudeGeometry,
B-Rep dual representation) is **already covered** by deltas 1/3/5/6/7 or blocks B45-B51. **No physics-engine
collision method is present in any doc** — our BVH clash approach is unchallenged and correct for the kit's
constraints. Only items (1) and (2) are strong enough to warrant near-term action; the rest are refinements or
feature-gated concepts.
