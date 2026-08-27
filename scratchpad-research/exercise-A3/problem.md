# Exercise A3 — ADVERSARIAL stretch instance (contingency if A2 is also null)

Purpose: if A2 (N=12) comes back null too (both conditions PASS), the Spatial Engine (S2) is only a
GUARANTEE mechanism, not a correctness fix at that scale. A3 raises pressure to find where naive
measurably breaks: a TIGHT room, a FIXED central obstacle that forces pipe routing, and an ordering trap
where a greedy "largest/reading-order first" placement can dead-end.

HONEST CAVEAT: a single-shot instance cannot *guarantee* a strong model fails the naive condition. The
rigorous S2-promotion evidence is STATISTICAL — run the same instance under each condition N times and
compare hard-fail rates — or a genuinely infeasible-without-backtracking packing. A3 is a stress probe;
if it is also null, recommend the statistical multi-trial follow-up rather than claiming S2 unproven.

WORLD: right-handed, Z-up, meters. Room box 7(X) x 5(Y) x 4(Z), origin at floor corner (0,0,0), floor z=0,
axis-aligned, on floor (center_z = size_z/2). upAxis: "Z" (data-layer; render converts once — see design doc).

FIXED (pre-placed structure — DO NOT MOVE; keep the given center exactly):
- COL-01 column, size [0.5,1.0,4.0], center [3.5,2.5,2.0], onFloor: false (full-height). A routing obstacle
  splitting the room at x=3.5, spanning y[2.0,3.0].

TO PLACE (choose centers; sizes/clearances/ports fixed):
- CH-01 chiller [3.0,1.2,1.8], clearance +x:1.0, ports CHWS_out[1.5,0.3,0.0], CHWR_in[1.5,-0.3,0.0]
- AHU-01 [2.5,1.5,2.0], clearance -x:0.8, ports CHW_in[-1.25,0.4,0.0], CHW_out[-1.25,-0.4,0.0]
- P-01 [0.8,0.6,0.9], ports suction[-0.4,0,0.1], discharge[0.4,0,0.1]
- P-02 [0.8,0.6,0.9] (standby, no pipes)

PIPES (DN150), polyline START = world `from` port, END = world `to` port, axis-aligned:
- CHWS-1: CH-01.CHWS_out -> P-01.suction
- CHWS-2: P-01.discharge -> AHU-01.CHW_in
- CHWR-1: AHU-01.CHW_out -> CH-01.CHWR_in   <-- the return crosses the room; a straight run at the column's
  y-band would pass THROUGH COL-01 (RULE001 pipe-through-equipment, HARD). Must route around it.

CONSTRAINTS: no overlaps incl. with COL-01 (HARD); all inside the 7x5x4 room (HARD); every pipe connected
within 50 mm (HARD); NO pipe segment may pass through COL-01 or any non-connected body (HARD); respect the
two service clearances (tracked); on floor. With CH-01 (+1.0 clr) and AHU-01 (+0.8 clr) facing each other
across a 7 m span split by a column at x=3.5, the feasible packing is narrow.

Conditions: creador1 = NAIVE (raw coords, no tools), creador2 = SPATIAL-ENGINE (grid + canPlace + A*-style
route-around for CHWR-1). Same schema + shared verify.mjs (now includes pipe-vs-solid). Hypothesis: naive
plows CHWR-1 through COL-01 (HARD) or eats a clearance; the engine routes around and packs clean.
