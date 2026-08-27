// library: dxf-intake  (harness/dxf-intake.mjs) — pure-JS DXF ENTITIES → scene_graph reader (investigador4).
// The CAD-entry link of the {CAD·photo·spec}→VOXEL→realista axis (PIPELINE P0 Route-1, certified).
// Parses the DXF ENTITIES section (group-code/value pairs) into the shared scene_graph shape that
// voxel-blockout + spatial-harness.fromScene + hvac-fittings already consume:
//   { room:{size}|null, objects:[{id,type,size,center,ports?,source}], geometry:[{kind,layer,...,source}],
//     schedule:[], dimensions:[], units, provenance:{route:1,source:'dxf'} }
// LINE/ARC/LWPOLYLINE → geometry[] (walls, pipe/duct centerlines; LWPOLYLINE bulge → exact arc via
// bulge=tan(θ/4)); INSERT+ATTRIB → an equipment object (id from ATTRIB, type from block); ACAD_TABLE →
// schedule; DIMENSION → cotas. Every object/geometry carries source:{layer,units,scale} provenance so the
// realista output stays auditable back to the drawing. Pure-Node, offline, REPORTS only.

const num = (v) => parseFloat(v);

// canonical TYPE from a block name (keyword map) — normalizes CH_400TR→chiller, VAV_BOX→vav, etc.
const TYPE_RULES = [
  [/chiller|\bch[-_]?\d|\bch\b/i, 'chiller'], [/pump|\bp[-_]?\d/i, 'pump'],
  [/ahu|air.?hand|handler/i, 'ahu'], [/\bvav\b|vav.?box/i, 'vav'], [/valve/i, 'valve'],
  [/tank/i, 'tank'], [/\bvfd\b|panel/i, 'vfd'], [/\bfan\b/i, 'fan'], [/boiler/i, 'boiler'], [/\bfcu\b/i, 'fcu'],
];
function normalizeType(block = '') { for (const [re, t] of TYPE_RULES) if (re.test(block)) return t; return String(block).toLowerCase() || 'generic'; }
// default footprint per canonical type (m) — Route-1 fallback when the DXF carries no SIZE attribute
const SIZE_CATALOG = { chiller: [3.0, 1.2, 1.8], pump: [0.8, 0.6, 0.9], ahu: [2.5, 1.5, 2.0], vav: [0.6, 0.4, 0.4], valve: [0.3, 0.3, 0.3], tank: [1.2, 1.2, 2.0], vfd: [0.6, 0.4, 1.6], fan: [0.8, 0.8, 0.8], boiler: [2.0, 1.2, 1.8], fcu: [1.0, 0.6, 0.3] };
// parse a SIZE attribute value ("3.0x1.2x1.8" / "3.0X1.2X1.8" / "3.0*1.2*1.8") → [3,1.2,1.8] | null
function parseSize(s) { const m = String(s).trim().split(/[xX*×]/).map(Number); return (m.length === 3 && m.every(Number.isFinite)) ? m : null; }

// group-code/value pairs (alternating lines); CRLF-safe, trims.
export function parsePairs(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim();
    if (code === '') { i -= 1; continue; } // tolerate a stray blank; realign
    pairs.push({ code: parseInt(code, 10), value: lines[i + 1] });
  }
  return pairs;
}

