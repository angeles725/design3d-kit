# Exercise A2 — DENSER spatial-grounding instance (discriminating regime)

Purpose: A1 was a NULL result (both conditions PASS at N=4 — opus solves small layouts without help).
A2 raises object count + clearances + packing density to find where NAIVE breaks and the SPATIAL-ENGINE
method holds. Same two conditions as A1 (creador1 = NAIVE raw-coords; creador2 = SPATIAL-ENGINE discipline).
Same strict Scene-JSON schema. Scored by exercise-A1/verify.mjs (score mode). Hard-fail caps score at 7.9.

WORLD: right-handed, Z-up, meters. Room box **10(X) x 7(Y) x 4(Z)**, origin at floor corner (0,0,0),
floor z=0, all objects axis-aligned, on floor (center_z = size_z/2).

OBJECTS (sizes [X,Y,Z]; ports are LOCAL offsets from center):
- CH-01 chiller [3.0,1.2,1.8], clearance +x:1.0, ports CHWS_out[1.5,0.3,0.0], CHWR_in[1.5,-0.3,0.0]
- CH-02 chiller [3.0,1.2,1.8], clearance +x:1.0, ports CHWS_out[1.5,0.3,0.0], CHWR_in[1.5,-0.3,0.0]
- AHU-01 [2.5,1.5,2.0], clearance -x:0.8, ports CHW_in[-1.25,0.4,0.0], CHW_out[-1.25,-0.4,0.0]
- AHU-02 [2.5,1.5,2.0], clearance -x:0.8, ports CHW_in[-1.25,0.4,0.0], CHW_out[-1.25,-0.4,0.0]
- P-01 [0.8,0.6,0.9], ports suction[-0.4,0,0.1], discharge[0.4,0,0.1]
- P-02 [0.8,0.6,0.9], ports suction[-0.4,0,0.1], discharge[0.4,0,0.1]
- P-03 [0.8,0.6,0.9] (standby, no pipes)
- P-04 [0.8,0.6,0.9] (standby, no pipes)
- HDR-01 supply header [3.0,0.3,0.3] (no pipes required; a packing obstacle / future manifold)
- TANK-01 buffer tank [1.2,1.2,2.0] (no pipes required)
- VFD-01 panel [0.6,0.4,1.6], clearance +x:0.9 (electrical working space)
- VFD-02 panel [0.6,0.4,1.6], clearance +x:0.9

PIPES (DN150), each polyline START = world `from` port, END = world `to` port, axis-aligned:
- CHWS-1: CH-01.CHWS_out -> P-01.suction
- CHWS-2: P-01.discharge -> AHU-01.CHW_in
- CHWR-1: AHU-01.CHW_out -> CH-01.CHWR_in
- CHWS-3: CH-02.CHWS_out -> P-02.suction
- CHWS-4: P-02.discharge -> AHU-02.CHW_in
- CHWR-2: AHU-02.CHW_out -> CH-02.CHWR_in

CONSTRAINTS: no equipment overlaps (HARD); all inside the room (HARD); every pipe connected to its named
ports within 50 mm (HARD); respect all 6 service clearances (SOFT but tracked); on floor (SOFT).
12 objects, 6 clearance bands, 6 connected pipes in 70 m^2 — packing is non-trivial.

OUTPUT: same schema as A1 (room + objects[] with size/center/clearance/ports + pipes[] with from/to/polyline).
Keep all size/clearance/port values EXACTLY as given; choose only centers + polylines.

HYPOTHESIS: NAIVE accumulates hard-fails (overlaps / disconnected ports / clearance intrusions) as density
rises; SPATIAL-ENGINE (grid placement + canPlace + ports-from-committed-centers) holds PASS or degrades
gracefully. Either outcome is publishable evidence for/against delta S2.
