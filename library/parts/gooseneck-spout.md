# module: gooseneck-spout

A swan-neck / gooseneck spout built from a quarter-or-half `TorusGeometry` arc + a straight
riser + a short down-tip cylinder. The forward-down curve is the whole read; a plain bent cylinder
misses it. Small, but already reused across two nave-panccadia assets (a metered dispenser and a
wash-basin faucet), so it earns a row.

**Params to parameterize per scene**: torus major radius `R` (arc size), tube radius `r`, arc
sweep (`Math.PI/2` quarter for a tight forward hook, `Math.PI` half for a tall faucet gooseneck),
material, and the group's mount position/rotation. Build it as a `Group` and RETURN it — never
`scene.add` inside.

**Coupling notes**: 1 unit = 1 m; sized for tabletop/equipment scale (R ~0.06–0.14). Uses the
shared `cyl(rt,rb,h,mat,seg)` primitive. Orient the arc so the sweep curves forward-down from the
head, then attach the down-tip at the arc's end.

**Exemplar / code** — `disenos/nave-panccadia/equipos/cuentalitros/cuentalitros.html:123` (reused at
`silla-lavabo/silla-lavabo.html:113`):

```js
// swan-neck dispensing spout (quarter torus curving forward-down) from the head bottom
const spout = new THREE.Group();
const arc = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.014, 10, 20, Math.PI/2), matPipe);
spout.add(arc);
const tip = cyl(0.014, 0.012, 0.12, matPipe, 12); tip.position.set(0.14, -0.06, 0); spout.add(tip);
const riser = cyl(0.014, 0.014, 0.16, matPipe, 12); riser.position.set(0, 0.08, 0); spout.add(riser);
spout.position.set(0, 0.86, 0.14); spout.rotation.y = Math.PI/2;
// return spout;  // faucet variant: half torus (Math.PI) for a taller gooseneck — silla-lavabo:113
```

**Rules a re-implementation must keep**

1. Quarter torus (`Math.PI/2`) for a tight dispenser hook; half torus (`Math.PI`) for a faucet.
2. Riser (up from the head) + arc (curving forward-down) + down-tip — the three pieces read as a
   gooseneck; a single bent cylinder does not.
3. Return the Group; never `scene.add` inside.

**Evidence**: cuentalitros materials PASS 0.76 · silla-lavabo materials PASS 0.80.
`disenos/nave-panccadia/equipos/cuentalitros/runs/materials-attempt1.review.json`.
