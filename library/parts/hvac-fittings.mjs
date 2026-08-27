// library: hvac-fittings  (parts/hvac-fittings.mjs)
// source: design3d numerical-methods pass · distilled from the investigacion.md audit (2026-08-26):
//         the doc's #1 geometric requirement is that HVAC elbows are EXACT constant-radius arcs
//         (centerline on x²+y²=R²), not spline "melted pipe". The kit's rmf-frames/makeSweptTube
//         sweeps a Catmull-Rom (spline) centerline and STRUCTURALLY cannot emit a constant-radius
//         arc, so this is the one real geometry gap the audit found.
// what: exact-arc HVAC fittings — a torus-section ELBOW whose centerline lies exactly on a circle of
//       the specified bend radius, a truncated-cone REDUCER, and a proxy TEE/LATERAL (two legs meeting
//       at a junction). Ports carry position + direction so a pipe-run can connect without guessing.
// deps: NONE for the pure core (imports nothing, Node-testable). The async builders load three via a
//       dynamic `import('three')` INSIDE the function so the pure core stays Node-importable — same
//       pattern as rmf-frames/makeSweptTube. Builders may top-level import the pure `adaptive-segments`
//       module (it imports nothing); they must NEVER add a top-level `import * as THREE`.
//
// WHY A TORUS SECTION IS THE EXACT ELBOW. A real HVAC/piping elbow is a bend of CONSTANT radius R
// (e.g. a DN150 long-radius 90° elbow, R = 1.5·D). Its centerline is a circular ARC: every point sits
// exactly on x²+y²=R². three.js core `TorusGeometry(R, r, radialSeg, tubularSeg, arc)` places its tube
// centerline at (R·cos u, R·sin u, 0) for u in [0, arc] — i.e. exactly on that circle at every ring,
// with NO new dependency (the kit's `gooseneck-spout` already exploits arc-swept TorusGeometry). A
// spline sweep (rmf-frames) only APPROXIMATES the arc and drifts off the constant radius — the "melted
// pipe" the source doc warns against. Use this module for any fitting whose spec is a fixed bend
// radius; use rmf-frames/makeSweptTube only for a free-form hose/cable with varying curvature.
//
// FRAME CONVENTION. The pure centerline is authored in the XY plane with the bend centre at the origin,
// matching three's TorusGeometry (which lies in XY and sweeps `arc` about +Z from angle 0). The caller
// positions/orients the returned mesh; the exact-arc invariant is a property of the LOCAL geometry.
//
// TEE CUT-INS. `makeTee` returns a PROXY tee (two intersecting cylinders) — correct for a blockout or a
// welded-saddle read. For a true fabricated cut-in (branch bore removed from the run wall) hand the run
// and branch meshes to three-bvh-csg SUBTRACTION at BUILD TIME (kit [block46] rule: prismatic →
// 2D-union+extrude, oblique/curved → mesh CSG), then bake the result. Never boolean at render time.

// Pure adaptive-segment helpers (that module imports nothing, so a top-level import here does NOT pull
// three.js into this file's import graph). Used only by the async builders below.
import { radialSegmentsFor, lengthSegmentsFor } from './adaptive-segments.mjs';

// -------- PURE core (imports nothing; Node-testable) -----------------------------------------------

/**
 * Sample the EXACT elbow centerline: n+1 points on the arc of radius `bendRadius`, bend centre at the
 * origin, in the XY plane, from angle 0 to `arcAngle`. Every returned point satisfies x²+y²=bendRadius²
 * (to float precision) — that invariant is the whole point of this module.
 * @param {number} bendRadius   centerline bend radius R (caller units); the constant the elbow holds.
 * @param {number} arcAngle     swept angle in radians (Math.PI/2 = 90°, Math.PI/4 = 45°).
 * @param {number} n            number of segments along the arc (returns n+1 points). Must be >= 1.
 * @returns {{x:number,y:number,z:number}[]}  n+1 centerline samples on x²+y²=R².
 */
export function elbowCenterline(bendRadius, arcAngle, n) {
  if (!(bendRadius > 0) || !(arcAngle > 0) || !Number.isInteger(n) || n < 1) {
    throw new RangeError('elbowCenterline: bendRadius>0, arcAngle>0, integer n>=1 required');
  }
  const pts = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const u = (arcAngle * i) / n;
    pts[i] = { x: bendRadius * Math.cos(u), y: bendRadius * Math.sin(u), z: 0 };
  }
  return pts;
}

