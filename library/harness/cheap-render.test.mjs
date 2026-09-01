// library: cheap-render.test.mjs — wiring/contract tests (TDD, RED → GREEN, v1.0).
// Tests ONLY the fallback contract and flag threading.
// Rule 7 applies: do NOT assert pixels or simulate the renderer.
// Tests are ENVIRONMENT-INDEPENDENT: the fallback path is forced via an injected
// loadPuppeteer loader, and the webgl path uses a fake puppeteer — so they pass
// whether or not puppeteer is actually installed. No real pixels are asserted.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { cheapRender } from './cheap-render.mjs';
import { runGuard } from './turn-guard.mjs';

// ---- Helpers --------------------------------------------------------------------

const makeScene = (intent = 'test intent') => ({
  intent,
  voxelSize: 1,
  source: { objects: [{ id: 'A', type: 'block', center: [0.5, 0.5, 0.5], size: [1, 1, 1] }] },
  built:  { objects: [{ id: 'A', type: 'block', center: [0.5, 0.5, 0.5], size: [1, 1, 1] }] },
  objects: [{ id: 'A', type: 'block', center: [0.5, 0.5, 0.5], size: [1, 1, 1] }],
});

// ---- (a) Default path: no renderReal flag → soft-raster only ------------------

test('default (no renderReal): runGuard returns renderMode=soft-raster, no realImagePath', async () => {
  const scene = makeScene();
  const r = await runGuard(scene, 'test intent');
  assert.equal(r.renderMode, 'soft-raster',
    'default renderMode must be soft-raster');
  assert.equal(r.realImagePath, undefined,
    'realImagePath must be absent in default mode');
  // lookPng must still be present and be a Buffer (existing GR1 contract)
  assert.ok(r.lookPng instanceof Buffer,
    'lookPng must be a Buffer (soft-raster result) even in default mode');
});

// ---- (b) renderReal=true but puppeteer unavailable → graceful fallback --------

test('renderReal=true, puppeteer unavailable → soft-raster fallback, GR1 passes, result.ok true', async () => {
  const tmpHtml = path.join(tmpdir(), `tg-test-${randomUUID()}.html`);
  writeFileSync(tmpHtml, '<html><body><p>minimal</p></body></html>');
  try {
    const scene = makeScene();
    const r = await runGuard(scene, 'test intent', {
      renderReal: true,
      artifactPath: tmpHtml,
      loadPuppeteer: async () => null, // force "unavailable" deterministically (env-independent)
    });
    assert.equal(r.renderMode, 'soft-raster',
      'renderMode must be soft-raster when puppeteer is unavailable');
    assert.equal(r.rails.gr1.ok, true,
      'GR1 must still pass after cheap-render fallback');
    assert.ok(r.ok,
      'overall guard result must still be ok after fallback');
    // No realImagePath on fallback
    assert.equal(r.realImagePath, undefined,
      'no realImagePath when render fell back to soft-raster');
  } finally {
    unlinkSync(tmpHtml);
  }
});

// ---- (c) cheapRender never throws — always returns a result -------------------

test('cheapRender with non-existent path: never throws, returns soft-raster fallback', async () => {
  let threw = false;
  let result;
  try {
    result = await cheapRender('/nonexistent/path/gr1-fake.html', { timeoutMs: 1000 });
  } catch {
    threw = true;
  }
  assert.equal(threw, false, 'cheapRender must never throw');
  assert.equal(result.renderMode, 'soft-raster',
    'renderMode must be soft-raster on error');
  assert.equal(result.imagePath, null,
    'imagePath must be null when render failed');
  assert.ok(typeof result.elapsedMs === 'number' && result.elapsedMs >= 0,
    'elapsedMs must be a non-negative number');
});

