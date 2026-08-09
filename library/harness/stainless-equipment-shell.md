# recipe/template: stainless-equipment-shell

The ~80-line standalone-HTML scaffolding a single-equipment threejs asset needs before any
geometry: doctype + `data-app-ready` flag + favicon shim + SCALE comment + HUD (name / dynamic
pass-label / dimensions) + control panel + importmap + renderer (ACES exposure 1.15, SRGB,
PCFSoftShadow, baked shadows) + hero camera + OrbitControls (autoRotate OFF) + IBL + the house
3-light rig + HemisphereLight + frontal fill + ground plane. It was duplicated VERBATIM across
18/18 nave-panccadia equipment assets — extract as a starting template so the next asset does not
re-type it.

**Coupling notes**: three.js r0.160.0 via unpkg importmap; 1 unit = 1 m; house ACES rig (exposure
1.15 — or `AgXToneMapping` exp ~0.9 for stubborn low-key metal). Bare metal reads satin from the
RoomEnvironment IBL + frontal fill; push intensity with `material.envMapIntensity` per material
(`scene.environmentIntensity` is INERT in r160 — see `brushed-stainless-recipe`).
`shadowMap.autoUpdate=false` — geometry added after the first frame needs another bake
to cast. The HUD `PASS:` label is set per pass (dynamic-label rule); do not ship it stale.

**Exemplar** — `disenos/nave-panccadia/equipos/mesa-trabajo/mesa-trabajo.html:1-90`. The template
block:

```html
<!doctype html>
<html lang="es" data-app-ready="false">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{NAME}} — nave Panccadia</title>
<link rel="icon" href="data:,">                     <!-- favicon 404 pollutes the console sidecar -->
<!-- SCALE: 1 voxel = 0.05 m · 1 unit = 1 m -->
<style>
  :root{ --bg:#06080d; --surface:rgba(10,14,22,.86); --border:rgba(0,212,170,.18);
         --text:#c8d4dc; --text-muted:#8fa0ab; --accent:#00d4aa;
         --font-mono:'JetBrains Mono',ui-monospace,'Courier New',monospace; }
  *{box-sizing:border-box} html,body{margin:0;height:100%;background:var(--bg);overflow:hidden}
  #hud{position:absolute;left:14px;top:12px;font-family:var(--font-mono);color:var(--text);
       font-size:11px;line-height:1.5;pointer-events:none;text-shadow:0 1px 2px #000}
  #hud .name{font-size:13px;color:#fff;font-weight:700} #hud .pass{color:var(--accent)}
  #hud .dim{color:var(--text-muted)}
  #panel{position:absolute;right:12px;bottom:12px;font-family:var(--font-mono);font-size:11px;
         background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px 10px;
         color:var(--text);display:flex;flex-direction:column;gap:6px}
</style>
</head>
<body>
<div id="hud">
  <div class="name">{{NAME}}</div>
  <div><span class="pass">PASS: {{PASS}}</span> <span class="dim">· {{SUBTITLE}}</span></div>
  <div class="dim">{{DIMENSIONS}}</div>
</div>
<script type="importmap">
{ "imports": {
  "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
  "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
}}
</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06080d);
scene.fog = new THREE.Fog(0x06080d, 8, 26);

const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(38, innerWidth/innerHeight, 0.1, 200);
const R = 4.4;
camera.position.set(R*Math.cos(0.73)*Math.cos(0.42), 0.5 + R*Math.sin(0.42), R*Math.sin(0.73)*Math.cos(0.42));
camera.lookAt(0, 0.42, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.target.set(0, 0.42, 0);
controls.autoRotate = false; controls.autoRotateSpeed = 0.9;   // OFF by default (gate captures need a settled frame)

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();
// scene.environmentIntensity is INERT in r160 (no-op; r164+ only). RoomEnvironment above lights the
// scene at intensity 1.0; push a bare-metal material with material.envMapIntensity (~1.9) when you build it.

const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(4, 6, 3); sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048); sun.shadow.bias = -0.0003;
sun.shadow.camera.left=-3; sun.shadow.camera.right=3; sun.shadow.camera.top=3; sun.shadow.camera.bottom=-3;
scene.add(sun);
scene.add(new THREE.DirectionalLight(0x88aaff, 0.4));
scene.add(new THREE.DirectionalLight(0x00d4aa, 0.2));
scene.add(new THREE.AmbientLight(0xffffff, 0.25));
scene.add(new THREE.HemisphereLight(0xeaf0ff, 0x2a3038, 0.7));   // lifts upward-facing stainless
// frontal fill (see brushed-stainless-recipe): lights the VERTICAL faces the top rig misses
// ... ground plane, then the equipment build ...
</script>
</body>
</html>
```

**Rules a re-implementation must keep**

1. Keep the favicon shim + `data-app-ready` flag (the P7 GLB export waits on the flag).
2. Set the HUD `PASS:` label per pass (dynamic-label rule) — never ship it stale.
3. Pair the IBL/frontal-fill values with `brushed-stainless-recipe` when the asset is bare metal.

**Evidence**: 18/18 nave-panccadia equipment assets materials PASS 0.76–0.80.
`disenos/nave-panccadia/equipos/mesa-trabajo/runs/materials-attempt2.review.json`.
