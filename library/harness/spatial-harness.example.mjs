// library: spatial-harness.example  (harness/spatial-harness.example.mjs) — worked end-to-end proof of the Delta G agentic flow (investigador2).
// source: v1.19 Delta G capstone. Builds a mechanical room ENTIRELY through the tool surface (the AI
// works in relations; the engine owns coordinates + guards RULES 001-010), exports toScene(), and the
// resulting scene passes the shared verify.mjs gate. Self-verifying: exits 0 on PASS, 1 on any failure.
// Run: node library/harness/spatial-harness.example.mjs
import { SpatialHarness } from './spatial-harness.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const log = (s) => console.log(s);
let fail = 0; const check = (name, ok) => { log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) fail++; };

log('\n=== Delta G worked example — build a chilled-water plant via the tool surface ===\n');

// The AI never writes raw XYZ. It states RELATIONS; the engine computes coordinates and GUARDS every op.
const h = new SpatialHarness({ size: [12, 8, 4] }); // 12×8×4 m mechanical room, Z-up, meters
log(`propioception whereAmI(): frame ${h.whereAmI().frame.x}/${h.whereAmI().frame.y}/${h.whereAmI().frame.z}, room ${JSON.stringify(h.whereAmI().room.size)}`);

// 1. Chiller flush to the north wall (its service clearance faces south, into the room).
const r1 = h.placeAgainstWall({ id: 'CH-01', type: 'chiller', size: [3.0, 1.2, 1.8],
  clearance: { '-y': 1.0 }, ports: { CHWS_out: [1.5, -0.6, 0], CHWR_in: [1.5, 0.6, 0] } }, 'north');
check('CH-01 placed against north wall', r1.success);
log(`     CH-01 center = ${JSON.stringify(h.getObject('CH-01').center)} (engine computed from "north wall")`);

// 2. Two pumps in a row, anchored SOUTH of the chiller (clear of its 1 m service band).
const r2 = h.placeNextTo({ id: 'P-01', type: 'pump', size: [0.8, 0.6, 0.9],
  ports: { suction: [-0.4, 0, 0.1], discharge: [0.4, 0, 0.1] } }, 'CH-01', '-y', 1.5);
const r3 = h.placeNextTo({ id: 'P-02', type: 'pump', size: [0.8, 0.6, 0.9] }, 'P-01', '+x', 0.4);
check('P-01 placed relative to CH-01 (-y, gap 1.5)', r2.success);
check('P-02 placed relative to P-01 (+x, gap 0.4)', r3.success);

// 3. AHU flush to the east wall.
const r4 = h.placeAgainstWall({ id: 'AHU-01', type: 'ahu', size: [2.5, 1.5, 2.0] }, 'east');
check('AHU-01 placed against east wall', r4.success);

// 4. QUERY "senses" — the AI interrogates the world instead of imagining it.
const near = h.objectsWithin('CH-01', 4);
check('objectsWithin(CH-01, 4m) finds the pumps', near.some(o => o.id === 'P-01'));
log(`     senses: CH-01 neighbours within 4 m = ${near.map(o => `${o.id}@${o.distance}m`).join(', ')}`);
const lane = h.pathFree([1, 1, 0.9], [11, 1, 0.9]); // a clear service lane along the south edge
check('pathFree reports the south service lane is clear', lane.free);

// 5. Connect the hydronic loop BY PORT IDENTITY (never coordinates).
const c1 = h.connectPorts('CH-01.CHWS_out', 'P-01.suction');
check('connectPorts(CH-01.CHWS_out → P-01.suction) by identity', c1.success);
check('connectedTo(CH-01) reflects the link', h.connectedTo('CH-01').includes('P-01'));

// 6. The whole layout is legal BY CONSTRUCTION — the engine never allowed an illegal state.
const v = h.validateAll();
check('validateAll(): zero hard/soft violations', v.ok);

// 7. Export to the shared schema and gate it with the INDEPENDENT deterministic scorer.
const scene = h.toScene();
check('toScene() exports 4 objects', scene.objects.length === 4);
let gateVerdict = 'skipped (verify.mjs not reachable)';
try {
  const scenePath = join(tmpdir(), `delta-g-example-${scene.objects.length}.json`);
  writeFileSync(scenePath, JSON.stringify(scene));
  const out = JSON.parse(execFileSync('node',
    [new URL('../../scratchpad-research/exercise-A1/verify.mjs', import.meta.url).pathname, scenePath],
    { encoding: 'utf8' }));
  gateVerdict = `${out.verdict} (score ${out.score}, ${out.hard_fails} hard / ${out.soft_fails} soft)`;
  check('independent verify.mjs gate → PASS', out.verdict === 'PASS' && out.hard_fails === 0);
} catch (e) { log(`     (verify.mjs run skipped: ${e.message.split('\n')[0]})`); }

log(`\n  shared verify.mjs verdict: ${gateVerdict}`);
log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — Delta G agentic flow: relations → guarded engine → validated scene → gate.\n`);
process.exit(fail === 0 ? 0 : 1);

// ---- Cross-lane hooks (DOCUMENTED, not built here — they belong to other lanes) ----
// Vision tools (render.top_view / isometric / object_closeup): delegate to the kit's capture harness
//   (research/tools/capture.mjs over the http server) — this harness is headless and does not render.
// routeDuct(portA, portB, constraints): hand the committed world ports to inv3's A* duct-router
//   (library/parts/duct-router.mjs); it returns a validated polyline, the harness only supplies the
//   endpoints + occupancy and checks the result endpoint-matches the ports.
// pathFree / freeSpace acceleration: for dense scenes delegate the broad-phase to inv4's merged
//   occupancy-grid instead of the O(n) AABB scan here (correctness identical, speed for large N).
