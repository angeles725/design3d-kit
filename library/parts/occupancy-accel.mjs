// library: occupancy-accel  (parts/occupancy-accel.mjs) — occupancy-grid-accelerated spatial queries (investigador4).
// Wires the semantic occupancy-grid (parts/occupancy-grid.mjs) under the spatial engine's SPATIAL tools so
// free-space / line-of-sight checks run in O(cells-in-box) instead of O(objects) — a real acceleration on
// large scenes, and `pathFree` is a genuinely new op (segment vs occupancy). Delegate target for
// spatial-harness.freeSpace / pathFree (coordinated with inv2). Pure-Node, offline, REPORTS only.
import { OccupancyGrid, CELL } from './occupancy-grid.mjs';

// pathFree: march the segment a→b through the grid; blocked if any sampled cell is not passable.
// passable defaults to FREE; pass allow:[FREE,CLEARANCE] to treat clearance as traversable.
export function pathFree(grid, a, b, { allow = [CELL.FREE], samplesPerCell = 2 } = {}) {
  const allowSet = new Set(allow);
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  const n = Math.max(1, Math.ceil((len / grid.h) * samplesPerCell));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];
    if (!allowSet.has(grid.cellAt(p))) return { clear: false, blockedAt: p, code: grid.cellAt(p) };
  }
  return { clear: true, blockedAt: null };
}

// findFreeRegion: deterministic grid scan for a box of `size` whose cells are all FREE.
// Returns the box center, or null if none. floor=true keeps center_z = size_z/2 (equipment on the floor).
export function findFreeRegion(grid, size, { step = grid.h, floor = true, near = null } = {}) {
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
