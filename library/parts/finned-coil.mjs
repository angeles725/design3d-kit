// library: finned-coil  (parts/finned-coil.mjs)
// source: evaporadora-realista-v2.html:413-451 (finned coil block) · FAST-lane design3d pass —
//         guard-rail floor PASS (GR1-GR4) + user approval "se ve mucho mejor" + GR3 drift 0
//         (NOT a P6 blind-review gate; FAST-lane evidence = floor verdicts + user approval).
// what: a parametric FINNED-COIL sub-assembly — a dense aluminium FIN PACK (one InstancedMesh),
//       a copper SERPENTINE (horizontal tube rows + alternating-end U-return bends + row-to-row
//       risers), and galvanized TUBE SHEETS / end plates. The richness that makes an evaporator or
//       condenser coil read as a real heat exchanger instead of a boxy block, extracted so the next
//       unit-cooler / AHU / condenser ASSEMBLES it from params instead of re-authoring 40 lines.
// params: width/height/depth (the coil block envelope, caller units — 1 u = 1 m in the source),
//         finCount (fins across the width), rows (serpentine tube rows), tubeRadius (copper Ø/2),
//         finThickness, plus injected MATERIALS (fin/tube/endPlate) — never a global registry.
// deps: NONE for the pure core (imports nothing, Node-testable). The async builder loads three via a
//       dynamic import('three') INSIDE the function and top-level imports the pure adaptive-segments
//       module; it must NEVER add a top-level `import * as THREE`.
// coupling notes: 1 u = 1 m (source). Instanced fins/tubes/U-bends/risers carry the perf; a coil with
//       finCount 104 + 5 rows is ~4 draws, not ~120 meshes. Materials injected (mutable per equipment).

import { radialSegmentsFor } from './adaptive-segments.mjs';

// -------- PURE core (imports nothing; Node-testable) -----------------------------------------------

/**
 * Fin-pack instance X positions across the width, centred on x=0 (symmetric about the axis).
 * @param {{width:number, finCount:number}} p
 * @returns {{spacing:number, xs:number[]}}  xs.length === finCount, symmetric about 0.
 */
export function finLayout({ width, finCount }) {
  if (!(width > 0)) throw new RangeError(`finLayout: width must be > 0 (got ${width})`);
  if (!Number.isInteger(finCount) || finCount < 1) throw new RangeError(`finLayout: finCount must be an integer >= 1 (got ${finCount})`);
  const spacing = width / finCount;
  const xs = new Array(finCount);
  for (let i = 0; i < finCount; i++) xs[i] = -width / 2 + (i + 0.5) * spacing;
  return { spacing, xs };
}

/**
 * Serpentine tube row centre Y's — `rows` levels spanning [-height/2, height/2], symmetric about 0.
 * @param {{height:number, rows:number}} p
 * @returns {number[]}  length === rows.
 */
export function coilRowYs({ height, rows }) {
  if (!(height > 0)) throw new RangeError(`coilRowYs: height must be > 0 (got ${height})`);
  if (!Number.isInteger(rows) || rows < 1) throw new RangeError(`coilRowYs: rows must be an integer >= 1 (got ${rows})`);
  if (rows === 1) return [0];
  const step = height / (rows - 1);
  const ys = new Array(rows);
  for (let i = 0; i < rows; i++) ys[i] = -height / 2 + i * step;
  return ys;
}

/**
 * Full serpentine plan: horizontal tube runs (two depth planes per row), one U-return bend per row
 * alternating ends, and a riser connecting each adjacent row pair on the alternating side. All plain
 * data — the three builder rings it into instanced meshes. Coordinates are LOCAL (coil block centred
 * at the origin); the caller positions the returned Group.
 * @param {{width:number, height:number, depth:number, rows:number, tubeRadius:number}} p
 * @returns {{ys:number[], tubes:{position:number[],length:number,axis:string}[],
 *            uBends:{position:number[],endSign:number,arcAngle:number}[],
 *            risers:{position:number[],length:number}[], tubeLen:number, zFront:number, zBack:number}}
 */
export function serpentinePlan({ width, height, depth, rows, tubeRadius }) {
  if (!(width > 0) || !(height > 0) || !(depth > 0)) throw new RangeError('serpentinePlan: width/height/depth must be > 0');
  if (!(tubeRadius > 0)) throw new RangeError(`serpentinePlan: tubeRadius must be > 0 (got ${tubeRadius})`);
  if (!Number.isInteger(rows) || rows < 1) throw new RangeError(`serpentinePlan: rows must be an integer >= 1 (got ${rows})`);
  const ys = coilRowYs({ height, rows });
  const half = width / 2;
  const tubeLen = Math.max(tubeRadius, width - 2 * tubeRadius);
  const zFront = depth / 2 - tubeRadius;
  const zBack = -(depth / 2 - tubeRadius);
  const endX = half - tubeRadius;
  const tubes = [];
  for (const y of ys) for (const z of [zBack, zFront]) tubes.push({ position: [0, y, z], length: tubeLen, axis: 'x' });
  const uBends = ys.map((y, r) => {
    const endSign = r % 2 === 0 ? 1 : -1;
    return { position: [endSign * endX, y, 0], endSign, arcAngle: Math.PI };
  });
  const risers = [];
  for (let r = 0; r < rows - 1; r++) {
    const side = (r % 2 === 0 ? -1 : 1) * endX;
    risers.push({ position: [side, (ys[r] + ys[r + 1]) / 2, zBack], length: Math.abs(ys[r + 1] - ys[r]) });
  }
  return { ys, tubes, uBends, risers, tubeLen, zFront, zBack };
}

