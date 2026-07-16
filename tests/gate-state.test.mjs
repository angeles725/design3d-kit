// gate-state.test.mjs — characterization suite for assets/gate-state.mjs, the single state
// authority for every design3d run. Run from the kit root: node --test tests/*.test.mjs
//
// Posture: these tests characterize an existing tool against its DOCUMENTED contract
// (references/GATES.md §Artifacts + §Gate steps, references/PIPELINE.md ladders,
// assets/review.schema.json). Where code and contract disagree, the test encodes the contract
// and is allowed to fail RED — see the "CONTRACT GAP" test below.
//
// Fixtures are synthetic minimal design dirs under tests/fixtures/ (generated once; static).
// PNGs are 0-byte stubs: gate-state only checks existence, never content.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.join(HERE, '..', 'assets', 'gate-state.mjs');
const FIXTURES = path.join(HERE, 'fixtures');

function run(fixture) {
  const dir = path.join(FIXTURES, fixture);
  const r = spawnSync(process.execPath, [TOOL, dir], { encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

// ---- 1. happy ladder, threejs track ------------------------------------------------------------

test('happy threejs ladder: canonical PASS artifacts derive passed states, correct attempts, clean exit', () => {
  const r = run('happy-threejs');
  assert.equal(r.code, 0, `expected clean exit, got ${r.code}\n${r.stdout}${r.stderr}`);
  // Reviews live in a nested runs/assets/01-unit/ dir — the walk must be recursive.
  assert.match(r.stdout, /blockout\s+passed \(attempts 1, score 0\.82\)/);
  // structural closed on attempt 2 after a FAIL attempt 1: attempts counts BOTH tries of the
  // active lineage, score comes from the passing attempt.
  assert.match(r.stdout, /structural\s+passed \(attempts 2, score 0\.81\)/);
  // Ladder stops at the first incomplete pass; the rest is locked, not failed.
  assert.match(r.stdout, /materials\s+locked/);
  assert.match(r.stdout, /p6-final\s+locked/);
  assert.match(r.stdout, /clean: derivation coherent, cache matches\./);
});

// ---- 2. lineage reset — the X2 production regression -------------------------------------------

test('lineage reset (X2): active lineage 2 PASS derives passed(attempts 1), archived l1 FAILs do not count', () => {
  const r = run('lineage-reset');
  assert.equal(r.code, 0, `expected clean exit, got ${r.code}\n${r.stdout}${r.stderr}`);
  // GATES.md §stop rule: a reset opens a NEW lineage with a fresh retry budget — it is a
  // different approach, not attempt 4. The pre-fix tool read the exhausted lineage's FAIL
  // reviews and reported drift against a legitimately reset cache.
  assert.match(r.stdout, /blockout\s+passed \(attempts 1, score 0\.8\)/);
  assert.ok(!/attempts 4/.test(r.stdout), 'reset must not be counted as attempt 4');
  assert.ok(!/drift/.test(r.stdout), `no drift may be reported on a legitimate reset:\n${r.stdout}`);
});

test('lineage reset (X2 variant): unarchived lineage-1 FAILs still lose to the highest lineage', () => {
  // Same reset, but the exhausted lineage was never moved to history/. The highest-lineage
  // rule alone must keep the l1 FAILs from blocking or inflating the attempt count.
  const r = run('lineage-reset-live');
  assert.equal(r.code, 0, `expected clean exit, got ${r.code}\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /blockout\s+passed \(attempts 1, score 0\.8\)/);
  assert.ok(!/drift/.test(r.stdout), `no drift may be reported:\n${r.stdout}`);
});

// ---- 3. multi-shot representative naming --------------------------------------------------------

test('multi-shot without the canonical representative copy reads as false failed(1) + drift (documented)', () => {
  // Documented contract (GATES.md §Artifacts, LEARNINGS 2026-07-14): gate-state derives from the
  // exact `<pass>[-l<L>]-attempt<N>.png` basename; suffix-only shot sets (-front/-side/-detail)
  // read as false failed(1)+drift until the representative shot is COPIED to the canonical name.
  // This test pins that failure mode so the contract stays visible.
  const r = run('multishot-missing-canonical');
  assert.equal(r.code, 1, `expected drift exit 1, got ${r.code}\n${r.stdout}`);
  assert.match(r.stdout, /blockout\s+failed\(1\)/);
  assert.match(r.stdout, /PASS but screenshot blockout-attempt1\.png missing/);
  assert.match(r.stdout, /drift: blockout status cache='passed' derived='failed\(1\)'/);
});

test('multi-shot with the canonical representative copy derives clean', () => {
  const r = run('multishot-canonical');
  assert.equal(r.code, 0, `expected clean exit, got ${r.code}\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /blockout\s+passed \(attempts 1, score 0\.8\)/);
  assert.match(r.stdout, /clean: derivation coherent/);
});

// ---- 4. history/ skipping -----------------------------------------------------------------------

test('history/ artifacts contribute nothing to live state', () => {
  // A COMPLETE passing artifact set (review + canonical PNG) parked under history/ must be
  // invisible: history is an archive, not live state. structural stays locked.
  const r = run('history-skip');
  assert.equal(r.code, 0, `expected clean exit, got ${r.code}\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /blockout\s+passed/);
  assert.match(r.stdout, /structural\s+locked/);
  assert.ok(!/structural\s+passed/.test(r.stdout), 'archived PASS must not derive as passed');
});

// ---- 5. global_min enforcement -------------------------------------------------------------------

test('PASS review below spec quality_contract.global_min is flagged as PASS-incoherence', () => {
  // GATES.md verdict formula: PASS requires global_score >= quality_contract.global_min.
  // Every critical feature clears its threshold here, so only the global-min read catches it.
  const r = run('globalmin-below-spec');
  assert.equal(r.code, 1, `expected exit 1, got ${r.code}\n${r.stdout}`);
  assert.match(r.stdout, /PASS but global_score 0\.7 < global_min 0\.78/);
});

test('no spec: PASS below the review\'s own assumed_thresholds.global_min is flagged', () => {
  // Retrofit designs without a design-spec.yaml fall back to the assumed_thresholds the review
  // itself recorded (GATES.md §Retrofit gate: {global_min: 0.75, feature_default: 0.70}).
  // NOTE: the fallback is data-driven — gate-state.mjs hard-codes no 0.75/0.70 constants; it
  // trusts whatever assumed_thresholds.global_min the review recorded.
  const r = run('globalmin-assumed-below');
  assert.equal(r.code, 1, `expected exit 1, got ${r.code}\n${r.stdout}`);
  assert.match(r.stdout, /PASS but global_score 0\.7 < global_min 0\.75/);
});

test('no spec: PASS at/above assumed_thresholds.global_min derives clean', () => {
  const r = run('globalmin-assumed-ok');
  assert.equal(r.code, 0, `expected clean exit, got ${r.code}\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /clean: derivation coherent/);
});

test('CONTRACT GAP (expected RED): PASS with neither spec global_min nor assumed_thresholds must not sail through', () => {
  // CONTRACT: the verdict formula (review.schema.json verdict + GATES.md §Verdict) ALWAYS
  // includes `global_score >= global_min`, and GATES.md §Retrofit gate requires spec-less
  // designs to either create a minimal spec OR record assumed_thresholds in the review.
  // A PASS review carrying NEITHER is contract-incoherent by construction (nothing bounds its
  // global_score), and the state authority should flag it — the same silent-sail-through class
  // the v1.4 global_min read (audit D7) was added to close.
  //
  // CODE TODAY: gmin resolves to null and the check is skipped — global_score 0.4 with verdict
  // PASS exits 0 "clean". This test encodes the CONTRACT and is expected to fail RED until
  // gate-state.mjs flags PASS reviews with no resolvable global_min.
  const r = run('globalmin-nomin');
  assert.notEqual(r.code, 0,
    `contract gap: PASS with global_score 0.4 and no resolvable global_min exited 0 clean:\n${r.stdout}`);
});

// ---- 6. blender-track ladder ---------------------------------------------------------------------

test('blender track: an anim-rig review selects the blender ladder, not the threejs one', () => {
  // First-ever exercise of the Blender ladder path (no real Blender run exists yet).
  // PIPELINE.md P4/P5: the blender ladder has anim-rig + optimization-export and NO surface /
  // interaction-ui / optimization passes. mechanical.tests is null — the track's normal value.
  const r = run('blender-track');
  assert.equal(r.code, 0, `expected clean exit, got ${r.code}\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /anim-rig\s+passed \(attempts 1, score 0\.8\)/);
  assert.match(r.stdout, /optimization-export\s+locked/);
  assert.match(r.stdout, /p6-final\s+locked/);
  // threejs-exclusive passes must not appear in the report at all.
  assert.ok(!/^\s{2}surface\s/m.test(r.stdout), 'surface is not a blender-ladder pass');
  assert.ok(!/interaction-ui/.test(r.stdout), 'interaction-ui is not a blender-ladder pass');
  assert.ok(!/^\s{2}optimization\s/m.test(r.stdout), 'bare optimization is not a blender-ladder pass');
  assert.match(r.stdout, /clean: derivation coherent/);
});

// ---- 7. fail-loud census over empty inputs --------------------------------------------------------

test('no runs/ dir: exits 2 with a usage error (fail-loud)', () => {
  const r = run('no-runs');
  assert.equal(r.code, 2, `expected usage exit 2, got ${r.code}\n${r.stdout}${r.stderr}`);
  assert.match(r.stderr, /usage: node gate-state\.mjs <design-dir>/);
});

test('empty runs/: exits 1 flagging the missing progress.yaml cache (fail-loud)', () => {
  const r = run('empty-runs');
  assert.equal(r.code, 1, `expected exit 1, got ${r.code}\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /drift: runs\/progress\.yaml missing/);
  assert.match(r.stdout, /blockout\s+locked/);
});

test('empty runs/ with a phases-only progress.yaml: exits 0 but says "no gate evidence yet" (honest zero-evidence wording)', () => {
  // v1.7: with zero review artifacts and a progress.yaml that has no passes section, the exit
  // code stays 0 (all-locked + empty cache IS coherent), but the closing message must be honest
  // about having verified nothing — a caller reading the output can now tell "verified" from
  // "zero evidence" (kit delta #16 false-green pattern). The pre-1.7 tool printed the same
  // "clean: derivation coherent, cache matches." here as on a fully-derived design.
  const r = run('empty-runs-cached');
  assert.equal(r.code, 0, `all-locked coherent state must stay exit 0; got ${r.code}\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /blockout\s+locked/);
  assert.match(r.stdout, /clean: no gate evidence yet \(all passes locked\); cache coherent\./);
  assert.ok(!/derivation coherent, cache matches/.test(r.stdout),
    'the zero-evidence path must not use the verified-clean wording');
});

// ---- 8. unparseable review JSON --------------------------------------------------------------------

test('unparseable review JSON at a canonical name is reported, never silently skipped', () => {
  const r = run('broken-json');
  assert.equal(r.code, 1, `expected exit 1, got ${r.code}\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /unparseable review JSON/);
  // A broken review cannot certify a pass: it derives failed(1), not passed.
  assert.match(r.stdout, /blockout\s+failed\(1\)/);
});
