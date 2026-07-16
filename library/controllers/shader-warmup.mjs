// library: shader-warmup  (controllers/shader-warmup.mjs)
// source: cinemex-hvac-lorawan · src/controllers/warmup.js · p6-final L2 0.78 (2026-07-14)
// what: boot-time shader warm-up — compiles the boot configuration PLUS every declared state
//       variant before the app flips its ready flag, killing the first-use freeze on toggles
//       (cutaway/section, first selection) whose cost is shader compilation, not per-frame work.
// params: renderer, scene, camera; variants[] = [{ name?, apply(), restore() }] — each variant
//         flips ONE state whose flip changes shader defines (clipping planes, defines-driven
//         material modes). Source used one hard-coded cutaway flip; here the caller declares them.
// deps: none imported — renderer/scene/camera are injected (any three.js >= r118 WebGLRenderer
//       with compile()).
// coupling notes:
//   - BYTE-IDENTICAL RESTORE CONTRACT: each variant's restore() MUST return the renderer,
//     materials and scene to the exact pre-apply() state (same booleans, same plane arrays,
//     same needsUpdate outcomes). Capture harnesses take cold-load evidence right after warm-up;
//     any drift becomes a phantom diff in gated captures. restore() runs even if compile throws.
//   - Call BEFORE setting the readiness flag (e.g. `data-app-ready`): warming after readiness
//     races any harness that waits on the flag.
//   - renderer.compile() traverses the WHOLE graph regardless of visibility, so hidden overlay/
//     selection pools get their programs in the base pass — no need to un-hide anything.
//   - Only defines-changing flips need a variant. Uniform/pipeline-state flips (opacity,
//     transparent, depthWrite, emissive) compile nothing — do not declare them.
//   - Synchronous and blocking by design: the hitch is paid during load, where it is invisible.

/**
 * Compile the boot configuration and every declared shader-state variant, restoring each one.
 *
 * @param {object} opts
 * @param {{ compile: Function }} opts.renderer  three.js WebGLRenderer (needs compile()).
 * @param {object} opts.scene
 * @param {object} opts.camera
 * @param {Array<{ name?: string, apply: Function, restore: Function }>} [opts.variants]
 *        each entry flips one defines-changing state on, and restores it byte-identically.
 * @returns {{ compiles: number, warmed: ReadonlyArray<string> }} frozen stats — the caller flips
 *          its ready flag only after this returns.
 */
export function runShaderWarmup({ renderer, scene, camera, variants = [] } = {}) {
  if (!renderer?.compile || !scene || !camera) {
    throw new TypeError('A renderer with compile(), a scene and a camera are required.');
  }
  if (!Array.isArray(variants)) throw new TypeError('variants must be an array.');

  // Pass 1: the boot configuration itself. compile() ignores visibility, so every lazily-created
  // hidden material (selection/status overlays, halo pools) gets its program here.
  renderer.compile(scene, camera);
  let compiles = 1;

  // Pass 2..n: each declared variant, so the first user toggle is a program-cache hit either way.
  const warmed = [];
  variants.forEach((variant, index) => {
    if (typeof variant?.apply !== 'function' || typeof variant?.restore !== 'function') {
      throw new TypeError(`variants[${index}] needs apply() and restore() functions.`);
    }
    variant.apply();
    try {
      renderer.compile(scene, camera);
      compiles += 1;
    } finally {
      // Restore no matter what: a throw must never leave the scene in the warmed variant state.
      variant.restore();
    }
    warmed.push(variant.name ?? `variant-${index}`);
  });

  return Object.freeze({ compiles, warmed: Object.freeze(warmed) });
}

export default runShaderWarmup;
