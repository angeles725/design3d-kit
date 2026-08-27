// Pure-Node test for voxelizePolyline (parts/voxelize.mjs) — CAD centerline → voxel occupancy.
// Run: node library/parts/voxelize-polyline.test.mjs   (exit 0 = all green)
import { voxelizePolyline } from './voxelize.mjs';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('FAIL: ' + msg); } }
function eq(a, b, msg) { ok(a === b, `${msg} (got ${a}, want ${b})`); }
function threw(fn, msg) { let t = false; try { fn(); } catch { t = true; } ok(t, msg); }

// --- straight axis-aligned run along +X: 0..1 at h=0.25 → 4 collinear cells --------------------------
{
  const occ = voxelizePolyline([0, 0, 0, 1, 0, 0], [0, 1], { voxelSize: 0.25 });
  eq(occ.count, 4, 'straight +X run fills 4 collinear cells');
  ok(occ.has(0, 0, 0) && occ.has(3, 0, 0), 'endpoints of the run occupied');
  ok(!occ.has(0, 1, 0), 'no off-axis spill (1-cell centerline, not a thickened tube)');
}

// --- L-path (two axis-aligned segments) → the corner cell shared, NO diagonal staircase --------------
{
  // +X from (0,0,0)->(1,0,0) then +Y (1,0,0)->(1,1,0)
  const occ = voxelizePolyline([0, 0, 0, 1, 0, 0, 1, 1, 0], [0, 1, 1, 2], { voxelSize: 0.25 });
  ok(occ.has(3, 0, 0), 'corner cell occupied (end of X leg = start of Y leg)');
  ok(occ.has(3, 3, 0), 'end of Y leg occupied');
  ok(!occ.has(1, 1, 0) && !occ.has(2, 2, 0), 'NO diagonal cells — the L is faithful, no spurious elbow fill');
}

// --- FINDING 1: a diagonal segment is REJECTED by default (Route-1 axis-aligned contract) ------------
threw(() => voxelizePolyline([0, 0, 0, 1, 1, 0], [0, 1], { voxelSize: 0.25 }),
  'diagonal segment throws by default (onDiagonal:reject)');

// --- FINDING 1 escape hatch: {onDiagonal:'snap'} projects onto the dominant axis, no staircase --------
{
  // diagonal (0,0,0)->(1,0.5,0): dominant axis X (Δ=4 cells) vs Y (Δ=2) → snap to a pure +X run
  const occ = voxelizePolyline([0, 0, 0, 1, 0.5, 0], [0, 1], { voxelSize: 0.25, onDiagonal: 'snap' });
  ok(occ.has(0, 0, 0) && occ.has(3, 0, 0), 'snapped run lies on the dominant (X) axis');
  let offAxis = 0; for (let y = 1; y < occ.dims[1]; y++) for (let x = 0; x < occ.dims[0]; x++) if (occ.has(x, y, 0)) offAxis++;
  eq(offAxis, 0, 'snap collapses the minor axis — no staircase cells');
}

// --- section tagging: each occupied cell carries its DN ----------------------------------------------
{
  const occ = voxelizePolyline([0, 0, 0, 1, 0, 0], [0, 1], { voxelSize: 0.25, sections: [0.2] });
  eq(occ.sectionAt(1, 0, 0), 0.2, 'run cell tagged with its DN (0.2)');
  eq(occ.sectionAt(9, 9, 9), null, 'sectionAt out-of-bounds → null');
}

// --- FINDING 3: mixed-DN junction cell keeps the CANONICAL (MAX) section + surfaces a conflict --------
{
  // two runs sharing the corner cell (3,0,0): DN 0.2 (X leg) meets DN 0.3 (Y leg) at the tee
  const occ = voxelizePolyline(
    [0, 0, 0, 1, 0, 0, 1, 1, 0], [0, 1, 1, 2], { voxelSize: 0.25, sections: [0.2, 0.3] });
  eq(occ.sectionAt(3, 0, 0), 0.3, 'shared junction cell keeps the MAX section (reducing-tee rule)');
  ok(occ.conflicts.length === 1 && occ.conflicts[0].kept === 0.3 && occ.conflicts[0].dropped === 0.2,
    'the DN disagreement is surfaced in conflicts[] (kept 0.3, dropped 0.2)');
}

// --- rect section ranked by max(width,height) --------------------------------------------------------
{
  const occ = voxelizePolyline(
    [0, 0, 0, 1, 0, 0, 1, 1, 0], [0, 1, 1, 2],
    { voxelSize: 0.25, sections: [{ width: 0.4, height: 0.2 }, { width: 0.5, height: 0.5 }] });
  const kept = occ.sectionAt(3, 0, 0);
  ok(kept.width === 0.5 && kept.height === 0.5, 'rect junction keeps the larger section (max dim 0.5 > 0.4)');
}

// --- guards ------------------------------------------------------------------------------------------
threw(() => voxelizePolyline([0, 0, 0, 1, 0, 0], [0], { voxelSize: 0.25 }), 'rejects odd-length indices (not segment pairs)');
threw(() => voxelizePolyline([0, 0, 0, 1, 0, 0], [0, 1], { voxelSize: 0 }), 'rejects voxelSize 0');

console.log(`\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail > 0 ? 1 : 0);
