// library: montecarlo-clash  (harness/montecarlo-clash.mjs) — §6 P(clash) opt-in (investigador3).
// Tolerance-stackup interference probability. The §1 clash gate answers "does the NOMINAL design
// clash?"; this answers "given install/equip/struct tolerances, in what FRACTION of tolerance draws
// does it clash?" — catching the "clears 2mm nominal but clashes in 30% of draws" risk the nominal
// pass structurally cannot. Monte Carlo (not RSS) because 3-D clash is non-linear in the offsets.
//
// PURE + DETERMINISTIC: seeded PRNG (mulberry32), no Math.random/Date. Geometry-agnostic — the actual
// clash test is INJECTED as clashFn (the real integration passes a three-mesh-bvh-backed one that
// perturbs each part's geomToMesh transform per draw, building each MeshBVH once). Advisory by
// default; hard-gate is OPT-IN via a declared clearanceRisk.pClashMax (mirrors colorTarget.deltaE00Max).

/** Deterministic PRNG. Same seed → same stream. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller, driven by a [0,1) rng. */
export function gaussian(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Estimate P(clash) over tolerance draws.
 * @param {object} cfg
 * @param {Array<{id:string, sigma:number|[number,number,number]}>} cfg.parts  per-part positional
 *        tolerance (1σ, metres). Scalar = isotropic; triple = per-axis (x,y,z).
 * @param {(offsets: Record<string, [number,number,number]>) => boolean} cfg.clashFn  returns true
 *        iff, with these per-part offsets applied, some UNDECLARED pair interpenetrates. (Real impl:
 *        three-mesh-bvh intersectsGeometry on the perturbed transforms.)
 * @param {number} [cfg.samples=2000]
 * @param {number} [cfg.seed=1]
 * @param {number} [cfg.pClashMax]  optional hard-gate threshold; when given, `gate` is set.
 * @returns {{pClash:number, clashCount:number, samples:number, seed:number, gate:'PASS'|'FAIL'|null}}
 */
export function monteCarloClash({ parts, clashFn, samples = 2000, seed = 1, pClashMax }) {
  const rng = mulberry32(seed);
  let clashCount = 0;
  for (let s = 0; s < samples; s++) {
    const offsets = {};
    for (const p of parts) {
      const sig = Array.isArray(p.sigma) ? p.sigma : [p.sigma, p.sigma, p.sigma];
      offsets[p.id] = [gaussian(rng) * sig[0], gaussian(rng) * sig[1], gaussian(rng) * sig[2]];
    }
    if (clashFn(offsets)) clashCount++;
  }
  const pClash = clashCount / samples;
  const gate = typeof pClashMax === 'number' ? (pClash <= pClashMax ? 'PASS' : 'FAIL') : null;
  return { pClash, clashCount, samples, seed, gate };
}
