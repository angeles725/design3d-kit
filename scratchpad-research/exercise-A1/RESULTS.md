# Exercise A1 — Spatial-grounding A/B test — RESULTS

Purpose: empirically test the document's central thesis ("AI cannot reliably hold 3D space")
and its proposed remedy (external deterministic Spatial Engine, AI never writes raw XYZ).

Design: controlled A/B, **model held constant (both opus)**, method varied. Same problem, same
strict Scene-JSON schema, one deterministic verifier (`verify.mjs`). Hard-fail caps score at 7.9.

Problem: place CH-01 chiller, AHU-01, P-01/P-02 pumps + 3 DN150 CHW pipes in a 12×8×4 m room,
respecting no-overlap, two service clearances, room bounds, on-floor, and port-to-port pipe connectivity.

- Condition NAIVE (creador1): intuit x,y,z directly, no tools/occupancy/collision checker.
- Condition SPATIAL-ENGINE (creador2): mandatory grid-placement + canPlace(AABB+clearance+bounds) +
  lookahead slot reservation + pipe endpoints derived from committed centers.

## Numbers (verify.mjs)
| condition | score | verdict | hard | soft | pipes |
|---|---|---|---|---|---|
| NAIVE (creador1)          | 10 | PASS | 0 | 0 | 3/3 |
| SPATIAL-ENGINE (creador2) | 10 | PASS | 0 | 0 | 3/3 |

## Interpretation (honest)
- **NULL RESULT at N=4.** A strong model (opus) solves a small, low-density layout CORRECTLY without a
  spatial engine, by careful reasoning alone. A1 does not discriminate the two methods.
- This does NOT disprove the Spatial Engine delta (S2). It **bounds** it: the doc's "AI loses XYZ / stacks
  objects" failure manifests at SCALE / DENSITY, not on trivial instances. It also tempers the document's
  strongest claim — the remedy is justified for hard scenes, not as a blanket rule.
- creador1 (naive) honestly noted its pipes cross the equipment's own service-clearance band to reach face
  ports. verify.mjs v1 does NOT check pipe-vs-clearance (only equipment-vs-clearance); connecting to a port
  ON a service face is arguably legitimate, so this is a modeling nuance to decide, not a clear violation.

## Next: Exercise A2 (proposed) — find the discriminating regime
Denser instance: ~12–15 objects (2 chillers, 2 AHUs, 4 pumps, header, VFD panels, sensors) in a tighter
room with multiple mandatory clearances and a routed pipe network. Hypothesis: NAIVE hard-fails
(overlaps / missed clearances / disconnected ports climb) while SPATIAL-ENGINE holds PASS.
Blocked on worker availability (creadores currently on inv3 PoCs) — sequence via i1.

Files: verify.mjs (scorer), creador1-naive.json, creador2-spatial.json.
