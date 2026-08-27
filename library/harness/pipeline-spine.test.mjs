// characterization tests for the {CAD/foto/spec}→voxel→realista spine (dependency-free).
import assert from 'node:assert/strict';
import { runSpine } from './pipeline-spine.mjs';
let pass = 0; const t = (n, f) => { f(); pass++; console.log('  ok -', n); };

const scene = { room:{size:[12,8,4]}, provenance:{route:1,source:'dxf'},
  objects:[
    {id:'CH-01',type:'chiller',size:[3,1.2,1.8],center:[3,6,0.9],ports:{out:[1.5,0,0]}},
    {id:'AHU-01',type:'ahu',size:[2.5,1.5,2],center:[9,5,1],ports:{in:[-1.25,0,0.5]}}
  ] };

t('entry+blockout run; voxelize PENDING without a module; provenance threaded', () => {
  const r = runSpine({ scene });
  assert.equal(r.stages.entry.valid, true);
  assert.equal(r.stages.blockout.objects, 2);
  assert.equal(r.stages.voxelize.pending, true);
  assert.equal(r.provenance.route, 1);
});

t('full spine with a transform-PRESERVING de-box → gate ok, spine ok', () => {
  const voxelize = (bo) => ({ cells: bo.objects.length * 10 });
  const deBox = (voxels, bo) => ({ room: bo.room, objects: bo.objects.map(o => ({ ...o, material:'steel', mesh:o.id+'.glb' })) });
  const r = runSpine({ scene, voxelize, deBox });
  assert.equal(r.stages.voxelize.done, true);
  assert.equal(r.stages.debox.done, true);
  assert.equal(r.ok, true); assert.equal(r.gate.ok, true); assert.equal(r.gate.drifts.length, 0);
});

t('a de-box that DRIFTS a center → gate FAIL, spine not ok (the seam this guards)', () => {
  const voxelize = () => ({ cells: 1 });
  const deBox = (voxels, bo) => ({ room: bo.room, objects: bo.objects.map((o,i) =>
    i===0 ? { ...o, center:[o.center[0]+0.5, o.center[1], o.center[2]], material:'steel' } : { ...o, material:'steel' }) });
  const r = runSpine({ scene, voxelize, deBox });
  assert.equal(r.ok, false); assert.equal(r.gate.ok, false);
  assert.ok(r.gate.drifts.some(d => d.field==='center' && d.id==='CH-01'));
});

t('an illegal blockout (overlap) is BLOCKED at entry — never voxelizes', () => {
  const bad = { room:{size:[12,8,4]}, objects:[
    {id:'A',type:'x',size:[3,3,3],center:[3,3,1.5]},
    {id:'B',type:'x',size:[3,3,3],center:[3.5,3,1.5]} ] };
  let voxelized = false;
  const r = runSpine({ scene: bad, voxelize: () => { voxelized = true; return {}; }, deBox: () => ({}) });
  assert.equal(r.blockedAt, 'entry'); assert.equal(r.stages.entry.valid, false);
  assert.equal(voxelized, false);
});

console.log(`\n${pass}/${pass} pipeline-spine tests green`);
