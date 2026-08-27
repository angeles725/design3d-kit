# investigacion.md — Structured Findings Digest

Source: `/mnt/c/Users/equipo/Downloads/investigacion.md` (8110 lines, Spanish).
The file is a transcript of several near-identical research conversations (the same three prompts recur ~4 times each) about building serious 3D design tooling in Three.js for **HVAC / MEP / mechanical-room CAD**, driven by a single natural-language prompt. The user's recurring ideas: (a) a "voxel/blockout first, realistic later" pipeline; (b) a **3-review loop, minimum score 8/10**, and if it fails 3 times keep the best and explain why; (c) worry that LLMs lose XYZ orientation and stack objects on the same coordinate. The assistant answers converge on one architecture repeated with growing detail.

This digest is organized by the six requested sections. Line citations point to the source file.

---

## 1. Repository Catalog

### 1.1 Star-rating tables (verbatim as data)

**TABLE A — "3D design in Three.js" (lines 5–14)**

| Repositorio | ⭐ aprox. | Para qué sirve | Para tu caso |
|---|---|---|---|
| Three.js | 114k+ | Motor 3D principal + editor oficial | ⭐⭐⭐⭐⭐ |
| React Three Fiber | 31k+ | Three.js organizado con React | ⭐⭐⭐⭐⭐ |
| Theatre.js | 12.5k | Editor visual + animaciones | ⭐⭐⭐⭐ |
| Drei | 9.7k | Componentes/herramientas para R3F | ⭐⭐⭐⭐⭐ |
| three-mesh-bvh | 3.4k | Colisiones, selección y rendimiento | ⭐⭐⭐⭐⭐ |
| Triplex | 1.3k | Editor visual de escenas R3F | ⭐⭐⭐⭐⭐ |
| three-bvh-csg | 934 | Cortar/unir geometrías tipo CAD | ⭐⭐⭐⭐⭐ |
| PolygonJS | 806 | Editor 3D visual basado en nodos | ⭐⭐⭐⭐ |
| That Open Components | 689 | BIM/IFC + Three.js | ⭐⭐⭐⭐⭐ para edificios |

**TABLE B — "levantar un CAD 3D en Three.js" (lines 2623–2634)**

| Repositorio | ⭐ aprox. | Tecnología | Para qué te sirve |
|---|---|---|---|
| Three.js | 113k | Three.js | Motor 3D base |
| React Three Fiber | 31.1k | React + Three.js | Arquitectura/UI de app 3D grande |
| Pascal Editor | 21.6k | R3F + Three.js + WebGPU | ⭐ Excelente base para CAD/BIM |
| Chili3D | 4.6k | Three.js + OpenCascade WASM | ⭐ CAD real en navegador |
| three-mesh-bvh | 3.4k | Three.js | Selección, raycast, colisiones rápidas |
| JSCAD | 3.2k | JS + CSG | Geometría paramétrica |
| CascadeStudio | 1.4k | Three.js + OpenCascade | CAD paramétrico completo |
| three-bvh-csg | ~934 | Three.js | Cortes, uniones, booleanos 3D |
| ThatOpen Components | ~689 | Three.js + BIM/IFC | BIM, IFC, planos, dimensiones |
| Replicad | ~660 | OpenCascade + JS | CAD paramétrico por código |
| three.cad | ~355 | React + Three.js + WASM | CAD directamente sobre Three.js |

**TABLE C — "levantar un CAD 3D" (broader, lines 5935–5945)**

| Repositorio | ⭐ aprox. | Tecnología | ¿CAD real? | Lo usaría para |
|---|---|---|---|---|
| Pascal Editor | 21.6k | Three.js / R3F / WebGPU | ✅ | Arquitectura, edificios, BIM, editor 3D |
| FreeCAD | 31.5k | C++ / Python / OpenCascade | ✅✅ | Referencia de CAD profesional |
| OpenSCAD | 9.9k | C++ / OpenGL | ✅ | CAD paramétrico por código |
| CADAM | ~5k | Three.js / R3F / OpenSCAD WASM | ✅ | CAD web + IA |
| Chili3D | 4.6k | Three.js / TS / OpenCascade WASM | ✅✅ | CAD web estilo SolidWorks |
| Online3DViewer | 3.6k | Three.js | ⚠️ Viewer | STEP/IFC/IGES/3DM/FCStd |
| OpenJSCAD | 3.2k | JavaScript | ✅ | CAD paramétrico web |
| Dune3D | 2k | C / OpenCascade | ✅✅ | CAD paramétrico tradicional |
| CascadeStudio | 1.4k | Three.js / OpenCascade.js | ✅✅ | CAD web programable |
| xeokit | ~900 | WebGL | ⚠️ BIM | IFC/BIM edificios |

### 1.2 Per-repo detail and assigned verdict

