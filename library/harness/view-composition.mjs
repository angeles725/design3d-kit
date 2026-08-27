// library: view-composition  (harness/view-composition.mjs) — objective composition MEASUREMENT (investigador2).
// source: Revisor COB-IM2 WU-L4-A retro (2026-08-27). A green MECHANICAL framing gate is NOT a verdict:
//   the framing-probe measures the SUBJECT's AABB composition (occupancy, centering) and is BLIND to what
//   else is drawn around it. Attempts 2/3 read "one bay" in the HUD yet the blind FAILED because the whole
//   153 m network projected into the frame — the bay was one among hundreds. The fix is to give the AI/judge
//   an OBJECTIVE MEASUREMENT of the composition (numbers), not a mechanical impression. This module supplies
//   the pure GEOMETRY (frustum + AABB projection); the RENDER stays in Revisor's harness.
//
// what: project the subject + every other object's AABB through a view-projection matrix, measure how much of
//   the frame each covers, and derive a dominanceRatio. Feeds a NECESSARY-not-sufficient pre-filter for the
//   blind reviewer (a dominant bay can still fail on color/dim; a NON-dominant one can NEVER read as focus).
// deps: NONE. Pure math, deterministic (fixed grid order; no Math.random / Date). Offline-testable in bare Node.
//
// CONVENTIONS: `viewProj` is a COLUMN-MAJOR 4x4 as number[16] (three.js Matrix4.elements order). A caller with
//   three supplies `camera.projectionMatrix · camera.matrixWorldInverse` flattened; a caller without three uses
//   lookAtPerspective() below. NDC is the OpenGL cube: x,y ∈ [-1,1] visible, z ∈ [-1,1], w>0 in front of eye.
//   AABB = { lo:[x,y,z], hi:[x,y,z] } (world). Projected extent uses the 8-corner screen bbox — a documented
//   OVER-approximation of the true silhouette, correct for a pre-filter/advisory.
//
// CONTRACT — RENDERED, not whole-scene: `otherAABBs` must be the geometry ACTUALLY DRAWN in this view (post
//   clip/cull), not every object in the scene. The metric measures GEOMETRY; two renders that differ only by
//   what is drawn (WU-L4-A: dim vs hide, SAME camera + SAME AABBs) discriminate ONLY if the caller feeds the
//   surviving set. Pass rendered-only, or pass all with `visible:false` on the excluded ones (the module
//   filters those). Whole-scene AABBs with no visibility silently report low dominance even in an isolated view.

const EPS = 1e-9;

// ---- minimal column-major 4x4 helpers (three.js element order) -------------------------------
const V = { sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2], norm:(a)=>{const l=Math.hypot(a[0],a[1],a[2])||1; return [a[0]/l,a[1]/l,a[2]/l];} };

// C = A·B, both column-major: C[i+4j] = Σk A[i+4k]·B[k+4j]
export function mat4mul(a, b) {
  const o = new Array(16).fill(0);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { let s = 0;
    for (let k = 0; k < 4; k++) s += a[i + 4*k] * b[k + 4*j]; o[i + 4*j] = s; }
  return o;
}

// perspective (OpenGL, looks down -z), column-major. fovYdeg vertical FOV.
function perspective(fovYdeg, aspect, near, far) {
  const f = 1 / Math.tan((fovYdeg * Math.PI / 180) / 2), nf = 1 / (near - far);
  const m = new Array(16).fill(0);
  m[0] = f / aspect; m[5] = f; m[10] = (far + near) * nf; m[11] = -1; m[14] = (2 * far * near) * nf;
  return m;
}
// view = inverse of lookAt(eye→target), column-major. Camera looks toward -z.
function lookAtView(eye, target, up) {
  const z = V.norm(V.sub(eye, target));          // backward
  const x = V.norm(V.cross(up, z));              // right
  const y = V.cross(z, x);                        // true up
  return [ x[0], y[0], z[0], 0,  x[1], y[1], z[1], 0,  x[2], y[2], z[2], 0,
           -V.dot(x, eye), -V.dot(y, eye), -V.dot(z, eye), 1 ];
}
/** Build a column-major view-projection matrix without three. @returns {number[16]} */
export function lookAtPerspective({ eye, target, up = [0, 0, 1], fovDeg = 50, aspect = 1, near = 0.1, far = 1000 }) {
  return mat4mul(perspective(fovDeg, aspect, near, far), lookAtView(eye, target, up));
}

// ---- AABB → NDC screen box -------------------------------------------------------------------
const cornersOf = (a) => { const o = []; for (const x of [a.lo[0], a.hi[0]]) for (const y of [a.lo[1], a.hi[1]]) for (const z of [a.lo[2], a.hi[2]]) o.push([x, y, z]); return o; };

// Project an AABB to a clipped NDC screen box {x0,y0,x1,y1} in [-1,1]^2, or null if it lands fully outside /
// entirely behind the eye. Corners with w<=0 (behind the near plane) are dropped — a partial-behind box is
// under-approximated (acceptable for an advisory pre-filter).
export function projectAabbToNdcBox(viewProj, aabb) {
  const m = viewProj; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, any = false;
  for (const [x, y, z] of cornersOf(aabb)) {
    const cw = m[3]*x + m[7]*y + m[11]*z + m[15];
    if (cw <= EPS) continue;                                          // behind the eye — drop this corner
    const nx = (m[0]*x + m[4]*y + m[8]*z + m[12]) / cw;
    const ny = (m[1]*x + m[5]*y + m[9]*z + m[13]) / cw;
    x0 = Math.min(x0, nx); y0 = Math.min(y0, ny); x1 = Math.max(x1, nx); y1 = Math.max(y1, ny); any = true;
  }
  if (!any) return null;
  x0 = Math.max(-1, x0); y0 = Math.max(-1, y0); x1 = Math.min(1, x1); y1 = Math.min(1, y1);
  if (x1 - x0 <= 0 || y1 - y0 <= 0) return null;                     // clipped away entirely
  return { x0, y0, x1, y1 };
}

