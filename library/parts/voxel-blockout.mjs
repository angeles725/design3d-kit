// library: voxel-blockout  (parts/voxel-blockout.mjs) — spec/CAD-intake → VOXEL blockout bridge (investigador4).
// Strengthens the CAD/photo/spec → VOXEL step of the pipeline (PIPELINE.md P4a blockout): turns a certified
// scene (equipment volumes from a spec, a DWG/IFC intake, or a scene_graph) into the deterministic voxel
// SPATIAL BRAIN, then emits per-semantic-code voxel lists ready for one InstancedMesh per colour — the kit's
// blockout convention (TRACK-THREEJS §Pass ladder: "all static voxels in ONE InstancedMesh per color").
// The voxel is NOT a throwaway proxy (investigacion.md thesis): it is the occupancy the solver reasons in,
// carried straight into the massing render. Pure-Node, offline, REPORTS only.
import { OccupancyGrid, CELL } from './occupancy-grid.mjs';

const NAME_OF = Object.fromEntries(Object.entries(CELL).map(([k, v]) => [v, k]));

// toBlockout(grid, {codes}) -> { voxelSize, dims, byCode:{CODE:[[cx,cy,cz],...]}, count }
// enumerates cells whose code is in `codes` as WORLD-center voxels, grouped by code (one InstancedMesh each).
export function toBlockout(grid, { codes = [CELL.OCCUPIED] } = {}) {
  const codeSet = new Set(codes);
  const byCode = {};
  for (const c of codes) byCode[NAME_OF[c]] = [];
  const h = grid.h, [nx, ny, nz] = grid.dims;
  for (let x = 0; x < nx; x++)
    for (let y = 0; y < ny; y++)
      for (let z = 0; z < nz; z++) {
        const code = grid.cells[(x * ny + y) * nz + z];
        if (codeSet.has(code)) byCode[NAME_OF[code]].push([(x + 0.5) * h, (y + 0.5) * h, (z + 0.5) * h]);
      }
  const count = Object.values(byCode).reduce((a, l) => a + l.length, 0);
  return { voxelSize: h, dims: [...grid.dims], byCode, count };
}

// sceneToBlockout(scene, opts) -> the spec/CAD-intake → voxel blockout in ONE call.
// scene = { room:{size:[X,Y,Z]}, objects:[{id,size,center,clearance?,systemCode?}] }.
// An object may carry `systemCode` (a CELL code, e.g. CELL.HVAC/PIPING) so co-located services are
// differentiated by COLOUR in the blockout (investigacion.md: differentiate services by cross-section/colour).
export function sceneToBlockout(scene, { h = 0.25, includeClearance = false } = {}) {
  const g = new OccupancyGrid(scene.room.size, h);
  const codes = new Set([CELL.OCCUPIED]);
  for (const o of scene.objects || []) {
    const code = Number.isInteger(o.systemCode) ? o.systemCode : CELL.OCCUPIED;
    g.markObject(o, code);
    codes.add(code);
  }
  if (includeClearance) { for (const o of scene.objects || []) g.markClearance(o); codes.add(CELL.CLEARANCE); }
  return toBlockout(g, { codes: [...codes] });
}

// blockoutStats(blockout) -> per-code counts + total occupied volume (m^3) — a cheap gate/QC signal.
export function blockoutStats(blockout) {
  const perCode = {}; let total = 0;
  const cellVol = blockout.voxelSize ** 3;
  for (const [name, list] of Object.entries(blockout.byCode)) { perCode[name] = list.length; total += list.length; }
  return { perCode, voxels: total, volume: Number((total * cellVol).toFixed(4)) };
}
