// library: realista-acceptance  (harness/realista-acceptance.mjs) — voxel→realista ACCEPTANCE verdict (investigador3, v1.19).
// source: the four investigations' unanimous "3-review >=8 loop" doctrine (investigacion.md §11 rubric +
//         hard-fails + best-of-3; investigacion3 §44 "3 validadores -> score 0-10, score<8 returns a
//         STRUCTURED failure to the ROUTER not the LLM"; investigacion2 visual-review score>=8; investigacion4
//         validation stage). Every doc converges on the SAME shape: weight the realista pass across geometry /
//         connectivity / collisions / layout / visual / performance into ONE 0-10 score, but let a small set
//         of HARD FAILS cap it (a design with a critical clash, a disconnected run, inside-out geometry, or
//         out-of-bounds content can NEVER read >=8 no matter how good the rest looks), and keep BEST-OF-N
//         because a correction pass can make things worse.
// what: acceptRealista(bundle, opts) composes MY LANE's existing gate outputs — checkPassParity (data drift),
//       checkDeBoxWinding (inside-out), geom-verify meshIntegrity/checkJunction/checkCoplanar (manifold /
//       floating joints / z-fight), clash-detect detectClashes (interior penetration), view-variance
//       viewVariance (robust multi-view mu-lambda*sigma) — into a deterministic {score, accepted, hardFails,
//       failed[], subscores}. bestOfN(verdicts) keeps the max-scoring pass. REPORTS-ONLY: it never mutates a
//       scene, never re-runs a gate, never invents geometry — it AGGREGATES verdicts the gates already
//       produced. This is the aggregator Revisor's real-project retros plug into: each new failure mode
//       becomes a hard-fail category or a weighted subscore, tuned via opts.weights / opts.floors.
// deps: NONE. Pure over plain gate-result objects. Deterministic (stable, no RNG, no three).

// Rubric weights — DEFAULT table; GATES.md §Verdict is the documented rubric authority and inv1 reconciles
// it on merge. The dimensions are GATES.md's four CRITICAL sub-scores (Geometry / Connectivity / Collision /
// Spatial) plus Visual + Performance. Pass opts.weights to override (Revisor's retro categories plug in as
// named categories without a code change). A subscore whose input is ABSENT is dropped and its weight is
// redistributed across the present ones, so a data-only de-box (no built geometry, no rendered views) still
// scores honestly on the dimensions it does have — mirroring the gates' own "SKIP, don't fail" rule.
export const DEFAULT_WEIGHTS = Object.freeze({
  geometry: 0.25,      // mesh integrity: not inside-out, manifold/watertight where closed
  connectivity: 0.20,  // ports + DN preserved, no missing/disconnected runs (pass-parity)
  collisions: 0.20,    // no interior penetration (clash-detect)
  spatial: 0.15,       // junctions actually meet + no z-fighting (geom-verify junction/coplanar) — GATES.md "Spatial"
  visual: 0.12,        // robust multi-view score mu - lambda*sigma (view-variance), normalized 0..1
  performance: 0.08,   // draw calls / triangles within the frame budget
});

// A CRITICAL sub-score cannot be averaged away: if it falls below its floor, that is itself a hard fail
// (GATES.md §370 "the critical sub-scores — Geometry, Connectivity, Collision, Spatial — must EACH be >= 0.8,
// a weak one is never averaged away, same rule as layer_scores"). Visual/Performance are not critical.
export const DEFAULT_FLOORS = Object.freeze({ geometry: 0.8, connectivity: 0.8, collisions: 0.8, spatial: 0.8 });

// GATES.md §370 "Mechanical hard-fails that CAP the score": the ONLY rule names that cap the total. Reused
// verbatim, NOT reinvented — a parallel hard-fail set would fork the source of truth.
export const HARD_FAIL_RULES = Object.freeze(['CriticalClashes', 'DisconnectedPipes', 'InvalidGeometry', 'OutOfBounds']);

