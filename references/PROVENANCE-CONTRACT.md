# Provenance Contract — measured vs absent-in-source (cross-lane)

Single source of truth for how **measurement provenance** is represented and **preserved**
across the whole axis: `{CAD·foto·spec} → intake → voxel → realista → viewer`. Owned by the
integrator (inv1); threaded by intake (inv4), spine (inv2), and the voxel→realista transform (inv3).

**Why this exists.** Real-project retro COB-IM2 L4 (HVAC ductería traced from DWG, verified 2026-08-27)
surfaced two failures that a scattered, per-lane field vocabulary would let recur:

- **P3** — duct height is **38.3% absent in the source**. `h = null` is the CORRECT answer, proven
  below chance: a real width finds a compatible label at <5 m in only **11.9%** of no-size runs vs
  **49.4%** with a random staircase width. Any parser "fix" that fabricates a height is inventing data.
  The intake must *represent unknown* and that fact must survive to the viewer.
- **P4** — the extractor snapped a raw ~82.5 mm (wrong, interior pair) up an imperial staircase to
  4″ = 101.6 mm, landing near the true ~105 mm **by accident**. The snap silently hid a ~20 mm raw
  measurement error. Only the raw value exposes the error, so the raw value must not be discarded.

## 1. Certainty enum (extends the existing `certainty` field)

The kit already tags objects/geometry/scale with `certainty`. This contract fixes the closed set of
values and adds one:

| value | meaning | rule |
|---|---|---|
| `MEASURED` | read directly from an authoritative source entity (a DIMENSION, an ATTRIB SIZE, an MTEXT bound to a run, a block-def bbox) | trustworthy as engineering data |
| `INFER` | derived, not read: CV/route-2 recalibration, catalog default, a snap applied without a retained raw | at most a hint; never `[CERT]` |
| `ABSENT_IN_SOURCE` | **NEW.** the source genuinely does not encode this value | value MUST be `null`; **never fabricate**; downstream must not default-fill it |

`ABSENT_IN_SOURCE` is distinct from `INFER`: inferred means *we guessed*, absent means *the drawing
does not say, and we refuse to guess*. Distinct from a missing field: an omitted key is ambiguous
("not parsed yet?"); an explicit `ABSENT_IN_SOURCE` is a certified fact ("we looked; it isn't there").

## 2. Per-quantity envelope (RATIFIED shape)

One object legitimately mixes states — a duct run can be width-measured, height-absent, bod-measured on
the same run — so provenance is carried **per measured quantity**, as an **envelope** (value +
provenance travel together, never as parallel arrays a stage could desync). Shape credited to inv2's
strawman, refined here and RATIFIED — wire this verbatim:

The envelopes live under **one fixed container key — `obj.fieldProvenance`** — keyed by quantity name
(RATIFIED: all lanes emit and read this exact key; do not inline the envelopes on the object or invent
`obj.provenance`/`obj.prov`):

```js
obj.fieldProvenance = {
  // each measured quantity is an envelope, threaded unchanged entry→voxelize→realista→viewer:
  width:     { v: 0.1016, prov: 'measured', raw: 0.0825, snap: 'imperial-4in', deltaMm: 19.1 },
  height:    { v: null,   prov: 'absent-in-source' },  // P3: h=None is a FACT; v is null iff absent
  bod:       { v: 3.20,   prov: 'measured' },          // P3 fact A: vertical POSITION (~99% known)
  topExtent: { v: null,   prov: 'absent-in-source' },  // P3 fact B: superior EXTENSION (often unknown)
}
```

- **`prov` domain (closed set):** `'measured' | 'inferred' | 'absent-in-source'`. Maps 1:1 to the
  existing `certainty` tokens (`MEASURED`/`INFER`) plus the new absent state. `v` is `null` **iff**
  `prov === 'absent-in-source'`.
- **`.v` is the number**; a consumer that only wants the value reads `.v`. Gates and the viewer read
  `.prov` to render absent-vs-measured distinctly and to refuse fabrication.
- **A snap is metadata, not a provenance class** (§3): `prov` stays `'measured'` when the value came
  from a real measurement; `raw`/`snap`/`deltaMm` expose the quantization error alongside it.
- **Back-compat:** `obj.size = [width.v, height.v, …]` stays as the numeric PROJECTION for existing
  array consumers; the envelopes are the source of truth. Object-level `certainty` (summary) = the
  weakest envelope prov (`absent-in-source` < `inferred` < `measured`).

### Two-fact rule (P3)

Vertical **position** (BOD elevation) and vertical **extension** (height) are **two independent facts**
with independent provenance. In COB-IM2, BOD/position is ~99% `MEASURED` while superior extension is
often `ABSENT_IN_SOURCE`. Never collapse them into one "vertical known/unknown" flag.

