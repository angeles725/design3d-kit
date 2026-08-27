# E4 — creador prompt (multi-agent spatial-lock contention)

Two independent opus workers (creador1, creador2) run this BLIND to each other. Each owns a disjoint
discipline in ONE shared room, but both need a shared high-contention zone — so an unarbitrated
merge collides. The lock is what resolves it. Convention (same as A1/A2/A3): world coords, meters,
Z-up, room origin at corner (0,0,0), on-floor means center_z = size_z/2, objects axis-aligned.

## Shared room (identical for both workers)
Room size = [12, 8, 4] m. A single service header runs along the NORTH wall at y∈[7.0,8.0]; every
worker's PRIMARY equipment must sit within 1.5 m of it (center_y ≥ 5.5) to tie into the header.
That constraint forces both disciplines toward the same band → guaranteed contention.

## Per-worker assignment (disjoint disciplines — doc §7846)
- creador1 = CHILLED-WATER PLANT: place `CH-01` chiller [3.0,1.2,1.8] + `P-01`,`P-02` pumps [0.8,0.6,0.9].
- creador2 = AIR SIDE: place `AHU-01` [2.5,1.5,2.0] + `AHU-02` [2.5,1.5,2.0] + `VFD-01` panel [0.6,0.4,1.6]
  (clearance {"-x":0.8} — service door).

## What each worker returns (EXACT schema — drops straight into the mergers)
```json
{ "agent": "creador1",              // or "creador2"
  "room": {"size":[12,8,4]},
  "requests": [
    { "id": "CH-01",                 // local id; the merger prefixes it -> "creador1:CH-01" (disjoint)
      "size": [3.0,1.2,1.8],
      "primary": [cx,cy,cz],         // your first-choice world center; cz = size_z/2 (on floor)
      "fallbacks": [[cx,cy,cz], ...],// >=2 RANKED alternates for when your primary is denied
      "clearance": {"-x":0.8},       // optional, only if the assignment lists one
      "ports": {"CHWS":[lx,ly,lz]}   // optional local offsets
    }
    // ...one entry per object you own
  ] }
```
Rules: you CANNOT see the other worker's choices. Every object needs a primary + at least 2 ranked
fallbacks. Keep everything inside room bounds and on the floor. Do not place raw duplicates of the
other discipline's equipment — only your own list.

## How it is scored (deterministic, shared verify.mjs — no new logic)
1. `node naive-merge.mjs creador1.json creador2.json merged-naive.json` — CONTROL: each worker's
   PRIMARY only, no arbitration → merged scene. Expect cross-agent overlap → hard≥1, score ≤7.9, FAIL.
2. `node contend.mjs creador1.json creador2.json merged-lock.json` — TREATMENT: ReserveEngine grants
   first-come, denies overlaps, worker's ranked fallbacks re-plan → merged scene. Expect 0 overlaps,
   score 10, PASS (or UNPLACED if a worker gave too few/bad fallbacks — measured, still no overlap).
3. inv4 runs `verify.mjs` on both merged scenes and writes the E4 verdict beside A1/A2/A3.

## What E4 proves
naive(≤7.9, overlap) vs lock(10, clean) is the NON-NULL result: two independent agents cannot avoid
claiming the same space on their own (an observability limit, not a density one) — the shared
reserve/lock is REQUIRED for correctness in the multi-agent regime, promoting S2 from guarantee to
requirement. The worker quality signal: did it supply fallbacks good enough that the lock reaches a
complete (unplaced=[]) layout, or did it assume it owned the room?
