// node --test  ·  pure-core tests import ONLY the zero-dep core (never three). One integration test
// dynamic-imports three + three-mesh-bvh and SKIPS itself if they do not resolve — so the pure suite
// stays green in a bare Node checkout, exactly like geom-verify.test.mjs.
// Run:  node --test scratchpad-research/staged/clash-detect.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pairKey,
  buildAllowedSet,
  isAllowed,
  classifyContact,
  gateFromClashes,
  detectClashes,
} from './clash-detect.mjs';

// ---- PURE CORE -------------------------------------------------------------------------------
test('pairKey is order-independent and string-based', () => {
  assert.equal(pairKey('A', 'B'), pairKey('B', 'A'));
  assert.equal(pairKey('DUCT-2', 'DUCT-10'), pairKey('DUCT-10', 'DUCT-2'));
});

test('buildAllowedSet / isAllowed round-trips and ignores malformed rows', () => {
  const s = buildAllowedSet([['A', 'B'], ['x'], null, ['C', 'D', 'E']]);
  assert.ok(isAllowed(s, 'B', 'A'));
  assert.ok(isAllowed(s, 'A', 'B'));
  assert.ok(!isAllowed(s, 'A', 'C'));
  assert.equal(s.size, 1); // only the well-formed 2-tuple survived
});

test('classifyContact keeps a weld (touching) distinct from interpenetration (overlapping)', () => {
  const tol = 1e-4;
  assert.equal(classifyContact(false, 0, tol), 'clear');       // no triangle cross
  assert.equal(classifyContact(true, 0, tol), 'touching');     // coplanar weld, depth ~ 0
  assert.equal(classifyContact(true, tol, tol), 'touching');   // exactly at tolerance is still contact
  assert.equal(classifyContact(true, 0.01, tol), 'overlapping'); // deep interior overlap
});

test('gateFromClashes: PASS iff no clashes', () => {
  assert.equal(gateFromClashes([]), 'PASS');
  assert.equal(gateFromClashes([{ a: 'A', b: 'B', depth: 0.1 }]), 'FAIL');
});

// ---- INTEGRATION (headless three; skips if three / three-mesh-bvh are not installed) ----------
async function threeAvailable() {
  try { await import('three'); await import('three-mesh-bvh'); return true; } catch { return false; }
}

test('detectClashes: flags undeclared interpenetration, honors allowedContact, respects tolerance', async (t) => {
  if (!(await threeAvailable())) { t.skip('three / three-mesh-bvh not resolvable here'); return; }
  const THREE = await import('three');

  const box = (sx, sy, sz, pos) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz, 4, 4, 4));
    m.position.set(pos[0], pos[1], pos[2]);
    return m;
  };
  // A at origin; B intrudes +0.3 in y => ~0.1 m interpenetration; C welds A's +z end face at z=1.
  const A = { id: 'DUCT-A', meshes: [box(0.4, 0.4, 2.0, [0, 0, 0])] };
  const B = { id: 'DUCT-B', meshes: [box(0.4, 0.4, 2.0, [0, 0.3, 0])] };
  const C = { id: 'DUCT-C', meshes: [box(0.4, 0.4, 2.0, [0, 0, 2.0])] };

  // No allow-list: the real interpenetration A~B must FAIL; the A~C weld must NOT be a clash.
  const r1 = await detectClashes({ groups: [A, B, C], tolerance: 1e-4 });
  assert.equal(r1.gate, 'FAIL');
  assert.equal(r1.clashes.length, 1);
  assert.equal(pairKey(r1.clashes[0].a, r1.clashes[0].b), pairKey('DUCT-A', 'DUCT-B'));
  assert.ok(r1.clashes[0].depth > 0.05, `depth ${r1.clashes[0].depth} should be ~0.1 m`);
  const ac = r1.pairs.find((p) => pairKey(p.a, p.b) === pairKey('DUCT-A', 'DUCT-C'));
  assert.equal(ac.contact, 'touching'); // weld, not a clash

  // Declaring A~B as allowed contact clears the gate (a designer-approved intersection).
  const r2 = await detectClashes({ groups: [A, B, C], allowedContact: [['DUCT-A', 'DUCT-B']], tolerance: 1e-4 });
  assert.equal(r2.gate, 'PASS');
  assert.equal(r2.clashes.length, 0);

  // Determinism: identical input -> identical depths.
  const r3 = await detectClashes({ groups: [A, B, C], tolerance: 1e-4 });
  assert.equal(r3.clashes[0].depth, r1.clashes[0].depth);
});