// AutoCAD bulge → arc. bulge = tan(includedAngle/4), sign = CCW(+)/CW(-) from p0 to p1.
// Center via the canonical formula center = midpoint + a·⊥chord with a=(1/bulge − bulge)/2, so the swept
// arc provably ends at p1. Returns center/radius/signed-sweep + a sampled polyline p0…p1.
export function bulgeToArc(p0, p1, bulge, segments = 12) {
  const [x0, y0] = p0, [x1, y1] = p1, z = p0[2] ?? 0;
  if (Math.abs(bulge) < 1e-9)                                // straight segment — no arc (avoid 1/bulge → NaN)
    return { straight: true, center: null, radius: Infinity, includedAngleDeg: 0, ccw: false, points: [[x0, y0, z], [x1, y1, z]] };
  const theta = 4 * Math.atan(bulge);                       // signed included angle
  const a = (1 / bulge - bulge) / 2;
  const cx = (x0 + x1 - a * (y1 - y0)) / 2;
  const cy = (y0 + y1 + a * (x1 - x0)) / 2;
  const radius = Math.hypot(x0 - cx, y0 - cy);
  const a0 = Math.atan2(y0 - cy, x0 - cx);
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const ang = a0 + theta * (i / segments);
    pts.push([cx + radius * Math.cos(ang), cy + radius * Math.sin(ang), z]);
  }
  return { center: [cx, cy, z], radius, includedAngleDeg: theta * 180 / Math.PI, ccw: bulge > 0, points: pts };
}

// --- B-spline / NURBS evaluation (De Boor) -------------------------------------------------------------
// DXF SPLINE = control points (10/20/30), a knot vector (40×), optional rational weights (41×), degree (71).
// Curved duct/pipe centerlines are drawn as SPLINE; without this they were silently dropped and never voxelized.
// Pure-JS De Boor, no deps. Rational splines evaluated in homogeneous coords [x·w,y·w,z·w,w], then projected.
function clampedUniformKnots(n, p) {                 // fallback when the DXF knot vector is absent/malformed
  const m = n + p + 1, U = new Array(m + 1);
  for (let i = 0; i <= p; i++) U[i] = 0;
  for (let i = m - p; i <= m; i++) U[i] = 1;
  for (let j = 1; j <= n - p; j++) U[p + j] = j / (n - p + 1);
  return U;
}
function findSpan(n, p, u, U) {
  if (u >= U[n + 1]) return n;
  if (u <= U[p]) return p;
  let low = p, high = n + 1, mid = (low + high) >> 1;
  while (u < U[mid] || u >= U[mid + 1]) { if (u < U[mid]) high = mid; else low = mid; mid = (low + high) >> 1; }
  return mid;
}
function deBoorAt(k, u, p, U, Pw) {                   // Pw = homogeneous control points
  const d = [];
  for (let j = 0; j <= p; j++) d[j] = Pw[k - p + j].slice();
  for (let r = 1; r <= p; r++)
    for (let j = p; j >= r; j--) {
      const i = k - p + j, denom = U[i + p - r + 1] - U[i], a = denom === 0 ? 0 : (u - U[i]) / denom;
      for (let c = 0; c < 4; c++) d[j][c] = (1 - a) * d[j - 1][c] + a * d[j][c];
    }
  return d[p];
}
// Sample a DXF SPLINE into `segments+1` points. Robust: guards degree/knot mismatch; if it can't be evaluated
// as a B-spline it falls back to the control polygon (never a silent drop).
export function sampleSpline({ degree = 3, controlPoints = [], knots = null, weights = null } = {}, segments = 32) {
  const P = controlPoints, n = P.length - 1, p = Math.min(degree, n < 0 ? 0 : n);
  const poly = () => P.map(q => [q[0], q[1], q[2] ?? 0]);
  if (P.length < 2 || n < p || p < 1) return poly();                 // too few CPs for the degree → polygon
  const expected = n + p + 2;
  const U = (Array.isArray(knots) && knots.length === expected) ? knots : clampedUniformKnots(n, p);
  const W = (Array.isArray(weights) && weights.length === P.length) ? weights : P.map(() => 1);
  const Pw = P.map((q, i) => [q[0] * W[i], q[1] * W[i], (q[2] ?? 0) * W[i], W[i]]);
  const u0 = U[p], u1 = U[n + 1], out = [];
  for (let s = 0; s <= segments; s++) {
    const u = u0 + (u1 - u0) * (s / segments);
    const c = deBoorAt(findSpan(n, p, u, U), u, p, U, Pw);
    out.push([c[0] / c[3], c[1] / c[3], c[2] / c[3]]);
  }
  return out;
}

