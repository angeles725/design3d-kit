// library (STAGED): duct-router  (scratchpad-research/staged/duct-router.mjs)
// source: design3d numerical-methods pass · MATHQC routing delta · PoC validated by creador2 (2026-08-26).
//         Empirical result behind it: turn-penalty A* cut elbows 5->2 at IDENTICAL path length on a
//         30x10x30 test grid vs plain length-only A* — elbows are fittings + pressure drop, so bends,
//         not just length, are the cost that matters for ductwork.
// what: PURE-JS, ZERO-DEPENDENCY deterministic 3D duct/pipe router. A* over a voxel occupancy grid with
//       state = (cell, incomingDirection) so each direction change can be penalized (minimize BENDS).
//       Two output modes: STRICT ORTHOGONAL (axis-aligned segments — real ductwork, no bow) and ROUNDED
//       (CatmullRomCurve3 — smooth pipe/cable, corners bow off-axis; measure before you ship it).
// deps: NONE for the pure core (routeDuct / toOrthogonalSegments and all helpers import nothing, so the
//       router is unit-testable in plain Node with no three.js resolution). `toCurve` is the ONLY thin
//       wrapper and loads three via a dynamic `import('three')` INSIDE the function — this file must
//       NEVER carry a top-level `import * as THREE`.
//
// DETERMINISM. Fixed 6-direction expansion order + a binary min-heap whose order key is [f, insertionSeq]
// (FIFO tie-break) + a stale-entry skip. Same inputs => same pops => same path, every run. The (cell,dir)
// state is what lets the turn penalty exist at all: cost to enter a neighbor = stepCost + bendPenalty·(1
// if the move axis differs from the incoming axis). Manhattan heuristic (× stepCost) stays admissible
// because bends only ADD cost, so A* remains optimal for the bend-aware cost function.
//
// OBSTACLE INFLATION. Obstacles and the routing bounds are given in world units. A cell is occupied when
// its center lies inside any obstacle AABB inflated by (radius + clearance) — i.e. the duct's own radius
// plus a service gap — or when the cell falls outside `bounds`. Start/end cells are force-freed so a port
// flush against a surface can still anchor the route.

// -------- tiny inline helpers (import nothing) -----------------------------------------------------
const DIRS = [
  [+1, 0, 0], [-1, 0, 0],
  [0, +1, 0], [0, -1, 0],
  [0, 0, +1], [0, 0, -1],
];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len3 = (a) => Math.sqrt(dot3(a, a));
const unit3 = (a) => { const l = len3(a); return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };
const dirIndex = (d) => DIRS.findIndex((v) => v[0] === d[0] && v[1] === d[1] && v[2] === d[2]);

// Per-bend metadata for downstream fitting placement (hvac-fittings.elbow puts an exact-arc elbow at
// each turn; the straight segments fill between). turnAngle is 90° for orthogonal but kept general.
function buildBends(waypoints) {
  const bends = [];
  for (let i = 1; i < waypoints.length - 1; i++) {
    const inDir = unit3(sub3(waypoints[i], waypoints[i - 1]));
    const outDir = unit3(sub3(waypoints[i + 1], waypoints[i]));
    const turnAngle = Math.acos(Math.max(-1, Math.min(1, dot3(inDir, outDir)))) * 180 / Math.PI;
    bends.push({ position: waypoints[i].slice(), inDir, outDir, turnAngle });
  }
  return bends;
}

// -------- deterministic binary min-heap. Order key [f, seq] (FIFO tie-break). ----------------------
class MinHeap {
  constructor() { this.a = []; this.k = 0; }
  _less(i, j) { const A = this.a[i], B = this.a[j]; return A.f !== B.f ? A.f < B.f : A.seq < B.seq; }
  get size() { return this.a.length; }
  push(x) { x.seq = this.k++; this.a.push(x); let i = this.a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (this._less(i, p)) { this._sw(i, p); i = p; } else break; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; this._down(0); } return top; }
  _down(i) { const a = this.a, n = a.length; for (;;) { let l = 2 * i + 1, r = l + 1, s = i; if (l < n && this._less(l, s)) s = l; if (r < n && this._less(r, s)) s = r; if (s === i) break; this._sw(i, s); i = s; } }
  _sw(i, j) { const t = this.a[i]; this.a[i] = this.a[j]; this.a[j] = t; }
}

