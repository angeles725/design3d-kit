# TRACK-BLENDER — Blender MCP track adapter

Drive Blender through an MCP server. Same spec, same gate contract (GATES.md); only the tooling
differs. Facts verified 2026-07-12 — see research/sources/design3d-skill/NOTES-blender-mcp.md
(repo-local overlay path).

## MCP bootstrap (P0, before any P2 work)

Two DISTINCT Blender MCPs exist — detect which is connected; never conflate them.

1. `ToolSearch` query `blender scene screenshot execute`. Identify by tool names:
   - **Community (ahujasid/blender-mcp)**: `get_viewport_screenshot`, `get_scene_info`,
     `execute_blender_code`, PolyHaven/Sketchfab/Hyper3D/Hunyuan3D families. Blender 3.0+.
   - **Official (Blender Lab)**: `get_screenshot_of_window_as_image`, `render_viewport_to_path`,
     `get_objects_summary`, `get_python_api_docs`. Blender 5.1+, pip from git — NOT on PyPI.
2. Record which one in the DesignSpec `environment` block (`mcp: community|official`).
3. Verify liveness with a scene-info call (`get_scene_info` / `get_objects_summary`) BEFORE
   authoring the spec.
4. If neither is present, or the call fails → FAIL FAST with this recipe and STOP:
   - Community (default): `claude mcp add blender -- uvx blender-mcp`. In Blender: install
     `addon.py` (Preferences > Add-ons), enable "Blender MCP", N-panel > BlenderMCP >
     "Connect to Claude" (starts the TCP listener on localhost:9876). Never run
     `uvx blender-mcp` by hand — the client launches it.
   - **WSL2 gotcha**: the community addon binds localhost HARDCODED. With Blender on Windows
     and Claude Code in WSL2 NAT, the stock command CANNOT connect. Use Windows interop:
     `claude mcp add blender -- /mnt/c/Users/<user>/.local/bin/uvx.exe blender-mcp`
     (also avoids the broken-screenshot bug — see gate tooling).
   - Official: Blender 5.1+ with the Lab extension, server via
     `pip install git+https://projects.blender.org/lab/blender_mcp.git#subdirectory=mcp`,
     Blender "Online access" enabled. Same port 9876 — run only ONE addon/server at a time.
   - No-MCP-client fallback (official server installed but not registered as an MCP): drive it
     from the venv directly — `~/.local/share/blender-mcp-venv` python,
     `from blmcp.tools_helpers.connection import send_code`.
   Do NOT fall back to writing Python files the user must run by hand.

## Tool surface

| Need | Community | Official |
|---|---|---|
| Scene inspect | `get_scene_info`, `get_object_info` | `get_objects_summary`, `get_object_detail_summary` |
| Screenshot | `get_viewport_screenshot(max_size=1000)` → PNG | `get_screenshot_of_window/area_as_image` (needs an interactive window) |
| Render to file | bpy render via `execute_blender_code` | `render_viewport_to_path`, `render_thumbnail_to_path` — pass Windows paths (`C:\...`), read from `/mnt/c/...` |
| Run Python | `execute_blender_code` — returns captured STDOUT ONLY: always `print()` results | `execute_blender_code` — assign a JSON-serializable dict to `result`; returns that dict AND captured stdout |
| API docs | — | `get_python_api_docs`, API/manual search tools |
| Assets | PolyHaven / Sketchfab / Hyper3D / Hunyuan3D tools — call the matching `get_*_status` FIRST | — |

Community has NO dedicated create-object/material/render tool — all geometry goes through
`execute_blender_code`.

## Execution discipline

- **Save the .blend BEFORE any execute call.** `execute_blender_code` is arbitrary, unsandboxed
  code; a bad script can destroy the session.
- **Small idempotent batches bounded by the socket timeout** — community 180 s/call; official
  10 MiB max request, 300 s socket. Timeouts are the budget; there is NO fixed object-count
  rule. Each block creates objects by NAME and deletes/replaces same-named leftovers first
  (re-runnable), touching only the current pass's scope.
- Code runs on Blender's MAIN thread — a frozen UI during a long script is normal, not a hang.
- On socket errors, retry the tool call: the server auto-reconnects after a Blender/addon
  restart (the first command after a restart may fail once — retry).
