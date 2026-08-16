#!/usr/bin/env node
// capture-gc.mjs — artifact hygiene for a design3d design dir (or a flat catalog of them).
// Closes the SKILL v1.8 DEFERRED item ("a toolbelt capture-gc sweep script") and implements the
// GATES.md §"Capture cleanup (on gate close)" contract as a runnable tool.
//
// WHAT IT DOES, per asset dir A (a dir containing runs/):
//   1) PROMOTE the passing representative's review to the canonical <slug>.review.json (additive —
//      the flat catalog copies <slug>.png/.console.json but never the review, so the gate verdict +
//      mechanical.color_delta_e00 evidence has no canonical home). Never overwrites an existing one.
//   2) PRUNE capture frames by the EVIDENCE vs EPHEMERAL rule (GATES.md §Capture lifecycle):
//      A) FAIL-attempt frames: ALL png/console.json of any attempt whose review.json has a non-PASS
//         verdict are prunable ("delete superseded attempt PNGs/consoles" — GATES). The review.json
//         is always kept. gate-state derives pass state from the PASSING attempt's exact basename, so
//         FAIL-attempt PNGs are not load-bearing and safe to drop.
//      B) PASS-attempt byte-twins: a suffixed frame (e.g. attempt3-mesh.png) that is byte-identical
//         to the passing representative (attempt3.png) is a redundant copy — PRUNE. Distinct-view
//         frames (attempt3-open.png with different content) are EVIDENCE cited by the review —
//         KEEP.
//      C) No-review-owner frames: attempt frames with no sibling review.json are scratch — PRUNE.
//
// WHAT IT NEVER TOUCHES (load-bearing — deleting these silently rewrites gate history):
//   * the PASSING attempt's <pass>[-l<L>]-attempt<N>.png / .console.json — gate-state.mjs derives
//     "passed" from that EXACT basename. Never deleted (unsuffixed rep of a passBase).
//   * any *.review.json (all attempts, all lineages) — GATES.md §Capture cleanup "keep ALL review JSONs".
//   * distinct-view suffixed frames of a passing attempt (md5 ≠ representative png) — EVIDENCE.
//   * the canonical <slug>.{png,console.json,review.json}, progress.yaml, *.md, *.log, *.yaml.
//   * anything in a subdirectory (history/, assets/): GC operates only on flat runs/ files here.
//
// FULL-LADDER DESIGNS (per-pass names, no canonical <slug>.png — e.g. disenos/homelab/rack-cabinet):
//   The PRUNE step runs with the same pass/fail/no-owner policy above. The PROMOTE step is
//   flat-catalog-only and is skipped. Census line shows N full-ladder (prune-only).
//
// --dedup (opt-in): ADDITIONALLY prune the flat-catalog passing rep's unsuffixed PNG (the
//   <pass>-attempt<N>.png that is a byte-identical copy of <slug>.png). Safe because gate-state.mjs
//   now accepts the promoted canonical <slug>.{png,review.json} as a pass witness. Only fires when
//   the rep review is promoted this run (promoteBase); the .review.json is always kept.
//
// Usage:
//   node capture-gc.mjs <dir> [--apply] [--dedup]
//     <dir> either contains runs/ (single asset) OR is a catalog root whose <dir>/*/ contain runs/.
//   Dry-run by default (reports "would prune"); --apply performs the deletes/promotes.
//   --dedup additionally removes the canonical byte-twin (~1 extra PNG per asset).
// Exit: 0 = swept (report printed) · 1 = zero asset dirs resolved (false-green guard) or apply I/O
//   error · 2 = bad args. Emits a census: promoted N / pruned N files / bytes freed.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dedup = args.includes('--dedup'); // also prune the passing rep's PNG byte-twin (gate-state
                                        // witnesses via the promoted canonical <slug>.{png,review.json})
const root = args.find((a) => !a.startsWith('--'));
if (!root || !fs.existsSync(root)) {
  console.error('usage: node capture-gc.mjs <dir> [--apply] [--dedup]   (<dir> holds runs/, or is a catalog of such dirs)');
  process.exit(2);
}

// Resolve the asset dirs to sweep: the UNION of the dir itself (if it holds runs/) and its immediate
// children that do. A catalog root (equipos/) can have its own runs/ (a catalog-preview) AND host
// per-asset child dirs — sweep both, so the base's own runs/ never masks the children.
function assetDirs(base) {
  const out = [];
  if (fs.existsSync(path.join(base, 'runs'))) out.push(base);
  for (const e of fs.readdirSync(base, { withFileTypes: true })) {
    if (e.isDirectory() && fs.existsSync(path.join(base, e.name, 'runs'))) out.push(path.join(base, e.name));
  }
  return out;
}

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
// Canonical gate artifact: <pass>[-l<L>]-attempt<N>.<ext>. The $-after-attempt<N> means a suffixed
// per-shot frame (…-attempt1-door.png) does NOT match here — those are handled as working frames.
const RE_GATE = /^(.+?)(?:-l(\d+))?-attempt(\d+)\.(png|console\.json|review\.json)$/;
// A capture frame we may prune: any attempt png/console, suffixed or not. Group 1 = the gate base
// (everything up to attempt<N>), group 2 = optional -<suffix>, group 3 = extension.
const RE_FRAME = /^(.+?-attempt\d+)(-[^.]+)?\.(png|console\.json)$/;

const dirs = assetDirs(root);
if (dirs.length === 0) {
  console.error(`capture-gc: no asset dir with runs/ under ${root} — refusing a vacuous green (false-green guard).`);
  process.exit(1);
}

let totPromoted = 0, totPruned = 0, totBytes = 0, ioError = false, fullLadder = 0;
const lines = [];