**Core rendering / app framework**
- **mrdoob/three.js** (~113–114k) — base 3D engine; ships an official visual editor. Provides TubeGeometry, ExtrudeGeometry, CatmullRomCurve3, PBR, WebGPU, InstancedMesh, LOD, Box3, OBB, Matrix4. Verdict: mandatory engine, but "Three.js ≠ CAD kernel" (lines 6157–6185); do not build a CAD on Three.js alone.
- **pmndrs/react-three-fiber** (~31k) — Three.js as React components. Verdict: "probablemente el que yo utilizaría para hacer tu aplicación 3D completa" (line 39); recommended app architecture; already used in CAD/floor-planner/configurator projects.
- **pmndrs/drei** (~9.7k) — ready-made R3F components (OrbitControls, Environment/HDRI, loaders, labels, gizmos, TransformControls, instancing, HTML-in-3D). Verdict: "casi obligatorio junto con R3F" (line 77); excellent for a 3D BMS. Note `Environment` places HDRI cubemaps into scene.environment (line 3557).
- **theatre-js/theatre** (12.5k) — visual motion/animation editor for Three.js/R3F. Verdict: ⭐⭐⭐⭐; animate flow, valves, fans, equipment explosions (lines 61–73).
- **pmndrs/triplex** (1.3k) — visual editor for R3F integrated with VS Code; keeps project as code. Verdict: "de los que primero probaría" — Unity/Blender ↔ code (lines 115–137).
- **polygonjs/polygonjs** (806) — node-based visual 3D editor around Three.js (Houdini-for-WebGL); procedural geometry, GLSL, visual programming. Verdict: great to study how to build an industrial 3D editor (lines 172–198).

**Performance / geometry / CAD-style ops**
- **gkjohnson/three-mesh-bvh** (~3.4k) — Bounding Volume Hierarchy for Three.js; accelerates raycasting and spatial queries. Cited repeatedly: 500 rays on an 80,000-poly model at 60 FPS (lines 2836, 4201, 7083); now has **ObjectBVH** for scene-wide/object-hierarchy queries; queries `intersectsGeometry`, `intersectsBox`, `closestPointToGeometry`, `bvhcast`, `shapecast` (lines 2263, 5548–5556). Verdict: near-mandatory for large industrial scenes — selection, snapping, clash detection.
- **gkjohnson/three-bvh-csg** (~934) — CSG (union/subtract/intersect) built on three-mesh-bvh. Verdict: technically very important for CAD — penetrations, cabinets, holes for pipes through walls (lines 139–170).
- **Pascal Editor** (`pascalorg/editor`, 21.6k) — React + R3F + Three.js + WebGPU + Zustand + three-bvh-csg. CAD/BIM hierarchy Site→Building→Level→Zone→Items; wall/slab/zone tools, select/move, plugins, Undo/Redo, parametric geometry. **Now ships an MCP server so AI agents can manipulate the scene** (lines 3305–3321); plugin architecture: schema + renderer + system + geometry + floorplan + placement tool + parametrics + MCP tool descriptions (lines 3741–3752). WebGPU renderer with SSGI, AO, GI, TRAA, outlines (line 3514). Verdict: **top pick to start from** — swap WallTool for PipeTool/DuctTool/ElbowTool/etc. Best starting point when CAD is building/BIM/MEP oriented.
- **Chili3D** (`xiangechen/chili3d`, 4.6k) — TS + Three.js + OpenCascade/OCCT WASM. STEP/IGES/BREP import-export, measurements, surfaces, solids, booleans, assemblies, workplanes, selection, undo/redo. Keeps an independent model/document + commands + transactions + serialization; OCC/WASM as ShapeFactory, Three.js only as viewport (line 6275). Verdict: **top pick for "real CAD"** / "AutoCAD 3D web".
- **CascadeStudio** (`zalo/CascadeStudio`, 1.4k) — OpenCascade.js + Three.js + Monaco; "Full Live-Scripted CAD Kernel in the Browser." Exposes Pipe, Sweep, Loft, Fillet, Chamfer, Union, Difference, STEP export (line 6313). **MIT license, flagged as important for commercialization** (line 2750). Verdict: cleanest reference for Three.js + OpenCascade WASM.
- **CADAM** (`Adam-CAD/CADAM`, ~5k) — React 19 + TS + Three.js + R3F + OpenSCAD WASM + Supabase + AI. Verdict: interesting for AI-driven CAD editing.
- **FreeCAD** (`FreeCAD/FreeCAD`, 31.5k) — C++/Python + OpenCascade. Verdict: don't port to web; study its architecture (workbenches, object tree, constraints, sketches, BIM).
- **OpenSCAD** (9.9k) — code→parametric CAD. Verdict: good for auto-generating parts; not for a visual editor.
- **OpenJSCAD / JSCAD** (`jscad/OpenJSCAD.org`, 3.2k) — parametric 2D/3D in JS with CSG; DXF/STL/OBJ/SVG/3MF. Verdict: fits a parametric HVAC library well; good before reaching OpenCascade.
- **Dune3D** (2k, C/OpenCascade) — traditional parametric CAD. Listed ✅✅ real CAD.
- **Replicad** (~660, OpenCascade + JS) — CAD library to build your own editor/configurator; Three.js integration helpers; STEP export path (lines 3486, 3834). Verdict: use for BREP + STEP.
- **three.cad** (~355) — React + Three.js + WASM CAD. Listed only.
- **Online3DViewer** (`kovacsv/Online3DViewer`, 3.6k) — Three.js viewer reading 3DM/3DS/3MF/BIM/BREP/FBX/FCSTD/GLTF/IFC/IGES/STEP/STL/OBJ/PLY. Verdict: not the editor core, but **copy its import system** (lines 6114–6137).
- **xeokit/xeokit-sdk** (~900) — WebGL AEC/BIM/IFC, large models, point clouds. Verdict: for handling existing BIM, not creating geometry.
- **ThatOpen/engine_components** ("That Open Components", ~689) + **web-ifc** (~1k) — BIM tools on Three.js: dimensions, floor navigation, postprocessing, DXF, IFC read/write. Verdict: ⭐⭐⭐⭐⭐ for buildings; enables REVIT→IFC→That Open→Three.js→BMS/Niagara/BACnet chain (lines 200–222). IfcPipeSegment / IfcPipeFitting / IfcDuctSegment / IfcDistributionPort mapping (line 6315).

