# LIBRARY INDEX — registry of reusable blocks

One row per block. `kind`: `module` (file lives in this library) · `recipe` (pattern .md, code
stays exemplified in its source design) · `pointer` (whole-equipment catalog design in the repo).
`status`: `ready` · `pending-extraction` (registered, file lands when its design's active round
closes) · `superseded-by: <name>`.

## controllers/

| name | kind | what | source · gate evidence | status |
|---|---|---|---|---|
| shader-warmup | module | Boot-time warm-up that compiles clipping/selection/mode shader variants BEFORE `data-app-ready`, byte-identical state restore — kills the first-use freeze on section/selection toggles. | cinemex-hvac-lorawan `src/controllers/warmup.js` · p6-final L2 0.78 (2026-07-14) | ready (`controllers/shader-warmup.mjs`) |
| smooth-dolly | module | Exponential wheel-zoom smoothing (OrbitControls r160 never damps dolly): wheel accumulates a target distance, update() approaches it; cancels during preset lerps and first-person. | cinemex `src/controllers/camera.js` · p6-final L2 0.78 | ready (`controllers/smooth-dolly.mjs`) |
| query-state-contract | recipe | Atomic URL query-state parser/serializer as a QA contract: unknown value on a known key resets ALL state (loud, testable); serialize(parse(s)) is a fixed point; `tick` pins the animation clock so captures never race. | cinemex `src/controllers/query-state.js` · interaction-ui 0.81 | ready (recipe: `recipes/query-state-contract.md`) |
| layer-visibility-controller | recipe | Central layer controller (roof/walls/media/labels) where every visibility rule lives in ONE apply() — including stacked elements that must follow a parent layer (interior ceilings follow the roof toggle). | cinemex `src/controllers/layers.js` · p6-final L2 0.78 | ready (recipe: `recipes/layer-visibility-controller.md`) |

## harness/

| name | kind | what | source · gate evidence | status |
|---|---|---|---|---|
| export-glb | pointer | Headless GLTFExporter driver over the page's QA hook; strips non-drawable textures (DataTexture/PMREM); imports exporter through the page importmap (single three.js instance). | `research/tools/export-glb.mjs` (repo tool) · shipped cinemex P7 kit | ready |
| qa-render-info-hook | recipe | `window.__qaRenderInfo = () => runtime.renderer.info.render{...}` — ground-truth draws/tris for probes; the wrapper-based counter it replaced under-read InstancedMesh 60×. | cinemex `main.js` · optimization 0.82 | ready (recipe: `recipes/qa-render-info-hook.md`) |
| qa-framing-hook | recipe | `window.__qaFraming = () => ({mvpElements, corners, W, H, hud})` — a zero-arg closure exporting the camera MVP + the SUBJECT's 8 world-AABB corners (RAW, no verdict). `research/tools/framing-probe.mjs` reads it and runs `geom-verify`'s pure core (`projectCornersNDC`+`framingMetrics`) — same math as in-page `checkFraming`, one source of truth. Framing analog of `qa-render-info-hook`; no-hook = SKIP not pass; failure → `mechanical.framing` nonzero exit. | `research/tools/framing-probe.mjs` (repo tool) + `library/harness/geom-verify.mjs` · distilled from 5-retro framing/occlusion misses | ready (recipe: `recipes/qa-framing-hook.md`) |
| app-ready-flag | recipe | Readiness as `data-app-ready` on <html> AFTER warm-up, never a status-text write (a hard-coded status literal once clobbered derived HUD copy on every cold load). | cinemex `main.js` · interaction-ui 0.81 | ready (recipe: `recipes/app-ready-flag.md`) |
| stainless-equipment-shell | recipe | ~80-line standalone-HTML scaffolding template for a single-equipment threejs asset: doctype + `data-app-ready` + favicon shim + HUD (name/dynamic pass-label/dims) + importmap + renderer (ACES 1.15, SRGB, baked PCFSoftShadow) + hero camera + OrbitControls (autoRotate OFF) + IBL + house 3-light rig + HemisphereLight + frontal fill + ground. Duplicated verbatim 18/18. | nave-panccadia `equipos/mesa-trabajo/mesa-trabajo.html:1-90` · 18/18 assets materials PASS 0.76–0.80 | ready (recipe: `harness/stainless-equipment-shell.md`) |
| geom-verify | module | Pure-math geometry verifiers for the gate: `checkFraming` (world-bbox→NDC with a `w<=0` near-plane guard — kills the false-green framing where a corner behind the near plane flips the NDC sign) + `checkGeometry` (concentric / high-IoU AABB pairs, ADVISORY) + `signedVolume`/`meshIntegrity`/`checkMeshIntegrity` (divergence-theorem `V=Σv1·(v2×v3)/6` — a CLOSED mesh with V<0 is INSIDE-OUT) + `verticalGap`/`edgeManifold`/`assertPositive` core. Pure-math core imports nothing (Node-testable); three wrappers use dynamic `import('three')`. REPORTS, never mutates. | `library/harness/geom-verify.mjs` (+ `.test.mjs`, 34 cases green) · distilled from 5-retro framing/occlusion misses | ready |
| normal-matrix-guidance | recipe | The NORMAL MATRIX = `transpose(inverse(3×3 model))` via `new THREE.Matrix3().getNormalMatrix(object.matrixWorld)`. WHY: transforming a normal by the model matrix directly SHEARS it under non-uniform scale → wrong lighting. three's MeshStandardMaterial path already does this; the trap is any custom shader, manual normal transform, or geometry baked with a non-uniform scale then flattened. Rule: never non-uniformly scale and bake; if transforming normals by hand, use getNormalMatrix. | `library/recipes/normal-matrix-guidance.md` · three r160 normal-matrix path | ready (recipe: `recipes/normal-matrix-guidance.md`) |

