// library: refrig-cluster  (parts/refrig-cluster.mjs)
// source: evaporadora-realista-v2.html:453-543 (refrigeration detail block) · FAST-lane design3d pass —
//         guard-rail floor PASS (GR1-GR4) + user approval "se ve mucho mejor" + GR3 drift 0
//         (NOT a P6 blind-review gate; FAST-lane evidence = floor verdicts + user approval).
// what: the parametric REFRIGERATION-CLUSTER sub-assembly that sits on a coil header — a TXV /
//       expansion-valve body (with diaphragm cap + adjustment stem + sensing bulb), a DISTRIBUTOR
//       SPIDER with feeder capillaries fanning into each coil row, a SIGHT GLASS, a FILTER DRIER
//       canister, Schrader SERVICE PORTS, and a FOAM-LAGGED SUCTION LINE with insulation-tape wraps.
//       The "this is a real refrigeration circuit" density, extracted so any evaporator/AHU assembles it.
// params: liquidDN / suctionDN (line Øs), portCount (Schrader service ports), rowYs (the coil rows the
//         distributor feeds), plus a header ORIGIN and injected MATERIALS. Reusable across coil sizes.
// deps: NONE for the pure core (imports nothing, Node-testable). The async builder loads three via a
//       dynamic import('three') INSIDE the function; it must NEVER add a top-level `import * as THREE`.
// coupling notes: 1 u = 1 m (source). Curved lines use TubeGeometry over a CatmullRom of pure-core
//       waypoints (array→Vector3 wrapped at the boundary). Foam suction = copper core + fatter foam
//       sleeve TubeGeometry (two radii on the SAME centerline). Materials injected per equipment.

// -------- PURE core (imports nothing; Node-testable) -----------------------------------------------

/**
 * Validate the two refrigerant line gauges. Both diameters must be positive; a real circuit has a
 * suction line at least as large as the liquid line (flagged, not enforced).
 * @param {{liquidDN:number, suctionDN:number}} p
 * @returns {{valid:boolean, suctionLargerThanLiquid:boolean}}
 */
export function lineGauge({ liquidDN, suctionDN }) {
  const valid = liquidDN > 0 && suctionDN > 0;
  return { valid, suctionLargerThanLiquid: valid && suctionDN >= liquidDN };
}

/**
 * Distributor feeder capillaries: one 3-point CatmullRom control triple per coil row, fanning from the
 * distributor body out to each row's coil-face entry. Pure waypoint data (LOCAL coords) — the builder
 * wraps each point as a Vector3 and sweeps a thin tube. length === rowYs.length.
 * @param {{rowYs:number[], origin:number[], coilFaceZ:number, coilRightX:number}} p
 * @returns {{points:number[][]}[]}  each entry: 3 control points [ [x,y,z], [x,y,z], [x,y,z] ].
 */
export function distributorFeeders({ rowYs, origin, coilFaceZ, coilRightX }) {
  if (!Array.isArray(rowYs) || rowYs.length < 1) throw new RangeError('distributorFeeders: rowYs must be a non-empty array');
  if (!Array.isArray(origin) || origin.length !== 3) throw new RangeError('distributorFeeders: origin must be [x,y,z]');
  const [ox, oy, oz] = origin;
  return rowYs.map((ry) => ({
    points: [
      [ox + 0.045, oy, oz],
      [ox + 0.01, (oy + ry) / 2, oz],
      [coilRightX, ry, coilFaceZ + 0.02],
    ],
  }));
}

/**
 * Schrader service-port placements: N ports evenly spaced along an axis from `start`. Each carries a
 * port position and a cap position one `capGap` further out.
 * @param {{count:number, start:number[], spacing:number, axis?:'x'|'y'|'z', capGap?:number}} p
 * @returns {{position:number[], capPosition:number[]}[]}  length === count.
 */
