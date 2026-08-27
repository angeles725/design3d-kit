// library: voxelize  (parts/voxelize.mjs) — TRIANGLE MESH → semantic voxel occupancy (investigador1, v1.19).
// source: design3d CORE-SPINE extraction (2026-08-26). This is the missing "→ VOXEL" primitive of the
//         CAD/foto/spec → VOXEL → realista spine: the docs reference Open3D-style surface voxelization but
//         never specify the algorithm, so the intake half of the pipeline (geometry → occupancy) had no
//         code — only #36 sceneToBlockout (AABB rasterization) covered typed-box scenes. This handles the
//         PRECISE case: real triangle geometry (imported CAD solid / mesh equipment) → the same semantic
//         OccupancyGrid the spatial brain and pass-parity gate already speak. It plugs into pipeline-spine's
//         VOXELIZE slot (#38) and feeds inv3's de-box realista pass.
// what: conservative surface voxelization (every cell a triangle touches is OCCUPIED) + optional watertight
//       solid fill (boundary flood → interior). Dual world↔voxel coords are exact and shared with
//       occupancy-grid: cell(p) = floor((p - origin)/h), centerOf(v) = origin + (v + 0.5)·h.
// deps: NONE. Pure zero-import geometry core (Node-testable). Interops with parts/occupancy-grid.mjs (same
//       CELL codes, same floor-indexing) but does not import it, so this file stays standalone-loadable.

// Semantic cell codes — IDENTICAL to occupancy-grid.mjs CELL (kept in sync by value, not by import, so the
// two files never form a cycle). 0=FREE 1=OCCUPIED. A voxelization only ever writes FREE/OCCUPIED; semantic
// re-coding (CLEARANCE/RESERVED/…) is the grid's job downstream.
export const FREE = 0;
export const OCCUPIED = 1;

const EPS = 1e-9;

// ---- dual world↔voxel coordinate contract (shared with occupancy-grid) --------------------------------
// cell index of a world coordinate along one axis. FLOOR (not round): a point sits in the cell whose
// half-open span [origin + v·h, origin + (v+1)·h) contains it. This matches occupancy-grid._clampCell.
export function cellOf(w, origin, h) { return Math.floor((w - origin) / h); }
// world CENTER of a voxel along one axis. The inverse used for placing proxies back (V·h + h/2).
export function centerOf(v, origin, h) { return origin + (v + 0.5) * h; }

// Tight AABB of a flat positions array [x,y,z,x,y,z,...].
function boundsOf(positions) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3)
    for (let a = 0; a < 3; a++) { const c = positions[i + a]; if (c < lo[a]) lo[a] = c; if (c > hi[a]) hi[a] = c; }
  return { lo, hi };
}

/**
 * Voxelize a triangle mesh into a semantic occupancy grid.
 * PURE: imports nothing; operates on flat arrays. Node-testable.
 *
 * @param {number[]} positions  flat vertex coords [x,y,z,...].
 * @param {number[]} indices    flat triangle vertex ids [a,b,c,...]. If omitted, positions are taken as
 *                              consecutive triangles (every 9 numbers = 1 triangle).
 * @param {object}  [opts]
 * @param {number}  [opts.voxelSize=0.25]  voxel edge h in world units (1u=1m). The kit's canonical 0.25/0.5.
 * @param {number[]} [opts.origin]         grid origin (min corner). Defaults to the mesh AABB min, snapped
 *                                        DOWN to a voxelSize multiple so the lattice is world-stable.
 * @param {boolean} [opts.solid=false]     also fill the watertight interior (boundary-flood complement).
 * @returns {{voxelSize:number, origin:number[], dims:number[], cells:Uint8Array,
 *            count:number, has:(vx:number,vy:number,vz:number)=>boolean,
 *            centerWorld:(vx:number,vy:number,vz:number)=>number[]}}
 */
