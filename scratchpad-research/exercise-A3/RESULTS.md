# Exercise A3 — ADVERSARIAL routing/clearance trap — RESULTS

Controlled A/B (model held constant = opus; method varied). Tight 7x5x4 room, a FIXED full-height column
(COL-01) splitting the room at x=3.5 / y[2,3]. Scored by shared verify.mjs (score mode, incl. pipe-vs-solid).

## Numbers
| condition | score | verdict | hard | soft | soft detail |
|---|---|---|---|---|---|
| NAIVE (creador1)          | 8.5 | PASS | 0 | 3 | COL-01 in CH-01 clr · COL-01 in AHU-01 clr · pipe CHWS-2 in CH-01 clr |
| SPATIAL-ENGINE (creador2) | 10  | PASS | 0 | 0 | — |

## Verdict — A3 is the FIRST NON-NULL result (SOFT / clearance dimension)
- **HARD dimension: still null.** Naive AVOIDED the pipe-through-column trap by manually detouring the return
  pipe after reasoning about the column's coordinates. A strong model does not blunder into the hard clash.
- **SOFT / clearance dimension: NON-NULL, engine wins 10 vs 8.5.** Naive placed CH-01 and AHU-01 facing each
  other across the mid-room column, so COL-01 lands INSIDE both service-clearance volumes (~0.75 m of CH-01's
  1.0 m and ~0.30 m of AHU-01's 0.8 m). The spatial engine reserves clearance VOLUMES before commit, so it
  pushed both units out of the column's y-band and scored clean. The naive model reasoned about physical
  collision (avoided every HARD) but UNDER-WEIGHTED service clearance against a non-connected fixed obstacle.
- **Magnitude: modest.** Both still PASS (>=8). This is a QUALITY / clearance-awareness gap, not a correctness
  failure. It is the first MEASURED single-agent advantage for S2, and it is specifically triggered by a fixed
  obstacle splitting the room — exactly the case where "reserve the clearance volume, not just the body" pays.

## Refined S2 verdict (folds into DESIGN §8)
- SINGLE-AGENT: S2 is (a) a guarantee/robustness mechanism (A1/A2), AND (b) a measurable CLEARANCE-AWARENESS
  quality improver when a fixed obstacle intrudes service clearances (A3: +1.5 score, 3 soft → 0). Not a
  "naive is broken" story — naive leaves clearance QUALITY on the table.
- MULTI-AGENT CONCURRENT: S2's reserve/lock is REQUIRED for correctness (observability limit; E4 pending).
- Promotion: S2 ships as "adopt — a guarantee + clearance-awareness mechanism single-agent, REQUIRED
  multi-agent", honestly scoped. A statistical multi-trial would further quantify the single-agent HARD-failure
  rate, but A3 already gives a concrete, reproducible single-agent quality delta.

## Battery summary (single scorer, verify.mjs)
| exercise | N | naive | engine | discriminating? |
|---|---|---|---|---|
| A1 | 4  | 10  | 10 | null (both pass) |
| A2 | 12 | 10  | 10 | null (both pass) |
| A3 | 5 (+fixed column) | 8.5 | 10 | **NON-NULL (clearance/soft)** |
| E4 | multi-agent | (pending) | (pending) | expected non-null (HARD, observability) |
