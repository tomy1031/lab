// js/world.js — everything you see on a course: sky, far mountains, the snow, trees, rocks, ice, kickers'
// flags, crystals, rings, signs, gates, falling snow, the spray off your edge and your shadow.
import * as THREE from 'three';
import { treeGeometry, rockGeometry, iceGeometry, logGeometry, dotTexture, snowTexture, textCanvas, FONT, wrap, merge, M } from './geo.js';
import { noise2, rng } from './course.js';

const KIND_COLOR = { blue: '#4fc8ff', green: '#5dff9a', gold: '#ffd23f' };

export class World {
  constructor(app) {
    this.app = app;
    this.scene = app.scene;
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.far = new THREE.Group(); // follows the camera: sky, stars, aurora, mountains
    this.scene.add(this.far);
    this.snowTex = snowTexture();
    this.dot = dotTexture();
    this.shadowTex = dotTexture('rgba(20,30,60,0.85)', 'rgba(20,30,60,0)');
    this.hemi = new THREE.HemisphereLight('#ffffff', '#888888', 1);
    this.sun = new THREE.DirectionalLight('#ffffff', 2);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.t = 0;
    this.signMode = 'pc';
  }

  clear() {
    const dispose = (o) => o.traverse((m) => {
      if (m.geometry) m.geometry.dispose();
      if (m.material) for (const mm of [].concat(m.material)) { if (mm.map && mm.map !== this.snowTex && mm.map !== this.dot) mm.map.dispose(); mm.dispose(); }
    });
    dispose(this.root); dispose(this.far);
    this.root.clear(); this.far.clear();
  }

  load(course, { signMode = 'pc', lessons = {} } = {}) {
    this.clear();
    this.course = course;
    this.cullable = [];
    this.signMode = signMode;
    this.lessons = lessons;
    const th = course.theme;
    this.theme = th;
    this.scene.fog = new THREE.FogExp2(th.fog, th.fogDensity);
    this.scene.background = new THREE.Color(th.fog);
    this.hemi.color.set(th.hemi[0]); this.hemi.groundColor.set(th.hemi[1]); this.hemi.intensity = th.hemi[2];
    this.sun.color.set(th.sunColor); this.sun.intensity = th.sunI;
    this.sunDir = new THREE.Vector3(...th.sun).normalize();
    this.buildSky();
    this.buildTerrain();
    this.buildForest();
    this.buildObstacles();
    this.buildCrystals();
    this.buildRings();
    this.buildFlagsAndGates();
    this.buildSigns();
    this.buildIce();
    this.buildLanterns();
    this.buildSnowfall();
    this.buildSpray();
    this.buildShadow();
  }

