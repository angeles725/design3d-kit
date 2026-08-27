// library: debox-winding  (harness/debox-winding.mjs) — de-box OUTPUT winding self-gate (investigador3, v1.19).
// source: design3d numerical pass · V1 winding review (2026-08-27). The de-box builds realista meshes from
//         several builders; a builder can ship INSIDE-OUT geometry (inward normals → wrong lighting /
//         backface-culled / invisible to a glance) — a real one was caught in superquadric (signedVolume
//         −4.12 vs +4.19) only by MANUAL cross-lane review. This gate AUTOMATES that catch: it runs the
//         kit's own signed-volume discriminator on every built part so ANY builder that flips winding
//         fails loud, no manual review needed. The geometry-winding companion to pass-parity (which gates
//         the engineering DATA); together they fully gate the de-box output (data preserved + geometry
//         not inside-out).
// deps: geom-verify's pure signedVolume (imports nothing). REPORTS-ONLY, deterministic.

import { signedVolume } from './geom-verify.mjs';

/**
 * Winding gate over de-box built parts. A CLOSED realista mesh must have OUTWARD normals (signedVolume
 * > 0); <= 0 is inside-out. Open parts (a bare tube, |V| ~ 0 relative to surface) are reported separately
 * and NOT failed — only a closed mesh's sign is load-bearing.
 * @param {{id:string, positions:ArrayLike<number>, index?:ArrayLike<number>|null, closed?:boolean}[]} parts
 *        built parts' geometry arrays (extract from each Mesh's BufferGeometry: position.array + index).
 * @param {{volEps?:number}} [opts]  |signedVolume| below volEps ⇒ treated as OPEN (not failed). Default 1e-9.
 * @returns {{ok:boolean, insideOut:{id:string, signedVolume:number}[], open:string[], checked:number}}
 */
export function checkDeBoxWinding(parts, opts = {}) {
  const volEps = opts.volEps ?? 1e-9;
  const insideOut = [];
  const open = [];
  for (const p of parts || []) {
    const v = signedVolume(p.positions, p.index ?? null);
    const isClosed = p.closed ?? (Math.abs(v) > volEps);
    if (!isClosed) { open.push(p.id); continue; }
    if (v <= 0) insideOut.push({ id: p.id, signedVolume: v });
  }
  return { ok: insideOut.length === 0, insideOut, open, checked: (parts || []).length };
}

/**
 * Thin three adapter: extract geometry arrays from a de-box Group's meshes and gate their winding.
 * @param {import('three').Object3D} group  a deBox() output group (meshes carry BufferGeometry).
 * @returns {ReturnType<typeof checkDeBoxWinding>}
 */
export function checkDeBoxGroupWinding(group, opts = {}) {
  const parts = [];
  group.traverse?.((o) => {
    const g = o.geometry;
    if (g && g.attributes && g.attributes.position) {
      parts.push({ id: o.name || o.uuid, positions: g.attributes.position.array, index: g.index ? g.index.array : null });
    }
  });
  return checkDeBoxWinding(parts, opts);
}
