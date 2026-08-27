#!/usr/bin/env node
// Exercise A1 deterministic verifier — spatial-grounding A/B test.
// Reads a scene JSON (path arg) and prints violations + a 0..10 score.
// Convention: right-handed, Z-up, meters. Room origin at corner (0,0,0).
// Floor is z=0 -> an object resting on the floor has center_z = size_z/2.
// Objects are axis-aligned (no rotation) to keep the check unambiguous.
//
// scene schema:
// {
//   "room":   { "size": [X, Y, Z] },
//   "objects":[ { "id":"CH-01", "size":[sx,sy,sz], "center":[cx,cy,cz],
//                 "clearance": { "+x":1.0, "-y":0.6 } (optional, meters),
//                 "ports": { "CHWS_out":[lx,ly,lz], ... } (local offset from center) } ],
//   "pipes":  [ { "id":"CHWS-1", "dn":150,
//                 "from":"CH-01.CHWS_out", "to":"P-01.suction",
//                 "polyline":[[x,y,z], ...] } ]
// }
import { readFileSync } from 'node:fs';

const TOL = 0.05;          // 50 mm endpoint tolerance
const ORIGIN_R = 0.5;      // origin-cluster radius
const EPS = 1e-6;

const scene = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const room = scene.room?.size ?? [0, 0, 0];
const objs = scene.objects ?? [];
const pipes = scene.pipes ?? [];
const V = []; // violations

const aabb = (o) => {
  const [sx, sy, sz] = o.size, [cx, cy, cz] = o.center;
  return { lo: [cx - sx / 2, cy - sy / 2, cz - sz / 2],
           hi: [cx + sx / 2, cy + sy / 2, cz + sz / 2] };
};
const overlap1 = (aLo, aHi, bLo, bHi) => Math.min(aHi, bHi) - Math.max(aLo, bLo);
const intersects = (A, B, pad = 0) => {
  for (let i = 0; i < 3; i++)
    if (overlap1(A.lo[i] - (i < 2 ? pad : 0), A.hi[i] + (i < 2 ? pad : 0), B.lo[i], B.hi[i]) <= EPS)
      return false;
  return true;
};
const expand = (box, cl = {}) => {
  const lo = [...box.lo], hi = [...box.hi];
  const map = { '+x': [0, hi], '-x': [0, lo], '+y': [1, hi], '-y': [1, lo], '+z': [2, hi], '-z': [2, lo] };
  for (const [k, v] of Object.entries(cl)) {
    const m = map[k]; if (!m) continue;
    if (m[1] === hi) hi[m[0]] += v; else lo[m[0]] -= v;
  }
  return { lo, hi };
};
const worldPort = (ref) => {
  const [oid, pid] = ref.split('.');
  const o = objs.find(x => x.id === oid);
  if (!o || !o.ports || !o.ports[pid]) return null;
  return [o.center[0] + o.ports[pid][0], o.center[1] + o.ports[pid][1], o.center[2] + o.ports[pid][2]];
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// 1. pairwise physical overlap (HARD)
for (let i = 0; i < objs.length; i++)
  for (let j = i + 1; j < objs.length; j++) {
    const A = aabb(objs[i]), B = aabb(objs[j]);
    if (intersects(A, B)) V.push({ sev: 'HARD', kind: 'overlap', msg: `${objs[i].id} <-> ${objs[j].id} physically overlap` });
  }

// 2. clearance intrusion (SOFT): another object sits inside my declared service clearance
for (const o of objs) {
  if (!o.clearance) continue;
  const ex = expand(aabb(o), o.clearance);
  for (const p of objs) {
    if (p.id === o.id) continue;
    if (intersects(ex, aabb(p))) V.push({ sev: 'SOFT', kind: 'clearance', msg: `${p.id} intrudes on ${o.id} service clearance` });
  }
}

// 3. out of room bounds (HARD)
for (const o of objs) {
  const A = aabb(o);
  for (let i = 0; i < 3; i++)
    if (A.lo[i] < -EPS || A.hi[i] > room[i] + EPS)
      V.push({ sev: 'HARD', kind: 'bounds', msg: `${o.id} out of room on axis ${i}` });
}

// 4. floating (SOFT): base not on floor (z=0). Flag {"onFloor":false} to exempt.
for (const o of objs) {
  if (o.onFloor === false) continue;
  const baseZ = o.center[2] - o.size[2] / 2;
  if (Math.abs(baseZ) > TOL) V.push({ sev: 'SOFT', kind: 'floating', msg: `${o.id} base z=${baseZ.toFixed(3)} not on floor` });
}

// 5. pipe connectivity (HARD per disconnected end)
let connected = 0;
for (const p of pipes) {
  const pl = p.polyline ?? [];
  const a = worldPort(p.from), b = worldPort(p.to);
  const ok0 = a && pl.length && dist(pl[0], a) <= TOL;
  const ok1 = b && pl.length && dist(pl[pl.length - 1], b) <= TOL;
  if (ok0 && ok1) connected++;
  else V.push({ sev: 'HARD', kind: 'disconnect', msg: `pipe ${p.id}: from-ok=${!!ok0} to-ok=${!!ok1}` });
}

// 6. origin clustering (diagnostic): the named failure mode
const clustered = objs.filter(o => dist(o.center, [0, 0, 0]) <= ORIGIN_R).map(o => o.id);

// scoring
const hard = V.filter(v => v.sev === 'HARD').length;
const soft = V.filter(v => v.sev === 'SOFT').length;
let score = 10 - 2 * hard - 0.5 * soft;
if (hard > 0) score = Math.min(score, 7.9); // hard-fail cap (doc rubric)
score = Math.max(0, Number(score.toFixed(2)));

console.log(JSON.stringify({
  file: process.argv[2],
  objects: objs.length, pipes: pipes.length,
  pipes_connected: connected, pipes_total: pipes.length,
  origin_clustered: clustered,
  hard_fails: hard, soft_fails: soft,
  score,
  verdict: score >= 8 && hard === 0 ? 'PASS' : 'FAIL',
  violations: V
}, null, 2));