### Viewer mapping (must match what the viewer already paints)

The provenance state maps to the existing viewer legend — the contract's job is to *carry the fact the
viewer already renders*, not to introduce a parallel scheme:

| field state | viewer |
|---|---|
| `height: MEASURED` (real cota) | **white** |
| `height: INFER` or `ABSENT_IN_SOURCE` (assumed / unknown top) | **orange** |
| `bod` (vertical position) | **separate channel** from height — its own provenance, painted independently |

So `fieldProvenance.height` drives white-vs-orange, and `fieldProvenance.bod` is never merged into that
decision. A run can be white-on-BOD (position known) yet orange-on-height (top unknown) at once.

## 3. Raw-vs-snapped preservation (P4)

Whenever a raw measurement is quantized (imperial staircase, DN nominal, grid snap), the envelope keeps
**both** the snapped nominal and the pre-snap raw, on the same quantity:

```js
width: { v: 0.1016, prov: 'measured', raw: 0.0825, snap: 'imperial-4in', deltaMm: 19.1 }
//       └ nominal (engineering: DN math, clash tol)   └ raw (QC: drift = |v − raw|)
```

- `.raw` is authoritative for **error detection / QC**; `.v` (nominal) is authoritative for **engineering**.
- `deltaMm = |v − raw|·1000` is a *signal*, not a pass — surface it; never let the snap swallow it
  (COB-IM2: interior-pair 82.5 mm snapped to 4″ = 101.6 mm, masking a ~19 mm raw error that only `.raw`
  reveals; the true exterior pair was ~105 mm — see P4).
- If no snap was applied, `raw`/`snap`/`deltaMm` are omitted (raw == nominal).
- **Exterior-flank rule (P4):** the extractor must select the EXTERIOR line pair, not the interior;
  exposing `.raw` is what makes a wrong-pair selection visible instead of accidentally-masked by the snap.

### Divergence gate (P4 — exposing raw is not enough; a gate must FLAG it)

Exposing `.raw` only matters if a consumer *acts* on the divergence. The **spine** flags/fails-loud when
`deltaMm ≥ snapDivergenceGateMm`:

```js
divergenceMm = |v − raw|·1000              // already carried as deltaMm
flag  = divergenceMm ≥ snapDivergenceGateMm
```

- **`snapDivergenceGateMm` is configurable** (per drawing / per ladder), because the healthy divergence
  scales with the snap ladder's half-step (the snap decision boundary): a value diverging by most of a
  half-step nearly mis-stepped the ladder.
- **This is a DISTINCT gate from WIDTH_GATE=20 mm** (confirmed by Revisor). WIDTH_GATE is raw-vs-**label**
  (does the measured width match the WxH label?); snap-divergence is raw-vs-**nominal-on-the-ladder**.
  Different axes → a smaller threshold.
- **The definitive value is a MEASURED histogram valley, NOT a 2-point fit.** Deriving a constant from a
  couple of anecdotal cases is precisely the error this project keeps hitting. The real gate sits in the
  **valley of the `|raw − snapped|` histogram over ALL runs**: a healthy cluster (≤ ~5 mm, tracing noise)
  and a wrong-pair tail (~15–20 mm; the COB-IM2 state-of-record has ~25 runs off by up to ~20 mm). Set the
  gate at the trough between the two modes.
