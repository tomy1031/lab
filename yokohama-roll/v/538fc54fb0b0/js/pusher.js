// NexMax (ネクマックス) as the player character: stands behind the ball, feet on the ground, leaning in
// with both hands on the ball's back, and walks / runs / dashes at the ball's ground speed.
//
//   import { createPusher } from './pusher.js';
//   const pusher = createPusher(); scene.add(pusher.root);
//   pusher.update(dt, { pos, r, heading, up, speed, dash, bumped, cheer });   // once per frame
//
// The character is sized to the ball (height = 1.1 × diameter), never to the world, so it works the
// same from a 30 cm ball in the city to a planet-sized one. All solving happens in the model's own
// units (natural height 1.2, feet at the origin, facing -Z, +X = its right), where the ball is always
// the same size; the root's scale maps that onto the world.
import * as THREE from 'three';
import { createNexmax, NEXMAX_JOINTS as J, setOutlineViewport } from './vendor/nexmax.js';

export { setOutlineViewport };

/** model units: the source's natural height */
const NAT_H = 1.2;
/** character height / ball diameter */
const HEIGHT_K = 0.9; // a bit smaller than the ball so the game camera still sees the ball over the helmet
/** ball radius in model units (constant because the character scales with the ball) */
const RM = NAT_H / (2 * HEIGHT_K);
/** how much of the arm's reach is used when pushing (elbows a little bent) */
const REACH_USE = 0.86;
/** forward bend of the torso while pushing (rad); dash adds a little */
const PUSH_LEAN = 0.22;
const DASH_LEAN = 0.08;
/** head pitched up (rad) so it looks ahead over the ball and its big helmet stays back */
const HEAD_UP = 0.18;
/** gap between helmet and ball (model units) */
const HEAD_GAP = 0.025;
/** wrist target = ball surface + PALM × hand length (the hand reaches past the wrist) */
const PALM = 0.45;
/** wrist bent back (rad) so the palm meets the ball */
const WRIST_X = -0.5;
/** which way the elbow bends out of the shoulder→hand line (sign of the extra shoulder turn) */
const ELBOW_SIGN = -1;
/** cheer hop height (model units) */
const HOP_H = 0.13;
/** above this foot speed (model units/s) the gait can't stride any longer: play it faster instead */
const TIME_SCALE_MAX = 3;
const HURT_TIME = 0.55;
const HOP_TIME = 0.42;
const HOPS = 2;
const CHEER_TIME = 2.0;

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Ground speed of a planted foot for the source gait at animation speed s (anim.ts evalGround,
 * non-dash): stride 2·half over stanceFrac/f seconds. The gait caps its stride, so this flattens out
 * (≈ 0.95 at s=1, 1.5 at s=3, 4.86 at s≥6.3).
 */
function footSpeed(s) {
  const walkW = smooth(0.12, 1.1, s);
  const runW = smooth(3.7, 5.0, s);
  const f = clamp(1.45 + 0.5 * s, 1.6, 4.6);
  const sf = lerp(0.6, 0.36, runW);
  const half = Math.min(lerp(0.15, 0.19, runW), (s * sf) / f / 2 + 0.01) * walkW;
  return (2 * half * f) / sf;
}
// inverse table: foot speed → animation speed (footSpeed is monotonic on [0, 6.3])
const FS_N = 128;
const FS_SMAX = 6.3;
const FS_TABLE = new Float32Array(FS_N + 1);
for (let i = 0; i <= FS_N; i++) FS_TABLE[i] = footSpeed((i / FS_N) * FS_SMAX);
const FS_MAX = FS_TABLE[FS_N];
function animSpeedFor(fs) {
  if (fs <= 0) return 0;
  if (fs >= FS_MAX) return FS_SMAX;
  let lo = 0, hi = FS_N;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (FS_TABLE[m] < fs) lo = m; else hi = m; }
  const a = FS_TABLE[lo], b = FS_TABLE[hi];
  return ((lo + (b > a ? (fs - a) / (b - a) : 0)) / FS_N) * FS_SMAX;
}