export function servicePorts({ count, start, spacing, axis = 'x', capGap = 0.013 }) {
  if (!Number.isInteger(count) || count < 0) throw new RangeError(`servicePorts: count must be an integer >= 0 (got ${count})`);
  if (!Array.isArray(start) || start.length !== 3) throw new RangeError('servicePorts: start must be [x,y,z]');
  const ai = { x: 0, y: 1, z: 2 }[axis];
  if (ai === undefined) throw new RangeError(`servicePorts: axis must be x|y|z (got ${axis})`);
  const out = [];
  for (let i = 0; i < count; i++) {
    const pos = start.slice(); pos[ai] += i * spacing;
    const cap = pos.slice(); cap[ai] += capGap;
    out.push({ position: pos, capPosition: cap });
  }
  return out;
}

/**
 * Insulation-tape wrap parameters along the suction curve: N wraps at evenly-interior t in (0,1).
 * @param {{count:number}} p
 * @returns {number[]}  t values, each strictly in (0,1), ascending.
 */
export function foamLagWraps({ count }) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`foamLagWraps: count must be an integer >= 1 (got ${count})`);
  const out = new Array(count);
  for (let i = 0; i < count; i++) out[i] = (i + 1) / (count + 1);
  return out;
}

// -------- async three builder (dynamic three import) -----------------------------------------------

/**
 * Build the refrigeration-cluster sub-assembly as a Group in LOCAL coords (header origin at the given
 * `origin`; the caller positions the returned Group). TXV + distributor + feeders + drier + sight
 * glass + service ports + foam-lagged suction. Materials INJECTED (never a global registry).
 * @param {object} opts
 * @param {number[]} opts.origin                header station [x,y,z] (distributor root).
 * @param {number[]} opts.rowYs                 coil row Y's the distributor feeds.
 * @param {number} opts.coilFaceZ              coil intake-face Z.
 * @param {number} opts.coilRightX             coil right-edge X (feeder targets).
 * @param {number} [opts.liquidDN=0.02]        liquid-line Ø.
 * @param {number} [opts.suctionDN=0.038]      suction-line Ø.
 * @param {number} [opts.portCount=2]          Schrader service ports.
 * @param {{copper,copperDark,brass,foam,rubber,glass}} opts.materials  injected materials.
 * @returns {Promise<THREE.Group>}
 */
