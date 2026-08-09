#!/usr/bin/env node
// end-cap.test.mjs — pure-Node test for parts/end-cap.mjs. Imports ONLY the pure export
// (annularCapData) — no three. Run: node library/parts/end-cap.test.mjs   (exit 0 = all green)
import { annularCapData } from './end-cap.mjs';

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.error(`  FAIL: ${name}`); } }
function approx(a, b, tol = 1e-9) { return Math.abs(a - b) <= tol; }
function threw(fn) { try { fn(); return false; } catch { return true; } }

// Sum the AREA of every index triangle from flat position + index arrays (0.5 * |edge1 × edge2|).
function triangleAreaSum(positions, index) {
  let area = 0;
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i], b = index[i + 1], c = index[i + 2];
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
    const cx = positions[c * 3], cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    area += 0.5 * Math.hypot(nx, ny, nz);
  }
  return area;
}

// ---- vertex/index counts ---------------------------------------------------------------------
// annulus (inner>0) has 2*segments verts and 6*segments index.
{
  const segments = 24;
  const d = annularCapData({ innerRadius: 0.4, outerRadius: 1, segments });
  ok(d.positions.length === 2 * segments * 3, 'annulus positions === 2*segments*3');
  ok(d.index.length === 6 * segments, 'annulus index === 6*segments (2 tris per segment)');
}

// disk (inner 0) has (segments+1) verts and 3*segments index.
{
  const segments = 24;
  const d = annularCapData({ innerRadius: 0, outerRadius: 1, segments });
  ok(d.positions.length === (segments + 1) * 3, 'disk positions === (segments+1)*3 (center + rim)');
  ok(d.index.length === 3 * segments, 'disk index === 3*segments (fan)');
}

// ---- the strong geometric assertion: triangle-area SUM ~= analytic annulus area --------------
// DISK triangle-area sum ~= π·rOuter² within 1% (segments 64).
{
  const rOuter = 1.3;
  const d = annularCapData({ innerRadius: 0, outerRadius: rOuter, segments: 64 });
  const analytic = Math.PI * (rOuter ** 2 - 0 ** 2);
  ok(approx(d.area, analytic, 1e-9), 'disk reported area === analytic');
  const sum = triangleAreaSum(d.positions, d.index);
  ok(Math.abs(sum - analytic) / analytic < 0.01, `disk tri-area sum ${sum} within 1% of ${analytic}`);
}

// ANNULUS triangle-area sum ~= π(rOuter²−rInner²) within 1% (segments 64).
{
  const rInner = 0.5, rOuter = 1.3;
  const d = annularCapData({ innerRadius: rInner, outerRadius: rOuter, segments: 64 });
  const analytic = Math.PI * (rOuter ** 2 - rInner ** 2);
  ok(approx(d.area, analytic, 1e-9), 'annulus reported area === analytic');
  const sum = triangleAreaSum(d.positions, d.index);
  ok(Math.abs(sum - analytic) / analytic < 0.01, `annulus tri-area sum ${sum} within 1% of ${analytic}`);
}

// ---- guards ----------------------------------------------------------------------------------
// innerRadius >= outerRadius throws (degenerate annulus).
ok(threw(() => annularCapData({ innerRadius: 1, outerRadius: 1, segments: 24 })), 'annularCapData equal radii throws');
ok(threw(() => annularCapData({ innerRadius: 1.2, outerRadius: 1, segments: 24 })), 'annularCapData inverted radii throws');

// ---- rim vertices lie at z===0 and the correct radius ----------------------------------------
// all rim vertices are on z=0 at the inner or outer radius.
{
  const rInner = 0.5, rOuter = 1.3, tol = 1e-9;
  const d = annularCapData({ innerRadius: rInner, outerRadius: rOuter, segments: 32 });
  let allZ = true, allR = true;
  for (let i = 0; i < d.positions.length; i += 3) {
    const x = d.positions[i], y = d.positions[i + 1], z = d.positions[i + 2];
    if (!approx(z, 0)) allZ = false;
    const r = Math.hypot(x, y);
    if (!(approx(r, rInner, tol) || approx(r, rOuter, tol))) allR = false;
  }
  ok(allZ, 'annulus: all vertices on z=0');
  ok(allR, 'annulus: every vertex radius is inner or outer');
}

// disk vertices — center at radius 0, rim at the outer radius, all z=0.
{
  const rOuter = 1.1, tol = 1e-9;
  const d = annularCapData({ innerRadius: 0, outerRadius: rOuter, segments: 32 });
  // vertex 0 is the fan center.
  ok(approx(Math.hypot(d.positions[0], d.positions[1]), 0), 'disk center at radius 0');
  let allZ = true;
  for (let i = 0; i < d.positions.length; i += 3) {
    if (!approx(d.positions[i + 2], 0)) allZ = false;
  }
  ok(allZ, 'disk: all vertices on z=0');
  let allRim = true;
  for (let i = 3; i < d.positions.length; i += 3) {
    const r = Math.hypot(d.positions[i], d.positions[i + 1]);
    if (!approx(r, rOuter, tol)) allRim = false;
  }
  ok(allRim, 'disk: every rim vertex at outer radius');
}

// ---- report ----------------------------------------------------------------------------------
console.log(`\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail > 0 ? 1 : 0);
