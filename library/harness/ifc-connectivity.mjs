// library: ifc-connectivity  (harness/ifc-connectivity.mjs) — IFC connectivity READER (investigador4).
// The intake twin of ifc-export: parse IfcDistributionElement / IfcDistributionPort /
// IfcRelConnectsPorts out of IFC4 STEP text into a connectivity graph, offline and pure-Node (no
// web-ifc WASM — we only read the connectivity subset, which is flat single-line STEP entities).
// Lets the kit ingest a client IFC's PORT CONNECTIVITY (which elements are joined) alongside the DWG
// intake ladder, without pulling the heavy WASM parser. REPORTS, never mutates.
//
// readConnectivity(ifcText) -> { elements:[{id,name,type}], ports:[{id,name,flow,element}], connections:[[nameA,nameB]] }
// LIMITATION (honest): handles well-formed SINGLE-LINE `#N=TYPE(...);` entities (what ifc-export and
// most tools emit). Multi-line entities or inline comments are out of scope for this connectivity reader.

const ELEM_TYPES = /^IFC(PUMP|CHILLER|UNITARYEQUIPMENT|FLOWSEGMENT|FLOWCONTROLLER|FLOWMOVINGDEVICE|VALVE|TANK|ENERGYCONVERSIONDEVICE|DISTRIBUTIONELEMENT)$/;

function quoted(args) { return [...args.matchAll(/'((?:[^']|'')*)'/g)].map(m => m[1].replace(/''/g, "'")); }
function refs(args) { return (args.match(/#\d+/g) || []); }

export function readConnectivity(ifcText) {
  const ents = new Map();
  for (const line of String(ifcText).split('\n')) {
    const m = line.match(/^\s*#(\d+)\s*=\s*([A-Z0-9_]+)\((.*)\)\s*;\s*$/);
    if (m) ents.set(`#${m[1]}`, { type: m[2], args: m[3] });
  }
  const elements = [], ports = [], connections = [];
  const portById = new Map();

  for (const [id, e] of ents) {
    if (ELEM_TYPES.test(e.type)) {
      const q = quoted(e.args);
      elements.push({ id, name: q[1] ?? null, type: e.type });
    } else if (e.type === 'IFCDISTRIBUTIONPORT') {
      const q = quoted(e.args);
      const fm = e.args.match(/\.(SOURCE|SINK|SOURCEANDSINK)\./);
      const p = { id, name: q[1] ?? null, flow: fm ? fm[1] : null, element: null };
      ports.push(p); portById.set(id, p);
    }
  }
  // tie ports to elements
  for (const [, e] of ents)
    if (e.type === 'IFCRELCONNECTSPORTTOELEMENT') {
      const r = refs(e.args); const p = portById.get(r[0]);
      if (p && r[1]) p.element = r[1];
    }
  // the connectivity payload
  for (const [, e] of ents)
    if (e.type === 'IFCRELCONNECTSPORTS') {
      const r = refs(e.args);
      const a = portById.get(r[0]), b = portById.get(r[1]);
      if (a && b) connections.push([a.name, b.name]);
    }
  return { elements, ports, connections };
}
