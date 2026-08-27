// library: duct-vectorize  (parts/duct-vectorize.mjs) — voxel→CAD junction classifier (investigador3, v1.19).
// source: design3d numerical pass · investigacion.md voxel-as-spatial-brain thesis (2026-08-26). The
//         doc's central idea: a voxel/blockout duct run is not throwaway — it VECTORIZES to CAD. The
//         semantic mapping is exact: a straight run → a duct centerline; a corner → an elbow; a split →
//         a tee; a cross → a cross fitting; a same-axis cross-section change → a reducer.
// what: FIRST vectorizer increment — the JUNCTION CLASSIFIER. Given a set of axis-aligned duct RUNS
//       (segment + cross-section), it finds where run-ends meet and types each junction into the fitting
//       the built model needs. Composes downstream with fitting-select (elbow orientation), rect-duct
//       (box walls per run) and pipe-run/hvac-fittings. Voxel→runs skeletonization is a later increment;
//       this is the graph/semantics core that turns a run-list into a fitting-list.
// deps: NONE. Pure vector math over plain arrays. REPORTS-ONLY, deterministic (stable sorts, no RNG).

const EPS = 1e-6;
const key3 = (p, q = 1e3) => `${Math.round(p[0] * q)},${Math.round(p[1] * q)},${Math.round(p[2] * q)}`;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a); return l > EPS ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const near = (a, b) => Math.abs(a - b) <= 1e-4;

// cross-section equal? supports round (radius) or rect (width/height).
function sameSection(x, y) {
  if (x.radius != null && y.radius != null) return near(x.radius, y.radius);
  if (x.width != null && y.width != null) return near(x.width, y.width) && near(x.height ?? x.width, y.height ?? y.width);
  return false; // mixed round/rect → treat as a transition
}

/**
 * Classify the junctions of an axis-aligned duct run network into fittings.
 * @param {{id:string, a:number[], b:number[], radius?:number, width?:number, height?:number}[]} runs
 *        each run is a straight segment a→b with a cross-section (round: radius; rect: width/height).
 * @returns {{junctions:{position:number[], type:'elbow'|'tee'|'cross'|'reducer'|'straight'|'free-end'|'nonplanar-N',
 *            degree:number, runIds:string[], directions:number[][], turnAngle?:number,
 *            sections?:object[]}[]}}
 *        directions = the unit direction of each incident run pointing AWAY from the junction (into the run).
 */
export function classifyDuctJunctions(runs) {
  // gather incident run-ends per shared point
  const nodes = new Map(); // key → { position, ends:[{id, dir, section}] }
  const push = (p, id, other, section) => {
    const k = key3(p);
    if (!nodes.has(k)) nodes.set(k, { position: p.slice(), ends: [] });
    nodes.get(k).ends.push({ id, dir: unit(sub(other, p)), section });
  };
  for (const r of runs) {
    const section = { radius: r.radius, width: r.width, height: r.height };
    push(r.a, r.id, r.b, section);
    push(r.b, r.id, r.a, section);
  }

  const junctions = [];
  for (const { position, ends } of nodes.values()) {
    const degree = ends.length;
    const runIds = ends.map((e) => e.id);
    const directions = ends.map((e) => e.dir);
    const sections = ends.map((e) => e.section);
    let type, turnAngle;

    if (degree === 1) {
      type = 'free-end';
    } else if (degree === 2) {
      const collinear = near(dot(directions[0], directions[1]), -1); // opposite dirs = straight through
      if (collinear) {
        type = sameSection(sections[0], sections[1]) ? 'straight' : 'reducer';
      } else {
        type = 'elbow';
        turnAngle = Math.acos(Math.max(-1, Math.min(1, -dot(directions[0], directions[1])))) * 180 / Math.PI;
      }
    } else if (degree === 3) {
      type = 'tee';
    } else if (degree === 4) {
      type = 'cross';
    } else {
      type = `nonplanar-${degree}`;
    }
    junctions.push({ position, type, degree, runIds, directions, turnAngle, sections });
  }
  // deterministic order: by position
  junctions.sort((u, v) => u.position[0] - v.position[0] || u.position[1] - v.position[1] || u.position[2] - v.position[2]);
  return { junctions };
}
// ---- increment 2: emit i2's spatial-harness scene_graph so the fitting-list round-trips with zero glue.
const FITTING_PREFIX = { elbow: 'ELB', tee: 'TEE', reducer: 'RED', cross: 'CRS' };
const portOffset = (sec) => (sec.radius != null ? sec.radius : Math.max(sec.width ?? 0, sec.height ?? 0) / 2);
const dnOf = (sec) => (sec.radius != null ? +(2 * sec.radius).toFixed(6) : `${sec.width}x${sec.height}`);

