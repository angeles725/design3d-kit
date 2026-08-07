# recipe: transmission-free-glass

SwiftShader-SAFE glass for oven/chamber doors seen over a visible interior rack. Use a plain
`MeshStandardMaterial` with `transparent + opacity`, DELIBERATELY NOT `MeshPhysicalMaterial`'s
`transmission` — physical transmission compiles a heavy shader that stalls the headless SwiftShader
shader-compile (the same failure family as clearcoat/RectAreaLight: probe returns 0 draws, capture
times out). A tinted, low-roughness, semi-opaque standard material reads convincingly as door glass
in a gate capture at a fraction of the cost.

**Why**: horno-rotativo and camara-fermentacion both needed a glass door in front of a spinning
rack; both passed the materials gate at 0.78 using opacity-based glass, no transmission.

**Coupling notes**: assumes the house ACES rig. `opacity 0.4–0.42` measured good — enough to read
the rack behind it while still looking like glass; a dark tint (`color:0x1a2426`) keeps it from
washing to white under the bright IBL. Put the glass mesh in front of the interior geometry so the
rack is visible through it; the stainless door frame is a separate opaque mesh.

**Exemplar / code** — `disenos/nave-panccadia/equipos/horno-rotativo/horno-rotativo.html:104` (also
`camara-fermentacion/camara-fermentacion.html:103`):

```js
// SwiftShader-safe door glass — opacity, NOT MeshPhysicalMaterial.transmission
const matGlass = new THREE.MeshStandardMaterial({
  color:0x1a2426, metalness:0.0, roughness:0.12, transparent:true, opacity:0.42
});
// ... the glass sits in front of the interior rack; a stainless frame is a separate opaque mesh ...
const glass = box(1.02, 1.5, 0.02, matGlass); glass.position.set(-0.06, 1.05, D/2-0.02);
```

**Rules a re-implementation must keep**

1. NEVER `MeshPhysicalMaterial.transmission` in the headless threejs track — it stalls SwiftShader.
2. `transparent:true` + `opacity ~0.4` + low `roughness (~0.12)` + a dark tint = door glass.
3. Place the glass mesh in front of the interior geometry so the rack reads through it.

**Evidence**: horno-rotativo materials PASS 0.78 · camara-fermentacion materials PASS 0.78.
`disenos/nave-panccadia/equipos/horno-rotativo/runs/materials-attempt1.review.json`.
