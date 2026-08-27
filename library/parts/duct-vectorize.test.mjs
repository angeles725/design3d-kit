import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyDuctJunctions, ductNetworkToScene } from './duct-vectorize.mjs';

const at = (js, pos) => js.find((j) => Math.hypot(j.position[0] - pos[0], j.position[1] - pos[1], j.position[2] - pos[2]) < 1e-6);

test('L-shape → one 90° elbow + two free-ends', () => {
  const { junctions } = classifyDuctJunctions([
    { id: 'r1', a: [0, 0, 0], b: [2, 0, 0], radius: 0.1 },
    { id: 'r2', a: [2, 0, 0], b: [2, 2, 0], radius: 0.1 },
  ]);
  const corner = at(junctions, [2, 0, 0]);
  assert.equal(corner.type, 'elbow');
  assert.ok(Math.abs(corner.turnAngle - 90) < 1e-6);
  assert.deepEqual(corner.runIds.sort(), ['r1', 'r2']);
  assert.equal(at(junctions, [0, 0, 0]).type, 'free-end');
  assert.equal(at(junctions, [2, 2, 0]).type, 'free-end');
});

test('45° corner → elbow with turnAngle 45', () => {
  const { junctions } = classifyDuctJunctions([
    { id: 'r1', a: [0, 0, 0], b: [2, 0, 0], radius: 0.1 },
    { id: 'r2', a: [2, 0, 0], b: [4, 2, 0], radius: 0.1 }, // dir (1,1,0)/√2 from junction
  ]);
  assert.ok(Math.abs(at(junctions, [2, 0, 0]).turnAngle - 45) < 1e-6);
});

test('T-junction (3 runs) → tee', () => {
  const { junctions } = classifyDuctJunctions([
    { id: 'a', a: [0, 0, 0], b: [2, 0, 0], radius: 0.1 },
    { id: 'b', a: [0, 0, 0], b: [-2, 0, 0], radius: 0.1 },
    { id: 'c', a: [0, 0, 0], b: [0, 2, 0], radius: 0.1 },
  ]);
  const j = at(junctions, [0, 0, 0]);
  assert.equal(j.type, 'tee');
  assert.equal(j.degree, 3);
});

test('cross (4 runs) → cross', () => {
  const { junctions } = classifyDuctJunctions([
    { id: 'a', a: [0, 0, 0], b: [2, 0, 0], radius: 0.1 },
    { id: 'b', a: [0, 0, 0], b: [-2, 0, 0], radius: 0.1 },
    { id: 'c', a: [0, 0, 0], b: [0, 2, 0], radius: 0.1 },
    { id: 'd', a: [0, 0, 0], b: [0, -2, 0], radius: 0.1 },
  ]);
  assert.equal(at(junctions, [0, 0, 0]).type, 'cross');
});

test('collinear same section → straight (no fitting)', () => {
  const { junctions } = classifyDuctJunctions([
    { id: 'r1', a: [0, 0, 0], b: [2, 0, 0], radius: 0.1 },
    { id: 'r2', a: [2, 0, 0], b: [4, 0, 0], radius: 0.1 },
  ]);
  assert.equal(at(junctions, [2, 0, 0]).type, 'straight');
});

test('collinear different section → reducer', () => {
  const { junctions } = classifyDuctJunctions([
    { id: 'r1', a: [0, 0, 0], b: [2, 0, 0], radius: 0.1 },
    { id: 'r2', a: [2, 0, 0], b: [4, 0, 0], radius: 0.2 },
  ]);
  assert.equal(at(junctions, [2, 0, 0]).type, 'reducer');
});

test('rect ducts: collinear width change → reducer, same → straight', () => {
  const same = classifyDuctJunctions([
    { id: 'r1', a: [0, 0, 0], b: [2, 0, 0], width: 0.4, height: 0.3 },
    { id: 'r2', a: [2, 0, 0], b: [4, 0, 0], width: 0.4, height: 0.3 },
  ]).junctions;
  assert.equal(at(same, [2, 0, 0]).type, 'straight');
  const red = classifyDuctJunctions([
    { id: 'r1', a: [0, 0, 0], b: [2, 0, 0], width: 0.4, height: 0.3 },
    { id: 'r2', a: [2, 0, 0], b: [4, 0, 0], width: 0.3, height: 0.3 },
  ]).junctions;
  assert.equal(at(red, [2, 0, 0]).type, 'reducer');
});