## fx/

| name | kind | what | source · gate evidence | status |
|---|---|---|---|---|
| deterministic-tick-pools | recipe | Fixed InstancedMesh pools (packets/waves/halos, count=0 + visible=false when idle) animated by a derived `tick` clock: `resolvePacketT`, arc-length polyline sampling, halo pulse — zero per-frame allocation, draws identical at any tick. | cinemex `src/scene/interaction.js` · interaction-ui 0.81 + optimization 0.82 | ready (recipe: `recipes/deterministic-tick-pools.md`) |
| status-overlay-instancing | recipe | Fault/selection recolor WITHOUT duplicate geometry: affected instances zero-scaled in their own mesh and re-emitted into a status overlay InstancedMesh at the same transform (`statusOwner` index); restore is exact. | cinemex `src/scene/architecture.js` · interaction-ui 0.81 | ready (recipe: `recipes/status-overlay-instancing.md`) |

## markers-ui/

| name | kind | what | source · gate evidence | status |
|---|---|---|---|---|
| hud-single-derivation | recipe | One pure `deriveHudModel(state)` owns ALL HUD copy; every DOM surface renders from it (status line, dot, alarm list) so two surfaces can never contradict. | cinemex `src/hud.mjs` · interaction-ui 0.81 | ready (recipe: `recipes/hud-single-derivation.md`) |
| sims-floating-banner | module | "SIMS-style" floating billboard banner: canvas badge with inverted pointer arrow + additive pulsing halo sprite + vertical bob/sway loop; Sprite = always camera-facing. Client-validated look. Params: position, texts/logo, colors. | cuarto-frio-safran `cuarto-3d.html:32109-32189` (client-shipped) | ready |
| temperature-chips | module | Billboard temperature-chip FLEET (sims-floating-banner lineage): one badge Sprite per unit with zone + live reading, alarm recolor + pulsing halo, exterior-only visibility (`isCameraOutside` envelope), tick-driven bob/sway, canvas redraw only on reading change. | cinemex `src/scene/temperature-chips.js` · p6-final L4 0.80 (2026-07-15) | ready (`markers-ui/temperature-chips.mjs`) |
| backlit-sign-glyph-reveal | recipe | Wall backlit sign whose glyphs are independent baked meshes revealed with staggered easeOutBack scale+fade — no canvas redraw per frame. | cuarto-3d.html:31929-32107 | pending-extraction |
| voxel-bitmap-font | module | 5×5 bitmap font from '10001' strings → emissive voxel lettering for signs. | hotel-torre-voxel.optimized.html:513-535 | pending-extraction |
| coord-capture-picker | module | QA coordinate picker: click raycast with 6px anti-drag threshold, sphere markers (FIFO 6), surface classification — already ported across designs once by hand. | cuarto-3d.html:32217-32243 | ready (`harness/coord-capture-picker.mjs`) |

