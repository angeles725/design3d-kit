// END-TO-END axis test: {CAD/foto/spec}→voxel→realista through runSpine with the REAL merged modules
// (voxelize + deBoxPlan), against inv3's canonical shared fixture. Proves the axis the user asked for is
// EXECUTABLE with 0 transform drift — not a claim. The two thin ADAPTERS (orchestrator's lane) bridge
// runSpine's slot signatures to the concrete module signatures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runSpine } from './pipeline-spine.mjs';
import { voxelize } from '../parts/voxelize.mjs';
import { deBoxPlan } from '../parts/debox.mjs';
import { superquadricGrid } from '../parts/superquadric.mjs';

const fixture = JSON.parse(readFileSync(new URL('./__fixtures__/duct-network.json', import.meta.url)));

// a room that contains every object (origin at SW corner (0,0,0), the blockout convention)
function roomFor(objects, margin = 1) {
  const mx = [-Infinity, -Infinity, -Infinity];
  for (const o of objects) for (let a = 0; a < 3; a++) mx[a] = Math.max(mx[a], o.center[a] + o.size[a] / 2);
  return { size: mx.map(v => Math.ceil(v + margin)) };
}
const scene = () => ({ room: fixture.room ?? roomFor(fixture.objects), objects: fixture.objects });

// box AABB → flat triangle positions (consecutive tris; winding irrelevant for occupancy sampling).
function boxTris(center, size) {
  const [cx, cy, cz] = center, [sx, sy, sz] = size;
  const x0 = cx - sx/2, x1 = cx + sx/2, y0 = cy - sy/2, y1 = cy + sy/2, z0 = cz - sz/2, z1 = cz + sz/2;
  const c = [[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];
  const faces = [[0,1,2,3],[4,5,6,7],[0,1,5,4],[2,3,7,6],[1,2,6,5],[0,3,7,4]];
  const out = [];
  for (const [a,b,d,e] of faces) for (const tri of [[a,b,d],[a,d,e]]) for (const vi of tri) out.push(...c[vi]);
  return out;
}
// ADAPTER: runSpine's voxelize(blockout) → real voxelize(positions, indices?, opts)
const voxelizeSlot = (blockout, voxelSize = 0.25) => {
  const positions = [];
  for (const o of blockout.objects) positions.push(...boxTris(o.center, o.size));
  const occ = voxelize(positions, undefined, { voxelSize });
  return { cells: occ.count, occ };
};
// ADAPTER: runSpine's deBox(voxels, blockout) → real deBoxPlan (objects↔parts is a pure rename)
const deBoxSlot = (voxels, blockout) => ({ objects: deBoxPlan({ parts: blockout.objects }).parts });

let pass = 0; const t = (n, f) => { f(); pass++; console.log('  ok -', n); };

t('e2e: fixture → validate → voxelize → de-box → §440 gate, 0 drift, EXECUTABLE axis', () => {
  const r = runSpine({ scene: scene(), voxelize: voxelizeSlot, deBox: deBoxSlot });
  assert.equal(r.stages.entry.valid, true, JSON.stringify(r.stages.entry.violations));
  assert.deepEqual(r.stages.entry.unresolvedSize, []);        // fixture carries real sizes
  assert.ok(r.stages.voxelize.cells > 0, 'voxelize produced occupancy cells');
  assert.equal(r.stages.debox.objects, fixture.objects.length);
  assert.equal(r.gate.ok, true);
  assert.equal(r.gate.drifts.length, 0);                      // de-box preserved every transform
  assert.equal(r.ok, true);
});

t('e2e: a de-box that ROTATES a part → §440 gate FAILS (rotation now covered by the fix)', () => {
  const rotSlot = (voxels, bo) => ({ objects: deBoxPlan({ parts: bo.objects }).parts.map((p, i) =>
    i === 0 ? { ...p, rotation: [...(p.rotation || [0,0,0])].map((v, ax) => ax === 1 ? v + 45 : v) } : p) });
  const r = runSpine({ scene: scene(), voxelize: voxelizeSlot, deBox: rotSlot });
  assert.equal(r.ok, false);
  assert.ok(r.gate.drifts.some(d => d.field === 'rotation'), 'rotation drift caught');
});


// --- GATE 2 (winding) wiring: the de-box emits BUILT geometry, the spine runs checkDeBoxWinding ---
const SQ = superquadricGrid({ a:1, b:1, c:1, e1:1, e2:1, uSeg:12, vSeg:8 }); // known OUTWARD (post-#42 fix)
const reversed = (ix) => { const o = []; for (let i=0;i<ix.length;i+=3) o.push(ix[i], ix[i+2], ix[i+1]); return o; };

t('e2e winding gate: de-box emitting OUTWARD geometry passes BOTH gates', () => {
  const deBoxGeom = (voxels, bo) => ({
    objects: deBoxPlan({ parts: bo.objects }).parts,
    parts: bo.objects.map(o => ({ id:o.id, positions: SQ.positions, index: SQ.indices })),
  });
  const r = runSpine({ scene: scene(), voxelize: voxelizeSlot, deBox: deBoxGeom });
  assert.equal(r.gate.ok, true);                 // data gate (pass-parity)
  assert.equal(r.windingGate.ok, true);          // geometry gate (winding)
  assert.ok(r.stages.winding_gate.checked >= 6);
  assert.equal(r.ok, true);
});

t('e2e winding gate: an INSIDE-OUT de-box part fails gate 2 (spine not ok)', () => {
  const deBoxFlipped = (voxels, bo) => ({
    objects: deBoxPlan({ parts: bo.objects }).parts,
    parts: bo.objects.map((o, i) => ({ id:o.id, positions: SQ.positions, index: i===0 ? reversed(SQ.indices) : SQ.indices })),
  });
  const r = runSpine({ scene: scene(), voxelize: voxelizeSlot, deBox: deBoxFlipped });
  assert.equal(r.gate.ok, true);                 // data still preserved
  assert.equal(r.windingGate.ok, false);         // but geometry inside-out
  assert.ok(r.windingGate.insideOut.length >= 1);
  assert.equal(r.ok, false);                     // spine fails on EITHER gate
});

t('e2e: data-only de-box → winding gate SKIPPED (backward-compatible)', () => {
  const r = runSpine({ scene: scene(), voxelize: voxelizeSlot, deBox: deBoxSlot });
  assert.equal(r.windingGate.skipped, true);
  assert.equal(r.ok, true);
});

console.log(`\n${pass}/${pass} pipeline-spine e2e tests green`);
