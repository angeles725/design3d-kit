# recipe: hud-single-derivation

One pure `deriveHudModel(state)` owns ALL HUD copy; every DOM surface (status line, severity dot,
alarm list) renders from that single frozen result.

**Why**: a boot path once wrote a hard-coded "sin alarmas" status while the alarm list showed an
active event — two writers of the same fact contradicted each other on every fault load.

**Exemplar**: `disenos/cinemex-hvac-lorawan/src/hud.mjs` — `deriveHudModel(model)` returns
`Object.freeze({ severity, alarmCount, stoppedCount, claimsNoAlarms, statusText, alarmItems })`;
all three DOM surfaces read this object, none reads `model.alarms` directly.

**Rules a re-implementation must keep**

1. The derivation is PURE and the only copy authority: no DOM writer composes status text
   itself — contradiction between surfaces becomes unrepresentable, not just unlikely.
2. Distinct facts stay distinct in the model: alarm state vs delivery state (`stoppedCount`) are
   separate fields, and the copy only claims an outage when the topology actually stopped one.
3. Return a frozen object (and freeze list items): renderers can never patch copy in place and
   reintroduce a second writer.

**Evidence**: cinemex `src/hud.mjs` · interaction-ui 0.81.
