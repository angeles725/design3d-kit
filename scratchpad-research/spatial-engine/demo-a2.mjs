// Demo: the Spatial Engine deterministically solves the A2 instance (12 objects, 6 clearances,
// 6 pipes, 10x7 room) to a verify.mjs PASS — proving DESIGN §2-§5 (S2) is implementable, not just described.
// Run:  node demo-a2.mjs > a2-engine-solution.json  &&  node ../exercise-A1/verify.mjs a2-engine-solution.json
import { SpatialEngine } from './spatial-engine.mjs';
import { routeReference } from './router.mjs';

const ROOM = [10, 7, 4];

// A2 instance: {id,size,clearance?} + ports (local offsets) + pipe connections
const OBJS = [
  { id: 'CH-01', size: [3.0, 1.2, 1.8], clearance: { '+x': 1.0 } },
  { id: 'CH-02', size: [3.0, 1.2, 1.8], clearance: { '+x': 1.0 } },
  { id: 'AHU-01', size: [2.5, 1.5, 2.0], clearance: { '-x': 0.8 } },
  { id: 'AHU-02', size: [2.5, 1.5, 2.0], clearance: { '-x': 0.8 } },
  { id: 'VFD-01', size: [0.6, 0.4, 1.6], clearance: { '+x': 0.9 } },
  { id: 'VFD-02', size: [0.6, 0.4, 1.6], clearance: { '+x': 0.9 } },
  { id: 'TANK-01', size: [1.2, 1.2, 2.0] },
  { id: 'HDR-01', size: [3.0, 0.3, 0.3] },
  { id: 'P-01', size: [0.8, 0.6, 0.9] },
  { id: 'P-02', size: [0.8, 0.6, 0.9] },
  { id: 'P-03', size: [0.8, 0.6, 0.9] },
  { id: 'P-04', size: [0.8, 0.6, 0.9] },
];
const PORTS = {
  'CH-01': { CHWS_out: [1.5, 0.3, 0.0], CHWR_in: [1.5, -0.3, 0.0] },
  'CH-02': { CHWS_out: [1.5, 0.3, 0.0], CHWR_in: [1.5, -0.3, 0.0] },
  'AHU-01': { CHW_in: [-1.25, 0.4, 0.0], CHW_out: [-1.25, -0.4, 0.0] },
  'AHU-02': { CHW_in: [-1.25, 0.4, 0.0], CHW_out: [-1.25, -0.4, 0.0] },
  'P-01': { suction: [-0.4, 0, 0.1], discharge: [0.4, 0, 0.1] },
  'P-02': { suction: [-0.4, 0, 0.1], discharge: [0.4, 0, 0.1] },
};
const PIPES = [
  ['CHWS-1', 'CH-01.CHWS_out', 'P-01.suction'],
  ['CHWS-2', 'P-01.discharge', 'AHU-01.CHW_in'],
  ['CHWR-1', 'AHU-01.CHW_out', 'CH-01.CHWR_in'],
  ['CHWS-3', 'CH-02.CHWS_out', 'P-02.suction'],
  ['CHWS-4', 'P-02.discharge', 'AHU-02.CHW_in'],
  ['CHWR-2', 'AHU-02.CHW_out', 'CH-02.CHWR_in'],
];

const eng = new SpatialEngine(ROOM);
// placement order = most-constrained first (has clearance), then largest volume
const vol = (o) => o.size[0] * o.size[1] * o.size[2];
const order = [...OBJS].sort((a, b) =>
  (b.clearance ? 1 : 0) - (a.clearance ? 1 : 0) || vol(b) - vol(a));

const log = [];
for (const o of order) {
  const r = eng.place({ ...o, ports: PORTS[o.id] }); // ports passed so canPlace enforces port-access
  log.push(r.ok ? `PLACE ${o.id} -> [${r.center}]` : `REJECT ${o.id}: ${JSON.stringify(r.report)}`);
  if (!r.ok) { console.error(log.join('\n')); process.exit(1); }
}

const wp = (ref) => { const [id, p] = ref.split('.'); return eng.worldPort(id, p, PORTS); };
const pipes = PIPES.map(([id, from, to]) => {
  const A = wp(from), B = wp(to);
  const [fromId] = from.split('.'), [toId] = to.split('.');
  // route around non-connected bodies+clearances; fall back to physical-only if clearance-blocking has no path
  let poly = routeReference(ROOM, eng.committed, A, B, { ownerIds: [fromId, toId], h: 0.25, blockClearance: true })
          || routeReference(ROOM, eng.committed, A, B, { ownerIds: [fromId, toId], h: 0.25, blockClearance: false });
  if (!poly) { log.push(`ROUTE-FAIL ${id}`); poly = [A, B]; }
  return { id, dn: 150, from, to, polyline: poly };
});

const scene = {
  room: { size: ROOM },
  objects: eng.committed.map(c => ({ id: c.id, size: c.size, center: c.center,
    ...(c.clearance ? { clearance: c.clearance } : {}), ...(PORTS[c.id] ? { ports: PORTS[c.id] } : {}) })),
  pipes,
};
console.error(log.join('\n'));            // op-log to stderr
console.log(JSON.stringify(scene, null, 2)); // scene to stdout