/**
 * The two ports of an elbow: each a centerline endpoint + a UNIT direction pointing OUT of the fitting
 * along the bore axis (the tangent to the arc, negated at the start so both point away from the elbow).
 * A pipe-run connects to `position` and leaves along `direction`.
 * @param {number} bendRadius
 * @param {number} arcAngle
 * @returns {{start:{position:{x,y,z},direction:{x,y,z}}, end:{position:{x,y,z},direction:{x,y,z}}}}
 */
export function elbowPortFrames(bendRadius, arcAngle) {
  if (!(bendRadius > 0) || !(arcAngle > 0)) {
    throw new RangeError('elbowPortFrames: bendRadius>0 and arcAngle>0 required');
  }
  // Tangent to the circle (R cos u, R sin u, 0) is (-sin u, cos u, 0). Start port points back along -tangent(0).
  const start = {
    position: { x: bendRadius, y: 0, z: 0 },
    direction: { x: 0, y: -1, z: 0 }, // -tangent(0) = -(0,1,0)
  };
  const end = {
    position: { x: bendRadius * Math.cos(arcAngle), y: bendRadius * Math.sin(arcAngle), z: 0 },
    direction: { x: -Math.sin(arcAngle), y: Math.cos(arcAngle), z: 0 }, // +tangent(arcAngle)
  };
  return { start, end };
}

/**
 * Validate a concentric reducer's dimensions. A reducer is a truncated cone between two bore radii over
 * a transition length; both radii and the length must be positive. r1==r2 is allowed (degenerate = a
 * plain spool) but flagged via `isTaper`.
 * @param {number} r1      large-end radius.
 * @param {number} r2      small-end radius.
 * @param {number} length  transition length.
 * @returns {{valid:boolean, isTaper:boolean}}
 */
export function reducerProfile(r1, r2, length) {
  const valid = r1 > 0 && r2 > 0 && length > 0;
  return { valid, isTaper: valid && r1 !== r2 };
}

// Segment-pick helper: an explicit valid integer override wins; else the adaptive count; else fallback.
// (Same contract as pipe-run: an invalid 0/negative/NaN override falls back, never builds degenerate.)
const pickSeg = (override, adaptive, fallback, min) =>
  (Number.isInteger(override) && override >= min) ? override : (adaptive ?? fallback);

// -- tiny inline vec helpers for elbowPlacement (operate on [x,y,z]; import nothing) --------------
const _sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const _add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const _scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const _cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const _len = (a) => Math.hypot(a[0], a[1], a[2]);
const _norm = (a) => { const l = _len(a); if (!(l > 0)) return [0, 0, 0]; return [a[0] / l, a[1] / l, a[2] / l]; };
const _arr = (u) => Array.isArray(u) ? u : [u.x, u.y, u.z]; // accept [x,y,z] OR a Vector3-like {x,y,z}

/**
 * PURE placement math for dropping an exact-arc elbow at a router bend (Node-testable, zero-import).
 * Proven end-to-end (creador1 full route→fittings→clash PoC, 2026-08-26): placed-mesh port positions AND
 * port directions matched to ≤2.8e-16. The elbow does NOT sit on the bend corner — it sits back by the
 * tangent SETBACK T=R·tan(θ/2), and the two straight runs must SHORTEN by T at the bent end.
 *
 * Frame contract — `makeElbow` (TorusGeometry) local frame is: start-travel +Y, bend-plane normal +Z,
 * start-radial +X. The returned {localX, normal} + the (normalized) inDir feed a three
 * `Matrix4.makeBasis(localX, inDir, normal)` → quaternion that orients the elbow so start-outward = −inDir
 * and end-outward = +outDir (exactly what the adjoining straights need).
 *
 * @param {{position:number[], inDir:(number[]|{x,y,z}), outDir:(number[]|{x,y,z}), turnAngle:number}} bend
 *        Router bend: world corner `position`, `inDir`/`outDir` (accepts [x,y,z] OR Vector3-like), and
 *        `turnAngle` in DEGREES (duct-router contract: turnAngle = acos(inDir·outDir)·180/π).
 * @param {number} bendRadius  centerline bend radius R (e.g. 1.5·D for a long-radius elbow).
 * @returns {{arcAngle:number, setback:number, startTangent:number[], endTangent:number[],
 *            origin:number[], localX:number[], normal:number[]}}
 *        arcAngle (rad, → makeElbow) · setback T (shorten straights by this at the bent end) ·
 *        startTangent/endTangent (world tangent points = the elbow's two ports) · origin (elbow
 *        local-origin world position) · localX + normal (→ three Matrix4.makeBasis(localX, inDirUnit, normal)).
 */
