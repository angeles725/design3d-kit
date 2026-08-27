// characterization tests for the {CAD/foto/spec}→voxel→realista spine (dependency-free).
import assert from 'node:assert/strict';
import { runSpine, scanProvenance, crossCheckFrames, objectCertainty } from './pipeline-spine.mjs';
let pass = 0; const t = (n, f) => { f(); pass++; console.log('  ok -', n); };
// a minimal in-bounds, non-overlapping run carrying provenance envelopes (PROVENANCE-CONTRACT §2)
const provScene = (fp) => ({ room:{size:[12,8,4]}, objects:[ { id:'DUCT-1', type:'duct', size:[0.6,0.4,0.4], center:[3,3,2], fieldProvenance: fp } ] });

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


t("a placeholder-size object is BLOCKED at entry (strict); proceeds with strict:false", () => {
  const s = { room:{size:[12,8,4]}, objects:[
    {id:"CH-01",type:"chiller",size:[1,1,1],center:[3,6,0.5],source:{sizeSource:"placeholder"}} ] };
  const r = runSpine({ scene: s, voxelize: () => ({}), deBox: () => ({objects:[]}) });
  assert.equal(r.blockedAt, "entry:unresolved-size");
  assert.deepEqual(r.stages.entry.unresolvedSize, ["CH-01"]);
  const r2 = runSpine({ scene: s, strict:false, voxelize: () => ({cells:1}), deBox: (v,bo)=>({room:bo.room, objects: bo.objects.map(o=>({...o,material:"x"}))}) });
  assert.notEqual(r2.blockedAt, "entry:unresolved-size");
});

t('provenance envelopes thread entry->blockout; healthy snap raises no divergence flag (§5.1/§3)', () => {
  const r = runSpine({ scene: provScene({
    width:  { v:0.1016, prov:'measured', raw:0.105, snap:'imperial-4in', deltaMm:3.4 },
    height: { v:null,   prov:'absent-in-source' },
    bod:    { v:3.20,   prov:'measured' } }) });
  assert.equal(r.stages.provenance.malformed.length, 0);
  assert.equal(r.stages.provenance.divergenceFlags.length, 0); // 3.4mm < 10mm gate = healthy
  assert.equal(r.stages.blockout.provenanceCarried, 1);        // §5.1: envelopes survived entry->blockout
});

t('snap divergence >= gate flags (warn: reported not blocked; block: fail-loud); gate is configurable (§3)', () => {
  const fp = { width:{ v:0.1016, prov:'measured', raw:0.0825, snap:'imperial-4in', deltaMm:19.1 } };
  const warn = runSpine({ scene: provScene(fp) }); // default policy warn, measured gate 9mm
  assert.equal(warn.stages.provenance.divergenceFlags.length, 1);
  assert.equal(warn.stages.provenance.divergenceFlags[0].deltaMm, 19.1);
  assert.notEqual(warn.blockedAt, 'entry:snap-divergence'); // warn surfaces but does not block
  const block = runSpine({ scene: provScene(fp), divergencePolicy:'block' });
  assert.equal(block.blockedAt, 'entry:snap-divergence');
  const hiGate = runSpine({ scene: provScene(fp), snapDivergenceGateMm:25 }); // above the 4" half-step
  assert.equal(hiGate.stages.provenance.divergenceFlags.length, 0);
});

t('default snapDivergenceGateMm = 9mm (Revisor histogram valley over 2033 certified runs)', () => {
  const at = (d) => runSpine({ scene: provScene({ width:{ v:0.1016, prov:'measured', raw:0.10, snap:'imperial-4in', deltaMm:d } }) })
    .stages.provenance.divergenceFlags.length;
  assert.equal(at(9.5), 1); // just above the measured 9mm valley -> review candidate
  assert.equal(at(8.0), 0); // below the valley -> healthy (between-nominals duct), not flagged
  assert.equal(at(9.0), 1); // exactly at the gate flags (>= is inclusive)
});

t('malformed envelope violates the v-null-IFF-absent invariant -> fail-loud block (§2)', () => {
  const bad1 = runSpine({ scene: provScene({ height:{ v:0.4, prov:'absent-in-source' } }) }); // absent must be null
  assert.equal(bad1.blockedAt, 'entry:provenance-malformed');
  const bad2 = runSpine({ scene: provScene({ width:{ v:null, prov:'measured' } }) });          // measured must not be null
  assert.equal(bad2.blockedAt, 'entry:provenance-malformed');
});

t('scanProvenance unit: separates divergence flags from malformed; skips non-snap envelopes', () => {
  const objs = [
    { id:'A', fieldProvenance:{ width:{v:0.1,prov:'measured',raw:0.08,snap:'x',deltaMm:20}, height:{v:null,prov:'absent-in-source'}, bod:{v:3.2,prov:'measured'} } },
    { id:'B', fieldProvenance:{ width:{v:0.2,prov:'absent-in-source'} } }, // absent yet v!=null => malformed
  ];
  const { flags, malformed } = scanProvenance(objs, 10);
  assert.equal(flags.length, 1); assert.equal(flags[0].id, 'A'); assert.equal(flags[0].quantity, 'width');
  assert.equal(malformed.length, 1); assert.equal(malformed[0].id, 'B');
});

