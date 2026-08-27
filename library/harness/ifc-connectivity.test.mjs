import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConnectivity } from './ifc-connectivity.mjs';
import { sceneGraphToIfc } from './ifc-export.mjs';

const SG = {
  objects: [
    { id: 'CH-01', type: 'chiller', size: [3, 1.2, 1.8], center: [1.5, 1, 0.9],
      ports: { CHWS_out: { offset: [1.5, 0.3, 0] }, CHWR_in: { offset: [1.5, -0.3, 0] } } },
    { id: 'P-01', type: 'pump', size: [0.8, 0.6, 0.9], center: [4, 1, 0.45],
      ports: { suction: { offset: [-0.4, 0, 0.1] }, discharge: { offset: [0.4, 0, 0.1] } } },
    { id: 'AHU-01', type: 'ahu', size: [2.5, 1.5, 2], center: [7, 1, 1],
      ports: { CHW_in: { offset: [-1.25, 0.4, 0] }, CHW_out: { offset: [-1.25, -0.4, 0] } } },
  ],
  connections: [
    ['CH-01.CHWS_out', 'P-01.suction'],
    ['P-01.discharge', 'AHU-01.CHW_in'],
    ['AHU-01.CHW_out', 'CH-01.CHWR_in'],
  ],
};

test('ROUND-TRIP: export→read reproduces the connection set exactly (lossless connectivity)', () => {
  const ifc = sceneGraphToIfc(SG);
  const rc = readConnectivity(ifc);
  const got = rc.connections.map(([a, b]) => `${a}->${b}`).sort();
  const expected = SG.connections.map(([a, b]) => `${a}->${b}`).sort();
  assert.deepEqual(got, expected);
});

test('reads elements (with type) and ports (with flow)', () => {
  const rc = readConnectivity(sceneGraphToIfc(SG));
  assert.equal(rc.elements.length, 3);
  assert.ok(rc.elements.some(e => e.type === 'IFCPUMP' && e.name === 'P-01'));
  assert.equal(rc.ports.length, 6);
  const supply = rc.ports.find(p => p.name === 'CH-01.CHWS_out');
  assert.equal(supply.flow, 'SOURCE');
  const suction = rc.ports.find(p => p.name === 'P-01.suction');
  assert.equal(suction.flow, 'SINK');
});

test('ports resolve to their owning element', () => {
  const rc = readConnectivity(sceneGraphToIfc(SG));
  const p = rc.ports.find(x => x.name === 'P-01.discharge');
  const owner = rc.elements.find(e => e.id === p.element);
  assert.equal(owner.name, 'P-01');
});

test('parses a hand-written minimal IFC snippet (not just our own output)', () => {
  const snippet = [
    'ISO-10303-21;', 'DATA;',
    "#1=IFCPUMP('GUID000000000000000001',$,'PMP',$,$,$,$,$);",
    "#2=IFCFLOWSEGMENT('GUID000000000000000002',$,'PIPE',$,$,$,$,$);",
    "#3=IFCDISTRIBUTIONPORT('GUID000000000000000003',$,'PMP.out',$,$,$,$,.SOURCE.,$,$);",
    "#4=IFCDISTRIBUTIONPORT('GUID000000000000000004',$,'PIPE.in',$,$,$,$,.SINK.,$,$);",
    "#5=IFCRELCONNECTSPORTTOELEMENT('GUID000000000000000005',$,$,$,#3,#1);",
    "#6=IFCRELCONNECTSPORTTOELEMENT('GUID000000000000000006',$,$,$,#4,#2);",
    "#7=IFCRELCONNECTSPORTS('GUID000000000000000007',$,$,$,#3,#4,$);",
    'ENDSEC;', 'END-ISO-10303-21;',
  ].join('\n');
  const rc = readConnectivity(snippet);
  assert.equal(rc.elements.length, 2);
  assert.deepEqual(rc.connections, [['PMP.out', 'PIPE.in']]);
});

test('empty / no-connectivity input yields empty graph, no throw', () => {
  const rc = readConnectivity('ISO-10303-21;\nDATA;\nENDSEC;\n');
  assert.deepEqual(rc, { elements: [], ports: [], connections: [] });
});
