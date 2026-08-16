# TRACK-THREEJS — Three.js track adapter

Modular `src/` prototypes (importmap at dev time; esbuild only at P7 to emit the offline
single-file). Blockout = voxel massing pass;
build-out = parametric/PBR ladder. Reuse the `threejs-*` reference skills for technique — link,
never duplicate.

## Project-overlay discovery (P0)

Probe the cwd (and repo root) for these; record found paths in `spec.environment.overlays`.
Found overlays OVERRIDE the generic defaults below.

| Probe for | Overlay provides | This-repo example (threejs-hvac-prototipos) |
|---|---|---|
| `research/HANDBOOK.md` | house norms: PBR palette, light rigs, scale table, device budgets, delivery kit specs | `/home/cristian/prototipos/three.js/research/HANDBOOK.md` |
| REGLAS DE CASA block in `EQUIPOS-PENDIENTES.md` | fixed prompt-rules block for voxel passes | `/home/cristian/prototipos/three.js/EQUIPOS-PENDIENTES.md` §REGLAS DE CASA |
| `research/tools/probe.mjs`, `capture.mjs`, `preflight.mjs` | QA harness (mechanical checks + captures + evidence-chain preflight, GATES.md step 0) | `/home/cristian/prototipos/three.js/research/tools/` |
| `disenos/` | design-dir layout: one folder per equipment, own README table | `/home/cristian/prototipos/three.js/disenos/<equipo>/` |
| `research/INDEX.md` + `CATALOG.md` | 44 distilled technique blocks for deep dives | `/home/cristian/prototipos/three.js/research/` |
| `~/.claude/skills/threejs-*` | per-pass technique refs (geometry, materials, lighting, textures, animation, interaction, postprocessing, shaders, loaders, fundamentals) | global |

## Generic defaults (used ONLY when no overlay found)

- three.js r0.160.0, vendored (no CDN). NEW designs are authored MODULAR, not single-file.
- **MODULAR `src/` (default for NEW designs)**: an `index.html` shell + a `main.js` entry that imports
  a `src/**` tree split by responsibility — `scene/` (geometry, one file per subsystem), `sim/`
  (physics/logic, kept OUT of the view layer), `dashboard/`, `controllers/`, `dev/` (hideable
  lil-gui). Dev previews and gates run over the harness http server — ES-module files do NOT load
  from `file://`, so a modular design never opens by double-click DURING the run; only its P7 `dist/`
  does (see §Delivery kit). Template precedent: `disenos/nave-3sistemas/`. The legacy single-file
  monoliths (~129) are GRANDFATHERED — never migrate one wholesale; it modularizes only if a real
  change forces a rewrite anyway.
- **OFFLINE-FIRST (default)**: a threejs design vendors its own libraries (`vendor/three/` + a LOCAL
  importmap `"three": "./vendor/three/three.module.js"`; addons under `vendor/three/addons/`;
  lil-gui/BufferGeometryUtils vendored the same way). No run-time CDN. Verify no `http(s)://` CDN
  reference survives in the shipped HTML/JS. Precedent + full spec: the repo's
  `disenos/catalog/EXTERNAL-ASSETS.md` and `disenos/datacenter-hotspot-sinCDN/`.
- **Voxel/blockout pass**: all static voxels in ONE `InstancedMesh` per color (shared
  `BoxGeometry(1,1,1)`, `setMatrixAt` + `instanceMatrix.needsUpdate = true`). Animated parts
  (fans, dampers, couplings) in SEPARATE `Group`s outside the InstancedMesh. Flat-color
  `MeshStandardMaterial`, no image textures.
- Renderer: `ACESFilmicToneMapping` exposure 1.05–1.15, `outputColorSpace = SRGBColorSpace`,
  `PCFSoftShadowMap` 2048², `setPixelRatio(min(devicePixelRatio, 2))`.
