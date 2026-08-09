// library: procedural-pbr-canvas  (materials-textures/procedural-pbr-canvas.mjs)
// source: design3d numerical-methods pass · the "real texture without downloads" win.
//         Extends paint-roughness-canvas-tex (CPU CanvasTexture roughness) into a PACKED PBR
//         data map painted procedurally on the CPU canvas — zero downloads, SwiftShader-safe.
// what: paint a PACKED glTF metallicRoughness data texture procedurally, plus a procedural
//       dirt/wear layer that raises roughness in worn patches. No network, no image assets.
//
// PACKED metallicRoughness (glTF KHR convention, confirmed in research block B126 §E):
//   a single texture carries ROUGHNESS in the GREEN channel and METALNESS in the BLUE channel
//   (the RED channel is free — often occlusion in a full ORM pack). Assign the SAME returned
//   texture to BOTH material.roughnessMap and material.metalnessMap: three samples roughness from
//   G and metalness from B, so one packed texture drives both maps and HALVES texture memory.
//
// NoColorSpace rationale: this is DATA, not color. Roughness/metalness are linear scalars; tagging
//   the texture sRGB would gamma-curve the bytes and skew both channels. We set colorSpace =
//   THREE.NoColorSpace explicitly (paint-roughness-canvas-tex leaves the default no-color-space —
//   same intent; here we name it because it is a packed data map, the trap is easy to miss).
//
// NOISE — a PURE port, no GPL. The value-noise + fbm below are written from the standard textbook
//   definitions (integer-lattice value noise with a smoothstep fade, then fractional Brownian
//   motion = summed octaves at rising frequency / falling amplitude, normalized by total amplitude).
//   No third-party / GPL noise code was copied.
//
// PURE / ASYNC split (same idiom as superquadric / adaptive-segments):
//   - The noise core (hash2 / valueNoise2 / fbm2) imports NOTHING and is DETERMINISTIC (no
//     Math.random, no Date) so it is unit-testable in plain Node with no three.js resolution.
//   - The in-page builder loads three via a dynamic `import('three')` INSIDE the function and uses
//     `document.createElement('canvas')` (like paint-roughness-canvas-tex), so importing this module
//     in Node never drags in three or the DOM.

// -------- pure noise core (import nothing; deterministic) ------------------------------------------

/**
 * Deterministic integer hash → float in [0,1). Same (ix,iy) always yields the same value;
 * order matters (hash2(a,b) !== hash2(b,a)) and the output is well-distributed.
 * Mixes the two integer coordinates with large primes, then takes the fractional part of a
 * scaled sine — a classic dependency-free hash (not cryptographic; good enough for texture noise).
 * @param {number} ix
 * @param {number} iy
 * @returns {number} float in [0,1)
 */
