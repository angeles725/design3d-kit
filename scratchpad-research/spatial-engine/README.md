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
node ../exercise-A1/verify.mjs a2-engine-solution.json   # -> PASS 9.5
```
- **END-TO-END: PASS 9.5** — all 12 objects placed (0 overlaps, 0 clearance intrusions, all ports accessible),
  all 6 pipes routed collision-free (0 pipe-through-equipment), 1 SOFT (one pipe grazes a foreign clearance —
  exactly what inv3's clearance-weighted A* would avoid; the reference BFS router only avoids HARD bodies).
  So spec→place→route→verify is a WORKING PROTOTYPE, proven by running code, not prose.
- **PLACEMENT-ONLY: PASS 10/10** (strip pipes) — the S2 core claim in isolation.

## DESIGN REFINEMENT discovered by building the prototype: PORT-ACCESS clearance
The first router run FAILED (1 HARD): the engine had placed pump P-01 with its suction port jammed flat
against AHU-02's face — a layout that is body-clean AND clearance-clean but UNROUTABLE (the pipe to that port
must pass through AHU-02). Fix: `canPlace` now also requires a small free APPROACH stub in front of every port
along its outward normal (spatial-engine.mjs, reason `port-access-blocked`). This is a genuine addition to
DESIGN §4 — placement must consider PORT ACCESS, not just body + service clearance. With it, the engine
re-placed the pumps into port-accessible slots and the scene routes clean.

## What this de-risks
- S2 placement (reserve→validate→commit, volumes-not-points, PORT-ACCESS, structured rejection) is not
  hand-waving — a ~130-line deterministic engine produces a verifier-clean, ROUTABLE 12-object layout.
- Two-tier routing is validated: the reference BFS avoids HARD clashes; inv3's A* `duct-router.mjs` is the
  production router that also minimizes the SOFT clearance grazes (cost-weighted). Complementary, not duplicate.

## Battery cross-reference (single scorer, verify.mjs) — see exercise-*/RESULTS.md
| exercise | regime | naive | engine/method | finding |
|---|---|---|---|---|
| A1 (N=4) | single-agent | 10 | 10 | null |
| A2 (N=12) | single-agent | 10 | 10 | null (this engine reproduces the PASS deterministically, placement-only) |
| A3 (N=5 + fixed column) | single-agent | 8.5 | 10 | NON-NULL (clearance/soft): engine reserves clearance volumes |
| E4 (multi-agent, MEASURED) | multi-agent | 6 FAIL (2 overlaps) | 10 PASS (lock) | NON-NULL (hard): reserve/lock REQUIRED (observability) |
| F1 (end-to-end flow) | single-agent | — | 9.5 PASS | the spec→ops→route→QC pipeline produces a valid design; 1 soft (pipe grazes standby clearance) |
