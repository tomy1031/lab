// js/props.js — what you see of yourself in each way of flying: the broom under you, the glider's cockpit
// and wings, the balloon's basket / burner / envelope, the carpet, the wingsuit's membranes, jet flames
// from your palms, a ring of light at your feet; and the cumulus clouds that mark the thermals.
// Everything is drawn in the play area (rig) space, around where your head was when the mode began.
import * as THREE from 'three';

const mat = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, fog: false, ...extra });

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function ring() {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 48), mat(0x8fe3ff, { transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

function broom() {
  const g = new THREE.Group();
  const wood = mat(0x8a5a2b);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 2.1, 10), wood);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = -0.25;
  g.add(shaft);
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.15, 0.6, 14, 1, true), mat(0xd9b45a, { side: THREE.DoubleSide }));
  straw.rotation.x = Math.PI / 2;
  straw.position.z = 1.05;
  g.add(straw);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 14), mat(0x6b3d1d));
  band.position.z = 0.77;
  g.add(band);
  return g;
}

function cockpit() {
  const g = new THREE.Group();
  const white = mat(0xf1f4f8), grey = mat(0x9aa7b4), dark = mat(0x26313d);
  // the cockpit rim and the tub below you
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 8, 40), white);
  rim.scale.set(0.42, 1.25, 1);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, -0.32, -0.15);
  g.add(rim);
  const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.6, 24, 1, true), mat(0xe9edf2, { side: THREE.DoubleSide }));
  tub.scale.set(1, 1, 2.9);
  tub.position.set(0, -0.62, -0.15);
  g.add(tub);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), white);
  nose.rotation.x = -Math.PI / 2;
  nose.scale.set(1, 2.4, 0.9);
  nose.position.set(0, -0.6, -1.35);
  g.add(nose);
  // instrument panel (a canvas: airspeed, variometer)
  const panelTex = canvasTex(512, 160, () => {});
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.19), new THREE.MeshBasicMaterial({ map: panelTex, fog: false }));
  panel.position.set(0, -0.36, -0.78);
  panel.rotation.x = -0.45;
  g.add(panel);
  g.userData.panel = panelTex;
  // canopy frame
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.015, 6, 24, Math.PI), grey);
  arc.position.set(0, -0.32, -0.95);
  g.add(arc);
  // wings: long, thin, tapering, slightly behind you
  for (const s of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(s * 7.6, 0.18); shape.lineTo(s * 7.6, 0.55); shape.lineTo(0, 1.0); shape.closePath();
    const w = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat(0xf6f8fb, { side: THREE.DoubleSide }));
    w.rotation.x = -Math.PI / 2;
    w.position.set(s * 0.35, -0.42, 0.55);
    g.add(w);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.37), mat(0xff5a4f));
    tip.position.set(s * 7.95, -0.38, 0.17);
    g.add(tip);
  }
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 3.8, 10), white);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, -0.55, 2.4);
  g.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.1, 0.7), white);
  fin.position.set(0, -0.05, 4.1);
  g.add(fin);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.025, 0.45), white);
  stab.position.set(0, 0.48, 4.15);
  g.add(stab);
  g.userData.dark = dark;
  return g;
}

