# Exercise E4 — VERDICT (real two-creador run, both opus, blind)

**Result: FIRST MULTI-AGENT NON-NULL.** naive-parallel = score 6 / FAIL (2 hard overlaps);
lock-mediated = score 10 / PASS, 6/6 placed, unplaced=[].

**Provenance: MEASURED, confirmed first-hand.** Both creadores independently confirmed their
submitted sequences byte-for-byte: creador1 (DISCIPLINE 1, chilled-water plant) — and explicitly
confirmed produced BLIND (read only BRIEF.md + CREADOR-E4-PROMPT.md, never opened the merged/agent
JSONs); creador2 (DISCIPLINE 2, air side). Independently re-scored by investigador4 (same numbers).
NOT staged fixtures. Dispatched by investigador1, scored by investigador2.

## Numbers (shared verify.mjs)
| condition | objects | hard | soft | score | verdict |
|---|---|---|---|---|---|
| NAIVE-PARALLEL (primaries merged, no lock) | 6 | 2 | 0 | 6.0 | FAIL |
| LOCK-MEDIATED (ReserveEngine + fallbacks)  | 6 | 0 | 0 | 10.0 | PASS |

Overlaps in the naive merge: `creador1:CH-01 ↔ creador2:AHU-02` and `creador1:P-01 ↔ creador2:AHU-02`
— both in the north header band, exactly where the shared objective pulled both disciplines.

## The sharpest form of the finding
BOTH creadores were CAREFUL — each supplied a full set of ranked fallbacks (creador1: 3 per object;
creador2: 4-5 per object). Neither assumed it owned the room. The discriminator "did the worker plan
for contention?" shows BOTH GOOD. Yet, being BLIND (no shared state), their PRIMARIES still collided:
- creador1 CH-01 primary [2.0,6.8] → body x[0.5,3.5] y[6.2,7.4]
- creador2 AHU-02 primary [3.0,6.0] → body x[1.75,4.25] y[5.25,6.75]  → overlap x[1.75,3.5] y[6.2,6.75]

Two careful independent agents CANNOT avoid the collision by individual reasoning alone. This is an
**observability limit** (neither can see the other's in-context placements), not a density effect and
not an agent-quality effect — a stronger model cannot reason it away.

The shared ReserveEngine resolved it deterministically: CH-01, P-01, P-02, AHU-01 granted at their
primaries; **AHU-02 denied 3× (primary + fallbacks #1 and #2 all overlapped creador1's committed
objects) and finally granted at fallback #3 [3,4,1]**; VFD-01 granted. Note AHU-02 needed its THIRD
fallback — the north band was genuinely contested; with fewer fallbacks it would have gone UNPLACED
(still no overlap — the lock never yields an illegal state).

## Conclusion for the S2 verdict (regime split)
- SINGLE-AGENT (A1 N=4, A2 N=12): null → spatial engine is a guarantee/robustness mechanism.
- MULTI-AGENT concurrent (E4): naive 6/FAIL vs lock 10/PASS → the shared reserve/lock is **REQUIRED
  for correctness**, because independent agents share no state. **S2 promotes from "guarantee" to
  "required" in the multi-agent regime.** (A3 already showed a single-agent clearance-awareness win;
  E4 adds the multi-agent-correctness pillar.)
- This is literally how our four-agent team avoids collisions: SendMessage + shared repo = the human
  analog of the ReserveEngine. E4 is the empirical proof of that pattern.

## Files (this dir)
creador1-real.json, creador2-real.json (the two blind sequences), merged-naive.json (FAIL evidence),
merged-lock.json (PASS evidence). Scored with scratchpad-research/exercise-A1/verify.mjs.
