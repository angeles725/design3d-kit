// library: debox  (parts/debox.mjs) — voxel/box blockout → parametric realistic geometry (investigador3, v1.19).
// source: design3d numerical pass · investigacion.md §612-652 + recipes/de-boxing-playbook.md (2026-08-26).
//         The "→ realista" step of the {CAD·foto·spec}→voxel→realista axis, as EXECUTABLE CODE (the
//         playbook was only a .md). CONSUMES i1's blockout {voxelSize, parts:[{id,type,center,size,...}]}
//         and maps each part.type to the right rounded-equipment builder, PRESERVING the engineering
//         data (center/size/ports/rotation) EXACTLY and substituting only proxy geometry — the doc's
//         anti-drift rule, disciplined BY CONSTRUCTION so pass-parity(blockout, plan)=0 drift.
// what: deBoxPlan(blockout) is the PURE core — the part.type→builder mapping + param derivation, with
//       every engineering field spread through unchanged (Node-testable + gateable). deBox(blockout,
//       material) is the async three wrapper that actually builds the meshes.
// deps: NONE for the pure core (deBoxPlan). deBox() dynamic-imports three + the builders inside the fn.
//
// MATERIAL TRAP baked from the playbook: makeProceduralMetalRough returns ONE packed texture → assign to
// BOTH roughnessMap AND metalnessMap and keep material.roughness=1, material.metalness=1 (three MULTIPLIES
// map×scalar; a 0.28 scalar over a 0.28 map reads glossy-wrong). Satin industrial: roughnessBase 0.45-0.55,
// envMapIntensity ~1.0 (NOT 0.3 roughness + 1.4 env = chrome mirror). Never scene.environmentIntensity (inert r160).
const MATERIAL_DEFAULTS = { roughnessBase: 0.5, metalness: 0.85, envMapIntensity: 1.0, mapScalars: 1 };

// part.type → builder. Covers both FORM types (revolution-body/rounded-housing/duct/fitting/flange/cabinet)
// and common EQUIPMENT types (chiller/ahu→cabinet, pump→rounded-housing, tank/boiler→revolution-body),
// plus organic shells → marching-cubes (corpus B50) — NEVER pipes (those vectorize via duct-vectorize).
const BUILDER_FOR = {
  'revolution-body': 'lathe-body', vessel: 'lathe-body', tank: 'lathe-body', boiler: 'lathe-body', cylinder: 'lathe-body',
  'rounded-housing': 'superquadric', volute: 'superquadric', pump: 'superquadric', motor: 'superquadric',
  duct: 'rect-duct', 'rect-duct': 'rect-duct', trunk: 'rect-duct',
  fitting: 'hvac-fittings', elbow: 'hvac-fittings', tee: 'hvac-fittings', reducer: 'hvac-fittings', cross: 'hvac-fittings',
  flange: 'torus', ring: 'torus', bezel: 'torus',
  cabinet: 'rounded-box', skid: 'rounded-box', chiller: 'rounded-box', ahu: 'rounded-box', box: 'rounded-box',
  'equipment-shell': 'marching-cubes', organic: 'marching-cubes',
};
const DEFAULT_BUILDER = 'rounded-box';

const axisIndex = (axis) => ({ x: 0, y: 1, z: 2 }[axis] ?? 1); // default revolve/extrude axis = Y

