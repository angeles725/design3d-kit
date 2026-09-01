// axis-contract.test.mjs — GR2 unit tests (RED → GREEN).
// Round-trip + negative mirror control + re-exported coord helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worldToModel, modelToWorld, cellOf, centerOf } from './axis-contract.mjs';

const h = 0.5;  // voxel edge size
const D = 10;   // depth parameter (scene Z extent, world units)

// ---- round-trip A: worldToModel(modelToWorld(v)) === v (exact int) ----
test('GR2 round-trip A: worldToModel(modelToWorld(v)) returns exact voxel int', () => {
  for (const v of [[5, 3, 7], [0, 0, 0], [1, 2, 3], [10, 8, 4]]) {
    const w = modelToWorld(v, h, D);
    const back = worldToModel(w, h, D);
    assert.deepEqual(back, v, `round-trip failed for voxel ${JSON.stringify(v)}`);
  }
});

// ---- round-trip B: modelToWorld(worldToModel(p)) ≈ p within ±h/2 ----
test('GR2 round-trip B: modelToWorld(worldToModel(p)) within ±h/2 of original world point', () => {
  for (const p of [[2.3, 1.7, 4.1], [0.0, 0.0, 0.0], [3.9, 5.2, 7.6]]) {
    const v = worldToModel(p, h, D);
    const back = modelToWorld(v, h, D);
    for (let i = 0; i < 3; i++) {
      assert.ok(
        Math.abs(back[i] - p[i]) <= h / 2 + 1e-9,
        `axis ${i}: recovered ${back[i]} not within ±${h/2} of original ${p[i]}`
      );
    }
  }
});

// ---- negative mirror control: world.z = iz*h − D (wrong sign) must give different result ----
test('GR2 negative mirror control: wrong-sign Z convention gives different iz than canonical', () => {
  const v = [5, 3, 7];
  // canonical center in world space (correct convention: wz = D - (iz+0.5)*h)
  const canonical = modelToWorld(v, h, D);
  // wrong-sign world point: wz = (iz + 0.5)*h - D  (sign flipped from canonical)
  const wrongZ = (v[2] + 0.5) * h - D;
  // canonical and wrong Z must differ — if equal the sign flip has no effect (broken test)
  assert.notEqual(
    canonical[2], wrongZ,
    'canonical wz and mirror wz must be different: sign discrimination requires they differ'
  );
  // Feeding the wrong-sign world point through worldToModel must NOT recover the original iz
  const fromWrong = worldToModel([canonical[0], canonical[1], wrongZ], h, D);
  assert.notEqual(
    fromWrong[2], v[2],
    'worldToModel of a wrong-sign Z must not return original iz — negative control would be vacuous'
  );
});

// ---- re-exported cellOf matches voxelize.mjs semantics ----
test('GR2 re-exported cellOf: floor((w - origin) / h)', () => {
  assert.equal(cellOf(1.0, 0, 0.5), 2);   // floor(1.0/0.5) = 2
  assert.equal(cellOf(1.3, 0, 0.5), 2);   // floor(1.3/0.5) = floor(2.6) = 2
  assert.equal(cellOf(0.25, 0, 0.5), 0);  // floor(0.25/0.5) = floor(0.5) = 0
  assert.equal(cellOf(1.0, 0.5, 0.5), 1); // floor((1.0-0.5)/0.5) = 1
});

// ---- re-exported centerOf matches voxelize.mjs semantics ----
test('GR2 re-exported centerOf: origin + (v + 0.5) * h', () => {
  assert.ok(Math.abs(centerOf(0, 0, 0.5) - 0.25) < 1e-12);  // 0 + 0.5*0.5
  assert.ok(Math.abs(centerOf(2, 0, 0.5) - 1.25) < 1e-12);  // 0 + 2.5*0.5
  assert.ok(Math.abs(centerOf(0, 1, 0.5) - 1.25) < 1e-12);  // 1 + 0.5*0.5
});
