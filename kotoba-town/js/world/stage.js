// Stage: loads a scene with its environment, places the cast at slots, keeps them alive
// (look-at, lip-sync from their voices), shows focus arrows and the phone for calls.
import * as THREE from 'three';
import { loadScene } from './scenes/index.js';
import { makeEnvironment } from './environment.js';
import { Person } from '../people/person.js';
import { Panel, THEME, rr, font, nameTag } from '../ui/panel.js';
import { colorFor } from '../ui/views.js';

export class Stage {
  constructor(app, sound) {
    this.app = app;
    this.sound = sound;
    this.built = null;
    this.env = null;
    this.people = new Map(); // charId → { person, speaker, slot, char }
    this.focusArrow = makeArrow();
    this.focusArrow.visible = false;
    app.scene.add(this.focusArrow);
    this.fader = makeFader(app);
    this.speakingId = null;
  }

  async fade(to, ms = 450) {
    const m = this.fader.material;
    const from = m.opacity;
    this.fader.visible = true;
    const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        const k = Math.min(1, (performance.now() - t0) / ms);
        m.opacity = from + (to - from) * k;
        if (k < 1) requestAnimationFrame(tick); else resolve();
      };
      tick();
    });
    if (to === 0) this.fader.visible = false;
  }

  clear() {
    if (this.built) { this.app.scene.remove(this.built.group); disposeTree(this.built.group); }
    this.env?.dispose();
    for (const p of this.people.values()) { this.app.scene.remove(p.person.root); p.person.dispose?.(); }
    if (this.phone) { this.phone.parent?.remove(this.phone); this.phone = null; }
    this.people.clear();
    this.sound.clearSpeakers();
    this.built = null; this.env = null;
    this.focusArrow.visible = false;
  }

  /**
   * @param {string} sceneId
   * @param {object} setup { time, season, weather }
   * @param {Array<{char, slot}>} cast  resolved characters + slot names ('phone' = on the phone)
   */
  async load(sceneId, setup, cast = []) {
    this.clear();
    const mod = await loadScene(sceneId);
    const built = mod.default({ setup: setup || {} });
    this.built = built;
    this.meta = mod.meta || {};
    this.app.scene.add(built.group);
    this.env = makeEnvironment(this.app.scene, { ...setup, indoor: this.meta.indoor, center: built.center, radius: built.radius });
    this.app.renderer.toneMappingExposure = this.env.exposure;
    this.app.placeRig(built.spawn.pos, built.spawn.yaw);
    const used = new Set();
    for (const { char, slot } of cast) {
      if (slot === 'phone') { this._phone(char); continue; }
      let sp = built.slots[slot];
      if (!sp || used.has(slot)) {
        const free = Object.keys(built.slots).find((s) => built.slots[s] && !used.has(s) && s !== 'phone');
        sp = free ? built.slots[free] : { pos: new THREE.Vector3(0.6 * used.size, 0, -1.4), yaw: 0 };
        slot = free || slot;
      }
      used.add(slot);
      const person = new Person(char.look, { name: char.id });
      person.root.position.copy(sp.pos);
      person.root.rotation.y = sp.yaw;
      if (sp.sit) person.setSitting(true, sp.sit);
      this.app.scene.add(person.root);
      const speaker = this.sound.ctx ? this.sound.speaker(char.id, person.voiceAnchor) : null;
      this.people.set(char.id, { person, speaker, slot, char });
    }
    return built;
  }

  /** The learner holds a phone; the caller's voice comes from it. */
  _phone(char) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 0.01), new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.3 })));
    const screen = new Panel(this.app, 300, 600, 0.066, { name: 'phone-screen', interactive: false });
    screen.mesh.position.z = 0.0055;
    screen.draw((gx, W, H) => {
      const grd = gx.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#8fd0ef'); grd.addColorStop(1, '#c9ecd9');
      gx.fillStyle = grd; rr(gx, 0, 0, W, H, 34); gx.fill();
      gx.fillStyle = colorFor(char.id); gx.beginPath(); gx.arc(W / 2, 190, 78, 0, Math.PI * 2); gx.fill();
      gx.font = font(84, 800); gx.fillStyle = THEME.ink; gx.textAlign = 'center'; gx.textBaseline = 'middle';
      gx.fillText([...char.nameJa][0], W / 2, 196);
      gx.font = font(34, 800); gx.fillText(char.nameJa, W / 2, 320);
      gx.font = font(24, 700); gx.fillStyle = THEME.soft; gx.fillText('つうわちゅう · on call', W / 2, 370);
      gx.fillStyle = '#e86f5c'; gx.beginPath(); gx.arc(W / 2, 500, 44, 0, Math.PI * 2); gx.fill();
    });
    g.add(screen.mesh);
    this.phone = g;
    // in VR it rides on the left hand; on PC it floats at the lower left of the view
    const grip = this.app.inXR ? this.app.renderer.xr.getControllerGrip(0) : null;
    if (grip && grip.parent) { grip.add(g); g.position.set(0, 0.03, -0.06); g.rotation.set(-0.9, 0, 0); }
    else { this.app.camera.add(g); g.position.set(-0.17, -0.12, -0.42); g.rotation.set(0.1, 0.35, 0.05); }
    const speaker = this.sound.ctx ? this.sound.speaker(char.id, g, { phone: true }) : null;
    this.people.set(char.id, { person: null, speaker, slot: 'phone', char });
  }

  ensureSpeakers() {
    for (const [id, p] of this.people) {
      if (!p.speaker && this.sound.ctx) p.speaker = this.sound.speaker(id, p.person ? p.person.voiceAnchor : this.phone, { phone: !p.person });
    }
  }

  /** World anchor position of a prop (or null). */
  propPosition(id) {
    const a = this.built?.props?.[id];
    return a ? a.getWorldPosition(new THREE.Vector3()) : null;
  }

  focus(id, ms = 6000) {
    const p = this.propPosition(id);
    if (!p) { this.focusArrow.visible = false; return; }
    const size = this.built.props[id].userData.size;
    this.focusArrow.position.copy(p).add(new THREE.Vector3(0, (size?.y || 0.2) / 2 + 0.18, 0));
    this.focusArrow.userData.base = this.focusArrow.position.y;
    this.focusArrow.visible = true;
    clearTimeout(this.focusTimer);
    this.focusTimer = setTimeout(() => { this.focusArrow.visible = false; }, ms);
  }

  setSpeaking(id) { this.speakingId = id; }

  /** Lip-sync without audio (speech synthesis or silent lines): ms = 0 stops. */
  fakeTalk(id, ms) { const e = this.people.get(id); if (e) e.fakeUntil = ms ? performance.now() + ms : 0; }

  update(dt, t) {
    const head = this.app.headPosition();
    this.sound.updateListener(this.app.camera);
    this.sound.update();
    const speakerPos = this.speakingId && this.people.get(this.speakingId)?.person
      ? this.people.get(this.speakingId).person.head.getWorldPosition(new THREE.Vector3()) : null;
    for (const [id, p] of this.people) {
      if (!p.person) continue;
      // listeners glance at whoever is talking, otherwise at the learner
      p.person.setLookTarget(speakerPos && id !== this.speakingId && Math.sin(t * 0.7 + id.length) > -0.2 ? speakerPos : head);
      const fake = p.fakeUntil && performance.now() < p.fakeUntil ? 0.3 + 0.25 * Math.abs(Math.sin(t * 11 + Math.sin(t * 3))) : 0;
      p.person.update(dt, Math.max(p.speaker ? p.speaker.level : 0, fake));
    }
    this.built?.update?.(dt, t);
    this.env?.update(dt);
    if (this.focusArrow.visible) {
      this.focusArrow.position.y = this.focusArrow.userData.base + Math.abs(Math.sin(t * 3)) * 0.06;
      this.focusArrow.rotation.y += dt * 1.5;
    }
  }
}

function makeArrow() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: '#ffd36b', emissive: '#c98a12', emissiveIntensity: 0.6, roughness: 0.4 });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 20), m);
  cone.rotation.x = Math.PI;
  g.add(cone);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 24), m);
  ring.position.y = 0.11; ring.rotation.x = Math.PI / 2;
  g.add(ring);
  g.renderOrder = 5;
  return g;
}

function makeFader(app) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), new THREE.MeshBasicMaterial({ color: '#fdf6e3', transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, toneMapped: false }));
  m.renderOrder = 999;
  m.visible = false;
  app.camera.add(m);
  return m;
}

function disposeTree(o) {
  o.traverse((x) => {
    x.geometry?.dispose?.();
    const mats = Array.isArray(x.material) ? x.material : x.material ? [x.material] : [];
    for (const mm of mats) { if (mm.map && mm.map.image instanceof HTMLCanvasElement && !mm.map.userData?.shared) { /* canvas textures are cached in kit; keep */ } }
  });
}
