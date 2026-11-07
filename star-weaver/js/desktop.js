// desktop.js — play-test without a headset: mouse = hands, A/D = side step, S = squat, Space = pause.
// Also an autoplay bot (?autoplay) that plays the chart, used for the demo and the automated tests.
import * as THREE from 'three';
import { clamp, lerp } from './util.js';

const tmp = new THREE.Vector3();

export class Desktop {
  constructor(game, canvas) {
    this.game = game;
    this.canvas = canvas;
    this.active = false;
    this.bot = null;
    this.ndc = new THREE.Vector2(0, -0.2);
    this.click = false;
    this.keys = new Set();
    this.head = new THREE.Vector3(0, 1.58, 0);
    this.headObj = new THREE.Object3D(); // the player's head; the camera floats behind it while playing
    this.camBack = 0;
    game.headObj = this.headObj;
    // a faint visor so you can see where "you" are in the spectator view
    const visor = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
    visor.rotation.x = Math.PI / 2;
    visor.visible = false;
    game.stageRoot.add(visor);
    this.visor = visor;
    this.look = new THREE.Euler(0, 0, 0, 'YXZ');
    this.hand = { L: new THREE.Vector3(-0.25, 1.1, -0.3), R: new THREE.Vector3(0.25, 1.1, -0.3) };
    this.t = 0;
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    });
    canvas.addEventListener('pointerdown', () => { this.click = true; });
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      this.keys.add(e.code);
      if (e.code === 'Space') { e.preventDefault(); const g = this.game; if (g.state === 'play') g.pause(); else if (g.state === 'paused') g.resume(); }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  start(autoplay) {
    this.active = true;
    this.bot = autoplay ? new Bot(this.game, this) : null;
    this.head.set(0, this.game.body.eyeY, 0);
    this.look.set(0, 0, 0);
  }
  stop() { this.active = false; this.bot = null; this.visor.visible = false; this.camBack = 0; }

  update(dt) {
    const g = this.game, cam = g.camera;
    this.t += dt;
    if (!this.active) {
      // landing page backdrop: a slow look around the sky
      cam.position.set(0, 1.6, 0);
      cam.rotation.set(0.16 + Math.sin(this.t * 0.07) * 0.05, Math.sin(this.t * 0.05) * 0.5, 0, 'YXZ');
      return;
    }
    const b = g.body;
    if (g.state !== 'play' && g.state !== 'resuming') {
      g.ui.pointer(this.ndc, cam, this.click);
    }
    this.click = false;
    if (this.bot) this.bot.update(dt);
    else this.manual(dt);
    // virtual head; while playing, the camera sits behind and above it so the hands are in view
    g.stageRoot.localToWorld(this.headObj.position.copy(this.head));
    this.headObj.quaternion.setFromEuler(this.look).premultiply(g.stageRoot.quaternion);
    const playing = g.state === 'play' || g.state === 'resuming';
    this.camBack = lerp(this.camBack, playing ? 1 : 0, Math.min(1, dt * 3));
    const k = this.camBack;
    tmp.set(this.head.x * (1 - 0.5 * k), this.head.y + 0.28 * k, this.head.z + 1.15 * k);
    g.stageRoot.localToWorld(cam.position.copy(tmp));
    cam.quaternion.setFromEuler(new THREE.Euler(this.look.x * (1 - k) - 0.2 * k, this.look.y * (1 - k), 0, 'YXZ')).premultiply(g.stageRoot.quaternion);
    this.visor.visible = k > 0.3;
    this.visor.position.copy(this.head);
    for (const k of ['L', 'R']) {
      const h = g.hands[k];
      h.tracked = true;
      g.stageRoot.localToWorld(h.world.copy(this.hand[k]));
      h.pokeWorld.copy(h.world);
    }
  }

  manual(dt) {
    const g = this.game, b = g.body, lw = g.laneW;
    // A / D (or arrows) choose a lane, S squats
    let lane = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) lane = -1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) lane = 1;
    const squat = this.keys.has('KeyS') || this.keys.has('ArrowDown');
    this.head.x = lerp(this.head.x, lane * lw, Math.min(1, dt * 8));
    this.head.y = lerp(this.head.y, b.eyeY - (squat ? 0.2 : 0), Math.min(1, dt * 8));
    // the mouse ray picks a point on a plane in front of the shoulders; the left hand mirrors it
    const cam = g.camera, ray = new THREE.Ray();
    ray.origin.copy(cam.position);
    ray.direction.set(this.ndc.x, this.ndc.y, 0.5).unproject(cam).sub(cam.position).normalize();
    const local = g.stageRoot.worldToLocal(ray.origin.clone());
    const dir = ray.direction.clone().applyQuaternion(g.stageRoot.quaternion.clone().invert());
    const z = -0.42;
    const k = (z - local.z) / (dir.z || -1e-3);
    if (k > 0) {
      const p = local.addScaledVector(dir, k);
      const cx = this.head.x;
      this.hand.R.set(clamp(p.x, cx - 0.9, cx + 0.9), clamp(p.y, 0.6, 2.4), z);
      this.hand.L.set(2 * cx - this.hand.R.x, this.hand.R.y, z);
    }
  }
}

