import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sceneGraphToIfc, toSceneGraph } from './ifc-export.mjs';

const here = dirname(fileURLToPath(import.meta.url));
// use the F2 scene (7 objects, directional ports, 7 connections) as the proof fixture
const scene = JSON.parse(readFileSync(join(here, '..', 'exercise-F2', 'creador1-flow.json'), 'utf8'));
const sg = toSceneGraph(scene);
const ifc = sceneGraphToIfc(sg, { name: 'f2-plant' });

// --- parse the STEP DATA section into id -> {type, args} ---
function parse(ifcText) {
  const ents = new Map();
  for (const line of ifcText.split('\n')) {
    const m = line.match(/^#(\d+)=([A-Z0-9]+)\((.*)\);$/);
    if (m) ents.set(`#${m[1]}`, { type: m[2], args: m[3] });
  }
  return ents;
}
const ents = parse(ifc);

test('STEP well-formedness: header + DATA + terminator', () => {
  assert.match(ifc, /^ISO-10303-21;/);
  assert.match(ifc, /FILE_SCHEMA\(\('IFC4'\)\);/);
  assert.match(ifc, /\nDATA;\n/);
  assert.match(ifc, /ENDSEC;\nEND-ISO-10303-21;\n$/);
  assert.ok(ents.size > 0, 'at least one entity');
});

test('every referenced #id is defined (no dangling refs)', () => {
  const dangling = [];
  for (const [, e] of ents)
    for (const ref of e.args.match(/#\d+/g) || [])
      if (!ents.has(ref)) dangling.push(ref);
  assert.deepEqual(dangling, [], `dangling refs: ${dangling.join(',')}`);
});

test('every element and every port is emitted', () => {
  const ports = [...ents.values()].filter(e => e.type === 'IFCDISTRIBUTIONPORT');
  const expectedPorts = sg.objects.reduce((a, o) => a + Object.keys(o.ports || {}).length, 0);
  assert.equal(ports.length, expectedPorts, 'port count');
  const elems = [...ents.values()].filter(e => /^IFC(PUMP|CHILLER|UNITARYEQUIPMENT|FLOWSEGMENT|VALVE|TANK|DISTRIBUTIONELEMENT)$/.test(e.type));
  assert.equal(elems.length, sg.objects.length, 'element count');
});

test('connectivity round-trip: IfcRelConnectsPorts reproduces the input connections exactly', () => {
  // port ref -> name
  const portName = new Map();
  for (const [id, e] of ents)
    if (e.type === 'IFCDISTRIBUTIONPORT') {
      const nm = e.args.match(/'([^']+)'/); // Name is the first quoted string after GlobalId... GlobalId is also quoted
      // args: 'GUID',$,'OBJ.PORT',$,$,#pl,$,.DIR.,$,$  -> the 2nd quoted string is the name
      const quoted = [...e.args.matchAll(/'([^']*)'/g)].map(m => m[1]);
      portName.set(id, quoted[1]);
    }
  const rebuilt = [];
  for (const [, e] of ents)
    if (e.type === 'IFCRELCONNECTSPORTS') {
      const refs = e.args.match(/#\d+/g);
      // args: 'GUID',$,$,$,#relating,#related,$
      rebuilt.push([portName.get(refs[0]), portName.get(refs[1])]);
    }
  const expected = sg.connections.map(([a, b]) => `${a}->${b}`).sort();
  const got = rebuilt.map(([a, b]) => `${a}->${b}`).sort();
  assert.deepEqual(got, expected, 'connection set must survive translation');
});
