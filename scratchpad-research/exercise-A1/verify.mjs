#!/usr/bin/env node
// Shared exercise scorer for the spatial-grounding battery.
//   node verify.mjs <scene.json>                 -> score a layout (A1/A2/E3)
//   node verify.mjs --diff <before.json> <after.json>
//                                                -> proxy->realistic INVARIANT (E2)
// Convention: right-handed, Z-up, meters. Room origin at corner (0,0,0), floor z=0.
// An object on the floor has center_z = size_z/2. Objects are axis-aligned.
//
// scene schema:
// { "room":{"size":[X,Y,Z]},
//   "objects":[ {"id","size":[sx,sy,sz],"center":[cx,cy,cz],
//                "clearance":{"+x":1.0,...}(opt),"ports":{"NAME":[lx,ly,lz],...}(opt),
//                "onFloor":true(opt)} ],
//   "pipes":[ {"id","dn","from":"OBJ.PORT","to":"OBJ.PORT","polyline":[[x,y,z],...]} ] }
import { readFileSync } from 'node:fs';

const TOL = 0.05, ORIGIN_R = 0.5, EPS = 1e-6, DIFF_EPS = 1e-4;

// ---------- shared helpers ----------
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
  for (const [k, v] of Object.entries(cl)) { const m = map[k]; if (!m) continue;
    if (m[1] === hi) hi[m[0]] += v; else lo[m[0]] -= v; }
  return { lo, hi };
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
// segment p0->p1 vs AABB box (slab method, t in [0,1]) -> true if they intersect
const segAABB = (p0, p1, box) => {
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    const d = p1[i] - p0[i];
    if (Math.abs(d) < 1e-12) { if (p0[i] < box.lo[i] - EPS || p0[i] > box.hi[i] + EPS) return false; }
    else { let ta = (box.lo[i] - p0[i]) / d, tb = (box.hi[i] - p0[i]) / d;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return false; }
  }
  return true;
};

// ---------- E2 diff mode (proxy -> realistic invariant) ----------
function diffMode(beforePath, afterPath) {
  const B = load(beforePath), A = load(afterPath);
  const V = [];
  const bo = new Map((B.objects ?? []).map(o => [o.id, o]));
  const ao = new Map((A.objects ?? []).map(o => [o.id, o]));
  for (const id of bo.keys()) if (!ao.has(id)) V.push({ kind: 'removed-object', id });
  for (const id of ao.keys()) if (!bo.has(id)) V.push({ kind: 'added-object', id });
  const near = (x, y) => Math.abs(x - y) <= DIFF_EPS;
  const vecEq = (x = [], y = []) => x.length === y.length && x.every((v, i) => near(v, y[i]));
  for (const [id, b] of bo) {
    const a = ao.get(id); if (!a) continue;
    if (!vecEq(b.center, a.center)) V.push({ kind: 'center-moved', id, from: b.center, to: a.center });
    if (!vecEq(b.size, a.size)) V.push({ kind: 'size-changed', id, from: b.size, to: a.size });
    if (!vecEq(b.rotation ?? [], a.rotation ?? [])) V.push({ kind: 'rotation-changed', id });
    const bp = b.ports ?? {}, ap = a.ports ?? {};
    for (const k of Object.keys(bp)) if (!ap[k] || !vecEq(bp[k], ap[k])) V.push({ kind: 'port-changed', id, port: k });
    for (const k of Object.keys(ap)) if (!bp[k]) V.push({ kind: 'port-added', id, port: k });
  }
  const bpipe = new Map((B.pipes ?? []).map(p => [p.id, p]));
  const apipe = new Map((A.pipes ?? []).map(p => [p.id, p]));
  for (const [id, b] of bpipe) {
    const a = apipe.get(id);
    if (!a) { V.push({ kind: 'connection-removed', id }); continue; }
    if (b.from !== a.from || b.to !== a.to) V.push({ kind: 'connection-changed', id, from: [b.from, b.to], to: [a.from, a.to] });
  }
  console.log(JSON.stringify({
    mode: 'diff', before: beforePath, after: afterPath,
    invariant_preserved: V.length === 0,
    verdict: V.length === 0 ? 'PASS' : 'FAIL', deltas: V.length, violations: V
  }, null, 2));
  process.exit(0);
}

