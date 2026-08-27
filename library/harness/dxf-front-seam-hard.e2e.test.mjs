// HARD front-seam e2e: creador2's INDEPENDENT, blind-authored fixture (front-seam-hard.dxf) run through
// the same axis harness as the base front-seam test. Non-rigged input — creador2 tuned no coordinate to
// pass. It exercises every path the minimal fixture didn't:
//   • all 4 size-source classes at once: catalog (#50), ATTRIB SIZE, block-def-2d (CIRCLE #52 → Ø footprint), catalog
//   • CURVED realista builders: TANK-01 → lathe-body, P-01 → superquadric (not just boxes)
//   • an L-shaped duct run that REDUCES (DN250 → DN160) at the corner → inv3's canonical-max-section rule
//   • DN carried the DXF-native way: in the LAYER NAME (DUCT_DN250 / DUCT_DN160), parsed from the drawing
//     — not a hardcoded test constant (a strictly better test than the base fixture's inline section tag).
//
// Two-check winding division (agreed with inv3):
//   CHECK 2 (offline curved gate-power) is inv3's PR #54 (debox-winding UV-sphere). NOT duplicated here.
//   CHECK 1 (integration on three's real LatheGeometry via checkDeBoxGroupWinding) is BELOW, three-guarded:
//     runs where three is installed (inv3's env / CI-with-three), SKIP-logged in the bare-node suite so
//     there is no silent gap. inv3 independently re-runs signedVolume on the same built tank.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readDxf } from './dxf-intake.mjs';
import { runSpine } from './pipeline-spine.mjs';
import { voxelize, voxelizePolyline } from '../parts/voxelize.mjs';
import { deBoxPlan } from '../parts/debox.mjs';

const dxf = readFileSync(new URL('./__fixtures__/front-seam-hard.dxf', import.meta.url), 'utf8');
const intake = () => readDxf(dxf);

