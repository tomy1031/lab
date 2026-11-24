// core/game.js — the game: owns the world, the player, the clock and every system, and runs the loop.
//
// Systems are plain objects registered with `game.add(name, system)`; each may implement
//   init(game)            once, after the world exists
//   update(dt, gm, game)  every frame (dt = real seconds, gm = elapsed game minutes)
//   serialize() / deserialize(data)   for the save file
// and talk to each other through `game.bus` (core/events.js) or direct references (game.sys.<name>).
import * as THREE from 'three';
import { World } from '../world/world.js';
import { PlayerController } from '../player/controller.js';
import { Input } from './input.js';
import { Clock } from './clock.js';
import { EventBus } from './events.js';
import { RNG } from './rng.js';
import { AudioEngine } from '../audio/engine.js';

export class Game {
  constructor(renderer, { params } = {}) {
    this.renderer = renderer;
    this.params = params || new URLSearchParams();
    this.bus = new EventBus();
    this.input = new Input(renderer.r.domElement);
    this.audio = new AudioEngine();
    this.sys = {};
    this.order = [];
    this.world = null;
    this.player = null;
    this.clock = new Clock(20);
    this.running = false;
    this.paused = true;
    this.fps = 60;
    this.last = performance.now();
    this.setup = null;
    this.rng = new RNG(1);
    this.ended = false;
    this.ambient = false;
    this.loopRaf();
  }

  /** the page's own frame loop; in a VR session the headset's frames drive frame() instead (vr/xr.js) */
  loopRaf() {
    if (this._raf) return;
    this._raf = requestAnimationFrame((t) => { this._raf = 0; if (this.xr?.presenting) return; this.loopRaf(); this.frame(t); });
  }

  add(name, system) {
    this.sys[name] = system;
    this.order.push(name);
    system.init?.(this);
    return system;
  }

  /** build the island (shared by the title-screen preview and the game) */
  ensureWorld(seed = 7) {
    if (this.world && this.world.seed === seed) return this.world;
    this.world = new World(this.renderer, { seed });
    this.player = new PlayerController(this.renderer.camera, this.world.terrain, this.world.nodes);
    return this.world;
  }

  /** a slow fly-over behind the title screen */
  startAmbientPreview() {
    this.ensureWorld(7);
    this.ambient = true;
    this.paused = false;
  }

  quickSetup(p) {
    return {
      days: Number(p.get('days')) || 30, dayMinutes: Number(p.get('daymin')) || 20, difficulty: p.get('difficulty') || 'normal',
      count: p.get('count') === 'all' ? 'all' : p.has('count') ? Number(p.get('count')) : (p.get('starter') === 'none' ? 0 : 1),
      starters: (p.get('starter') || 'knife').split(',').filter((x) => x && x !== 'none'), ammo: p.get('ammo') === 'inf' ? 'inf' : Number(p.get('ammo')) || 12, companion: p.get('companion') || 'none',
      control: p.has('gesture') ? 'gesture' : 'mouse', season: 'dry', seed: Number(p.get('seed')) || 7, playerName: 'あなた',
      profession: p.get('prof') || 'auto', companionAffinity: p.has('aff') ? Number(p.get('aff')) : undefined,
    };
  }

  /** start a new game with the setup chosen on the setup screen */
  async newGame(setup) {
    this.setup = setup;
    this.ambient = false;
    this.ended = false;
    this.rng = new RNG(setup.seed * 977 + 13);
    this.ensureWorld(setup.seed || 7);
    this.clock = new Clock(setup.dayMinutes || 24, 8 * 60);
    this.bus.emit('game:new', setup);
    // systems are created by the game module that knows the content (js/core/systems.js)
    this.screens?.show?.('loading', { text: '島を 準備しています…', progress: 0.5 });
    // place the player first: systems (the companion, day-1 drops) are placed around them
    const s0 = this.world.terrain.shorePoint(Math.atan2(this.world.layout.start.z, this.world.layout.start.x), 1.5);
    this.player.place(s0.x, s0.z, Math.atan2(s0.x, s0.z));
    const { installSystems } = await import('./systems.js');
    await installSystems(this, setup);
    this.bindKeys();
    this.screens?.hide?.();
    document.getElementById('hud')?.classList.remove('hidden');
    this.running = true;
    this.paused = false;
    this.bus.emit('game:start', setup);
  }

  /** back to the title: a fresh page (simplest way to drop every system) */
  toTitle() { location.href = location.pathname; }
  /** もう一度: the same setup, a fresh page */
  restartGame() { try { sessionStorage.setItem('isle.restart', JSON.stringify({ ...this.setup, restoring: false })); } catch { /* ignore */ } location.href = location.pathname; }

  hasSave() { return !!this.savedData(); }
  savedData() { try { return JSON.parse(localStorage.getItem('isle.save') || 'null'); } catch { return null; } }

