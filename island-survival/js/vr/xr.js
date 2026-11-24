// vr/xr.js — playing the island in a VR headset (WebXR immersive-vr, e.g. Meta Quest). Works offline like the rest
// of the PWA: nothing here loads from the network (no controller models, no fonts beyond the cached ones).
//
// Moving: the reference space is offset every frame so the headset's floor origin follows the player's feet; the
// camera then reports world positions directly (no rig), and real steps in the room move the body too.
//   left stick   walk (towards where you look) · press: run
//   right stick  ←→ turn 30° (placing: rotate the building) · ↑↓ choose the option of what you point at · press: jump
//   trigger      do it: the chosen option of what you point at, or use the held tool (shoot / cast / swing …)
//   A            the chosen option (like E) · hold: keep working (gathering)
//   grip         aim / draw the bow / charge a throw (like the right mouse button); with a swing it is a fist
//   B / Y        the VR menu (items · make · build · companion · rest · settings) · X  call the companion
// Real motion counts: swing the right controller down to chop / strike, forward to thrust / throw, rub it side to
// side on the fire drill — the same gesture events the camera hands give (js/gesture/motion.js).
// In the headset: a watch on the left wrist (vitals), the option prompt by the view, toasts and subtitles, the menu
// panel, and the hand-work table (§24–§26) as a panel you work on with the laser (trigger = press / hold / drag).
import * as THREE from 'three';
import { VRWrist, VRPrompt, VRToasts, VRMenu, VRLaser, makePanelMaterial } from './vrui.js';
import { defOf, nameOf } from '../ui/common.js';
import { loadSettings, saveSettings } from '../core/save.js';
import { StepDetector, ArmSwingDetector, swingAxis } from './locomotion.js';
import { VRGuide } from './guide.js';

const SNAP = Math.PI / 6;
const METHODS = [['tie', '結ぶ'], ['carve', '削る'], ['weave', '編む'], ['mix', '混ぜる'], ['knap', '割る'], ['heat', '火に かける'], ['pack', '詰める']];
const RANGED = new Set(['gun', 'bow', 'rod', 'net', 'spear', 'harpoon']);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const btn = (gp, i) => !!gp?.buttons?.[i]?.pressed;
const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** the page's key / mouse words → the controller's */
const vrText = (s = '') => String(s).replace(/右クリック/g, 'グリップ').replace(/左クリック|クリック/g, 'トリガー').replace(/ホイール/g, '右スティック').replace(/Space|スペース/g, 'A').replace(/\bE\b|Ｅ/g, 'A').replace(/マウス/g, 'コントローラー');

export class IslandXR {
  constructor(game) {
    this.game = game;
    this.r = game.renderer.r;
    this.session = null;
    this.supported = false;
    this.ready = (async () => {
      try { this.supported = !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-vr')); } catch { this.supported = false; }
      return this.supported;
    })();
    this.W = new THREE.Vector3();      // where the headset's floor origin sits in the world
    this.yaw = 0;                      // the world turned around it (snap turns)
    this.lift = 0;                     // seated play: the eyes raised to standing height
    this.stance = 'auto';              // auto | stand | seat
    this.move = 'stick';               // stick | step (足踏み) | arms (腕振り) | both — the stick always works too (§27.5)
    this.steps = new StepDetector();
    this.arms = new ArmSwingDetector();
    this.body = { walking: false, by: '', speed: 0 };
    this.standH = 0;
    this.axes = { x: 0, y: 0, run: false, jump: false, crouch: false };
    this.prev = {};
    this.gestures = [];                // motion events of this frame (read by player/interact.js)
    this.menuOpen = false; this.page = 'items'; this.scroll = 0;
    this.bench = []; this.method = null; this.item = null; this.eatUid = null;
    this.aim = { origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1) };
    this.rel = new THREE.Vector3(); this.relPrev = null; this.gCool = 0;
  }

  get presenting() { return !!this.session; }

