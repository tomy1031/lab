// player/viewmodel.js — the hands and the tool you hold, drawn in front of the camera (first person).
// Simple procedural models + small animations: idle sway, walk bob, swing (chop/hit), thrust (spear/knife),
// draw/release (bow), cast/reel (rod), throw (net/stone/spear), aim/recoil (gun), strike (flint), eat/drink.
import * as THREE from 'three';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...o });
const MAT = {
  skin: M('#e9b48f', { roughness: 0.7 }), wood: M('#8a5a32'), darkWood: M('#5d3b20'), metal: M('#b9c0c7', { metalness: 0.8, roughness: 0.35 }),
  dark: M('#2b2d31', { metalness: 0.6, roughness: 0.4 }), stone: M('#6d6a64', { flatShading: true }), flint: M('#3b3f46', { flatShading: true, roughness: 0.3 }),
  rope: M('#c9ad7a'), net: M('#d7c79a', { wireframe: true }), leaf: M('#4f7a2b'), red: M('#b03a2e'), cloth: M('#6e8a9a'), line: new THREE.LineBasicMaterial({ color: '#f4f4f4' }),
  fire: new THREE.MeshBasicMaterial({ color: '#ffb347' }), glass: M('#9fd6e8', { transparent: true, opacity: 0.55, roughness: 0.1 }),
};

function box(w, h, d, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; }
function cyl(r1, r2, h, mat, seg = 8) { return new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat); }

function hand(side = 1) {
  const g = new THREE.Group();
  const palm = box(0.085, 0.03, 0.1, MAT.skin); g.add(palm);
  for (let i = 0; i < 4; i++) { const f = box(0.018, 0.022, 0.065, MAT.skin, -0.03 + i * 0.02, 0.012, -0.075); f.rotation.x = -0.9; f.position.y = -0.012; g.add(f); }
  const th = box(0.022, 0.022, 0.05, MAT.skin, 0.05 * side, 0, -0.02); th.rotation.y = -0.6 * side; g.add(th);
  const arm = box(0.07, 0.065, 0.32, MAT.skin, 0, -0.005, 0.21); g.add(arm);
  const sleeve = box(0.085, 0.08, 0.14, MAT.cloth, 0, -0.005, 0.37); g.add(sleeve);
  return g;
}

