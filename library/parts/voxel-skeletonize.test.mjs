import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skeletonizeVoxelRuns } from './voxel-skeletonize.mjs';
import { classifyDuctJunctions, ductNetworkToScene } from './duct-vectorize.mjs';

const line = (from, to) => { // inclusive integer axis-aligned line of cells
  const c = [], d = to.map((v, i) => Math.sign(v - from[i]));
  let p = from.slice();
  c.push(p.slice());
  while (!p.every((v, i) => v === to[i])) { p = p.map((v, i) => v + d[i]); c.push(p.slice()); }
  return c;
};

test('straight path → 1 run', () => {
  const { runs } = skeletonizeVoxelRuns(line([0, 0, 0], [4, 0, 0]));
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0].a, [0, 0, 0]);
  assert.deepEqual(runs[0].b, [4, 0, 0]);
});

test('L-shape → 2 runs sharing the corner → classifies to one 90° elbow', () => {
  const cells = [...line([0, 0, 0], [2, 0, 0]), ...line([2, 1, 0], [2, 2, 0])];
  const { runs } = skeletonizeVoxelRuns(cells);
  assert.equal(runs.length, 2);
  // corner shared exactly
  const corner = [2, 0, 0];
  assert.ok(runs.some((r) => r.a.every((v, i) => v === corner[i]) || r.b.every((v, i) => v === corner[i])));
  const { junctions } = classifyDuctJunctions(runs);
  const elb = junctions.find((j) => j.type === 'elbow');
  assert.ok(elb, 'has an elbow');
  assert.ok(Math.abs(elb.turnAngle - 90) < 1e-6);
});

test('T-shape → 3 runs → classifies to a tee', () => {
  const cells = [...line([0, 0, 0], [2, 0, 0]), ...line([1, 1, 0], [1, 2, 0])];
  const { runs } = skeletonizeVoxelRuns(cells);
  assert.equal(runs.length, 3);
  const { junctions } = classifyDuctJunctions(runs);
  assert.ok(junctions.some((j) => j.type === 'tee'));
});

test('cross → 4 runs → classifies to a cross', () => {
  const cells = [
    ...line([-2, 0, 0], [2, 0, 0]),
    ...line([0, -2, 0], [0, -1, 0]), ...line([0, 1, 0], [0, 2, 0]),
  ];
  const { runs } = skeletonizeVoxelRuns(cells);
  assert.equal(runs.length, 4);
  const { junctions } = classifyDuctJunctions(runs);
  assert.ok(junctions.some((j) => j.type === 'cross'));
});

test('section change on a straight path → 2 runs → classifies to a reducer', () => {
  const cells = [
    ...line([0, 0, 0], [2, 0, 0]).map((c) => ({ c, section: { radius: 0.1 } })),
    ...line([3, 0, 0], [4, 0, 0]).map((c) => ({ c, section: { radius: 0.2 } })),
  ];
  const { runs } = skeletonizeVoxelRuns(cells);
  assert.equal(runs.length, 2);
  assert.ok(runs.some((r) => r.radius === 0.1) && runs.some((r) => r.radius === 0.2));
  const { junctions } = classifyDuctJunctions(runs);
  assert.ok(junctions.some((j) => j.type === 'reducer'));
});

test('END-TO-END: voxel L → skeletonize → classify → scene → one elbow object', () => {
  const cells = [...line([0, 0, 0], [2, 0, 0]), ...line([2, 1, 0], [2, 2, 0])];
  const { runs } = skeletonizeVoxelRuns(cells, { cellSize: 0.25, defaultSection: { radius: 0.075 } });
  const { objects, connections } = ductNetworkToScene(runs);
  assert.equal(objects.length, 1);
  assert.equal(objects[0].type, 'elbow');
  assert.equal(Object.keys(objects[0].ports).length, 2);
  assert.equal(connections.length, 2); // two runs, each a connection
});

test('cellSize + origin scale run endpoints to world', () => {
  const { runs } = skeletonizeVoxelRuns(line([0, 0, 0], [4, 0, 0]), { cellSize: 0.5, origin: [1, 0, 0] });
  assert.deepEqual(runs[0].a, [1, 0, 0]);
  assert.deepEqual(runs[0].b, [3, 0, 0]); // 1 + 4*0.5
});

test('deterministic across runs', () => {
  const cells = [...line([0, 0, 0], [2, 0, 0]), ...line([2, 1, 0], [2, 2, 0])];
  assert.equal(JSON.stringify(skeletonizeVoxelRuns(cells)), JSON.stringify(skeletonizeVoxelRuns(cells)));
});