- Set mode + active object + selection EXPLICITLY, and re-set between operator calls (operators
  mutate selection as a side effect). Never assume missing values — inspect the scene first.
- Update the depsgraph before reading computed props (world matrices, modifier results). In edit
  mode use bmesh and flush changes back, or edits are silently lost.
- After every import, check `world_bounding_box` and fix location/scale/rotation.
- **Y-up/Z-up camera basis**: `to_track_quat('Z','Y')` rolls the camera 90° in spec-Y-up
  scenes (Blender is Z-up) — compute the look-at basis yourself with `up = +Y` instead.
- Blender 5.1 EEVEE engine id is `BLENDER_EEVEE` (not `BLENDER_EEVEE_NEXT`).

## Asset strategy (subordinate to the DesignSpec)

Pull external assets ONLY when the spec's `references[]` cites them. When it does (community
track): `get_*_status` check first; specific real-world objects → Sketchfab then PolyHaven;
generic props → PolyHaven then Sketchfab; HDRIs/textures → PolyHaven; unique custom items →
Hyper3D/Hunyuan3D — SINGLE items only, never whole scenes or ground planes, never assembled
from separately generated parts; duplicate via Python instead of regenerating. Fall back to
scripted primitives when integrations are off or generation fails. Always `get_scene_info`
first; screenshot BEFORE and AFTER every change.

## Working structure

- **One asset at a time.** Model, gate, and save each asset before starting the next — never
  generate a whole scene in one shot.
- **Collections mirror the spec hierarchy 1:1.** Every `hierarchy` node = a named object/empty;
  every `pivot` = the object's origin or a parent empty at that exact position.
- **Incremental saves**: save the `.blend` after every passed pass (`<design>-<pass>.blend` or
  versioned save-as) so a failed pass never destroys a passed one.

## Pass ladder (P4b → P5b)

| Pass | Content |
|---|---|
| blockout | primitive massing (cubes/cylinders) per hierarchy node; proportions from `dimensions_real` |
| structural | modifiers/booleans/bevels; part separation matching the spec hierarchy |
| materials | Principled BSDF per spec `materials[]` — same near-binary metalness rule (0.0–0.05 dielectric, 0.85–1.0 metal), roughness from evidence |
| lighting-camera | key/fill/rim per spec `lighting`; camera per spec `camera` (azimuth/elevation/focal) |
| anim-rig | armature/empties exactly at spec pivots; constraints for spec `animation` channels (spin, slide, open) |
| optimization-export | decimate/merge to `perf_budget.polys`; apply transforms; glTF export if spec asks |

## Gate tooling (per GATES.md contract)

- **Mechanical**: `execute_blender_code` printing JSON `{polys, objects, materials}` totals vs
  `quality_contract.perf_budget` (community: `print()` it — stdout is the only return channel).
- **Capture (per pass)**: viewport screenshot. WARN — community `get_viewport_screenshot` is
  BROKEN across the Windows-Blender / WSL-server boundary (issues #187/#189; fix PRs unmerged):
  the server hands Windows Blender a Linux `/tmp` path to write. Workaround: the Windows-interop
  uvx launch from bootstrap; else fall back to render-to-file via `execute_blender_code` writing
  to a Windows-visible path (`C:\...`) and read it from `/mnt/c/...`.
- **FINAL gate (P6)**: real render — `render_viewport_to_path` (official) or bpy render via
  execute code — EEVEE default, Cycles when `spec.render.engine` demands it, at the spec camera.
- **Blind review**: same protocol and schema as GATES.md (review JSON, `critical_features[]`) —
  reviewer sees spec + capture only.

## Delivery kit (P7)

| Deliverable | How |
|---|---|
| Hero render(s) | final-gate render at spec camera (+ optional turntable angles) |
| `.blend` | final saved file, collections clean, transforms applied |
| `.glb` (optional) | glTF export via `execute_blender_code` (`bpy.ops.export_scene.gltf`) when the spec or user asks |

Next milestone (validated blockout → full track): materials+lighting slice → EEVEE render
gate → glb export → load into a threejs harness page — the round-trip IS the acceptance test.
