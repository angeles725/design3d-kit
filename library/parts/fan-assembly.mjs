// library: fan-assembly  (parts/fan-assembly.mjs)
// source: evaporadora-realista-v2.html:341-408 (axial fan block) · FAST-lane design3d pass —
//         guard-rail floor PASS (GR1-GR4) + user approval "se ve mucho mejor" + GR3 drift 0
//         (NOT a P6 blind-review gate; FAST-lane evidence = floor verdicts + user approval).
// what: a parametric AXIAL-FAN sub-assembly — curved (scimitar) axial BLADES with a rotating HUB +
//       nose cap, a flared VENTURI BELL MOUTH, a MOTOR BOSS with a bolt circle, radial support
//       STRUTS across the throat, and a WIRE GUARD (concentric torus rings + radial spokes + boss
//       cap). Richer than `aero-fan-kit` (which is blade+guard only): this adds the venturi throat,
//       motor boss + bolt circle, and struts as one parametric unit for unit-cooler / AHU discharge.
// params: radius (blade tip radius), bladeCount, guardRings, guardSpokes, strutCount, bossBoltCount,
//         plus injected MATERIALS (blade/bladeTip/hub/bell/guard/motor). Reusable across fan Øs.
// deps: NONE for the pure core (imports nothing, Node-testable). The async builder loads three via a
//       dynamic import('three') INSIDE the function; it must NEVER add a top-level `import * as THREE`.
// coupling notes: 1 u = 1 m (source). Returns the Group with userData.spin = the rotor sub-Group so
//       the caller can animate it (`spin.rotation.z += dt·ω`). Blades share one geometry; guard spokes
//       are one InstancedMesh. Materials injected (blades/tips are mutable per unit → per-instance mats).

// -------- PURE core (imports nothing; Node-testable) -----------------------------------------------

/**
 * Even angular placement of N blades about the rotor axis (radians, [0, 2π)).
 * @param {number} count  blade count (integer >= 2).
 * @returns {number[]}  length === count.
 */
export function bladeAngles(count) {
  if (!Number.isInteger(count) || count < 2) throw new RangeError(`bladeAngles: count must be an integer >= 2 (got ${count})`);
  const a = new Array(count);
  for (let i = 0; i < count; i++) a[i] = (i / count) * Math.PI * 2;
  return a;
}

/**
 * The scimitar blade 2D profile as authored control data: a start anchor + quadratic segments
 * {c:controlPoint, p:endPoint}. The three builder replays it into a THREE.Shape; the pure form lets a
 * test assert the profile is a valid (non-degenerate, consistently wound) closed polygon.
 * @returns {{start:number[], quads:{c:number[], p:number[]}[]}}
 */
export function bladeProfile2D() {
  return {
    start: [0.028, -0.018],
    quads: [
      { c: [0.075, -0.055], p: [0.130, -0.030] },
      { c: [0.150, -0.010], p: [0.150, 0.014] },
      { c: [0.120, 0.052], p: [0.070, 0.048] },
      { c: [0.040, 0.040], p: [0.028, 0.020] },
    ],
  };
}

/** Anchor polygon of the blade profile (start + each segment endpoint) for area/winding checks. */
export function bladeAnchors() {
  const { start, quads } = bladeProfile2D();
  return [start, ...quads.map((q) => q.p)];
}

/** Signed area of a closed 2D polygon (shoelace). Sign = winding: >0 CCW, <0 CW. */
export function polygonSignedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/**
 * Wire-guard concentric ring radii, ASCENDING: `ringCount-1` interior rings spread over
 * [0.28, 0.94]·radius plus an outer rim ring at radius+rim.
 * @param {{radius:number, ringCount?:number, rim?:number}} p
 * @returns {number[]}  strictly ascending, length === ringCount, last === radius + rim.
 */