  /** つづきから: rebuild the game from the autosave (§17.3) */
  async continueGame() {
    const data = this.savedData();
    if (!data?.setup) return false;
    await this.newGame({ ...data.setup, restoring: true });
    this.clock.total = data.clock?.total ?? this.clock.total;
    if (data.player) this.player.place(data.player.x, data.player.z, data.player.yaw || 0);
    for (const [name, d] of Object.entries(data.sys || {})) { try { this.sys[name]?.deserialize?.(d); } catch (e) { console.warn('load', name, e); } }
    this.sys.player?.validate?.();
    this.stats = { ...(this.stats || {}), ...(data.stats || {}) };
    if (data.goals) this.goals = data.goals;
    this.bus.emit('toast', { text: `${this.clock.label()} から つづける`, kind: 'info' });
    return true;
  }

  /** which companions can be chosen (ゲン has no model yet) */
  companionAvailable(id) { return id !== 'gen'; }

  /** setup screen: does this Gemini key open a Live session? → { ok, model?, reason? } */
  async testApiKey(key) {
    const { connectLive } = await import('../companion/live.js');
    const r = await connectLive({ apiKey: key, setup: { generationConfig: { responseModalities: ['AUDIO'] } } });
    if (r.ok) { r.session.close(); return { ok: true, model: r.model }; }
    return { ok: false, reason: r.reason };
  }

  /** menu / hotbar keys (once per game) */
  bindKeys() {
    if (this.keysBound) return;
    this.keysBound = true;
    const inp = this.input, open = (name) => { if (!this.running || this.ended) return; if (this.screens?.current === name) this.screens.hide(); else if (!this.screens?.current || this.screens.current === 'hud') this.screens?.show(name); };
    for (let i = 1; i <= 6; i++) inp.on(`slot${i}`, () => { const u = this.sys.player?.hotbar[i - 1]; if (u && !this.screens?.current) this.sys.player.equip(this.sys.player.held === u ? null : u); });
    inp.on('inventory', () => open('inventory'));
    inp.on('craft', () => open('craft'));
    inp.on('build', () => open('build'));
    inp.on('map', () => open('map'));
    inp.on('journal', () => open('journal'));
    inp.on('guide', () => open('guide'));
    inp.on('sleep', () => open('sleep'));
    inp.on('use', () => { const s = this.sys.player?.heldStack(); if (s && !this.screens?.current) { const d = this.sys.player.heldDef(); if (d?.food || s.stew) this.screens?.show('inventory', { focus: s.uid, eat: true }); else this.actions.use(s.uid); } });
    inp.on('menu', () => { if (this.sys.interact?.activity) { this.sys.interact.cancelActivity(); return; } if (this.placement?.active) { this.placement.cancel(); return; } if (this.screens?.current) return; open('pause'); });
    inp.on('talk', () => this.sys.companion?.talkKey?.());
    // answering a companion's proposal (§24.8): Y お願い / U 一緒に / N いや
    for (const [k, id] of [['choiceOk', 'ok'], ['choiceTogether', 'together'], ['choiceNo', 'no']]) inp.on(k, () => { if (this.hud?.choiceOpen) this.bus.emit('choice:pick', { id }); });
    inp.on('companion', () => this.sys.companion?.call?.());
    inp.on('gesture', () => { if (!this.screens?.current) this.screens?.show('gesture'); });
  }

  pause(on = true) {
    this.paused = on;
    this.input.enabled = !on;
    if (on) this.input.exitLock();
  }

  frame(t) {
    const dt = Math.min(0.1, Math.max(0, (t - this.last) / 1000));
    this.last = t;
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    if (!this.world) return;
    const vr = !!this.xr?.presenting;
    if (this.freezeRender && !vr) return; // a full-screen overlay (hand-work) is open: keep the last 3D frame (in VR it is a panel)
    try {
      if (vr) this.xr.update(dt);
      this.update(dt);
      if (vr) { this.xr.afterMove(); this.handwork?.tick?.(t); }
    } catch (e) {
      console.error(e);
      window.ISLE.errors.push(`frame: ${e.message}`);
    }
    this.renderer.render(this.world.scene);
  }

