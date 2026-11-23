// world/fire.js — fires in the world (campfire, signal fire, torch stands, smoking racks with embers):
// the visual (logs, layered flame billboards, embers, smoke, a flickering light) and the burning state
// (fuel in game minutes, rain puts it out unless sheltered, warmth / light radius).
import * as THREE from 'three';

let flameTex = null, smokeTex = null;
function makeTex(kind) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  if (kind === 'flame') {
    const grd = g.createRadialGradient(32, 92, 4, 32, 80, 60);
    grd.addColorStop(0, 'rgba(255,250,210,1)'); grd.addColorStop(0.25, 'rgba(255,200,80,0.95)'); grd.addColorStop(0.55, 'rgba(255,110,20,0.6)'); grd.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(32, 2); g.bezierCurveTo(58, 50, 62, 92, 32, 126); g.bezierCurveTo(2, 92, 6, 50, 32, 2); g.fill();
  } else {
    const grd = g.createRadialGradient(32, 64, 2, 32, 64, 32);
    grd.addColorStop(0, 'rgba(200,200,200,0.55)'); grd.addColorStop(1, 'rgba(200,200,200,0)');
    g.fillStyle = grd; g.fillRect(0, 32, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Fire {
  /** opts: { kind: 'campfire'|'signal'|'torch', fuel (game min), maxFuel, sheltered } */
  constructor(scene, x, y, z, opts = {}) {
    flameTex ||= makeTex('flame');
    smokeTex ||= makeTex('smoke');
    this.kind = opts.kind || 'campfire';
    this.size = this.kind === 'signal' ? 2.4 : this.kind === 'torch' ? 0.45 : 1;
    this.fuel = opts.fuel ?? 120;
    this.maxFuel = opts.maxFuel ?? (this.kind === 'signal' ? 360 : 480);
    this.lit = opts.lit ?? true;
    this.sheltered = !!opts.sheltered;
    this.wet = 0;                  // 0…1 soaked wood (hard to relight)
    this.group = new THREE.Group();
    this.group.position.set(x, y, z);
    scene.add(this.group);
    const s = this.size;
    if (this.kind !== 'torch') {
      // stone ring + logs
      const stoneMat = new THREE.MeshStandardMaterial({ color: '#7d776d', roughness: 1, flatShading: true });
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13 * s, 0), stoneMat);
        m.position.set(Math.cos(a) * 0.5 * s, 0.06, Math.sin(a) * 0.5 * s);
        m.rotation.set(a, a * 2, 0);
        m.castShadow = true;
        this.group.add(m);
      }
      this.logMat = new THREE.MeshStandardMaterial({ color: '#5a3d25', roughness: 0.9, emissive: '#ff4a10', emissiveIntensity: 0 });
      for (let i = 0; i < (this.kind === 'signal' ? 8 : 4); i++) {
        const a = (i / 4) * Math.PI * 2 + 0.3;
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.06 * s, 0.75 * s, 6), this.logMat);
        log.position.set(Math.cos(a) * 0.12 * s, 0.2 * s, Math.sin(a) * 0.12 * s);
        log.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
        log.castShadow = true;
        this.group.add(log);
      }
    }
    // flames: a few crossed billboards
    this.flames = [];
    const fm = new THREE.SpriteMaterial({ map: flameTex, color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Sprite(fm.clone());
      sp.position.set((Math.random() - 0.5) * 0.25 * s, 0.35 * s, (Math.random() - 0.5) * 0.25 * s);
      sp.scale.set(0.45 * s, 0.9 * s, 1);
      sp.userData.ph = Math.random() * 10;
      this.group.add(sp);
      this.flames.push(sp);
    }
    // smoke puffs (recycled)
    this.smoke = [];
    const sm = new THREE.SpriteMaterial({ map: smokeTex, color: '#bbbbbb', transparent: true, depthWrite: false, opacity: 0.4 });
    for (let i = 0; i < (this.kind === 'signal' ? 14 : 6); i++) {
      const sp = new THREE.Sprite(sm.clone());
      sp.userData.t = Math.random();
      this.group.add(sp);
      this.smoke.push(sp);
    }
    this.light = new THREE.PointLight('#ff9a4a', 0, 14 * Math.sqrt(s), 1.6);
    this.light.position.set(0, 0.8 * s, 0);
    this.group.add(this.light);
    this.t = 0;
  }

  /** 0…1 how strongly it burns (fuel and wetness) */
  get strength() { return this.lit ? Math.min(1, this.fuel / 30) * (1 - this.wet * 0.5) : 0; }
  get radiusWarm() { return (this.kind === 'signal' ? 7 : this.kind === 'torch' ? 1.5 : 4.5) * (0.4 + 0.6 * this.strength); }
  get radiusLight() { return (this.kind === 'signal' ? 22 : this.kind === 'torch' ? 9 : 14) * (0.5 + 0.5 * this.strength); }

  addFuel(minutes) { this.fuel = Math.min(this.maxFuel, this.fuel + minutes); }

  /** gm: game minutes; rain 0…1; wind 0…1 */
  tick(gm, rain = 0, wind = 0) {
    if (!this.lit) { this.wet = Math.min(1, this.wet + gm * rain * (this.sheltered ? 0 : 0.01)); this.wet = Math.max(0, this.wet - gm * 0.002); return; }
    const burn = 1 + wind * 0.6 + (this.kind === 'signal' ? 0.5 : 0);
    this.fuel -= gm * burn;
    if (!this.sheltered && rain > 0) {
      this.wet = Math.min(1, this.wet + gm * rain * 0.004);
      // heavy rain on an open fire: it can drown
      if (rain > 0.6 && this.fuel < 60) this.fuel -= gm * rain * 1.5;
    } else this.wet = Math.max(0, this.wet - gm * 0.01);
    if (this.fuel <= 0) { this.fuel = 0; this.lit = false; this.bus?.('fire:out', this); }
  }

  /** visual update in real seconds */
  animate(dt, night = 0) {
    this.t += dt;
    const k = this.strength;
    for (const f of this.flames) {
      const ph = f.userData.ph + this.t * 9;
      const h = (0.6 + 0.4 * Math.sin(ph) * Math.sin(ph * 1.7)) * k;
      f.visible = k > 0.01;
      f.scale.set(0.45 * this.size * (0.6 + 0.4 * k), Math.max(0.01, 0.95 * this.size * h + 0.1 * k), 1);
      f.position.y = f.scale.y * 0.45 + 0.08;
      f.material.opacity = Math.min(1, 0.7 + 0.3 * Math.sin(ph * 2.3));
    }
    for (const s of this.smoke) {
      s.userData.t += dt * (0.25 + 0.1 * k);
      if (s.userData.t > 1) s.userData.t -= 1;
      const u = s.userData.t;
      s.visible = this.lit || this.fuel > 0 || this.wet > 0.2;
      s.position.set(Math.sin(u * 7 + s.id) * 0.3 * u, 0.6 * this.size + u * 4.5 * this.size, Math.cos(u * 5 + s.id) * 0.3 * u);
      const sc = (0.5 + u * 2.2) * this.size;
      s.scale.set(sc, sc, 1);
      s.material.opacity = (1 - u) * (this.lit ? 0.35 : 0.15) * (this.kind === 'signal' ? 1.6 : 1);
    }
    this.light.intensity = k * (8 + 3 * Math.sin(this.t * 13) * Math.sin(this.t * 7.7)) * (0.6 + night * 1.2) * this.size;
    if (this.logMat) this.logMat.emissiveIntensity = k * (0.6 + 0.25 * Math.sin(this.t * 5));
  }

  remove() { this.group.parent?.remove(this.group); this.light.dispose?.(); }

  serialize() { return { kind: this.kind, x: this.group.position.x, y: this.group.position.y, z: this.group.position.z, fuel: this.fuel, lit: this.lit, wet: this.wet, sheltered: this.sheltered }; }
}
