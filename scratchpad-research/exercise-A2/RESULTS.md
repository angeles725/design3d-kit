# Exercise A2 — DENSE A/B — RESULTS

Same controlled A/B as A1 (model held constant = opus; method varied), denser instance:
12 objects, 6 service clearances, 6 connected pipes, tighter 10x7x4 m room. Scored by the shared
verify.mjs (score mode, now including pipe-vs-solid RULE001/007).

## Numbers
| condition | score | verdict | hard | soft | pipes |
|---|---|---|---|---|---|
| NAIVE (creador1)          | 10 | PASS | 0 | 0 | 6/6 |
| SPATIAL-ENGINE (creador2) | 10 | PASS | 0 | 0 | 6/6 |

Both clean: no overlaps, no clearance intrusions, no pipe-through-equipment, all 6 pipes connected within
50 mm, all in-room, all on floor.

## Verdict — A2 is ALSO NULL
At N=12 a strong model (opus) solves the layout AND the pipe routing correctly without the engine. The two
methods do not separate on score. Combined with A1 (null at N=4), the evidence says:

- **S2 (external Spatial Engine) is NOT a correctness fix at realistic densities (N<=12) for a strong model.**
  It is a **GUARANTEE / robustness mechanism**: it makes failure structurally impossible rather than merely
  improbable, which matters for (a) weaker/faster/cheaper models, (b) larger/denser scenes than tested,
  (c) multi-agent runs where reservations prevent races, and (d) auditability (every placement is a checked
  transaction). Those are real reasons to build it — but the promotion label must be honest.
- Recommended proposal label for S2: **"optional, density/robustness-gated — engage above an object-count or
  occupancy threshold, or when the generating model is not top-tier; a GUARANTEE, not a correctness patch."**
  Do NOT promote S2 as a core "AI can't do this without us" rule — the data contradicts the doc's blanket claim.

## Ladder position
A1 null -> A2 null -> **run A3** (adversarial routing trap: a FIXED central column forces the return pipe to
route around it; a straight run trips RULE001 pipe-through-equipment). A3 tests a NEW failure mode (routing
around a hard obstacle) not exercised by A1/A2 packing. If A3 is ALSO null, the only remaining promoter is a
STATISTICAL multi-trial (same instance, N runs per condition, compare hard-fail RATES) — a single strong-model
shot cannot prove a rare failure. Even a null A3 does not kill S2; it keeps it as a guarantee mechanism.
