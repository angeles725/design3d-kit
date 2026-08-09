// Pure-Node test for materials-textures/round-edge-normal.mjs — imports only the pure core (no three).
// Run: node library/materials-textures/round-edge-normal.test.mjs   (exit 0 = all green)
import { boxEdgeNormal, encodeNormalRGB } from './round-edge-normal.mjs';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('FAIL: ' + msg); } }
function approx(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, want ~${b} ±${tol})`); }
function unit(n) { return Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z); }

const TIGHT = 1e-9;

// --- flat interior is exactly (0,0,1) ----------------------------------------
{
  const n = boxEdgeNormal(0.5, 0.5);
  approx(n.x, 0, TIGHT, 'center nx = 0');
  approx(n.y, 0, TIGHT, 'center ny = 0');
  approx(n.z, 1, TIGHT, 'center nz = 1 (flat interior)');
}
// another interior point, both coords in [bevel, 1-bevel] with default bevel 0.12
{
  const n = boxEdgeNormal(0.5, 0.3, 0.12); // 0.3 and 0.5 both >= 0.12 and <= 0.88
  approx(n.x, 0, TIGHT, 'interior (0.5,0.3) nx = 0');
  approx(n.y, 0, TIGHT, 'interior (0.5,0.3) ny = 0');
  approx(n.z, 1, TIGHT, 'interior (0.5,0.3) nz = 1 (stays flat)');
}

// --- every sample is UNIT length across a grid -------------------------------
{
  let allUnit = true;
  for (let i = 0; i <= 20; i++) {
    for (let j = 0; j <= 20; j++) {
      const n = boxEdgeNormal(i / 20, j / 20, 0.12);
      if (Math.abs(unit(n) - 1) > 1e-12) { allUnit = false; }
    }
  }
  ok(allUnit, 'boxEdgeNormal is unit length across a 21×21 u,v grid');
}

// --- edges tilt OUTWARD with the correct sign, and are perturbed (nz < 1) -----
{
  const right = boxEdgeNormal(0.99, 0.5); // near right border → +X
  ok(right.x > 0, `right edge tilts +X (got nx=${right.x})`);
  ok(right.z < 1, `right edge is perturbed nz<1 (got nz=${right.z})`);

  const left = boxEdgeNormal(0.01, 0.5); // near left border → −X
  ok(left.x < 0, `left edge tilts −X (got nx=${left.x})`);
  ok(left.z < 1, `left edge is perturbed nz<1 (got nz=${left.z})`);

  const top = boxEdgeNormal(0.5, 0.99); // near top border → +Y
  ok(top.y > 0, `top edge tilts +Y (got ny=${top.y})`);
  ok(top.z < 1, `top edge is perturbed nz<1 (got nz=${top.z})`);

  const bottom = boxEdgeNormal(0.5, 0.01); // near bottom border → −Y
  ok(bottom.y < 0, `bottom edge tilts −Y (got ny=${bottom.y})`);
  ok(bottom.z < 1, `bottom edge is perturbed nz<1 (got nz=${bottom.z})`);
}

// --- a corner tilts on BOTH axes ---------------------------------------------
{
  const corner = boxEdgeNormal(0.01, 0.01); // near bottom-left vertex → −X and −Y
  ok(corner.x < 0, `corner tilts −X (got nx=${corner.x})`);
  ok(corner.y < 0, `corner tilts −Y (got ny=${corner.y})`);
  ok(corner.z < 1, `corner is perturbed nz<1 (got nz=${corner.z})`);
}

// --- encodeNormalRGB ----------------------------------------------------------
{
  const rgb = encodeNormalRGB({ x: 0, y: 0, z: 1 });
  ok(rgb.length === 3 && rgb[0] === 128 && rgb[1] === 128 && rgb[2] === 255,
    `flat normal encodes to [128,128,255] (got ${JSON.stringify(rgb)})`);
}
{
  // a real tilted unit normal must stay inside 0..255 integers on every channel
  const n = boxEdgeNormal(0.01, 0.01);
  const rgb = encodeNormalRGB(n);
  let inRange = true;
  for (const c of rgb) { if (!Number.isInteger(c) || c < 0 || c > 255) { inRange = false; } }
  ok(inRange, `tilted normal stays in 0..255 integers (got ${JSON.stringify(rgb)})`);
}

console.log(`\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail > 0 ? 1 : 0);
