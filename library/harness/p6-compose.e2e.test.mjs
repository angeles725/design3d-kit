// P6 END-TO-END COMPOSE (offline, no three): proves inv3's endpointDegreesFromRuns composes 1:1 through
// inv2's buildNumericRunIdMap + reKeyToNumericRunId into the numeric `degreesByRun` inv3's fused open-edge
// gate consumes, that the composed degrees feed expectedOpenLoopsFromDegrees, and that the identity guard
// (validateRunIdentityByGeometry) confirms same-run BY GEOMETRY on the real {a,b} run shape.
// Split A: inv3 = topology (endpointDegreesFromRuns) + gate; inv2 = numeric-id adapters + identity guard.
import assert from 'node:assert/strict';
import { endpointDegreesFromRuns } from '../parts/duct-vectorize.mjs';
import { expectedOpenLoopsFromDegrees } from './open-edge-cap.mjs';
import { buildNumericRunIdMap, reKeyToNumericRunId, validateRunIdentityByGeometry } from './rekey-run-id.mjs';
let pass = 0; const t = (n, f) => { f(); pass++; console.log('  ok -', n); };

// a tiny duct network with a TEE at [5,0,0]: R0 trunk, R1 through, R2 branch. Endpoints:
//   [0,0,0] deg 1 (free) · [5,0,0] deg 3 (tee) · [10,0,0] deg 1 (free) · [5,5,0] deg 1 (free)
const runs = [
  { id: 'L4_0000', a: [0,0,0], b: [5,0,0] },
  { id: 'L4_0001', a: [5,0,0], b: [10,0,0] },
  { id: 'L4_0002', a: [5,0,0], b: [5,5,0] },
];

t('inv3 endpointDegreesFromRuns → inv2 buildNumericRunIdMap+reKey composes to numeric degreesByRun 1:1', () => {
  const degByString = endpointDegreesFromRuns(runs);            // inv3: {stringId:[degA,degB]}
  assert.deepEqual(degByString['L4_0000'], [1, 3]);             // free end + tee
  assert.deepEqual(degByString['L4_0001'], [3, 1]);
  assert.deepEqual(degByString['L4_0002'], [3, 1]);
  const idMap = buildNumericRunIdMap(runs);                     // inv2: {stringId:index} from DATA.runs order
  assert.deepEqual(idMap, { 'L4_0000': 0, 'L4_0001': 1, 'L4_0002': 2 });
  const { byRun, unmapped } = reKeyToNumericRunId(degByString, idMap); // inv2: numeric-keyed for the fused gate
  assert.deepEqual(byRun, { 0: [1, 3], 1: [3, 1], 2: [3, 1] });
  assert.deepEqual(unmapped, []);                              // ids all present -> no absence
});

t('the composed numeric degreesByRun feeds inv3 expectedOpenLoopsFromDegrees (count of free ends)', () => {
  const byRun = reKeyToNumericRunId(endpointDegreesFromRuns(runs), buildNumericRunIdMap(runs)).byRun;
  assert.equal(expectedOpenLoopsFromDegrees(byRun[0]), 1);     // one free end (degree < 2)
  assert.equal(expectedOpenLoopsFromDegrees(byRun[1]), 1);
  assert.equal(expectedOpenLoopsFromDegrees(byRun[2]), 1);
});

t('validateRunIdentityByGeometry confirms same-run BY GEOMETRY on the real {a,b} run shape (option-a)', () => {
  // option-a: degrees computed on the SAME runs the mesh was built from -> identity holds by construction
  const ok = validateRunIdentityByGeometry(runs, runs, { posTol: 0.01 });
  assert.equal(ok.verdict, 'all-match'); assert.equal(ok.checked, 3); assert.equal(ok.ok, true);
  // a DIFFERENT extraction that REUSED the ids but moved a run is caught (not a silent-green 1:1)
  const other = runs.map((r, i) => i === 2 ? { ...r, a: [50,0,0], b: [50,5,0] } : r);
  const bad = validateRunIdentityByGeometry(runs, other, { posTol: 0.01 });
  assert.equal(bad.verdict, 'partial'); assert.equal(bad.mismatches[0].id, 'L4_0002');
});

console.log(`\n${pass}/${pass} p6-compose e2e tests green`);
