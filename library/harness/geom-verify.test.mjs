#!/usr/bin/env node
// geom-verify.test.mjs — pure-Node self-test of the geom-verify MATH CORE. Imports ONLY the
// synchronous core (no three, no async wrappers) — this is exactly why the core imports nothing.
// Usage: node geom-verify.test.mjs   ·   exit 0 = all pass · exit 1 = any fail.
import {
  projectCornersNDC,
  framingMetrics,
  aabbIoU,
  aabbContains,
  verticalGap,
  edgeManifold,
  signedVolume,
  meshIntegrity,
  assertPositive,
  gap3D,
} from './geom-verify.mjs';

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; } else { fail++; console.error(`  FAIL: ${name}`); }
}
function approx(a, b, tol = 1e-6) { return Math.abs(a - b) <= tol; }
function threw(fn) { try { fn(); return false; } catch { return true; } }

// ---- fixtures --------------------------------------------------------------------------------
// Column-major identity Matrix4 (e[0],e[5],e[10],e[15] = 1). With identity, wc=1 and ndc=(x,y).
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
// Identity but e[11] = -2 (row3,col2): wc = -2*z + 1, so any corner with z=1 -> wc=-1 (behind).
const BEHIND = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -2, 0, 0, 0, 1];

// All 8 corners in front, within [-0.5,0.5]: identity -> ndc in [-0.5,0.5], w=1 > 0.
const cornersFront = [
  { x: -0.5, y: -0.5, z: -0.5 }, { x: 0.5, y: -0.5, z: -0.5 },
  { x: -0.5, y: 0.5, z: -0.5 }, { x: 0.5, y: 0.5, z: -0.5 },
  { x: -0.5, y: -0.5, z: 0.5 }, { x: 0.5, y: -0.5, z: 0.5 },
  { x: -0.5, y: 0.5, z: 0.5 }, { x: 0.5, y: 0.5, z: 0.5 },
];
// One corner at z=1 -> under BEHIND matrix that corner has wc=-1 (<=0) -> must trip the guard.
const cornersStraddle = [
  { x: -0.5, y: -0.5, z: 0 }, { x: 0.5, y: -0.5, z: 0 },
  { x: -0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 },
  { x: -0.5, y: -0.5, z: 1 }, { x: 0.5, y: -0.5, z: 1 },
  { x: -0.5, y: 0.5, z: 1 }, { x: 0.5, y: 0.5, z: 1 },
];

// ---- projectCornersNDC -----------------------------------------------------------------------
const front = projectCornersNDC(IDENTITY, cornersFront);
ok(front.anyBehind === false, 'projectCornersNDC front: anyBehind false');
ok(front.ndcMin && approx(front.ndcMin.x, -0.5) && approx(front.ndcMin.y, -0.5), 'projectCornersNDC front: ndcMin');
ok(front.ndcMax && approx(front.ndcMax.x, 0.5) && approx(front.ndcMax.y, 0.5), 'projectCornersNDC front: ndcMax within [-1,1]');

const straddle = projectCornersNDC(BEHIND, cornersStraddle);
ok(straddle.anyBehind === true, 'projectCornersNDC straddle: anyBehind true (w<=0 guard)');
ok(straddle.ndcMin === null && straddle.ndcMax === null, 'projectCornersNDC straddle: no ndc bounds');

// ---- framingMetrics --------------------------------------------------------------------------
// ±0.6 box -> occupancy 0.6*0.6 = 0.36 (in [occMin 0.25, occMax 0.85]) and centered.
// A ±0.4 box is only 0.16 occupancy (< occMin) — correctly NOT well framed, so the fixture is ±0.6.
const fmGood = framingMetrics({ x: -0.6, y: -0.6 }, { x: 0.6, y: 0.6 });
ok(fmGood.wellFramed === true, 'framingMetrics centered box: wellFramed true');
ok(fmGood.centered === true && fmGood.fullyVisible === true, 'framingMetrics centered box: centered + fullyVisible');

const fmTiny = framingMetrics({ x: 0.9, y: 0.9 }, { x: 0.95, y: 0.95 });
ok(fmTiny.occupancy < 0.25, 'framingMetrics tiny box: occupancy < occMin');
ok(fmTiny.wellFramed === false, 'framingMetrics tiny box: wellFramed false');

const fmOff = framingMetrics({ x: 1.2, y: -0.4 }, { x: 1.6, y: 0.4 });
ok(fmOff.fullyVisible === false, 'framingMetrics off-frame box: fullyVisible false');