export function elbowPlacement(bend, bendRadius) {
  if (!(bendRadius > 0)) throw new RangeError('elbowPlacement: bendRadius>0 required');
  const P = _arr(bend.position), iD = _norm(_arr(bend.inDir)), oD = _norm(_arr(bend.outDir));
  const theta = (bend.turnAngle * Math.PI) / 180;
  const T = bendRadius * Math.tan(theta / 2);       // tangent setback from the corner
  const n = _norm(_cross(iD, oD));                  // turn-plane normal (CCW iD→oD)
  const eX = _cross(iD, n);                          // world image of the elbow's local +X (unit)
  const A = _sub(P, _scale(iD, T));                 // entry tangent point == elbow START port
  const B = _add(P, _scale(oD, T));                 // exit tangent point  == elbow END port
  const origin = _sub(A, _scale(eX, bendRadius));   // local origin so local (R,0,0) maps to A
  return { arcAngle: theta, setback: T, startTangent: A, endTangent: B, origin, localX: eX, normal: n };
}

// -------- async three builders (dynamic three import) ----------------------------------------------

/**
 * Build an EXACT-arc elbow as a single Mesh via TorusGeometry (centerline exactly on x²+y²=bendRadius²).
 * Bend centre at the local origin, in XY, swept from angle 0 to `arcAngle` about +Z. The caller injects
 * the material and positions/orients the mesh (e.g. align its start port to an upstream pipe).
 * @param {object} opts
 * @param {number} opts.bendRadius              constant centerline bend radius (caller units).
 * @param {number} opts.pipeRadius              tube (bore) radius.
 * @param {number} [opts.arcAngle=Math.PI/2]    swept angle (default 90°).
 * @param {number} [opts.targetEdgeLength]      when set, radial + tubular counts derive from it.
 * @param {number} [opts.radialSegments]        explicit tube-cross-section count override.
 * @param {number} [opts.tubularSegments]       explicit along-arc count override.
 * @param {THREE.Material} opts.material        injected material.
 * @returns {Promise<THREE.Mesh>}  a shadow-casting Mesh the caller parents.
 */
export async function makeElbow({
  bendRadius, pipeRadius, arcAngle = Math.PI / 2, targetEdgeLength,
  radialSegments, tubularSegments, material,
}) {
  const THREE = await import('three');
  // radial = roundness of the pipe cross-section; tubular = smoothness along the arc (arc length = R·θ).
  const radSeg = pickSeg(radialSegments, radialSegmentsFor(pipeRadius, targetEdgeLength), 12, 3);
  const tubSeg = pickSeg(tubularSegments, lengthSegmentsFor(bendRadius * arcAngle, targetEdgeLength), 16, 2);
  const geo = new THREE.TorusGeometry(bendRadius, pipeRadius, radSeg, tubSeg, arcAngle);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  return mesh;
}

/**
 * Build an exact-arc elbow ALREADY PLACED + ORIENTED at a router bend — the router→fittings bridge.
 * Consumes a duct-router bend {position, inDir, outDir, turnAngle(deg)} and returns a Mesh whose start
 * port sits on the entry tangent point pointing back along −inDir and whose end port sits on the exit
 * tangent point pointing along +outDir. Positions/orients via `elbowPlacement` (proven to ≤2.8e-16).
 *
 * SEAM NOTE (documented, cost us a real bug in the PoC): the duct-router emits inDir/outDir/position as
 * plain number[] arrays; three wants Vector3. This function wraps at the boundary (accepts either), and
 * the STRAIGHT segments the caller builds between bends MUST be shortened by `mesh.userData.setback` (T)
 * at each bent end (`start' = corner + segDir·T`, `end' = corner − segDir·T`) — the elbow sits back from
 * the corner by T, it does not sit on it. Build straights as plain axis-aligned cylinders (NOT a spline,
 * NOT createPipeRun's sphere-jointed run). The elbow↔straight weld overlap is expected `allowedContact`.
 * @param {{position:(number[]|{x,y,z}), inDir:(number[]|{x,y,z}), outDir:(number[]|{x,y,z}), turnAngle:number}} bend
 * @param {object} opts
 * @param {number} opts.pipeRadius              tube (bore) radius.
 * @param {number} opts.bendRadius              centerline bend radius R (e.g. 1.5·D).
 * @param {number} [opts.targetEdgeLength]      adaptive tessellation.
 * @param {number} [opts.radialSegments]        explicit override.
 * @param {number} [opts.tubularSegments]       explicit override.
 * @param {THREE.Material} opts.material        injected material.
 * @returns {Promise<THREE.Mesh>}  placed+oriented elbow; `userData.ports={start,end}` (world tangent
 *          points), `userData.setback=T` (shorten adjoining straights by this).
 */