## parts/

| name | kind | what | source · gate evidence | status |
|---|---|---|---|---|
| trane-rtu-family | pointer | Packaged rooftop unit silhouette family (voxel + realistic v10) — the approved part vocabulary for RTU masters. | `disenos/trane/trane-rtu-realistic-v10.html` | ready |
| ducteria-catalogo | pointer | 8 HVAC duct pieces (straights, elbows, strapped joints, transitions), voxel + realistic. | `disenos/ducteria/ducteria-catalogo-realistic-v1.html` | ready |
| tuberia-hidraulica-catalogo | pointer | 13 hydraulic pipe pieces (elbows, downpipes, valves), voxel + realistic. | `disenos/tuberia-hidraulica/tuberia-hidraulica-catalogo-realistic-v1.html` | ready |
| rtu-master-cinemex | recipe | Parameterized RTU master (two-section cabinet, fan ring, hood, curb) instanced per zone with per-part InstancedMesh. | cinemex `src/scene/architecture.js` · p6-final L4 0.80 (2026-07-15) | ready (recipe: `recipes/rtu-master-cinemex.md`) |
| aero-fan-kit | module | `makeAeroBlade()` (scimitar blade: extruded Shape + per-vertex twist) + `makeFan(R, mat)` (venturi, torus+spoke guard, hub, 5 blades → {holder, spin}). Every HVAC design needs fans. | cuarto-3d.html:31634-31665 | ready |
| pipe-run | module | Waypoint piping: oriented cylinders via `quaternion.setFromUnitVectors` + sphere elbows. Return the Group, never scene.add inside. Optional `targetEdgeLength` drives adaptive segment counts (via `adaptive-segments`); omit it for the historic byte-identical fixed 12/12/8. | cuarto-3d.html:31620-31627 | ready |
| adaptive-segments | module | Pure tessellation math (zero imports, Node-testable): `radialSegmentsFor` / `sphereSegmentsFor` / `lengthSegmentsFor` derive segment counts from a target edge length (`N = round(2·π·r / L)`, clamped) so round geometry scales its tri budget with its radius instead of a fixed constant. Returns null → caller keeps its default (pure superset). | `library/parts/adaptive-segments.mjs` (+ `.test.mjs`, 16 cases green) · design3d numerical pass | ready |
| rmf-frames | module | Rotation-Minimizing Frames via the DOUBLE-REFLECTION method (Wang/Jüttler/Zheng/Liu 2008): `rmfFrames(points, tangents, r0)` → `[{r,s,t}]` twist-free frames for tube/hose cross-section sweeps. Beats Frenet (whose normal flips at inflection points κ=0); on a planar curve r stays the fixed out-of-plane normal (zero twist). Pure core zero-imports, Node-testable. Also carries `tubeGeometryFromFrames(points,frames,radius,radialSegments)` (pure — rings the frames into flat tube positions/indices, open, no caps) + the in-page async `makeSweptTube(curvePoints, opts, material)` builder: a SMOOTH RMF+adaptive-segments swept tube (dynamic `import('three')`) for curved hoses/pipes the discrete `pipe-run` cylinder+elbow cannot render smoothly. | `library/parts/rmf-frames.mjs` (+ `.test.mjs`, 12 cases green incl. non-planar helix + tube geometry) · design3d numerical pass | ready |
| lathe-body | module | REVOLUTION BODY helper so equipment stops being boxy — revolve a 2D profile around the Y axis into one round watertight body (tanks/vessels/domes/dished heads/flanges) instead of stacked boxes. Pure core zero-imports, Node-testable: `latheProfileValid(points)` (x>=0 = radius from axis, not-all-same-y) + `filletedCylinderProfile({radius,height,fillet,filletSegments})` (capped cylinder, rounded top outer edge) + `domeProfile({radius,height,segments})` (quarter-ellipse dished head). Also the in-page async `makeLatheBody(profile, opts, material)` builder (dynamic `import('three')`, LatheGeometry, radial count via `adaptive-segments`, clamped min 8). | `library/parts/lathe-body.mjs` (+ `.test.mjs`, 21 cases green) · design3d numerical pass | ready |
| superquadric | module | Superellipsoid sampler with ONE roundness knob per axis: `signedPow` + `superquadricPoint(u,v,{a,b,c,e1,e2})` + `superquadricGrid(...)` → flat positions/indices for a BufferGeometry. Implicit `|x/a|^r+|y/b|^r+|z/c|^r=1`; e≈1 ellipsoid, e≈0.2–0.4 rounded box — one param replaces a stack of boolean fillet ops. Pure core zero-imports, Node-testable; throws RangeError on non-positive a/b/c/e or seg<3. Also carries the in-page async `makeSuperquadric({a,b,c,e1,e2,uSeg,vSeg}, material)` builder — a rounded housing/tank as one Mesh (dynamic `import('three')`). | `library/parts/superquadric.mjs` (+ `.test.mjs`, 10 cases green) · design3d numerical pass | ready |
| prim-helpers | module | One-line `box/panel/cyl/tube` primitives with shadow flags — the base of every part builder. | cuarto-3d.html:31616-31619 | ready |
| insulated-panel-wall | module | `panelWall(target,c,alongZ)`: cold-room insulated panel wall with vertical ribs at RIB pitch. | cuarto-3d.html:31683-31699 | pending-extraction |
| pallet-rack-builder | module | `buildRack(a,b)`: industrial rack between two points — auto bays, zigzag frames, orange beams, deck levels. | cuarto-3d.html:31880-31926 | pending-extraction |
| unit-cooler-builder | recipe | Evaporator builder: 2 fans, status LED, drip tray, hung/wall mount, world-space airDir/fanWorld. Per-instance materials for mutable parts (LED/blades) — the pattern matters. | cuarto-3d.html:31750-31790 | pending-extraction |
| package-unit-builder | recipe | Package condenser builder: coil+fins, control panel, 2 top fans. | cuarto-3d.html:31795-31821 | pending-extraction |
| voxel-store-builder | module | Color-bucketed voxel stores (`addVox/fillS/fillF`), static + hideable-facade stores. | hotel-torre-voxel.optimized.html:160-171 | ready (`parts/voxel-kit.mjs`, one module with the mesher) |
| voxel-hidden-face-mesher | module | `buildStore()`: emits ONLY faces without an opaque neighbor (OCC set + FACE_DIRS) into one BufferGeometry per color — the perf leap of the voxel track. Transparent voxels never occlude (visual-quality decision, documented). | hotel-torre-voxel.optimized.html:537-605 | ready (`parts/voxel-kit.mjs`) |
| merge-instancing-kit | module | `mergeBoxes(defs)` + `tMat(x,y,z)` + `makeIM(geo,mat,mats)`: compound-module instancing (88 furnished hotel bays + VAV ≈ 15 draws). 12 lines that enable the whole instanced realistic track. | edificio-hotel-realista-v1.html:230-259 | ready |
| gooseneck-spout | module | Swan-neck spout: quarter/half `TorusGeometry(R,r,seg,seg,sweep)` arc + riser + down-tip curving forward-down — quarter (`Math.PI/2`) for a dispenser hook, half (`Math.PI`) for a faucet gooseneck. Return the Group. | nave-panccadia `equipos/cuentalitros/cuentalitros.html:123` (reused `silla-lavabo/silla-lavabo.html:113`) · materials PASS 0.76 / 0.80 | ready (`parts/gooseneck-spout.md`) |