export const HARD_FAIL_CAP = 7.9;      // GATES.md §370: cap at 0.79 (7.9/10) on any mechanical hard fail
export const ACCEPT_THRESHOLD = 8.0;   // GATES.md: a hard-failed asset "cannot score >= 0.8"

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

// ---- per-dimension scorers: each maps a real gate result -> subscore in [0,1] + the failures it saw ----

// GEOMETRY: winding (checkDeBoxWinding) + optional per-part integrity (geom-verify meshIntegrity).
// Inside-out or non-manifold-closed geometry is a modeling defect; each bad part costs, and its presence
// raises the InvalidGeometry hard fail.
function scoreGeometry(bundle, failed) {
  const w = bundle.winding, integ = bundle.integrity;
  if (!w && !integ) return null; // no built geometry -> N/A (data-only de-box)
  let checked = 0, bad = 0;
  if (w) {
    checked += w.checked ?? ((w.insideOut?.length ?? 0) + (w.open?.length ?? 0));
    for (const io of w.insideOut ?? []) {
      bad++;
      failed.push({ rule: 'InvalidGeometry', object: io.id, category: 'geometry', hard: true,
        reason: `inside-out mesh (signedVolume ${io.signedVolume})`,
        suggestion: 'flip triangle winding so the closed shell has outward normals (signedVolume > 0)' });
    }
  }
  if (Array.isArray(integ)) {
    for (const p of integ) {
      checked++;
      if (p.insideOut) {
        bad++;
        failed.push({ rule: 'InvalidGeometry', object: p.id, category: 'geometry', hard: true,
          reason: `inside-out closed mesh (signedVolume ${p.signedVolume})`,
          suggestion: 'flip winding to outward' });
      } else if (p.closed && p.nonManifoldEdges > 0) {
        bad += 0.5;
        failed.push({ rule: 'NonManifold', object: p.id, category: 'geometry', hard: false,
          reason: `${p.nonManifoldEdges} non-manifold edge(s) on a closed mesh`,
          suggestion: 'weld duplicate vertices / remove the >2-valence edges' });
      }
    }
  }
  if (checked === 0) return 1;
  return clamp01(1 - bad / checked);
}

// CONNECTIVITY: pass-parity data preservation. Missing/extra elements, moved/lost ports, DN changes are all
// silent-drift vectors §440. Missing element OR a lost port => DisconnectedPipes/DataDrift hard fail.
function scoreConnectivity(bundle, failed) {
  const p = bundle.parity;
  if (!p) return null;
  const missing = p.missing ?? [], extra = p.extra ?? [], drifts = p.drifts ?? [];
  // ONLY a vanished element or a lost port is a canonical DisconnectedPipes hard-fail (GATES.md §370). An
  // extra element or a DN/transform drift is a §440 data-drift — a real defect, but SOFT: it deducts from
  // the connectivity sub-score (and can push it below the 0.8 floor -> hard via CriticalBelowFloor) without
  // inventing a hard-fail rule outside the canonical four.
  for (const id of missing) failed.push({ rule: 'DisconnectedPipes', object: id, category: 'connectivity', hard: true,
    reason: 'element present in blockout is MISSING after the realista pass', suggestion: 'the realista pass must preserve every blockout element (do not drop it)' });
  const portMiss = drifts.filter((d) => d.field === 'portMissing');
  const dnDrift = drifts.filter((d) => d.field === 'dn');
  const portMoved = drifts.filter((d) => d.field === 'port' || d.field === 'center' || d.field === 'size' || d.field === 'rotation' || d.field === 'type');
  for (const d of portMiss) failed.push({ rule: 'DisconnectedPipes', object: d.id, category: 'connectivity', hard: true,
    reason: `port "${d.port}" lost in the realista pass`, suggestion: 'preserve every port; a lost port disconnects the run' });
  for (const id of extra) failed.push({ rule: 'DataDrift', object: id, category: 'connectivity', hard: false,
    reason: 'element appeared that was not in the blockout', suggestion: 'the realista pass must not add elements the spec did not declare' });
  for (const d of dnDrift) failed.push({ rule: 'DataDrift', object: d.id, category: 'connectivity', hard: false,
    reason: `DN changed on port "${d.port}": ${d.expected} -> ${d.actual}`, suggestion: 're-rounded/changed DN invalidates the spec — keep the blockout DN' });
  for (const d of portMoved) failed.push({ rule: 'DataDrift', object: d.id, category: 'connectivity', hard: false,
    reason: `${d.field} drifted${d.delta != null ? ` by ${d.delta}` : ''}`, suggestion: 'preserve transforms/bboxes/ports exactly; substitute geometry only' });
  const total = missing.length + extra.length + drifts.length;
  if (total === 0) return 1;
  // A canonical disconnect (missing/portMissing) sinks the sub-score hard; a soft drift costs less.
  const hardCount = missing.length + portMiss.length;
  const softCount = extra.length + dnDrift.length + portMoved.length;
  return clamp01(1 - (hardCount * 0.5 + softCount * 0.15));
}

