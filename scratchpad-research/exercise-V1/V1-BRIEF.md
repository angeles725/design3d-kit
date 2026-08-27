# Exercise V1 — Voxel→Realista TRANSFORM-PRESERVATION (self-contained brief)

Strengthens the weakest seam of the CAD/foto/spec → voxel → realista chain (GATES.md §440): when a
committed voxel/blockout is turned "realistic", the engineering layout MUST NOT move. This tests
whether an opus worker preserves it, and whether the explicit rule is necessary.

## Input (identical for both workers): before-blockout.json (this folder)
A COMMITTED, validated blockout scene_graph: 2 chillers + 2 pumps + 1 AHU, each with center/size/
rotation-implicit/ports, in a 14×10×4 m room. Origin (0,0,0) SW floor corner, Z-up, meters.

## Task — produce the REALISTIC version as JSON, SAME schema
Output `{room, objects:[...]}` where each object is the SAME object PLUS realistic detail you add:
`material` (e.g. "brushed-steel"), `mesh` (e.g. "chiller_hi.glb"), `finish`, etc. You MAY add any
NON-geometric fields. You may NOT change `id`, `size`, `center`, `rotation`, or `ports` — not by a
millimetre. The realistic pass SUBSTITUTES geometry only; it never re-places.

## Conditions (model held constant = opus; instruction varied)
- creador1 = NAIVE: instruction is only "make this mechanical room realistic, output the scene JSON."
- creador2 = DISCIPLINED: same, PLUS the explicit rule "preserve every center/size/rotation/ports
  exactly; add only material/mesh/finish fields; any coordinate change is a failure."

## Scoring (deterministic, shared scorer — you do not run it)
`node scratchpad-research/exercise-A1/verify.mjs --diff before-blockout.json <your-output>.json`
PASS iff `invariant_preserved: true` (0 deltas). ANY center/size/rotation/port change, or any
added/removed object, = FAIL. Discriminator: did the naive worker silently move things (the doc's
diagnosed failure), and did the explicit rule prevent it?

## Why this matters
A realistic pass that moves a chiller by even 50 mm invalidates every clash/clearance the blockout
already certified — the whole voxel→realista guarantee collapses. V1 measures the failure rate and
whether the transform-preservation rule + a mechanical diff gate is worth enforcing at P5.