t('crossCheckFrames unit: same-source offsets compared; agreement passes, >gate disagreement flagged (§6)', () => {
  // agree within gate (5mm apart) on sheet 14C
  const agree = crossCheckFrames([
    { source:'14C', pipeline:'A', offset:[0.100, 0, 0] },
    { source:'14C', pipeline:'B', offset:[0.105, 0, 0] } ], 20);
  assert.equal(agree.ok, true); assert.equal(agree.checked, 1); assert.equal(agree.disagreements.length, 0);
  // disagree beyond gate: Revisor's 20.1mm on 14C
  const bad = crossCheckFrames([
    { source:'14C', pipeline:'A', offset:[0, 0, 0] },
    { source:'14C', pipeline:'B', offset:[0.0201, 0, 0] } ], 20);
  assert.equal(bad.ok, false); assert.equal(bad.disagreements[0].deltaMm, 20.1);
  // different sources are NEVER cross-compared
  const crossSrc = crossCheckFrames([
    { source:'14C', pipeline:'A', offset:[0,0,0] },
    { source:'15D', pipeline:'A', offset:[9,9,9] } ], 20);
  assert.equal(crossSrc.checked, 0); assert.equal(crossSrc.ok, true);
});

t('spine CO-REGISTER stage: agreeing frames pass; disagreeing frames fail-loud at entry (§6/P5)', () => {
  const base = { room:{size:[12,8,4]}, objects:[{id:'A',type:'x',size:[1,1,1],center:[2,2,0.5]}] };
  const ok = runSpine({ scene: { ...base, provenance:{ frames:[
    { source:'14C', pipeline:'dxf', offset:[0.10,0,0] }, { source:'14C', pipeline:'cv', offset:[0.108,0,0] } ] } } });
  assert.equal(ok.stages.coregister.checked, 1);
  assert.equal(ok.stages.coregister.disagreements.length, 0);
  assert.notEqual(ok.blockedAt, 'entry:coregister-disagreement'); // proceeds
  const fail = runSpine({ scene: { ...base, provenance:{ frames:[
    { source:'14C', pipeline:'dxf', offset:[0,0,0] }, { source:'14C', pipeline:'cv', offset:[0.025,0,0] } ] } } });
  assert.equal(fail.blockedAt, 'entry:coregister-disagreement'); // 25mm > 20mm gate
  assert.equal(fail.stages.coregister.disagreements[0].deltaMm, 25);
});

t('spine without frames skips the co-register stage (no false block)', () => {
  const r = runSpine({ scene: { room:{size:[12,8,4]}, objects:[{id:'A',type:'x',size:[1,1,1],center:[2,2,0.5]}] } });
  assert.equal(r.stages.coregister, undefined);
  assert.notEqual(r.blockedAt, 'entry:coregister-disagreement');
});

t('objectCertainty = WEAKEST envelope prov (§2): a partly-absent run summarizes as absent, not measured', () => {
  assert.equal(objectCertainty({ width:{v:0.5,prov:'measured'}, height:{v:null,prov:'absent-in-source'}, bod:{v:3,prov:'measured'} }), 'absent-in-source');
  assert.equal(objectCertainty({ width:{v:0.5,prov:'measured'}, height:{v:0.4,prov:'inferred'} }), 'inferred');
  assert.equal(objectCertainty({ width:{v:0.5,prov:'measured'}, bod:{v:3,prov:'measured'} }), 'measured');
  assert.equal(objectCertainty({}), null);            // no envelopes -> untagged, not 'measured'
  assert.equal(objectCertainty(undefined), null);
  assert.equal(objectCertainty({ width:{v:0.5,prov:'bogus'} }), null); // unknown prov ignored
});

t('spine provenance stage carries a per-object certainty summary (§2, for the viewer legend)', () => {
  const scene = { room:{size:[12,8,4]}, objects:[
    { id:'D1', type:'duct', size:[0.6,0.4,0.4], center:[3,3,2], fieldProvenance:{ width:{v:0.6,prov:'measured'}, height:{v:null,prov:'absent-in-source'} } },
    { id:'D2', type:'duct', size:[0.5,0.5,0.5], center:[8,3,2], fieldProvenance:{ width:{v:0.5,prov:'measured'}, bod:{v:3,prov:'measured'} } },
    { id:'D3', type:'duct', size:[0.4,0.4,0.4], center:[3,6,2] }, // no envelopes -> absent from the summary
  ] };
  const r = runSpine({ scene });
  assert.equal(r.stages.provenance.certainty.D1, 'absent-in-source'); // worst field wins
  assert.equal(r.stages.provenance.certainty.D2, 'measured');
  assert.equal(r.stages.provenance.certainty.D3, undefined);          // untagged object not summarized
});

console.log(`\n${pass}/${pass} pipeline-spine tests green`);