  // ---------------------------------------------------------------- session
  async enter() {
    if (this.session) return this.session;
    if (!navigator.xr) throw new Error('この ブラウザは VR（WebXR）に 対応して いません');
    const g = this.game, r = this.r;
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    try { r.xr.setFramebufferScaleFactor(0.9); } catch { /* only before a session */ }
    let s;
    try { s = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] }); } catch (e) { r.xr.enabled = false; throw e; }
    this.session = s;
    s.addEventListener('end', () => this.onEnd());
    s.addEventListener('visibilitychange', () => { if (s.visibilityState !== 'visible' && g.running && !g.ended && !this.menuOpen) this.openMenu('settings'); });
    await r.xr.setSession(s);
    try { r.xr.setFoveation(1); } catch { /* not supported */ }
    this.baseSpace = r.xr.getReferenceSpace();
    this.build();
    if (g.screens?.current && g.screens.current !== 'result') g.screens.hide();
    const P = g.player;
    this.W.set(P.pos.x, P.pos.y, P.pos.z);
    this.yaw = P.yaw; this.lift = 0; this.standH = 0; this.t0 = performance.now(); this.lastPos = null; this.poseFrames = 0;
    this.stance = loadSettings().vrStance || 'auto';
    this.move = loadSettings().vrMove || 'stick';
    this.steps.reset(); this.arms.reset(); this.room = null;
    this.applyOffset();
    g.vrActive = true;
    document.body.classList.add('in-vr');
    // the headset drives the frames from now on (the page's own loop stops itself, see Game.loopRaf)
    r.setAnimationLoop((t) => g.frame(t));
    this.guide.on = loadSettings().vrGuide !== false;
    this.toasts.push(this.guide.on ? 'VR で 島へ。手元の ガイドに ボタンの 使い方。消すのは B → ガイド' : 'VR で 島へ。左スティック：歩く　トリガー：する　B：メニュー', 'info');
    return s;
  }

  exit() { if (this.session) this.session.end().catch(() => {}); }

  onEnd() {
    const g = this.game;
    this.session = null;
    g.vrActive = false;
    this.r.setAnimationLoop(null);
    this.r.xr.enabled = false;
    document.body.classList.remove('in-vr');
    if (this.group) this.group.visible = false;
    if (this.menuOpen) this.closeMenu();
    g.player.aim = null;
    g.player.vr = false;
    this.gestures = [];
    if (g.handwork?.active) g.handwork.vrPointer?.(null);
    g.renderer.resize?.();
    g.loopRaf?.();
    if (g.screens?.current === 'result') return;
    if (g.running && !g.ended && !g.screens?.current) g.screens?.show?.('pause');
  }

  // ---------------------------------------------------------------- objects in the scene
  build() {
    const scene = this.game.world.scene;
    if (this.group) { this.group.visible = true; if (this.group.parent !== scene) scene.add(this.group); return; }
    this.group = new THREE.Group(); this.group.name = 'vr';
    scene.add(this.group);
    const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    this.ctrl = [0, 1].map((i) => {
      const ray = this.r.xr.getController(i), grip = this.r.xr.getControllerGrip(i);
      const c = { i, ray, grip, hand: i ? 'right' : 'left', source: null, laser: new VRLaser() };
      ray.add(c.laser.mesh);
      // a simple controller body (no network needed for models)
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.08, 4, 8), mat('#2a2923'));
      body.rotation.x = Math.PI / 2 - 0.5; body.position.set(0, -0.01, 0.04);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 6, 18), mat('#1f7f86'));
      ring.position.set(0, 0.02, -0.01); ring.rotation.x = 0.4;
      grip.add(body, ring);
      ray.addEventListener('connected', (e) => { c.hand = e.data?.handedness || c.hand; c.source = e.data; this.placeWrist(); });
      ray.addEventListener('disconnected', () => { c.source = null; });
      this.group.add(ray, grip);
      return c;
    });
    this.wrist = new VRWrist();
    this.prompt = new VRPrompt();
    this.toasts = new VRToasts();
    this.menu = new VRMenu();
    this.guide = new VRGuide();
    this.group.add(...this.guide.meshes);
    this.menu.mesh.visible = false;
    this.group.add(this.prompt.mesh, this.toasts.mesh, this.menu.mesh);
    this.placeWrist();
    // the hand-work table: the overlay's own canvas on a plane, a header (title / step / hint) with two buttons
    this.hwPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.625), new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
    this.hwPlane.renderOrder = 990; this.hwPlane.visible = false; this.hwPlane.frustumCulled = false;
    this.hwHead = document.createElement('canvas'); this.hwHead.width = 1000; this.hwHead.height = 150;
    this.hwHeadMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.15), makePanelMaterial(this.hwHead));
    this.hwHeadMesh.renderOrder = 991; this.hwHeadMesh.frustumCulled = false; this.hwHeadMesh.position.set(0, 0.4, 0);
    this.hwPlane.add(this.hwHeadMesh);
    this.group.add(this.hwPlane);
    const bus = this.game.bus;
    bus.on('toast', (t) => { if (this.presenting && t?.text) this.toasts.push(vrText(t.text), t.kind); });
    bus.on('subtitle', (s) => { if (this.presenting && s?.final !== false && s?.text && s.who !== 'あなた') this.toasts.subtitle(s.who, s.text); });
    bus.on('choice:show', (c) => { if (this.presenting) { this.choice = c; this.openMenu('companion'); } });
    bus.on('choice:hide', () => { this.choice = null; if (this.menuOpen && this.page === 'companion') this.refreshMenu(); });
    bus.on('rescue:offer', (o) => { if (this.presenting) { this.offer = o; this.openMenu('rescue'); } });
  }

  placeWrist() {
    const left = this.hand('left');
    if (!left || !this.wrist || this.wrist.mesh.parent === left.grip) return;
    left.grip.add(this.wrist.mesh);
    this.wrist.mesh.position.set(0, 0.05, 0.08);
    this.wrist.mesh.rotation.set(-1.1, 0, 0);
  }

  hand(side) { return this.ctrl?.find((c) => c.hand === side && c.source) || this.ctrl?.find((c) => c.hand === side) || (side === 'right' ? this.ctrl?.[1] : this.ctrl?.[0]); }
  gp(side) { return this.hand(side)?.source?.gamepad || null; }
  edge(key, now) { const was = !!this.prev[key]; this.prev[key] = now; return now && !was; }
  fall(key, now) { const was = !!this.prev[key]; this.prev[key] = now; return !now && was; }
  headYaw() { this.game.renderer.camera.getWorldQuaternion(_q); _e.setFromQuaternion(_q); return _e.y; }

  // ---------------------------------------------------------------- every XR frame, before the game's update
  update(dt) {
    if (!this.session || !this.ctrl) return;
    const g = this.game, P = g.player, cam = g.renderer.camera, it = g.sys.interact;
    const L = this.gp('left'), R = this.gp('right');
    // where the right controller points (picking, placement, shooting, melee)
    const right = this.hand('right');
    right.ray.updateMatrixWorld(true);
    right.ray.getWorldPosition(this.aim.origin);
    this.aim.dir.set(0, 0, -1).applyQuaternion(right.ray.getWorldQuaternion(_q)).normalize();
    P.aim = this.aim; P.vr = true;
    P.pitch = Math.asin(clamp(this.aim.dir.y, -1, 1));
    const yaw = this.headYaw();
    P.yaw = yaw;
    // standing height (the first moments), seated play, crouching in the room — from the headset's own pose above the
    // room's floor (the 2-D camera's height of the first frames must not count, or a seated player crouches all game)
    const vp = this.r.xr.getFrame?.()?.getViewerPose?.(this.baseSpace);
    const headH = vp ? vp.transform.position.y : cam.position.y - this.W.y - this.lift;
    if (vp && (this.poseFrames = (this.poseFrames || 0) + 1) <= 90) this.standH = Math.max(this.standH, headH);
    const seat = this.stance === 'seat' || (this.stance === 'auto' && this.standH > 0.3 && this.standH < 1.3);
    this.lift = seat ? clamp(1.62 - (this.standH || 1.2), 0.2, 0.9) : 0;
    // the game moved the body between frames (a teleport, a loaded save, the tent): carry the headset's origin along
    let ex = 0, ez = 0;
    if (this.lastPos) { ex = P.pos.x - this.lastPos.x; ez = P.pos.z - this.lastPos.z; if (ex || ez) { this.W.x += ex; this.W.z += ez; this.applyOffset(); } }
    // room-scale: the body follows the head
    const paused = g.paused || P.frozen || g.sys.player?.sleeping;
    if (!paused && Number.isFinite(cam.position.x)) { P.pos.x = cam.position.x + ex; P.pos.z = cam.position.z + ez; }
    this.preMove = P.pos.clone();
    const uiOpen = this.menuOpen || !!g.handwork?.active;
    const placing = !!g.placement?.active;
    const lx = L?.axes?.[2] ?? 0, ly = L?.axes?.[3] ?? 0, rx = R?.axes?.[2] ?? 0, ry = R?.axes?.[3] ?? 0;
    this.axes.x = uiOpen ? 0 : dz(lx); this.axes.y = uiOpen ? 0 : -dz(ly);
    if (this.edge('Lstick', btn(L, 3))) this.runOn = !this.runOn;
    if (Math.hypot(lx, ly) < 0.2) this.runOn = false;
    this.axes.run = !!this.runOn;
    // walking by the body (足踏み・腕振り, §27.5): forward where you look, while the stick rests
    const bodyWalk = this.bodyWalk(dt);
    if (!uiOpen && bodyWalk.speed > 0 && Math.hypot(lx, ly) < 0.2) { this.axes.y = bodyWalk.speed; this.axes.run = bodyWalk.run; }
    this.axes.jump = !uiOpen && btn(R, 3);
    this.axes.crouch = !seat && this.poseFrames > 90 && this.standH > 1 && headH < this.standH * 0.72;
    // right stick: turn (or rotate the building being placed) / options
    if (!uiOpen) {
      const turn = rx > 0.7 ? 1 : rx < -0.7 ? -1 : 0;
      if (placing) { if (turn) g.placement.rotate(turn * dt * 2.2); }
      else if (turn && !this.turned) { this.turnAround(-turn * SNAP); this.turned = true; this.relPrev = null; }
      if (!turn) this.turned = false;
      const step = ry > 0.7 ? 1 : ry < -0.7 ? -1 : 0;
      if (step && !this.stepped && it?.target?.options?.length > 1) it.optIndex = (it.optIndex + step + it.target.options.length) % it.target.options.length;
      this.stepped = !!step;
    }
    // buttons
    const trig = btn(R, 0), grip = btn(R, 1), A = btn(R, 4);
    const trigDown = this.edge('trig', trig), trigUp = this.fall('trigU', trig);
    const gripDown = this.edge('grip', grip), gripUp = this.fall('gripU', grip);
    const aDown = this.edge('A', A);
    const bDown = this.edge('B', btn(R, 5)), yDown = this.edge('Y', btn(L, 5));
    if (bDown || yDown) {
      if (this.menuOpen) this.closeMenu();
      else if (g.handwork?.active) g.handwork.cancel();
      else if (placing) g.placement.cancel();
      else if (it?.activity) it.cancelActivity();
      else this.openMenu(['result', 'rescue', 'item', 'eat'].includes(this.page) ? 'items' : this.page);
    }
    if (this.edge('X', btn(L, 4)) && !uiOpen) g.sys.companion?.call?.();
    // the laser on panels (menu / work table), else the world
    const onPanel = this.panels(trig, trigDown, R);
    this.gestures = [];
    if (!onPanel && !uiOpen && g.running && !g.ended && !g.paused && it) {
      const held = it.heldInfo?.() || {};
      if (placing) { if (trigDown || aDown) g.placement.confirm(); if (gripDown) g.placement.cancel(); }
      else {
        if (trigDown) { it.click = true; if (it.target && !it.activity && !RANGED.has(held.kind)) it.onInteract(); else it.onPrimary(); }
        if (trigUp) { it.release = true; it.onPrimaryUp?.(); }
        if (aDown && !it.activity) it.onInteract();
        if (gripDown) it.onSecondary?.(true);
        if (gripUp) it.onSecondary?.(false);
      }
      if (g.input?.mouse) g.input.mouse.left = trig;
      it.holdE = A || (trig && !!it.activity);
      this.motion(dt, yaw, grip, it);
    } else { this.relPrev = null; if (g.input?.mouse) g.input.mouse.left = false; if (it) it.holdE = false; }
    this.ui(dt);
  }

  /**
   * walking by the body: the head's bob (足踏み) and the two hands swinging in turn (腕振り), read in the room's own
   * space (the floor origin of the headset), so the walking and turning of the game do not disturb them
   */
  bodyWalk(dt) {
    const out = { speed: 0, run: false, by: '' };
    this.armsActive = false;
    if (this.move === 'stick' || dt <= 0) { this.body = { ...out, walking: false }; return out; }
    const frame = this.r.xr.getFrame?.();
    const vp = frame?.getViewerPose?.(this.baseSpace);
    if (!vp) return out;
    const hp = vp.transform.position, ho = vp.transform.orientation;
    _q.set(ho.x, ho.y, ho.z, ho.w); _e.setFromQuaternion(_q);
    const yaw = _e.y, pitch = _e.x;
    const sens = clamp(Number(this.game.settings?.vrMoveSens) || 1, 0.5, 2);
    if (this.move === 'step' || this.move === 'both') {
      const r = this.steps.update(dt, hp.y, pitch, sens);
      if (r.walking) { out.speed = r.speed; out.run = r.run; out.by = '足踏み'; }
    }
    if (this.move === 'arms' || this.move === 'both') {
      // each hand relative to the head, its velocity forward + up (a walking arm swings forward-up and back-down)
      const pos = {};
      for (const side of ['left', 'right']) {
        const c = this.ctrl?.find((x) => x.hand === side && x.source);
        const sp = c?.source?.gripSpace || c?.source?.targetRaySpace;
        const p = sp && frame.getPose?.(sp, this.baseSpace);
        if (p) pos[side] = { x: p.transform.position.x - hp.x, y: p.transform.position.y - hp.y, z: p.transform.position.z - hp.z };
      }
      const prev = this.room;
      this.room = pos;
      if (prev?.left && prev?.right && pos.left && pos.right) {
        const v = (a, b) => ({ x: (a.x - b.x) / dt, y: (a.y - b.y) / dt, z: (a.z - b.z) / dt });
        const r = this.arms.update(dt, swingAxis(v(pos.left, prev.left), yaw), swingAxis(v(pos.right, prev.right), yaw), sens);
        this.armsActive = r.active;
        if (r.active && r.speed >= out.speed) { out.speed = r.speed; out.run = out.run || r.run; out.by = '腕振り'; }
      }
    }
    this.body = { ...out, walking: out.speed > 0 };
    return out;
  }

  /** the right controller's motion → gesture events (swing / push / pull) and side-to-side rubbing (mouseDX) */
  motion(dt, yaw, grip, it) {
    const cam = this.game.renderer.camera;
    this.rel.copy(this.aim.origin).sub(cam.position);
    if (!this.relPrev || dt <= 0) { this.relPrev = this.rel.clone(); return; }
    if (this.armsActive) { this.relPrev.copy(this.rel); this.gCool = 0.4; return; } // swinging the arms to walk: not a chop
    const vx = (this.rel.x - this.relPrev.x) / dt, vy = (this.rel.y - this.relPrev.y) / dt, vz = (this.rel.z - this.relPrev.z) / dt;
    const rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
    const side = vx * rightX + vz * rightZ, fwd = -(vx * Math.sin(yaw) + vz * Math.cos(yaw));
    it.mouseDX += ((this.rel.x - this.relPrev.x) * rightX + (this.rel.z - this.relPrev.z) * rightZ) * 2600;
    this.relPrev.copy(this.rel);
    this.gCool -= dt;
    if (this.gCool > 0) return;
    const pose = grip ? 'fist' : 'point', ay = Math.abs(vy), as = Math.abs(side), af = Math.abs(fwd);
    let e = null;
    if (ay > 2.2 && ay >= as && ay >= af) e = { type: 'swing', dir: vy < 0 ? 'down' : 'up', pose };
    else if (as > 2.4 && as >= af) e = { type: 'swing', dir: side < 0 ? 'left' : 'right', pose };
    else if (af > 1.8) e = fwd > 0 ? { type: grip ? 'push' : 'throw', pose } : { type: 'pull', pose };
    if (e) { e.speed = Math.max(ay, as, af); e.vr = true; this.gestures.push(e); this.gCool = 0.35; }
  }

  /** after the body moved (stick, collisions, teleports): carry the headset's origin with it */
  afterMove() {
    if (!this.session || !this.preMove) return;
    const P = this.game.player;
    this.W.x += P.pos.x - this.preMove.x; this.W.z += P.pos.z - this.preMove.z;
    this.W.y = P.pos.y;
    this.lastPos = P.pos.clone();
    this.applyOffset();
  }

  turnAround(d) {
    // turn the world around the head, not around the floor origin
    const cam = this.game.renderer.camera;
    const hx = cam.position.x - this.W.x, hz = cam.position.z - this.W.z;
    const c = Math.cos(d), s = Math.sin(d);
    this.W.x = cam.position.x - (hx * c + hz * s); this.W.z = cam.position.z - (-hx * s + hz * c);
    this.yaw += d;
    this.applyOffset();
  }

  applyOffset() {
    if (!this.baseSpace || typeof XRRigidTransform === 'undefined') return;
    // world = translate(W) · rotY(yaw) · base  →  the offset space's origin transform is its inverse
    _q.setFromAxisAngle(_v.set(0, 1, 0), -this.yaw);
    const p = new THREE.Vector3(-this.W.x, -(this.W.y + this.lift), -this.W.z).applyQuaternion(_q);
    this.r.xr.setReferenceSpace(this.baseSpace.getOffsetReferenceSpace(new XRRigidTransform({ x: p.x, y: p.y, z: p.z, w: 1 }, { x: _q.x, y: _q.y, z: _q.z, w: _q.w })));
  }

  // ---------------------------------------------------------------- panels: the menu and the work table
  panels(trig, trigDown, R) {
    const g = this.game, right = this.hand('right');
    const ray = new THREE.Raycaster(this.aim.origin, this.aim.dir, 0.02, 6);
    let hit = false, len = 3, color = '#e8743b';
    const hw = g.handwork?.active;
    if (hw && this.hwPlane.visible) {
      const head = ray.intersectObject(this.hwHeadMesh, false)[0];
      const h = ray.intersectObject(this.hwPlane, false)[0];
      if (head) {
        hit = true; len = head.distance; color = '#1f7f86';
        const x = head.uv.x * 1000, y = (1 - head.uv.y) * 150;
        const over = this.hwBtns?.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)?.id || null;
        if (over !== this.hwHover) { this.hwHover = over; this.hwSig = null; }
        if (trigDown && over === 'auto') g.handwork.autoComplete();
        if (trigDown && over === 'stop') g.handwork.cancel();
        g.handwork.vrPointer?.(null);
      } else {
        if (this.hwHover) { this.hwHover = null; this.hwSig = null; }
        if (h) { hit = true; len = h.distance; g.handwork.vrPointer?.(h.uv.x * 800, (1 - h.uv.y) * 500, trig); }
        else g.handwork.vrPointer?.(null);
      }
      // sticks and buttons on the table: ←→ (weave sides, rub strokes) · hold ←→ (turn a piece) · ↑↓ (grip strength) · A (Space)
      const rx = R?.axes?.[2] ?? 0, ry = R?.axes?.[3] ?? 0;
      if (this.edge('hwL', rx < -0.7)) g.handwork.vrKey?.('ArrowLeft', true, { tap: true });
      if (this.edge('hwR', rx > 0.7)) g.handwork.vrKey?.('ArrowRight', true, { tap: true });
      g.handwork.vrKey?.('KeyQ', rx < -0.4, { hit: false }); g.handwork.vrKey?.('KeyE', rx > 0.4, { hit: false });
      g.handwork.vrKey?.('KeyW', ry < -0.5); g.handwork.vrKey?.('KeyS', ry > 0.5);
      if (this.edge('hwA', btn(R, 4))) g.handwork.vrKey?.('Space', true, { tap: true });
    }
    if (this.menuOpen) {
      const h = ray.intersectObject(this.menu.mesh, false)[0];
      if (h) {
        hit = true; len = h.distance; color = '#1f7f86';
        this.menu.setHover(h.uv);
        if (trigDown) { const r = this.menu.hit(h.uv); if (r) this.menuAction(r.id); }
      } else this.menu.setHover(null);
      const ry = R?.axes?.[3] ?? 0;
      if (this.edge('mDown', ry > 0.7)) this.menuAction('scroll:down');
      if (this.edge('mUp', ry < -0.7)) this.menuAction('scroll:up');
    }
    right.laser.mesh.visible = true;
    right.laser.update({ length: hit ? len : (g.placement?.active || g.sys.interact?.target ? 2.4 : 1.2), hit, color });
    const left = this.hand('left'); if (left && left !== right) left.laser.mesh.visible = false;
    return hit || this.menuOpen || !!hw;
  }

  /** put a panel in front of the head, a little below the eyes */
  inFront(obj, dist = 0.9, down = 0.12, tilt = -0.12) {
    const cam = this.game.renderer.camera, yaw = this.headYaw();
    obj.position.set(cam.position.x - Math.sin(yaw) * dist, cam.position.y - down, cam.position.z - Math.cos(yaw) * dist);
    obj.rotation.set(tilt, yaw, 0, 'YXZ');
  }

  ui(dt) {
    const g = this.game, cam = g.renderer.camera, P = g.sys.player;
    const yaw = this.headYaw();
    // the watch: vitals (twice a second)
    this.wristT = (this.wristT || 0) - dt;
    if (this.wristT <= 0 && P?.body) {
      this.wristT = 0.5;
      const s = P.body.s, held = P.heldStack?.();
      this.wrist.update({ hp: s.hp, food: s.food, water: s.water, rest: s.rest, morale: s.morale, stamina: ((s.stamina ?? 100) / (s.staminaMax || 100)) * 100, bodyTemp: s.bodyTemp, wet: s.wet,
        day: g.clock.day, days: g.setup?.days || 0, time: g.clock.label?.() || '', weather: g.sys.weather?.name || '', held: held ? nameOf(g, held) : '', conditions: (P.body.visible?.() || []).map((c) => c.name) });
    }
    // the prompt by the view: what you point at and its options (↑↓ on the right stick), or the work in progress
    const it = g.sys.interact, t = it?.target, act = it?.activity ? g.activity : null;
    const free = !this.menuOpen && !g.handwork?.active && !g.placement?.active && !g.paused;
    let pr = null;
    if (free && act) {
      const pc = Math.round(clamp(act.progress || 0, 0, 1) * 100);
      const bar = '■'.repeat(Math.round(pc / 10)) + '□'.repeat(10 - Math.round(pc / 10));
      pr = { label: `${vrText(act.label)}${act.phase && !/^[a-z_]+$/.test(act.phase) ? `（${vrText(act.phase)}）` : ''}`, options: [{ label: `${bar} ${pc}%`, ok: true }, ...(act.hint ? [{ label: vrText(act.hint), ok: true }] : [])], index: 0 };
    } else if (free && t) {
      const sp = t.node?.data?.species;
      const name = t.type === 'node' ? (sp && g.sys.knowledge?.nameOf?.(sp)) || '' : t.label || '';
      pr = { label: /^[a-z0-9_]+$/.test(name) ? '' : name, options: t.options.map((o) => ({ label: vrText(o.label), ok: o.ok !== false, reason: o.reason && vrText(o.reason) })), index: it.optIndex || 0 };
    }
    this.prompt.update(pr);
    if (pr) { const a = yaw - 0.42; this.prompt.mesh.position.set(cam.position.x - Math.sin(a) * 0.85, cam.position.y - 0.2, cam.position.z - Math.cos(a) * 0.85); this.prompt.mesh.rotation.set(-0.2, a, 0, 'YXZ'); }
    // toasts: lazily follow the view, below it
    _v.set(cam.position.x - Math.sin(yaw) * 1.1, cam.position.y - 0.55, cam.position.z - Math.cos(yaw) * 1.1);
    this.toasts.mesh.position.lerp(_v, 1 - Math.exp(-4 * dt));
    this.toasts.mesh.rotation.set(-0.35, yaw, 0, 'YXZ');
    this.toasts.update(dt);
    // the controls guide above the hands (§27.6)
    const L = this.gp('left'), R = this.gp('right');
    const pressedOf = (gp, side) => {
      const p = new Set();
      if (!gp) return p;
      if (btn(gp, 0)) p.add('trigger');
      if (btn(gp, 1)) p.add('grip');
      if (btn(gp, 3) || Math.hypot(gp.axes?.[2] || 0, gp.axes?.[3] || 0) > 0.5) p.add('stick');
      if (btn(gp, 4)) p.add(side === 'right' ? 'a' : 'x');
      if (btn(gp, 5)) p.add(side === 'right' ? 'b' : 'y');
      if (side === 'right' && this.gestureShown > 0) p.add('swing');
      return p;
    };
    this.gestureShown = Math.max(0, (this.gestureShown || 0) - dt);
    if (this.gestures.length) this.gestureShown = 0.6;
    const mode = this.menuOpen ? 'menu' : g.handwork?.active ? 'work' : g.placement?.active ? 'place' : it?.activity ? 'activity' : 'world';
    const grips = { left: this.hand('left')?.source ? this.hand('left').grip : null, right: this.hand('right')?.source ? this.hand('right').grip : null };
    this.guide.update(grips, cam, { mode, move: this.move, held: it?.heldInfo?.()?.kind, target: !!t }, { left: pressedOf(L, 'left'), right: pressedOf(R, 'right') });
    // the work table
    const hw = g.handwork?.active;
    if (hw && hw !== this.hwFor) {
      this.hwFor = hw;
      this.hwPlane.material.map?.dispose();
      const tex = new THREE.CanvasTexture(hw.cv); tex.colorSpace = THREE.SRGBColorSpace;
      this.hwPlane.material.map = tex; this.hwPlane.material.needsUpdate = true;
      this.inFront(this.hwPlane, 0.8, 0.22, -0.3); this.hwPlane.visible = true; this.hwSig = null;
    } else if (!hw && this.hwFor) { this.hwFor = null; this.hwPlane.visible = false; this.hwPlane.material.map?.dispose(); this.hwPlane.material.map = null; }
    if (hw) {
      this.hwPlane.material.map.needsUpdate = true;
      const q = (s) => hw.root.querySelector(s)?.textContent || '';
      const say = hw.root.querySelector('.hw-say:not(.hidden)')?.textContent || '';
      const sig = [q('.hw-title'), q('.hw-step'), q('.hw-hint'), q('.hw-badge'), say, q('.hw-sp')].join('|');
      if (sig !== this.hwSig) { this.hwSig = sig; this.drawHwHead(q('.hw-title'), q('.hw-step'), q('.hw-badge'), q('.hw-hint'), q('.hw-sp'), say); }
    }
  }

  drawHwHead(title, step, badge, hint, feel, say) {
    const c = this.hwHead.getContext('2d'), W = 1000, H = 150, font = '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", "Noto Sans JP", sans-serif';
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(14,38,42,.92)'; c.beginPath(); c.roundRect(4, 4, W - 8, H - 8, 22); c.fill();
    c.textBaseline = 'middle'; c.textAlign = 'left';
    c.fillStyle = '#fdf8ea'; c.font = `800 32px ${font}`;
    c.fillText(`${title}　${step}${badge ? `　［${badge}］` : ''}`, 24, 34, W - 48);
    c.font = `700 24px ${font}`; c.fillStyle = '#ffd36b';
    const h = say || vrText(hint.replace(/マウス/g, 'レーザー').replace(/ドラッグ/g, 'トリガーを 押したまま 動かす'));
    c.fillText(h, 24, 74, W - 48);
    c.fillStyle = '#cfe9eb'; c.font = `600 21px ${font}`;
    c.fillText(`${feel ? `${feel}　` : ''}スティック：左右・回す・力　A：たたく`, 24, 116, 600);
    // two buttons on the right
    this.hwBtns = [{ id: 'auto', label: 'おまかせ', x: 640, y: 92, w: 170, h: 46 }, { id: 'stop', label: 'やめる（B）', x: 820, y: 92, w: 160, h: 46 }];
    for (const b of this.hwBtns) {
      const hov = this.hwHover === b.id;
      c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, 23); c.fillStyle = hov ? '#ffd36b' : b.id === 'auto' ? '#f6efe0' : '#e8743b'; c.fill();
      c.lineWidth = 3; c.strokeStyle = hov ? '#ffffff' : '#2a2923'; c.stroke();
      c.fillStyle = '#2a2923'; c.font = `800 24px ${font}`; c.textAlign = 'center'; c.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1); c.textAlign = 'left';
    }
    this.hwHeadMesh.material.map.needsUpdate = true;
  }

  // ---------------------------------------------------------------- DOM screens while in the headset
  /** Screens.show asks first: true = handled here (the DOM screen would be invisible in the headset) */
  screen(name, data = {}) {
    if (!this.presenting) return false;
    const map = { inventory: 'items', craft: 'make', build: 'build', companion: 'companion', sleep: 'rest', pause: 'settings', settings: 'settings' };
    if (map[name]) { this.openMenu(map[name]); return true; }
    if (name === 'eat') { this.eatUid = data.uid; this.openMenu('eat'); return true; }
    if (name === 'result') { this.result = data; this.openMenu('result'); return false; } // the DOM result waits for after VR
    if (name === 'loading') return false;
    if (['map', 'journal', 'guide', 'gesture', 'records', 'credits'].includes(name)) { this.toasts.push('この 画面は VR を 出ると 見られます（B → VR を 出る）', 'info'); return true; }
    return false;
  }

  /** the controls guide above the hands: on / off (kept in the settings) */
  setGuide(on) {
    this.guide.on = !!on;
    saveSettings({ ...loadSettings(), vrGuide: !!on });
    this.game.settings = { ...(this.game.settings || {}), vrGuide: !!on };
    this.toasts.push(on ? '手元の 操作ガイドを 出した' : '操作ガイドを 消した（B → ガイドを 出す で 戻る）', 'info');
    this.refreshMenu();
  }

  // ---------------------------------------------------------------- the VR menu
  openMenu(page = this.page) {
    if (!this.menu) return;
    const g = this.game;
    if (g.handwork?.active && page !== 'result') return;
    this.page = page; this.scroll = 0;
    if (!this.menuOpen) {
      this.menuOpen = true;
      if (!g.paused && g.running && !g.ended) { this.pausedByMenu = true; g.pause(true); }
      this.inFront(this.menu.mesh, 0.95, 0.1);
      this.menu.mesh.visible = true;
    }
    this.refreshMenu();
  }
  closeMenu() {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    if (this.menu) { this.menu.mesh.visible = false; this.menu.setHover(null); }
    if (this.pausedByMenu) { this.pausedByMenu = false; if (!this.game.ended) this.game.pause(false); }
  }
  refreshMenu() { if (!this.menuOpen) return; this.menu.update(this.pageSpec()); this.scroll = this.menu.scroll; }

  stacks() { return [...(this.game.sys.player?.inv?.stacks || [])]; }

  /** what can be done with this stack, in the order the menu shows them */
  itemActions(s) {
    const g = this.game, A = g.actions || {}, P = g.sys.player, d = defOf(s.id, s);
    const out = [];
    if (d.food || s.stew || d.attrs?.edible) out.push({ id: 'eat', label: '食べる', primary: true });
    if (s.water?.cups || d.drink) out.push({ id: 'drink', label: '飲む', primary: !out.length });
    if (s.id === 'coconut') out.push({ id: 'coconut', label: '割る' });
    if (d.tool || ['tool', 'weapon', 'ammo'].includes(d.cat)) out.push({ id: 'equip', label: P?.held === s.uid ? 'しまう' : '持つ', primary: !out.length });
    if (d.wear) out.push({ id: 'wear', label: '着る' });
    if (d.med || d.cat === 'medicine') out.push({ id: 'treat', label: '手当て' });
    if (A.canSharpen?.(s.uid)) out.push({ id: 'sharpen', label: '研ぐ' });
    if (A.canPrepFish?.(s.uid)) out.push({ id: 'prep', label: '下ごしらえ' });
    if (A.canSetTrap?.(s.uid)) out.push({ id: 'trap', label: '仕掛ける' });
    if (A.canTieHook?.(s.uid)) out.push({ id: 'knot', label: '針を 結ぶ' });
    if (d.use) out.push({ id: 'use', label: '使う' });
    if (['container'].includes(d.cat) || d.container) out.push({ id: 'fill', label: '水を くむ' });
    if (g.sys.companion && g.sys.companion.present !== false) out.push({ id: 'give', label: '仲間に 渡す' });
    out.push({ id: 'drop', label: '置く' });
    return out;
  }

  pageSpec() {
    const g = this.game, P = g.sys.player, A = g.actions || {}, page = this.page;
    const tabs = [{ id: 'items', label: '持ち物' }, { id: 'make', label: '作る' }, { id: 'build', label: '建てる' }, { id: 'companion', label: '仲間' }, { id: 'rest', label: '休む' }, { id: 'settings', label: '設定' }];
    const footer = [{ id: 'exit', label: 'VR を 出る' }, { id: 'guide', label: this.guide?.on ? 'ガイドを 消す' : 'ガイドを 出す' }, { id: 'close', label: '閉じる', primary: true }];
    const sc = this.scroll;
    if (page === 'result') {
      const d = this.result || g.screens?.cur?.data || {};
      const rank = d.score?.rank?.name || d.score?.rank || '-';
      return { title: d.headline || '終わり', note: d.days != null ? `${d.days} 日` : '', rows: [
        ...(d.sub ? [{ id: 'sub', icon: '📜', text: d.sub }] : []),
        { id: 'score', icon: '🏆', text: `スコア ${d.score?.total ?? '-'}`, right: `ランク ${rank}` },
        ...(d.records || []).map((r, i) => ({ id: `rec${i}`, icon: '・', text: r.label, right: String(r.value ?? '') })),
        ...(d.review || []).slice(0, 4).map((r, i) => ({ id: `rv${i}`, icon: '💭', text: typeof r === 'string' ? r : r.text || '' })),
        ...(d.achievements || []).map((a, i) => ({ id: `ac${i}`, icon: a.icon || '🎖', text: a.name, sub: a.desc })),
      ], footer: [{ id: 'again', label: 'もう一度', primary: true }, { id: 'exit', label: 'VR を 出る' }], scroll: sc };
    }
    if (page === 'rescue') {
      const o = this.offer || {};
      return { title: '助けが 来た！', rows: [{ id: 'q', icon: '🚢', text: o.early ? '約束の 日より 前だけど、島を 出る？' : '島を 出る？', sub: o.day != null ? `${o.day} 日目` : '' }],
        footer: [{ id: 'home', label: '帰る', primary: true }, { id: 'stay', label: 'まだ 残る' }], scroll: 0 };
    }
    if (page === 'eat') {
      const card = A.eatCard?.(this.eatUid);
      if (!card) return { title: '食べる', rows: [{ id: 'none', icon: '🍽', text: 'もう ない' }], footer: [{ id: 'back', label: '戻る', primary: true }], scroll: 0 };
      const rows = [{ id: 'gain', icon: '🍖', text: `満腹 ＋${card.foodGain}`, sub: card.waterGain ? `水分 ＋${card.waterGain}` : '', right: card.cook }];
      if (card.risk?.shown !== 'none') rows.push({ id: 'risk', icon: '⚠️', text: 'おなかを こわす かも', right: card.risk.shown === 'unknown' ? '分からない' : card.risk.shown === 'percent' ? `${Math.round(card.risk.p * 100)}%` : card.risk.label });
      for (const [i, w] of (card.warnings || []).entries()) rows.push({ id: `w${i}`, icon: '❗', text: w });
      return { title: `${card.name}を 食べる？`, rows, footer: [{ id: 'eat', label: '食べる', primary: true }, { id: 'nibble', label: '少しだけ' }, { id: 'back', label: 'やめる' }], scroll: 0 };
    }
    if (page === 'item') {
      const s = P?.inv?.get?.(this.item);
      if (!s) { this.page = 'items'; return this.pageSpec(); }
      const d = defOf(s.id, s);
      const info = [];
      if (s.q != null) info.push(`品質 ${Math.round(s.q)}`);
      if (s.fresh != null && d.food) info.push(`鮮度 ${Math.round(s.fresh)}`);
      if (s.dur != null) info.push(`耐久 ${Math.round(s.dur)}`);
      if (s.water) info.push(`水 ${s.water.cups ?? '?'} 杯`);
      return { title: `${d.icon || '📦'} ${nameOf(g, s)}${s.n > 1 ? ` ×${s.n}` : ''}`, note: info.join('・'),
        rows: [...(d.desc ? [{ id: 'desc', icon: '📝', text: d.desc }] : []), ...this.itemActions(s).map((a) => ({ id: `act_${a.id}`, icon: '▶', text: a.label, buttons: [{ id: a.id, label: 'する', primary: a.primary }] }))],
        footer: [{ id: 'back', label: '戻る' }, { id: 'close', label: '閉じる', primary: true }], scroll: sc };
    }
    let rows = [], title = 'メニュー', note = '';
    if (page === 'items') {
      title = '持ち物';
      const w = P?.inv?.weight?.() ?? 0, cap = P?.capacity ?? P?.inv?.capacity ?? 25;
      note = `${w.toFixed(1)} / ${Number(cap).toFixed(0)} kg`;
      rows = this.stacks().map((s) => {
        const d = defOf(s.id, s), acts = this.itemActions(s);
        const main = acts.find((a) => a.id !== 'drop' && a.id !== 'give') || acts[0];
        return { id: String(s.uid), icon: d.icon || '📦', text: `${nameOf(g, s)}${s.n > 1 ? ` ×${s.n}` : ''}`, sub: P?.held === s.uid ? '手に 持っている' : s.water?.cups ? `水 ${s.water.cups} 杯` : '',
          buttons: [{ id: main.id, label: main.label, primary: true }, { id: 'more', label: '…' }] };
      });
      if (!rows.length) rows = [{ id: 'none', icon: '🎒', text: '何も 持って いない' }];
    } else if (page === 'make') {
      title = '作る（作業台）';
      const C = g.sys.crafting, inv = P?.inv;
      this.bench = this.bench.filter((u) => inv?.get?.(u));
      const used = (uid) => this.bench.filter((u) => u === uid).length;
      const benchText = this.bench.map((u) => { const s = inv.get(u); return `${defOf(s.id, s).icon || '📦'}${nameOf(g, s)}`; }).join(' ＋ ');
      rows.push({ id: 'bench', icon: '🛠', text: benchText || '下の 持ち物から 台に のせる（6 個まで）', buttons: this.bench.length ? [{ id: 'undo', label: '1つ 戻す' }, { id: 'clear', label: '空に' }] : [] });
      rows.push({ id: 'm1', icon: '✋', text: '手法', buttons: METHODS.slice(0, 4).map(([m, l]) => ({ id: m, label: l, primary: this.method === m })) });
      rows.push({ id: 'm2', icon: '', text: '', buttons: METHODS.slice(4).map(([m, l]) => ({ id: m, label: l, primary: this.method === m })) });
      this.cands = [];
      if (this.bench.length && this.method && C) {
        let pv = null; try { pv = C.preview(this.method, this.bench); } catch (e) { console.error(e); }
        if (pv?.missingTool) rows.push({ id: 'miss', icon: '⚠️', text: `${{ blade: '刃物（手に 持つ）', fire: 'そばに 火', hammer: '叩く 石' }[pv.missingTool] || pv.missingTool}が 要る` });
        if (pv?.blocked) rows.push({ id: 'blk', icon: '⚠️', text: pv.blocked });
        this.cands = (pv || []).slice(0, 3);
        this.cands.forEach((c, i) => rows.push({ id: `c${i}`, icon: c.known === false ? '？' : c.icon || '✨', text: c.known === false ? '？？？' : c.name,
          sub: c.ready ? `予想 ${c.rankName || ''}` : `足りない：${(c.missing || []).join('、')}`, buttons: [{ id: 'make', label: '作る', primary: i === 0, disabled: !c.ready }] }));
        if (!this.cands.length && !pv?.blocked) rows.push({ id: 'nothing', icon: '🤔', text: 'この 手法では 何にも ならない' });
      }
      for (const s of this.stacks()) {
        const left = s.n - used(s.uid);
        rows.push({ id: `s${s.uid}`, icon: defOf(s.id, s).icon || '📦', text: `${nameOf(g, s)}${s.n > 1 ? ` ×${left}` : ''}`, buttons: [{ id: 'add', label: '台へ', disabled: left <= 0 || this.bench.length >= 6 }] });
      }
    } else if (page === 'build') {
      title = '建てる';
      rows = (g.sys.building?.defs?.() || []).map((d) => ({ id: d.id, icon: d.icon || '🏗', text: d.name, sub: d.available === false ? `${defOf(d.item)?.name || d.item}が 要る` : (d.slotsText || []).join('・'),
        buttons: [{ id: 'place', label: '置く', primary: true, disabled: d.locked || d.available === false }] }));
      note = 'トリガー：置く　右スティック：回す';
    } else if (page === 'companion') {
      const C = g.sys.companion;
      title = C ? C.name : '仲間';
      if (!C) rows = [{ id: 'none', icon: '🧍', text: '仲間は いない' }];
      else {
        if (this.choice) rows.push({ id: 'choice', icon: '💬', text: this.choice.text || '', buttons: (this.choice.choices || []).map((o) => ({ id: `ans_${o.id}`, label: o.label.replace(/（.*$/, ''), primary: o.id === 'ok' })) });
        for (const t of C.topics?.() || []) rows.push({ id: `t_${t.id}`, icon: t.icon || '💬', text: t.label, buttons: [{ id: 'talk', label: t.id === 'consult' ? '相談' : '話す', primary: t.id === 'consult' }] });
        for (const j of C.jobs?.() || []) rows.push({ id: `j_${j.id}`, icon: j.icon || '📌', text: j.label || j.name, sub: j.available === false ? j.reason : j.desc || '', buttons: [{ id: 'ask', label: '頼む', disabled: j.available === false }] });
        const s = C.vitals?.s; if (s) note = `満腹 ${Math.round(s.food)}・水 ${Math.round(s.water)}・${C.stageInfo?.name || ''}`;
      }
    } else if (page === 'rest') {
      title = '休む';
      const chk = A.sleepCheck?.() || { ok: true, reasons: [] };
      const why = (chk.reasons || []).join('・');
      rows = [
        { id: 'morning', icon: '🌙', text: '朝まで 寝る', sub: why, buttons: [{ id: 'sleep', label: '寝る', primary: true, disabled: !chk.ok }] },
        { id: 'nap', icon: '😴', text: '2 時間 休む', sub: why, buttons: [{ id: 'nap', label: '休む', disabled: !chk.ok }] },
        { id: 'save', icon: '💾', text: 'ここまでを セーブ', buttons: [{ id: 'save', label: 'セーブ' }] },
      ];
    } else if (page === 'settings') {
      title = '設定';
      const set = loadSettings();
      const hw = g.settings?.handwork || set.handwork || 'manual', bv = g.settings?.butcherView || set.butcherView || 'mild', st = this.stance;
      rows = [
        { id: 'gd', icon: '❓', text: '操作ガイド', buttons: [{ id: 'gd-on', label: '出す', primary: this.guide.on }, { id: 'gd-off', label: '消す', primary: !this.guide.on }] },
        { id: 'ws', icon: '🏃', text: '歩く 速さ', buttons: [['normal', 'ふつう'], ['fast', '速い'], ['faster', 'とても']].map(([v, l]) => ({ id: `ws-${v}`, label: l, primary: (g.settings?.walkSpeed || 'normal') === v })) },
        { id: 'mv', icon: '🚶', text: '歩き方', buttons: [['stick', 'スティック'], ['step', '足踏み'], ['arms', '腕振り'], ['both', '両方']].map(([v, l]) => ({ id: `mv-${v}`, label: l, primary: this.move === v })) },
        { id: 'st', icon: '🧍', text: '姿勢', buttons: [['auto', '自動'], ['stand', '立って'], ['seat', '座って']].map(([v, l]) => ({ id: `st-${v}`, label: l, primary: st === v })) },
        { id: 'hw', icon: '✋', text: '手の 作業', buttons: [['manual', '手で'], ['assist', '半自動'], ['auto', 'おまかせ']].map(([v, l]) => ({ id: `hw-${v}`, label: l, primary: hw === v })) },
        { id: 'bv', icon: '🔪', text: '解体の 表現', buttons: [['normal', 'ふつう'], ['mild', 'ひかえめ'], ['skip', '省略']].map(([v, l]) => ({ id: `bv-${v}`, label: l, primary: bv === v })) },
        { id: 'h1', icon: '🕹', text: '左スティック：歩く（押す：走る）', sub: '右：向き・選ぶ・押して ジャンプ' },
        { id: 'h2', icon: '🎯', text: 'トリガー：する・使う', sub: 'A：選んだ 行動　グリップ：構える　X：仲間' },
        { id: 'h3', icon: '🪓', text: 'コントローラーを 振ると 振った ことに', sub: '下に 振る：切る・たたく　前に 突く：突く・投げる' },
      ];
    }
    return { title, tabs, tab: page, rows, footer, note, scroll: sc };
  }

  async menuAction(id) {
    const g = this.game, A = g.actions || {};
    if (!id) return;
    if (id === 'close') return this.closeMenu();
    if (id === 'guide') return this.setGuide(!this.guide.on);
    if (id === 'exit') { this.closeMenu(); return this.exit(); }
    if (id === 'again') { this.closeMenu(); return g.restartGame?.(); }
    if (id === 'back') { if (this.page === 'item' || this.page === 'eat') this.page = 'items'; this.scroll = 0; return this.refreshMenu(); }
    if (id === 'home' || id === 'stay') { this.offer = null; this.page = 'items'; this.closeMenu(); g.sys.events?.answerOffer?.(id === 'home'); return; }
    if ((id === 'eat' || id === 'nibble') && this.page === 'eat') { A.eat?.(this.eatUid, { nibble: id === 'nibble' }); this.page = 'items'; return this.refreshMenu(); }
    if (id.startsWith('tab:')) { this.page = id.slice(4); this.scroll = 0; return this.refreshMenu(); }
    if (id === 'scroll:up' || id === 'scroll:down') { this.scroll = clamp(this.scroll + (id === 'scroll:up' ? -3 : 3), 0, this.menu.maxScroll); return this.refreshMenu(); }
    const m = /^row:([^:]+):(.+)$/.exec(id);
    if (!m) return;
    const [, rid, b] = m;
    try {
      if (this.page === 'items' || this.page === 'item') {
        const uid = this.page === 'item' ? this.item : Number(rid);
        if (b === 'more') { this.item = uid; this.page = 'item'; this.scroll = 0; return this.refreshMenu(); }
        return await this.doItem(uid, b);
      }
      if (this.page === 'make') {
        if (rid === 'bench') { if (b === 'undo') this.bench.pop(); else this.bench = []; return this.refreshMenu(); }
        if (rid === 'm1' || rid === 'm2') { this.method = b; return this.refreshMenu(); }
        if (b === 'add') { if (this.bench.length < 6) this.bench.push(Number(rid.slice(1))); if (!this.method) this.method = this.guessMethod(); return this.refreshMenu(); }
        if (b === 'make') { const c = this.cands?.[Number(rid.slice(1))]; if (c?.ready) { this.closeMenu(); await this.craft(c); } return; }
      }
      if (this.page === 'build' && b === 'place') {
        this.closeMenu();
        if (g.sys.building?.startPlacing?.(rid) !== false) this.toasts.push('トリガーで 置く・右スティックで 回す・B で やめる', 'info');
        return;
      }
      if (this.page === 'companion') {
        const C = g.sys.companion;
        if (rid === 'choice') { const ans = b.replace(/^ans_/, ''); this.choice = null; if (C?.pendingPlan) C.answer(ans); return this.refreshMenu(); }
        if (b === 'talk') {
          const r = C?.discuss?.(rid.slice(2));
          if (r?.choices) this.choice = { text: r.text, choices: r.choices };
          return this.refreshMenu();
        }
        if (b === 'ask') { C?.ask?.(rid.slice(2)); this.closeMenu(); return; }
      }
      if (this.page === 'rest') {
        if (b === 'sleep') { this.closeMenu(); return A.sleep?.('morning'); }
        if (b === 'nap') { this.closeMenu(); return A.sleep?.({ hours: 2 }); }
        if (b === 'save') { let ok = false; try { ok = g.save?.() !== false; } catch { ok = false; } this.toasts.push(ok ? 'セーブ した' : 'セーブ できなかった', ok ? 'good' : 'warn'); return; }
      }
      if (this.page === 'settings') {
        const [k, v] = b.split('-');
        if (k === 'gd') return this.setGuide(v === 'on');
        const key = { hw: 'handwork', bv: 'butcherView', st: 'vrStance', mv: 'vrMove', ws: 'walkSpeed' }[k];
        if (key) {
          saveSettings({ ...loadSettings(), [key]: v });
          if (k === 'st') this.stance = v;
          else if (k === 'mv') { this.move = v; this.steps.reset(); this.arms.reset(); this.room = null; if (v !== 'stick') this.toasts.push(v === 'step' ? 'その場で 足踏みすると 前へ 歩く（速く 足踏みで 走る）' : v === 'arms' ? '両腕を 交互に 振ると 前へ 歩く（大きく 振ると 走る）' : '足踏みか 腕振りで 前へ 歩く', 'info'); }
          else g.settings = { ...(g.settings || {}), [key]: v };
          return this.refreshMenu();
        }
      }
    } catch (e) { console.error(e); this.toasts.push(`できなかった：${e.message || e}`, 'warn'); }
  }

  async doItem(uid, b) {
    const g = this.game, A = g.actions || {};
    if (b === 'eat') { this.eatUid = uid; this.page = 'eat'; return this.refreshMenu(); }
    const run = { drink: () => A.drink?.(uid), equip: () => A.equip?.(uid), wear: () => A.wear?.(uid), drop: () => A.drop?.(uid, 1), give: () => A.giveToCompanion?.(uid, 1), use: () => A.use?.(uid), fill: () => A.fillContainer?.(uid) };
    if (run[b]) { await run[b](); if (this.page === 'item' && !g.sys.player?.inv?.get?.(uid)) this.page = 'items'; return this.refreshMenu(); }
    // these open the work table (or the trap flow in the world): close the menu first
    this.closeMenu();
    if (b === 'treat') return A.treat?.(uid);
    if (b === 'sharpen') return A.sharpen?.(uid);
    if (b === 'prep') return A.prepFish?.(uid);
    if (b === 'trap') return A.setTrap?.(uid);
    if (b === 'knot') return A.tieHook?.(uid);
    if (b === 'coconut') return A.openCoconut?.(uid);
  }

  /** the method the bench most likely means (the first one with a ready template) */
  guessMethod() {
    const C = this.game.sys.crafting;
    for (const [m] of METHODS) { try { const pv = C?.preview(m, this.bench); if (pv?.some?.((c) => c.ready && c.kind !== 'generic')) return m; } catch { /* next */ } }
    return null;
  }

  /** crafting from the VR bench: the work table in the headset, then the result as a toast */
  async craft(c) {
    const g = this.game, C = g.sys.crafting;
    let opts = { id: c.id, kind: c.kind };
    if (g.handwork) {
      const { flowFor } = await import('../data/handwork.js');
      const inv = g.sys.player?.inv;
      const mat = this.bench.map((u) => inv?.get?.(u)?.id || '').find((id) => /obsidian|chert|flint|stone|shell|bone/.test(id)) || 'stone';
      const tid = c.kind === 'generic' ? null : c.id;
      const hw = await g.handwork.run(flowFor(this.method, tid, this.bench.length), { title: `${c.known === false ? '？？？' : c.name}を 作る`, key: tid || `m:${this.method}`, scene: { material: mat } });
      if (!hw || hw.cancelled) return;
      opts = { ...opts, score: hw.p, timeMul: hw.feel.timeMul, failures: hw.failures };
    }
    let r = null;
    try { r = await C.craft(this.method, this.bench, opts); } catch (e) { console.error(e); r = { ok: false, reason: e.message }; }
    if (r?.ok) { this.bench = []; this.method = null; this.toasts.push(`${r.stack ? nameOf(g, r.stack) : c.name}が できた（${r.rankName || ''}）${r.first ? '　はじめて 作った！' : ''}`, 'good'); }
    else this.toasts.push(r?.reason || r?.message || '作れなかった', 'warn');
  }
}
