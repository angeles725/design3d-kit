#!/usr/bin/env node
// gate-state.mjs — derive pass states from runs/ artifacts, semantically check PASS reviews,
// and report drift vs the progress.yaml cache. No deps. Usage: node gate-state.mjs <design-dir>
// Exit 0 = clean · exit 1 = drift or PASS-incoherence (progress.yaml is a CACHE; runs/ wins).
import fs from 'node:fs';
import path from 'node:path';

// Two track ladders (PIPELINE.md P4/P5). The blender ladder is selected when any review artifact
// names one of its exclusive passes (anim-rig / optimization-export) — otherwise threejs. A wrong
// ladder is not cosmetic: passes absent from it never derive, and their reviews report as drift.
const LADDER_THREEJS = ['blockout', 'structural', 'materials', 'surface', 'lighting-camera',
  'interaction-ui', 'optimization', 'p6-final'];
const LADDER_BLENDER = ['blockout', 'structural', 'materials', 'lighting-camera',
  'anim-rig', 'optimization-export', 'p6-final'];
const IMPORTANT_MIN = 0.65, SCORE_TOL = 0.005;

const dir = process.argv[2];
if (!dir || !fs.existsSync(path.join(dir, 'runs'))) {
  console.error('usage: node gate-state.mjs <design-dir>   (must contain runs/)');
  process.exit(2);
}
const runsDir = path.join(dir, 'runs');

// ---- collect review JSONs recursively -------------------------------------------------------
// Artifact name: `<pass>[-l<lineage>]-attempt<N>.review.json`
//
// A LINEAGE RESET (a user-authorized fresh start after the 3-attempt stop rule, e.g.
// `Silhouette Reset`, `Material Realism Reset`) is NOT attempt 4: it opens a new lineage with a
// fresh retry budget and inherits no score and no verdict. Without modelling that, this checker
// reads the exhausted lineage's FAIL reviews and reports `drift` against a legitimately reset
// cache — a false alarm on a correct state. The ACTIVE lineage is the highest one present;
// earlier lineages are superseded history (archive them under `history/<pass>-lineage-<n>/`).
const reviews = []; // {file, base, dir, prefix, lineage, attempt, json}
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    // history/ holds superseded lineages by convention — it is an archive, not live state.
    if (e.isDirectory()) { if (e.name !== 'history') walk(p); continue; }
    const m = e.name.match(/^(.+?)(?:-l(\d+))?-attempt(\d+)\.review\.json$/);
    if (!m) continue;
    let json = null;
    try { json = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { /* reported below */ }
    reviews.push({
      file: p,
      base: e.name.replace(/\.review\.json$/, ''),
      dir: d,
      prefix: m[1],
      lineage: m[2] ? +m[2] : 1,
      attempt: +m[3],
      json,
    });
  }
})(runsDir);

const problems = [];

