// Reference pipe router — occupancy-grid BFS (Lee). Deterministic, avoids non-connected bodies.
// This is a REFERENCE router that makes the demo route cleanly; inv3's A* duct-router.mjs is the
// PRODUCTION router (cost-optimal: weights length/bends/clearance). Here we only need collision-free.
//
// routeReference(roomSize, committed, aWorld, bWorld, {ownerIds, h, blockClearance}) -> polyline | null
//   committed: [{id,size,center,clearance?}]  ownerIds: ids the pipe connects (its own equipment, not blocked)

const EPS = 1e-6;
const aabbOf = (o) => {
  const [sx, sy, sz] = o.size, [cx, cy, cz] = o.center;
  return { lo: [cx - sx / 2, cy - sy / 2, cz - sz / 2], hi: [cx + sx / 2, cy + sy / 2, cz + sz / 2] };
};
const expand = (b, cl = {}) => {
  const lo = [...b.lo], hi = [...b.hi];
  const m = { '+x': [0, hi], '-x': [0, lo], '+y': [1, hi], '-y': [1, lo], '+z': [2, hi], '-z': [2, lo] };
  for (const [k, v] of Object.entries(cl)) { const e = m[k]; if (!e) continue; if (e[1] === hi) hi[e[0]] += v; else lo[e[0]] -= v; }
  return { lo, hi };
};
const inBox = (p, b) => p.every((v, i) => v >= b.lo[i] - EPS && v <= b.hi[i] + EPS);

export function routeReference(room, committed, aWorld, bWorld, { ownerIds = [], h = 0.25, blockClearance = true } = {}) {
  const dims = room.map(r => Math.floor(r / h) + 1);
  const cell = (w) => [0, 1, 2].map(i => Math.min(dims[i] - 1, Math.max(0, Math.round(w[i] / h))));
  const center = (c) => c.map(v => v * h);
  const key = (c) => c[0] * dims[1] * dims[2] + c[1] * dims[2] + c[2];

  // build blocked set
  const boxes = committed.filter(o => !ownerIds.includes(o.id))
    .map(o => (blockClearance && o.clearance) ? expand(aabbOf(o), o.clearance) : aabbOf(o));
  const blocked = (c) => { const p = center(c); return boxes.some(b => inBox(p, b)); };

  const start = cell(aWorld), goal = cell(bWorld);
  const gk = key(goal);
  const q = [start], prev = new Map(); prev.set(key(start), null);
  const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  let found = false;
  while (q.length) {
    const c = q.shift(); const ck = key(c);
    if (ck === gk) { found = true; break; }
    for (const d of dirs) {
      const n = [c[0]+d[0], c[1]+d[1], c[2]+d[2]];
      if (n.some((v,i) => v < 0 || v >= dims[i])) continue;
      const nk = key(n);
      if (prev.has(nk)) continue;
      if (nk !== gk && blocked(n)) continue;   // goal cell always allowed (it's the port)
      prev.set(nk, ck); q.push(n);
    }
  }
  if (!found) return null;
  // reconstruct cell path
  const byKey = new Map(); // rebuild coords from keys
  const path = [];
  let k = gk;
  const coordOf = (kk) => [Math.floor(kk/(dims[1]*dims[2])), Math.floor(kk/dims[2])%dims[1], kk%dims[2]];
  while (k != null) { path.unshift(coordOf(k)); k = prev.get(k); }
  // simplify: keep only turns
  const pts = path.map(center);
  const simp = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = simp[simp.length-1], b = pts[i], c = pts[i+1];
    const collinear = (a[0]===b[0]&&b[0]===c[0]&&a[1]===b[1]&&b[1]===c[1]) ||
                      (a[0]===b[0]&&b[0]===c[0]&&a[2]===b[2]&&b[2]===c[2]) ||
                      (a[1]===b[1]&&b[1]===c[1]&&a[2]===b[2]&&b[2]===c[2]);
    if (!collinear) simp.push(b);
  }
  if (pts.length > 1) simp.push(pts[pts.length-1]);
  // exact endpoints at the ports
  return [aWorld, ...simp.slice(1, -1), bWorld];
}