- Light rig: white key `DirectionalLight(0xffffff, 1.5)` with shadows + blue fill
  `(0x88aaff, 0.4)` + teal rim `(0x00d4aa, 0.2)` + ambient ~0.25 + IBL
  `scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture`.
  - **Bare metal (metalness ~0.9)** reflects the dark house scene and reads BLACK — worst on the
    vertical faces of boxy equipment, which the top-lit house rig misses. Headless-safe fix:
    ~~`scene.environmentIntensity ≈ 2.15`~~ **`material.envMapIntensity ≈ 1.9`** + a
    `HemisphereLight` + a FRONTAL `DirectionalLight` fill +
    roughness ~0.30 with a brushed CanvasTexture roughnessMap. This is the headless complement to the
    §3.3 studio variant (whose RectAreaLight stalls SwiftShader — see the QA-commands caveat).
    > **CORRECTION 2026-08-10.** `scene.environmentIntensity` **does not exist in three r0.160.0** —
    > it is a silent no-op (scene-level property added in r164+; verified by grepping the r0.160.0
    > build, research B125 §E). The knob that is live in r160 is **per material**:
    > `mat.envMapIntensity = 1.9`. The assets that read satin under this rig did so because of the
    > RoomEnvironment IBL + the frontal fill + the brushed roughnessMap, never because of that line.
    > `brushed-stainless-recipe.md` was corrected on 2026-08-09; THIS file was not, so the dead
    > property kept being copied into new assets for a further day. When a fact is corrected, grep
    > the kit for every other place that states it.
  - **Painted sheet (casings, canopies, cabinets)** is a DIELECTRIC WITH A CLEAR LAYER:
    `metalness: 0` + `clearcoat ~0.9` + `clearcoatRoughness ~0.12` on a `MeshPhysicalMaterial`.
    Do NOT reach for an intermediate metalness to make paint look glossy — measured on the
    condensing-unit master, `metalness 0.35` bought the specular response (highlight spread
    44.9 → 82.9) by spending a third of the diffuse, and every large face went dark
    (top deck luminance 162 → 84); the clearcoat form keeps both (135 / spread 82.6).
    `clearcoat` compiles fine under SwiftShader — it is `transmission` that stalls it.
- **Z-FIGHTING (surfaces that shimmer or flicker as the camera moves)** is the depth buffer
  unable to order two faces at the same coordinate. Fix it in this order, and never skip to the
  last one:
  1. **SEPARATE THE GEOMETRY by 1–2 mm.** In a metric scene this is the only fix with no
     view-angle artifacts. A shared plane is the cause; everything else treats the symptom.
  2. `polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1` on the layer that must
     win — ONLY where separation is genuinely impossible.
  3. `logarithmicDepthBuffer` is a last resort: it costs roughly 50 % of frame rate. Leave it off.
  Keep near/far within about 10⁴:1 (e.g. 0.1 / 1000); a huge ratio starves the buffer on its own.
  - **NESTED elements need a STEP, not an offset.** A panel drawn inside a panel, a frame inside a
    frame: give each one an offset that steps with its nesting DEPTH, or every member of the stack
    lands on the same plane and the fix does nothing. Derive depth by sorting by area and counting
    how many larger elements each one overlaps, so the smaller of any overlapping pair always
    lands further out.
  - A coplanar pair is INVISIBLE to console, count and framing checks: it renders, it is not an
    error, and it only shows up in a LIVE ORBIT or a moving capture. If the subject has stacked or
    inset faces, that is what has to be exercised.
  - **DETECT it with `checkCoplanar` / `coplanarPairs`** (`library/harness/geom-verify.mjs`), once per
    meaningful toggle state — a cut-away or an opened door swaps which faces are exposed. The result
    is LEADS, not defects: AABBs cannot separate overlapping SURFACES from overlapping BOXES, so a
    pair is confirmed against the geometry (hash the two run lists, or read the generator's own
    arithmetic) before anyone calls it a defect. Out of 73 leads on nave-panccadia v22, one was real.
    Follow the same rule the page itself follows for framing: publish RAW boxes from the scene
    (`window.__qaBoxes`) and run the numerics OUTSIDE the page, or a detector bug certifies itself.
