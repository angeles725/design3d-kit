// Pure-Node test for parts/lathe-body.mjs — imports only the pure exports (no three).
// Run: node library/parts/lathe-body.test.mjs   (exit 0 = all green)
import { latheProfileValid, filletedCylinderProfile, domeProfile } from './lathe-body.mjs';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('FAIL: ' + msg); } }
function approx(a, b, msg, tol = 1e-9) { ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, want ${b})`); }
function throws(fn, msg) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  ok(threw, msg);
}

// --- latheProfileValid -------------------------------------------------------
ok(latheProfileValid([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 2 }, { x: 0, y: 2 }]).valid,
  'ascending valid profile -> valid');
ok(!latheProfileValid([{ x: 0, y: 0 }, { x: -1, y: 2 }]).valid, 'negative x -> invalid');
ok(!latheProfileValid([{ x: 1, y: 1 }]).valid, 'single point -> invalid');
ok(!latheProfileValid([{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }]).valid, 'all-same-y -> invalid');

// --- filletedCylinderProfile -------------------------------------------------
{
  const p = filletedCylinderProfile({ radius: 1, height: 2, fillet: 0.2, filletSegments: 4 });
  ok(p.length === 8, `filleted length === 8 (got ${p.length})`);
  approx(p[0].x, 0, 'filleted first.x == 0'); approx(p[0].y, 0, 'filleted first.y == 0');
  ok(p.every(q => q.x >= 0 && q.x <= 1), 'filleted every x in [0,1]');
  // point after the wall-top (index 3) is the first arc point: k=1, a=PI/8
  const a1 = Math.PI / 8;
  approx(p[3].x, 0.8 + 0.2 * Math.cos(a1), 'filleted arc[1].x on the arc');
  approx(p[3].y, 1.8 + 0.2 * Math.sin(a1), 'filleted arc[1].y on the arc');
  approx(p[7].x, 0, 'filleted last.x == 0'); approx(p[7].y, 2, 'filleted last.y == 2');
  // arc's final point (index 6, k=4, a=PI/2) ≈ (0.8, 2)
  approx(p[6].x, 0.8, 'filleted arc-final.x ≈ 0.8');
  approx(p[6].y, 2, 'filleted arc-final.y ≈ 2');
}
throws(() => filletedCylinderProfile({ radius: 1, height: 2, fillet: 1, filletSegments: 4 }),
  'filleted throws when fillet >= radius');

// --- domeProfile -------------------------------------------------------------
{
  const p = domeProfile({ radius: 2, height: 1, segments: 6 });
  ok(p.length === 7, `dome length === 7 (got ${p.length})`);
  approx(p[0].x, 0, 'dome first.x ≈ 0'); approx(p[0].y, 1, 'dome first.y ≈ 1');
  approx(p[6].x, 2, 'dome last.x ≈ 2'); approx(p[6].y, 0, 'dome last.y ≈ 0');
  ok(p.every(q => q.x >= 0), 'dome every x >= 0');
}

console.log(`\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail > 0 ? 1 : 0);
