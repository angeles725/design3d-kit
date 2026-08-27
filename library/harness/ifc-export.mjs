// library: ifc-export  (harness/ifc-export.mjs) — scene_graph→IFC4 connectivity export (investigador4).
// Pure-Node IFC4 (ISO-10303-21 STEP text) emitter that maps a
// certified scene_graph (objects + directional ports + connections) into IfcDistributionElement +
// IfcDistributionPort + IfcRelConnectsPorts, so downstream BIM knows elements are CONNECTED, not just
// visually touching. No web-ifc/WASM needed to WRITE (IFC is text). Node tool, never bundled in the dist.
//
// API:  sceneGraphToIfc(sg, {name}) -> string (.ifc content)
//   sg = { objects:[{id,type?,size,center,ports?:{NAME:{offset|position:[x,y,z],direction?,DN?}}}],
//          connections:[["OBJ.PORT","OBJ.PORT"], ...] }
// CLI:  node ifc-export.mjs <scene.json> [out.ifc]   (scene.json may be the exercise {objects,pipes} form;
//       pipes' from/to become connections and ports are read from the objects)

const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
function guid(n) { // deterministic 22-char IFC-base64 id (reproducible; not a compressed UUID — noted as follow-up)
  let s = ''; let v = n + 1;
  for (let i = 0; i < 22; i++) { s = B64[v % 64] + s; v = Math.floor(v / 64) + 7 * (i + 1); }
  return s;
}
const flowDir = (name) => {
  const s = name.toLowerCase();
  if (/out|disch|supply|chws|source/.test(s)) return '.SOURCE.';
  if (/in|suct|return|chwr|sink/.test(s)) return '.SINK.';
  return '.SOURCEANDSINK.';
};
const elemType = (type = '') => {
  const t = type.toLowerCase();
  if (/pump/.test(t)) return 'IFCPUMP';
  if (/chiller/.test(t)) return 'IFCCHILLER';
  if (/ahu|air.?handl/.test(t)) return 'IFCUNITARYEQUIPMENT';
  if (/header|pipe|duct|manifold/.test(t)) return 'IFCFLOWSEGMENT';
  if (/valve/.test(t)) return 'IFCVALVE';
  if (/tank/.test(t)) return 'IFCTANK';
  return 'IFCDISTRIBUTIONELEMENT';
};
const portOffset = (p) => Array.isArray(p) ? p : (p.offset || p.position);

export function sceneGraphToIfc(sg, { name = 'design3d-scene' } = {}) {
  const L = []; let n = 0;
  const add = (type, args) => { const id = ++n; L.push(`#${id}=${type}(${args});`); return `#${id}`; };
  const pt = (v) => add('IFCCARTESIANPOINT', `(${v.map(x => (+x).toFixed(6)).join(',')})`);
  const placement = (world, relTo) => {
    const ax = add('IFCAXIS2PLACEMENT3D', `${pt(world)},$,$`);
    return add('IFCLOCALPLACEMENT', `${relTo || '$'},${ax}`);
  };

  // units + context + project spatial structure
  const lenUnit = add('IFCSIUNIT', '*,.LENGTHUNIT.,$,.METRE.');
  const units = add('IFCUNITASSIGNMENT', `(${lenUnit})`);
  const worldAx = add('IFCAXIS2PLACEMENT3D', `${pt([0, 0, 0])},$,$`);
  const ctx = add('IFCGEOMETRICREPRESENTATIONCONTEXT', `$,'Model',3,1.0E-5,${worldAx},$`);
  const project = add('IFCPROJECT', `'${guid(n)}',$,'${name}',$,$,$,$,(${ctx}),${units}`);
  const sitePl = placement([0, 0, 0]);
  const site = add('IFCSITE', `'${guid(n)}',$,'Site',$,$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$`);
  const bldgPl = placement([0, 0, 0], sitePl);
  const bldg = add('IFCBUILDING', `'${guid(n)}',$,'Building',$,$,${bldgPl},$,$,.ELEMENT.,$,$,$`);
  const storeyPl = placement([0, 0, 0], bldgPl);
  const storey = add('IFCBUILDINGSTOREY', `'${guid(n)}',$,'Storey',$,$,${storeyPl},$,$,.ELEMENT.,0.0`);
  add('IFCRELAGGREGATES', `'${guid(n)}',$,$,$,${project},(${site})`);
  add('IFCRELAGGREGATES', `'${guid(n)}',$,$,$,${site},(${bldg})`);
  add('IFCRELAGGREGATES', `'${guid(n)}',$,$,$,${bldg},(${storey})`);

  // elements + ports
  const elemRefs = [];
  const portRef = new Map(); // "OBJ.PORT" -> #ref
  for (const o of sg.objects) {
    const elPl = placement(o.center, storeyPl);
    const el = add(elemType(o.type), `'${guid(n)}',$,'${o.id}',$,$,${elPl},$,$`);
    elemRefs.push(el);
    for (const [pname, pdef] of Object.entries(o.ports || {})) {
      const off = portOffset(pdef); if (!off) continue;
      const world = [o.center[0] + off[0], o.center[1] + off[1], o.center[2] + off[2]];
      const pPl = placement(world, elPl);
      const port = add('IFCDISTRIBUTIONPORT', `'${guid(n)}',$,'${o.id}.${pname}',$,$,${pPl},$,${flowDir(pname)},$,$`);
      portRef.set(`${o.id}.${pname}`, port);
      add('IFCRELCONNECTSPORTTOELEMENT', `'${guid(n)}',$,$,$,${port},${el}`);
    }
  }
  add('IFCRELCONTAINEDINSPATIALSTRUCTURE', `'${guid(n)}',$,$,$,(${elemRefs.join(',')}),${storey}`);

  // connections — the payload that makes downstream BIM know two elements are joined
  const missing = [];
  for (const [a, b] of (sg.connections || [])) {
    const ra = portRef.get(a), rb = portRef.get(b);
    if (!ra || !rb) { missing.push([a, b]); continue; }
    add('IFCRELCONNECTSPORTS', `'${guid(n)}',$,$,$,${ra},${rb},$`);
  }
  if (missing.length) throw new Error(`IFC-export: connections reference unknown ports: ${JSON.stringify(missing)}`);

  const header =
    `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');\n` +
    `FILE_NAME('${name}.ifc','2026-08-26T00:00:00',(''),(''),'design3d/ifc-export','design3d',$);\n` +
    `FILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n`;
  return header + L.join('\n') + `\nENDSEC;\nEND-ISO-10303-21;\n`;
}

// build a scene_graph from either a real scene_graph or the exercise {objects,pipes} form
export function toSceneGraph(scene) {
  if (scene.connections) return scene;
  const connections = (scene.pipes || []).map(p => [p.from, p.to]);
  return { objects: scene.objects, connections };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const inPath = process.argv[2];
  if (!inPath) { console.error('usage: node ifc-export.mjs <scene.json> [out.ifc]'); process.exit(2); }
  const sg = toSceneGraph(JSON.parse(readFileSync(inPath, 'utf8')));
  const ifc = sceneGraphToIfc(sg, { name: 'design3d-scene' });
  const out = process.argv[3] || inPath.replace(/\.json$/, '') + '.ifc';
  writeFileSync(out, ifc);
  console.error(`wrote ${out} (${ifc.split('\n').length} lines, ${sg.objects.length} elements, ${(sg.connections || []).length} connections)`);
}
