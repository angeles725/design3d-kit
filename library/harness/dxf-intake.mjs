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

// world points of a block-definition entity (for the block's footprint bbox)
function collectPoints(e) {
  const pts = [];
  if (e.type === 'LINE') { pts.push([num(first(e, 10)), num(first(e, 20)), num(first(e, 30) ?? '0')], [num(first(e, 11)), num(first(e, 21)), num(first(e, 31) ?? '0')]); }
  else if (e.type === 'LWPOLYLINE') { let x = null; for (const p of e.pairs) { if (p.code === 10) x = num(p.value); else if (p.code === 20 && x != null) { pts.push([x, num(p.value), 0]); x = null; } } }
  else if (e.type === 'ARC' || e.type === 'CIRCLE') { const c = [num(first(e, 10)), num(first(e, 20)), num(first(e, 30) ?? '0')], r = num(first(e, 40)); pts.push([c[0] - r, c[1] - r, c[2]], [c[0] + r, c[1] + r, c[2]]); }
  else if (e.type === 'POINT') pts.push([num(first(e, 10)), num(first(e, 20)), num(first(e, 30) ?? '0')]);
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
  const objects = [], geometry = [], schedule = [], dimensions = [];
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
      default: break;
    }
  }

  // room extents from WALLS geometry (else all geometry) — include circle/ellipse bbox corners
  const ptsOf = (g) => {
    if (g.points) return g.points;
    if (g.vertices) return g.vertices.map(v => v.point);
    if (g.kind === 'circle') { const [x, y, z] = g.center, r = g.radius; return [[x - r, y - r, z], [x + r, y + r, z]]; }
    if (g.kind === 'ellipse') { const [x, y, z] = g.center, m = Math.hypot(g.majorEnd[0], g.majorEnd[1]); return [[x - m, y - m, z], [x + m, y + m, z]]; }
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

  return { room, objects, geometry, schedule, dimensions, units, provenance: { route: 1, source: 'dxf' } };
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
    }
  }
  return lines;
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
