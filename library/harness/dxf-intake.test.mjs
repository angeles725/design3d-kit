import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDxf, parsePairs, bulgeToArc, geometryToPolylines, toLineBuffers, isAnnotationLayer } from './dxf-intake.mjs';

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
  assert.equal(o.source.sizeSource, 'catalog');          // no SIZE attrib → Route-1 catalog default
  assert.deepEqual(o.size, [3.0, 1.2, 1.8]);             // chiller catalog footprint, not a 1×1×1 placeholder
  assert.equal(o.attributes.TAG, 'CH-01');
});

const insertDxf = (block, attribs = '') => `0
SECTION
2
ENTITIES
0
INSERT
8
EQUIP
66
1
2
${block}
10
1.0
20
1.0
30
0.0
${attribs}0
SEQEND
8
EQUIP
0
ENDSEC
0
EOF`;

test('block name → canonical type + catalog size (CH_400TR → chiller [3,1.2,1.8])', () => {
  const o = readDxf(insertDxf('CH_400TR')).objects[0];
  assert.equal(o.type, 'chiller');
  assert.deepEqual(o.size, [3.0, 1.2, 1.8]);
  assert.equal(o.source.sizeSource, 'catalog');
});

test('ATTRIB SIZE → object size (Route-1 source overrides the catalog default)', () => {
  const attribs = `0
ATTRIB
8
EQUIP
1
2.5x1.5x2.0
2
SIZE
10
1.0
20
1.0
30
0.0
`;
  const o = readDxf(insertDxf('AHU_5000', attribs)).objects[0];
  assert.deepEqual(o.size, [2.5, 1.5, 2.0]);
  assert.equal(o.source.sizeSource, 'attrib');
  assert.equal(o.type, 'ahu');
});