// COLLISIONS: clash-detect interior penetrations. Any interior clash is CriticalClashes hard fail.
function scoreCollisions(bundle, failed) {
  const c = bundle.clashes;
  if (!c) return null;
  const clashes = c.clashes ?? [];
  for (const cl of clashes) failed.push({ rule: 'CriticalClashes', object: `${cl.a} x ${cl.b}`, category: 'collisions', hard: true,
    reason: `interior penetration depth ${cl.depth}`, suggestion: 'reroute or separate — declared port contact is allowed, interior overlap is not' });
  if (clashes.length === 0) return 1;
  return clamp01(1 - clashes.length * 0.5); // presence already hard-caps; subscore reflects severity
}

// SPATIAL (GATES.md's 4th critical dim): floating joints (checkJunction) + z-fighting leads (checkCoplanar).
// Both are SOFT — a floating joint deducts hard from the spatial sub-score (and can drop it below the 0.8
// floor -> hard via CriticalBelowFloor), but "FloatingJoint" is not one of the four canonical hard-fail
// rules, so it never itself caps. A z-fight is a lead (AABBs can't prove the surface overlap), so advisory.
function scoreSpatial(bundle, failed) {
  const j = bundle.junctions, cp = bundle.coplanar;
  if (!j && !cp) return null;
  let penalty = 0, any = false;
  if (Array.isArray(j)) {
    for (const jn of j) {
      any = true;
      if (jn.ok === false) {
        penalty += 0.5;
        failed.push({ rule: 'FloatingJoint', object: jn.label ?? 'junction', category: 'spatial', hard: false,
          reason: `gap ${jn.gap}m between parts that should meet`, suggestion: 'close the joint — parts must touch (gap <= maxGap)' });
      }
    }
  }
  if (cp && (cp.count ?? 0) > 0) {
    any = true;
    penalty += Math.min(0.5, cp.count * 0.1);
    failed.push({ rule: 'ZFightLead', object: `${cp.count} pair(s)`, category: 'spatial', hard: false,
      reason: 'coplanar surface leads (may shimmer in motion)', suggestion: 'CONFIRM against geometry, then separate 1-2mm or polygonOffset the layer that must win' });
  }
  if (!any) return null;
  return clamp01(1 - penalty);
}