export function voxelize(positions, indices, opts = {}) {
  const h = opts.voxelSize ?? 0.25;
  if (!(h > 0)) throw new RangeError('voxelize: voxelSize must be > 0');
  if (!positions || positions.length < 9) throw new RangeError('voxelize: need at least one triangle');
  const tris = indices ?? Array.from({ length: positions.length / 3 }, (_, i) => i);
  if (tris.length % 3 !== 0) throw new RangeError('voxelize: indices length must be a multiple of 3');

  const b = boundsOf(positions);
  // World-stable lattice: snap the origin DOWN to a voxel multiple so the same object voxelizes identically
  // regardless of where in the world it sits (a key property for the de-box round-trip parity gate).
  const origin = opts.origin ?? b.lo.map(c => Math.floor(c / h) * h);
  const dims = [0, 1, 2].map(a => Math.max(1, cellOf(b.hi[a] - EPS, origin[a], h) - cellOf(b.lo[a] + EPS, origin[a], h) + 1));
  const [nx, ny, nz] = dims;
  const cells = new Uint8Array(nx * ny * nz); // 0=FREE
  const idx = (x, y, z) => (x * ny + y) * nz + z;
  const inBounds = (x, y, z) => x >= 0 && x < nx && y >= 0 && y < ny && z >= 0 && z < nz;
  // Surface marks CLAMP into range: a sample lies on the mesh (inside the AABB by construction), so a point
  // exactly on the far +face maps to cell = dim (one past the last) and must belong to the LAST cell — the
  // same half-open convention occupancy-grid._clampCell uses. Clamp is safe here (never pulls a genuine
  // outside point in); the solid-fill flood below deliberately does NOT clamp.
  const clamp = (v, d) => v < 0 ? 0 : (v >= d ? d - 1 : v);
  const markSurface = (x, y, z) => { cells[idx(clamp(x, nx), clamp(y, ny), clamp(z, nz))] = OCCUPIED; };

  // ---- surface pass: conservative barycentric sampling ------------------------------------------------
  // Sample each triangle densely enough (step ≤ h/2 along its longest edge) that no cell it crosses is
  // skipped, then mark the floor-cell of every sample. Conservative for the kit's block/duct/equipment
  // scales; not a separating-axis exact test, but never under-fills a surface at h/2 sampling.
  const P = (i, a) => positions[i * 3 + a];
  for (let t = 0; t < tris.length; t += 3) {
    const i0 = tris[t], i1 = tris[t + 1], i2 = tris[t + 2];
    const v0 = [P(i0, 0), P(i0, 1), P(i0, 2)];
    const v1 = [P(i1, 0), P(i1, 1), P(i1, 2)];
    const v2 = [P(i2, 0), P(i2, 1), P(i2, 2)];
    const e1 = Math.hypot(v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]);
    const e2 = Math.hypot(v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]);
    const n = Math.max(1, Math.ceil((Math.max(e1, e2) * 2) / h)); // ≥2 samples per voxel edge
    for (let a = 0; a <= n; a++) {
      for (let c = 0; c <= n - a; c++) {
        const u = a / n, w = c / n; // barycentric (u,w, 1-u-w) over the triangle
        const x = v0[0] + u * (v1[0] - v0[0]) + w * (v2[0] - v0[0]);
        const y = v0[1] + u * (v1[1] - v0[1]) + w * (v2[1] - v0[1]);
        const z = v0[2] + u * (v1[2] - v0[2]) + w * (v2[2] - v0[2]);
        markSurface(cellOf(x, origin[0], h), cellOf(y, origin[1], h), cellOf(z, origin[2], h));
      }
    }
  }

  // ---- solid fill: flood FREE from the boundary; unreached FREE cells are interior → OCCUPIED ----------
  // Robust for a watertight surface (no parity/normal assumptions). A leaky mesh simply stays hollow — the
  // flood reaches the interior through the hole — which fails safe (never marks phantom solid).
  if (opts.solid) {
    const exterior = new Uint8Array(nx * ny * nz);
    const stack = [];
    // seed every FREE boundary cell
    for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) {
      if ((x === 0 || x === nx - 1 || y === 0 || y === ny - 1 || z === 0 || z === nz - 1)
        && cells[idx(x, y, z)] === FREE && !exterior[idx(x, y, z)]) {
        exterior[idx(x, y, z)] = 1; stack.push(x, y, z);
      }
    }
    const NB = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]; // 6-conn— walls block leaks
    while (stack.length) {
      const z = stack.pop(), y = stack.pop(), x = stack.pop();
      for (const [dx, dy, dz] of NB) {
        const px = x + dx, py = y + dy, pz = z + dz;
        if (inBounds(px, py, pz) && cells[idx(px, py, pz)] === FREE && !exterior[idx(px, py, pz)]) {
          exterior[idx(px, py, pz)] = 1; stack.push(px, py, pz);
        }
      }
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === FREE && !exterior[i]) cells[i] = OCCUPIED;
  }

  let count = 0; for (let i = 0; i < cells.length; i++) if (cells[i] === OCCUPIED) count++;
  return {
    voxelSize: h, origin, dims, cells, count,
    has: (vx, vy, vz) => inBounds(vx, vy, vz) && cells[idx(vx, vy, vz)] === OCCUPIED,
    centerWorld: (vx, vy, vz) => [centerOf(vx, origin[0], h), centerOf(vy, origin[1], h), centerOf(vz, origin[2], h)],
  };
}

