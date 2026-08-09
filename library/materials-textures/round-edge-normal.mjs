// library: round-edge-normal  (materials-textures/round-edge-normal.mjs)
// source: design3d numerical-methods pass · research block B126 §D ("fake curvature").
//         The cheap-round-primitives sweet-spot: make a FLAT 12-tri BoxGeometry read as if its
//         edges were beveled, WITHOUT the geometry — a baked tangent-space normal map does it at
//         ~89% fewer triangles than RoundedBoxGeometry(segments=1) (which is 12 tris → ~108 tris).
//
// FAKE-CURVATURE RATIONALE:
//   A rounded-over edge is a shading illusion, not a silhouette one — at normal viewing distance the
//   eye reads the SHADING gradient across an edge, not the ~1px silhouette. So we keep the box flat
//   (12 tris) and paint a tangent-space normal map that tilts the shading normal OUTWARD inside a
//   thin band along each face border. In the flat interior the tangent-space normal is (0,0,1) — no
//   perturbation, standard flat-normal blue. Within the `bevel` band the normal tips toward the
//   nearest edge (top edge → +Y tilt, bottom → −Y, right → +X, left → −X; corners blend both), so a
//   directional light grazes the band and the lit result reads as a rounded chamfer. All 6 faces of a
//   box share this ONE tiling map (each face UV runs 0..1), assigned as material.normalMap.
//
// PURE / ASYNC split (same idiom as procedural-pbr-canvas / superquadric):
//   - The pure core (boxEdgeNormal / encodeNormalRGB) imports NOTHING and is DETERMINISTIC (no
//     Math.random, no Date), so it is unit-testable in plain Node with no three.js resolution.
//   - The in-page builder loads three via a dynamic `import('three')` INSIDE the function and paints
//     on a `document.createElement('canvas')` (like procedural-pbr-canvas), so importing this module
//     in Node never drags in three or the DOM.
//
// DEFERRED — the shader variant is NOT shipped here:
//   B126 §J describes an alternative that perturbs the box-edge normal analytically in an
//   `onBeforeCompile` SDF injection (no baked texture at all). It is deliberately NOT shipped in this
//   module: r160 has no vetted public recipe for it, and an injected shader chunk needs a headless
//   shader-compile gate to prove it does not stall SwiftShader. This baked-normalMap path has ZERO
//   shader risk (it is a plain CanvasTexture the stock MeshStandardMaterial normal path consumes) and
//   is therefore the safe default. Revisit the SDF variant only behind a shader-compile gate.

// -------- pure core (import nothing; deterministic) -----------------------------------------------

/**
 * UNIT tangent-space shading normal for a point (u,v) inside one box face, both in [0,1].
 * Flat interior (both coords at least `bevel` from every border) returns exactly (0,0,1). Inside the
 * `bevel` band along a border the normal tilts OUTWARD toward the nearest edge, ramping linearly from
 * flat at the band's inner edge to maximum tilt at the face border:
 *   du = min(u, 1-u), dv = min(v, 1-v)  — distance to the nearest vertical / horizontal border.
 *   tiltX = (du < bevel) ? sign_u * (1 - du/bevel) : 0,  sign_u = (u < 0.5 ? -1 : +1)  (left → −X, right → +X)
 *   tiltY = (dv < bevel) ? sign_v * (1 - dv/bevel) : 0,  sign_v = (v < 0.5 ? -1 : +1)  (bottom → −Y, top → +Y)
 * The un-normalized normal is (tiltX*k, tiltY*k, 1) for slope factor `k` (k=1 ⇒ up to 45° at the
 * border); the return value is that vector NORMALIZED to unit length. A corner point gets BOTH tilts,
 * blending to a diagonal (correct — a corner rounds toward the box vertex).
 * @param {number} u face U coordinate in [0,1].
 * @param {number} v face V coordinate in [0,1].
 * @param {number} [bevel=0.12] band half-width as a fraction of the face; guarded to (0, 0.5].
 * @param {number} [k=1] slope factor of the tilt (1 ⇒ up to ~45° at the border).
 * @returns {{x:number, y:number, z:number}} unit tangent-space normal.
 */
