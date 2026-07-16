# recipe: canvas-board-recipes

Menu boards, posters and diagram boards as procedural CanvasTexture artwork packed into one
shared atlas — draw, never download; frames selected deterministically by URL keys.

**Why**: downloaded artwork is non-reproducible and license-fraught, and per-board textures
exploded the texture count — the atlas + procedural draw keeps captures byte-stable.

**Exemplar**: `disenos/cinemex-hvac-lorawan/src/scene/surfaces.js` —
`createSurfaceAtlas({THREE, documentObject, anisotropy})` (~L867), `SURFACE_ATLAS_TILES` /
`SURFACE_ATLAS_LAYOUT` (~L543), `createPosterArtwork(frame, variant)` + `drawPoster`,
`createMenuDisplayArtwork(frame, style)` + `drawDisplay`/`drawScreen`, `POSTER_VARIANTS`;
frame choice rides the query keys `poster_frame` / `display_frame` (0|1, see
`src/controllers/query-state.js`).

**Rules a re-implementation must keep**

1. DRAW, don't download: every board is 2D-context vector work (flat fills, stub-safe) — no
   fetched images, so evidence frames reproduce anywhere.
2. Deterministic frames: animated boards expose exactly the states the query contract names
   (`poster_frame`/`display_frame`), and a pinned URL always draws the same pixels.
3. One atlas texture with a frozen tile layout, `SRGBColorSpace`, `toneMapped:false` where boards
   are emissive — per-board textures are the anti-pattern.

**Evidence**: cinemex `src/scene/surfaces.js` · p6-final L4 0.80 (2026-07-15).
