// js/game.js — the session in the browser: your racket and free hand, serving tosses, movement, the CPU's
// avatar, the boards and the sounds, around the rendering-free Sim.
import * as THREE from 'three';
import { Sim } from './sim.js';
import { World } from './world.js';
import { BallView } from './ballview.js';
import { Hud } from './hud.js';
import { Sound } from './audio.js';
import { Avatar, strokePose } from './avatar.js';
import { RacketBody, buildRacketMesh } from './racket.js';
import { Player } from './player.js';
import { DesktopSwing } from './desktop.js';
import { VrMenu } from './vrmenu.js';
import { predict, findEvent } from './predict.js';
import { assistShot } from './solver.js';
import { COURT, inSingles, inServiceBox, speed as vlen } from './physics.js';
import { SETTING, formatValue } from './config.js';
import { SERVE_CONTACT, SERVE_FRONT } from './ai.js';

const MODE_JA = { match: '試合', rally: 'ラリー練習', machine: '球出し', serve: 'サーブ練習' };
const MOVE_JA = { step: '足踏み・腕振り', auto: '自動', dpad: '十字キー' };

export class Game {
  constructor({ renderer, scene, camera, rig, settings, input, demo, seed }) {
    Object.assign(this, { renderer, scene, camera, rig, settings, input });
    this.demo = !!demo;
    this.world = new World(scene);
    this.ballView = new BallView(scene);
    this.hud = new Hud(scene);
    this.sound = new Sound(settings);
    this.sim = new Sim({ get: (k) => settings.get(k), seed, bot: this.demo });
    this.player = new Player(rig, camera, settings);
    this.desktop = new DesktopSwing();
    // the CPU and (on PC / demo) you, seen from behind
    this.cpuAvatar = new Avatar({ shirt: 0xc0392b, racket: 0x8e1b1b });
    scene.add(this.cpuAvatar.root);
    this.meAvatar = new Avatar({ shirt: 0x1f4e8c, shorts: 0x1b2433, cap: 0x1f4e8c, racket: 0x1e2a44, skin: 0xd7a07a });
    scene.add(this.meAvatar.root);
    // your racket in VR + collision body
    this.racketMesh = buildRacketMesh();
    scene.add(this.racketMesh);
    this.racket = new RacketBody();
    // free hand
    this.offHand = this.buildHand();
    scene.add(this.offHand);
    this.offHand.add(this.hud.wrist.mesh);
    this.hud.wrist.mesh.position.set(0, 0.05, 0.11);
    this.hud.wrist.mesh.rotation.x = -1.05;
    // ball machine
    this.machine = this.buildMachine();
    scene.add(this.machine);
    // aim marker (PC)
    this.aimMark = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.32, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
    this.aimMark.rotation.x = -Math.PI / 2; this.aimMark.position.y = 0.01;
    scene.add(this.aimMark);
    // comfort: vignette and fade (on the camera)
    this.vignette = this.buildVignette();
    camera.add(this.vignette);
    this.fade = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false }));
    this.fade.renderOrder = 100;
    camera.add(this.fade);
    this.fadeT = 0;
    this.menu = new VrMenu(scene, settings, {
      resume: () => this.closeMenu(),
      restart: () => { this.menu.hide(); this.paused = false; this.start(); },
      recenter: () => this.player.recenter(),
    });
    this.paused = false;
    this.time = 0;
    this.toss = { holding: false, hist: [] };
    this.tip = '';
    this.lastInfo = '';
    this.excite = 0;
    this.stickHold = 0;
    this.started = false;
    this.errors = [];
    settings.onChange((k) => {
      if (k === 'surface') this.world.setSurface(settings.get('surface'));
      if (k === 'racketTilt' || k === 'racketRoll' || k === 'hand') this.calib = null;
    });
    this.world.setSurface(settings.get('surface'));
    this.events = [];       // for tests: everything the sim said
  }

  buildHand() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xd7a07a, roughness: 0.7 });
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.03, 0.1), mat);
    palm.position.set(0, -0.01, 0.01);
    g.add(palm);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.05, 3, 6), mat);
      f.rotation.x = Math.PI / 2 + 0.5; f.position.set(-0.03 + i * 0.02, -0.02, -0.06);
      g.add(f);
    }
    const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.04, 3, 6), mat);
    th.position.set(0.05, -0.01, -0.01); th.rotation.z = -0.9;
    g.add(th);
    g.visible = false;
    return g;
  }
  buildMachine() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.75), new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.5 }));
    body.position.y = 0.5; g.add(body);
    const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.25, 0.35, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x9aa4ae, roughness: 0.4, side: THREE.DoubleSide }));
    hopper.position.y = 1.0; g.add(hopper);
    const balls = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd7ec3a, roughness: 0.9 }));
    balls.position.y = 0.95; balls.scale.y = 0.35; g.add(balls);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 12), body.material);
    nozzle.rotation.x = Math.PI / 2; nozzle.position.set(0, 1.0, 0.35); g.add(nozzle);
    for (const x of [-0.25, 0.25]) for (const z of [-0.3, 0.3]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 12), body.material); w.rotation.z = Math.PI / 2; w.position.set(x, 0.08, z); g.add(w); }
    g.position.set(0, 0, -(COURT.halfLen + 0.55));
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.visible = false;
    return g;
  }
  buildVignette() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 40, 128, 128, 128);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.55, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    m.position.z = -0.2;
    m.renderOrder = 99;
    return m;
  }

  get xr() { return this.renderer.xr.isPresenting; }

  start() {
    this.started = true;
    this.paused = false;
    const mode = this.settings.get('mode');
    this.mode = mode;
    this.ballView.clearMarks();
    this.cpuAvatar.root.visible = mode === 'match' || mode === 'rally';
    this.machine.visible = mode === 'machine';
    this.sim.start(mode);
    this.hud.showCall(MODE_JA[mode], MOVE_JA[this.settings.get('moveMode')] + 'で移動', '#7fffd4', 2.4);
    this.player.reactUntil = 0;
  }

  openMenu() {
    if (this.xr) { this.menu.show(this.camera); this.paused = true; }
    else if (this.onPcMenu) this.onPcMenu(true);
  }
  closeMenu() {
    const restart = this.menu.hide();
    this.paused = false;
    if (restart || this.sim.phase === 'over') this.start();
  }

  /** the racket's rotation relative to the controller's pointing ray (see config: racketTilt / racketRoll) */
  calibQuat() {
    if (this.calib) return this.calib;
    const tilt = this.settings.get('racketTilt') * Math.PI / 180;
    let roll = this.settings.get('racketRoll') * Math.PI / 180;
    if (this.settings.get('hand') === 'left') roll = -roll;
    const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2 + tilt);
    const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2 + roll);
    this.calib = q1.multiply(q2);
    return this.calib;
  }

  frame(dt) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const input = this.input, S = this.settings, sim = this.sim, xr = this.xr;
    input.update();
    const handKey = S.get('hand') === 'left' ? 'left' : 'right';
    const offKey = handKey === 'left' ? 'right' : 'left';
    const rh = input.hands[handKey], oh = input.hands[offKey];
    // menu (B / Y), recenter (hold a stick 1 s)
    if (xr && (input.hands.left.pressed.b || input.hands.right.pressed.b)) { if (this.menu.open) this.closeMenu(); else this.openMenu(); }
    if (!xr && (input.keyHit('Escape') || input.keyHit('KeyM'))) this.openMenu();
    if (xr && (input.hands.left.stickPress || input.hands.right.stickPress)) { this.stickHold += dt; if (this.stickHold > 1 && this.stickHold - dt <= 1) { this.player.recenter(); this.hud.showCall('向きをリセット', '', '#7fffd4', 1.2); } } else this.stickHold = 0;
    if (this.menu.open) this.menu.update(input);
    if (!this.started) { input.endFrame(); return; }
    const paused = this.paused || this.menu.open;

    // ── movement ──
    if (!paused) {
      if (this.demo) {
        const b = sim.bot.s;
        this.rig.position.set(b.x, 0, b.z);
        Object.assign(this.player.body, b);
        this.rig.updateMatrixWorld(true);
      } else {
        this.player.update(dt, sim, input, xr);
        Object.assign(sim.body, this.player.body);
      }
    }

    // ── your racket ──
    const plan = sim.playerPlan;
    const serving = sim.holder === 'p' || (sim.judge.phase === 'toss' && sim.judge.server === 'p');
    const hs = S.get('hand') === 'left' ? -1 : 1;
    let racketVisible = true;
    if (xr && !this.demo) {
      this.racket.enabled = rh.tracked;
      racketVisible = rh.tracked;
      if (rh.tracked) {
        const q = rh.ray.quaternion.clone().multiply(this.calibQuat());
        this.racket.setPose(rh.grip.position, q, dt);
        this.racketMesh.position.copy(rh.grip.position); this.racketMesh.quaternion.copy(q);
      }
      this.meAvatar.root.visible = false;
    } else {
      // PC / demo: a scripted stroke along the real path; the demo bot's strokes are drawn only
      if (!this.demo && !paused) {
        const aim = this.desktop.aimFrom(input.mouse.x, (input.mouse.y + 1) / 2, serving ? sim.serveCourt : null);
        this.aimMark.position.x = aim.x; this.aimMark.position.z = aim.z;
        if (input.mouse.clicked[0] || input.mouse.clicked[2] || input.keyHit('KeyJ') || input.keyHit('KeyK')) {
          const slice = input.mouse.clicked[2] || input.keyHit('KeyK');
          if (serving && sim.holder !== 'p') this.desktop.start('drive', 'fh', SERVE_CONTACT, true);
          else if (!serving) this.desktop.start(slice ? 'slice' : 'drive', plan ? plan.wing : 'fh', plan ? plan.c.y : 0.95);
        }
        if (input.keyHit('Space') && sim.holder === 'p') this.pcToss();
        if (this.autoSwing) this.autoStroke(plan, serving);
      }
      this.aimMark.visible = !this.demo && !xr;
      const body = this.player.body;
      const pose = this.desktop.update(paused ? 0 : dt, body, plan, hs, serving && !this.desktop.busy);
      this.racket.enabled = !this.demo;
      this.racket.setPose(pose.p, pose.q, Math.max(dt, 1e-3));
      this.racketMesh.position.copy(pose.p); this.racketMesh.quaternion.copy(pose.q);
      racketVisible = false;
      // you, seen from behind
      this.meAvatar.root.visible = true;
      this.meAvatar.root.scale.x = hs;
      let sw;
      if (this.demo) sw = sim.bot.swingState();
      else if (this.desktop.state) {
        const st = this.desktop.state, u = this.desktop.u();
        sw = st.kind === 'serve' ? { kind: 'serve', u, toss: 1 } : { kind: st.kind, u, cH: st.cH, slice: st.slice };
      } else if (serving) sw = { kind: 'serve', u: -0.35, toss: sim.holder === 'p' ? 0 : 1 };
      else if (plan && !plan.volley) sw = { kind: plan.wing, u: -1, cH: plan.c.y };
      else sw = { kind: 'ready', u: 0 };
      this.meAvatar.update(paused ? 0 : dt, { x: body.x, z: body.z, yaw: Math.PI, vx: body.vx, vz: body.vz, swing: sw });
    }
    this.racketMesh.visible = racketVisible;
    if (!paused) this.racket.cooldown = Math.max(0, this.racket.cooldown - dt);

    // ── free hand & the serve toss (VR) ──
    this.offHand.visible = xr && oh.tracked;
    if (xr && oh.tracked) {
      this.offHand.position.copy(oh.grip.position); this.offHand.quaternion.copy(oh.grip.quaternion);
      const hist = this.toss.hist;
      hist.push({ t: this.time, p: oh.grip.position.clone() });
      while (hist.length > 8) hist.shift();
      if (sim.holder === 'p' && !paused && !this.demo) {
        if (oh.pressed.trigger || oh.pressed.squeeze) this.toss.holding = true;
        if (this.toss.holding && (oh.released.trigger || oh.released.squeeze)) { this.toss.holding = false; this.vrToss(oh); }
      }
    }
    if (sim.holder === 'p') {
      // the ball sits in your free hand (VR) or in front of you (PC)
      if (xr && oh.tracked) {
        const p = new THREE.Vector3(0, -0.005, -0.045).applyQuaternion(oh.grip.quaternion).add(oh.grip.position);
        Object.assign(sim.ball.p, { x: p.x, y: p.y, z: p.z });
      } else {
        const b = this.player.body;
        Object.assign(sim.ball.p, { x: b.x - hs * 0.25, y: 1.0, z: b.z - 0.3 });
      }
      sim.ball.v.x = sim.ball.v.y = sim.ball.v.z = 0;
    }
    // demo bot / PC: tips
    this.tip = this.makeTip(serving);

    // ── the sim ──
    if (!paused) {
      const hooks = this.racket.enabled ? {
        racket: (b0, b1, a0, a1) => this.racket.sweep(new THREE.Vector3(b0.x, b0.y, b0.z), new THREE.Vector3(b1.x, b1.y, b1.z), a0, a1),
        impact: (ball, hit) => this.impact(ball, hit, rh),
      } : {};
      this.racket.power = S.get('swingPower');
      try { sim.update(dt, hooks); } catch (e) { this.errors.push(String(e && e.stack || e)); console.error(e); }
    }
    for (const e of sim.events) this.onEvent(e);
    sim.events.length = 0;

    // ── visuals ──
    const ballShown = sim.live || sim.holder === 'p';
    this.ballView.setVisible(ballShown);
    if (ballShown) this.ballView.update(sim.ball, paused ? 0 : dt, S.get('trail') && sim.live);
    this.ballView.tickMarks(dt);
    const cpu = sim.cpu;
    if (this.cpuAvatar.root.visible) this.cpuAvatar.update(paused ? 0 : dt, { x: cpu.s.x, z: cpu.s.z, yaw: 0, vx: cpu.s.vx, vz: cpu.s.vz, swing: cpu.swingState() });
    const tg = this.player.target;
    const showT = S.get('showTarget') && tg && S.get('moveMode') !== 'dpad' && !this.demo && sim.phase === 'play';
    this.ballView.showTarget(tg ? tg.x : 0, tg ? tg.z : 0, !!(showT || (S.get('showTarget') && S.get('moveMode') === 'dpad' && plan && sim.phase === 'play')), this.time, !plan || plan.reachable);
    if (plan && S.get('moveMode') === 'dpad' && S.get('showTarget')) this.ballView.target.position.set(plan.stance.x, 0.01, plan.stance.z);
    const bounce = plan && plan.bounce;
    this.ballView.showBounce(bounce ? bounce.x : 0, bounce ? bounce.z : 0, !!(S.get('showBounce') && bounce && sim.phase === 'play'));
    this.hud.tick(dt);
    this.updateBoards();
    // vignette while moved artificially; fade for repositioning
    const vig = xr ? S.get('vignette') * Math.min(1, this.player.speed / 2.2) : 0;
    this.vignette.material.opacity += (vig - this.vignette.material.opacity) * Math.min(1, dt * 10);
    this.vignette.visible = this.vignette.material.opacity > 0.01;
    if (this.fadeT > 0) { this.fadeT -= dt; this.fade.material.opacity = Math.min(1, this.fadeT / 0.25); }
    this.fade.visible = this.fade.material.opacity > 0.01 && this.fadeT > 0;
    this.excite *= Math.exp(-dt / 1.5);
    this.world.update(this.time, this.excite);
    this.sound.setListener(this.camera);
    // PC camera: behind you
    if (!xr) this.pcCamera(dt);
    input.endFrame();
  }

  pcCamera(dt) {
    const b = this.player.body;
    const cam = this.camera;
    if (this.camOverride) {
      // tests / screenshots: a fixed world camera
      const o = this.camOverride;
      cam.position.copy(this.rig.worldToLocal(new THREE.Vector3(...o.pos)));
      cam.lookAt(new THREE.Vector3(...o.look));
      return;
    }
    // the camera sits in the rig at the body; offset behind and above, looking down the court
    const want = new THREE.Vector3(b.x * 0.75, 2.55, b.z + 3.6);
    const local = this.rig.worldToLocal(want.clone());
    if (!this.camInit) { cam.position.copy(local); this.camInit = true; }
    cam.position.lerp(local, 1 - Math.exp(-dt / 0.12));
    const look = new THREE.Vector3(b.x * 0.4, 0.9, b.z - 9);
    cam.lookAt(look);
  }

  /** PC helper (and the tests): toss and swing by themselves at the right moment */
  autoStroke(plan, serving) {
    const sim = this.sim, d = this.desktop;
    if (d.state) return;
    if (sim.holder === 'p' && (sim.phase === 'serve-p')) { if (!this._autoTossT || this.time - this._autoTossT > 1.2) { this._autoTossT = this.time; this.pcToss(); } return; }
    if (serving && sim.live && sim.holder !== 'p') {
      const b = sim.ball;
      if (b.v.y < 0) {
        const tIn = (b.p.y - SERVE_CONTACT) / -b.v.y;
        if (tIn <= d.backswing('serve')) d.start('drive', 'fh', SERVE_CONTACT, true, tIn);
      }
      return;
    }
    if (plan && sim.phase === 'play') {
      const tIn = plan.tAbs - sim.time;
      if (tIn <= d.backswing('drive') && tIn > -0.05) d.start('drive', plan.wing, plan.c.y, false, tIn);
    }
  }

  pcToss() {
    const b = this.player.body;
    const hs = this.settings.get('hand') === 'left' ? -1 : 1;
    const rel = 1.95, peak = SERVE_CONTACT + 0.3;
    const p = { x: b.x + hs * 0.2, y: rel, z: b.z - SERVE_FRONT };
    this.sim.toss(p, { x: 0, y: Math.sqrt(2 * 9.81 * (peak - rel)), z: 0 });
  }
  vrToss(oh) {
    const S = this.settings;
    const p = oh.grip.position.clone().add(new THREE.Vector3(0, 0.04, 0));
    let v;
    if (S.get('tossAssist')) {
      v = { x: 0, y: Math.sqrt(2 * 9.81 * S.get('tossHeight')), z: -0.15 };
    } else {
      const h = this.toss.hist;
      const a = h[Math.max(0, h.length - 4)], b = h[h.length - 1];
      const dtt = Math.max(1e-3, b.t - a.t);
      v = { x: (b.p.x - a.p.x) / dtt, y: (b.p.y - a.p.y) / dtt, z: (b.p.z - a.p.z) / dtt };
    }
    this.sim.toss({ x: p.x, y: p.y, z: p.z }, v);
  }

  /** your strings met the ball: physics, then the optional assist, haptics */
  impact(ball, hit, rh) {
    const info = this.racket.impact(ball, hit);
    const S = this.settings, sim = this.sim;
    const pc = !this.xr;
    const serving = sim.judge.phase === 'toss';
    // on PC the mouse aims (a mouse can't tilt the face): the serve goes where you aim, strokes nearly so
    const amount = pc ? (serving ? 1 : Math.max(0.9, S.get('assist'))) : S.get('assist');
    if (amount > 0 && vlen(ball.v) > 4) {
      const surf = sim.surf;
      const pr = predict(ball, surf, 3, 1);
      const bnc = findEvent(pr, 'bounce');
      let target = null;
      const good = bnc && (serving ? inServiceBox(bnc.x, bnc.z, -1, sim.serveCourt) : inSingles(bnc.x, bnc.z, -1));
      if (pc) target = this.desktop.aim;
      else if (!good) {
        if (serving) {
          const sign = sim.serveCourt === 'deuce' ? -1 : 1;
          const bx = bnc ? bnc.x : sign * 2;
          target = { x: sign * Math.min(COURT.singlesHalfW - 0.4, Math.max(0.4, bx * sign)), z: -Math.min(COURT.serviceZ - 0.5, Math.max(2.5, bnc && bnc.z < 0 ? -bnc.z : 4.5)) };
        } else {
          const bx = bnc ? bnc.x : 0, bz = bnc && bnc.z < 0 ? -bnc.z : 8;
          target = { x: Math.max(-(COURT.singlesHalfW - 0.6), Math.min(COURT.singlesHalfW - 0.6, bx)), z: -Math.max(5, Math.min(COURT.halfLen - 0.7, bz)) };
        }
      }
      if (target) assistShot(ball, target, amount, surf, pc);
    }
    // haptics: stronger and longer off the sweet spot and on the frame
    const k = S.get('haptics');
    if (k > 0 && this.xr) {
      const strength = Math.min(1, 0.3 + info.impulse / 45);
      this.input.haptic(S.get('hand') === 'left' ? 'left' : 'right', k * (info.frame ? 1 : strength * (0.75 + 0.25 * (1 - info.sweet))), info.frame ? 90 : 35 + (1 - info.sweet) * 40);
    }
    return info;
  }

  onEvent(e) {
    this.events.push(e);
    if (this.events.length > 400) this.events.splice(0, 200);
    const S = this.settings, snd = this.sound;
    switch (e.type) {
      case 'place':
        if (!this.demo) { this.player.place(e.x, e.z); this.fadeT = this.xr ? 0.45 : 0; this.racket.valid = false; }
        else { this.rig.position.set(e.x, 0, e.z); this.player.body.x = e.x; this.player.body.z = e.z; }
        this.camInit = false;
        break;
      case 'clear': if (S.get('surface') !== 'clay') this.ballView.clearMarks(); this.ballView.resetTrail(); break;
      case 'hit': {
        snd.hit(e.x, e.y, e.z, Math.min(1, (e.kmh || 60) / 160), e.sweet ?? 1, e.frame);
        if (e.who === 'p' || (this.demo && e.who === 'p')) {
          this.lastInfo = `${Math.round(e.kmh)} km/h${e.rpm ? `　${Math.round(e.rpm / 100) * 100} rpm` : ''}${e.frame ? '　フレーム' : e.sweet != null && e.sweet < 0.35 ? '　芯を外した' : ''}`;
        }
        this.ballView.resetTrail();
        break;
      }
      case 'machine': snd.hit(e.x, e.y, e.z, 0.3, 0.2, true); this.ballView.resetTrail(); break;
      case 'bounce': {
        snd.bounce(e.x, e.z, e.vy, S.get('surface'));
        const out = e.res && (e.res.type === 'fault' || (e.res.type === 'point' && e.res.reason === 'out') || e.res.type === 'out');
        if (e.res || S.get('surface') === 'clay') this.ballView.mark(e.x, e.z, S.get('surface'), out);
        break;
      }
      case 'net': snd.net(e.x, e.y, e.cord); if (e.cord) snd.ooh(); break;
      case 'call': this.hud.showCall(e.ja, '', e.ja === 'IN' ? '#7fffd4' : '#ffffff', e.quiet ? 0.9 : 1.8); if (!e.quiet) snd.say(e.en); break;
      case 'point': {
        const color = e.winner === 'p' ? '#7fffd4' : '#ff9a7a';
        const sub = (e.reasonJa ? e.reasonJa + '　' : '') + (e.winner === 'p' ? 'あなたのポイント' : 'CPU のポイント');
        this.hud.showCall(e.ja, sub, color, e.game ? 3 : 2.3);
        snd.say(e.en);
        if (e.winner === 'p' || this.sim.stats.rally > 6) { snd.applause(e.game ? 0.9 : 0.55); this.excite = e.game ? 1 : 0.6; }
        if (e.pressure && !e.match) setTimeout(() => this.hud.showCall(e.pressure.kind === 'match' ? 'マッチポイント' : 'セットポイント', e.pressure.who === 'p' ? 'あなた' : 'CPU', '#ffd23f', 1.8), 2300);
        break;
      }
      case 'match-over':
        snd.applause(1); this.excite = 1;
        this.hud.showCall(e.winner === 'p' ? '勝利！' : '敗北', `${e.snap.sets.map((s) => `${s.p}-${s.c}`).join('  ')}　メニューから もう一度`, e.winner === 'p' ? '#ffd23f' : '#ffffff', 8);
        setTimeout(() => { if (this.sim.phase === 'over') this.openMenu(); }, 5000);
        break;
      case 'serve-ready':
        if (e.who === 'p') this.hud.showCall(e.second ? 'セカンドサーブ' : 'あなたのサーブ', e.court === 'deuce' ? 'デュースサイド（右）から' : 'アドサイド（左）から', '#ffffff', 1.4);
        break;
      case 'rehold': break;
      default: break;
    }
  }

  makeTip(serving) {
    const sim = this.sim, S = this.settings, xr = this.xr;
    if (this.demo) return 'デモ：CPU どうしの試合';
    const off = S.get('hand') === 'left' ? '右' : '左';
    if (sim.holder === 'p') return xr ? `${off}手のトリガーを押して離すとトス` : 'Space でトス';
    if (serving) return xr ? 'ボールが落ちてくるところを打つ' : 'クリックでサーブ';
    const m = S.get('moveMode');
    if (sim.phase === 'play' && sim.playerPlan) {
      if (m === 'step') return this.player.effort > 0 ? '足踏みで移動中' : '足踏み・腕振りで落下地点へ';
      if (m === 'dpad') return xr ? 'スティックで移動' : '矢印キー / WASD で移動';
      return '自動で移動中';
    }
    return xr ? 'B / Y でメニュー' : 'クリック：ドライブ　右クリック：スライス　M：メニュー';
  }

  updateBoards() {
    const sim = this.sim;
    const snap = sim.score ? sim.score.snapshot() : null;
    this.hud.scoreboard(sim.mode, snap, sim.stats, this.lastInfo ? `ショット ${this.lastInfo}` : '');
    const S = this.settings;
    const st = this.player.steps;
    const lines = [
      `${MODE_JA[sim.mode] || ''}　${MOVE_JA[S.get('moveMode')]}`,
      `速さ ${this.player.speed.toFixed(1)} / ${S.get('maxSpeed').toFixed(1)} m/s`,
      S.get('moveMode') === 'step' ? `足踏み ${Math.round(st.cadence)} 歩/分　腕 ${Math.round(st.armCadence)}` : (this.lastInfo || '—'),
      S.get('moveMode') === 'step' ? (this.lastInfo || '—') : '',
      this.tip,
    ].filter((l, i) => l !== '' || i === 4);
    this.hud.wristInfo(lines);
    if (this.onHud) this.onHud(lines, snap);
  }
}