export function boxEdgeNormal(u, v, bevel = 0.12, k = 1) {
  // guard bevel into (0, 0.5]
  const b = bevel > 0.5 ? 0.5 : bevel <= 0 ? 1e-6 : bevel;

  const du = Math.min(u, 1 - u);
  const dv = Math.min(v, 1 - v);

  const tiltX = du < b ? (u < 0.5 ? -1 : 1) * (1 - du / b) : 0;
  const tiltY = dv < b ? (v < 0.5 ? -1 : 1) * (1 - dv / b) : 0;

  let x = tiltX * k;
  let y = tiltY * k;
  let z = 1;
  const len = Math.sqrt(x * x + y * y + z * z);
  return { x: x / len, y: y / len, z: z / len };
}

/**
 * Encode a unit (or any) normal into an 8-bit RGB triple the way a tangent-space normal map stores it:
 * each component maps [-1,1] → [0,255] via round((c*0.5 + 0.5)*255). The flat normal (0,0,1) therefore
 * encodes to [128,128,255] — the standard "flat blue" of a normal map.
 * @param {{x:number, y:number, z:number}} n
 * @returns {[number, number, number]} r,g,b as integers in 0..255.
 */
export function encodeNormalRGB(n) {
  const enc = (c) => Math.round((c * 0.5 + 0.5) * 255);
  return [enc(n.x), enc(n.y), enc(n.z)];
}

// -------- in-page builder (dynamic three import; async) --------------------------------------------
/**
 * Paint a tangent-space round-edge normal map on a CPU canvas (no downloads, SwiftShader-safe) and
 * return it as a THREE.CanvasTexture. Every pixel's UV (u,v) is fed through `boxEdgeNormal`; the flat
 * interior stays flat-blue [128,128,255] and a `bevel`-wide band along each border tilts outward so a
 * FLAT box reads as if its edges were beveled — ~89% fewer triangles than geometric rounding
 * (RoundedBoxGeometry(segments=1)); B126 §D.
 *
 * USAGE — assign to a FLAT BoxGeometry's material:
 *     const t = await makeRoundEdgeNormalMap({ bevel: 0.12 });
 *     material.normalMap = t;                 // all 6 faces share this one tiling map (each face UV 0..1)
 *     // material.normalScale.set(0.6, 0.6);  // dial the effect DOWN if the fake bevel is too strong
 * colorSpace = NoColorSpace because a normal map is DATA (an encoded vector), not color — tagging it
 * sRGB would gamma-curve the bytes and skew the decoded normal. RepeatWrapping + `repeat` lets one map
 * tile across a face if you want several small bevels per face. ASYNC: loads three via a dynamic import
 * so the pure core above stays Node-importable.
 *
 * @param {object} [opts]
 * @param {number} [opts.size=256]          canvas edge in px (square).
 * @param {number} [opts.bevel=0.12]        band half-width as a fraction of the face; guarded to (0,0.5].
 * @param {[number,number]} [opts.repeat=[1,1]] RepeatWrapping tiling of the map across the face.
 * @returns {Promise<import('three').CanvasTexture>} round-edge tangent-space normal map.
 */
export async function makeRoundEdgeNormalMap({
  size = 256,
  bevel = 0.12,
  repeat = [1, 1],
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const img = g.createImageData(size, size);
  const data = img.data;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = (px + 0.5) / size;
      const v = (py + 0.5) / size;
      const n = boxEdgeNormal(u, v, bevel);
      const [r, gg, bb] = encodeNormalRGB(n);
      const idx = (py * size + px) * 4;
      data[idx] = r;      // R — normal.x
      data[idx + 1] = gg; // G — normal.y
      data[idx + 2] = bb; // B — normal.z
      data[idx + 3] = 255; // A
    }
  }
  g.putImageData(img, 0, 0);

  const THREE = await import('three');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace; // DATA (encoded vector), not color — never sRGB
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.needsUpdate = true;
  return tex;
}
