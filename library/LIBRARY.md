# design3d LIBRARY — reusable building blocks (never rebuild the wheel)

Cross-project library of PROVEN pieces extracted from gated designs. A block enters here only
after the design that owns it PASSED the gate that judged it — the library is a shelf of
evidence-backed parts, not a scratchpad of ideas.

## Why this exists

Every run keeps re-implementing the same mechanics: selection markers, smooth camera dolly,
shader warm-up, canvas-texture nameplates, voxel instancing helpers, packet/wave FX, QA hooks.
An unpreserved mechanism is a rebuild tax on the next design (the GLB export harness was rebuilt
from scratch one run after damper-motorizado shipped one). This shelf ends that.

## Layout

```
library/
  INDEX.md              <- the registry: EVERY block has a row here (no row = not in the library)
  markers-ui/           <- 3D selection markers (sims-style plumbob, rings, halos), labels, billboards
  controllers/          <- camera presets/smooth-dolly, shader warm-up, query-state, layer toggles
  parts/                <- parameterized part builders (RTU, duct/pipe pieces, facade/floor generators)
  materials-textures/   <- canvas-texture recipes (nameplates, menus, signage), palette patterns
  fx/                   <- packets, wave rings, pulses, fog rigs
  harness/              <- QA/instrumentation snippets (render-info hook, readiness flags)
```

Blocks are self-contained ES module files (or `.md` recipes when the value is the pattern, not
the code) with a mandatory header:

```js
// library: <kebab-name>  (category/<file>)
// source: <design> · <pass that gated it> · <score> · <date>
// what: one sentence.
// params: what you MUST parameterize per scene.
// deps: three.js APIs / other library blocks.
// coupling notes: scale, tone-mapping, importmap-version assumptions.
```

## Lifecycle rules (binding when the kit is active)

1. **CHECK BEFORE BUILDING** — at P2 (spec) and before any P4/P5 part work, scan `INDEX.md`. If a
   block covers the need, REUSE it (adapting params) and cite it in the apply report. Building a
   fresh implementation of an indexed block requires a stated reason.
2. **EXTRACT AFTER GATING** — P7 gains a step: list the run's newly built mechanisms that are
   plausibly reusable, extract the worthwhile ones into the library (self-contained, header
   complete), and register them in `INDEX.md`. Extraction NEVER edits the source design — copy
   and generalize; the design keeps its own copy.
3. **EVIDENCE OR IT DOES NOT ENTER** — every row cites the gate (design, pass, score) that judged
   the block in pixels. Unproven ideas go in a design's runs/, not here.
4. **The DESIGN CATALOGS remain the reuse mechanism for whole equipment** (`disenos/<equipo>/`,
   voxel+realistic pairs). The library holds CODE-LEVEL mechanics; when a whole-equipment
   silhouette is needed, point at the catalog design instead (e.g. trane RTU, ducteria pieces),
   as the registry's `pointer` kind.
5. Registry rows are append/update-in-place; a superseded block keeps its row with status
   `superseded-by: <name>` — history stays auditable.

## Validating a library module (kit tree vs overlay)

The kit tree canNOT render-validate its own modules — it vendors no three.js and no capture harness
(those live in an overlay repo, e.g. `threejs-hvac-prototipos`), and modules import three via a bare
`import 'three'` that resolves only through a browser importmap. So (from the v1.18 fittings + full-chain
PoCs):
- **Pure core** (zero-import math — `elbowPlacement`, `radialSegmentsFor`, `surfaceArea`, `duct-router`'s
  A*, `clash-detect`'s pair/verdict core) is validated IN THE KIT TREE with plain Node:
  `node library/<cat>/<mod>.test.mjs`. That is the only validation the kit tree can run.
- **RENDER validation** of a builder (does the mesh look right, does it gate) is an OVERLAY-REPO activity:
  author a design in the overlay, vendor three, copy the module with a provenance pointer (`@<commit>`),
  and run the overlay's capture/probe harness. The kit tree alone cannot render.
- **Node-only gate tools NEVER enter the offline single-file browser dist.** `clash-detect` needs
  three-mesh-bvh and runs headless in Node — it is a build/gate tool (Rule 5), and the browser dist
  bundles only render code. Same for any harness pulling a Node-only dependency.
- **Array→Vector3 seam:** a pure module emits plain `[x,y,z]` (e.g. `duct-router` waypoints/bends,
  `elbowPlacement` outputs); wrap at the three boundary (`new THREE.Vector3(...w)`). Feeding an array
  where three wants a Vector3 silently makes NaN geometry (a real bug caught in the full-chain PoC).

## Extraction traps (learned from the hotel + cuarto-frio-safran inventory, 2026-07-14)

- **Three module systems coexist in the corpus**: ESM importmap `three@0.160.0` (hotel, edificio,
  cinemex) vs a classic-script bundled `window.THREE` (cuarto-3d). Library modules target the ESM
  importmap form; porting FROM the bundled form means unwrapping globals.
- **Cloudflare mangles `@`**: designs deployed through that pipeline inject the importmap via JS
  with `String.fromCharCode(64)` (edificio:28-40). Keep the shim with any asset shipped that way.
- **World scales differ** (voxel ≈ 0.25 m/unit, edificio 1 m/unit, cuarto-3d custom): every
  absolute dimension baked in a module const MUST become a parameter or scale factor.
- **`toneMapped:false` is mandatory on canvas sprites/labels** under the house ACES rig — without
  it canvas colors wash out; in a non-ACES scene the same sprite oversaturates. Declare the
  assumption in the block header.
- **Baked shadows**: scenes run `shadowMap.autoUpdate=false` + one `needsUpdate`. Geometry added
  after the first frame casts nothing until another bake — builders must document it.
- **Shared-material registries keyed by color int collide** when two semantic uses share a hex;
  mutable per-equipment parts (LEDs, blades) need per-instance materials (buildCooler's pattern).
- **Builders must RETURN their Group** — never `scene.add` inside (several source builders do;
  fix at extraction).
- **Sprite ordering**: banner/halo pairs rely on renderOrder 998/999 + `depthWrite:false`; scenes
  with heavy transparency need global ordering management.
