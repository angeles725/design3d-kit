// library: geom-verify  (harness/geom-verify.mjs)
// source: design3d QA harness · r160-vetted (three r160 Matrix4/Box3/Frustum semantics) ·
//         distilled from repeated MEMORY.md framing/occlusion failure modes (NDC-behind-near-plane,
//         concentric envelopes hide each other, vertical gaps float, IoU false-positives on L-shapes).
// what: numerical geometry verifiers for the gate — framing (subject in-frame & well-composed),
//       redundancy/concentric-envelope detection, vertical-gap and edge-manifold checks. These
//       REPORT candidates for the modeler; they NEVER mutate, delete, or reposition scene content.
// params: see each function's JSDoc.
// deps: NONE in the pure-math core (below). The three.js-facing wrappers load three via a DYNAMIC
//       import inside the function body — NOT a top-level import.
//
// WHY THE PURE-CORE / DYNAMIC-IMPORT SPLIT (non-negotiable): the pure-math core imports nothing, so
// it is importable and unit-testable in plain Node with no three.js resolution. A top-level
// `import * as THREE from 'three'` would make the whole module (and therefore the test) fail to load
// in a bare Node process. The wrappers that genuinely need three do `await import('three')` at call
// time, keeping the file loadable while the core stays pure and synchronous.
//
// WHY THE w<=0 GUARD IS LOAD-BEARING: three's Vector3.project() divides clip x/y by the clip w with
// NO sign guard. A corner behind the near plane has w<=0; dividing by it FLIPS the sign of the NDC,
// so an off-screen/behind subject can land back inside [-1,1] and read as false-green "well framed".
// projectCornersNDC() therefore inspects w for every one of the 8 corners BEFORE any division and,
// if any corner is at/behind the near plane, refuses to produce NDC bounds (anyBehind:true). Framing
// then reports 'straddles-near-plane' instead of a fabricated composition.

// ============================================================================================
// PURE-MATH CORE — imports nothing; synchronous; safe to import in plain Node.
// ============================================================================================

/**
 * Project 8 world-space corners to NDC using a column-major Matrix4's elements, guarding w<=0.
 * @param {ArrayLike<number>} mvpElements  length-16 column-major (projection * matrixWorldInverse).
 * @param {{x:number,y:number,z:number}[]} corners  exactly 8 corners.
 * @returns {{anyBehind:boolean, ndcMin:{x:number,y:number}|null, ndcMax:{x:number,y:number}|null}}
 */
export function projectCornersNDC(mvpElements, corners) {
  const e = mvpElements;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const clip = [];
  for (const c of corners) {
    const { x, y, z } = c;
    // Column-major Matrix4: e[col*4 + row]. Row 3 (w), row 0 (x), row 1 (y).
    const wc = e[3] * x + e[7] * y + e[11] * z + e[15];
    const xc = e[0] * x + e[4] * y + e[8] * z + e[12];
    const yc = e[1] * x + e[5] * y + e[9] * z + e[13];
    if (wc <= 0) return { anyBehind: true, ndcMin: null, ndcMax: null }; // near-plane guard
    clip.push({ xc, yc, wc });
  }
  for (const { xc, yc, wc } of clip) {
    const nx = xc / wc, ny = yc / wc;
    if (nx < minX) minX = nx;
    if (nx > maxX) maxX = nx;
    if (ny < minY) minY = ny;
    if (ny > maxY) maxY = ny;
  }
  return { anyBehind: false, ndcMin: { x: minX, y: minY }, ndcMax: { x: maxX, y: maxY } };
}

