import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDxf } from './dxf-intake.mjs';
import { flankSegments } from './flank-segments.mjs';

const lwp = (layer, ...xy) => {
  let s = `0\nLWPOLYLINE\n8\n${layer}\n90\n${xy.length / 2}\n70\n0\n`;
  for (let i = 0; i < xy.length; i += 2) s += `10\n${xy[i]}\n20\n${xy[i + 1]}\n`;
  return s;
};
const line = (layer, x0, y0, x1, y1) => `0\nLINE\n8\n${layer}\n10\n${x0}\n20\n${y0}\n30\n0\n11\n${x1}\n21\n${y1}\n31\n0\n`;

// two parallel flanks of a duct on the PDF underlay, a discipline LINE, and a WALLS line that must be excluded
const dxf = `0\nSECTION\n2\nENTITIES\n`
  + lwp('PDF2_0', 0, 0, 5, 0)          // flank A: 1 segment
  + lwp('PDF2_0', 0, 0.3, 5, 0.3)      // flank B: 1 segment (parallel, 0.3 apart)
  + line('HVAC-Ductos', 0, 0, 5, 0)    // discipline line: 1 segment
  + line('WALLS', 0, 9, 5, 9)          // fabric wall: EXCLUDED by default pattern
  + `0\nENDSEC\n0\nEOF\n`;
const sg = readDxf(dxf);

test('flankSegments extracts PDF-underlay + HVAC segments, excludes non-flank layers', () => {
  const segs = flankSegments(sg);
  assert.equal(segs.length, 3, 'two PDF2_0 flanks + one HVAC line; WALLS excluded');
  assert.ok(segs.every(s => /^(PDF2_0|HVAC-Ductos)$/.test(s.layer)));
  assert.ok(!segs.some(s => s.layer === 'WALLS'), 'WALLS not a flank layer');
  const a = segs[0];
  assert.deepEqual(a.a, [0, 0]);
  assert.deepEqual(a.b, [5, 0]);
  assert.equal(typeof a.geometryIndex, 'number');
});

test('a multi-vertex flank polyline yields one segment per edge', () => {
  const dxf2 = `0\nSECTION\n2\nENTITIES\n` + lwp('PDF_Ductos', 0, 0, 2, 0, 2, 2) + `0\nENDSEC\n0\nEOF\n`;
  const segs = flankSegments(readDxf(dxf2));
  assert.equal(segs.length, 2, '3 vertices → 2 edges');
  assert.deepEqual(segs[0].a, [0, 0]); assert.deepEqual(segs[0].b, [2, 0]);
  assert.deepEqual(segs[1].a, [2, 0]); assert.deepEqual(segs[1].b, [2, 2]);
});

test('layerPattern is overridable (RegExp or predicate)', () => {
  const onlyWalls = flankSegments(sg, { layerPattern: /^WALLS$/ });
  assert.equal(onlyWalls.length, 1);
  assert.equal(onlyWalls[0].layer, 'WALLS');
  const predicate = flankSegments(sg, { layerPattern: (l) => l.startsWith('HVAC') });
  assert.equal(predicate.length, 1);
  assert.equal(predicate[0].layer, 'HVAC-Ductos');
});