**BIM / interop concepts** — IFC element types (IfcPipeSegment, IfcPipeFitting, IfcDuctSegment, IfcDistributionPort for connectivity/flow direction, buildingSMART) at lines 6315–6331; **BIMForum LOD spec** — mixed levels of development can coexist in one phase, which legitimizes the "simple + detailed objects together" idea (lines 6405, 6222 grayboxing/blockout per Epic).

### 1.3 The recommended "first to clone" shortlists
- 3D-design shortlist (line 282): 1) Three.js 2) R3F 3) Drei 4) Triplex 5) three-bvh-csg + three-mesh-bvh.
- CAD shortlist (line 2991): 1) Pascal Editor 2) Chili3D 3) CascadeStudio 4) three-mesh-bvh 5) ThatOpen 6) three-bvh-csg.
- CAD top-3 to study (line 6212): Pascal Editor (UI/architecture), Chili3D (real CAD kernel), CascadeStudio (clean Three.js+OpenCascade).

---

## 2. Architecture Ideas

The document's central proposal is a **spec-first, gated, multi-stage pipeline** where the LLM never owns geometry or space; deterministic engines do. It recurs with escalating detail. Canonical full form at lines 4753–4833 and 8056–8110.

### 2.1 The pipeline (single prompt → 6–8 hidden stages)
`Prompt → LLM/Reasoning Planner → Scene Semantic JSON (SceneSpec / MEP graph) → Constraint Graph → Three.js VOXEL/BLOCKOUT → Mathematical analysis + Spatial validation → Hybrid optimizer → Realistic pass (Blender/PBR) → Multi-view render → Reviewer/score → (≤3 repair cycles) → GLB/glTF → Three.js → Digital Twin/BMS` (lines 306–354, 855–910, 1525–1633, 3347–3426).
Key framing: from outside it still feels like **"one prompt"**; the stages run automatically behind it (line 926).

### 2.2 Voxel/blockout as reasoning substrate (NOT throwaway art)
- User's "voxelart" = professional **blockout / whitebox / proxy geometry** (line 300); Epic's grayboxing described (line 6222); BIMForum LOD supports mixed detail (line 6405).
- **The key reframe (repeated)**: the voxel is not the graphical output; it is the **intermediate reasoning representation** and the **spatial memory** (lines 3053, 3846, 7162). "El voxel ya no sería un prototipo desechable. Sería una interfaz para dibujar el CAD" (line 6449).
- **Dual representation**: store *intention*, not cubes — a run of voxels becomes `{SYSTEM, TYPE, FROM, TO, DIAMETER, SEGMENT, ELBOW angle}` (lines 6226–6250). Two views of the same parametric model: Blockout (Three.js voxels, fast) ⇄ CAD real (OpenCascade pipes/elbows/tees) (lines 6252–6273). Modes: `[BLOCK] ⇄ [CAD] ⇄ [REALISTIC]` without rebuilding.
- **World vs voxel coordinates kept simultaneously**: `Vx = round(X/voxelSize)`, `X = Vx·voxelSize`; voxelSize 250–500 mm (lines 3962–3980).
- **Vectorization, not marching cubes**, for HVAC: recognize voxel runs → centerlines; corner → elbow (arc of defined radius); split → tee; resize → reducer (lines 3202–3301, 3900–3903). Marching Cubes rejected for pipes.

### 2.3 Parametric geometry over AI-generated meshes
- Pipes/elbows/tees/reducers/headers/ducts/transitions/supports = **generated mathematically** so DN150 = DN150 exactly, not "approximately 6 inches" (lines 693–715). Real elbow = circular arc `x²+y²=r²`, radius e.g. 1.5D — never an AI curve (lines 1077–1093). Distinction: **HVAC elbow → exact geometric arc; cable/hose → cubic spline** (lines 1116–1122, 4139–4147).
- Three.js primitives cited: TubeGeometry, ExtrudeGeometry, CatmullRomCurve3, CubicBezierCurve3, quadratic/cubic Bézier, CylinderGeometry for pipe (line 3476).
- **Matrices/instancing**: one `Valve.glb` + different Matrix4 transforms + InstancedMesh instead of 500 valve models (lines 4004–4032); reduces draw calls for 100 supports / 300 bolts / etc.

