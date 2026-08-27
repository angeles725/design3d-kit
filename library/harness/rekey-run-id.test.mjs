// characterization tests for rekey-run-id (dependency-free).
import assert from 'node:assert/strict';
import { reKeyToNumericRunId, buildNumericRunIdMap, validateRunIdentityByGeometry } from './rekey-run-id.mjs';
let pass = 0; const t = (n, f) => { f(); pass++; console.log('  ok -', n); };

t('re-keys string-run degrees to numeric-run degrees matching the vertex attribute', () => {
  const degreesByStringId = { 'RUN-1': [1, 2], 'RUN-2': [1, 1, 3] }; // free-end/through/tee degrees
  const idMap = { 'RUN-1': 10, 'RUN-2': 20 };
  const { byRun, unmapped } = reKeyToNumericRunId(degreesByStringId, idMap);
  assert.deepEqual(byRun[10], [1, 2]);
  assert.deepEqual(byRun[20], [1, 1, 3]);
  assert.deepEqual(unmapped, []);
});

t('a string run with no numeric mapping is REPORTED as unmapped, never fabricated', () => {
  const { byRun, unmapped } = reKeyToNumericRunId({ 'RUN-1': [1, 1], 'RUN-X': [2, 2] }, { 'RUN-1': 5 });
  assert.deepEqual(byRun[5], [1, 1]);
  assert.deepEqual(unmapped, ['RUN-X']); // no guessed numeric id
  assert.equal(Object.keys(byRun).length, 1);
});

t('a -1 mapping passes through untouched (accessory-marked; gate excludes it via accessoryRunId:-1)', () => {
  const { byRun, unmapped } = reKeyToNumericRunId({ 'ACC-1': [1], 'RUN-1': [2, 2] }, { 'ACC-1': -1, 'RUN-1': 7 });
  assert.deepEqual(byRun[-1], [1]);   // kept, not dropped and not treated as unmapped
  assert.deepEqual(byRun[7], [2, 2]);
  assert.deepEqual(unmapped, []);
});

t('empty / missing inputs are safe (no throw, empty result)', () => {
  assert.deepEqual(reKeyToNumericRunId(undefined, undefined), { byRun: {}, unmapped: [] });
  assert.deepEqual(reKeyToNumericRunId({}, {}), { byRun: {}, unmapped: [] });
  assert.deepEqual(reKeyToNumericRunId({ 'R': [1] }, {}), { byRun: {}, unmapped: ['R'] });
});

t('buildNumericRunIdMap derives numericId from the ARRAY INDEX, not the string suffix (@3D trap)', () => {
  assert.deepEqual(buildNumericRunIdMap([{ id: 'L4_0000' }, { id: 'L4_0001' }, { id: 'L4_0002' }]),
    { 'L4_0000': 0, 'L4_0001': 1, 'L4_0002': 2 });
  // a run whose string suffix does NOT match its position keys by POSITION (proves it is not string-parsed):
  const r = buildNumericRunIdMap([{ id: 'L4_0007' }, { id: 'L4_0003' }]);
  assert.equal(r['L4_0007'], 0); // index 0, not parsed 7 — an insert/delete stays correct
  assert.equal(r['L4_0003'], 1); // index 1, not parsed 3
  assert.deepEqual(buildNumericRunIdMap(undefined), {}); // safe
});

t('buildNumericRunIdMap + reKeyToNumericRunId compose end-to-end (string degrees -> index-keyed degrees)', () => {
  const idMap = buildNumericRunIdMap([{ id: 'L4_0000' }, { id: 'L4_0001' }]);
  const { byRun, unmapped } = reKeyToNumericRunId({ 'L4_0000': [1, 2], 'L4_0001': [2, 3] }, idMap);
  assert.deepEqual(byRun[0], [1, 2]);
  assert.deepEqual(byRun[1], [2, 3]);
  assert.deepEqual(unmapped, []);
});

// --- validateRunIdentityByGeometry: id-match is NOT same-run; validate by geometry (@3D catch) ---
t('same producer => endpoints agree within tol => ok (id match IS confirmed by geometry)', () => {
  const A = [{ id: 'L4_0000', p0: [0,0,0], p1: [5,0,0] }, { id: 'L4_0001', p0: [5,0,0], p1: [5,3,0] }];
  const B = [{ id: 'L4_0000', p0: [0,0,0.001], p1: [5,0,-0.002] }, { id: 'L4_0001', p0: [5,0,0], p1: [5,3,0] }];
  const r = validateRunIdentityByGeometry(A, B, { posTol: 0.05 });
  assert.equal(r.ok, true); assert.equal(r.shared, 2); assert.equal(r.checked, 2); assert.deepEqual(r.mismatches, []);
});

t('SILENT-GREEN case caught: ids match but they are DIFFERENT runs => geometric mismatch, loud', () => {
  const A = [{ id: 'L4_0000', p0: [0,0,0], p1: [5,0,0] }];      // inv3's run 0
  const B = [{ id: 'L4_0000', p0: [40,12,0], p1: [45,12,0] }];   // probes-creador's run 0 — same NAME, other place
  const r = validateRunIdentityByGeometry(A, B, { posTol: 0.05 });
  assert.equal(r.ok, false);
  assert.equal(r.mismatches[0].id, 'L4_0000');
  assert.ok(r.mismatches[0].maxPos > 10); // tens of metres apart — a wrong run reKey would have called 1:1
});

t('orientation-agnostic: p0/p1 stored in the opposite order still matches', () => {
  const A = [{ id: 'R', p0: [0,0,0], p1: [5,0,0] }];
  const B = [{ id: 'R', p0: [5,0,0], p1: [0,0,0] }]; // reversed endpoints, same run
  assert.equal(validateRunIdentityByGeometry(A, B, { posTol: 0.05 }).ok, true);
});

t('sample subset limits the check; runs with no endpoints are skipped (nothing asserted)', () => {
  const A = [{ id: 'R1', p0: [0,0,0], p1: [1,0,0] }, { id: 'R2', p0: [9,9,9], p1: [9,9,8] }];
  const B = [{ id: 'R1', p0: [0,0,0], p1: [1,0,0] }, { id: 'R2', p0: [0,0,0], p1: [1,0,0] }]; // R2 differs
  const only1 = validateRunIdentityByGeometry(A, B, { posTol: 0.05, sample: ['R1'] });
  assert.equal(only1.checked, 1); assert.equal(only1.ok, true); // R2 not in the sample
  const noEnds = validateRunIdentityByGeometry([{ id: 'R1' }], B, { posTol: 0.05 });
  assert.equal(noEnds.shared, 1); assert.equal(noEnds.checked, 0); assert.equal(noEnds.ok, true); // skipped, nothing asserted
});

console.log(`\n${pass}/${pass} rekey-run-id tests green`);
