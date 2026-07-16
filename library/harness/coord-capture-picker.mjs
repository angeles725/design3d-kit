// library: coord-capture-picker  (harness/coord-capture-picker.mjs)
// source: cuarto-frio-safran · cuarto-3d.html:32217-32243 · client-shipped (2026); already ported
//         across designs by hand once (voxel → PBR) before this extraction.
// what: QA coordinate picker — click raycast with a 6px anti-drag threshold, FIFO sphere markers,
//       pluggable surface classifier; the standard way to capture placement coordinates in a scene.
// params: domElement (renderer.domElement), camera, targets (Object3D[] to raycast), classify(point)
//         callback (replaces the hard-coded wall-name dims of the source), filter(hit) predicate,
//         onPick(info) sink (replaces the source's innerHTML write), markerRadius, maxMarkers.
// deps: three (Raycaster, SphereGeometry, MeshBasicMaterial).
// coupling notes:
//   - The source read a global `scene`, wrote to a #coords DOM node, and classified against baked
//     room dims (LEN/DEP/HGT) — ALL decoupled into params here.
//   - Caller must add the returned `markerGroup` to the scene (builders never scene.add).
//   - Marker radius default 1.0 is SOURCE units (~0.3 m/unit custom scale) — set per scene scale.
//   - Markers use MeshBasicMaterial (unlit) so they read the same day/night; they are QA-only and
//     never castShadow, so baked-shadow scenes are unaffected.
//   - Default filter matches the source: visible Meshes with a single (non-array) material — pass
//     your own `filter` for InstancedMesh/voxel scenes.

import * as THREE from 'three';

/**
 * @param {object} opts
 * @param {HTMLElement} opts.domElement           renderer.domElement.
 * @param {THREE.Camera} opts.camera
 * @param {THREE.Object3D[]} opts.targets         roots to raycast (recursive).
 * @param {(point:THREE.Vector3, hit:object)=>string} [opts.classify]  surface label for a hit point.
 * @param {(hit:object)=>boolean} [opts.filter]   intersection predicate (default: visible single-material Mesh).
 * @param {(info:{point:THREE.Vector3|null, label:string, hit:object|null})=>void} [opts.onPick]
 *        called on every capture click (point=null when nothing was hit).
 * @param {number} [opts.markerRadius=1.0]        source-scale default; parameterize per scene.
 * @param {number} [opts.maxMarkers=6]            FIFO depth.
 * @param {boolean} [opts.enabled=true]
 * @returns {{ markerGroup: THREE.Group, setEnabled(on:boolean):void, clearMarkers():void, dispose():void }}
 */
export function createCoordCapturePicker({
  domElement,
  camera,
  targets,
  classify = () => '',
  filter = (h) => h.object.isMesh && h.object.material && !Array.isArray(h.object.material) && h.object.visible,
  onPick = () => {},
  markerRadius = 1.0,
  maxMarkers = 6,
  enabled = true,
}) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const markerGroup = new THREE.Group();
  const markerGeo = new THREE.SphereGeometry(markerRadius, 16, 12);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xff2266 });
  let on = enabled;
  let downX = 0, downY = 0;

  function addMarker(p) {
    const d = new THREE.Mesh(markerGeo, markerMat);
    d.position.copy(p);
    markerGroup.add(d);
    if (markerGroup.children.length > maxMarkers) markerGroup.remove(markerGroup.children[0]); // FIFO
  }

  function doCapture(ev) {
    const r = domElement.getBoundingClientRect();
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(targets, true).filter(filter);
    if (!hits.length) {
      onPick({ point: null, label: '', hit: null });
      return;
    }
    const p = hits[0].point;
    addMarker(p);
    onPick({ point: p.clone(), label: classify(p, hits[0]), hit: hits[0] });
  }

  const onDown = (e) => { downX = e.clientX; downY = e.clientY; };
  const onUp = (e) => {
    if (!on) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return; // anti-drag threshold
    doCapture(e);
  };
  domElement.addEventListener('pointerdown', onDown);
  domElement.addEventListener('pointerup', onUp);

  function clearMarkers() {
    while (markerGroup.children.length) markerGroup.remove(markerGroup.children[0]);
  }

  function dispose() {
    domElement.removeEventListener('pointerdown', onDown);
    domElement.removeEventListener('pointerup', onUp);
    clearMarkers();
    markerGroup.removeFromParent();
    markerGeo.dispose();
    markerMat.dispose();
  }

  return { markerGroup, setEnabled(v) { on = !!v; }, clearMarkers, dispose };
}
