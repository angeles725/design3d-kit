// library: cota-binding  (harness/cota-binding.mjs) — bind sized MTEXT/TEXT cotas to duct/pipe RUNS (investigador4).
// P1b of the {CAD·photo·spec}→VOXEL→realista intake. dxf-intake extracts annotations[] + geometry centerlines,
// but a cota ("300x200", "Ø300", "BOD +3.20") is floating text until it's attached to the RUN it dimensions.
// This companion CONSUMES dxf-intake's output and NEVER mutates the certified parse — a binding-heuristic bug
// therefore can never corrupt the parse, and the heuristic is testable in isolation (route2-guard-style).
//
// Real driver (Revisor, COB-IM2 L4): all sizing is MTEXT, 0 DIMENSION entities; ~150-180 WxH + ~213-235 CFM +
// ~264-317 BOD per sheet on layer PDF_Text; ~38% of runs carry NO WxH label.
//
// bindCotasToRuns(sg, {widthGate}) -> { runs, unbound, stats }
//   runs[]    : one per centerline geometry — { geometryIndex, layer, fieldProvenance, cota }
//   unbound[] : sized cotas that bound to NO run within the gate — surfaced, never silently dropped (fail-loud)
//
// fieldProvenance follows the ratified contract (pinned container key obj.fieldProvenance). Per-quantity
// envelope { v, prov:'measured'|'inferred'|'absent-in-source', raw?, snap?, deltaMm? }, .v null iff absent:
//   - width/height : measured when a WxH cota binds; {v:null,prov:'absent-in-source'} for runs with no WxH
//   - bod          : measured when a BOD cota binds. BOD is ~99% present in source, so absent is the exception,
//                    NOT a default — we only mark it absent for a run that genuinely has no BOD label near it.
//   - topExtent    : DERIVED = bod + height; 'inferred' only when BOTH measured, else 'absent-in-source'.
// Pure-Node, offline, REPORTS only.

import { geometryToPolylines } from './dxf-intake.mjs';

// Parse an engineering cota label into its raw quantities (null when absent). Units are as-drawn (WxH/Ø in mm
// by convention; BOD in the drawing's elevation unit) — unit reconciliation is verified against real fixtures.
export function parseCota(text) {
  const s = String(text);
  const wh = s.match(/(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/);
  const dia = s.match(/[øØ⌀ϕΦ]\s*(\d+(?:\.\d+)?)/);
  const cfm = s.match(/(\d+(?:\.\d+)?)\s*CFM/i);
  const bod = s.match(/\bBOD\b\s*([+-]?\d+(?:\.\d+)?)/i);
  return {
    width: wh ? parseFloat(wh[1]) : null,
    height: wh ? parseFloat(wh[2]) : null,
    diameter: dia ? parseFloat(dia[1]) : null,
    cfm: cfm ? parseFloat(cfm[1]) : null,
    bod: bod ? parseFloat(bod[1]) : null,
  };
}

const measured = (v) => ({ v, prov: 'measured', raw: v });   // raw = as-parsed; snap/deltaMm added when P4 snapping lands
const absent = () => ({ v: null, prov: 'absent-in-source' });

// 2D point→segment and point→polyline distance (cotas are 2D labels; ignore Z).
function pointToSegment2D(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  let t = L2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function pointToPolyline2D(p, pl) {
  let m = Infinity;
  for (let i = 0; i < pl.length - 1; i++) m = Math.min(m, pointToSegment2D(p, pl[i], pl[i + 1]));
  return m;
}

export function bindCotasToRuns(sg = {}, { widthGate = 0.02, arcSegments = 8 } = {}) {
  const geometry = sg.geometry || [];
  const sized = (sg.annotations || []).filter(a => a.sizedCota && Array.isArray(a.position));

  // sample each centerline geometry into a polyline, keeping its index back into sg.geometry
  const runs = [];
  geometry.forEach((g, i) => {
    const pl = geometryToPolylines({ geometry: [g] }, { arcSegments })[0];
    if (pl && pl.length >= 2) runs.push({ geometryIndex: i, layer: g.layer, polyline: pl, cotas: [] });
  });

  // bind each sized cota to its nearest run within the gate; anything else is surfaced as unbound (fail-loud)
  const unbound = [];
  for (const a of sized) {
    let best = null, bestD = Infinity;
    for (const run of runs) { const d = pointToPolyline2D(a.position, run.polyline); if (d < bestD) { bestD = d; best = run; } }
    if (best && bestD <= widthGate) best.cotas.push({ ...parseCota(a.text), text: a.text, distance: bestD });
    else unbound.push({ text: a.text, position: a.position, nearestRunDist: bestD === Infinity ? null : bestD });
  }

  // emit per-run field provenance under the pinned envelope semantics
  const out = runs.map(run => {
    const wh = run.cotas.find(c => c.width != null);
    const bd = run.cotas.find(c => c.bod != null);
    const width = wh ? measured(wh.width) : absent();
    const height = wh ? measured(wh.height) : absent();
    const bod = bd ? measured(bd.bod) : absent();
    // topExtent = bod + height (top-of-duct elevation). DERIVED/convenience; the load-bearing pair is bod+height.
    // Unit caveat: WxH is mm, bod is the drawing's elevation unit — reconciliation verified vs real snippets.
    const topExtent = (bod.prov === 'measured' && height.prov === 'measured')
      ? { v: bod.v + height.v, prov: 'inferred', raw: bod.v + height.v }
      : absent();
    return {
      geometryIndex: run.geometryIndex, layer: run.layer,
      fieldProvenance: { width, height, bod, topExtent },
      cota: run.cotas.length ? run.cotas.map(c => c.text) : null,
    };
  });

  const stats = {
    runs: runs.length, sizedCotas: sized.length,
    bound: sized.length - unbound.length, unbound: unbound.length,
    runsWithWidth: out.filter(r => r.fieldProvenance.width.prov === 'measured').length,
    runsWithBod: out.filter(r => r.fieldProvenance.bod.prov === 'measured').length,
  };
  return { runs: out, unbound, stats };
}
