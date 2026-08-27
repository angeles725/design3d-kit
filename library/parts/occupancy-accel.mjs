// library: occupancy-accel  (parts/occupancy-accel.mjs) — occupancy-grid-accelerated spatial queries (investigador4).
// Wires the semantic occupancy-grid (parts/occupancy-grid.mjs) under the spatial engine's SPATIAL tools so
// free-space / line-of-sight checks run in O(cells-in-box) instead of O(objects) — a real acceleration on
// large scenes, and `pathFree` is a genuinely new op (segment vs occupancy). Delegate target for
// spatial-harness.freeSpace / pathFree (coordinated with inv2). Pure-Node, offline, REPORTS only.
import { OccupancyGrid, CELL } from './occupancy-grid.mjs';

// pathFree: EXACT segment-vs-occupancy traversal via 3D DDA (Amanatides-Woo). Visits EVERY cell the
// centerline a→b enters (no point-sampling gap — a corner-clipped occupied cell is never missed).
// passable defaults to FREE; pass allow:[FREE,CLEARANCE] to treat clearance as traversable.
export function pathFree(grid, a, b, { allow = [CELL.FREE] } = {}) {
  const allowSet = new Set(allow);
  const h = grid.h, dims = grid.dims;
  const cellOf = (p) => [0, 1, 2].map(i => Math.min(dims[i] - 1, Math.max(0, Math.floor(p[i] / h))));
  const codeAt = (c) => grid.cellAt([(c[0] + 0.5) * h, (c[1] + 0.5) * h, (c[2] + 0.5) * h]);
  const worldOf = (c) => [(c[0] + 0.5) * h, (c[1] + 0.5) * h, (c[2] + 0.5) * h];
  const cell = cellOf(a), end = cellOf(b);
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const step = d.map(x => (x > 0 ? 1 : x < 0 ? -1 : 0));
  const tMax = [0, 0, 0], tDelta = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    if (step[i] === 0) { tMax[i] = Infinity; tDelta[i] = Infinity; }
    else {
      const nextBoundary = (cell[i] + (step[i] > 0 ? 1 : 0)) * h;
      tMax[i] = (nextBoundary - a[i]) / d[i];
      tDelta[i] = h / Math.abs(d[i]);
    }
  }
  const blockedIf = (c) => { const code = codeAt(c); return allowSet.has(code) ? null : { clear: false, blockedAt: worldOf(c), code }; };
  let hit = blockedIf(cell); if (hit) return hit;
  let guard = (dims[0] + dims[1] + dims[2]) * 3 + 8;
  while (!(cell[0] === end[0] && cell[1] === end[1] && cell[2] === end[2]) && guard-- > 0) {
    let axis = 0; if (tMax[1] < tMax[axis]) axis = 1; if (tMax[2] < tMax[axis]) axis = 2;
    cell[axis] += step[axis];
    if (cell[axis] < 0 || cell[axis] >= dims[axis]) break; // left the grid
    tMax[axis] += tDelta[axis];
    hit = blockedIf(cell); if (hit) return hit;
  }
  return { clear: true, blockedAt: null };
}

// findFreeRegion: deterministic grid scan for a box of `size` whose cells are all FREE.
// Returns the box center, or null if none. Searches at FLOOR level (center_z = size_z/2 — equipment
// on the floor); a z-search variant is out of scope here (add it if wall/ceiling placement is needed).
export function findFreeRegion(grid, size, { step = grid.h, near = null } = {}) {
  const [sx, sy, sz] = size, z = sz / 2;
  const cands = [];
  for (let cy = sy / 2; cy <= grid.room[1] - sy / 2 + 1e-9; cy += step)
    for (let cx = sx / 2; cx <= grid.room[0] - sx / 2 + 1e-9; cx += step) {
      const box = OccupancyGrid.aabbOf({ size, center: [cx, cy, z] });
      if (grid.areCellsFree(box)) cands.push([cx, cy, z]);
    }
  if (!cands.length) return null;
  if (near) cands.sort((p, q) => dist2(p, near) - dist2(q, near)); // nearest-to-`near` preference
  return cands[0];
}
function dist2(p, q) { return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; }

// build a grid from a scene (objects with size/center + optional clearance), ready for the queries above.
export function gridFromScene(scene, { h = 0.25, markClearance = true } = {}) {
  const g = new OccupancyGrid(scene.room.size, h);
  for (const o of scene.objects || []) g.markObject(o);
  if (markClearance) for (const o of scene.objects || []) g.markClearance(o);
  return g;
}