/**
 * Composition metrics from an NDC bounding box. `wellFramed` accepts a subject that fills a good
 * AREA (occupancy in [occMin, occMax]) OR that fills a large fraction of ONE screen axis
 * (`maxAxisFill >= spanMin`) — the latter admits legitimately WIDE/thin subjects (an equipment row,
 * a long pipe run) that can never reach `occMin` AREA in a non-matching-aspect frame, WITHOUT
 * admitting a genuinely tiny subject (low on BOTH). A too-big subject (occupancy > occMax) still fails.
 * @param {{x:number,y:number}} ndcMin
 * @param {{x:number,y:number}} ndcMax
 * @param {{occMin?:number, occMax?:number, centerTol?:number, spanMin?:number}} [opts]
 * @returns {{occupancy:number, maxAxisFill:number, cx:number, cy:number, centered:boolean, fullyVisible:boolean, wellFramed:boolean}}
 */
export function framingMetrics(ndcMin, ndcMax, opts = {}) {
  const { occMin = 0.25, occMax = 0.85, centerTol = 0.3, spanMin = 0.6 } = opts;
  const minX = ndcMin.x, minY = ndcMin.y, maxX = ndcMax.x, maxY = ndcMax.y;
  // Fraction of each NDC axis [-1,1] (width 2) covered by the clamped box, product = area fraction.
  const wFrac = Math.max(0, (Math.min(maxX, 1) - Math.max(minX, -1)) / 2);
  const hFrac = Math.max(0, (Math.min(maxY, 1) - Math.max(minY, -1)) / 2);
  const occupancy = wFrac * hFrac;
  const maxAxisFill = Math.max(wFrac, hFrac);            // fill of the dominant (more-filled) screen axis
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const centered = Math.abs(cx) < centerTol && Math.abs(cy) < centerTol;
  const fullyVisible = minX >= -1 && maxX <= 1 && minY >= -1 && maxY <= 1;
  // Big enough by AREA, OR by filling one axis (wide/thin subjects). A tiny subject is low on both,
  // so it still fails; a too-big subject (occupancy > occMax) still fails; off-center still fails.
  const bigEnough = occupancy >= occMin || maxAxisFill >= spanMin;
  const wellFramed = bigEnough && occupancy <= occMax && centered;
  return { occupancy, maxAxisFill, cx, cy, centered, fullyVisible, wellFramed };
}

/**
 * Intersection-over-Union of two axis-aligned bounding boxes.
 * @param {{min:{x,y,z},max:{x,y,z}}} a
 * @param {{min:{x,y,z},max:{x,y,z}}} b
 * @returns {number} IoU in [0,1]; 0 when disjoint or degenerate union.
 */
export function aabbIoU(a, b) {
  const ix = Math.max(0, Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x));
  const iy = Math.max(0, Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y));
  const iz = Math.max(0, Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z));
  const inter = ix * iy * iz;
  const volA = (a.max.x - a.min.x) * (a.max.y - a.min.y) * (a.max.z - a.min.z);
  const volB = (b.max.x - b.min.x) * (b.max.y - b.min.y) * (b.max.z - b.min.z);
  const union = volA + volB - inter;
  if (union <= 0) return 0; // degenerate boxes — no meaningful overlap
  return inter / union;
}

/**
 * True when `outer` fully contains `inner` (matches three Box3.containsBox <= semantics).
 * @param {{min:{x,y,z},max:{x,y,z}}} outer
 * @param {{min:{x,y,z},max:{x,y,z}}} inner
 * @returns {boolean}
 */
export function aabbContains(outer, inner) {
  return outer.min.x <= inner.min.x && inner.max.x <= outer.max.x
    && outer.min.y <= inner.min.y && inner.max.y <= outer.max.y
    && outer.min.z <= inner.min.z && inner.max.z <= outer.max.z;
}

/**
 * Vertical gap between a lower and an upper box.
 * @param {{min:{y:number},max:{y:number}}} lower
 * @param {{min:{y:number},max:{y:number}}} upper
 * @param {number} [eps=1e-4]
 * @returns {{gap:number, hasGap:boolean}}
 */
export function verticalGap(lower, upper, eps = 1e-4) {
  const gap = upper.min.y - lower.max.y;
  return { gap, hasGap: gap > eps };
}

