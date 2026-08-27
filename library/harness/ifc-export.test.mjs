// Tests for the IFC-EXPORT harness tool (v1.19). Self-contained inline fixture (no external files).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneGraphToIfc, toSceneGraph } from './ifc-export.mjs';

// a minimal CHW fixture: chiller -> pump -> header, with directional ports + connections
const SCENE = {
  objects: [
    { id: 'CH-01', type: 'chiller', size: [3, 1.2, 1.8], center: [1.5, 1.0, 0.9],
      ports: { CHWS_out: { offset: [1.5, 0.3, 0], direction: [1, 0, 0] }, CHWR_in: { offset: [1.5, -0.3, 0], direction: [1, 0, 0] } } },
    { id: 'P-01', type: 'pump', size: [0.8, 0.6, 0.9], center: [4.0, 1.0, 0.45],
      ports: { suction: { offset: [-0.4, 0, 0.1], direction: [-1, 0, 0] }, discharge: { offset: [0.4, 0, 0.1], direction: [1, 0, 0] } } },
    { id: 'HDR-01', type: 'header', size: [3, 0.3, 0.3], center: [6.0, 1.0, 0.15],
      ports: { in: { offset: [-1.5, 0, 0], direction: [-1, 0, 0] }, ret: { offset: [-1.5, 0.1, 0], direction: [-1, 0, 0] } } },
  ],
  connections: [
    ['CH-01.CHWS_out', 'P-01.suction'],
    ['P-01.discharge', 'HDR-01.in'],
    ['HDR-01.ret', 'CH-01.CHWR_in'],
  ],
};

const ifc = sceneGraphToIfc(SCENE, { name: 'test-skid' });
const ents = new Map();
for (const line of ifc.split('\n')) {
  const m = line.match(/^#(\d+)=([A-Z0-9]+)\((.*)\);$/);
  if (m) ents.set(`#${m[1]}`, { type: m[2], args: m[3] });
}

test('emits well-formed IFC4 STEP', () => {
  assert.match(ifc, /^ISO-10303-21;/);
  assert.match(ifc, /FILE_SCHEMA\(\('IFC4'\)\);/);
  assert.match(ifc, /ENDSEC;\nEND-ISO-10303-21;\n$/);
  assert.ok(ents.size > 10);
});

test('no dangling entity references', () => {
  const dangling = [];
  for (const [, e] of ents) for (const ref of e.args.match(/#\d+/g) || []) if (!ents.has(ref)) dangling.push(ref);
  assert.deepEqual(dangling, []);
});

test('every element and port is emitted', () => {
  const ports = [...ents.values()].filter(e => e.type === 'IFCDISTRIBUTIONPORT').length;
  assert.equal(ports, 6);
  const elems = [...ents.values()].filter(e => /^IFC(PUMP|CHILLER|FLOWSEGMENT|DISTRIBUTIONELEMENT)$/.test(e.type)).length;
  assert.equal(elems, 3);
});

test('connectivity round-trip — connections survive translation exactly', () => {
  const portName = new Map();
  for (const [id, e] of ents)
    if (e.type === 'IFCDISTRIBUTIONPORT') portName.set(id, [...e.args.matchAll(/'([^']*)'/g)].map(m => m[1])[1]);
  const rebuilt = [];
  for (const [, e] of ents)
    if (e.type === 'IFCRELCONNECTSPORTS') { const r = e.args.match(/#\d+/g); rebuilt.push(`${portName.get(r[0])}->${portName.get(r[1])}`); }
  assert.deepEqual(rebuilt.sort(), SCENE.connections.map(([a, b]) => `${a}->${b}`).sort());
});

test('unknown port in a connection fails loud', () => {
  assert.throws(() => sceneGraphToIfc({ objects: SCENE.objects, connections: [['CH-01.nope', 'P-01.suction']] }), /unknown ports/);
});

test('toSceneGraph derives connections from the exercise {objects,pipes} form', () => {
  const sg = toSceneGraph({ objects: SCENE.objects, pipes: [{ from: 'CH-01.CHWS_out', to: 'P-01.suction' }] });
  assert.deepEqual(sg.connections, [['CH-01.CHWS_out', 'P-01.suction']]);
});