export function hash2(ix, iy) {
  // integer mix with two large primes, then fract(sin(.) * big)
  const s = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/**
 * 2D value noise in [0,1]: hash the 4 lattice corners around (x,y), apply the smoothstep fade
 * f(t) = t*t*(3 - 2t) to the fractional part, and bilinearly interpolate the corner hashes.
 * Continuous everywhere; at integer lattice points the fade is 0 so the value equals the corner
 * hash exactly (valueNoise2(i,j) === hash2(i,j)).
 * @param {number} x
 * @param {number} y
 * @returns {number} value noise in [0,1]
 */
export function valueNoise2(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  const c00 = hash2(ix, iy);
  const c10 = hash2(ix + 1, iy);
  const c01 = hash2(ix, iy + 1);
  const c11 = hash2(ix + 1, iy + 1);

  // smoothstep fade
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  // bilinear interpolate
  const bottom = c00 + (c10 - c00) * ux;
  const top = c01 + (c11 - c01) * ux;
  return bottom + (top - bottom) * uy;
}

/**
 * 2D fractional Brownian motion in [0,1]: sum `octaves` of value noise at rising frequency
 * (× lacunarity) and falling amplitude (× gain), NORMALIZED by the total amplitude so the result
 * stays in [0,1]. Deterministic (built on hash2).
 * @param {number} x
 * @param {number} y
 * @param {{octaves?:number, lacunarity?:number, gain?:number}} [opts]
 * @returns {number} fbm value in [0,1]
 */
export function fbm2(x, y, { octaves = 4, lacunarity = 2, gain = 0.5 } = {}) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise2(x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

// -------- tiny inline clamp/mix helpers (import nothing) -------------------------------------------
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function mix(a, b, t) { return a + (b - a) * t; }

// -------- in-page builder (dynamic three import; async) --------------------------------------------
/**
 * Paint a PACKED metallicRoughness data texture on a CPU canvas (no downloads, SwiftShader-safe)
 * and return it as a THREE.CanvasTexture. The GREEN channel carries procedural roughness (fbm noise
 * around `roughnessBase` with amplitude `roughnessVar`), the BLUE channel carries a flat `metalness`,
 * and RED is left at 0. An optional second fbm `wear` layer raises roughness toward 1 in worn patches.
 *
 * USAGE — assign the SAME returned texture to BOTH maps:
 *     const t = await makeProceduralMetalRough({ metalness: 0.9, wear: 0.4 });
 *     material.roughnessMap = t;   // three reads roughness from the GREEN channel
 *     material.metalnessMap = t;   // three reads metalness from the BLUE channel
 *     material.roughness = 1;      // multiplier — keep at 1 so the map drives the value
 *     material.metalness = 1;      // multiplier — keep at 1 so the map drives the value
 * One packed texture drives both maps (halves texture memory). colorSpace = NoColorSpace because
 * this is scalar DATA, not color. ASYNC: loads three via a dynamic import so the pure noise core
 * above stays Node-importable.
 *
 * @param {object} [opts]
 * @param {number} [opts.size=512]            canvas edge in px (square).
 * @param {number} [opts.roughnessBase=0.45]  mean roughness (center of the noise band).
 * @param {number} [opts.roughnessVar=0.22]   ± roughness amplitude around the base.
 * @param {number} [opts.metalness=0.9]       flat metalness written to the BLUE channel.
 * @param {number} [opts.scale=5]             noise frequency across the map (higher = finer grain).
 * @param {number} [opts.octaves=4]           fbm octaves for the roughness layer.
 * @param {number} [opts.wear=0]              0 = none; >0 blends roughness→1 in worn fbm patches.
 * @param {[number,number]} [opts.repeat=[1,1]] RepeatWrapping tiling (retune per surface size).
 * @returns {Promise<import('three').CanvasTexture>} packed metallicRoughness data texture.
 */
export async function makeProceduralMetalRough({
  size = 512,
  roughnessBase = 0.45,
  roughnessVar = 0.22,
  metalness = 0.9,
  scale = 5,
  octaves = 4,
  wear = 0,
  repeat = [1, 1],
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const img = g.createImageData(size, size);
  const data = img.data;

  const mB = clamp01(metalness) * 255;
  // a second, coarser fbm drives the wear patches (offset so it does not correlate with the grain).
  const wearScale = scale * 0.5;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const n = fbm2((px / size) * scale, (py / size) * scale, { octaves });
      let rough = clamp01(roughnessBase + (n - 0.5) * 2 * roughnessVar);
      if (wear > 0) {
        // worn patches: where the wear fbm is high, push roughness toward fully rough (1).
        const w = fbm2((px / size) * wearScale + 17.3, (py / size) * wearScale + 4.1, { octaves });
        const wearAmount = clamp01((w - (1 - wear)) / (wear || 1)) * wear;
        rough = clamp01(mix(rough, 1, wearAmount));
      }
      const idx = (py * size + px) * 4;
      data[idx] = 0;              // R — free (0)
      data[idx + 1] = rough * 255; // G — roughness
      data[idx + 2] = mB;          // B — metalness
      data[idx + 3] = 255;         // A
    }
  }
  g.putImageData(img, 0, 0);

  const THREE = await import('three');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace; // DATA, not color — never sRGB
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.needsUpdate = true;
  return tex;
}