export async function makeRefrigCluster({
  origin, rowYs, coilFaceZ, coilRightX, liquidDN = 0.02, suctionDN = 0.038, portCount = 2, materials,
}) {
  const THREE = await import('three');
  const need = ['copper', 'copperDark', 'brass', 'foam', 'rubber', 'glass'];
  if (!materials || need.some((k) => !materials[k])) {
    throw new Error(`makeRefrigCluster: materials.{${need.join(',')}} are required (inject, never a global registry)`);
  }
  const g = lineGauge({ liquidDN, suctionDN });
  if (!g.valid) throw new RangeError('makeRefrigCluster: liquidDN and suctionDN must be > 0');
  const [ox, oy, oz] = origin;
  const liqR = liquidDN / 2, sucR = suctionDN / 2;
  const group = new THREE.Group();
  const V = (p) => new THREE.Vector3(p[0], p[1], p[2]);
  const add = (m, cast = true, recv = false) => { m.castShadow = cast; m.receiveShadow = recv; group.add(m); return m; };

  // distributor body (brass cone) + feeder capillaries fanning to each coil row
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.022, 0.04, 14), materials.brass);
  body.rotation.z = Math.PI / 2; body.position.set(ox + 0.06, oy, oz); add(body);
  for (const f of distributorFeeders({ rowYs, origin, coilFaceZ, coilRightX })) {
    const path = new THREE.CatmullRomCurve3(f.points.map(V));
    add(new THREE.Mesh(new THREE.TubeGeometry(path, 20, 0.0035, 7, false), materials.copper));
  }

  // TXV / expansion valve: brass block + diaphragm cap + adjustment stem
  const txv = new THREE.Group(); txv.position.set(ox + 0.11, oy + 0.02, oz); group.add(txv);
  const txvBody = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.045), materials.brass);
  txvBody.castShadow = true; txv.add(txvBody);
  const txvCap = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 16), materials.brass);
  txvCap.position.y = 0.035; txv.add(txvCap);
  const txvAdj = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.014, 12), materials.copperDark);
  txvAdj.position.y = -0.032; txv.add(txvAdj);
  // sensing bulb + capillary
  const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 10), materials.copperDark);
  bulb.rotation.z = Math.PI / 2; bulb.position.set(ox + 0.02, oy + 0.14, oz + 0.02); add(bulb);
  const capLine = new THREE.CatmullRomCurve3([
    V([ox + 0.11, oy + 0.07, oz]), V([ox + 0.08, oy + 0.08, oz + 0.02]), V([ox + 0.02, oy + 0.13, oz + 0.02]),
  ]);
  add(new THREE.Mesh(new THREE.TubeGeometry(capLine, 24, 0.0022, 6, false), materials.copperDark));

  // liquid line: filter drier canister + sight glass + service ports
  const lz = oz + 0.06, drierX = ox + 0.16, ly = oy - 0.1;
  const liquidPath = new THREE.CatmullRomCurve3([
    V([ox + 0.11, oy - 0.05, coilFaceZ + 0.02]), V([ox + 0.13, ly, oz]),
    V([drierX, ly, lz]), V([drierX, oy + 0.02, lz + 0.02]), V([drierX - 0.005, oy + 0.14, lz + 0.02]),
  ]);
  add(new THREE.Mesh(new THREE.TubeGeometry(liquidPath, 60, liqR, 12, false), materials.copper));
  const drier = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.10, 18), materials.copperDark);
  drier.position.set(drierX, ly + 0.05, lz); add(drier);
  const drierCap = new THREE.Mesh(new THREE.SphereGeometry(0.024, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), materials.copperDark);
  drierCap.position.set(drierX, ly + 0.10, lz); group.add(drierCap);
  const sgRing = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 14), materials.brass);
  sgRing.position.set(drierX - 0.002, oy + 0.06, lz + 0.02); add(sgRing);
  const sgEye = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 10), materials.glass);
  sgEye.position.set(drierX - 0.002, oy + 0.06, lz + 0.033); group.add(sgEye);
  // Schrader service ports on the liquid line
  for (const p of servicePorts({ count: portCount, start: [drierX + 0.015, ly + 0.02, lz], spacing: 0.03, axis: 'x' })) {
    const port = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 8), materials.brass);
    port.position.set(...p.position); port.rotation.z = Math.PI / 2; add(port);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.01, 8), materials.copperDark);
    cap.position.set(...p.capPosition); cap.rotation.z = Math.PI / 2; group.add(cap);
  }

  // suction line: copper core + fatter foam sleeve on the SAME centerline + tape wraps + top valve
  const core = new THREE.CatmullRomCurve3([
    V([ox + 0.02, oy - 0.12, coilFaceZ - 0.02]), V([ox + 0.14, oy - 0.06, oz - 0.12]),
    V([ox + 0.2, oy, oz - 0.10]), V([ox + 0.21, oy + 0.14, oz - 0.06]), V([ox + 0.21, oy + 0.22, oz + 0.02]),
  ]);
  add(new THREE.Mesh(new THREE.TubeGeometry(core, 60, sucR, 14, false), materials.copper));
  const foamSleeve = new THREE.Mesh(new THREE.TubeGeometry(core, 60, sucR + 0.013, 16, false), materials.foam);
  foamSleeve.castShadow = true; group.add(foamSleeve);
  for (const t of foamLagWraps({ count: 5 })) {
    const pt = core.getPointAt(t), tan = core.getTangentAt(t);
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(sucR + 0.013, 0.003, 6, 18), materials.rubber);
    wrap.position.copy(pt); wrap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan); group.add(wrap);
  }
  const sv = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.045, 14), materials.copper);
  sv.position.set(ox + 0.21, oy + 0.245, oz + 0.02); add(sv);

  group.userData.gauge = g;
  return group;
}
