# DesignSpec — schema and authoring rules

The DesignSpec is the single persistent contract for a design. It is authored at P2, gated at
P3, and is the ONLY thing the blind reviewer sees besides screenshots. Template:
`assets/designspec.template.yaml`.

## Location

- Spec: `<design-dir>/design-spec.yaml` (design-dir = the design's folder, e.g. `disenos/<equipo>/`
  in an overlay repo, else a new folder named after the design slug).
- Progress: `<design-dir>/runs/progress.yaml` — churns per pass; the spec stays stable.
- Reviews + screenshots: `<design-dir>/runs/`.

## Authoring rules (enforced at the P3 gate)

1. **Evidence-backed dimensions, with confidence.** `dimensions_real` comes from P1 references
   (datasheet, photo with known scale, standard equipment sizes). Cite the source in
   `references[]`. No invented dimensions. Each dimension and each attachment length carries
   `confidence: high|med|low`; `low` values are PRE-AUTHORIZED for amendment at P4 via the
   `refine-spec` action (update the value + evidence) WITHOUT a full P3 re-gate.
2. **Evidence-backed PBR.** Every material entry carries `evidence` plus
   `source: extracted|table|estimated` and `confidence` (cap 0.86 when derived from a single
   image). Metalness near-binary: 0.0–0.05 dielectrics (paint, plastic, rubber, glass),
   0.85–1.0 bare metals. Intermediate values are a spec ERROR. P3 BLOCKS any `estimated`
   material with confidence <0.7 unless its assumptions are stated in the entry.
   `extracted` evidence comes from `research/tools/extract-pbr.mjs` when available in the
   overlay repo (JSON palette + metalness/roughness hints + capped confidence per image).
3. **Animation-ready hierarchy BEFORE codegen.** Every part that moves (fans, dampers,
   couplings, doors) is a named node with an explicit `pivot` and `animation` channel. If it
   isn't in the hierarchy, it will not animate — no retrofitting pivots after geometry exists.
   **Kinematic coherence**: opposed/linked moving parts declare closure geometry — `chord` +
   `pitch` → closure angle `θc = acos(pitch/chord)` — never a naive range; every animation
   channel states its REAL travel (e.g. `0..θc`, not `0..90`).
4. **Attachment contract — no floating child parts.** Every appendage (pipe, duct, cable,
   tube, conduit, handle, hinge — anything cylinder/tube/curve-like hanging off a parent)
   declares `attachment: {parent_socket, local_start, local_end, contact_type,
   embed_depth|overlap > 0, gap_tolerance}`. Build root→tip: the mesh spans `local_start` to
   `local_end`; never center it at an arbitrary transform. The P3 gate blocks structural
   passes while any appendage lacks this block (adapted from Object Sculptor,
   research/sources/design3d-skill/NOTES-object-sculptor.md).
   **L-section uprights**: when spanning a shelf or beam to a SLOTTED-ANGLE (L-section) upright,
   measure to the SHEET FACE of the nearest leg, not to the L's bounding box — the open quadrant
   is inside the bbox but contacts no metal; a span to "post width" can float 20–35 mm clear.
   Assert overlap DEPTH at both ends, measured from the sheet face.
5. **3–5 critical features (hard max 5).** The features that make the object read as
   ITSELF (e.g. "two stacked barrels", "fin lattice reads as aluminum"). Each gets a threshold
   (default 0.75) and must pass INDEPENDENTLY — per-pass failure gates, chosen adversarially:
   what would a lazy model omit? Group repeated parts into one semantic system ("rack-rows",
   not rack-1/rack-2/rack-3). Optionally up to 3 `important_features`: reviewed AVERAGE ≥ 0.65.
6. **Anti-shallow litmus.** The spec FAILS P3 if it could describe many different objects
   instead of this one. "Make the coils look good" is shallow; a fin-lattice description with
   pitch, color, and wear is a spec.
