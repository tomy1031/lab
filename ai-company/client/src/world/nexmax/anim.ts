// 出典：tomy1031/nexmax_chronicle（web/src/world/nexmax/anim.ts）から流用。ネクマックスの 3D モデル（コードで組んだ部品＋手続きアニメーション）。
// ネクマックスの手続きアニメーション：ポーズごとに関節角を計算し、重みでなめらかに混ぜる。
// 角度の向き（キャラは -Z を向く）：
//  - 腕・脚の X 回転 + は前へ振る、Z 回転 + は外へ開く（左右とも。左は適用時に符号を反転）
//  - 肘 + は曲げる（前腕が前へ）、膝 + は曲げる（すねが後ろへ）、足首 + はつま先が上
//  - 胴・頭の X 回転 + は後ろへ反る／上を向く、Y 回転 + は左を向く
import { J } from './body'

export const PARAM_KEYS = [
  'bodyY',
  'bodyZ',
  'bodyPitch',
  'bodyRoll',
  'pivotX',
  'pivotY',
  'squash',
  'hipsY',
  'hipsX',
  'hipsPitch',
  'hipsRoll',
  'hipsYaw',
  'torsoPitch',
  'torsoRoll',
  'torsoYaw',
  'headPitch',
  'headRoll',
  'headYaw',
  'rShX',
  'rShY',
  'rShZ',
  'rEl',
  'rHandX',
  'rHandZ',
  'lShX',
  'lShY',
  'lShZ',
  'lEl',
  'lHandX',
  'lHandZ',
  'rHipX',
  'rHipY',
  'rHipZ',
  'rKnee',
  'rAnk',
  'lHipX',
  'lHipY',
  'lHipZ',
  'lKnee',
  'lAnk',
  /** 右腕を狙い（setAim）へ向ける重み */
  'aim',
  /** 狙いの方向を体の外側へずらす量（大きな頭に腕が隠れないように） */
  'aimSide',
  /** 頭を狙いへ向ける重み */
  'look',
  /** 左手を右の前腕に添える重み */
  'brace',
  /** 手を握る（0..1） */
  'fist',
] as const
export type ParamKey = (typeof PARAM_KEYS)[number]
export type Params = Record<ParamKey, number>

export function zeroParams(): Params {
  const p = {} as Params
  for (const k of PARAM_KEYS) p[k] = 0
  p.squash = 1
  return p
}

export function clearParams(p: Params): Params {
  for (const k of PARAM_KEYS) p[k] = 0
  p.squash = 1
  return p
}

export function addWeighted(out: Params, p: Params, w: number): void {
  for (const k of PARAM_KEYS) out[k] += p[k] * w
}

export type NexmaxPose = 'idle' | 'walk' | 'run' | 'dash' | 'jump' | 'fall' | 'land' | 'swing' | 'pulled' | 'fire' | 'hold' | 'crank' | 'wave' | 'punch' | 'punchL' | 'hurt' | 'sit'
export const ALL_POSES: NexmaxPose[] = ['idle', 'walk', 'run', 'dash', 'jump', 'fall', 'land', 'swing', 'pulled', 'fire', 'hold', 'crank', 'wave', 'punch', 'punchL', 'hurt', 'sit']

/** 混ぜる単位。idle / walk / run は速さで連続的に変わる「地上」1 つにまとめる */
export type Slot = 'ground' | 'dash' | 'jump' | 'fall' | 'land' | 'swing' | 'pulled' | 'fire' | 'hold' | 'crank' | 'wave' | 'punch' | 'punchL' | 'hurt' | 'sit'
export const SLOTS: Slot[] = ['ground', 'dash', 'jump', 'fall', 'land', 'swing', 'pulled', 'fire', 'hold', 'crank', 'wave', 'punch', 'punchL', 'hurt', 'sit']
export function slotOf(p: NexmaxPose): Slot {
  return p === 'idle' || p === 'walk' || p === 'run' ? 'ground' : p
}
/** 切り替えの速さ（秒：指数減衰の時定数） */
export const SLOT_TAU: Record<Slot, number> = {
  ground: 0.16,
  dash: 0.14,
  jump: 0.07,
  fall: 0.2,
  land: 0.035,
  swing: 0.14,
  pulled: 0.1,
  fire: 0.06,
  hold: 0.12,
  crank: 0.2,
  wave: 0.2,
  punch: 0.035,
  punchL: 0.035,
  hurt: 0.04,
  sit: 0.22,
}

