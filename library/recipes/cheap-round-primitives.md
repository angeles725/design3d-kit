# recipe: cheap-round-primitives

How to make equipment read ROUND without paying for it — the r160 segment sweet-spots and the
by-on-screen-size decision rule (from research block **B126**), so nothing is boxy and nothing is
over-tessellated.

**Why**: three.js primitive defaults are tuned for close-up hero shots, not equipment fleets. A
default `SphereGeometry(r, 32, 16)` is 960 tris where 224 reads identically at fleet scale; a default
`CylinderGeometry` radialSegments is 32 where 12–16 is indistinguishable. Multiply that waste across a
plant of tanks/vessels/rollers and the frame budget evaporates on curvature nobody can see.

**Segment sweet-spots (r160)**

- `SphereGeometry` **16×8** (224 tris; the count is `2·W·(H−1)`) — the default 32×16 (=960) is wasteful at any normal size.
- `CylinderGeometry` radialSegments **12–16**, not the default 32.
- `CapsuleGeometry` is **r160 core** — use it directly for rounded bars / handles / pill bodies
  instead of a cylinder + two hemispheres you assemble by hand.
- `LatheGeometry` segments **12–16** for a revolution body (see `makeLatheBody`).

**Fake curvature is cheaper than geometry**

- A baked round-edge **normalMap on a 12-tri box** buys the lit look of a rounded edge for ~89% fewer
  tris than a `RoundedBoxGeometry(segments=1)` (12 vs 108), ~96% vs the default (segments=2, 300).
  Set `normalMap.colorSpace = THREE.NoColorSpace` (a normal map is data,
  not color — sRGB-decoding it corrupts the normals).
- `MeshMatcapMaterial` is the SwiftShader-safe baked-metal shortcut — the lighting is painted into the
  matcap texture, so no runtime lights/env are consulted (cheap and headless-stable).

**Cost rule by on-screen size**

| On-screen size | Approach |
|---|---|
| < 20 px | box + normalMap (never geometric rounding) |
| 20–80 px | Lathe / Cylinder, segments 8–12 |
| > 80 px (hero) | Lathe or `RoundedBoxGeometry` (seg 1–2) + full PBR |
| < 5% screen height | impostor: a `Plane` + `CanvasTexture` billboard |
| varied depth | LOD across the tiers above |

**design3d builders that already do this**

- `makeLatheBody` (`parts/lathe-body.mjs`) — revolution body (tanks/vessels/domes/flanges).
- `makeSuperquadric` (`parts/superquadric.mjs`) — rounded box / chamfered cylinder, one roundness knob.
- `makeSweptTube` (`parts/rmf-frames.mjs`) — smooth curved tube/hose (rotation-minimizing frames).

**Evidence**: research block B126 (r160 cost sweet-spots) · design3d numerical-methods pass.
