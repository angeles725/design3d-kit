// library: flank-segments  (harness/flank-segments.mjs) — extract raw candidate duct-flank segments (investigador4).
// A duct in 2D line-work is drawn as TWO parallel flank lines over a PDF underlay (Revisor, COB-IM2 L4: 41k-43k
// LWPOLYLINE on PDF_*/PDF2_* + discipline layers HVAC-Ductos / M-HVAC-DUCT). inv3's flank-vectorize needs those
// raw candidate segments to do the pairing + exterior-selection + width measurement. This helper does the
// geometry[] → clean [a,b] segments EXTRACTION only — NOT the pairing (that stays inv3's). Consumes dxf-intake
// output, mutates nothing. Pure-Node, offline, REPORTS only.
//
// flankSegments(sg, {layerPattern, arcSegments}) -> [{ a:[ax,ay], b:[bx,by], layer, geometryIndex }]
//   layerPattern : RegExp | (layer)=>boolean — which layers hold flank line-work. Default: PDF underlay + HVAC
//                  discipline. Curved geometry (bulge/arc/spline) is sampled into straight chord segments so a
//                  curved duct flank still yields pairable segments.

import { geometryToPolylines } from './dxf-intake.mjs';

const DEFAULT_LAYERS = /^(pdf\d*[-_]|hvac|m-?hvac)/i;   // PDF_/PDF2_ underlay + HVAC-Ductos / M-HVAC-DUCT

export function flankSegments(sg = {}, { layerPattern = DEFAULT_LAYERS, arcSegments = 8 } = {}) {
  const match = typeof layerPattern === 'function' ? layerPattern : (l) => layerPattern.test(String(l));
  const out = [];
  (sg.geometry || []).forEach((g, geometryIndex) => {
    if (!match(g.layer || '')) return;
    // sample via the certified polyline builder so bulges/arcs/splines become straight chord segments too
    const pl = geometryToPolylines({ geometry: [g] }, { arcSegments })[0];
    if (!pl || pl.length < 2) return;
    for (let i = 0; i < pl.length - 1; i++)
      out.push({ a: [pl[i][0], pl[i][1]], b: [pl[i + 1][0], pl[i + 1][1]], layer: g.layer, geometryIndex });
  });
  return out;
}
