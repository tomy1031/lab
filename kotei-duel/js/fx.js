// js/fx.js — short 3D effects that tell what just happened, the same on a PC and in VR:
// numbers that float up, holograms rising from cards, a light running along the V's pair lines, beams from a
// member to a trouble, a shockwave across the table, bursts, the release rocket, a big 3D banner (VR).
import * as THREE from 'three';
import { canvasTex } from './board.js';
import { FONT, layout, drawLines, plain } from './text.js';
import { TABLE_H } from './room.js';

export class FX {
  constructor(app) {
    this.app = app;
    this.group = new THREE.Group();
    app.scene.add(this.group);
    this.items = [];
  }
  add(obj, life, update) { this.group.add(obj); this.items.push({ obj, life, t: 0, update }); return obj; }

  // text that floats up from a point. color: '#ff5a4f' etc.
  float(pos, text, color = '#ffffff', size = 1) {
    const w = 512, h = 128;
    const { ctx, tex } = canvasTex(w, h);
    ctx.font = `900 84px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 14; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(plain(text), w / 2, h / 2);
    ctx.fillStyle = color; ctx.fillText(plain(text), w / 2, h / 2);
    tex.needsUpdate = true;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    s.renderOrder = 50;
    s.raycast = () => {};
    const sc = 0.2 * size;
    s.scale.set(sc, sc / 4, 1);
    s.position.copy(pos);
    const y0 = pos.y;
    this.add(s, 1.5, (o, t) => {
      o.position.y = y0 + 0.02 + t * 0.07;
      o.material.opacity = t < 1.1 ? 1 : 1 - (t - 1.1) / 0.4;
      const pop = Math.min(1, t * 6);
      o.scale.set(sc * (0.6 + 0.4 * pop), (sc / 4) * (0.6 + 0.4 * pop), 1);
    });
  }

  // a hologram (made by table.hologram) rising from a point and fading
  rise(holo, pos, life = 1.4) {
    holo.position.copy(pos);
    const plane = holo.userData.plane, beam = holo.userData.beam;
    this.add(holo, life, (o, t) => {
      const k = Math.min(1, t / 0.45);
      plane.position.y = 0.04 + k * 0.17;
      plane.scale.setScalar(0.3 + 0.7 * k);
      const cam = this.app.core.renderer.xr.isPresenting ? this.app.core.renderer.xr.getCamera() : this.app.core.camera;
      const cp = cam.getWorldPosition(new THREE.Vector3());
      plane.lookAt(cp);
      plane.rotation.y += 0;
      const fade = t > life - 0.4 ? (life - t) / 0.4 : 1;
      plane.material.opacity = 0.95 * fade;
      beam.material.opacity = 0.2 * fade * (1 - k * 0.4);
      beam.scale.y = 0.3 + k;
    });
  }

  // a ring that expands on the table
  ring(pos, color = '#7fe3ff', r = 0.12, life = 0.6) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos); m.position.y = TABLE_H + 0.004;
    this.add(m, life, (o, t) => { const k = t / life; o.scale.setScalar(0.01 + r * k); o.material.opacity = 0.9 * (1 - k); });
  }

  // little cubes that burst out (a trouble resolved, a bug fixed)
  burst(pos, color = '#ffcf3f', n = 18, speed = 0.5) {
    const geo = new THREE.BoxGeometry(0.008, 0.008, 0.008);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(pos);
      const v = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.9 + 0.3, (Math.random() - 0.5)).normalize().multiplyScalar(speed * (0.5 + Math.random()));
      this.add(m, 0.8, (o, t, dt) => { o.position.addScaledVector(v, dt); v.y -= 1.6 * dt; o.rotation.x += dt * 8; o.material.opacity = 1 - t / 0.8; });
    }
  }

  // a beam from a to b (a member responding to a trouble)
  beam(a, b, color = '#7fe3ff', life = 0.5) {
    const dir = b.clone().sub(a);
    const len = dir.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 8), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    this.add(m, life, (o, t) => {
      const k = Math.min(1, t / 0.2);
      o.scale.set(1, len * k, 1);
      o.position.copy(a).addScaledVector(dir, k / 2);
      o.material.opacity = t > life - 0.2 ? (life - t) / 0.2 : 1;
    });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    this.add(head, 0.22, (o, t) => { o.position.copy(a).addScaledVector(dir, Math.min(1, t / 0.2)); });
  }

  // a light that runs along a line (test ↔ stage pair)
  runLine(line, color = '#7fe3ff', life = 1.0) {
    const pos = line.geometry.attributes.position;
    const a = new THREE.Vector3().fromBufferAttribute(pos, 1), b = new THREE.Vector3().fromBufferAttribute(pos, 0);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending }));
    const orig = line.material.color.clone();
    this.add(dot, life, (o, t) => {
      const k = Math.min(1, t / (life * 0.7));
      o.position.lerpVectors(a, b, k);
      o.scale.setScalar(1 + Math.sin(t * 30) * 0.3);
      line.material.color.set(t < life - 0.05 ? '#ffffff' : orig);
      line.material.opacity = t < life - 0.05 ? 1 : 0.6;
    });
  }

  // a shockwave from the enemy side toward you
  shock(from, to, color = '#ff4d6d') {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48, 1, Math.PI * 0.15, Math.PI * 0.7), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.PI;
    const d = to.clone().sub(from);
    this.add(m, 0.55, (o, t) => {
      const k = t / 0.55;
      o.position.copy(from).addScaledVector(d, k); o.position.y = TABLE_H + 0.03;
      o.scale.setScalar(0.08 + k * 0.25);
      o.material.opacity = 0.85 * (1 - k * 0.7);
    });
  }

  // the release: a rocket climbs from the release slot with a trail of sparks
  rocket(pos) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.09, 12), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }));
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.04, 12), new THREE.MeshStandardMaterial({ color: '#ff5a4f' }));
    nose.position.y = 0.065;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.06, 10), new THREE.MeshBasicMaterial({ color: '#ffcf3f', transparent: true, blending: THREE.AdditiveBlending }));
    flame.rotation.x = Math.PI; flame.position.y = -0.075;
    g.add(body, nose, flame);
    g.position.copy(pos);
    const y0 = pos.y;
    let spark = 0;
    this.add(g, 2.0, (o, t, dt) => {
      o.position.y = y0 + 0.02 + t * t * 0.55;
      flame.scale.y = 1 + Math.sin(t * 50) * 0.3;
      spark += dt;
      if (spark > 0.05) { spark = 0; this.burst(o.position.clone().add(new THREE.Vector3(0, -0.07, 0)), Math.random() < 0.5 ? '#ffcf3f' : '#ff9a3d', 3, 0.15); }
    });
  }

  // a 3D banner (VR): a wide board that slides in, holds, and fades. text with furigana markup
  banner3d(text, { color = '#ffcf3f', sub = '', life = 1.4 } = {}) {
    const w = 1024, h = 220;
    const { ctx, tex } = canvasTex(w, h);
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.15, 'rgba(8,14,40,0.92)'); g.addColorStop(0.85, 'rgba(8,14,40,0.92)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 20, w, h - 40);
    ctx.fillStyle = color; ctx.fillRect(0, 20, w, 6); ctx.fillRect(0, h - 26, w, 6);
    const L = layout(ctx, text, w - 160, 64, { ruby: this.app.settings.ruby, weight: 900 });
    const th = L.length * L.lineH;
    drawLines(ctx, L, 80, (h - th) / 2 - (sub ? 18 : 0), { color, align: 'center', w: w - 160 });
    if (sub) { ctx.font = `700 30px ${FONT}`; ctx.fillStyle = '#dfe8ff'; ctx.textAlign = 'center'; ctx.fillText(plain(sub), w / 2, h - 44); }
    tex.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0 * h / w), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    m.renderOrder = 60;
    m.position.set(0, TABLE_H + 0.42, -0.1);
    this.add(m, life, (o, t) => {
      const k = Math.min(1, t / 0.18);
      o.scale.set(0.6 + 0.4 * k, k, 1);
      o.material.opacity = t > life - 0.3 ? (life - t) / 0.3 : 1;
      const cam = this.app.core.renderer.xr.isPresenting ? this.app.core.renderer.xr.getCamera() : this.app.core.camera;
      o.lookAt(cam.getWorldPosition(new THREE.Vector3()));
    });
  }

  tick(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (it.update) it.update(it.obj, it.t, dt);
      if (it.t >= it.life) {
        this.group.remove(it.obj);
        it.obj.traverse?.((o) => {
          if (o.material) { o.material.map?.dispose?.(); o.material.dispose?.(); }
          if (o.geometry && !o.isSprite) o.geometry.dispose?.();
        });
        this.items.splice(i, 1);
      }
    }
  }
  clear() { for (const it of this.items) this.group.remove(it.obj); this.items = []; }
}
