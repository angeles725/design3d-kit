import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deBoxPlan } from './debox.mjs';
import { checkPassParity } from '../harness/pass-parity.mjs';

const blockout = () => ({
  voxelSize: 0.25,
  parts: [
    { id: 'CH-01', type: 'chiller', center: [3.5, 8, 0.9], size: [3, 1.2, 1.8], rotation: [0, 0, 0],
      ports: { CHWS_out: [1.5, -0.6, 0.5] }, portDN: { CHWS_out: 0.2 }, clearance: { '-y': 1.2 } },
    { id: 'P-01', type: 'pump', center: [3.5, 5.5, 0.45], size: [0.8, 0.6, 0.9],
      ports: { suction: [-0.4, 0, 0.1], discharge: [0.4, 0, 0.1] } },
    { id: 'TK-01', type: 'tank', center: [1, 1, 1], size: [1.2, 2.0, 1.2], axis: 'y' },
    { id: 'D-01', type: 'duct', center: [6, 5, 0.5], size: [0.4, 0.3, 2.0], axis: 'z', section: { width: 0.4, height: 0.3 } },
    { id: 'FL-01', type: 'flange', center: [2, 2, 0], size: [0.3, 0.3, 0.05] },
    { id: 'EL-01', type: 'elbow', center: [4, 4, 0], size: [0.2, 0.2, 0.2] },
  ],
});

test('type→builder mapping is correct', () => {
  const byId = Object.fromEntries(deBoxPlan(blockout()).parts.map((p) => [p.id, p.builder]));
  assert.equal(byId['CH-01'], 'rounded-box');   // chiller
  assert.equal(byId['P-01'], 'superquadric');    // pump = rounded housing
  assert.equal(byId['TK-01'], 'lathe-body');     // tank = revolution body
  assert.equal(byId['D-01'], 'rect-duct');       // duct
  assert.equal(byId['FL-01'], 'torus');          // flange
  assert.equal(byId['EL-01'], 'hvac-fittings');  // fitting
});

test('DISCIPLINED BY CONSTRUCTION: pass-parity(blockout, plan) = 0 drift (§440)', () => {
  const b = blockout();
  const plan = deBoxPlan(b);
  const r = checkPassParity({ objects: b.parts }, { objects: plan.parts });
  assert.equal(r.ok, true, 'plan must preserve center/size/rotation/ports/DN exactly — only add geometry');
  assert.deepEqual(r.drifts, []);
});

test('every engineering field is preserved (spread), only builder+builderParams added', () => {
  const b = blockout();
  const plan = deBoxPlan(b);
  for (let i = 0; i < b.parts.length; i++) {
    const src = b.parts[i], out = plan.parts[i];
    assert.deepEqual(out.center, src.center);
    assert.deepEqual(out.size, src.size);
    assert.deepEqual(out.ports, src.ports);
    assert.equal(out.type, src.type);
    if (src.rotation) assert.deepEqual(out.rotation, src.rotation);
    if (src.clearance) assert.deepEqual(out.clearance, src.clearance);
    assert.ok(out.builder && out.builderParams, 'builder + params added');
  }
});

test('builder params derive from the bbox size (proxy fits the same envelope — no size drift)', () => {
  const plan = deBoxPlan(blockout());
  const box = plan.parts.find((p) => p.id === 'CH-01');
  assert.deepEqual([box.builderParams.w, box.builderParams.h, box.builderParams.d], [3, 1.2, 1.8]);
  const sq = plan.parts.find((p) => p.id === 'P-01');
  assert.deepEqual([sq.builderParams.a, sq.builderParams.b, sq.builderParams.c], [0.4, 0.3, 0.45]); // size/2
});

test('marching-cubes ONLY for organic equipment shells, never pipes/ducts', () => {
  const plan = deBoxPlan({ parts: [
    { id: 'SH-01', type: 'equipment-shell', center: [0, 0, 0], size: [1, 1, 1] },
    { id: 'D-02', type: 'duct', center: [0, 0, 0], size: [0.4, 0.3, 2], axis: 'z' },
  ] });
  assert.equal(plan.parts.find((p) => p.id === 'SH-01').builder, 'marching-cubes');
  assert.notEqual(plan.parts.find((p) => p.id === 'D-02').builder, 'marching-cubes'); // duct vectorizes, never MC
});

