import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDrainageSlope } from './drainage-check.mjs';

// The exact defect the drainage flow-check found: drop concentrated in ONE segment, 4 flat horizontal
// runs (step-run-step-run). y decreases only on the vertical segments; horizontal runs are flat.
const FLAT_DRAIN = [
  [0, 2.625, 0], [2, 2.625, 0],   // run  (flat, y unchanged)
  [2, 2.625, 0], [2, 2.625, -0.5],// (dup point ignored) then a horizontal run in z (flat)
];
// A clean stepped drain: every horizontal run carries >= 2%.
function slopedRun() {
  // two horizontal runs, each descending 2.5% along its length (2 m run → 0.05 m drop) — clear margin
  // over the 2% minimum so the pass is unambiguous (a run exactly at 2% is covered by the threshold test).
  return [
    [0, 1.00, 0],
    [2, 0.95, 0],   // run 1: drop 0.05 over horiz 2 → grade 0.025
    [2, 0.90, 2],   // run 2: drop 0.05 over horiz 2 → grade 0.025
  ];
}

test('catches the flat-run pooling defect (flatRuns > 0, ok=false)', () => {
  const wps = [[0, 2.625, 0], [2, 2.625, 0], [2, 2.625, 3], [2, 0.375, 3]]; // 2 flat horiz runs + 1 vertical drop
  const r = checkDrainageSlope(wps, { axis: 'y', minGrade: 0.02 });
  assert.equal(r.horizontalRuns, 2);
  assert.equal(r.flatRuns.length, 2, 'both horizontal runs are flat');
  assert.equal(r.ok, false);
  assert.ok(r.minRunGrade === 0, 'flat runs have 0 grade');
  assert.ok(r.netGrade > 0, 'net grade is positive even though per-run is flat — the exact trap');
});

test('a properly sloped drain passes (every run >= minGrade)', () => {
  const r = checkDrainageSlope(slopedRun(), { axis: 'y', minGrade: 0.02 });
  assert.equal(r.ok, true);
  assert.equal(r.flatRuns.length, 0);
  assert.ok(r.minRunGrade >= 0.02 - 1e-9);
});

test('minGrade threshold is enforced (2.1% run fails a 2.5% requirement)', () => {
  const wps = [[0, 1, 0], [2, 1 - 0.042, 0]]; // grade 0.021
  assert.equal(checkDrainageSlope(wps, { minGrade: 0.02 }).ok, true);
  assert.equal(checkDrainageSlope(wps, { minGrade: 0.025 }).ok, false);
});

test('uphill run breaks monotonic (a run that rises)', () => {
  const wps = [[0, 1, 0], [2, 1.1, 0]]; // rises → grade negative
  const r = checkDrainageSlope(wps, { minGrade: 0.02 });
  assert.equal(r.monotonic, false);
  assert.equal(r.ok, false);
});

test("descending:'+' inverts the down direction", () => {
  const wps = [[0, 0, 0], [2, 0.04, 0]]; // coord INCREASES = descends when descending '+'
  assert.equal(checkDrainageSlope(wps, { minGrade: 0.02, descending: '+' }).ok, true);
  assert.equal(checkDrainageSlope(wps, { minGrade: 0.02, descending: '-' }).monotonic, false);
});

test('pure vertical drops are not counted as graded runs', () => {
  const wps = [[0, 2, 0], [0, 0, 0]]; // vertical only, no horizontal extent
  const r = checkDrainageSlope(wps, { minGrade: 0.02 });
  assert.equal(r.horizontalRuns, 0);
  assert.equal(r.ok, true); // nothing to pool
});

test('deterministic', () => {
  const wps = slopedRun();
  assert.equal(JSON.stringify(checkDrainageSlope(wps)), JSON.stringify(checkDrainageSlope(wps)));
});
