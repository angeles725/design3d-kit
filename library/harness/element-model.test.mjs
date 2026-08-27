import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoryOf, normalizeElement, validateElement, ELEMENT_FIELDS, PLACE_EQUIPMENT_FIELDS } from './element-model.mjs';

test('categoryOf infers Revit-like categories from type', () => {
  assert.equal(categoryOf('chiller'), 'equipment');
  assert.equal(categoryOf('pump'), 'equipment');
  assert.equal(categoryOf('VFD'), 'electrical');
  assert.equal(categoryOf('pipe'), 'segment');
  assert.equal(categoryOf('header'), 'segment');
  assert.equal(categoryOf('elbow'), 'fitting');
  assert.equal(categoryOf('butterfly-valve'), 'control');
  assert.equal(categoryOf('diffuser'), 'terminal');
  assert.equal(categoryOf('widget'), 'generic');
});

test('normalizeElement fills category, parameters, and typed connectors (flow/system inferred)', () => {
  const el = normalizeElement({
    id: 'CH-01', type: 'chiller', size: [3, 1.2, 1.8], center: [1.5, 1, 0.9], clearance: { '+x': 1 },
    ports: { CHWS_out: { offset: [1.5, 0.3, 0], direction: [1, 0, 0] }, CHWR_in: [1.5, -0.3, 0] },
  });
  assert.equal(el.category, 'equipment');
  assert.deepEqual(el.parameters, {});
  assert.equal(el.ports.CHWS_out.flow, 'source');
  assert.equal(el.ports.CHWS_out.system, 'CHW');
  assert.deepEqual(el.ports.CHWS_out.direction, [1, 0, 0]);
  assert.equal(el.ports.CHWR_in.flow, 'sink');           // flat [x,y,z] port still gets a typed flow
  assert.deepEqual(el.ports.CHWR_in.position, [1.5, -0.3, 0]);
  assert.equal(el.system, 'CHW');                        // adopted from agreeing ports
});

test('ALIGNMENT: a normalized element is a superset of spatial-harness.placeEquipment fields', () => {
  const el = normalizeElement({
    id: 'P-01', type: 'pump', size: [0.8, 0.6, 0.9], center: [4, 1, 0.45], clearance: { '+x': 0.4 },
    ports: { suction: [-0.4, 0, 0.1], discharge: [0.4, 0, 0.1] },
  });
  for (const f of PLACE_EQUIPMENT_FIELDS) assert.ok(f in el, `placeEquipment field '${f}' present`);
  // and the BIM extras are additive (present but ignored by placeEquipment's destructure)
  assert.ok(el.category && 'parameters' in el);
  // ELEMENT_FIELDS is the documented canonical set
  assert.ok(ELEMENT_FIELDS.includes('connectors') === false && ELEMENT_FIELDS.includes('ports'));
});

test('normalizeElement adopts an explicit system and level, uppercasing the system', () => {
  const el = normalizeElement({ id: 'X', type: 'ahu', size: [1, 1, 1], system: 'hhw', level: 'L2' });
  assert.equal(el.system, 'HHW');
  assert.equal(el.level, 'L2');
  assert.equal(el.category, 'equipment');
});

test('validateElement REPORTS missing id / bad size / bad port / no-level', () => {
  const bad = validateElement({ type: 'pump', size: [1, 1], ports: { p: { position: [0, 0] } } });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some(e => e.reason === 'missing-id'));
  assert.ok(bad.errors.some(e => e.reason === 'bad-size'));
  assert.ok(bad.errors.some(e => e.reason === 'bad-port-position'));
  const good = validateElement({ id: 'A', type: 'pump', size: [1, 1, 1], level: 'L1', ports: { p: [0, 0, 0] } });
  assert.equal(good.ok, true);
  assert.equal(good.warnings.length, 0);
});