// split the pair stream into entity records (each: {type, pairs:[]}), respecting SECTION/ENDSEC/EOF/SEQEND.
function entities(pairs) {
  const ents = []; let cur = null;
  for (const p of pairs) {
    if (p.code === 0) {
      if (cur) ents.push(cur);
      const t = p.value.trim();
      cur = (t === 'ENDSEC' || t === 'EOF' || t === 'SECTION') ? null : { type: t, pairs: [] };
      continue;
    }
    if (cur) cur.pairs.push(p);
  }
  if (cur) ents.push(cur);
  return ents;
}

const first = (e, code) => { const p = e.pairs.find(x => x.code === code); return p ? p.value : undefined; };
const layerOf = (e) => (first(e, 8) || '0').trim();

// Annotation / non-fabric layer tokens (EN + ES). These layers must NOT delimit the physical room extents:
// including them explodes the bbox. Real evidence (nave-panccadia, an industrial AutoCAD-2007 plan): TEXT/
// EJES/COTAS were scattered across X=6..608 m, so extruding them as if they were geometry "produces garbage".
// Only fabric layers (walls, columns, equipment) bound the room. A layer is annotation if ANY of its
// separator-split tokens is in this set — so "A-ANNO-TEXT", "EJES", "Cotas" all match, while "MURO BAJO" does not.
// Deliberately NOT here: layer "0" (AutoCAD's default layer routinely holds real geometry) — opt in per-drawing
// via readDxf(text,{annotationLayers:['0']}) when a specific drawing abuses it.
const ANNOTATION_TOKENS = new Set([
  'dim', 'dims', 'dimension', 'dimensions', 'cota', 'cotas', 'text', 'texto', 'textos', 'mtext', 'note', 'notes',
  'leader', 'grid', 'eje', 'ejes', 'axis', 'hatch', 'symbol', 'symbols', 'simbologia', 'simbología', 'area', 'área',
  'title', 'titleblock', 'leyenda', 'legend', 'annot', 'annotation', 'anno', 'defpoints', 'tag', 'tags',
]);
export function isAnnotationLayer(layer, extra) {
  const name = String(layer).trim();
  if (extra && extra.has(name.toUpperCase())) return true;              // per-drawing overrides (e.g. '0')
  return name.toLowerCase().split(/[-_ /]+/).filter(Boolean).some(t => ANNOTATION_TOKENS.has(t));
}

// MTEXT stores its string across group-code 3 chunks (each ≤250 chars) followed by the final code-1 part, and
// wraps it in inline formatting codes. Strip the codes to plain text so a cota like "300x200" is readable.
// (\P → newline; \px…; \fArial…; \H2.5x; \C1; \A1; … → dropped; braces are grouping; \~ nbsp; \\ → \.)
export function stripMText(s) {
  return String(s)
    .replace(/\\P/g, '\n')
    .replace(/\\p[^;]*;/g, '')
    .replace(/\\[A-Za-z][^;\\]*;/g, '')   // formatting run with a terminating ';'
    .replace(/\\[A-Za-z]/g, '')           // bare toggles (\L \l \O \o \k)
    .replace(/\\~/g, ' ').replace(/\\\\/g, '\\')
    .replace(/[{}]/g, '')
    .trim();
}
// Does a label look like an engineering COTA (a size/flow/elevation)? Detection ONLY — this deliberately does
// NOT parse WxH/Ø into named fields (that waits for the shared provenance contract). It exists so the spine can
// FAIL-LOUD on "0 DIMENSION entities but N sized MTEXT" instead of falsely reporting "no cotas". EN+ES + Ø/DN.
const SIZED_COTA = /\d\s*[xX×]\s*\d|[øØ⌀ϕΦ]\s*\d|\bDN\s*\d|\bCFM\b|\bl\/s\b|\bBOD\b|\bNPT\b/i;
export const isSizedCota = (text) => SIZED_COTA.test(String(text));