export function guardRingRadii({ radius, ringCount = 5, rim = radius * 0.2 }) {
  if (!(radius > 0)) throw new RangeError(`guardRingRadii: radius must be > 0 (got ${radius})`);
  if (!Number.isInteger(ringCount) || ringCount < 2) throw new RangeError(`guardRingRadii: ringCount must be an integer >= 2 (got ${ringCount})`);
  if (!(rim > 0)) throw new RangeError(`guardRingRadii: rim must be > 0 (got ${rim})`);
  const interior = ringCount - 1;
  const lo = 0.28, hi = 0.94;
  const radii = [];
  for (let i = 0; i < interior; i++) {
    const f = interior === 1 ? hi : lo + (hi - lo) * (i / (interior - 1));
    radii.push(f * radius);
  }
  radii.push(radius + rim);
  return radii;
}

/** Radial guard spoke angles (diameter bars) — count angles over [0, π). */
export function guardSpokeAngles(count) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`guardSpokeAngles: count must be an integer >= 1 (got ${count})`);
  const a = new Array(count);
  for (let i = 0; i < count; i++) a[i] = (i / count) * Math.PI;
  return a;
}

/** Motor support strut angles across the throat — count angles over [0, π). */
export function strutAngles(count) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`strutAngles: count must be an integer >= 1 (got ${count})`);
  const a = new Array(count);
  for (let i = 0; i < count; i++) a[i] = (i / count) * Math.PI;
  return a;
}

/**
 * Bolt-circle placements: N points evenly on a circle of `radius` in the XY plane at depth z,
 * centred at the origin. Sum of positions ≈ (0,0) (symmetric).
 * @param {number} count
 * @param {number} radius
 * @param {number} [z=0]
 * @returns {{position:number[]}[]}
 */
export function boltCircle(count, radius, z = 0) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`boltCircle: count must be an integer >= 1 (got ${count})`);
  if (!(radius > 0)) throw new RangeError(`boltCircle: radius must be > 0 (got ${radius})`);
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    out[i] = { position: [Math.cos(a) * radius, Math.sin(a) * radius, z] };
  }
  return out;
}

// -------- async three builder (dynamic three import) -----------------------------------------------

/**
 * Build the axial-fan sub-assembly as a Group facing +Z (throat at the local origin). Returns the
 * Group; `userData.spin` is the rotor sub-Group (hub + nose cap + blades) for the caller to animate.
 * Guard spokes + motor-boss bolts are InstancedMeshes. Materials INJECTED (never a global registry).
 * @param {object} opts
 * @param {number} opts.radius                 blade-tip radius (fan Ø/2).
 * @param {number} [opts.bladeCount=5]
 * @param {number} [opts.guardRings=5]
 * @param {number} [opts.guardSpokes=10]
 * @param {number} [opts.strutCount=3]
 * @param {number} [opts.bossBoltCount=6]
 * @param {{blade,bladeTip,hub,bell,guard,motor}} opts.materials  injected materials.
 * @returns {Promise<THREE.Group>}
 */