### 2.4 CAD kernel / BREP / STEP
- Three.js is triangles, not a kernel; for real solids use **OpenCascade (OCCT) via WASM** — Chili3D, CascadeStudio, Replicad (lines 2710, 5970, 6172). Ops: Extrude, Boolean, Fillet, Chamfer, face/edge selection, sketches, BREP; import/export STEP/IGES/BREP.
- OpenCascade B-spline/NURBS: degree, control points, weights, knots, and **D1/D2/D3 derivatives** (tangent/curvature/continuity) — used to know whether a joint is truly continuous C0/C1/C2/C3 vs two meshes touching (lines 4131, 6769–6776).
- CSG (three-bvh-csg) for penetrations/holes/connections.

### 2.5 Spatial World Model — the "AI must not own space" thesis
Most-developed idea (lines 1690–2615, 4889–5927, 7183–8110). The LLM proposes intent; a deterministic **Spatial Engine** decides placement.
- **Four simultaneous representations of the same space** (line 1737): continuous XYZ (precision) + bounding boxes/volume (occupancy) + voxel occupancy map (free space, fast) + scene graph (meaning/relations). Later expanded to **three spatial memories**: Scene Graph ("what") + Voxel/Octree occupancy ("what space") + BVH ("geometry/collision") (lines 7439–7556).
- **Single fixed world coordinate system**, never changed; units never mixed (**Three.js = meters, CAD data = integer millimeters**, lines 5390–5403). Axis convention declared day one (X E/W, Y up per Three.js, or Z-up per CAD/OpenUSD — with a transform layer between CAD and renderer, lines 7238–7278).
- **World vs local never mixed** — `getWorldPosition()`, `localToWorld()`, `worldToLocal()`, `matrixWorld`; SpatialDatabase = WORLD COORDINATES ONLY (lines 5318–5367, 7280–7314). Mixing them makes the AI "look like it lost orientation."
- **Objects are volumes, not points**: each carries center + size + AABB + rotation(quaternion) + clearance{front/back/left/right/top} + ports{worldPosition,direction} + occupiedVoxels (lines 1823–1834, 4944–4973, 7326–7360). Two boxes at (5,0,3) and (5.5,0,3) still collide if each is 1.2 m wide (lines 4997–5009).
- **Physical volume vs clearance/service volume** — a pipe can miss the chiller physically yet block maintenance → invalid. Condition: `O_i ∩ O_j = ∅` AND `C_i ∩ O_j = ∅` (lines 1851–1889, 5585–5629, 7856–7902).
- **Hierarchical coordinate frames** (ROS **tf2**-style tree) so moving a chiller moves its ports/sensors/anchors automatically via matrix (lines 2008–2062, 7688–7724).
- **Relative + sequential placement** (ImperativeScene-style): place CH-01, then P1 relative to CH-01, P2 relative to P1... instead of independent random XYZ (lines 2169–2209). Reduces spatial chaos.
- **High-level placement API instead of `position.set()`**: `placeNextTo`, `placeInFrontOf`, `placeBetween`, `placeAligned`, `placeAtClearance`, `connectPorts`, `routePipe`, `findFreeSpace`, `moveUntilCollisionFree` (lines 2134–2167). "AI never calls `mesh.position.set()` directly" (lines 2126, 7622).
- **Placement as a DB transaction**: PROPOSE → compute AABB/OBB → clearance → query occupancy → query BVH → constraint check → COLLISION=reject / FREE=commit → update world (lines 2211–2242, 5156–5187). Prevents "all at 0,0,0."
- **Spatial reservations / locks** for multi-agent (Architect/HVAC/Piping/Electrical/Structural agents) (lines 5818–5854, 7818–7854).
- **Snapshot after every move** — the engine measures nearest objects, distances, directions, collisions, clearance violations, free neighbor cells, and returns it; plus a mini top/side ASCII map, so "the model has spatial perception because we just measured it for it" (lines 2273–2380).
- **Broad-phase → narrow-phase** cascade: Voxel/spatial hash (10k→10 candidates) → AABB (Box3.intersectsBox) → OBB (rotated) → BVH (exact) (lines 5519–5583, 7519–7556). Optionally **Rapier** collision world (broad+narrow, `intersectionsWithShape`) without full physics (lines 7558–7608).
- **Contact ≠ collision**: declared `allowedContact` (pipe end ↔ valve port) is legal; undeclared intersection = ILLEGAL_COLLISION (lines 2491–2524).
- **Hard rules the AI cannot break** (RULE 001–010): no two physical volumes overlap; unique IDs; every object has dimensions; no placement without validation; world coords authoritative; MEP connections via defined ports; clearance respected; every pipe/duct has a continuous path; every occupied voxel belongs to an object; DB updates after every commit (lines 5749–5787).
- **"Give the AI senses"** analogy: EYES=Raycast/BVH, TOUCH=Collision/Rapier, MAP=Octree/Voxel → Scene Graph → Agent; query verbs `LOOK_AT`, `WHAT_IS_HERE`, `DISTANCE_TO`, `NEAREST_OBJECT`, `IS_SPACE_FREE`, `OBJECTS_WITHIN`, `CAN_PLACE`, `FIND_FREE_SPACE`, `PATH_FREE`, `WHAT_IS_ABOVE/BELOW`, `CONNECTED_TO` (lines 7991–8040).
- Ports / **Spatial Anchors**: chiller has CHWS_OUT/CHWR_IN local positions → transformed to world; AI says `connect(CH01.CHWS_OUT, HEADER01.INPUT03)` not "approximately here" (lines 5405–5444, 7351).

