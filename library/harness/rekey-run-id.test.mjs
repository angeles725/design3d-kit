// characterization tests for rekey-run-id (dependency-free).
import assert from 'node:assert/strict';
import { reKeyToNumericRunId, buildNumericRunIdMap } from './rekey-run-id.mjs';
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
  const runs = [{ id: 'L4_0000' }, { id: 'L4_0001' }];
  const idMap = buildNumericRunIdMap(runs);
  const { byRun, unmapped } = reKeyToNumericRunId({ 'L4_0000': [1, 2], 'L4_0001': [2, 3] }, idMap);
  assert.deepEqual(byRun[0], [1, 2]);
  assert.deepEqual(byRun[1], [2, 3]);
  assert.deepEqual(unmapped, []);
});

console.log(`\n${pass}/${pass} rekey-run-id tests green`);