// Wide/thin subject (an equipment row / long pipe run): fills the WIDTH but has low AREA. It fills
// one axis (maxAxisFill >= spanMin 0.6) so it reads wellFramed despite occupancy < occMin — the
// wide-subject fix. A TINY box (low on BOTH axes) must STILL fail, i.e. the criterion did not weaken.
const fmWide = framingMetrics({ x: -0.75, y: -0.12 }, { x: 0.75, y: 0.12 });
ok(fmWide.occupancy < 0.25, 'framingMetrics wide row: occupancy below occMin (thin strip)');
ok(fmWide.maxAxisFill >= 0.6, 'framingMetrics wide row: fills one axis (maxAxisFill >= spanMin)');
ok(fmWide.wellFramed === true, 'framingMetrics wide row: wellFramed via the one-axis span criterion');
ok(fmTiny.maxAxisFill < 0.6 && fmTiny.wellFramed === false, 'framingMetrics tiny box still fails (low on BOTH axes)');

// ---- aabbIoU ---------------------------------------------------------------------------------
const unit = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };
ok(approx(aabbIoU(unit, unit), 1), 'aabbIoU identical ~= 1');
const far = { min: { x: 5, y: 5, z: 5 }, max: { x: 6, y: 6, z: 6 } };
ok(aabbIoU(unit, far) === 0, 'aabbIoU disjoint == 0');
const nearTwin = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1.02 } };
ok(aabbIoU(unit, nearTwin) > 0.85, 'aabbIoU near-twin > 0.85');

// ---- aabbContains ----------------------------------------------------------------------------
const inner = { min: { x: 0.2, y: 0.2, z: 0.2 }, max: { x: 0.8, y: 0.8, z: 0.8 } };
ok(aabbContains(unit, inner) === true, 'aabbContains inner inside outer: true');
const overlap = { min: { x: 0.5, y: 0.5, z: 0.5 }, max: { x: 1.5, y: 1.5, z: 1.5 } };
ok(aabbContains(unit, overlap) === false, 'aabbContains overlapping-not-contained: false');

// ---- verticalGap -----------------------------------------------------------------------------
const gap = verticalGap({ min: { y: 0 }, max: { y: 1 } }, { min: { y: 2 }, max: { y: 3 } });
ok(approx(gap.gap, 1) && gap.hasGap === true, 'verticalGap gap present: hasGap true');
const touch = verticalGap({ min: { y: 0 }, max: { y: 1 } }, { min: { y: 1 }, max: { y: 2 } });
ok(touch.gap === 0 && touch.hasGap === false, 'verticalGap touching: hasGap false');

// ---- edgeManifold ----------------------------------------------------------------------------
// Closed tetrahedron: 4 verts, 4 triangles; every undirected edge shared by exactly 2 faces.
const tetra = [0, 1, 2, 0, 3, 1, 0, 2, 3, 1, 3, 2];
const tm = edgeManifold(tetra);
ok(tm.closed === true, 'edgeManifold tetra: closed true');
ok(tm.openEdges === 0 && tm.nonManifoldEdges === 0, 'edgeManifold tetra: no open/non-manifold edges');
const openTri = edgeManifold([0, 1, 2]);
ok(openTri.closed === false && openTri.openEdges === 3, 'edgeManifold single triangle: 3 open edges');

// ---- assertPositive --------------------------------------------------------------------------
ok(threw(() => assertPositive(-0.5, 'neg')), 'assertPositive negative throws');
ok(threw(() => assertPositive(0.0005, 'below-margin')), 'assertPositive 0.0005 (< default margin) throws');
ok(assertPositive(5, 'ok') === 5, 'assertPositive 5 returns 5');

// ---- signedVolume / meshIntegrity ------------------------------------------------------------
// Tetra p0=(0,0,0) p1=(1,0,0) p2=(0,1,0) p3=(0,0,1). Faces touching p0 contribute 0 (origin), so
// only the far face (1,2,3) sets the sign: wound CCW-outward -> V=+1/6, reversed -> -1/6.
const tetraPos = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
const tetraOut = [0, 2, 1, 0, 3, 2, 0, 1, 3, 1, 2, 3];   // outward -> +1/6
const tetraIn = [0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2];    // reversed -> -1/6
ok(approx(signedVolume(tetraPos, tetraOut), 1 / 6), 'signedVolume outward tetra = +1/6');
ok(approx(signedVolume(tetraPos, tetraIn), -1 / 6), 'signedVolume reversed tetra = -1/6');
ok(approx(signedVolume(tetraPos, tetraIn), -signedVolume(tetraPos, tetraOut)), 'signedVolume flips sign with winding');
const tetraPos2 = [0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2];
ok(approx(signedVolume(tetraPos2, tetraOut), 8 / 6), 'signedVolume scales x8 when positions x2');
const soup = [];
for (const i of tetraOut) { soup.push(tetraPos[i * 3], tetraPos[i * 3 + 1], tetraPos[i * 3 + 2]); }
ok(approx(signedVolume(soup, null), 1 / 6), 'signedVolume non-indexed soup matches indexed');

const miOut = meshIntegrity(tetraPos, tetraOut);
ok(miOut.closed === true && miOut.watertight === true, 'meshIntegrity outward tetra: closed + watertight');
ok(miOut.insideOut === false, 'meshIntegrity outward tetra: not inside-out');
const miIn = meshIntegrity(tetraPos, tetraIn);
ok(miIn.closed === true && miIn.insideOut === true, 'meshIntegrity reversed tetra: inside-out true');