// world points of a block-definition entity (for the block's footprint bbox)
function collectPoints(e) {
  const pts = [];
  if (e.type === 'LINE') { pts.push([num(first(e, 10)), num(first(e, 20)), num(first(e, 30) ?? '0')], [num(first(e, 11)), num(first(e, 21)), num(first(e, 31) ?? '0')]); }
  else if (e.type === 'LWPOLYLINE') { let x = null; for (const p of e.pairs) { if (p.code === 10) x = num(p.value); else if (p.code === 20 && x != null) { pts.push([x, num(p.value), 0]); x = null; } } }
  else if (e.type === 'ARC' || e.type === 'CIRCLE') { const c = [num(first(e, 10)), num(first(e, 20)), num(first(e, 30) ?? '0')], r = num(first(e, 40)); pts.push([c[0] - r, c[1] - r, c[2]], [c[0] + r, c[1] + r, c[2]]); }
  else if (e.type === 'POINT') pts.push([num(first(e, 10)), num(first(e, 20)), num(first(e, 30) ?? '0')]);
  else if (e.type === 'SPLINE') { let x = null; for (const p of e.pairs) { if (p.code === 10) x = num(p.value); else if (p.code === 20 && x != null) { pts.push([x, num(p.value), 0]); x = null; } } }
  return pts.filter(p => p.every(Number.isFinite));
}
// scan the flat entity list: pull BLOCK…ENDBLK definitions (name → footprint size), return the MAIN entities.
function extractBlocks(ents) {
  const blocks = {}; const main = []; let cur = null;
  for (const e of ents) {
    if (e.type === 'BLOCK') { cur = { name: (first(e, 2) || '').trim(), pts: [] }; continue; }
    if (e.type === 'ENDBLK') { if (cur) { blocks[cur.name] = bboxSize(cur.pts); cur = null; } continue; }
    if (cur) cur.pts.push(...collectPoints(e)); else main.push(e);
  }
  return { blocks, main };
}
function bboxSize(pts) {
  if (!pts.length) return null;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); }
  return [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
}