/**
 * Convenience: the AABB (box) of an occupancy result in world units — the tight bounds of all OCCUPIED
 * voxels, snapped to the voxel lattice. This is what a de-box / blockout consumer reads to recover the
 * {center,size} of a voxelized part (the inverse of occupancy-grid.aabbOf), so a mesh voxelized here and a
 * box blockout from #36 land in the SAME contract.
 * @returns {{center:number[], size:number[]} | null}  null if nothing is occupied.
 */
export function occupancyAABB(occ) {
  const { origin, dims, voxelSize: h } = occ;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let x = 0; x < dims[0]; x++) for (let y = 0; y < dims[1]; y++) for (let z = 0; z < dims[2]; z++) {
    if (!occ.has(x, y, z)) continue;
    const v = [x, y, z];
    for (let a = 0; a < 3; a++) { if (v[a] < lo[a]) lo[a] = v[a]; if (v[a] > hi[a]) hi[a] = v[a]; }
  }
  if (lo[0] === Infinity) return null;
  const wlo = [0, 1, 2].map(a => origin[a] + lo[a] * h);
  const whi = [0, 1, 2].map(a => origin[a] + (hi[a] + 1) * h); // +1: cover the far cell's full extent
  return {
    center: [0, 1, 2].map(a => (wlo[a] + whi[a]) / 2),
    size: [0, 1, 2].map(a => whi[a] - wlo[a]),
  };
}

// ---- polyline (duct CENTERLINE) → voxel occupancy -----------------------------------------------------
// The CAD-intake counterpart to voxelize(): dxf-intake emits duct runs as 1-D CENTERLINES ({positions,index}
// line-segment pairs), not triangle surfaces. This rasterizes each centerline into the SAME occupancy grid
// for the P4 massing blockout — before any tube geometry is built — and tags every occupied cell with its
// section (DN) so the vectorizer / de-box can recover per-run diameter.
//
// Grounded in creador2's strict-probe of the naive approach (MATHQC-DELTAS §11) — three findings baked in as
// ENFORCED rules, not assumptions:
//   1. AXIS-ALIGNED ONLY. A diagonal centerline staircases into a SPURIOUS elbow/tee. Route-1 CAD is
//      axis-aligned by contract, so a segment differing in >1 axis is REJECTED (throw) by default, or
//      projected onto its dominant axis when {onDiagonal:'snap'}. Never silently staircased.
//   2. Junction position quantizes to voxelSize/2, so a caller must pick voxelSize ≤ its junction tolerance.
//   3. A shared junction cell can only hold ONE section. First-writer-wins is wrong for a reducing tee, so
//      the shared cell carries the CANONICAL (MAX) section and every disagreement is surfaced in conflicts[].
const bridge6Axis = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return i; return -1; };
const sectionRank = (s) => (s == null ? -Infinity : (typeof s === 'number' ? s : Math.max(s.width ?? 0, s.height ?? 0)));

/**
 * Rasterize axis-aligned duct centerlines into a semantic occupancy grid + per-cell section map.
 * PURE: imports nothing. Node-testable.
 *
 * @param {number[]} positions  flat vertex coords [x,y,z,...].
 * @param {number[]} indices    flat LINE segment pairs [a,b, a,b, ...] (length multiple of 2).
 * @param {object}  [opts]
 * @param {number}  [opts.voxelSize=0.25]  voxel edge h. Pick ≤ your junction-position tolerance (finding 2).
 * @param {(number|{width:number,height:number})[]} [opts.sections]  one section per SEGMENT (index i pairs
 *                                        with indices[2i],indices[2i+1]); number = round DN, object = rect.
 * @param {number[]} [opts.origin]        grid origin; defaults to the polyline AABB min snapped to a voxel.
 * @param {'reject'|'snap'} [opts.onDiagonal='reject']  a non-axis-aligned segment throws, or snaps to axis.
 * @returns {{voxelSize:number, origin:number[], dims:number[], cells:Uint8Array, count:number,
 *            sectionAt:(vx,vy,vz)=>(number|object|null), conflicts:Array<{cell:number[],kept:*,dropped:*}>,
 *            has:(vx,vy,vz)=>boolean}}
 */
