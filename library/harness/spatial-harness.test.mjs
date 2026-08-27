// harness.test.mjs — characterization tests for the Delta G SpatialHarness (dependency-free).
import assert from 'node:assert/strict';
import { SpatialHarness } from './spatial-harness.mjs';
let pass = 0; const t = (name, fn) => { fn(); pass++; console.log('  ok -', name); };
const room = { size: [12, 8, 4] };

t('placeEquipment succeeds and returns a snapshot', () => {
  const h = new SpatialHarness(room);
  const r = h.placeEquipment({ id: 'A', size: [2,2,2], center: [2,2,1] });
  assert.equal(r.success, true); assert.deepEqual(r.center, [2,2,1]); assert.equal(r.collisions, 0);
});

t('duplicate id is denied (RULE 002)', () => {
  const h = new SpatialHarness(room); h.placeEquipment({ id: 'A', size: [1,1,1], center: [1,1,0.5] });
  assert.equal(h.placeEquipment({ id: 'A', size: [1,1,1], center: [5,5,0.5] }).success, false);
});

t('invalid size is denied (RULE 003)', () => {
  const h = new SpatialHarness(room);
  assert.equal(h.placeEquipment({ id: 'A', size: [0,1,1], center: [1,1,0.5] }).success, false);
});

t('out-of-bounds is denied with suggestions (RULE 009)', () => {
  const h = new SpatialHarness(room);
  const r = h.placeEquipment({ id: 'A', size: [2,2,2], center: [11.5,2,1] });
  assert.equal(r.success, false); assert.ok(Array.isArray(r.suggestions));
});

t('physical overlap is denied + suggestions collision-free (RULE 001)', () => {
  const h = new SpatialHarness(room); h.placeEquipment({ id: 'A', size: [3,3,3], center: [3,3,1.5] });
  const r = h.placeEquipment({ id: 'B', size: [3,3,3], center: [3.5,3,1.5] });
  assert.equal(r.success, false); assert.match(r.reason, /overlap/);
  // every suggested slot must actually be placeable (collision-free by construction)
  for (const c of r.suggestions) {
    const h2 = new SpatialHarness(room); h2.placeEquipment({ id: 'A', size: [3,3,3], center: [3,3,1.5] });
    assert.equal(h2.placeEquipment({ id: 'B', size: [3,3,3], center: c }).success, true);
  }
});

t("clearance: 'warn' allows (soft), 'block' denies", () => {
  const warn = new SpatialHarness(room, { clearancePolicy: 'warn' });
  warn.placeEquipment({ id: 'CH', size: [3,1.2,1.8], center: [2,6.8,0.9], clearance: { '+x': 1.0 } });
  assert.equal(warn.placeEquipment({ id: 'P', size: [0.8,0.6,0.9], center: [4.2,6.9,0.45] }).success, true);
  assert.equal(warn.validateAll().violations.filter(v => v.rule === '007').length, 1); // soft warning present

  const block = new SpatialHarness(room, { clearancePolicy: 'block' });
  block.placeEquipment({ id: 'CH', size: [3,1.2,1.8], center: [2,6.8,0.9], clearance: { '+x': 1.0 } });
  assert.equal(block.placeEquipment({ id: 'P', size: [0.8,0.6,0.9], center: [4.2,6.9,0.45] }).success, false);
});

t('E4 property: a colliding request never mutates state', () => {
  const h = new SpatialHarness(room); h.placeEquipment({ id: 'A', size: [3,3,3], center: [3,3,1.5] });
  const before = h.getObjects().length;
  h.placeEquipment({ id: 'B', size: [3,3,3], center: [3,3,1.5] }); // dead-on overlap
  assert.equal(h.getObjects().length, before); // B was NOT added — illegal state impossible
});