/** tool builders → Group whose origin is the grip; the tool points along −z (forward) or +y (up) */
const TOOLS = {
  none: () => new THREE.Group(),
  knife: () => { const g = new THREE.Group(); const h = cyl(0.014, 0.016, 0.11, MAT.darkWood); h.rotation.x = Math.PI / 2; g.add(h); const b = box(0.008, 0.035, 0.16, MAT.metal, 0, 0.008, -0.13); g.add(b); return g; },
  machete: () => { const g = TOOLS.knife(); g.children[1].scale.set(1, 1.3, 2.6); g.children[1].position.z = -0.27; return g; },
  axe: () => { const g = new THREE.Group(); const h = cyl(0.016, 0.018, 0.55, MAT.wood); h.position.y = 0.2; g.add(h); const head = box(0.02, 0.09, 0.14, MAT.metal, 0, 0.44, -0.05); g.add(head); return g; },
  stone_axe: () => { const g = new THREE.Group(); const h = cyl(0.016, 0.018, 0.5, MAT.wood); h.position.y = 0.18; g.add(h); const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.06, 0), MAT.stone); s.scale.set(0.5, 0.9, 1.4); s.position.set(0, 0.4, -0.05); g.add(s); const r = cyl(0.022, 0.022, 0.05, MAT.rope); r.position.y = 0.4; g.add(r); return g; },
  spear: () => { const g = new THREE.Group(); const s = cyl(0.014, 0.016, 1.7, MAT.wood); s.rotation.x = Math.PI / 2; s.position.z = -0.45; g.add(s); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.14, 6), MAT.flint); tip.rotation.x = -Math.PI / 2; tip.position.z = -1.36; g.add(tip); return g; },
  club: () => { const g = new THREE.Group(); const s = cyl(0.035, 0.018, 0.6, MAT.wood); s.position.y = 0.25; g.add(s); return g; },
  bow: () => {
    const g = new THREE.Group();
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.55, 0), new THREE.Vector3(0, 0, -0.22), new THREE.Vector3(0, -0.55, 0));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.013, 6), MAT.wood));
    const str = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.55, 0), new THREE.Vector3(0, 0, 0.02), new THREE.Vector3(0, -0.55, 0)]);
    const line = new THREE.Line(str, MAT.line); line.name = 'string'; g.add(line);
    const arrow = new THREE.Group(); arrow.name = 'arrow';
    const sh = cyl(0.005, 0.005, 0.7, MAT.wood, 5); sh.rotation.x = Math.PI / 2; sh.position.z = -0.32; arrow.add(sh);
    const ah = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 5), MAT.flint); ah.rotation.x = -Math.PI / 2; ah.position.z = -0.69; arrow.add(ah);
    g.add(arrow);
    return g;
  },
  rod: () => {
    const g = new THREE.Group();
    const r = cyl(0.006, 0.015, 1.9, MAT.wood, 6); r.position.y = 0.9; r.rotation.x = -0.25; g.add(r);
    const reel = cyl(0.03, 0.03, 0.03, MAT.dark, 10); reel.rotation.z = Math.PI / 2; reel.position.set(0.03, 0.15, 0); g.add(reel);
    const ln = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1.82, -0.46), new THREE.Vector3(0, 0.5, -1.5)]);
    const line = new THREE.Line(ln, MAT.line); line.name = 'line'; g.add(line);
    return g;
  },
  net: () => { const g = new THREE.Group(); const n = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), MAT.net); n.position.set(0, 0.05, -0.15); n.rotation.x = Math.PI; g.add(n); const r = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.01, 6, 20), MAT.rope); r.rotation.x = Math.PI / 2; r.position.set(0, 0.05, -0.15); g.add(r); return g; },
  rifle: () => { const g = new THREE.Group(); g.add(box(0.045, 0.07, 0.42, MAT.darkWood, 0, -0.01, 0.05)); const b = cyl(0.012, 0.012, 0.6, MAT.dark); b.rotation.x = Math.PI / 2; b.position.set(0, 0.03, -0.4); g.add(b); g.add(box(0.04, 0.05, 0.22, MAT.dark, 0, 0.025, -0.1)); const s = box(0.004, 0.02, 0.01, MAT.dark, 0, 0.065, -0.66); g.add(s); const f = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.08), new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); f.name = 'flash'; f.position.set(0, 0.03, -0.72); g.add(f); return g; },
  pistol: () => { const g = new THREE.Group(); g.add(box(0.03, 0.04, 0.16, MAT.dark, 0, 0.04, -0.06)); const gr = box(0.028, 0.09, 0.04, MAT.darkWood, 0, -0.01, 0.01); gr.rotation.x = 0.25; g.add(gr); const f = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.06), new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); f.name = 'flash'; f.position.set(0, 0.045, -0.16); g.add(f); return g; },
  flint: () => { const g = new THREE.Group(); const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.035, 0), MAT.flint); s.scale.set(1, 0.7, 1.3); g.add(s); return g; },
  steel: () => { const g = new THREE.Group(); g.add(box(0.07, 0.012, 0.03, MAT.metal)); return g; },
  stone: () => { const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.045, 0), MAT.stone); const g = new THREE.Group(); g.add(s); return g; },
  stick: () => { const g = new THREE.Group(); const s = cyl(0.012, 0.014, 0.6, MAT.wood, 6); s.position.y = 0.2; g.add(s); return g; },
  torch: () => { const g = new THREE.Group(); const s = cyl(0.016, 0.02, 0.5, MAT.wood, 6); s.position.y = 0.15; g.add(s); const c = cyl(0.03, 0.025, 0.08, MAT.rope, 6); c.position.y = 0.42; g.add(c); const f = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 7), MAT.fire); f.name = 'flame'; f.position.y = 0.52; g.add(f); const l = new THREE.PointLight('#ffa040', 3, 9, 1.6); l.name = 'light'; l.position.y = 0.55; g.add(l); return g; },
  bottle: () => { const g = new THREE.Group(); const b = cyl(0.035, 0.035, 0.18, MAT.glass, 10); b.position.y = 0.05; g.add(b); const c = cyl(0.015, 0.015, 0.03, MAT.dark, 8); c.position.y = 0.155; g.add(c); return g; },
  pot: () => { const g = new THREE.Group(); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.12, 14, 1, true), new THREE.MeshStandardMaterial({ color: '#8b8f93', metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide })); p.position.set(0, 0.02, -0.12); g.add(p); return g; },
  coconut: () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), M('#5b4a24'))); return g; },
  food: () => { const g = new THREE.Group(); const f = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M('#c2552e')); f.scale.set(1.4, 0.8, 1); g.add(f); return g; },
  rope: () => { const g = new THREE.Group(); const t = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 16), MAT.rope); t.rotation.y = Math.PI / 2; g.add(t); return g; },
  shovel: () => { const g = new THREE.Group(); const h = cyl(0.015, 0.015, 0.8, MAT.wood); h.position.y = 0.3; g.add(h); g.add(box(0.14, 0.18, 0.01, MAT.metal, 0, -0.15, 0)); return g; },
  hammer: () => { const g = new THREE.Group(); const h = cyl(0.014, 0.016, 0.32, MAT.wood); h.position.y = 0.1; g.add(h); g.add(box(0.04, 0.04, 0.11, MAT.stone, 0, 0.27, 0)); return g; },
  leaf: () => { const g = new THREE.Group(); const l = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.25), new THREE.MeshStandardMaterial({ color: '#4f7a2b', side: THREE.DoubleSide })); g.add(l); return g; },
};

