// library: route2-guard  (harness/route2-guard.mjs) — CV/photo Route-2 intake discipline as a check (investigador4).
// Makes PIPELINE §Triage's Route-2 rules EXECUTABLE (they were prose): computer-vision-on-raster is the
// last resort, everything [INFER]. CV INVENTS scale/elevation/semantics/co-registration (a SIFT similarity
// reports a spurious scale the drawing does not contain), so this guard REFUSES to let a CV-derived scene
// pass measured lengths downstream. Pure-Node, offline, REPORTS only.
//
// route2Guard(scene, {recalibration, minRasterPx}) -> { ok, errors, warnings, scale }
//   - errors if the scene is not Route-2, claims a MEASURED scale, has no recalibration for its lengths,
//     or was traced from an insufficient raster (an embedded DWG thumbnail ~256×115 does NOT qualify).
//   - scale (when a valid recalibration is given) is ALWAYS certainty:'INFER' — one known dimension, not truth.
// applyRoute2Scale(scene, scale) -> a scaled scene with EVERY length + the scene tagged [INFER].

const MIN_RASTER_PX = 400; // below this on the short axis, a raster is a thumbnail — do not trace it

export function route2Guard(scene = {}, { recalibration = null, minRasterPx = MIN_RASTER_PX } = {}) {
  const errors = [], warnings = [];
  const prov = scene.provenance || {};

  if (prov.route !== 2)
    errors.push({ reason: 'not-route-2', detail: 'route2Guard applies only to CV-derived scenes (provenance.route === 2)' });

  // a CV scene must never present a MEASURED scale — scale is [INFER] at best
  if (scene.scale && scene.scale.certainty && scene.scale.certainty !== 'INFER')
    errors.push({ reason: 'measured-scale-forbidden', detail: `CV scale certainty is '${scene.scale.certainty}', but CV invents scale — it can only be [INFER]` });

  // insufficient raster: an embedded thumbnail (~256×115) does not qualify for tracing
  const r = scene.raster || prov.raster || null;
  if (r && Number.isFinite(r.width) && Number.isFinite(r.height)) {
    const shortAxis = Math.min(r.width, r.height);
    if (shortAxis < minRasterPx)
      errors.push({ reason: 'insufficient-raster', detail: `raster short axis ${shortAxis}px < ${minRasterPx}px — a thumbnail, not a traceable drawing` });
  }

  // CV invents semantics/elevation — they may not be presented as certain
  for (const o of scene.objects || [])
    if (o.certainty && o.certainty !== 'INFER')
      warnings.push({ reason: 'cv-field-not-infer', id: o.id, detail: `object certainty '${o.certainty}' — CV-derived fields must be [INFER]` });

  // recalibration: exactly ONE known real dimension → scale; without it, lengths stay pixel-space (UNKNOWN scale)
  let scale = null;
  const hasLengths = (scene.objects || []).some(o => o.size) || (scene.geometry || []).length > 0;
  if (recalibration && Number.isFinite(recalibration.realLength) && Number.isFinite(recalibration.pixelLength) && recalibration.pixelLength > 0) {
    scale = { value: recalibration.realLength / recalibration.pixelLength, certainty: 'INFER',
      from: { ref: recalibration.ref ?? null, realLength: recalibration.realLength, pixelLength: recalibration.pixelLength } };
  } else if (hasLengths) {
    errors.push({ reason: 'no-recalibration', detail: 'Route-2 requires ONE known real dimension to recalibrate; without it lengths stay pixel-space and scale is UNKNOWN — never emit measured lengths' });
  }

  return { ok: errors.length === 0, errors, warnings, scale };
}

// Apply an [INFER] scale to a CV scene: every length is scaled and re-tagged [INFER]; refuses a non-INFER scale.
export function applyRoute2Scale(scene, scale) {
  if (!scale || scale.certainty !== 'INFER') throw new Error('route2: scale must be certainty:"INFER" (CV never yields a measured scale)');
  const s = scale.value;
  const scaleVec = (v) => v.map(x => x * s);
  const tag = (o) => ({ ...o, certainty: 'INFER', source: { ...(o.source || {}), scale: s, scaleSource: 'cv-recalibration' } });
  return {
    ...scene,
    objects: (scene.objects || []).map(o => tag({ ...o, size: o.size ? scaleVec(o.size) : o.size, center: o.center ? scaleVec(o.center) : o.center })),
    geometry: (scene.geometry || []).map(g => ({ ...g, certainty: 'INFER' })),
    scale,
    provenance: { ...(scene.provenance || {}), route: 2, source: 'cv', certainty: 'INFER' },
  };
}
