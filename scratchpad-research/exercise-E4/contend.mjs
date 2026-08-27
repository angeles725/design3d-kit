// contend.mjs — multi-agent contention harness (investigador2). Interleaves two agents' placement
// requests against one ReserveEngine; on DENY an agent tries its ranked fallbacks; else UNPLACED.
// Proves the lock arbitrates concurrent claims into a collision-free merged scene. Usage:
//   node contend.mjs <agentA.json> <agentB.json>
// agent file: { "agent":"creador1", "requests":[ {"id","size":[..],"primary":[cx,cy,cz],"fallbacks":[[..],..]} ] }
import { readFileSync, writeFileSync } from 'node:fs';
import { ReserveEngine } from './reserve-engine.mjs';
const A = JSON.parse(readFileSync(process.argv[2],'utf8'));
const B = JSON.parse(readFileSync(process.argv[3],'utf8'));
const room = (A.room||B.room||{size:[12,8,4]}).size;
const eng = new ReserveEngine(room);
const log = [], unplaced = [];
const maxLen = Math.max(A.requests.length, B.requests.length);
const queue = [];
for(let i=0;i<maxLen;i++){ if(A.requests[i]) queue.push([A.agent,A.requests[i]]); if(B.requests[i]) queue.push([B.agent,B.requests[i]]); }
for(const [agent,req] of queue){
  const cands = [req.primary, ...(req.fallbacks||[])];
  const gid = `${agent}:${req.id}`; // per-agent prefix -> disjoint ids across the merged scene
  let placed=false;
  for(let k=0;k<cands.length;k++){
    const r = eng.reserve(agent,gid,cands[k],req.size);
    if(r.ok){ log.push(`${agent}.${req.id}: GRANTED at ${JSON.stringify(cands[k])}${k>0?` (fallback #${k})`:''}`); placed=true; break; }
    log.push(`${agent}.${req.id}: ${r.reason} @ ${JSON.stringify(cands[k])}`);
  }
  if(!placed){ unplaced.push(`${agent}.${req.id}`); log.push(`${agent}.${req.id}: UNPLACED (all candidates denied)`); }
}
const scene = eng.scene();
writeFileSync(process.argv[4]||'merged-scene.json', JSON.stringify(scene,null,2));
console.log(JSON.stringify({room, placed:scene.objects.length, unplaced, log}, null, 2));
process.exit(unplaced.length? 1:0);