### 2.6 Routing & optimization architecture
- **Occupancy grid → A\*** pathfinding; cells coded 0 free / 1 wall / 2 equipment / 3 duct / 4 pipe / 5 clearance / 6 structure; orthogonal path then converted to pipe + real elbows (lines 1204–1246, 3148–3200).
- **Hybrid optimizer**: **CP-SAT (Google OR-Tools)** for discrete choices (left/right, pump model, route A/B/C, number of elbows, pipe level) + **SciPy/Ceres** for continuous (x,y,z,rotation,radius,control points) (lines 1166–1201, 4271–4296).
- **Cost function** `J(X) = w1·collision + w2·connection + w3·clearance + w4·pipeLength + w5·alignment + w6·layout + w7·visual`, minimize (lines 1136–1144). A\* cost modified: `C = wL·L + wB·bends + wV·verticalChanges + wC·clearance + wP·proximity` — 19 m/3 elbows beats 18 m/8 elbows (lines 4237–4269).
- **Multi-objective**: minimize length/cost/bends/interference, maximize accessibility; **Optuna** (NSGA-II/III, TPE, GP) named as the concept, not necessarily production (lines 4297–4335). Candidate generation → cheap voxel scoring → only top candidates promoted to real CAD (lines 4836–4865).
- **Least-squares connection fitting**: `E_connection = ‖P_pipe − P_port‖² → 0`, solved by Ceres/SciPy (nonlinear LS, robust loss) to snap 87 mm gap → 0.3 mm (lines 1044–1076).

### 2.7 Rendering / performance architecture
- **Two render modes**: CAD mode (few effects, max FPS) vs Presentation mode (AO, shadows, reflections, postprocessing) (lines 4737–4751).
- **WebGPURenderer** as next-gen renderer, auto-fallback to WebGL2; new postprocessing pipeline combines effects to cut render passes (lines 4729–4734).
- Perf toolkit: **InstancedMesh** (draw-call reduction), **LOD** (native), **frustum culling**, **Meshopt/Draco** geometry compression, **KTX2/Basis** texture compression via GLTFLoader, **MeshPhysicalMaterial** (anisotropy/clearcoat/transmission/iridescence/sheen) + HDRI env map (lines 1500–1522, 3520–3555, 4610–4658).
- **Asset optimization chain**: GLB → dedup → weld → prune → simplify → meshopt → KTX2 → final GLB, via **glTF Transform** (~1.9k) and **meshoptimizer** (~8.3k, simplify within max geometric error). Principle: "min polygons + min visual error = quality", not "more polygons = quality" (lines 4660–4694, 7096–7118).
- Three.js renderer stats (draw calls, triangles, memory) used to measure, not guess, performance (line 4612).

---

## 3. AI 3D Generation

The consistent stance: **use generative 3D only for special equipment/props, never for engineered MEP geometry.**

