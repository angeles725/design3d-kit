# Exercise E4 — Multi-agent spatial-lock arbitration (investigador2)

Tests the doc's multi-agent architecture (§7846: Architect/HVAC/Piping/Electrical/Structural agents)
+ its spatial lock (§7818): "dos agentes no pueden escoger simultáneamente el mismo sitio —
Agent A reserved / Agent B denied." Directly mirrors OUR own multi-session team.

## Mechanism under test
A deterministic `ReserveEngine` (reserve-engine.mjs): reserve(agent,id,center,size) GRANTS or DENIES
atomically, first-come-wins (RULE 004 + RULE 010, two-phase reserve, oracle — decides, never moves).
`contend.mjs` interleaves two agents' request sequences against ONE engine; on DENY an agent tries
its ranked fallbacks; if all denied → UNPLACED (reported, never overlapped).

## Creador task (creador1 vs creador2, both opus, independent — they do NOT see each other's picks)
Each worker owns a discipline (e.g. creador1 = chillers+pumps, creador2 = AHUs+piping) and returns a
request sequence: for each object a primary zone + RANKED FALLBACKS. Then `contend.mjs` merges them.

## Pass criteria (shared scorer, no new verdict logic)
1. Merged scene has hard_fails=0 on verify.mjs (the lock guaranteed no overlap). ALWAYS required.
2. unplaced=[] — a GOOD agent supplies enough fallbacks that contention still resolves. A naive agent
   that gives no fallbacks leaves objects UNPLACED under contention (measured, not a crash).
The discriminator: does the worker anticipate contention (ranked fallbacks) or assume it owns the room?

## Demonstrated
- Contention (both want [5,4] first): creador1 GRANTED, creador2 DENIED→fallback [9,4] GRANTED, 4/4
  placed, merged score 10/PASS.
- No-fallback: creador2 CH-B DENIED→UNPLACED, but merged scene STILL hard_fails=0 (safety holds).

## Kit mapping
Delta B gains a reserve/lock primitive (two-phase PROPOSE→COMMIT|ROLLBACK) so multiple agents — or
our own multi-session team — can co-build one scene without racing on the same volume.
