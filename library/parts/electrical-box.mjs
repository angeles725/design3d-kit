// library: electrical-box  (parts/electrical-box.mjs)
// source: evaporadora-realista-v2.html:545-600 (electrical block) · FAST-lane design3d pass —
//         guard-rail floor PASS (GR1-GR4) + user approval "se ve mucho mejor" + GR3 drift 0
//         (NOT a P6 blind-review gate; FAST-lane evidence = floor verdicts + user approval).
// what: the parametric ELECTRICAL sub-assembly on an equipment corner — a JUNCTION / CONTROLS BOX
//       with a screwed LID (corner bolts + warning label), CABLE GLANDS on the bottom, a TERMINAL
//       STRIP with screws, a DISCONNECT LEVER, a RIGID CONDUIT (cylinder + elbow), and a FLEXIBLE
//       CONDUIT (ridged sweep = tube core + instanced torus ribs). The controls detail every HVAC
//       unit needs, extracted so the next unit-cooler / AHU / condenser assembles it from params.
// params: box dims (w/h/d), glandCount (cable glands), terminalCount (terminal-strip screws), an
//         optional flex-conduit path, plus injected MATERIALS. Reusable across equipment.
// deps: NONE for the pure core (imports nothing, Node-testable). The async builder loads three via a
//       dynamic import('three') INSIDE the function; it must NEVER add a top-level `import * as THREE`.
// coupling notes: 1 u = 1 m (source). Lid bolts / terminal screws / flex ribs are InstancedMeshes.
//       The box is built centred at the local origin with the lid on +X; the caller positions the
//       returned Group. Materials injected (junction plastics are per-equipment).

// -------- PURE core (imports nothing; Node-testable) -----------------------------------------------

/** Validate a box envelope — all three dims strictly positive. */
export function boxDimsValid({ w, h, d }) {
  return w > 0 && h > 0 && d > 0;
}

/**
 * Lid corner-bolt placements: 4 bolts inset from the lid's H×D rectangle (lid faces +X, so bolts sit
 * on the y/z plane at the given lidX). Returns 4 positions, symmetric in y and z.
 * @param {{height:number, depth:number, lidX:number, inset?:number}} p
 * @returns {{position:number[]}[]}  length 4.
 */
export function lidBolts({ height, depth, lidX, inset = 0.02 }) {
  if (!(height > 0) || !(depth > 0)) throw new RangeError('lidBolts: height/depth must be > 0');
  const ys = [-height / 2 + inset, height / 2 - inset];
  const zs = [-depth / 2 + inset, depth / 2 - inset];
  const out = [];
  for (const y of ys) for (const z of zs) out.push({ position: [lidX, y, z] });
  return out;
}

/**
 * Cable-gland placements along the bottom face: N glands centred and evenly spaced along an axis.
 * @param {{count:number, y:number, spacing:number, axis?:'x'|'z', center?:number}} p
 * @returns {{position:number[]}[]}  length === count, symmetric about `center` on the chosen axis.
 */
export function cableGlands({ count, y, spacing, axis = 'z', center = 0 }) {
  if (!Number.isInteger(count) || count < 0) throw new RangeError(`cableGlands: count must be an integer >= 0 (got ${count})`);
  const out = [];
  const start = center - (count - 1) * spacing / 2;
  for (let i = 0; i < count; i++) {
    const t = start + i * spacing;
    out.push({ position: axis === 'x' ? [t, y, 0] : [0, y, t] });
  }
  return out;
}

/**
 * Terminal-strip screw placements: N screws in a row from `start` along an axis.
 * @param {{count:number, start:number[], spacing:number, axis?:'x'|'y'|'z'}} p
 * @returns {{position:number[]}[]}  length === count.
 */
export function terminalScrews({ count, start, spacing, axis = 'x' }) {
  if (!Number.isInteger(count) || count < 0) throw new RangeError(`terminalScrews: count must be an integer >= 0 (got ${count})`);
  if (!Array.isArray(start) || start.length !== 3) throw new RangeError('terminalScrews: start must be [x,y,z]');
  const ai = { x: 0, y: 1, z: 2 }[axis];
  if (ai === undefined) throw new RangeError(`terminalScrews: axis must be x|y|z (got ${axis})`);
  const out = [];
  for (let i = 0; i < count; i++) { const p = start.slice(); p[ai] += i * spacing; out.push({ position: p }); }
  return out;
}

/**
 * Flexible-conduit rib t-parameters along its centerline: N ribs at evenly spaced t in [0,1] inclusive
 * (endpoints included — the flex sleeve is ridged the whole length).
 * @param {{count:number}} p
 * @returns {number[]}  length === count, first 0, last 1 (for count >= 2).
 */
export function flexRibParams({ count }) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`flexRibParams: count must be an integer >= 1 (got ${count})`);
  if (count === 1) return [0.5];
  const out = new Array(count);
  for (let i = 0; i < count; i++) out[i] = i / (count - 1);
  return out;
}

// -------- async three builder (dynamic three import) -----------------------------------------------

/**
 * Build the electrical sub-assembly as a Group in LOCAL coords (box centred at the origin, lid on +X;
 * the caller positions the returned Group). Junction box + screwed lid + glands + terminal strip +
 * disconnect + rigid + flexible conduit. Materials INJECTED (never a global registry).
 * @param {object} opts
 * @param {{w:number,h:number,d:number}} [opts.box]        box envelope (default 0.11×0.16×0.10).
 * @param {number} [opts.glandCount=3]
 * @param {number} [opts.terminalCount=6]
 * @param {number[][]} [opts.flexPath]                     LOCAL flex-conduit control points; default local sweep.
 * @param {number} [opts.flexRibs=46]
 * @param {{body,lid,bolt,label,lever,conduit,rubber,rib}} opts.materials  injected materials.
 * @returns {Promise<THREE.Group>}
 */
