// library: spatial-harness  (harness/spatial-harness.mjs) — Delta G spatial tool surface (investigador2).
// Delta G (v1.19): high-level spatial tool surface over the semantic scene.
// The AI works in tools/relations; this engine owns coordinates + GUARDS invariants (RULES 001-010)
// so an illegal state is impossible by construction. Composes with clash-detect.mjs (narrow BVH) for
// mesh-exact validation; this broad-phase core is dependency-free. See references/spatial-world-model.md.
// The AI never sets raw XYZ or writes render code. It calls these tools; the harness does the math
// and GUARDS invariants (RULES 001-010), so an illegal state is impossible by construction.
// Dependency-free ESM. Consolidates Delta A (scene model) + B (validators) + F (placement) +
// the E4 ReserveEngine (reserve/commit lock) into one callable surface. Schema = shared verify.mjs.
const EPS = 1e-6;
const aabb = (c, s) => ({ lo: [c[0]-s[0]/2, c[1]-s[1]/2, c[2]-s[2]/2], hi: [c[0]+s[0]/2, c[1]+s[1]/2, c[2]+s[2]/2] });
const hit = (A, B) => [0,1,2].every(i => Math.min(A.hi[i], B.hi[i]) - Math.max(A.lo[i], B.lo[i]) > EPS);
const grow = (b, cl = {}) => { const lo=[...b.lo], hi=[...b.hi];
  const m={'+x':[0,hi],'-x':[0,lo],'+y':[1,hi],'-y':[1,lo],'+z':[2,hi],'-z':[2,lo]};
  for (const [k,v] of Object.entries(cl)) { const e=m[k]; if(!e) continue; if(e[1]===hi) hi[e[0]]+=v; else lo[e[0]]-=v; } return {lo,hi}; };
const dist = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
// cardinal label for a world direction under the default frame (x=east, y=north, z=up) — dominant axis wins,
// z only when it dominates both planar axes. Lets a tool answer "B is NORTH of A" instead of raw XYZ.
const cardinalOf = (v) => { const ax=Math.abs(v[0]), ay=Math.abs(v[1]), az=Math.abs(v[2]);
  if (az > ax && az > ay) return v[2] >= 0 ? 'up' : 'down';
  if (ax >= ay) return v[0] >= 0 ? 'east' : 'west'; return v[1] >= 0 ? 'north' : 'south'; };
// bearing from point a→b: unit direction + frame-aware cardinal + planar azimuth (deg, CCW from +x/east) + range.
// null for a zero-length bearing (coincident points). The AI reasons RELATIVE ("north, 3.2 m") — inv.md §5 /
// inv3 §21 spatial-state: never eyeball absolute coordinates.
const bearing = (a, b) => { const d=[b[0]-a[0], b[1]-a[1], b[2]-a[2]], len=Math.hypot(d[0],d[1],d[2]);
  if (len < EPS) return null;
  return { unit: d.map(v => Number((v/len).toFixed(4))), cardinal: cardinalOf(d),
           azimuthDeg: Number((Math.atan2(d[1], d[0]) * 180/Math.PI).toFixed(1)), distance: Number(len.toFixed(3)) }; };
// slab-clip: does segment p→q touch AABB box (optionally Minkowski-inflated by the caller)?
const segHitsBox = (p, q, box) => {
  let t0 = 0, t1 = 1; const d = [q[0]-p[0], q[1]-p[1], q[2]-p[2]];
  for (let i=0;i<3;i++) {
    if (Math.abs(d[i]) < 1e-9) { if (p[i] < box.lo[i] || p[i] > box.hi[i]) return false; }
    else { let ta=(box.lo[i]-p[i])/d[i], tb=(box.hi[i]-p[i])/d[i]; if (ta>tb) [ta,tb]=[tb,ta];
           t0=Math.max(t0,ta); t1=Math.min(t1,tb); if (t0>t1) return false; }
  }
  return true;
};

