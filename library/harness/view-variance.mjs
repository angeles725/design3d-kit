// library: view-variance  (harness/view-variance.mjs) — μ−λσ multi-view advisory (investigador3).
// Multi-view statistical scoring: aggregate per-view scores into mean, std, and the pessimistic
// Score = mean - lambda*std, and flag high cross-view variance. ADVISORY aggregation ONLY — the blind
// VLM keeps sole visual acceptance (GATES.md:3-6). This does NOT accept/reject; it summarises the
// per-view VLM scores + surfaces a view-dependent-defect signal (a subject that reads from the front
// but is missing from the back shows up as high sigma). Pure, deterministic (no three, no RNG).
//
// The N views MUST be a fixed scripted --cam/--shots set (Rule 9) or sigma just measures camera noise.

/**
 * @param {number[]} scores  per-view scores (each 0..10), one per fixed camera in the shot set.
 * @param {{lambda?:number, varianceFlag?:number}} [opts] lambda for mean-lambda*std (default 0.5);
 *        varianceFlag = std above which highVariance fires (default 1.0, one point spread).
 * @returns {{n:number, mean:number, std:number, adjusted:number, min:number, max:number,
 *            range:number, highVariance:boolean, worstView:number}}
 */
export function viewVariance(scores, opts = {}) {
  const lambda = typeof opts.lambda === 'number' ? opts.lambda : 0.5;
  const flag = typeof opts.varianceFlag === 'number' ? opts.varianceFlag : 1.0;
  const n = scores.length;
  if (n === 0) return { n: 0, mean: 0, std: 0, adjusted: 0, min: 0, max: 0, range: 0, highVariance: false, worstView: -1 };
  let sum = 0, min = Infinity, max = -Infinity, worstView = 0;
  for (let i = 0; i < n; i++) {
    const s = scores[i];
    sum += s;
    if (s < min) { min = s; worstView = i; }
    if (s > max) max = s;
  }
  const mean = sum / n;
  let sq = 0;
  for (let i = 0; i < n; i++) { const d = scores[i] - mean; sq += d * d; }
  const std = Math.sqrt(sq / n); // population std (fixed camera set = the whole population, not a sample)
  return {
    n, mean, std, adjusted: mean - lambda * std,
    min, max, range: max - min,
    highVariance: std > flag, worstView,
  };
}
