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


t("placeNextTo anchors relative to a reference with a gap", () => {
  const h = new SpatialHarness(room);
  h.placeEquipment({id:"CH",size:[2,2,2],center:[3,3,1]});
  const r = h.placeNextTo({id:"P",size:[1,1,1]}, "CH", "+x", 0.5);
  assert.equal(r.success, true);
  assert.deepEqual(h.getObject("P").center, [5,3,0.5]);
});
t("placeNextTo denies a colliding anchor and offers suggestions", () => {
  const h = new SpatialHarness(room);
  h.placeEquipment({id:"A",size:[2,2,2],center:[3,3,1]});
  h.placeEquipment({id:"B",size:[2,2,2],center:[6,3,1]});
  const r = h.placeNextTo({id:"C",size:[3,3,3]}, "A", "+x", 0);
  assert.equal(r.success, false); assert.ok(Array.isArray(r.suggestions));
});
t("placeAgainstWall flushes to the named wall", () => {
  const h = new SpatialHarness(room);
  const r = h.placeAgainstWall({id:"P",size:[2,1,2]}, "north");
  assert.equal(r.success, true);
  assert.equal(h.getObject("P").center[1], 7.5);
});
t("fromScene rehydrates a validated scene and round-trips toScene", () => {
  const h = new SpatialHarness(room);
  h.placeEquipment({id:"A",size:[2,2,2],center:[2,2,1]});
  h.placeEquipment({id:"B",size:[2,2,2],center:[8,2,1]});
  const scene = h.toScene();
  const h2 = SpatialHarness.fromScene(scene);
  assert.equal(h2.getObjects().length, 2);
  assert.equal(h2.validateAll().ok, true);
  assert.deepEqual(h2.toScene(), scene);
});


t("connectPorts accepts inv4 object-form ports {position,dn} + carries DN", () => {
  const h = new SpatialHarness(room);
  h.placeEquipment({id:"CH",size:[3,1.2,1.8],center:[2,2,0.9],ports:{out:{position:[1.5,0,0],dn:150}}});
  h.placeEquipment({id:"P",size:[0.8,0.6,0.9],center:[5,2,0.45],ports:{in:{position:[-0.4,0,0.1],dn:150}}});
  const r = h.connectPorts("CH.out","P.in");
  assert.equal(r.success, true);
  assert.deepEqual(r.connection.worldA, [3.5,2,0.9]);
  assert.equal(r.connection.dnA, 150); assert.equal(r.connection.dnMismatch, false);
});
t("connectPorts flags a DN mismatch (reducer) without failing", () => {
  const h = new SpatialHarness(room);
  h.placeEquipment({id:"R",size:[0.5,0.5,0.5],center:[3,3,0.25],ports:{a:{position:[-0.25,0,0],dn:200}, b:{position:[0.25,0,0],dn:150}}});
  h.placeEquipment({id:"X",size:[0.5,0.5,0.5],center:[5,3,0.25],ports:{a:{position:[-0.25,0,0],dn:150}}});
  const r2 = h.connectPorts("R.a","X.a");
  assert.equal(r2.success, true); assert.equal(r2.dnMismatch, true); assert.equal(r2.connection.dnMismatch, true);
});
t("connectPorts accepts inv3 parallel portDN map (bare-array ports + portDN)", () => {
  const h = new SpatialHarness(room);
  h.placeEquipment({id:"ELB",size:[0.4,0.4,0.4],center:[3,3,0.2],ports:{A:[-0.2,0,0],B:[0,0.2,0]},portDN:{A:100,B:100}});
  h.placeEquipment({id:"SEG",size:[0.3,0.3,0.3],center:[3,4,0.15],ports:{a:[0,-0.15,0]},portDN:{a:100}});
  const r = h.connectPorts("ELB.B","SEG.a");
  assert.equal(r.success, true); assert.equal(r.connection.dnA, 100); assert.equal(r.connection.dnMismatch, false);
});
t("array-form ports (no DN) still work unchanged; portDN round-trips through toScene/fromScene", () => {
  const h = new SpatialHarness(room);
  h.placeEquipment({id:"A",size:[2,2,2],center:[2,2,1],ports:{p:[1,0,0]},portDN:{p:80}});
  const scene = h.toScene(); assert.equal(scene.objects[0].portDN.p, 80);
  const h2 = SpatialHarness.fromScene(scene);
  h2.placeEquipment({id:"B",size:[2,2,2],center:[6,2,1],ports:{p:[-1,0,0]},portDN:{p:80}});
  const r = h2.connectPorts("A.p","B.p");
  assert.equal(r.success, true); assert.deepEqual(r.connection.worldA, [3,2,1]); assert.equal(r.connection.dnA, 80);
});


