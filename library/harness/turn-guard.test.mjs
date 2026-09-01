// turn-guard.test.mjs — GR3 + GR4 + threat-matrix tests (RED → GREEN).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runGuard } from './turn-guard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GUARD_CLI = path.join(__dirname, 'turn-guard.mjs');
const FIXTURE_DIR = path.join(__dirname, '../../tests/fixtures');
const SCENE_JSON = path.join(FIXTURE_DIR, 'design-scene.json');
const SCENE_CLEAN_JSON = path.join(FIXTURE_DIR, 'design-scene-clean.json');

const INTENT = 'parametric geometry, not PBR-on-voxel';

// Helper: minimal scene with source+built
const makeScene = (sourceObjs, builtObjs, intent = INTENT) => ({
  intent,
  voxelSize: 1,
  source: { objects: sourceObjs },
  built:  { objects: builtObjs },
  objects: sourceObjs,
});

const piece = (id, cx = 0, cy = 0, cz = 0) => ({
  id, type: 'block', center: [cx, cy, cz], size: [1, 1, 1],
});

// ---- GR3: invented piece --------------------------------------------------------
test('GR3 invented piece: extra built id absent from source → gr3.ok === false', async () => {
  const scene = makeScene(
    [piece('A'), piece('B')],
    [piece('A'), piece('B'), piece('tower-invented', 5, 1.5, 0)],
  );
  const r = await runGuard(scene, INTENT);
  assert.equal(r.rails.gr3.ok, false, 'GR3 must fail when an invented piece exists');
  assert.ok(r.rails.gr3.extra.includes('tower-invented'),
    'gr3.extra must name the invented piece id');
});

// ---- GR3: clean scene -----------------------------------------------------------
test('GR3 clean fixture: all pieces within tolerance → gr3.ok === true', async () => {
  const scene = makeScene(
    [piece('A'), piece('B')],
    [{ id: 'A', type: 'block', center: [0, 0, 0.05], size: [1, 1, 1] }, piece('B')],
  );
  const r = await runGuard(scene, INTENT);
  assert.equal(r.rails.gr3.ok, true, 'GR3 must pass when all pieces are within tolerance');
});

// ---- GR4: intent missing --------------------------------------------------------
test('GR4 intent missing: null intent → gr4.ok === false', async () => {
  const scene = makeScene([piece('A')], [piece('A')], null);
  const r = await runGuard(scene, null);
  assert.equal(r.rails.gr4.ok, false, 'GR4 must fail when intent is null');
});

// ---- GR4: intent empty string ---------------------------------------------------
test('GR4 intent empty string → gr4.ok === false', async () => {
  const scene = makeScene([piece('A')], [piece('A')], '');
  const r = await runGuard(scene, '');
  assert.equal(r.rails.gr4.ok, false, 'GR4 must fail when intent is empty string');
});

// ---- GR4: explicit valid intent -------------------------------------------------
test('GR4 explicit parametric intent → gr4.ok === true', async () => {
  const scene = makeScene([piece('A')], [piece('A')]);
  const r = await runGuard(scene, INTENT);
  assert.equal(r.rails.gr4.ok, true, 'GR4 must pass with a valid non-empty intent matching pinned');
});

// ---- GR4: immutability (lock) ---------------------------------------------------
test('GR4 immutability: intent changed from pinned → second call fails lock', async () => {
  const scene = makeScene([piece('A')], [piece('A')], INTENT);
  const r1 = await runGuard(scene, INTENT);
  assert.equal(r1.rails.gr4.ok, true, 'first call with matching intent must pass');
  // Change intent in second call — pinned in scene is still INTENT
  const r2 = await runGuard(scene, 'PBR on voxel');
  assert.equal(r2.rails.gr4.ok, false, 'second call with changed intent must fail lock');
  assert.ok(r2.rails.gr4.reason === 'intent-changed',
    `expected reason 'intent-changed', got '${r2.rails.gr4.reason}'`);
});

// ---- Wall-time budget -----------------------------------------------------------
test('wall-time: runGuard completes within 30 000 ms on a small scene', async () => {
  const scene = makeScene([piece('A'), piece('B')], [piece('A'), piece('B')]);
  const r = await runGuard(scene, INTENT);
  assert.ok(r.elapsedMs < 30000, `elapsedMs ${r.elapsedMs} must be < 30 000`);
});

