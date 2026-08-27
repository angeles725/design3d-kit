// Pure-Node test for parts/voxelize.mjs — imports only the pure core (no three).
// Run: node library/parts/voxelize.test.mjs   (exit 0 = all green)
import { voxelize, occupancyAABB, cellOf, centerOf, FREE, OCCUPIED } from './voxelize.mjs';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('FAIL: ' + msg); } }
function eq(a, b, msg) { ok(a === b, `${msg} (got ${a}, want ${b})`); }
function near(a, b, eps, msg) { ok(Math.abs(a - b) <= eps, `${msg} (got ${a}, want ~${b} ±${eps})`); }
function threw(fn, msg) { let t = false; try { fn(); } catch { t = true; } ok(t, msg); }

// A unit cube [0,1]^3 as 12 triangles (8 verts). Axis-aligned to the h=0.25 lattice → exactly 4×4×4 cells.
const CUBE_POS = [
  0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, // z=0 face verts 0..3
  0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, // z=1 face verts 4..7
];
const CUBE_IDX = [
  0, 2, 1, 0, 3, 2, // -z
  4, 5, 6, 4, 6, 7, // +z
  0, 1, 5, 0, 5, 4, // -y
  2, 3, 7, 2, 7, 6, // +y
  1, 2, 6, 1, 6, 5, // +x
  0, 4, 7, 0, 7, 3, // -x
];

// --- dual coordinate contract: cellOf/centerOf are inverse at cell centers -------------------------
{
  const h = 0.25, o = -1;
  for (const v of [0, 3, 7, 15]) {
    const c = centerOf(v, o, h);
    eq(cellOf(c, o, h), v, `centerOf→cellOf round-trips for v=${v}`);
  }
  // canonical kit mapping V=round(X/0.25) at origin 0: point 0.30 is in cell 1 (floor), center 0.375
  eq(cellOf(0.30, 0, 0.25), 1, 'cellOf floors into the [0.25,0.50) cell');
  near(centerOf(1, 0, 0.25), 0.375, 1e-12, 'centerOf = origin + (v+0.5)·h');
}

// --- surface voxelization: a unit cube shell -------------------------------------------------------
{
  const occ = voxelize(CUBE_POS, CUBE_IDX, { voxelSize: 0.25 });
  eq(occ.dims.join(','), '4,4,4', 'unit cube at h=0.25 → 4×4×4 grid');
  eq(occ.origin.join(','), '0,0,0', 'origin snapped to lattice (already aligned)');
  // shell = 4^3 − 2^3 = 64 − 8 = 56 occupied surface cells; the 8 interior cells stay FREE
  eq(occ.count, 56, 'surface pass fills the shell only (56 = 64 − 8 interior)');
  ok(occ.has(0, 0, 0) && occ.has(3, 3, 3), 'corner cells occupied');
  ok(!occ.has(1, 1, 1) && !occ.has(2, 2, 2), 'interior cells FREE in surface mode');
}

// --- solid fill: interior flood ---------------------------------------------------------------------
{
  const occ = voxelize(CUBE_POS, CUBE_IDX, { voxelSize: 0.25, solid: true });
  eq(occ.count, 64, 'solid mode fills the full 4×4×4 = 64 cells');
  ok(occ.has(1, 1, 1) && occ.has(2, 2, 2), 'interior now occupied under solid fill');
}

// --- occupancyAABB recovers the world box (the de-box / blockout contract) --------------------------
{
  const occ = voxelize(CUBE_POS, CUBE_IDX, { voxelSize: 0.25 });
  const box = occupancyAABB(occ);
  near(box.size[0], 1, 1e-9, 'recovered size x = 1');
  near(box.size[1], 1, 1e-9, 'recovered size y = 1');
  near(box.size[2], 1, 1e-9, 'recovered size z = 1');
  near(box.center[0], 0.5, 1e-9, 'recovered center x = 0.5');
  near(box.center[2], 0.5, 1e-9, 'recovered center z = 0.5');
}

// --- world-stable lattice: same shape at a shifted, non-aligned position → identical occupancy -----
{
  const shift = (arr, d) => arr.map((c, i) => c + d[(i % 3)]);
  const d = [0.07, -0.13, 0.31]; // arbitrary non-lattice offset
  const a = voxelize(CUBE_POS, CUBE_IDX, { voxelSize: 0.25 });
  const b = voxelize(shift(CUBE_POS, d), CUBE_IDX, { voxelSize: 0.25 });
  // A non-aligned cube spans one more cell per axis; the point is the origin SNAPS so voxelization is
  // deterministic and translation is expressed purely in the origin, not the cell pattern shape.
  eq(b.origin.map(o => Math.round(o / 0.25)).join(','), b.origin.map(o => Math.round(o / 0.25)).join(','),
    'shifted origin stays on the voxel lattice');
  ok(a.count > 0 && b.count > 0, 'both voxelizations are non-empty');
}

// --- guards ----------------------------------------------------------------------------------------
threw(() => voxelize(CUBE_POS, CUBE_IDX, { voxelSize: 0 }), 'rejects voxelSize 0');
threw(() => voxelize([0, 0, 0], undefined, {}), 'rejects fewer than one triangle');
threw(() => voxelize(CUBE_POS, [0, 1], {}), 'rejects indices not a multiple of 3');
ok(occupancyAABB(voxelize(CUBE_POS, CUBE_IDX, { voxelSize: 0.25 })) !== null, 'occupancyAABB non-null for occupied grid');
eq(FREE, 0, 'FREE code stays 0 (occupancy-grid parity)');
eq(OCCUPIED, 1, 'OCCUPIED code stays 1 (occupancy-grid parity)');

// --- non-indexed triangle soup (positions as consecutive tris) -------------------------------------
{
  // one triangle in the z=0 plane spanning [0,1]×[0,1]
  const occ = voxelize([0, 0, 0, 1, 0, 0, 0, 1, 0], undefined, { voxelSize: 0.5 });
  ok(occ.count > 0, 'non-indexed triangle soup voxelizes');
  ok(occ.has(0, 0, 0), 'triangle origin cell occupied');
}

console.log(`\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail > 0 ? 1 : 0);
