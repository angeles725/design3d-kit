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
