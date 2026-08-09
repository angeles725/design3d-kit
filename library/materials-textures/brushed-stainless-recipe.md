# recipe: brushed-stainless-recipe

> **CORRECTION (2026-08-09 · supersedes the `environmentIntensity` claims below).**
> `scene.environmentIntensity` **does not exist in three r0.160.0** — it is a silent no-op (added at
> scene level only in r164+; verified by grepping the r0.160.0 build, research **B125 §E**). The 18/18
> assets read satin NOT because of that line (it did nothing) but because of the **RoomEnvironment IBL**
> (default intensity 1.0) + the **frontal fill** + the **brushed roughnessMap**. To actually push IBL
> intensity in r160, set **`material.envMapIntensity`** PER MATERIAL (e.g. `matSteel.envMapIntensity = 1.9`).
> For stubborn low-key metal, prefer **`AgXToneMapping`** (exposure ~0.9) over ACES — it preserves sub-0.1
> luminance. The code/rules below are kept for provenance; read every `environmentIntensity` as
> `material.envMapIntensity`.

Make headless BARE stainless read as satin metal, not black. Bare metal (metalness ~0.9) reflects
the dark house scene and, under the top-lit house rig, the vertical faces of boxy equipment reflect
the dark horizon and read BLACK. The fix is a bright IBL the metal can reflect + a frontal fill that
lights the vertical faces + a brushed roughnessMap that breaks the mirror into satin.

**Why**: lavavajillas materials-attempt1 vertical body scored 0.73 (dark) → attempt2 PASS 0.78 after
adding a frontal `DirectionalLight` fill + the brushed roughmap (feature `stainless-body-read`). The
attempt also set `environmentIntensity 2.15`, but that knob is INERT in r160 — the frontal fill and the
RoomEnvironment IBL are what lifted the score, not the intensity line.
The identical recipe was re-derived and duplicated across 16/18 assets of the nave-panccadia
equipment catalog — extracted here so the next equipment asset does not re-type it.

**Coupling notes**: assumes the house rig (`ACESFilmicToneMapping`, exposure ~1.15 — or `AgXToneMapping`
exp ~0.9 for stubborn low-key metal) and 1 unit = 1 m. The live IBL knob is `material.envMapIntensity`
(~1.9); `scene.environmentIntensity` is a NO-OP in r160. What saves bare metal is the IBL it reflects
(RoomEnvironment) + a frontal fill, not the key light. Pairs with the RectAreaLight caveat: the §3.3 studio softbox stalls the SwiftShader
shader-compile, so the FRONTAL DirectionalLight fill is the headless-safe substitute (never
RectAreaLight in the headless threejs track).

**Exemplar / code** — `disenos/nave-panccadia/equipos/lavavajillas/lavavajillas.html:87-104`:

```js
// scene.environmentIntensity is INERT in r160 (no-op — see correction at top). Push IBL PER MATERIAL
// via matSteel.envMapIntensity below. RoomEnvironment already lights the metal at intensity 1.0.
// ... house 3-light rig (key/fill/rim + ambient) ...
scene.add(new THREE.HemisphereLight(0xeaf0ff, 0x2a3038, 0.7));          // lifts upward-facing faces
const fill = new THREE.DirectionalLight(0xf4f7ff, 0.7);
fill.position.set(1.5, 2.0, 5); scene.add(fill);                       // frontal: lights VERTICAL faces

// ---- brushed-stainless roughness map (shared recipe) ----
function brushedRoughTex(){
  const c=document.createElement('canvas'); c.width=512; c.height=512; const g=c.getContext('2d');
  g.fillStyle='#565656'; g.fillRect(0,0,512,512);
  for(let i=0;i<2600;i++){ const y=Math.random()*512,len=40+Math.random()*180,x=Math.random()*512,v=120+(Math.random()*40-20);
    g.strokeStyle=`rgba(${v},${v},${v},0.16)`; g.lineWidth=Math.random()<0.5?1:0.6;
    g.beginPath(); g.moveTo(x,y); g.lineTo(x+len,y+(Math.random()*2-1)); g.stroke(); }
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(2,2); return t;
}
const roughMap = brushedRoughTex();
const matSteel = new THREE.MeshStandardMaterial({ color:0xd2d6d8, metalness:0.9, roughness:0.30, roughnessMap: roughMap });
matSteel.envMapIntensity = 1.9;   // r160 LIVE IBL knob (scene.environmentIntensity does nothing) — push the reflected RoomEnvironment
```

**Rules a re-implementation must keep**

1. Set `material.envMapIntensity` high (~1.9) — `scene.environmentIntensity` is INERT in r160 (no-op).
   The IBL the metal reflects (RoomEnvironment) + a frontal fill is what saves bare metal, not the key light.
2. Add a FRONTAL fill (positive Z) — the house key/fill/rim light tops, not the camera-facing faces.
3. `roughness ~0.30` + a brushed roughnessMap — a mirror-smooth 0.0 metal amplifies the dark
   reflection; the brush texture reads as satin 304 and hides the reflected horizon.
4. Never RectAreaLight in the headless track (stalls SwiftShader) — the frontal DirectionalLight is
   the substitute.
5. **Declare a `colorTarget` so the material read is gated OBJECTIVELY, not by a reviewer guess**
   (design3d v1.10 / research/threejs-block53 — the brushed-stainless read was measured
   reviewer-variance-dominated: an identical render scored 0.80 vs 0.57). This recipe's rendered stainless
   lands near mean sRGB `(86, 92, 97)` under the house ACES rig (measured on the v1.8 mesa/lavavajillas
   passing renders). Seed:
   ```yaml
   colorTarget:            # objective material-read anchor (gate-state enforces dE00 <= max)
     srgb: [86, 92, 97]    # RENDERED value under the house rig, NOT the albedo hex #d2d6d8
     deltaE00Max: 6.0      # ~6 = "reads as satin 304"; tighten for a hero
     crop: "500x140+1300+780"   # a flat body/top region at the spec camera (per-asset)
   ```
   The reviewer still confirms IDENTITY (hood/legs/panel present); the probe judges the value. Re-measure
   the target from a golden render's crop (`material-color-probe.mjs --target-png`) when the rig changes.

**Evidence**: lavavajillas materials-attempt2 PASS 0.78 (attempt1 0.73 dark → pass); recipe reused
16/18 nave-panccadia equipment assets. `disenos/nave-panccadia/equipos/lavavajillas/runs/materials-attempt2.review.json`.