t("BIM fields (category/system/level/parameters/type) round-trip through toScene/fromScene", () => {
  const h = new SpatialHarness(room);
  h.placeEquipment({id:"CH-01",type:"chiller",size:[3,1.2,1.8],center:[2,2,0.9],
    category:"equipment",system:"CHW",level:"L02",parameters:{tons:400}});
  const scene = h.toScene(); const o = scene.objects[0];
  assert.equal(o.category,"equipment"); assert.equal(o.system,"CHW"); assert.equal(o.level,"L02");
  assert.equal(o.parameters.tons,400); assert.equal(o.type,"chiller");
  const h2 = SpatialHarness.fromScene(scene);
  assert.equal(h2.getObject("CH-01").system,"CHW");
  assert.deepEqual(h2.toScene(), scene);
});
t("fromScene auto-connects a runs/connections list by identity; skips free: ends", () => {
  const scene = { room:{size:[12,8,4]},
    objects:[
      {id:"ELB-0001",type:"elbow",size:[0.4,0.4,0.4],center:[3,3,0.2],ports:{A:[-0.2,0,0],B:[0,0.2,0]},portDN:{A:100,B:100}},
      {id:"SEG-0001",type:"pipe",size:[0.3,0.3,1],center:[3,4.5,0.15],ports:{a:[0,-0.75,0]},portDN:{a:100}}
    ],
    connections:[{run:"R1",a:"ELB-0001.B",b:"SEG-0001.a"},{run:"R2",a:"ELB-0001.A",b:"free:R2:b"}] };
  const h = SpatialHarness.fromScene(scene);
  assert.equal(h.connectedTo("ELB-0001").includes("SEG-0001"), true);
  assert.equal(h.connections.length, 1);
});


t("pathFree/freeSpace delegate to an injected accel when a grid is provided (opt-in, default unchanged)", () => {
  const h = new SpatialHarness(room);
  h.placeEquipment({id:"W",size:[1,1,2],center:[6,4,1]});
  // default (no grid) = exact slab-clip, unchanged
  assert.equal(h.pathFree([2,4,1],[10,4,1]).free, false);
  assert.equal(h.pathFree([2,1,1],[10,1,1]).free, true);
  // opt-in delegation: a MOCK accel proves the harness routes to it + adapts the return shape
  const calls = [];
  const mockAccel = {
    pathFree: (grid,a,b) => { calls.push(["pathFree",grid]); return { clear:false, blockedAt:[6,4,1] }; },
    findFreeRegion: (grid,size) => { calls.push(["findFreeRegion",grid]); return [1.5,1.5,size[2]/2]; },
  };
  const g = { __grid:true };
  const pf = h.pathFree([2,4,1],[10,4,1], { grid:g, accel:mockAccel });
  assert.equal(pf.free, false); assert.deepEqual(pf.blockedAt, [6,4,1]);
  assert.equal(calls[0][0], "pathFree"); assert.equal(calls[0][1], g);
  const fr = h.freeSpace([1,1,1], { grid:g, accel:mockAccel });
  assert.deepEqual(fr, [[1.5,1.5,0.5]]);
  assert.equal(calls[1][0], "findFreeRegion");
});

t('bearingTo gives frame-aware cardinal + azimuth + range (relative sense, not raw XYZ)', () => {
  const h = new SpatialHarness(room);
  h.placeEquipment({ id: 'A', size: [1,1,1], center: [2, 2, 0.5] });
  h.placeEquipment({ id: 'N', size: [1,1,1], center: [2, 6, 0.5] }); // +y = north
  h.placeEquipment({ id: 'E', size: [1,1,1], center: [6, 2, 0.5] }); // +x = east
  const bn = h.bearingTo('A', 'N');
  assert.equal(bn.cardinal, 'north'); assert.equal(bn.azimuthDeg, 90); assert.equal(bn.distance, 4);
  assert.deepEqual(bn.unit, [0, 1, 0]);
  const be = h.bearingTo('A', 'E');
  assert.equal(be.cardinal, 'east'); assert.equal(be.azimuthDeg, 0); assert.equal(be.distance, 4);
});

t('bearingTo returns null for unknown id or coincident centers', () => {
  const h = new SpatialHarness(room);
  h.placeEquipment({ id: 'A', size: [1,1,1], center: [2, 2, 0.5] });
  assert.equal(h.bearingTo('A', 'ghost'), null);
  assert.equal(h.bearingTo('A', 'A'), null); // zero-length bearing → null
});

t('snapshot carries nearestBearing when a neighbor exists, null when alone', () => {
  const h = new SpatialHarness(room);
  const solo = h.placeEquipment({ id: 'A', size: [1,1,1], center: [2, 2, 0.5] });
  assert.equal(solo.nearestBearing, null); // first object has no neighbor
  // B at y=5, its nearest is A at y=2 → A lies SOUTH of B, 3 m away
  const r = h.placeEquipment({ id: 'B', size: [1,1,1], center: [2, 5, 0.5] });
  assert.equal(r.nearby.id, 'A');
  assert.equal(r.nearestBearing.cardinal, 'south'); assert.equal(r.nearestBearing.distance, 3);
});

console.log(`\n${pass}/${pass} harness tests green`);