/**
 * 3D separation between two axis-aligned boxes — the honest junction metric. Unlike `verticalGap`
 * (which only measures the Y axis) this is axis-agnostic: it measures the shortest straight-line
 * distance between the two boxes across ALL THREE axes, so a joint that floats sideways or forward
 * (not just above) is caught. Per axis the clamped separation is
 *     sep_k = max(0, a.min[k]-b.max[k], b.min[k]-a.max[k])
 * (0 when the boxes overlap or merely touch on that axis), and the reported `gap` is the Euclidean
 * length of that separation vector — so a joint separated 0.3 on x AND 0.4 on y reads 0.5, NOT 0.4
 * (a per-axis max would wrongly report 0.4 and miss the diagonal float).
 *
 * `overlapping` means a genuine INTERIOR overlap on every axis (the volumes interpenetrate), which is
 * strictly stronger than sep===0: two boxes sharing a face have sep 0 on the split axis yet do NOT
 * interpenetrate, so they are `touching` (gap <= eps) but NOT `overlapping`. That distinction is the
 * whole point at a junction — face contact is a good weld; interpenetration is a modeling error.
 * @param {{min:{x:number,y:number,z:number},max:{x:number,y:number,z:number}}} a
 * @param {{min:{x:number,y:number,z:number},max:{x:number,y:number,z:number}}} b
 * @param {number} [eps=1e-4]  touch tolerance on the Euclidean gap.
 * @returns {{sep:{x:number,y:number,z:number}, gap:number, touching:boolean, overlapping:boolean}}
 */
export function gap3D(a, b, eps = 1e-4) {
  const sep = { x: 0, y: 0, z: 0 };
  let interiorOnAll = true;
  for (const k of ['x', 'y', 'z']) {
    sep[k] = Math.max(0, a.min[k] - b.max[k], b.min[k] - a.max[k]);
    // Interior overlap on axis k requires STRICT overlap on both sides (face contact does not count).
    if (!(a.min[k] < b.max[k] && b.min[k] < a.max[k])) interiorOnAll = false;
  }
  const gap = Math.hypot(sep.x, sep.y, sep.z);
  return { sep, gap, touching: gap <= eps, overlapping: interiorOnAll };
}

/**
 * Undirected-edge valence check over a flat triangle index array.
 * @param {ArrayLike<number>} indexArray  length is a multiple of 3.
 * @returns {{closed:boolean, openEdges:number, nonManifoldEdges:number}}
 */