function boxTris(center, size) {
  const [cx, cy, cz] = center, [sx, sy, sz] = size;
  const x0 = cx-sx/2, x1 = cx+sx/2, y0 = cy-sy/2, y1 = cy+sy/2, z0 = cz-sz/2, z1 = cz+sz/2;
  const c = [[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];
  const faces = [[0,1,2,3],[4,5,6,7],[0,1,5,4],[2,3,7,6],[1,2,6,5],[0,3,7,4]];
  const out = [];
  for (const [a,b,d,e] of faces) for (const tri of [[a,b,d],[a,d,e]]) for (const vi of tri) out.push(...c[vi]);
  return out;
}
const voxelizeSlot = (voxelSize) => (blockout) => {
  const positions = [];
  for (const o of blockout.objects) positions.push(...boxTris(o.center, o.size));
  const occ = voxelize(positions, undefined, { voxelSize });
  return { cells: occ.count, occ };
};
const deBoxSlot = (voxels, blockout) => ({ objects: deBoxPlan({ parts: blockout.objects }).parts });

let pass = 0; const tests = []; const t = (n, f) => tests.push([n, f]);

t('hard-seam: raw DXF (4 objs, all 4 size-source classes) → full axis → §440 gate, 0 drift, EXECUTABLE', () => {
  const sg = intake();
  assert.equal(sg.objects.length, 4);
  // catalog (#50) + ATTRIB SIZE + block-def-2d (CIRCLE #52) + catalog — 0 placeholders reach voxelize.
  assert.deepEqual(sg.objects.map(o => o.source.sizeSource), ['catalog', 'attrib', 'block-def-2d', 'catalog']);
  assert.deepEqual(sg.objects.find(o => o.id === 'TANK-01').size, [1.4, 1.4, 2]); // Ø1.4 from CIRCLE r0.7 + catalog height

  const r = runSpine({ scene: sg, voxelize: voxelizeSlot(0.25), deBox: deBoxSlot });
  assert.equal(r.stages.entry.valid, true, JSON.stringify(r.stages.entry.violations));
  assert.deepEqual(r.stages.entry.unresolvedSize, []);
  assert.ok(r.stages.voxelize.cells > 0);
  assert.equal(r.stages.debox.objects, 4);
  assert.equal(r.gate.ok, true);
  assert.equal(r.gate.drifts.length, 0);
  assert.equal(r.ok, true);
  assert.equal(r.provenance.route, 1);
});

t('hard-seam: §440 quantization-invariant on the harder layout — voxelSize 0.25/0.5/1.0 all 0 drift', () => {
  const sg = intake();
  for (const voxelSize of [0.25, 0.5, 1.0]) {
    const r = runSpine({ scene: sg, voxelize: voxelizeSlot(voxelSize), deBox: deBoxSlot });
    assert.equal(r.ok, true, `voxelSize ${voxelSize}`);
    assert.equal(r.gate.drifts.length, 0, `voxelSize ${voxelSize} → 0 drift`);
  }
});

t('hard-seam: per-object center/size preserved EXACTLY intake → realista (curved builders included)', () => {
  const sg = intake();
  const realista = deBoxPlan({ parts: sg.objects }).parts;
  for (const o of sg.objects) {
    const p = realista.find(q => q.id === o.id);
    assert.deepEqual(p.center, o.center, `${o.id} center`);
    assert.deepEqual(p.size, o.size, `${o.id} size`);
  }
  // the two curved builders are actually selected (this is the winding-relevant class)
  assert.equal(realista.find(p => p.id === 'TANK-01').builder, 'lathe-body');
  assert.equal(realista.find(p => p.id === 'P-01').builder, 'superquadric');
});

t('hard-seam: L-duct REDUCER (DN250→DN160, DN from LAYER NAME) → canonical-max-section conflict at corner', () => {
  const sg = intake();
  const duct = sg.geometry.filter(g => g.kind === 'segment' && /^DUCT/.test(g.layer));
  assert.equal(duct.length, 2, 'two axis-aligned duct segments (the L)');
  const positions = [], index = [], sections = [];
  for (const g of duct) {
    const dn = parseInt(g.layer.match(/DN(\d+)/)[1], 10);   // DN parsed FROM THE DRAWING (layer name)
    const b = positions.length / 3;
    positions.push(...g.points[0], ...g.points[1]);
    index.push(b, b + 1);
    sections.push(dn);
  }
  assert.deepEqual(sections, [250, 160]);
  const vp = voxelizePolyline(positions, index, { voxelSize: 0.25, sections }); // no throw ⇒ axis-aligned
  assert.ok(vp.count > 0);
  // the reducer: the shared corner cell keeps the CANONICAL (max DN) section, records the disagreement.
  assert.ok(vp.conflicts.length >= 1, 'the DN reduction produced a section conflict');
  assert.ok(vp.conflicts.some(c => c.kept === 250 && c.dropped === 160), 'kept 250 (canonical), dropped 160');
  // both DN runs survive to their section tags; no section value other than the two DNs appears.
  let n250 = 0, n160 = 0, other = 0;
  for (let x = 0; x < vp.dims[0]; x++) for (let y = 0; y < vp.dims[1]; y++) for (let z = 0; z < vp.dims[2]; z++) {
    const s = vp.sectionAt(x, y, z);
    if (s === 250) n250++; else if (s === 160) n160++; else if (s !== null) other++;
  }
  assert.ok(n250 > 0 && n160 > 0, 'both DN250 and DN160 survive voxelization to section tags');
  assert.equal(other, 0, 'no spurious section value beyond the two authored DNs');
});

t('hard-seam CHECK 1: winding gate on the REAL three-built tank (lathe-body) — three-guarded', async () => {
  const sg = intake();
  const plan = deBoxPlan({ parts: sg.objects });
  assert.equal(plan.parts.find(p => p.id === 'TANK-01').builder, 'lathe-body'); // curved build, winding is load-bearing
  let hasThree = true; try { await import('three'); } catch { hasThree = false; }
  if (!hasThree) {
    console.log('    SKIP (three absent in bare-node suite): checkDeBoxGroupWinding on real LatheGeometry — ' +
                'offline curved gate-power is covered by debox-winding #54; inv3 re-runs signedVolume with three');
    return;
  }
  const THREE = await import('three');
  const { deBox } = await import('../parts/debox.mjs');
  const { checkDeBoxGroupWinding } = await import('./debox-winding.mjs');
  const group = await deBox({ parts: sg.objects }, new THREE.MeshStandardMaterial());
  const w = checkDeBoxGroupWinding(group);
  assert.equal(w.ok, true, 'no built part is inside-out: ' + JSON.stringify(w.insideOut));
  assert.ok(w.checked >= 4, 'every built part winding-checked');
});

for (const [n, f] of tests) { await f(); pass++; console.log('  ok -', n); }
console.log(`\n${pass}/${pass} dxf front-seam HARD e2e tests green`);