export async function makeElectricalBox({
  box = { w: 0.11, h: 0.16, d: 0.10 }, glandCount = 3, terminalCount = 6, flexPath, flexRibs = 46, materials,
}) {
  const THREE = await import('three');
  const need = ['body', 'lid', 'bolt', 'label', 'lever', 'conduit', 'rubber', 'rib'];
  if (!materials || need.some((k) => !materials[k])) {
    throw new Error(`makeElectricalBox: materials.{${need.join(',')}} are required (inject, never a global registry)`);
  }
  if (!boxDimsValid(box)) throw new RangeError('makeElectricalBox: box.{w,h,d} must be > 0');
  const { w, h, d } = box;
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const instance = (geo, mat, placements, rot, cast = true) => {
    if (!placements.length) return;
    const im = new THREE.InstancedMesh(geo, mat, placements.length);
    im.castShadow = cast;
    placements.forEach((p, i) => { dummy.position.set(...p.position); dummy.rotation.set(...rot); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
    im.instanceMatrix.needsUpdate = true; group.add(im);
  };

  // junction box body + screwed lid on +X
  const boxBody = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials.body);
  boxBody.castShadow = true; boxBody.receiveShadow = true; group.add(boxBody);
  const lidX = w / 2 + 0.008;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.016, h * 0.97, d * 0.98), materials.lid);
  lid.position.set(lidX, 0, 0); group.add(lid);
  const boltGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.004, 6);
  instance(boltGeo, materials.bolt, lidBolts({ height: h, depth: d, lidX: lidX + 0.006 }), [0, 0, Math.PI / 2]);
  // warning label on the lid
  const label = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, w * 0.5), materials.label);
  label.rotation.y = Math.PI / 2; label.position.set(lidX + 0.009, 0.02, 0); group.add(label);

  // disconnect switch: base + orange lever
  const discBase = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.03, 0.03), materials.lid);
  discBase.position.set(lidX + 0.01, -h / 2 + 0.025, 0); group.add(discBase);
  const discLever = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.012), materials.lever);
  discLever.position.set(lidX + 0.027, -h / 2 + 0.025, 0); group.add(discLever);

  // cable glands on the bottom face (+ nuts)
  const glands = cableGlands({ count: glandCount, y: -h / 2 - 0.008, spacing: 0.03, axis: 'z' });
  for (const gpl of glands) {
    const gland = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.02, 8), materials.lid);
    gland.position.set(...gpl.position); group.add(gland);
  }

  // terminal strip + screws (instanced)
  const stripY = h / 2 - 0.03;
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.016), materials.lid);
  strip.position.set(-w / 2 + 0.02, stripY, d / 2 - 0.02); group.add(strip);
  instance(new THREE.CylinderGeometry(0.0025, 0.0025, 0.014, 6), materials.bolt,
    terminalScrews({ count: terminalCount, start: [-w / 2 + 0.005, stripY + 0.008, d / 2 - 0.02], spacing: 0.008, axis: 'x' }), [0, 0, 0]);

  // RIGID conduit: cylinder + quarter-torus elbow dropping off the bottom
  const rigid = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.14, 12), materials.conduit);
  rigid.position.set(-w / 2 + 0.02, -h / 2 - 0.09, -d / 2 + 0.02); rigid.castShadow = true; group.add(rigid);
  const rElbow = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.009, 8, 16, Math.PI / 2), materials.conduit);
  rElbow.rotation.x = Math.PI / 2; rElbow.rotation.z = -Math.PI / 2;
  rElbow.position.set(-w / 2 + 0.02, -h / 2 - 0.16, -d / 2 + 0.02); rElbow.castShadow = true; group.add(rElbow);

  // FLEXIBLE conduit: tube core + instanced torus ribs (ridged sweep reads as flex)
  const V = (p) => new THREE.Vector3(p[0], p[1], p[2]);
  const pts = (flexPath && flexPath.length >= 2 ? flexPath : [
    [w / 2 - 0.02, h / 2 - 0.04, 0], [w / 2 + 0.1, h / 2, -0.1], [w / 2 + 0.05, h / 2 + 0.06, -0.25], [-0.05, h / 2 + 0.02, -0.32],
  ]).map(V);
  const flexCurve = new THREE.CatmullRomCurve3(pts);
  const flexTube = new THREE.Mesh(new THREE.TubeGeometry(flexCurve, 80, 0.011, 10, false), materials.rubber);
  flexTube.castShadow = true; group.add(flexTube);
  const ribGeo = new THREE.TorusGeometry(0.013, 0.0035, 6, 14);
  const ribs = new THREE.InstancedMesh(ribGeo, materials.rib, flexRibs);
  ribs.castShadow = true;
  flexRibParams({ count: flexRibs }).forEach((t, i) => {
    const p = flexCurve.getPointAt(t), tan = flexCurve.getTangentAt(t);
    dummy.position.copy(p); dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan); dummy.updateMatrix();
    ribs.setMatrixAt(i, dummy.matrix);
  });
  ribs.instanceMatrix.needsUpdate = true; group.add(ribs);

  return group;
}