- **Three generation tiers** (lines 693–751): **A — procedural geometry** (pipes, elbows, tees, reducers, headers, ducts, transitions, simple supports, trays — mathematically exact); **B — real GLB library** (pumps, chillers, AHU, VFD, panels, sensors, valves, motors — e.g. `pump_horizontal_01.glb`, `butterfly_valve_DN150.glb`, `chiller_400tr.glb`; the agent only scales/places); **C — generative AI** only where no model exists (special equipment, decoration, architecture, props, complex structures).
- **TRELLIS** (Microsoft, ~13.4k ⭐) — structured 3D generation incl. text-to-3D (line 3639). Verdict: use for chiller/AHU/condenser/cooling-tower/compressor/cabinet/motor via Image/Prompt → TRELLIS → GLB → Three.js; **NOT** for pipes/elbows/valves which must stay parametric+deterministic+dimensional (lines 3596–3639).
- **TRELLIS.2** — uses an internal sparse voxel representation called **O-Voxel** before producing the final high-quality PBR mesh (base color, roughness, metallic, opacity); Microsoft claims O-Voxel → textured mesh in <100 ms on reference CUDA hardware (lines 3007, 3559–3594). Cited as validation that "structure first, pretty later / voxelized representations" is the modern approach — matches the user's voxel idea.
- **Blender MCP** — can create/modify shapes, read the scene, run Python in Blender, apply materials, pull assets from **Poly Haven / Sketchfab**, and generate models via **Hyper3D Rodin** and **Hunyuan3D**; docs show "get current scene info and create a Three.js sketch" as a use case (lines 652–664, 750). Used for the realistic pass and to integrate generated special assets.
- **Hyper3D Rodin** and **Hunyuan3D** — image/text-to-3D generators reached through Blender MCP for tier-C assets (lines 656, 750, 922). Explicit caution: "no quiero que Hunyuan3D genere todo" (line 689).
- **Reference research systems the pipeline imitates** (mostly GitHub-mentioned, no stars given):
  - **Compos3D** — produces an intermediate **SceneProgram** (JSON: rooms/objects/positions/dimensions/constraints/relations) then renders via Blender/Infinigen; "much more solid than asking an AI for a pretty room" (lines 358–401).
  - **Code-as-Room** — explicit staging: semantics/relations → layout → detailed geometry → materials/textures/lighting; replaces simple primitives with detailed composite geometry later (lines 402–427).
  - **SceneGenAgent** — industrial scenes; structured/computable representation, position assignment, positional-error detection, iterative refinement; **~81% success** on its industrial benchmark; task decomposition `retrieve_objects / extract_layout / assign_placement / check_positional_error / fix_positional_error / generate_code / fix_code` (lines 500–512, 933–935, 2382–2402). Recommendation: go further and take `check_positional_error` away from the LLM (line 2404).
  - **SCRIPT3D** — pipeline `prompt → agent plan → structured commands → Python generation → Blender asset → scene index → render → visual verification → iterative correction`; visual agent checks prompt satisfaction, object presence, spatial relations, wrong overlaps, physical plausibility, render quality (lines 756–777, 1436).
  - **NVIDIA SAGE** (2026) — combines LLM + VLM + 3D generation + material generation + scene-layout solvers + simulation; backend explicitly separates foundation models, asset generation, materials, layout solvers (lines 806–839). Cited as proof modern systems separate asset generation from layout solving.
  - **WorldGen** — text→scene, can return mesh; strength is navigable visual worlds, **not** guaranteeing engineering diameters/relations → NOT recommended as HVAC core (lines 911–913).
  - **SpatialGrammar** (Apr 2026) — raw coordinates + verbose code are hard for LLMs → uses BEV-grid placement + a deterministic compiler to valid 3D geometry, with a closed agent loop correcting collisions from compiler feedback (lines 1943–1957). Strong support for voxel→validate→real.
  - **ImperativeScene** — LLMs have weak spatial skills / numeric-parameter errors → represent scenes programmatically, fix errors in program space, place objects sequentially with each new object depending on previously placed ones (lines 2169–2209).
  - **Goxel** (~3.2k ⭐) — voxel editor with procedural work and Marching Cubes; recommended to study the blockout stage (line 3146).
  - Spatial-reasoning research (for grounding, §5): **3DSRBench** (ICCV 2025 — MLLM limits on height/orientation/position), **3DGraphLLM** (3D scene graph as LLM representation improves spatial tasks), **Open3DVQA** (models do better on relative than absolute relations), **SpatialRGPT** / **SpatialLLM** (LLMs struggle to use raw 3D coords; adding 3D/scene-graph/depth helps), a 2025 agentic-3D work using a **scene hypergraph** (clearance/contact/alignment/symmetry/equidistance hyperedges) (lines 1751, 2098–2122, 4897, 5241, 7473, 8050).

---

## 4. Decision Framework / Scoring

The user's rule ("3 reviews, minimum 8, else keep best + explain why") is formalized repeatedly into an **auditable, weighted, hard-gated rubric**.

### 4.1 Weighted rubrics (three variants appear)
- **Variant 1 (line 1442)**: Geometry/dimensions 25%, Connectivity/engineering 20%, Layout/space/collisions 15%, Visual realism 15%, Prompt fidelity 10%, Web/FPS 10%, Topology/cleanliness 5%.
  `Q = 0.25G + 0.20C + 0.15L + 0.15V + 0.10F + 0.10P + 0.05T`, require `Q ≥ 8.0`.
- **Variant 2 (line 4528)**: Engineering/geometry 25%, Routing/efficiency 20%, No-interference 20%, Visual 15%, Three.js performance 10%, Order/maintainability 10%.
  `Q = 0.25E + 0.20R + 0.20C + 0.15V + 0.10P + 0.10M`.
- **Variant 3 (line 6939)**: Geometric precision 25%, Engineering/connections 20%, Visual 20%, Performance 20%, Topology 10%, Metadata 5%.
  `Score = 0.25G + 0.20I + 0.20V + 0.20P + 0.10T + 0.05M`.
- **Spatial-focused rubric (line 7912)**: Collisions 25%, Clearances 20%, Coordinates/frames 15%, Connectivity 15%, Orientations 10%, Routing 10%, Duplicates/overlap 5%.

### 4.2 Hard fails (the key rule beyond the weighted average)
A beautiful scene with a disconnected pipe is worthless. Critical categories must **each** clear 8 regardless of the weighted average (lines 1459–1483): `Geometry ≥ 8, Connectivity ≥ 8, Collision ≥ 8`, and Spatial ≥ 8 (line 2483). Binary hard-fail conditions that cap the score:
`CriticalClashes = 0, DisconnectedPipes = 0, InvalidGeometry = 0, OutOfBounds = 0` — if any fails, **Q_max = 7.9** even if visually spectacular (lines 4557–4586, 7923–7939, 2487–2490 add `duplicate placements = 0, critical clearance violations = 0`).