  update(dt) {
    const cam = this.renderer.camera;
    if (this.ambient) {
      // title fly-over
      const a = performance.now() / 1000 * 0.03;
      cam.position.set(Math.cos(a) * 260, 70, Math.sin(a) * 260);
      cam.lookAt(0, 8, 0);
      this.world.update(dt, { hours: 16.8, weather: { cloud: 0.3, rain: 0, wind: 0.3 }, tide: 0, time: performance.now() / 1000 }, cam.position, cam);
      return;
    }
    if (!this.running) return;
    let gm = 0;
    if (!this.paused) {
      const look = this.input.consumeLook();
      const vr = !!this.xr?.presenting;
      if (!vr) this.player.look(look.x, look.y);
      gm = this.clock.tick(dt);
      this.player.seaLevel = this.clock.tide();
      this.player.update(dt, vr ? this.xr.axes : this.input.axes());
      for (const name of this.order) this.sys[name].update?.(dt, gm, this);
    } else {
      for (const name of this.order) this.sys[name].updatePaused?.(dt, this);
    }
    const weather = this.sys.weather?.visual?.() || { cloud: 0.25, rain: 0, fog: 0, wind: 0.3, storm: 0 };
    this.animT = (this.animT || 0) + dt;
    const surge = (this.sys.weather?.type === 'storm' || this.sys.weather?.type === 'typhoon') ? 0.6 : 0;
    const env = this.world.update(dt, { hours: this.clock.hour, weather, tide: this.clock.tide() + surge, time: this.animT }, this.player.pos, cam);
    for (const name of this.order) this.sys[name].lateUpdate?.(dt, this);
    this.lateFrame(dt, env, weather);
  }

  /** per-frame glue: sleep / ticks, hands, view model, rain, ambience, HUD */
  lateFrame(dt, env, weather) {
    const P = this.sys.player;
    if (!P) return;
    if (!this.paused) this.onTick?.();
    this.placement?.update();
    // hands: poll the camera and draw the preview
    if (this.hands?.ready) {
      this.hands.poll();
      const cv = document.getElementById('cam-preview');
      if (cv && !cv.classList.contains('hidden')) this.hands.drawPreview(cv, this.hands.events?.[0]?.type || '');
    }
    // torch burning
    const held = P.heldStack();
    if (held?.lit > 0 && !this.paused) { held.lit -= dt * this.clock.rate * this.clock.scale; if (held.lit <= 0 || (weather.rain > 0.5 && Math.random() < dt * 0.8 / 60 * this.clock.rate)) { held.lit = 0; this.bus.emit('toast', { text: 'たいまつが 消えた', kind: 'info' }); } }
    P.torchLit = !!(held?.lit > 0);
    this.viewmodel?.update(dt, { moving: this.player.moveInfo.moving, running: this.player.moveInfo.running, swimming: this.player.swimming });
    if (this.viewmodel) this.viewmodel.root.visible = !P.sleeping && !this.vrActive;
    const covered = (P.shelter?.rain ?? 0) >= 0.7;
    this.rain?.update(dt, covered ? weather.rain * 0.25 : weather.rain, weather.wind, this.renderer.camera, env?.night ?? 0);
    // ambience
    this.ambT = (this.ambT || 0) + dt;
    if (this.sys.sfx && this.ambT > 0.1) {
      this.ambT = 0;
      const t = this.world.terrain, p = this.player.pos;
      let shore = 0;
      for (let a = 0; a < 8; a++) { const d = 25; if (t.heightAt(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d) < 0.2) shore += 1 / 8; }
      const zone = P.zone;
      this.sys.sfx.setAmbience({ rain: weather.rain, wind: weather.wind, storm: weather.storm, night: env?.night ?? 0, shore: Math.min(1, shore * 1.6 + (zone === 'beach' ? 0.3 : 0)), jungle: zone === 'jungle' ? 1 : zone === 'grass' ? 0.4 : 0.15, underwater: this.player.swimming && this.renderer.camera.position.y < this.player.seaLevel, indoor: covered ? 1 : 0, fire: P.nearFire !== null ? Math.max(0, 1 - P.nearFire / 6) : 0 });
      // footsteps
      if (this.player.moveInfo.moving && this.player.onGround) { this.stepAcc = (this.stepAcc || 0) + this.player.moveInfo.dist; if (this.stepAcc > (this.player.moveInfo.running ? 1.6 : 1.1)) { this.stepAcc = 0; this.sys.sfx.footstep(this.player.moveInfo.inWater ? 'water' : zone, { volume: this.player.crouch ? 0.3 : 0.7 }); } }
    }
    this.hud?.update(dt);
  }

  serialize() {
    const out = { v: 1, setup: this.setup, clock: { total: this.clock.total }, player: { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw }, sys: {} };
    for (const name of this.order) if (this.sys[name].serialize) out.sys[name] = this.sys[name].serialize();
    return out;
  }

  debugState() {
    const p = this.player;
    return {
      running: this.running, paused: this.paused, ended: this.ended, fps: Math.round(this.fps),
      time: this.clock.label(), day: this.clock.day, hour: +this.clock.hour.toFixed(2),
      pos: p ? { x: +p.pos.x.toFixed(1), y: +p.pos.y.toFixed(1), z: +p.pos.z.toFixed(1) } : null,
      zone: p && this.world ? this.world.terrain.zoneAt(p.pos.x, p.pos.z) : null,
      screen: this.screens?.current || null,
      draw: this.renderer.info.calls, tris: this.renderer.info.triangles,
      ...Object.fromEntries(this.order.filter((n) => this.sys[n].debug).map((n) => [n, this.sys[n].debug()])),
    };
  }
}

export { THREE };
