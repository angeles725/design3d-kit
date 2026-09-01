// library: soft-raster (harness/soft-raster.mjs) — CPU rasterizer (GR1, v1.20).
// 3 fixed orthographic views @128px → look.png (forced-look aid; NEVER asserts a pixel).
// Budget: <2s for ~200k tris. Pure Node, zero deps (uses node:zlib only).
// Exports: rasterize(scene, opts) → { lookPng: Buffer, elapsedMs, stats }

import { deflateSync } from 'node:zlib';

// ---- CRC32 for PNG chunks -------------------------------------------------------
const _CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = _CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- Minimal PNG encoder (RGB, no alpha in file; input is RGBA for internal use) ----
function pngEncode(width, height, pixels) {
  // pixels: Uint8Array RGBA, length = width*height*4
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB color type

  const rowBytes = width * 3;
  const raw = Buffer.alloc(height * (rowBytes + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (rowBytes + 1)] = 0; // filter byte = None
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = y * (rowBytes + 1) + 1 + x * 3;
      raw[dst] = pixels[src]; raw[dst + 1] = pixels[src + 1]; raw[dst + 2] = pixels[src + 2];
    }
  }
  const comp = deflateSync(raw, { level: 1 });

  function chunk(type, data) {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.slice(4, 8 + data.length)), 8 + data.length);
    return out;
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', comp), chunk('IEND', Buffer.alloc(0))]);
}

// ---- View definitions -----------------------------------------------------------
const VIEWS = {
  front: { eye: [0, 0, -1], up: [0, 1, 0] },
  top:   { eye: [0, -1, 0], up: [0, 0, -1] },
  iso:   { eye: [1, 1, 1],  up: [0, 1, 0] },
};

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l < 1e-12 ? [0, 0, 1] : [v[0] / l, v[1] / l, v[2] / l];
}

function cross(a, b) {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}

function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }

function viewBasis(eye, up) {
  const z = normalize(eye);
  const x = normalize(cross(normalize(up), z));
  const y = cross(z, x);
  return { x, y, z };
}

// ---- AABB proxy → 12 triangles (world coords) -----------------------------------
function aabbTris(cx, cy, cz, sx, sy, sz) {
  const x0 = cx - sx/2, x1 = cx + sx/2;
  const y0 = cy - sy/2, y1 = cy + sy/2;
  const z0 = cz - sz/2, z1 = cz + sz/2;
  const v = [
    [x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],
    [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],
  ];
  const fi = [
    0,2,1, 0,3,2,  // -Z face
    4,5,6, 4,6,7,  // +Z face
    0,1,5, 0,5,4,  // -Y face
    2,3,7, 2,7,6,  // +Y face
    0,4,7, 0,7,3,  // -X face
    1,2,6, 1,6,5,  // +X face
  ];
  const tris = [];
  for (let i = 0; i < fi.length; i += 3) tris.push([v[fi[i]], v[fi[i+1]], v[fi[i+2]]]);
  return tris;
}

// ---- Collect world-space triangles from a scene ---------------------------------
function collectTris(scene) {
  const tris = [];
  for (const obj of (scene.objects || [])) {
    if (obj.positions && obj.index) {
      const P = obj.positions, I = obj.index;
      for (let i = 0; i < I.length; i += 3) {
        const a = I[i]*3, b = I[i+1]*3, c = I[i+2]*3;
        tris.push([[P[a],P[a+1],P[a+2]], [P[b],P[b+1],P[b+2]], [P[c],P[c+1],P[c+2]]]);
      }
    } else if (obj.center && obj.size) {
      tris.push(...aabbTris(...obj.center, ...obj.size));
    }
  }
  return tris;
}

// ---- Project world triangles through a view basis --------------------------------
function projectTris(worldTris, basis) {
  return worldTris.map(tri =>
    tri.map(p => ({ u: dot(p, basis.x), v: dot(p, basis.y), d: dot(p, basis.z) }))
  );
}

// ---- Rasterize projected triangles into an RGBA pixel buffer (z-buffer) ---------
const BG = 255; // background shade (white)

