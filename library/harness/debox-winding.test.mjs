import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDeBoxWinding } from './debox-winding.mjs';

// unit cube [0,1]^3, outward-wound (signedVolume +1)
const CUBE = [0,0,0, 1,0,0, 1,1,0, 0,1,0, 0,0,1, 1,0,1, 1,1,1, 0,1,1];
const OUT = [0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7];
const rev = (idx) => { const r = []; for (let i = 0; i < idx.length; i += 3) r.push(idx[i], idx[i+2], idx[i+1]); return r; };

test('outward-wound part → ok', () => {
  const r = checkDeBoxWinding([{ id: 'P1', positions: CUBE, index: OUT }]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.insideOut, []);
  assert.equal(r.checked, 1);
});

test('INSIDE-OUT part → flagged (the superquadric-class bug, auto-caught)', () => {
  const r = checkDeBoxWinding([{ id: 'SQ', positions: CUBE, index: rev(OUT) }]);
  assert.equal(r.ok, false);
  assert.equal(r.insideOut.length, 1);
  assert.equal(r.insideOut[0].id, 'SQ');
  assert.ok(r.insideOut[0].signedVolume < 0);
});

test('mixed group → ok:false, names only the inside-out part', () => {
  const r = checkDeBoxWinding([
    { id: 'good', positions: CUBE, index: OUT },
    { id: 'bad', positions: CUBE, index: rev(OUT) },
  ]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.insideOut.map((x) => x.id), ['bad']);
});

test('open mesh (single triangle, ~0 volume) → reported open, NOT failed', () => {
  const r = checkDeBoxWinding([{ id: 'open', positions: [0,0,0, 1,0,0, 0,1,0], index: [0,1,2] }]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.open, ['open']);
  assert.deepEqual(r.insideOut, []);
});

test('deterministic', () => {
  const parts = [{ id: 'P1', positions: CUBE, index: OUT }];
  assert.equal(JSON.stringify(checkDeBoxWinding(parts)), JSON.stringify(checkDeBoxWinding(parts)));
});
