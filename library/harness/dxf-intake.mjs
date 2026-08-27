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

export function readDxf(text, { units = 'm' } = {}) {
  const src = (e) => ({ layer: layerOf(e), entity: e.type, units, scale: 1 });
  const objects = [], geometry = [], schedule = [], dimensions = [];
  let pendingInsert = null; // INSERT awaiting its ATTRIBs until SEQEND

  for (const e of entities(parsePairs(text))) {
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
      case 'INSERT':
        pendingInsert = {
          id: (first(e, 2) || 'BLOCK').trim(),                 // temporary id = block name; ATTRIB overrides
          type: (first(e, 2) || 'generic').trim().toLowerCase(),
          size: [1, 1, 1],                                     // placeholder — no block-def bbox / schedule yet
          center: [num(first(e, 10)), num(first(e, 20)), num(first(e, 30) ?? '0')],
          source: { ...src(e), block: (first(e, 2) || '').trim(), sizeSource: 'placeholder',
            scale: [num(first(e, 41) ?? '1'), num(first(e, 42) ?? '1'), num(first(e, 43) ?? '1')],
            rotationDeg: num(first(e, 50) ?? '0') },
        };
        objects.push(pendingInsert);
        break;
      case 'ATTRIB':
        if (pendingInsert) {
          const tag = (first(e, 2) || '').trim(), val = (first(e, 1) || '').trim();
          if (val) pendingInsert.id = val;                    // e.g. CH-01
          (pendingInsert.attributes ||= {})[tag || 'TAG'] = val;
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

  // room extents from WALLS geometry (else all geometry)
  const wall = geometry.filter(g => g.layer.toUpperCase() === 'WALLS' && g.points);
  const pool = (wall.length ? wall : geometry).flatMap(g => g.points || (g.vertices ? g.vertices.map(v => v.point) : []) || []);
  let room = null;
  if (pool.length) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const p of pool) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); }
    room = { size: [mx[0] - mn[0], mx[1] - mn[1], Math.max(0, mx[2] - mn[2])], origin: mn };
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
