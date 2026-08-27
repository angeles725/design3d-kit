// naive-merge.mjs — the CONTROL for E4. Two agents place their PRIMARY zones with NO shared lock
// (each blind to the other), then the lists are merged. Expect cross-agent overlaps -> HARD fails.
// Disjoint ids by per-agent prefix. Usage: node naive-merge.mjs <agentA.json> <agentB.json> [out]
import { readFileSync, writeFileSync } from 'node:fs';
const A = JSON.parse(readFileSync(process.argv[2],'utf8'));
const B = JSON.parse(readFileSync(process.argv[3],'utf8'));
const room = (A.room||B.room||{size:[12,8,4]}).size;
const objs = [];
for(const src of [A,B]) for(const r of src.requests)
  objs.push({ id:`${src.agent}:${r.id}`, size:r.size, center:r.primary }); // primary only, no arbitration
const scene = { room:{size:room}, objects:objs };
writeFileSync(process.argv[4]||'merged-naive.json', JSON.stringify(scene,null,2));
console.log(`naive merge: ${objs.length} objects, ids=${objs.map(o=>o.id).join(', ')}`);
