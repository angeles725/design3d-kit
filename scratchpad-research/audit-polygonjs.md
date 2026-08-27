# PolygonJS — strict code-level audit (for design3d-kit adoption)

**Audited clone:** `.../scratchpad/repos/polygonjs` (shallow, depth 1)
**Upstream:** https://github.com/polygonjs/polygonjs · npm `@polygonjs/polygonjs` v**1.5.98**
**Date:** 2026-08-26
**Method:** read `package.json`, `LICENSE`, `README.md`, `src/engine/**` (node/cook core, IO/JSON, scene loaders), `src/engine/nodes/sop/**` (349 nodes), `src/engine/operations/sop/**`, `src/core/geometry/modules/**`, plus GitHub REST for social/maintenance signals.

> Caveat: the clone is `git clone --depth 1` (`.git/shallow` present, `git rev-list --count HEAD` = 1, single commit `b95eb0f 2026-08-08 "readme update"`). Full git history was **not** available locally; maintenance signals below come from the in-repo README + GitHub API, not from a deep log.

---

## 1. What it actually is (from code)

PolygonJS v1 is a **Houdini-style node-graph 3D engine on top of three.js**, authored in TypeScript. It is a real engine, not a thin wrapper.

### Node graph + cooking + dependency graph
- A scene is a tree of **nodes** grouped by *context*. The contexts (from `README` and `src/engine/nodes/`): **OBJ, SOP** (procedural modelling — 349 node files), **MAT, COP** (textures), **ROP** (renderers), **POST** (post-proc), **CAM** (cameras, under SOP/OBJ), **EVENT, ANIM, AUDIO, GL** (GLSL shader graph), **JS** (object behaviour), **manager, utils**. This maps directly to the Houdini SOP/OBJ/COP/ROP mental model.
- **Node ≠ geometry logic.** Each SOP node is a thin param+IO wrapper (`src/engine/nodes/sop/*.ts`, `class extends TypedSopNode`) that delegates the actual computation to a **pure Operation** (`src/engine/operations/sop/*.ts`). Example: `Tube.ts` → `TubeSopOperation`; `Polywire.ts` → `PolywireSopOperation`; `Boolean.ts` → `BooleanSopOperation`. `cook(inputCoreGroups)` calls `operation.cook(inputs, params)` and returns a `CoreGroup`.
- **`CoreGroup`** (`src/core/geometry/Group.ts`) is the value that flows on wires: a wrapper around an array of `THREE.Object3D`. `coreGroup.threejsObjects()[0].geometry` is a plain **`THREE.BufferGeometry`**. This is the exact hook the README documents (`plane.compute()` → `container.coreContent()` → `.threejsObjects()`).
- **Dependency graph / dirty propagation** lives in `src/core/graph/CoreGraph` + `CoreGraphNode` (`dirtyController`, post-dirty hooks) and is scheduled by **`src/engine/scene/utils/Cooker.ts`** — a block/unblock queue that flushes dirty nodes. Compute is **pull-based and lazy**: `await node.compute()` cooks only what the requested node depends on; edits dirty downstream nodes. This is a genuine deterministic re-cook engine.

### Serialization: scene = JSON node graph — YES
- Full bidirectional JSON IO under `src/engine/io/json/{export,import}/` with **per-node exporters/importers** (`export/nodes/*`, `import/nodes/*`) and a scene root (`io/json/import/Scene.ts` → `SceneJsonImporter.loadData(data)`; `SceneJsonExporterData` type). A scene **is** a JSON object of nodes + params + connections. The README confirms the local editor "saves every file as text, either json or javascript" and is git-friendly.
- There is also a **manifest** format for production loading (`io/manifest/import/SceneData.ts` → `SceneDataManifestImporter`): a top-level JSON manifest (`properties`, `root`, `nodes`, `shaders`, `jsFunctionBodies`) that lazy-fetches per-node data + external `.glsl`/`.txt` bodies by timestamped URL. This is the shipped "load a saved scene" path.

