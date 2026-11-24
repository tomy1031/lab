// js/main.js — SKY ATLAS: fly over real places of the world in VR (Meta Quest) or on a screen, also with no
// network once an area has been downloaded. This file wires the renderer, the world (terrain + buildings +
// sky), the flight, VR and the menu page together.
import * as THREE from 'three';
import { Frame, clamp } from './geo.js';
import { Plan, credits } from './plan.js';
import { Loader } from './tiles.js';
import { Terrain } from './terrain.js';
import { Buildings, loadBuildings, fetchBuildings } from './buildings.js';
import { Sky } from './sky.js';
import { Flight, MODES, SPEEDS } from './flight.js';
import { MODE_ORDER } from './modes.js';
import { Air } from './air.js';
import { Props } from './props.js';
import { Sound } from './audio.js';
import { XRInput, ScreenInput } from './input.js';
import { MenuPanel, WristHud, Vignette, Pointers, makeHand } from './vrui.js';
import { AreaStore, PRESETS } from './areas.js';
import { UI } from './ui.js';
import { OSM_CREDIT } from './sources.js';

const QUALITY = {
  low: { name: '軽い', splitK: 1.1, bDist: 2200, scale: 0.85 },
  normal: { name: 'ふつう', splitK: 1.5, bDist: 3200, scale: 1.0 },
  high: { name: 'きれい', splitK: 2.2, bDist: 4500, scale: 1.0 },
};
const SETTINGS_KEY = 'sky-atlas:settings';
const DEFAULTS = { mode: 'point', speed: 'normal', vignette: true, snap: true, radius: 25, year: 2024, hires: true, buildings: true, quality: 'normal', clouds: true, sound: true };
const params = new URLSearchParams(location.search);

