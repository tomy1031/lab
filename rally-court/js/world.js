// js/world.js — the stadium: court to ITF dimensions (lines, net with its sag, posts and singles sticks),
// three surfaces, windscreens, stands with a crowd, umpire's chair, sky and sunlight.
import * as THREE from 'three';
import { COURT, netHeight } from './physics.js';

const SURF_STYLE = {
  hard: { inner: '#2f5f9e', outer: '#3d7a5a', noise: 0.05 },
  clay: { inner: '#b9582f', outer: '#b45530', noise: 0.09 },
  grass: { inner: '#4f8f3c', outer: '#4a8638', noise: 0.08 },
};

function noiseTexture(base, amount, size = 256, seed = 1, stripes = false) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size);
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 255 * amount;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n));
  }
  g.putImageData(img, 0, 0);
  if (stripes) {
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(0, 0, size, size / 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function textTexture(lines, w, h, bg, fg, font) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, w / 2, (h / (lines.length + 1)) * (i + 1)));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.surfaceGroup = new THREE.Group();
    this.group.add(this.surfaceGroup);
    this.buildSky();
    this.buildLights();
    this.buildNet();
    this.buildStadium();
    this.setSurface('hard');
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(400, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { sun: { value: new THREE.Vector3(-0.35, 0.72, -0.6).normalize() } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vDir; uniform vec3 sun;
        void main(){
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 top = vec3(0.20, 0.42, 0.78), hor = vec3(0.72, 0.82, 0.92), low = vec3(0.55, 0.6, 0.62);
          vec3 c = h > 0.0 ? mix(hor, top, pow(h, 0.55)) : mix(hor, low, -h * 5.0);
          float s = max(dot(normalize(vDir), sun), 0.0);
          c += vec3(1.0, 0.9, 0.7) * (pow(s, 600.0) * 1.5 + pow(s, 12.0) * 0.18);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog(0xb8cbe0, 80, 380);
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x4a5a40, 1.15);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff3e0, 2.4);
    sun.position.set(-14, 30, -22);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -16; sc.right = 16; sc.top = 24; sc.bottom = -24; sc.near = 5; sc.far = 80;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun, sun.target);
    this.sun = sun;
  }

  setSurface(kind) {
    this.kind = kind;
    const st = SURF_STYLE[kind] || SURF_STYLE.hard;
    for (const c of [...this.surfaceGroup.children]) { this.surfaceGroup.remove(c); c.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }
    const W = COURT.fenceX * 2, L = COURT.fenceZ * 2;
    // outer area (runoff)
    const outerTex = noiseTexture(st.outer, st.noise, 256, 3);
    outerTex.repeat.set(W / 4, L / 4);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshStandardMaterial({ map: outerTex, roughness: kind === 'hard' ? 0.75 : 0.95 }));
    outer.rotation.x = -Math.PI / 2;
    outer.receiveShadow = true;
    this.surfaceGroup.add(outer);
    // the court itself (doubles court plus a band around it, the playing colour)
    const cw = COURT.doublesHalfW * 2 + (kind === 'hard' ? 0.6 : 0), cl = COURT.halfLen * 2 + (kind === 'hard' ? 0.6 : 0);
    if (kind === 'grass') {
      // mowing stripes across the court
      const stripes = new THREE.Group();
      const n = 14;
      for (let i = 0; i < n; i++) {
        const tex = noiseTexture(i % 2 ? '#4f8f3c' : '#5a9a45', st.noise, 128, 7 + i);
        tex.repeat.set(W / 4, (L / n) / 4);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(W, L / n), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
        m.rotation.x = -Math.PI / 2;
        m.position.set(0, 0.0005, -L / 2 + (i + 0.5) * (L / n));
        m.receiveShadow = true;
        stripes.add(m);
      }
      this.surfaceGroup.add(stripes);
      // worn patches behind the baselines
      for (const s of [-1, 1]) {
        const worn = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshStandardMaterial({ color: 0x9a8a5a, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false }));
        worn.rotation.x = -Math.PI / 2;
        worn.scale.set(2.2, 1.3, 1);
        worn.position.set(0, 0.001, s * (COURT.halfLen + 0.4));
        this.surfaceGroup.add(worn);
      }
    } else {
      const innerTex = noiseTexture(st.inner, st.noise, 256, 5);
      innerTex.repeat.set(cw / 4, cl / 4);
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(cw, cl), new THREE.MeshStandardMaterial({ map: innerTex, roughness: kind === 'hard' ? 0.7 : 0.95 }));
      inner.rotation.x = -Math.PI / 2;
      inner.position.y = 0.0006;
      inner.receiveShadow = true;
      this.surfaceGroup.add(inner);
    }
    this.buildLines(kind);
  }

  buildLines(kind) {
    const mat = new THREE.MeshStandardMaterial({ color: kind === 'clay' ? 0xf4efe6 : 0xffffff, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const lines = new THREE.Group();
    const add = (x0, x1, z0, z1) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((x0 + x1) / 2, 0.0015, (z0 + z1) / 2);
      m.receiveShadow = true;
      lines.add(m);
    };
    const L = COURT.halfLen, S = COURT.singlesHalfW, D = COURT.doublesHalfW, SV = COURT.serviceZ, w = 0.05;
    for (const s of [-1, 1]) {
      // baselines (10 cm), inside the court
      add(-D, D, s > 0 ? L - 0.10 : -L, s > 0 ? L : -L + 0.10);
      // service lines
      add(-S, S, s > 0 ? SV - w : -SV, s > 0 ? SV : -SV + w);
      // centre marks
      add(-w / 2, w / 2, s > 0 ? L - 0.10 - 0.10 : -L + 0.10, s > 0 ? L - 0.10 : -L + 0.20);
      // centre service line
      add(-w / 2, w / 2, s > 0 ? 0 : -SV + w, s > 0 ? SV - w : 0);
    }
    for (const s of [-1, 1]) {
      add(s > 0 ? S - w : -S, s > 0 ? S : -S + w, -L, L);     // singles sidelines
      add(s > 0 ? D - w : -D, s > 0 ? D : -D + w, -L, L);     // doubles sidelines
    }
    this.surfaceGroup.add(lines);
  }

  buildNet() {
    const g = new THREE.Group();
    // mesh
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const cx = c.getContext('2d');
    cx.clearRect(0, 0, 64, 64);
    cx.strokeStyle = 'rgba(25,25,25,0.95)';
    cx.lineWidth = 6;
    cx.strokeRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const E = COURT.netEndX, segs = 64;
    const pos = [], uv = [], idx = [];
    const tape = 0.06;
    for (let i = 0; i <= segs; i++) {
      const x = -E + (2 * E * i) / segs;
      const top = netHeight(x) - tape;
      pos.push(x, 0.03, 0, x, top, 0);
      uv.push(x / 0.045, 0.03 / 0.045, x / 0.045, top / 0.045);
      if (i < segs) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const net = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.9, color: 0x222222 }));
    net.castShadow = true;
    g.add(net);
    // tape: a white band following the top
    const tpos = [], tidx = [];
    for (let i = 0; i <= segs; i++) {
      const x = -E + (2 * E * i) / segs;
      const top = netHeight(x);
      tpos.push(x, top - tape, 0.012, x, top, 0.012, x, top, -0.012, x, top - tape, -0.012);
      if (i < segs) {
        const a = i * 4, b = a + 4;
        for (let k = 0; k < 3; k++) tidx.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1);
      }
    }
    const tgeo = new THREE.BufferGeometry();
    tgeo.setAttribute('position', new THREE.Float32BufferAttribute(tpos, 3));
    tgeo.setIndex(tidx);
    tgeo.computeVertexNormals();
    const tapeMesh = new THREE.Mesh(tgeo, new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.6, side: THREE.DoubleSide }));
    tapeMesh.castShadow = true;
    g.add(tapeMesh);
    // centre strap
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, COURT.netCenterH, 0.006), new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.6 }));
    strap.position.set(0, COURT.netCenterH / 2, 0);
    g.add(strap);
    // posts and singles sticks
    const postMat = new THREE.MeshStandardMaterial({ color: 0x1d4430, roughness: 0.5, metalness: 0.3 });
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, COURT.netPostH + 0.05, 12), postMat);
      post.position.set(s * (E + 0.04), (COURT.netPostH + 0.05) / 2, 0);
      post.castShadow = true;
      g.add(post);
      const stick = new THREE.Mesh(new THREE.BoxGeometry(0.04, COURT.netPostH, 0.04), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.7 }));
      stick.position.set(s * COURT.stickX, COURT.netPostH / 2, 0);
      g.add(stick);
      const winder = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.08), postMat);
      winder.position.set(s * (E + 0.04), 0.6, 0.06);
      g.add(winder);
    }
    this.group.add(g);
  }

  buildStadium() {
    const g = new THREE.Group();
    const FX = COURT.fenceX, FZ = COURT.fenceZ;
    // windscreens with banners
    const bannerTex = textTexture(['RALLY COURT'], 1024, 128, '#173d2c', '#e9f2ea', 'bold 72px sans-serif');
    bannerTex.wrapS = THREE.RepeatWrapping;
    const wsMat = new THREE.MeshStandardMaterial({ color: 0x173d2c, roughness: 0.95 });
    const banMat = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.8 });
    const wall = (w, x, z, ry) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, 0.15), wsMat);
      m.position.set(x, 1.1, z); m.rotation.y = ry; m.receiveShadow = true;
      g.add(m);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.9), banMat.clone());
      b.material.map = bannerTex.clone(); b.material.map.repeat.set(Math.max(1, Math.round(w / 8)), 1); b.material.map.needsUpdate = true;
      b.position.set(x, 1.0, z); b.rotation.y = ry;
      b.translateZ(0.08);
      g.add(b);
    };
    wall(FX * 2 + 0.3, 0, -FZ - 0.08, 0);
    wall(FX * 2 + 0.3, 0, FZ + 0.08, Math.PI);
    wall(FZ * 2, -FX - 0.08, 0, Math.PI / 2);
    wall(FZ * 2, FX + 0.08, 0, -Math.PI / 2);
    // concourse ground outside
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x5e6b62, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02;
    g.add(ground);
    // stands: tiers of seating around the court
    const tierMat = new THREE.MeshStandardMaterial({ color: 0x3b4655, roughness: 0.9 });
    const seatsMatA = new THREE.MeshStandardMaterial({ color: 0x2a5d8f, roughness: 0.8 });
    const crowdPos = [];
    const stand = (len, along, out, ry, tiers = 12) => {
      // along: unit (x,z) along the stand; out: unit (x,z) away from the court; origin at the wall
      for (let t = 0; t < tiers; t++) {
        const h = 2.4 + t * 0.42, d = 1.2 + t * 0.85;
        const step = new THREE.Mesh(new THREE.BoxGeometry(len, 0.42, 0.85), t % 2 ? tierMat : seatsMatA);
        step.position.set(out.x * d + out.ox, h - 0.21, out.z * d + out.oz);
        step.rotation.y = ry;
        step.receiveShadow = false;
        g.add(step);
        for (let k = 0; k < len / 0.55; k++) {
          if (Math.random() < 0.18) continue;
          const a = -len / 2 + 0.3 + k * 0.55;
          crowdPos.push([along.x * a + out.x * (d - 0.1) + out.ox, h, along.z * a + out.z * (d - 0.1) + out.oz, ry]);
        }
      }
    };
    stand(FX * 2 + 6, { x: 1, z: 0 }, { x: 0, z: -1, ox: 0, oz: -FZ - 0.4 }, 0);
    stand(FX * 2 + 6, { x: 1, z: 0 }, { x: 0, z: 1, ox: 0, oz: FZ + 0.4 }, Math.PI, 7);
    stand(FZ * 2, { x: 0, z: 1 }, { x: -1, z: 0, ox: -FX - 0.4, oz: 0 }, Math.PI / 2);
    stand(FZ * 2, { x: 0, z: 1 }, { x: 1, z: 0, ox: FX + 0.4, oz: 0 }, -Math.PI / 2);
    // crowd: one instanced mesh (torso + head merged)
    const torso = new THREE.CylinderGeometry(0.17, 0.2, 0.55, 6);
    torso.translate(0, 0.28, 0);
    const head = new THREE.SphereGeometry(0.11, 6, 5);
    head.translate(0, 0.68, 0);
    const merged = mergeGeos([torso, head]);
    const crowdMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const inst = new THREE.InstancedMesh(merged, crowdMat, crowdPos.length);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    const shirts = [0xe74c3c, 0xf1c40f, 0x3498db, 0xecf0f1, 0x2ecc71, 0x9b59b6, 0x34495e, 0xe67e22, 0xfafafa, 0x1abc9c, 0xd35400, 0x2c3e50];
    crowdPos.forEach(([x, y, z, ry], i) => {
      const s = 0.92 + Math.random() * 0.16;
      m.makeRotationY(ry + (Math.random() - 0.5) * 0.5).scale(new THREE.Vector3(s, s, s)).setPosition(x, y, z);
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, col.setHex(shirts[(Math.random() * shirts.length) | 0]));
    });
    this.crowd = inst;
    this.crowdBase = crowdPos.map((p) => p[1]);
    g.add(inst);
    // umpire's chair by the net post (left of the player)
    const chair = new THREE.Group();
    const cm = new THREE.MeshStandardMaterial({ color: 0x1d4430, roughness: 0.6 });
    for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.0, 0.06), cm);
      leg.position.set(x, 1.0, z);
      chair.add(leg);
    }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.8), cm); seat.position.y = 2.0; chair.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.08), cm); back.position.set(-0.36, 2.35, 0); back.rotation.y = Math.PI / 2; chair.add(back);
    const ump = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9a77f, roughness: 0.7 });
    const coat = new THREE.MeshStandardMaterial({ color: 0x1f2b3d, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.62, 10), coat); body.position.y = 2.38; ump.add(body);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), skin); hd.position.y = 2.82; ump.add(hd);
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.12, 0.06, 14), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 })); hat.position.y = 2.9; ump.add(hat);
    chair.add(ump);
    chair.position.set(-COURT.netEndX - 1.0, 0, 0);
    chair.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.add(chair);
    // light towers at the corners
    for (const [x, z] of [[-FX - 3, -FZ - 3], [FX + 3, -FZ - 3], [-FX - 3, FZ + 3], [FX + 3, FZ + 3]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 22, 8), new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.5, roughness: 0.4 }));
      pole.position.set(x, 11, z);
      g.add(pole);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 0.4), new THREE.MeshStandardMaterial({ color: 0xdfe6ee, emissive: 0x444444 }));
      lamp.position.set(x, 22, z);
      lamp.lookAt(0, 0, 0);
      g.add(lamp);
    }
    // a skyline of the city beyond
    const city = new THREE.Group();
    const bm = new THREE.MeshLambertMaterial({ color: 0x8c9bb0 });
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2;
      const r = 120 + Math.random() * 60;
      const h = 15 + Math.random() * 45;
      const b = new THREE.Mesh(new THREE.BoxGeometry(10 + Math.random() * 14, h, 10 + Math.random() * 14), bm);
      b.position.set(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r);
      city.add(b);
    }
    g.add(city);
    this.group.add(g);
  }

  /** crowd sway & cheering (0 … 1) */
  update(t, excite) {
    if (!this.crowd) return;
    // cheap: bounce a subset each frame
    const inst = this.crowd, m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const n = inst.count;
    if (excite < 0.02 && !this._wasExcited) return;
    this._wasExcited = excite >= 0.02;
    const step = 3, off = Math.floor(t * 60) % step;
    for (let i = off; i < n; i += step) {
      inst.getMatrixAt(i, m);
      m.decompose(p, q, s);
      p.y = this.crowdBase[i] + Math.max(0, Math.sin(t * 14 + i * 1.7)) * 0.12 * excite;
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
  }
}

/** merge simple non-indexed/indexed geometries with the same attributes (position, normal, uv) */
function mergeGeos(geos) {
  const pos = [], nor = [], idx = [];
  let base = 0;
  for (const g0 of geos) {
    const g = g0.index ? g0 : g0;
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); }
    if (g.index) for (const i of g.index.array) idx.push(i + base);
    else for (let i = 0; i < p.length / 3; i++) idx.push(i + base);
    base += p.length / 3;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}
