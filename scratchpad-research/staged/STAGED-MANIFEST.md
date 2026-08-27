# MATH/QC staged modules — integration manifest (investigador3 → i1)

All in `design3d-kit/scratchpad-research/staged/`. Every module: pure-core (imports nothing at top level; any `three`/`three-mesh-bvh` use is a dynamic `await import(...)` inside the wrapper), REPORTS-ONLY (never mutates geometry), deterministic (no `Math.random`/`Date`), `geom-verify.mjs` style. Bare-repo `node --test` runs the pure core; three-dependent integration tests skip cleanly when three isn't resolvable.

| Module | Delta | Target library/ path | Tests | Author | Status |
|---|---|---|---|---|---|
| `duct-router.mjs` (+ drainage slope) | §3 / §3.1 #14 | `library/parts/duct-router.mjs` | 11/11 | creador2 | in library/ (77af68a); slope is a pure superset — resync |
| `clash-detect.mjs` | §1 | `library/harness/clash-detect.mjs` | 5/5 | creador1 | in library/ (77af68a) |
| `geom-metrics.mjs` | §9 #1 | fold into `library/harness/geom-verify.mjs` | 6/6 | i3 | ready |
| `fitting-select.mjs` | §3.1 #13 | `library/parts/` (beside duct-router) | 7/7 | i3 | ready |
| `view-variance.mjs` | §5 | `library/harness/view-variance.mjs` | 6/6 | i3 | ready (needs reviewer per-view score array) |
| `montecarlo-clash.mjs` | §6 | fold into `library/harness/clash-detect.mjs` | 6/6 | i3 | ready (inject bvh clashFn at integration) |
| `topology-ext.mjs` (+ `topologyReport`) | §7 | fold into `library/harness/geom-verify.mjs` | 15/15 | creador1 | ready |

**58 tests green total.** Two flow-checks PASSED (base chain + rounded-tube); drainage flow-check in progress.

## Key contracts (for wiring)

- `routeDuct({start,end,obstacles,bounds,gridStep,bendPenalty,radius,clearance,maxExpansions,startDir?, slope?:{axis,minGrade,monotonic?,descending?}}) → {found, waypoints, bends:[{position,inDir,outDir,turnAngle}], length, cost, expansions}` · helpers `toOrthogonalSegments(waypoints)`, `toCurve(waypoints,{curveType,tension})`.
- `fittingForBend(bend) → {type:'none'|'elbow45'|'elbow90'|'elbowN'|'uturn', angle, plane, position}` — the bridge to `hvac-fittings.elbowAtBend`.
- `detectClashes({groups:[{id,meshes}], allowedContact, tolerance}) → {clashes:[{a,b,depth}], gate}` — pass rule `intersects && depth>eps`; sampled ray-parity depth (NOT the AABB proxy — it's placement-unreliable); NODE gate tool, never in the browser dist.
- `monteCarloClash({parts:[{id,sigma}], clashFn, samples, seed, pClashMax}) → {pClash, clashCount, gate}` — inject a bvh clashFn; opt-in gate via `pClashMax`.
- `topologyReport(positions,index,opts) → {metrics, score:0..10, hardFail, flags}` — `score`→10%-weighted T rubric component, `hardFail`→merge blocker.
- `viewVariance(scores,{lambda,varianceFlag}) → {mean,std,adjusted,range,highVariance,worstView}` — advisory aggregation; blind VLM keeps acceptance.
- `volumeMetrics/surfaceArea/centroid` (geom-metrics) — `signedVolume≤0` = inverted-winding discriminator.

## Integration notes / seam frictions (both real, neither a bug)
1. `clash-detect` needs `three-mesh-bvh` → runs NODE-side (gate/build tool, Rule 5 headless); NEVER vendored into the offline single-file browser dist.
2. router emits `number[]`; three wants `Vector3` → thin adapter `waypoints.map(w=>new THREE.Vector3(...w))` (toCurve does it internally). Document at the array→Vector3 boundary.
3. OBB middle tier (§9 #3): use three's built-in `OBB` (`math/OBB.js`) in the cascade — no new module.
