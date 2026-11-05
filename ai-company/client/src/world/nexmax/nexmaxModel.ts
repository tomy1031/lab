// 出典：tomy1031/nexmax_chronicle（web/src/world/nexmax/nexmaxModel.ts）から流用。ネクマックスの 3D モデル（コードで組んだ部品＋手続きアニメーション）。
// 主人公ネクマックス（初号機・アンテナなし）：コードで組んだ剛体パーツ＋手続きアニメーション。
// 見本：assets_src/reference/clean/nexmax_game_turnaround.png（正面・側面・背面）。
// 階層：root → scaler → body（つぶれ・傾き）→ hips → torso → head / 肩 → 肘 → 手首、hips → 股関節 → 膝 → 足首。
// 原点は足元、正面は -Z。右腕の前腕に NMClaw（ワイヤー射出器）：こぶしの正面（前腕の軸の延長上）の射出口が handAnchor（ローカル -Y がワイヤーの向き）。
// ドローコールは約 21（爪を出すと +2）、三角形は約 2.5 万（反転ハル輪郭線を含む）。
import * as THREE from 'three'
import type { Character, Pose } from '../characters'
import {
  ALL_POSES,
  addWeighted,
  clearParams,
  evalSlot,
  slotOf,
  SLOT_TAU,
  SLOTS,
  strideFreq,
  zeroParams,
  type Ctx,
  type NexmaxPose,
  type Params,
  type Slot,
} from './anim'
import {
  buildClawHub,
  buildClawProng,
  buildFoot,
  buildForearm,
  buildHand,
  buildOre,
  buildShin,
  buildThigh,
  buildTorso,
  buildUpperArm,
  J,
  torsoLogoUV,
} from './body'
import { merge as mergeGeos, withHull } from './geom'
import { buildEyes, buildFeatures, buildHelmet, buildPlate, EXPRESSIONS, EYE_CENTER_Y, HEAD_PIVOT_Y, type Expression } from './head'
import { createNexmaxMaterials, makeTorsoTexture, type NexmaxMaterials } from './materials'
import {
  PROD_COLORS,
  PROD_LIFT,
  PROD_PROPORTIONS,
  buildAntenna,
  buildHatch,
  buildLedEyes,
  createProductionMaterials,
  makeProductionTorsoTexture,
  paintProductionHelmet,
  recolorBody,
} from './production'

export type { NexmaxPose } from './anim'
export type NexmaxExpression = Expression
export { ALL_POSES as NEXMAX_POSES }

/** protagonist = 初号機（アンテナなし・背中に特殊鉱石・右腕に NMClaw）、production = 2086 年の量産型 */
export type NexmaxVariant = 'protagonist' | 'production'

export type NexmaxOptions = {
  variant?: NexmaxVariant
  /** 量産型の胸の製造番号（NX-086 など） */
  serial?: number
}

export interface NexmaxCharacter extends Character {
  readonly variant: NexmaxVariant
  setPose(p: NexmaxPose | Pose): void
  /** 爪の開閉と、射出口から出ているか（boolean でも 0..1 でも可） */
  setClaw(open: boolean | number, extended: boolean | number): void
  /** 背中の特殊鉱石の明るさ（0 = 消灯、1 = 通常、2 以上 = 強く光る）。ゆっくり脈打つ */
  setOreGlow(intensity: number): void
  /** 振り子の角度（rad）。+ は支点より前へ振れている（体は後ろへ傾く） */
  setSwing(angle: number): void
  setExpression(e: NexmaxExpression): void
  /** true のとき、ポーズに合わせて表情を自動で変える（保持・引き寄せ＝必死、落下＝驚き） */
  autoExpression: boolean
  /** 爪の先端（ワイヤーの終端に付け替えたいときに） */
  readonly clawHead: THREE.Object3D
  /** 現在の見た目のドローコール数・三角形数（ハルを含む） */
  stats(): { drawCalls: number; triangles: number }
  dispose(): void
}

/** 見本の寸法そのままの全高（m） */
const NATURAL_HEIGHT = 1.2

/** 狙うときの胴のひねりの上限（rad、腰と合わせて約 20°） */
const TWIST_LIMIT = 0.35