export function readDxf(text, { units = 'm', annotationLayers = [] } = {}) {
  const src = (e) => ({ layer: layerOf(e), entity: e.type, units, scale: 1 });
  const objects = [], geometry = [], schedule = [], dimensions = [], annotations = [];
  let pendingInsert = null; // INSERT awaiting its ATTRIBs until SEQEND

  const { blocks, main } = extractBlocks(entities(parsePairs(text)));
  for (const e of main) {
    switch (e.type) {
      case 'LINE':
        geometry.push({ kind: 'segment', layer: layerOf(e),
          points: [[num(first(e, 10)), num(first(e, 20)), num(first(e, 30) ?? '0')],
                   [num(first(e, 11)), num(first(e, 21)), num(first(e, 31) ?? '0')]], source: src(e) });
        break;
      case 'ARC':
        geometry.push({ kind: 'arc', layer: layerOf(e),
          center: [num(first(e, 10)), num(first(e, 20)), num(first(e, 30) ?? '0')],
          radius: num(first(e, 40)), startAngleDeg: num(first(e, 50)), endAngleDeg: num(first(e, 51)), source: src(e) });
        break;
      case 'CIRCLE':
        geometry.push({ kind: 'circle', layer: layerOf(e),
          center: [num(first(e, 10)), num(first(e, 20)), num(first(e, 30) ?? '0')],
          radius: num(first(e, 40)), source: src(e) });
        break;
      case 'ELLIPSE':
        geometry.push({ kind: 'ellipse', layer: layerOf(e),
          center: [num(first(e, 10)), num(first(e, 20)), num(first(e, 30) ?? '0')],
          majorEnd: [num(first(e, 11)), num(first(e, 21)), num(first(e, 31) ?? '0')], // major-axis endpoint RELATIVE to center
          ratio: num(first(e, 40)), startParam: num(first(e, 41) ?? '0'), endParam: num(first(e, 42) ?? String(2 * Math.PI)), source: src(e) });
        break;
      case 'SPLINE': {
        const degree = parseInt(first(e, 71) || '3', 10);
        const flags = parseInt(first(e, 70) || '0', 10);
        const knots = [], weights = [], cps = []; let v = null;
        for (const pr of e.pairs) {                        // codes interleave: 40 knots, 41 weights, 10/20/30 CPs
          if (pr.code === 40) knots.push(num(pr.value));
          else if (pr.code === 41) weights.push(num(pr.value));
          else if (pr.code === 10) { if (v) cps.push(v); v = [num(pr.value), 0, 0]; }
          else if (pr.code === 20 && v) v[1] = num(pr.value);
          else if (pr.code === 30 && v) v[2] = num(pr.value);
        }
        if (v) cps.push(v);
        geometry.push({ kind: 'spline', layer: layerOf(e), degree, closed: (flags & 1) === 1,
          controlPoints: cps, knots, weights: weights.length === cps.length ? weights : null, source: src(e) });
        break;
      }
      case 'LWPOLYLINE': {
        const flags = parseInt(first(e, 70) || '0', 10);
        const verts = []; let v = null;
        for (const p of e.pairs) {
          if (p.code === 10) { if (v) verts.push(v); v = { x: num(p.value), y: 0, bulge: 0 }; }
          else if (p.code === 20 && v) v.y = num(p.value);
          else if (p.code === 42 && v) v.bulge = num(p.value); // OPTIONAL per vertex
        }
        if (v) verts.push(v);
        geometry.push({ kind: 'polyline', layer: layerOf(e), closed: (flags & 1) === 1,
          vertices: verts.map(w => ({ point: [w.x, w.y, 0], bulge: w.bulge })), source: src(e) });
        break;
      }
      case 'INSERT': {
        const block = (first(e, 2) || '').trim();
        const type = normalizeType(block);
        const catSize = SIZE_CATALOG[type];
        const scale = [num(first(e, 41) ?? '1'), num(first(e, 42) ?? '1'), num(first(e, 43) ?? '1')];
        // size ladder: ATTRIB SIZE (later) > block-def footprint > type catalog > placeholder.
        // A 2D plan block gives a certified X/Y footprint but no height → take height from the catalog.
        const bdef = blocks[block];
        let size, sizeSource;
        if (bdef && (bdef[0] > 1e-6 || bdef[1] > 1e-6)) {
          const dx = bdef[0] * scale[0], dy = bdef[1] * scale[1], dz = bdef[2] * scale[2];
          const flat = dz <= 1e-6;
          size = [dx > 1e-6 ? dx : (catSize ? catSize[0] : 1), dy > 1e-6 ? dy : (catSize ? catSize[1] : 1), flat ? (catSize ? catSize[2] : 1) : dz];
          sizeSource = flat ? 'block-def-2d' : 'block-def';   // 2D footprint + catalog height, or full 3D bbox
        } else if (catSize) { size = [...catSize]; sizeSource = 'catalog'; }
        else { size = [1, 1, 1]; sizeSource = 'placeholder'; }
        pendingInsert = {
          id: block || 'BLOCK',                                // block name until a TAG attrib overrides
          type, size,
          center: [num(first(e, 10)), num(first(e, 20)), num(first(e, 30) ?? '0')],
          source: { ...src(e), block, sizeSource, scale, rotationDeg: num(first(e, 50) ?? '0') },
        };
        objects.push(pendingInsert);
        break;
      }
      case 'ATTRIB':
        if (pendingInsert) {
          const tag = (first(e, 2) || '').trim().toUpperCase(), val = (first(e, 1) || '').trim();
          (pendingInsert.attributes ||= {})[tag || 'TAG'] = val;
          if (tag === 'SIZE') { const sz = parseSize(val); if (sz) { pendingInsert.size = sz; pendingInsert.source.sizeSource = 'attrib'; } }
          else if (tag === 'TAG' && val) pendingInsert.id = val; // e.g. CH-01
        }
        break;
      case 'SEQEND': pendingInsert = null; break;
      case 'DIMENSION':
        dimensions.push({ value: (first(e, 1) || '').trim() || null, layer: layerOf(e),
          points: [[num(first(e, 10) ?? '0'), num(first(e, 20) ?? '0'), 0]], source: src(e) });
        break;
      case 'ACAD_TABLE':
        schedule.push({ layer: layerOf(e), cells: e.pairs.filter(p => p.code === 1 || p.code === 302).map(p => p.value.trim()), source: src(e) });
        break;
      case 'TEXT': {
        const text = (first(e, 1) || '').trim();
        if (text) annotations.push({ text, kind: 'TEXT', sizedCota: isSizedCota(text),
          position: [num(first(e, 10) ?? '0'), num(first(e, 20) ?? '0'), num(first(e, 30) ?? '0')],
          height: num(first(e, 40) ?? '0'), rotationDeg: num(first(e, 50) ?? '0'), layer: layerOf(e), source: src(e) });
        break;
      }
      case 'MTEXT': {
        // reassemble across code-3 chunks + final code-1, then strip inline formatting to plain text.
        const raw = e.pairs.filter(p => p.code === 3).map(p => p.value).join('') + (first(e, 1) || '');
        const text = stripMText(raw);
        if (text) annotations.push({ text, kind: 'MTEXT', sizedCota: isSizedCota(text),
          position: [num(first(e, 10) ?? '0'), num(first(e, 20) ?? '0'), num(first(e, 30) ?? '0')],
          height: num(first(e, 40) ?? '0'), rotationDeg: num(first(e, 50) ?? '0'), layer: layerOf(e), source: src(e) });
        break;
      }
      default: break;
    }
  }

  // room extents from WALLS geometry (else all geometry) — include circle/ellipse bbox corners
  const ptsOf = (g) => {
    if (g.points) return g.points;
    if (g.vertices) return g.vertices.map(v => v.point);
    if (g.kind === 'circle') { const [x, y, z] = g.center, r = g.radius; return [[x - r, y - r, z], [x + r, y + r, z]]; }
    if (g.kind === 'ellipse') { const [x, y, z] = g.center, m = Math.hypot(g.majorEnd[0], g.majorEnd[1]); return [[x - m, y - m, z], [x + m, y + m, z]]; }
    if (g.kind === 'spline') return g.controlPoints || [];   // control polygon bounds the curve (convex hull)
    return [];
  };
  // Only FABRIC layers may bound the room — annotation layers (cotas/text/grid/…) scatter across the sheet
  // and would explode the bbox, corrupting the downstream voxel-grid extents. See ANNOTATION_TOKENS above.
  const extra = new Set(annotationLayers.map(s => String(s).toUpperCase()));
  const fabric = geometry.filter(g => !isAnnotationLayer(g.layer, extra));
  const wall = fabric.filter(g => g.layer.toUpperCase() === 'WALLS' && (g.points || g.kind === 'circle' || g.kind === 'ellipse'));
  const pool = (wall.length ? wall : fabric).flatMap(ptsOf);
  let room = null;
  if (pool.length) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const p of pool) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); }
    // excludedLayers keeps the room bbox auditable back to the drawing (which layers were treated as annotation).
    const excludedLayers = [...new Set(geometry.filter(g => isAnnotationLayer(g.layer, extra)).map(g => g.layer))];
    room = { size: [mx[0] - mn[0], mx[1] - mn[1], Math.max(0, mx[2] - mn[2])], origin: mn, excludedLayers };
  }

  // cotas summary: lets the spine FAIL-LOUD when a sheet carries sized MTEXT but 0 DIMENSION entities
  // (real COB-IM2 case) instead of falsely reporting "no cotas". Detection only — no WxH/Ø field names yet.
  const sizedText = annotations.filter(a => a.sizedCota).length;

  // stable per-entity ids (deterministic parse order) so an agent can ADDRESS the drawing without re-scanning
  // (investigacion4 "UUID per trazo" + the getObjectsByLayer/getById tools). Additive: consumers ignore uid.
  objects.forEach((o, i) => { o.uid = `o-${i + 1}`; });
  geometry.forEach((g, i) => { g.uid = `g-${i + 1}`; });
  annotations.forEach((a, i) => { a.uid = `a-${i + 1}`; });

  return { room, objects, geometry, schedule, dimensions, annotations, units,
    provenance: { route: 1, source: 'dxf', cotas: { dimensionEntities: dimensions.length, sizedText } } };
}

