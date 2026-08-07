# recipe: brushed-stainless-recipe

Make headless BARE stainless read as satin metal, not black. Bare metal (metalness ~0.9) reflects
the dark house scene and, under the top-lit house rig, the vertical faces of boxy equipment reflect
the dark horizon and read BLACK. The fix is a bright IBL the metal can reflect + a frontal fill that
lights the vertical faces + a brushed roughnessMap that breaks the mirror into satin.

**Why**: lavavajillas materials-attempt1 vertical body scored 0.73 (dark) → attempt2 PASS 0.78 after
`environmentIntensity 2.15` + a frontal `DirectionalLight` fill (feature `stainless-body-read`).
The identical recipe was re-derived and duplicated across 16/18 assets of the nave-panccadia
equipment catalog — extracted here so the next equipment asset does not re-type it.

**Coupling notes**: assumes the house ACES rig (`ACESFilmicToneMapping`, exposure ~1.15) and 1
unit = 1 m. `environmentIntensity` is the knob — 1.9–2.15 measured good; drop it and stainless goes
dark. Pairs with the RectAreaLight caveat: the §3.3 studio softbox stalls the SwiftShader
shader-compile, so the FRONTAL DirectionalLight fill is the headless-safe substitute (never
RectAreaLight in the headless threejs track).

**Exemplar / code** — `disenos/nave-panccadia/equipos/lavavajillas/lavavajillas.html:87-104`:

```js
scene.environmentIntensity = 2.15;   // bright IBL so metal has something to reflect
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
```

**Rules a re-implementation must keep**

1. Keep `environmentIntensity` high (~1.9–2.15) — this, not the key light, is what saves bare metal.
2. Add a FRONTAL fill (positive Z) — the house key/fill/rim light tops, not the camera-facing faces.
3. `roughness ~0.30` + a brushed roughnessMap — a mirror-smooth 0.0 metal amplifies the dark
   reflection; the brush texture reads as satin 304 and hides the reflected horizon.
4. Never RectAreaLight in the headless track (stalls SwiftShader) — the frontal DirectionalLight is
   the substitute.

**Evidence**: lavavajillas materials-attempt2 PASS 0.78 (attempt1 0.73 dark → pass); recipe reused
16/18 nave-panccadia equipment assets. `disenos/nave-panccadia/equipos/lavavajillas/runs/materials-attempt2.review.json`.