// -------- occupancy grid (pure) --------------------------------------------------------------------
function buildGrid(bounds, gridStep, obstacles, inflate) {
  const min = bounds.min, max = bounds.max;
  const nx = Math.max(1, Math.round((max[0] - min[0]) / gridStep));
  const ny = Math.max(1, Math.round((max[1] - min[1]) / gridStep));
  const nz = Math.max(1, Math.round((max[2] - min[2]) / gridStep));
  const occ = new Uint8Array(nx * ny * nz);
  const idx = (x, y, z) => (x * ny + y) * nz + z;
  const inBounds = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz;
  const center = (x, y, z) => [min[0] + (x + 0.5) * gridStep, min[1] + (y + 0.5) * gridStep, min[2] + (z + 0.5) * gridStep];
  const cellOfWorld = (p) => [
    Math.max(0, Math.min(nx - 1, Math.floor((p[0] - min[0]) / gridStep))),
    Math.max(0, Math.min(ny - 1, Math.floor((p[1] - min[1]) / gridStep))),
    Math.max(0, Math.min(nz - 1, Math.floor((p[2] - min[2]) / gridStep))),
  ];
  // Mark cells whose CENTER lies inside any obstacle AABB inflated by `inflate`.
  for (const ob of (obstacles || [])) {
    const omin = [ob.min[0] - inflate, ob.min[1] - inflate, ob.min[2] - inflate];
    const omax = [ob.max[0] + inflate, ob.max[1] + inflate, ob.max[2] + inflate];
    for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) {
      const c = center(x, y, z);
      if (c[0] >= omin[0] && c[0] <= omax[0] && c[1] >= omin[1] && c[1] <= omax[1] && c[2] >= omin[2] && c[2] <= omax[2]) occ[idx(x, y, z)] = 1;
    }
  }
  return { nx, ny, nz, occ, idx, inBounds, center, cellOfWorld };
}

// -------- A* over (cell, incomingDir) --------------------------------------------------------------
function astar(grid, start, end, { startDir, bendPenalty, stepCost, maxExpansions, slope }) {
  const { ny, nz, occ, idx, inBounds } = grid;
  const h = (x, y, z) => (Math.abs(x - end[0]) + Math.abs(y - end[1]) + Math.abs(z - end[2])) * stepCost;
  // Drainage slope: a monotonic feasibility filter on the slope axis. `descending` sets which coord
  // direction is downhill: '-' (default) = decreasing coord, '+' = increasing coord. monotonic (default
  // when slope given) forbids any uphill move, so the path never runs against the drain. minGrade is
  // enforced globally by routeDuct's pre/post checks (net descent >= minGrade * horizontal length).
  const slopeAxis = slope ? { x: 0, y: 1, z: 2 }[slope.axis] : -1;
  const monotonic = slope ? (slope.monotonic !== false) : false;
  const downDir = slope && slope.descending === '+' ? 1 : -1;
  const skey = (x, y, z, d) => ((x * ny + y) * nz + z) * 7 + d; // d in [0..5], or 6 for "no incoming dir"
  const sd = startDir ? dirIndex(startDir) : 6;
  const g = new Map(), came = new Map(), node = new Map();
  const open = new MinHeap();
  const s0 = skey(start[0], start[1], start[2], sd);
  g.set(s0, 0); node.set(s0, [start[0], start[1], start[2], sd]);
  open.push({ key: s0, f: h(start[0], start[1], start[2]) });
  let popped = 0;
  while (open.size) {
    if (maxExpansions && popped >= maxExpansions) return { found: false, popped };
    const cur = open.pop(); popped++;
    const [cx, cy, cz, cd] = node.get(cur.key); const gc = g.get(cur.key);
    if (cur.f - h(cx, cy, cz) > gc) continue; // stale
    if (cx === end[0] && cy === end[1] && cz === end[2]) return reconstruct(came, node, cur.key, gc, popped);
    for (let di = 0; di < 6; di++) {
      const nX = cx + DIRS[di][0], nY = cy + DIRS[di][1], nZ = cz + DIRS[di][2];
      if (!inBounds(nX, nY, nZ) || occ[idx(nX, nY, nZ)]) continue;
      if (monotonic && ([nX, nY, nZ][slopeAxis] - [cx, cy, cz][slopeAxis]) * downDir < 0) continue; // no uphill
      const turned = (cd !== 6 && di !== cd) ? 1 : 0; // no penalty for the very first move when startDir unset
      const ng = gc + stepCost + bendPenalty * turned;
      const nk = skey(nX, nY, nZ, di);
      if (!g.has(nk) || ng < g.get(nk)) {
        g.set(nk, ng); came.set(nk, cur.key); node.set(nk, [nX, nY, nZ, di]);
        open.push({ key: nk, f: ng + h(nX, nY, nZ) });
      }
    }
  }
  return { found: false, popped };
}