- **MEASURED value: `snapDivergenceGateMm = 9 mm`** (Revisor, 2026-08-27, histogram of `|w − w_raw|` over
  **2033 certified COB-IM2 L4 runs**): p50=3.4, p75=10, p90=16, p95=19.1, p99=23.3, max=24.9 mm. Healthy
  cluster ≤4 mm = 1195 runs (59%); local-minimum **VALLEY at 8–10 mm = 48 runs**; tail 10–26 mm = 508 runs
  (25%). The valley floor is **9 mm** — the measured gate. (The earlier `10 mm` provisional sat at the
  valley's upper edge — acceptable, but 9 mm is the measured minimum.)
- **The flag marks REVIEW CANDIDATES, not confirmed errors.** A large `|w − w_raw|` is not only a
  wrong-pair (interior-vs-exterior) extraction — a duct legitimately traced BETWEEN nominals (off-nominal
  run) also diverges. So a flagged run is a *candidate for review*, and the default policy stays `warn`
  (surface), never `block`. The tail (508 runs) is far larger than the state-of-record "~25 wrong-pair"
  precisely because it mixes wrong-pair AND legit off-nominal, which the old interior-pair extractor cannot
  separate.
- **Definitive value pending a re-histogram with the exterior-pair fix.** Decisive test (Revisor):
  apply inv3's exterior-pair selection (#72) to the *source* extractor and re-histogram — if the tail
  collapses to <5 mm those runs were wrong-pair; whatever remains is legit off-nominal. Until then, **use
  9 mm labeled "candidates"**; the definitive number is confirmed after that re-histogram.
- The spine owns the gate wire and reads `snapDivergenceGateMm` as a one-line **config** (default now
  **9**), not a hardcoded constant, so a definitive-value swap is a one-line change. Intake emits `raw`+`deltaMm`.

### `fieldProvenance.width` ownership — ONE writer, no clobber (RATIFIED inv3+inv4)

Two sources can measure width — a WxH **label** (cota-binding, inv4) and the parallel **flank** line-work
(duct-vectorize, inv3). To prevent two modules writing the same envelope, cota-binding emits the label
width under a **distinct key `labelWidth`** (NOT `width`), and the **flank step (inv3) is the SINGLE
writer** of `fieldProvenance.width`, composing it from `labelWidth` + the flank measurement via
`mergeWidthProvenance`:

- **label-only run:** pass the label width through unchanged — `v = label`, `prov: 'measured'`.
- **flank-only run:** overwrite the label's `absent-in-source` with the flank measurement — `prov: 'measured'`.
- **both-run** (label AND flank): `v = label nominal` (design intent), `raw = flank-measured`,
  `snap = snapToNominal(raw)`, `deltaMm = |raw − snap|·1000`; PLUS a separate discrepancy flag when
  `|raw − label| > 20 mm` — this is the **WIDTH_GATE axis** (raw-vs-label), DISTINCT from snap-divergence
  (raw-vs-nominal-on-ladder). Revisor's 82.5-vs-105 case is a WIDTH_GATE discrepancy, not a snap one.

cota-binding never writes width for a run the flank step touches ⇒ no clobber, 100% coverage between the
two sources.

## 4. Source-kind (P1 / P2 — fail-loud, not silent-empty)

Scene-level `provenance.sourceKind` classifies WHERE the geometry came from, so an empty design-intent
check reports the *reason*:

| `sourceKind` | means | empty design-intent means |
|---|---|---|
| `bim` | real BIM objects (IFC/Revit-style, placed fittings, schedules) | a genuine gap — investigate |
| `line-work` | polylines traced over a PDF underlay; no placed fittings, no heights by construction | **expected empty** — structural, report as such, NOT "sin fittings" |
| `cv-raster` | route-2 CV over a raster; everything `INFER` | expected low-certainty |

**P1 fail-loud rule:** a sheet with **0 DIMENSION entities but N sized MTEXT** is *dimensioned via
MTEXT*, not undimensioned. Intake MUST route those MTEXT through the label→nearest-run binding
(proximity + `WIDTH_GATE = 20 mm`) and MUST NOT report "sin cotas". A guard that finds no cotas must
first check for sized MTEXT and fail loud if it skipped them.

## 5. Preservation contract (every downstream stage)

`voxelize`, `debox`/realista, and the viewer adapters MUST:

1. **Thread** the per-quantity envelopes (`v`/`prov`/`raw`/`snap`) untouched (additive, like `geometry[]`/`schedule[]`).
   Fail-loud if a stage collapses an envelope to a bare number — that silently loses provenance.
2. **Never fabricate** a value for an `ABSENT_IN_SOURCE` field. A stage that needs a value it doesn't
   have represents unknown (renders a declared-unknown placeholder, flags it) — it does not invent one
   and re-tag it `MEASURED`. This is the realista-pass trap (§440) applied to provenance: a "make it
   look finished" step must not upgrade an unknown into a fabricated fact.
3. **Preserve provenance under pass-parity §440.** Provenance is engineering data: a realista pass that
   drops `ABSENT_IN_SOURCE` → a concrete number, or discards `sizeRaw`, is drift and must FAIL the gate.

## 6. Co-registration provenance (P5)

Multi-sheet co-registration is **pure translation from ONE authoritative frame** (`meta.sheets`).
When two pipelines each carry an offset, they must be **cross-checked, never assumed equal**: a
disagreement above the audit gate (`20 mm`; COB-IM2 measured 20.1 mm on sheet 14C) is FAIL-LOUD, not a
silently-picked winner. Record `provenance.frame = { source, offset, pipeline }` so the disagreement is
inspectable.

---

*Meta-lesson carried from the retro (P6/P7): a corroborated, ratified diagnosis stays UNMEASURED until
someone runs the measurement, and where a render is involved the render is the authority, not a
simulation of it. Provenance values are claims about the source — tag them from what was actually read,
never from what a downstream stage found convenient.*