### Headless (Node.js, no browser)?
**Partially / with effort — geometry cook does not require WebGL, but there is no first-class headless-server entry point.**
- `main` = `./dist/src/engine/index_all.js`. The dedicated data-loader entry `index_sceneDataLoader.ts` just re-exports `SceneDataManifestImporter`. There is **no `index_node.ts` / headless server bootstrap**; `index_self_contained_importer.ts` is entirely commented out and DOM-oriented (`document.addEventListener('DOMContentLoaded', …)`).
- `PolyScene` (`src/engine/scene/PolyScene.ts`, 488 lines) imports `Scene, WebGLRenderer, Raycaster` from three, but the **`WebGLRenderer` is only touched in `registerRenderer()`** (lazy, optional) and `WindowController` is lazily instantiated on first access (no `document`/`window` at construct time — grep found none in `WindowController.ts`). So `new PolyScene()` + `createNode('geo')` + `createNode('tube')` + `await node.compute()` → `BufferGeometry` is achievable **without a renderer or DOM**, exactly as the README's API example shows.
- The catch: the all-in node registration (`registerAll.ts`) pulls the **entire** node catalog, including COP (image/texture loaders), viewers, CSS renderers and other modules that reference `document`/`window` (grep hits in `io/player/*`, `scene/utils/actors/rayObjectIntersection/*`, `UniformsController.ts`). A clean Node cook therefore needs either selective SOP-only registration or a jsdom shim. The tests (`tests/`) run under **QUnit in a browser-style harness** (`tests/helpers/RendererUtils.ts`, `QUnit.ts`), not Node — so headless-in-Node is **not** an exercised, supported configuration.

**Bottom line:** the *architecture* supports a headless geometry cook (JSON graph → `BufferGeometry`), and one node's operation is a pure function of params+inputs. But shipping that as a Node.js service is a DIY integration, not a documented product mode.

---

## 2. License + maintenance signals

### License — **contradictory; must be resolved before any dependency**
- `LICENSE` file (repo root): **MIT**, "Copyright (c) 2019-2023 Guillaume Fradin". GitHub API also classifies the repo as `spdx_id: MIT`.
- `package.json` `"license"` field: **`"PolyForm Shield"`** — a *source-available, non-compete* license, NOT OSI-open, materially different from MIT.
- README adds a third signal: v1 editor is a **paid product** ("If you have purchased a license for Polygonjs v1 …"), and points new users at the closed **Polygon v2**.

These three disagree. The permissive reading (repo `LICENSE` = MIT, GitHub-detected MIT) governs the *source in this repo* and is Apache-2.0-compatible for our kit. But the `package.json` PolyForm-Shield declaration + paid-editor framing is a **real legal ambiguity**: do not vendor or ship any of it commercially without written clarification from the author. For *reading the code as a reference pattern*, MIT is sufficient.

### Maintenance — **maintenance mode, effectively EOL for v1**
- README top banner (the single recent commit, 2026-08-08): *"⚠️ This repository is in maintenance mode. Polygonjs v1 is no longer actively developed. It has been superseded by Polygon v2 … No new features … Only critical fixes, and even those are not guaranteed."*
- GitHub API (live): `stargazers_count: 811`, `forks_count: 69`, `open_issues: 11`, `subscribers: 18`, `created_at 2019-12-30`, `pushed_at 2026-08-08`, `archived: false`. Active codebase historically, but **frozen** now; v2 is closed-source/commercial.

---

## 3. Procedural-geometry relevance (HVAC/CAD mapping)

This is PolygonJS's strongest suit and the most relevant part for us. It ships **four independent geometry backends**, all wired as SOP nodes:

| Backend | Nodes (examples) | Vendored dep | HVAC/CAD relevance |
|---|---|---|---|
| **three.js mesh + BVH-CSG** | `Boolean` (SUBTRACT/UNION/INTERSECT via `Brush`+`Evaluator`), `Clip`, `Tube`, `Polywire` (tube around a line/curve), `Copy`/`Instance`/`InstancesCount` (instancing), `Extrude`(open edges), `Skin`, `Lattice`, `Fuse` | **three-bvh-csg 0.0.17** (vendored `src/core/thirdParty/three-bvh-csg.ts`) + three-mesh-bvh | Duct/pipe runs, penetrations/cutouts (boolean), flange instancing |
| **JSCAD 2D→3D CSG** | `CSGBoolean`, `CSGExtrudeLinear/Rectangular/Rotate`, `CSGTube`/`CSGTubeElliptic`, `CSGHull`, `CSGOffset`, `CSGProject`, primitives (`CSGCircle/Rectangle/Star/…`) | **@jscad/modeling 2.11.0** | Parametric profiles → sweep/extrude/revolve, rectangular duct sections |
| **OpenCascade BREP (real CAD kernel)** | `CADPipe` (sweep along spine), `CADLoft`, `CADRevolution`, `CADExtrude`, `CADFillet`, `CADThickness` (shell/wall), `CADBoolean`, `CADTube`, `CADExporterSTEP`/`CADFileSTEP` | **opencascade.js 2.0.0-beta** (custom OCCT wasm in `src/core/geometry/modules/cad/build/*.wasm`) | The closest to true mechanical CAD: solid pipes with wall thickness, fillets, **STEP import/export** interoperability |
| **SDF / Manifold** | `SDFBox/Tube/Extrude/Boolean` | **manifold-3d 3.1.1** (vendored `src/core/geometry/modules/sdf/manifold/`) | Robust watertight booleans, offset surfaces |

Answer to the specific questions:
- **Tube/sweep along a curve:** yes — `Polywire` (mesh tube around a polyline), `CADPipe` (BREP sweep along a spine curve), `CADTube`, plus `Tube` primitive.
- **Extrude / revolve / loft:** yes on every backend (`CSGExtrude*`, `CADExtrude/Revolution/Loft`, `QuadExtrude`, `ExtrudeOpenEdges`).
- **Boolean/CSG:** yes on all four; **it wraps `three-bvh-csg`** for mesh booleans (`operations/sop/Boolean.ts` imports `Brush, Evaluator, SUBTRACTION` from the vendored copy) **and also** has its own OCCT and Manifold boolean paths. It does not roll its own mesh-CSG.
- **Instancing / poly-modelling:** yes — `Instance`, `InstanceBuilder`, `Copy`, `Facet`, `Fuse`, `Lattice`, attribute nodes (`Attrib*`), scatter, adjacency, subdivision (`three-subdivide`).
- **Mesh IO:** exporters for GLTF/OBJ/PLY/STL/USDZ and importers for GLTF/OBJ/FBX/STL/SVG/3DS/PLY/… — useful for our external-mesh track.

For HVAC specifically, the OCCT (`CAD*`) family is uniquely valuable: it's the only backend here that produces true solids with wall thickness + STEP export, which is what real duct/pipe/equipment CAD needs.

---

## 4. Adoption fit for OUR kit

Our kit (SKILL.md / PIPELINE.md) is: **vanilla three.js / R3F, spec-first (no geometry before an approved DesignSpec), pass-locked gates, deterministic scripted-camera capture, tiny offline footprint, library of self-contained ES-module part builders.** Measured against that:

**Where it aligns strongly (concept-level):**
- **Serializable node-graph == machine-authorable DesignSpec that deterministically cooks to geometry.** This is a direct, working proof of our own thesis: a JSON graph (nodes + params + wires) that a deterministic engine cooks to `BufferGeometry`. A PolygonJS scene JSON *is* a "DesignSpec that renders itself." Their pull-based dirty `Cooker` gives deterministic, reproducible re-cooks — the same property our `--cam` deterministic-capture rule wants at the geometry layer.
- **Node/Operation split** (pure `*SopOperation` classes: `params + input CoreGroups → CoreGroup`) is exactly the "self-contained parameterized part builder" shape our `library/parts/` wants (`LIBRARY.md`: builders must be self-contained, RETURN their Group, parameterize every absolute dimension).

