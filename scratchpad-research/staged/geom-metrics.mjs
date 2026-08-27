// geom-metrics.mjs — STAGED delta (investigador3, MATH/QC §9 net-new #1).
// Pure-math mesh QC metrics: surface area, volume-weighted centroid, and a signed-volume winding
// discriminator. Companion to library/harness/geom-verify.mjs (same contract: flat-array input,
// PURE, REPORTS-ONLY, never mutates, deterministic — no Math.random/Date). At integration these fold
// INTO geom-verify.mjs (it already exports signedVolume; volumeMetrics reuses that method).
//
// Why: investigacion4.md (getVolume/getArea/getCenter, l.1249-1257) + the topology rubric (§7).
// A closed mesh with signed volume <= 0 is a DIRECT inverted-winding / non-manifold flag — a cheaper,
// more robust discriminator than edge counts for the "reads plausibly but is inside-out" defect the
// visual gate misses. Area/centroid feed dimensional QC (a duct's swept volume vs its spec envelope).

/**
 * Surface area of a triangle mesh: Σ ½·|(b−a)×(c−a)|. Always ≥ 0, winding-independent.
 * @param {ArrayLike<number>} positions flat [x,y,z,...]
 * @param {ArrayLike<number>|null} [index] flat tri indices; null = non-indexed soup
 * @returns {number} total area
 */
export function surfaceArea(positions, index = null) {
  let area = 0;
  const add = (a, b, c) => {
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
    const cx = positions[c * 3], cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    area += 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz);
  };
  if (index) for (let i = 0; i < index.length; i += 3) add(index[i], index[i + 1], index[i + 2]);
  else { const n = positions.length / 3; for (let i = 0; i < n; i += 3) add(i, i + 1, i + 2); }
  return area;
}

// signed volume (v1·(v2×v3)/6) — inlined here to keep the staged module self-contained; at
// integration this delegates to geom-verify.signedVolume (identical method).
function signedVol(positions, index) {
  let v = 0;
  const add = (a, b, c) => {
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
    const cx = positions[c * 3], cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  };
  if (index) for (let i = 0; i < index.length; i += 3) add(index[i], index[i + 1], index[i + 2]);
  else { const n = positions.length / 3; for (let i = 0; i < n; i += 3) add(i, i + 1, i + 2); }
  return v / 6;
}

/**
 * Volume-weighted centroid of a closed mesh via tetrahedra (O,a,b,c). Sign cancels, so a consistently
 * wound mesh gives the true solid centroid regardless of overall orientation. Falls back to the plain
 * vertex mean when |volume| is degenerate (an OPEN mesh has no enclosed centroid).
 * @returns {{x:number,y:number,z:number,degenerate:boolean}}
 */
export function centroid(positions, index = null) {
  let cx = 0, cy = 0, cz = 0, vSum = 0;
  const acc = (a, b, c) => {
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
    const dx = positions[c * 3], dy = positions[c * 3 + 1], dz = positions[c * 3 + 2];
    const vt = (ax * (by * dz - bz * dy) - ay * (bx * dz - bz * dx) + az * (bx * dy - by * dx)) / 6;
    cx += vt * (ax + bx + dx) / 4; cy += vt * (ay + by + dy) / 4; cz += vt * (az + bz + dz) / 4;
    vSum += vt;
  };
  if (index) for (let i = 0; i < index.length; i += 3) acc(index[i], index[i + 1], index[i + 2]);
  else { const n = positions.length / 3; for (let i = 0; i < n; i += 3) acc(i, i + 1, i + 2); }
  if (Math.abs(vSum) < 1e-12) {
    // open/degenerate: plain vertex mean
    let mx = 0, my = 0, mz = 0; const n = positions.length / 3;
    for (let i = 0; i < n; i++) { mx += positions[i * 3]; my += positions[i * 3 + 1]; mz += positions[i * 3 + 2]; }
    return { x: mx / n, y: my / n, z: mz / n, degenerate: true };
  }
  return { x: cx / vSum, y: cy / vSum, z: cz / vSum, degenerate: false };
}

/**
 * Combined dimensional/QC metrics + the winding discriminator. `invertedWinding` is the actionable
 * flag: a CLOSED mesh whose signed volume is <= 0 has flipped normals (renders plausibly, fails
 * physical sense). Optionally checks the enclosed volume against a declared spec envelope.
 * @param {ArrayLike<number>} positions flat [x,y,z,...]
 * @param {ArrayLike<number>|null} [index]
 * @param {{expectedVolume?:number, volumeTol?:number}} [opts]
 * @returns {{signedVolume:number, volume:number, surfaceArea:number, centroid:{x,y,z,degenerate:boolean}, invertedWinding:boolean, volumeOk:boolean|null}}
 */
export function volumeMetrics(positions, index = null, opts = {}) {
  const sv = signedVol(positions, index);
  const area = surfaceArea(positions, index);
  const c = centroid(positions, index);
  let volumeOk = null;
  if (typeof opts.expectedVolume === 'number') {
    const tol = typeof opts.volumeTol === 'number' ? opts.volumeTol : 1e-3;
    volumeOk = Math.abs(Math.abs(sv) - opts.expectedVolume) <= tol;
  }
  return { signedVolume: sv, volume: Math.abs(sv), surfaceArea: area, centroid: c, invertedWinding: sv <= 0, volumeOk };
}
