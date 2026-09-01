// library: fastener-kit  (parts/fastener-kit.mjs)
// source: evaporadora-realista-v2.html:234-307 (InstancedBatch + bolt/rivet patterns) · FAST-lane
//         design3d pass — guard-rail floor PASS (GR1-GR4) + user approval "se ve mucho mejor" +
//         GR3 drift 0 (NOT a P6 blind-review gate; FAST-lane evidence = floor verdicts + user approval).
// what: the parametric FASTENER helpers every sheet-metal HVAC unit needs — PURE placement generators
//       (bolt circles, rectangular corner sets, evenly-spaced rivet lines, grids) plus the three
//       builders that ring one InstancedMesh per (geometry, material). The "hex bolts everywhere +
//       rivet seams" detail, extracted so panels, flanges, tube sheets and lids stop re-authoring it.
// params: pattern (which generator) + count/size/spacing, plus injected MATERIAL. Reusable everywhere.
// deps: NONE for the pure core (imports nothing, Node-testable). The async builders load three via a
//       dynamic import('three') INSIDE the function; they must NEVER add a top-level `import * as THREE`.
// coupling notes: 1 u = 1 m (source). One InstancedMesh per fastener kind — a whole panel's bolt heads
//       are ONE draw. Material injected. Rotations are per-placement so a bolt axis can face any way.

// -------- PURE core (imports nothing; Node-testable) -----------------------------------------------

/** Validate a hex-bolt gauge — head radius and height strictly positive. */
export function hexBoltDims({ headRadius, height }) {
  return headRadius > 0 && height > 0;
}

/**
 * Bolt-circle placements: N points evenly on a circle of `radius`, centred at `center`, in the plane
 * named by `plane` ('xy'|'xz'|'yz'). Sum of positions ≈ center (symmetric) for the off-plane-free axes.
 * @param {{count:number, radius:number, center?:number[], plane?:'xy'|'xz'|'yz'}} p
 * @returns {{position:number[]}[]}  length === count.
 */
export function boltCircle({ count, radius, center = [0, 0, 0], plane = 'xy' }) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`boltCircle: count must be an integer >= 1 (got ${count})`);
  if (!(radius > 0)) throw new RangeError(`boltCircle: radius must be > 0 (got ${radius})`);
  const [cx, cy, cz] = center;
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2, u = Math.cos(a) * radius, v = Math.sin(a) * radius;
    let pos;
    if (plane === 'xy') pos = [cx + u, cy + v, cz];
    else if (plane === 'xz') pos = [cx + u, cy, cz + v];
    else if (plane === 'yz') pos = [cx, cy + u, cz + v];
    else throw new RangeError(`boltCircle: plane must be xy|xz|yz (got ${plane})`);
    out[i] = { position: pos };
  }
  return out;
}

/**
 * Four corner-bolt placements inset from a rectangle on a plane at fixed `depth` along the plane
 * normal. `min`/`max` are the rectangle's two in-plane extents [a,b]; `plane` names the constant axis.
 * @param {{min:number[], max:number[], depth:number, inset?:number, plane?:'xy'|'xz'|'yz'}} p
 * @returns {{position:number[]}[]}  length 4.
 */
export function cornerBolts({ min, max, depth, inset = 0, plane = 'xy' }) {
  if (!Array.isArray(min) || min.length !== 2 || !Array.isArray(max) || max.length !== 2) {
    throw new RangeError('cornerBolts: min/max must be [a,b] in-plane extents');
  }
  const as = [min[0] + inset, max[0] - inset];
  const bs = [min[1] + inset, max[1] - inset];
  const out = [];
  for (const a of as) for (const b of bs) {
    let pos;
    if (plane === 'xy') pos = [a, b, depth];
    else if (plane === 'xz') pos = [a, depth, b];
    else if (plane === 'yz') pos = [depth, a, b];
    else throw new RangeError(`cornerBolts: plane must be xy|xz|yz (got ${plane})`);
    out.push({ position: pos });
  }
  return out;
}

/**
 * Evenly-spaced rivet-line placements between two endpoints (inclusive). N=1 returns the midpoint.
 * @param {{a:number[], b:number[], count:number}} p
 * @returns {{position:number[]}[]}  length === count; first ≈ a, last ≈ b for count >= 2.
 */