export async function elbowAtBend(bend, { pipeRadius, bendRadius, targetEdgeLength, radialSegments, tubularSegments, material }) {
  const THREE = await import('three');
  const pl = elbowPlacement(bend, bendRadius);
  const v = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const iD = v(_norm(_arr(bend.inDir)));
  const m = new THREE.Matrix4().makeBasis(v(pl.localX), iD, v(pl.normal));
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  const elbow = await makeElbow({ bendRadius, pipeRadius, arcAngle: pl.arcAngle, targetEdgeLength, radialSegments, tubularSegments, material });
  elbow.position.set(pl.origin[0], pl.origin[1], pl.origin[2]);
  elbow.quaternion.copy(q);
  elbow.userData.ports = { start: pl.startTangent.slice(), end: pl.endTangent.slice() };
  elbow.userData.setback = pl.setback;
  return elbow;
}

/**
 * Build a concentric reducer (truncated cone) as a single Mesh along the local Y axis: large end (r1)
 * at y=-length/2, small end (r2) at y=+length/2. CylinderGeometry(top=r2, bottom=r1, length).
 * @param {object} opts
 * @param {number} opts.r1                      large-end (bottom) radius.
 * @param {number} opts.r2                      small-end (top) radius.
 * @param {number} opts.length                  transition length.
 * @param {number} [opts.targetEdgeLength]      when set, radial count derives from the larger radius.
 * @param {number} [opts.radialSegments]        explicit override.
 * @param {THREE.Material} opts.material        injected material.
 * @returns {Promise<THREE.Mesh>}
 */
export async function makeReducer({ r1, r2, length, targetEdgeLength, radialSegments, material }) {
  const THREE = await import('three');
  const radSeg = pickSeg(radialSegments, radialSegmentsFor(Math.max(r1, r2), targetEdgeLength), 16, 3);
  const geo = new THREE.CylinderGeometry(r2, r1, length, radSeg, 1, true); // open ends; caller caps if needed
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  return mesh;
}

/**
 * Build a PROXY tee/lateral as a Group: a run cylinder along the local X axis and a branch cylinder
 * leaving the run centre at `branchAngle` from +X (Math.PI/2 = a true tee). This is the blockout/saddle
 * read; for a fabricated cut-in bore, three-bvh-csg SUBTRACT the branch bore from the run at build time
 * (see the header note + [block46]). Returns the Group; the caller parents it.
 * @param {object} opts
 * @param {number} opts.runRadius               run pipe radius.
 * @param {number} opts.branchRadius            branch pipe radius (<= runRadius for a reducing tee).
 * @param {number} [opts.runLength]             run length (default runRadius*8).
 * @param {number} [opts.branchLength]          branch length from the run centre (default runRadius*4).
 * @param {number} [opts.branchAngle=Math.PI/2] branch angle from +X (90° = tee, else a lateral/wye).
 * @param {number} [opts.targetEdgeLength]
 * @param {number} [opts.radialSegments]        explicit override applied to both legs.
 * @param {THREE.Material} opts.material        injected material (shared across both legs).
 * @returns {Promise<THREE.Group>}
 */
export async function makeTee({
  runRadius, branchRadius, runLength = runRadius * 8, branchLength = runRadius * 4,
  branchAngle = Math.PI / 2, targetEdgeLength, radialSegments, material,
}) {
  const THREE = await import('three');
  const runSeg = pickSeg(radialSegments, radialSegmentsFor(runRadius, targetEdgeLength), 16, 3);
  const brSeg = pickSeg(radialSegments, radialSegmentsFor(branchRadius, targetEdgeLength), 16, 3);
  const group = new THREE.Group();

  const run = new THREE.Mesh(new THREE.CylinderGeometry(runRadius, runRadius, runLength, runSeg), material);
  run.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)); // Y->X
  run.castShadow = true;
  group.add(run);

  // Branch leaves the run centre; its mid sits half its length out along the branch direction.
  const dir = new THREE.Vector3(Math.cos(branchAngle), Math.sin(branchAngle), 0).normalize();
  const branch = new THREE.Mesh(new THREE.CylinderGeometry(branchRadius, branchRadius, branchLength, brSeg), material);
  branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  branch.position.copy(dir.clone().multiplyScalar(branchLength / 2));
  branch.castShadow = true;
  group.add(branch);

  return group;
}
