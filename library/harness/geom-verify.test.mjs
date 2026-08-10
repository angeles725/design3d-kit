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
  coplanarPairs,
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

// ---- coplanarPairs (NEW) ---------------------------------------------------------------------
// Z-fighting leads: two SAME-FACING faces at the same level, both exposed, overlapping in area.
// Every discriminator below exists because the naive version (any face within eps of any other)
// reported 550 pairs on the nave-panccadia viewer where 73 were plausible and ONE was real.
{
  const item = (name, x0, y0, z0, x1, y1, z1) => ({
    name, box: { min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } },
  });

  // Two 2 m slabs of equal height, offset 0.5 m in plan, whose TOPS both sit at y=1. Only the Y
  // faces coincide (x and z are 0.5 m apart), so the axis in the finding is the one under test.
  {
    const r = coplanarPairs([
      item('floorA', 0, 0, 0, 2, 1, 2),
      item('floorB', 0.5, 0, 0.5, 2.5, 1, 2.5),
    ]);
    ok(r.pairs.length === 1, 'coplanarPairs same-level tops: 1 pair');
    ok(r.pairs[0].axis === 'y', 'coplanarPairs same-level tops: axis y');
    ok(r.pairs[0].face === 'max', 'coplanarPairs same-level tops: face max');
    ok(r.pairs[0].sep_mm === 0, 'coplanarPairs same-level tops: sep_mm 0');
    ok(approx(r.pairs[0].at, 1), 'coplanarPairs same-level tops: reports the level (y=1)');
    ok(approx(r.pairs[0].overlap_m2, 2.25), 'coplanarPairs same-level tops: 1.5 x 1.5 m shared');
    ok(r.count === 1 && r.boxes === 2, 'coplanarPairs same-level tops: count + boxes reported');
  }

  // A MAX meeting a MIN is back-to-back contact — a slab resting on another. It shares a plane but
  // the two faces point AWAY from each other, so nothing can shimmer. Counting these is what took
  // the real scene from 8 pairs to 550, so it must report NOTHING.
  {
    const r = coplanarPairs([
      item('slab', 0, 0, 0, 1, 1, 1),
      item('slabOnTop', 0, 1, 0, 1, 2, 1),
    ]);
    ok(r.pairs.length === 0, 'coplanarPairs back-to-back (max meets min): no pair');
  }

  // NESTED SPANS are dropped: one box's extent on the axis lies wholly inside the other's and the
  // spans differ, so the inner face is treated as buried. This is a noise filter, and it is the
  // check's ONE known false negative — a short box sharing a face with a tall one is silenced even
  // though that face is genuinely exposed. The test freezes the LIMIT, not a correctness claim;
  // bounding boxes cannot tell the two apart, so the fix is to eyeball nested pairs by hand.
  {
    const r = coplanarPairs([
      item('shell', 0, 0, 0, 4, 4, 4),
      item('nested', 1, 1, 1, 2, 4, 2),
    ]);
    ok(r.pairs.length === 0, 'coplanarPairs nested spans: dropped (documented false negative)');
  }

  // Two IDENTICAL boxes contain each other, but their spans match — that is a genuine duplicate
  // surface, the worst z-fight there is, and the containment filter must NOT swallow it.
  {
    const r = coplanarPairs([
      item('dupA', 0, 0, 0, 1, 1, 1),
      item('dupB', 0, 0, 0, 1, 1, 1),
    ]);
    ok(r.pairs.length === 1, 'coplanarPairs identical boxes: still reported (equal spans, not buried)');
  }

  // Faces at the same level but barely overlapping in plan (2 cm strip): too little shared area to
  // read as a fight. Equal spans, so the nested filter is not what rejects it.
  {
    const r = coplanarPairs([
      item('wideA', 0, 0, 0, 1, 1, 1),
      item('slimB', 0.98, 0, 0, 3, 1, 1),
    ]);
    ok(r.pairs.length === 0, 'coplanarPairs 2 cm plan overlap: below minOverlapSpan, no pair');
  }

  // eps boundary: 1 mm apart is a fight at the 1.5 mm default; 2 mm apart is separated geometry,
  // which is exactly the fix the rule prescribes (pull the layers 1-2 mm apart).
  {
    const near = coplanarPairs([
      item('a', 0, 0, 0, 2, 1, 2),
      item('b', 0.5, -0.001, 0.5, 2.5, 0.999, 2.5),
    ]);
    ok(near.pairs.length === 1, 'coplanarPairs 1 mm apart: still a lead at default eps 1.5 mm');
    ok(near.pairs[0].sep_mm === 1, 'coplanarPairs 1 mm apart: sep_mm reported as 1');
    const far2 = coplanarPairs([
      item('a', 0, 0, 0, 2, 1, 2),
      item('b', 0.5, -0.002, 0.5, 2.5, 0.998, 2.5),
    ]);
    ok(far2.pairs.length === 0, 'coplanarPairs 2 mm apart: separated, no lead');
  }

  // A ZERO-THICKNESS sheet (a ground plane, a decal) has min === max on its axis, so it coincides
  // with BOTH faces of whatever touches it and the same-facing rule cannot separate the two cases.
  // It is REPORTED, deliberately. Found on the condensadora master: the 20 m ground plane vs the base
  // channel resting on it came out as the worst lead in the scene, 0.96 m2, and nothing was wrong.
  //
  // Silencing it was tried and REJECTED. "Sheet with the solid wholly on one side" is ambiguous by
  // construction: a floor facing +Y with a box ON it is harmless back-to-back contact, while the same
  // floor with a slab UNDER it is a true fight — and an AABB does not carry the sheet's facing, so the
  // two are indistinguishable here. Suppressing them would trade a false positive the reviewer
  // discards for a false negative that disappears. The lead stays; the reviewer resolves it with the
  // geometry, which is the only place the answer exists.
  {
    const r = coplanarPairs([
      item('ground', -10, 0, -10, 10, 0, 10),
      item('baseChannel', -0.6, 0, -0.4, 0.6, 0.075, 0.4),
    ]);
    ok(r.pairs.length === 1, 'coplanarPairs sheet under a solid: reported, resolved by the reviewer');
  }

  // Two coincident sheets are the classic decal fight and must never be silenced.
  {
    const decal = coplanarPairs([
      item('wall', -1, 0, -1, 1, 0, 1),
      item('decal', -0.5, 0, -0.5, 0.5, 0, 0.5),
    ]);
    ok(decal.pairs.length === 1, 'coplanarPairs two coincident sheets: the classic decal fight');
  }

  // A solid PIERCING a sheet is not a fight: the faces meet at a right angle, they are not coplanar.
  {
    const through = coplanarPairs([
      item('sheet', -10, 0, -10, 10, 0, 10),
      item('post', -0.2, -0.5, -0.2, 0.2, 0.5, 0.2),
    ]);
    ok(through.pairs.length === 0, 'coplanarPairs solid piercing a sheet: perpendicular, no fight');
  }

  // Worst-first ordering: the modeler fixes the biggest shared surface first.
  {
    const r = coplanarPairs([
      item('smallA', 0, 0, 0, 0.3, 1, 0.3),
      item('smallB', 0, 0.5, 0, 0.3, 1, 0.3),
      item('bigA', 10, 0, 10, 12, 1, 12),
      item('bigB', 10, 0.5, 10, 12, 1, 12),
    ]);
    ok(r.pairs.length === 2, 'coplanarPairs ordering fixture: 2 pairs');
    ok(r.pairs[0].a === 'bigA', 'coplanarPairs ordering: largest shared area first');
  }

  // A caller can widen the tolerance to sweep for near-coplanar layers.
  {
    const r = coplanarPairs([
      item('a', 0, 0, 0, 2, 1, 2),
      item('b', 0.5, -0.005, 0.5, 2.5, 0.995, 2.5),
    ], { eps: 0.006 });
    ok(r.pairs.length === 1, 'coplanarPairs eps option: 5 mm reported when eps widened to 6 mm');
  }

  // Degenerate input must not throw or invent pairs.
  {
    ok(coplanarPairs([]).pairs.length === 0, 'coplanarPairs empty input: no pairs, no throw');
    ok(coplanarPairs([item('lonely', 0, 0, 0, 1, 1, 1)]).pairs.length === 0,
      'coplanarPairs single box: no self-pair');
  }
}

// ---- report ----------------------------------------------------------------------------------
console.log(`\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail > 0 ? 1 : 0);
