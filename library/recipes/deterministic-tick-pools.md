# recipe: deterministic-tick-pools

Fixed InstancedMesh pools (packets/waves/halos) animated by a derived `tick` clock: pure resolvers
map (tick, index) → pose, pools sit at `count=0` + `visible=false` when idle.

**Why**: rAF-time animation made captures unreproducible and per-frame allocation churned GC; a
pinned `tick` in the URL must draw the identical frame every run.

**Exemplar**: `disenos/cinemex-hvac-lorawan/src/scene/interaction.js` — `resolvePacketT(tick,
phase)`, `resolveHaloPulse(tick)`, `resolveWaveRing(tick, index)`, `samplePolyline(points, t)`
(arc-length walk, constant speed on uneven segments); consumed by `applyAnimationPools` in
`src/scene/architecture.js` (writes instance matrices, sets `mesh.count`/`visible`).

**Rules a re-implementation must keep**

1. Resolvers are PURE and periodic — no Date.now, no own rAF, no state: the draw at tick N is
   identical on every machine, so t0/t30 capture pairs reproduce exactly.
2. Pools are allocated ONCE at max capacity; per frame only instance matrices + `count` change
   (zero allocation); idle pools go `count=0` AND `visible=false` (skip the draw call entirely).
3. Polyline motion samples by ARC LENGTH (`samplePolyline`), never by segment index — packets
   keep constant speed across uneven waypoints.

**Evidence**: cinemex `src/scene/interaction.js` · interaction-ui 0.81 + optimization 0.82.