test('bulgeToArc guards bulge=0 (straight segment, no NaN / divide-by-zero)', () => {
  const a = bulgeToArc([0, 0, 0], [2, 0, 0], 0);
  assert.equal(a.straight, true);
  assert.deepEqual(a.points, [[0, 0, 0], [2, 0, 0]]);
  assert.ok(a.points.every(p => p.every(Number.isFinite)), 'no NaN');
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

// a DXF with a BLOCKS section: block PUMP_SKID = 1.5×0.8 footprint (LWPOLYLINE), INSERTed at scale
const blockDxf = (scale = '1.0') => `0
SECTION
2
BLOCKS
0
BLOCK
8
0
2
PUMP_SKID
10
0.0
20
0.0
30
0.0
0
LWPOLYLINE
8
0
90
4
70
1
10
0.0
20
0.0
10
1.5
20
0.0
10
1.5
20
0.8
10
0.0
20
0.8
0
ENDBLK
0
ENDSEC
0
SECTION
2
ENTITIES
0
INSERT
8
EQUIP
2
PUMP_SKID
10
5.0
20
5.0
30
0.0
41
${scale}
42
${scale}
43
${scale}
50
0.0
0
ENDSEC
0
EOF`;

test('BLOCK-DEF footprint sizes the INSERT (certified X/Y from the drawing, height from catalog for a 2D block)', () => {
  const o = readDxf(blockDxf()).objects[0];
  assert.equal(o.type, 'pump');
  assert.deepEqual(o.size, [1.5, 0.8, 0.9]);        // 1.5×0.8 from the block footprint; 0.9 = pump catalog height
  assert.equal(o.source.sizeSource, 'block-def-2d');
  assert.deepEqual(o.center, [5, 5, 0]);
  // the block-def is NOT leaked as a main entity
  assert.equal(readDxf(blockDxf()).objects.length, 1);
});

test('INSERT scale multiplies the block-def footprint', () => {
  const o = readDxf(blockDxf('2.0')).objects[0];
  assert.deepEqual(o.size.slice(0, 2), [3.0, 1.6]);  // footprint ×2; height still catalog
});

test('block-def overrides the catalog default (a real drawing footprint beats a type guess)', () => {
  // block CHILLER_X with a 4×1.5 footprint should win over the chiller catalog [3,1.2,*]
  const dxf = blockDxf().replace(/PUMP_SKID/g, 'CHILLER_X').replace('1.5\n20\n0.0\n10\n1.5\n20\n0.8', '4.0\n20\n0.0\n10\n4.0\n20\n1.5');
  const o = readDxf(dxf).objects[0];
  assert.equal(o.type, 'chiller');
  assert.equal(o.size[0], 4.0);                      // from the drawing, not catalog 3.0
  assert.ok(o.source.sizeSource.startsWith('block-def'));
});

const circleDxf = `0
SECTION
2
ENTITIES
0
CIRCLE
8
DUCT
10
5.0
20
5.0
30
0.0
40
1.0
0
ELLIPSE
8
DUCT
10
2.0
20
2.0
30
0.0
11
1.0
21
0.0
31
0.0
40
0.5
41
0.0
42
6.283185307
0
ENDSEC
0
EOF`;
const csg = readDxf(circleDxf);

test('CIRCLE parses to geometry (center + radius) and enters the room extents', () => {
  const c = csg.geometry.find(g => g.kind === 'circle');
  assert.deepEqual(c.center, [5, 5, 0]);
  assert.equal(c.radius, 1);
  assert.equal(c.layer, 'DUCT');
  assert.equal(csg.room.size[0], 5); // bbox x: ellipse min 1 (2−|major|=2−1) → circle max 6 = span 5
});

test('ELLIPSE parses to geometry (center, major axis, ratio)', () => {
  const el = csg.geometry.find(g => g.kind === 'ellipse');
  assert.deepEqual(el.center, [2, 2, 0]);
  assert.deepEqual(el.majorEnd, [1, 0, 0]);
  assert.equal(el.ratio, 0.5);
});

test('geometryToPolylines samples a CIRCLE as a closed loop, all points at radius r', () => {
  const lines = geometryToPolylines(csg, { arcSegments: 6 });
  const circle = lines.find(l => l.length > 6 && Math.abs(Math.hypot(l[0][0] - 5, l[0][1] - 5) - 1) < 1e-9);
  assert.ok(circle, 'circle sampled');
  for (const p of circle) assert.ok(Math.abs(Math.hypot(p[0] - 5, p[1] - 5) - 1) < 1e-9, 'on the circle');
  assert.deepEqual(circle[0].map(v => +v.toFixed(6)), [6, 5, 0]); // t=0 → (cx+r, cy)
});

test('geometryToPolylines samples an ELLIPSE (major 1, minor 0.5)', () => {
  const lines = geometryToPolylines(csg, { arcSegments: 8 });
  const ell = lines.find(l => l.some(p => Math.abs(p[0] - 3) < 1e-6 && Math.abs(p[1] - 2) < 1e-6)); // t=0 → (2+1,2)
  assert.ok(ell, 'ellipse sampled through its major vertex (3,2)');
  assert.ok(ell.some(p => Math.abs(p[0] - 2) < 1e-6 && Math.abs(p[1] - 2.5) < 1e-6), 'minor vertex (2,2.5)');
});

// --- annotation-layer exclusion from room extents (regression) -----------------------------------------
// Real-corpus failure mode (nave-panccadia, AutoCAD-2007): annotation layers (Cotas/EJES/TEXTO/SIMBOLOGÍA/
// ÁREA) scatter entities across the whole sheet (X=6..608 m). Including them in the room bbox "produces
// garbage" and corrupts the downstream voxel-grid extents. Only fabric layers may bound the room.
const seg = (layer, x0, y0, x1, y1) => `0\nLINE\n8\n${layer}\n10\n${x0}\n20\n${y0}\n30\n0.0\n11\n${x1}\n21\n${y1}\n31\n0.0\n`;
// 6x4 fabric footprint on MUROS (no WALLS layer → tests the fabric fallback path, as a real ES drawing does),
// plus a grid line on EJES and a note on TEXTO thrown far across the sheet.
const annoDxf = `0\nSECTION\n2\nENTITIES\n${seg('MUROS', 0, 0, 6, 0)}${seg('MUROS', 6, 0, 6, 4)}${seg('EJES', 300, -70, 608, 589)}${seg('TEXTO', 6, 500, 20, 520)}0\nENDSEC\n0\nEOF\n`;

test('isAnnotationLayer: EN+ES annotation tokens matched, fabric layers untouched, layer 0 not default-excluded', () => {
  for (const a of ['EJES', 'TEXTO', 'Cotas', 'A-ANNO-TEXT', 'SIMBOLOGÍA', 'ÁREA', 'DIM', 'GRID', 'HATCH', 'DEFPOINTS'])
    assert.ok(isAnnotationLayer(a), `${a} is annotation`);
  for (const f of ['MUROS', 'WALLS', 'MURO BAJO', 'COLUMNAS', 'EQUIPOS', 'HVAC', '0'])
    assert.ok(!isAnnotationLayer(f), `${f} is fabric`);
  assert.ok(isAnnotationLayer('0', new Set(['0'])), 'layer 0 excluded only when opted in');
});

test('room extents ignore annotation layers (bbox stays 6x4, not exploded to ~600)', () => {
  const sg = readDxf(annoDxf);
  assert.ok(sg.room, 'room derived');
  assert.ok(Math.abs(sg.room.size[0] - 6) < 1e-9 && Math.abs(sg.room.size[1] - 4) < 1e-9,
    `room is the fabric 6x4, got ${sg.room.size}`);
  assert.deepEqual([...sg.room.excludedLayers].sort(), ['EJES', 'TEXTO'], 'annotation layers recorded for audit');
  // all four entities still parsed into geometry[] — exclusion only scopes the room bbox, not the data.
  assert.equal(sg.geometry.length, 4);
});

test('annotationLayers override: a drawing that abuses layer 0 can exclude it', () => {
  const dxf = `0\nSECTION\n2\nENTITIES\n${seg('MUROS', 0, 0, 6, 0)}${seg('MUROS', 6, 0, 6, 4)}${seg('0', 900, 900, 950, 950)}0\nENDSEC\n0\nEOF\n`;
  const withZero = readDxf(dxf);                       // layer 0 IS fabric by default → bbox explodes toward 950
  assert.ok(withZero.room.size[0] > 900, 'layer 0 counted as fabric by default');
  const excludeZero = readDxf(dxf, { annotationLayers: ['0'] });
  assert.ok(Math.abs(excludeZero.room.size[0] - 6) < 1e-9, 'layer 0 excluded on request → clean 6x4');
  assert.deepEqual([...excludeZero.room.excludedLayers], ['0']);
});