### 4.3 Statistical / multi-view scoring
- Render from many cameras (front/back/left/right/top/iso1/iso2/walking) → per-view scores `s_i` → `μ = mean(s)`, `σ = std(s)`; **`Score_visual = μ − λσ`** (λ≈0.5) penalizes inconsistency so one pretty photo can't earn a 9 (lines 1288–1322, 4384–4432, 5679–5701). Multi-view chosen because benchmarks show models drop on viewpoint change.
- **Image/geometry comparison metrics**: LPIPS (perceptual, usable as loss), Chamfer Distance (PyTorch3D), ICP (Open3D) for real scan/point cloud alignment, **Hausdorff Distance** (Autodesk uses it for mesh comparison; compare voxel/reference vs CAD, or original vs optimized → max/mean deviation in mm), plus Normal Consistency, F-score, triangle quality, open edges, non-manifold vertices (lines 1324–1350, 6897–6931).
- **Monte Carlo tolerance analysis**: model install ±20 mm / equipment ±10 mm / structure ±15 mm; 10,000 sims → interference probability (e.g. 1.6%) → "22 mm nominal, 1.6% risk → too tight" (lines 6851–6895).
- Render-quality split: `Q_render = 0.55·Q_visual + 0.45·Q_performance` with mandatory limits (Desktop target FPS ≥ 55, P95 frame ≤ 22 ms, critical visual errors = 0) (lines 4695–4727).

### 4.4 The 3-review loop (formalized)
- **Keep BEST, not last**: `BEST = max(Q1,Q2,Q3)` because a correction can make things worse (R1 7.1 → R2 7.8 → R3 7.5 ⇒ return R2) (lines 1351–1358, 4434–4460).
- **Never accept an improvement that badly worsens another category** — constrained optimization; e.g. Visual 8.1→9.5 but Performance 7.2→4.1 ⇒ REJECT (lines 7053–7075).
- **ΔScore / diminishing returns**: `ΔQ = Q_n − Q_{n−1}`; if the 3rd cycle yields +0.04 the system says it stopped for review limit + low expected benefit (lines 4588–4608).
- **Final failure report** must be reproducible and auditable: state best score, chosen revision, per-category scores, remaining problems, and *why* it couldn't reach 8 (e.g. "physical space prevents 600 mm clearance", "CH-02 position is fixed", "a 4th optimization has low expected benefit") (lines 1650–1675, 4499–4527, 6953–7005).
- Conceptual backing: **Self-Refine** (generate→critique→refine beats single-pass), **SCRIPT3D** (render→visual-verify→iterative correction), **PDCA / ISO** continuous-improvement cycle (lines 1434–1436, 6484).

---

## 5. Actionable Recommendations for a Skill/Kit

Distilled build guidance (explicit and implicit) for a good prompt-to-3D HVAC/MEP tool:

1. **Spec-first**: LLM emits an intermediate structured artifact (SceneSpec / SceneProgram / MEP graph JSON) BEFORE any geometry; that JSON is the single source of truth (lines 358–401, 3063–3095, 3361). Mirrors Compos3D SceneProgram, SceneGenAgent structured representation.
2. **Gated passes with preservation between them**: Blockout → validate → realistic. When going realistic, instruct: "Preserve exactly transforms, bounding boxes, ports, diameters, centerlines and relations. Only substitute proxy geometry for high-def assets" — never let the realistic model re-derive positions (lines 612–652). This is the anti-drift rule.
3. **Voxel as reasoning + spatial memory, not output**: keep both a visual blockout and an occupancy grid; store intention (path/params) so voxel⇄CAD⇄realistic switch without rebuild (lines 6423–6449, 7162).
4. **Deterministic geometry for MEP; generative only for tier-C assets**: procedural (exact DN, real elbow arcs) → GLB library → AI generation (lines 693–751). Never generate pipes/valves with AI.
5. **Catalog-first / library sourcing**: real GLBs for pumps/chillers/AHU/valves; agent only scales+places via matrices+InstancedMesh (lines 716–738, 4004–4032).
6. **Take space away from the LLM (Spatial Engine)**: high-level placement verbs + query API; transaction/commit + reservation; snapshot after every op; hard rules engine denies illegal placements (§2.5). This is presented as *the* highest-impact improvement (lines 4891, 5927, 8105).
7. **Coordinate discipline**: one fixed world frame; meters in renderer / integer mm in CAD, never mixed; world-only spatial DB; hierarchical frames (tf2-style); quaternions for rotation (avoid gimbal lock); ports as spatial anchors (lines 5359–5444, 7234–7360, 7726–7762).
8. **Two-level collision + clearance ≠ collision**: voxel broad-phase → AABB/OBB → BVH narrow-phase; physical vs service volumes; declared allowedContact for legitimate joins (§2.5).
9. **Optimization stage**: A\* on occupancy grid for routing, CP-SAT (OR-Tools) for discrete layout, SciPy/Ceres for continuous fitting, multi-objective cost with weights; generate many candidates, cheap-score in voxel, promote only the best to real CAD (§2.6).
10. **Provenance / structured metadata per element**: id, type, system, path[], dimensions, connections[], material, metadata; pipes carry Diameter/Schedule/Elevation/System/Material/Insulation/From/To; ducts carry Width/Height/Length/Elevation/Insulation/Material/System/Flow (lines 2966–2991, 6339–6367). Map to IFC (IfcPipeSegment/Fitting/DuctSegment/DistributionPort) for real connectivity.
11. **Deterministic vs AI split in the reviewer**: geometry/dimensions/connectivity/collision/performance judged by deterministic math/graph/profiler; only visual quality + prompt fidelity judged by a VLM (lines 1589–1599). Never let the AI have the last word on geometry: "AI proposes and critiques; math measures; optimizer corrects; renderer shows; reviewer scores" (lines 1636–1648).
12. **Multi-view + statistical scoring** with μ−λσ, hard fails, ΔScore, best-of-3, and an auditable failure explanation (§4). Capture should be deterministic multi-camera (fixed camera set) so scores are reproducible.
13. **Performance is part of quality**: 1.2M tri @ 60 FPS can beat 6M tri @ 30 FPS; measure via renderer.info; optimize with instancing/LOD/culling/meshopt/KTX2; run GLB through glTF Transform simplify-within-error (lines 1487–1522, 4610–4694).
14. **Two render modes** (CAD fast / Presentation pretty), WebGPU with WebGL2 fallback (§2.7).
15. **Show the stages to the user** (Layout → Routing → CAD → Realistic) as progressive feedback — good UX and matches the internal pipeline (lines 3673–3724).
16. **Licensing gate**: CascadeStudio's MIT license explicitly flagged as important if the HVAC tool becomes a commercial product (line 2750) — a signal to track licenses of reused meshes/kernels.

