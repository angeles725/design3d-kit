// Spatial Engine — runnable reference implementation of design3d DESIGN §1-§5 (S2).
// Single-agent transactional placement: the AI proposes, the engine REPORTS (compiler-oracle,
// §1) and NEVER silently repositions. Objects are VOLUMES with a separate clearance box (§2/§3).
// Multi-agent reserve/lock (§9f) is inv2's reserve-engine.mjs — not duplicated here.
//
// API:
//   const eng = new SpatialEngine([X,Y,Z])            // room, meters, Z-up, floor z=0
//   eng.canPlace({id,size,clearance?}, center) -> {ok, report}
//   eng.place({id,size,clearance?}, opts?)     -> {ok, center, report}   (findFreePosition + commit)
//   eng.placeAgainstWall(obj, wall)            -> {ok, center, report}
//   eng.findFreePosition(obj, opts?)           -> center | null
//   eng.committed                              -> [{id,size,center,clearance?}]
// Every rejection returns the structured report of DESIGN §9e (never a move).

const EPS = 1e-6;

export class SpatialEngine {
  constructor(roomSize) { this.room = roomSize; this.committed = []; }

  _aabb(o) {
    const [sx, sy, sz] = o.size, [cx, cy, cz] = o.center;
    return { lo: [cx - sx / 2, cy - sy / 2, cz - sz / 2], hi: [cx + sx / 2, cy + sy / 2, cz + sz / 2] };
  }
  _intersects(A, B) {
    for (let i = 0; i < 3; i++) if (Math.min(A.hi[i], B.hi[i]) - Math.max(A.lo[i], B.lo[i]) <= EPS) return false;
    return true;
  }
  _expand(box, cl = {}) {
    const lo = [...box.lo], hi = [...box.hi];
    const map = { '+x': [0, hi], '-x': [0, lo], '+y': [1, hi], '-y': [1, lo], '+z': [2, hi], '-z': [2, lo] };
    for (const [k, v] of Object.entries(cl)) { const m = map[k]; if (!m) continue; if (m[1] === hi) hi[m[0]] += v; else lo[m[0]] -= v; }
    return { lo, hi };
  }
  _inRoom(box) { for (let i = 0; i < 3; i++) if (box.lo[i] < -EPS || box.hi[i] > this.room[i] + EPS) return false; return true; }

  // §4 canPlace cascade: bounds -> physical overlap -> clearance intrusion -> own clearance in-room+free
  canPlace(obj, center) {
    const cand = { ...obj, center };
    const body = this._aabb(cand);
    if (!this._inRoom(body))
      return { ok: false, report: { rejected: center, reason: 'out-of-bounds', id: obj.id } };
    for (const c of this.committed) {
      if (this._intersects(body, this._aabb(c)))
        return { ok: false, report: { rejected: center, reason: 'occupied', id: obj.id, occupied_by: c.id, occupied_volume: this._aabb(c) } };
    }
    for (const c of this.committed) {
      if (!c.clearance) continue;
      if (this._intersects(body, this._expand(this._aabb(c), c.clearance)))
        return { ok: false, report: { rejected: center, reason: 'intrudes-clearance', id: obj.id, clearance_of: c.id } };
    }
    if (obj.clearance) {
      const ownClr = this._expand(body, obj.clearance);
      if (!this._inRoom(ownClr))
        return { ok: false, report: { rejected: center, reason: 'own-clearance-out-of-bounds', id: obj.id } };
      for (const c of this.committed)
        if (this._intersects(ownClr, this._aabb(c)))
          return { ok: false, report: { rejected: center, reason: 'own-clearance-blocked', id: obj.id, blocked_by: c.id } };
    }
    // PORT-ACCESS (design refinement found by the prototype): every port must have free approach space,
    // else a body/clearance-clean layout is still UNROUTABLE (a pump's suction jammed against a chiller face).
    if (obj.ports) {
      const STUB = 0.35;
      for (const [name, off] of Object.entries(obj.ports)) {
        const world = [center[0] + off[0], center[1] + off[1], center[2] + off[2]];
        let axis = 0; for (let i = 1; i < 3; i++) if (Math.abs(off[i]) > Math.abs(off[axis])) axis = i;
        const dir = Math.sign(off[axis]) || 1;
        const approach = [...world]; approach[axis] += dir * STUB;
        for (const c of this.committed) {
          const b = this._aabb(c);
          if (approach.every((v, i) => v >= b.lo[i] - EPS && v <= b.hi[i] + EPS))
            return { ok: false, report: { rejected: center, reason: 'port-access-blocked', id: obj.id, port: name, blocked_by: c.id } };
        }
      }
    }
    return { ok: true, report: { placed: center, id: obj.id } };
  }

  _commit(obj, center) { this.committed.push({ id: obj.id, size: obj.size, center, clearance: obj.clearance }); }

  // §4 findFreePosition: deterministic grid scan (row-major), floor z, first canPlace pass
  findFreePosition(obj, { step = 0.5 } = {}) {
    const [sx, sy, sz] = obj.size, cz = sz / 2;
    for (let cy = sy / 2; cy <= this.room[1] - sy / 2 + EPS; cy = +(cy + step).toFixed(4))
      for (let cx = sx / 2; cx <= this.room[0] - sx / 2 + EPS; cx = +(cx + step).toFixed(4))
        if (this.canPlace(obj, [cx, cy, cz]).ok) return [cx, cy, cz];
    return null;
  }

  // transactional place: PROPOSE (findFreePosition) -> COMMIT | REJECT(report)
  place(obj, opts) {
    const center = this.findFreePosition(obj, opts);
    if (!center) return { ok: false, report: { rejected: null, reason: 'no-free-position', id: obj.id } };
    this._commit(obj, center);
    return { ok: true, center, report: { placed: center, id: obj.id } };
  }

  placeAgainstWall(obj, wall) {
    const [sx, sy, sz] = obj.size, cz = sz / 2;
    const at = { '-x': [sx / 2, sy / 2, cz], '+x': [this.room[0] - sx / 2, sy / 2, cz],
                 '-y': [sx / 2, sy / 2, cz], '+y': [sx / 2, this.room[1] - sy / 2, cz] }[wall];
    const r = this.canPlace(obj, at);
    if (r.ok) { this._commit(obj, at); return { ok: true, center: at, report: r.report }; }
    return { ok: false, report: r.report };
  }

  worldPort(id, portName, ports) {
    const c = this.committed.find(o => o.id === id); if (!c) return null;
    const off = ports[id]?.[portName]; if (!off) return null;
    return [c.center[0] + off[0], c.center[1] + off[1], c.center[2] + off[2]];
  }
}
