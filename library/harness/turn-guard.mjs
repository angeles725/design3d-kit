// library: turn-guard (harness/turn-guard.mjs) — thin GR1–GR4 runner (v1.20).
// CLI: node turn-guard.mjs <artifactPath> [--budget-ms N]
// Reads scene from <artifact>.scene.json (if present) else AABB-only from objects[].size.
// Prints 4 one-line verdicts + elapsedMs. Exits nonzero on any FAIL.
// Export: runGuard(scene, intent, opts) → {ok, rails:{gr1,gr2,gr3,gr4}, elapsedMs, lookPng}
//
// NOTE on pass-parity opts: objects here lack ports/portDN/fieldProvenance, so we disable
// those checks (requireDN:false, requireProv:false) for the anti-invention AABB gate.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

import { rasterize } from './soft-raster.mjs';
import { worldToModel, modelToWorld } from '../parts/axis-contract.mjs';
import { checkPassParity } from './pass-parity.mjs';
import { meshIntegrity } from './geom-verify.mjs';

// ---- GR1: visual raster + numeric integrity ------------------------------------

function runGR1(scene) {
  const { lookPng, elapsedMs: rasterMs } = rasterize(scene);
  const insideOut = [];
  for (const obj of (scene.objects || [])) {
    if (obj.positions && obj.index) {
      const r = meshIntegrity(obj.positions, obj.index);
      if (r.insideOut) insideOut.push({ id: obj.id, signedVolume: r.signedVolume });
    }
  }
  const ok = insideOut.length === 0;
  return { ok, insideOut, rasterMs, lookPng };
}

// ---- GR2: axis-contract round-trip ---------------------------------------------

function runGR2(h, D) {
  // Test several representative world points
  const testPts = [[1.3, 2.7, 3.1], [0.0, 0.0, 0.0], [5.5, 7.2, 8.9]];
  for (const p of testPts) {
    const v = worldToModel(p, h, D);
    const back = modelToWorld(v, h, D);
    for (let i = 0; i < 3; i++) {
      if (Math.abs(back[i] - p[i]) > h / 2 + 1e-9) {
        return { ok: false, reason: 'world-to-model-to-world failed', point: p, recovered: back };
      }
    }
    const v2 = worldToModel(back, h, D);
    for (let i = 0; i < 3; i++) {
      if (v2[i] !== v[i]) {
        return { ok: false, reason: 'model-to-world-to-model failed', voxel: v, recovered: v2 };
      }
    }
  }
  return { ok: true };
}

// ---- GR3: bbox anti-invention (pass-parity extra set) ---------------------------

function runGR3(scene, h) {
  const source = scene.source ?? { objects: scene.objects ?? [] };
  const built  = scene.built  ?? { objects: scene.objects ?? [] };
  const result = checkPassParity(source, built, { posTol: h, requireDN: false, requireProv: false });
  const ok = result.extra.length === 0 && result.ok;
  return { ok, extra: result.extra, missing: result.missing, drifts: result.drifts };
}

// ---- GR4: spec lock (intent pinned + unchanged) ---------------------------------

function runGR4(intent, pinnedIntent) {
  if (!intent || String(intent).trim() === '') {
    return { ok: false, reason: 'missing-or-empty' };
  }
  if (pinnedIntent != null && pinnedIntent !== intent) {
    return { ok: false, reason: 'intent-changed', expected: pinnedIntent, actual: intent };
  }
  return { ok: true };
}

// ---- Derive scene depth from objects -------------------------------------------

function sceneDepth(scene, h) {
  let maxZ = h; // minimum 1 voxel
  for (const obj of (scene.objects || [])) {
    if (obj.center && obj.size) maxZ = Math.max(maxZ, obj.center[2] + obj.size[2] / 2);
  }
  // Also check source/built objects
  for (const sub of [scene.source, scene.built]) {
    for (const obj of (sub?.objects || [])) {
      if (obj.center && obj.size) maxZ = Math.max(maxZ, obj.center[2] + obj.size[2] / 2);
    }
  }
  return Math.max(h, Math.ceil(maxZ / h) * h);
}

