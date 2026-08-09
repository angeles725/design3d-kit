#!/usr/bin/env node
// flange.test.mjs — pure-Node test for parts/flange.mjs. Imports ONLY the pure export
// (collarProfile) — no three. Run: node library/parts/flange.test.mjs   (exit 0 = all green)
import { collarProfile } from './flange.mjs';

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.error(`  FAIL: ${name}`); } }
function approx(a, b, tol = 1e-9) { return Math.abs(a - b) <= tol; }
function threw(fn) { try { fn(); return false; } catch { return true; } }

// ---- shape of the profile --------------------------------------------------------------------
// returns the 4 rectangular-ring corners in order.
{
  const innerRadius = 0.4, outerRadius = 0.6, height = 0.05;
  const p = collarProfile({ innerRadius, outerRadius, height });
  ok(p.length === 4, 'exactly 4 profile corners');
  ok(approx(p[0].x, innerRadius) && approx(p[0].y, 0), 'corner 0 = (innerRadius, 0)');
  ok(approx(p[1].x, outerRadius) && approx(p[1].y, 0), 'corner 1 = (outerRadius, 0)');
  ok(approx(p[2].x, outerRadius) && approx(p[2].y, height), 'corner 2 = (outerRadius, height)');
  ok(approx(p[3].x, innerRadius) && approx(p[3].y, height), 'corner 3 = (innerRadius, height)');
}

// y runs monotonically 0 -> height; every x within [innerRadius, outerRadius].
{
  const innerRadius = 0.4, outerRadius = 0.6, height = 0.05;
  const p = collarProfile({ innerRadius, outerRadius, height });
  let mono = p[0].y === 0 && p[p.length - 1].y === height;
  for (let i = 1; i < p.length; i++) {
    if (!(p[i].y >= p[i - 1].y - 1e-12)) mono = false;
  }
  ok(mono, 'collarProfile: y monotonic 0 -> height (starts 0, ends height, non-decreasing)');
  let inRange = true;
  for (const q of p) {
    if (!(q.x >= innerRadius - 1e-12 && q.x <= outerRadius + 1e-12)) inRange = false;
  }
  ok(inRange, 'collarProfile: every x within [innerRadius, outerRadius]');
}

// ---- guards ----------------------------------------------------------------------------------
// assertPositive fires on outerRadius <= innerRadius.
ok(
  threw(() => collarProfile({ innerRadius: 0.6, outerRadius: 0.6, height: 0.05 })) &&
  threw(() => collarProfile({ innerRadius: 0.7, outerRadius: 0.6, height: 0.05 })),
  'collarProfile: assertPositive fires on outerRadius <= innerRadius (equal + inverted)',
);

// assertPositive fires on height <= 0.
ok(
  threw(() => collarProfile({ innerRadius: 0.4, outerRadius: 0.6, height: 0 })) &&
  threw(() => collarProfile({ innerRadius: 0.4, outerRadius: 0.6, height: -0.05 })),
  'collarProfile: assertPositive fires on height <= 0 (zero + negative)',
);

// ---- band-area sanity check ------------------------------------------------------------------
// annular band area from the profile x-extents = π(outerR²−innerR²).
{
  const innerRadius = 0.4, outerRadius = 0.6, height = 0.05;
  const p = collarProfile({ innerRadius, outerRadius, height });
  const xInner = Math.min(...p.map((q) => q.x));
  const xOuter = Math.max(...p.map((q) => q.x));
  const bandArea = Math.PI * (xOuter ** 2 - xInner ** 2);
  const analytic = Math.PI * (outerRadius ** 2 - innerRadius ** 2);
  ok(approx(bandArea, analytic), 'collarProfile: band area matches π(outerR²−innerR²)');
}

// ---- report ----------------------------------------------------------------------------------
console.log(`\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail > 0 ? 1 : 0);
