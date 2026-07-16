# recipe: app-ready-flag

Readiness is a DOM dataset flag — `document.documentElement.dataset.appReady = 'true'`
(`data-app-ready` on `<html>`) — set only after boot work (including shader warm-up) finished.

**Why**: the boot path once wrote a hard-coded "healthy" status literal as its ready signal,
clobbering the derived HUD copy — a fault URL loaded with an alarm list AND a status line that
denied it, on every cold load.

**Exemplar**: `disenos/cinemex-hvac-lorawan/main.js` (~L374-390) — `runShaderWarmup(...)` then
`document.documentElement.dataset.appReady = 'true'` then the first derived-HUD render; the
capture harness waits on the attribute.

**Rules a re-implementation must keep**

1. Readiness is an ATTRIBUTE, never a status-text write: the flag must not double as a second
   writer of any user-facing copy (copy stays derived — see recipe `hud-single-derivation`).
2. Set it LAST: after warm-up, hydration and first render — anything that must be settled in
   cold-load evidence happens before the flag, because harnesses race it.
3. Capture/probe tooling waits on `[data-app-ready="true"]`, not on timeouts or console lines.

**Evidence**: cinemex `main.js` · interaction-ui 0.81.
