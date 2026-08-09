// Pure-Node test for parts/rmf-frames.mjs — imports only the pure math (no three).
// Run: node library/parts/rmf-frames.test.mjs   (exit 0 = all green)
import { rmfFrames } from './rmf-frames.mjs';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('FAIL: ' + msg); } }
function approx(a, b, tol = 1e-9) { return Math.abs(a - b) <= tol; }
function vecApprox(v, x, y, z, tol = 1e-9) {
  return approx(v.x, x, tol) && approx(v.y, y, tol) && approx(v.z, z, tol);
}
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.sqrt(dot(a, a));

// --- Quarter-circle in the XY plane (points on the unit circle, in-plane unit tangents) ----------
// point(θ) = (cos θ, sin θ, 0); tangent = d/dθ = (-sin θ, cos θ, 0) (already unit).
const N = 8;
const qcPoints = [], qcTangents = [];
for (let i = 0; i <= N; i++) {
  const th = (Math.PI / 2) * (i / N);
  qcPoints.push({ x: Math.cos(th), y: Math.sin(th), z: 0 });
  qcTangents.push({ x: -Math.sin(th), y: Math.cos(th), z: 0 });
}
const planeNormal = { x: 0, y: 0, z: 1 };
const qcFrames = rmfFrames(qcPoints, qcTangents, planeNormal);

// Orthonormality at every sample.
{
  let allOrtho = true;
  for (let i = 0; i < qcFrames.length; i++) {
    const { r, s, t } = qcFrames[i];
    if (!approx(len(r), 1) || !approx(len(s), 1)) allOrtho = false;
    if (!approx(dot(r, t), 0) || !approx(dot(s, t), 0) || !approx(dot(r, s), 0)) allOrtho = false;
  }
  ok(allOrtho, 'quarter-circle: every frame is orthonormal (|r|=|s|=1, r⊥t, s⊥t, r⊥s)');
}

// Planar-curve invariant (the discriminating test): r stays the fixed out-of-plane normal everywhere.
{
  let allFixed = true;
  for (let i = 0; i < qcFrames.length; i++) {
    if (!vecApprox(qcFrames[i].r, 0, 0, 1)) allFixed = false;
  }
  ok(allFixed, 'planar curve: r stays ≈ {0,0,1} at EVERY sample (zero twist about the tangent)');
}

// t passthrough: frame[i].t === tangents[i] (same reference identity).
{
  let allSame = true;
  for (let i = 0; i < qcFrames.length; i++) {
    if (qcFrames[i].t !== qcTangents[i]) allSame = false;
  }
  ok(allSame, 't passthrough: frame[i].t === tangents[i]');
}

// --- Straight line along +x — parallel transport keeps r fixed --------------------------------------
{
  const pts = [], tans = [];
  for (let i = 0; i <= 5; i++) {
    pts.push({ x: i * 0.5, y: 0, z: 0 });
    tans.push({ x: 1, y: 0, z: 0 });
  }
  const r0 = { x: 0, y: 1, z: 0 };
  const frames = rmfFrames(pts, tans, r0);
  let allFixed = true;
  for (let i = 0; i < frames.length; i++) {
    if (!vecApprox(frames[i].r, 0, 1, 0)) allFixed = false;
  }
  ok(allFixed, 'straight line: r ≈ {0,1,0} unchanged at every sample (parallel transport)');
}

// --- Defensive seed: a non-perpendicular, non-unit r0 is projected & normalized --------------------
{
  const pts = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }];
  const tans = [{ x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }];
  const r0 = { x: 3, y: 0, z: 4 }; // has a tangential (x) component and |r0|=5
  const frames = rmfFrames(pts, tans, r0);
  ok(approx(len(frames[0].r), 1) && approx(dot(frames[0].r, tans[0]), 0),
    'defensive seed: r0 projected ⊥ tangent and renormalized (|r|=1, r⊥t)');
  ok(vecApprox(frames[0].r, 0, 0, 1), 'defensive seed: {3,0,4} → {0,0,1} on +x tangent');
}

// --- Helix (NON-planar, curvature everywhere) — orthonormal & no flips through the twist ----------
// The planar tests can't catch a transport bug that only shows out of plane; a helix can.
{
  const k = 0.3, M = 24, sc = 1 / Math.sqrt(1 + k * k);
  const pts = [], tans = [];
  for (let i = 0; i <= M; i++) {
    const th = (2 * Math.PI) * (i / M);
    pts.push({ x: Math.cos(th), y: Math.sin(th), z: k * th });
    tans.push({ x: -Math.sin(th) * sc, y: Math.cos(th) * sc, z: k * sc }); // unit tangent
  }
  const frames = rmfFrames(pts, tans, { x: 1, y: 0, z: 0 }); // {1,0,0} ⊥ tangent at θ=0
  let ortho = true, smooth = true;
  for (let i = 0; i < frames.length; i++) {
    const { r, s: sv, t } = frames[i];
    if (!approx(len(r), 1) || !approx(len(sv), 1)) ortho = false;
    if (!approx(dot(r, t), 0) || !approx(dot(sv, t), 0) || !approx(dot(r, sv), 0)) ortho = false;
    if (i > 0 && dot(frames[i - 1].r, frames[i].r) < 0.9) smooth = false; // no sudden 180° flip
  }
  ok(ortho, 'helix (non-planar): every frame orthonormal');
  ok(smooth, 'helix: r transports smoothly (no 180° flip between adjacent samples)');
}

console.log(`\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail > 0 ? 1 : 0);