// The world-AABB min-overlap proxy — the WRONG depth for oblique/curved parts. Computed here ONLY to
// prove the shipped sampled depth stays below it. A rotated/curved part's world AABB is inflated, so this
// proxy counts empty corner air as penetration. Never adopt this as the depth path.
async function aabbProxyDepth(THREE, ma, mb) {
  const wb = (m) => { m.updateWorldMatrix(true, false);
    return new THREE.Box3().setFromBufferAttribute(m.geometry.attributes.position).applyMatrix4(m.matrixWorld); };
  const a = wb(ma), b = wb(mb);
  const ox = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
  const oy = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
  const oz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
  return (ox <= 0 || oy <= 0 || oz <= 0) ? 0 : Math.min(ox, oy, oz);
}

// REGRESSION GUARD: on a CURVED pair (TubeGeometry along a CatmullRomCurve3) the shipped sampled depth
// must stay a TIGHT LOWER BOUND, strictly below the AABB proxy. Locks in "do not regress to AABB depth
// for curved parts" — the AABB proxy overestimates the bend's penetration by ~2x.
test('detectClashes: curved TubeGeometry pair — sampled depth is a strict lower bound vs AABB proxy', async (t) => {
  if (!(await threeAvailable())) { t.skip('three / three-mesh-bvh not resolvable here'); return; }
  const THREE = await import('three');
  const tube = (pts, r) => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    return new THREE.Mesh(new THREE.TubeGeometry(curve, 48, r, 12, false));
  };
  const A = { id: 'RUN', meshes: [tube([[-1, 0, 0], [1, 0, 0]], 0.15)] };            // straight run
  const B = { id: 'BEND', meshes: [tube([[0, -1, 0], [0, 0, 0.12], [0, 1, 0]], 0.15)] }; // bend crossing it

  const r = await detectClashes({ groups: [A, B], tolerance: 1e-4 });
  assert.equal(r.gate, 'FAIL');                        // they genuinely interpenetrate
  assert.equal(r.clashes.length, 1);
  const depth = r.clashes[0].depth;
  const proxy = await aabbProxyDepth(THREE, A.meshes[0], B.meshes[0]);
  assert.ok(depth > 0.05, `sampled depth ${depth} should register the real bend intrusion`);
  assert.ok(depth < proxy - 0.02, `sampled depth ${depth} must stay strictly below AABB proxy ${proxy} (no AABB overestimate)`);
});

// REGRESSION GUARD (fabrication): a 45deg-rotated box whose INFLATED AABB overlaps A but whose TRIANGLES
// never touch must yield gate PASS / zero clashes. Ground-truth: intersectsGeometry=false at this pose.
// Stops any future change from silently fabricating clashes on air (the AABB proxy would report ~0.12 m).
test('detectClashes: non-contacting 45deg corner — no fabricated clash (gate PASS)', async (t) => {
  if (!(await threeAvailable())) { t.skip('three / three-mesh-bvh not resolvable here'); return; }
  const THREE = await import('three');
  const box = (pos, rotZ) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 2.0, 4, 4, 4));
    m.position.set(pos[0], pos[1], pos[2]); m.rotation.z = rotZ; return m;
  };
  const A = { id: 'A-axis', meshes: [box([0, 0, 0], 0)] };
  const B = { id: 'B-rot45', meshes: [box([0.36, 0.36, 0], Math.PI / 4)] }; // AABBs overlap, triangles don't

  const r = await detectClashes({ groups: [A, B], tolerance: 1e-4 });
  const proxy = await aabbProxyDepth(THREE, A.meshes[0], B.meshes[0]);
  assert.ok(proxy > 0.1, `sanity: the AABB proxy DOES overlap here (${proxy}) — that is the trap`);
  assert.equal(r.gate, 'PASS');                        // no real triangle contact => no clash
  assert.equal(r.clashes.length, 0);
  const pair = r.pairs[0];
  assert.equal(pair.contact, 'clear');                 // not even 'touching'
});