// --- scene_graph queries (agent addressability) --------------------------------------------------------
// Every object/geometry/annotation carries a stable uid (deterministic parse order) and a layer, so an agent
// can address the drawing without re-scanning it. investigacion4's named tools: getById / getObjectsByLayer.
const layerOfEntry = (e) => e.layer ?? e.source?.layer;           // geometry/annotations: e.layer; objects: e.source.layer
const layerEq = (a, b) => String(a ?? '').toUpperCase() === String(b ?? '').toUpperCase();

export function getById(sg, uid) {
  for (const arr of [sg.objects, sg.geometry, sg.annotations]) {
    const hit = (arr || []).find(e => e.uid === uid);
    if (hit) return hit;
  }
  return null;
}
export function getObjectsByLayer(sg, layer) { return (sg.objects || []).filter(o => layerEq(layerOfEntry(o), layer)); }
export function getByLayer(sg, layer) {
  const on = (e) => layerEq(layerOfEntry(e), layer);
  return { objects: (sg.objects || []).filter(on), geometry: (sg.geometry || []).filter(on), annotations: (sg.annotations || []).filter(on) };
}

// Expand geometry[] into explicit world POLYLINES (LWPOLYLINE bulges → sampled arcs, ARC/CIRCLE sampled,
// LINE as 2 points) — the centerline form the voxelizer / hvac-fittings consume.
export function geometryToPolylines(sg, { arcSegments = 12 } = {}) {
  const lines = [];
  for (const g of sg.geometry) {
    if (g.kind === 'segment') lines.push([g.points[0], g.points[1]]);
    else if (g.kind === 'arc') {
      const [cx, cy, cz] = g.center, a0 = g.startAngleDeg * Math.PI / 180, a1 = g.endAngleDeg * Math.PI / 180;
      const pts = []; for (let i = 0; i <= arcSegments; i++) { const a = a0 + (a1 - a0) * (i / arcSegments); pts.push([cx + g.radius * Math.cos(a), cy + g.radius * Math.sin(a), cz]); }
      lines.push(pts);
    } else if (g.kind === 'polyline') {
      const V = g.vertices, pts = [];
      for (let i = 0; i < V.length - 1; i++) {
        const a = V[i].point, b = V[i + 1].point, bulge = V[i].bulge;
        if (bulge && Math.abs(bulge) > 1e-9) { const arc = bulgeToArc(a, b, bulge, arcSegments); for (let k = 0; k < arc.points.length - 1; k++) pts.push(arc.points[k]); }
        else pts.push(a);
      }
      if (V.length) pts.push(V[V.length - 1].point);
      if (g.closed && V.length) pts.push(V[0].point);
      lines.push(pts);
    } else if (g.kind === 'circle') {
      const [cx, cy, cz] = g.center, r = g.radius, n = arcSegments * 2, pts = [];
      for (let i = 0; i <= n; i++) { const a = 2 * Math.PI * (i / n); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a), cz]); }
      lines.push(pts); // closed loop
    } else if (g.kind === 'ellipse') {
      const [cx, cy, cz] = g.center, ang = Math.atan2(g.majorEnd[1], g.majorEnd[0]);
      const major = Math.hypot(g.majorEnd[0], g.majorEnd[1]), minor = major * g.ratio;
      const t0 = g.startParam, t1 = g.endParam, n = arcSegments * 2, pts = [];
      for (let i = 0; i <= n; i++) {
        const t = t0 + (t1 - t0) * (i / n), ex = major * Math.cos(t), ey = minor * Math.sin(t);
        pts.push([cx + ex * Math.cos(ang) - ey * Math.sin(ang), cy + ex * Math.sin(ang) + ey * Math.cos(ang), cz]);
      }
      lines.push(pts);
    } else if (g.kind === 'spline') {
      const segs = Math.max(16, (g.controlPoints.length - 1) * arcSegments);
      const pts = sampleSpline(g, segs);
      if (g.closed && pts.length) pts.push(pts[0]);
      lines.push(pts);
    }
  }
  return lines;
}

