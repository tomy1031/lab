// js/game.js — the game in the browser: your paddle on the controller (swept against the ball 1000 times a second),
// the toss from your free hand, the CPU player, the hall, and the feedback of every contact — the vibration in
// your hand, the sound from where the ball is, the flash and the paddle's buzz, the read-out of speed and spin.
import * as THREE from 'three';
import { World } from './world.js';
import { BallView } from './ballview.js';
import { Sound } from './audio.js';
import { Hud, spinLabel } from './hud.js';
import { VrMenu } from './vrmenu.js';
import { Avatar } from './avatar.js';
import { buildPaddle } from './paddlemesh.js';
import { PaddleBody } from './paddle.js';
import { Sim } from './sim.js';
import { Planner } from './ai.js';
import { hitPattern } from './input.js';
import { TABLE, G, RPS } from './physics.js';
import { strokeName } from './shot.js';
import { LEVELS } from './planner.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const D2R = Math.PI / 180;
const NAMES = { p: 'あなた', c: '相手' };

export class Game {
  constructor({ renderer, scene, camera, rig, settings, input, demo = false, seed, lite = false }) {
    Object.assign(this, { renderer, scene, camera, rig, settings, input, demo, seed, lite });
    this.errors = [];
    this.log = [];
    const S = settings;
    this.world = new World(scene, renderer, { shadows: S.get('shadows') && !lite, lite });
    renderer.shadowMap.enabled = S.get('shadows') && !lite;
    this.ballView = new BallView(scene, { color: S.get('ballColor'), trail: S.get('trail'), marks: S.get('marks') });
    this.sound = new Sound(S);
    this.hud = new Hud(scene);
    this.planner = new Planner(true);
    this.body = new PaddleBody({ fh: S.get('fhRubber'), bh: S.get('bhRubber'), blade: S.get('blade') });
    this.buildMyPaddle();
    this.cpu = new Avatar(scene, { side: -1, shirt: 0xc8323c, lite });
    this.me = new Avatar(scene, { side: 1, shirt: 0x1f4e8c, skin: 0xe8c3a0, hair: 0x3b2a1e, fhColor: S.get('fhColor'), bhColor: S.get('bhColor'), lite });
    this.offHand = this.buildHand();
    scene.add(this.offHand);
    this.machine = this.buildMachine();
    scene.add(this.machine);
    this.aim = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.05, 32), new THREE.MeshBasicMaterial({ color: 0x7fffd4, transparent: true, opacity: 0.85, depthWrite: false }));
    this.aim.rotation.x = -Math.PI / 2; this.aim.visible = false;
    scene.add(this.aim);
    this.vrmenu = new VrMenu(scene, S, {
      resume: () => this.showVrMenu(false),
      restart: () => { this.showVrMenu(false); this.start(); },
      exit: () => { const s = renderer.xr.getSession(); if (s) s.end(); },
      recenter: () => { this.showVrMenu(false); this.recenter(); },
    });
    this.sim = null;
    this.paused = false;
    this.holding = false;
    this.pcShot = null;
    this.stickHeld = 0;
    this.adjusting = 0;
    this.time = 0;
    this.needRecenter = 0;
    this.lastHitText = '';
    S.onChange((k, v) => this.onSetting(k, v));
  }

  get xr() { return this.renderer.xr.isPresenting; }
  get paddleSide() { return this.settings.get('hand') === 'left' ? 'left' : 'right'; }
  get offSide() { return this.paddleSide === 'left' ? 'right' : 'left'; }

  buildMyPaddle() {
    const S = this.settings;
    if (this.myPaddle) this.scene.remove(this.myPaddle);
    this.myPaddle = buildPaddle({ fhColor: S.get('fhColor'), bhColor: S.get('bhColor'), fh: S.get('fhRubber'), bh: S.get('bhRubber'), lite: this.lite });
    this.myPaddle.visible = false;
    this.scene.add(this.myPaddle);
  }
  /** the free hand: a glove-like palm with a thumb */
  buildHand() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xe2b896, roughness: 0.7 });
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.022, 0.095), mat);
    palm.position.set(0, 0.01, 0);
    g.add(palm);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.05, 3, 6), mat);
      f.rotation.x = Math.PI / 2 - 0.25; f.position.set(-0.03 + i * 0.02, 0.016, -0.07);
      g.add(f);
    }
    const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.04, 3, 6), mat);
    th.rotation.z = 1.0; th.position.set(0.05, 0.016, -0.01);
    g.add(th);
    g.visible = false;
    return g;
  }
  buildMachine() {
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.4, metalness: 0.4 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.5 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.16), body); base.position.y = 0.025; g.add(base);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.14, 12), body); neck.position.y = 0.12; g.add(neck);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 18), accent); head.rotation.x = Math.PI / 2; head.position.set(0, 0.22, 0.01); g.add(head);
    const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.04, 12), body); mouth.rotation.x = Math.PI / 2; mouth.position.set(0, 0.22, 0.07); g.add(mouth);
    const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.06, 0.18, 18, 1, true), new THREE.MeshStandardMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    hopper.position.set(0, 0.36, -0.06); g.add(hopper);
    g.position.set(0, TABLE.h, -TABLE.halfL + 0.02);
    g.visible = false;
    return g;
  }

  onSetting(k, v) {
    if (['gripTilt', 'gripYaw', 'gripRoll', 'hand'].includes(k)) this._calib = null;
    if (['fhColor', 'bhColor', 'fhRubber', 'bhRubber'].includes(k)) {
      this.buildMyPaddle();
      this.body.fh = this.settings.get('fhRubber'); this.body.bh = this.settings.get('bhRubber');
    }
    if (k === 'blade') this.body.blade = v;
    if (k === 'ballColor') this.ballView.setColor(v);
    if (k === 'trail') this.ballView.trailOn = v;
    if (k === 'marks') this.ballView.marksOn = v;
    if (k === 'assist' && this.sim) this.sim.o.assist = v;
    if (k === 'serveRule' && this.sim) this.sim.o.serveRule = v;
    if (k === 'floorAdjust') this.rig.position.y = -v;
    if (k === 'shadows') {
      this.renderer.shadowMap.enabled = v && !this.lite;
      this.world.key.castShadow = v && !this.lite;
      this.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
    }
    if (this.sim && ['machSpin', 'machSpeed', 'machPlace', 'machInterval'].includes(k)) this.sim.o.machine = this.machineOpts();
  }
  machineOpts() {
    const S = this.settings;
    return { spin: S.get('machSpin'), speed: S.get('machSpeed'), place: S.get('machPlace'), interval: S.get('machInterval') };
  }

  /** a new session with the current settings */
  start() {
    const S = this.settings;
    const mode = this.demo ? 'demo' : S.get('mode');
    const pcAuto = this.demo || !this.xr;
    this.sim = new Sim({
      mode, level: S.get('level'), bestOf: S.get('bestOf'), seed: this.seed, hand: S.get('hand'), firstServer: S.get('firstServe'),
      planner: this.planner, autoP: pcAuto, autoLevel: this.demo ? S.get('level') : 5, machine: this.machineOpts(),
      serveRule: S.get('serveRule'), assist: S.get('assist'), fh: S.get('fhRubber'), bh: S.get('bhRubber'), blade: S.get('blade'),
    });
    if (!pcAuto) { this.sim.humanPaddle = this.body; this.body.valid = false; }
    this.sim.start();
    this.started = true;
    this.paused = false;
    this.holding = false;
    this.cpu.setVisible(mode !== 'machine');
    this.machine.visible = mode === 'machine';
    this.drawScore();
    const title = { match: `試合 — 相手 レベル ${S.get('level')}（${LEVELS[S.get('level')].name}）`, rally: 'ラリー練習', machine: '球出しマシン', serve: 'サーブ練習', demo: 'デモ（CPU どうし）' }[mode];
    this.hud.message(title, this.xr ? 'トス：左手のトリガーを押して離す・A/X で自動トス・B/Y メニュー' : '', 4, '#7fffd4');
    if (mode === 'match' || mode === 'demo') setTimeout(() => this.sound.say('Love all'), 600);
  }

  calibQuat() {
    if (this._calib) return this._calib;
    const S = this.settings, left = S.get('hand') === 'left';
    // in the controller's pointing frame: the paddle's tip forward (−Z), the forehand face to the palm side
    const X = left ? V(0, -1, 0) : V(0, 1, 0), Y = V(0, 0, -1), Z = left ? V(1, 0, 0) : V(-1, 0, 0);
    const base = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    const tilt = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), S.get('gripTilt') * D2R);
    const yaw = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), (left ? -1 : 1) * S.get('gripYaw') * D2R);
    const roll = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), (left ? -1 : 1) * S.get('gripRoll') * D2R);
    this._calib = tilt.multiply(yaw).multiply(base).multiply(roll);
    return this._calib;
  }

  /** stand behind your end of the table, facing the net */
  recenter() {
    const cam = this.camera;
    const f = V(0, 0, -1).applyQuaternion(cam.quaternion); f.y = 0;
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    const theta = Math.atan2(-f.x, -f.z);
    this.rig.rotation.set(0, -theta, 0);
    const head = V(cam.position.x, 0, cam.position.z).applyAxisAngle(UP, -theta);
    const tx = this.settings.get('hand') === 'left' ? 0.12 : -0.12;
    this.rig.position.set(tx - head.x, -this.settings.get('floorAdjust'), TABLE.halfL + 0.5 - head.z);
    this.rig.updateMatrixWorld(true);
    this.body.valid = false;
  }

  showVrMenu(on) {
    this.vrmenu.show(on, this.camera);
    if (this.onVrMenu) this.onVrMenu(on);
  }

  frame(dt) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const input = this.input, xr = this.xr;
    input.update(dt);
    if (xr && (input.hands.left.pressed.b || input.hands.right.pressed.b)) this.showVrMenu(!this.vrmenu.open);
    if (this.vrmenu.update(input)) { this.visuals(0); input.endFrame(); return; }
    if (!this.sim) { input.endFrame(); return; }
    if (!xr && !this.demo && (input.keyHit('KeyM') || input.keyHit('Escape')) && this.onPcMenu) this.onPcMenu(true);
    if (xr && !this.demo) this.vrControls(dt); else this.pcControls(dt);
    if (!this.paused) this.sim.update(dt);
    this.events();
    this.visuals(this.paused ? 0 : dt);
    input.endFrame();
  }

  vrControls(dt) {
    const S = this.settings, input = this.input;
    const ph = input.hands[this.paddleSide], oh = input.hands[this.offSide];
    // recenter: hold a stick pressed for a second
    if (ph.stickPress || oh.stickPress) { this.stickHeld += dt; if (this.stickHeld > 1 && this.stickHeld - dt <= 1) { this.recenter(); this.hud.message('位置をリセットしました', '', 1.5); } }
    else this.stickHeld = 0;
    // move along the table with the free hand's stick
    if (S.get('moveStick') && oh.tracked && Math.hypot(oh.stick.x, oh.stick.y) > 0.2) {
      const sp = 1.7 * dt;
      this.rig.position.x += oh.stick.x * sp;
      this.rig.position.z += oh.stick.y * sp;
      const head = this.camera.getWorldPosition(V());
      if (head.z < TABLE.halfL + 0.12 && Math.abs(head.x) < TABLE.halfW + 0.25) this.rig.position.z += TABLE.halfL + 0.12 - head.z;
      if (head.z > 5) this.rig.position.z -= head.z - 5;
      if (Math.abs(head.x) > 3) this.rig.position.x -= Math.sign(head.x) * (Math.abs(head.x) - 3);
      this.rig.updateMatrixWorld(true);
    }
    // the paddle angle, live, with the paddle hand's stick
    if (ph.tracked && (Math.abs(ph.stick.y) > 0.5 || Math.abs(ph.stick.x) > 0.5)) {
      this.adjusting += dt;
      if (this.adjusting > 0.12) {
        this.adjusting = 0;
        if (Math.abs(ph.stick.y) > 0.5) S.set('gripTilt', S.get('gripTilt') - Math.sign(ph.stick.y));
        else S.set('gripRoll', S.get('gripRoll') + Math.sign(ph.stick.x));
        this.adjustShow = 2;
      }
    } else this.adjusting = 0.12;
    // the paddle follows the controller
    if (ph.tracked) {
      const q = ph.ray.quaternion.clone().multiply(this.calibQuat());
      const p = ph.grip.position.clone().add(V(0, S.get('gripOffset'), 0).applyQuaternion(q));
      this.body.setPose(p, q, dt);
      this.body.enabled = true;
      this.myPaddle.position.copy(p); this.myPaddle.quaternion.copy(q);
      this.myPaddle.visible = true;
    } else { this.body.enabled = false; this.myPaddle.visible = false; }
    this.toss(oh, dt);
  }

  /** your serve: the ball rests on the free hand; press and release the trigger (or A / X) to toss */
  toss(oh) {
    const sim = this.sim, S = this.settings, input = this.input;
    const mine = sim.holder === 'p' && !sim.bots.p && (sim.phase === 'serveWait' || sim.phase === 'wait');
    this.offHand.visible = oh.tracked;
    if (oh.tracked) {
      this.offHand.position.copy(oh.grip.position);
      const f = V(0, 0, -1).applyQuaternion(oh.grip.quaternion); f.y = 0;
      if (f.lengthSq() > 1e-6) this.offHand.quaternion.setFromUnitVectors(V(0, 0, -1), f.normalize());
    }
    if (!mine || !oh.tracked) { this.holding = false; return; }
    const palm = oh.grip.position.clone().add(V(0, 0.062, 0));
    sim.setHeld(palm);
    if (sim.phase !== 'serveWait') return;
    if (oh.pressed.trigger || oh.pressed.squeeze) { this.holding = true; input.pulse(this.offSide, 0.12, 12); }
    const release = this.holding && (oh.released.trigger || oh.released.squeeze);
    const auto = oh.pressed.a;
    if (!release && !auto) return;
    let v;
    if (S.get('tossAssist') || auto) v = { x: 0, y: Math.sqrt(2 * G * S.get('tossHeight')) * 1.05, z: 0 };
    else {
      const hv = oh.vel.clone();
      if (hv.length() > 6) hv.setLength(6);
      v = { x: hv.x, y: hv.y, z: hv.z };
    }
    if (sim.tossBall(palm, v)) input.pulse(this.offSide, 0.2, 15);
    this.holding = false;
  }

  pcControls() {
    const sim = this.sim, input = this.input, bp = sim.bots.p;
    if (!bp || this.demo) { this.aim.visible = false; return; }
    if (input.mouse.clicked[0] || input.keyHit('KeyJ')) this.pcShot = 'drive';
    if (input.mouse.clicked[2] || input.keyHit('KeyK')) this.pcShot = 'push';
    if (input.keyHit('KeyL')) this.pcShot = 'loop';
    if (input.keyHit('Space')) this.pcShot = 'smash';
    if (input.keyHit('KeyB')) this.pcShot = 'block';
    if (input.keyHit('KeyA')) this.pcShot = null;
    const tx = Math.max(-0.66, Math.min(0.66, input.mouse.x * 0.72));
    const tz = -(0.35 + Math.max(0, Math.min(1, (input.mouse.y + 1) / 2)) * 0.95);
    bp.forced = { shot: this.pcShot, target: { x: tx, z: tz } };
    this.aim.position.set(tx, TABLE.h + 0.002, tz);
    this.aim.visible = true;
  }

  events() {
    const S = this.settings, sim = this.sim, xr = this.xr;
    for (const e of sim.takeEvents()) {
      try { this.event(e, S, sim, xr); } catch (err) { this.errors.push(String(err && err.stack || err)); }
    }
  }

  event(e, S, sim, xr) {
    this.log.push({ type: e.type, who: e.who, winner: e.winner, reason: e.reason, let: e.let, speed: e.speed, total: e.total, serve: e.serve, face: e.info && e.info.face, t: e.t });
    if (this.log.length > 600) this.log.splice(0, 100);
    {
      switch (e.type) {
        case 'hit': {
          const info = e.info;
          const k = Math.min(1, info.un / 14);
          this.sound.paddle(e.x, e.y, e.z, k, info.sweet, info.face, info.rubber || 'inverted');
          const n = info.normal ? V(info.normal.x, info.normal.y, info.normal.z) : V(0, 0, e.who === 'p' ? -1 : 1);
          this.ballView.flash(V(e.x, e.y, e.z).addScaledVector(n, -0.02), n, k, info.sweet > 0.6);
          this.ballView.resetTrail();
          if (e.who === 'p' && xr && !this.demo) {
            this.input.pattern(this.paddleSide, hitPattern(info), S.get('haptics'));
            this.myPaddle.userData.vibrate((info.face === 'edge' ? 0.9 : 0.15 + 0.85 * (1 - info.sweet)) * Math.min(1, 0.3 + info.un / 12));
          } else if (e.who === 'p' && this.me.paddle.userData.vibrate) this.me.paddle.userData.vibrate(0.25 * k);
          else if (this.cpu.paddle.userData.vibrate) this.cpu.paddle.userData.vibrate(0.25 * k);
          const stroke = e.serve ? 'サーブ' : strokeName(e.speed, e.top, e.y);
          const d = { speed: e.speed, top: e.top, side: e.side, total: e.total, stroke, sweet: info.sweet, face: info.face, who: e.who, assisted: info.assisted };
          if (S.get('hitInfo') && (e.who === 'p' || this.demo || !xr)) this.hud.hit(d);
          if (e.who === 'p') this.lastHitText = `${Math.round(e.speed * 3.6)} km/h · ${Math.round(e.total).toLocaleString()} rpm ${spinLabel(e.top, e.side)} · ${stroke}${info.face === 'edge' ? ' · エッジ' : ''}`;
          else this.lastCpuText = `${Math.round(e.speed * 3.6)} km/h · ${Math.round(e.total).toLocaleString()} rpm ${spinLabel(e.top, e.side)} · ${stroke}`;
          if (e.warn) this.hud.message('サーブの反則', e.warn, 3, '#ffd23f');
          break;
        }
        case 'table':
          this.sound.table(e.x, TABLE.h, e.z, e.vn);
          this.ballView.mark(e.x, e.z, e.side > 0 ? 0x7fffd4 : 0xffd23f);
          break;
        case 'net': this.sound.net(e.x, e.y, e.z, Math.hypot(sim.ball.v.x, sim.ball.v.y, sim.ball.v.z), e.cord); break;
        case 'floor': this.sound.floor(e.x, 0, e.z, e.vn); break;
        case 'barrier': case 'wall': case 'side': this.sound.thud(e.x, e.y ?? 0.5, e.z, e.vn || 2); break;
        case 'toss': this.sound.ui(); break;
        case 'machine': this.sound.thud(0, TABLE.h + 0.2, -TABLE.halfL, 1.5); break;
        case 'point': this.onPoint(e); break;
        case 'score': this.onScore(e); break;
        case 'match': {
          const won = e.winner === 'p';
          this.hud.message(won ? 'あなたの勝ち！' : '相手の勝ち', `ゲーム ${sim.score.history.map((g) => `${g.p}-${g.c}`).join(' / ')}　メニューの「最初から」でもう一度`, 12, won ? '#ffd23f' : '#ffb4a8');
          this.sound.say(`Game and match, ${won ? 'player' : 'computer'}`);
          this.sound.applause(30);
          break;
        }
        case 'ready':
          if (e.server === 'p' && xr && !this.demo) this.hintServe = true;
          break;
        default: break;
      }
    }
  }

  onPoint(e) {
    const sim = this.sim, mode = e.mode;
    if (e.let) { this.hud.message('レット', e.reason, 1.6, '#ffd23f'); this.sound.say('Let'); return; }
    if (mode === 'rally') {
      this.hud.message(`ラリー ${e.hits} 回`, `最長 ${sim.stats.best} 回　${e.reason}`, 1.6, '#7fffd4');
      if (e.hits >= 8) this.sound.applause(8 + e.hits);
      return;
    }
    if (mode === 'machine') {
      const st = sim.stats;
      this.hud.message(e.winner === 'p' ? 'イン' : 'ミス', `入った ${st.in} / ${st.in + st.faults}　連続 ${st.streak}（最高 ${st.bestStreak}）`, 1.2, e.winner === 'p' ? '#7fffd4' : '#ffb4a8');
      return;
    }
    if (mode === 'serve') {
      const st = sim.stats;
      const h = sim.lastHuman;
      this.hud.message(e.winner === 'p' ? 'サーブ成功' : 'フォルト', `${e.winner === 'p' ? '' : e.reason + '　'}入った ${st.servesIn} / ${st.servesIn + st.faults}${h ? `　${Math.round(h.speed * 3.6)} km/h ${Math.round(h.total)} rpm` : ''}`, 2, e.winner === 'p' ? '#7fffd4' : '#ffb4a8');
      return;
    }
    const mine = e.winner === 'p';
    this.hud.message(mine ? `${NAMES.p}の得点` : `${NAMES.c}の得点`, e.reason, 1.8, mine ? '#7fffd4' : '#ffb4a8');
    if (e.hits >= 6 || (mine && this.settings.get('crowd') && Math.random() < 0.5)) this.sound.applause(mine ? 14 : 6);
  }

  onScore(e) {
    this.drawScore();
    const sc = this.sim.score;
    if (e.game) {
      const won = e.game === 'p';
      if (!e.match) {
        this.hud.message(`ゲーム ${won ? NAMES.p : NAMES.c}`, `ゲームカウント ${sc.games.p}-${sc.games.c}`, 3, '#ffd23f');
        this.sound.say(`Game, ${won ? 'player' : 'computer'}. ${sc.games.p > sc.games.c ? `${sc.games.p} games to ${sc.games.c}` : sc.games.p === sc.games.c ? `${sc.games.p} games all` : `${sc.games.c} games to ${sc.games.p}`}`);
      }
      return;
    }
    const pf = sc.pointFor;
    this.sound.say(e.call.replace('–', ', ').replace(/\b0\b/g, 'love') + (pf ? (pf.match ? ', match point' : ', game point') : ''));
  }

  drawScore() {
    const sim = this.sim, sc = sim.score, mode = sim.mode;
    const match = mode === 'match' || mode === 'demo';
    const lv = this.settings.get('level');
    this.world.scoreboard.draw({
      title: match ? `SPIN TABLE OPEN · GAME ${sc.gameNo}` : { rally: 'RALLY PRACTICE', machine: 'BALL MACHINE', serve: 'SERVE PRACTICE' }[mode],
      p: this.demo ? 'CPU A' : 'YOU', c: this.demo ? 'CPU B' : `CPU Lv${lv}`,
      points: match ? sc.points : { p: mode === 'machine' ? sim.stats.in : mode === 'serve' ? sim.stats.servesIn : sim.stats.rally, c: mode === 'machine' ? sim.stats.faults : mode === 'serve' ? sim.stats.faults : sim.stats.best },
      games: match ? sc.games : { p: 0, c: 0 }, server: match ? sc.server : null,
      note: match ? sc.history.map((g) => `${g.p}-${g.c}`).join('   ') : '',
    });
    this.world.flip.set(match ? sc.points : { p: 0, c: 0 }, match ? sc.games : { p: 0, c: 0 });
  }

  visuals(dt) {
    const sim = this.sim, xr = this.xr;
    if (!sim) return;
    const b = sim.ball;
    const showBall = sim.live || sim.holder === 'p' || sim.holder === 'c' || (sim.holder === 'machine' && sim.live);
    this.ballView.update(b, dt, showBall && b.p.y > -1);
    const cHold = sim.holder === 'c' && !sim.live ? b.p : null;
    this.cpu.update(sim.bots.c, sim.time, dt, b.p, cHold);
    const pcOrDemo = !!sim.bots.p;
    this.me.setVisible(pcOrDemo);
    if (pcOrDemo) this.me.update(sim.bots.p, sim.time, dt, b.p, sim.holder === 'p' && !sim.live ? b.p : null);
    if (this.myPaddle.userData.tick) this.myPaddle.userData.tick(dt);
    if (!xr || this.demo) this.myPaddle.visible = false;
    this.hud.tick(dt);
    // the wrist panel (VR)
    if (xr && !this.demo) {
      const oh = this.input.hands[this.offSide];
      const S = this.settings, sc = sim.score;
      const lines = [];
      if (sim.mode === 'match') lines.push(`${sc.points.p} - ${sc.points.c}　ゲーム ${sc.games.p}-${sc.games.c}　${sc.server === 'p' ? 'サーブ：あなた' : 'サーブ：相手'}`);
      else lines.push({ rally: `ラリー ${sim.stats.rally}（最長 ${sim.stats.best}）`, machine: `入った ${sim.stats.in} / ${sim.stats.in + sim.stats.faults}`, serve: `サーブ ${sim.stats.servesIn} / ${sim.stats.servesIn + sim.stats.faults}` }[sim.mode]);
      if (this.adjustShow > 0) { this.adjustShow -= dt; lines.push(`ラケット角度 上下 ${S.get('gripTilt')}°・ひねり ${S.get('gripRoll')}°`); }
      else lines.push(this.lastHitText || '打球の速さ・回転がここに出ます');
      if (sim.holder === 'p' && sim.phase === 'serveWait') lines.push('トリガーを押して離す → トス（A/X：自動）');
      else lines.push('B/Y：メニュー　スティック押し込み1秒：位置リセット');
      this.hud.setWrist(lines, oh.tracked ? oh.grip : null, this.camera.getWorldPosition(V()));
    } else this.hud.setWrist([], null);
    this.sound.setListener(this.camera);
    if (this.onHud && !xr) this.onHud(this.pcLines());
  }

  pcLines() {
    const sim = this.sim, sc = sim.score;
    const head = sim.mode === 'match' || sim.mode === 'demo'
      ? `${this.demo ? 'CPU A' : 'あなた'} ${sc.points.p} - ${sc.points.c} 相手　（ゲーム ${sc.games.p}-${sc.games.c}・サーブ：${sc.server === 'p' ? (this.demo ? 'A' : 'あなた') : (this.demo ? 'B' : '相手')}）`
      : { rally: `ラリー練習：${sim.stats.rally} 回（最長 ${sim.stats.best}）`, machine: `球出し：入った ${sim.stats.in} / ${sim.stats.in + sim.stats.faults}`, serve: `サーブ練習：${sim.stats.servesIn} / ${sim.stats.servesIn + sim.stats.faults}` }[sim.mode];
    const lines = [head];
    if (this.lastHitText) lines.push(`${this.demo ? 'A' : 'あなた'}：${this.lastHitText}`);
    if (this.lastCpuText) lines.push(`${this.demo ? 'B' : '相手'}：${this.lastCpuText}`);
    if (!this.demo) {
      const shot = { drive: 'ドライブ', push: 'ツッツキ', loop: 'ループ', smash: 'スマッシュ', block: 'ブロック' }[this.pcShot] || 'おまかせ';
      lines.push(`次の打ち方：${shot}　（クリック ドライブ・右クリック ツッツキ・L ループ・Space スマッシュ・B ブロック・A おまかせ。マウスの位置が狙う所）`);
    } else lines.push('デモ：CPU どうしの試合（クリックで音が出ます）');
    return lines;
  }

  /** the PC / demo camera: behind and above your side */
  pcCamera(dt) {
    const sim = this.sim;
    if (!sim || this.xr) return;
    const body = sim.bots.p ? sim.bots.p.body : { x: 0, z: TABLE.halfL + 0.6 };
    const k = Math.min(1, dt * 3);
    if (this.tvCamera) {
      // a broadcast view from the stands' corner
      this.camera.position.lerp(V(2.9, 2.6, 3.3), k);
      this.camTarget = (this.camTarget || V(0, 0.8, 0)).lerp(V(0, 0.82, -0.15), k);
    } else {
      // over your left shoulder: the table and your paddle side stay in view
      this.camera.position.lerp(V(body.x - 0.55, 2.3, body.z + 1.75), k);
      this.camTarget = (this.camTarget || V(0, 0.8, -0.6)).lerp(V(body.x * 0.2, 0.8, -0.7), k);
    }
    this.camera.lookAt(this.camTarget);
  }
}

export { RPS };
