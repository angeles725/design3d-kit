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

## DELTAS

### A1 — CRITICAL license correction (the document is WRONG here vs our kit)  [ADOPT — high priority]
AI-generated meshes (Hunyuan3D / Rodin) do **NOT** satisfy `SKILL.md` Hard Rule 8
("never use an asset whose license is unknown or more restrictive than CC-BY; license recorded before first use").
- Rodin free-trial output = UNKNOWN license → violates Rule 8.
- Hunyuan3D output = "no rights claimed" is not a recordable CC0/CC-BY string → violates the LETTER of Rule 8.
- Recommendation: explicitly document Hunyuan3D/Rodin as **BLOCKED from the external-mesh [CERT]/gate track**
  (tier-C throwaway/visual props only; never a [CERT] subject; never license-gate-passing), OR a documented
  exception path requiring recorded terms + a clean (non-copyrighted) input image.
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