// ------------------------------------------------------------------ 乱数（プレビューで再現できるよう固定シード）

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ------------------------------------------------------------------ 組み立て

type Parts = {
  body: THREE.Group
  hips: THREE.Group
  torso: THREE.Group
  head: THREE.Group
  eyePivot: THREE.Group
  eyes: THREE.Mesh
  features: THREE.Mesh
  shR: THREE.Group
  shL: THREE.Group
  elR: THREE.Group
  elL: THREE.Group
  wrR: THREE.Group
  wrL: THREE.Group
  handR: THREE.Mesh
  handL: THREE.Mesh
  hipR: THREE.Group
  hipL: THREE.Group
  knR: THREE.Group
  knL: THREE.Group
  anR: THREE.Group
  anL: THREE.Group
  muzzle: THREE.Object3D
  claw: THREE.Group
  prongs: THREE.InstancedMesh
}

function group(parent: THREE.Object3D, x: number, y: number, z: number, name: string, order: THREE.EulerOrder = 'XYZ'): THREE.Group {
  const g = new THREE.Group()
  g.name = name
  g.position.set(x, y, z)
  g.rotation.order = order
  parent.add(g)
  return g
}

function solid(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, mats: NexmaxMaterials, hull: boolean, name: string): THREE.Mesh {
  const m = new THREE.Mesh(hull ? withHull(geo) : geo, mat)
  m.name = name
  m.castShadow = true
  m.receiveShadow = true
  if (hull) m.customDepthMaterial = mats.hullDepth
  parent.add(m)
  return m
}

