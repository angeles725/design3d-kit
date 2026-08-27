// library: topology-ext  (harness/topology-ext.mjs) — §7 topology metrics (investigador3).
// source: design3d MATHQC §7 topology pass · extends library/harness/geom-verify.mjs · PoC by creador1
//         (2026-08-26). Wires the doc's 10%-weighted Topology rubric into objective, pure-JS metrics.
// what: four mesh-QC checks over flat geometry arrays, each catching a defect geom-verify's existing
//       core misses: sliver/degenerate triangles (triangleQuality), LOCAL winding flips that a GLOBAL
//       signedVolume sign hides (normalConsistency), bowtie vertices — non-manifold at a VERTEX, distinct
//       from the non-manifold EDGES edgeManifold already covers (nonManifoldVertex), and a Chamfer-family
//       precision/recall/F-score for geometry similarity (fScore).
// deps: the four core checks import NOTHING — pure over flat [x,y,z,...] positions + flat triangle-index
//       arrays, node --test-able in bare Node with no three.js resolution, exactly like geom-verify's core.
//       The `topologyReport` wrapper additionally imports geom-verify's PURE `meshIntegrity` (which itself
//       imports nothing), so the whole file stays Node-loadable. REPORTS ONLY — never mutates, welds, or
//       reorders geometry; returns numbers/verdicts for the gate.

// geom-verify's pure-math core imports nothing, so this top-level import does NOT pull three into the graph.
import { meshIntegrity } from '../../library/harness/geom-verify.mjs';
//
// INDEX CONVENTION matches geom-verify: pass a flat index for welded geometry; a null index is treated as
// sequential triangle soup [0,1,2,3,...]. Manifold/adjacency checks need a real (welded) index to see
// shared edges — non-indexed soup has no shared vertices, same caveat as geom-verify.meshIntegrity.

// -------- tiny vector helpers (import nothing) -----------------------------------------------------
const vec = (p, i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.sqrt(dot(a, a));
// Robust angle between two vectors: atan2(|u×v|, u·v) — stable near 0 and π where acos(dot) loses precision.
const angleBetween = (u, v) => Math.atan2(norm(cross(u, v)), dot(u, v));
const seqIndex = (nVerts) => { const a = new Array(nVerts); for (let i = 0; i < nVerts; i++) a[i] = i; return a; };
const toPoints = (flat) => { const o = []; for (let i = 0; i + 2 < flat.length; i += 3) o.push([flat[i], flat[i + 1], flat[i + 2]]); return o; };

/**
 * Per-mesh triangle-quality metrics. A duct/fitting mesh full of slivers tessellates and shades badly;
 * zero-area (degenerate) triangles break normals and CSG. minAngle/aspect are computed over NON-degenerate
 * triangles only (a degenerate one has no meaningful angle); degenerates are counted separately.
 * `maxAspectRatio` is normalized so an equilateral triangle = 1 (aspect = longestEdge / (2√3·inradius)).
 * @param {ArrayLike<number>} positions  flat [x,y,z, ...].
 * @param {ArrayLike<number>|null} [index]  flat triangle indices; null = sequential soup.
 * @param {{areaEps?:number}} [opts]  area below which a triangle is degenerate (default 1e-12).
 * @returns {{minAngleDeg:number, maxAspectRatio:number, degenerateCount:number, triangles:number}}
 */
export function triangleQuality(positions, index = null, opts = {}) {
  const { areaEps = 1e-12 } = opts;
  const idx = index || seqIndex(positions.length / 3);
  let minAngle = Infinity, maxAspect = 0, degenerate = 0, nonDegen = 0;
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const A = vec(positions, idx[t]), B = vec(positions, idx[t + 1]), C = vec(positions, idx[t + 2]);
    const AB = sub(B, A), AC = sub(C, A), BC = sub(C, B);
    const area = 0.5 * norm(cross(AB, AC));
    if (area < areaEps) { degenerate++; continue; }
    nonDegen++;
    const angA = angleBetween(AB, AC);
    const angB = angleBetween(sub(A, B), BC);       // at B: B->A and B->C
    const angC = angleBetween(sub(A, C), sub(B, C)); // at C: C->A and C->B
    const triMin = Math.min(angA, angB, angC);
    if (triMin < minAngle) minAngle = triMin;
    const semi = (norm(AB) + norm(AC) + norm(BC)) / 2;
    const inradius = area / semi;
    const longest = Math.max(norm(AB), norm(AC), norm(BC));
    const aspect = longest / (2 * Math.sqrt(3) * inradius); // 1 = equilateral, grows with sliverness
    if (aspect > maxAspect) maxAspect = aspect;
  }
  return {
    minAngleDeg: nonDegen ? minAngle * 180 / Math.PI : 0,
    maxAspectRatio: nonDegen ? maxAspect : Infinity,
    degenerateCount: degenerate,
    triangles: idx.length / 3,
  };
}

