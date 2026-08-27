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
