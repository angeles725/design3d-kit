// Pure-Node test for parts/superquadric.mjs — imports only the pure math (no three).
// Run: node library/parts/superquadric.test.mjs   (exit 0 = all green)
import { signedPow, superquadricPoint, superquadricGrid } from './superquadric.mjs';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('FAIL: ' + msg); } }
function eq(a, b, msg) { ok(a === b, `${msg} (got ${a}, want ${b})`); }
function approx(a, b, tol = 1e-9) { return Math.abs(a - b) <= tol; }
function vecApprox(v, x, y, z, tol = 1e-9) {
  return approx(v.x, x, tol) && approx(v.y, y, tol) && approx(v.z, z, tol);
}

// --- signedPow ------------------------------------------------------------------------------------
ok(approx(signedPow(-0.5, 0.5), -Math.sqrt(0.5)), 'signedPow keeps sign: (-0.5)^0.5 → -√0.5');
ok(approx(signedPow(0.5, 0.5), Math.sqrt(0.5)), 'signedPow positive: (0.5)^0.5 → +√0.5');
eq(signedPow(0, 2), 0, 'signedPow(0, 2) === 0');

// --- superquadricPoint (ellipsoid e1=e2=1) --------------------------------------------------------
{
  const p = { a: 2, b: 3, c: 4, e1: 1, e2: 1 };
  ok(vecApprox(superquadricPoint(0, 0, p), 2, 0, 0), 'point(u=0,v=0) → (+a,0,0) = {2,0,0}');
  ok(vecApprox(superquadricPoint(Math.PI / 2, 0, p), 0, 3, 0), 'point(u=π/2,v=0) → (0,+b,0) = {0,3,0}');
  ok(vecApprox(superquadricPoint(0, Math.PI / 2, p), 0, 0, 4), 'point(u=0,v=π/2) → (0,0,+c) = {0,0,4}');
}

// --- superquadricGrid counts (small grid) ---------------------------------------------------------
{
  const uSeg = 4, vSeg = 3;
  const g = superquadricGrid({ a: 1, b: 1, c: 1, e1: 1, e2: 1, uSeg, vSeg });
  eq(g.positions.length, (uSeg + 1) * (vSeg + 1) * 3, 'positions.length === (uSeg+1)*(vSeg+1)*3');
  eq(g.indices.length, uSeg * vSeg * 6, 'indices.length === uSeg*vSeg*6');
}

// --- superquadricGrid throws on invalid params ----------------------------------------------------
{
  let threw = false;
  try { superquadricGrid({ a: 0, b: 1, c: 1, e1: 1, e2: 1 }); } catch (e) { threw = e instanceof RangeError; }
  ok(threw, 'superquadricGrid throws RangeError on a<=0');
}
{
  let threw = false;
  try { superquadricGrid({ a: 1, b: 1, c: 1, e1: 0, e2: 1 }); } catch (e) { threw = e instanceof RangeError; }
  ok(threw, 'superquadricGrid throws RangeError on e1<=0');
}

console.log(`\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail > 0 ? 1 : 0);

// winding regression (investigador2): a closed superquadric must have POSITIVE signed volume (outward
// normals); a negative volume = inside-out, the flip that shipped before this fix.
import assert from 'node:assert/strict';
import { superquadricGrid as _sqg } from './superquadric.mjs';
{
  const { positions, indices } = _sqg({ a:1,b:1,c:1, e1:1,e2:1, uSeg:24, vSeg:16 });
  let V=0; for(let t=0;t<indices.length;t+=3){ const P=i=>[positions[3*indices[t+i]],positions[3*indices[t+i]+1],positions[3*indices[t+i]+2]]; const [a,b,c]=[P(0),P(1),P(2)]; V+=a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]); } V/=6;
  assert.ok(V > 0, `superquadric signed volume must be positive (outward normals); got ${V.toFixed(4)}`);
  assert.ok(Math.abs(V - 4/3*Math.PI) < 0.3, `unit-sphere superquadric volume ~4.19; got ${V.toFixed(4)}`);
  console.log('  ok - superquadric winding: signed volume positive (outward)', V.toFixed(4));
}
