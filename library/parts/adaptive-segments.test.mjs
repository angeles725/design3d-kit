// Pure-Node test for parts/adaptive-segments.mjs — imports only the pure math (no three).
// Run: node library/parts/adaptive-segments.test.mjs   (exit 0 = all green)
import { radialSegmentsFor, sphereSegmentsFor, lengthSegmentsFor } from './adaptive-segments.mjs';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('FAIL: ' + msg); } }
function eq(a, b, msg) { ok(a === b, `${msg} (got ${a}, want ${b})`); }

// --- radialSegmentsFor -------------------------------------------------------
eq(radialSegmentsFor(0.025, undefined), null, 'no targetEdgeLength -> null (caller keeps default)');
eq(radialSegmentsFor(0.025, 0), null, 'zero targetEdgeLength -> null');
eq(radialSegmentsFor(0, 0.02), null, 'zero radius -> null');
eq(radialSegmentsFor(-0.1, 0.02), null, 'negative radius -> null');
// 2*pi*0.1/0.02 = 31.4 -> round 31 -> clamp max 16
eq(radialSegmentsFor(0.1, 0.02), 16, 'fat pipe clamps to max 16');
// 2*pi*0.008/0.02 = 2.51 -> round 3 -> clamp min 4
eq(radialSegmentsFor(0.008, 0.02), 4, 'thin pipe clamps to min 4');
// 2*pi*0.03/0.02 = 9.42 -> round 9
eq(radialSegmentsFor(0.03, 0.02), 9, 'mid pipe lands at 9');
// custom bounds
eq(radialSegmentsFor(0.03, 0.02, { min: 4, max: 8 }), 8, 'custom max clamp');

// --- sphereSegmentsFor -------------------------------------------------------
eq(sphereSegmentsFor(0.03, undefined), null, 'sphere: no target -> null');
{
  const s = sphereSegmentsFor(0.03, 0.02); // width round(9.42)=9, height round(4.71)=5
  ok(s && s.width === 9 && s.height === 5, `sphere mid width/height (got ${JSON.stringify(s)})`);
}
{
  const s = sphereSegmentsFor(0.2, 0.02); // width 63->24, height 31->16
  ok(s && s.width === 24 && s.height === 16, `sphere large clamps (got ${JSON.stringify(s)})`);
}
{
  const s = sphereSegmentsFor(0.005, 0.02); // width 1.57->2->min6, height 0.78->1->min4
  ok(s && s.width === 6 && s.height === 4, `sphere tiny clamps to mins (got ${JSON.stringify(s)})`);
}

// --- lengthSegmentsFor -------------------------------------------------------
eq(lengthSegmentsFor(2, undefined), null, 'length: no target -> null');
eq(lengthSegmentsFor(2.0, 0.1), 20, 'length: 2.0/0.1 -> 20');
eq(lengthSegmentsFor(0.03, 0.1), 1, 'length: sub-edge run clamps to min 1');
eq(lengthSegmentsFor(100, 0.1), 256, 'length: very long run clamps to max 256');

console.log(`\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail > 0 ? 1 : 0);