test('cheapRender with a valid HTML but no puppeteer: never throws, returns soft-raster', async () => {
  const tmpHtml = path.join(tmpdir(), `cr-test-${randomUUID()}.html`);
  writeFileSync(tmpHtml, '<html><body><canvas id="c"></canvas></body></html>');
  let threw = false;
  let result;
  try {
    result = await cheapRender(tmpHtml, { timeoutMs: 5000, loadPuppeteer: async () => null });
  } catch {
    threw = true;
  } finally {
    try { unlinkSync(tmpHtml); } catch { /* ignore */ }
  }
  assert.equal(threw, false, 'cheapRender must never throw');
  // When puppeteer is absent renderMode must be soft-raster; when present it may be webgl.
  assert.ok(['webgl', 'soft-raster'].includes(result.renderMode),
    `renderMode must be 'webgl' or 'soft-raster', got '${result.renderMode}'`);
  assert.ok(result.imagePath === null || typeof result.imagePath === 'string',
    'imagePath must be null or a string path');
});

// ---- (d) Flag threading: renderReal=false explicit → no real render -----------

test('renderReal=false (explicit): renderMode is soft-raster, existing contract unchanged', async () => {
  const scene = makeScene('explicit-false intent');
  const r = await runGuard(scene, 'explicit-false intent', { renderReal: false });
  assert.equal(r.renderMode, 'soft-raster',
    'explicit renderReal=false must use soft-raster');
  assert.equal(r.realImagePath, undefined,
    'no realImagePath when renderReal=false');
  // All four rails still present
  assert.ok('gr1' in r.rails, 'gr1 must be present');
  assert.ok('gr2' in r.rails, 'gr2 must be present');
  assert.ok('gr3' in r.rails, 'gr3 must be present');
  assert.ok('gr4' in r.rails, 'gr4 must be present');
});

// ---- (e) renderReal=true but no artifactPath → still safe, soft-raster --------

test('renderReal=true but no artifactPath: soft-raster fallback, no crash', async () => {
  const scene = makeScene();
  const r = await runGuard(scene, 'test intent', { renderReal: true });
  assert.equal(r.renderMode, 'soft-raster',
    'renderMode must be soft-raster when no artifactPath is given');
  assert.ok(r.ok, 'guard must pass when scene is clean and no artifactPath is given');
});

// ---- (f) GR1 renderMode field propagated into rails.gr1 -----------------------

test('rails.gr1.renderMode reflects the actual renderMode used', async () => {
  const scene = makeScene();
  const r = await runGuard(scene, 'test intent');
  assert.equal(r.rails.gr1.renderMode, 'soft-raster',
    'rails.gr1.renderMode must match the actual renderMode');
});

// ---- (g) webgl path via an injected FAKE puppeteer (no GPU, no real browser) ---
// The fake never produces real pixels — it writes a stub file so we can assert the
// SUCCESS WIRING (renderMode 'webgl', imagePath set) deterministically in CI.

test('cheapRender webgl path: injected fake puppeteer → renderMode webgl + imagePath', async () => {
  const tmpHtml = path.join(tmpdir(), `cr-webgl-${randomUUID()}.html`);
  writeFileSync(tmpHtml, '<html><body><canvas id="c"></canvas></body></html>');
  const fakePuppeteer = {
    launch: async () => ({
      newPage: async () => ({
        setViewport: async () => {},
        goto: async () => {},
        screenshot: async ({ path: p }) => { writeFileSync(p, Buffer.from('PNGSTUB')); },
      }),
      close: async () => {},
    }),
  };
  let result;
  try {
    result = await cheapRender(tmpHtml, { timeoutMs: 8000, loadPuppeteer: async () => fakePuppeteer });
    assert.equal(result.renderMode, 'webgl', 'renderMode must be webgl when the render succeeds');
    assert.ok(result.imagePath, 'imagePath must be set on a successful render');
    assert.ok(existsSync(result.imagePath), 'the image file must exist on a successful render');
  } finally {
    try { unlinkSync(tmpHtml); } catch { /* ignore */ }
    if (result?.imagePath) { try { unlinkSync(result.imagePath); } catch { /* ignore */ } }
  }
});