function reconstruct(came, node, endKey, cost, popped) {
  const cells = []; let k = endKey;
  while (k !== undefined) { const c = node.get(k); cells.push([c[0], c[1], c[2]]); k = came.get(k); }
  cells.reverse();
  return { found: true, cells, cost, popped };
}

// -------- post-process (pure) ----------------------------------------------------------------------
function simplifyCells(cells) {
  if (cells.length <= 2) return cells.slice();
  const sign = (a, b) => [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1]), Math.sign(b[2] - a[2])];
  const wp = [cells[0]];
  for (let i = 1; i < cells.length - 1; i++) {
    const d0 = sign(cells[i - 1], cells[i]); const d1 = sign(cells[i], cells[i + 1]);
    if (d0[0] !== d1[0] || d0[1] !== d1[1] || d0[2] !== d1[2]) wp.push(cells[i]);
  }
  wp.push(cells[cells.length - 1]);
  return wp;
}

// ============================================================================
// PUBLIC CONTRACT
// ============================================================================
/**
 * Route an axis-aligned duct/pipe through a voxelized volume, minimizing bends.
 * @param {object} o
 * @param {number[]} o.start                 world [x,y,z] start port.
 * @param {number[]} o.end                   world [x,y,z] end port.
 * @param {{min:number[],max:number[]}[]} [o.obstacles]  world-space AABB obstacles.
 * @param {{min:number[],max:number[]}} o.bounds         world-space routing volume.
 * @param {number} [o.gridStep=0.25]         voxel size (caller units).
 * @param {number} [o.bendPenalty=5]         extra cost per elbow, in stepCost units (0 = length-only).
 * @param {number} [o.radius=0]              duct radius; inflates obstacles so the tube body stays clear.
 * @param {number} [o.clearance=0]           extra service gap added to the inflation.
 * @param {number} [o.maxExpansions=200000]  A* pop cap (returns found:false if exceeded).
 * @param {number[]} [o.startDir]            optional initial facing [dx,dy,dz] (a leaving-turn is penalized).
 * @param {number} [o.stepCost=1]            cost per cell traversed.
 * @param {{axis:'x'|'y'|'z',minGrade:number,monotonic?:boolean,descending?:'+'|'-'}} [o.slope]  drainage
 *          constraint. `descending` sets the downhill coord direction: '-' (default) = decreasing coord,
 *          '+' = increasing coord. monotonic (default true) forbids uphill moves on `axis`; minGrade
 *          requires net descent >= minGrade * horizontal path length. found:false when infeasible (e.g.
 *          end uphill of start under monotonic). Omit `slope` for the current unconstrained behavior.
 * @returns {{found:boolean, waypoints:number[][], bends:{position:number[],inDir:number[],outDir:number[],turnAngle:number}[], length:number, cost:number, expansions:number}}
 *          waypoints in world coords (cell centers); `bends` is per-turn metadata (one entry per elbow),
 *          so bends.length is the elbow count; length = world length of the orthogonal path.
 */
