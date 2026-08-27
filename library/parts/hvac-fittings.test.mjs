// Pure-Node test for parts/hvac-fittings.mjs — imports only the pure core (no three).
// Run: node library/parts/hvac-fittings.test.mjs   (exit 0 = all green)
import { elbowCenterline, elbowPortFrames, reducerProfile, elbowPlacement } from './hvac-fittings.mjs';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('FAIL: ' + msg); } }
function eq(a, b, msg) { ok(a === b, `${msg} (got ${a}, want ${b})`); }
function near(a, b, eps, msg) { ok(Math.abs(a - b) <= eps, `${msg} (got ${a}, want ~${b} ±${eps})`); }
function threw(fn, msg) { let t = false; try { fn(); } catch { t = true; } ok(t, msg); }

const EPS = 1e-9;

// --- elbowCenterline: THE exact-arc invariant (x²+y²=R² at every sample) ---------------------------
for (const R of [0.15, 1.5, 12.0]) {
  for (const arc of [Math.PI / 2, Math.PI / 4, (2 * Math.PI) / 3]) {
    const pts = elbowCenterline(R, arc, 24);
    eq(pts.length, 25, `elbowCenterline returns n+1 points (R=${R}, arc=${arc.toFixed(3)})`);
    let maxErr = 0;
    for (const p of pts) {
      maxErr = Math.max(maxErr, Math.abs(Math.hypot(p.x, p.y) - R));
      if (p.z !== 0) maxErr = Infinity; // must stay in the XY plane
    }
    ok(maxErr <= EPS, `EXACT ARC: every centerline point on x²+y²=R² within ${EPS} (R=${R}, arc=${arc.toFixed(3)}, maxErr=${maxErr})`);
  }
}
// endpoints: angle 0 -> (R,0,0); 90° -> ~(0,R,0)
{
  const pts = elbowCenterline(1.5, Math.PI / 2, 8);
  near(pts[0].x, 1.5, EPS, 'elbow start x = R');
  near(pts[0].y, 0, EPS, 'elbow start y = 0');
  near(pts[8].x, 0, 1e-12, 'elbow 90° end x ~ 0');
  near(pts[8].y, 1.5, EPS, 'elbow 90° end y = R');
}
// input guards
threw(() => elbowCenterline(0, Math.PI / 2, 8), 'elbowCenterline rejects bendRadius 0');
threw(() => elbowCenterline(1.5, 0, 8), 'elbowCenterline rejects arcAngle 0');
threw(() => elbowCenterline(1.5, Math.PI / 2, 0), 'elbowCenterline rejects n 0');
threw(() => elbowCenterline(1.5, Math.PI / 2, 2.5), 'elbowCenterline rejects non-integer n');

// --- elbowPortFrames: endpoints + UNIT directions pointing out of the fitting ---------------------
{
  const R = 1.5, arc = Math.PI / 2;
  const { start, end } = elbowPortFrames(R, arc);
  near(start.position.x, R, EPS, 'start port at (R,0,0)');
  near(end.position.y, R, EPS, 'end port at (0,R,0) for 90°');
  near(Math.hypot(start.direction.x, start.direction.y, start.direction.z), 1, EPS, 'start direction is unit');
  near(Math.hypot(end.direction.x, end.direction.y, end.direction.z), 1, EPS, 'end direction is unit');
  // start points back along -Y (away from the arc which curves toward +Y); end tangent at 90° is -X
  near(start.direction.y, -1, EPS, 'start direction = -tangent(0) = (0,-1,0)');
  near(end.direction.x, -1, EPS, 'end direction = +tangent(90°) = (-1,0,0)');
  threw(() => elbowPortFrames(0, arc), 'elbowPortFrames rejects bendRadius 0');
}

// --- reducerProfile: positivity + taper flag ------------------------------------------------------
{
  const a = reducerProfile(0.2, 0.15, 0.3);
  ok(a.valid && a.isTaper, 'reducer 0.2->0.15 valid taper');
  const b = reducerProfile(0.15, 0.15, 0.3);
  ok(b.valid && !b.isTaper, 'reducer equal radii valid but not a taper (plain spool)');
  ok(!reducerProfile(0, 0.15, 0.3).valid, 'reducer rejects r1=0');
  ok(!reducerProfile(0.2, -0.1, 0.3).valid, 'reducer rejects negative r2');
  ok(!reducerProfile(0.2, 0.15, 0).valid, 'reducer rejects length 0');
}

// --- elbowPlacement: the proven router-bend placement math (creador1 full-chain PoC) --------------
{
  // 90° bend at corner (1,0,0), travelling +X then turning to +Y. R = 1.5·DN150 bore ≈ 0.225.
  const R = 0.225;
  const bend = { position: [1, 0, 0], inDir: [1, 0, 0], outDir: [0, 1, 0], turnAngle: 90 };
  const pl = elbowPlacement(bend, R);
  near(pl.arcAngle, Math.PI / 2, 1e-12, '90° bend -> arcAngle π/2');
  near(pl.setback, R, 1e-12, '90° setback T = R·tan(45°) = R');
  // tangent points: start T back along inDir, end T along outDir
  near(pl.startTangent[0], 1 - R, EPS, 'startTangent x = corner - inDir·T');
  near(pl.startTangent[1], 0, EPS, 'startTangent y = 0');
  near(pl.endTangent[0], 1, EPS, 'endTangent x = corner x');
  near(pl.endTangent[1], R, EPS, 'endTangent y = corner + outDir·T');
  // turn-plane normal = inDir × outDir = +Z; localX = inDir × normal = (1,0,0)×(0,0,1) = (0,-1,0)
  near(pl.normal[2], 1, EPS, 'normal = +Z for +X->+Y turn');
  near(pl.localX[1], -1, EPS, 'localX = inDir × normal = (0,-1,0)');
  // origin so local (R,0,0) maps to startTangent: origin = A - localX·R = (1-R, R, 0)
  near(pl.origin[0], 1 - R, EPS, 'origin x');
  near(pl.origin[1], R, EPS, 'origin y = -localX_y·R = +R');
  near(pl.origin[2], 0, EPS, 'origin z = 0 (planar bend)');
}
{
  // 45° bend: T = R·tan(22.5°) < R; accepts Vector3-like inputs {x,y,z}
  const R = 0.3;
  const bend = { position: { x: 0, y: 0, z: 0 }, inDir: { x: 1, y: 0, z: 0 }, outDir: { x: Math.cos(Math.PI / 4), y: Math.sin(Math.PI / 4), z: 0 }, turnAngle: 45 };
  const pl = elbowPlacement(bend, R);
  near(pl.arcAngle, Math.PI / 4, 1e-12, '45° bend -> arcAngle π/4');
  near(pl.setback, R * Math.tan(Math.PI / 8), 1e-12, '45° setback T = R·tan(22.5°)');
  ok(pl.setback < R, '45° setback < R (sharper-than-90 has less setback)');
}
threw(() => elbowPlacement({ position: [0, 0, 0], inDir: [1, 0, 0], outDir: [0, 1, 0], turnAngle: 90 }, 0), 'elbowPlacement rejects bendRadius 0');

console.log(`\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail > 0 ? 1 : 0);