/**
 * Adjacent-triangle winding consistency. Two faces sharing an edge must traverse that edge in OPPOSITE
 * directions ((a,b) in one face, (b,a) in the other); the SAME direction in both is a LOCAL winding flip.
 * This catches flips that geom-verify's GLOBAL signedVolume sign misses — a mesh can have canceling local
 * flips and still net a positive volume. Only edges shared by exactly two faces are judged (boundary edges
 * and non-manifold edges are skipped; edgeManifold covers those).
 * @param {ArrayLike<number>} positions  flat [x,y,z, ...] (unused for the topology test but kept for a
 *        uniform signature with the other checks).
 * @param {ArrayLike<number>|null} [index]
 * @returns {{consistent:boolean, flippedPairs:number, sharedEdges:number}}
 */
export function normalConsistency(positions, index = null) {
  const idx = index || seqIndex(positions.length / 3);
  const edgeDirs = new Map(); // "min_max" -> array of directed [p,q] as each face traverses it
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    for (let k = 0; k < 3; k++) {
      const p = tri[k], q = tri[(k + 1) % 3];
      const key = p < q ? `${p}_${q}` : `${q}_${p}`;
      if (!edgeDirs.has(key)) edgeDirs.set(key, []);
      edgeDirs.get(key).push([p, q]);
    }
  }
  let flipped = 0, shared = 0;
  for (const dirs of edgeDirs.values()) {
    if (dirs.length !== 2) continue;               // judge only cleanly-shared (manifold) edges
    shared++;
    if (dirs[0][0] === dirs[1][0] && dirs[0][1] === dirs[1][1]) flipped++; // same direction => flip
  }
  return { consistent: flipped === 0, flippedPairs: flipped, sharedEdges: shared };
}

/**
 * Bowtie / non-manifold VERTEX detection: a vertex whose incident faces split into ≥2 disconnected fans
 * (two triangles pinched at a single shared vertex). Distinct from non-manifold EDGES (edgeManifold).
 * Method: for each vertex, build the incident-face graph where two faces are adjacent iff they share an
 * edge through that vertex (a common neighbor), then count connected components; ≥2 components = bowtie.
 * @param {ArrayLike<number>} positions  flat [x,y,z, ...] (kept for uniform signature).
 * @param {ArrayLike<number>|null} [index]
 * @returns {{count:number, vertices:number[]}}  bowtie vertex indices, ascending (deterministic).
 */
export function nonManifoldVertex(positions, index = null) {
  const idx = index || seqIndex(positions.length / 3);
  const nFaces = Math.floor(idx.length / 3);
  const incident = new Map(); // vertex -> [faceId, ...]
  for (let fi = 0; fi < nFaces; fi++) {
    for (let k = 0; k < 3; k++) {
      const v = idx[fi * 3 + k];
      if (!incident.has(v)) incident.set(v, []);
      incident.get(v).push(fi);
    }
  }
  const others = (fi, v) => {
    const t = [idx[fi * 3], idx[fi * 3 + 1], idx[fi * 3 + 2]];
    return t.filter((x) => x !== v);
  };
  const bowties = [];
  for (const [v, faces] of incident) {
    if (faces.length < 2) continue;
    const parent = new Map(faces.map((f) => [f, f]));
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const union = (a, b) => { parent.set(find(a), find(b)); };
    for (let i = 0; i < faces.length; i++) {
      const ni = others(faces[i], v);
      for (let j = i + 1; j < faces.length; j++) {
        const nj = others(faces[j], v);
        if (ni.some((x) => nj.includes(x))) union(faces[i], faces[j]); // share a v-edge => same fan
      }
    }
    const comps = new Set(faces.map((f) => find(f)));
    if (comps.size >= 2) bowties.push(v);
  }
  bowties.sort((a, b) => a - b);
  return { count: bowties.length, vertices: bowties };
}