class App {
  constructor() {
    this.settings = { ...DEFAULTS };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch { /* defaults */ }
    if (params.get('quality') in QUALITY) this.settings.quality = params.get('quality');
    if (this.settings.mode === 'wings') this.settings.mode = 'bird'; // renamed
    if (!MODES[this.settings.mode]) this.settings.mode = 'point';
    if (MODES[params.get('mode')]) this.settings.mode = params.get('mode');
    this.store = new AreaStore();
    this.online = navigator.onLine !== false;
    this.state = 'menu'; // menu | screen | vr
    this.area = null;
    this.world = null;
    this.menuOpen = false;

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setSize(innerWidth, innerHeight);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    document.getElementById('stage').appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xc9def0);
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 400000);
    this.rig = new THREE.Group();
    this.rig.name = 'rig';
    this.rig.add(this.camera);
    this.camera.position.set(0, 1.6, 0);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.rig);
    this.sky = new Sky(this.scene);
    this.flight = new Flight(this.rig);
    this.flight.speedSetting = this.settings.speed;
    this.sound = new Sound();
    this.sound.on = this.settings.sound;
    this.loader = new Loader(8);

    // VR things
    this.xin = new XRInput();
    this.menu = new MenuPanel(this);
    this.rig.add(this.menu.mesh);
    this.hud = new WristHud();
    this.hands = { L: makeHand('L'), R: makeHand('R') };
    for (const s of ['L', 'R']) { this.hands[s].visible = false; this.rig.add(this.hands[s]); }
    this.hands.L.add(this.hud.mesh);
    this.hud.mesh.position.set(0, 0.06, 0.07);
    this.hud.mesh.rotation.x = -1.0;
    this.vignette = new Vignette();
    this.camera.add(this.vignette.mesh);
    this.pointers = new Pointers(this.rig);
    this.snapReady = true;
    this.props = new Props(this);

    this.sin = new ScreenInput(r.domElement);
    this.setMode(this.settings.mode);
    this.clock = new THREE.Clock();
    this.t = 0;
    this.ui = new UI(this);

    addEventListener('resize', () => this.resize());
    addEventListener('online', () => { this.online = true; this.ui.render(); });
    addEventListener('offline', () => { this.online = false; this.ui.render(); });
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === 'screen') this.stop();
      if (e.code === 'KeyM' && this.state === 'screen' && !e.target.closest?.('input')) this.toggleScreenMenu();
    });
    r.setAnimationLoop((t, frame) => this.loop(frame));
  }

  saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* ignore */ } }
  setSetting(k, v) {
    if (k === 'mode') { this.settings.mode = v; this.setMode(v); }
    else if (k === 'speed') { this.flight.speedSetting = v; this.settings.speed = v; }
    else this.settings[k] = v;
    if (k === 'sound') this.sound.on = v;
    if (k === 'quality' && this.world) {
      this.world.terrain.splitK = QUALITY[v].splitK;
      if (this.world.buildings) this.world.buildings.drawDist = QUALITY[v].bDist;
    }
    this.saveSettings();
    if (this.menu.visible) this.menu.redraw();
    this.ui.render();
  }

  // switch the way of flying (keeps where you look on a screen; seats you where you stand in VR).
  // On a screen the heading modes turn the rig (so the broom / cockpit / carpet face the way you go) and
  // the camera looks relative to it; the free modes keep the rig still and the camera looks around.
  setMode(mode) {
    const f = this.flight, was = f.M, now = MODES[mode] || MODES.point;
    if (!this.renderer.xr.isPresenting) {
      const look = (was.heading ? this.rig.rotation.y : 0) + this.sin.yaw; // where the camera looks now
      if (now.heading) { f.heading = look; this.rig.rotation.y = look; this.sin.yaw = 0; }
      else { this.rig.rotation.y = 0; this.sin.yaw = look; }
    }
    f.mode = mode;
    this.resetMode();
  }
  resetMode() {
    const f = this.flight, xr = this.renderer.xr.isPresenting;
    this.rig.updateMatrixWorld();
    const head = xr ? this.xin.head.clone() : new THREE.Vector3(0, 1.6, 0);
    f.setMode(f.mode, { xr, inp: xr ? this.xin : null, sin: this.sin, headLocal: head, headWorld: head.clone().applyMatrix4(this.rig.matrixWorld) });
    this.props.set(f.mode, head);
    if (this.menu.visible) this.menu.redraw();
  }

  resize() {
    if (this.renderer.xr.isPresenting) return;
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  // ---- the world ----
  isSaved(area) { const rec = this.store.get(area.id); return !!(rec && rec.done); }

  loadArea(areaIn) {
    const plan = new Plan(areaIn);
    const area = plan.area;
    if (this.area && this.area.id === area.id && this.world) return this.world;
    this.unloadWorld();
    const frame = new Frame(area.lat, area.lon);
    const q = QUALITY[this.settings.quality] || QUALITY.normal;
    this.loader.clear();
    const terrain = new Terrain({ scene: this.scene, frame, plan, loader: this.loader, renderer: this.renderer, splitK: q.splitK });
    const world = (this.world = { area, plan, frame, terrain, buildings: null, t0: performance.now(), spawned: false });
    this.area = area;
    this.flight.limit = plan.limit;
    this.flight.groundAt = (x, z) => terrain.heightAt(x, z).h;
    this.flight.groundAtFull = (x, z) => terrain.heightAt(x, z);
    this.flight.air = world.air = new Air(area);
    this.props.setAir(world.air, this.flight.groundAtFull);
    if (plan.buildings) {
      (async () => {
        let data = await loadBuildings(area);
        if (!data && this.online) {
          try { await fetchBuildings(plan, { store: true }); data = await loadBuildings(area); } catch (e) { this.toast('建物を読み込めませんでした（' + (e.message || e) + '）'); }
        }
        if (data && this.world === world) {
          world.buildings = new Buildings({ scene: this.scene, data, heightAt: (x, z) => terrain.heightAt(x, z), drawDist: q.bDist });
        }
      })();
    }
    this.spawn();
    this.ui.render();
    return world;
  }

  unloadWorld() {
    if (!this.world) return;
    this.world.terrain.dispose();
    this.world.buildings?.dispose();
    this.world = null;
  }

  // put the rig at the area's start point
  spawn() {
    const w = this.world;
    if (!w) return;
    const s = w.area.start || {};
    const head = ((s.heading ?? 0) * Math.PI) / 180, back = s.back ?? 2500;
    const x = -Math.sin(head) * back, z = Math.cos(head) * back;
    const g = w.terrain.heightAt(x, z).h;
    const y = s.alt != null ? Math.max(s.alt, g + 150) : g + 900;
    this.rig.position.set(x, y, z);
    this.flight.vel.set(0, 0, 0);
    const f = this.flight;
    if (this.state === 'vr') { this.rig.rotation.y = -head; }
    else if (f.M.heading) { f.heading = -head; this.rig.rotation.y = -head; this.sin.yaw = 0; this.sin.pitch = -0.2; }
    else { this.rig.rotation.y = 0; this.sin.yaw = -head; this.sin.pitch = -0.2; }
    w.spawned = s.alt != null || w.terrain.heightAt(x, z).z >= 0;
    w.spawnAt = { x, z, head };
    this.resetMode();
  }
  respawn() { this.spawn(); this.toggleMenu(false); }

  // ---- play ----
  startScreen(area) {
    if (area) this.loadArea(area);
    if (!this.world) return;
    this.state = 'screen';
    this.sin.enabled = true;
    this.spawn();
    this.ui.showSheet(false);
  }

  stop() {
    if (this.renderer.xr.isPresenting) { this.exitVR(); return; }
    this.state = 'menu';
    this.sin.enabled = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.showSheet(true);
  }
  toggleScreenMenu() { this.stop(); }

  async startVR(area) {
    if (!navigator.xr) return;
    let session;
    try {
      session = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'] });
    } catch (e) {
      this.toast('VR を始められませんでした：' + (e.message || e));
      return;
    }
    const q = QUALITY[this.settings.quality] || QUALITY.normal;
    this.renderer.xr.setFramebufferScaleFactor(q.scale);
    this.renderer.xr.setFoveation(0.5);
    await this.renderer.xr.setSession(session);
    this.state = 'vr';
    this.sin.enabled = false;
    if (area) this.loadArea(area);
    else if (!this.world) this.loadArea(this.defaultArea());
    this.camera.position.set(0, 0, 0);
    this.camera.rotation.set(0, 0, 0);
    this.spawn();
    this.toggleMenu(false);
    for (const s of ['L', 'R']) this.hands[s].visible = true;
    session.addEventListener('end', () => {
      this.state = 'menu';
      for (const s of ['L', 'R']) this.hands[s].visible = false;
      this.toggleMenu(false);
      this.pointers.set('L', false); this.pointers.set('R', false);
      this.vignette.update(1, 0, false);
      this.camera.position.set(0, 1.6, 0);
      this.rig.rotation.y = 0;
      this.ui.showSheet(true);
      this.resize();
    });
    session.addEventListener('visibilitychange', () => { if (session.visibilityState !== 'visible') this.toggleMenu(true); });
    this.ui.showSheet(false);
  }
  exitVR() { this.renderer.xr.getSession()?.end(); }

  defaultArea() {
    const saved = this.store.list.find((a) => a.done);
    if (saved) return saved;
    return this.ui.areaFromPreset(PRESETS[0]);
  }

  // VR menu: places you can go. cat: all | saved | city | sight | nature
  areaChoices(cat = 'all') {
    const out = [], used = new Set();
    for (const p of PRESETS) {
      const saved = this.ui.savedFor(p);
      const done = saved && saved.done;
      if (done) used.add(saved.id);
      if (cat !== 'all' && cat !== 'saved' && p.cat !== cat) continue;
      if (done) out.push({ id: saved.id, name: saved.name, sub: p.sub, offline: true, key: saved });
      else if (this.online && cat !== 'saved') { const a = this.ui.areaFromPreset(p); out.push({ id: a.id, name: a.name, sub: a.sub, offline: false, key: a }); }
    }
    if (cat === 'all' || cat === 'saved') {
      for (const rec of this.store.list) if (rec.done && !used.has(rec.id)) out.push({ id: rec.id, name: rec.name, sub: rec.sub || `${rec.r} km`, offline: true, key: rec });
    }
    out.sort((a, b) => b.offline - a.offline);
    return cat === 'saved' ? out.filter((o) => o.offline) : out;
  }
  get currentId() { return this.area && this.area.id; }
  flyTo(area) {
    this.loadArea(area);
    this.spawn();
    this.toggleMenu(false);
  }

  toggleMenu(on = !this.menuOpen) {
    this.menuOpen = on && this.state === 'vr';
    if (this.menuOpen) {
      // in front of your face, level
      const h = this.xin.head, q = this.xin.headQuat;
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      f.y = 0;
      if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
      f.normalize();
      this.menu.mesh.position.copy(h).addScaledVector(f, 1.25);
      this.menu.mesh.position.y = h.y - 0.12;
      this.menu.mesh.lookAt(new THREE.Vector3(h.x, h.y - 0.12, h.z).applyMatrix4(this.rig.matrixWorld));
    }
    this.menu.show(this.menuOpen);
  }

  creditsShort() {
    if (!this.world) return '';
    const p = this.world.plan;
    const parts = ['Sentinel-2 cloudless by EOX', 'Terrain Tiles (AWS)'];
    if (p.aerial) parts.splice(1, 0, p.aerial.id === 'gsi' ? '国土地理院' : p.aerial.name);
    if (p.buildings) parts.push('© OpenStreetMap contributors');
    return parts.join(' · ');
  }
  credits() {
    if (!this.world) return [];
    const c = credits(this.world.plan);
    if (this.world.plan.buildings) c.push(OSM_CREDIT);
    return c;
  }

  toast(msg, ms = 4000) {
    this.ui.toast(msg, ms);
    this.toastMsg = msg;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toastMsg = ''; }, ms);
  }

  // ---- the frame ----
  loop(frame) {
    const dt = Math.min(0.1, this.clock.getDelta());
    this.t += dt;
    const w = this.world;
    const xr = this.renderer.xr.isPresenting;
    const camWorld = new THREE.Vector3();
    if (xr && frame) {
      this.xin.read(frame, this.renderer.xr.getReferenceSpace(), dt);
      this.rig.updateMatrixWorld();
      const headWorld = this.xin.head.clone().applyMatrix4(this.rig.matrixWorld);
      if (this.xin.was('*', 5)) this.toggleMenu();
      // hands
      for (const s of ['L', 'R']) {
        const h = this.xin.hands[s], m = this.hands[s];
        m.visible = h.on;
        if (h.on) { m.position.copy(h.pos); m.quaternion.copy(h.quat); }
      }
      if (this.menuOpen) {
        this.flight.coast(dt, 3);
        this.flight.move(dt);
        this.pickMenu();
      } else {
        this.pointers.set('L', false); this.pointers.set('R', false);
        // right stick: snap (or smooth) turn — except in the glider, where it is the control stick
        const sx = this.flight.mode === 'glider' ? 0 : this.xin.hands.R.stick[0];
        if (this.settings.snap) {
          if (Math.abs(sx) > 0.7 && this.snapReady) { this.flight.turn(-Math.sign(sx) * Math.PI / 6, headWorld); this.snapReady = false; }
          if (Math.abs(sx) < 0.3) this.snapReady = true;
        } else if (sx) {
          this.flight.turn(-sx * dt * 1.4, headWorld);
          this.flight.yawRate = Math.max(this.flight.yawRate, Math.abs(sx) * 1.4);
        }
        if (w && w.terrain.started) this.flight.update(dt, { xr: true, inp: this.xin, headLocal: this.xin.head, headWorld });
      }
      this.rig.updateMatrixWorld();
      camWorld.copy(this.xin.head).applyMatrix4(this.rig.matrixWorld);
      const motion = Math.abs(this.flight.yawRate) * 0.9 + Math.min(1, this.flight.accel / 60) + Math.min(0.4, this.flight.speed / 600);
      this.vignette.update(dt, motion, this.settings.vignette && !this.menuOpen);
    } else {
      if (this.state === 'screen' && w) {
        const f = this.flight;
        if (w.terrain.started) f.update(dt, { xr: false, sin: this.sin, headLocal: this.camera.position });
        this.rig.rotation.y = f.M.heading ? f.heading : 0;
        this.camera.rotation.set(this.sin.pitch, this.sin.yaw, 0);
      } else if (w) this.attract(dt);
      this.camera.updateMatrixWorld();
      this.camera.getWorldPosition(camWorld);
    }
    if (w) {
      // once the coarse elevation is in, lift a spawn that guessed its height
      if (!w.spawned && w.terrain.heightAt(w.spawnAt.x, w.spawnAt.z).z >= 0) this.spawn();
      w.terrain.update(camWorld, xr ? 3 : 6);
      w.buildings?.update(camWorld);
    }
    this.sky.update(camWorld, dt, this.settings.clouds);
    // the mode's props (broom, basket, cockpit…) and sound
    const f = this.flight;
    this.props.setActive(this.state !== 'menu');
    if (this.state !== 'menu') this.props.update(dt, f, xr ? this.xin : null, xr ? this.xin.head : this.camera.position, xr);
    this.sound.update(dt, {
      speed: this.state === 'menu' ? 0 : f.speed,
      fire: f.mode === 'balloon' ? f.st.burner || 0 : f.mode === 'jetpack' ? f.st.thr || 0 : 0,
      fireTone: f.mode === 'jetpack' ? 'jet' : 'burner',
      vario: f.mode === 'glider' && this.state !== 'menu',
      climb: f.st.vy || 0,
    });
    this.updateHud(camWorld);
    this.renderer.render(this.scene, this.camera);
    if (!this.firstFrame) { this.firstFrame = true; document.getElementById('loading').classList.add('hidden'); }
  }

  // the menu page's background: a slow circle around the area
  attract(dt) {
    const w = this.world;
    const a = this.t * 0.03;
    const R0 = 3500;
    const g = w.terrain.heightAt(0, 0).h;
    const x = Math.sin(a) * R0, z = Math.cos(a) * R0;
    const gy = w.terrain.heightAt(x, z).h;
    this.rig.position.set(x, Math.max(g, gy) + 900, z);
    this.rig.rotation.y = 0;
    this.sin.yaw = a + Math.PI * 0.15;
    this.sin.pitch = -0.25;
    this.camera.rotation.set(this.sin.pitch, this.sin.yaw, 0);
  }

  pickMenu() {
    let best = null;
    for (const s of ['L', 'R']) {
      const h = this.xin.hands[s];
      if (!h.on) { this.pointers.set(s, false); continue; }
      const o = h.ray.o.clone().applyMatrix4(this.rig.matrixWorld);
      const d = h.ray.d.clone().transformDirection(this.rig.matrixWorld);
      const hit = this.menu.pick(o, d);
      const local = hit ? this.rig.worldToLocal(hit.point.clone()) : null;
      this.pointers.set(s, true, h.ray.o, h.ray.d, hit ? hit.distance : 1.0, local);
      if (hit && hit.button && (!best || hit.distance < best.hit.distance)) best = { s, hit };
      if (hit && this.xin.was(s, 0) && hit.button) { hit.button.onClick?.(); if (this.menu.visible) this.menu.redraw(); }
    }
    this.menu.setHover(best ? best.hit.button.id : null);
  }

  updateHud(cam) {
    if (!this.world) return;
    // a few times a second is enough (redrawing the wrist panel costs a texture upload)
    if (this.t - (this.hudT || 0) < 0.2) return;
    this.hudT = this.t;
    const f = this.flight;
    const deg = ((-(this.state === 'vr' ? this.rig.rotation.y + new THREE.Euler().setFromQuaternion(this.xin.headQuat, 'YXZ').y : this.sin.yaw) * 180) / Math.PI % 360 + 360) % 360;
    const dirs = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
    if (f.msg) { this.flash = f.msg; this.flashT = this.t + 2.5; f.msg = ''; }
    const flash = this.flashT > this.t ? this.flash : '';
    const msg = this.toastMsg || flash || (f.edge ? 'このエリアの端です' : this.world.terrain.started ? '' : '地図を読み込み中…');
    const d = {
      name: this.world.area.name,
      dir: dirs[Math.round(deg / 45) % 8],
      kmh: Math.round(f.speed * 3.6),
      alt: Math.round(cam.y),
      agl: Math.round(Math.max(0, cam.y - f.ground)),
      msg,
      mode: f.M.name,
      info: f.info,
    };
    if (this.state === 'vr') this.hud.set(d);
    else if (this.state === 'screen') this.ui.hud(d, this.world.terrain.stats);
  }
}

const app = new App();
window.__app = app;

// offline: the published build registers a service worker that caches the whole game
if ('serviceWorker' in navigator && window.SA_BUILD && !params.has('nosw')) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const ready = () => app.ui.swState('ok');
    if (reg.active) ready();
    navigator.serviceWorker.ready.then(ready);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) app.ui.swState('update', () => { nw.postMessage('SKIP_WAITING'); });
      });
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading && app.ui.wantReload) { reloading = true; location.reload(); } });
  }).catch(() => app.ui.swState('none'));
} else app.ui.swState(window.SA_BUILD ? 'none' : 'dev');

export { QUALITY, MODES, SPEEDS };
