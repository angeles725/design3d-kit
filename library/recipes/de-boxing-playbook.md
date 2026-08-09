# recipe: de-boxing-playbook

Turn a BOXY / voxel equipment asset into a smooth REALISTIC variant with the rounded-equipment
toolkit — WITHOUT touching the original. Author a `<slug>-realista-v1.html` companion that imports the
builders and re-creates the same real equipment at the same dimensions.

**The mapping — boxy part → builder:**

| Real-world form | Builder | Notes |
|---|---|---|
| Cylindrical vessel / tank / boiler with dished heads | `makeLatheBody(vesselProfile(...))` | one surface of revolution; dished heads built into the profile |
| Rounded housing / pump volute / chamfered body | `makeSuperquadric({e1,e2 ≈ 0.3–0.4})` | one roundness knob per axis |
| Curved pipe / hose / duct run | `makeSweptTube(waypoints, {radius, targetEdgeLength})` | RMF frames — no spiral twist |
| Rectangular cabinet / skid / bonnet | `RoundedBoxGeometry(w,h,d,1,r)` | `segments=1` sweet spot (108 tris) |
| Flat rectangular face that needs "soft" edges up close | flat box + `round-edge-normal` normalMap | ~89% fewer tris than geometric rounding |
| Flange ring / handwheel / bezel | `TorusGeometry` (+ a short cylinder stub) | |
| Motor barrel / valve body / gauge dial | `CylinderGeometry` 12–16 seg | `cheap-round-primitives` sweet spots |

**`vesselProfile` idiom** (inline helper, for `LatheGeometry` — revolve around Y, x = radius, y = height):
a dished BOTTOM head `a=0..π/2: x=R·sin a, y=hHead·(1−cos a)` → straight WALL `(R,hHead)→(R,H−hHead)` →
a dished TOP head `a=0..π/2: x=R·cos a, y=(H−hHead)+hHead·sin a`. Dedupe the shared wall points.
`hHead ≈ 0.25·R` for a semi-ellipsoidal head. A HORIZONTAL vessel: build it upright, then
`group.rotation.z = Math.PI/2` onto the Z axis and drop it on saddle supports.

**Materials — the packed-map MULTIPLIER rule (the trap that made the first tank read glossy):**
`makeProceduralMetalRough({roughnessBase, metalness})` paints roughness→GREEN, metalness→BLUE. Assign
the ONE returned texture to BOTH `material.roughnessMap` AND `material.metalnessMap`, and **set
`material.roughness = 1` and `material.metalness = 1`** — three MULTIPLIES map × scalar, so a scalar of
`0.28` over a `0.28` map reads `0.078` (mirror-glossy, wrong). Keep the scalars at **1** and let the map
drive. **Satin, not mirror:** for painted/industrial equipment keep `roughnessBase ≈ 0.45–0.55` and
`material.envMapIntensity ≈ 1.0` — a low roughness (0.3) + high envMapIntensity (1.4) turns every part
into a chrome MIRROR (caught by user feedback on the compressor de-box). Enamel panels:
`roughness ≈ 0.55–0.62`, `envMapIntensity ≈ 0.7–0.85`. NEVER `scene.environmentIntensity` (inert in r160; see
`brushed-stainless-recipe`).

**Real dimensions:** read them from the voxel original (voxel scale × voxel counts) and keep the SAME
metres + layout, so the variant is a true like-for-like, not a re-imagining.

**QA hooks + framing:** install `__qaRenderInfo` + `__qaFraming` (SUBJECT = the equipment group) AFTER
all async builders resolve; set `data-app-ready='true'` LAST. Frame the hero so the subject is
`fullyVisible` AND fills a good area — the framing gate (`research/tools/framing-probe.mjs`) requires
full visibility and rejects too-small / too-cropped; a genuinely wide row passes on one-axis fill.

**Proof:** render headless (`capture.mjs`); a transient `unpkg` QUIC error is INFRA — retry the capture
once. Confirm `console_clean` + framing `ok:true`, then LOOK at the PNG.

**Landed proofs:** `disenos/showcase-rounded/`, `disenos/tanques/tanques-expansion-buffer-realista-v1.html`,
`disenos/filtrado-alberca/filtrado-alberca-realista-v1.html`.
