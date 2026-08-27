// spatial-harness.mjs — Delta G (v1.19): high-level spatial tool surface over the semantic scene.
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

export class SpatialHarness {
  // room:{size:[X,Y,Z]}; clearancePolicy 'warn' (default, matches verify.mjs SOFT) | 'block'
  constructor(room, opts = {}) {
    this.room = room.size; this.obj = new Map();
    this.clearancePolicy = opts.clearancePolicy ?? 'warn';
    // the shared coordinate "constitution" (inv3 §35): every agent gets ONE immutable frame — the
    // multi-agent prerequisite (all E4 agents must reserve in the same frame).
    this.frame = opts.frame ?? { units: 'm', x: 'east', y: 'north', z: 'up', origin: [0,0,0] };
    this.lastOp = null;
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
  freeSpace(size, step = 0.5) { // scan floor grid for a slot whose AABB collides with nothing
    const out = [];
    for (let x = size[0]/2; x <= this.room[0]-size[0]/2 + EPS; x += step)
      for (let y = size[1]/2; y <= this.room[1]-size[1]/2 + EPS; y += step) {
        const c = [Number(x.toFixed(2)), Number(y.toFixed(2)), size[2]/2];
        if (!this.#collides({ phys: aabb(c, size) })) { out.push(c); if (out.length >= 8) return out; }
      }
    return out;
  }
  // ---- CREATE / TRANSFORM (guarded — reserve/commit, never overlaps) ----
  placeEquipment({ id, type, size, center, clearance, ports }) {
    if (this.obj.has(id)) return { success: false, reason: `duplicate id ${id}` };        // RULE 002
    if (!size || size.length !== 3 || size.some(v => !(v>0))) return { success:false, reason:'bad size' }; // RULE 003
    const cand = { phys: aabb(center, size) };
    if (!this.#inBounds(cand.phys)) return { success: false, reason: 'out-of-bounds', suggestions: this.freeSpace(size) }; // RULE 009
    const c = this.#collides(cand, id);
    if (c) return { success: false, reason: `blocked by ${c.id} (${c.kind})`, suggestions: this.freeSpace(size) }; // RULE 001/007
    this.obj.set(id, { id, type, size, center, clearance, ports });                        // RULE 004/010 commit
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
             collisions: mine.filter(x => x.rule==='001').length,          // hard (illegal)
             clearanceWarnings: mine.filter(x => x.rule==='007').length,   // soft (quality)
             count: this.obj.size };
  }
  // export the scene in the shared verify.mjs schema
  toScene() { return { room: { size: this.room }, objects: [...this.obj.values()].map(o => ({ id:o.id, size:o.size, center:o.center, ...(o.clearance?{clearance:o.clearance}:{}), ...(o.ports?{ports:o.ports}:{}) })) }; }
}