// Classify what KIND of source a parsed scene_graph came from, so downstream design-intent checks can tell
// "empty because the source is 2D LINE-WORK (traced over a PDF underlay — no placed fittings/heights/BIM to
// check)" apart from "empty because the parse BROKE". Real evidence (Revisor, COB-IM2 L4): 41k–43k LWPOLYLINE
// on PDF_*/PDF2_* layers + discipline layers HVAC-Ductos/M-HVAC-DUCT, no placed objects, no heights.
// Pure function — does NOT touch provenance (height/width field names stay owned by the shared contract).
export function classifyDxfSource(sg = {}) {
  const objects = sg.objects || [], geometry = sg.geometry || [], annotations = sg.annotations || [];
  const counts = {
    objects: objects.length,
    polylines: geometry.filter(g => g.kind === 'polyline').length,
    lines: geometry.filter(g => g.kind === 'segment').length,
    curves: geometry.filter(g => g.kind === 'arc' || g.kind === 'circle' || g.kind === 'ellipse').length,
    annotations: annotations.length,
    schedule: (sg.schedule || []).length,
    geometryTotal: geometry.length,
  };
  const underlayLayers = [...new Set(geometry.map(g => g.layer).filter(L => /^pdf\d*[_-]/i.test(String(L))))];
  const hasHeight = geometry.some(g => (g.points || []).some(p => Math.abs(p[2] || 0) > 1e-6))
    || objects.some(o => o.center && Math.abs(o.center[2] || 0) > 1e-6);

  // genuine failure/empty: nothing at all was parsed
  if (counts.geometryTotal === 0 && counts.objects === 0 && counts.annotations === 0)
    return { kind: 'empty', designIntentAvailable: false, hasHeight, counts, underlayLayers,
      reason: 'no entities parsed — the DXF has no ENTITIES section or the parse failed. A PARSE/SOURCE failure, not a structural line-work case.' };

  // placed equipment present → the object model exists, design-intent checks apply
  if (counts.objects > 0)
    return { kind: 'object', designIntentAvailable: true, hasHeight, counts, underlayLayers,
      reason: `${counts.objects} placed equipment object(s) — design-intent checks (fittings, schedule DN, elevations) apply.` };

  // geometry but no placed objects → 2D line-work: design-intent is STRUCTURALLY empty, not a parse failure
  return { kind: 'line-work', designIntentAvailable: false, hasHeight, counts, underlayLayers,
    reason: `source is 2D line-work (${counts.geometryTotal} geometry entities${underlayLayers.length ? ` on PDF-underlay layers ${underlayLayers.join(', ')}` : ''}), no placed fittings/heights/BIM objects. Design-intent checks (placed elbows, schedule DN, elevations) are STRUCTURALLY empty — NOT a parse failure.` };
}

// Flatten geometry into {positions:[[x,y,z]...], index:[[i,j]...]} line-buffers (bulges expanded) — the
// {positions,index} feed inv3's voxelize()/inv4 voxel-blockout consume for the CAD→VOXEL step.
export function toLineBuffers(sg, opts) {
  const positions = [], index = [];
  for (const pl of geometryToPolylines(sg, opts)) {
    const base = positions.length;
    for (const p of pl) positions.push(p);
    for (let i = 0; i < pl.length - 1; i++) index.push([base + i, base + i + 1]);
  }
  return { positions, index };
}