  // ---- sky, stars, aurora, far mountains ----
  buildSky() {
    const th = this.theme;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(th.sky[0]) }, horizon: { value: new THREE.Color(th.sky[1]) }, sunDir: { value: this.sunDir }, sunColor: { value: new THREE.Color(th.sunColor) }, night: { value: th.night ? 1 : 0 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 top, horizon, sunDir, sunColor; uniform float night; varying vec3 vDir;
        void main(){ float h = vDir.y; vec3 c = mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.5));
          if (h < 0.0) c = horizon * mix(1.0, 0.8, clamp(-h * 4.0, 0.0, 1.0));
          float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          c += sunColor * (pow(s, 900.0) * (night > 0.5 ? 1.2 : 5.0) + pow(s, 10.0) * (night > 0.5 ? 0.05 : 0.25));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.far.add(sky);
    if (th.stars) {
      const n = 1600, pos = new Float32Array(n * 3), r = rng(5);
      for (let i = 0; i < n; i++) {
        const u = r() * 2 * Math.PI, v = 0.04 + r() * 0.96, R = 1200;
        const y = v, k = Math.sqrt(1 - y * y);
        pos[i * 3] = Math.cos(u) * k * R; pos[i * 3 + 1] = y * R; pos[i * 3 + 2] = Math.sin(u) * k * R;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#dfe8ff', size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false }));
      stars.renderOrder = -9; stars.frustumCulled = false;
      this.far.add(stars);
    }
    if (th.aurora) {
      this.auroraMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
        uniforms: { t: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float t; varying vec2 vUv;
          float h(float x){ return fract(sin(x * 127.1) * 43758.5453); }
          float n(float x){ float i = floor(x), f = fract(x); return mix(h(i), h(i + 1.0), f * f * (3.0 - 2.0 * f)); }
          void main(){
            float x = vUv.x * 18.0;
            float curtain = n(x + t * 0.15) * 0.6 + n(x * 3.1 - t * 0.3) * 0.4;
            float rays = 0.55 + 0.45 * sin(vUv.x * 220.0 + n(x * 2.0 + t * 0.2) * 9.0);
            float base = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
            vec3 col = mix(vec3(0.15, 1.0, 0.55), vec3(0.6, 0.35, 1.0), smoothstep(0.35, 0.9, vUv.y));
            float a = base * curtain * rays * 0.85 * smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.92, 1.0, vUv.x));
            gl_FragColor = vec4(col * a, a);
            #include <colorspace_fragment>
          }`,
      });
      for (const [r, y, th0, len] of [[900, 200, 2.5, 1.5], [1000, 290, 3.3, 1.5], [850, 150, 3.9, 1.3]]) {
        const g = new THREE.CylinderGeometry(r, r, 320, 64, 1, true, th0, len);
        const m = new THREE.Mesh(g, this.auroraMat);
        m.position.y = y; m.renderOrder = -8; m.frustumCulled = false;
        this.far.add(m);
      }
    }
    // far mountains: a ring of peaks that never gets closer (they are kilometres away)
    const mparts = [];
    const r = rng(this.course.spec.seed + 2);
    const mc = new THREE.Color(th.mountains), haze = new THREE.Color(th.fog), top = new THREE.Color(th.night ? '#7f8fc0' : '#ffffff');
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2 + r() * 0.1, R = 900 + r() * 250, H = 180 + r() * 320, W = 160 + r() * 220;
      const g = new THREE.ConeGeometry(W, H, 6 + Math.floor(r() * 3), 3).toNonIndexed();
      const p = g.attributes.position, col = new Float32Array(p.count * 3);
      for (let k = 0; k < p.count; k++) {
        const yy = (p.getY(k) + H / 2) / H;
        const c = mc.clone().lerp(haze, 0.35 + (1 - yy) * 0.3);
        if (yy > 0.62 + noise2(p.getX(k) * 0.02, i) * 0.12) c.lerp(top, 0.75);
        col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      mparts.push([g, null, M(Math.sin(a) * R, H / 2 - 60, Math.cos(a) * R, 0, r() * 3)]);
    }
    const mountains = new THREE.Mesh(merge(mparts), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    mountains.renderOrder = -7;
    mountains.frustumCulled = false;
    this.mountains = mountains;
    this.far.add(mountains);
  }

  // ---- the snow ----
  buildTerrain() {
    const C = this.course, th = this.theme;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: this.snowTex });
    const aniso = this.app.renderer.capabilities.getMaxAnisotropy();
    this.snowTex.anisotropy = Math.min(8, aniso);
    this.snowTex.needsUpdate = true;
    const snow = new THREE.Color(th.snow), shade = new THREE.Color(th.shade), rock = new THREE.Color(th.ice ? '#7fb6d0' : '#757986');
    const ramp = new THREE.Color('#fff1de'), lip = new THREE.Color('#ff6a2a'), startC = new THREE.Color('#2f8cff'), finishC = new THREE.Color('#ff3b5c');
    const lips = C.kickers.map((k) => k.s);
    const NI = 52, OUT = [5, 12, 22, 36, 56, 84, 125, 180, 250];
    const CH = 40;
    this.terrain = new THREE.Group();
    for (let sa = C.sMin; sa < C.sMax - 1e-6; sa += CH) {
      const sb = Math.min(sa + CH, C.sMax);
      const rows = [];
      for (let s = sa; s <= sb + 1e-6; s += 1) rows.push(s);
      for (const ls of lips) if (ls > sa + 0.1 && ls < sb - 0.1) rows.push(ls - 0.03, ls + 0.03);
      rows.sort((a, b) => a - b);
      const cols = NI + 1 + OUT.length * 2;
      const nv = rows.length * cols;
      const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
      let v = 0;
      for (const s of rows) {
        const cx = C.cx(s), hw = C.hw(s), inner = hw + 10;
        const offs = [];
        for (let j = OUT.length - 1; j >= 0; j--) offs.push(-(inner + OUT[j]));
        for (let j = 0; j <= NI; j++) offs.push(-inner + (2 * inner * j) / NI);
        for (let j = 0; j < OUT.length; j++) offs.push(inner + OUT[j]);
        for (const o of offs) {
          const x = cx + o;
          const y = C.heightS(x, s);
          pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = -s;
          uv[v * 2] = x / 4.5; uv[v * 2 + 1] = s / 4.5;
          // colour: snow, darker in the forest, tinted on kickers, the lip stripe, start and finish lines
          const e = Math.abs(o) - (hw - 6);
          const c = snow.clone();
          if (e > 6) c.lerp(shade, Math.min(0.35, (e - 6) / 60));
          for (const k of C.kickers) {
            const ds = k.s - s;
            if (ds >= -0.05 && ds <= k.len && Math.abs(o - k.ox) < k.w / 2 + 1) {
              c.lerp(ds < 0.7 && ds >= 0 ? lip : ramp, ds < 0.7 && ds >= 0 ? 0.85 : 0.5);
            }
          }
          if (Math.abs(o) < hw - 5) {
            if (s >= 0 && s < 0.8) c.lerp(startC, 0.7);
            if (s >= C.length && s < C.length + 1.2) c.lerp((Math.floor(o) + (s > C.length + 0.6 ? 1 : 0)) % 2 ? finishC : snow, 0.85);
          }
          col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
          v++;
        }
      }
      const idx = [];
      for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j, b = a + 1, c2 = a + cols, d = c2 + 1;
        idx.push(a, b, c2, b, d, c2); // counter-clockwise seen from above: the snow faces up
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      // steep snow shows rock (or blue ice)
      const n = g.attributes.normal;
      for (let i = 0; i < nv; i++) {
        const ny = n.getY(i);
        if (ny < 0.72) {
          const k = Math.min(1, (0.72 - ny) / 0.2) * 0.75;
          col[i * 3] += (rock.r - col[i * 3]) * k; col[i * 3 + 1] += (rock.g - col[i * 3 + 1]) * k; col[i * 3 + 2] += (rock.b - col[i * 3 + 2]) * k;
        }
      }
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.matrixAutoUpdate = false;
      mesh.userData.range = [sa, sb];
      this.terrain.add(mesh);
      this.cullable.push(mesh);
    }
    this.root.add(this.terrain);
  }

  // instanced models in 200 m chunks (so whole chunks are culled when out of view)
  instanced(geo, mat, items, place) {
    const by = new Map();
    for (const it of items) { const k = Math.floor(it.s / 200); if (!by.has(k)) by.set(k, []); by.get(k).push(it); }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const out = [];
    for (const list of by.values()) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => {
        const o = place(it, p, e, sc, i);
        q.setFromEuler(e);
        m4.compose(p, q, sc);
        im.setMatrixAt(i, m4);
        if (o && o.color) im.setColorAt(i, o.color);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      let a = Infinity, b = -Infinity;
      for (const it of list) { a = Math.min(a, it.s); b = Math.max(b, it.s); }
      im.userData.range = [a - 10, b + 10];
      this.cullable.push(im);
      this.root.add(im);
      out.push(im);
    }
    return out;
  }

  buildForest() {
    const C = this.course;
    const geo = treeGeometry(this.theme.treeTint);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const r = rng(C.spec.seed + 9);
    const tint = new THREE.Color();
    this.instanced(geo, mat, C.trees, (t, p, e, sc) => {
      p.set(t.x, C.heightS(t.x, t.s) - 0.2, -t.s);
      e.set((r() - 0.5) * 0.08, r() * 6.28, (r() - 0.5) * 0.08);
      sc.setScalar(t.scale);
      const v = 0.85 + r() * 0.3;
      return { color: tint.setRGB(v, v, v) };
    });
  }

  buildObstacles() {
    const C = this.course;
    const rocks = C.obstacles.filter((o) => o.kind === 'rock'), ice = C.obstacles.filter((o) => o.kind === 'ice');
    const r = rng(3);
    if (rocks.length) this.instanced(rockGeometry(4), new THREE.MeshLambertMaterial({ vertexColors: true }), rocks, (o, p, e, sc) => {
      p.set(o.x, C.heightS(o.x, o.s) - 0.15, -o.s); e.set(0, r() * 6, 0); sc.set(o.scale, o.scale, o.scale);
    });
    if (ice.length) {
      const mat = new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 0.88, shininess: 90, specular: '#ffffff', emissive: '#1d6f9a', emissiveIntensity: 0.25 });
      this.instanced(iceGeometry(), mat, ice, (o, p, e, sc) => { p.set(o.x, C.heightS(o.x, o.s) - 0.2, -o.s); e.set(0, r() * 6, 0); sc.set(o.r * 1.1, o.h, o.r * 1.1); });
    }
    for (const l of C.logs) {
      const len = l.x1 - l.x0;
      const m = new THREE.Mesh(logGeometry(len), new THREE.MeshLambertMaterial({ vertexColors: true }));
      m.position.set((l.x0 + l.x1) / 2, C.heightS((l.x0 + l.x1) / 2, l.s) - 0.05, -l.s);
      this.root.add(m);
    }
  }

  // ---- crystals (instanced, spinning) and their glow ----
  buildCrystals() {
    const C = this.course;
    this.cr = { list: [...C.crystals].sort((a, b) => a.s - b.s), meshes: {}, index: [] };
    const geo = new THREE.OctahedronGeometry(0.3, 0);
    geo.scale(1, 1.55, 1);
    const kinds = ['blue', 'green', 'gold'];
    for (const k of kinds) {
      const items = this.cr.list.map((c, i) => ({ c, i })).filter((o) => o.c.kind === k);
      if (!items.length) continue;
      const mat = new THREE.MeshLambertMaterial({ color: KIND_COLOR[k], emissive: KIND_COLOR[k], emissiveIntensity: this.theme.night ? 0.9 : 0.45 });
      const im = new THREE.InstancedMesh(k === 'gold' ? new THREE.OctahedronGeometry(0.42, 0).scale(1, 1.5, 1) : geo, mat, items.length);
      im.frustumCulled = false;
      this.root.add(im);
      this.cr.meshes[k] = { im, items };
      items.forEach((o, j) => { this.cr.index[o.i] = [k, j]; });
    }
    for (const c of this.cr.list) c.wy = C.heightS(c.x, c.s) + c.y;
    this.cr.got = new Uint8Array(this.cr.list.length);
    this.forceAll = true;
    this.updateCrystals(0, 0);
    this.forceAll = false;
    // glow
    const n = this.cr.list.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    this.cr.list.forEach((c, i) => {
      pos[i * 3] = c.x; pos[i * 3 + 1] = c.wy; pos[i * 3 + 2] = -c.s;
      const cc = new THREE.Color(KIND_COLOR[c.kind]);
      col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.cr.glow = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.5, map: this.dot, vertexColors: true, transparent: true, opacity: this.theme.night ? 0.9 : 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.cr.glow.frustumCulled = false;
    this.root.add(this.cr.glow);
  }

  // the run's crystals are sorted the same way as ours (by s), so index i matches
  collect(i) {
    this.cr.got[i] = 1;
    const c = this.cr.list[i];
    const p = this.cr.glow.geometry.attributes.position;
    p.setY(i, -1e5); p.needsUpdate = true;
    this.spawnBurst(c.x, c.wy, -c.s, KIND_COLOR[c.kind]);
  }

  resetCrystals() {
    if (!this.cr) return;
    this.cr.got.fill(0);
    const p = this.cr.glow.geometry.attributes.position;
    this.cr.list.forEach((c, i) => p.setY(i, c.wy));
    p.needsUpdate = true;
    for (const r of this.rings) { r.mesh.visible = true; r.mesh.scale.setScalar(1); r.mesh.material.opacity = 0.95; r.passed = 0; }
  }

  updateCrystals(t, s) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const k in this.cr.meshes) {
      const { im, items } = this.cr.meshes[k];
      for (let j = 0; j < items.length; j++) {
        const { c, i } = items[j];
        if (Math.abs(c.s - s) > 260 && !this.forceAll) continue;
        const got = this.cr.got[i];
        q.setFromAxisAngle(up, t * 2.2 + i);
        p.set(c.x, c.wy + Math.sin(t * 2.4 + i) * 0.08, -c.s);
        sc.setScalar(got ? 0 : 1);
        m4.compose(p, q, sc);
        im.setMatrixAt(j, m4);
      }
      im.instanceMatrix.needsUpdate = true;
    }
  }

  buildRings() {
    const C = this.course;
    this.rings = [...C.rings].sort((a, b) => a.s - b.s).map((g) => {
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(g.r, 0.11, 8, 40), new THREE.MeshBasicMaterial({ color: '#ff6fb5', transparent: true, opacity: 0.95 }));
      const inner = new THREE.Mesh(new THREE.TorusGeometry(g.r - 0.22, 0.03, 6, 40), new THREE.MeshBasicMaterial({ color: '#ffe3f1' }));
      mesh.add(inner);
      mesh.position.set(g.x, C.heightS(g.x, g.s) + g.y, -g.s);
      this.root.add(mesh);
      return { g, mesh, passed: 0 };
    });
  }
  passRing(i) { const r = this.rings[i]; if (r) r.passed = 0.001; }

  buildFlagsAndGates() {
    const C = this.course;
    const parts = [];
    for (const f of C.flags) {
      const y = C.heightS(f.x, f.s);
      parts.push([new THREE.CylinderGeometry(0.035, 0.035, 2.2, 5), '#333844', M(f.x, y + 1.1, -f.s)]);
      parts.push([new THREE.BoxGeometry(0.02, 0.45, 0.7), '#ff6a2a', M(f.x, y + 1.95, -f.s + 0.35)]);
    }
    if (parts.length) this.root.add(new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true })));
    this.gate(0, 'START', '#2f8cff');
    this.gate(C.length, 'FINISH', '#ff3b5c');
  }

  gate(s, label, color) {
    const C = this.course, cx = C.cx(s), w = C.hw(s) - 3.5;
    const yl = C.heightS(cx - w, s), yr = C.heightS(cx + w, s), top = Math.max(yl, yr) + 5.2;
    const parts = [
      [new THREE.BoxGeometry(0.5, top - yl + 0.5, 0.5), color, M(cx - w, (top + yl) / 2, -s)],
      [new THREE.BoxGeometry(0.5, top - yr + 0.5, 0.5), color, M(cx + w, (top + yr) / 2, -s)],
    ];
    this.root.add(new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true })));
    const { canvas, ctx, tex } = textCanvas(1024, 128);
    ctx.fillStyle = color; ctx.fillRect(0, 0, 1024, 128);
    if (label === 'FINISH') for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(i * 32, j * 32, 32, 32); }
    ctx.fillStyle = '#fff'; ctx.font = `900 84px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, 512, 68);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(2 * w, 1.6), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    banner.position.set(cx, top - 0.6, -s);
    this.root.add(banner);
    void canvas;
  }

  buildSigns() {
    const C = this.course;
    this.signs = [];
    for (const sg of C.signs) {
      const lesson = sg.kind === 'lesson';
      const W = lesson ? 3.6 : 3.2, Hh = lesson ? 2.0 : 1.0;
      const { ctx, tex } = textCanvas(1024, lesson ? 570 : 300);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, Hh), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      const y = C.heightS(sg.x, sg.s);
      mesh.position.set(sg.x, y + (lesson ? 2.6 : 3.4), -sg.s);
      // face the rider coming down (a little toward the centre)
      mesh.rotation.y = lesson ? Math.sign(sg.x - C.cx(sg.s)) * 0.35 : 0;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, lesson ? 1.8 : 3, 5), new THREE.MeshLambertMaterial({ color: '#3a3f4c' }));
      post.position.set(sg.x, y + (lesson ? 0.9 : 1.5), -sg.s - 0.05);
      this.root.add(mesh, post);
      const item = { sg, ctx, tex, mesh };
      this.signs.push(item);
      this.drawSign(item);
    }
  }

  drawSign({ sg, ctx, tex }) {
    const c = ctx.canvas, W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    const bg = sg.kind === 'warn' ? '#ff6a2a' : sg.kind === 'fork' ? '#2f8cff' : 'rgba(12,22,48,0.92)';
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.roundRect(6, 6, W - 12, H - 12, 34); ctx.fill();
    ctx.lineWidth = 8; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (sg.kind === 'lesson') {
      const L = this.lessons[sg.key] || { title: sg.key, vr: '', pc: '' };
      ctx.font = `900 76px ${FONT}`;
      ctx.fillStyle = '#ffd23f';
      ctx.fillText(L.title, W / 2, 86);
      ctx.fillStyle = '#fff';
      ctx.font = `700 50px ${FONT}`;
      const lines = wrap(ctx, this.signMode === 'vr' ? L.vr : L.pc, W - 90);
      lines.slice(0, 6).forEach((l, i) => ctx.fillText(l, W / 2, 180 + i * 66));
    } else {
      ctx.font = `900 120px ${FONT}`;
      ctx.fillText(sg.text, W / 2, H / 2 + 6);
    }
    tex.needsUpdate = true;
  }
  setSignMode(mode) {
    if (mode === this.signMode) return;
    this.signMode = mode;
    for (const s of this.signs || []) this.drawSign(s);
  }

  buildIce() {
    const C = this.course;
    const mat = new THREE.MeshPhongMaterial({ color: '#a8e6ff', transparent: true, opacity: 0.82, shininess: 80, specular: '#ffffff', emissive: '#2a86b0', emissiveIntensity: 0.3, flatShading: true });
    for (const a of C.arches) {
      const R = C.hw(a.s) - 2.5;
      const m = new THREE.Mesh(new THREE.TorusGeometry(R, 0.9, 6, 26, Math.PI), mat);
      m.position.set(C.cx(a.s), C.base(a.s) - 0.4, -a.s);
      m.scale.set(1, 0.75, 1);
      this.root.add(m);
    }
    const blocks = [];
    const r = rng(C.spec.seed + 4);
    for (const w of C.icewalls) {
      for (let s = w.s0; s <= w.s1; s += 5) {
        const e = 3 + r() * 7;
        blocks.push({ s, x: C.cx(s) + w.side * (C.hw(s) - 6 + e), h: 4 + r() * 7, w: 2 + r() * 2.5 });
      }
    }
    if (blocks.length) this.instanced(new THREE.DodecahedronGeometry(1, 0), mat, blocks, (b, p, e, sc) => {
      p.set(b.x, C.heightS(b.x, b.s) + b.h * 0.3, -b.s); e.set(r() * 0.4, r() * 6, r() * 0.4); sc.set(b.w, b.h, b.w);
    });
  }

  buildLanterns() {
    const C = this.course;
    if (!C.lanterns.length) return;
    const items = [];
    for (const l of C.lanterns) for (const side of [-1, 1]) {
      const x = C.cx(l.s) + side * (C.hw(l.s) - 3.2);
      items.push({ s: l.s, x, y: C.heightS(x, l.s) });
    }
    this.instanced(new THREE.CylinderGeometry(0.05, 0.07, 1.6, 5), new THREE.MeshLambertMaterial({ color: '#2a2f3f' }), items, (o, p, e, sc) => { p.set(o.x, o.y + 0.8, -o.s); e.set(0, 0, 0); sc.set(1, 1, 1); });
    this.instanced(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffcf7a' }), items, (o, p, e, sc) => { p.set(o.x, o.y + 1.7, -o.s); e.set(0, 0, 0); sc.set(1, 1, 1); });
    const pos = new Float32Array(items.length * 3);
    items.forEach((o, i) => { pos[i * 3] = o.x; pos[i * 3 + 1] = o.y + 1.7; pos[i * 3 + 2] = -o.s; });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const glow = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffb54a', size: 1.6, map: this.dot, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.frustumCulled = false;
    this.root.add(glow);
  }

  // ---- falling snow around you (wraps in a box that moves with the camera) ----
  buildSnowfall() {
    const n = Math.round(300 + 1100 * (this.theme.snowfall || 0));
    const pos = new Float32Array(n * 3), base = new Float32Array(n * 3), r = rng(17);
    for (let i = 0; i < n * 3; i++) base[i] = r();
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.flakes = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 0.045, map: this.dot, transparent: true, opacity: 0.9, depthWrite: false }));
    this.flakes.frustumCulled = false;
    this.flakes.userData = { base, n, box: [50, 26, 50] };
    this.root.add(this.flakes);
  }
  updateSnowfall(t, cam) {
    const { base, n, box } = this.flakes.userData;
    const p = this.flakes.geometry.attributes.position.array;
    const fall = t * 1.1;
    for (let i = 0; i < n; i++) {
      const bx = base[i * 3] * box[0], by = base[i * 3 + 1] * box[1], bz = base[i * 3 + 2] * box[2];
      const sway = Math.sin(t * 0.8 + i) * 0.4;
      let x = bx + sway - cam.x, y = by - fall - cam.y, z = bz - cam.z;
      x = ((x % box[0]) + box[0]) % box[0]; y = ((y % box[1]) + box[1]) % box[1]; z = ((z % box[2]) + box[2]) % box[2];
      p[i * 3] = cam.x + x - box[0] / 2; p[i * 3 + 1] = cam.y + y - box[1] / 2; p[i * 3 + 2] = cam.z + z - box[2] / 2;
    }
    this.flakes.geometry.attributes.position.needsUpdate = true;
  }

  // ---- spray off the edge, crystal bursts ----
  buildSpray() {
    const n = 420;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.spray = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.16, map: this.dot, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
    this.spray.frustumCulled = false;
    this.spray.userData = { n, v: new Float32Array(n * 3), life: new Float32Array(n), next: 0 };
    this.root.add(this.spray);
    const p = g.attributes.position.array;
    for (let i = 0; i < n; i++) p[i * 3 + 1] = -1e5;
  }
  emit(x, y, z, vx, vy, vz, life, color = '#ffffff') {
    const u = this.spray.userData, i = u.next;
    u.next = (i + 1) % u.n;
    const p = this.spray.geometry.attributes.position.array, c = this.spray.geometry.attributes.color.array;
    p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
    u.v[i * 3] = vx; u.v[i * 3 + 1] = vy; u.v[i * 3 + 2] = vz;
    u.life[i] = life;
    const cc = new THREE.Color(color);
    c[i * 3] = cc.r; c[i * 3 + 1] = cc.g; c[i * 3 + 2] = cc.b;
  }
  spawnBurst(x, y, z, color) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * 2 - 1, sp = 2 + Math.random() * 3;
      this.emit(x, y, z, Math.cos(a) * sp * Math.sqrt(1 - b * b), b * sp, Math.sin(a) * sp * Math.sqrt(1 - b * b), 0.6 + Math.random() * 0.3, color);
    }
  }
  updateSpray(dt) {
    const u = this.spray.userData, p = this.spray.geometry.attributes.position.array;
    for (let i = 0; i < u.n; i++) {
      if (u.life[i] <= 0) continue;
      u.life[i] -= dt;
      if (u.life[i] <= 0) { p[i * 3 + 1] = -1e5; continue; }
      u.v[i * 3 + 1] -= 6 * dt;
      p[i * 3] += u.v[i * 3] * dt; p[i * 3 + 1] += u.v[i * 3 + 1] * dt; p[i * 3 + 2] += u.v[i * 3 + 2] * dt;
    }
    this.spray.geometry.attributes.position.needsUpdate = true;
    this.spray.geometry.attributes.color.needsUpdate = true;
  }

  // a soft shadow under the board: in the air it shows where you will land
  buildShadow() {
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, opacity: 0.6 }));
    this.shadow.renderOrder = 2;
    this.root.add(this.shadow);
  }
  updateShadow(rider) {
    const C = this.course, p = rider.pos;
    const h = C.height(p.x, p.z);
    const n = C.normal(p.x, p.z);
    const above = Math.max(0, p.y - h);
    this.shadow.position.set(p.x, h + 0.04, p.z);
    this.shadow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(n.x, n.y, n.z));
    this.shadow.rotateZ(-rider.boardYaw);
    const k = 1 + above * 0.08;
    this.shadow.scale.set(0.55 * k, 1.75 * k, 1);
    this.shadow.material.opacity = 0.62 * Math.max(0.25, 1 - above / 14);
    this.shadow.visible = rider.crash <= 0;
  }

  update(dt, t, cam, s) {
    this.t = t;
    // only what is near enough to see through the fog (ahead) or looking back up the hill
    for (const m of this.cullable) { const [a, b] = m.userData.range; m.visible = a < s + 560 && b > s - 260; }
    this.far.position.set(cam.x, cam.y, cam.z);
    if (this.mountains) this.mountains.position.y = -40;
    if (this.auroraMat) this.auroraMat.uniforms.t.value = t;
    this.sun.position.set(cam.x + this.sunDir.x * 100, cam.y + this.sunDir.y * 100, cam.z + this.sunDir.z * 100);
    this.sun.target.position.set(cam.x, cam.y, cam.z);
    this.updateCrystals(t, s);
    this.updateSnowfall(t, cam);
    this.updateSpray(dt);
    for (const r of this.rings) {
      if (r.passed > 0) {
        r.passed += dt;
        r.mesh.scale.setScalar(1 + r.passed * 1.5);
        r.mesh.material.opacity = Math.max(0, 0.95 - r.passed * 1.6);
        if (r.passed > 0.6) r.mesh.visible = false;
      } else r.mesh.rotation.z = t * 0.6;
    }
  }
}
