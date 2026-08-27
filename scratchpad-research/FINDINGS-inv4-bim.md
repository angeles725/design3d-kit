# FINDINGS — inv4 — BIM (ThatOpen / web-ifc) (deltas for v1.18)

Lane: BIM cluster. Shallow-cloned and inspected ACTUAL source, not READMEs.

## Verified sources
- **`@thatopen/components`** (engine_components) — MIT, active (696★, 2026-07), **framework-agnostic (no React)**,
  built ON three.js (peer dep). Monorepo: `@thatopen/components` v3.4.8 + `@thatopen/components-front` v3.4.4.
  Real classes: Worlds, OrthoPerspectiveCamera, Clipper, Raycasters, IfcLoader, FragmentsManager, Classifier,
  **DxfManager/DxfExporter**, Postproduction, Highlighter, measurement tools (Length/Area/Angle/Volume).
  Doc claim check: dimensions ✓, post-processing ✓, DXF ✓; "floor-plan navigation" = STALE wording (no `Plans`
  class now; done via Views+Clipper+DrawingEditor top-down projection).
- **`web-ifc`** (engine_web-ifc) — **MPL-2.0** (NOT MIT — file-level copyleft), active (1022★, 2026-08),
  C++/emscripten WASM, **zero runtime deps, framework-agnostic**. Read AND write CONFIRMED
  (`IfcAPI`: OpenModel/GetLine/GetGeometry/StreamAllMeshes + CreateModel/WriteLine/SaveModel).
  `SetWasmPath` / local wasm path → **fully offline-capable.**
- **`@thatopen/fragments`** — MIT, active (204★). "Fragment" = open binary BIM geom+data format on Google FlatBuffers;
  the geometry-STREAMING core. Current pipeline: **IFC → web-ifc → Fragments (FlatBuffers) → worker-streamed three.js meshes.**
  The doc's flat "tools based on three.js" description PREDATES this fragments/worker re-architecture.

## Offline-gate hazard (measured in source)
- `web-ifc`: offline-clean (vendorable .wasm).
- `engine_components` `IfcLoader.autoSetWasm()` fetches `https://unpkg.com/web-ifc@<ver>/`
  (`core/src/fragments/IfcLoader/index.ts:231-247`); `FragmentsModels.getWorker()` hardcodes
  `https://unpkg.com/@thatopen/fragments@<ver>/dist/worker/worker.mjs`
  (`engine_fragment/.../FragmentsModels/index.ts:64`). Both would trip the kit's `assertNoNetwork` gate.
  Self-hostable but manual, plus a Web Worker that fights the single-file inline-module build.

## DELTA — B1: cherry-pick `web-ifc` ONLY as an OPTIONAL Phase-1 BIM-intake track  [ADOPT-narrow]
- Verdict: **adopt web-ifc only; do NOT adopt engine_components or fragments.** For procedural HVAC authoring the
  whole ThatOpen viewer stack is overkill and DUPLICATES the kit's own three.js scene ownership + R3F Phase-2 dashboard.
  web-ifc alone gives `IFC → BufferGeometry` (OpenModel → StreamAllMeshes/GetGeometry) with no framework, offline-clean.
- Complementary, NOT redundant: ThatOpen's `DxfExporter` EMITS DXF *from* 3D (output); the kit's DWG ladder
  (libredwg→ODA→ezdxf) READS DXF/DWG *into* the pipeline (input). Opposite directions.
- License note for Rule 8 provenance: **web-ifc is MPL-2.0**, not MIT — record it as such; fine to bundle in a
  self-contained deliverable.
- Paths: optional new `references/TRACK-*` intake note or `references/PIPELINE.md §Triage` (Route: "read this client's IFC");
  gate behind a real "ingest a real .ifc" need, alongside the existing DWG ladder.
- Cross-ref: coordinate with three.js corpus `threejs-block32.md` (BIM/building shells) per i1.

## DELTA — B2: OPTIONAL IFC EXPORT track (emit, not just read)  [ADAPT — optional]
The doc's real interop endpoint (lines ~200-222, ~6315-6331) is the kit EMITTING IFC so downstream BIM tools
know elements are CONNECTED (ports), not merely visually touching: `IfcPipeSegment`, `IfcPipeFitting`,
`IfcDuctSegment`, and especially **`IfcDistributionPort`** (buildingSMART). web-ifc has a CONFIRMED write path
(`CreateModel` / `WriteLine` / `WriteRawLineData` / `SaveModel` — verified in the BIM audit), so this is
feasible with the SAME zero-dep, offline WASM we already adopt for intake.
- Mapping: the kit's port/connection graph — the spatial engine's typed `connect(portA,portB)` relations (S1/S2)
  plus `hvac-fittings` port frames (elbowPortFrames) — projects directly onto `IfcDistributionPort` +
  segment/fitting entities. Our ports ALREADY carry position + direction (design §9a), which is what a
  distribution port needs.