export function edgeManifold(indexArray) {
  const counts = new Map();
  for (let i = 0; i < indexArray.length; i += 3) {
    const tri = [indexArray[i], indexArray[i + 1], indexArray[i + 2]];
    for (let k = 0; k < 3; k++) {
      const p = tri[k], q = tri[(k + 1) % 3];
      const a = Math.min(p, q), b = Math.max(p, q);
      const key = `${a}_${b}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  let openEdges = 0, nonManifoldEdges = 0, closed = true;
  for (const v of counts.values()) {
    if (v !== 2) closed = false;
    if (v === 1) openEdges++;
    if (v >= 3) nonManifoldEdges++;
  }
  return { closed, openEdges, nonManifoldEdges };
}

/**
 * Signed volume of a closed triangle mesh via the divergence theorem: V = Σ v1·(v2×v3) / 6 over all
 * triangles (vertices relative to the origin). For a closed mesh with outward CCW winding V > 0;
 * V < 0 signals INSIDE-OUT (flipped winding) — a defect the visual gate misses because a flipped
 * mesh often still renders plausibly. |V| is the enclosed volume (a cheap plausibility sanity-check).
 * @param {ArrayLike<number>} positions  flat [x,y,z, ...] vertex positions.
 * @param {ArrayLike<number>|null} [index]  flat triangle indices; null = non-indexed triangle soup.
 * @returns {number} signed volume.
 */
export function signedVolume(positions, index = null) {
  let v = 0;
  const add = (a, b, c) => {
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
    const cx = positions[c * 3], cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx); // v1·(v2×v3)
  };
  if (index) {
    for (let i = 0; i < index.length; i += 3) add(index[i], index[i + 1], index[i + 2]);
  } else {
    const n = positions.length / 3;
    for (let i = 0; i < n; i += 3) add(i, i + 1, i + 2);
  }
  return v / 6;
}

/**
 * Combined mesh-integrity verdict from raw geometry arrays: manifold-ness (edge valence) + signed
 * volume. `insideOut` is the actionable flag: a CLOSED mesh with negative signed volume has flipped
 * winding. `watertight` = closed with no non-manifold edges. Pure; REPORTS, never mutates.
 * NOTE: the manifold fields need an INDEX (welded geometry). Non-indexed soup has no shared vertices,
 * so `closed` reads false regardless — weld by distance first; `signedVolume` is valid either way.
 * @param {ArrayLike<number>} positions  flat [x,y,z, ...].
 * @param {ArrayLike<number>|null} [index]
 * @returns {{closed:boolean, openEdges:number, nonManifoldEdges:number, signedVolume:number, insideOut:boolean, watertight:boolean}}
 */
export function meshIntegrity(positions, index = null) {
  let idx = index;
  if (!idx) {
    const n = positions.length / 3;
    idx = new Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
  }
  const em = edgeManifold(idx);
  const vol = signedVolume(positions, index);
  return {
    closed: em.closed,
    openEdges: em.openEdges,
    nonManifoldEdges: em.nonManifoldEdges,
    signedVolume: vol,
    insideOut: em.closed && vol < 0,
    watertight: em.closed && em.nonManifoldEdges === 0,
  };
}

/**
 * Guard a derived dimension: throw unless it is finite and >= margin (a visible positive margin,
 * not merely a positive sign — a subtraction that lands at -0.02 or +1e-9 is a modeling fault).
 * @param {number} value
 * @param {string} name
 * @param {number} [margin=1e-3]
 * @returns {number} value, when valid.
 */
export function assertPositive(value, name, margin = 1e-3) {
  if (!Number.isFinite(value) || value < margin) {
    throw new RangeError(`assertPositive: ${name} = ${value} is not >= ${margin}`);
  }
  return value;
}

// ============================================================================================
// THREE.JS-FACING WRAPPERS — async; load three via dynamic import at call time.
// ============================================================================================

/**
 * Verify a subject is on-screen and well composed. REPORTS ONLY — never moves the object or camera.
 * @param {import('three').Object3D} object3D
 * @param {import('three').Camera} camera
 * @param {object} [opts]
 * @param {{left:number,right:number,top:number,bottom:number}} [opts.hudRect]  CSS-px HUD rect.
 * @param {number} [opts.width]   CSS-px viewport width  (required with hudRect).
 * @param {number} [opts.height]  CSS-px viewport height (required with hudRect).
 * @param {number} [opts.occMin]
 * @param {number} [opts.occMax]
 * @param {number} [opts.centerTol]
 * @param {number} [opts.spanMin]  one-axis fill that admits a wide/thin subject (default 0.6).
 * @param {boolean} [opts.emit=true]  console.error on failure.
 * @param {string} [opts.label='subject']
 * @returns {Promise<object>} verdict.
 */
export async function checkFraming(object3D, camera, opts = {}) {
  const THREE = await import('three');
  const { hudRect = null, occMin, occMax, centerTol, spanMin, emit = true, label = 'subject' } = opts;

  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const mvp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const box = new THREE.Box3().setFromObject(object3D, true);

  const frustumVisible = new THREE.Frustum().setFromProjectionMatrix(mvp).intersectsBox(box);
  if (!frustumVisible) {
    const verdict = { ok: false, reason: 'offscreen', frustumVisible: false };
    if (emit) console.error(`[geom-verify] framing FAIL (${label}): ` + JSON.stringify(verdict));
    return verdict;
  }

  const mn = box.min, mx = box.max;
  const corners = [
    { x: mn.x, y: mn.y, z: mn.z }, { x: mx.x, y: mn.y, z: mn.z },
    { x: mn.x, y: mx.y, z: mn.z }, { x: mx.x, y: mx.y, z: mn.z },
    { x: mn.x, y: mn.y, z: mx.z }, { x: mx.x, y: mn.y, z: mx.z },
    { x: mn.x, y: mx.y, z: mx.z }, { x: mx.x, y: mx.y, z: mx.z },
  ];
  const proj = projectCornersNDC(mvp.elements, corners);
  if (proj.anyBehind) {
    const verdict = { ok: false, reason: 'straddles-near-plane', partiallyBehind: true, frustumVisible: true };
    if (emit) console.error(`[geom-verify] framing FAIL (${label}): ` + JSON.stringify(verdict));
    return verdict;
  }

  const m = framingMetrics(proj.ndcMin, proj.ndcMax, { occMin, occMax, centerTol, spanMin });

  let overlapsHUD = false;
  if (hudRect && opts.width && opts.height) {
    const W = opts.width, H = opts.height;
    // NDC -> CSS px: x=(ndc+1)/2*W, y=(1-ndc)/2*H (y flips). Box corners in NDC map to a CSS AABB.
    const cssLeft = (proj.ndcMin.x + 1) * 0.5 * W;
    const cssRight = (proj.ndcMax.x + 1) * 0.5 * W;
    const cssTop = (1 - proj.ndcMax.y) * 0.5 * H;    // ndcMax.y (top) -> smaller css y
    const cssBottom = (1 - proj.ndcMin.y) * 0.5 * H;
    overlapsHUD = cssLeft < hudRect.right && cssRight > hudRect.left
      && cssTop < hudRect.bottom && cssBottom > hudRect.top;
  }

  // ok REQUIRES fullyVisible: a subject cropped at a frame edge (any corner |ndc| > 1) is a named
  // recurrent failure ("gate blind to framing — a cropped subject passes exit 0"), so it must fail
  // here, not merely be reported. cropped is surfaced for the modeler.
  const verdict = {
    ok: frustumVisible && !proj.anyBehind && m.fullyVisible && m.wellFramed && !overlapsHUD,
    frustumVisible: true,
    occupancy: m.occupancy,
    maxAxisFill: m.maxAxisFill,
    centered: m.centered,
    fullyVisible: m.fullyVisible,
    cropped: !m.fullyVisible,
    wellFramed: m.wellFramed,
    overlapsHUD,
    ndcMin: proj.ndcMin,
    ndcMax: proj.ndcMax,
  };
  if (emit && !verdict.ok) console.error(`[geom-verify] framing FAIL (${label}): ` + JSON.stringify(verdict));
  return verdict;
}

/**
 * Detect concentric/redundant meshes by AABB. REPORTS candidates — never deletes or mutates.
 *
 * IMPORTANT: aabbIoU here is a FIRST-PASS FILTER only. Two L-shaped or hollow meshes can share a
 * high AABB IoU while their triangles never actually overlap, so a high-IoU pair is a CANDIDATE the
 * modeler must eyeball — this function must NEVER auto-delete, merge, or mutate the scene. It only
 * reports.
 *
 * @param {import('three').Object3D[]|import('three').Scene} objects  meshes, or a Scene to collect from.
 * @param {{ioUMax?:number, emit?:boolean}} [opts]
 * @returns {Promise<{ok:boolean, findings:{a:string,b:string,kind:string,ioU?:number}[]}>}
 */
export async function checkGeometry(objects, opts = {}) {
  const THREE = await import('three');
  const { ioUMax = 0.85, emit = true } = opts;

  let meshes;
  if (objects && objects.isScene) {
    meshes = [];
    objects.traverse((o) => { if (o.isMesh) meshes.push(o); });
  } else {
    meshes = (objects || []).filter((o) => o && o.isMesh);
  }

  const boxes = meshes.map((mesh) => {
    const b = new THREE.Box3().setFromObject(mesh, true);
    return {
      name: mesh.name || mesh.uuid,
      box: {
        min: { x: b.min.x, y: b.min.y, z: b.min.z },
        max: { x: b.max.x, y: b.max.y, z: b.max.z },
      },
    };
  });

  const findings = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i], B = boxes[j];
      if (aabbContains(A.box, B.box) || aabbContains(B.box, A.box)) {
        findings.push({ a: A.name, b: B.name, kind: 'concentric' });
        continue;
      }
      const iou = aabbIoU(A.box, B.box);
      if (iou > ioUMax) {
        findings.push({ a: A.name, b: B.name, kind: 'redundant', ioU: iou });
      }
    }
  }

  const ok = findings.length === 0;
  if (emit && !ok) {
    console.error('[geom-verify] geometry findings (candidates, NOT auto-fixed): '
      + JSON.stringify(findings));
  }
  return { ok, findings };
}

/**
 * Verify two meshes actually MEET at their junction — an axis-agnostic 3D gap check. Boxes the two
 * meshes with Box3.setFromObject(mesh, true) (precise=true, so the box hugs the transformed geometry,
 * not a loose local-space AABB), then runs the pure `gap3D`. A gap over `maxGap` is a floating joint
 * — the exact "vertical gaps float / incoherent unions between cylinders" failure mode this catches.
 * REPORTS ONLY — never moves either mesh. Emits with `console.error` (NEVER console.assert, which the
 * gate cannot see) so the gate registers the failure.
 * @param {import('three').Object3D} meshA
 * @param {import('three').Object3D} meshB
 * @param {{maxGap?:number, emit?:boolean, label?:string}} [opts]
 * @returns {Promise<{ok:boolean, gap:number, sep:{x:number,y:number,z:number}, touching:boolean, overlapping:boolean, label:string}>}
 */
export async function checkJunction(meshA, meshB, { maxGap = 0.01, emit = true, label = 'junction' } = {}) {
  const THREE = await import('three');
  const ba = new THREE.Box3().setFromObject(meshA, true);
  const bb = new THREE.Box3().setFromObject(meshB, true);
  const boxA = { min: { x: ba.min.x, y: ba.min.y, z: ba.min.z }, max: { x: ba.max.x, y: ba.max.y, z: ba.max.z } };
  const boxB = { min: { x: bb.min.x, y: bb.min.y, z: bb.min.z }, max: { x: bb.max.x, y: bb.max.y, z: bb.max.z } };
  const { sep, gap, touching, overlapping } = gap3D(boxA, boxB);
  const ok = gap <= maxGap;
  if (emit && !ok) {
    console.error(`[geom-verify] ${label}: gap ${gap.toFixed(4)}m > ${maxGap}m `
      + `(sep x=${sep.x.toFixed(4)} y=${sep.y.toFixed(4)} z=${sep.z.toFixed(4)}) — floating joint`);
  }
  return { ok, gap, sep, touching, overlapping, label };
}

/**
 * Mesh-level integrity for a single three.js Mesh: extracts its geometry arrays and runs
 * meshIntegrity. Reads three objects but constructs none (no import needed). REPORTS ONLY.
 * `ok` is false only for an INSIDE-OUT mesh (flipped winding); an open/non-manifold mesh is common
 * and legitimate (a hollow shell, a cut-away), so it is reported but does not fail the check.
 * @param {import('three').Mesh} mesh
 * @param {{emit?:boolean, label?:string}} [opts]
 * @returns {{ok:boolean, reason?:string, closed?:boolean, openEdges?:number, nonManifoldEdges?:number, signedVolume?:number, insideOut?:boolean, watertight?:boolean}}
 */
export function checkMeshIntegrity(mesh, opts = {}) {
  const { emit = true, label } = opts;
  const g = mesh && mesh.geometry;
  const positions = g && g.attributes && g.attributes.position && g.attributes.position.array;
  if (!positions) return { ok: true, reason: 'no-position' };
  const index = g.index ? g.index.array : null;
  const r = meshIntegrity(positions, index);
  const ok = !r.insideOut;
  if (emit && !ok) {
    console.error(`[geom-verify] mesh integrity FAIL (${label || mesh.name || mesh.uuid}): ` + JSON.stringify(r));
  }
  return { ok, ...r };
}
