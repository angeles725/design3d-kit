// characterization tests for view-composition (dependency-free; pure geometry, no three).
import assert from 'node:assert/strict';
import { lookAtPerspective, mat4mul, projectAabbToNdcBox, viewComposition, focusReadabilityFlag } from './view-composition.mjs';
let pass = 0; const t = (n, f) => { f(); pass++; console.log('  ok -', n); };

const box = (cx, cy, cz, hx, hy, hz) => ({ lo: [cx-hx, cy-hy, cz-hz], hi: [cx+hx, cy+hy, cz+hz] });
// camera at +z looking toward -z (down the axis); z=0 is IN FRONT, z>10 is BEHIND the eye.
const cam = lookAtPerspective({ eye: [0, 0, 10], target: [0, 0, 0], up: [0, 1, 0], fovDeg: 50, aspect: 1, near: 0.1, far: 100 });

t('mat4mul is column-major and identity-stable', () => {
  const I = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  assert.deepEqual(mat4mul(I, cam), cam); // I·M = M
});

t('projectAabbToNdcBox: in-front box projects to a clipped [-1,1] box; behind-eye box => null (near-plane guard)', () => {
  const front = projectAabbToNdcBox(cam, box(0,0,0, 1,1,0.1));
  assert.ok(front && front.x1 > front.x0 && front.y1 > front.y0);
  assert.ok(front.x0 >= -1 && front.x1 <= 1 && front.y0 >= -1 && front.y1 <= 1); // clipped to viewport
  const behind = projectAabbToNdcBox(cam, box(0,0,20, 1,1,1)); // z=20 is behind the eye (eye at z=10)
  assert.equal(behind, null);                                   // w<=0 corners dropped -> not in frame
});

t('viewComposition: subject alone => dominanceRatio 1, no non-subject in frame', () => {
  const comp = viewComposition(box(0,0,0, 1,1,0.1), [], cam);
  assert.ok(comp.subjectOccupancy > 0);
  assert.equal(comp.nonSubjectInFrameCount, 0);
  assert.equal(comp.nonSubjectProjectedAreaFrac, 0);
  assert.equal(comp.dominanceRatio, 1);
});

t('viewComposition: nothing visible (subject behind eye) => dominanceRatio 0', () => {
  const comp = viewComposition(box(0,0,20, 1,1,1), [], cam);
  assert.equal(comp.subjectOccupancy, 0);
  assert.equal(comp.dominanceRatio, 0); // cannot be a focus if it does not project
});

t('viewComposition reproduces the WU-L4-A failure: a small centered bay among a large network => low dominance, high count', () => {
  const subject = box(0,0,0, 0.6,0.6,0.1);            // the bay: small, centered, WELL-composed by itself
  const network = [];                                  // the 153m network: many runs tiled across the frame
  for (let gx = -6; gx <= 6; gx++) for (let gy = -6; gy <= 6; gy++) {
    if (gx === 0 && gy === 0) continue;                // skip the subject cell
    network.push(box(gx * 0.7, gy * 0.7, 0, 0.3, 0.3, 0.1));
  }
  const focus = viewComposition(subject, [], cam);     // isolated (hide correction): subject dominates
  const cluttered = viewComposition(subject, network, cam); // whole network in frame: bay is 1 of hundreds
  assert.equal(focus.dominanceRatio, 1);
  assert.ok(cluttered.dominanceRatio < 0.5, `cluttered dominance ${cluttered.dominanceRatio} should be low`);
  assert.ok(cluttered.dominanceRatio < focus.dominanceRatio);
  assert.ok(cluttered.nonSubjectInFrameCount > 20, `expected many in-frame, got ${cluttered.nonSubjectInFrameCount}`);
  assert.ok(cluttered.nonSubjectProjectedAreaFrac > focus.nonSubjectProjectedAreaFrac);
});

t('focusReadabilityFlag: flags a focus-declared view that cannot read (low dominance / too many in frame)', () => {
  const good = { dominanceRatio: 0.95, nonSubjectInFrameCount: 1 };
  const bad  = { dominanceRatio: 0.08, nonSubjectInFrameCount: 140 };
  assert.equal(focusReadabilityFlag(good, { tau: 0.5 }).flag, false);
  const f = focusReadabilityFlag(bad, { tau: 0.5, maxNonSubject: 50 });
  assert.equal(f.flag, true);
  assert.equal(f.reasons.length, 2); // both conditions trip
});

t('visible flag discriminates dim(FAIL) vs hide(PASS) with the SAME camera + SAME AABBs (Revisor catch)', () => {
  // The exact WU-L4-A subtlety: fail(dim) and pass(hide) share one camera and one AABB set — only what is
  // DRAWN differs. dominanceRatio must move only when the RENDERED set changes, not the scene set.
  const subject = box(0,0,0, 0.6,0.6,0.1);
  const network = [];
  for (let gx = -6; gx <= 6; gx++) for (let gy = -6; gy <= 6; gy++) {
    if (gx === 0 && gy === 0) continue;
    network.push(box(gx * 0.7, gy * 0.7, 0, 0.3, 0.3, 0.1));
  }
  const dimFAIL  = viewComposition(subject, network, cam);                                       // all drawn
  const hidePASS = viewComposition(subject, network.map(a => ({ ...a, visible: false })), cam);  // clipped away
  assert.ok(dimFAIL.dominanceRatio < 0.5, `dim should read low, got ${dimFAIL.dominanceRatio}`);
  assert.equal(hidePASS.dominanceRatio, 1);                 // nothing non-subject survives the clip
  assert.equal(hidePASS.nonSubjectInFrameCount, 0);
  assert.equal(hidePASS.nonSubjectProjectedAreaFrac, 0);
  // missing/true visible = included (back-compat: identical to before the flag existed)
  const explicitTrue = viewComposition(subject, network.map(a => ({ ...a, visible: true })), cam);
  assert.equal(explicitTrue.dominanceRatio, dimFAIL.dominanceRatio);
});

console.log(`\n${pass}/${pass} view-composition tests green`);