7. **Mandatory scale declaration.** `scale: "1 unit = 1 m"` plus the blockout ratio
   (`"1 voxel = 0.1 m"` for threejs). Real-world sanity: would a 1.8 m person look right next
   to it in the gate screenshot?
8. **Quality contract.** `global_min` (default 0.75) + `perf_budget` (threejs: draws/tris from
   the overlay's device table or TRACK defaults; blender: polys/objects).
9. **Environment block is discovery output, not authoring.** P0 fills `environment.overlays`
   with found paths; never hand-copy overlay content into the spec.

## Pre-spec complexity assessment (before authoring)

Before writing the spec, rate the subject on 8 axes, 0–3 each: silhouette, components,
hierarchy, repetition, material layers, detail, occlusion, action-readiness. Sum → tier:
0–6 simple · 7–14 moderate · 15–24 complex. The tier sets the MINIMUM spec depth (node count,
material entries, feature specificity) and is checked at the P3 gate — a `complex` subject
with a `simple`-depth spec fails P3 as shallow. Record `complexity: {scores, tier}` in the spec.

## Reference-image intake (P1)

Before spec work, give each reference image a suitability verdict `pass | conditional |
reject` (judge: object isolation, silhouette readability, occlusion risk). `conditional` →
proceed with stated assumptions recorded in `references[]`. `reject` (ambiguous target, scene
instead of object, subject dominated by hair/smoke/liquid) → request specific better input
(front/side views, neutral background, close-ups) instead of guessing.

**Video references**: extract and read frames at NATIVE RESOLUTION (via
`research/tools/video-inspect.mjs` or equivalent) before authoring material calls — a
contact-sheet thumbnail (~300 px) is insufficient for metal/colour decisions and can misread
material identity (metalness, colour family) in a way that survives spec authoring and the P3 gate.

## Schema (field reference)

See `assets/designspec.template.yaml` — every field annotated. Required top-level keys:
`design`, `track`, `mode`, `scale`, `complexity`, `environment`, `references`,
`dimensions_real`, `hierarchy`, `materials`, `critical_features`, `quality_contract`,
`camera`, `lighting`. Optional: `important_features` (≤3); `gate_passes` (a declared gate
pass-subset — a YAML list, inline `[materials]` or a block list — for a flat-catalog asset that
closes on a subset of the ladder instead of the full 8-pass climb; `gate-state.mjs` derives exactly
this subset in canonical order, PIPELINE.md §Triage flat-catalog + GATES.md §Verdict;
**MUST be a top-level key — never nested under `quality_contract:` or any other parent**:
`gate-state.mjs` reads `spec.gate_passes` at the top level; a nested value is invisible and
the asset never closes green — it derives the full 8-pass ladder with all passes `locked`);
`colorTarget` (OPTIONAL objective material-read anchor — `{srgb: [R,G,B], deltaE00Max: N, crop: "WxH+X+Y"}`)
replacing the reviewer's subjective "reads as the right material" guess with a CIEDE2000 measurement:
`material-color-probe.mjs` measures the render crop's mean sRGB, records `mechanical.color_delta_e00`,
and `gate-state.mjs` enforces `dE00 <= deltaE00Max` on the materials/surface PASS (research/threejs-block53;
the target `srgb` is the RENDERED value, not the albedo hex — it differs after ACES tonemapping; seed
`deltaE00Max` ~6 for "reads as the right material", tighter for a hero).
**Source rule**: when a source photo or video exists, anchor `srgb` to a geometry-anchored crop of
THAT SOURCE — a render-derived target makes the gate tautological (certifies the render matches
itself, not the subject); the golden-render fallback is for genuinely unavailable source only and
must be labelled REGRESSION DETECTOR in both the spec and the review. Per-node:
`attachment` (required for appendages), `closure` (required for opposed/linked moving parts).
Track-specific: `ui_controls`, `blockout_scale` (threejs — the voxel ratio, e.g. `"1 voxel = 0.1 m"`,
drives the `// SCALE:` comment), `render` (blender: engine, samples).
