// ui.js — touch-to-press panels. Buttons are pressed by pushing a fingertip / controller tip
// through the panel surface (no laser pointers needed), or by mouse click in the desktop preview.
import * as THREE from 'three';

const tmp = new THREE.Vector3();

export class UI {
  constructor(game) {
    this.game = game;
    this.panels = [];
    this.state = { L: { z: 1, cool: 0, panel: null }, R: { z: 1, cool: 0, panel: null } };
    this.ray = new THREE.Raycaster();
    this.holdTargets = []; // { mesh, radius, time, needed, onHold }
    // fingertip cursor: a ring that shrinks onto the panel as you push toward it
    this.cursors = {};
    for (const k of ['L', 'R']) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false }));
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0035, 16), new THREE.MeshBasicMaterial({ color: k === 'L' ? 0x4cc9ff : 0xff5fb7, transparent: true, depthWrite: false, depthTest: false }));
      ring.renderOrder = dot.renderOrder = 60;
      g.add(ring, dot);
      g.visible = false;
      this.cursors[k] = { g, ring };
    }
  }
  add(panel) { if (!this.panels.includes(panel)) this.panels.push(panel); return panel; }

  update(dt) {
    const g = this.game;
    for (const side of ['L', 'R']) {
      const h = g.hands[side], st = this.state[side];
      st.cool -= dt;
      if (!h.tracked) { st.z = 1; this.cursors[side].g.visible = false; continue; }
      let best = null;
      for (const p of this.panels) {
        if (!p.interactive || !p.visible || !p.mesh.parent) continue;
        p.mesh.worldToLocal(tmp.copy(h.pokeWorld));
        if (Math.abs(tmp.x) > p.w / 2 + 0.03 || Math.abs(tmp.y) > p.h / 2 + 0.03 || tmp.z < -0.08 || tmp.z > 0.12) continue;
        best = { p, x: tmp.x, y: tmp.y, z: tmp.z };
        break;
      }
      const cur = this.cursors[side];
      if (!best) { if (st.panel) st.panel.setHover(null); st.panel = null; st.z = 1; cur.g.visible = false; continue; }
      const { p } = best;
      if (cur.g.parent !== p.mesh) p.mesh.add(cur.g);
      cur.g.visible = best.z > -0.02;
      cur.g.position.set(best.x, best.y, 0.002);
      const r = 0.006 + Math.max(0, best.z) * 0.12;
      cur.ring.scale.set(r, r, 1);
      cur.ring.material.opacity = best.z < 0.015 ? 1 : 0.65;
      if (st.panel && st.panel !== p) st.panel.setHover(null);
      st.panel = p;
      const b = p.buttonAtPx(p.toPx(best));
      p.setHover(b);
      const crossed = st.z >= 0.012 && best.z < 0.012;
      if (crossed && b && st.cool <= 0) {
        st.cool = 0.45;
        g.hands.haptic(side, 0.6, 30);
        g.audio.click();
        p.press(b);
      }
      st.z = best.z;
    }
    // hold-to-activate targets (pause orb for hand tracking)
    for (const t of this.holdTargets) {
      if (!t.mesh.visible || !t.mesh.parent) { t.time = 0; continue; }
      t.mesh.getWorldPosition(tmp);
      const near = ['L', 'R'].some((s) => g.hands[s].tracked && g.hands[s].pokeWorld.distanceTo(tmp) < t.radius);
      t.time = near ? t.time + dt : 0;
      if (t.onProgress) t.onProgress(Math.min(1, t.time / t.needed));
      if (t.time >= t.needed) { t.time = -1.5; t.onHold(); }
    }
  }

  // desktop preview: mouse hover/click
  pointer(ndc, camera, click) {
    this.ray.setFromCamera(ndc, camera);
    const meshes = this.panels.filter((p) => p.interactive && p.visible && p.mesh.parent).map((p) => p.mesh);
    const hit = this.ray.intersectObjects(meshes, false)[0];
    for (const p of this.panels) if (!hit || p.mesh !== hit.object) p.setHover(null);
    if (!hit) return false;
    const p = hit.object.userData.panel;
    const local = hit.object.worldToLocal(hit.point.clone());
    const b = p.buttonAtPx(p.toPx(local));
    p.setHover(b);
    if (click && b) { this.game.audio.click(); p.press(b); }
    return !!b;
  }
}
