// soft-raster.test.mjs — GR1 unit tests (RED → GREEN).
// Determinism, silhouette bounds, AABB fallback.
// NEVER asserts specific pixel values — raster is a look-aid only (Rule 7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rasterize } from './soft-raster.mjs';

const unitCube = {
  objects: [{ id: 'cube', type: 'block', center: [0, 0, 0], size: [1, 1, 1] }],
};

// ---- Determinism ----
test('GR1 determinism: same scene → byte-identical PNG buffers', () => {
  const a = rasterize(unitCube);
  const b = rasterize(unitCube);
  assert.equal(Buffer.compare(a.lookPng, b.lookPng), 0,
    'rasterize must be deterministic: identical inputs must produce byte-identical PNG');
});

// ---- PNG validity ----
test('GR1 PNG signature: result starts with the 8-byte PNG magic number', () => {
  const r = rasterize(unitCube);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < sig.length; i++) {
    assert.equal(r.lookPng[i], sig[i], `PNG signature byte ${i} mismatch`);
  }
});

// ---- Silhouette bounds: drawnPixels > 0 for each of the 3 views ----
test('GR1 silhouette bounds: unit cube produces drawn pixels in all 3 default views', () => {
  const r = rasterize(unitCube, { res: 128 });
  assert.ok(r.stats.drawnPixels > 0,
    'unit cube must produce at least one non-background pixel across all views');
});

test('GR1 silhouette bounds: drawnPixels per view all nonzero for unit cube', () => {
  const r = rasterize(unitCube, { res: 128 });
  for (const [name, count] of Object.entries(r.stats.drawnPerView)) {
    assert.ok(count > 0, `view "${name}" must have at least one drawn pixel`);
  }
});

// ---- AABB fallback: scene with no triangle arrays produces a non-empty raster ----
test('GR1 AABB fallback: scene with only center/size (no positions/index) renders non-trivially', () => {
  const scene = { objects: [
    { id: 'box', type: 'block', center: [1, 0, 0], size: [2, 1, 1] },
  ]};
  const r = rasterize(scene);
  assert.ok(r.lookPng.length > 100, 'PNG must contain actual data');
  assert.ok(r.stats.drawnPixels > 0, 'AABB proxy must produce drawn pixels');
});

// ---- elapsedMs ----
test('GR1 elapsedMs: returned and finite', () => {
  const r = rasterize(unitCube);
  assert.equal(typeof r.elapsedMs, 'number');
  assert.ok(Number.isFinite(r.elapsedMs) && r.elapsedMs >= 0);
});

// ---- custom views ----
test('GR1 custom views: single view produces different stats than triple-view default', () => {
  const triple = rasterize(unitCube, { res: 64 });
  const single = rasterize(unitCube, { views: ['front'], res: 64 });
  // single view has fewer views so drawnPerView has 1 key, triple has 3
  assert.equal(Object.keys(single.stats.drawnPerView).length, 1);
  assert.equal(Object.keys(triple.stats.drawnPerView).length, 3);
});