// VISUAL: robust multi-view score. Accepts view-variance output {adjusted} (mu - lambda*sigma, already
// 0..10) OR a raw {scores:[...0..10]} which we reduce with the same mu - lambda*sigma. Normalized to 0..1.
function scoreVisual(bundle, failed, opts) {
  const v = bundle.views;
  if (!v) return null;
  let adjusted, worst;
  if (isNum(v.adjusted)) { adjusted = v.adjusted; worst = v.worstView; }
  else if (Array.isArray(v.scores) && v.scores.length) {
    const n = v.scores.length, mean = v.scores.reduce((a, b) => a + b, 0) / n;
    const varc = v.scores.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const lambda = opts.lambda ?? 0.5;
    adjusted = mean - lambda * Math.sqrt(varc);
    let wi = 0; for (let i = 1; i < n; i++) if (v.scores[i] < v.scores[wi]) wi = i;
    worst = wi;
  } else return null;
  const s = clamp01(adjusted / 10);
  if (s < 0.8) failed.push({ rule: 'VisualBelowThreshold', object: worst != null ? `view ${worst}` : 'scene', category: 'visual', hard: false,
    reason: `robust multi-view score ${adjusted.toFixed(2)}/10 (mu - lambda*sigma)`, suggestion: 'fix the worst-scoring view; do not average it away' });
  return s;
}

// PERFORMANCE: draw calls + triangles vs budget (investigacion.md §13 / investigacion3 budgets). Over budget
// is advisory here (a perf regression, not a correctness hard fail) unless opts.perfHard.
function scorePerformance(bundle, failed, opts) {
  const p = bundle.perf;
  if (!p || !p.budget) return null;
  const ratios = [];
  if (isNum(p.drawCalls) && isNum(p.budget.drawCalls)) ratios.push(p.drawCalls / p.budget.drawCalls);
  if (isNum(p.triangles) && isNum(p.budget.triangles)) ratios.push(p.triangles / p.budget.triangles);
  if (!ratios.length) return null;
  const worst = Math.max(...ratios);
  if (worst > 1) {
    const hard = !!opts.perfHard;
    failed.push({ rule: 'PerformanceBudget', object: 'scene', category: 'performance', hard,
      reason: `over budget by ${((worst - 1) * 100).toFixed(0)}% (drawCalls/triangles)`,
      suggestion: 'instance repeated parts, apply LOD, merge by zone+system+material, cap radial/arc segments' });
  }
  return clamp01(1 - Math.max(0, worst - 1)); // at/under budget = 1; 2x budget = 0
}

/**
 * Deterministic realista acceptance verdict. Composes the lane's gate outputs into a single 0-10 score with
 * hard-fail caps. REPORTS ONLY. A dimension whose input is absent is dropped and its weight redistributed.
 *
 * @param {{
 *   parity?: {ok:boolean, missing:string[], extra:string[], drifts:object[]},        // checkPassParity
 *   winding?: {ok:boolean, insideOut:{id:string,signedVolume:number}[], open:string[], checked:number}, // checkDeBoxWinding
 *   integrity?: {id:string, closed:boolean, nonManifoldEdges:number, signedVolume:number, insideOut:boolean}[], // geom-verify meshIntegrity per part
 *   clashes?: {clashes:{a:string,b:string,depth:number}[], gate?:object},            // detectClashes
 *   junctions?: {label?:string, ok:boolean, gap:number}[],                            // checkJunction results
 *   coplanar?: {ok:boolean, count:number, findings:object[]},                         // checkCoplanar
 *   views?: {adjusted?:number, worstView?:number, scores?:number[]},                  // viewVariance OR raw per-view scores
 *   perf?: {drawCalls?:number, triangles?:number, budget:{drawCalls?:number, triangles?:number}},
 *   bounds?: {outOfBounds:string[]},                                                  // ids outside the scene bounds
 * }} bundle
 * @param {{weights?:object, floors?:object, threshold?:number, lambda?:number, perfHard?:boolean}} [opts]
 * @returns {{score:number, accepted:boolean, hardFails:string[], failed:object[],
 *            subscores:Record<string,number|null>, weightsUsed:Record<string,number>, capped:boolean}}
 */