// rest poses for the right hand per tool family (position relative to the camera, rotation)
const HOLD = {
  default: { p: [0.27, -0.3, -0.45], r: [0.15, 0, 0] },
  long: { p: [0.3, -0.36, -0.42], r: [0.4, 0.15, 0] },       // axe, club, torch, stick, shovel, hammer (blade up)
  spear: { p: [0.26, -0.32, -0.3], r: [0, 0.04, 0] },
  bow: { p: [-0.18, -0.12, -0.55], r: [0, 0, 0.12] },        // bow held in the LEFT hand
  rod: { p: [0.28, -0.38, -0.4], r: [0.15, 0.05, 0] },
  gun: { p: [0.2, -0.22, -0.42], r: [0, 0, 0] },
  rifle: { p: [0.18, -0.24, -0.3], r: [0, 0, 0] },
  small: { p: [0.25, -0.28, -0.42], r: [0.1, 0, 0] },
};
const FAMILY = { axe: 'long', stone_axe: 'long', club: 'long', torch: 'long', stick: 'long', shovel: 'long', hammer: 'long', spear: 'spear', bow: 'bow', rod: 'rod', pistol: 'gun', rifle: 'rifle', knife: 'small', machete: 'small', flint: 'small', stone: 'small', bottle: 'small', coconut: 'small', food: 'small', rope: 'small', leaf: 'small', net: 'small', pot: 'small', steel: 'small' };

export const VIEW_TOOLS = Object.keys(TOOLS);