test('directions point AWAY from the junction (into each run)', () => {
  const { junctions } = classifyDuctJunctions([
    { id: 'r1', a: [0, 0, 0], b: [2, 0, 0], radius: 0.1 },
    { id: 'r2', a: [2, 0, 0], b: [2, 2, 0], radius: 0.1 },
  ]);
  const c = at(junctions, [2, 0, 0]);
  // one dir is (-1,0,0) back down r1, the other (0,1,0) up r2
  const dirs = c.directions.map((d) => d.map((n) => Math.round(n)));
  assert.ok(dirs.some((d) => d[0] === -1 && d[1] === 0), 'has -x dir into r1');
  assert.ok(dirs.some((d) => d[0] === 0 && d[1] === 1), 'has +y dir into r2');
});

test('deterministic: junction order stable', () => {
  const runs = [
    { id: 'r2', a: [2, 0, 0], b: [2, 2, 0], radius: 0.1 },
    { id: 'r1', a: [0, 0, 0], b: [2, 0, 0], radius: 0.1 },
  ];
  assert.equal(JSON.stringify(classifyDuctJunctions(runs)), JSON.stringify(classifyDuctJunctions(runs)));
});
// ---- increment 2: scene_graph emitter (i2 spatial-harness round-trip contract) ----
test('scene emit: L-shape → one elbow object with A/B ports + DN, runs wired by identity', () => {
  const { objects, connections } = ductNetworkToScene([
    { id: 'r1', a: [0, 0, 0], b: [2, 0, 0], radius: 0.15 },
    { id: 'r2', a: [2, 0, 0], b: [2, 2, 0], radius: 0.15 },
  ]);
  assert.equal(objects.length, 1);
  const elb = objects[0];
  assert.equal(elb.type, 'elbow');
  assert.equal(elb.id, 'ELB-0001');
  assert.deepEqual(elb.center, [2, 0, 0]);
  assert.deepEqual(Object.keys(elb.ports).sort(), ['A', 'B']);
  assert.equal(elb.portDN.A, 0.3); // 2*radius
  // ports are LOCAL offsets = direction*radius
  for (const p of Object.values(elb.ports)) assert.ok(Math.hypot(...p) - 0.15 < 1e-9);
  // each run end at the elbow resolves to ELB-0001.<port>; the far ends are free
  const r1 = connections.find((c) => c.run === 'r1');
  const r2 = connections.find((c) => c.run === 'r2');
  assert.ok([r1.a, r1.b].some((x) => x.startsWith('ELB-0001.')));
  assert.ok([r1.a, r1.b].some((x) => x.startsWith('free:r1:')));
  assert.ok([r2.a, r2.b].some((x) => x.startsWith('ELB-0001.')));
});

test('scene emit: T → one tee object with 3 ports', () => {
  const { objects } = ductNetworkToScene([
    { id: 'a', a: [0, 0, 0], b: [2, 0, 0], radius: 0.1 },
    { id: 'b', a: [0, 0, 0], b: [-2, 0, 0], radius: 0.1 },
    { id: 'c', a: [0, 0, 0], b: [0, 2, 0], radius: 0.1 },
  ]);
  assert.equal(objects.length, 1);
  assert.equal(objects[0].type, 'tee');
  assert.deepEqual(Object.keys(objects[0].ports).sort(), ['A', 'B', 'C']);
});

test('scene emit: reducer carries DIFFERENT DN on its two ports (mismatch detectable)', () => {
  const { objects } = ductNetworkToScene([
    { id: 'r1', a: [0, 0, 0], b: [2, 0, 0], radius: 0.1 },
    { id: 'r2', a: [2, 0, 0], b: [4, 0, 0], radius: 0.2 },
  ]);
  const red = objects[0];
  assert.equal(red.type, 'reducer');
  const dns = Object.values(red.portDN).sort();
  assert.deepEqual(dns, [0.2, 0.4]); // 2*0.1 and 2*0.2 — the connectPorts DN check can flag the step
});

test('scene emit: rect duct DN is WxH string', () => {
  const { objects } = ductNetworkToScene([
    { id: 'r1', a: [0, 0, 0], b: [2, 0, 0], width: 0.4, height: 0.3 },
    { id: 'r2', a: [2, 0, 0], b: [2, 2, 0], width: 0.4, height: 0.3 },
  ]);
  assert.equal(objects[0].portDN.A, '0.4x0.3');
});

test('scene emit: deterministic + stable ids/port-labels across input order', () => {
  const runs1 = [
    { id: 'r1', a: [0, 0, 0], b: [2, 0, 0], radius: 0.1 },
    { id: 'r2', a: [2, 0, 0], b: [2, 2, 0], radius: 0.1 },
  ];
  const runs2 = [runs1[1], runs1[0]]; // reversed input
  assert.equal(JSON.stringify(ductNetworkToScene(runs1).objects), JSON.stringify(ductNetworkToScene(runs2).objects));
});
