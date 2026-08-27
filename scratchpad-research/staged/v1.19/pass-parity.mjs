// library: pass-parity  (harness/pass-parity.mjs) — voxel/spec → realistic ANTI-DRIFT gate (investigador3, v1.19).
// source: design3d numerical pass · investigacion.md §612-652 realistic-pass rule (2026-08-26): "Preserve
//         exactly transforms, bounding boxes, ports, diameters, centerlines and relations; only substitute
//         proxy geometry for high-def assets." The realistic pass is where the engineering DATA silently
//         drifts (a smoother tube, a nudged elbow, a lost port, a re-rounded DN) while still looking fine —
//         the visual gate can't catch it. This is the deterministic gate that CATCHES drift: compare the
//         realistic-pass scene against the blockout/spec source and flag every element that moved, lost a
//         port, or changed DN. The counterpart to the visual/ΔE00 gate: this guards the SPEC, not the look.
// what: checkPassParity(source, built) over two duct scenes in the ductNetworkToScene shape
//       ({objects:[{id,type,center,ports,portDN}], ...}). Reports missing/extra elements, moved centers,
//       moved/lost ports, DN changes. REPORTS-ONLY, deterministic, zero-dep. TEST jurisdiction (an
//       engineering invariant, invisible in a single render).
// deps: NONE.

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Anti-drift parity: does the realistic-pass scene preserve the blockout/spec's engineering data?
 * @param {{objects:{id:string,type:string,center:number[],ports:Record<string,number[]>,portDN:Record<string,number|string>}[]}} source
 *        the authoritative blockout / spec scene (e.g. ductNetworkToScene of the certified runs).
 * @param {typeof source} built  the realistic pass re-derived into the same scene shape.
 * @param {{posTol?:number, rotTol?:number, requireDN?:boolean}} [opts]  posTol metres (default 1e-3),
 *        rotTol radians for the rotation check (default 1e-4), requireDN (default true).
 * @returns {{ok:boolean, missing:string[], extra:string[],
 *            drifts:{id:string, field:'type'|'center'|'size'|'rotation'|'port'|'portMissing'|'dn', port?:string,
 *                    expected:any, actual:any, delta?:number}[]}}
 */
export function checkPassParity(source, built, opts = {}) {
  const posTol = opts.posTol ?? 1e-3;
  const rotTol = opts.rotTol ?? 1e-4;
  const requireDN = opts.requireDN ?? true;
  const S = new Map((source.objects || []).map((o) => [o.id, o]));
  const B = new Map((built.objects || []).map((o) => [o.id, o]));

  const missing = [...S.keys()].filter((id) => !B.has(id)).sort();
  const extra = [...B.keys()].filter((id) => !S.has(id)).sort();
  const drifts = [];

  for (const [id, s] of S) {
    const b = B.get(id);
    if (!b) continue; // reported in `missing`
    if (s.type !== b.type) drifts.push({ id, field: 'type', expected: s.type, actual: b.type });
    if (s.center && b.center) {
      const d = dist(s.center, b.center);
      if (d > posTol) drifts.push({ id, field: 'center', expected: s.center, actual: b.center, delta: d });
    }
    // GATES §440: a realista proxy that is slightly LARGER than its blockout bbox drifts SIZE (→
    // invalidates clearance); one re-oriented drifts ROTATION (→ its ports face the wrong way). Both
    // are silent-drift vectors the visual gate can't see, so §440 diffs center/rotation/size/ports.
    if (s.size && b.size) {
      const d = dist(s.size, b.size);
      if (d > posTol) drifts.push({ id, field: 'size', expected: s.size, actual: b.size, delta: d });
    }
    if (s.rotation && b.rotation) {
      const rd = Math.max(...s.rotation.map((v, i) => Math.abs(v - (b.rotation[i] ?? 0))));
      if (rd > rotTol) drifts.push({ id, field: 'rotation', expected: s.rotation, actual: b.rotation, delta: rd });
    }
    const sp = s.ports || {}, bp = b.ports || {};
    const sdn = s.portDN || {}, bdn = b.portDN || {};
    for (const label of Object.keys(sp).sort()) {
      if (!(label in bp)) { drifts.push({ id, field: 'portMissing', port: label, expected: sp[label], actual: null }); continue; }
      const d = dist(sp[label], bp[label]);
      if (d > posTol) drifts.push({ id, field: 'port', port: label, expected: sp[label], actual: bp[label], delta: d });
      if (requireDN && sdn[label] !== bdn[label]) drifts.push({ id, field: 'dn', port: label, expected: sdn[label], actual: bdn[label] });
    }
  }
  drifts.sort((u, v) => u.id.localeCompare(v.id) || u.field.localeCompare(v.field) || String(u.port).localeCompare(String(v.port)));
  return { ok: missing.length === 0 && extra.length === 0 && drifts.length === 0, missing, extra, drifts };
}