export class ViewModel {
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.name = 'viewmodel';
    camera.add(this.root);
    this.right = new THREE.Group();
    this.left = new THREE.Group();
    this.root.add(this.right, this.left);
    this.rHand = hand(1); this.rHand.rotation.set(0, 0, 0);
    this.lHand = hand(-1); this.lHand.scale.x = -1;
    this.right.add(this.rHand); this.left.add(this.lHand);
    this.tool = null;
    this.toolName = 'none';
    this.anim = null;       // { kind, t, dur }
    this.draw = 0;          // bow draw 0…1 / rod tension
    this.t = 0;
    this.visible = true;
    this.setTool('none');
    // keep the view model always on top of the world (no clipping into trees)
    this.root.traverse((o) => { if (o.isMesh) { o.renderOrder = 10; } });
  }

  setTool(name) {
    if (!TOOLS[name]) name = 'food';
    if (this.tool) this.tool.parent?.remove(this.tool);
    this.toolName = name;
    this.tool = TOOLS[name]();
    this.family = FAMILY[name] || 'default';
    const hold = HOLD[this.family];
    if (this.family === 'bow') { this.left.add(this.tool); this.tool.position.set(0, 0.02, -0.02); }
    else { this.right.add(this.tool); this.tool.position.set(0, 0.02, -0.04); }
    this.tool.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.renderOrder = 10; } });
    this.hold = hold;
    this.leftVisible = ['bow', 'rifle', 'rod'].includes(this.family) || name === 'flint' || name === 'net';
    if (name === 'flint') { const st = TOOLS.steel(); st.position.set(0, 0.02, -0.04); this.left.add(st); this.steel = st; } else if (this.steel) { this.steel.parent?.remove(this.steel); this.steel = null; }
    this.anim = { kind: 'equip', t: 0, dur: 0.35 };
  }

  play(kind, dur) {
    const D = { swing: 0.42, thrust: 0.35, cast: 0.7, throw: 0.55, recoil: 0.25, strike: 0.3, eat: 0.9, drink: 1.0, pick: 0.4, release: 0.25, rub: 0.25, reel: 0.2, hammer: 0.35 };
    this.anim = { kind, t: 0, dur: dur || D[kind] || 0.4 };
  }

  update(dt, { moving = 0, running = false, swimming = false } = {}) {
    this.t += dt;
    this.root.visible = this.visible && !swimming;
    const h = this.hold;
    const bob = moving ? Math.sin(this.t * (running ? 13 : 8.5)) * (running ? 0.022 : 0.012) : Math.sin(this.t * 1.6) * 0.004;
    const sideBob = moving ? Math.cos(this.t * (running ? 6.5 : 4.25)) * (running ? 0.018 : 0.008) : 0;
    let px = h.p[0] + sideBob, py = h.p[1] + bob, pz = h.p[2];
    let rx = h.r[0], ry = h.r[1], rz = h.r[2];
    let lx = -0.27, ly = -0.34, lz = -0.42, lrx = 0.15, lry = 0, lrz = 0;
    if (this.family === 'bow') { lx = h.p[0]; ly = h.p[1] + bob; lz = h.p[2]; lrz = h.r[2]; px = 0.12 - this.draw * 0.05; py = -0.14 + bob; pz = -0.5 + this.draw * 0.32; rx = 0; }
    if (this.family === 'rifle') { lx = 0.02; ly = -0.22 + bob; lz = -0.62; lrx = 0.1; }
    if (this.family === 'rod') { lx = 0.12; ly = -0.42 + bob; lz = -0.32; }
    if (this.toolName === 'flint') { lx = -0.12; ly = -0.26 + bob; lz = -0.45; }

    const a = this.anim;
    if (a) {
      a.t += dt;
      const u = Math.min(1, a.t / a.dur);
      const e = Math.sin(u * Math.PI);
      switch (a.kind) {
        case 'equip': py -= (1 - u) * 0.3; break;
        case 'swing': case 'hammer': {
          const up = u < 0.35 ? u / 0.35 : 1 - (u - 0.35) / 0.65;
          rx += up * -1.1 + (u > 0.35 ? (1 - up) * 0.4 : 0); py += up * 0.12; pz += up * 0.05; px -= up * 0.05; break;
        }
        case 'thrust': pz -= e * 0.35; py += e * 0.04; break;
        case 'cast': rx += (u < 0.4 ? -(u / 0.4) * 1.0 : -1.0 + ((u - 0.4) / 0.6) * 1.6); py += e * 0.1; break;
        case 'reel': rz += Math.sin(u * Math.PI * 2) * 0.08; break;
        case 'throw': pz -= (u < 0.3 ? -u / 0.3 * 0.15 : (u - 0.3) / 0.7 * 0.5); py += e * 0.15; rx -= e * 0.6; break;
        case 'recoil': rx += e * 0.25; pz += e * 0.06; break;
        case 'strike': px -= e * 0.12; py += e * 0.05; lx += e * 0.08; break;
        case 'rub': px += Math.sin(u * Math.PI * 2) * 0.06; lx -= Math.sin(u * Math.PI * 2) * 0.06; break;
        case 'eat': case 'drink': px -= e * 0.2; py += e * 0.18; pz += e * 0.18; rx -= e * 0.6; break;
        case 'pick': py -= e * 0.25; pz -= e * 0.15; rx += e * 0.6; break;
        case 'release': pz -= e * 0.03; break;
      }
      if (u >= 1) this.anim = null;
    }
    this.right.position.set(px, py, pz); this.right.rotation.set(rx, ry, rz);
    this.left.position.set(lx, ly, lz); this.left.rotation.set(lrx, lry, lrz);
    this.left.visible = this.leftVisible;
    // bow: string pulled back with the draw
    if (this.family === 'bow') {
      const s = this.tool.getObjectByName('string');
      if (s) { const p = s.geometry.attributes.position; p.setZ(1, 0.02 + this.draw * 0.32); p.needsUpdate = true; }
      const ar = this.tool.getObjectByName('arrow');
      if (ar) { ar.visible = this.hasArrow !== false; ar.position.z = this.draw * 0.32; }
    }
    const fl = this.tool.getObjectByName('flash');
    if (fl) fl.material.opacity = a && a.kind === 'recoil' && a.t < 0.06 ? 1 : 0;
    const flame = this.tool.getObjectByName('flame');
    if (flame) { flame.scale.y = 0.8 + Math.sin(this.t * 17) * 0.15 + Math.sin(this.t * 7) * 0.1; }
  }
}