export function createNexmax(height = 1.2, opts: NexmaxOptions = {}): NexmaxCharacter {
  const variant: NexmaxVariant = opts.variant ?? 'protagonist'
  const prod = variant === 'production'
  const logo = torsoLogoUV()
  const logoSpec = { logoU: logo.u, logoV: logo.v, logoW: logo.w, logoH: logo.h }
  const torsoTex = prod ? makeProductionTorsoTexture(logoSpec, opts.serial ?? 86) : makeTorsoTexture(logoSpec)
  const mats = createNexmaxMaterials(torsoTex)
  const pm = prod ? createProductionMaterials() : null
  /** 部品の塗り：主人公はそのまま、量産型は本体の青を指定色へ */
  const tone = (g: THREE.BufferGeometry, color: string) => (prod ? recolorBody(g, color) : g)

  const root = new THREE.Group()
  root.name = prod ? 'nexmax-production' : 'nexmax'
  const scaler = new THREE.Group()
  scaler.name = 'nexmax-scale'
  scaler.scale.setScalar(height / NATURAL_HEIGHT)
  if (prod) scaler.position.y = PROD_LIFT * (height / NATURAL_HEIGHT)
  root.add(scaler)
  const body = group(scaler, 0, 0, 0, 'body')

  // --- 胴
  const hips = group(body, 0, J.hips, 0, 'hips', 'YXZ')
  const torso = group(hips, 0, J.torsoPivot - J.hips, 0, 'torso', 'YXZ')
  solid(torso, buildTorso(), mats.torso, mats, true, 'torso')
  const ore = prod ? solid(torso, buildHatch(), pm!.hatch, mats, false, 'hatch') : solid(torso, buildOre(), mats.ore, mats, false, 'ore')
  ore.castShadow = false
  if (prod) torso.scale.copy(PROD_PROPORTIONS.torso)

  // --- 頭
  const head = group(torso, 0, HEAD_PIVOT_Y - J.torsoPivot, 0, 'head', 'YXZ')
  const helmetBase = buildHelmet()
  if (prod) paintProductionHelmet(helmetBase)
  helmetBase.translate(0, -HEAD_PIVOT_Y, 0)
  let antennaTip: THREE.Mesh | null = null
  if (prod) {
    head.scale.setScalar(PROD_PROPORTIONS.head)
    const ant = buildAntenna()
    solid(head, mergeParts([helmetBase, ant.body]), mats.body, mats, true, 'helmet')
    antennaTip = solid(head, ant.tip, pm!.tip, mats, false, 'antennaTip')
    antennaTip.castShadow = false
  } else solid(head, helmetBase, mats.body, mats, true, 'helmet')
  const plateGeo = buildPlate()
  plateGeo.translate(0, -HEAD_PIVOT_Y, 0)
  const plate = solid(head, plateGeo, prod ? pm!.visor : mats.plate, mats, false, 'plate')
  plate.castShadow = false
  const eyePivot = group(head, 0, EYE_CENTER_Y - HEAD_PIVOT_Y, 0, 'eyes')
  const eyeGeos = {} as Record<Expression, THREE.BufferGeometry>
  const featGeos = {} as Record<Expression, THREE.BufferGeometry>
  // 量産型は表情を変えない（LED の目だけ）。表情の切り替えで主人公の目に戻らないよう、全部同じ形にする
  const led = prod ? buildLedEyes().translate(0, -EYE_CENTER_Y, 0) : null
  for (const e of EXPRESSIONS) {
    eyeGeos[e] = led ?? buildEyes(e).translate(0, -EYE_CENTER_Y, 0)
    featGeos[e] = buildFeatures(e, true).translate(0, -HEAD_PIVOT_Y, 0)
  }
  const eyes = solid(eyePivot, eyeGeos.happy, prod ? pm!.led : mats.eyes, mats, false, 'eyeballs')
  eyes.castShadow = false
  const features = solid(head, featGeos.happy, mats.features, mats, false, 'features')
  features.castShadow = false
  if (prod) features.visible = false

  // --- 腕
  const shY = J.shoulder.y - J.torsoPivot
  // 肩は「ひねり → 外へ開く → 前後に振る」の順（XZY）。腕を上げても外開きの向きが変わらない
  const shR = group(torso, J.shoulder.x, shY, 0, 'shoulderR', 'XZY')
  const shL = group(torso, -J.shoulder.x, shY, 0, 'shoulderL', 'XZY')
  const upperGeo = tone(buildUpperArm(), PROD_COLORS.blue)
  solid(shR, upperGeo, mats.body, mats, true, 'upperArmR')
  solid(shL, upperGeo.clone(), mats.body, mats, true, 'upperArmL')
  const elR = group(shR, 0, -J.upperLen, 0, 'elbowR')
  const elL = group(shL, 0, -J.upperLen, 0, 'elbowL')
  // 量産型の右腕にはワイヤー射出器が無い（両腕とも普通の前腕）
  const foreR = buildForearm(!prod)
  const foreL = buildForearm(false)
  solid(elR, tone(foreR.geo, PROD_COLORS.white), mats.body, mats, true, 'forearmR')
  solid(elL, tone(foreL.geo, PROD_COLORS.white), mats.body, mats, true, 'forearmL')
  if (foreR.ring) {
    const ring = solid(elR, foreR.ring, mats.ring, mats, false, 'clawRing')
    ring.castShadow = false
  }
  const wrR = group(elR, 0, -J.lowerLen, 0, 'wristR')
  const wrL = group(elL, 0, -J.lowerLen, 0, 'wristL')
  const handGeo = {
    rOpen: withHull(tone(buildHand(false, 0), PROD_COLORS.blue)),
    rFist: withHull(tone(buildHand(false, 1), PROD_COLORS.blue)),
    lOpen: withHull(tone(buildHand(true, 0), PROD_COLORS.blue)),
    lFist: withHull(tone(buildHand(true, 1), PROD_COLORS.blue)),
  }
  const handR = solid(wrR, handGeo.rOpen, mats.body, mats, false, 'handR')
  handR.customDepthMaterial = mats.hullDepth
  const handL = solid(wrL, handGeo.lOpen, mats.body, mats, false, 'handL')
  handL.customDepthMaterial = mats.hullDepth

  // --- 射出口と爪
  // 射出口は右のこぶしの正面の中心（前腕の軸の延長上）。ワイヤーと爪は手の甲や横ではなく、
  // パンチの向き（手首のローカル -Y）へまっすぐ出る。手首の子なので、狙うポーズで手首を伸ばすと前腕の軸と一直線になる
  const muzzle = new THREE.Object3D()
  muzzle.name = 'nmclawMuzzle'
  muzzle.position.set(0, fistFrontY(handGeo.rFist) - 0.004, 0)
  wrR.add(muzzle)
  const claw = new THREE.Group()
  claw.name = 'nmclawHead'
  muzzle.add(claw)
  const hub = new THREE.Mesh(buildClawHub(), mats.claw)
  hub.castShadow = true
  claw.add(hub)
  const prongs = new THREE.InstancedMesh(buildClawProng(), mats.claw, 3)
  prongs.castShadow = true
  prongs.frustumCulled = false
  claw.add(prongs)
  claw.visible = false

  // --- 脚
  const hipYl = J.hip.y - J.hips
  const hipR = group(hips, J.hip.x, hipYl, 0, 'hipR', 'ZXY')
  const hipL = group(hips, -J.hip.x, hipYl, 0, 'hipL', 'ZXY')
  const thighGeo = tone(buildThigh(), PROD_COLORS.white)
  solid(hipR, thighGeo, mats.body, mats, true, 'thighR')
  solid(hipL, thighGeo.clone(), mats.body, mats, true, 'thighL')
  if (prod) {
    hipR.scale.set(1, PROD_PROPORTIONS.leg, 1)
    hipL.scale.set(1, PROD_PROPORTIONS.leg, 1)
  }
  const knR = group(hipR, 0, -J.thighLen, 0, 'kneeR')
  const knL = group(hipL, 0, -J.thighLen, 0, 'kneeL')
  const shinGeo = tone(buildShin(), PROD_COLORS.blue)
  solid(knR, shinGeo, mats.body, mats, true, 'shinR')
  solid(knL, shinGeo.clone(), mats.body, mats, true, 'shinL')
  const anR = group(knR, 0, -J.shinLen, 0, 'ankleR')
  const anL = group(knL, 0, -J.shinLen, 0, 'ankleL')
  const footGeo = tone(buildFoot(), PROD_COLORS.white)
  solid(anR, footGeo, mats.body, mats, true, 'footR')
  solid(anL, footGeo.clone(), mats.body, mats, true, 'footL')

  const parts: Parts = {
    body,
    hips,
    torso,
    head,
    eyePivot,
    eyes,
    features,
    shR,
    shL,
    elR,
    elL,
    wrR,
    wrL,
    handR,
    handL,
    hipR,
    hipL,
    knR,
    knL,
    anR,
    anL,
    muzzle,
    claw,
    prongs,
  }
  const extra: Extra = { variant, antennaTip, pm }
  return animate(root, parts, mats, height, { eyeGeos, featGeos, handGeo }, extra)
}