/**
 * Turn a duct RUN network into i2's `SpatialHarness.fromScene` shape: each FITTING junction becomes one
 * scene object with LOCAL port offsets + a parallel portDN map (DN carried so connectPorts can validate a
 * mismatch), and each run becomes a connection linking the two endpoint port refs by IDENTITY (never
 * coordinates). Straight/free-end junctions emit no fitting; a run end not at a fitting yields a
 * `free:<runId>:<a|b>` ref the caller resolves to equipment. Deterministic (stable ids + port labels).
 * @param {Parameters<typeof classifyDuctJunctions>[0]} runs
 * @returns {{objects:{id:string,type:string,size:number[],center:number[],ports:Record<string,number[]>,portDN:Record<string,number|string>}[],
 *            connections:{run:string,a:string,b:string}[]}}
 */
export function ductNetworkToScene(runs) {
  const { junctions } = classifyDuctJunctions(runs);
  const objects = [];
  const endRef = new Map();   // `${runId}|${posKey}` → "ID.PORT"
  const counters = {};
  for (const j of junctions) {
    const prefix = FITTING_PREFIX[j.type];
    if (!prefix) continue;    // straight / free-end / nonplanar → no fitting object
    const n = (counters[j.type] = (counters[j.type] || 0) + 1);
    const id = `${prefix}-${String(n).padStart(4, '0')}`;
    // stable port labels: sort ends by direction so A,B,C,D don't depend on run input order
    const ends = j.directions
      .map((dir, k) => ({ dir, runId: j.runIds[k], section: j.sections[k] }))
      .sort((p, q) => p.dir[0] - q.dir[0] || p.dir[1] - q.dir[1] || p.dir[2] - q.dir[2]);
    const ports = {}, portDN = {};
    let maxOff = 0;
    ends.forEach((e, k) => {
      const label = String.fromCharCode(65 + k); // A, B, C, D
      const off = portOffset(e.section);
      maxOff = Math.max(maxOff, off);
      ports[label] = [e.dir[0] * off, e.dir[1] * off, e.dir[2] * off];
      portDN[label] = dnOf(e.section);
      endRef.set(`${e.runId}|${key3(j.position)}`, `${id}.${label}`);
    });
    const d = 2 * maxOff;
    objects.push({ id, type: j.type, size: [d, d, d], center: j.position.slice(), ports, portDN });
  }
  const connections = [];
  for (const r of runs) {
    const a = endRef.get(`${r.id}|${key3(r.a)}`) || `free:${r.id}:a`;
    const b = endRef.get(`${r.id}|${key3(r.b)}`) || `free:${r.id}:b`;
    connections.push({ run: r.id, a, b });
  }
  return { objects, connections };
}

// ---- increment 3: FLANK-WIDTH derivation (Revisor retro P4). ------------------------------------------
// For the ~38% of runs where inv4's label-binding emits width {prov:'absent-in-source'} (no WxH cota), the
// width must be MEASURED from the raw parallel flank line-work. Revisor's bug: the extractor picked the
// INTERIOR line pair (82.5 mm) instead of the real EXTERIOR pair (~105 mm), and the imperial nominal-snap
// then hid the ~20 mm error because only the SNAPPED value was exposed, not the raw. Two fixes here:
//   (1) measure the EXTERIOR span (the OUTERMOST flank pair = max-min perpendicular offset), never an inner
//       pair; and
//   (2) emit the full ratified envelope {v, prov, raw, snap, deltaMm} so `raw` and `deltaMm=|raw-snap|·1000`
//       survive downstream — that is what reveals a bad measurement even when the snap lands near-right, and
//       it is the histogram data Revisor uses to fix the snap-divergence gate value for the whole team.
// pass-parity P3 already guards this envelope under §440. Pure, deterministic, zero-dep.

// Nominal ladders (metres). Imperial default (Revisor's project is imperial); pass opts.ladder or
// opts.system:'metric' to override. Values are the standard nominal duct sizes to snap a raw span to.
export const NOMINAL_DUCT_IMPERIAL_M = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40, 42, 48].map((i) => +(i * 0.0254).toFixed(6));
export const NOMINAL_DUCT_METRIC_M = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.9, 1.0, 1.2];

/** Nearest nominal on the ladder (same unit, metres). Returns null for a non-finite raw or an empty ladder. */
export function snapToNominal(raw, ladder = NOMINAL_DUCT_IMPERIAL_M) {
  if (!Number.isFinite(raw) || !ladder || !ladder.length) return null;
  let best = ladder[0], bd = Infinity;
  for (const n of ladder) { const d = Math.abs(n - raw); if (d < bd) { bd = d; best = n; } }
  return best;
}

/**
 * Perpendicular offsets of a run's flank lines along the width axis — the input `measureFlankWidth` needs.
 * Projects each flank segment's MIDPOINT onto the (unit) width axis, so the outermost projections are the
 * true exterior flanks regardless of how many wall lines the drawing carries.
 * @param {{a:number[], b:number[]}[]} segments  flank line segments. Accepts 2D `[x,y]` (inv4 flankSegments
 *        output, #76) OR 3D `[x,y,z]` (a missing z is treated as 0) — DXF/PDF line-work is inherently 2D.
 * @param {number[]} widthAxis  direction of the width (2D or 3D; need not be unit; normalised here).
 * @returns {number[]} one signed offset per segment.
 */
