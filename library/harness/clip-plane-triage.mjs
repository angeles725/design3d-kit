// library: clip-plane-triage  (harness/clip-plane-triage.mjs) — WU-L4-B cap work-list (investigador3, v1.19).
// source: Revisor's COB-IM2 WU-L4-B/B1. system-3d's bay clip is a RENDER clipping plane — it discards
//         fragments, it does NOT cut geometry, so the fused solid stays whole and a clip cut is invisible to
//         topology. Revisor also proved (WU-L4-B1, byte-identical pre/post render, AE=0 on GPU and
//         SwiftShader) that a STENCIL cap is invisible to the render too — so neither a topology gate nor the
//         visual gate can certify a stencil cap. The GATEABLE fix is a GEOMETRY cap (a real cap face on the
//         clip plane): checkFusedMeshClosed (open-edge-cap) then goes open->closed when a real cap lands — a
//         true geometry-delta signal. This module produces the WORK-LIST for that: the runs whose centerline
//         the clip plane crosses = the ends that need a geometric cap. It is PURE TRIAGE — it makes NO
//         topology-open and NO render claim; the render stays the sole authority for the visual see-through.
// what: clipPlaneTriage(runs, plane, opts) → { crossing:[ids], ... }. REPORTS-ONLY, deterministic.
// deps: NONE. Coordinates MUST be in the SAME frame as the plane (apply the 14A/14B/14C sheet offsets first,
//       or a run and the plane false-disagree by tens of metres).

const AXIS = { x: 0, y: 1, z: 2 };

/**
 * Signed distance from a point to a plane. Axis-aligned `{axis:'x'|'y'|'z', value}` (the common case —
 * Revisor's planes are x=+7.072 and x=−4.991) or a general `{normal:[nx,ny,nz], constant}`.
 * @param {number[]} point  [x,y,z] (a missing component is treated as 0).
 * @param {{axis?:'x'|'y'|'z', value?:number, normal?:number[], constant?:number}} plane
 * @returns {number} signed distance (units of the coordinates).
 */
export function signedDistanceToPlane(point, plane) {
  if (plane.axis != null) return (point[AXIS[plane.axis]] ?? 0) - plane.value;
  const [nx, ny, nz] = plane.normal;
  const l = Math.hypot(nx, ny, nz) || 1;
  return (nx * (point[0] ?? 0) + ny * (point[1] ?? 0) + nz * (point[2] ?? 0) - plane.constant) / l;
}

/**
 * Which runs a clip plane crosses — the WU-L4-B geometric-cap work-list. A run is CUT when its centerline
 * segment (p0→p1) straddles the plane (the signed-distance interval of its two endpoints contains 0 within
 * tol), or — with `useBbox` — when its axis-aligned bbox spans the plane. REPORTS-ONLY: it names the ends to
 * cap / pixel-check, it does NOT claim the mesh is open there (it isn't — the clip is render-time) and it
 * does NOT verify a cap (that is checkFusedMeshClosed's geometry-delta job).
 * @param {{id:string|number, p0?:number[], p1?:number[], bbox?:{min:number[],max:number[]}}[]} runs
 * @param {{axis?:'x'|'y'|'z', value?:number, normal?:number[], constant?:number}} plane
 * @param {{tol?:number, useBbox?:boolean}} [opts]  tol default 1e-6; useBbox uses bbox-span instead of centerline.
 * @returns {{plane:object, crossing:(string|number)[], count:number, method:'centerline'|'bbox', tol:number}}
 */
export function clipPlaneTriage(runs, plane, opts = {}) {
  const tol = opts.tol ?? 1e-6;
  const useBbox = opts.useBbox ?? false;
  const crossing = [];
  for (const r of runs || []) {
    let cut = false;
    if (useBbox && r.bbox) {
      // signed distances of the 8 bbox corners; the box straddles the plane iff their interval contains 0.
      const { min, max } = r.bbox;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < 8; i++) {
        const c = [(i & 1) ? max[0] : min[0], (i & 2) ? max[1] : min[1], (i & 4) ? max[2] : min[2]];
        const s = signedDistanceToPlane(c, plane);
        if (s < lo) lo = s;
        if (s > hi) hi = s;
      }
      cut = lo <= tol && hi >= -tol;
    } else if (r.p0 && r.p1) {
      const s0 = signedDistanceToPlane(r.p0, plane), s1 = signedDistanceToPlane(r.p1, plane);
      const lo = Math.min(s0, s1), hi = Math.max(s0, s1);
      cut = lo <= tol && hi >= -tol; // the centerline's signed-distance interval contains 0 (straddles the plane)
    }
    if (cut) crossing.push(r.id);
  }
  crossing.sort((a, b) => (typeof a === 'number' && typeof b === 'number') ? a - b : String(a).localeCompare(String(b)));
  return { plane, crossing, count: crossing.length, method: useBbox ? 'bbox' : 'centerline', tol };
}