export function rivetLine({ a, b, count }) {
  if (!Array.isArray(a) || a.length !== 3 || !Array.isArray(b) || b.length !== 3) throw new RangeError('rivetLine: a/b must be [x,y,z]');
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`rivetLine: count must be an integer >= 1 (got ${count})`);
  if (count === 1) return [{ position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] }];
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    out[i] = { position: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] };
  }
  return out;
}

/**
 * Rectangular grid of placements: nx×nz points from `origin` stepping by dx/dz, at fixed height y.
 * @param {{origin:number[], nx:number, nz:number, dx:number, dz:number, y?:number}} p
 * @returns {{position:number[]}[]}  length === nx*nz.
 */
export function gridPattern({ origin, nx, nz, dx, dz, y }) {
  if (!Array.isArray(origin) || origin.length !== 3) throw new RangeError('gridPattern: origin must be [x,y,z]');
  if (!Number.isInteger(nx) || nx < 1 || !Number.isInteger(nz) || nz < 1) throw new RangeError('gridPattern: nx/nz must be integers >= 1');
  const yy = y ?? origin[1];
  const out = [];
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) out.push({ position: [origin[0] + i * dx, yy, origin[2] + k * dz] });
  return out;
}

// -------- async three builders (dynamic three import) ----------------------------------------------

/**
 * Emit ONE InstancedMesh for a set of placements. Each placement may carry a per-instance `rotation`
 * ([x,y,z] Euler); a shared `rotation` opt applies to all when a placement omits its own. Material
 * INJECTED. Returns the InstancedMesh (caller parents it — never scene.add inside).
 * @param {object} opts
 * @param {THREE.BufferGeometry} opts.geometry
 * @param {THREE.Material} opts.material
 * @param {{position:number[], rotation?:number[]}[]} opts.placements
 * @param {number[]} [opts.rotation=[0,0,0]]  default Euler applied when a placement has none.
 * @param {boolean} [opts.castShadow=true]
 * @returns {Promise<THREE.InstancedMesh|null>}  null when placements is empty.
 */
export async function instanceFasteners({ geometry, material, placements, rotation = [0, 0, 0], castShadow = true }) {
  const THREE = await import('three');
  if (!geometry || !material) throw new Error('instanceFasteners: geometry and material are required (inject)');
  if (!placements || !placements.length) return null;
  const im = new THREE.InstancedMesh(geometry, material, placements.length);
  im.castShadow = castShadow; im.receiveShadow = false;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < placements.length; i++) {
    const r = placements[i].rotation || rotation;
    dummy.position.set(...placements[i].position); dummy.rotation.set(r[0], r[1], r[2]); dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
  }
  im.instanceMatrix.needsUpdate = true;
  return im;
}

/**
 * Convenience: build a hex-bolt-head InstancedMesh for the given placements.
 * @param {object} opts
 * @param {{position:number[], rotation?:number[]}[]} opts.placements
 * @param {number} [opts.headRadius=0.007]
 * @param {number} [opts.height=0.006]
 * @param {number[]} [opts.rotation=[0,0,0]]
 * @param {THREE.Material} opts.material
 * @returns {Promise<THREE.InstancedMesh|null>}
 */
export async function makeHexBolts({ placements, headRadius = 0.007, height = 0.006, rotation = [0, 0, 0], material }) {
  const THREE = await import('three');
  if (!hexBoltDims({ headRadius, height })) throw new RangeError('makeHexBolts: headRadius/height must be > 0');
  const geo = new THREE.CylinderGeometry(headRadius, headRadius, height, 6);
  return instanceFasteners({ geometry: geo, material, placements, rotation });
}

/**
 * Convenience: build a rivet-dome InstancedMesh (half-sphere) for the given placements.
 * @param {object} opts
 * @param {{position:number[], rotation?:number[]}[]} opts.placements
 * @param {number} [opts.radius=0.0035]
 * @param {number[]} [opts.rotation=[0,0,0]]
 * @param {THREE.Material} opts.material
 * @returns {Promise<THREE.InstancedMesh|null>}
 */
export async function makeRivets({ placements, radius = 0.0035, rotation = [0, 0, 0], material }) {
  const THREE = await import('three');
  if (!(radius > 0)) throw new RangeError('makeRivets: radius must be > 0');
  const geo = new THREE.SphereGeometry(radius, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  return instanceFasteners({ geometry: geo, material, placements, rotation, castShadow: false });
}