export function acceptRealista(bundle = {}, opts = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(opts.weights || {}) };
  const floors = { ...DEFAULT_FLOORS, ...(opts.floors || {}) };
  const threshold = opts.threshold ?? ACCEPT_THRESHOLD;
  const failed = [];

  // OUT-OF-BOUNDS is a scene-level hard fail with no subscore of its own (investigacion.md §11).
  for (const id of bundle.bounds?.outOfBounds ?? []) failed.push({ rule: 'OutOfBounds', object: id, category: 'bounds', hard: true,
    reason: 'element lies outside the scene bounds', suggestion: 'move it inside the room/site bounds before acceptance' });

  const raw = {
    geometry: scoreGeometry(bundle, failed),
    connectivity: scoreConnectivity(bundle, failed),
    collisions: scoreCollisions(bundle, failed),
    spatial: scoreSpatial(bundle, failed),
    visual: scoreVisual(bundle, failed, opts),
    performance: scorePerformance(bundle, failed, opts),
  };

  // A critical category present but below its floor is itself a hard fail (cannot be averaged away).
  for (const k of Object.keys(floors)) {
    if (raw[k] != null && raw[k] < floors[k] && !failed.some((f) => f.category === k && f.hard)) {
      failed.push({ rule: 'CriticalBelowFloor', object: k, category: k, hard: true,
        reason: `critical dimension "${k}" scored ${(raw[k] * 10).toFixed(1)}/10 < floor ${(floors[k] * 10).toFixed(0)}`,
        suggestion: `raise ${k} above its floor before acceptance` });
    }
  }

  // Redistribute weight of ABSENT dimensions across the present ones.
  const present = Object.keys(weights).filter((k) => raw[k] != null);
  const wSum = present.reduce((a, k) => a + weights[k], 0) || 1;
  const weightsUsed = {};
  let weighted = 0;
  for (const k of present) { weightsUsed[k] = weights[k] / wSum; weighted += weightsUsed[k] * raw[k]; }

  let score = present.length ? weighted * 10 : 0;
  const hardFails = [...new Set(failed.filter((f) => f.hard).map((f) => f.rule))];
  const capped = hardFails.length > 0;
  if (capped) score = Math.min(score, HARD_FAIL_CAP);
  score = Math.round(score * 100) / 100;

  // Stable ordering of the router-facing failure list: hard first, then by category, then object.
  failed.sort((a, b) => (b.hard - a.hard) || a.category.localeCompare(b.category) || String(a.object).localeCompare(String(b.object)));

  return {
    score,                              // 0..10 (GATES.md "/10" scale)
    score01: Math.round(score * 10) / 100,  // 0..1 (GATES.md primary scale; cap reads as 0.79)
    accepted: score >= threshold && !capped,
    hardFails,
    failed,          // structured failure -> route to the ROUTER, not the LLM (investigacion3 §44)
    subscores: raw,
    weightsUsed,
    capped,
  };
}

/**
 * Best-of-N: a correction pass can make a design WORSE, so keep the highest-scoring verdict across attempts
 * (investigacion.md §11 "BEST_VERSION = max(Q1,Q2,Q3)"). Ties resolve to the EARLIEST attempt (a correction
 * that merely matches the prior score is not an improvement). Also reports the ΔQ trajectory so a caller can
 * stop on diminishing returns.
 * @param {{score:number}[]} verdicts  acceptRealista outputs, in attempt order.
 * @returns {{best:object, bestIndex:number, deltas:number[], improved:boolean} | null}
 */
export function bestOfN(verdicts) {
  if (!Array.isArray(verdicts) || verdicts.length === 0) return null;
  let bestIndex = 0;
  for (let i = 1; i < verdicts.length; i++) if ((verdicts[i]?.score ?? -Infinity) > (verdicts[bestIndex]?.score ?? -Infinity)) bestIndex = i;
  const deltas = verdicts.slice(1).map((v, i) => Math.round(((v?.score ?? 0) - (verdicts[i]?.score ?? 0)) * 100) / 100);
  return { best: verdicts[bestIndex], bestIndex, deltas, improved: bestIndex > 0 };
}
