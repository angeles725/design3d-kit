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

// CURVED-geometry gate power (i2 review): the merged tests only cover CUBES; a lathe/revolved tank is
// the class where winding actually matters. This proves checkDeBoxWinding DISCRIMINATES orientation on a
// closed CURVED mesh — OFFLINE, no three (a UV-sphere = a revolved semicircle profile, the lathe class).
function uvSphere(r, stacks = 12, slices = 16) {
  const positions = [], index = [];
  for (let i = 0; i <= stacks; i++) {
    const phi = (Math.PI * i) / stacks;
    for (let j = 0; j <= slices; j++) {
      const th = (2 * Math.PI * j) / slices;
      positions.push(r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
    }
  }
  const w = slices + 1;
  for (let i = 0; i < stacks; i++) for (let j = 0; j < slices; j++) {
    const a = i * w + j, b = a + 1, c = a + w, d = c + 1;
    index.push(a, c, b, b, c, d); // one consistent winding
  }
  return { positions, index };
}
const reverse = (idx) => { const r = []; for (let i = 0; i < idx.length; i += 3) r.push(idx[i], idx[i + 2], idx[i + 1]); return r; };

test('CURVED (revolved/sphere) mesh: gate discriminates winding offline — one orientation PASSES, reverse FAILS', () => {
  const s = uvSphere(1);
  const a = checkDeBoxWinding([{ id: 'tank', positions: s.positions, index: s.index }]);
  const b = checkDeBoxWinding([{ id: 'tank', positions: s.positions, index: reverse(s.index) }]);
  // exactly one orientation is outward (ok), the other inside-out — the gate's discriminating power on curved geometry
  assert.notEqual(a.ok, b.ok, 'the gate must separate outward vs inside-out on a curved revolved mesh');
  const failing = a.ok ? b : a;
  assert.equal(failing.insideOut.length, 1);
  assert.ok(failing.insideOut[0].signedVolume < 0);
});

// signed volume via the divergence theorem (same method as geom-verify.signedVolume) — inlined so this
// curved-geometry proof stays a pure offline test with no extra import.
const signedVol = (p, ix) => {
  let v = 0;
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
       - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
       + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
};

test('CURVED mesh signed volume ≈ true enclosed volume (proves it is a real CLOSED vessel, not open)', () => {
  const s = uvSphere(1, 24, 32);
  const vol = Math.abs(signedVol(s.positions, s.index));
  assert.ok(Math.abs(vol - (4 / 3) * Math.PI) < 0.05, `sphere r=1 |V|≈4.19 (got ${vol.toFixed(3)}) — closed, not open`);
});
