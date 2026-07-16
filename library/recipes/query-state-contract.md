# recipe: query-state-contract

Atomic URL query-state parser/serializer as a QA contract: the URL is the ONLY way a capture
declares scene state, and every capture URL is reproducible byte-for-byte.

**Why**: a capture once loaded with a stale `mode` token contradicting its fault `state` — the two
axes could disagree inside one URL, so gated evidence depended on parse order.

**Exemplar**: `disenos/cinemex-hvac-lorawan/src/controllers/query-state.js` —
`DEFAULT_QUERY_STATE`, `parseQueryState(search, warn)`, `serializeQueryState(state)`,
`reconcileSceneState(candidate)` (fault state wins over `mode`; otherwise `mode` decides).

**Rules a re-implementation must keep**

1. ATOMIC RESET: any malformed value on a KNOWN key resets ALL state to defaults with a loud
   warn — never partial acceptance (silently mixed state is untestable).
2. FIXED POINT: `serializeQueryState(parseQueryState(s))` is stable, and serialize emits keys in
   a fixed order so captured URLs and reloads stay byte-identical.
3. `tick` pins the animation clock (digits-only, `tickExplicit` flag): a pinned URL freezes the
   scene there so captures never race the animation.

**Evidence**: cinemex `src/controllers/query-state.js` · interaction-ui 0.81.
