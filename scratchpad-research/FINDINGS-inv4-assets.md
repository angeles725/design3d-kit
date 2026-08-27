# FINDINGS — inv4 — ASSET GENERATION + LICENSE (deltas for v1.18)

Lane: AI asset generation / Blender automation. Verified against real source + license files.

## Verified sources
- **Blender MCP** canonical = `ahujasid/blender-mcp` (MIT, ~26k★, active today). NOT "ahujsong".
  MCP tools (from `server.py` @mcp.tool decorators): get_scene_info, get_object_info, get_viewport_screenshot,
  execute_blender_code + Poly Haven family + Sketchfab family + Hyper3D Rodin family + Hunyuan3D family.
  **All geometry/materials go through `execute_blender_code`** — there are NO dedicated primitive/material tools.
- **Hunyuan3D** = `Tencent-Hunyuan/Hunyuan3D-2` / `-2.1`. License = Tencent Community (NOT OSI). EU/UK/Korea
  territorial exclusion on the model; no-competing-AI-training clause; commercial use terminates >1M MAU.
  Output = Tencent "claims no rights in Outputs" — a DISCLAIMER, not a CC0/CC-BY grant.
- **Hyper3D Rodin** = hosted SaaS (hyper3d.ai), no open repo. Output license tier-dependent; **free-trial output license unknown/unconfirmed.**
- **Poly Haven** = CC0 (clean). **Sketchfab** = per-model licenses (CC0..CC-BY-NC-ND + Standard); blender-mcp
  prints license in SEARCH preview but does NOT persist/attach it on download.
- **TRELLIS** = `microsoft/TRELLIS` (13.5k★, MIT CODE, active 2026-06; doc's "~13.4k" accurate) and
  `microsoft/TRELLIS.2` (10.8k★, active 2026-07 — CONFIRMED to exist; the doc's O-Voxel/<100ms claims are
  TRELLIS.2's and not re-verified in detail). **CRITICAL: the repo specifies NO license/terms for the 3D mesh
  OUTPUT it generates** ("lacks explicit guidance on output asset licensing", ambiguous for commercial use).
  MIT covers the CODE, not the generated asset.

## DELTAS

### A1 — CRITICAL license correction (the document is WRONG here vs our kit)  [ADOPT — high priority]
AI-generated meshes (Hunyuan3D / Rodin / **TRELLIS**) do **NOT** satisfy `SKILL.md` Hard Rule 8
("never use an asset whose license is unknown or more restrictive than CC-BY; license recorded before first use").
- Rodin free-trial output = UNKNOWN license → violates Rule 8.
- Hunyuan3D output = "no rights claimed" is not a recordable CC0/CC-BY string → violates the LETTER of Rule 8.
- TRELLIS output = license UNSPECIFIED. TRAP: MIT CODE does NOT make the OUTPUT MIT — a user assuming
  "MIT repo ⇒ free assets" would violate Rule 8 unknowingly. Same verdict as Hunyuan3D/Rodin.
- Recommendation: explicitly document Hunyuan3D/Rodin/TRELLIS as **BLOCKED from the external-mesh [CERT]/gate
  track** (tier-C throwaway/visual props only; never a [CERT] subject; never license-gate-passing), OR a
  documented exception path requiring recorded terms + a clean (non-copyrighted) input image. State the
  MIT-code-≠-licensed-output trap explicitly so it isn't rediscovered the hard way.
- Paths: `SKILL.md` Hard Rule 8 + `disenos/catalog/EXTERNAL-ASSETS.md`.

### A2 — Three-tier geometry sourcing made explicit  [ADOPT]
(A) procedural-EXACT for pipes/ducts/fittings — DN150==DN150, real elbows = exact arcs R=1.5D, flexible = cubic Bézier ONLY; never AI-melted curves.
(B) real GLB library (catalog-first) for equipment (pumps/chillers/AHU/valves).
(C) AI-gen ONLY for special props — and license-gated OUT of the CERT track per A1.
- Paths: `SKILL.md` Execution Step 0 (catalog-first already present) + TRACK notes. Reinforces existing catalog-first rule.

### A3 — Blender MCP doc corrections  [REFERENCE]
Canonical repo `ahujasid/blender-mcp`; geometry/materials only via `execute_blender_code` (save .blend first — already in kit);
`get_viewport_screenshot` broken across the WSL↔Windows-Blender boundary (kit already documents issues #187/#189; render-to-file workaround).
Sketchfab license is NOT auto-persisted by the tool → provenance schema (url·author·license·sha256) must be filled manually; for AI-gen meshes there is often no upstream author/url/license to record at all.
- Paths: `references/TRACK-BLENDER.md` (community MCP section).

### A4 — Infinigen (from investigacion2.md) — PROCEDURAL generator, a WEAKER block than neural gens  [nuance]
`princeton-vl/infinigen` — BSD-3-Clause CODE, 7.2k★, active (pushed 2026-08), Python/Blender. **PROCEDURAL**
(rule/node-based math), NOT a trained neural net. Critical distinction for Rule 8:
- No training-data provenance risk (nothing scraped) — unlike Hunyuan3D/Rodin/TRELLIS. An Infinigen output is a
  deterministic function of BSD-licensed code + a seed, so the reasonable reading is "your own generation, yours
  to use."
- BUT the repo states NOTHING explicit about generated-asset licensing. So under the LETTER of Rule 8
  ("known license ≥ CC-BY, recorded before first use") it still lacks a recordable CC0/CC-BY string.
- Verdict: MUCH weaker block than the neural generators (no territorial exclusions, no training-data risk, no
  "we claim no rights" disclaimer). Recommendation: allow Infinigen as a tier-C source with provenance recorded
  as "procedural output of BSD-3-Clause Infinigen, no explicit output grant" ([INFER], never [CERT]) — OR seek a
  one-line maintainer clarification to promote it. Do NOT lump it with Hunyuan3D/Rodin/TRELLIS in a blanket
  block; the risk profiles differ. (Confirmed with inv2: Infinigen + BlenderMCP are the only asset/license items
  in investigacion2; no NEW AI generator surfaced there.)