## materials-textures/

| name | kind | what | source · gate evidence | status |
|---|---|---|---|---|
| paint-roughness-canvas-tex | module | `dataTex(w,h,draw)` + procedural "sand paint" roughnessMap with RepeatWrapping; carries the PBR palette lesson (metalness 0 = painted, 1 = metal; grey+metal reads black). | edificio-hotel-realista-v1.html:152-207 | ready |
| procedural-pbr-canvas | module | The "real texture without downloads" win: PURE zero-import noise core (`hash2` / `valueNoise2` / `fbm2` — value-noise + fbm written from textbook defs, no GPL, deterministic, Node-testable) + async `makeProceduralMetalRough({size,roughnessBase,roughnessVar,metalness,scale,octaves,wear,repeat})` that paints a PACKED glTF metallicRoughness data texture on a CPU canvas (zero downloads, SwiftShader-safe): G=roughness (fbm) / B=metalness / R=free, optional `wear` fbm layer. Assign the SAME CanvasTexture to BOTH `roughnessMap` and `metalnessMap` (one map drives both, halves texture memory); NoColorSpace (data, not color); keep material.roughness/metalness=1 as multipliers. | `library/materials-textures/procedural-pbr-canvas.mjs` (+ `.test.mjs`, 41 cases green) · research block B126 §E · design3d numerical pass | ready |
| glow-plane-recipe | module | `makeGlowPlane(w,h)`: blurred CanvasTexture plane + AdditiveBlending for surface-hugging halos. | cuarto-3d.html:32039-32049 | pending-extraction |
| canvas-board-recipes | recipe | Cinemex menu/poster/diagram-board CanvasTexture recipes (draw, don't download; deterministic frames via poster_frame/display_frame). | cinemex `src/scene/surfaces.js` · p6-final L4 0.80 (2026-07-15) | ready (recipe: `recipes/canvas-board-recipes.md`) |
| brushed-stainless-recipe | recipe | Headless bare stainless that reads satin, not black: `brushedRoughTex()` + `matSteel` (albedo #d2d6d8, metalness 0.9, roughness 0.30, brushed roughnessMap) + `material.envMapIntensity ~1.9` (NOT the inert `scene.environmentIntensity` — dead in r160; optionally AgX tonemap exp 0.9) + `HemisphereLight` + frontal `DirectionalLight` fill. Bare metal reflects the dark house scene and reads black on vertical faces the top rig misses. | nave-panccadia `equipos/lavavajillas/lavavajillas.html:87-104` · materials PASS 0.78 (attempt1 0.73 dark→pass); reused 16/18 assets | ready (recipe: `materials-textures/brushed-stainless-recipe.md`) |
| transmission-free-glass | recipe | SwiftShader-SAFE door glass via `MeshStandardMaterial({metalness:0, roughness:0.12, transparent:true, opacity:~0.4})` — deliberately NOT `MeshPhysicalMaterial.transmission` (stalls the SwiftShader shader-compile). For oven/chamber doors over a visible rack. | nave-panccadia `equipos/horno-rotativo/horno-rotativo.html:104` (+ `camara-fermentacion/camara-fermentacion.html:103`) · materials PASS 0.78 | ready (recipe: `materials-textures/transmission-free-glass.md`) |

## fx/ (continued — hotel/Alser)

| name | kind | what | source · gate evidence | status |
|---|---|---|---|---|
| path-flow-particles | module | Length-parameterized polyline (`makePath/pathPos`) + recycled `userData.t` spheres for refrigerant flow; air-plume variant with sin/cos wobble + fall. | cuarto-3d.html:31629-31631, 31841-31863, 32286-32305 | pending-extraction (top-7, pairs with pipe-run) |

## controllers/ (continued — hotel/Alser)

| name | kind | what | source · gate evidence | status |
|---|---|---|---|---|
| equipment-state-machine | recipe | Per-equipment off/on/alarm: material registry keyed by equipment, `applyState` (emissive LED + PointLight + blade tint), alarm pulse loop. | cuarto-3d.html:31668-31672, 31868-31875, 32248-32285 | pending-extraction (top-8) |
| day-night-state | recipe | `applyState()` + `setEm(color,...)` material registry to switch day/night rigs (sun/amb/fill/rim + window/sign emissives) + deterministic `litRoom(m,n)`. WARNING: registry keyed by color int — two semantic uses of one hex collide. | hotel-torre-voxel.optimized.html:171, 607-636 | pending-extraction |

## markers-ui/ + dashboard mechanisms (hotel-realista-ensamblado — B11 Industrial, user-validated)

| name | kind | what | source · gate evidence | status |
|---|---|---|---|---|
| in-page-drill-overlays | recipe | 3-level drill (plant → floor/zone → unit) with NO router: raycast + userData.roomId → overlay panels toggled by CSS classes (.show/.vis); ESC/click-empty closes; URL never changes. | hotel-realista-ensamblado.html:7795-8306 | pending-extraction |
| svg-hand-rolled-charts | recipe | `_svgLineChart`/`_svgBars` return SVG strings (path/area + grid + axes; rect bars) — 24h trend + per-unit bars with zero chart libraries. | hotel-realista-ensamblado.html:7924-7947 (same pattern dashboard-energetico-v1.html:389-460) | pending-extraction |
| kpi-tile-gauge | recipe | Declarative KPI tiles per equipment type (`_dvKpiConfig`) rendering label+value+meter (semicircular SVG gauge `_dvArcD` or bar), refreshed ~1 Hz (`_dvRefreshKpis`). | hotel-realista-ensamblado.html:8071-8131 | pending-extraction |
| per-unit-mini-scene | recipe | Dedicated WebGL mini-scene per unit detail view — mounted on open, destroyed on close (no context leak), main scene alive beneath: a per-equipment 3D twin at zero global per-frame cost. | hotel-realista-ensamblado.html:8012-8143 | pending-extraction |
| zone-status-rollup | recipe | Aggregated normal/warning/alarm counts per zone with color chips + status-bar filter jumping straight to the units needing attention (fleet triage → detail). | hotel-realista-ensamblado.html:7955-7985, 7774-7785 | pending-extraction |

## harness/ (continued — hotel)

| name | kind | what | source · gate evidence | status |
|---|---|---|---|---|
| render-stats-hud | module | FPS/draws/tris/geometries HUD from `renderer.info` sampled at 0.5s; diagnostico variant adds SHADOWS and 2x-RESOLUTION toggles for bottleneck isolation. | hotel-torre-voxel.optimized.html:43-45, 666-684 + .diagnostico.html:633-647 | ready |
| cheap-round-primitives | recipe | The r160 cost sweet-spots + by-on-screen-size decision rule so equipment reads round without over-tessellating: Sphere 16×8 (not 32×16), Cylinder radialSegments 12–16 (not 32), Capsule is r160 core for rounded bars, Lathe segs 12–16; baked round-edge normalMap on a 12-tri box (`colorSpace=NoColorSpace`) saves ~95% vs geometric rounding, MeshMatcapMaterial = SwiftShader-safe baked metal; size tiers (<20px box+normalMap / 20–80px Lathe seg 8–12 / >80px hero Lathe|RoundedBox+PBR / impostor <5% / LOD). Points to `makeLatheBody` / `makeSuperquadric` / `makeSweptTube`. | research block B126 · design3d numerical pass | ready (recipe: `recipes/cheap-round-primitives.md`) |
