// ceo.js — 松井社長, who gives NexMax its orders. He talks from a dialog box in the HUD (with his face),
// and when he hands out a big order he also appears large in the sky in front of the player
// (a billboard that fades in and out), so the order reads in VR as well as on screen.
// Art: the navy-suit character from the ai-company project's illustrated sprites (jp-0).
import * as THREE from 'three';

export class Ceo {
  constructor({ scene, box, text, face = 'img/ceo_face.webp', stand = 'img/ceo_stand.webp' }) {
    this.scene = scene;
    this.box = box;
    this.textEl = text;
    this.faceUrl = face;
    this.full = '';
    this.shown = 0;   // characters typed so far
    this.hold = 0;    // seconds left on screen after typing finishes
    this.sky = 0;     // seconds left for the sky figure
    this.skyT = 0;

    const tex = new THREE.TextureLoader().load(stand);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false });
    this.figure = new THREE.Sprite(this.mat);
    this.figure.center.set(0.5, 0);
    this.figure.renderOrder = 10;
    this.figure.visible = false;
    // soft halo behind him
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,240,190,0.9)'); grd.addColorStop(0.5, 'rgba(255,210,120,0.35)'); grd.addColorStop(1, 'rgba(255,200,100,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const htex = new THREE.CanvasTexture(c); htex.colorSpace = THREE.SRGBColorSpace;
    this.haloMat = new THREE.SpriteMaterial({ map: htex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false, blending: THREE.AdditiveBlending });
    this.halo = new THREE.Sprite(this.haloMat);
    this.halo.renderOrder = 9;
    this.halo.visible = false;
    scene.add(this.halo, this.figure);
    this._p = new THREE.Vector3();
  }

  // Say a line in the dialog box (typed out). opts.sky: also appear in the sky for a big order.
  say(line, { hold = 4.5, sky = false } = {}) {
    if (!line) return;
    this.full = line;
    this.shown = 0;
    this.hold = hold;
    this.textEl.textContent = '';
    this.box.classList.remove('hidden', 'leave');
    this.box.classList.remove('pop'); void this.box.offsetWidth; this.box.classList.add('pop');
    if (sky) { this.sky = 6; this.skyT = 0; }
  }

  // what he is saying right now (for the VR panel), or null
  current() {
    return this.full && (this.shown < this.full.length || this.hold > 0)
      ? { name: '松井社長', text: this.full, face: this.faceUrl } : null;
  }

  // ball: { pos, r, heading, up }
  update(dt, ball) {
    if (this.full) {
      if (this.shown < this.full.length) {
        this.shown = Math.min(this.full.length, this.shown + dt * 28);
        this.textEl.textContent = this.full.slice(0, Math.ceil(this.shown));
      } else if (this.hold > 0) {
        this.hold -= dt;
        if (this.hold <= 0) { this.box.classList.add('leave'); this.full = ''; }
      }
    }
    // sky figure: rises in front of the player, high over the horizon, then fades
    if (this.sky > 0 && ball) {
      this.sky -= dt; this.skyT += dt;
      const a = Math.min(1, this.skyT / 0.8) * Math.min(1, this.sky / 1.2);
      const H = ball.r * 30;                    // he is huge: a figure towering over the horizon
      this._p.copy(ball.pos).addScaledVector(ball.heading, ball.r * 80).addScaledVector(ball.up, ball.r * (5 - (1 - Math.min(1, this.skyT)) * 6));
      this.figure.position.copy(this._p);
      this.figure.scale.set(H * 238 / 518, H, 1);
      this.halo.position.copy(this._p).addScaledVector(ball.up, H * 0.55);
      this.halo.scale.setScalar(H * 1.4);
      this.mat.opacity = a; this.haloMat.opacity = a * 0.8;
      this.figure.visible = this.halo.visible = a > 0.01;
    } else {
      this.figure.visible = this.halo.visible = false;
    }
  }
}