t('move is guarded (cannot move onto another object)', () => {
  const h = new SpatialHarness(room);
  h.placeEquipment({ id: 'A', size: [2,2,2], center: [2,2,1] });
  h.placeEquipment({ id: 'B', size: [2,2,2], center: [8,2,1] });
  assert.equal(h.move('B', [2,2,1]).success, false);   // onto A -> denied
  assert.equal(h.move('B', [8,6,1]).success, true);    // free -> ok
});

t('toScene matches verify.mjs schema + validateAll clean when non-overlapping', () => {
  const h = new SpatialHarness(room);
  h.placeEquipment({ id: 'A', size: [2,2,2], center: [2,2,1] });
  h.placeEquipment({ id: 'B', size: [2,2,2], center: [8,2,1] });
  const s = h.toScene();
  assert.deepEqual(s.room, { size: [12,8,4] }); assert.equal(s.objects.length, 2);
  assert.ok(s.objects[0].id && s.objects[0].size && s.objects[0].center);
  assert.equal(h.validateAll().ok, true);
});

t('whereAmI exposes the shared frame + tracks lastOp', () => {
  const h = new SpatialHarness(room);
  assert.equal(h.whereAmI().lastOp, null);
  h.placeEquipment({ id: 'A', size: [1,1,1], center: [1,1,0.5] });
  assert.equal(h.whereAmI().lastOp.id, 'A'); assert.equal(h.whereAmI().frame.units, 'm');
});


t("objectsWithin returns sorted neighbors in radius", () => {
  const h = new SpatialHarness(room);
  h.placeEquipment({id:"A",size:[1,1,1],center:[2,2,0.5]});
  h.placeEquipment({id:"B",size:[1,1,1],center:[3,2,0.5]});
  h.placeEquipment({id:"C",size:[1,1,1],center:[9,2,0.5]});
  const near = h.objectsWithin("A", 2);
  assert.equal(near.length, 1); assert.equal(near[0].id, "B");
});
t("whatIsAbove / whatIsBelow detect Z stacking", () => {
  const h = new SpatialHarness(room);
  h.placeEquipment({id:"floor",size:[2,2,1],center:[2,2,0.5]});
  h.placeEquipment({id:"shelf",size:[2,2,1],center:[2,2,2.0]});
  assert.equal(h.whatIsAbove("floor").id, "shelf");
  assert.equal(h.whatIsBelow("shelf").id, "floor");
  assert.equal(h.whatIsAbove("shelf"), null);
});
t("pathFree flags a blocking body and clears an open lane", () => {
  const h = new SpatialHarness(room);
  h.placeEquipment({id:"wall",size:[1,1,2],center:[6,4,1]});
  const blocked = h.pathFree([2,4,1],[10,4,1]);
  assert.equal(blocked.free, false); assert.deepEqual(blocked.blockedBy, ["wall"]);
  assert.equal(h.pathFree([2,1,1],[10,1,1]).free, true);
});
t("connectPorts connects by identity + world endpoints; connectedTo reflects it", () => {
  const h = new SpatialHarness(room);
  h.placeEquipment({id:"CH-01",size:[3,1.2,1.8],center:[2,2,0.9],ports:{out:[1.5,0,0]}});
  h.placeEquipment({id:"P-01",size:[0.8,0.6,0.9],center:[5,2,0.45],ports:{in:[-0.4,0,0.1]}});
  const r = h.connectPorts("CH-01.out","P-01.in");
  assert.equal(r.success, true);
  assert.deepEqual(r.connection.worldA, [3.5,2,0.9]);
  assert.deepEqual(r.connection.worldB, [4.6,2,0.55]);
  assert.deepEqual(h.connectedTo("CH-01"), ["P-01"]);
  assert.deepEqual(h.connectedTo("P-01"), ["CH-01"]);
});
t("connectPorts rejects an undefined port", () => {
  const h = new SpatialHarness(room);
  h.placeEquipment({id:"CH-01",size:[3,1.2,1.8],center:[2,2,0.9],ports:{out:[1.5,0,0]}});
  assert.equal(h.connectPorts("CH-01.out","NOPE.in").success, false);
});

console.log(`\n${pass}/${pass} harness tests green`);
