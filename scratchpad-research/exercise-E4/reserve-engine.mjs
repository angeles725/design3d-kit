// reserve-engine.mjs — deterministic spatial reservation lock (investigador2, doc §7818/§5140).
// Implements the multi-agent spatial lock: reserve(agent,id,box) GRANTS or DENIES atomically,
// first-come-wins. This is RULE 004 (no placement without validation) + RULE 010 (state updates on
// commit) as a two-phase reserve. Oracle discipline: it decides, it never repositions.
const EPS = 1e-6;
const aabb = (center,size) => ({lo:[center[0]-size[0]/2,center[1]-size[1]/2,center[2]-size[2]/2],
                                hi:[center[0]+size[0]/2,center[1]+size[1]/2,center[2]+size[2]/2]});
const hit = (A,B) => [0,1,2].every(i => Math.min(A.hi[i],B.hi[i]) - Math.max(A.lo[i],B.lo[i]) > EPS);
export class ReserveEngine {
  constructor(room, seed=[]) { this.room = room; this.held = []; for (const r of seed) this.held.push(r); }
  inBounds(b){ return b.lo.every(v=>v>=-EPS) && b.hi.every((v,i)=>v<=this.room[i]+EPS); }
  reserve(agent,id,center,size){
    const box = aabb(center,size);
    if(!this.inBounds(box)) return {ok:false,reason:'out-of-bounds'};
    for(const h of this.held) if(hit(box,h.box)) return {ok:false,reason:`denied: overlaps ${h.id}`};
    this.held.push({agent,id,center,size,box}); return {ok:true};
  }
  scene(){ return { room:{size:this.room}, objects:this.held.map(h=>({id:h.id,size:h.size,center:h.center})) }; }
}