// ---------- score mode (layout) ----------
function scoreMode(scenePath) {
  const scene = load(scenePath);
  const room = scene.room?.size ?? [0, 0, 0];
  const objs = scene.objects ?? [], pipes = scene.pipes ?? [];
  const V = [];
  const worldPort = (ref) => {
    const [oid, pid] = ref.split('.');
    const o = objs.find(x => x.id === oid);
    if (!o || !o.ports || !o.ports[pid]) return null;
    // accept both the flat [lx,ly,lz] form and the DESIGNSPEC scene_graph {offset,dir}/{position} form
    const raw = o.ports[pid];
    const off = Array.isArray(raw) ? raw : (raw.offset || raw.position);
    if (!off) return null;
    return [o.center[0] + off[0], o.center[1] + off[1], o.center[2] + off[2]];
  };
  // 1. physical overlap (HARD)
  for (let i = 0; i < objs.length; i++)
    for (let j = i + 1; j < objs.length; j++)
      if (intersects(aabb(objs[i]), aabb(objs[j])))
        V.push({ sev: 'HARD', kind: 'overlap', msg: `${objs[i].id} <-> ${objs[j].id} physically overlap` });
  // 2. clearance intrusion (SOFT)
  for (const o of objs) {
    if (!o.clearance) continue;
    const ex = expand(aabb(o), o.clearance);
    for (const p of objs) if (p.id !== o.id && intersects(ex, aabb(p)))
      V.push({ sev: 'SOFT', kind: 'clearance', msg: `${p.id} intrudes on ${o.id} service clearance` });
  }
  // 3. bounds (HARD)
  for (const o of objs) { const A = aabb(o);
    for (let i = 0; i < 3; i++) if (A.lo[i] < -EPS || A.hi[i] > room[i] + EPS)
      V.push({ sev: 'HARD', kind: 'bounds', msg: `${o.id} out of room on axis ${i}` }); }
  // 4. floating (SOFT)
  for (const o of objs) { if (o.onFloor === false) continue;
    const baseZ = o.center[2] - o.size[2] / 2;
    if (Math.abs(baseZ) > TOL) V.push({ sev: 'SOFT', kind: 'floating', msg: `${o.id} base z=${baseZ.toFixed(3)} not on floor` }); }
  // 5. pipe connectivity (HARD)
  let connected = 0;
  for (const p of pipes) {
    const pl = p.polyline ?? [], a = worldPort(p.from), b = worldPort(p.to);
    const ok0 = a && pl.length && dist(pl[0], a) <= TOL;
    const ok1 = b && pl.length && dist(pl[pl.length - 1], b) <= TOL;
    if (ok0 && ok1) connected++;
    else V.push({ sev: 'HARD', kind: 'disconnect', msg: `pipe ${p.id}: from-ok=${!!ok0} to-ok=${!!ok1}` });
  }
  // 6b. pipe-vs-solid (folded from inv2 hvac-pipe-checks): RULE001 pipe-through-equipment (HARD),
  //     RULE007 pipe-in-foreign-clearance (SOFT), RULE006 missing DN (SOFT/schema).
  //     A pipe legitimately enters its OWN connected equipment (from/to) -> those objects are skipped.
  for (const p of pipes) {
    const pl = p.polyline ?? [];
    const ends = [String(p.from ?? '').split('.')[0], String(p.to ?? '').split('.')[0]];
    if (p.dn === undefined || p.dn === null) V.push({ sev: 'SOFT', kind: 'no-DN', msg: `pipe ${p.id} has no DN` });
    for (const o of objs) {
      if (ends.includes(o.id)) continue;
      const body = aabb(o);
      let through = false;
      for (let s = 0; s < pl.length - 1; s++) if (segAABB(pl[s], pl[s + 1], body)) { through = true; break; }
      if (through) { V.push({ sev: 'HARD', kind: 'pipe-through-equipment', msg: `pipe ${p.id} passes through ${o.id}` }); continue; }
      if (o.clearance) {
        const ex = expand(body, o.clearance);
        for (let s = 0; s < pl.length - 1; s++)
          if (segAABB(pl[s], pl[s + 1], ex)) { V.push({ sev: 'SOFT', kind: 'pipe-in-foreign-clearance', msg: `pipe ${p.id} enters ${o.id} clearance` }); break; }
      }
    }
  }
  // 6. origin clustering (diagnostic)
  const clustered = objs.filter(o => dist(o.center, [0, 0, 0]) <= ORIGIN_R).map(o => o.id);
  const hard = V.filter(v => v.sev === 'HARD').length, soft = V.filter(v => v.sev === 'SOFT').length;
  let score = 10 - 2 * hard - 0.5 * soft;
  if (hard > 0) score = Math.min(score, 7.9);
  score = Math.max(0, Number(score.toFixed(2)));
  console.log(JSON.stringify({
    mode: 'score', file: scenePath, objects: objs.length, pipes: pipes.length,
    pipes_connected: connected, pipes_total: pipes.length, origin_clustered: clustered,
    hard_fails: hard, soft_fails: soft, score,
    verdict: score >= 8 && hard === 0 ? 'PASS' : 'FAIL', violations: V
  }, null, 2));
}

// ---------- dispatch ----------
const a = process.argv.slice(2);
if (a[0] === '--diff') { if (a.length < 3) { console.error('usage: --diff <before> <after>'); process.exit(2); } diffMode(a[1], a[2]); }
else if (a[0]) scoreMode(a[0]);
else { console.error('usage: verify.mjs <scene.json> | --diff <before> <after>'); process.exit(2); }