export class SpatialHarness {
  // room:{size:[X,Y,Z]}; clearancePolicy 'warn' (default, matches verify.mjs SOFT) | 'block'
  constructor(room, opts = {}) {
    this.room = room.size; this.obj = new Map();
    this.clearancePolicy = opts.clearancePolicy ?? 'warn';
    // the shared coordinate "constitution" (inv3 §35): every agent gets ONE immutable frame — the
    // multi-agent prerequisite (all E4 agents must reserve in the same frame).
    this.frame = opts.frame ?? { units: 'm', x: 'east', y: 'north', z: 'up', origin: [0,0,0] };
    this.lastOp = null;
    this.connections = []; // {from, to, worldA, worldB, length} — logical port connections
  }
  // CONTEXT: propioception — "the AI never loses its place" (inv3 §21 agentSpatialState, inv4 §propioception)
  whereAmI() { return { frame: this.frame, room: { size: this.room }, count: this.obj.size, lastOp: this.lastOp }; }
  #inBounds(b) { return b.lo.every(v => v >= -EPS) && b.hi.every((v,i) => v <= this.room[i] + EPS); }
  #phys(o) { return aabb(o.center, o.size); }
  #svc(o) { return o.clearance ? grow(this.#phys(o), o.clearance) : this.#phys(o); }
  #collides(cand, ignoreId) { // physical overlap ALWAYS blocks (RULE 001); clearance blocks only under 'block' policy (RULE 007)
    for (const [id, o] of this.obj) { if (id === ignoreId) continue;
      if (hit(cand.phys, this.#phys(o))) return { id, kind: 'overlap' };
      if (this.clearancePolicy === 'block' && o.clearance && hit(cand.phys, this.#svc(o))) return { id, kind: 'clearance' };
    } return null;
  }
  // ---- SCENE tools ----
  getObjects() { return [...this.obj.keys()]; }
  getObject(id) { return this.obj.get(id) ?? null; }
  getAABB(id) { const o = this.obj.get(id); return o ? this.#phys(o) : null; }
  // ---- SPATIAL tools ----
  distance(a, b) { const A=this.obj.get(a), B=this.obj.get(b); return (A&&B) ? dist(A.center, B.center) : null; }
  nearest(id, type) { const o = this.obj.get(id); if(!o) return null; let best=null, bd=Infinity;
    for (const [k,v] of this.obj) { if (k===id || (type && v.type!==type)) continue;
      const d = dist(o.center, v.center); if (d<bd){bd=d; best={id:k, distance:Number(d.toFixed(3))};} } return best; }
  // relative bearing A→B (unit dir + cardinal + azimuth + range) so the AI can say "B is NORTH of A, 3.2 m"
  // instead of comparing raw XYZ. null if either id is unknown or the centers coincide.
  bearingTo(a, b) { const A=this.obj.get(a), B=this.obj.get(b); return (A&&B) ? bearing(A.center, B.center) : null; }
  // exact O(objects) scan by default; opt-in {grid,accel} delegates to occupancy-accel.findFreeRegion (O(cells)) for large scenes
  freeSpace(size, opts = {}) {
    const { step = 0.5, grid = null, accel = null, near = null } = opts;
    if (grid && accel?.findFreeRegion) { const c = accel.findFreeRegion(grid, size, near ? { near } : {}); return c ? [c] : []; }
    const out = [];
    for (let x = size[0]/2; x <= this.room[0]-size[0]/2 + EPS; x += step)
      for (let y = size[1]/2; y <= this.room[1]-size[1]/2 + EPS; y += step) {
        const c = [Number(x.toFixed(2)), Number(y.toFixed(2)), size[2]/2];
        if (!this.#collides({ phys: aabb(c, size) })) { out.push(c); if (out.length >= 8) return out; }
      }
    return out;
  }
  // ---- QUERY "senses" (read-only perception — interrogate the world, don't imagine it) ----
  objectsWithin(origin, radius) { // origin = [x,y,z] point OR an object id
    const c = Array.isArray(origin) ? origin : this.obj.get(origin)?.center; if (!c) return [];
    const out = [];
    for (const [id, o] of this.obj) { if (o.center === c) continue;
      const d = dist(c, o.center); if (d <= radius + EPS) out.push({ id, distance: Number(d.toFixed(3)) }); }
    return out.sort((a,b) => a.distance - b.distance);
  }
  #xyOverlap(A, B) { return Math.min(A.hi[0],B.hi[0])-Math.max(A.lo[0],B.lo[0]) > EPS
                        && Math.min(A.hi[1],B.hi[1])-Math.max(A.lo[1],B.lo[1]) > EPS; }
  whatIsAbove(id) { const o = this.obj.get(id); if (!o) return null; const A = this.#phys(o); let best=null, bz=Infinity;
    for (const [k,v] of this.obj) { if (k===id) continue; const B=this.#phys(v);
      if (this.#xyOverlap(A,B) && B.lo[2] >= A.hi[2]-EPS) { const gap=B.lo[2]-A.hi[2]; if (gap<bz){bz=gap; best={id:k, gap:Number(gap.toFixed(3))};} } } return best; }
  whatIsBelow(id) { const o = this.obj.get(id); if (!o) return null; const A = this.#phys(o); let best=null, bz=Infinity;
    for (const [k,v] of this.obj) { if (k===id) continue; const B=this.#phys(v);
      if (this.#xyOverlap(A,B) && B.hi[2] <= A.lo[2]+EPS) { const gap=A.lo[2]-B.hi[2]; if (gap<bz){bz=gap; best={id:k, gap:Number(gap.toFixed(3))};} } } return best; }
  // exact segment-vs-AABB slab-clip by default (O(objects), swept box via opts.size); opt-in {grid,accel}
  // delegates to occupancy-accel.pathFree (O(cells), DDA-exact for the centerline) for large scenes.
  pathFree(start, end, opts = {}) {
    const { size = [0,0,0], grid = null, accel = null, allow = null } = opts;
    if (grid && accel?.pathFree) { const r = accel.pathFree(grid, start, end, allow ? { allow } : {});
      return { free: r.clear, blockedAt: r.blockedAt ?? null }; } // grid path names a POINT, not ids
    const blocked = []; const pad = size.map(s => s/2);
    for (const [id, o] of this.obj) { const b = this.#phys(o);
      const box = { lo: b.lo.map((v,i)=>v-pad[i]), hi: b.hi.map((v,i)=>v+pad[i]) };
      if (segHitsBox(start, end, box)) blocked.push(id); }
    return { free: blocked.length === 0, blockedBy: blocked };
  }
  // ---- RUN footprint / free-space (undimensioned plan position — read from the trace, NOT eyeballed) ----
  // A "run" = an ordered centerline polyline [[x,y,z],…] with a cross-section width (+ optional height).
  // When a drawing carries 0 plan DIMENSION (position read from the trace, per Revisor COB-IM2 L4), the AI
  // must NOT guess where the run sits. It asks for the run's FOOTPRINT (planar bbox inflated by half-width +
  // per-segment swept AABBs + length) and its FREE-space vs placed objects. inv.md §occupancy/find-free-space.
  runFootprint(centerline, { width = 0, height = null } = {}) {
    if (!Array.isArray(centerline) || centerline.length < 1) return null;
    const half = width / 2, hz = height != null ? height / 2 : 0;
    const round3 = (a) => a.map(v => Number(v.toFixed(4)));
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const p of centerline) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); }
    const bbox = { lo: round3([mn[0]-half, mn[1]-half, mn[2]-hz]), hi: round3([mx[0]+half, mx[1]+half, mx[2]+hz]) };
    const segments = [];
    for (let i = 0; i < centerline.length - 1; i++) { const a = centerline[i], b = centerline[i+1];
      segments.push({ a, b,
        lo: round3([Math.min(a[0],b[0])-half, Math.min(a[1],b[1])-half, Math.min(a[2],b[2])-hz]),
        hi: round3([Math.max(a[0],b[0])+half, Math.max(a[1],b[1])+half, Math.max(a[2],b[2])+hz]),
        length: Number(dist(a, b).toFixed(4)) }); }
    const length = Number(segments.reduce((s, seg) => s + seg.length, 0).toFixed(4));
    return { bbox, segments, length, width, height };
  }
  // sweep the run's cross-section along its centerline and test against every placed object (reuses pathFree's
  // Minkowski-inflated slab-clip per segment). free=true => the undimensioned plan position is collision-clear.
  runFree(centerline, { width = 0, height = 0 } = {}) {
    if (!Array.isArray(centerline) || centerline.length < 2) return { free: true, blockedBy: [] };
    const size = [width, width, height]; const blocked = new Set();
    for (let i = 0; i < centerline.length - 1; i++) {
      const r = this.pathFree(centerline[i], centerline[i+1], { size });
      if (!r.free) for (const id of (r.blockedBy || [])) blocked.add(id);
    }
    return { free: blocked.size === 0, blockedBy: [...blocked] };
  }
  // ---- CONNECT (by port IDENTITY, never coordinates — RULE 006) ----
  // resolve a port's LOCAL offset from EITHER shape: bare array [x,y,z] (inv3 vectorizer) OR
  // {position,dn,...} (inv4 element-model). One vocabulary across the BIM lane + tool surface.
  #portOffset(p) { return Array.isArray(p) ? p : (p?.position || p?.offset || null); }
  #portDN(o, pid) { const p = o?.ports?.[pid];
    return (p && !Array.isArray(p) && p.dn != null) ? p.dn : (o?.portDN?.[pid] ?? null); } // inv4 obj OR inv3 parallel map
  #portWorld(ref) { const [oid, pid] = String(ref).split('.'); const o = this.obj.get(oid);
    const pos = this.#portOffset(o?.ports?.[pid]); if (!o || !pos) return null;
    return [o.center[0]+pos[0], o.center[1]+pos[1], o.center[2]+pos[2]]; }
  connectPorts(refA, refB) {
    const a = this.#portWorld(refA), b = this.#portWorld(refB);
    if (!a) return { success:false, reason:`undefined port ${refA}` };
    if (!b) return { success:false, reason:`undefined port ${refB}` };
    const [oa,pa]=refA.split('.'), [ob,pb]=refB.split('.');
    const dnA = this.#portDN(this.obj.get(oa), pa), dnB = this.#portDN(this.obj.get(ob), pb);
    const dnMismatch = (dnA != null && dnB != null && dnA !== dnB); // a reducer legitimately mismatches → FLAG, don't fail
    const conn = { from: refA, to: refB, worldA: a, worldB: b, length: Number(dist(a,b).toFixed(4)), dnA, dnB, dnMismatch };
    this.connections.push(conn); this.lastOp = { op:'connect', from:refA, to:refB };
    return { success:true, connection: conn, ...(dnMismatch ? { dnMismatch:true } : {}) };
  }
  connectedTo(id) { const out = new Set();
    for (const c of this.connections) { const fa=c.from.split('.')[0], fb=c.to.split('.')[0];
      if (fa===id) out.add(fb); if (fb===id) out.add(fa); } return [...out]; }
  // ---- CREATE / TRANSFORM (guarded — reserve/commit, never overlaps) ----
  placeEquipment({ id, type, size, center, rotation, clearance, ports, portDN, category, system, level, parameters, fieldProvenance }) {
    if (this.obj.has(id)) return { success: false, reason: `duplicate id ${id}` };        // RULE 002
    if (!size || size.length !== 3 || size.some(v => !(v>0))) return { success:false, reason:'bad size' }; // RULE 003
    const cand = { phys: aabb(center, size) };
    if (!this.#inBounds(cand.phys)) return { success: false, reason: 'out-of-bounds', suggestions: this.freeSpace(size) }; // RULE 009
    const c = this.#collides(cand, id);
    if (c) return { success: false, reason: `blocked by ${c.id} (${c.kind})`, suggestions: this.freeSpace(size) }; // RULE 001/007
    this.obj.set(id, { id, type, size, center, rotation, clearance, ports, portDN, category, system, level, parameters, fieldProvenance }); // RULE 004/010 commit + BIM passthrough (fieldProvenance envelopes per PROVENANCE-CONTRACT §2)
    return this.snapshot(id);
  }
  move(id, newCenter) {
    const o = this.obj.get(id); if (!o) return { success:false, reason:`no object ${id}` };
    const cand = { phys: aabb(newCenter, o.size) };
    if (!this.#inBounds(cand.phys)) return { success:false, reason:'out-of-bounds', suggestions:this.freeSpace(o.size) };
    const c = this.#collides(cand, id);
    if (c) return { success:false, reason:`blocked by ${c.id} (${c.kind})`, suggestions:this.freeSpace(o.size) };
    o.center = newCenter; return this.snapshot(id);
  }
  // ---- ANCHORED placement (AI works in RELATIONS; the engine computes XYZ, then GUARDS) ----
  placeNextTo(spec, refId, side, gap = 0) {
    const ref = this.obj.get(refId); if (!ref) return { success:false, reason:`no reference ${refId}` };
    const R = this.#phys(ref); const [sx,sy,sz] = spec.size; const c = [...ref.center];
    switch (side) {
      case '+x': c[0] = R.hi[0] + gap + sx/2; c[1] = ref.center[1]; break;
      case '-x': c[0] = R.lo[0] - gap - sx/2; c[1] = ref.center[1]; break;
      case '+y': c[1] = R.hi[1] + gap + sy/2; c[0] = ref.center[0]; break;
      case '-y': c[1] = R.lo[1] - gap - sy/2; c[0] = ref.center[0]; break;
      default: return { success:false, reason:`bad side ${side} (use +x/-x/+y/-y)` };
    }
    c[2] = sz/2; // rest on the floor
    return this.placeEquipment({ ...spec, center: c }); // delegate to the guarded placer
  }
  placeAgainstWall(spec, wall, offset = 0) {
    const [sx,sy,sz] = spec.size; const [X,Y] = this.room; const c = [X/2, Y/2, sz/2];
    switch (wall) {
      case 'north': c[1] = Y - sy/2 - offset; break; // +y face
      case 'south': c[1] = sy/2 + offset; break;     // -y face
      case 'east':  c[0] = X - sx/2 - offset; break; // +x face
      case 'west':  c[0] = sx/2 + offset; break;     // -x face
      default: return { success:false, reason:`bad wall ${wall} (use north/south/east/west)` };
    }
    return this.placeEquipment({ ...spec, center: c });
  }
  // ---- VALIDATE tool ----
  validateAll() {
    const v = []; const ids = [...this.obj.keys()];
    for (let i=0;i<ids.length;i++) for (let j=i+1;j<ids.length;j++) {
      const A=this.obj.get(ids[i]), B=this.obj.get(ids[j]);
      if (hit(this.#phys(A), this.#phys(B))) v.push({ rule:'001', a:ids[i], b:ids[j], kind:'overlap' });
      if (A.clearance && hit(this.#svc(A), this.#phys(B))) v.push({ rule:'007', a:ids[j], b:ids[i], kind:'clearance' });
      if (B.clearance && hit(this.#svc(B), this.#phys(A))) v.push({ rule:'007', a:ids[i], b:ids[j], kind:'clearance' });
    }
    return { ok: v.length === 0, violations: v };
  }
  // ---- CONTEXT tool (snapshot after every mutating op) ----
  snapshot(id) {
    const o = this.obj.get(id); const n = this.nearest(id);
    const mine = this.validateAll().violations.filter(x => x.a===id || x.b===id);
    this.lastOp = { id, center: o.center }; // propioception update
    return { success: true, id, center: o.center, nearby: n,
             // relative sense to the nearest object so the AI orients ("north, 3.2 m") without raw-XYZ math
             nearestBearing: n ? bearing(o.center, this.obj.get(n.id).center) : null,
             collisions: mine.filter(x => x.rule==='001').length,          // hard (illegal)
             clearanceWarnings: mine.filter(x => x.rule==='007').length,   // soft (quality)
             count: this.obj.size };
  }
  // export the scene in the shared verify.mjs schema
  toScene() { return { room: { size: this.room }, objects: [...this.obj.values()].map(o => ({ id:o.id, size:o.size, center:o.center, ...(o.rotation?{rotation:o.rotation}:{}), ...(o.clearance?{clearance:o.clearance}:{}), ...(o.ports?{ports:o.ports}:{}), ...(o.portDN?{portDN:o.portDN}:{}), ...(o.type?{type:o.type}:{}), ...(o.category?{category:o.category}:{}), ...(o.system?{system:o.system}:{}), ...(o.level!=null?{level:o.level}:{}), ...(o.parameters&&Object.keys(o.parameters).length?{parameters:o.parameters}:{}), ...(o.fieldProvenance?{fieldProvenance:o.fieldProvenance}:{}) })) }; }
  // ---- LOAD an already-validated scene (inverse of toScene; loads committed state, does not re-place) ----
  static fromScene(scene, opts = {}) {
    const h = new SpatialHarness(scene.room, opts);
    for (const o of (scene.objects || [])) h.obj.set(o.id, { id:o.id, type:o.type, size:o.size, center:o.center, rotation:o.rotation,
      clearance:o.clearance, ports:o.ports, portDN:o.portDN, category:o.category, system:o.system, level:o.level, parameters:o.parameters, fieldProvenance:o.fieldProvenance });
    // auto-connect: rehydrate the piped network from a runs/connections list — inv3 ductNetworkToScene emits
    // {run,a,b}; a generic {from,to} also works. "free:<runId>:<end>" endpoints stay unconnected (equipment side).
    for (const c of (scene.connections || scene.runs || [])) {
      const a = c.a ?? c.from, b = c.b ?? c.to;
      if (!a || !b || String(a).startsWith('free:') || String(b).startsWith('free:')) continue;
      h.connectPorts(a, b);
    }
    return h;
  }
}
