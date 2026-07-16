# recipe: layer-visibility-controller

Central layer controller (roof/walls/media/labels/cutaway) where EVERY visibility rule lives in
one `apply()` — setters only mutate state and call it.

**Why**: interior ceilings once stayed visible with the roof hidden because their rule lived in a
second code path; stacked elements must follow their parent layer from ONE derivation.

**Exemplar**: `disenos/cinemex-hvac-lorawan/src/controllers/layers.js` —
`createLayerController({groups, renderer, materials, clippingPlane})`; see `apply()` computing
`architectureEnabled`/`engineeringEnabled` then deriving every `groups.*.visible` plus
`renderer.localClippingEnabled` from the same state object.

**Rules a re-implementation must keep**

1. ONE `apply()`: no setter (`setLayer`, `setView`, `setVisualMode`, `setCutaway`, `hydrate`)
   touches `.visible` directly — all recompute through the single function, so dependent layers
   (child follows parent AND its own toggle) can never diverge.
2. Setters validate against frozen name lists and return false on unknown names — a typo'd layer
   is loud, not a silent no-op on the scene.
3. `hydrate(state)` for URL restore goes through the same validation + single `apply()`.

**Evidence**: cinemex `src/controllers/layers.js` · p6-final L2 0.78.
