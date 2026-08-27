// Semantic occupancy grid — the "second spatial memory" of the Spatial World Model
// (references/spatial-world-model.md §occupancy; DESIGN §3.2 / §9b). Deterministic (cells set by
// rasterizing KNOWN volumes, no probabilistic log-odds — we own the geometry), pure-Node, offline.
// Backs canPlace broad-phase + the multi-agent reserve/lock (§9f) at grid resolution.
//
// Cell codes (semantic, §9b): a query can tell "reserved by another agent" from "solid structure"
// from "someone's clearance envelope" — which a bare occupied/free bit cannot.
export const CELL = Object.freeze({ FREE: 0, OCCUPIED: 1, CLEARANCE: 2, RESERVED: 3, STRUCTURE: 4, HVAC: 5, PIPING: 6 });

const EPS = 1e-9;

export class OccupancyGrid {
  // roomSize [X,Y,Z] meters, h = voxel edge (m). Inside-room cells start FREE.
  constructor(roomSize, h = 0.25) {
    this.room = roomSize; this.h = h;
    this.dims = roomSize.map(r => Math.max(1, Math.ceil(r / h)));
    this.cells = new Uint8Array(this.dims[0] * this.dims[1] * this.dims[2]); // 0=FREE
  }
  _idx(x, y, z) { return (x * this.dims[1] + y) * this.dims[2] + z; }
  _clampCell(w, i) { return Math.min(this.dims[i] - 1, Math.max(0, Math.floor(w / this.h))); }
  // inclusive cell range covering a world AABB {lo,hi}
  _range(box) {
    const lo = [0, 1, 2].map(i => this._clampCell(box.lo[i] + EPS, i));
    const hi = [0, 1, 2].map(i => this._clampCell(box.hi[i] - EPS, i));
    return { lo, hi };
  }
  static aabbOf(o) {
    const [sx, sy, sz] = o.size, [cx, cy, cz] = o.center;
    return { lo: [cx - sx / 2, cy - sy / 2, cz - sz / 2], hi: [cx + sx / 2, cy + sy / 2, cz + sz / 2] };
  }
  static expand(box, cl = {}) {
    const lo = [...box.lo], hi = [...box.hi];
    const m = { '+x': [0, hi], '-x': [0, lo], '+y': [1, hi], '-y': [1, lo], '+z': [2, hi], '-z': [2, lo] };
    for (const [k, v] of Object.entries(cl)) { const e = m[k]; if (!e) continue; if (e[1] === hi) hi[e[0]] += v; else lo[e[0]] -= v; }
    return { lo, hi };
  }

  _forEach(box, fn) {
    const r = this._range(box);
    for (let x = r.lo[0]; x <= r.hi[0]; x++)
      for (let y = r.lo[1]; y <= r.hi[1]; y++)
        for (let z = r.lo[2]; z <= r.hi[2]; z++) fn(this._idx(x, y, z));
  }

  // set every cell of an AABB to `code` (unconditional)
  mark(box, code) { this._forEach(box, i => { this.cells[i] = code; }); return this; }
  // mark an object body OCCUPIED (or a semantic code)
  markObject(o, code = CELL.OCCUPIED) { return this.mark(OccupancyGrid.aabbOf(o), code); }
  // paint an object's service clearance as CLEARANCE, but only where currently FREE (never clobber a body)
  markClearance(o) {
    if (!o.clearance) return this;
    this._forEach(OccupancyGrid.expand(OccupancyGrid.aabbOf(o), o.clearance),
      i => { if (this.cells[i] === CELL.FREE) this.cells[i] = CELL.CLEARANCE; });
    return this;
  }

  cellAt(world) { return this.cells[this._idx(...[0, 1, 2].map(i => this._clampCell(world[i], i)))]; }
  // all cells of an AABB are FREE?
  areCellsFree(box) { let ok = true; this._forEach(box, i => { if (this.cells[i] !== CELL.FREE) ok = false; }); return ok; }

  // ATOMIC reserve (§9f multi-agent lock at grid resolution): grants only if every cell is FREE,
  // then flips them to RESERVED; otherwise changes nothing and returns false (deny — never overlaps).
  reserve(box) {
    if (!this.areCellsFree(box)) return false;
    this.mark(box, CELL.RESERVED);
    return true;
  }
  // release a prior reservation (RESERVED -> FREE only)
  release(box) { this._forEach(box, i => { if (this.cells[i] === CELL.RESERVED) this.cells[i] = CELL.FREE; }); return this; }

  stats() {
    const s = {}; for (const k of Object.keys(CELL)) s[k] = 0;
    const byCode = Object.fromEntries(Object.entries(CELL).map(([k, v]) => [v, k]));
    for (const c of this.cells) s[byCode[c]]++;
    return s;
  }
}