export type Ctx = {
  /** 全体の時間 */
  t: number
  /** このポーズになってからの時間 */
  pt: number
  /** なめらかにした水平の速さ */
  speed: number
  /** 歩行周期の位相（0..1） */
  phase: number
  swing: number
  swingVel: number
  hasAim: boolean
  /** 待機中の視線（ランダム） */
  lookYaw: number
  lookPitch: number
}

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x)
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
const TAU = Math.PI * 2

// ------------------------------------------------------------------ 脚の 2 関節 IK（矢状面）

const L1 = J.thighLen
const L2 = J.shinLen
const LMAX = L1 + L2

/**
 * 足首の目標（股関節から見た z, y。y は下が負）に届くよう、股関節・膝・足首の角度を入れる。
 * footPitch: 地面に対する足の傾き（+ でつま先が上）。tilt: 体全体の前後の傾き（股関節角から差し引く）
 */
export function legIK(p: Params, side: 'r' | 'l', z: number, y: number, footPitch: number, tilt: number): void {
  let d = Math.hypot(z, y)
  d = clamp(d, 0.06, LMAX - 0.0005)
  const cosK = clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1)
  const knee = Math.PI - Math.acos(cosK)
  const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1)
  const toTarget = Math.atan2(-z, -y)
  const hip = toTarget + Math.acos(cosA)
  const hipKey = side === 'r' ? 'rHipX' : 'lHipX'
  const kneeKey = side === 'r' ? 'rKnee' : 'lKnee'
  const ankKey = side === 'r' ? 'rAnk' : 'lAnk'
  p[hipKey] = hip - tilt
  p[kneeKey] = knee
  // 足の向き：太もも角 - 膝角 が脚全体の傾き → 足首で打ち消して footPitch に
  p[ankKey] = -(hip - knee) + footPitch
}

/** 股関節（モデル座標の高さ） */
const HIP_Y = J.hip.y
/** 立っているときの足首の高さ */
const ANKLE_Y = J.ankleY

/** 両足の位置（股関節の前後 z、足首の高さ y）から IK。腰の高さ hipsY・前後の傾き tilt を考慮 */
function standIK(p: Params, zl: number, yl: number, pl: number, zr: number, yr: number, pr: number, tilt = 0): void {
  const hipAbs = HIP_Y + p.hipsY + p.bodyY
  // 脚を外へ開いた分だけ縦の届く長さが縮むので補正
  legIK(p, 'l', zl, (ANKLE_Y + yl - hipAbs) / Math.cos(p.lHipZ), pl, tilt)
  legIK(p, 'r', zr, (ANKLE_Y + yr - hipAbs) / Math.cos(p.rHipZ), pr, tilt)
}

// ------------------------------------------------------------------ 地上（待機 → 歩き → 走り）

type Gait = { z: number; lift: number; pitch: number; stance: boolean; k: number }

function gait(u: number, halfStride: number, liftH: number, stanceFrac: number): Gait {
  if (u < stanceFrac) {
    const k = u / stanceFrac
    return { z: -halfStride + 2 * halfStride * k, lift: 0, pitch: 0.18 * Math.pow(1 - k, 4) - 0.32 * Math.pow(k, 5), stance: true, k }
  }
  const k = (u - stanceFrac) / (1 - stanceFrac)
  const e = k * k * (3 - 2 * k)
  return {
    z: halfStride - 2 * halfStride * e,
    lift: liftH * Math.pow(Math.sin(Math.PI * k), 0.85),
    pitch: -0.4 * Math.pow(1 - k, 2) + 0.22 * Math.pow(k, 3),
    stance: false,
    k,
  }
}

/** 速さから歩行周期の周波数（周/秒） */
export function strideFreq(speed: number): number {
  return clamp(1.45 + 0.5 * speed, 1.6, 4.6)
}

