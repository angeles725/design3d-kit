#!/usr/bin/env node
// capture-gc.mjs — artifact hygiene for a design3d design dir (or a flat catalog of them).
// Closes the SKILL v1.8 DEFERRED item ("a toolbelt capture-gc sweep script") and implements the
// GATES.md §"Capture cleanup (on gate close)" contract as a runnable tool.
//
// WHAT IT DOES, per asset dir A (a dir containing runs/):
//   1) PROMOTE the passing representative's review to the canonical <slug>.review.json (additive —
//      the flat catalog copies <slug>.png/.console.json but never the review, so the gate verdict +
//      mechanical.color_delta_e00 evidence has no canonical home). Never overwrites an existing one.
//   2) PRUNE scratch capture frames: superseded (non-passing) <pass>-attempt<N>.{png,console.json}
//      and per-shot working frames <pass>-attempt<N>-<suffix>.{png,console.json} whose representative
//      already passed. These are throwaway QA iterations, safe to drop.
//
// WHAT IT NEVER TOUCHES (load-bearing — deleting these silently rewrites gate history):
//   * the PASSING attempt's <pass>[-l<L>]-attempt<N>.png / .console.json in the active lineage —
//     gate-state.mjs:125 derives "passed" from that EXACT basename existing (LEARNINGS.md:73). The
//     canonical <slug>.png is only a byte-copy of it and does NOT satisfy that check.
//   * any *.review.json (all attempts, all lineages) — GATES.md:392 "keep ... ALL review JSONs".
//   * the canonical <slug>.{png,console.json,review.json}, progress.yaml, *.md, *.log, *.yaml.
//   * anything in a subdirectory (history/, assets/): GC operates only on flat runs/ files here.
//   * an asset with no canonical <slug>.png (unfinalized) — SKIPPED, never GC'd (fail-safe).
//
// NOT DONE HERE (staged proposal — needs the propose->promote protocol, SELF-IMPROVEMENT.md): the
// <slug>.png <-> passing-attempt.png byte-twin dedup. Removing the attempt twin needs gate-state to
// accept the canonical <slug>.{png,review.json} as a valid pass witness first; until that contract
// change is promoted, this tool KEEPS the twin.
//
// Usage:
//   node capture-gc.mjs <dir> [--apply]
//     <dir> either contains runs/ (single asset) OR is a catalog root whose <dir>/*/ contain runs/.
//   Dry-run by default (reports "would prune"); --apply performs the deletes/promotes.
// Exit: 0 = swept (report printed) · 1 = zero asset dirs resolved (false-green guard) or apply I/O
//   error · 2 = bad args. Emits a census: promoted N / pruned N files / bytes freed.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const root = args.find((a) => !a.startsWith('--'));
if (!root || !fs.existsSync(root)) {
  console.error('usage: node capture-gc.mjs <dir> [--apply]   (<dir> holds runs/, or is a catalog of such dirs)');
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

let totPromoted = 0, totPruned = 0, totBytes = 0, ioError = false, skipped = 0;
const lines = [];

for (const A of dirs.sort()) {
  const slug = path.basename(A);
  const runs = path.join(A, 'runs');
  const canonicalPng = path.join(runs, `${slug}.png`);
  if (!fs.existsSync(canonicalPng)) { skipped++; lines.push(`  ${slug}: SKIP (no canonical ${slug}.png — unfinalized)`); continue; }
  const canonMd5 = md5(canonicalPng);

  const entries = fs.readdirSync(runs, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);

  // Protected passing-rep gate bases: a <base>.review.json with verdict PASS whose sibling <base>.png exists.
  const protectedBases = new Set();
  let promoteBase = null; // the rep whose png == canonical (the shot copied to <slug>.png)
  for (const name of entries) {
    const m = name.match(RE_GATE);
    if (!m || m[4] !== 'review.json') continue;
    const base = name.slice(0, -('.review.json'.length));
    const siblingPng = path.join(runs, `${base}.png`);
    let verdict = null;
    try { verdict = JSON.parse(fs.readFileSync(path.join(runs, name), 'utf8')).verdict; } catch { /* keep on parse fail */ }
    if (verdict === 'PASS' && fs.existsSync(siblingPng)) {
      protectedBases.add(base);
      if (md5(siblingPng) === canonMd5) promoteBase = base;
    } else {
      // A review that is not a confirmed PASS-with-png: keep its base protected too (never delete a
      // frame we cannot prove is superseded). Only frames with NO owning review are freely prunable.
      protectedBases.add(base);
    }
  }

  // 1) PROMOTE the representative review -> canonical <slug>.review.json (additive, never overwrite).
  const canonicalReview = path.join(runs, `${slug}.review.json`);
  if (promoteBase && !fs.existsSync(canonicalReview)) {
    lines.push(`  ${slug}: promote ${promoteBase}.review.json -> ${slug}.review.json`);
    if (apply) { try { fs.copyFileSync(path.join(runs, `${promoteBase}.review.json`), canonicalReview); } catch (e) { ioError = true; lines.push(`    ! promote failed: ${e.message}`); } }
    totPromoted++;
  }

  // 2) PRUNE scratch frames.
  for (const name of entries) {
    if (name === `${slug}.png` || name === `${slug}.console.json`) continue; // canonical copies
    const fm = name.match(RE_FRAME);
    if (!fm) continue;                 // not a capture frame (reviews, yaml, md, log … all skipped)
    const gateBase = fm[1];            // <pass>[-l<L>]-attempt<N>
    const suffixed = !!fm[2];          // per-shot working frame (…-attempt<N>-<suffix>)
    // Prune iff: a per-shot working frame (always scratch), OR an un-suffixed frame whose gate base
    // is NOT a protected passing/owned rep (a superseded attempt).
    const prunable = suffixed || !protectedBases.has(gateBase);
    if (!prunable) continue;
    const p = path.join(runs, name);
    let sz = 0; try { sz = fs.statSync(p).size; } catch { /* ignore */ }
    lines.push(`  ${slug}: prune ${name} (${(sz / 1024).toFixed(0)} KB)`);
    totPruned++; totBytes += sz;
    if (apply) { try { fs.unlinkSync(p); } catch (e) { ioError = true; lines.push(`    ! unlink failed: ${e.message}`); } }
  }
}

const mode = apply ? 'APPLIED' : 'DRY-RUN (use --apply to perform)';
console.log(`capture-gc [${mode}] — ${dirs.length} asset dir(s), ${skipped} skipped`);
for (const l of lines) console.log(l);
console.log(`census: promoted ${totPromoted} review(s) / pruned ${totPruned} file(s) / ${(totBytes / 1024 / 1024).toFixed(2)} MB`);
process.exit(ioError ? 1 : 0);
