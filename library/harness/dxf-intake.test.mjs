import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDxf, parsePairs, bulgeToArc, geometryToPolylines, toLineBuffers } from './dxf-intake.mjs';

// creador1's realistic fixture: tiny 6x4 m HVAC room (INSERT w/ 66=1 + SEQEND, optional per-vertex bulge)
const DXF = `0
SECTION
2
ENTITIES
0
LINE
8
WALLS
10
0.0
20
0.0
30
0.0
11
6.0
21
0.0
31
0.0
0
LINE
8
WALLS
10
6.0
20
0.0
30
0.0
11
6.0
21
4.0
31
0.0
0
LINE
8
WALLS
10
6.0
20
4.0
30
0.0
11
0.0
21
4.0
31
0.0
0
LINE
8
WALLS
10
0.0
20
4.0
30
0.0
11
0.0
21
0.0
31
0.0
0
LWPOLYLINE
8
PIPE
90
3
70
0
10
1.0
20
1.0
10
3.0
20
1.0
42
0.4142
10
3.0
20
3.0
0
ARC
8
DUCT
10
4.0
20
3.0
30
0.0
40
0.5
50
0.0
51
90.0
0
INSERT
8
EQUIP
66
1
2
CHILLER
10
3.0
20
2.0
30
0.0
41
1.0
42
1.0
43
1.0
50
0.0
0
ATTRIB
8
EQUIP
1
CH-01
2
TAG
10
3.0
20
2.0
30
0.0
0
SEQEND
8
EQUIP
0
ENDSEC
0
EOF`;

const sg = readDxf(DXF);

test('parses the 4 WALLS lines and derives the 6x4 room', () => {
  const walls = sg.geometry.filter(g => g.kind === 'segment' && g.layer === 'WALLS');
  assert.equal(walls.length, 4);
  assert.deepEqual(walls[0].points, [[0, 0, 0], [6, 0, 0]]);
  assert.equal(sg.room.size[0], 6);
  assert.equal(sg.room.size[1], 4);
});

test('LWPOLYLINE: 3 verts, open, bulge only on v2 (optional 42 not assumed on every vertex)', () => {
  const poly = sg.geometry.find(g => g.kind === 'polyline');
  assert.equal(poly.layer, 'PIPE');
  assert.equal(poly.closed, false);
  assert.equal(poly.vertices.length, 3);
  assert.equal(poly.vertices[0].bulge, 0);       // v1 straight (no 42)
  assert.ok(Math.abs(poly.vertices[1].bulge - 0.4142) < 1e-4); // v2 starts the 90° arc
  assert.equal(poly.vertices[2].bulge, 0);
});

test('ARC parsed with center/radius/angles', () => {
  const arc = sg.geometry.find(g => g.kind === 'arc');
  assert.deepEqual(arc.center, [4, 3, 0]);
  assert.equal(arc.radius, 0.5);
  assert.equal(arc.startAngleDeg, 0);
  assert.equal(arc.endAngleDeg, 90);
});

test('INSERT+ATTRIB → one equipment object (id from ATTRIB, type from block, center from insert)', () => {
  assert.equal(sg.objects.length, 1);
  const o = sg.objects[0];
  assert.equal(o.id, 'CH-01');                    // from ATTRIB value, not the block name
  assert.equal(o.type, 'chiller');                // from block CHILLER
  assert.deepEqual(o.center, [3, 2, 0]);
  assert.equal(o.source.block, 'CHILLER');
  assert.equal(o.source.sizeSource, 'placeholder');
  assert.equal(o.attributes.TAG, 'CH-01');
});

test('provenance + object plugs into the shared scene_graph shape', () => {
  assert.equal(sg.provenance.route, 1);
  assert.equal(sg.provenance.source, 'dxf');
  // objects[] carries the fromScene/verify.mjs fields
  for (const f of ['id', 'type', 'size', 'center']) assert.ok(f in sg.objects[0]);
  assert.equal(sg.objects[0].source.units, 'm');
});

test('bulgeToArc: the v2→v3 segment is a 90° arc, radius √2', () => {
  const a = bulgeToArc([3, 1, 0], [3, 3, 0], 0.4142);
  assert.ok(Math.abs(a.includedAngleDeg - 90) < 0.1);
  assert.ok(Math.abs(a.radius - Math.SQRT2) < 1e-3);
  assert.deepEqual(a.center.map(v => +v.toFixed(3)), [2, 2, 0]); // CCW center (left of chord)
  assert.equal(a.points[0][0].toFixed(3), '3.000');              // starts at p0=(3,1)
  assert.deepEqual(a.points[a.points.length - 1].map(v => +v.toFixed(3)), [3, 3, 0]); // ENDS at p1=(3,3)
});

test('bulgeToArc: bulge=1 is a semicircle centered on the chord midpoint', () => {
  const a = bulgeToArc([0, 0, 0], [2, 0, 0], 1);
  assert.ok(Math.abs(a.includedAngleDeg - 180) < 1e-6);
  assert.ok(Math.abs(a.radius - 1) < 1e-9);
  assert.ok(Math.abs(a.center[0] - 1) < 1e-6 && Math.abs(a.center[1]) < 1e-6, 'center ≈ chord midpoint');
});

test('parsePairs pairs codes with values, tolerant', () => {
  const p = parsePairs('0\nLINE\n8\nWALLS');
  assert.deepEqual(p, [{ code: 0, value: 'LINE' }, { code: 8, value: 'WALLS' }]);
});

test('geometryToPolylines expands the LWPOLYLINE bulge into a real arc (centerline for voxelize)', () => {
  const lines = geometryToPolylines(sg, { arcSegments: 8 });
  assert.equal(lines.length, 6);                       // 4 walls + 1 arc + 1 polyline
  assert.ok(lines.slice(0, 4).every(l => l.length === 2)); // walls are 2-point segments
  const poly = lines.find(l => l[0][0] === 1 && l[0][1] === 1); // the PIPE polyline (starts at v1)
  assert.ok(poly && poly.length > 3, 'straight seg + sampled arc');
  assert.deepEqual(poly[0], [1, 1, 0]);                // starts at v1
  // the arc portion (v2→v3, center (4,2)) bulges toward +x: a mid sample has x > 3
  assert.ok(poly.some(p => p[0] > 3.2 && p[1] > 1 && p[1] < 3), 'arc bows toward the center side');
});

test('toLineBuffers yields consistent {positions,index} line-buffers', () => {
  const { positions, index } = toLineBuffers(sg, { arcSegments: 6 });
  assert.ok(positions.length > 0 && index.length > 0);
  for (const [i, j] of index) { assert.ok(i >= 0 && j < positions.length && j === i + 1); }
});