// Derive builder params from the part's bbox `size` (so the proxy fits the SAME envelope — no size drift).
function builderParams(builder, part) {
  const [sx, sy, sz] = part.size;
  const ai = axisIndex(part.axis);
  const along = part.size[ai];                     // length along the part's axis
  const radial = Math.min(...part.size.filter((_, i) => i !== ai)) / 2; // radius from the tighter cross-axis
  switch (builder) {
    case 'lathe-body': return { profile: 'vessel', radius: radial, height: along, headRatio: 0.25, axis: part.axis ?? 'y' };
    case 'superquadric': return { a: sx / 2, b: sy / 2, c: sz / 2, e1: 0.35, e2: 0.35 };
    case 'rect-duct': return { width: sx, height: sz, section: part.section ?? null };
    case 'hvac-fittings': return { kind: part.type, section: part.section ?? { radius: radial } };
    case 'torus': return { ringRadius: Math.max(sx, sz) / 2, tubeRadius: Math.min(sx, sy, sz) / 2 };
    case 'rounded-box': return { w: sx, h: sy, d: sz, fillet: Math.min(sx, sy, sz) * 0.06 };
    case 'marching-cubes': return { grid: 'from-voxel', iso: 0.5, note: 'organic equipment shell only — never a pipe' };
    default: return { w: sx, h: sy, d: sz };
  }
}

/**
 * PURE de-box plan: map each blockout part to its builder, preserving ALL engineering data (center/size/
 * ports/portDN/rotation/clearance) EXACTLY and adding only `builder` + `builderParams`. Disciplined by
 * construction — checkPassParity({objects:blockout.parts},{objects:deBoxPlan(blockout).parts}) is 0 drift.
 * @param {{voxelSize?:number, parts:{id:string,type:string,center:number[],size:number[],axis?:string,section?:object,ports?:object,portDN?:object,rotation?:number[],clearance?:object}[]}} blockout
 * @param {{material?:object}} [opts]
 * @returns {{voxelSize?:number, material:object, parts:object[], unmapped:string[]}}
 */
export function deBoxPlan(blockout, opts = {}) {
  const material = { ...MATERIAL_DEFAULTS, ...(opts.material || {}) };
  const unmapped = [];
  const parts = (blockout.parts || []).map((part) => {
    const builder = BUILDER_FOR[part.type] ?? DEFAULT_BUILDER;
    if (!(part.type in BUILDER_FOR)) unmapped.push(part.id);
    // SPREAD the source part first (preserve every engineering field), then add builder + params ONLY.
    return { ...part, builder, builderParams: builderParams(builder, part) };
  });
  return { voxelSize: blockout.voxelSize, material, parts, unmapped };
}

/**
 * Async three wrapper: build the realistic meshes from the plan. Dynamic-imports three + the builders so
 * the pure core stays Node-loadable. Returns a Group of meshes positioned at each part's center (size/
 * ports preserved by construction). Marching-cubes shells are a follow-up (returns a placeholder box).
 * @returns {Promise<import('three').Group>}
 */
export async function deBox(blockout, material) {
  const THREE = await import('three');
  const plan = deBoxPlan(blockout, { material });
  const group = new THREE.Group();
  for (const p of plan.parts) {
    let mesh = null;
    try {
      if (p.builder === 'superquadric') {
        const { makeSuperquadric } = await import('./superquadric.mjs');
        mesh = await makeSuperquadric(p.builderParams, material);
      } else if (p.builder === 'rect-duct') {
        // a straight box duct: a 1-segment run through the part's center along its axis
        const { makeRectDuct } = await import('./rect-duct.mjs');
        const half = p.size[axisIndex(p.axis)] / 2, ai = axisIndex(p.axis);
        const a = [0, 0, 0], b = [0, 0, 0]; a[ai] = -half; b[ai] = half;
        mesh = await makeRectDuct([a, b], { width: p.builderParams.width, height: p.builderParams.height, capEnds: true }, material);
      } else {
        // lathe-body / torus / rounded-box / fallback: a proxy box at the exact bbox (geometry follow-up)
        mesh = new THREE.Mesh(new THREE.BoxGeometry(...p.size), material);
      }
    } catch { mesh = new THREE.Mesh(new THREE.BoxGeometry(...p.size), material); }
    if (mesh) {
      mesh.position.set(p.center[0], p.center[1], p.center[2]);
      if (p.rotation) mesh.rotation.set(p.rotation[0], p.rotation[1], p.rotation[2]);
      mesh.name = p.id; mesh.userData = { type: p.type, builder: p.builder, ports: p.ports, size: p.size };
      group.add(mesh);
    }
  }
  return group;
}