export function routeDuct({ start, end, obstacles = [], bounds, gridStep = 0.25, bendPenalty = 5, radius = 0, clearance = 0, maxExpansions = 200000, startDir = null, stepCost = 1, slope = null }) {
  if (!bounds) throw new Error('routeDuct: bounds { min:[x,y,z], max:[x,y,z] } is required');
  const grid = buildGrid(bounds, gridStep, obstacles, radius + clearance);
  const s = grid.cellOfWorld(start), e = grid.cellOfWorld(end);
  grid.occ[grid.idx(s[0], s[1], s[2])] = 0; // force endpoints free
  grid.occ[grid.idx(e[0], e[1], e[2])] = 0;
  const fail = { found: false, waypoints: [], bends: [], length: 0, cost: 0, expansions: 0 };
  // Slope pre-check on the snapped endpoints: is there enough available drop to meet minGrade over the
  // minimum (Manhattan) horizontal travel? If not — including end above start under monotonic — infeasible.
  if (slope) {
    const ax = { x: 0, y: 1, z: 2 }[slope.axis];
    const downDir = slope.descending === '+' ? 1 : -1;
    const sw = grid.center(s[0], s[1], s[2]), ew = grid.center(e[0], e[1], e[2]);
    const avail = downDir * (ew[ax] - sw[ax]); // descent available start->end in the downhill direction
    const horizMin = [0, 1, 2].filter((i) => i !== ax).reduce((a, i) => a + Math.abs(sw[i] - ew[i]), 0);
    if (avail + 1e-9 < (slope.minGrade || 0) * horizMin) return fail;
  }
  const res = astar(grid, s, e, { startDir, bendPenalty, stepCost, maxExpansions, slope });
  if (!res.found) return { ...fail, expansions: res.popped };
  const wpCells = simplifyCells(res.cells);
  const waypoints = wpCells.map((c) => grid.center(c[0], c[1], c[2]));
  let length = 0;
  for (let i = 1; i < waypoints.length; i++) length += len3(sub3(waypoints[i], waypoints[i - 1]));
  // Slope post-check: the actual path's net descent must cover minGrade * its horizontal length (an
  // obstacle-forced horizontal detour could otherwise under-grade the run).
  if (slope) {
    const ax = { x: 0, y: 1, z: 2 }[slope.axis];
    const downDir = slope.descending === '+' ? 1 : -1;
    let horizLen = 0;
    for (let i = 1; i < waypoints.length; i++) {
      const d = sub3(waypoints[i], waypoints[i - 1]);
      horizLen += Math.abs(d[(ax + 1) % 3]) + Math.abs(d[(ax + 2) % 3]);
    }
    const netDescent = downDir * (waypoints[waypoints.length - 1][ax] - waypoints[0][ax]);
    if (netDescent + 1e-9 < (slope.minGrade || 0) * horizLen) return { ...fail, expansions: res.popped };
  }
  return { found: true, waypoints, bends: buildBends(waypoints), length, cost: res.cost, expansions: res.popped };
}

/**
 * STRICT ORTHOGONAL output: the axis-aligned segments between waypoints (real ductwork, no bow).
 * Feed `points` straight into pipe-run.mjs `createPipeRun({ points, radius, material })`.
 * @param {number[][]} waypoints
 * @returns {{points:number[][], segments:{a:number[],b:number[],axis:('x'|'y'|'z'|'-'),length:number}[]}}
 */
export function toOrthogonalSegments(waypoints) {
  const segments = [];
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1], b = waypoints[i];
    const d = sub3(b, a);
    const axis = d[0] !== 0 ? 'x' : d[1] !== 0 ? 'y' : d[2] !== 0 ? 'z' : '-';
    segments.push({ a, b, axis, length: len3(d) });
  }
  return { points: waypoints.map((p) => p.slice()), segments };
}

/**
 * ROUNDED output: a THREE.CatmullRomCurve3 through the waypoints (smooth pipe/cable — corners bow).
 * ONLY function in this file that touches three; loads it dynamically so the pure core stays testable.
 * @param {number[][]} waypoints
 * @param {object} [opts]  { closed=false, curveType='centripetal', tension=0.5 }
 * @returns {Promise<import('three').CatmullRomCurve3>}
 */
export async function toCurve(waypoints, { closed = false, curveType = 'centripetal', tension = 0.5 } = {}) {
  const THREE = await import('three');
  const pts = waypoints.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  return new THREE.CatmullRomCurve3(pts, closed, curveType, tension);
}
