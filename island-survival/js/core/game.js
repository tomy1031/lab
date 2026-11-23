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
    requestAnimationFrame((t) => this.frame(t));
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
      starter: p.get('starter') || 'knife', ammo: p.get('ammo') || 'limited', companion: p.get('companion') || 'none',
      gesture: p.has('gesture'), seed: Number(p.get('seed')) || 7, playerName: 'あなた',
    };
  }

  /** start a new game with the setup chosen on the setup screen */
  async newGame(setup) {
    this.setup = setup;
    this.ambient = false;
    this.ended = false;
    this.rng = new RNG(setup.seed * 977 + 13);
    this.ensureWorld(setup.seed || 7);
    this.clock = new Clock(setup.dayMinutes || 20, 7 * 60);
    this.bus.emit('game:new', setup);
    // systems are created by the game module that knows the content (js/core/systems.js)
    const { installSystems } = await import('./systems.js');
    await installSystems(this, setup);
    const s = this.world.terrain.shorePoint(Math.atan2(this.world.layout.start.z, this.world.layout.start.x), 1.5);
    this.player.place(s.x, s.z, Math.atan2(s.x, s.z));
    this.running = true;
    this.paused = false;
    this.bus.emit('game:start', setup);
  }

  pause(on = true) {
    this.paused = on;
    this.input.enabled = !on;
    if (on) this.input.exitLock();
  }

  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    if (!this.world) return;
    try {
      this.update(dt);
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
      this.player.look(look.x, look.y);
      gm = this.clock.tick(dt);
      this.player.seaLevel = this.clock.tide();
      this.player.update(dt, this.input.axes());
      for (const name of this.order) this.sys[name].update?.(dt, gm, this);
    } else {
      for (const name of this.order) this.sys[name].updatePaused?.(dt, this);
    }
    const weather = this.sys.weather?.visual?.() || { cloud: 0.25, rain: 0, fog: 0, wind: 0.3, storm: 0 };
    this.world.update(dt, { hours: this.clock.hour, weather, tide: this.clock.tide(), time: this.clock.total * 60 / this.clock.rate / 60 }, this.player.pos, cam);
    for (const name of this.order) this.sys[name].lateUpdate?.(dt, this);
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
