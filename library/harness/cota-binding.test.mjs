import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDxf } from './dxf-intake.mjs';
import { parseCota, bindCotasToRuns } from './cota-binding.mjs';

test('parseCota extracts WxH / Ø / CFM / BOD (null when absent)', () => {
  assert.deepEqual(parseCota('300x200'), { width: 300, height: 200, diameter: null, cfm: null, bod: null });
  assert.equal(parseCota('Ø300').diameter, 300);
  assert.equal(parseCota('220 CFM').cfm, 220);
  assert.equal(parseCota('BOD +3.20').bod, 3.2);
  assert.equal(parseCota('BOD -1.5').bod, -1.5);
  assert.deepEqual(parseCota('OFICINA'), { width: null, height: null, diameter: null, cfm: null, bod: null });
});

// two duct runs on a fabric discipline layer; run A carries a WxH + a BOD label placed within the gate,
// run B carries none; a third cota sits far from every run → must surface as unbound (never silently dropped).
const lwp = (layer, x0, y0, x1, y1) => `0\nLWPOLYLINE\n8\n${layer}\n90\n2\n70\n0\n10\n${x0}\n20\n${y0}\n10\n${x1}\n20\n${y1}\n`;
const mtext = (layer, x, y, txt) => `0\nMTEXT\n8\n${layer}\n10\n${x}\n20\n${y}\n40\n0.25\n1\n${txt}\n`;
const dxf = `0\nSECTION\n2\nENTITIES\n`
  + lwp('HVAC-Ductos', 0, 0, 5, 0)        // run A
  + lwp('HVAC-Ductos', 0, 3, 5, 3)        // run B (no cota)
  + mtext('PDF_Text', 2.5, 0.01, '300x200')   // → run A (dist 0.01 < gate)
  + mtext('PDF_Text', 2.5, 0.015, 'BOD +3.20') // → run A
  + mtext('PDF_Text', 100, 100, '250x150')     // far → unbound
  + `0\nENDSEC\n0\nEOF\n`;
const sg = readDxf(dxf);
const bound = bindCotasToRuns(sg, { widthGate: 0.02 });

test('binds a WxH+BOD cota to its nearest run; fieldProvenance under the ratified envelope', () => {
  assert.equal(bound.runs.length, 2, 'two centerline runs');
  const runA = bound.runs.find(r => r.geometryIndex === 0).fieldProvenance;
  assert.deepEqual(runA.labelWidth, { v: 300, prov: 'measured', raw: 300 });
  assert.deepEqual(runA.height, { v: 200, prov: 'measured', raw: 200 });
  assert.equal(runA.bod.prov, 'measured');
  assert.ok(Math.abs(runA.bod.v - 3.2) < 1e-9);
  // topExtent is HELD absent even with both measured: bod(≈m) + WxH-height(mm) is a mixed-unit value; emitting
  // it as 'inferred' would fabricate data. Becomes inferred once the unit pair is confirmed vs real snippets.
  assert.deepEqual(runA.topExtent, { v: null, prov: 'absent-in-source' });
});

test('a run with no cota is honestly absent-in-source (not fabricated)', () => {
  const rB = bound.runs.find(r => r.geometryIndex === 1);
  const fp = rB.fieldProvenance;
  assert.deepEqual(fp.labelWidth, { v: null, prov: 'absent-in-source' });
  assert.deepEqual(fp.height, { v: null, prov: 'absent-in-source' });
  assert.deepEqual(fp.bod, { v: null, prov: 'absent-in-source' });
  assert.deepEqual(fp.topExtent, { v: null, prov: 'absent-in-source' });
  assert.equal(rB.cota, null);
});

test('a cota that binds to no run within the gate is surfaced as unbound (fail-loud)', () => {
  assert.equal(bound.unbound.length, 1);
  assert.equal(bound.unbound[0].text, '250x150');
  assert.ok(bound.unbound[0].nearestRunDist > 0.02, 'it was beyond the gate');
  assert.equal(bound.stats.bound, 2);
  assert.equal(bound.stats.runsWithLabelWidth, 1);
  assert.equal(bound.stats.runsWithBod, 1);
});

test('widthGate is tunable: a wider gate binds a farther label', () => {
  const dxf2 = `0\nSECTION\n2\nENTITIES\n` + lwp('HVAC-Ductos', 0, 0, 5, 0)
    + mtext('PDF_Text', 2.5, 0.1, '400x250') + `0\nENDSEC\n0\nEOF\n`;
  const tight = bindCotasToRuns(readDxf(dxf2), { widthGate: 0.02 });
  assert.equal(tight.unbound.length, 1, '0.1 > 0.02 gate → unbound');
  const wide = bindCotasToRuns(readDxf(dxf2), { widthGate: 0.2 });
  assert.equal(wide.unbound.length, 0, '0.1 < 0.2 gate → bound');
  assert.equal(wide.runs[0].fieldProvenance.labelWidth.v, 400);
});