/** こぶしの正面（手首から前腕の軸に沿って一番先の面）の y。軸の近くの頂点のうち一番下 */
function fistFrontY(g: THREE.BufferGeometry): number {
  const pos = g.attributes.position
  let minAll = 0
  let minAxis = Infinity
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    if (y < minAll) minAll = y
    if (Math.hypot(x, z) < 0.018 && y < minAxis) minAxis = y
  }
  return minAxis === Infinity ? minAll : minAxis
}

/** 量産型の部品をつなぐ（属性をそろえて結合） */
function mergeParts(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeos(list)
}

type Extra = {
  variant: NexmaxVariant
  antennaTip: THREE.Mesh | null
  pm: ReturnType<typeof createProductionMaterials> | null
}

// ------------------------------------------------------------------ アニメーション

type Geos = {
  eyeGeos: Record<Expression, THREE.BufferGeometry>
  featGeos: Record<Expression, THREE.BufferGeometry>
  handGeo: { rOpen: THREE.BufferGeometry; rFist: THREE.BufferGeometry; lOpen: THREE.BufferGeometry; lFist: THREE.BufferGeometry }
}

/** 腕の向き dir（親の座標系）への回転。手の甲（ローカル +X）はなるべく体の外側／上を向く */
function armBasis(dir: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  const y = _v1.copy(dir).negate()
  const x = _v2.set(1, 2 * dir.x, 0)
  x.addScaledVector(y, -x.dot(y))
  if (x.lengthSq() < 1e-8) x.set(0, 0, 1).addScaledVector(y, -y.z)
  x.normalize()
  const z = _v3.crossVectors(x, y)
  _m.makeBasis(x, y, z)
  return out.setFromRotationMatrix(_m)
}
const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _v3 = new THREE.Vector3()
const _m = new THREE.Matrix4()

