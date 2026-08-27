# Exercise F2 — harder end-to-end flow (N+1 plant + fixed column) — RESULT

creador1, spec-first + spatial-engine discipline. Room 8×6×3.5 with a FIXED full-height column (COL-01)
mid-room. Design: 2 chillers (N+1), 2 duty + 1 standby pump, a DN300 S/R header, connected CHW loops.

## Score (shared verify.mjs)
| verdict | score | objects | pipes | hard | soft |
|---|---|---|---|---|---|
| PASS | 10 | 7 (incl COL-01) | 7/7 | 0 | 0 |

## Why it matters (final flow evidence)
- The FULL design-creation pipeline executes cleanly on a HARDER instance than F1: N+1 redundancy + a fixed
  obstacle. creador1 produced a coherent spec (realistic dims, directional ports), placed port-aware
  (explicitly ran the §9i free-approach-stub check), and ROUTED THE RETURN-MAIN AROUND the column (dropped to
  Y=2.3, south of the column's Y-band, with a 0.45 m margin) — the exact routing-around behavior A3 tested.
- It used the NEW DESIGNSPEC `scene_graph` port schema (`{offset, dir}`), confirming the integrated v1.18
  deltas are followable by a model end-to-end.
- Verifier improvement (committed): `worldPort` now accepts BOTH the flat `[lx,ly,lz]` and the richer
  `{offset,dir}` / `{position}` port forms, so the one scorer covers the whole battery + the DESIGNSPEC schema.
  A1 regression: both still PASS 10.

## Flow-evidence summary
F1 (single loop) 9.5 · F2 (N+1 + fixed column) 10 — the proposed spec→place→route→QC flow produces valid,
gate-passing 3D designs end-to-end, including the hard cases (obstacle route-around, redundancy).