// ---------------- autoplay ----------------
class Bot {
  constructor(game, desk) { this.game = game; this.desk = desk; this.skill = game.params.skill ?? 1; }
  rest(side) {
    const b = this.game.body;
    return new THREE.Vector3(this.desk.head.x + side * 0.24, b.shoulderY - 0.32, -0.28);
  }
  update(realDt) {
    const g = this.game, d = this.desk, t = g.t, b = g.body;
    // move on the song clock, so the bot keeps up when tests run the game faster than real time
    const dt = g.state === 'play' ? Math.max(0, Math.min(0.25, t - (this.lastT ?? t))) || realDt : realDt;
    this.lastT = t;
    if (g.state === 'play' && dt > 0) this.step = dt;
    if (g.state === 'results' && g.params.autoplay && !this.restartAt) this.restartAt = performance.now() + 6000;
    if (this.restartAt && performance.now() > this.restartAt && g.params.loopDemo) { this.restartAt = 0; g.startGame(); }
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1;
      let target = null, when = Infinity, follow = false;
      for (const e of g.entities) {
        if (e.dead) continue;
        const ev = e.ev;
        const mine = ev.hand === side || (ev.hand === 'A' && side === 'R');
        if (ev.type === 'orb' && mine && e.state === 'fly' && ev.t < when && ev.t > t - 0.25) { when = ev.t; target = ev.pos; follow = false; }
        else if (ev.type === 'thread' && mine && t > ev.t - 0.8 && t < ev.t1 && ev.t - 0.4 < when) {
          when = ev.t - 0.4; follow = t >= ev.t - 0.1;
          const u = Math.min(1, Math.max(0, (t + (this.step || 0.016) - ev.t) / (ev.t1 - ev.t)));
          target = ev.path(u, new THREE.Vector3());
        }
        else if (ev.type === 'gate' && ev.hands.includes(side) && t > ev.t - 1.0 && t < ev.t1 && ev.t - 0.5 < when) { when = ev.t - 0.5; target = ev.targets[side]; follow = true; }
      }
      const h = d.hand[side];
      if (!target) { h.lerp(this.rest(s), Math.min(1, dt * 3)); continue; }
      if (follow) { h.lerp(target, this.skill >= 1 ? 1 : Math.min(1, dt * 14)); continue; }
      const remain = when - t;
      // a less-than-perfect bot (skill < 1) sometimes aims a little off
      const aim = target.clone();
      if (this.skill < 1) aim.x += Math.sin(when * 7.1) * (1 - this.skill) * 0.4;
      if (remain > 0.7) h.lerp(this.rest(s).lerp(aim, 0.35), Math.min(1, dt * 3));
      else h.add(aim.sub(h).multiplyScalar(Math.min(1, dt / Math.max(remain, dt))));
    }
    // side steps and squats
    let laneX = d.head.x, eye = b.eyeY;
    for (const e of g.entities) {
      if (e.dead) continue;
      const ev = e.ev;
      if (ev.type === 'wall' && ev.t - t < 0.9 && ev.t - t > -0.2) laneX = ev.free * ev.laneW;
      if (ev.type === 'bar' && ev.t - t < 0.45 && ev.t - t > -0.2) eye = b.standEyeY - ev.depth - 0.02;
    }
    d.head.x = lerp(d.head.x, laneX, Math.min(1, dt * 6));
    d.head.y = lerp(d.head.y, eye, Math.min(1, dt * 7));
    // the cool-down firefly: turn the head toward it
    const gz = g.entities.find((e) => e.ev.type === 'gaze' && !e.dead);
    if (gz) {
      const v = gz.pos.clone().sub(d.head);
      d.look.y = lerp(d.look.y, Math.atan2(-v.x, -v.z), Math.min(1, dt * 6));
      d.look.x = lerp(d.look.x, Math.atan2(v.y, Math.hypot(v.x, v.z)), Math.min(1, dt * 6));
    } else { d.look.x *= 0.9; d.look.y *= 0.9; }
  }
}