export async function makeFanAssembly({
  radius, bladeCount = 5, guardRings = 5, guardSpokes = 10, strutCount = 3, bossBoltCount = 6, materials,
}) {
  const THREE = await import('three');
  const need = ['blade', 'bladeTip', 'hub', 'bell', 'guard', 'motor'];
  if (!materials || need.some((k) => !materials[k])) {
    throw new Error(`makeFanAssembly: materials.{${need.join(',')}} are required (inject, never a global registry)`);
  }
  const R = radius;
  const g = new THREE.Group();
  const dummy = new THREE.Object3D();

  // flared venturi bell mouth (open cone)
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.055, R + 0.02, 0.07, 44, 1, true), materials.bell);
  bell.rotation.x = Math.PI / 2; bell.position.z = 0.005; bell.castShadow = true; g.add(bell);
  // orange venturi rim ring at the mouth
  const rimRing = new THREE.Mesh(new THREE.TorusGeometry(R + 0.055, 0.006, 8, 48), materials.bladeTip);
  rimRing.position.z = 0.04; g.add(rimRing);

  // motor boss + bolt circle behind the rotor
  const motorBoss = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.06, 20), materials.motor);
  motorBoss.rotation.x = Math.PI / 2; motorBoss.position.z = -0.03; motorBoss.castShadow = true; g.add(motorBoss);
  const bossPlacements = boltCircle(bossBoltCount, 0.04, -0.002);
  const bossBoltGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.006, 6);
  const bossBolts = new THREE.InstancedMesh(bossBoltGeo, materials.guard, bossBoltCount);
  bossBolts.castShadow = true;
  bossPlacements.forEach((b, i) => {
    dummy.position.set(...b.position); dummy.rotation.set(Math.PI / 2, 0, 0); dummy.updateMatrix();
    bossBolts.setMatrixAt(i, dummy.matrix);
  });
  bossBolts.instanceMatrix.needsUpdate = true; g.add(bossBolts);

  // motor support struts across the throat
  for (const a of strutAngles(strutCount)) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.012, (R + 0.02) * 2, 0.008), materials.guard);
    strut.rotation.z = a; strut.position.z = -0.01; g.add(strut);
  }

  // rotor: hub + nose cap + curved blades with tips (the animatable sub-group)
  const spin = new THREE.Group(); g.add(spin);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.055, 20), materials.hub);
  hub.rotation.x = Math.PI / 2; hub.position.z = 0.01; spin.add(hub);
  const noseCap = new THREE.Mesh(new THREE.SphereGeometry(0.033, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), materials.hub);
  noseCap.rotation.x = -Math.PI / 2; noseCap.position.z = 0.037; spin.add(noseCap);
  // one shared blade geometry from the pure profile
  const { start, quads } = bladeProfile2D();
  const shape = new THREE.Shape();
  shape.moveTo(start[0], start[1]);
  for (const q of quads) shape.quadraticCurveTo(q.c[0], q.c[1], q.p[0], q.p[1]);
  shape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.004, bevelThickness: 0.004, steps: 1 });
  bladeGeo.translate(0, 0, -0.003);
  const bladeTipGeo = new THREE.BoxGeometry(0.022, 0.03, 0.01);
  // index blades about rotation.z (the blade normal while flat) — LEARNINGS 2026-08-16 Euler-order rule
  for (const a of bladeAngles(bladeCount)) {
    const arm = new THREE.Group(); arm.rotation.z = a; spin.add(arm);
    const blade = new THREE.Mesh(bladeGeo, materials.blade);
    blade.rotation.x = 0.42; blade.castShadow = true; arm.add(blade);
    const tip = new THREE.Mesh(bladeTipGeo, materials.bladeTip);
    tip.position.set(0.145, 0.006, 0.004); tip.rotation.x = 0.42; arm.add(tip);
  }

  // wire guard: concentric rings + radial spokes + boss cap, proud of the blades
  const guard = new THREE.Group(); guard.position.z = 0.05; g.add(guard);
  for (const rr of guardRingRadii({ radius: R, ringCount: guardRings })) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.0042, 6, 48), materials.guard);
    ring.castShadow = true; guard.add(ring);
  }
  const spokeAngles = guardSpokeAngles(guardSpokes);
  const spokeGeo = new THREE.CylinderGeometry(0.0042, 0.0042, (R + 0.03) * 2, 6);
  const spokes = new THREE.InstancedMesh(spokeGeo, materials.guard, guardSpokes);
  spokes.castShadow = true;
  spokeAngles.forEach((a, i) => { dummy.position.set(0, 0, 0); dummy.rotation.set(0, 0, a); dummy.updateMatrix(); spokes.setMatrixAt(i, dummy.matrix); });
  spokes.instanceMatrix.needsUpdate = true; guard.add(spokes);
  const gcap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 12), materials.guard);
  gcap.rotation.x = Math.PI / 2; guard.add(gcap);

  g.userData.spin = spin;
  return g;
}
