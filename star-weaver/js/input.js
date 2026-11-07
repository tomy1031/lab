// input.js — both hands, whether they are Touch controllers or tracked hands.
// Each hand exposes a hit point (fist / palm) and a poke point (controller tip / index fingertip).
import * as THREE from 'three';

class HandState {
  constructor(side) {
    this.side = side;                 // 'L' | 'R'
    this.world = new THREE.Vector3(); // hit point, reference space
    this.pokeWorld = new THREE.Vector3();
    this.local = new THREE.Vector3(); // hit point, stage space
    this.prevLocal = new THREE.Vector3();
    this.pokeLocal = new THREE.Vector3();
    this.tracked = false;
    this.wasTracked = false;
    this.isHand = false;
    this.src = null;
    this.speed = 0;
    this.travel = 0;
    this.btn = [];
    this.btnPrev = [];
  }
  pressed(i) { return !!this.btn[i] && !this.btnPrev[i]; }
}

export class Hands {
  constructor(renderer, scene) {
    this.L = new HandState('L');
    this.R = new HandState('R');
    this.slots = [];
    this.manual = false; // desktop preview / autoplay set positions directly
    for (let i = 0; i < 2; i++) {
      const ctrl = renderer.xr.getController(i);
      const grip = renderer.xr.getControllerGrip(i);
      const hand = renderer.xr.getHand(i);
      scene.add(ctrl, grip, hand);
      const slot = { ctrl, grip, hand, src: null };
      ctrl.addEventListener('connected', (e) => { slot.src = e.data; });
      ctrl.addEventListener('disconnected', () => { slot.src = null; });
      this.slots.push(slot);
    }
  }

  get anyHandTracking() { return this.L.isHand || this.R.isHand; }

  update(dt, toLocal) {
    if (!this.manual) {
      for (const st of [this.L, this.R]) { st.tracked = false; st.btnPrev = st.btn; st.btn = []; }
      for (const s of this.slots) {
        const src = s.src;
        if (!src) continue;
        const st = src.handedness === 'left' ? this.L : src.handedness === 'right' ? this.R : null;
        if (!st) continue;
        st.src = src;
        st.isHand = !!src.hand;
        if (st.isHand) {
          const j = s.hand.joints || {};
          const palm = j['middle-finger-phalanx-proximal'] || j['middle-finger-metacarpal'];
          const tip = j['index-finger-tip'];
          if (palm && palm.visible) { st.world.copy(palm.position); st.tracked = true; }
          if (tip && tip.visible) st.pokeWorld.copy(tip.position); else st.pokeWorld.copy(st.world);
        } else {
          if (s.grip.visible) { st.world.copy(s.grip.position); st.tracked = true; }
          else if (s.ctrl.visible) { st.world.copy(s.ctrl.position); st.tracked = true; }
          if (s.ctrl.visible) st.pokeWorld.set(0, 0, -0.02).applyQuaternion(s.ctrl.quaternion).add(s.ctrl.position);
          else st.pokeWorld.copy(st.world);
          const gp = src.gamepad;
          if (gp) st.btn = gp.buttons.map((b) => b.pressed);
        }
      }
    }
    for (const st of [this.L, this.R]) {
      st.prevLocal.copy(st.local);
      toLocal(st.world, st.local);
      toLocal(st.pokeWorld, st.pokeLocal);
      if (st.tracked && !st.wasTracked) st.prevLocal.copy(st.local); // no sweeping hits after a tracking gap
      const d = st.local.distanceTo(st.prevLocal);
      if (st.tracked && d < 0.4 && dt > 0) {
        st.travel += d;
        st.speed += (d / dt - st.speed) * Math.min(1, dt * 8);
      } else st.speed *= 0.9;
      st.wasTracked = st.tracked;
    }
  }

  haptic(side, intensity = 0.5, ms = 40) {
    const st = side === 'L' ? this.L : this.R;
    const act = st.src && st.src.gamepad && st.src.gamepad.hapticActuators && st.src.gamepad.hapticActuators[0];
    if (!act) return;
    try { act.pulse ? act.pulse(intensity, ms) : act.playEffect && act.playEffect('dual-rumble', { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity }); } catch { /* not supported */ }
  }
}