// area fraction (of the 2x2 NDC viewport) of a clipped screen box
const boxAreaFrac = (b) => b ? ((b.x1 - b.x0) * (b.y1 - b.y0)) / 4 : 0;

// mark a gridN×gridN NDC coverage grid (boolean) for a screen box; used to UNION overlapping boxes so their
// shared screen area is not double-counted.
function rasterInto(grid, gridN, box) {
  if (!box) return;
  const toCell = (ndc) => Math.min(gridN - 1, Math.max(0, Math.floor((ndc + 1) / 2 * gridN)));
  const i0 = toCell(box.x0), i1 = toCell(box.x1), j0 = toCell(box.y0), j1 = toCell(box.y1);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) grid[j * gridN + i] = 1;
}
const countGrid = (grid) => { let n = 0; for (let k = 0; k < grid.length; k++) if (grid[k]) n++; return n; };

/**
 * Objective composition of a rendered view (Revisor WU-L4-A). Measures how much of the frame the SUBJECT
 * covers vs everything else, so a judge scores numbers instead of an impression.
 * @param {{lo:number[],hi:number[]}} subjectAABB  the focus object's world AABB
 * @param {Array<{lo:number[],hi:number[],visible?:boolean}>} otherAABBs  the OTHER objects' world AABBs — the
 *   geometry ACTUALLY RENDERED in this view (post-clip / post-cull), NOT the whole scene. This distinction is
 *   load-bearing (Revisor WU-L4-A): the FAIL (dim) and PASS (hide) states share the SAME camera and the SAME
 *   AABBs — only what is DRAWN differs. Feeding whole-scene AABBs makes dominanceRatio identical across those
 *   renders and it stops discriminating the exact case it exists for. To let a viewer hook expose "all runs +
 *   visibility" instead of pre-filtering, each entry may carry `visible:false` to be EXCLUDED (missing/true =
 *   included). So: pass rendered-only, OR pass all-with-`visible`-flags — never whole-scene with no visibility.
 * @param {number[]} viewProj  column-major 4x4 view-projection (three element order)
 * @param {{gridN?:number, minAreaFrac?:number}} [opts]  grid resolution; min projected frac to count "in frame"
 * @returns {{subjectOccupancy:number, nonSubjectInFrameCount:number, nonSubjectProjectedAreaFrac:number, dominanceRatio:number}}
 */
export function viewComposition(subjectAABB, otherAABBs = [], viewProj, opts = {}) {
  const gridN = opts.gridN ?? 64;
  const minAreaFrac = opts.minAreaFrac ?? 4 / (gridN * gridN);       // ≥ ~4 cells to count as "in frame"
  const total = gridN * gridN;

  const subjBox = projectAabbToNdcBox(viewProj, subjectAABB);
  const subjGrid = new Uint8Array(total); rasterInto(subjGrid, gridN, subjBox);
  const subjCells = countGrid(subjGrid);

  const nonGrid = new Uint8Array(total); let inFrame = 0;
  for (const a of otherAABBs) {
    if (a && a.visible === false) continue;                          // excluded by the render (clipped/culled)
    const b = projectAabbToNdcBox(viewProj, a);
    if (!b) continue;
    if (boxAreaFrac(b) >= minAreaFrac) inFrame++;                    // counts as a visible non-subject object
    rasterInto(nonGrid, gridN, b);                                   // union coverage (overlaps merge)
  }
  const nonCells = countGrid(nonGrid);

  const denom = subjCells + nonCells;
  return {
    subjectOccupancy: subjCells / total,                            // subject screen coverage
    nonSubjectInFrameCount: inFrame,                                // how many other objects are visibly in-frame
    nonSubjectProjectedAreaFrac: nonCells / total,                  // unioned non-subject coverage
    dominanceRatio: denom > 0 ? subjCells / denom : 0,              // subject / (subject + non-subject) — 0 if nothing visible
  };
}

/**
 * Mechanical pre-filter for a FOCUS-declared view (isolate the subject). A view that CANNOT read as
 * subject-focus regardless of color/dim is flagged BEFORE spending a blind reviewer. NECESSARY, not
 * sufficient: passing here does not mean it reads — it means it is not disqualified on composition.
 * τ (tau) and maxNonSubject are NAMED configs, CALIBRATED by measurement (run viewComposition over a known
 * FAIL vs a known PASS and put τ in the valley) — never deduced. Defaults are PROVISIONAL.
 * @param {{dominanceRatio:number, nonSubjectInFrameCount:number}} comp  a viewComposition result
 * @param {{tau?:number, maxNonSubject?:number}} [cfg]
 * @returns {{flag:boolean, reasons:string[], dominanceRatio:number, nonSubjectInFrameCount:number}}
 */
export function focusReadabilityFlag(comp, cfg = {}) {
  const tau = cfg.tau ?? 0.5;                                       // PROVISIONAL — calibrate at the measured valley
  const maxNonSubject = cfg.maxNonSubject ?? Infinity;
  const reasons = [];
  if (comp.dominanceRatio < tau) reasons.push(`dominanceRatio ${comp.dominanceRatio.toFixed(3)} < tau ${tau}`);
  if (comp.nonSubjectInFrameCount > maxNonSubject) reasons.push(`nonSubjectInFrameCount ${comp.nonSubjectInFrameCount} > max ${maxNonSubject}`);
  return { flag: reasons.length > 0, reasons, dominanceRatio: comp.dominanceRatio, nonSubjectInFrameCount: comp.nonSubjectInFrameCount };
}