export function evalGround(p: Params, c: Ctx, dashStyle = false): void {
  clearParams(p)
  const s = c.speed
  const walkW = smooth(0.12, 1.1, s)
  const runW = dashStyle ? 1 : smooth(3.7, 5.0, s)
  const breath = Math.sin(c.t * TAU * 0.32)
  const idleW = 1 - walkW

  // --- 待機の揺れ
  const sway = Math.sin(c.t * 0.83)
  p.hipsX = idleW * 0.006 * sway
  p.hipsRoll = idleW * 0.02 * sway
  p.torsoRoll = idleW * -0.025 * sway
  p.torsoPitch = idleW * 0.018 * breath
  p.headYaw = idleW * c.lookYaw
  p.headPitch = idleW * (c.lookPitch + 0.025 * Math.sin(c.t * 1.1))
  p.headRoll = idleW * (0.05 * Math.sin(c.t * 0.47) + c.lookYaw * 0.18)
  p.hipsY = idleW * (-0.007 + 0.0028 * breath)
  // 見本の A ポーズ：腕を外へ開き、手の甲を前へ（親指は体側）
  p.rShZ = lerp(0.3, 0.56, idleW) + idleW * 0.015 * breath
  p.lShZ = lerp(0.3, 0.56, idleW) + idleW * 0.015 * breath
  p.rShX = 0.05
  p.lShX = 0.05
  p.rShY = lerp(0.35, 1.25, idleW)
  p.lShY = lerp(0.35, 1.25, idleW)
  // 手の甲を前へひねっているので、肘を曲げると前腕が内へ寄る → 待機ではほぼ伸ばす
  p.rEl = lerp(0.24, 0.07, idleW) + idleW * 0.02 * breath
  p.lEl = lerp(0.24, 0.07, idleW) + idleW * 0.02 * breath
  p.rHandZ = idleW * -0.12
  p.lHandZ = idleW * -0.12
  p.rHipZ = 0.16
  p.lHipZ = 0.16
  p.rHipY = 0.08
  p.lHipY = 0.08
  p.fist = 0.1

  // --- 歩行
  const f = strideFreq(s)
  const stanceFrac = lerp(0.6, 0.36, runW)
  const half = Math.min(dashStyle ? 0.19 : lerp(0.15, 0.19, runW), (s * stanceFrac) / f / 2 + 0.01) * walkW
  const lift = (lerp(0.055, 0.1, runW) + (dashStyle ? 0.02 : 0)) * walkW
  const gl = gait(c.phase % 1, half, lift, stanceFrac)
  const gr = gait((c.phase + 0.5) % 1, half, lift, stanceFrac)
  // 立脚の膝を少し曲げたまま届く高さに腰を置く（歩くと自然に上下する）
  const ext = LMAX * lerp(0.975, 0.9, runW)
  const zSt = gl.stance ? gl.z : gr.stance ? gr.z : 0
  const flight = !gl.stance && !gr.stance
  const hipH = Math.sqrt(Math.max(0.01, ext * ext - zSt * zSt))
  let hy = hipH - (HIP_Y - ANKLE_Y)
  if (flight) hy += 0.022 * runW
  p.hipsY = lerp(p.hipsY, hy, walkW)
  const fwdL = half > 1e-4 ? -gl.z / half : 0
  const fwdR = half > 1e-4 ? -gr.z / half : 0
  p.hipsYaw = 0.13 * walkW * (gl.z - gr.z) / Math.max(half, 1e-3) * 0.5
  p.torsoYaw = -p.hipsYaw * 1.7
  p.hipsRoll += walkW * 0.035 * (gl.stance ? -1 : 1) * Math.sin(Math.PI * (gl.stance ? gl.k : gr.k))
  p.torsoRoll += -p.hipsRoll * 0.6
  const lean = walkW * (0.06 + 0.24 * runW) + (dashStyle ? 0.36 : 0)
  p.torsoPitch -= lean
  p.bodyPitch = -(dashStyle ? 0.14 : 0.08 * runW) * walkW
  // 頭は胴の傾きを打ち消し、前を見る（かわいさのための反動）
  p.headPitch += lean * 0.7 + walkW * 0.035 * Math.sin(c.phase * TAU * 2) + (dashStyle ? 0.12 : 0)
  p.headYaw += -p.torsoYaw * 0.6
  p.headRoll += walkW * 0.03 * Math.sin(c.phase * TAU)
  // 腕：脚と逆位相
  const armAmp = lerp(0.55, 0.95, runW) * walkW
  if (dashStyle) {
    // 両腕を後ろへ流す
    p.rShX = lerp(p.rShX, -1.05 + 0.12 * fwdL, walkW)
    p.lShX = lerp(p.lShX, -1.05 + 0.12 * fwdR, walkW)
    p.rShZ = lerp(p.rShZ, 0.32, walkW)
    p.lShZ = lerp(p.lShZ, 0.32, walkW)
    p.rEl = lerp(p.rEl, 0.25, walkW)
    p.lEl = lerp(p.lEl, 0.25, walkW)
    p.rShY = 0.5
    p.lShY = 0.5
  } else {
    p.rShX += armAmp * fwdL
    p.lShX += armAmp * fwdR
    p.rEl += walkW * (0.12 + 1.0 * runW) + walkW * 0.12 * Math.max(0, fwdL)
    p.lEl += walkW * (0.12 + 1.0 * runW) + walkW * 0.12 * Math.max(0, fwdR)
    p.rShZ -= walkW * 0.1
    p.lShZ -= walkW * 0.1
  }
  p.fist = lerp(p.fist, 0.5, runW)
  // 脚を狭めて内股にならないよう
  p.rHipZ = lerp(p.rHipZ, 0.05, walkW)
  p.lHipZ = lerp(p.lHipZ, 0.05, walkW)
  p.rHipY = lerp(p.rHipY, 0.03, walkW)
  p.lHipY = lerp(p.lHipY, 0.03, walkW)
  // 走りの弾み（つぶれ）
  p.squash = 1 + walkW * (0.012 + 0.02 * runW) * Math.cos(c.phase * TAU * 2)
  standIK(p, gl.z, gl.lift, gl.pitch * walkW, gr.z, gr.lift, gr.pitch * walkW, p.hipsPitch + p.bodyPitch)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// ------------------------------------------------------------------ 空中

export function evalJump(p: Params, c: Ctx): void {
  clearParams(p)
  const t = c.pt
  // かがむ → 伸びる → 戻る
  const stretch = smooth(0, 0.07, t) * Math.exp(-Math.max(0, t - 0.07) * 4.5)
  p.squash = 1 - 0.09 * (1 - smooth(0, 0.06, t)) + 0.13 * stretch
  const up = smooth(0, 0.12, t)
  p.rShX = lerp(0.3, 2.3, up)
  p.lShX = lerp(0.3, 2.1, up)
  p.rShZ = lerp(0.35, 0.85, up)
  p.lShZ = lerp(0.35, 0.95, up)
  p.rEl = 0.3
  p.lEl = 0.4
  p.rShY = -0.3
  p.lShY = -0.3
  p.torsoPitch = 0.08 * up
  p.headPitch = 0.18 * up
  p.hipsY = -0.01
  // 片ひざを上げる
  p.lHipX = 1.0 * up
  p.lKnee = 1.45 * up
  p.lAnk = -0.3
  p.rHipX = -0.18
  p.rKnee = 0.35 + 0.2 * up
  p.rAnk = -0.45
  p.rHipZ = 0.04
  p.lHipZ = 0.06
  p.fist = 0.3
}

export function evalFall(p: Params, c: Ctx): void {
  clearParams(p)
  const t = c.t
  const flail = Math.sin(t * 8.5)
  p.squash = 1.02
  p.rShZ = 1.25 + 0.15 * flail
  p.lShZ = 1.25 - 0.15 * flail
  p.rShX = 0.45 + 0.15 * Math.sin(t * 7.3)
  p.lShX = 0.45 - 0.15 * Math.sin(t * 7.3)
  p.rEl = 0.55
  p.lEl = 0.55
  p.rShY = -0.5
  p.lShY = -0.5
  p.torsoPitch = -0.12
  p.headPitch = -0.12
  p.rHipX = 0.3 + 0.25 * Math.sin(t * 6.2)
  p.lHipX = 0.3 - 0.25 * Math.sin(t * 6.2)
  p.rKnee = 0.55 + 0.25 * Math.sin(t * 6.2 + 1)
  p.lKnee = 0.55 - 0.25 * Math.sin(t * 6.2 + 1)
  p.rAnk = -0.35
  p.lAnk = -0.35
  p.rHipZ = 0.1
  p.lHipZ = 0.1
  p.fist = 0
}

export function evalLand(p: Params, c: Ctx): void {
  clearParams(p)
  const t = c.pt
  const k = Math.exp(-t * 9)
  p.squash = 1 - 0.24 * k * Math.cos(t * 13)
  p.hipsY = -0.075 * k - 0.005
  p.torsoPitch = -0.22 * k
  p.headPitch = 0.14 * k
  p.rShX = 0.55 * k + 0.05
  p.lShX = 0.55 * k + 0.05
  p.rShZ = 0.3 + 0.55 * k
  p.lShZ = 0.3 + 0.55 * k
  p.rEl = 0.3 + 0.3 * k
  p.lEl = 0.3 + 0.3 * k
  p.rShY = -0.15
  p.lShY = -0.15
  p.rHipZ = 0.07
  p.lHipZ = 0.07
  p.rHipY = 0.08
  p.lHipY = 0.08
  standIK(p, -0.015, 0, 0, 0.015, 0, 0)
}

// ------------------------------------------------------------------ ワイヤー

/** 振り子：右腕を真上（支点）へ、体はぶら下がって脚が遅れてついてくる */
export function evalSwing(p: Params, c: Ctx): void {
  clearParams(p)
  const v = clamp(c.swingVel, -3, 3)
  // 大きな頭に隠れないよう、腕は真上ではなく外へ。体は手（右上）の下へぶら下がり、頭は左へ逃げる
  p.aim = c.hasAim ? 0.92 : 0
  p.aimSide = 0.75
  p.pivotX = 0.42
  p.pivotY = 1.0
  p.bodyPitch = c.swing
  p.bodyRoll = 0.3
  p.squash = 1.04
  p.rShX = 2.6
  p.rShZ = 1.0
  p.rEl = 0.05
  p.lShZ = 0.95
  p.lShX = 0.35 + v * 0.12
  p.lEl = 0.45
  p.torsoPitch = -v * 0.07
  p.torsoRoll = 0.04
  p.headPitch = 0.1 - v * 0.06
  p.headRoll = 0.1
  const trail = clamp(-v * 0.3, -0.75, 0.75)
  const kick = Math.sin(c.t * 3.1) * 0.12
  p.rHipX = 0.18 + trail + kick
  p.lHipX = 0.32 + trail - kick
  p.rKnee = 0.45 + Math.abs(trail) * 0.4 + kick
  p.lKnee = 0.65 + Math.abs(trail) * 0.4 - kick
  p.rAnk = -0.4
  p.lAnk = -0.4
  p.rHipZ = 0.12
  p.lHipZ = 0.06
  p.fist = 0.8
}

/** 引き寄せられて飛ぶ：右腕を対象へ、体は伸びて脚が後ろへなびく */
export function evalPulled(p: Params, c: Ctx): void {
  clearParams(p)
  p.aim = c.hasAim ? 1 : 0
  p.aimSide = 0.18
  p.look = c.hasAim ? 0.8 : 0
  p.pivotY = 0.95
  p.bodyPitch = -0.5
  p.squash = 1.08
  p.rShX = Math.PI / 2 + 0.3
  p.rEl = 0.05
  p.lShX = -0.85
  p.lShZ = 0.35
  p.lEl = 0.35
  p.lShY = 0.4
  p.torsoPitch = 0.1
  p.headPitch = 0.3
  const flutter = Math.sin(c.t * 14) * 0.06
  p.rHipX = -0.55 + flutter
  p.lHipX = -0.35 - flutter
  p.rKnee = 0.55 - flutter
  p.lKnee = 0.85 + flutter
  p.rAnk = -0.6
  p.lAnk = -0.6
  p.rHipZ = 0.08
  p.lHipZ = 0.08
  p.fist = 0.8
}

/** 射出：右腕を狙いへ素早く突き出し、反動で少しのけぞる */
export function evalFire(p: Params, c: Ctx): void {
  clearParams(p)
  const t = c.pt
  const punch = smooth(0, 0.075, t)
  const recoil = smooth(0.06, 0.1, t) * Math.exp(-Math.max(0, t - 0.1) * 7)
  p.aim = c.hasAim ? punch : 0
  // 真上に近い対象のときだけ効く（頭を避ける）。ふつうは肩から対象へまっすぐ
  p.aimSide = 0.3
  p.look = c.hasAim ? 1 : 0
  p.rShX = lerp(0.6, Math.PI / 2, punch)
  p.rShZ = 0.12
  p.rEl = lerp(1.2, 0.0, punch) + 0.35 * recoil
  p.torsoYaw = -0.08 + 0.1 * recoil
  p.torsoPitch = -0.04 + 0.12 * recoil
  p.bodyPitch = 0.05 * recoil
  p.squash = 1 - 0.04 * recoil
  p.headPitch = 0.05
  p.lShX = -0.55
  p.lShZ = 0.4
  p.lEl = 0.7
  p.lShY = 0.2
  p.hipsY = -0.025
  p.hipsYaw = -0.04
  p.rHipZ = 0.06
  p.lHipZ = 0.06
  p.fist = 0.6
  standIK(p, -0.075, 0, 0.05, 0.065, 0, -0.05)
}

/** 保持：右腕を対象へ伸ばしたまま、左手を添えて踏ん張る（小刻みに震える） */
export function evalHold(p: Params, c: Ctx): void {
  clearParams(p)
  const t = c.t
  const shake = Math.sin(t * 37) * 0.012 + Math.sin(t * 23.3) * 0.008
  p.aim = c.hasAim ? 1 : 0
  p.aimSide = 0.3
  p.look = c.hasAim ? 0.9 : 0
  p.brace = 1
  p.rShX = Math.PI / 2
  p.rShZ = 0.1
  p.lShX = 1.25
  p.lShZ = -0.35
  p.lEl = 0.9
  p.torsoYaw = -0.1 + shake
  p.torsoPitch = 0.1 + shake * 0.6
  p.torsoRoll = shake
  p.bodyPitch = 0.14
  p.hipsY = -0.045 + Math.abs(shake) * 0.3
  p.hipsYaw = -0.05
  p.headPitch = -0.04
  p.headRoll = 0.06 + shake
  p.rHipZ = 0.08
  p.lHipZ = 0.08
  p.fist = 0.8
  standIK(p, -0.1, 0, 0.12, 0.06, 0, -0.08, p.bodyPitch)
}

// ------------------------------------------------------------------ 仕草

export function evalCrank(p: Params, c: Ctx): void {
  clearParams(p)
  const a = c.t * TAU * 0.75
  p.rShX = 1.25 + 0.3 * Math.sin(a)
  p.lShX = 1.25 + 0.3 * Math.sin(a)
  p.rShZ = -0.15
  p.lShZ = -0.15
  p.rEl = 0.55 - 0.35 * Math.cos(a)
  p.lEl = 0.55 - 0.35 * Math.cos(a)
  p.torsoPitch = -0.22 - 0.05 * Math.cos(a)
  p.torsoYaw = 0.05 * Math.sin(a)
  p.headPitch = 0.12
  p.hipsY = -0.04
  p.fist = 0.9
  standIK(p, -0.07, 0, 0, 0.06, 0, 0)
}

export function evalWave(p: Params, c: Ctx): void {
  clearParams(p)
  const t = c.t
  const breath = Math.sin(t * TAU * 0.32)
  p.rShZ = 2.45
  p.rShX = -0.2
  p.rShY = -1.2
  p.rEl = 0.55 + 0.4 * Math.sin(t * 8)
  p.rHandZ = 0.15 * Math.sin(t * 8 - 0.6)
  p.lShZ = 0.3
  p.lShX = 0.05
  p.lEl = 0.25
  p.torsoRoll = -0.04 + 0.03 * Math.sin(t * 2)
  p.headRoll = 0.12 + 0.05 * Math.sin(t * 2 + 0.5)
  p.headPitch = 0.06
  p.hipsY = -0.007 + 0.002 * breath
  p.rHipZ = 0.055
  p.lHipZ = 0.055
  p.fist = 0
  standIK(p, 0, 0, 0, 0, 0, 0)
}

/**
 * 攻撃（K）：拳を引いて溜め → 体をひねって突き出す → 戻す。left で左手（2 段目）。
 * 左腕の値は右と同じ向き（リグ側で Y・Z を反転して当てる）
 */
export function evalPunch(p: Params, c: Ctx, left = false): void {
  clearParams(p)
  const t = c.pt
  const wind = smooth(0, 0.06, t)
  const hit = smooth(0.05, 0.12, t)
  const back = smooth(0.22, 0.45, t)
  const k = hit * (1 - back * 0.7)
  const shX = lerp(lerp(0.45, -0.25, wind), Math.PI / 2 - 0.08, k)
  const el = lerp(lerp(1.0, 1.7, wind), 0.06, k)
  if (!left) {
    p.rShX = shX
    p.rShZ = 0.14
    p.rEl = el
    p.lShX = 0.55
    p.lShZ = 0.3
    p.lEl = 1.35
  } else {
    p.lShX = shX
    p.lShZ = 0.14
    p.lEl = el
    p.rShX = 0.55
    p.rShZ = 0.3
    p.rEl = 1.35
  }
  // 打つ手と反対へ体をひねる（右で打つときは左肩が引ける）
  const twist = (left ? 1 : -1) * (lerp(-0.2 * wind, 0.38, k))
  p.torsoYaw = twist
  p.hipsYaw = twist * 0.35
  p.torsoPitch = 0.1 * k
  p.bodyPitch = 0.07 * k
  p.headPitch = 0.04
  p.hipsY = -0.035
  p.rHipZ = 0.08
  p.lHipZ = 0.08
  p.fist = 1
  // 前後に開いた構え（打つ手と同じ側の足を引く）
  if (left) standIK(p, -0.08, 0, 0.04, 0.1, 0, -0.04)
  else standIK(p, 0.1, 0, -0.04, -0.08, 0, 0.04)
}

/** 当たった：体が後ろへ揺れる */
export function evalHurt(p: Params, c: Ctx): void {
  clearParams(p)
  // 大きくのけぞって、両うでがばんざいのように開く（当たったのが、はっきりわかるように）
  const k = Math.exp(-c.pt * 3.2)
  p.torsoPitch = -0.6 * k
  p.bodyPitch = -0.28 * k
  p.headPitch = -0.45 * k
  p.rShX = 0.9 * k + 0.3
  p.rShZ = 1.0 * k + 0.2
  p.rEl = 0.6
  p.lShX = 0.9 * k + 0.3
  p.lShZ = 1.0 * k + 0.2
  p.lEl = 0.6
  p.hipsY = -0.04
  p.rHipZ = 0.08
  p.lHipZ = 0.08
  p.squash = 1 - 0.06 * k
  standIK(p, 0.06, 0, 0, -0.04, 0, 0)
}

export function evalSlot(slot: Slot, p: Params, c: Ctx): void {
  switch (slot) {
    case 'ground':
      return evalGround(p, c, false)
    case 'dash':
      return evalGround(p, c, true)
    case 'jump':
      return evalJump(p, c)
    case 'fall':
      return evalFall(p, c)
    case 'land':
      return evalLand(p, c)
    case 'swing':
      return evalSwing(p, c)
    case 'pulled':
      return evalPulled(p, c)
    case 'fire':
      return evalFire(p, c)
    case 'hold':
      return evalHold(p, c)
    case 'crank':
      return evalCrank(p, c)
    case 'wave':
      return evalWave(p, c)
    case 'punch':
      return evalPunch(p, c, false)
    case 'punchL':
      return evalPunch(p, c, true)
    case 'hurt':
      return evalHurt(p, c)
    case 'sit':
      return evalSit(p, c)
  }
}

/**
 * すわる（ベンチ・段など）：root を座面の高さに置くと、腰が座面にのり、太ももは前へ、すねは下へたれる。
 * 少し前かがみで下を向き、手はひざの上（4 章の「すわりこむ」）
 */
export function evalSit(p: Params, c: Ctx): void {
  clearParams(p)
  const breath = Math.sin(c.t * TAU * 0.26)
  p.bodyY = -(HIP_Y - 0.07)
  p.torsoPitch = -0.16 - 0.012 * breath
  p.headPitch = 0.2 + 0.02 * Math.sin(c.t * 0.5)
  p.headRoll = 0.03 * Math.sin(c.t * 0.37)
  p.rShX = 0.62
  p.lShX = 0.62
  p.rShZ = 0.22
  p.lShZ = 0.22
  p.rShY = 0.2
  p.lShY = 0.2
  p.rEl = 0.55
  p.lEl = 0.55
  p.rHandZ = -0.1
  p.lHandZ = -0.1
  p.rHipZ = 0.1
  p.lHipZ = 0.1
  p.fist = 0.15
  // 太ももをほぼ水平に前へ、すねは下へ（足は座面からたれる）
  legIK(p, 'l', -L1 * 0.97, -L2 * 0.92, 0.1, 0)
  legIK(p, 'r', -L1 * 0.97, -L2 * 0.92, 0.1, 0)
}