export function voxelizePolyline(positions, indices, opts = {}) {
  const h = opts.voxelSize ?? 0.25;
  if (!(h > 0)) throw new RangeError('voxelizePolyline: voxelSize must be > 0');
  if (!indices || indices.length < 2 || indices.length % 2 !== 0)
    throw new RangeError('voxelizePolyline: indices must be non-empty LINE segment pairs (length % 2 === 0)');
  const onDiagonal = opts.onDiagonal ?? 'reject';
  const sections = opts.sections ?? [];

  const b = boundsOf(positions);
  const origin = opts.origin ?? b.lo.map(c => Math.floor(c / h) * h);
  const dims = [0, 1, 2].map(a => Math.max(1, cellOf(b.hi[a] - EPS, origin[a], h) - cellOf(b.lo[a] + EPS, origin[a], h) + 1));
  const [nx, ny, nz] = dims;
  const cells = new Uint8Array(nx * ny * nz);
  const idx = (x, y, z) => (x * ny + y) * nz + z;
  const inBounds = (x, y, z) => x >= 0 && x < nx && y >= 0 && y < ny && z >= 0 && z < nz;
  const clampCell = (p) => [0, 1, 2].map(a => Math.min(dims[a] - 1, Math.max(0, cellOf(p[a], origin[a], h))));
  const secByCell = new Map();
  const conflicts = [];
  const P = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];

  const markCell = (cx, cy, cz, sec) => {
    if (!inBounds(cx, cy, cz)) return;
    const k = idx(cx, cy, cz);
    cells[k] = OCCUPIED;
    if (sec === undefined) return;
    const prev = secByCell.get(k);
    if (prev === undefined) { secByCell.set(k, sec); return; }
    // finding 3: shared cell keeps the CANONICAL (max) section; record the disagreement.
    if (sectionRank(sec) !== sectionRank(prev)) {
      const keep = sectionRank(sec) > sectionRank(prev) ? sec : prev;
      const drop = keep === sec ? prev : sec;
      secByCell.set(k, keep);
      conflicts.push({ cell: [cx, cy, cz], kept: keep, dropped: drop });
    }
  };

  const nSeg = indices.length / 2;
  for (let s = 0; s < nSeg; s++) {
    let ca = clampCell(P(indices[2 * s])), cb = clampCell(P(indices[2 * s + 1]));
    const sec = sections[s];
    const diffAxes = [0, 1, 2].filter(a => ca[a] !== cb[a]);
    if (diffAxes.length > 1) {
      // finding 1: not axis-aligned.
      if (onDiagonal === 'reject')
        throw new RangeError(`voxelizePolyline: segment ${s} is not axis-aligned (differs in axes [${diffAxes}]). ` +
          `Route-1 CAD is axis-aligned by contract; split/snap upstream or pass {onDiagonal:'snap'}.`);
      // snap: project the endpoint onto the dominant axis (longest cell delta), collapsing the others.
      const dom = diffAxes.reduce((m, a) => Math.abs(cb[a] - ca[a]) > Math.abs(cb[m] - ca[m]) ? a : m, diffAxes[0]);
      cb = ca.map((v, a) => a === dom ? cb[a] : v);
    }
    // bridge6: a single axis differs (or none) → a straight run of cells, no staircase, no spurious elbow.
    const ax = bridge6Axis(ca, cb);
    if (ax === -1) { markCell(ca[0], ca[1], ca[2], sec); continue; }
    const step = cb[ax] > ca[ax] ? 1 : -1;
    for (let v = ca[ax]; v !== cb[ax] + step; v += step) {
      const c = [...ca]; c[ax] = v; markCell(c[0], c[1], c[2], sec);
    }
  }

  let count = 0; for (let i = 0; i < cells.length; i++) if (cells[i] === OCCUPIED) count++;
  return {
    voxelSize: h, origin, dims, cells, count, conflicts,
    has: (vx, vy, vz) => inBounds(vx, vy, vz) && cells[idx(vx, vy, vz)] === OCCUPIED,
    sectionAt: (vx, vy, vz) => inBounds(vx, vy, vz) ? (secByCell.get(idx(vx, vy, vz)) ?? null) : null,
  };
}
