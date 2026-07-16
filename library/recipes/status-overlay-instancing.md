# recipe: status-overlay-instancing

Fault/selection recolor WITHOUT duplicate geometry or per-instance color churn: an affected
instance is zero-scaled in its home InstancedMesh and re-emitted at the same transform into a
per-status overlay InstancedMesh (`${layer}:alarm|offline|selected`); restore is exact.

**Why**: recoloring by mutating shared materials collided semantic uses of one color, and cloning
meshes per status doubled draw calls — the overlay pool keeps one material per status bucket.

**Exemplar**: `disenos/cinemex-hvac-lorawan/src/scene/architecture.js` —
`applyStatusOverlays(model)` (~L4181), `resolveStatusOwner(entityId)` (~L3982, maps proxy parts to
their owning device), `writeInstanceMatrix(mesh, index, transform, suppressed)`, `overlayMeshes`
Map keyed `layer:status`; picking reads `entity.statusOwner ?? entity.entityId`
(`src/controllers/picking.js:18`).

**Rules a re-implementation must keep**

1. Suppress-and-re-emit: the home instance is zero-scaled (never removed) and the overlay copy
   uses the SAME resolved transform — restoring is just rewriting the original matrix.
2. `statusOwner` indirection: every child part resolves to the entity that OWNS its status, so
   picking and status agree on identity.
3. Fingerprint the pass (`state|selection|...`) and re-run it only when that changes — the tick
   moves every frame, the status pass must not.

**Evidence**: cinemex `src/scene/architecture.js` · interaction-ui 0.81.