/**
 * Tube-sheet / end-plate placements at the left and right coil faces (galvanized frames the tubes
 * pass through). Returns two placements symmetric about x=0.
 * @param {{width:number, height:number, depth:number, margin?:number}} p
 * @returns {{position:number[], size:number[]}[]}  length 2.
 */
export function tubeSheets({ width, height, depth, margin = 0.007 }) {
  if (!(width > 0) || !(height > 0) || !(depth > 0)) throw new RangeError('tubeSheets: width/height/depth must be > 0');
  const x = width / 2 + margin;
  const size = [2 * margin, height + 0.03, depth + 0.015];
  return [-1, 1].map((s) => ({ position: [s * x, 0, 0], size: size.slice() }));
}

// -------- async three builder (dynamic three import) -----------------------------------------------

function _setInstance(im, dummy, i, position, rotation) {
  dummy.position.set(position[0], position[1], position[2]);
  dummy.rotation.set(rotation[0], rotation[1], rotation[2]);
  dummy.updateMatrix();
  im.setMatrixAt(i, dummy.matrix);
}

/**
 * Build the finned-coil sub-assembly as a Group (fins + serpentine + tube sheets). The coil block is
 * centred at the local origin; the caller positions/orients the returned Group. Repeated elements
 * (fins, tubes, U-bends, risers) are InstancedMeshes. Materials are INJECTED (never a global registry).
 * @param {object} opts
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {number} opts.depth
 * @param {number} [opts.finCount=104]
 * @param {number} [opts.rows=5]
 * @param {number} [opts.tubeRadius=0.0085]
 * @param {number} [opts.finThickness=0.0016]
 * @param {number} [opts.targetEdgeLength]  adaptive tube tessellation when set.
 * @param {{fin:THREE.Material, tube:THREE.Material, endPlate:THREE.Material}} opts.materials
 * @returns {Promise<THREE.Group>}  userData.plan = the serpentinePlan (ports/counts for downstream).
 */
export async function makeFinnedCoil({
  width, height, depth, finCount = 104, rows = 5, tubeRadius = 0.0085, finThickness = 0.0016,
  targetEdgeLength, materials,
}) {
  const THREE = await import('three');
  if (!materials || !materials.fin || !materials.tube || !materials.endPlate) {
    throw new Error('makeFinnedCoil: materials.{fin,tube,endPlate} are required (inject, never a global registry)');
  }
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const radSeg = Math.max(6, radialSegmentsFor(tubeRadius, targetEdgeLength) ?? 12);

  // fin pack — one InstancedMesh
  const { xs } = finLayout({ width, finCount });
  const finGeo = new THREE.BoxGeometry(finThickness, height, depth);
  const fins = new THREE.InstancedMesh(finGeo, materials.fin, finCount);
  fins.castShadow = true; fins.receiveShadow = true;
  xs.forEach((x, i) => _setInstance(fins, dummy, i, [x, 0, 0], [0, 0, 0]));
  fins.instanceMatrix.needsUpdate = true;
  group.add(fins);

  const plan = serpentinePlan({ width, height, depth, rows, tubeRadius });

  // horizontal tubes — one InstancedMesh (all identical length, rotated to lie along X)
  const tubeGeo = new THREE.CylinderGeometry(tubeRadius, tubeRadius, plan.tubeLen, radSeg);
  const tubes = new THREE.InstancedMesh(tubeGeo, materials.tube, plan.tubes.length);
  tubes.castShadow = true; tubes.receiveShadow = false;
  plan.tubes.forEach((t, i) => _setInstance(tubes, dummy, i, t.position, [0, 0, Math.PI / 2]));
  tubes.instanceMatrix.needsUpdate = true;
  group.add(tubes);

  // U-return bends — one InstancedMesh (half torus, rotated per alternating end)
  const uGeo = new THREE.TorusGeometry(Math.max(tubeRadius * 2, 0.025), tubeRadius, Math.max(6, radSeg - 2), 20, Math.PI);
  const uBends = new THREE.InstancedMesh(uGeo, materials.tube, plan.uBends.length);
  uBends.castShadow = true; uBends.receiveShadow = false;
  plan.uBends.forEach((u, i) => _setInstance(uBends, dummy, i, u.position, [0, Math.PI / 2, u.endSign > 0 ? 0 : Math.PI]));
  uBends.instanceMatrix.needsUpdate = true;
  group.add(uBends);

  // risers — one InstancedMesh (identical vertical cylinders)
  if (plan.risers.length) {
    const riserGeo = new THREE.CylinderGeometry(tubeRadius, tubeRadius, plan.risers[0].length, radSeg);
    const risers = new THREE.InstancedMesh(riserGeo, materials.tube, plan.risers.length);
    risers.castShadow = true; risers.receiveShadow = false;
    plan.risers.forEach((rr, i) => _setInstance(risers, dummy, i, rr.position, [0, 0, 0]));
    risers.instanceMatrix.needsUpdate = true;
    group.add(risers);
  }

  // tube sheets / end plates
  for (const sheet of tubeSheets({ width, height, depth })) {
    const ep = new THREE.Mesh(new THREE.BoxGeometry(...sheet.size), materials.endPlate);
    ep.position.set(...sheet.position); ep.castShadow = true; ep.receiveShadow = true;
    group.add(ep);
  }

  group.userData.plan = plan;
  return group;
}