// ---- review-gap coverage: degenerate IoU union + non-manifold edges --------------------------
const pointBox = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
ok(aabbIoU(pointBox, pointBox) === 0, 'aabbIoU degenerate (union<=0 branch) returns 0');
// three triangles all sharing edge (0,1): that edge has valence 3 (non-manifold), the rest are open.
const nonManifold = edgeManifold([0, 1, 2, 0, 1, 3, 0, 1, 4]);
ok(nonManifold.nonManifoldEdges === 1 && nonManifold.openEdges === 6, 'edgeManifold: 1 non-manifold edge + 6 open');
ok(nonManifold.closed === false, 'edgeManifold non-manifold fan: not closed');

// ---- gap3D (NEW) -----------------------------------------------------------------------------
// 3D separation between two AABBs: per-axis clamped separation, Euclidean gap, touching/overlapping.
// z-only separation of 0.11 while x,y overlap (the filtrado case).
{
  // a occupies z in [-1,0], b occupies z in [0.11,1]; x,y fully overlap -> sep only on z.
  const a = { min: { x: 0, y: 0, z: -1 }, max: { x: 1, y: 1, z: 0 } };
  const b = { min: { x: 0, y: 0, z: 0.11 }, max: { x: 1, y: 1, z: 1 } };
  const r = gap3D(a, b);
  ok(approx(r.sep.x, 0) && approx(r.sep.y, 0), 'gap3D filtrado: x,y overlap -> sep 0');
  ok(approx(r.sep.z, 0.11), 'gap3D filtrado: sep.z ~= 0.11');
  ok(approx(r.gap, 0.11), 'gap3D filtrado: gap ~= 0.11');
  ok(r.touching === false, 'gap3D filtrado: gap > eps -> not touching');
  ok(r.overlapping === false, 'gap3D filtrado: separated on z -> not overlapping');
}

// DIAGONAL separation (0.3 on x AND 0.4 on y) gives gap === 0.5 exactly (3-4-5).
{
  // sep values come from subtractions against 0 so they are exactly 0.3 and 0.4 (no float drift).
  const a = { min: { x: -1, y: -1, z: 0 }, max: { x: 0, y: 0, z: 1 } };
  const b = { min: { x: 0.3, y: 0.4, z: 0 }, max: { x: 1, y: 1, z: 1 } };
  const r = gap3D(a, b);
  ok(r.sep.x === 0.3, 'gap3D diagonal: sep.x exactly 0.3');
  ok(r.sep.y === 0.4, 'gap3D diagonal: sep.y exactly 0.4');
  ok(r.sep.z === 0, 'gap3D diagonal: z overlaps -> sep 0');
  ok(r.gap === 0.5, 'gap3D diagonal: gap === 0.5 exactly — NOT axis-limited (combines x AND y)');
  ok(r.overlapping === false, 'gap3D diagonal: diagonally separated -> not overlapping');
}

// Fully overlapping boxes -> gap 0 and overlapping true.
{
  const a = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };
  const b = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };
  const r = gap3D(a, b);
  ok(r.gap === 0, 'gap3D full-overlap: gap 0');
  ok(r.overlapping === true, 'gap3D full-overlap: interior overlap on all axes -> overlapping true');
  ok(r.touching === true, 'gap3D full-overlap: gap 0 <= eps -> touching true');
}

// Exactly face-touching -> gap 0, touching true, overlapping false.
{
  // Share the x=1 face; y,z overlap. Separation is exactly 0 on x but NOT an interior overlap.
  const a = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };
  const b = { min: { x: 1, y: 0, z: 0 }, max: { x: 2, y: 1, z: 1 } };
  const r = gap3D(a, b);
  ok(r.gap === 0, 'gap3D face-touch: gap 0');
  ok(r.touching === true, 'gap3D face-touch: gap 0 <= eps -> touching');
  ok(r.overlapping === false, 'gap3D face-touch: contact only (no interior overlap on x) -> overlapping false');
}

// eps boundary — a gap just under eps touches; just over does not.
{
  const a = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 0 } };
  const under = { min: { x: 0, y: 0, z: 5e-5 }, max: { x: 1, y: 1, z: 1 } }; // sep.z 5e-5 < 1e-4
  const over = { min: { x: 0, y: 0, z: 2e-4 }, max: { x: 1, y: 1, z: 1 } };  // sep.z 2e-4 > 1e-4
  ok(gap3D(a, under).touching === true, 'gap3D eps boundary: gap < eps -> touching');
  ok(gap3D(a, over).touching === false, 'gap3D eps boundary: gap > eps -> not touching');
}

// ---- report ----------------------------------------------------------------------------------
console.log(`\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail > 0 ? 1 : 0);