- Verdict: ADAPT as an OPTIONAL export track, gated behind a real "hand this off to BIM/Revit" need (mirror the
  intake gate). NOT default — most designs never leave the kit. Paths: `references/PIPELINE.md §Delivery` (an
  optional IFC-emit step) + the same web-ifc WASM (MPL-2.0) used for intake.
- Note: this is the OUTPUT twin of B1 (intake) and of ThatOpen's DxfExporter (2D DXF out); IFC-out carries the
  connectivity graph, DXF-out carries 2D drawings — different downstream consumers.

## Notes (completeness critic edges)
- B3 — NVIDIA Isaac Sim builds occupancy maps FROM collision geometry (doc ~7435): REFERENCE-ONLY. It validates
  the DETERMINISTIC (non-probabilistic) occupancy grid the Spatial World Model design chose — Isaac + OctoMap
  both confirm rasterizing known volumes into an occupancy grid is standard practice. No adoption; concept only.
- OUT-OF-SCOPE — BACnet / Niagara / BMS digital-twin endpoints (doc ~222/354/909-911/1633) are repeatedly named
  as the FINAL target of the pipeline, but they are external building-automation PROTOCOLS, outside a 3D-design
  kit's remit. Explicitly OUT OF SCOPE (documented as a decision, not an omission): the kit ends at the 3D/IFC
  deliverable; wiring it to a live BMS is a separate integration concern.

---
# investigacion4.md — BIM-lane verdict [inv4doc-BIM]
Full outline + verification done (all 2113 lines mapped). BIM/viewer repos verified live (gh + README, 2026-08-26).
Answers i1's three questions directly.

## Verified (BIM lane)
| Repo | ⭐ | SPDX | Status | Offline? | Verdict |
|---|---|---|---|---|---|
| `web-ifc` (ThatOpen/engine_web-ifc) | 1022 | MPL-2.0 | active | Yes (host .wasm) | KEEP — the anchor (intake + export) |
| `web-ifc-three` | 593 | MIT | **DEPRECATED** ("USE COMPONENTS INSTEAD") | — | REJECT |
| `web-ifc-viewer` | 1027 | MIT | **DEPRECATED** (same banner) | — | REJECT |
| `xeokit-sdk` | 928 | **AGPL-3.0** (dual/paid) | active | Yes | REJECT (license blocker) |
| `xeokit-bim-viewer` | 556 | **AGPL-3.0** (dual/paid) | active | Yes | REJECT (license blocker) |
| `IfcOpenShell` | 2734 | LGPL-3.0 | active | No (C++/Python desktop/server) | REFERENCE-ONLY |
| `Online3DViewer` (kovacsv) | 3670 | MIT | active | Yes (vanilla, vendor wasm) | OPTIONAL multi-format viewer surface |
| `thingraph/bim-viewer` | 322 | (Vue-coupled) | — | — | SKIP (framework-coupled, minor) |

## Answers to i1's questions
1. **IfcOpenShell vs web-ifc** — NOT the same lineage. IfcOpenShell is the older, mature **C++/Python** IFC
   toolkit (LGPL-3.0), desktop/server-side, no browser build → REFERENCE-ONLY for our browser-first kit (a
   server-side option only if we ever need heavy off-browser IFC processing). web-ifc is the **WASM/TS** engine,
   browser-native + offline → stays the correct intake/export primitive. Related in PURPOSE (both parse IFC),
   different runtime/lineage. No change to the web-ifc adoption.
2. **web-ifc-viewer / web-ifc-three** — add NOTHING over our own three.js scene ownership, AND both are
   explicitly DEPRECATED upstream ("USE COMPONENTS INSTEAD"). Confirms the earlier engine_components rejection
   (CDN) and extends it: the standalone loaders are dead ends. Reimplement on bare web-ifc (already do).
3. **xeokit** — precisely AGPL-3.0 (dual: AGPL or paid commercial). For a distributable/embeddable kit AGPL is
   a HARD blocker unless we buy the commercial license or make the whole kit AGPL. Reject; reference-only.

## Kit delta (BIM)
- No new BIM ADOPTION beyond web-ifc — it remains the single durable, MPL-2.0, offline, framework-agnostic
  primitive (intake + the B2 export idea). Online3DViewer (MIT) is the one worth noting as an OPTIONAL
  vendorable multi-format viewer surface / architecture reference if a multi-format preview is ever wanted.
- HANDED TO inv1 (CAD-kernel lane, tagged [CAD-KERNEL-inv1]): occt-import-js (LGPL-2.1, the pragmatic slim
  OCCT-WASM STEP/IGES/BREP→JSON intake — better than the stale/heavy opencascade.js), replicad (MIT core),
  OCCT/opencascade.js, CadQuery (Python, ref-only), CQ-editor, FreeCAD, OpenSCAD, JSCAD, LibreCAD, Mayo (Qt,
  ref-only). three-mesh-bvh + three-gltf-viewer tagged [GEOMETRY-inv3].
- Doc accuracy note: investigacion4's star counts were "approximate" and several are now stale-low (web-ifc,
  xeokit, replicad, occt-import-js all grew); no FABRICATED repos in investigacion4 (unlike investigacion.md).
