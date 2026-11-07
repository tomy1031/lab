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
  }
  add(panel) { if (!this.panels.includes(panel)) this.panels.push(panel); return panel; }

  update(dt) {
    const g = this.game;
    for (const side of ['L', 'R']) {
      const h = g.hands[side], st = this.state[side];
      st.cool -= dt;
      if (!h.tracked) { st.z = 1; continue; }
      let best = null;
      for (const p of this.panels) {
        if (!p.interactive || !p.visible || !p.mesh.parent) continue;
        p.mesh.worldToLocal(tmp.copy(h.pokeWorld));
        if (Math.abs(tmp.x) > p.w / 2 + 0.03 || Math.abs(tmp.y) > p.h / 2 + 0.03 || tmp.z < -0.08 || tmp.z > 0.12) continue;
        best = { p, x: tmp.x, y: tmp.y, z: tmp.z };
        break;
      }
      if (!best) { if (st.panel) st.panel.setHover(null); st.panel = null; st.z = 1; continue; }
      const { p } = best;
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