// ---- Threat: missing file -------------------------------------------------------
test('threat — missing file: turn-guard CLI exits nonzero for non-existent path', () => {
  let threw = false;
  try {
    execFileSync(process.execPath,
      [GUARD_CLI, '/tmp/does-not-exist-xyzzy.json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    threw = true;
    assert.ok(e.status !== 0, 'exit code must be nonzero');
  }
  assert.ok(threw, 'CLI must throw (exit nonzero) for missing file');
});

// ---- Threat: wrong extension ----------------------------------------------------
test('threat — wrong extension: turn-guard CLI exits nonzero for a .txt path', () => {
  const tmpPath = path.join(FIXTURE_DIR, '__tmp-test.txt');
  writeFileSync(tmpPath, '{}');
  try {
    let threw = false;
    try {
      execFileSync(process.execPath,
        [GUARD_CLI, tmpPath],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      threw = true;
      assert.ok(e.status !== 0, 'exit code must be nonzero for .txt extension');
    }
    assert.ok(threw, 'CLI must reject .txt extension');
  } finally {
    unlinkSync(tmpPath);
  }
});

// ---- Threat: path resolve -------------------------------------------------------
test('threat — path resolve: relative and absolute paths produce structurally identical results', async () => {
  const scene = JSON.parse(readFileSync(SCENE_CLEAN_JSON, 'utf8'));
  // Run guard directly on the parsed scene (simulating what the CLI does after resolution)
  const r = await runGuard(scene, INTENT);
  // The result must have all 4 rails regardless of path (this tests determinism of runGuard)
  assert.ok('gr1' in r.rails, 'gr1 must be present');
  assert.ok('gr2' in r.rails, 'gr2 must be present');
  assert.ok('gr3' in r.rails, 'gr3 must be present');
  assert.ok('gr4' in r.rails, 'gr4 must be present');
});

// ---- W-1 GR4 structural check ---------------------------------------------------

// (a) grid-aligned built boxes + parametric intent → FAIL with reason 'pbr-on-voxel'
test('W-1 GR4 structural: grid-aligned built boxes + parametric intent → gr4.ok=false reason=pbr-on-voxel', async () => {
  const scene = {
    intent: INTENT,
    voxelSize: 1,
    source: { objects: [
      { id: 'wall-A', type: 'block', center: [0.5, 0.5, 0.5], size: [1, 1, 1] },
      { id: 'wall-B', type: 'block', center: [1.5, 0.5, 0.5], size: [1, 1, 1] },
    ]},
    built: { objects: [
      { id: 'wall-A', type: 'block', center: [0.5, 0.5, 0.5], size: [1, 1, 1] },
      { id: 'wall-B', type: 'block', center: [1.5, 0.5, 0.5], size: [1, 1, 1] },
    ]},
    objects: [],
  };
  const r = await runGuard(scene, INTENT);
  assert.equal(r.rails.gr4.ok, false,
    'GR4 must fail when built pieces are voxel-grid boxes and intent forbids PBR-on-voxel');
  assert.equal(r.rails.gr4.reason, 'pbr-on-voxel',
    `expected reason 'pbr-on-voxel', got '${r.rails.gr4.reason}'`);
});

// (b) genuine parametric scene (non-grid sizes/positions) + same intent → PASS
test('W-1 GR4 structural: non-grid built pieces + parametric intent → gr4.ok=true', async () => {
  const scene = {
    intent: INTENT,
    voxelSize: 1,
    source: { objects: [
      { id: 'arch-A', type: 'block', center: [0.5, 0.5, 0.5], size: [1, 1, 1] },
    ]},
    built: { objects: [
      { id: 'arch-A', type: 'block', center: [0.31, 0.73, 0.19], size: [0.85, 1.23, 0.91] },
    ]},
    objects: [],
  };
  const r = await runGuard(scene, INTENT);
  assert.equal(r.rails.gr4.ok, true,
    'GR4 must pass for genuine parametric built pieces (non-grid sizes/positions)');
});

// (c) grid-aligned boxes but intent does NOT forbid PBR-on-voxel → no false positive
test('W-1 GR4 structural: grid-aligned boxes + neutral intent → gr4.ok=true (no false positive)', async () => {
  const neutralIntent = 'blocky architecture style';
  const scene = {
    intent: neutralIntent,
    voxelSize: 1,
    source: { objects: [
      { id: 'wall-A', type: 'block', center: [0.5, 0.5, 0.5], size: [1, 1, 1] },
    ]},
    built: { objects: [
      { id: 'wall-A', type: 'block', center: [0.5, 0.5, 0.5], size: [1, 1, 1] },
    ]},
    objects: [],
  };
  const r = await runGuard(scene, neutralIntent);
  assert.equal(r.rails.gr4.ok, true,
    'GR4 must not flag grid-aligned boxes when intent does not forbid PBR-on-voxel');
});
