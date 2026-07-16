// library: temperature-chips  (markers-ui/temperature-chips.mjs)
// source: cinemex-hvac-lorawan · src/scene/temperature-chips.js · p6-final L4 0.80 (2026-07-15)
// lineage: markers-ui/sims-floating-banner (cuarto-frio-safran · cuarto-3d.html:32109-32189,
//          client-validated look) — the same billboard grammar (rounded canvas badge + inverted
//          pointer arrow, additive pulsing halo Sprite, bob/sway), fleet-ified into live
//          temperature chips over equipment (the cinemex thermal roof plan, `camera=top`).
// what: billboard temperature-chip fleet — one camera-facing Sprite badge per unit showing zone +
//       live reading, alarm recolor with a pulsing halo, exterior-only visibility, all animation
//       driven by a deterministic tick clock.
// params: units [{id, position:[x,y,z], zone}], readTemperature(id), isAlarm(id), envelope
//         (createChipEnvelope or null = always visible), config overrides (width, anchorLift,
//         bob/sway periods, colors, haloPulse, formatReading locale).
// deps: three (Group, Sprite, SpriteMaterial, CanvasTexture, AdditiveBlending) + a document with
//       createElement('canvas').
// coupling notes:
//   - `toneMapped:false` on BOTH sprite materials is mandatory under an ACES rig (canvas colors
//     wash out without it); in a non-ACES scene the same sprite oversaturates — retune colors.
//   - renderOrder pair halo 998 / badge 999 with depthWrite:false (the sims-banner ordering);
//     scenes with heavy transparency need global renderOrder management.
//   - REDRAW RULE: a badge canvas repaints ONLY when its formatted reading or alarm state changes
//     (refreshReadings), never per frame — setTick does pose/pulse work only, zero canvas work.
//   - Deterministic: no Date.now, no own rAF. Feed one tick clock so captures at pinned ticks
//     (t0/t30) reproduce exactly; sample readings on a fixed tick cadence for the same reason.
//   - Flat fills only (no gradients) so a stubbed 2D context in a node harness drives the real
//     draw path. `width`/`anchorLift` are world units at metre scale — retune per scene scale.
//   - The factory RETURNS its Group (hidden until a camera position proves the exterior when an
//     envelope is given); the caller adds it to the scene.

import * as THREE from 'three';

export const TEMPERATURE_CHIP_DEFAULTS = Object.freeze({
  width: 3.4, // world units at metre scale
  aspect: 0.5, // badge height / width (512x256 canvas)
  canvas: Object.freeze({ width: 512, height: 256 }),
  haloCanvas: Object.freeze({ width: 128, height: 64 }),
  anchorLift: 1.2, // chip floats this far above unit.position; the pointer aims back down at it
  bob: Object.freeze({ amplitude: 0.12, periodTicks: 40 }),
  sway: Object.freeze({ amplitude: 0.05, periodTicks: 66 }),
  haloPulse: Object.freeze({ period: 44, minOpacity: 0.4, maxOpacity: 0.9 }),
  renderOrder: Object.freeze({ halo: 998, badge: 999 }),
  colors: Object.freeze({
    normal: Object.freeze({
      card: '#f8fafc', border: '#38bdf8', pointer: '#2563eb',
      brand: '#1e3a5f', main: '#0b1620',
    }),
    alarm: Object.freeze({
      card: '#dc2626', border: '#fecaca', pointer: '#991b1b',
      brand: '#fee2e2', main: '#ffffff',
    }),
  }),
});

/** One format authority for the reading (default es-MX style, one decimal). */
export function formatChipTemperature(value) {
  if (!Number.isFinite(value)) throw new RangeError('A temperature chip needs a finite reading.');
  return `${value.toFixed(1)} °C`;
}

/**
 * The exterior envelope the chips test the camera against: the building footprint AABB with a
 * margin, or anywhere above the tallest roof plate (the aerial exception).
 */
export function createChipEnvelope({ building, maxPlateTop, margin = 2, overheadLift = 1 } = {}) {
  if (!building?.width || !building?.depth || !Number.isFinite(maxPlateTop)) {
    throw new TypeError('A chip envelope needs the building footprint and the tallest plate top.');
  }
  return Object.freeze({
    x: Object.freeze([-building.width / 2, building.width / 2]),
    z: Object.freeze([-building.depth / 2, building.depth / 2]),
    margin,
    minOverheadY: maxPlateTop + overheadLift,
  });
}

/** Pure exterior test: outside the margined footprint in plan, OR above the roofscape. */
export function isCameraOutside(envelope, position) {
  const point = Array.isArray(position)
    ? { x: position[0], y: position[1], z: position[2] }
    : position;
  if (!envelope || !Number.isFinite(point?.x) || !Number.isFinite(point?.y) || !Number.isFinite(point?.z)) {
    throw new TypeError('The exterior test needs an envelope and a camera position.');
  }
  if (point.y > envelope.minOverheadY) return true;
  return point.x < envelope.x[0] - envelope.margin
    || point.x > envelope.x[1] + envelope.margin
    || point.z < envelope.z[0] - envelope.margin
    || point.z > envelope.z[1] + envelope.margin;
}

