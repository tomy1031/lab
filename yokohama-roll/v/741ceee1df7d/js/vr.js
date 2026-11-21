// vr.js — ハマころ！ through a WebXR headset (Quest browser etc.).
//
//   const vr = setupVR({ renderer, scene, camera, rig, material, getHud });
//   vr.onSupported((ok) => ...);        // once known (and again if it changes)
//   vr.enter();                         // call inside a click (user gesture); vr.exit() ends the session
//   while vr.active, every frame:  input += vr.readInput();  ...  vr.update(dt, { pos, r, heading, up, state, stage })
//   main.js multiplies vr.viewScale into its draw distance.
//
// Third person, like the screen camera: you float behind and above NexMax and the ball. The camera rig (the
// camera's parent) follows the ball and is scaled with it — one rig metre is r / BALL_R_M world units — so the
// ball always looks ~80 cm across, a few metres in front of you, from the 30 cm start to the planet: the city
// shrinks around you instead. The headset pose moves the camera inside the rig, so you can lean and look
// around freely; the rig itself never rolls or pitches (its up is the ground normal under the ball).
// A HUD panel and a turntable of the last rolled-up item sit low in front of you, parented to the rig.
//
// Comfort (VR酔い対策). Comfort mode 「快適（おすすめ）」 is on by default, B / Y toggles 「ふつう」 (remembered):
//  - comfort: the view never rotates smoothly — left stick X rolls the ball sideways (input.s), turning is by
//    30° snap (right stick) as a cut. ふつう: left stick X is a gentle smooth turn.
//  - a head-locked tunnel vignette closes in with the rig's speed, acceleration and smooth yaw (centre ~68°
//    always clear), eased in/out over ~0.15 s, stronger in comfort mode.
//  - the rig follows the ball's height through a dead band (0.15 r) and a slow critically damped spring, so
//    rolling over low things doesn't bob your head; horizontal follow is tight, with velocity feed-forward.
//  - speedScale: 0.8 in comfort mode, and the dash's extra speed ramps in (and out) over ~0.4 s.
//  - camera shake never reaches the headset (the XR pose replaces camera.position); scale changes ease.
import * as THREE from 'three';

// ---------------------------------------------------------------- view
const BALL_R_M = 0.4;           // ball radius as seen in the headset (m) → 0.8 m across
const BACK_M = 3.35;            // eye distance behind the ball centre along the heading (m)
const UP_M = 1.65;              // eye height above the ball centre (m): ~26° down like the screen camera, ball over NexMax's helmet
const PULL_BACK = 3.2, PULL_UP = 4.5; // stage transition pull-back (same factors as main.js 'pull')
const END_PULL = 0.2;           // ending: pull back a little more every second (like main.js)
// smoothing rates (1/s): yaw and up follow quickly, scale eases, position follows with velocity feed-forward
const YAW_RATE = 7, UP_RATE = 5, SCALE_RATE = 3, VEL_RATE = 12, POS_RATE = 5, PULL_RATE = 2.5;
const MAX_LAG = 0.8;            // the follow point never trails the ball by more than this × r
const CUT_ANGLE = 0.3;          // a heading change bigger than this in one frame (snap turn) cuts instead of turning
const V_DEAD = 0.15;            // vertical follow: dead band (× r) …
const V_OMEGA = 2.2;            // … then a critically damped spring (1/s), much slower than the horizontal follow
const NEAR_M = 0.05;            // near plane (rig metres)
// ---------------------------------------------------------------- input
const DEAD = 0.15;              // thumbstick dead zone
const TURN_GAIN = 0.6;          // smooth turning is gentler than on screen (comfort)
const SNAP = Math.PI / 6;       // snap turn: 30°
const SNAP_ON = 0.7, SNAP_REARM = 0.3;
// ---------------------------------------------------------------- comfort
const COMFORT_KEY = 'hamakoro.vr.comfort';
const COMFORT_SPEED = 0.8;      // speedScale in comfort mode
const DASH_K = 1.65;            // main.js's dash factor (eased in here over DASH_RAMP)
const DASH_RAMP = 0.4;
const VIG_EASE = 0.15;          // vignette ease in / out (s)
const VIG_MAX = { comfort: 1, normal: 0.6 };
const VIG_V0 = 0.8, VIG_V1 = 6;   // perceived speed (m/s in the headset) where the vignette starts / is full
const VIG_A1 = 10;              // perceived acceleration (m/s²) for a full vignette
const VIG_YAW1 = 1.2;           // smooth yaw rate (rad/s) for a full vignette
const NOTICE_TIME = 3;
// ---------------------------------------------------------------- performance
const VIEW_SCALE = 0.6;         // draw distance multiplier while in VR
const FB_SCALE = 0.8;           // framebuffer scale (Quest 3: ~1344×1408 per eye)
const FRAME_RATE = 72;
// ---------------------------------------------------------------- HUD
const HUD_PERIOD = 0.2;         // redraw the panel at 5 Hz (only when something changed)
const HUD_W = 1024, HUD_H = 576;
const PANEL_W = 0.54, PANEL_H = (PANEL_W * HUD_H) / HUD_W; // ~33° × 19° at PANEL_DIST
const PANEL_DIST = 0.9, PANEL_PITCH = THREE.MathUtils.degToRad(42); // just below the ball and NexMax: a glance down
const RESULT_DIST = 1.25, RESULT_PITCH = THREE.MathUtils.degToRad(6), RESULT_SCALE = 1.3; // result: at eye level
const CARD = { x: 660, y: 24, w: 332 };
const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif';
const INK = '#1d2433', RED = '#e2483d', BLUE = '#2f6db3', GREEN = '#3fa66b', BROWN = '#6b5a3a', GREY = '#9a8a6a';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const dz = (v) => { const a = Math.abs(v); return a < DEAD ? 0 : (Math.sign(v) * (a - DEAD)) / (1 - DEAD); };
const stickX = (gp) => (gp.axes.length >= 4 ? gp.axes[2] : gp.axes.length >= 2 ? gp.axes[0] : 0) || 0;
const stickY = (gp) => (gp.axes.length >= 4 ? gp.axes[3] : gp.axes.length >= 2 ? gp.axes[1] : 0) || 0;
const pressed = (gp, i) => { const b = gp && gp.buttons[i]; return !!b && (b.pressed || b.value > 0.5); };

