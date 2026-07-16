# recipe: rtu-master-cinemex

Parameterized packaged-RTU master (two-section cabinet, condenser fan ring, intake hood, curb)
derived once as a PLAN and instanced per zone with per-part InstancedMesh.

**Why**: stacked boxes whose faces shared a plane z-fought at grazing roof angles — an L3 rework
made every stacked part EMBED into the surface under it (curb into plate, cabinet into curb).

**Exemplar**: `disenos/cinemex-hvac-lorawan/src/scene/architecture.js` — `RTU_PACKAGE` (~L158:
size, curbSize/curbHeight, clearances, condensateOutlet, embeds), `createPackagedUnitPlan
(auditoriums)` (~L190: one unit per zone, cabinet centre derived from plate top + curb − embeds),
emission loop over `plan.structural.roofService.packagedUnits` (~L1808-1840: curb, cabinet,
intake-hood, fan ring + guard + blade cross, end grille via `addBox` part buckets). Silhouette
vocabulary follows the house Trane family (`parts/trane-rtu-family` pointer).

**Rules a re-implementation must keep**

1. ONE frozen dimension authority (`RTU_PACKAGE`) shared by the 3D derivation and any emitted
   data panel — a test pins them together; dims are parameters, never scattered literals.
2. Embedded contacts: every stacked part sinks its `embed` into the part below, so no two faces
   are coplanar anywhere in the stack.
3. Per-part InstancedMesh buckets keyed by material (`rtu-dark`, `rtu-cabinet`, ...): the fleet
   scales by instance count, not by draw calls.

**Evidence**: cinemex `src/scene/architecture.js` · p6-final L4 0.80 (2026-07-15).