/**
 * Chamfer-family F-score between two point sets (e.g. a candidate mesh's vertices vs a reference cloud).
 * precision = fraction of A within `tau` of B; recall = fraction of B within `tau` of A; fscore = their
 * harmonic mean. Pairs with the §2 chamfer() distance for geometry-similarity QC. Brute-force nearest
 * (O(|A|·|B|)) — fine for QC-scale clouds; deterministic.
 * @param {ArrayLike<number>} pointsA  flat [x,y,z, ...].
 * @param {ArrayLike<number>} pointsB  flat [x,y,z, ...].
 * @param {number} tau  match radius (a point counts as covered when a nearest neighbor is within tau).
 * @returns {{precision:number, recall:number, fscore:number}}
 */
export function fScore(pointsA, pointsB, tau) {
  const A = toPoints(pointsA), B = toPoints(pointsB);
  if (A.length === 0 || B.length === 0) return { precision: 0, recall: 0, fscore: 0 };
  const tau2 = tau * tau;
  const covered = (src, dst) => {
    let c = 0;
    for (const p of src) {
      for (const q of dst) {
        const dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2];
        if (dx * dx + dy * dy + dz * dz <= tau2) { c++; break; }
      }
    }
    return c;
  };
  const precision = covered(A, B) / A.length;
  const recall = covered(B, A) / B.length;
  const fscore = (precision + recall > 0) ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, fscore };
}

/**
 * Combined Topology verdict for the doc's 10%-weighted T rubric component. Runs all four checks plus
 * geom-verify.meshIntegrity and maps them to a 0..10 score + a hardFail gate. REPORTS ONLY, deterministic.
 *
 * HARD FAIL (score capped at 5) — a real modeling defect: insideOut (flipped global winding), any
 * degenerate (zero-area) triangle, a bowtie vertex, or a local winding flip. DEDUCTIONS (not a fail) —
 * slivers (thin but valid tris), open edges (a CUT DUCT END legitimately has them), and non-manifold
 * edges. Slivers/open-edges never hard-fail because a healthy cut fitting exhibits them.
 * @param {ArrayLike<number>} positions  flat [x,y,z, ...].
 * @param {ArrayLike<number>|null} [index]
 * @param {{sliverAngleDeg?:number, areaEps?:number}} [opts]  sliver threshold (default 10°), degeneracy eps.
 * @returns {{metrics:object, score:number, hardFail:boolean, flags:{insideOut:boolean,degenerate:boolean,
 *            bowtie:boolean,localFlip:boolean,sliver:boolean,openEdges:boolean,nonManifoldEdges:boolean}}}
 */
export function topologyReport(positions, index = null, opts = {}) {
  const { sliverAngleDeg = 10, areaEps = 1e-12 } = opts;
  const tq = triangleQuality(positions, index, { areaEps });
  const nc = normalConsistency(positions, index);
  const nm = nonManifoldVertex(positions, index);
  const mi = meshIntegrity(positions, index || null);

  const flags = {
    insideOut: mi.insideOut,
    degenerate: tq.degenerateCount > 0,
    bowtie: nm.count > 0,
    localFlip: nc.flippedPairs > 0,
    sliver: tq.triangles > tq.degenerateCount && tq.minAngleDeg > 0 && tq.minAngleDeg < sliverAngleDeg,
    openEdges: mi.openEdges > 0,
    nonManifoldEdges: mi.nonManifoldEdges > 0,
  };
  const hardFail = flags.insideOut || flags.degenerate || flags.bowtie || flags.localFlip;
  const deduction = (flags.sliver ? 2 : 0) + (flags.openEdges ? 1 : 0) + (flags.nonManifoldEdges ? 2 : 0);
  const score = Math.max(0, (hardFail ? 5 : 10) - deduction);
  return {
    metrics: { triangleQuality: tq, normalConsistency: nc, nonManifoldVertex: nm, meshIntegrity: mi },
    score, hardFail, flags,
  };
}
