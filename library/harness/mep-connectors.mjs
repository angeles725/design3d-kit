// library: mep-connectors  (harness/mep-connectors.mjs) — MEP connector-compatibility validator (investigador4).
// Realizes the Revit MEP-connector semantics (systems + connectors) as a REPORTS-only QC over the
// semantic scene_graph (references/spatial-world-model.md; investigacion4 §Revit connectors). A pipe
// segment must join a SOURCE to a SINK (flow-direction sanity) and stay within one SYSTEM
// (CHW↔CHW, never CHW↔HHW). Pure, zero-import, deterministic, Node-testable. REPORTS, never mutates.
//
// validateConnectors(sceneGraph) -> { ok, errors:[{connection,reason,detail}], warnings:[...], checked }
//   sceneGraph = { objects:[{id, ports:{NAME:{flow?, system?, dn?, ...}}}], connections:[["OBJ.PORT","OBJ.PORT"]] }

// flow role from an explicit port.flow, else inferred from the port NAME
export function flowRole(name, port = {}) {
  if (port.flow === 'source' || port.flow === 'sink') return port.flow;
  const s = String(name).toLowerCase();
  if (/(out\b|outlet|disch|supply|_s\b|chws|hhws|cws|source)/.test(s)) return 'source';
  if (/(in\b|inlet|suct|return|_r\b|chwr|hhwr|cwr|sink)/.test(s)) return 'sink';
  return 'unknown';
}
// fluid system from an explicit port.system, else inferred from the port NAME prefix
export function systemOf(name, port = {}) {
  if (port.system) return String(port.system).toUpperCase();
  const s = String(name).toLowerCase();
  if (/chw/.test(s)) return 'CHW';
  if (/hhw/.test(s)) return 'HHW';
  if (/\bcw|cnd|cond/.test(s)) return 'CW';
  if (/steam|stm/.test(s)) return 'STEAM';
  return null; // untagged / generic (suction/discharge/in/out) — cannot determine
}

function resolvePort(sg, ref) {
  const [oid, pname] = String(ref).split('.');
  const o = (sg.objects || []).find(x => x.id === oid);
  if (!o || !o.ports || !(pname in o.ports)) return null;
  return { oid, pname, def: o.ports[pname] || {} };
}

export function validateConnectors(sceneGraph) {
  const errors = [], warnings = [];
  let checked = 0;
  for (const conn of sceneGraph.connections || []) {
    const [a, b] = conn;
    const pa = resolvePort(sceneGraph, a), pb = resolvePort(sceneGraph, b);
    if (!pa || !pb) {
      errors.push({ connection: conn, reason: 'missing-port', detail: { aFound: !!pa, bFound: !!pb } });
      continue;
    }
    checked++;
    // flow: exactly one source + one sink
    const ra = flowRole(pa.pname, pa.def), rb = flowRole(pb.pname, pb.def);
    if (ra !== 'unknown' && rb !== 'unknown' && ra === rb)
      errors.push({ connection: conn, reason: 'flow-direction', detail: { a: ra, b: rb } });
    else if (ra === 'unknown' || rb === 'unknown')
      warnings.push({ connection: conn, reason: 'flow-untagged', detail: { a: ra, b: rb } });
    // system: both known -> must match
    const sa = systemOf(pa.pname, pa.def), sb = systemOf(pb.pname, pb.def);
    if (sa && sb && sa !== sb)
      errors.push({ connection: conn, reason: 'system-mismatch', detail: { a: sa, b: sb } });
    else if (!sa || !sb)
      warnings.push({ connection: conn, reason: 'system-untagged', detail: { a: sa, b: sb } });
    // DN: both known -> should match
    const da = pa.def.dn, db = pb.def.dn;
    if (da != null && db != null && da !== db)
      warnings.push({ connection: conn, reason: 'dn-mismatch', detail: { a: da, b: db } });
  }
  return { ok: errors.length === 0, errors, warnings, checked };
}
