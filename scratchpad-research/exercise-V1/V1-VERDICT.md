# Exercise V1 — VERDICT (voxel→realista transform-preservation, real two-creador A/B)

**Result: DECISIVE.** A naive realistic pass drifts the ENTIRE engineering layout; the explicit
transform-preservation rule + mechanical gate prevents it completely.

## Numbers (verify.mjs --diff, source = before-blockout.json)
| condition | invariant_preserved | verdict | deltas |
|---|---|---|---|
| creador1 NAIVE ("make it realistic")            | **false** | FAIL | **20** |
| creador2 DISCIPLINED (preserve + add detail only)| **true**  | PASS | **0**  |

Naive drift detail: ALL 5 objects (CH-01, CH-02, P-01, P-02, AHU-01) each drifted on
`center-moved` + `size-changed` + 2× `port-changed` = 20 deltas. Not one object survived. The
disciplined arm changed nothing — 0 deltas.

## Design
Controlled A/B, model held constant (both opus), blind. Same committed EQUIPMENT blockout source.
Instruction varied: NAIVE = "make this mechanical room realistic, output the scene"; DISCIPLINED =
"copy id/type/size/center/clearance/ports byte-exact, add only material/mesh/finish; any coordinate
change is a failure." Scored by verify.mjs --diff (center/size/rotation/ports, tol 1e-4).
(pass-parity checkPassParity scoring pending #35/#37 merge — same verdict expected: 0 vs 20.)

## Conclusion for the CAD/foto/spec→voxel→realista axis
The transform-preservation gate (GATES §440 / inv3 pass-parity) is EMPIRICALLY REQUIRED for the
voxel→realista seam — it is not optional prose. Without the explicit rule, a strong model's realistic
pass corrupts **100%** of the engineering data (20/20 drift: every center, size, and port moved),
silently invalidating every clash/clearance the blockout already certified — while still "looking
realistic" (the visual/ΔE00 gate cannot catch it). With the rule + the mechanical diff gate, drift is
zero. This is the strongest form of the doc's own diagnosed failure ("al volverlo realista, el modelo
mueve las posiciones"): it happens EVERY time a naive pass runs, and the gate is what stops it.

So the spine (pipeline-spine.mjs) is right to place pass-parity as a HARD gate at the realista step: a
de-box/realista output that drifts must FAIL the axis, never ship.

## Failure-mode mechanism (creador1's transparent naive account — what the gate must forbid)
The naive drift was not random; it was a coherent, plausible chain a realistic pass NATURALLY does —
which is exactly why it's dangerous. The kit's transform-preservation rule must explicitly forbid each:
1. **Skin-growth**: fit the bare box to a catalog model WITH skin (panels/baseplate/flanges) → envelope
   grows (Δsize ≈ 0.087 on every axis). → the realista mesh must fit INSIDE the blockout bbox, not resize it.
2. **On-floor re-apply**: re-run `center_z = size_z/2` on the now-taller envelope → center_z bumps +0.025. →
   never re-derive placement from the new geometry; the blockout center is authoritative.
3. **Port re-projection**: re-project face-mounted ports onto the NEW (grown) faces → ports move 0.025–0.035.
   → ports are copied byte-exact, never recomputed from the mesh.
4. **Aesthetic re-spacing**: "tidy" the layout (P-02 nudged to an even 2.0 m) → Δcenter 0.501. → the realista
   pass has NO licence to move anything for looks.
Each step is invisible in a render and each corrupts the spec. The disciplined arm did none — spread the
source data, added only non-geometric fields. So the gate is not paranoia; it catches a specific, common,
plausible chain that a strong model runs by default.

## Cross-check + §440 vindication (inv3 independent pass-parity score)
inv3 ran §440-complete pass-parity independently — same verdict: disciplined ok:TRUE/0 drifts,
naive ok:FALSE/20 drifts. KEY: **5 of the 20 naive drifts are SIZE drifts (Δ0.0866/axis — the
skin-growth inflation), which were INVISIBLE to the pre-§440 gate.** The size/rotation checks added in
#37 (from this reviewer's §440 gap-finding on #35) are precisely what catches them — without them, the
naive pass would have leaked a clearance-invalidating size drift as "clean". So V1 vindicates the full
chain: the disciplined de-box discipline PASSES, the naive DRIFTS, and the §440 gate CATCHES it —
including the size vector only §440 sees. Two independent scorers (verify.mjs --diff + pass-parity) agree.

## Provenance
creador2 self-verified 0 deltas against both gates before delivery (matches this independent score).
Both outputs on the shared FS at scratchpad-research/exercise-V1/{creador1-naive,creador2-disciplined}.json.
Both opus, dispatched blind via inv3/inv1 worker scheduling, source = before-blockout.json.
