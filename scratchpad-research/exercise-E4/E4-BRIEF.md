# Exercise E4 — Multi-agent spatial-lock contention (SELF-CONTAINED brief)

Two independent opus workers run this BLIND to each other. creador1 owns DISCIPLINE 1, creador2
owns DISCIPLINE 2. Each returns ONLY a request sequence (JSON). A shared deterministic ReserveEngine
then arbitrates the merge. Do NOT invent anything not specified here.

## 1. Room + coordinate frame (identical for both workers)
- Room size = **[12, 8, 4] m** (X, Y, Z). Origin (0,0,0) at the SW floor corner.
- Axes: **X = east, Y = north, Z = up**. Units = meters. Objects are axis-aligned.
- On-floor rule: an object resting on the floor has **center_z = size_z / 2**.
- North wall is at y = 8. **Hydronic header tap** (the shared connection point) is on the north
  wall at world **[6.0, 7.5, 3.2]**. Placement objective: put your discipline's PRIMARY unit as
  close as practical to the tap (minimize the horizontal distance from the unit's nearest face to
  x=6.0, y=7.5). This is a shared objective — the prime tap-adjacent band is limited.

## 2. Discipline equipment (place ONLY your own list)
### DISCIPLINE 1 — creador1 (chilled-water plant)
| id | size [sx,sy,sz] | clearance | ports (local offset from center) | note |
|---|---|---|---|---|
| CH-01 | [3.0,1.2,1.8] | {"+x":1.0} | CHWS:[1.5,0.3,0.6], CHWR:[1.5,-0.3,0.6] | PRIMARY (tap-adjacent) |
| P-01  | [0.8,0.6,0.9] | — | suction:[-0.4,0,0.1], discharge:[0.4,0,0.1] | near CH-01 |
| P-02  | [0.8,0.6,0.9] | — | suction:[-0.4,0,0.1], discharge:[0.4,0,0.1] | near CH-01 |

### DISCIPLINE 2 — creador2 (air side)
| id | size [sx,sy,sz] | clearance | ports (local offset from center) | note |
|---|---|---|---|---|
| AHU-01 | [2.5,1.5,2.0] | {"-x":0.8} | CHW_in:[-1.25,0.4,0.5], CHW_out:[-1.25,-0.4,0.5] | PRIMARY (tap-adjacent) |
| AHU-02 | [2.5,1.5,2.0] | {"-x":0.8} | CHW_in:[-1.25,0.4,0.5], CHW_out:[-1.25,-0.4,0.5] | second unit |
| VFD-01 | [0.6,0.4,1.6] | {"-x":0.8} | — | control panel, wall-adjacent |

Clearance is a service band on the named face ({"-x":0.8} = 0.8 m of maintenance space on the −X
face). Ports are informational for E4 (pipes are NOT scored here — the test is PLACEMENT contention).

## 3. What you return (EXACT schema — nothing else)
```json
{ "agent": "creador1",
  "room": {"size":[12,8,4]},
  "requests": [
    { "id": "CH-01",
      "size": [3.0,1.2,1.8],
      "primary": [cx, cy, cz],           // world center; cz = size_z/2 (on floor)
      "fallbacks": [[cx,cy,cz], [cx,cy,cz]],  // >= 2 RANKED alternates, used only if primary is denied
      "clearance": {"+x":1.0},           // copy from the table if listed
      "ports": {"CHWS":[1.5,0.3,0.6], "CHWR":[1.5,-0.3,0.6]}
    }
    // ... one entry per object in YOUR discipline, in placement order
  ] }
```
Rules: you CANNOT see the other worker's choices. Every object needs a primary + **at least 2 ranked
fallbacks**. Keep every object fully inside room bounds and on the floor. Place your PRIMARY unit
near the tap; place secondary units relative to your primary. Return ONLY the JSON.

## 4. How it is scored (the shared deterministic scorer — you do not run this)
1. **naive-merge** (control): each worker's PRIMARY only, superimposed, no arbitration → merged
   scene → `verify.mjs`. If both primaries claim the tap-adjacent band, expect cross-agent overlap
   (hard≥1, score ≤7.9, FAIL).
2. **contend** (treatment): ReserveEngine grants first-come, denies overlaps, uses your ranked
   fallbacks to re-plan → merged scene → `verify.mjs`. Expect 0 overlaps (score 10) — OR an object
   UNPLACED if a worker supplied too few / poorly-chosen fallbacks.
- ids are prefixed per agent (creador1:CH-01) so the merge has no id collisions.
- **PASS = merged hard_fails=0 AND unplaced=[].** Discriminator: did you anticipate contention with
  good ranked fallbacks, or assume you owned the room?

## 5. What this measures
Whether two INDEPENDENT agents can co-place into one room without colliding. If both naively claim
the prime band → the lock is REQUIRED (multi-agent-correctness evidence). If they deconflict on their
own → an equally interesting null. Report the raw numbers either way. Tools (reserve-engine.mjs,
contend.mjs, naive-merge.mjs) are in this folder for reference; the scorer (verify.mjs) is exercise-A1/.