const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _x = new THREE.Vector3(), _z = new THREE.Vector3();
const _eye = new THREE.Vector3(), _c = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _e = new THREE.Euler();
const Y = new THREE.Vector3(0, 1, 0);

export function setupVR({ renderer, scene, camera, rig, material, getHud }) {
  const xrSys = typeof navigator !== 'undefined' ? navigator.xr : null;
  let supported = null;
  const supportCbs = [];
  let session = null, starting = false, active = false;

  // ---------------------------------------------------------------- support
  function setSupported(ok) {
    if (ok === supported) return;
    supported = ok;
    for (const cb of supportCbs) { try { cb(ok); } catch (e) { console.warn('[vr] onSupported callback failed', e); } }
  }
  function checkSupport() {
    if (!xrSys || typeof xrSys.isSessionSupported !== 'function') { setSupported(false); return; }
    xrSys.isSessionSupported('immersive-vr').then((ok) => setSupported(!!ok), (e) => {
      console.warn('[vr] isSessionSupported failed', e); setSupported(false);
    });
  }
  checkSupport();
  if (xrSys && xrSys.addEventListener) xrSys.addEventListener('devicechange', checkSupport);

  // ---------------------------------------------------------------- rig state
  const st = {
    init: false, s: 1, pull: 0, endT: 0, transT: 0, transJumped: false, snapReq: false, fade: 0,
    fp: new THREE.Vector3(), fv: new THREE.Vector3(), lastPos: new THREE.Vector3(), lastR: 0,
    up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(0, 0, -1), lastFwdT: new THREE.Vector3(0, 0, -1),
    farW: 1000, farSet: NaN, farQ: 0, fogNearW: 0, fogFarW: 0, fogNearSet: NaN, fogFarSet: NaN,
  };
  const head = new THREE.Vector3(0, 1.6, 0); // headset (between the eyes) in rig space, from the XR views
  let headYaw = 0;
  const calib = new THREE.Vector3(0, 1.6, 0); // where the head was when we last recentred
  let calibYaw = 0, calibCount = 0, calibNext = 0;
  let sky = null; // main.js's sky dome: re-centred on the eye
  let comfort = true;
  try { comfort = localStorage.getItem(COMFORT_KEY) !== '0'; } catch (e) { /* private mode: default */ }
  let dashHeld = false, dashRamp = 0;
  let notice = null, noticeT = 0; // HUD notice (comfort-mode changes)
  const vig = { v: 0, lastEye: new THREE.Vector3(), vel: new THREE.Vector3(), lastVel: new THREE.Vector3(), valid: false };
  let vy = 0; // vertical follow spring velocity
  let saved = null; // screen state to restore when the session ends

  // ---------------------------------------------------------------- frustum fix for a scaled rig
  // three r170 builds the culling frustum of the two eyes (setProjectionFromUnion) with the eye offset in
  // world units but the near plane in rig units, so with a big rig scale nearby things (the ball!) get
  // culled. Redo that projection in rig units after three's own update.
  const xrUpdateCamera = renderer.xr.updateCamera;
  renderer.xr.updateCamera = function (cam) {
    xrUpdateCamera.call(this, cam);
    if (active) fixUnionFrustum(cam);
  };
  function fixUnionFrustum(cam) {
    const xc = renderer.xr.getCamera(), cams = xc.cameras;
    if (cams.length !== 2) return;
    const pL = cams[0].projectionMatrix.elements, pR = cams[1].projectionMatrix.elements;
    if (pL[10] === -1) return; // infinite far plane: three copies the left eye's projection, which is fine
    const ipd = cams[0].position.distanceTo(cams[1].position); // rig metres
    const near = pL[14] / (pL[10] - 1), far = pL[14] / (pL[10] + 1);
    const topFov = (pL[9] + 1) / pL[5], bottomFov = (pL[9] - 1) / pL[5];
    const leftFov = (pL[8] - 1) / pL[0], rightFov = (pR[8] + 1) / pR[0];
    const zOffset = ipd / (-leftFov + rightFov), xOffset = zOffset * -leftFov;
    const near2 = near + zOffset, far2 = far + zOffset;
    xc.projectionMatrix.makePerspective(near * leftFov - xOffset, near * rightFov + (ipd - xOffset),
      (topFov * far / far2) * near2, (bottomFov * far / far2) * near2, near2, far2);
    xc.projectionMatrixInverse.copy(xc.projectionMatrix).invert();
    cam.projectionMatrix.copy(xc.projectionMatrix);
    cam.projectionMatrixInverse.copy(xc.projectionMatrixInverse);
  }

  // ---------------------------------------------------------------- HUD panel (canvas texture)
  const hudRoot = new THREE.Group();
  hudRoot.name = 'vr-hud-root';
  hudRoot.visible = false;
  rig.add(hudRoot);
  const panel = new THREE.Group();
  hudRoot.add(panel);
  const cv = document.createElement('canvas');
  cv.width = HUD_W; cv.height = HUD_H;
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const hudMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(PANEL_W, PANEL_H),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false })
  );
  hudMesh.name = 'vr-hud';
  hudMesh.renderOrder = 10;
  hudMesh.userData.canvas = cv;
  panel.add(hudMesh);

  // the "まきこんだ！" card's turntable: the last rolled-up item in 3D, hovering in front of the card
  const itemHolder = new THREE.Group(); // level (undoes the panel's tilt)
  const itemPivot = new THREE.Group();
  const itemMesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  itemMesh.name = 'vr-item';
  itemMesh.visible = false;
  itemPivot.add(itemMesh);
  itemHolder.add(itemPivot);
  panel.add(itemHolder);
  let itemKey = '', itemPop = 0, itemShort = null, itemFit = 1;
  const item = { proto: null };

  function placeItem(short) {
    if (short === itemShort) return;
    itemShort = short;
    const cy = short ? 152 : 230; // canvas y of the model's centre
    itemHolder.position.set(((CARD.x + CARD.w / 2) / HUD_W - 0.5) * PANEL_W, (0.5 - cy / HUD_H) * PANEL_H, 0.07);
    itemFit = short ? 0.05 : 0.075; // model radius (m)
    if (item.proto) fitItem(item.proto);
  }
  function fitItem(proto) {
    const rad = Math.max(Math.hypot(proto.w || 0, proto.h || 0, proto.d || 0) / 2, 1e-4);
    const k = itemFit / rad;
    itemMesh.scale.setScalar(k);
    if (proto.center) itemMesh.position.copy(proto.center).multiplyScalar(-k); else itemMesh.position.set(0, 0, 0);
  }
  function showItem(it) {
    const proto = it.proto;
    if (!proto || !proto.geom) { itemMesh.visible = false; return; }
    if (proto !== item.proto) {
      item.proto = proto;
      itemMesh.geometry = proto.geom;
      fitItem(proto);
      itemPivot.rotation.set(0.12, -0.6, 0);
    }
    itemMesh.visible = true;
    itemPop = 1;
  }
  placeItem(false);

  // full-view fade (the screen's white #fade during stage transitions), parented to the head
  const fadeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 16, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false, toneMapped: false })
  );
  fadeMesh.name = 'vr-fade';
  fadeMesh.renderOrder = 100;
  fadeMesh.frustumCulled = false;
  fadeMesh.visible = false;
  camera.add(fadeMesh);

  // tunnel vignette, head-locked: darkens the periphery while the view moves (the centre stays clear)
  const vigMat = new THREE.ShaderMaterial({
    uniforms: { uStrength: { value: 0 }, uInner: { value: 1 }, uOuter: { value: 1.4 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uStrength; uniform float uInner; uniform float uOuter; varying vec3 vDir;
      void main(){ float ang = acos(clamp(-normalize(vDir).z, -1.0, 1.0));
        gl_FragColor = vec4(0.0, 0.0, 0.0, smoothstep(uInner, uOuter, ang) * uStrength); }`,
    side: THREE.BackSide, transparent: true, depthTest: false, depthWrite: false,
  });
  const vigMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 16), vigMat);
  vigMesh.name = 'vr-vignette';
  vigMesh.renderOrder = 99;
  vigMesh.frustumCulled = false;
  vigMesh.visible = false;
  camera.add(vigMesh);

  // simple controller models (grip space), so you can see your hands
  const ctrlMat = new THREE.MeshLambertMaterial({ color: 0xf1ece2, emissive: 0x2b2722 });
  const tipMat = new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x4a3a08 });
  const ctrlGeo = new THREE.CapsuleGeometry(0.02, 0.07, 4, 10).rotateX(-Math.PI / 2);
  const tipGeo = new THREE.SphereGeometry(0.014, 12, 8).translate(0, 0, -0.058);
  for (let i = 0; i < 2; i++) {
    const grip = renderer.xr.getControllerGrip(i);
    grip.add(new THREE.Mesh(ctrlGeo, ctrlMat), new THREE.Mesh(tipGeo, tipMat));
    rig.add(grip);
  }

  // ---------------------------------------------------------------- session
  function enter() {
    if (session || starting) return Promise.resolve(!!session);
    if (!xrSys || typeof xrSys.requestSession !== 'function') { console.warn('[vr] WebXR is not available'); return Promise.resolve(false); }
    starting = true;
    let req;
    try {
      // requested synchronously so this works from inside a click handler
      req = xrSys.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    } catch (e) {
      starting = false; console.warn('[vr] requestSession failed', e); return Promise.resolve(false);
    }
    return req.then(begin).then(() => true, (e) => {
      console.warn('[vr] could not start the VR session', e);
      starting = false;
      const sess = session;
      restore();
      if (sess) sess.end().catch(() => {});
      return false;
    });
  }

  async function begin(sess) {
    session = sess;
    sess.addEventListener('end', onEnd);
    // local-floor is optional: fall back to local (the eye height is recalibrated anyway)
    let space = 'local-floor';
    try { await sess.requestReferenceSpace('local-floor'); } catch (e) { space = 'local'; }
    if (session !== sess) return; // ended meanwhile
    // screen state we change while in VR
    const lights = [];
    scene.traverse((o) => { if (o.isLight && o.castShadow) lights.push(o); });
    saved = {
      xr: renderer.xr.enabled, shadows: renderer.shadowMap.enabled, lights,
      fov: camera.fov, zoom: camera.zoom, near: camera.near, far: camera.far,
    };
    renderer.shadowMap.enabled = false;
    for (const l of lights) l.castShadow = false; // also recompiles the materials without shadow lookups
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType(space);
    renderer.xr.setFramebufferScaleFactor(FB_SCALE);
    renderer.xr.setFoveation(1);
    await renderer.xr.setSession(sess);
    if (session !== sess) return;
    try {
      const rates = sess.supportedFrameRates;
      if (rates && sess.updateTargetFrameRate && Array.prototype.includes.call(rates, FRAME_RATE)) sess.updateTargetFrameRate(FRAME_RATE).catch(() => {});
    } catch (e) { /* optional */ }
    const ref = renderer.xr.getReferenceSpace();
    if (ref && ref.addEventListener) ref.addEventListener('reset', recenter); // the user recentred (Oculus button)
    st.init = false; st.fade = 0; st.pull = 0; st.endT = 0; st.transT = 0; st.farSet = NaN; st.fogNearSet = NaN;
    calibCount = 2; calibNext = 0; // calibrate on the first pose, then once more when tracking has settled
    hudRoot.visible = true; hudKey = ''; hudT = 0;
    vig.v = 0; vig.valid = false; vy = 0; dashRamp = 0; dashHeld = false;
    showNotice();
    starting = false;
    active = true;
    console.info(`[vr] session started (${space})`);
  }

  function onEnd() {
    session = null; starting = false;
    restore();
    console.info('[vr] session ended');
  }

  function restore() {
    active = false;
    hudRoot.visible = false;
    fadeMesh.visible = false;
    vigMesh.visible = false;
    rig.position.set(0, 0, 0); rig.quaternion.identity(); rig.scale.set(1, 1, 1);
    rig.updateMatrixWorld(true);
    camera.scale.set(1, 1, 1);
    if (!saved) return;
    renderer.shadowMap.enabled = saved.shadows;
    for (const l of saved.lights) l.castShadow = true;
    renderer.xr.enabled = saved.xr;
    if (scene.fog && scene.fog.isFog && scene.fog.near === st.fogNearSet) { scene.fog.near = st.fogNearW; scene.fog.far = st.fogFarW; }
    camera.fov = saved.fov; camera.zoom = saved.zoom;
    camera.near = saved.near; camera.far = st.farW || saved.far;
    camera.updateProjectionMatrix();
    saved = null;
  }

  function exit() {
    if (session) return session.end().catch((e) => console.warn('[vr] end failed', e));
    return Promise.resolve();
  }

  function recenter() { calibCount = Math.max(calibCount, 1); calibNext = 0; }
  function setComfort(on) {
    comfort = !!on;
    try { localStorage.setItem(COMFORT_KEY, comfort ? '1' : '0'); } catch (e) { /* private mode */ }
    showNotice();
  }
  function showNotice() {
    notice = comfort
      ? { main: '視点：快適（おすすめ）', sub: '左スティック 左右で 横にころがる ・ 右スティックで 30° 回転' }
      : { main: '視点：ふつう', sub: '左スティック 左右で なめらかに 回転 ・ B / Y で 快適に もどす' };
    noticeT = NOTICE_TIME; hudT = 0; hudDirty = true;
  }
  function calibrate() {
    calib.copy(head);
    calibYaw = headYaw;
    hudRoot.position.copy(calib);
    hudRoot.rotation.set(0, calibYaw, 0);
  }
  function readHead() {
    const cams = renderer.xr.getCamera().cameras; // per-eye cameras, rig-local (from the XR views)
    if (!cams.length) return false;
    if (cams.length >= 2) head.addVectors(cams[0].position, cams[1].position).multiplyScalar(0.5);
    else head.copy(cams[0].position);
    _e.setFromQuaternion(cams[0].quaternion, 'YXZ');
    headYaw = _e.y;
    return true;
  }

  // ---------------------------------------------------------------- input
  const inp = { f: 0, t: 0, s: 0, dash: false, snap: 0 };
  const pads = { left: null, right: null };
  const prevBtn = { left: 0, right: 0 };
  let snapArmed = true;
  function findPads() {
    pads.left = pads.right = null;
    if (!session) return;
    const srcs = session.inputSources; // read every frame: controllers may connect / disconnect any time
    for (let i = 0; i < srcs.length; i++) {
      const src = srcs[i], gp = src.gamepad;
      if (!gp) continue; // hands without a gamepad
      if (src.handedness === 'left') pads.left = gp;
      else if (src.handedness === 'right' || !pads.right) pads.right = gp;
    }
  }
  // left stick: Y forward/back; X = sideways roll (comfort) or a gentle smooth turn (ふつう).
  // Right stick X: 30° snap turn. Trigger or grip: dash. With only one controller, its stick drives (no snap).
  function readInput() {
    inp.f = 0; inp.t = 0; inp.s = 0; inp.dash = false; inp.snap = 0;
    if (!active) { dashHeld = false; return inp; }
    findPads();
    const L = pads.left, R = pads.right, move = L || R;
    if (move) {
      inp.f = -dz(stickY(move)); // pushing the stick away reads negative
      const x = dz(stickX(move));
      if (comfort) inp.s = x; else inp.t = x * TURN_GAIN;
    }
    if (L && R) {
      const x = stickX(R), ax = Math.abs(x);
      if (snapArmed && ax > SNAP_ON) { inp.snap = Math.sign(x) * SNAP; snapArmed = false; st.snapReq = true; }
      else if (ax < SNAP_REARM) snapArmed = true;
    }
    inp.dash = dashHeld = pressed(L, 0) || pressed(L, 1) || pressed(R, 0) || pressed(R, 1);
    return inp;
  }
  // buttons that work in every state: thumbstick click = recentre; B / Y = comfort mode;
  // A / X on the result screen = leave VR
  function pollButtons(state) {
    findPads();
    for (let h = 0; h < 2; h++) {
      const key = h ? 'right' : 'left', gp = pads[key];
      const mask = gp ? (pressed(gp, 3) ? 1 : 0) | (pressed(gp, 4) ? 2 : 0) | (pressed(gp, 5) ? 4 : 0) : 0;
      const down = mask & ~prevBtn[key];
      prevBtn[key] = mask;
      if (down & 1) recenter();
      if (down & 2 && state === 'result') exit();
      if (down & 4) setComfort(!comfort);
    }
  }

  // ---------------------------------------------------------------- per frame
  let panelBlend = 0;
  function update(dt, s) {
    if (!active || !s) return;
    dt = clamp(dt || 0, 0, 0.1);
    if (readHead() && calibCount > 0 && (calibNext -= dt) <= 0) { calibrate(); calibCount--; calibNext = 0.6; }
    pollButtons(s.state);
    if (s.state !== 'play') dashHeld = false; // readInput only runs while playing
    dashRamp = clamp(dashRamp + (dashHeld ? dt : -dt) / DASH_RAMP, 0, 1);
    if (noticeT > 0 && (noticeT -= dt) <= 0) { notice = null; hudDirty = true; hudT = 0; }
    if (!sky) sky = scene.children.find((o) => o.isMesh && o.material && o.material.isShaderMaterial && o.material.side === THREE.BackSide) || null;

    const r = Math.max(s.r, 1e-4), sT = r / BALL_R_M;
    // a teleport (new stage) or a sudden size change: cut instead of easing across the world
    const jump = !st.init || s.pos.distanceTo(st.lastPos) > Math.max(r, st.lastR) * 8 || sT > st.s * 4 || sT < st.s / 4;
    if (s.state === 'trans') st.transT += dt; else { st.transT = 0; st.transJumped = false; }
    if (jump && st.init && s.state === 'trans') st.transJumped = true; // main.js drops 'pull' after the swap
    st.endT = s.state === 'ending' ? st.endT + dt : 0;
    const pullT = s.state === 'trans' && !st.transJumped ? 1 : 0;

    fwdTarget(s.heading, jump ? s.up : st.up);
    let cut = jump, yawRate = 0;
    if (jump) {
      st.fp.copy(s.pos); st.fv.set(0, 0, 0); vy = 0;
      st.up.copy(s.up).normalize();
      fwdTarget(s.heading, st.up);
      st.fwd.copy(_f);
      st.s = sT; st.pull = pullT;
      st.init = true;
    } else {
      st.up.lerp(s.up, 1 - Math.exp(-dt * UP_RATE)).normalize();
      fwdTarget(s.heading, st.up);
      st.s *= Math.exp(Math.log(sT / st.s) * (1 - Math.exp(-dt * SCALE_RATE)));
      // follow point, horizontal: carried along with the smoothed ball velocity and pulled onto the ball (tight)
      if (dt > 1e-5) {
        _v.subVectors(s.pos, st.lastPos).divideScalar(dt);
        _v.addScaledVector(st.up, -_v.dot(st.up));
        st.fv.lerp(_v, 1 - Math.exp(-dt * VEL_RATE));
      }
      st.fp.addScaledVector(st.fv, dt);
      _v.subVectors(s.pos, st.fp);
      const ev = _v.dot(st.up);
      _v.addScaledVector(st.up, -ev); // horizontal error
      const eh = _v.length(), left = Math.exp(-dt * POS_RATE);
      st.fp.addScaledVector(_v, eh * left > r * MAX_LAG ? 1 - (r * MAX_LAG) / eh : 1 - left);
      // vertical: dead band, then a slow critically damped spring — rolling over low things doesn't bob the view
      const evd = ev > V_DEAD * r ? ev - V_DEAD * r : ev < -V_DEAD * r ? ev + V_DEAD * r : 0;
      vy += (V_OMEGA * V_OMEGA * evd - 2 * V_OMEGA * vy) * dt;
      st.fp.addScaledVector(st.up, vy * dt);
      const ev2 = ev - vy * dt; // never lose the ball vertically
      if (Math.abs(ev2) > r * 1.5) st.fp.addScaledVector(st.up, ev2 - Math.sign(ev2) * r * 1.5);
      // yaw: a snap turn cuts, smooth turning (ふつう mode) follows closely
      cut = st.snapReq || st.lastFwdT.dot(_f) < Math.cos(CUT_ANGLE);
      if (cut) st.fwd.copy(_f);
      else {
        const ang = Math.atan2(_c.crossVectors(st.fwd, _f).dot(st.up), st.fwd.dot(_f)) * (1 - Math.exp(-dt * YAW_RATE));
        st.fwd.applyAxisAngle(st.up, ang);
        if (dt > 1e-5) yawRate = ang / dt;
      }
      st.pull += (pullT - st.pull) * (1 - Math.exp(-dt * PULL_RATE));
    }
    st.snapReq = false;
    st.fwd.addScaledVector(st.up, -st.fwd.dot(st.up)).normalize();
    st.lastFwdT.copy(_f);
    st.lastPos.copy(s.pos); st.lastR = r;

    // rig: the calibrated head lands at the eye point; rig axes = (right, up, back), never rolled or pitched
    const S = st.s;
    const back = BACK_M * (1 + (PULL_BACK - 1) * st.pull) * (1 + st.endT * END_PULL);
    const upM = UP_M * (1 + (PULL_UP - 1) * st.pull) * (1 + st.endT * END_PULL);
    _eye.copy(st.fp).addScaledVector(st.fwd, -back * S).addScaledVector(st.up, upM * S);
    _x.crossVectors(st.fwd, st.up).normalize();
    _z.copy(st.fwd).negate();
    _m.makeBasis(_x, st.up, _z);
    _q.setFromRotationMatrix(_m);
    _qy.setFromAxisAngle(Y, -calibYaw);
    rig.quaternion.copy(_q).multiply(_qy);
    rig.scale.setScalar(S);
    rig.position.copy(_eye).sub(_v.copy(calib).multiplyScalar(S).applyQuaternion(rig.quaternion));

    // tunnel vignette from the perceived motion (eye motion in headset metres), eased in and out
    if (cut || !vig.valid) { vig.lastEye.copy(_eye); vig.vel.set(0, 0, 0); vig.lastVel.set(0, 0, 0); vig.valid = true; }
    else if (dt > 1e-5) {
      vig.lastVel.copy(vig.vel);
      vig.vel.lerp(_c.subVectors(_eye, vig.lastEye).divideScalar(dt * S), 1 - Math.exp(-dt * 10));
      vig.lastEye.copy(_eye);
    }
    const accel = dt > 1e-5 ? vig.lastVel.distanceTo(vig.vel) / dt : 0;
    const kv = clamp((vig.vel.length() - VIG_V0) / (VIG_V1 - VIG_V0), 0, 1), ka = clamp(accel / VIG_A1, 0, 1);
    const ky = clamp(Math.abs(yawRate) / VIG_YAW1, 0, 1);
    const want = (1 - (1 - kv) * (1 - ka) * (1 - ky)) * (comfort ? VIG_MAX.comfort : VIG_MAX.normal);
    vig.v += (want - vig.v) * (1 - Math.exp(-dt / VIG_EASE));
    vigMat.uniforms.uStrength.value = vig.v;
    vigMat.uniforms.uInner.value = THREE.MathUtils.degToRad(70 - 36 * vig.v); // ≥ 34° half-angle stays clear
    vigMat.uniforms.uOuter.value = vigMat.uniforms.uInner.value + THREE.MathUtils.degToRad(22);
    vigMesh.visible = vig.v > 0.01;

    // main.js sets near/far and fog in world units; the XR view space is in rig metres
    if (camera.far !== st.farSet) st.farW = camera.far;
    const farRig = Math.max(st.farW / S, 20);
    if (!(st.farQ > 0) || Math.abs(farRig / st.farQ - 1) > 0.1) st.farQ = farRig; // quantised: fewer render-state updates
    camera.near = NEAR_M; camera.far = st.farQ; st.farSet = st.farQ;
    const fog = scene.fog;
    if (fog && fog.isFog) {
      if (fog.near !== st.fogNearSet || fog.far !== st.fogFarSet) { st.fogNearW = fog.near; st.fogFarW = fog.far; }
      fog.near = st.fogNearW / S; fog.far = st.fogFarW / S;
      st.fogNearSet = fog.near; st.fogFarSet = fog.far;
    }
    if (sky) sky.position.copy(head).multiplyScalar(S).applyQuaternion(rig.quaternion).add(rig.position);

    // stage-transition fade (white, like the screen)
    const fadeT = s.state === 'trans' && !st.transJumped ? clamp((st.transT - 3.0) / 0.7, 0, 1) : 0;
    st.fade = fadeT > st.fade ? fadeT : Math.max(fadeT, st.fade - dt / 0.7);
    fadeMesh.material.opacity = st.fade;
    fadeMesh.visible = st.fade > 0.003;

    // HUD: panel pose (low in front; at eye level for the result), item turntable, 5 Hz redraw
    panelBlend += ((s.state === 'result' ? 1 : 0) - panelBlend) * (1 - Math.exp(-dt * 4));
    const pitch = lerp(PANEL_PITCH, RESULT_PITCH, panelBlend), dist = lerp(PANEL_DIST, RESULT_DIST, panelBlend);
    panel.position.set(0, -Math.sin(pitch) * dist, -Math.cos(pitch) * dist);
    panel.rotation.set(-pitch, 0, 0);
    panel.scale.setScalar(lerp(1, RESULT_SCALE, panelBlend));
    itemHolder.rotation.x = pitch;
    itemHolder.visible = s.state !== 'result';
    itemPivot.rotation.y += dt * 0.9;
    itemPop = Math.max(0, itemPop - dt * 3);
    itemPivot.scale.setScalar(1 + Math.sin(itemPop * Math.PI) * 0.18);
    if ((hudT -= dt) <= 0) { hudT = HUD_PERIOD; refreshHud(); }
  }
  function fwdTarget(heading, up) {
    _f.copy(heading).addScaledVector(up, -heading.dot(up));
    if (_f.lengthSq() < 1e-10) _f.copy(st.fwd);
    _f.normalize();
  }

  // ---------------------------------------------------------------- HUD drawing
  let hudT = 0, hudKey = '', hudDirty = true;
  const faces = new Map();
  function faceImage(url) {
    let f = faces.get(url);
    if (!f) {
      f = { img: new Image(), ok: false };
      f.img.onload = () => { f.ok = true; hudDirty = true; };
      f.img.onerror = () => { f.ok = false; console.warn('[vr] CEO face image failed to load', url); };
      f.img.src = url;
      faces.set(url, f);
    }
    return f;
  }
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { hudDirty = true; });

  function refreshHud() {
    let h = null;
    try { h = getHud(); } catch (e) { console.warn('[vr] getHud failed', e); }
    if (!h) return;
    const it = h.item;
    const iKey = it ? `${it.name}|${it.meta}` : '';
    if (iKey !== itemKey) { itemKey = iKey; if (it) showItem(it); else { itemMesh.visible = false; item.proto = null; } }
    placeItem(!!(h.errand && h.errand.length));
    const c = h.ceo, b = h.banner, res = h.result;
    const key = [h.state, h.mode, h.size, h.goal, Math.round((h.goalProgress || 0) * 300), h.count, h.timer, h.district, h.message,
      b ? b.main + '/' + b.sub : '', h.toast, c ? `${c.name}/${c.text}/${c.face}` : '', iKey,
      h.errand ? h.errand.map((e) => (e.done ? '1' : '0') + e.name).join(',') : '', res ? res.title + '/' + res.desc : '',
      comfort ? 'C' : 'N', notice ? notice.main : ''].join('|');
    if (key === hudKey && !hudDirty) return;
    hudKey = key; hudDirty = false;
    drawHud(h);
    hudMesh.userData.hud = { state: h.state, size: h.size, goal: h.goal, district: h.district, timer: h.timer, count: h.count, item: it ? it.name : null,
      comfort, notice: notice ? notice.main : null };
    tex.needsUpdate = true;
  }

  const F = (size, weight = 800) => `${weight} ${size}px ${FONT}`;
  function rr(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function fit(text, maxW, size, weight = 800) {
    let s = size;
    g.font = F(s, weight);
    while (s > 14 && g.measureText(text).width > maxW) { s -= 2; g.font = F(s, weight); }
    return s;
  }
  // line wrap for Japanese: break at a space when there is one late enough in the line, else between characters
  function wrap(text, maxW, maxLines) {
    const lines = [];
    let line = '';
    for (const ch of String(text)) {
      if (ch === '\n') { lines.push(line); line = ''; continue; }
      const test = line + ch;
      if (line && g.measureText(test).width > maxW) {
        const sp = line.lastIndexOf(' ');
        if (sp > line.length * 0.45) { lines.push(line.slice(0, sp)); line = line.slice(sp + 1) + ch; }
        else { lines.push(line); line = ch === ' ' ? '' : ch; }
      } else line = test;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      let last = lines[maxLines - 1];
      while (last && g.measureText(last + '…').width > maxW) last = last.slice(0, -1);
      lines[maxLines - 1] = last + '…';
    }
    return lines;
  }
  function pill(x, y, text, size, fg, bg, dot) {
    g.font = F(size);
    const tw = g.measureText(text).width, padX = 18, h = size + 22, dw = dot ? size * 0.75 : 0, w = tw + padX * 2 + dw;
    rr(x, y, w, h, h / 2); g.fillStyle = bg; g.fill();
    if (dot) { g.fillStyle = dot; g.beginPath(); g.arc(x + padX + size * 0.25, y + h / 2, size * 0.22, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = fg; g.fillText(text, x + padX + dw, y + h / 2 + size * 0.36);
    return x + w;
  }

  function drawHud(h) {
    g.clearRect(0, 0, HUD_W, HUD_H);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    rr(6, 6, HUD_W - 12, HUD_H - 12, 40);
    g.fillStyle = 'rgba(255,250,240,0.95)'; g.fill();
    g.lineWidth = 6; g.strokeStyle = 'rgba(29,36,51,0.22)'; g.stroke();
    if (h.state === 'result' && h.result) { drawResult(h); return; }
    const L = 36, LW = 596;
    // size + goal
    g.fillStyle = BROWN; g.font = F(24); g.fillText('いまの大きさ', L, 52);
    g.textAlign = 'right'; g.fillStyle = GREY; g.font = F(19, 500);
    g.fillText(`視点：${comfort ? '快適' : 'ふつう'}（B / Y）`, L + LW, 50);
    g.textAlign = 'left';
    g.fillStyle = INK; fit(h.size || '', LW, 76); g.fillText(h.size || '', L, 124);
    g.fillStyle = BLUE; fit(h.goal || '', LW, 28); g.fillText(h.goal || '', L, 164);
    const bx = L, by = 176, bw = LW, bh = 20, p = clamp(h.goalProgress || 0, 0, 1);
    rr(bx, by, bw, bh, bh / 2); g.fillStyle = 'rgba(29,36,51,0.13)'; g.fill();
    if (p > 0) {
      const gr = g.createLinearGradient(bx, 0, bx + bw, 0);
      gr.addColorStop(0, '#ffd23f'); gr.addColorStop(1, '#ff8a3d');
      rr(bx, by, Math.max(bh, bw * p), bh, bh / 2); g.fillStyle = gr; g.fill();
    }
    // district / timer / count
    let x = L;
    const py = 210, chip = 'rgba(29,36,51,0.08)';
    if (h.district) x = pill(x, py, h.district, 26, INK, chip, RED) + 12;
    if (h.timer) {
      const m = /(\d+):(\d+)/.exec(h.timer);
      const hurry = h.mode === 'timeattack' && m && +m[1] * 60 + +m[2] < 30;
      x = pill(x, py, h.timer, 26, hurry ? '#fff' : INK, hurry ? RED : chip) + 12;
    }
    if (h.count) pill(x, py, h.count, 26, INK, chip);
    // comfort-mode notice (for a few seconds), else banner (or toast), then the current message
    if (notice) {
      rr(L - 6, 270, LW + 12, 104, 20); g.fillStyle = '#ffd23f'; g.fill();
      g.fillStyle = INK; fit(notice.main, LW - 24, 34); g.fillText(notice.main, L + 10, 312);
      fit(notice.sub, LW - 24, 22, 800); g.fillText(notice.sub, L + 10, 352);
    } else if (h.banner && h.banner.main) {
      const sub = h.banner.sub || '';
      g.font = F(26);
      const subW = sub ? Math.min(g.measureText(sub).width, LW * 0.4) : 0;
      g.fillStyle = RED; fit(h.banner.main, LW - (sub ? subW + 20 : 0), 44); g.fillText(h.banner.main, L, 306);
      const used = g.measureText(h.banner.main).width;
      if (sub) { g.fillStyle = INK; fit(sub, LW - used - 20, 26); g.fillText(sub, L + used + 20, 306); }
    } else if (h.toast) {
      g.fillStyle = RED; fit(h.toast, LW, 32); g.fillText(h.toast, L, 304);
    }
    if (h.message && !notice) {
      g.font = F(25);
      const lines = wrap(h.message, LW - 36, 2);
      rr(L - 6, 322, LW + 12, 20 + lines.length * 32, 18); g.fillStyle = 'rgba(29,36,51,0.88)'; g.fill();
      g.fillStyle = '#fff';
      lines.forEach((ln, i) => g.fillText(ln, L + 12, 352 + i * 32));
    }
    if (h.ceo && h.ceo.text) drawCeo(L, 418, LW, h.ceo);
    drawCard(h);
    if (h.errand && h.errand.length) drawErrand(h.errand);
  }

  function drawCeo(x, y, w, c) {
    const R = 50, cx = x + R, cy = y + 66;
    rr(x - 10, y - 4, w + 20, 144, 24); g.fillStyle = 'rgba(47,74,138,0.10)'; g.fill();
    g.save();
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.closePath();
    g.fillStyle = '#dfe7f5'; g.fill(); g.clip();
    const f = c.face ? faceImage(c.face) : null;
    if (f && f.ok && f.img.naturalWidth) {
      const iw = f.img.naturalWidth, ih = f.img.naturalHeight, k = Math.max((2 * R) / iw, (2 * R) / ih);
      g.drawImage(f.img, cx - (iw * k) / 2, cy - (ih * k) / 2, iw * k, ih * k);
    } else {
      g.fillStyle = '#2f4a8a'; g.font = F(46); g.textAlign = 'center';
      g.fillText(Array.from(c.name || '?')[0], cx, cy + 16);
      g.textAlign = 'left';
    }
    g.restore();
    g.lineWidth = 4; g.strokeStyle = '#2f4a8a';
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    const tx = x + 2 * R + 20, tw = w - 2 * R - 24;
    g.fillStyle = '#2f4a8a'; fit(c.name || '', tw, 22); g.fillText(c.name || '', tx, y + 26);
    g.fillStyle = INK; g.font = F(25);
    wrap(c.text, tw, 3).forEach((ln, i) => g.fillText(ln, tx, y + 60 + i * 33));
  }

  function drawCard(h) {
    const short = !!(h.errand && h.errand.length);
    const { x, y, w } = CARD, hh = short ? 292 : 528;
    const gr = g.createRadialGradient(x + w / 2, y + hh * 0.38, 10, x + w / 2, y + hh * 0.45, hh * 0.75);
    gr.addColorStop(0, '#fffdf6'); gr.addColorStop(0.7, '#f3e6c8'); gr.addColorStop(1, '#e7d3a6');
    rr(x, y, w, hh, 26); g.fillStyle = gr; g.fill();
    g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.stroke();
    g.textAlign = 'center';
    g.fillStyle = BLUE; g.font = F(22); g.fillText('まきこんだ！', x + w / 2, y + 36);
    const it = h.item;
    if (it) {
      g.fillStyle = INK; fit(it.name || '', w - 28, short ? 26 : 32); g.fillText(it.name || '', x + w / 2, y + hh - (short ? 40 : 62));
      g.fillStyle = BROWN; fit(it.meta || '', w - 28, 20, 500); g.fillText(it.meta || '', x + w / 2, y + hh - (short ? 14 : 26));
    } else {
      g.fillStyle = GREY; g.font = F(24, 500);
      g.fillText('ちいさな物から', x + w / 2, y + hh / 2);
      g.fillText('まきこもう！', x + w / 2, y + hh / 2 + 36);
    }
    g.textAlign = 'left';
  }

  function drawErrand(list) {
    const x = CARD.x, y = 328, w = CARD.w, hh = 224;
    rr(x, y, w, hh, 22); g.fillStyle = '#fff'; g.fill();
    g.fillStyle = BLUE; g.font = F(21); g.fillText('おつかい リスト', x + 16, y + 32);
    for (let i = 0; i < list.length && i < 6; i++) {
      const e = list[i], ly = y + 66 + i * 30;
      // checkbox
      rr(x + 16, ly - 19, 22, 22, 5);
      if (e.done) {
        g.fillStyle = GREEN; g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 3.5;
        g.beginPath(); g.moveTo(x + 21, ly - 8); g.lineTo(x + 26, ly - 3); g.lineTo(x + 34, ly - 14); g.stroke();
      } else { g.strokeStyle = GREY; g.lineWidth = 2.5; g.stroke(); }
      g.fillStyle = e.done ? GREY : INK;
      fit(e.name || '', w - 70, 22);
      g.fillText(e.name || '', x + 48, ly);
      if (e.done) {
        const tw = g.measureText(e.name || '').width;
        g.strokeStyle = GREY; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 48, ly - 8); g.lineTo(x + 48 + tw, ly - 8); g.stroke();
      }
    }
  }

  function drawResult(h) {
    const cx = HUD_W / 2, res = h.result;
    g.textAlign = 'center';
    g.fillStyle = RED; fit(res.title || '', HUD_W - 100, 64); g.fillText(res.title || '', cx, 118);
    g.fillStyle = INK; g.font = F(30, 800);
    const lines = wrap(res.desc || '', HUD_W - 140, 3);
    lines.forEach((ln, i) => g.fillText(ln, cx, 176 + i * 42));
    g.textAlign = 'left';
    // size and count, centred
    g.font = F(30);
    const a = `いまの大きさ ${h.size || ''}`, b = `まきこんだ数 ${h.count || ''}`;
    const wa = g.measureText(a).width + 36, wb = g.measureText(b).width + 36;
    let x = cx - (wa + wb + 16) / 2;
    x = pill(x, 330, a, 30, INK, 'rgba(255,210,63,0.55)') + 16;
    pill(x, 330, b, 30, INK, 'rgba(29,36,51,0.08)');
    if (h.ceo && h.ceo.text) drawCeo(90, 404, HUD_W - 180 - 10, h.ceo);
    g.textAlign = 'right'; g.fillStyle = BROWN; g.font = F(20, 500);
    g.fillText('A / X ボタンで VR を おわる', HUD_W - 30, 40);
    g.textAlign = 'left';
  }

  const api = {
    get active() { return active; },
    get supported() { return supported; },
    get viewScale() { return active ? VIEW_SCALE : 1; },
    /** main.js multiplies the ball's max speed by this: comfort mode is a bit slower, and the dash eases in */
    get speedScale() {
      if (!active) return 1;
      return ((comfort ? COMFORT_SPEED : 1) * (1 + (DASH_K - 1) * dashRamp)) / (dashHeld ? DASH_K : 1);
    },
    get comfort() { return comfort; },
    setComfort,
    get vignette() { return vigMesh.visible ? vig.v : 0; },
    onSupported(cb) { supportCbs.push(cb); if (supported !== null) { try { cb(supported); } catch (e) { console.warn(e); } } },
    enter, exit, readInput, update, recenter,
    /** debug / tests: draw a HUD snapshot into the panel canvas now and return the canvas */
    _drawHud(h) { drawHud(h); tex.needsUpdate = true; return cv; },
  };
  hudRoot.userData.vr = api; // debug / tests: camera.parent.getObjectByName('vr-hud-root').userData.vr
  return api;
}
