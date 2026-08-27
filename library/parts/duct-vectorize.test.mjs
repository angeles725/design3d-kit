import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDuctJunctions, ductNetworkToScene,
  snapToNominal, measureFlankWidth, perpOffsetsFromFlanks, mergeWidthProvenance,
  NOMINAL_DUCT_METRIC_M, endpointDegreesFromRuns,
} from './duct-vectorize.mjs';
import { expectedOpenLoopsFromDegrees } from '../harness/open-edge-cap.mjs';

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

// ---- increment 3: FLANK-WIDTH derivation (Revisor retro P4) ----
const IN = (i) => +(i * 0.0254).toFixed(6);
const EVEN_INCH = [2, 4, 6, 8].map(IN);

test('snapToNominal picks the nearest ladder value', () => {
  assert.equal(snapToNominal(0.105, EVEN_INCH), IN(4));   // 105mm nearest 4"=101.6
  assert.equal(snapToNominal(0.31, NOMINAL_DUCT_METRIC_M), 0.3);
  assert.equal(snapToNominal(NaN), null);
});

test('P4 FIX: measure the EXTERIOR flank pair (outermost), never an interior pair', () => {
  // four flank lines: exterior at 0 and 0.105 (105mm), interior at 0.011 and 0.0935 (interior span 82.5mm).
  const offsets = [0, 0.011, 0.0935, 0.105];
  const w = measureFlankWidth(offsets, { ladder: EVEN_INCH });
  assert.ok(Math.abs(w.raw - 0.105) < 1e-9, `raw must be the exterior 105mm, got ${w.raw * 1000}mm`);
  assert.notEqual(w.raw, 0.0825, 'must NOT pick the interior 82.5mm pair');
  assert.equal(w.prov, 'measured');
});

test('P4 VALUE: exposing raw/deltaMm distinguishes a good measurement from the interior-pair bug that the snap masks', () => {
  // Both the wrong (interior) and the right (exterior) measurement SNAP to the same 4" nominal — the snap
  // ALONE hides the error. deltaMm=|raw-snap|·1000 reveals it: 19.1mm for the bad pick vs 3.4mm for the good.
  const bad = measureFlankWidth([0, 0.0825], { ladder: EVEN_INCH });   // interior pick
  const good = measureFlankWidth([0, 0.105], { ladder: EVEN_INCH });   // exterior pick
  assert.equal(bad.snap, IN(4));
  assert.equal(good.snap, IN(4));                                       // same snapped nominal — snap hides it
  assert.ok(bad.deltaMm > 15, `bad pick deltaMm reveals the error (got ${bad.deltaMm}mm)`);
  assert.ok(good.deltaMm < 5, `good pick deltaMm is small (got ${good.deltaMm}mm)`);
});

test('measureFlankWidth: fewer than 2 flanks → absent-in-source (cannot measure)', () => {
  const w = measureFlankWidth([0.05]);
  assert.equal(w.prov, 'absent-in-source');
  assert.equal(w.v, null);
  assert.equal(w.raw, null);
});

test('perpOffsetsFromFlanks projects flank midpoints onto the width axis', () => {
  const segs = [
    { a: [0, 0, 0], b: [0, 1, 0] },      // x=0
    { a: [0.4, 0, 0], b: [0.4, 1, 0] },  // x=0.4
  ];
  const offs = perpOffsetsFromFlanks(segs, [1, 0, 0]);
  assert.ok(Math.abs(offs[0] - 0) < 1e-9 && Math.abs(offs[1] - 0.4) < 1e-9);
  const w = measureFlankWidth(offs, { system: 'metric' });
  assert.ok(Math.abs(w.raw - 0.4) < 1e-9);
  assert.equal(w.v, 0.4); // exact metric nominal
});

test('mergeWidthProvenance: LABEL wins when it carries a real measurement (flank ignored)', () => {
  const label = { v: 0.3, prov: 'measured', raw: 0.3, snap: 0.3, deltaMm: 0 };
  const flank = { v: 0.4, prov: 'measured', raw: 0.41, snap: 0.4, deltaMm: 10 };
  assert.deepEqual(mergeWidthProvenance(label, flank), label);
});

test('mergeWidthProvenance: FLANK fills only an absent-in-source label run', () => {
  const label = { v: null, prov: 'absent-in-source', raw: null, snap: null, deltaMm: null };
  const flank = { v: 0.4, prov: 'measured', raw: 0.41, snap: 0.4, deltaMm: 10 };
  assert.deepEqual(mergeWidthProvenance(label, flank), flank);
});

test('mergeWidthProvenance: neither source has a value → stays absent-in-source (never fabricate)', () => {
  const label = { v: null, prov: 'absent-in-source', raw: null, snap: null, deltaMm: null };
  const flank = { v: null, prov: 'absent-in-source', raw: null, snap: null, deltaMm: null };
  assert.equal(mergeWidthProvenance(label, flank).prov, 'absent-in-source');
});