/** Deterministic bob/sway for one chip at one tick (per-chip phase keeps the field alive). */
export function resolveChipPose(tick, index, fleetSize, chip = TEMPERATURE_CHIP_DEFAULTS) {
  const phase = index / Math.max(1, fleetSize);
  const bob = Math.sin(((tick / chip.bob.periodTicks) + phase) * Math.PI * 2) * chip.bob.amplitude;
  const sway = Math.sin(((tick / chip.sway.periodTicks) + phase) * Math.PI * 2) * chip.sway.amplitude;
  return Object.freeze({ bob, sway });
}

/** Deterministic alarm-halo opacity pulse at one tick (cinemex INTERACTION_HALO_PULSE shape). */
export function resolveChipHaloPulse(tick = 0, pulse = TEMPERATURE_CHIP_DEFAULTS.haloPulse) {
  const unit = (Math.sin((tick / pulse.period) * Math.PI * 2) + 1) / 2;
  return Object.freeze({
    opacity: pulse.minOpacity + (pulse.maxOpacity - pulse.minOpacity) * unit,
  });
}

function traceRoundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

/**
 * @param {object} opts
 * @param {Array<{id:string, position:[number,number,number], zone?:string}>} opts.units
 * @param {(id:string) => number} opts.readTemperature   live reading for one unit (finite).
 * @param {(id:string) => boolean} [opts.isAlarm]        alarm state for one unit.
 * @param {object|null} [opts.envelope]                  createChipEnvelope() result, or null to
 *                                                       skip the exterior gate (always visible).
 * @param {Document} [opts.documentObject]
 * @param {object} [opts.config]                         overrides of TEMPERATURE_CHIP_DEFAULTS.
 * @param {(value:number) => string} [opts.formatReading]
 * @returns {{ group, chips, chipsById, refreshReadings, setTick, setCameraPosition, getStats, dispose }}
 */