function balloon() {
  const g = new THREE.Group();
  const weave = canvasTex(256, 128, (x, w, h) => {
    x.fillStyle = '#9b6a35'; x.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) for (let i = 0; i < w; i += 16) {
      x.fillStyle = (y / 8 + i / 16) % 2 ? '#b8834a' : '#7d5228';
      x.fillRect(i, y, 15, 7);
    }
    x.fillStyle = '#5a3a1a'; x.fillRect(0, 0, w, 10);
  });
  weave.wrapS = THREE.RepeatWrapping;
  const S = 1.35, H = 1.05;
  const wallMat = new THREE.MeshBasicMaterial({ map: weave, side: THREE.DoubleSide, fog: false });
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(S, H), wallMat);
    const a = (i * Math.PI) / 2;
    w.position.set(Math.sin(a) * S / 2, H / 2, Math.cos(a) * S / 2);
    w.rotation.y = a;
    g.add(w);
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(S, S), mat(0x6e4a24));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01;
  g.add(floor);
  const pad = new THREE.Mesh(new THREE.TorusGeometry(S * 0.7, 0.05, 6, 4), mat(0x4a2f15));
  pad.rotation.set(Math.PI / 2, 0, Math.PI / 4);
  pad.position.y = H;
  g.add(pad);
  // ropes, burner, envelope
  const ropeMat = new THREE.LineBasicMaterial({ color: 0x3b2a1a, fog: false });
  const pts = [];
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pts.push(new THREE.Vector3(x * S / 2, H, z * S / 2), new THREE.Vector3(x * 0.6, 3.1, z * 0.6), new THREE.Vector3(x * 0.6, 3.1, z * 0.6), new THREE.Vector3(x * 2.6, 6.2, z * 2.6));
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), ropeMat));
  const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.25, 16), mat(0x9aa0a6));
  burner.position.y = 3.05;
  g.add(burner);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.6, 14, 1, true), mat(0xffa43a, { transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.position.y = 4.0;
  g.add(flame);
  g.userData.flame = flame;
  const stripes = canvasTex(512, 256, (x, w, h) => {
    const cols = ['#e63946', '#f1c453', '#2a9d8f', '#f4f1de', '#3d5a80', '#f1c453'];
    for (let i = 0; i < 24; i++) { x.fillStyle = cols[i % cols.length]; x.fillRect((i * w) / 24, 0, w / 24 + 1, h); }
    x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(0, h * 0.9, w, h * 0.1);
  });
  const env = new THREE.Mesh(new THREE.SphereGeometry(8.5, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.82), new THREE.MeshBasicMaterial({ map: stripes, side: THREE.DoubleSide, fog: false }));
  env.position.y = 13.5;
  g.add(env);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 2.6, 2.2, 32, 1, true), new THREE.MeshBasicMaterial({ map: stripes, side: THREE.DoubleSide, fog: false }));
  skirt.position.y = 6.3;
  g.add(skirt);
  return g;
}

function carpet() {
  const tex = canvasTex(512, 340, (x, w, h) => {
    x.fillStyle = '#7a1630'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#e9c46a'; x.lineWidth = 14; x.strokeRect(18, 18, w - 36, h - 36);
    x.strokeStyle = '#1d3557'; x.lineWidth = 8; x.strokeRect(40, 40, w - 80, h - 80);
    x.fillStyle = '#e9c46a';
    for (let i = 0; i < 18; i++) { const px = 60 + (i * (w - 120)) / 17; x.beginPath(); x.arc(px, 30, 5, 0, 7); x.arc(px, h - 30, 5, 0, 7); x.fill(); }
    x.save(); x.translate(w / 2, h / 2);
    for (let r = 0; r < 4; r++) {
      x.rotate(Math.PI / 2);
      x.fillStyle = r % 2 ? '#2a9d8f' : '#e9c46a';
      x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(60, -40, 110, 0); x.quadraticCurveTo(60, 40, 0, 0); x.fill();
    }
    x.fillStyle = '#1d3557'; x.beginPath(); x.arc(0, 0, 26, 0, 7); x.fill();
    x.restore();
  });
  const geo = new THREE.PlaneGeometry(1.9, 1.25, 16, 10);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, fog: false }));
  m.userData.base = Float32Array.from(geo.attributes.position.array);
  const g = new THREE.Group();
  g.add(m);
  // tassels on the short ends
  const pts = [];
  for (const sx of [-0.95, 0.95]) for (let i = 0; i <= 12; i++) { const z = -0.6 + i * 0.1; pts.push(new THREE.Vector3(sx, 0, z), new THREE.Vector3(sx * 1.08, -0.01, z)); }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xe9c46a, fog: false })));
  g.userData.cloth = m;
  return g;
}

