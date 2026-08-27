// FRONT-SEAM e2e: the CAD ENTRY the other tests skip. Every committed axis test starts from a certified
// SCENE fixture; NONE exercises raw DXF → intake → voxel → de-box → gates. This proves the actual seam:
// readDxf emits (a) block/catalog-sized equipment objects and (b) axis-aligned duct CENTERLINES, and that
// the whole composition flows to a double-gated realista with 0 transform drift. Two real hazards it pins:
//   • voxelizePolyline THROWS on a non-axis-aligned segment → this proves intake emits axis-aligned runs.
//   • the spine size-guard BLOCKS placeholder sizes → this proves block/catalog sizing (non-placeholder)
//     reaches the voxel stage.
// The headline finding: §440 is QUANTIZATION-INVARIANT — de-box preserves transforms from the certified
// blockout, not from the lossy voxel grid, so changing voxelSize never introduces size/center drift.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readDxf } from './dxf-intake.mjs';
import { runSpine } from './pipeline-spine.mjs';
import { voxelize, voxelizePolyline } from '../parts/voxelize.mjs';
import { deBoxPlan } from '../parts/debox.mjs';

const dxf = readFileSync(new URL('./__fixtures__/front-seam-room.dxf', import.meta.url), 'utf8');
const intake = () => readDxf(dxf);   // fresh parse per test (no shared mutable state)

// box AABB → flat triangle positions (occupancy sampling; winding irrelevant here).
function boxTris(center, size) {
  const [cx, cy, cz] = center, [sx, sy, sz] = size;
  const x0 = cx-sx/2, x1 = cx+sx/2, y0 = cy-sy/2, y1 = cy+sy/2, z0 = cz-sz/2, z1 = cz+sz/2;
  const c = [[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];
  const faces = [[0,1,2,3],[4,5,6,7],[0,1,5,4],[2,3,7,6],[1,2,6,5],[0,3,7,4]];
  const out = [];
  for (const [a,b,d,e] of faces) for (const tri of [[a,b,d],[a,d,e]]) for (const vi of tri) out.push(...c[vi]);
  return out;
}
// ADAPTERS bridging runSpine's slot signatures to the concrete modules (orchestrator's lane).
const voxelizeSlot = (voxelSize) => (blockout) => {
  const positions = [];
  for (const o of blockout.objects) positions.push(...boxTris(o.center, o.size));
  const occ = voxelize(positions, undefined, { voxelSize });
  return { cells: occ.count, occ };
};
const deBoxSlot = (voxels, blockout) => ({ objects: deBoxPlan({ parts: blockout.objects }).parts });

let pass = 0; const t = (n, f) => { f(); pass++; console.log('  ok -', n); };

t('front-seam: raw DXF → readDxf → validate → voxelize → de-box → §440 gate, 0 drift, EXECUTABLE CAD entry', () => {
  const sg = intake();
  // intake certified real (block/catalog) sizes, not placeholders — the seam's precondition.
  assert.deepEqual(sg.objects.map(o => o.source.sizeSource), ['catalog', 'catalog']);
  assert.equal(sg.provenance.route, 1);

  const r = runSpine({ scene: sg, voxelize: voxelizeSlot(0.25), deBox: deBoxSlot });
  assert.equal(r.stages.entry.valid, true, JSON.stringify(r.stages.entry.violations));
  assert.deepEqual(r.stages.entry.unresolvedSize, []);          // no placeholder leaked into voxelize
  assert.ok(r.stages.voxelize.cells > 0, 'equipment voxelized to occupancy cells');
  assert.equal(r.stages.debox.objects, sg.objects.length);
  assert.equal(r.gate.ok, true);
  assert.equal(r.gate.drifts.length, 0);                        // de-box preserved every transform
  assert.equal(r.ok, true);
  assert.equal(r.provenance.route, 1);                          // Route-1 CAD provenance threads through
});

t('front-seam: per-object center/size preserved EXACTLY intake → realista (0 drift, not just within tol)', () => {
  const sg = intake();
  const realista = deBoxPlan({ parts: sg.objects }).parts;
  for (const o of sg.objects) {
    const p = realista.find(q => q.id === o.id);
    assert.deepEqual(p.center, o.center, `${o.id} center preserved`);
    assert.deepEqual(p.size, o.size, `${o.id} size preserved`);
  }
});

t('front-seam: §440 is QUANTIZATION-INVARIANT — coarser voxelSize introduces NO drift (inv1 hazard, resolved)', () => {
  const sg = intake();
  for (const voxelSize of [0.25, 0.5, 1.0]) {
    const r = runSpine({ scene: sg, voxelize: voxelizeSlot(voxelSize), deBox: deBoxSlot });
    assert.equal(r.ok, true, `voxelSize ${voxelSize} axis ok`);
    assert.equal(r.gate.drifts.length, 0, `voxelSize ${voxelSize} → 0 drift (transforms come from blockout, not voxels)`);
  }
});

t('front-seam: duct CENTERLINE → voxelizePolyline, DN survives to the section tag, conflicts empty (clean net)', () => {
  const sg = intake();
  const duct = sg.geometry.filter(g => g.layer === 'DUCT' && g.kind === 'segment');
  assert.ok(duct.length >= 1, 'intake emitted a duct centerline');
  const positions = [], index = [], sections = [];
  for (const g of duct) {
    const b = positions.length / 3;
    positions.push(...g.points[0], ...g.points[1]);
    index.push(b, b + 1);
    sections.push(200);                                         // DN200 tag for this run
  }
  const vp = voxelizePolyline(positions, index, { voxelSize: 0.25, sections });
  assert.ok(vp.count > 0, 'duct occupied cells');
  assert.equal(vp.conflicts.length, 0, 'no section disagreement on a clean network');
  // DN survives: every sectioned cell reports 200, none reports a different section.
  let sawDN = false;
  for (let x = 0; x < vp.dims[0]; x++) for (let y = 0; y < vp.dims[1]; y++) for (let z = 0; z < vp.dims[2]; z++) {
    const s = vp.sectionAt(x, y, z);
    if (s !== null) { assert.equal(s, 200, 'section tag is DN200'); sawDN = true; }
  }
  assert.ok(sawDN, 'DN200 section tag survived voxelization');
});

t('front-seam: a DIAGONAL duct run is REJECTED (Route-1 CAD is axis-aligned by contract)', () => {
  // guardrail: intake feeds axis-aligned runs; a diagonal must not silently voxelize into a staircase.
  const positions = [0,0,0, 2,2,0], index = [0,1];
  assert.throws(() => voxelizePolyline(positions, index, { voxelSize: 0.25 }), /not axis-aligned/);
});

console.log(`\n${pass}/${pass} dxf front-seam e2e tests green`);
