// library: smooth-dolly  (controllers/smooth-dolly.mjs)
// source: cinemex-hvac-lorawan · src/controllers/camera.js (SMOOTH_DOLLY / resolveDollyTarget /
//         stepDollyDistance / applyDollyStep) · p6-final L2 0.78 (2026-07-14)
// what: exponential wheel-zoom smoothing. three.js OrbitControls (checked through r160) NEVER
//       damps its dolly — enableDamping covers rotate/pan only, so every wheel notch lands as an
//       instant distance step. This factory owns the zoom: wheel input accumulates a TARGET
//       distance, update(dt) approaches it exponentially along the camera→target axis.
// params: camera, orbitControls, domElement (defaults to orbitControls.domElement), minDistance /
//         maxDistance (default: the controls' own), isEnabled() gate, tuning (scalePerNotch,
//         notchDeltaPx, approachRate, restThreshold — restThreshold is in WORLD UNITS, retune it
//         for non-metre scales, e.g. voxel 0.25 m/unit scenes).
// deps: none imported — camera/controls are injected (camera.position + orbitControls.target must
//       expose {x,y,z}; any OrbitControls-shaped controls object works).
// coupling notes:
//   - The factory sets orbitControls.enableZoom = false and takes over the wheel; dispose()
//     restores it and removes the listener.
//   - Call update(dt) EVERY FRAME, BEFORE orbitControls.update(): OrbitControls re-derives its
//     spherical radius from the camera position it reads on update, so the smoothed distance
//     survives the controls' own damping pass.
//   - AUTO-DISABLE contract: preset jumps/lerps and first-person mode must never fight a stale
//     glide. Either call cancel() when entering them, or inject isEnabled() returning false while
//     they run — update() then drops the target on its next call. An exact framing is an exact
//     framing: an in-flight dolly is cancelled, never blended.
//   - `target === null` means "at rest": the glide terminates at restThreshold instead of
//     asymptoting forever, so captures settle to a byte-stable camera.

export const SMOOTH_DOLLY_DEFAULTS = Object.freeze({
  // OrbitControls' own per-notch scale (0.95^zoomSpeed) — zoom SPEED feels unchanged, only the
  // delivery becomes continuous.
  scalePerNotch: 0.95,
  notchDeltaPx: 100,
  // Exponential approach rate (1/s): ~63% of the remaining distance closes in 1/rate seconds.
  approachRate: 9,
  // Snap-to-rest distance in world units (1 cm at metre scale).
  restThreshold: 0.01,
});

/** The distance the dolly should rest at after one wheel event, clamped to [min, max]. Pure. */
export function resolveDollyTarget(
  currentTarget,
  wheelDeltaY,
  { minDistance = 0.1, maxDistance = Infinity, ...tuning } = {},
) {
  if (!Number.isFinite(currentTarget) || currentTarget <= 0) {
    throw new RangeError('A dolly target needs a positive current distance.');
  }
  const t = { ...SMOOTH_DOLLY_DEFAULTS, ...tuning };
  const notches = (Number(wheelDeltaY) || 0) / t.notchDeltaPx;
  const scaled = currentTarget * t.scalePerNotch ** -notches;
  return Math.min(maxDistance, Math.max(minDistance, scaled));
}

/** One exponential step toward the target distance. Pure, so convergence is testable. */
export function stepDollyDistance(current, target, deltaSeconds, tuning = {}) {
  const t = { ...SMOOTH_DOLLY_DEFAULTS, ...tuning };
  const safeDelta = Math.min(0.1, Math.max(0, Number(deltaSeconds) || 0));
  const blend = 1 - Math.exp(-t.approachRate * safeDelta);
  const next = current + (target - current) * blend;
  return Math.abs(next - target) <= t.restThreshold ? target : next;
}

/**
 * @param {object} opts
 * @param {object} opts.camera                three.js camera (position mutated in place).
 * @param {object} opts.orbitControls         OrbitControls-shaped: target, enableZoom,
 *                                            minDistance/maxDistance, enabled.
 * @param {HTMLElement} [opts.domElement]     wheel source (default orbitControls.domElement).
 * @param {number} [opts.minDistance]         clamp override (default: controls' minDistance).
 * @param {number} [opts.maxDistance]         clamp override (default: controls' maxDistance).
 * @param {() => boolean} [opts.isEnabled]    gate: false ⇒ wheel ignored AND in-flight glide
 *                                            cancelled (wire preset-lerp / first-person flags here).
 * @param {object} [opts.tuning]              overrides of SMOOTH_DOLLY_DEFAULTS.
 * @returns {{ update(dt:number):boolean, cancel():void, isActive():boolean,
 *             getTarget():number|null, dispose():void }}
 */
export function createSmoothDolly({
  camera,
  orbitControls,
  domElement = orbitControls?.domElement,
  minDistance,
  maxDistance,
  isEnabled = () => orbitControls.enabled !== false,
  tuning = {},
} = {}) {
  if (!camera?.position || !orbitControls?.target) {
    throw new TypeError('camera and orbitControls (with a target) are required.');
  }

  // `target === null` means "at rest" — presets and first-person never fight a stale target.
  let target = null;

  const clampRange = () => ({
    minDistance: minDistance ?? orbitControls.minDistance ?? 0.1,
    maxDistance: maxDistance ?? orbitControls.maxDistance ?? Infinity,
    ...tuning,
  });
  const currentDistance = () => Math.hypot(
    camera.position.x - orbitControls.target.x,
    camera.position.y - orbitControls.target.y,
    camera.position.z - orbitControls.target.z,
  );

  const onWheel = (event) => {
    if (!isEnabled()) return;
    event.preventDefault?.();
    target = resolveDollyTarget(target ?? currentDistance(), event.deltaY, clampRange());
  };

  const previousEnableZoom = orbitControls.enableZoom;
  if (domElement?.addEventListener) {
    orbitControls.enableZoom = false;
    domElement.addEventListener('wheel', onWheel, { passive: false });
  }

  /** One frame of glide. Call BEFORE orbitControls.update(). Returns true while gliding. */
  function update(deltaSeconds = 0) {
    if (target === null) return false;
    if (!isEnabled()) { target = null; return false; }
    const distance = currentDistance();
    if (distance <= 0) { target = null; return false; }
    const next = stepDollyDistance(distance, target, deltaSeconds, tuning);
    const scale = next / distance;
    camera.position.x = orbitControls.target.x + (camera.position.x - orbitControls.target.x) * scale;
    camera.position.y = orbitControls.target.y + (camera.position.y - orbitControls.target.y) * scale;
    camera.position.z = orbitControls.target.z + (camera.position.z - orbitControls.target.z) * scale;
    if (next === target) target = null;
    return target !== null;
  }

  /** Drop any in-flight glide (call on preset jumps/lerps and first-person entry). */
  function cancel() { target = null; }

  function dispose() {
    domElement?.removeEventListener?.('wheel', onWheel);
    orbitControls.enableZoom = previousEnableZoom;
    target = null;
  }

  return {
    update,
    cancel,
    isActive: () => target !== null,
    getTarget: () => target,
    dispose,
  };
}

export default createSmoothDolly;