// ---- Main exported API ---------------------------------------------------------

/**
 * Run all four guard-rails against a scene and intent.
 *
 * @param {{intent?:string, voxelSize?:number, source?:{objects:object[]}, built?:{objects:object[]}, objects?:object[]}} scene
 * @param {string|null} intent   The current turn's intent string.
 * @param {{budgetMs?:number}} [opts]
 * @returns {{ok:boolean, rails:{gr1,gr2,gr3,gr4}, elapsedMs:number, lookPng:Buffer}}
 */
export async function runGuard(scene, intent, opts = {}) {
  const { budgetMs = 30000 } = opts;
  const h = scene.voxelSize ?? 1;
  const D = sceneDepth(scene, h);
  const startTime = Date.now();

  const gr1 = runGR1(scene);
  const gr2 = runGR2(h, D);
  const gr3 = runGR3(scene, h);
  // pinnedIntent: from scene descriptor (specced at turn start)
  const pinnedIntent = scene.intent ?? scene.__intent ?? null;
  const gr4 = runGR4(intent, pinnedIntent);

  const elapsedMs = Date.now() - startTime;
  const budgetOk = elapsedMs < budgetMs;

  const ok = gr1.ok && gr2.ok && gr3.ok && gr4.ok && budgetOk;
  return { ok, rails: { gr1, gr2, gr3, gr4 }, elapsedMs, lookPng: gr1.lookPng };
}

// ---- CLI entrypoint ------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    process.stderr.write('Usage: node turn-guard.mjs <artifactPath> [--budget-ms N]\n');
    process.exit(1);
  }

  // Parse --budget-ms
  let budgetMs = 30000;
  const bmIdx = args.indexOf('--budget-ms');
  if (bmIdx !== -1 && args[bmIdx + 1]) budgetMs = Number(args[bmIdx + 1]);

  const rawPath = args[0];

  // Resolve to absolute (never chdir)
  const artifactPath = path.resolve(rawPath);

  // Validate extension
  const ext = path.extname(artifactPath).toLowerCase();
  if (ext !== '.html' && ext !== '.json') {
    process.stderr.write(`[turn-guard] FAIL: unsupported extension "${ext}" — only .html and .json accepted\n`);
    process.exit(1);
  }

  // Validate file exists
  if (!existsSync(artifactPath)) {
    process.stderr.write(`[turn-guard] FAIL: artifact not found: ${artifactPath}\n`);
    process.exit(1);
  }

  // Load scene: try sibling <artifact>.scene.json first, else parse artifact directly
  let scene;
  const siblingScene = artifactPath.replace(/(\.[^.]+)$/, '.scene.json');
  if (existsSync(siblingScene)) {
    scene = JSON.parse(readFileSync(siblingScene, 'utf8'));
  } else {
    // AABB-only fallback: parse artifact JSON
    try {
      const raw = JSON.parse(readFileSync(artifactPath, 'utf8'));
      scene = raw;
    } catch {
      process.stderr.write(`[turn-guard] FAIL: could not parse artifact as JSON: ${artifactPath}\n`);
      process.exit(1);
    }
  }

  // Read intent from scene (pinned at spec time)
  const intent = scene.intent ?? scene.__intent ?? null;

  const result = await runGuard(scene, intent, { budgetMs });

  // Print 4 one-line verdicts
  const fmt = (name, r) => `${name} ${r.ok ? 'PASS' : 'FAIL'}${r.ok ? '' : ` — ${r.reason ?? JSON.stringify(r.extra ?? r.drifts ?? '')}`}`;
  console.log(fmt('GR1', result.rails.gr1));
  console.log(fmt('GR2', result.rails.gr2));
  console.log(fmt('GR3', result.rails.gr3));
  console.log(fmt('GR4', result.rails.gr4));
  console.log(`elapsedMs ${result.elapsedMs}`);

  if (!result.ok) process.exit(1);
}

// Run CLI only when invoked directly
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}

import { fileURLToPath } from 'node:url';
