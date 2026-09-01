// library: cheap-render (harness/cheap-render.mjs) — optional cheap WebGL capture (GR1, v1.0).
//
// OPT-IN. Call cheapRender(htmlPath, opts) to attempt one headless capture at DPR-1 / 512px.
// Always returns a result object — NEVER throws, NEVER blocks, NEVER makes GR1 slower by default.
//
// Graceful fallback: if puppeteer is absent, the file doesn't exist, the timeout fires, or any
// error occurs → returns { imagePath: null, renderMode: 'soft-raster', elapsedMs }.
//
// Deps (optional, runtime-detected): puppeteer. Node built-ins only: http, fs, os, crypto, path.
// NO puppeteer import at the module level — this file is safe to import from pure-core paths.

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

// ---- Puppeteer availability (lazy, runtime-only) --------------------------------

/**
 * Attempt to dynamically import puppeteer. Returns the default export (the puppeteer namespace)
 * or null when the package is not installed.
 * @returns {Promise<object|null>}
 */
async function tryLoadPuppeteer() {
  try {
    const mod = await import('puppeteer');
    // puppeteer exports { launch, ... } as named exports or default
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

// ---- Minimal local HTTP server (single-file) ------------------------------------

/**
 * Spin up a local HTTP server that serves one HTML file on an OS-chosen port.
 * Returns { url, close } where close() shuts the server down.
 * @param {string} htmlPath
 * @returns {Promise<{ url: string, close: () => void }>}
 */
function serveHtmlFile(htmlPath) {
  return new Promise((resolve, reject) => {
    let content;
    try { content = readFileSync(htmlPath); } catch (e) { return reject(e); }

    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}/`, close: () => server.close() });
    });
  });
}

// ---- Main export ----------------------------------------------------------------

/**
 * Take a cheap headless WebGL capture of an HTML artifact.
 *
 * Spec:
 *   - DPR-1, resolution `opts.res` × `opts.res` (default 512 px)
 *   - Single iso/default view — no camera manipulation beyond waiting for render
 *   - Hard timeout `opts.timeoutMs` (default 25 000 ms)
 *   - Served over local HTTP (127.0.0.1) to avoid file:// CORS restrictions
 *   - SwiftShader flags so it runs in headless/no-GPU environments
 *
 * @param {string} htmlPath  Absolute (or resolvable) path to the HTML artifact.
 * @param {{ timeoutMs?: number, res?: number }} [opts]
 * @returns {Promise<{ imagePath: string|null, renderMode: 'webgl'|'soft-raster', elapsedMs: number }>}
 */
export async function cheapRender(htmlPath, opts = {}) {
  const { timeoutMs = 25000, res = 512 } = opts;
  const t0 = Date.now();

  /** Always-safe fallback — never throws. */
  const fallback = () => ({
    imagePath: null,
    renderMode: /** @type {'soft-raster'} */ ('soft-raster'),
    elapsedMs: Date.now() - t0,
  });

  // Guard: file must exist before we even try
  if (!existsSync(htmlPath)) return fallback();

  // Guard: puppeteer must be loadable
  const puppeteer = await tryLoadPuppeteer();
  if (!puppeteer) return fallback();

  let server = null;
  let browser = null;

  try {
    // 1) Serve the HTML over local HTTP
    server = await serveHtmlFile(htmlPath);

    // 2) Race the capture against the hard timeout
    const captureP = (async () => {
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          // SwiftShader software renderer — works without a GPU
          '--use-gl=swiftshader',
          '--enable-webgl',
          '--enable-unsafe-swiftshader',
          '--ignore-gpu-blacklist',
          // Shared-memory workaround for Docker/WSL2
          '--disable-dev-shm-usage',
        ],
      });
      const page = await browser.newPage();
      await page.setViewport({ width: res, height: res, deviceScaleFactor: 1 });

      // Navigation: leave at least 2 s for the timeout guard itself
      const navTimeout = Math.max(1000, timeoutMs - 3000);
      await page.goto(server.url, { waitUntil: 'networkidle0', timeout: navTimeout });

      // Brief settle so Three.js gets at least one render frame
      await new Promise(r => setTimeout(r, 1500));

      const outPath = path.join(tmpdir(), `gr1-cheaprender-${randomUUID()}.png`);
      await page.screenshot({ path: outPath });
      return outPath;
    })();

    const timeoutP = new Promise((_, rej) =>
      setTimeout(() => rej(new Error('cheap-render: hard timeout')), timeoutMs)
    );

    const imagePath = await Promise.race([captureP, timeoutP]);
    return { imagePath, renderMode: /** @type {'webgl'} */ ('webgl'), elapsedMs: Date.now() - t0 };

  } catch {
    // Any error (timeout, launch failure, navigation error, …) → graceful fallback
    return fallback();
  } finally {
    // Always clean up resources, ignoring secondary errors
    if (browser) { try { await browser.close(); } catch { /* ignore */ } }
    if (server)  { try { server.close(); }        catch { /* ignore */ } }
  }
}