function rasterView(projTris, W, H) {
  const zbuf = new Float32Array(W * H).fill(Infinity);
  const pixels = new Uint8Array(W * H * 4).fill(BG); // white RGBA
  if (!projTris.length) return { pixels, drawn: 0 };

  // Compute UV bounds for auto-fit
  let uMin=Infinity, uMax=-Infinity, vMin=Infinity, vMax=-Infinity;
  for (const tri of projTris) for (const pt of tri) {
    if (pt.u < uMin) uMin = pt.u; if (pt.u > uMax) uMax = pt.u;
    if (pt.v < vMin) vMin = pt.v; if (pt.v > vMax) vMax = pt.v;
  }
  const du = uMax - uMin || 1, dv = vMax - vMin || 1;
  const pad = 0.08;
  const scale = Math.min((1 - 2*pad) * W / du, (1 - 2*pad) * H / dv);

  const toX = (u) => Math.floor((u - uMin) * scale + pad * W);
  const toY = (v) => Math.floor((vMax - v) * scale + pad * H); // V flipped

  const LIGHT = normalize([1, 2, 3]); // fixed view-space light direction
  let drawn = 0;

  for (const tri of projTris) {
    const [A, B, C] = tri;
    // View-space normal via cross product of UV+depth deltas
    const ab = [B.u-A.u, B.v-A.v, B.d-A.d];
    const ac = [C.u-A.u, C.v-A.v, C.d-A.d];
    const N = normalize([ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]]);
    const shade = Math.max(0.15, Math.abs(dot(N, LIGHT)));
    const col = Math.round(shade * 200 + 30) | 0;

    const ax = toX(A.u), ay = toY(A.v);
    const bx = toX(B.u), by = toY(B.v);
    const cx = toX(C.u), cy = toY(C.v);

    const xMin = Math.max(0, Math.min(ax, bx, cx));
    const xMax = Math.min(W - 1, Math.max(ax, bx, cx));
    const yMin = Math.max(0, Math.min(ay, by, cy));
    const yMax = Math.min(H - 1, Math.max(ay, by, cy));

    const denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(denom) < 0.5) continue;

    for (let y = yMin; y <= yMax; y++) {
      for (let x = xMin; x <= xMax; x++) {
        const w1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / denom;
        const w2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / denom;
        const w3 = 1 - w1 - w2;
        if (w1 < 0 || w2 < 0 || w3 < 0) continue;
        const depth = w1*A.d + w2*B.d + w3*C.d;
        const pi = y * W + x;
        if (depth < zbuf[pi]) {
          zbuf[pi] = depth;
          const ri = pi * 4;
          if (pixels[ri] === BG && pixels[ri+1] === BG && pixels[ri+2] === BG) drawn++;
          pixels[ri] = col; pixels[ri+1] = col; pixels[ri+2] = col; pixels[ri+3] = 255;
        }
      }
    }
  }
  return { pixels, drawn };
}

// ---- Main export ----------------------------------------------------------------

/**
 * Rasterize a scene to a contact-sheet PNG (3 orthographic views side-by-side).
 * NEVER assert specific pixel values — the raster is a forced-look aid only (Rule 7).
 * Numeric geometry authority comes from geom-verify (checkFraming / meshIntegrity).
 *
 * @param {{objects:{id:string,center?:number[],size?:number[],positions?:number[],index?:number[]}[]}} scene
 * @param {{views?:string[], res?:number}} [opts]
 *   views: list of view names (default ['front','top','iso']); res: px per view (default 128).
 * @returns {{lookPng: Buffer, elapsedMs: number, stats: {drawnPixels: number, drawnPerView: Record<string,number>}}}
 */
export function rasterize(scene, opts = {}) {
  const t0 = Date.now();
  const W = opts.res ?? 128;
  const viewNames = opts.views ?? ['front', 'top', 'iso'];

  const worldTris = collectTris(scene);

  const sheets = [];
  const drawnPerView = {};
  let drawnPixels = 0;

  for (const name of viewNames) {
    const vd = VIEWS[name] ?? VIEWS.front;
    const basis = viewBasis(vd.eye, vd.up);
    const proj = projectTris(worldTris, basis);
    const { pixels, drawn } = rasterView(proj, W, W);
    sheets.push(pixels);
    drawnPerView[name] = drawn;
    drawnPixels += drawn;
  }

  // Composite sheets side by side (horizontal strip)
  const totalW = W * sheets.length;
  const composite = new Uint8Array(totalW * W * 4).fill(BG);
  for (let s = 0; s < sheets.length; s++) {
    const src = sheets[s];
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const si = (y * W + x) * 4;
        const di = (y * totalW + s * W + x) * 4;
        composite[di] = src[si]; composite[di+1] = src[si+1];
        composite[di+2] = src[si+2]; composite[di+3] = src[si+3];
      }
    }
  }

  const lookPng = pngEncode(totalW, W, composite);
  return { lookPng, elapsedMs: Date.now() - t0, stats: { drawnPixels, drawnPerView } };
}
