// library: voxel-skeletonize  (parts/voxel-skeletonize.mjs) — voxel centerline → duct RUNS (investigador3, v1.19).
// source: design3d numerical pass · investigacion.md voxel-as-spatial-brain thesis §3202 (2026-08-26):
//         "el voxel ya no sería un prototipo desechable; sería una interfaz para dibujar el CAD" — a
//         voxel-drawn duct CENTERLINE vectorizes to CAD: run→centerline, corner→elbow, split→tee,
//         resize→reducer. This is the UPSTREAM stage of duct-vectorize: it turns an occupancy centerline
//         (the cells the voxel tool draws) into the axis-aligned RUN list classifyDuctJunctions consumes.
// what: skeletonizeVoxelRuns(cells) walks a 6-connected voxel centerline graph and emits maximal
//       STRAIGHT axis-aligned runs, SPLITTING at (a) branch/end nodes (degree≠2), (b) corners (direction
//       change), and (c) cross-section changes (→ a reducer downstream). Run endpoints are world coords
//       (cell·cellSize+origin) so a shared corner/branch/section-boundary coincides EXACTLY — that shared
//       identity is what classifyDuctJunctions groups on to type the fitting. Deterministic. NOT marching
//       cubes — vectorization: the output is parametric runs, never a smoothed mesh.
// deps: NONE. Pure integer/vector graph walk over plain arrays. REPORTS-ONLY.

const DIRS6 = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const k = (c) => `${c[0]},${c[1]},${c[2]}`;
const ek = (a, b) => (k(a) < k(b) ? `${k(a)}|${k(b)}` : `${k(b)}|${k(a)}`);
const eq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const sgn = (v) => v.map((x) => (x > 0 ? 1 : x < 0 ? -1 : 0));       // unit step of an axis-aligned edge
const eqDir = (u, v) => { const a = sgn(u), b = sgn(v); return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]; };
const cmpCoord = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

function sameSec(a, b) {
  if (a.radius != null && b.radius != null) return a.radius === b.radius;
  if (a.width != null && b.width != null) return a.width === b.width && (a.height ?? a.width) === (b.height ?? b.width);
  return false;
}

/**
 * Vectorize a voxel duct CENTERLINE (occupied cells) into axis-aligned duct RUNS.
 * @param {Array<[number,number,number] | {c:[number,number,number], section?:object}>} cellsInput
 *        occupied centerline cells (integer coords), optionally each with a cross-section.
 * @param {{cellSize?:number, origin?:number[], defaultSection?:object}} [opts]
 *        cellSize (world units/cell, default 1), origin (world), defaultSection (default {radius:0.5·cellSize}).
 * @returns {{runs:{id:string, a:number[], b:number[], radius?:number, width?:number, height?:number,
 *            cells:number}[]}}  runs feed classifyDuctJunctions / ductNetworkToScene directly.
 */
export function skeletonizeVoxelRuns(cellsInput, opts = {}) {
  const cellSize = opts.cellSize ?? 1;
  const origin = opts.origin ?? [0, 0, 0];
  const defSec = opts.defaultSection ?? { radius: 0.5 * cellSize };
  const occ = new Map();
  for (const it of cellsInput) {
    const c = Array.isArray(it) ? it : it.c;
    const section = (Array.isArray(it) ? null : it.section) ?? defSec;
    occ.set(k(c), { c: c.slice(), section });
  }
  const nbrs = (c) => DIRS6.map((d) => [c[0] + d[0], c[1] + d[1], c[2] + d[2]]).filter((n) => occ.has(k(n)));
  const world = (c) => [origin[0] + c[0] * cellSize, origin[1] + c[1] * cellSize, origin[2] + c[2] * cellSize];
  const secOf = (c) => occ.get(k(c)).section;

  const cells = [...occ.values()].map((v) => v.c).sort(cmpCoord);
  let seeds = cells.filter((c) => nbrs(c).length !== 2);
  if (seeds.length === 0 && cells.length) seeds = [cells[0]]; // pure straight/loop with no break: seed lowest cell

  const runs = [];
  const usedEdge = new Set();
  let n = 0;
  const emit = (start, end, section, cellCount) => {
    const id = `RUN-${String(++n).padStart(4, '0')}`;
    const r = { id, a: world(start), b: world(end), cells: cellCount };
    if (section.radius != null) r.radius = section.radius;
    else { r.width = section.width; r.height = section.height; }
    runs.push(r);
  };

  for (const seed of seeds) {
    for (const first of nbrs(seed)) {
      if (usedEdge.has(ek(seed, first))) continue;
      let start = seed, prev = seed, cur = first;
      let dir = sub(first, seed);
      let sec = secOf(seed);
      let count = 1; // cells in the current straight run (start included)
      usedEdge.add(ek(prev, cur));
      for (;;) {
        count++;
        const cnb = nbrs(cur);
        const isNode = cnb.length !== 2;
        const next = cnb.find((x) => !eq(x, prev));
        const dirBreak = next && !eqDir(sub(next, cur), dir);
        const secBreak = next && !sameSec(sec, secOf(cur));
        if (isNode || !next || dirBreak || secBreak) {
          emit(start, cur, sec, count);
          if (!isNode && next && (dirBreak || secBreak) && !usedEdge.has(ek(cur, next))) {
            // corner or reducer boundary: cur is shared — start the next run here
            start = cur; prev = cur; dir = sub(next, cur); sec = secOf(cur); count = 1;
            usedEdge.add(ek(cur, next)); cur = next; continue;
          }
          break;
        }
        usedEdge.add(ek(cur, next)); prev = cur; cur = next;
      }
    }
  }
  return { runs };
}
