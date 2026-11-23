// world/placement.js — placing a structure: a translucent "ghost" in front of the player that snaps to the
// ground, turns with the mouse wheel / R / Q, turns red where it cannot stand (water, too steep, overlaps),
// and is confirmed with a click / E / a pinch.
import * as THREE from 'three';

export class Placement {
  constructor(game) {
    this.game = game;
    this.active = null;     // { def, ghost, rot, ok, x, z, y }
    this.okMat = new THREE.MeshBasicMaterial({ color: '#7dff9a', transparent: true, opacity: 0.38, depthWrite: false });
    this.badMat = new THREE.MeshBasicMaterial({ color: '#ff5d5d', transparent: true, opacity: 0.38, depthWrite: false });
  }

  /** def: { id, size:[w,d], build(): Object3D, water?: 'shore'|'allowed', near?: 'fire' … } */
  start(def, onConfirm, onCancel) {
    this.cancel();
    const ghost = def.build({ ghost: true });
    ghost.traverse((o) => { if (o.isMesh) { o.material = this.okMat; o.castShadow = false; o.receiveShadow = false; } });
    this.game.world.scene.add(ghost);
    this.active = { def, ghost, rot: this.game.player.yaw + Math.PI, ok: false, onConfirm, onCancel };
    return this.active;
  }

  rotate(delta) { if (this.active) this.active.rot += delta; }

  cancel() {
    if (!this.active) return;
    this.game.world.scene.remove(this.active.ghost);
    const cb = this.active.onCancel;
    this.active = null;
    cb?.();
  }

  confirm() {
    const a = this.active;
    if (!a || !a.ok) return false;
    this.game.world.scene.remove(a.ghost);
    this.active = null;
    a.onConfirm?.({ x: a.x, y: a.y, z: a.z, rot: a.rot });
    return true;
  }

  update() {
    const a = this.active;
    if (!a) return;
    const g = this.game, p = g.player, t = g.world.terrain;
    const [w, d] = a.def.size || [2, 2];
    const dist = Math.max(2.2, Math.max(w, d) * 0.6 + 1.4);
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    a.x = p.pos.x + fx * dist; a.z = p.pos.z + fz * dist;
    // ground: the lowest corner so nothing floats; check slope over the footprint
    const c = Math.cos(a.rot), s = Math.sin(a.rot);
    let lo = Infinity, hi = -Infinity, wet = false;
    for (const [u, v] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, 0]]) {
      const x = a.x + u * c + v * s, z = a.z - u * s + v * c;
      const h = t.heightAt(x, z);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
      if (!t.isLand(x, z, g.player.seaLevel + 0.4)) wet = true;
    }
    a.y = a.def.floating ? Math.max(lo, g.player.seaLevel) : lo;
    let ok = hi - lo < (a.def.maxSlope ?? Math.max(0.9, Math.max(w, d) * 0.35));
    if (wet && a.def.water !== 'allowed' && a.def.water !== 'shore') ok = false;
    if (a.def.water === 'shore' && !wet) ok = false;
    // overlaps with other structures / trunks
    for (const n of g.world.nodes.query(a.x, a.z, Math.max(w, d) / 2 + 0.6, (n) => n.solid || n.structure)) {
      const r = (n.cr ?? n.r ?? 0.5);
      if (Math.hypot(n.x - a.x, n.z - a.z) < r + Math.min(w, d) * 0.45) { ok = false; break; }
    }
    if (a.def.check) ok = ok && a.def.check(a.x, a.z, g);
    a.ok = ok;
    a.ghost.position.set(a.x, a.y, a.z);
    a.ghost.rotation.y = a.rot;
    const mat = ok ? this.okMat : this.badMat;
    a.ghost.traverse((o) => { if (o.isMesh) o.material = mat; });
  }
}