export function createTemperatureChips({
  units = [],
  readTemperature,
  isAlarm = () => false,
  envelope = null,
  documentObject = globalThis.document,
  config = {},
  formatReading = formatChipTemperature,
} = {}) {
  if (typeof readTemperature !== 'function') {
    throw new TypeError('readTemperature(id) is required.');
  }
  if (!documentObject?.createElement) {
    throw new TypeError('Temperature chips need a document with createElement.');
  }
  const chipConfig = {
    ...TEMPERATURE_CHIP_DEFAULTS,
    ...config,
    colors: { ...TEMPERATURE_CHIP_DEFAULTS.colors, ...(config.colors ?? {}) },
  };

  const group = new THREE.Group();
  group.name = 'temperature-chips';
  // Hidden until a camera position proves the exterior (envelope given); visible otherwise.
  group.visible = envelope === null;

  // One shared halo texture for every chip (flat white; the tint rides the material color).
  const haloCanvas = documentObject.createElement('canvas');
  haloCanvas.width = chipConfig.haloCanvas.width;
  haloCanvas.height = chipConfig.haloCanvas.height;
  const haloContext = haloCanvas.getContext('2d');
  haloContext.fillStyle = 'rgba(255, 255, 255, 1)';
  haloContext.shadowColor = 'rgba(255, 255, 255, 1)';
  haloContext.shadowBlur = 24;
  traceRoundedRect(haloContext, 24, 14, haloCanvas.width - 48, haloCanvas.height - 28, 14);
  haloContext.fill();
  haloContext.fill();
  const haloTexture = new THREE.CanvasTexture(haloCanvas);
  if ('SRGBColorSpace' in THREE) haloTexture.colorSpace = THREE.SRGBColorSpace;

  let redraws = 0;
  const chips = units.map((unit, index) => {
    const canvas = documentObject.createElement('canvas');
    canvas.width = chipConfig.canvas.width;
    canvas.height = chipConfig.canvas.height;
    const context = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    if ('SRGBColorSpace' in THREE) texture.colorSpace = THREE.SRGBColorSpace;

    const badgeMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: false, // mandatory under an ACES rig — see header
    });
    const badge = new THREE.Sprite(badgeMaterial);
    badge.renderOrder = chipConfig.renderOrder.badge;

    const haloMaterial = new THREE.SpriteMaterial({
      map: haloTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      opacity: 0.55,
      toneMapped: false,
      color: '#60b6ff',
    });
    const halo = new THREE.Sprite(haloMaterial);
    halo.renderOrder = chipConfig.renderOrder.halo;
    halo.visible = false; // ONLY an alarm chip pulses a halo

    const width = chipConfig.width;
    const height = width * chipConfig.aspect;
    badge.scale.set(width, height, 1);
    halo.scale.set(width * 1.3, height * 1.6, 1);

    const anchor = [
      unit.position[0],
      unit.position[1] + chipConfig.anchorLift,
      unit.position[2],
    ];
    badge.position.set(anchor[0], anchor[1], anchor[2]);
    halo.position.set(anchor[0], anchor[1], anchor[2]);
    badge.userData = { unitId: unit.id, kind: 'temperature-chip', component: 'badge', anchor };
    halo.userData = { unitId: unit.id, kind: 'temperature-chip', component: 'halo', anchor };
    group.add(halo);
    group.add(badge);

    const zoneLabel = unit.zone ?? unit.id;

    // Materials are referenced directly (never via `sprite.material`) so stubbed Sprite
    // constructors in node harnesses need not mirror three's (material) signature.
    const state = {
      index, unit, badge, halo, badgeMaterial, haloMaterial,
      texture, context, canvas, zoneLabel, key: null, reading: null,
    };

    state.draw = (reading) => {
      const palette = reading.alarm ? chipConfig.colors.alarm : chipConfig.colors.normal;
      const { width: W, height: H } = canvas;
      context.clearRect(0, 0, W, H);
      // Rounded card (flat fill — stub-safe).
      const cardHeight = H * 0.62;
      context.fillStyle = palette.card;
      traceRoundedRect(context, 10, 8, W - 20, cardHeight, 22);
      context.fill();
      context.lineWidth = 5;
      context.strokeStyle = palette.border;
      traceRoundedRect(context, 10, 8, W - 20, cardHeight, 22);
      context.stroke();
      // Inverted pointer arrow, aimed at the owning unit below.
      context.fillStyle = palette.pointer;
      context.beginPath();
      context.moveTo(W / 2 - 34, 8 + cardHeight - 2);
      context.lineTo(W / 2 + 34, 8 + cardHeight - 2);
      context.lineTo(W / 2, H - 10);
      context.closePath();
      context.fill();
      // Brand line: the owning zone.
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = palette.brand;
      context.font = `700 ${Math.round(H * 0.14)}px system-ui, sans-serif`;
      context.fillText(String(zoneLabel).toUpperCase(), W / 2, 8 + cardHeight * 0.28);
      // Main line: the live reading.
      context.fillStyle = palette.main;
      context.font = `800 ${Math.round(H * 0.26)}px system-ui, sans-serif`;
      context.fillText(formatReading(reading.temperature), W / 2, 8 + cardHeight * 0.68);
      texture.needsUpdate = true;
      redraws += 1;
    };

    return state;
  });

  const chipsById = new Map(chips.map((chip) => [chip.unit.id, chip]));

  /**
   * Pull readings through the injected callbacks. A chip redraws its canvas ONLY when its
   * formatted reading or its alarm state changed — never per frame. Call on your sampling
   * cadence (a fixed tick interval keeps captures exact), not inside the rAF loop.
   */
  function refreshReadings() {
    for (const chip of chips) {
      const temperature = readTemperature(chip.unit.id);
      if (!Number.isFinite(temperature)) continue;
      const alarm = isAlarm(chip.unit.id) === true;
      const key = `${formatReading(temperature)}|${alarm}`;
      if (key === chip.key) continue;
      chip.key = key;
      chip.reading = { temperature, alarm };
      chip.draw(chip.reading);
      chip.halo.visible = alarm;
    }
  }

  /** Deterministic tick pose: bob + sway + alarm-halo pulse. Zero canvas work. */
  function setTick(tick = 0) {
    const pulse = resolveChipHaloPulse(tick, chipConfig.haloPulse);
    for (const chip of chips) {
      const pose = resolveChipPose(tick, chip.index, chips.length, chipConfig);
      const y = chip.badge.userData.anchor[1] + pose.bob;
      chip.badge.position.set(chip.badge.userData.anchor[0], y, chip.badge.userData.anchor[2]);
      chip.halo.position.set(chip.badge.userData.anchor[0], y, chip.badge.userData.anchor[2]);
      chip.badgeMaterial.rotation = pose.sway;
      chip.haloMaterial.rotation = pose.sway;
      if (chip.halo.visible) chip.haloMaterial.opacity = pulse.opacity;
    }
  }

  /** Exterior-only visibility: the whole fleet exists only for a camera OUTSIDE the envelope. */
  function setCameraPosition(position) {
    if (envelope === null || !position) return group.visible;
    group.visible = isCameraOutside(envelope, position);
    return group.visible;
  }

  function getStats() {
    return Object.freeze({ chips: chips.length, redraws });
  }

  function dispose() {
    group.parent?.remove(group);
    for (const chip of chips) {
      chip.texture.dispose?.();
      chip.badgeMaterial.dispose?.();
      chip.haloMaterial.dispose?.();
    }
    haloTexture.dispose?.();
  }

  return Object.freeze({
    group,
    chips,
    chipsById,
    refreshReadings,
    setTick,
    setCameraPosition,
    getStats,
    dispose,
  });
}

export default createTemperatureChips;