---

## 6. Open Questions / Gaps the Document Raises

- **Exact optimizer algorithms not finalized**: the doc ends stage one asking to "define which exact algorithms for the Optimizer — A\* for pipes, CP-SAT for layout, Ceres/SciPy for coordinates, BVH for collisions, a VLM as judge — and then land the real software architecture and repos to install" (lines 1683, 1685). This is left as the explicit next step.
- **Perf thresholds are placeholders**: FPS≥55, P95≤22 ms, etc. "No necesariamente esos números exactos desde el principio; los calibraría con proyectos reales" (line 4727).
- **Optuna in production undecided**: recommended as concept, "no necesariamente usaría Optuna en producción para todo" (line 4335).
- **Z-up vs Y-up unresolved**: proposes Z-up for the logical/CAD model (more intuitive for CAD/BIM, per OpenUSD) with a transform layer to Three.js's Y-up, but doesn't finalize (lines 7259–7278).
- **Voxel resolution not fixed**: 250 mm vs 500 mm "dependiendo del tamaño del proyecto" (lines 3103–3109).
- **Robust/stochastic routing only cross-domain evidence**: a maritime pipe-routing study reported up to 22% cost reduction by modeling uncertainty — "No es HVAC de edificios, pero demuestra que probabilidad y optimización robusta sí tienen aplicaciones reales" (line 4867). HVAC-specific validation is a gap.
- **Persistent spatial-reasoning gap acknowledged**: benchmarks still show a large model-vs-human gap that worsens with more objects / viewpoint changes; the doc's whole thesis is a workaround (external geometric memory), not a claim the gap is solved (lines 5701, 8042–8052). The conclusion is philosophical: don't fix it with prompts — "Tenemos que darle un mundo matemático consultable donde sea imposible olvidar que un espacio ya está ocupado" (line 8109).
- **Multi-agent locking sketched, not specified**: spatial reservations/locks for Architect/HVAC/Piping/Electrical/Structural agents are proposed but not detailed (lines 5818–5854).
- **Build-vs-fork not decided**: repeatedly leans toward starting from Pascal Editor or Chili3D rather than empty Three.js, but frames it as study/clone targets rather than a committed base.

---

### Cross-cutting one-line summary
Build a prompt-driven HVAC/MEP tool as a **spec-first, gated pipeline** where an LLM only writes a structured SceneSpec and issues high-level intents; a **deterministic Spatial World Model** (scene graph + voxel occupancy + BVH, world-mm coordinates, ports, physical+clearance volumes, transactional placement) owns all space; **parametric/procedural geometry + a catalog of real GLBs** build MEP exactly while generative 3D (TRELLIS/Hunyuan3D/Hyper3D via Blender MCP) is reserved for special assets; an **OpenCascade WASM kernel** (Chili3D/CascadeStudio/Replicad) provides real BREP/STEP; and an **auditable 3-review loop** with weighted rubric + hard fails + multi-view statistics + best-of-3 + written failure explanation gates quality — all visualized in Three.js/R3F (Pascal Editor as the editor base, three-mesh-bvh + three-bvh-csg for speed/CSG, glTF Transform/meshoptimizer for asset optimization).
