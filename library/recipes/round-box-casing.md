# recipe: round-box-casing

`RoundedBoxGeometry` — soft-beveled rectangular casings/cabinets that `makeSuperquadric` and
`makeLatheBody` cannot serve (a box is not axially symmetric, and a superquadric is not a crisp
rectangular prism). ZERO extra dependency: it ships in `three/addons`.

**When**: a hero (>80 px on screen) rectangular enclosure — a control cabinet, a boxy AHU housing,
a junction panel — where the sharp CAD-box edges read as unfinished. For anything smaller, prefer a
flat box + the round-edge normalMap (`round-edge-normal` / `cheap-round-primitives`): geometry
rounding is only worth its triangles up close.

**One-liner** (in-page; `three/addons` is on the design's importmap):

```js
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
// segments = 1 is the sweet spot (108 tris); 2 is the default (300) and rarely worth it at gate res.
const geo = new RoundedBoxGeometry(width, height, depth, 1, radius);   // radius = corner fillet
const mesh = new THREE.Mesh(geo, material);                            // caller injects the material
mesh.castShadow = true; mesh.receiveShadow = true;
```

**Rules a re-implementation must keep**

1. `segments = 1` unless it is a close hero — the 2nd bevel segment doubles the corner tris for a gain
   invisible at gate resolution (research block **B126 §B**).
2. `radius` is the corner fillet in world units; keep it small (a few mm at 1 unit = 1 m) or the box
   reads as an inflated pillow, not machined metal.
3. It generates its own UVs + normals — feed the packed procedural metallicRoughness
   (`procedural-pbr-canvas`) straight onto its `roughnessMap`/`metalnessMap`.
4. **Tier it by on-screen size** (the `cheap-round-primitives` cost rule): <20 px → flat box +
   round-edge normalMap; 20–80 px → box, maybe normalMap; >80 px hero → `RoundedBoxGeometry(…, 1, r)`
   + full PBR. Round geometry only where the silhouette edge is visibly sharp.

**Cost**: ~108 tris at `segments=1` vs 12 for a flat box — spend it only on a visible sharp edge.

**Source**: `three/addons` `RoundedBoxGeometry` (r160, MIT, zero extra dep) · research block **B126 §B**.