export function perpOffsetsFromFlanks(segments, widthAxis) {
  const ax = widthAxis[0] ?? 0, ay = widthAxis[1] ?? 0, az = widthAxis[2] ?? 0;
  const l = Math.hypot(ax, ay, az) || 1;
  const ux = ax / l, uy = ay / l, uz = az / l;
  return (segments || []).map((s) => {
    const mx = ((s.a[0] ?? 0) + (s.b[0] ?? 0)) / 2;
    const my = ((s.a[1] ?? 0) + (s.b[1] ?? 0)) / 2;
    const mz = ((s.a[2] ?? 0) + (s.b[2] ?? 0)) / 2;
    return mx * ux + my * uy + mz * uz;
  });
}

/**
 * Measure a duct width from its flank offsets and snap to nominal. Picks the EXTERIOR pair (outermost
 * offsets) — the P4 fix — and emits the full provenance envelope so the raw measurement is never lost.
 * @param {number[]} perpOffsets  perpendicular positions of the flank lines (from perpOffsetsFromFlanks).
 * @param {{ladder?:number[], system?:'imperial'|'metric'}} [opts]
 * @returns {{v:number|null, prov:'measured'|'absent-in-source', raw:number|null, snap:number|null, deltaMm:number|null}}
 */
export function measureFlankWidth(perpOffsets, opts = {}) {
  const ladder = opts.ladder ?? (opts.system === 'metric' ? NOMINAL_DUCT_METRIC_M : NOMINAL_DUCT_IMPERIAL_M);
  const vals = (perpOffsets || []).filter(Number.isFinite);
  if (vals.length < 2) return { v: null, prov: 'absent-in-source', raw: null, snap: null, deltaMm: null };
  const raw = Math.max(...vals) - Math.min(...vals);   // EXTERIOR span — the outermost flank pair, never an inner one
  const snap = snapToNominal(raw, ladder);
  const deltaMm = snap == null ? null : +(Math.abs(raw - snap) * 1000).toFixed(3);
  return { v: snap, prov: 'measured', raw: +raw.toFixed(6), snap, deltaMm };
}

/**
 * Merge rule (inv4 §synthesis): the LABEL width (a WxH cota, design intent) wins when present; the FLANK
 * measurement fills ONLY the runs the label left `absent-in-source`. Never overwrites a real label value,
 * never fabricates when neither source has a value.
 * @param {object|null} labelEnv  inv4's label-binding width envelope (may be absent-in-source).
 * @param {object|null} flankEnv  this module's measureFlankWidth envelope.
 * @returns {object} the width envelope to carry on obj.fieldProvenance.width.
 */
export function mergeWidthProvenance(labelEnv, flankEnv) {
  if (labelEnv && labelEnv.prov && labelEnv.prov !== 'absent-in-source' && labelEnv.v != null) return labelEnv; // label wins
  if (labelEnv && labelEnv.prov === 'absent-in-source' && flankEnv && flankEnv.prov === 'measured') return flankEnv; // flank fills the gap
  return labelEnv ?? flankEnv ?? { v: null, prov: 'absent-in-source', raw: null, snap: null, deltaMm: null };
}

// ---- increment 4: ENDPOINT DEGREES per run (for the fused-mesh open-edge gate, Revisor WU-L4-B). ---------
// The fused-mesh gate (open-edge-cap checkFusedShellOpenEdges) needs each run's expected FREE ends, derived
// from the CONNECTIVITY DEGREE at each run endpoint (a free end = degree < 2). Runs + classifyDuctJunctions
// are this module's data, so the topology helper lives here (single source of truth for run shape). inv2's
// reKeyToNumericRunId re-keys this string-keyed output to system-3d's numeric per-vertex runId, then feeds
// checkFusedShellOpenEdges. Split A (agreed): inv3 = topology, inv2 = numeric-id adapter + spine handoff.

/**
 * Endpoint connectivity degrees per run, from the run network's junctions.
 * @param {Parameters<typeof classifyDuctJunctions>[0]} runs
 * @returns {Record<string, number[]>} runId -> [degreeAtA, degreeAtB] (free end = 1, through = 2, tee = 3,
 *          cross = 4). Consumed by expectedOpenLoopsFromDegrees (open-edge-cap) = count of degrees < 2.
 */
export function endpointDegreesFromRuns(runs) {
  const { junctions } = classifyDuctJunctions(runs);
  const degAt = new Map();
  for (const j of junctions) degAt.set(key3(j.position), j.degree);
  const out = {};
  for (const r of runs || []) out[r.id] = [degAt.get(key3(r.a)) ?? 1, degAt.get(key3(r.b)) ?? 1];
  return out;
}
