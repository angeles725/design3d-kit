// Pure-Node test for parts/rect-duct.mjs — imports only the pure core (no three).
// Run: node library/parts/rect-duct.test.mjs   (exit 0 = all green)
import { rectDuctGeometryFromFrames } from './rect-duct.mjs';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('FAIL: ' + msg); } }
function eq(a, b, msg) { ok(a === b, `${msg} (got ${a}, want ${b})`); }
function near(a, b, eps, msg) { ok(Math.abs(a - b) <= eps, `${msg} (got ${a}, want ~${b} ±${eps})`); }
function threw(fn, msg) { let t = false; try { fn(); } catch { t = true; } ok(t, msg); }

const EPS = 1e-12;
// axis-aligned frames: r=+X (width), s=+Y (height), t=+Z (travel)
const RX = { x: 1, y: 0, z: 0 }, SY = { x: 0, y: 1, z: 0 }, TZ = { x: 0, y: 0, z: 1 };
const frame = { r: RX, s: SY, t: TZ };

// --- geometry correctness: a straight duct along +Z -----------------------------------------------
{
  const pts = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }];
  const frames = [frame, frame];
  const W = 0.4, H = 0.3, hw = 0.2, hh = 0.15;
  const g = rectDuctGeometryFromFrames(pts, frames, W, H);
  eq(g.positions.length, 8 * 3, 'straight duct: 4 verts/ring × 2 rings = 24 position values');
  // ring0 corner0 (+w/2,+h/2,0)
  near(g.positions[0], hw, EPS, 'corner0 x = +w/2');
  near(g.positions[1], hh, EPS, 'corner0 y = +h/2');
  near(g.positions[2], 0, EPS, 'corner0 z = ring z');
  // ring0 corner2 (-w/2,-h/2,0) — index 2*3=6
  near(g.positions[6], -hw, EPS, 'corner2 x = -w/2');
  near(g.positions[7], -hh, EPS, 'corner2 y = -h/2');
  // ring1 corner0 at z=1 — index 4*3=12
  near(g.positions[12], hw, EPS, 'ring1 corner0 x = +w/2');
  near(g.positions[14], 1, EPS, 'ring1 corner0 z = 1');
  // indices: 1 segment × 4 walls × 2 tris × 3 = 24 (no caps)
  eq(g.indices.length, 24, 'open straight duct: 24 indices (4 walls × 2 tris)');
  // every index in range
  ok(g.indices.every(i => i >= 0 && i < 8), 'all indices reference existing verts');
}

// --- capEnds adds a flat cap (2 tris) at each end -------------------------------------------------
{
  const pts = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }];
  const g = rectDuctGeometryFromFrames(pts, [frame, frame], 0.4, 0.3, true);
  eq(g.indices.length, 24 + 12, 'capped duct: 24 wall + 12 cap indices (2 tris × 2 ends × 3)');
}

// --- width along r, height along s (independent axes) ---------------------------------------------
{
  // width 1.0 along r=+X, height 0.2 along s=+Y → corner0 at (0.5, 0.1)
  const g = rectDuctGeometryFromFrames([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }], [frame, frame], 1.0, 0.2);
  near(g.positions[0], 0.5, EPS, 'wide/short duct: corner0 x = width/2');
  near(g.positions[1], 0.1, EPS, 'wide/short duct: corner0 y = height/2');
}

// --- TWIST-FREE property: identical frames → identical cross-section shape at both rings -----------
{
  // Two rings with the SAME frame: the rect corners must be identical in the (r,s) plane (only the
  // centerline point differs). This is the guarantee that makes rect-duct correct — RMF hands identical
  // frames along a straight run, so the box never rotates about its travel axis.
  const p0 = { x: 2, y: 3, z: 0 }, p1 = { x: 2, y: 3, z: 5 };
  const g = rectDuctGeometryFromFrames([p0, p1], [frame, frame], 0.6, 0.6);
  for (let k = 0; k < 4; k++) {
    const a = k * 3, b = (4 + k) * 3;
    near(g.positions[a] - p0.x, g.positions[b] - p1.x, EPS, `twist-free: corner${k} x-offset equal across rings`);
    near(g.positions[a + 1] - p0.y, g.positions[b + 1] - p1.y, EPS, `twist-free: corner${k} y-offset equal across rings`);
  }
}

// --- guards --------------------------------------------------------------------------------------
threw(() => rectDuctGeometryFromFrames([{ x: 0, y: 0, z: 0 }], [frame], 0, 0.3), 'rejects width 0');
threw(() => rectDuctGeometryFromFrames([{ x: 0, y: 0, z: 0 }], [frame], 0.4, -1), 'rejects negative height');

console.log(`\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail > 0 ? 1 : 0);