/** arm direction (in the shoulder's parent frame) → shoulder rotation; same convention as the source's armBasis */
function armBasis(dir, out, side, m, vx, vy, vz) {
  vy.copy(dir).negate();
  vx.set(1, 2 * dir.x * side, 0);
  vx.addScaledVector(vy, -vx.dot(vy));
  if (vx.lengthSq() < 1e-8) vx.set(0, 0, 1).addScaledVector(vy, -vy.z);
  vx.normalize();
  vz.crossVectors(vx, vy);
  m.makeBasis(vx, vy, vz);
  return out.setFromRotationMatrix(m);
}

export function createPusher() {
  const nx = createNexmax(NAT_H, { variant: 'protagonist' });
  nx.autoExpression = true; // hurt → surprised
  nx.setExpression('determined');
  nx.setOreGlow(1.2);

  const root = new THREE.Group();
  root.name = 'pusher';
  root.add(nx.root);
  nx.root.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });

  const get = (n) => {
    const o = nx.root.getObjectByName(n);
    if (!o) throw new Error('[pusher] nexmax part not found: ' + n);
    return o;
  };
  const torso = get('torso');
  const head = get('head');
  const arms = [
    { side: 1, sh: get('shoulderR'), el: get('elbowR'), wr: get('wristR'), hand: get('handR'), w: 1, wT: 1 },
    { side: -1, sh: get('shoulderL'), el: get('elbowL'), wr: get('wristL'), hand: get('handL'), w: 1, wT: 1 },
  ];
  const body = get('body');
  // hand length beyond the wrist pivot (open hand, along the forearm's -Y)
  const hg = arms[0].hand.geometry;
  hg.computeBoundingBox();
  const HAND_LEN = -hg.boundingBox.min.y;
  const ARM_LEN = J.upperLen + J.lowerLen;
  // the big helmet as a sphere in head space (front half-depth as radius) for keeping it out of the ball
  const hm = get('helmet').geometry;
  hm.computeBoundingBox();
  const HEAD_C = hm.boundingBox.getCenter(new THREE.Vector3());
  const HEAD_R = (hm.boundingBox.max.z - hm.boundingBox.min.z) / 2;

  /** torso / head pitch of the push (applied over the gait's own lean) */
  function pushPose(w, lean) {
    torso.rotation.x = lerp(torso.rotation.x, -lean, w);
    head.rotation.x = lerp(head.rotation.x, HEAD_UP, w);
  }

  // stand-off (model units, ball centre → feet along heading), from the pushing pose at rest:
  // far enough that the helmet clears the ball, close enough that the hands reach it
  nx.update(0, 0);
  pushPose(1, PUSH_LEAN);
  nx.root.updateMatrixWorld(true);
  const hc = head.localToWorld(HEAD_C.clone());
  const sh0 = arms[0].sh.getWorldPosition(new THREE.Vector3());
  const offFor = (p, rad) => Math.sqrt(Math.max(0, rad * rad - p.x * p.x - (p.y - RM) ** 2)) - p.z;
  const STAND_HEAD = offFor(hc, RM + HEAD_R + HEAD_GAP);
  const STAND_ARM = offFor(sh0, RM + HAND_LEN * PALM + ARM_LEN * REACH_USE);
  const STAND_OFF = Math.max(STAND_HEAD, STAND_ARM);

  // scratch (no per-frame allocation)
  const _fwd = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _base = new THREE.Vector3();
  const _qp = new THREE.Quaternion();
  const _m = new THREE.Matrix4();
  const _c = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _d = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _qb = new THREE.Quaternion();
  const _ax = new THREE.Vector3(1, 0, 0);
  const _bx = new THREE.Vector3();
  const _by = new THREE.Vector3();
  const _bz = new THREE.Vector3();
  const _m2 = new THREE.Matrix4();

  let hurtT = 0;
  let cheerT = 0;
  let pushW = 1;
  let extraOff = 0; // extra stand-off when a pose (run lean, hurt) would put the helmet into the ball
  let lastPose = '';
  let lastHop = -1;
  let banzaiW = 0;
  let visible = true;

  function setPose(p, restart = false) {
    if (restart && p === lastPose) nx.setPose(p === 'idle' ? 'wave' : 'idle');
    nx.setPose(p);
    lastPose = p;
  }

  /** two-bone IK: wrist of `a` to the ball surface nearest its shoulder, blended by a.w */
  function reachBall(a, ball, rWorld, scale) {
    if (a.w < 1e-3) return;
    a.sh.getWorldPosition(_s);
    _d.subVectors(_s, ball);
    const dl = _d.length() || 1;
    // wrist target: just outside the surface so the hand (which extends past the wrist) rests on it
    _c.copy(ball).addScaledVector(_d, (rWorld + HAND_LEN * PALM * scale) / dl);
    // into the shoulder's parent frame (the torso), relative to the shoulder
    torso.worldToLocal(_c).sub(a.sh.position);
    const D = _c.length();
    if (D < 1e-5) return;
    const Lu = J.upperLen, Ll = J.lowerLen;
    const d = Math.min(D, Lu + Ll - 1e-3);
    const beta = Math.PI - Math.acos(clamp((Lu * Lu + Ll * Ll - d * d) / (2 * Lu * Ll), -1, 1));
    const gamma = Math.acos(clamp((Lu * Lu + d * d - Ll * Ll) / (2 * Lu * d), -1, 1));
    _c.divideScalar(D);
    armBasis(_c, _q, a.side, _m2, _bx, _by, _bz);
    _qb.setFromAxisAngle(_ax, ELBOW_SIGN * gamma);
    _q.multiply(_qb);
    a.sh.quaternion.slerp(_q, a.w);
    a.el.rotation.x = lerp(a.el.rotation.x, beta, a.w);
    // wrist: bend the hand back so the palm, not the fingertips, meets the ball
    a.wr.rotation.x = lerp(a.wr.rotation.x, WRIST_X, a.w);
    a.wr.rotation.z = lerp(a.wr.rotation.z, 0, a.w);
  }

  function place(s, scale, H, hop) {
    const d = (STAND_OFF + extraOff) * scale;
    if (s.planetR) {
      // on the planet (centred on the origin) step back along the curved surface, not the tangent plane,
      // so the feet stay on the ground even when the ball is thousands of km wide
      _base.copy(s.pos).addScaledVector(_up, -s.r + hop * H);
      _qp.setFromAxisAngle(_right, d / Math.max(_base.length(), 1e-6));
      root.position.copy(_base).applyQuaternion(_qp);
      root.quaternion.premultiply(_qp);
    } else {
      root.position.copy(s.pos)
        .addScaledVector(_up, -s.r + hop * H)
        .addScaledVector(_fwd, -d);
    }
    root.scale.setScalar(scale);
  }

  function update(dtIn, s) {
    const dt = Math.max(0, Math.min(dtIn, 0.1));
    if (!visible) return;
    const H = 2 * s.r * HEIGHT_K;
    const scale = H / NAT_H;

    // --- events
    if (s.bumped) hurtT = HURT_TIME;
    if (s.cheer && cheerT <= 0) cheerT = CHEER_TIME;
    hurtT = Math.max(0, hurtT - dt);
    const cheering = cheerT > 0;
    if (cheering) cheerT = Math.max(0, cheerT - dt);
    // cheer: two little hops with the arms up (reads from behind, where the big helmet hides a wave),
    // then a wave with the left hand back on the ball
    const cheerAge = CHEER_TIME - cheerT;
    const hopN = cheering ? Math.floor(cheerAge / HOP_TIME) : HOPS;
    const hopping = hopN < HOPS;
    const u = hopping ? cheerAge / HOP_TIME - hopN : 0;
    const hop = hopping ? 4 * HOP_H * u * (1 - u) : 0;
    const newHop = hopping && hopN !== lastHop;
    lastHop = hopping ? hopN : -1;

    // --- gait: ground speed in the model's own units; pick the animation speed whose planted foot
    // moves at that speed, and play the clock faster once the stride can't get any longer
    const sNorm = Math.max(0, s.speed) / scale;
    const animSpeed = sNorm < 0.03 ? 0 : animSpeedFor(sNorm);
    const k = clamp(sNorm / FS_MAX, 1, TIME_SCALE_MAX);

    let pose = 'idle'; // the ground slot: idle → walk → run by speed
    let wR = 1, wL = 1;
    if (hurtT > 0) { pose = 'hurt'; wR = wL = 0; }
    else if (hopping) { pose = 'jump'; wR = wL = 0; }
    else if (cheering && sNorm < 0.4) { pose = 'wave'; wR = 0; } // left hand stays on the ball
    setPose(pose, (s.bumped && pose === 'hurt') || (newHop && pose === 'jump'));
    arms[0].wT = wR;
    arms[1].wT = wL;

    // --- frame: feet on the plane through the contact point, behind the ball along heading
    _up.copy(s.up).normalize();
    _fwd.copy(s.heading).addScaledVector(_up, -s.heading.dot(_up));
    if (_fwd.lengthSq() < 1e-10) _fwd.set(1, 0, 0).addScaledVector(_up, -_up.x);
    _fwd.normalize();
    _right.crossVectors(_fwd, _up); // model +X (its right)
    _bz.copy(_fwd).negate(); // model +Z points backward (the model faces -Z)
    _m.makeBasis(_right, _up, _bz);
    root.quaternion.setFromRotationMatrix(_m);
    extraOff *= Math.exp(-dt / 0.6);
    place(s, scale, H, hop);
    root.updateWorldMatrix(true, false);

    // --- animate, then lay the push over it
    nx.update(dt * k, animSpeed);
    const pushing = hurtT <= 0 && !hopping;
    pushW += ((pushing ? 1 : 0) - pushW) * (1 - Math.exp(-dt / 0.1));
    pushPose(pushW, PUSH_LEAN + (s.dash ? DASH_LEAN : 0));
    // hops: open the jump pose's raised arms into a V so they show past the helmet from behind
    banzaiW += ((hopping ? 1 : 0) - banzaiW) * (1 - Math.exp(-dt / 0.06));
    if (banzaiW > 1e-3) {
      const sr = arms[0].sh.rotation, sl = arms[1].sh.rotation;
      sr.set(lerp(sr.x, 0.35, banzaiW), lerp(sr.y, 0, banzaiW), lerp(sr.z, 2.55, banzaiW));
      sl.set(lerp(sl.x, 0.35, banzaiW), lerp(sl.y, 0, banzaiW), lerp(sl.z, -2.55, banzaiW));
    }
    nx.root.updateMatrixWorld(true);

    // keep the helmet out of the ball (run lean, hurt recoil, …): step back if needed
    head.localToWorld(_c.copy(HEAD_C)).sub(s.pos);
    const along = _c.dot(_fwd);
    const perp2 = Math.max(0, _c.lengthSq() - along * along);
    const req = s.r + (HEAD_R + HEAD_GAP) * scale;
    if (perp2 < req * req) {
      const need = (along + Math.sqrt(req * req - perp2)) / scale; // model units to move back
      if (need > 1e-4) {
        extraOff += need;
        place(s, scale, H, hop);
        root.updateMatrixWorld(true);
      }
    }

    const kk = 1 - Math.exp(-dt / 0.08);
    for (const a of arms) {
      a.w += (a.wT - a.w) * kk;
      reachBall(a, s.pos, s.r, scale);
    }
  }

  return {
    root,
    character: nx,
    update,
    setVisible(v) {
      visible = !!v;
      root.visible = visible;
    },
    stats: () => nx.stats(),
    /** model-unit layout, for tuning */
    info: { standOff: STAND_OFF, standHead: STAND_HEAD, standArm: STAND_ARM, handLen: HAND_LEN, headR: HEAD_R },
    dispose() {
      nx.dispose();
      root.removeFromParent();
    },
  };
}