**Where it is a poor fit as a dependency:**
- **Maintenance-mode/EOL + license ambiguity** (§1–2): building our pipeline on a frozen v1 with a contradictory license (MIT file vs PolyForm-Shield package field vs paid v2) is a standing risk our kit should not take on.
- **Heavy, coupled footprint.** ~30 runtime deps including **opencascade wasm, manifold wasm, mapbox-gl, mediapipe, rapier3d, tone.js, gsap, xatlas, three-gpu-pathtracer**. The engine is a large bundle with its own scene/registration/param/expression subsystems. This is the opposite of our "self-contained offline `dist/index.html`, no runtime CDN, vendor only three" default (SKILL v1.13/TRACK-THREEJS). Adopting the engine wholesale inverts our footprint discipline.
- **Not a supported headless library.** Cooking geometry in Node is achievable but DIY (selective registration or jsdom); no maintained non-DOM entry point; tests are browser-QUnit. Our gates run over a harness http server already, but we'd be maintaining an un-blessed integration against a frozen engine.
- **Editor/DOM coupling in the all-in path** (COP/viewers/CSS-renderers reference `document`/`window`), so you cannot cleanly `import` "just the cook engine" without curating the registration.

**Adoption cost estimate:**
- *Full engine as our geometry layer:* HIGH and not advisable — vendor a large frozen MIT/ambiguous codebase + wasm blobs, build a headless registration shim, and re-home our gate/capture around its scene model. Weeks, plus ongoing risk.
- *Borrow individual MIT operations as part builders:* LOW-MEDIUM per part — e.g. lift the math of `PolywireSopOperation` / `TubeSopOperation` / `BooleanSopOperation` (which is itself just a `three-bvh-csg` call we can make directly) into our `library/parts/` as self-contained builders, re-headered per `LIBRARY.md`. We already depend on the same primitive (`three-bvh-csg`) conceptually.

---

## 5. Verify / refute the `investigacion.md` characterization

> "PolygonJS ~806 stars, editor 3D visual basado en nodos, ⭐⭐⭐⭐"

- **Stars ~806:** ✅ accurate — live GitHub API returns **811** (close enough; the number drifts).
- **"editor 3D visual basado en nodos":** ✅ accurate — it is exactly a node-based visual 3D editor/engine on three.js.
- **⭐⭐⭐⭐ (4/5):** ⚠️ **partially outdated.** The rating is defensible for the *technology* (rich, well-architected, four geometry backends incl. a real CAD kernel). But it **misses the two facts that matter most for adoption**: the repo is **in maintenance mode / superseded by a closed v2**, and the **license is contradictory** (MIT file vs PolyForm-Shield package field vs paid editor). For *use as a live dependency* today, 4/5 is too generous; for *pattern/reference value*, it's fair.

---

## 6. Verdict — **BORROW-PATTERN** (do not ADOPT)

**SKIP as a runtime dependency. BORROW two patterns.**

1. **Serializable node-graph as the DesignSpec-that-cooks.** PolygonJS validates our spec-first + deterministic model in production: a JSON graph of nodes/params/wires + a pull-based dirty **Cooker** that deterministically produces `BufferGeometry`. Adopt the *shape* — a machine-authorable, diff-able JSON procedural spec whose engine is a deterministic pure re-cook — as the design target for a future "geometry DesignSpec" layer, without importing their engine. Their `SceneJsonExporterData`/manifest split is a good reference for how to structure such a spec + lazy per-node payloads.
2. **Node/Operation pure-builder split for `library/parts/`.** The `*SopOperation` classes are exactly our "self-contained, returns-a-Group, fully-parameterized" part-builder contract. Where a specific operation is MIT and useful (Polywire tube-along-curve, Tube, the `three-bvh-csg` Boolean wrapper), borrow the math into a re-headered `library/parts/` block with gate evidence — rather than taking the dependency.

**Do NOT adopt the engine** because: v1 is EOL/maintenance-only and superseded by a closed v2; the license is internally contradictory (resolve MIT-vs-PolyForm before touching it commercially); the footprint (~30 deps + OCCT/Manifold wasm + mapbox/mediapipe/rapier) is antithetical to our offline, three-only, self-contained-`dist` discipline; and headless cook-in-Node is an unsupported DIY integration, not a product mode.

**One concrete, separable exception worth noting:** if a future HVAC need requires *true solids with wall thickness + STEP interoperability*, PolygonJS's OCCT (`CAD*`) node family is a working reference for driving `opencascade.js` from three.js — but that argues for evaluating `opencascade.js` directly (also what they vendor), not for adopting PolygonJS.
