// js/terrain.js — the ground: a quadtree of map tiles. Near you the tiles split into smaller, sharper ones
// (down to aerial photos where they exist); far away they merge into big coarse ones. Each tile is a
// 24×24 grid lifted by the elevation tile and painted with the satellite / aerial photo.
//
// A tile shows only once its photo and elevation have arrived; until all four children of a tile are
// ready, the parent keeps showing, so the ground never has holes while it sharpens.
import * as THREE from 'three';
import { decodeTerrarium, decodeGsi, groundTile } from './geo.js';
import { getTile, Missing, bitmap, pixels, shrink } from './tiles.js';
import { SAT } from './sources.js';
import { ROOT_Z } from './plan.js';

const N = 24; // grid segments per tile
const CURV = 1 / (2 * 6371000);

// lower far-away geometry by the Earth's curvature (seen from the camera), so the horizon is round
export function curved(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `
      vec4 wpos = modelMatrix * vec4( transformed, 1.0 );
      vec2 dxz = wpos.xz - cameraPosition.xz;
      wpos.y -= dot( dxz, dxz ) * ${CURV.toExponential(6)};
      vec4 mvPosition = viewMatrix * wpos;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  mat.customProgramCacheKey = () => 'curved';
  return mat;
}
export const curveDrop = (d) => d * d * CURV;

function sample(dem, u, v) {
  const W = dem.w, H = dem.h, a = dem.data;
  const px = Math.min(W - 1, Math.max(0, u * W - 0.5)), py = Math.min(H - 1, Math.max(0, v * H - 0.5));
  const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1);
  const fx = px - x0, fy = py - y0;
  const h = (a[y0 * W + x0] * (1 - fx) + a[y0 * W + x1] * fx) * (1 - fy) + (a[y1 * W + x0] * (1 - fx) + a[y1 * W + x1] * fx) * fy;
  return h > 0 ? h : 0; // the sea (and the odd hole below sea level) is flat at 0
}

// a grid index shared in shape (each geometry gets its own copy: disposing one must not break another)
function gridIndex() {
  const S = N + 1, idx = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * S + i, b = a + 1, c = a + S, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // skirts: each edge vertex has a copy hanging below it (the material is double-sided)
  const base = S * S;
  const edges = [
    Array.from({ length: S }, (_, i) => i), // north
    Array.from({ length: S }, (_, i) => N * S + i), // south
    Array.from({ length: S }, (_, j) => j * S), // west
    Array.from({ length: S }, (_, j) => j * S + N), // east
  ];
  edges.forEach((e, k) => {
    for (let i = 0; i < N; i++) {
      const p = e[i], q = e[i + 1], ps = base + k * S + i, qs = ps + 1;
      idx.push(p, q, ps, q, qs, ps);
    }
  });
  return { idx, edges };
}
const GRID = gridIndex();

class Node {
  constructor(z, x, y, frame, plan) {
    this.z = z; this.x = x; this.y = y;
    this.key = `${z}/${x}/${y}`;
    this.rect = frame.tileRect(z, x, y);
    this.cx = (this.rect.x0 + this.rect.x1) / 2;
    this.cz = (this.rect.z0 + this.rect.z1) / 2;
    this.size = this.rect.x1 - this.rect.x0;
    this.splittable = plan.canSplit(z, x, y);
    this.hmin = 0; this.hmax = 0;
    this.mesh = null;
    this.src = null; // { img, dem } urls the mesh was built from
    this.queued = false;
    this.children = null;
    this.used = 0;
  }
}

export class Terrain {
  constructor({ scene, frame, plan, loader, renderer, splitK = 2.0, store = false }) {
    this.frame = frame;
    this.plan = plan;
    this.loader = loader;
    this.renderer = renderer;
    this.splitK = splitK;
    this.store = store;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    scene.add(this.group);
    this.res = new Map(); // url → { kind, state, value, refs, t, retryAt }
    this.roots = plan.roots().map(([z, x, y]) => new Node(z, x, y, frame, plan));
    this.queue = [];
    this.visible = new Set();
    this.lastSweep = 0;
    this.stats = { nodes: 0, visible: 0, tris: 0, loading: 0, maxZ: 0 };
    this.cam = new THREE.Vector3();
    this.maxAniso = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
    this.disposed = false;
    this.started = false;
    this.noImgMat = curved(new THREE.MeshBasicMaterial({ color: 0x6f8a5a, side: THREE.DoubleSide }));
  }

  // ---- resources (photo textures, elevation grids), shared by URL ----
  resource(url, kind, decode, prio, meta = null) {
    let r = this.res.get(url);
    const now = performance.now();
    if (r && r.state === 'error' && now > r.retryAt) r.state = 'idle';
    if (!r) { r = { kind, decode, meta, state: 'idle', value: null, refs: 0, t: now, retryAt: 0 }; this.res.set(url, r); }
    r.t = now;
    if (r.state === 'idle') {
      r.state = 'loading';
      this.loader.add(() => this.load(url, r), prio).then(
        (v) => { if (this.disposed) { this.free(r, v); return; } r.value = v; r.state = 'ok'; },
        (e) => {
          if (e instanceof Missing) r.state = 'missing';
          else { r.state = 'error'; r.retryAt = performance.now() + 15000; }
        });
    }
    return r;
  }
  async load(url, r) {
    if (this.disposed) throw new Error('disposed');
    const blob = await getTile(url, { store: this.store, signal: AbortSignal.timeout ? AbortSignal.timeout(25000) : undefined });
    if (r.kind === 'img') {
      const bmp = await bitmap(blob);
      const tex = new THREE.Texture(bmp);
      tex.flipY = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.maxAniso;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      const mat = curved(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      if (r.meta && r.meta.aerial) await this.matchTone(mat, bmp, r.meta).catch(() => {});
      return { tex, mat, bmp };
    }
    const bmp = await bitmap(blob, true);
    const px = pixels(bmp);
    const data = new Float32Array(bmp.width * bmp.height);
    (r.decode === 'gsi' ? decodeGsi : decodeTerrarium)(px, data);
    const v = { data, w: bmp.width, h: bmp.height };
    bmp.close?.();
    return v;
  }
  // aerial photos come from other cameras and seasons than the satellite mosaic: tint each one so its
  // average colour matches the satellite's for the same patch of ground (no patchwork from far away)
  async matchTone(mat, bmp, { z, x, y }) {
    const zr = Math.min(12, z), f = 2 ** (z - zr);
    const refUrl = SAT.url(zr, Math.floor(x / f), Math.floor(y / f), this.plan.year);
    if (!this.refs) this.refs = new Map();
    let ref = this.refs.get(refUrl);
    if (!ref) {
      ref = getTile(refUrl).then((b) => bitmap(b)).then((b) => { const d = shrink(b, 64); b.close?.(); return d; });
      this.refs.set(refUrl, ref);
      if (this.refs.size > 40) this.refs.delete(this.refs.keys().next().value);
    }
    const grid = await ref;
    const lin = (c) => (c / 255) ** 2.2;
    const S = 64 / f, gx = ((x % f) / f) * 64, gy = ((y % f) / f) * 64;
    const ref3 = [0, 0, 0];
    let n = 0;
    for (let j = Math.floor(gy); j < Math.max(Math.floor(gy) + 1, Math.ceil(gy + S)); j++) {
      for (let i = Math.floor(gx); i < Math.max(Math.floor(gx) + 1, Math.ceil(gx + S)); i++) {
        const k = (Math.min(63, j) * 64 + Math.min(63, i)) * 4;
        ref3[0] += lin(grid[k]); ref3[1] += lin(grid[k + 1]); ref3[2] += lin(grid[k + 2]); n++;
      }
    }
    const own = shrink(bmp, 16), me = [0, 0, 0];
    for (let k = 0; k < own.length; k += 4) { me[0] += lin(own[k]); me[1] += lin(own[k + 1]); me[2] += lin(own[k + 2]); }
    const g = [0, 1, 2].map((c) => {
      const a = ref3[c] / n, b = me[c] / 256;
      if (!(a > 0.002 && b > 0.002)) return 1;
      return Math.min(1.9, Math.max(0.5, 1 + (a / b - 1) * 0.85));
    });
    mat.color.setRGB(g[0], g[1], g[2]);
  }

  free(r, v = r.value) {
    if (!v) return;
    if (r.kind === 'img') { v.tex.dispose(); v.mat.dispose(); v.bmp.close?.(); }
    r.value = null;
  }

  // every source for a node, best first (its own zoom's aerial / satellite, then coarser ones) — built once
  cands(n, kind) {
    const key = kind === 'img' ? 'ci' : 'cd';
    if (n[key]) return n[key];
    const plan = this.plan, out = [];
    const top = Math.min(n.z, kind === 'img' ? plan.maxImgZ : plan.maxDemZ);
    for (let zz = top; zz >= ROOT_Z; zz--) {
      const s = n.z - zz, ax = n.x >> s, ay = n.y >> s;
      if (kind === 'img') {
        for (const url of plan.imageUrls(zz, ax, ay)) out.push({ url, z: zz, x: ax, y: ay, rank: top - zz, meta: { z: zz, x: ax, y: ay, aerial: !!plan.aerial && url === plan.aerial.url(zz, ax, ay) } });
      } else {
        for (const d of plan.demUrls(zz, ax, ay)) out.push({ url: d.url, decode: d.decode, z: zz, x: ax, y: ay, rank: top - zz, meta: null });
      }
    }
    return (n[key] = out);
  }

  // the best source for a node that has arrived: { r, url, z, x, y } | 'wait' | null (none anywhere)
  pick(n, kind, prio) {
    for (const c of this.cands(n, kind)) {
      const r = this.resource(c.url, kind, c.decode, prio + c.rank * 0.01, c.meta);
      if (r.state === 'ok') return { r, url: c.url, z: c.z, x: c.x, y: c.y };
      if (r.state === 'loading' || r.state === 'idle') return 'wait';
      // missing or error → the next source, then the coarser zoom
    }
    return null;
  }

  // is the node drawable? (requests what it needs, queues its mesh build)
  ready(n, prio) {
    n.used = this.now;
    const img = this.pick(n, 'img', prio), dem = this.pick(n, 'dem', prio);
    if (img === 'wait' || dem === 'wait') return !!n.mesh;
    const want = { img: img && img.url, dem: dem && dem.url };
    if (n.mesh && n.src && n.src.img === want.img && n.src.dem === want.dem) return true;
    if (!n.queued) { n.queued = true; n.want = { img, dem }; this.queue.push(n); }
    else n.want = { img, dem };
    return !!n.mesh;
  }

  build(n) {
    n.queued = false;
    const { img, dem } = n.want || {};
    if (img && img.r.state !== 'ok') return;
    if (dem && dem.r.state !== 'ok') return;
    const S = N + 1, base = S * S;
    const pos = new Float32Array((base + 4 * S) * 3), uv = new Float32Array((base + 4 * S) * 2);
    const { x0, x1, z0, z1 } = n.rect;
    const fd = dem ? 2 ** (n.z - dem.z) : 1, du = dem ? (n.x - dem.x * fd) / fd : 0, dv = dem ? (n.y - dem.y * fd) / fd : 0;
    const fi = img ? 2 ** (n.z - img.z) : 1, iu = img ? (n.x - img.x * fi) / fi : 0, iv = img ? (n.y - img.y * fi) / fi : 0;
    let hmin = Infinity, hmax = -Infinity;
    for (let j = 0; j <= N; j++) {
      const t = j / N;
      for (let i = 0; i <= N; i++) {
        const s = i / N, k = j * S + i;
        const h = dem ? sample(dem.r.value, du + s / fd, dv + t / fd) : 0;
        if (h < hmin) hmin = h;
        if (h > hmax) hmax = h;
        pos[k * 3] = x0 + (x1 - x0) * s - n.cx;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z0 + (z1 - z0) * t - n.cz;
        uv[k * 2] = iu + s / fi;
        uv[k * 2 + 1] = iv + t / fi;
      }
    }
    const skirt = Math.max(15, ((x1 - x0) / N) * 1.5);
    GRID.edges.forEach((e, ek) => {
      for (let i = 0; i < S; i++) {
        const src = e[i], dst = base + ek * S + i;
        pos[dst * 3] = pos[src * 3];
        pos[dst * 3 + 1] = pos[src * 3 + 1] - skirt;
        pos[dst * 3 + 2] = pos[src * 3 + 2];
        uv[dst * 2] = uv[src * 2];
        uv[dst * 2 + 1] = uv[src * 2 + 1];
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(GRID.idx);
    g.computeBoundingSphere();
    // far tiles sink with the curvature: grow the culling sphere by that much (the big ones: never cull)
    const reach = this.splitK * 2 * n.size;
    g.boundingSphere.radius += curveDrop(reach);
    this.release(n);
    const mesh = new THREE.Mesh(g, img ? img.r.value.mat : this.noImgMat);
    mesh.position.set(n.cx, 0, n.cz);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.frustumCulled = n.z >= 10;
    mesh.visible = false;
    this.group.add(mesh);
    n.mesh = mesh;
    n.hmin = hmin; n.hmax = hmax;
    n.src = { img: img && img.url, dem: dem && dem.url };
    n.refs = [img && img.r, dem && dem.r].filter(Boolean);
    for (const r of n.refs) r.refs++;
  }

  release(n) {
    if (n.mesh) {
      this.group.remove(n.mesh);
      n.mesh.geometry.dispose();
      n.mesh = null;
    }
    if (n.refs) for (const r of n.refs) r.refs--;
    n.refs = null;
    n.src = null;
  }

  dist(n, c) {
    const r = n.rect;
    const dx = Math.max(r.x0 - c.x, 0, c.x - r.x1), dz = Math.max(r.z0 - c.z, 0, c.z - r.z1);
    const dy = Math.max(n.hmin - c.y, 0, c.y - n.hmax);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  children(n) {
    if (!n.children) {
      const z = n.z + 1, x = n.x * 2, y = n.y * 2;
      n.children = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]].map(([cx, cy]) => {
        const c = new Node(z, cx, cy, this.frame, this.plan);
        c.hmin = n.hmin; c.hmax = n.hmax;
        return c;
      });
    }
    return n.children;
  }

  // load order: by distance measured in tile sizes, so the coarse tiles (the whole view) come first
  visit(n, c, out) {
    const d = this.dist(n, c);
    if (!this.ready(n, d / n.size)) return false;
    if (n.splittable && d < this.splitK * n.size) {
      const kids = this.children(n);
      let all = true;
      for (const k of kids) if (!this.ready(k, this.dist(k, c) / k.size)) all = false;
      if (all) {
        for (const k of kids) this.visit(k, c, out);
        return true;
      }
    }
    out.push(n);
    return true;
  }

  // call every frame with the camera's world position
  update(camPos, budgetMs = 5) {
    if (this.disposed) return;
    this.now = performance.now();
    const c = this.cam.copy(camPos);
    const out = [];
    for (const r of this.roots) this.visit(r, c, out);
    // flying may start once the ground under you is there
    const under = this.roots.find((r) => c.x >= r.rect.x0 && c.x < r.rect.x1 && c.z >= r.rect.z0 && c.z < r.rect.z1);
    this.started = !!(under ? under.mesh : this.roots.some((r) => r.mesh));
    // build queued meshes, nearest first, within the time budget
    if (this.queue.length) {
      this.queue.sort((a, b) => this.dist(a, c) - this.dist(b, c));
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < budgetMs) this.build(this.queue.shift());
    }
    const next = new Set();
    let tris = 0, maxZ = 0;
    for (const n of out) {
      if (!n.mesh) continue;
      n.mesh.visible = true;
      next.add(n);
      tris += GRID.idx.length / 3;
      if (n.z > maxZ) maxZ = n.z;
    }
    for (const n of this.visible) if (!next.has(n) && n.mesh) n.mesh.visible = false;
    this.visible = next;
    this.stats.visible = next.size;
    this.stats.tris = tris;
    this.stats.maxZ = maxZ;
    this.stats.loading = this.loader.waiting.length + this.loader.active;
    if (this.now - this.lastSweep > 2000) this.sweep();
  }

  // drop meshes, textures and elevation grids not used for a while
  sweep() {
    this.lastSweep = this.now;
    const old = this.now - 8000;
    let count = 0;
    const walk = (n) => {
      count++;
      if (n.children) {
        for (const k of n.children) walk(k);
        if (n.children.every((k) => k.used < old && !k.mesh && !k.children && !k.queued)) n.children = null;
      }
      if (n.mesh && n.used < old && !this.visible.has(n)) this.release(n);
    };
    for (const r of this.roots) walk(r);
    this.stats.nodes = count;
    let dems = 0;
    for (const [url, r] of this.res) {
      if (r.state === 'loading') continue;
      if (r.refs <= 0 && r.t < this.now - 15000) {
        this.free(r);
        this.res.delete(url);
      } else if (r.kind === 'dem' && r.state === 'ok') dems++;
    }
    // keep at most ~120 elevation grids
    if (dems > 120) {
      const list = [...this.res.entries()].filter(([, r]) => r.kind === 'dem' && r.state === 'ok' && r.refs <= 0).sort((a, b) => a[1].t - b[1].t);
      for (const [url, r] of list.slice(0, dems - 120)) { this.free(r); this.res.delete(url); }
    }
  }

  // ground height (m) under a local point, from the finest elevation tile loaded there
  heightAt(x, z) {
    const plan = this.plan;
    for (let zz = plan.maxDemZ; zz >= ROOT_Z; zz--) {
      const { tx, ty } = this.frame.tileXY(x, z, zz);
      const ix = Math.floor(tx), iy = Math.floor(ty);
      for (const d of plan.demUrls(zz, ix, iy)) {
        const r = this.res.get(d.url);
        if (r && r.state === 'ok') return { h: sample(r.value, tx - ix, ty - iy), z: zz };
      }
    }
    return { h: 0, z: -1 };
  }

  dispose() {
    this.disposed = true;
    const walk = (n) => { if (n.children) n.children.forEach(walk); this.release(n); };
    this.roots.forEach(walk);
    for (const r of this.res.values()) this.free(r);
    this.res.clear();
    this.group.removeFromParent();
    this.noImgMat.dispose();
  }
}

export { groundTile };