- `OrbitControls` damping 0.08, `autoRotate` DEFAULT OFF for gate captures (a rotating scene never
  settles → capture's frame-settle loop writes `console_clean:false`); autoRotate stays behind a
  toggle. `PerspectiveCamera` FOV 32–42
  (equipment hero) / 70–90 (plant/campus). Never `OrthographicCamera`.
- Scale: 1 world unit = 1 m; declare `// SCALE: 1 voxel = X m` at the top.
- PROHIBITED in blockout: high-segment smooth geometry, image textures, extra libraries.
- UI: header with design name, flow-color legend top-right, control panel bottom-right with the
  spec's `ui_controls`, dark `#06080d` background, monospace font.
- Template MUST include `<link rel="icon" href="data:,">` (a favicon 404 pollutes the console
  sidecar) and a DYNAMIC HUD pass-label subtitle — set it from the current pass; a stale label
  is an evidence-hygiene defect to blind judges.
- Camera occlusion: side features (linkages, brackets) need standoff from the silhouette to
  stay visible at the house az42 camera — check visibility at spec camera BEFORE gating.
- **Differentiate co-located services by CROSS-SECTION / shape, not material alone**: two round
  cylinders read as ONE system even with different materials and flow markers. (nave-3sistemas: a
  round HVAC trunk beside the round compressed-air pipe failed ahu-and-duct-run 0.71; making the
  trunk a RECTANGULAR box duct fixed it under both panel judges.)

## Pass ladder (P4a → P5a)

| Pass | Content | Technique refs |
|---|---|---|
| blockout | voxel massing: silhouette, proportions, color blocks, part decomposition | threejs-geometry (instancing) |
| structural | parametric rebuild: Cylinder/Torus/Extrude/Lathe, direct vertex edits for bespoke parts | threejs-geometry |
| materials | named PBR palette (`const M = {...}`), near-binary metalness, `MeshPhysicalMaterial` for clearcoat/glass, emissive screens/LEDs | threejs-materials |
| surface | CanvasTexture detail (fins, nameplates, dials) — draw, don't download | threejs-textures |
| lighting-camera | rig per spec (`house-rig` or studio RectAreaLight variant), fog, composition: azimuth 40–45°, elevation 20–28° | threejs-lighting |
| interaction-ui | spec `ui_controls`: toggles, raycast hotspots, DOM overlays | threejs-interaction |
| optimization | draws: BatchedMesh/merge · tris: LOD/simplify/instanceColor; re-probe vs budget | threejs-fundamentals |

## QA commands (mechanical checks + capture) — verbatim

Serve the REPO ROOT (not the design dir), run `node` FROM the repo root, and pass
repo-root-relative paths — probe/capture hardcode `localhost:8123` and resolve paths against
the server root (`PORT` env overrides capture's port).

```bash
cd <repo-root>
python3 -m http.server 8123 &         # serve repo root; kill after the gate
# mechanical: median draws/tris JSON per file (fps is INFORMATIONAL ONLY under SwiftShader —
# gate on draws/tris, never on fps)
node research/tools/probe.mjs "disenos/<equipo>/<file>.html"
# capture: <basename>.png + <basename>.console.json
# (console/pageerror evidence — the console-clean mechanical check reads THIS sidecar)
# GATE EVIDENCE USES --dpr 3 (~2064 px long edge): the blind judge consumes the image downscaled
# to ~2000 px, so DPR 4 pays to rasterize pixels the judge discards — and the downscale can invent
# absence defects for fine detail. DPR 4 is reserved for the P7 hero/thumbnail and for
# native-resolution CROPS of fine-detail regions (cinemex: 8 attempts burned on arrowheads that
# were present at 1:1 in the very capture the judge scored downscaled).
node research/tools/capture.mjs --dpr 3 "disenos/<equipo>/runs/<run-dir>" "disenos/<equipo>/<file>.html"
# OBJECTIVE material-colour anchor (mechanical; ONLY when the spec declares colorTarget — v1.10 / block53):
# measure the render crop's mean sRGB vs the spec target and record the CIEDE2000 distance as
# `mechanical.color_delta_e00` in the review. The reviewer judges IDENTITY (right shape/part); this SCRIPT
# judges the colour VALUE — fixing the measured reviewer-variance on "reads as the right material"
# (identical stainless render scored 0.80 vs 0.57). gate-state enforces color_delta_e00 <= deltaE00Max.
# Target from the spec `colorTarget.srgb`, or `--target-png <golden.png> --target-crop <geom>` when a
# passing golden render exists but no photo does.
node research/tools/material-color-probe.mjs "disenos/<equipo>/runs/<run-dir>/<pass>-attempt<N>.png" \
  --crop <WxH+X+Y> --target <R,G,B> --max <deltaE00Max>
# extra views/states (GATES.md look-dev + kinematic evidence): --url-suffix appends a query
# string — the PAGE must implement reading these params (?view= / ?state= / ?demo=)
node research/tools/capture.mjs --url-suffix "state=90" "<run-dir>" "<file>.html"
# BEFORE spending a multi-shot attempt (GATES.md step 0): prove every shot in the evidence set
# renders a distinct, non-default view — an unknown value on a known query key silently resets
# the whole app state and produces N pictures of the default camera under N lying filenames
node research/tools/preflight.mjs "<file>.html" --contract <shots.json>
# passes whose deliverable lives in the DOM (interaction-ui; P6 when it scores the HUD) capture
# the whole viewport, never canvas-only (GATES.md §Capture)
node research/tools/capture.mjs --shots <shots.json> --page --dpr 3 "<run-dir>" "<file>.html"
```

Probe may report draws/tris = 0/0 under a SwiftShader shader-compile stall (e.g.
MeshPhysicalMaterial clearcoat): retry ONCE before treating the scene as broken — the capture
PNG is the truth check.

Then copy/rename the outputs to the gate artifact names (`<pass>-attempt<N>.png`,
`<pass>-attempt<N>.console.json`) per GATES.md §Artifacts.

No overlay tools? Skip probe — mechanical = console-clean only, from REAL evidence (a browser
console or an equivalent harness), recorded as `mechanical.note: "probe unavailable:
console-clean only"`. Never fake numbers.

## Delivery kit (P7)

| Deliverable | How |
|---|---|
| 4K hero PNG | `capture.mjs` (DPR 4 supersample) |
| Catalog thumbnail | same harness, overlay's fixed framing if defined |
| `.glb` | `research/tools/export-glb.mjs` (headless GLTFExporter via the page's QA hook), then glTF-Transform — MEASURE the optimized size; plain `optimize` measured WORSE on a CanvasTexture-dominated scene (cinemex 1.09→1.16 MB) and draco bought only 6% |
| **Self-contained `dist/index.html`** (modular designs) | `research/tools/build-offline.mjs <design-dir>` — esbuild bundles `main.js` + `src/**` + vendored three into ONE inline-module HTML that opens by double-click over `file://`, ZERO network (`assertNoNetwork` fails loud on any surviving remote dep). MEASURE it (nave-3sistemas: 28.6 kB entry → 766.6 kB page, ~5 s). VERIFY visual parity vs the gate capture — the dist MIRRORS the gated modular source, is never a second source of truth, and is never hand-edited (regenerated every build). |
| README row | append to the design folder's README table (overlay convention) |

**Every harness P7 builds is a REPO TOOL** (`research/tools/`, next to probe/capture/preflight),
never a throwaway script — an unpreserved harness is a rebuild tax on the next design's P7
(damper-motorizado preserved nothing; cinemex rebuilt the GLB driver from scratch).

**GLTFExporter caveats** (encoded in `export-glb.mjs`): it rasterizes reachable textures through
canvas `drawImage` and THROWS on non-drawable images (DataTexture, PMREM render targets) — strip
those texture slots plus `scene.environment`/`background` before export; and import GLTFExporter
through the PAGE's importmap (`three/addons/`) so exporter and scene share ONE three.js instance —
a second copy fails `instanceof` checks.