function membrane() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 3), 3));
  const m = new THREE.Mesh(geo, mat(0xd2763a, { transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
  m.frustumCulled = false;
  return m;
}

function flame() {
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.6, 12, 1, true), mat(0x7fd3ff, { transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; // tip along -z (where the palm / controller points)
  m.position.z = -0.38;
  const g = new THREE.Group();
  g.add(m);
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.35, 10, 1, true), mat(0xffffff, { transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.rotation.x = -Math.PI / 2;
  core.position.z = -0.25;
  g.add(core);
  g.visible = false;
  return g;
}

export class Props {
  constructor(app) {
    this.app = app;
    this.rig = app.rig;
    this.items = {};
    this.mode = null;
    this.seat = new THREE.Vector3(0, 1.6, 0); // where your head was when the mode began (rig space)
    this.flames = { L: flame(), R: flame() };
    app.hands.L.add(this.flames.L);
    app.hands.R.add(this.flames.R);
    this.thermals = null;
    this.active = false;
  }
  // props show only while flying (not behind the menu page)
  setActive(on) {
    if (on === this.active) return;
    this.active = on;
    this.set(this.mode);
  }
  get(name, make) {
    if (!this.items[name]) { this.items[name] = make(); this.items[name].visible = false; this.rig.add(this.items[name]); }
    return this.items[name];
  }
  // which props a mode shows
  static want(mode) {
    return { point: ['ring'], float: ['ring'], bird: [], squirrel: ['membrane'], broom: ['broom'], glider: ['cockpit'], balloon: ['balloon'], jetpack: ['ring'], carpet: ['carpet'] }[mode] || [];
  }
  set(mode, head) {
    this.mode = mode;
    if (head) this.seat.copy(head);
    const want = Props.want(mode);
    const makers = { ring, broom, cockpit, balloon, carpet, membrane };
    for (const n of want) this.get(n, makers[n]);
    for (const [n, o] of Object.entries(this.items)) o.visible = this.active && want.includes(n);
    if (this.thermals) this.thermals.visible = this.active && (mode === 'glider' || mode === 'squirrel');
  }

  // cumulus clouds over the area's thermals (made once per area)
  setAir(air, groundAt) {
    if (this.thermals) { this.thermals.removeFromParent(); this.thermals.traverse((o) => o.geometry?.dispose()); }
    this.thermals = null;
    if (!air) return;
    const tex = canvasTex(128, 128, (x) => {
      for (let i = 0; i < 12; i++) {
        const px = 20 + Math.random() * 88, py = 30 + Math.random() * 60, r = 16 + Math.random() * 28;
        const gr = x.createRadialGradient(px, py, 0, px, py, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(250,252,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = gr; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
      }
      x.fillStyle = 'rgba(160,175,195,0.35)'; x.fillRect(10, 92, 108, 8); // a flat, greyer base
    });
    const smat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true });
    const colMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.045, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const g = new THREE.Group();
    g.name = 'thermals';
    for (const t of air.thermals) {
      const tg = new THREE.Group();
      tg.userData.t = t;
      for (let i = 0; i < 4; i++) {
        const s = new THREE.Sprite(smat);
        const w = t.r * (3 + Math.random() * 2.5);
        s.scale.set(w, w * 0.55, 1);
        s.position.set((Math.random() - 0.5) * t.r * 2, w * 0.18 + Math.random() * 60, (Math.random() - 0.5) * t.r * 2);
        tg.add(s);
      }
      const col = new THREE.Mesh(new THREE.CylinderGeometry(t.r * 0.9, t.r * 1.2, 1, 20, 1, true), colMat);
      col.userData.col = true;
      tg.add(col);
      g.add(tg);
    }
    this.groundAt = groundAt;
    this.thermals = g;
    this.app.scene.add(g);
    g.visible = this.active && (this.mode === 'glider' || this.mode === 'squirrel');
  }

  update(dt, f, inp, head, xr) {
    const t = performance.now() / 1000, st = f.st, it = this.items;
    if (it.ring?.visible) it.ring.position.set(head.x, 0.02, head.z);
    if (it.broom?.visible) {
      const b = it.broom;
      b.position.set(head.x, head.y - 0.78, head.z);
      b.rotation.order = 'YXZ';
      b.rotation.set(st.pitch || 0, xr ? st.yaw || 0 : 0, st.bank || 0);
    }
    if (it.cockpit?.visible) {
      const c = it.cockpit;
      c.position.copy(this.seat);
      c.rotation.order = 'YXZ';
      c.rotation.set(0, 0, -(st.bank || 0));
      // instruments, a few times a second
      if (!this.pt || t - this.pt > 0.25) {
        this.pt = t;
        const tex = c.userData.panel, x = tex.image.getContext('2d'), w = tex.image.width, h = tex.image.height;
        x.fillStyle = '#1d242c'; x.fillRect(0, 0, w, h);
        x.fillStyle = '#9fe0ff'; x.font = '700 26px system-ui, sans-serif'; x.textBaseline = 'middle';
        x.fillText('速度', 24, 40); x.fillText('昇降', 270, 40);
        x.fillStyle = '#fff'; x.font = '900 52px system-ui, sans-serif';
        x.fillText(`${Math.round((st.V || 0) * 3.6)}`, 24, 105);
        const vy = st.vy || 0;
        x.fillStyle = vy > 0.2 ? '#8be28b' : vy < -1.5 ? '#ff8f70' : '#fff';
        x.fillText(`${vy >= 0 ? '+' : ''}${vy.toFixed(1)}`, 270, 105);
        x.fillStyle = '#9fb3c6'; x.font = '600 20px system-ui, sans-serif';
        x.fillText('km/h', 150, 118); x.fillText('m/s', 430, 118);
        tex.needsUpdate = true;
      }
    }
    if (it.balloon?.visible) {
      it.balloon.position.set(this.seat.x, 0, this.seat.z);
      const fl = it.balloon.userData.flame, b = st.burner || 0;
      fl.visible = b > 0.05;
      fl.scale.set(1, 0.5 + b * (0.8 + 0.25 * Math.sin(t * 40)), 1);
    }
    if (it.carpet?.visible) {
      const c = it.carpet, center = st.center || this.seat;
      c.position.set(center.x, 0.03, center.z);
      const lean = st.lean || [0, 0];
      c.rotation.set(-lean[0] * 0.05, 0, -lean[1] * 0.07);
      const cloth = c.userData.cloth, pos = cloth.geometry.attributes.position, base = cloth.userData.base;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], z = base[i * 3 + 2];
        const edge = Math.min(1, Math.abs(x) / 0.95);
        pos.array[i * 3 + 1] = Math.sin(t * 2.2 + x * 3 + z * 1.5) * 0.02 * (0.3 + edge) ;
      }
      pos.needsUpdate = true;
    }
    if (it.membrane?.visible) {
      const m = it.membrane, a = m.geometry.attributes.position.array;
      const L = inp && inp.hands.L, R = inp && inp.hands.R;
      m.visible = !!(xr && L && R && L.on && R.on);
      if (m.visible) {
        const yaw = new THREE.Euler().setFromQuaternion(inp.headQuat, 'YXZ').y;
        const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        const neck = head.clone().add(new THREE.Vector3(0, -0.28, 0));
        const hipL = head.clone().add(new THREE.Vector3(0, -0.85, 0)).addScaledVector(side, -0.17);
        const hipR = head.clone().add(new THREE.Vector3(0, -0.85, 0)).addScaledVector(side, 0.17);
        [L.pos, neck, hipL, R.pos, hipR, neck].forEach((p, i) => { a[i * 3] = p.x; a[i * 3 + 1] = p.y; a[i * 3 + 2] = p.z; });
        m.geometry.attributes.position.needsUpdate = true;
      }
    }
    // jet flames from the palms
    for (const s of ['L', 'R']) {
      const fl = this.flames[s], h = inp && inp.hands[s];
      const on = xr && this.mode === 'jetpack' && h && h.on && h.trigger > 0.04;
      fl.visible = !!on;
      if (on) fl.scale.set(1, 1, 0.4 + h.trigger * (1.2 + 0.15 * Math.sin(t * 50 + (s === 'L' ? 0 : 1))));
    }
    // the bird's feathered wings on the hands
    for (const s of ['L', 'R']) { const w = this.app.hands[s].userData.wing; if (w) w.visible = this.mode === 'bird'; }
    // thermal clouds sit on their cloud base
    if (this.thermals?.visible && this.groundAt) {
      for (const tg of this.thermals.children) {
        const th = tg.userData.t;
        const g0 = this.app.flight.air ? this.app.flight.air.ground(th, this.groundAt) : 0;
        tg.position.set(th.x, g0 + th.top, th.z);
        for (const o of tg.children) if (o.userData.col) { o.scale.y = th.top; o.position.y = -th.top / 2; }
      }
    }
  }
}