for (const A of dirs.sort()) {
  const slug = path.basename(A);
  const runs = path.join(A, 'runs');
  const canonicalPng = path.join(runs, `${slug}.png`);
  // Full-ladder design: per-pass names, no canonical <slug>.png. PRUNE still runs; PROMOTE skipped.
  const isFullLadder = !fs.existsSync(canonicalPng);
  if (isFullLadder) fullLadder++;
  const canonMd5 = isFullLadder ? null : md5(canonicalPng);

  const entries = fs.readdirSync(runs, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);

  // Classify reviewed bases into passBases (PASS verdict + sibling png exists) and failBases
  // (review present but NOT a confirmed PASS-with-png — verdict FAIL, parse error, or missing png).
  // passBaseMd5 stores md5(rep.png) per passBase for byte-twin detection among suffixed frames.
  const passBases   = new Set();  // keep rep png/console + distinct-view suffixed frames
  const failBases   = new Set();  // prune all frames (png/console, suffixed and unsuffixed)
  const passBaseMd5 = new Map();  // base → md5(base.png) — for suffixed byte-twin detection
  let promoteBase = null; // flat-catalog only: the rep whose png == canonical slug.png

  for (const name of entries) {
    const m = name.match(RE_GATE);
    if (!m || m[4] !== 'review.json') continue;
    const base = name.slice(0, -('.review.json'.length));
    const siblingPng = path.join(runs, `${base}.png`);
    let verdict = null;
    try { verdict = JSON.parse(fs.readFileSync(path.join(runs, name), 'utf8')).verdict; } catch { /* treat as non-PASS on parse fail */ }
    if (verdict === 'PASS' && fs.existsSync(siblingPng)) {
      passBases.add(base);
      const repMd5 = md5(siblingPng);
      passBaseMd5.set(base, repMd5);
      if (!isFullLadder && repMd5 === canonMd5) promoteBase = base;
    } else {
      // Non-PASS verdict, parse failure, or missing rep png: treat as superseded attempt.
      failBases.add(base);
    }
  }

  // 1) PROMOTE the representative review -> canonical <slug>.review.json (additive, never overwrite).
  const canonicalReview = path.join(runs, `${slug}.review.json`);
  if (!isFullLadder && promoteBase && !fs.existsSync(canonicalReview)) {
    lines.push(`  ${slug}: promote ${promoteBase}.review.json -> ${slug}.review.json`);
    if (apply) { try { fs.copyFileSync(path.join(runs, `${promoteBase}.review.json`), canonicalReview); } catch (e) { ioError = true; lines.push(`    ! promote failed: ${e.message}`); } }
    totPromoted++;
  }

  // 2) PRUNE capture frames by the evidence/ephemeral policy.
  for (const name of entries) {
    if (name === `${slug}.png` || name === `${slug}.console.json`) continue; // flat-catalog canonical copies
    const fm = name.match(RE_FRAME);
    if (!fm) continue;                // not a capture frame (reviews, yaml, md, log … all skipped)
    const gateBase = fm[1];           // <pass>[-l<L>]-attempt<N>
    const suffixed  = !!fm[2];        // per-shot working frame (…-attempt<N>-<suffix>)
    const ext       = fm[3];          // 'png' | 'console.json'

    let prunable = false;
    let label    = '';

    if (failBases.has(gateBase)) {
      // Superseded FAIL attempt: ALL frames (unsuffixed and suffixed, png and console.json) are
      // prunable — "delete superseded attempt PNGs/consoles" (GATES). The review.json is always
      // kept (RE_FRAME excludes review.json). gate-state only reads the PASS attempt's png, so
      // deleting FAIL attempt PNGs is safe.
      prunable = true;
      label    = ' [fail attempt]';
    } else if (passBases.has(gateBase)) {
      if (!suffixed) {
        // Unsuffixed rep (png or console.json): the gate artifact — keep.
        // Exception: --dedup prunes the flat-catalog rep whose content == canonical <slug>.png.
        // Guard on promoteBase so the canonical witness is guaranteed present before pruning.
        const isDedupTwin = dedup && promoteBase !== null && gateBase === promoteBase;
        prunable = isDedupTwin;
        if (isDedupTwin) label = ' [dedup twin]';
      } else if (ext === 'png') {
        // Suffixed png view: prune iff byte-identical to the rep (redundant copy).
        // Distinct-view frames (different content) are EVIDENCE cited by the review — keep.
        const repMd5   = passBaseMd5.get(gateBase);
        const frameMd5 = md5(path.join(runs, name));
        prunable = (repMd5 !== undefined && frameMd5 === repMd5);
        if (prunable) label = ' [byte-twin of rep]';
      }
      // Suffixed console.json: always keep (distinct execution record, not a view copy).
    } else {
      // No review owner: scratch frame not yet reviewed — prunable.
      prunable = true;
      label    = ' [no review owner]';
    }

    if (!prunable) continue;
    const p = path.join(runs, name);
    let sz = 0; try { sz = fs.statSync(p).size; } catch { /* ignore */ }
    lines.push(`  ${slug}: prune ${name} (${(sz / 1024).toFixed(0)} KB)${label}`);
    totPruned++; totBytes += sz;
    if (apply) { try { fs.unlinkSync(p); } catch (e) { ioError = true; lines.push(`    ! unlink failed: ${e.message}`); } }
  }
}

const mode = apply ? 'APPLIED' : 'DRY-RUN (use --apply to perform)';
console.log(`capture-gc [${mode}] — ${dirs.length} asset dir(s), ${fullLadder} full-ladder (prune-only)`);
for (const l of lines) console.log(l);
console.log(`census: promoted ${totPromoted} review(s) / pruned ${totPruned} file(s) / ${(totBytes / 1024 / 1024).toFixed(2)} MB`);
process.exit(ioError ? 1 : 0);
