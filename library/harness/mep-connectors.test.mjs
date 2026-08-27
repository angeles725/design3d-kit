import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConnectors, flowRole, systemOf } from './mep-connectors.mjs';

test('flowRole + systemOf inference from names', () => {
  assert.equal(flowRole('CHWS_out'), 'source');
  assert.equal(flowRole('CHWR_in'), 'sink');
  assert.equal(flowRole('suction'), 'sink');
  assert.equal(flowRole('discharge'), 'source');
  assert.equal(flowRole('mystery'), 'unknown');
  assert.equal(flowRole('x', { flow: 'source' }), 'source'); // explicit wins
  assert.equal(systemOf('CHW_in'), 'CHW');
  assert.equal(systemOf('HHWS_out'), 'HHW');
  assert.equal(systemOf('suction'), null);
  assert.equal(systemOf('x', { system: 'chw' }), 'CHW');
});

const CH = { id: 'CH-01', ports: { CHWS_out: { system: 'CHW', flow: 'source', dn: 150 }, CHWR_in: { system: 'CHW', flow: 'sink', dn: 150 } } };
const AHU = { id: 'AHU-01', ports: { CHW_in: { system: 'CHW', flow: 'sink', dn: 150 }, CHW_out: { system: 'CHW', flow: 'source', dn: 150 } } };
const P = { id: 'P-01', ports: { suction: { flow: 'sink' }, discharge: { flow: 'source' } } };

test('valid CHW loop: no errors (source→sink, one system)', () => {
  const sg = { objects: [CH, AHU, P], connections: [
    ['CH-01.CHWS_out', 'P-01.suction'],
    ['P-01.discharge', 'AHU-01.CHW_in'],
    ['AHU-01.CHW_out', 'CH-01.CHWR_in'],
  ] };
  const r = validateConnectors(sg);
  assert.equal(r.ok, true);
  assert.equal(r.errors.length, 0);
  assert.equal(r.checked, 3);
});

test('source→source is a flow-direction error', () => {
  const sg = { objects: [CH, AHU], connections: [['CH-01.CHWS_out', 'AHU-01.CHW_out']] };
  const r = validateConnectors(sg);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.reason === 'flow-direction'));
});

test('CHW↔HHW is a system-mismatch error', () => {
  const BOIL = { id: 'BOIL-01', ports: { HHWS_out: { system: 'HHW', flow: 'source' } } };
  const sg = { objects: [CH, BOIL], connections: [['BOIL-01.HHWS_out', 'CH-01.CHWR_in']] };
  const r = validateConnectors(sg);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.reason === 'system-mismatch'));
});

test('missing port is an error', () => {
  const sg = { objects: [CH, P], connections: [['CH-01.NOPE', 'P-01.suction']] };
  const r = validateConnectors(sg);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.reason === 'missing-port'));
});

test('DN mismatch is a warning, not an error', () => {
  const AHU200 = { id: 'AHU-02', ports: { CHW_in: { system: 'CHW', flow: 'sink', dn: 200 } } };
  const sg = { objects: [CH, AHU200], connections: [['CH-01.CHWS_out', 'AHU-02.CHW_in']] };
  const r = validateConnectors(sg);
  assert.equal(r.ok, true); // still ok — DN is advisory
  assert.ok(r.warnings.some(w => w.reason === 'dn-mismatch'));
});

test('untagged generic ports warn but do not error when flow is inferable', () => {
  const sg = { objects: [CH, P], connections: [['CH-01.CHWS_out', 'P-01.suction']] };
  const r = validateConnectors(sg);
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some(w => w.reason === 'system-untagged')); // P-01.suction has no system
});
