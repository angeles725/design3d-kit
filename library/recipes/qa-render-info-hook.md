# recipe: qa-render-info-hook

Expose `window.__qaRenderInfo = () => ({...renderer.info.render, ...renderer.info.memory})` so
external probes read three.js's own exact per-frame accounting instead of inferring it.

**Why**: a wrapper-based probe counting WebGL draw entry points read every InstancedMesh as ONE
instance — it reported 59 draws / 708 tris for a whole multiplex and the same figure for two
different cameras; an optimization pass against that number optimizes against a fiction.

**Exemplar**: `disenos/cinemex-hvac-lorawan/main.js` (~L392-406) — `window.__qaRenderInfo`
returning `calls`, `triangles`, `lines`, `points` from `renderer.info.render` plus `geometries`,
`textures` from `renderer.info.memory` and `programs.length`.

**Rules a re-implementation must keep**

1. Source of truth is `renderer.info` ONLY — never wrap/patch GL draw functions to count.
2. The hook is a zero-argument closure over the live renderer, installed once at boot (after the
   app object exists), so a probe can call it after any settled frame.
3. Return a fresh plain object per call (probes serialize it); include memory counters — texture
   and geometry leaks show up here first.

**Evidence**: cinemex `main.js` · optimization 0.82.