test('flank envelope plugs straight into fieldProvenance.width (shape {v,prov,raw,snap,deltaMm})', () => {
  const w = measureFlankWidth([0, 0.105], { ladder: EVEN_INCH });
  for (const k of ['v', 'prov', 'raw', 'snap', 'deltaMm']) assert.ok(k in w, `envelope missing ${k}`);
});

test('measureFlankWidth deterministic', () => {
  const f = () => measureFlankWidth([0, 0.011, 0.0935, 0.105], { ladder: EVEN_INCH });
  assert.equal(JSON.stringify(f()), JSON.stringify(f()));
});

test('perpOffsetsFromFlanks consumes inv4 flankSegments 2D shape {a:[x,y],b:[x,y]} (no NaN from missing z)', () => {
  const flankSegments = [
    { a: [0, 0], b: [0, 1], layer: 'PDF_HVAC', geometryIndex: 3 },
    { a: [0.105, 0], b: [0.105, 1], layer: 'PDF_HVAC', geometryIndex: 6 },
  ];
  const offs = perpOffsetsFromFlanks(flankSegments, [1, 0]);
  assert.ok(offs.every(Number.isFinite), 'no NaN from missing z');
  assert.ok(Math.abs(offs[1] - offs[0] - 0.105) < 1e-9);
});

test('perpOffsetsFromFlanks still accepts 3D segments (missing-z-safe both ways)', () => {
  const offs = perpOffsetsFromFlanks([{ a: [0, 0, 2], b: [0, 1, 2] }, { a: [0.4, 0, 2], b: [0.4, 1, 2] }], [1, 0, 0]);
  assert.ok(Math.abs(offs[1] - offs[0] - 0.4) < 1e-9);
});

// ---- increment 4: endpointDegreesFromRuns (topology for the fused-mesh WU-L4-B gate) ----
test('endpointDegreesFromRuns: L-shape → r1 [free,elbow]=[1,2], r2 [elbow,free]=[2,1]', () => {
  const d = endpointDegreesFromRuns([
    { id: 'r1', a: [0, 0, 0], b: [2, 0, 0], radius: 0.1 },
    { id: 'r2', a: [2, 0, 0], b: [2, 2, 0], radius: 0.1 },
  ]);
  assert.deepEqual(d.r1, [1, 2]);
  assert.deepEqual(d.r2, [2, 1]);
});

test('endpointDegreesFromRuns: a middle run of a chain is through at BOTH ends → [2,2]', () => {
  const d = endpointDegreesFromRuns([
    { id: 'r1', a: [0, 0, 0], b: [2, 0, 0], radius: 0.1 },
    { id: 'r2', a: [2, 0, 0], b: [4, 0, 0], radius: 0.1 }, // both ends at a junction
    { id: 'r3', a: [4, 0, 0], b: [6, 0, 0], radius: 0.1 },
  ]);
  assert.deepEqual(d.r2, [2, 2]); // through-connected both ends
  assert.deepEqual(d.r1, [1, 2]);
});

test('endpointDegreesFromRuns: tee endpoint has degree 3', () => {
  const d = endpointDegreesFromRuns([
    { id: 'a', a: [0, 0, 0], b: [2, 0, 0], radius: 0.1 },
    { id: 'b', a: [0, 0, 0], b: [-2, 0, 0], radius: 0.1 },
    { id: 'c', a: [0, 0, 0], b: [0, 2, 0], radius: 0.1 },
  ]);
  assert.equal(d.a[0], 3); // shared origin is a tee (degree 3)
  assert.equal(d.a[1], 1); // far end free
});

test('COMPOSE PROOF: endpointDegreesFromRuns → expectedOpenLoopsFromDegrees matches the fused-gate contract', () => {
  const d = endpointDegreesFromRuns([
    { id: 'r1', a: [0, 0, 0], b: [2, 0, 0], radius: 0.1 },
    { id: 'r2', a: [2, 0, 0], b: [4, 0, 0], radius: 0.1 },
    { id: 'r3', a: [4, 0, 0], b: [6, 0, 0], radius: 0.1 },
  ]);
  // through-run r2 [2,2] → 0 free ends (both mesh ends should be covered)
  assert.equal(expectedOpenLoopsFromDegrees(d.r2), 0);
  // terminal r1 [1,2] → 1 free end (the terminal), the connected end must be covered
  assert.equal(expectedOpenLoopsFromDegrees(d.r1), 1);
});

test('endpointDegreesFromRuns deterministic', () => {
  const runs = [{ id: 'r2', a: [2, 0, 0], b: [2, 2, 0], radius: 0.1 }, { id: 'r1', a: [0, 0, 0], b: [2, 0, 0], radius: 0.1 }];
  assert.equal(JSON.stringify(endpointDegreesFromRuns(runs)), JSON.stringify(endpointDegreesFromRuns(runs)));
});