// ---- spec global_min (loose YAML read; the checker previously never verified global_score) ----
// GATES.md verdict formula includes `global_score >= quality_contract.global_min`; without this
// read, a PASS review with a sub-minimum global sails through the checker silently (audit D7).
// Retrofit designs without a spec fall back to each review's own `assumed_thresholds.global_min`.
let specGlobalMin = null;
// OPTIONAL `colorTarget.deltaE00Max` — the objective material-colour gate (research/threejs-block53).
// gate-state does NOT measure pixels (it stays dependency-free): the material-color-probe.mjs harness
// measures the render crop at review time and records `mechanical.color_delta_e00` (CIEDE2000 vs the
// spec-declared target); here we only read the THRESHOLD and enforce the recorded number.
let specDeltaE00Max = null;
// OPTIONAL `gate_passes:` — an EXPLICIT declared pass-subset for a flat-catalog run (N independent
// simple assets, each closing on one gate, e.g. `gate_passes: [materials]`). When present the
// derivation ladder becomes exactly this subset in canonical order, and progress.yaml is only
// expected to cover it. ABSENT → the full in-order ladder, byte-identical to before (pure superset).
// It is NOT derived from complexity.tier — a subset is only ever active when the spec declares it.
let gatePasses = null;
const specPath = path.join(dir, 'design-spec.yaml');
if (fs.existsSync(specPath)) {
  const specText = fs.readFileSync(specPath, 'utf8');
  const m = specText.match(/^\s*global_min:\s*([\d.]+)\s*$/m);
  if (m) specGlobalMin = Number(m[1]);
  const dm = specText.match(/^\s*deltaE00Max:\s*([\d.]+)\s*$/m);
  if (dm) specDeltaE00Max = Number(dm[1]);
  // Loose YAML like global_min above: inline `gate_passes: [a, b]` or a block list of `- a` lines.
  const inline = specText.match(/^\s*gate_passes:\s*\[([^\]]*)\]\s*$/m);
  if (inline) {
    gatePasses = inline[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  } else if (/^\s*gate_passes:\s*$/m.test(specText)) {
    const lines = specText.split('\n');
    gatePasses = [];
    for (let i = lines.findIndex((l) => /^\s*gate_passes:\s*$/.test(l)) + 1; i < lines.length; i++) {
      const mm = lines[i].match(/^\s*-\s*(['"]?)([\w-]+)\1\s*$/);
      if (mm) gatePasses.push(mm[2]); else break; // block list is contiguous; first non-item ends it
    }
  }
  if (gatePasses && gatePasses.length === 0) gatePasses = null;
}

// ---- (a) derive ladder pass states (stop at first incomplete) --------------------------------
const BASE_LADDER = reviews.some((r) => r.prefix === 'anim-rig' || r.prefix === 'optimization-export')
  ? LADDER_BLENDER : LADDER_THREEJS;
let LADDER = BASE_LADDER;
if (gatePasses) {
  // Validate each declared name against the real track ladder; an unknown name is a hard error,
  // like the existing unknown-ladder-pass check on the progress.yaml cache below.
  for (const name of gatePasses) {
    if (!BASE_LADDER.includes(name)) {
      problems.push(`spec gate_passes declares unknown ladder pass '${name}' (not in the ${BASE_LADDER === LADDER_BLENDER ? 'blender' : 'threejs'} ladder)`);
    }
  }
  // The subset kept strictly in canonical ladder order; passes outside it are simply absent
  // (not derived, never reported as locked).
  LADDER = BASE_LADDER.filter((p) => gatePasses.includes(p));
}
const forPass = (pass) => reviews.filter((r) =>
  r.prefix === pass || (pass === 'p6-final' && r.prefix === 'final'));
const derived = {}; // pass -> {status, attempts, score}
let blocked = false;
for (const pass of LADDER) {
  const all = forPass(pass);
  if (blocked) { derived[pass] = { status: 'locked' }; continue; }
  // Derive from the ACTIVE lineage only. Earlier lineages were reset away: their attempts do not
  // count against the current retry budget and their failures do not block.
  const activeLineage = all.length ? Math.max(...all.map((r) => r.lineage)) : 1;
  const rs = all.filter((r) => r.lineage === activeLineage);
  const passing = rs.filter((r) => r.json && r.json.verdict === 'PASS' &&
    fs.existsSync(path.join(r.dir, r.base + '.png')));
  if (passing.length === 0) {
    derived[pass] = { status: rs.length ? `failed(${rs.length})` : 'locked', lineage: activeLineage };
    blocked = true;
  } else {
    const best = passing.sort((a, b) => b.attempt - a.attempt)[0];
    derived[pass] = {
      status: 'passed',
      attempts: Math.max(...rs.map((r) => r.attempt)),
      score: best.json.global_score,
      lineage: activeLineage,
    };
  }
}

// ---- (c) semantic PASS coherence on every PASS review ----------------------------------------
for (const r of reviews) {
  const j = r.json;
  if (!j) { problems.push(`unparseable review JSON: ${r.file}`); continue; }
  if (j.verdict !== 'PASS') continue;
  const where = path.relative(dir, r.file);
  for (const f of j.features || []) {
    if (f.score < f.threshold) problems.push(`${where}: PASS but critical '${f.id}' ${f.score} < threshold ${f.threshold}`);
  }
  if ((j.important_features || []).length) {
    const avg = j.important_average ??
      j.important_features.reduce((s, f) => s + f.score, 0) / j.important_features.length;
    if (avg < IMPORTANT_MIN) problems.push(`${where}: PASS but important_average ${avg.toFixed(2)} < ${IMPORTANT_MIN}`);
  }
  // A red invariant suite blocks the gate (GATES.md §Gate steps 1). `tests: null` = no suite,
  // which is the Blender track's normal value — absent is fine, failing is not.
  const t = j.mechanical?.tests;
  if (t && Number(t.fail) > 0) {
    problems.push(`${where}: PASS but invariant suite is RED (${t.fail} failing)`);
  }
  if (!j.mechanical || j.mechanical.console_clean !== true || j.mechanical.budget_pass !== true) {
    problems.push(`${where}: PASS but mechanical not green (console_clean/budget_pass)`);
  }
  if (!fs.existsSync(path.join(r.dir, r.base + '.png'))) {
    problems.push(`${where}: PASS but screenshot ${r.base}.png missing`);
  }
  const gmin = specGlobalMin ?? j.assumed_thresholds?.global_min ?? null;
  if (gmin === null) {
    // GATES.md §Retrofit gate: a spec-less design MUST either get a minimal design-spec.yaml or
    // record assumed_thresholds in the review. A PASS carrying NEITHER has nothing bounding its
    // global_score — flag it as a contract violation, never silently skip the global-min check.
    problems.push(`${where}: PASS but no resolvable global_min (no spec quality_contract.global_min, no assumed_thresholds.global_min) — contract violation, GATES.md §Retrofit gate`);
  } else if (Number.isFinite(j.global_score) && j.global_score < gmin - SCORE_TOL) {
    problems.push(`${where}: PASS but global_score ${j.global_score} < global_min ${gmin}`);
  }
  // OBJECTIVE material-colour gate (research/threejs-block53): when the spec declares a
  // colorTarget.deltaE00Max, the material-read judgement stops being a reviewer guess (measured
  // reviewer variance: an identical stainless render scored 0.80 PASS vs 0.57 FAIL). The probe records
  // mechanical.color_delta_e00 (CIEDE2000 vs the target); a colour-gated PASS (materials/surface) that
  // declares the threshold but carries no measurement is a contract violation, like the global_min gap.
  if (specDeltaE00Max !== null && (r.prefix === 'materials' || r.prefix === 'surface')) {
    const de = j.mechanical?.color_delta_e00;
    if (de === undefined || de === null) {
      problems.push(`${where}: PASS but spec declares colorTarget deltaE00Max ${specDeltaE00Max} and the review carries no mechanical.color_delta_e00 (run material-color-probe.mjs) — contract violation`);
    } else if (Number(de) > specDeltaE00Max) {
      problems.push(`${where}: PASS but material colour ΔE00 ${de} > deltaE00Max ${specDeltaE00Max}`);
    }
  }
}

// ---- (b) loose-parse progress.yaml and diff vs derivation ------------------------------------
const progPath = path.join(runsDir, 'progress.yaml');
const cache = {}; // pass -> {status, attempts, score}
if (fs.existsSync(progPath)) {
  let section = '', pass = '';
  for (const line of fs.readFileSync(progPath, 'utf8').split('\n')) {
    let m;
    if ((m = line.match(/^(\w[\w-]*):/))) { section = m[1]; pass = ''; continue; }
    if (section !== 'passes') continue;
    if ((m = line.match(/^  ([\w-]+):\s*(?:#.*)?$/))) { pass = m[1]; cache[pass] = {}; continue; }
    if (pass && (m = line.match(/^    (status|attempts|score):\s*([^\s#]+)/))) {
      cache[pass][m[1]] = m[1] === 'status' ? m[2] : +m[2];
    }
  }
  for (const p of LADDER) {
    const d = derived[p], c = cache[p];
    if (d.status === 'locked' && !c) continue; // not started, not cached — fine
    if (!c) { problems.push(`drift: ${p} derived '${d.status}' but absent from progress.yaml`); continue; }
    if ((c.status || 'locked') !== d.status) problems.push(`drift: ${p} status cache='${c.status}' derived='${d.status}'`);
    if (d.status === 'passed') {
      if (c.attempts !== d.attempts) problems.push(`drift: ${p} attempts cache=${c.attempts} derived=${d.attempts}`);
      if (Math.abs((c.score ?? -1) - d.score) > SCORE_TOL) problems.push(`drift: ${p} score cache=${c.score} derived=${d.score}`);
    }
  }
  for (const p of Object.keys(cache)) {
    if (!LADDER.includes(p)) problems.push(`drift: progress.yaml has unknown ladder pass '${p}'`);
  }
} else {
  problems.push('drift: runs/progress.yaml missing (cache should exist once any pass has run)');
}

// ---- report -----------------------------------------------------------------------------------
console.log(`gate-state: ${dir}`);
for (const p of LADDER) {
  const d = derived[p];
  console.log(`  ${p.padEnd(16)} ${d.status}${d.status === 'passed' ? ` (attempts ${d.attempts}, score ${d.score})` : ''}`);
}
if (problems.length) {
  console.log(`\nPROBLEMS (${problems.length}):`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
// A coherent all-locked state with ZERO review artifacts is legitimate (exit 0), but its "clean"
// must not read like a verification: say so, so a caller can tell "verified" from "zero evidence".
if (reviews.length === 0) {
  console.log('\nclean: no gate evidence yet (all passes locked); cache coherent.');
} else {
  console.log('\nclean: derivation coherent, cache matches.');
}
