# Spatial Engine — runnable reference implementation (S2 de-risk)

Turns DESIGN-spatial-world-model.md §1-§5 from "designed" into "working prototype". Proves the
transactional placement engine (S2) is implementable with the exact geometry the shared verifier scores.

## Files
- `spatial-engine.mjs` — the engine. Single-agent transactional placement:
  - `canPlace(obj, center)` — the §4 cascade: bounds → physical-AABB overlap → clearance intrusion →
    own-clearance in-room+free. Returns `{ok, report}` with the §9e STRUCTURED REJECTION report
    (`{rejected, reason, occupied_by, occupied_volume}`) — the compiler-oracle contract: it REPORTS,
    it never silently repositions.
  - `place(obj)` — PROPOSE (findFreePosition, deterministic grid scan) → COMMIT | REJECT(report).
  - `placeAgainstWall`, `findFreePosition`, `worldPort`. Objects are VOLUMES with a separate clearance box.
  - Multi-agent reserve/lock (§9f) is inv2's `exercise-E4/reserve-engine.mjs` — not duplicated here.
- `demo-a2.mjs` — uses the engine to solve the A2 instance (12 objects, 6 clearances, 6 pipes, 10×7 room).

## Result (measured, reproducible)
```
node demo-a2.mjs > a2-engine-solution.json          # op-log to stderr, scene to stdout
node ../exercise-A1/verify.mjs a2-engine-solution.json
```
- **PLACEMENT: PASS 10/10** — all 12 objects placed, `hard_fails=0`, `soft_fails=0` (0 overlaps, 0 clearance
  intrusions, all on floor, all in-room). This is the S2 core claim, PROVEN by running code, not prose.
- **ROUTING: the demo's trivial "over-the-top" router leaves 1 HARD pipe-through-equipment in the packed
  scene** → the full scene scores 7.9. This is HONEST and expected: it validates the design's claim that
  routing must use inv3's A* `duct-router.mjs` (occupancy-aware), NOT a naive router. A trivial router is
  fine in an open room but clips a neighbour when equipment is tightly packed.

## What this de-risks
- S2 placement (reserve→validate→commit, volumes-not-points, structured rejection) is not hand-waving — a
  ~110-line deterministic engine produces a verifier-clean 12-object layout.
- It cleanly SEPARATES the two claims: PLACEMENT is solved by this engine; ROUTING is delegated to inv3's A*
  (the demo's clash is the evidence that the delegation is necessary, not optional).

## Battery cross-reference (single scorer, verify.mjs) — see exercise-*/RESULTS.md
| exercise | regime | naive | engine/method | finding |
|---|---|---|---|---|
| A1 (N=4) | single-agent | 10 | 10 | null |
| A2 (N=12) | single-agent | 10 | 10 | null (this engine reproduces the PASS deterministically, placement-only) |
| A3 (N=5 + fixed column) | single-agent | 8.5 | 10 | NON-NULL (clearance/soft): engine reserves clearance volumes |
| E4 (multi-agent, MEASURED) | multi-agent | 6 FAIL (2 overlaps) | 10 PASS (lock) | NON-NULL (hard): reserve/lock REQUIRED (observability) |
| F1 (end-to-end flow) | single-agent | — | 9.5 PASS | the spec→ops→route→QC pipeline produces a valid design; 1 soft (pipe grazes standby clearance) |
