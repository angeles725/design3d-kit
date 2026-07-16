// library: aero-fan-kit  (parts/aero-fan-kit.mjs)
// source: cuarto-frio-safran · cuarto-3d.html:31634-31665 · client-shipped (2026)
// what: makeAeroBladeGeometry() — scimitar fan blade (extruded 2D Shape + per-vertex twist along the
//       span) — and makeFan() — axial fan assembly: venturi ring, torus+spoke guard, hub and 5 blades.
// params: radius (caller units) + ALL materials injected ({ blade, ring, guard }); source used its
//         global registry M.fanRing/M.fanGuard — decoupled here. Blade counts/guard proportions
//         default to source values.
// deps: three (Shape, ExtrudeGeometry, TorusGeometry, CylinderGeometry, BoxGeometry).
// coupling notes:
//   - The fan faces +Y by default (spin axis = local Y); rotate the returned `holder` to aim it.
//   - Animate by incrementing `spin.rotation.y` from the CALLER's clock (deterministic-capture rule:
//     no internal rAF here).
//   - Blade geometry is authored at a nominal span of ~4.15 units and scaled by R/4.2 inside makeFan,
//     exactly as the source; the geometry is cached and SHARED between fans (per-fan blade *materials*
//     must be per-instance if blades change color with equipment state — buildCooler's pattern).
//   - Blades castShadow=true. Baked-shadow scenes need a re-bake if fans are added after frame 1.
//   - Source material recipe (for reference): ring 0x9aa0a6 rough.5 metal.55 · guard 0x40444a
//     rough.45 metal.8 — inject equivalents, never globals.

import * as THREE from 'three';

// -- private mini-helpers (kept local so the module is self-contained) --
function _box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function _cyl(r0, r1, h, mat, x, y, z, open) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, 20, 1, !!open), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * Scimitar twisted blade geometry (nominal span ~4.15 units along +X, twist 0.70→0.22 rad).
 * Build once and share across fans — makeFan() caches it for you.
 */
export function makeAeroBladeGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0.5, -0.30);
  shape.quadraticCurveTo(1.6, -0.75, 3.1, -0.55);
  shape.quadraticCurveTo(3.9, -0.35, 4.15, 0.05);
  shape.quadraticCurveTo(4.25, 0.38, 3.85, 0.58);
  shape.quadraticCurveTo(2.8, 0.88, 1.4, 0.55);
  shape.quadraticCurveTo(0.8, 0.35, 0.5, 0.20);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.2, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.04, bevelThickness: 0.04, steps: 1,
  });
  geo.translate(0, 0, -0.1);
  // per-vertex twist along the span (root twisted 0.70 rad, tip 0.22 rad)
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const tp = Math.max(0, Math.min(1, (x - 0.5) / 3.7));
    const tw = 0.70 - tp * 0.48;
    pos.setXYZ(i, x, y * Math.cos(tw) - z * Math.sin(tw), y * Math.sin(tw) + z * Math.cos(tw));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

let _sharedBladeGeo = null;

/**
 * Axial fan facing +Y: static `holder` (venturi + guard) containing rotating `spin` (hub + blades).
 * @param {number} R  fan radius in caller units.
 * @param {object} materials
 * @param {THREE.Material} materials.blade  per-instance if blades tint with equipment state.
 * @param {THREE.Material} materials.ring   venturi shroud (source: grey metal, rough 0.5 / metal 0.55).
 * @param {THREE.Material} materials.guard  guard rings, spokes and hub (source: dark metal, rough 0.45 / metal 0.8).
 * @param {object} [opts]
 * @param {number} [opts.bladeCount=5]
 * @param {number} [opts.spokeCount=6]
 * @param {THREE.BufferGeometry} [opts.bladeGeometry]  override the shared scimitar geometry.
 * @returns {{ holder: THREE.Group, spin: THREE.Group }}  caller parents `holder`; animate `spin.rotation.y`.
 */
export function makeFan(R, { blade, ring, guard }, { bladeCount = 5, spokeCount = 6, bladeGeometry } = {}) {
  const bladeGeo = bladeGeometry || (_sharedBladeGeo ||= makeAeroBladeGeometry());
  const holder = new THREE.Group();

  // venturi shroud (open cylinder)
  holder.add(_cyl(R, R, R * 0.5, ring, 0, 0, 0, true));
  // guard: 3 concentric torus rings on the intake face
  for (const rr of [R * 0.36, R * 0.66, R * 0.93]) {
    const g = new THREE.Mesh(new THREE.TorusGeometry(rr, R * 0.03, 4, 22), guard);
    g.rotation.x = Math.PI / 2;
    g.position.y = R * 0.30;
    holder.add(g);
  }
  // guard: radial spokes
  for (let i = 0; i < spokeCount; i++) {
    const a = (i / spokeCount) * Math.PI * 2;
    const sp = _box(R * 0.05, R * 0.05, R * 1.95, guard, 0, R * 0.30, 0);
    sp.rotation.y = a;
    holder.add(sp);
  }

  // rotor: hub + blades
  const spin = new THREE.Group();
  spin.add(_cyl(R * 0.22, R * 0.27, R * 0.35, guard, 0, 0, 0));
  const s = R / 4.2; // scales the ~4.15-unit nominal blade span to the fan radius
  for (let i = 0; i < bladeCount; i++) {
    const b = new THREE.Mesh(bladeGeo, blade);
    b.rotation.y = (i / bladeCount) * Math.PI * 2;
    b.scale.setScalar(s);
    b.castShadow = true;
    spin.add(b);
  }
  holder.add(spin);

  return { holder, spin };
}