test('unknown type → default rounded-box + reported in unmapped', () => {
  const plan = deBoxPlan({ parts: [{ id: 'X-01', type: 'mystery-widget', center: [0, 0, 0], size: [1, 1, 1] }] });
  assert.equal(plan.parts[0].builder, 'rounded-box');
  assert.deepEqual(plan.unmapped, ['X-01']);
});

test('material trap: packed-map scalars stay at 1, satin roughness (not chrome)', () => {
  const m = deBoxPlan(blockout()).material;
  assert.equal(m.mapScalars, 1);            // map drives, scalar=1 (no 0.28×0.28 glossy trap)
  assert.ok(m.roughnessBase >= 0.45 && m.roughnessBase <= 0.55); // satin, not a chrome mirror
  assert.ok(m.envMapIntensity <= 1.0);
});

test('runs on the shared duct-network fixture (0 drift, 0 unmapped; skips until it is on master)', async () => {
  const fs = await import('node:fs/promises');
  const url = new URL('../harness/__fixtures__/duct-network.json', import.meta.url);
  let raw; try { raw = await fs.readFile(url, 'utf8'); } catch { return; } // skip if fixture absent
  const fixture = JSON.parse(raw);
  const b = { parts: fixture.objects };
  const plan = deBoxPlan(b);
  assert.deepEqual(plan.unmapped, []); // chiller/pump/ahu all map
  const r = checkPassParity({ objects: b.parts }, { objects: plan.parts });
  assert.equal(r.ok, true);
});

test('deterministic', () => {
  assert.equal(JSON.stringify(deBoxPlan(blockout())), JSON.stringify(deBoxPlan(blockout())));
});

// three-integration: real per-builder geometry builds outward-wound (skips if three unresolvable).
test('deBox builds REAL geometry per builder, all outward-wound (signedVolume>0) + 0 drift', async () => {
  let THREE; try { THREE = await import('three'); } catch { return; } // skip in bare CI
  const { deBox } = await import('./debox.mjs');
  const { checkDeBoxGroupWinding } = await import('../harness/debox-winding.mjs');
  const { checkPassParity } = await import('../harness/pass-parity.mjs');
  const mat = new THREE.MeshStandardMaterial();
  const blockout = { parts: [
    { id: 'TK', type: 'tank', center: [1, 1, 1], size: [1.2, 2, 1.2], axis: 'y' },     // lathe-body
    { id: 'FL', type: 'flange', center: [2, 2, 0], size: [0.4, 0.4, 0.08] },            // torus
    { id: 'CH', type: 'chiller', center: [3.5, 8, 0.9], size: [3, 1.2, 1.8] },          // rounded-box
    { id: 'P', type: 'pump', center: [3.5, 5.5, 0.45], size: [0.8, 0.6, 0.9] },         // superquadric
    { id: 'D', type: 'duct', center: [6, 5, 0.5], size: [0.4, 0.3, 2], axis: 'z' },     // rect-duct
  ] };
  const group = await deBox(blockout, mat);
  assert.equal(group.children.length, 5);
  const w = checkDeBoxGroupWinding(group);
  assert.equal(w.ok, true, `winding: no inside-out builder (got ${JSON.stringify(w.insideOut)})`);
  const built = { objects: group.children.map((m) => ({ id: m.name, type: m.userData.type, center: [m.position.x, m.position.y, m.position.z], size: m.userData.size })) };
  const src = { objects: blockout.parts.map((p) => ({ id: p.id, type: p.type, center: p.center, size: p.size })) };
  assert.equal(checkPassParity(src, built).ok, true);
});

// i2 review #b: axis inferred from the longest bbox dim so a HORIZONTAL vessel doesn't build vertical.
test('horizontal tank without explicit axis → revolve axis = longest dim (not vertical)', () => {
  const plan = deBoxPlan({ parts: [{ id: 'HT', type: 'tank', center: [0, 0, 0], size: [3, 1.2, 1.2] }] });
  const bp = plan.parts[0].builderParams;
  assert.equal(bp.axis, 'x');       // longest dim = x → horizontal vessel
  assert.equal(bp.height, 3);        // length along the resolved axis
  assert.equal(bp.radius, 0.6);      // half the tighter cross-dim
});

test('explicit part.axis is honored over the longest-dim inference', () => {
  const plan = deBoxPlan({ parts: [{ id: 'VT', type: 'tank', center: [0, 0, 0], size: [3, 1.2, 1.2], axis: 'y' }] });
  assert.equal(plan.parts[0].builderParams.axis, 'y'); // explicit wins → vertical despite x being longest
  assert.equal(plan.parts[0].builderParams.height, 1.2);
});