function animate(root: THREE.Group, P: Parts, mats: NexmaxMaterials, height: number, G: Geos, X: Extra): NexmaxCharacter {
  const rand = rng(1031)
  let pose: NexmaxPose = 'idle'
  let activeSlot: Slot = 'ground'
  const weights = {} as Record<Slot, number>
  const slotStart = {} as Record<Slot, number>
  const slotParams = {} as Record<Slot, Params>
  for (const s of SLOTS) {
    weights[s] = s === 'ground' ? 1 : 0
    slotStart[s] = 0
    slotParams[s] = zeroParams()
  }
  const blended = zeroParams()
  const ctx: Ctx = { t: 0, pt: 0, speed: 0, phase: 0, swing: 0, swingVel: 0, hasAim: false, lookYaw: 0, lookPitch: 0 }
  let t = rand() * 10
  let speedS = 0
  let swingIn = 0
  let swingS = 0
  let swingVel = 0
  let aim: THREE.Vector3 | null = null
  // 待機の視線
  let lookTimer = 1.5
  let lookYawT = 0
  let lookPitchT = 0
  // まばたき
  let blinkIn = 1.2 + rand() * 2
  let blinkT = -1
  let doubleBlink = false
  // 表情
  let baseExpr: Expression = 'happy'
  let shownExpr: Expression = 'happy'
  // 爪
  let clawOpenT = 0
  let clawExtT = 0
  let clawOpen = 0
  let clawExt = 0
  let lastProngOpen = -1
  // 鉱石
  let oreLevel = 1
  // 手の形
  let fistR = false
  let fistL = false

  const tmp = new THREE.Vector3()
  const tmp2 = new THREE.Vector3()
  const qa = new THREE.Quaternion()
  const qb = new THREE.Quaternion()
  const pm = new THREE.Matrix4()
  const pl = new THREE.Matrix4()
  const pe = new THREE.Euler()
  const pq = new THREE.Quaternion()
  const pp = new THREE.Vector3()
  const ps = new THREE.Vector3()
  const pivot = new THREE.Vector3()

  const prod = X.variant === 'production'
  const character: NexmaxCharacter = {
    name: 'nexmax',
    variant: X.variant,
    root,
    placeholder: false,
    height,
    handAnchor: P.muzzle,
    clawHead: P.claw,
    autoExpression: true,
    setPose(p) {
      const next = (ALL_POSES as string[]).includes(p) ? (p as NexmaxPose) : 'idle'
      if (next === pose) return
      pose = next
      const s = slotOf(next)
      if (s !== activeSlot) {
        activeSlot = s
        slotStart[s] = t
      }
    },
    setAim(target) {
      if (target) {
        if (!aim) aim = new THREE.Vector3()
        aim.copy(target)
      } else aim = null
    },
    setClaw(open, extended) {
      clawOpenT = Math.min(1, Math.max(0, Number(open)))
      clawExtT = Math.min(1, Math.max(0, Number(extended)))
    },
    setOreGlow(v) {
      oreLevel = Math.max(0, v)
    },
    setSwing(a) {
      swingIn = a
    },
    setExpression(e) {
      if (EXPRESSIONS.includes(e)) baseExpr = e
    },
    stats() {
      let calls = 0
      let tris = 0
      root.traverseVisible((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        calls++
        const g = m.geometry
        const n = g.index ? g.index.count : g.attributes.position.count
        tris += (n / 3) * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1)
      })
      return { drawCalls: calls, triangles: Math.round(tris) }
    },
    dispose() {
      root.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) m.geometry.dispose()
      })
      for (const g of [...Object.values(G.eyeGeos), ...Object.values(G.featGeos), ...Object.values(G.handGeo)]) g.dispose()
      mats.dispose()
      X.pm?.dispose()
      root.removeFromParent()
    },
    update(dtIn, moveSpeed) {
      const dt = Math.min(0.1, Math.max(0, dtIn))
      t += dt
      const k = (tau: number) => 1 - Math.exp(-dt / tau)

      // --- 入力をなめらかに
      let eff = Math.max(0, moveSpeed)
      if (pose === 'walk' && eff < 0.3) eff = 2.2
      if (pose === 'run') eff = Math.max(eff, 5.2)
      if (pose === 'dash') eff = Math.max(eff, 6.4)
      speedS += (eff - speedS) * k(0.12)
      ctx.phase = (ctx.phase + strideFreq(speedS) * dt) % 1
      const prevSwing = swingS
      swingS += (swingIn - swingS) * k(0.03)
      const sv = dt > 0 ? (swingS - prevSwing) / dt : 0
      swingVel += (sv - swingVel) * k(0.12)

      // --- 待機の視線（ときどき見回す）
      lookTimer -= dt
      if (lookTimer <= 0) {
        lookTimer = 1.8 + rand() * 2.8
        if (rand() < 0.35) {
          lookYawT = 0
          lookPitchT = 0
        } else {
          lookYawT = (rand() * 2 - 1) * 0.5
          lookPitchT = (rand() * 2 - 1) * 0.1 + 0.02
        }
      }
      ctx.lookYaw += (lookYawT - ctx.lookYaw) * k(0.3)
      ctx.lookPitch += (lookPitchT - ctx.lookPitch) * k(0.3)

      // --- ポーズの重み
      let sum = 0
      const tau = SLOT_TAU[activeSlot]
      for (const s of SLOTS) {
        const target = s === activeSlot ? 1 : 0
        weights[s] += (target - weights[s]) * k(tau)
        if (weights[s] < 1e-3 && s !== activeSlot) weights[s] = 0
        sum += weights[s]
      }
      ctx.t = t
      ctx.speed = speedS
      ctx.swing = swingS
      ctx.swingVel = swingVel
      ctx.hasAim = !!aim
      clearParams(blended)
      blended.squash = 0
      for (const s of SLOTS) {
        const w = weights[s] / (sum || 1)
        if (w <= 0) continue
        ctx.pt = t - slotStart[s]
        evalSlot(s, slotParams[s], ctx)
        addWeighted(blended, slotParams[s], w)
      }
      apply(blended)

      // --- 目・表情・爪・鉱石
      updateFace(dt)
      clawOpen += (clawOpenT - clawOpen) * k(0.05)
      clawExt += (clawExtT - clawExt) * k(0.05)
      updateClaw()
      const pulse = 0.84 + 0.16 * Math.sin(t * 2.3)
      mats.ore.color.setScalar(0.32 + 0.82 * oreLevel * pulse)
      mats.ring.color.setScalar(1.3 + 0.35 * clawExt + 0.08 * Math.sin(t * 3.1))
      if (prod && X.pm) {
        // アンテナの先は通信中のように 2 回ずつ点滅、LED の目はゆっくり明滅
        const ph = (t * 0.8) % 1
        const blink = ph < 0.08 || (ph > 0.16 && ph < 0.24) ? 3.2 : 1.0
        X.pm.tip.color.setScalar(blink)
        X.pm.led.color.setScalar(2.2 + 0.25 * Math.sin(t * 1.7))
      }
      // 手の形
      if (!fistR && blended.fist > 0.58) fistR = true
      else if (fistR && blended.fist < 0.42) fistR = false
      const fl = blended.fist * (1 - blended.brace)
      if (!fistL && fl > 0.58) fistL = true
      else if (fistL && fl < 0.42) fistL = false
      P.handR.geometry = fistR ? G.handGeo.rFist : G.handGeo.rOpen
      P.handL.geometry = fistL ? G.handGeo.lFist : G.handGeo.lOpen
      root.updateMatrixWorld(true)
    },
  }

  function apply(p: Params): void {
    // 体全体：つぶれ（体積を保つ）＋ 支点まわりの傾き
    const s = Math.max(0.6, p.squash)
    const side = 1 / Math.sqrt(s)
    P.body.rotation.set(p.bodyPitch, 0, p.bodyRoll)
    P.body.scale.set(side, s, side)
    pivot.set(p.pivotX, p.pivotY, 0)
    tmp.set(p.pivotX * side, p.pivotY * s, 0).applyEuler(P.body.rotation)
    P.body.position.set(0, p.bodyY, p.bodyZ).add(pivot).sub(tmp)

    P.hips.position.set(p.hipsX, J.hips + p.hipsY, 0)
    P.hips.rotation.set(p.hipsPitch, p.hipsYaw, p.hipsRoll)

    // 狙いの方向へ胴を少しひねる（真横・後ろの対象でも腕が体を突き抜けないように）
    let torsoYaw = p.torsoYaw
    if (aim && p.aim > 0.001) {
      root.updateMatrixWorld(true)
      tmp.copy(aim)
      P.hips.worldToLocal(tmp)
      const yaw = Math.atan2(-tmp.x, -tmp.z)
      // ほぼ真上（振り子の支点など）では水平の向きが不安定なので効かせない
      const horiz = Math.hypot(tmp.x, tmp.z)
      const flat = Math.min(1, Math.max(0, horiz / (Math.abs(tmp.y - 0.6) + 0.3) - 0.3))
      torsoYaw += Math.max(-TWIST_LIMIT, Math.min(TWIST_LIMIT, yaw * 0.5)) * p.aim * flat
      // 胴のひねりは控えめに（腰と合わせて ±20° まで）。体ごと狙いへ向けるのはゲーム側（root の向き）
      const total = p.hipsYaw + torsoYaw
      const clamped = Math.max(-TWIST_LIMIT, Math.min(TWIST_LIMIT, total))
      torsoYaw += (clamped - total) * Math.min(1, p.aim)
    }
    P.torso.rotation.set(p.torsoPitch, torsoYaw, p.torsoRoll)
    P.head.rotation.set(p.headPitch, p.headYaw, p.headRoll)

    P.shR.rotation.set(p.rShX, p.rShY, p.rShZ)
    P.shL.rotation.set(p.lShX, -p.lShY, -p.lShZ)
    P.elR.rotation.set(Math.max(0, p.rEl), 0, 0)
    P.elL.rotation.set(Math.max(0, p.lEl), 0, 0)
    P.wrR.rotation.set(p.rHandX, 0, p.rHandZ)
    P.wrL.rotation.set(p.lHandX, 0, -p.lHandZ)

    P.hipR.rotation.set(p.rHipX, -p.rHipY, p.rHipZ)
    P.hipL.rotation.set(p.lHipX, p.lHipY, -p.lHipZ)
    P.knR.rotation.set(-Math.max(0, p.rKnee), 0, 0)
    P.knL.rotation.set(-Math.max(0, p.lKnee), 0, 0)
    // 脚を開いた分、足の裏が地面と平行になるよう足首でロールを打ち消す
    P.anR.rotation.set(p.rAnk, 0, -p.rHipZ - p.hipsRoll)
    P.anL.rotation.set(p.lAnk, 0, p.lHipZ - p.hipsRoll)

    if (aim && (p.aim > 0.001 || p.look > 0.001)) {
      root.updateMatrixWorld(true)
      // 頭：対象を見る
      if (p.look > 0.001) {
        tmp.copy(aim)
        P.torso.worldToLocal(tmp).sub(P.head.position)
        tmp.y -= 0.25
        const yaw = Math.max(-0.9, Math.min(0.9, Math.atan2(-tmp.x, -tmp.z)))
        const pitch = Math.max(-0.5, Math.min(0.6, Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z))))
        P.head.rotation.set(
          THREE.MathUtils.lerp(p.headPitch, pitch * 0.7, p.look),
          THREE.MathUtils.lerp(p.headYaw, yaw * 0.8, p.look),
          p.headRoll,
        )
      }
      // 右腕：射出口を対象へ（肘は伸ばす）
      if (p.aim > 0.001) {
        tmp.copy(aim)
        P.torso.worldToLocal(tmp).sub(P.shR.position)
        if (tmp.lengthSq() > 1e-6) {
          tmp.normalize()
          // 肩から対象へまっすぐ（肘・手首も伸ばす）＝こぶしの正面の射出口が対象を正面に向く。
          // 真上に近い対象（振り子の支点・高い金具）だけ、大きな頭に腕がめり込まないよう外へ逃がす
          const steep = THREE.MathUtils.smoothstep(tmp.y, 0.55, 0.92)
          tmp.x += p.aimSide * steep
          tmp.normalize()
          armBasis(tmp, qa)
          P.shR.quaternion.slerp(qa, p.aim)
          P.elR.rotation.x *= 1 - p.aim
          P.wrR.rotation.x *= 1 - p.aim
          P.wrR.rotation.z *= 1 - p.aim
        }
      }
    }

    // 左手を右の前腕に添える（2 関節 IK）
    if (p.brace > 0.001) {
      root.updateMatrixWorld(true)
      tmp2.set(0.0, -0.085, 0)
      P.elR.localToWorld(tmp2)
      P.torso.worldToLocal(tmp2).sub(P.shL.position)
      const D = tmp2.length()
      if (D > 1e-4) {
        const Lu = J.upperLen
        const Ll = J.lowerLen + 0.05
        const d = Math.min(D, Lu + Ll - 1e-3)
        const beta = Math.PI - Math.acos(Math.max(-1, Math.min(1, (Lu * Lu + Ll * Ll - d * d) / (2 * Lu * Ll))))
        const gamma = Math.acos(Math.max(-1, Math.min(1, (Lu * Lu + d * d - Ll * Ll) / (2 * Lu * d))))
        tmp2.divideScalar(D)
        armBasis(tmp2, qa)
        qb.setFromAxisAngle(_v1.set(1, 0, 0), -gamma)
        qa.multiply(qb)
        P.shL.quaternion.slerp(qa, p.brace)
        P.elL.rotation.x = THREE.MathUtils.lerp(P.elL.rotation.x, beta, p.brace)
      }
    }
  }

  function updateFace(dt: number): void {
    // 表情：自動ならポーズに合わせる。クローでつかむ・引っぱられるときは変えない（キリッとした目が、こわく見えるので）
    let want = baseExpr
    if (character.autoExpression) {
      if (pose === 'fall' && t - slotStart.fall > 0.35) want = 'surprised'
      if (pose === 'hurt') want = 'surprised'
    }
    // まばたき（表情の切り替えはまぶたを閉じた瞬間に）
    blinkIn -= dt
    if (blinkT < 0 && (blinkIn <= 0 || want !== shownExpr)) {
      blinkT = 0
      blinkIn = 2 + rand() * 3.2
      doubleBlink = rand() < 0.18
    }
    let open = 1
    if (blinkT >= 0) {
      blinkT += dt
      const dur = 0.16
      const x = blinkT / dur
      if (x < 0.3) open = 1 - x / 0.3
      else if (x < 0.45) {
        open = 0
        if (want !== shownExpr) {
          shownExpr = want
          P.eyes.geometry = G.eyeGeos[shownExpr]
          P.features.geometry = G.featGeos[shownExpr]
        }
      } else if (x < 1) open = (x - 0.45) / 0.55
      else {
        open = 1
        blinkT = -1
        if (doubleBlink) {
          doubleBlink = false
          blinkIn = 0.12
        }
      }
    }
    P.eyePivot.scale.y = 0.08 + 0.92 * open
  }

  function updateClaw(): void {
    const ext = clawExt
    P.claw.visible = ext > 0.02
    if (!P.claw.visible) return
    P.claw.position.set(0, -0.004 - 0.032 * ext, 0)
    P.claw.scale.setScalar((0.35 + 0.65 * ext) * 1.35)
    const open = clawOpen
    if (Math.abs(open - lastProngOpen) < 1e-3) return
    lastProngOpen = open
    const ang = THREE.MathUtils.lerp(0.1, 0.85, open)
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2
      pm.makeRotationY(a)
      pe.set(0, 0, ang)
      pq.setFromEuler(pe)
      pp.set(0.0105, -0.012, 0)
      ps.set(1, 1, 1)
      pl.compose(pp, pq, ps)
      pm.multiply(pl)
      P.prongs.setMatrixAt(i, pm)
    }
    P.prongs.instanceMatrix.needsUpdate = true
  }

  // 初期姿勢
  character.update(0, 0)
  return character
}
