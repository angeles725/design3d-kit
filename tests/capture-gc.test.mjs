// capture-gc.test.mjs — characterization suite for assets/capture-gc.mjs.
// Run from the kit root: node --test tests/*.test.mjs
//
// Posture: characterize the tool against its contract (GATES.md §Capture cleanup + §Capture lifecycle).
// Fixtures are synthetic minimal design dirs under tests/fixtures/. PNGs are 0-byte stubs or 1-byte
// distinct-content markers — capture-gc checks existence and md5, never renders them.
//
// Policy under test (v1.14 full-ladder generalization + corrected EVIDENCE/EPHEMERAL rule):
//   PRUNE:
//     A) ALL frames (unsuffixed and suffixed png/console.json) of failBases (non-PASS review).
//     B) Suffixed png of a passBase whose md5 == rep png md5 (byte-twin = redundant copy).
//     C) Frames with no review owner (unreviewed scratch).
//   KEEP:
//     Passing rep png + console.json (unsuffixed passBase frames).
//     Suffixed png of a passBase with distinct content (md5 ≠ rep — distinct-view EVIDENCE).
//     ALL *.review.json, progress.yaml, *.md, *.yaml, subdirs.
//
// Fixture: full-ladder-gc/runs/ contains (no slug.png → full-ladder):
//   blockout-attempt1.png          — 0 bytes, FAIL attempt rep → PRUNE (failBase unsuffixed)
//   blockout-attempt1.review.json  — FAIL verdict → KEEP (RE_FRAME excludes review.json)
//   blockout-attempt1-side.png     — 0 bytes, FAIL attempt suffixed → PRUNE (failBase)
//   blockout-attempt2.png          — 0 bytes, PASS attempt rep → KEEP (passBase rep)
//   blockout-attempt2.review.json  — PASS verdict → KEEP
//   blockout-attempt2-twin.png     — 0 bytes, same md5 as rep → PRUNE (byte-twin)
//   blockout-attempt2-side.png     — 1 byte 'x', distinct md5 → KEEP (distinct-view evidence)
//   materials-attempt1.png         — 0 bytes, no review.json → PRUNE (no review owner)
//   progress.yaml                  — KEEP (RE_FRAME does not match .yaml)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.join(HERE, '..', 'assets', 'capture-gc.mjs');
const FIXTURES = path.join(HERE, 'fixtures');

function run(fixture, ...extra) {
  const dir = path.join(FIXTURES, fixture);
  const r = spawnSync(process.execPath, [TOOL, dir, ...extra], { encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function pruneNames(stdout) {
  return stdout.split('\n')
    .filter((l) => l.includes(': prune '))
    .map((l) => l.replace(/^.*prune\s+/, '').split(' ')[0]);
}

// ---- full-ladder design: per-pass frames, no canonical <slug>.png ---------------------------

test('full-ladder: dry-run exits 0 and labels 1 full-ladder dir', () => {
  const r = run('full-ladder-gc');
  assert.equal(r.code, 0, `expected exit 0, got ${r.code}\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /1 full-ladder \(prune-only\)/);
});

test('full-ladder: census counts 4 prunable files (fail-rep + fail-side + twin + no-owner)', () => {
  const r = run('full-ladder-gc');
  assert.match(r.stdout, /pruned 4 file\(s\)/,
    `census must report 4 prunable files\n${r.stdout}`);
});

// ---- FAIL attempt: all frames prunable --------------------------------------------------------

test('FAIL: unsuffixed rep png of a failed attempt is prunable', () => {
  const r = run('full-ladder-gc');
  assert.ok(pruneNames(r.stdout).includes('blockout-attempt1.png'),
    `blockout-attempt1.png (FAIL rep) must be in prune list; got: ${pruneNames(r.stdout).join(', ')}`);
});

test('FAIL: suffixed frame of a failed attempt is prunable', () => {
  const r = run('full-ladder-gc');
  assert.ok(pruneNames(r.stdout).includes('blockout-attempt1-side.png'),
    `blockout-attempt1-side.png (FAIL suffixed) must be in prune list`);
});

test('FAIL: review.json of a failed attempt is never pruned', () => {
  const r = run('full-ladder-gc');
  assert.ok(!r.stdout.includes('blockout-attempt1.review.json'),
    'review.json must never appear as a prune target');
});

// ---- PASS attempt: rep kept, byte-twin pruned, distinct view kept ----------------------------

test('PASS: unsuffixed rep png of a passing attempt is NOT pruned', () => {
  const r = run('full-ladder-gc');
  assert.ok(!pruneNames(r.stdout).includes('blockout-attempt2.png'),
    `blockout-attempt2.png (PASS rep) must NOT be in prune list; prune list: ${pruneNames(r.stdout).join(', ')}`);
});

test('PASS: byte-twin suffixed frame (md5 == rep) is prunable', () => {
  const r = run('full-ladder-gc');
  assert.ok(pruneNames(r.stdout).includes('blockout-attempt2-twin.png'),
    `blockout-attempt2-twin.png (byte-twin of rep) must be in prune list`);
});

test('PASS: distinct-view suffixed frame (md5 != rep) is NOT pruned — it is EVIDENCE', () => {
  const r = run('full-ladder-gc');
  assert.ok(!pruneNames(r.stdout).includes('blockout-attempt2-side.png'),
    `blockout-attempt2-side.png (distinct-view evidence) must NOT be pruned`);
});

test('PASS: review.json of a passing attempt is never pruned', () => {
  const r = run('full-ladder-gc');
  assert.ok(!r.stdout.includes('blockout-attempt2.review.json'),
    'review.json must never appear as a prune target');
});

// ---- No-review-owner frame ------------------------------------------------------------------

test('no-owner: unreviewed attempt frame is prunable', () => {
  const r = run('full-ladder-gc');
  assert.ok(pruneNames(r.stdout).includes('materials-attempt1.png'),
    `materials-attempt1.png (no review owner) must be in prune list`);
});

// ---- Non-capture files always kept ---------------------------------------------------------

test('progress.yaml is never in the prune list', () => {
  const r = run('full-ladder-gc');
  assert.ok(!r.stdout.includes('progress.yaml'), 'progress.yaml must not be pruned');
});

// ---- Promote step skipped for full-ladder dirs ---------------------------------------------

test('promote action line is absent for full-ladder dirs (no canonical slug.png)', () => {
  const r = run('full-ladder-gc');
  const actionLines = r.stdout.split('\n').filter((l) => /:\s+promote\s+/.test(l));
  assert.equal(actionLines.length, 0,
    `promote action lines must be absent for full-ladder dirs:\n${actionLines.join('\n')}`);
});
