// かわいいちびキャラの社員（コードで組み立て）。人間 = 肌・髪・服、AI社員 = 画面の顔とアンテナのロボット。
// 原点は足元、正面は +Z。頭が体と同じくらい大きい 2 頭身。
// 動き：idle（ゆらゆら・まばたき）/ sit（いすに座る）/ walk（てくてく）、状態で typing・考える・話す・待つ。
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Look, Member, MemberStatus } from '../../../shared/types'
import { ghostOf, glowMat, shade, toonMat } from './mats'

export type Mode = 'sit' | 'stand' | 'walk'

/** OfficeWorld が扱う「体」（ちびキャラとネクマックスの共通） */
export interface Avatar {
  readonly root: THREE.Group
  /** 名札を付ける位置（頭の上）。座ると下がる */
  readonly tagAnchor: THREE.Object3D
  /** 光の粒が出入りする位置（頭のあたり） */
  readonly headAnchor: THREE.Object3D
  setMode(m: Mode): void
  setStatus(s: MemberStatus): void
  /** 話している（口がぱくぱく・はずむ） */
  setTalking(on: boolean): void
  /** ぴょんと跳ねる（お祝い・受け取り） */
  hop(strength?: number): void
  /** 歩く速さ（m/s）。0 で止まる */
  update(dt: number, t: number, speed: number): void
  setGhost(on: boolean): void
  /** 当たり判定の球（世界座標の中心と半径） */
  hitSpheres(): { c: THREE.Vector3; r: number }[]
  dispose(): void
}

// ------------------------------------------------------------------ 共有ジオメトリ

type Geos = ReturnType<typeof makeGeos>
let G: Geos | null = null

function lathe(points: [number, number][], seg = 20): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  )
}

function makeGeos() {
  const torso = lathe(
    [
      [0.0, 0.0],
      [0.15, 0.0],
      [0.205, 0.04],
      [0.215, 0.12],
      [0.2, 0.24],
      [0.17, 0.34],
      [0.12, 0.41],
      [0.0, 0.43],
    ],
    20,
  )
  torso.computeVertexNormals()
  const robotTorso = new RoundedBoxGeometry(0.42, 0.42, 0.34, 3, 0.13)
  robotTorso.translate(0, 0.21, 0)
  return {
    head: new THREE.SphereGeometry(0.33, 28, 20),
    robotHead: new RoundedBoxGeometry(0.66, 0.54, 0.56, 4, 0.2),
    screen: new RoundedBoxGeometry(0.5, 0.34, 0.04, 2, 0.06),
    torso,
    robotTorso,
    limb: new THREE.CapsuleGeometry(0.06, 0.12, 4, 10),
    leg: new THREE.CapsuleGeometry(0.072, 0.1, 4, 10),
    hand: new THREE.SphereGeometry(0.068, 12, 10),
    shoe: new THREE.SphereGeometry(0.085, 12, 10),
    eye: new THREE.SphereGeometry(0.05, 14, 12),
    dot: new THREE.SphereGeometry(0.016, 8, 6),
    smile: new THREE.TorusGeometry(0.04, 0.011, 6, 14, Math.PI),
    blush: new THREE.CircleGeometry(0.046, 18),
    ball: new THREE.SphereGeometry(0.1, 14, 12),
    cone: new THREE.ConeGeometry(0.07, 0.18, 10),
    ring: new THREE.TorusGeometry(0.07, 0.012, 6, 20),
    stick: new THREE.CylinderGeometry(0.014, 0.014, 0.18, 6),
    disc: new THREE.CylinderGeometry(0.1, 0.1, 0.06, 18),
    capTop: new THREE.SphereGeometry(0.365, 24, 12, 0, Math.PI * 2, 0, 1.25),
    brim: new THREE.CylinderGeometry(0.2, 0.2, 0.025, 20, 1, false, 0, Math.PI),
    band: new THREE.TorusGeometry(0.37, 0.026, 6, 24, Math.PI),
    hairCap: new THREE.SphereGeometry(0.352, 28, 14, 0, Math.PI * 2, 0, 1.2),
    hairBack: (t: number) => new THREE.SphereGeometry(0.356, 28, 16, Math.PI, Math.PI, 0, t),
    chest: new RoundedBoxGeometry(0.18, 0.12, 0.04, 2, 0.03),
    tie: new THREE.ConeGeometry(0.045, 0.16, 4),
  }
}

function geos(): Geos {
  if (!G) G = makeGeos()
  return G
}

const hairBackCache = new Map<number, THREE.SphereGeometry>()
function hairBack(t: number): THREE.SphereGeometry {
  let g = hairBackCache.get(t)
  if (!g) {
    g = geos().hairBack(t)
    hairBackCache.set(t, g)
  }
  return g
}

// ------------------------------------------------------------------ 組み立て

const HEAD_Y = 0.93
const SHOULDER_Y = 0.58
const HIP_Y = 0.27

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = shadow
  return m
}

/** 頭の表面（横に少し広い球）上の z */
function faceZ(x: number, y: number, r = 0.33): number {
  const v = r * r - (x / 1.05) ** 2 - (y / 0.95) ** 2
  return Math.sqrt(Math.max(0.001, v))
}

export class Chibi implements Avatar {
  readonly root = new THREE.Group()
  readonly tagAnchor = new THREE.Object3D()
  readonly headAnchor = new THREE.Object3D()
  private readonly body = new THREE.Group()
  private readonly head = new THREE.Group()
  private readonly legL = new THREE.Group()
  private readonly legR = new THREE.Group()
  private readonly armL = new THREE.Group()
  private readonly armR = new THREE.Group()
  private readonly eyes: THREE.Object3D[] = []
  private smile!: THREE.Mesh
  private openMouth!: THREE.Mesh
  private bulb: THREE.Mesh | null = null
  private bulbMat: THREE.MeshBasicMaterial | null = null
  private readonly meshes: THREE.Mesh[] = []
  private readonly ownMats: THREE.Material[] = []
  private mode: Mode = 'stand'
  private status: MemberStatus = 'idle'
  private talking = false
  private ghost = false
  private sitK = 0
  private walkPhase = 0
  private hopV = 0
  private hopY = 0
  private blinkT = 1 + Math.random() * 3
  private seed = Math.random() * 100
  private readonly isRobot: boolean
  private readonly look: Look

  constructor(member: Pick<Member, 'kind' | 'look'>) {
    this.look = member.look
    this.isRobot = member.kind === 'agent'
    const g = geos()
    this.root.add(this.body)
    this.body.add(this.head)
    this.head.position.y = HEAD_Y
    this.tagAnchor.position.y = 1.45
    this.headAnchor.position.y = 1.0
    this.root.add(this.tagAnchor, this.headAnchor)

    const L = this.look
    const bodyCol = L.body
    const dark = shade(bodyCol, -0.45)

    // --- 脚
    for (const [pivot, x] of [
      [this.legL, -0.095],
      [this.legR, 0.095],
    ] as const) {
      pivot.position.set(x, HIP_Y, 0)
      const leg = mesh(g.leg, toonMat(this.isRobot ? shade(bodyCol, -0.15) : '#3d4a6b'))
      leg.position.y = -0.12
      const shoe = mesh(g.shoe, toonMat(this.isRobot ? shade(bodyCol, -0.35) : '#5a3a2a'))
      shoe.scale.set(0.95, 0.62, 1.25)
      shoe.position.set(0, -0.22, 0.03)
      pivot.add(leg, shoe)
      this.body.add(pivot)
      this.meshes.push(leg, shoe)
    }

    // --- 胴
    if (this.isRobot) {
      const torso = mesh(g.robotTorso, toonMat(bodyCol))
      torso.position.y = 0.2
      const chest = mesh(g.chest, glowMat(shade(L.accent, 0.25)), false)
      chest.position.set(0, 0.45, 0.17)
      this.body.add(torso, chest)
      this.meshes.push(torso, chest)
    } else {
      const torso = mesh(g.torso, toonMat(bodyCol))
      torso.position.y = 0.2
      torso.scale.set(1, 1, 0.9)
      const tie = mesh(g.tie, toonMat(L.accent))
      tie.rotation.x = Math.PI
      tie.position.set(0, 0.52, 0.168)
      tie.scale.set(0.8, 0.9, 0.4)
      this.body.add(torso, tie)
      this.meshes.push(torso, tie)
    }

    // --- 腕
    const handCol = this.isRobot ? '#ffffff' : L.skin ?? '#ffd9c0'
    for (const [pivot, x] of [
      [this.armL, -0.215],
      [this.armR, 0.215],
    ] as const) {
      pivot.position.set(x, SHOULDER_Y, 0)
      pivot.rotation.z = x < 0 ? -0.28 : 0.28
      const arm = mesh(g.limb, toonMat(this.isRobot ? shade(bodyCol, -0.1) : bodyCol))
      arm.position.y = -0.1
      const hand = mesh(g.hand, toonMat(handCol))
      hand.position.y = -0.22
      pivot.add(arm, hand)
      this.body.add(pivot)
      this.meshes.push(arm, hand)
    }

    if (this.isRobot) this.buildRobotHead(dark)
    else this.buildHumanHead()
    this.buildAccessory()
  }

  private buildHumanHead(): void {
    const g = geos()
    const L = this.look
    const skin = L.skin ?? '#ffd9c0'
    const head = mesh(g.head, toonMat(skin))
    head.scale.set(1.05, 0.95, 1)
    this.head.add(head)
    this.meshes.push(head)

    // 目（黒い楕円＋白いハイライト）
    for (const x of [-0.115, 0.115]) {
      const e = new THREE.Group()
      e.position.set(x, -0.005, faceZ(x, 0) - 0.012)
      const ball = mesh(g.eye, glowMat('#1d1b26'), false)
      ball.scale.set(0.82, 1.18, 0.5)
      const hi = mesh(g.dot, glowMat('#ffffff'), false)
      hi.position.set(0.014, 0.024, 0.024)
      e.add(ball, hi)
      this.head.add(e)
      this.eyes.push(e)
    }
    // ほっぺ
    for (const x of [-0.19, 0.19]) {
      const b = mesh(g.blush, glowMat('#ff9fb4', 0.6), false)
      const y = -0.075
      b.position.set(x, y, faceZ(x, y) + 0.004)
      b.lookAt(b.position.clone().multiply(new THREE.Vector3(1 / 1.05 ** 2, 1 / 0.95 ** 2, 1)).multiplyScalar(4))
      this.head.add(b)
    }
    this.buildMouth(-0.105, faceZ(0, -0.105) - 0.004, '#7a3b3b')

    this.buildHair()
  }

  private buildMouth(y: number, z: number, color: string): void {
    const g = geos()
    this.smile = mesh(g.smile, glowMat(color), false)
    this.smile.rotation.z = Math.PI
    this.smile.rotation.x = 0.25
    this.smile.position.set(0, y + 0.02, z)
    this.openMouth = mesh(g.eye, glowMat(this.isRobot ? color : '#c2464e'), false)
    this.openMouth.scale.set(0.75, 0.55, 0.3)
    this.openMouth.position.set(0, y, z)
    this.openMouth.visible = false
    this.head.add(this.smile, this.openMouth)
  }

  private buildHair(): void {
    const g = geos()
    const L = this.look
    const hair = toonMat(L.hair ?? '#3b2a20')
    const add = (geo: THREE.BufferGeometry, pos: [number, number, number], scale: [number, number, number] = [1, 1, 1], rot: [number, number, number] = [0, 0, 0]): THREE.Mesh => {
      const m = mesh(geo, hair)
      m.position.set(...pos)
      m.scale.set(...scale)
      m.rotation.set(...rot)
      this.head.add(m)
      this.meshes.push(m)
      return m
    }
    const style = ((L.style % 8) + 8) % 8
    const capScale: [number, number, number] = [1.05, 0.97, 1.02]
    add(g.hairCap, [0, 0.01, 0], capScale)
    const backLen = style === 1 ? 2.45 : style === 7 ? 1.85 : style === 2 ? 1.95 : 2.15
    add(hairBack(backLen), [0, 0.01, -0.005], capScale)
    const bangs = (n: number, spread: number, y = 0.19) => {
      for (let i = 0; i < n; i++) {
        const k = n === 1 ? 0 : i / (n - 1) - 0.5
        const x = k * spread
        add(g.ball, [x, y - Math.abs(k) * 0.06, faceZ(x, y) - 0.05], [1.05, 0.62, 0.7], [0.5, 0, -k * 0.6])
      }
    }
    switch (style) {
      case 0: // ボブ
        bangs(4, 0.42)
        add(g.ball, [-0.29, -0.06, 0.06], [0.8, 1.5, 1.1])
        add(g.ball, [0.29, -0.06, 0.06], [0.8, 1.5, 1.1])
        break
      case 1: // ロング
        bangs(3, 0.36)
        add(g.ball, [0, -0.3, -0.16], [2.6, 2.4, 1.2])
        add(g.ball, [-0.28, -0.16, 0.02], [0.75, 1.9, 1])
        add(g.ball, [0.28, -0.16, 0.02], [0.75, 1.9, 1])
        break
      case 2: // つんつん
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2
          const m = add(g.cone, [Math.cos(a) * 0.17, 0.3, Math.sin(a) * 0.17 - 0.03], [1.1, 1, 1.1])
          m.lookAt(new THREE.Vector3(Math.cos(a) * 2, 2.6, Math.sin(a) * 2 - 0.3).add(m.position))
          m.rotateX(Math.PI / 2)
        }
        bangs(3, 0.3, 0.21)
        break
      case 3: {
        // ポニーテール
        bangs(4, 0.4)
        add(g.ball, [0, 0.12, -0.38], [1.2, 1.2, 1.1])
        add(g.ball, [0, -0.08, -0.43], [1, 1.5, 0.9])
        const band = mesh(g.ring, toonMat(L.accent))
        band.position.set(0, 0.2, -0.33)
        band.rotation.x = 0.6
        this.head.add(band)
        this.meshes.push(band)
        break
      }
      case 4: // おだんご
        bangs(4, 0.4)
        add(g.ball, [-0.24, 0.27, -0.06], [1.25, 1.25, 1.25])
        add(g.ball, [0.24, 0.27, -0.06], [1.25, 1.25, 1.25])
        break
      case 5: // 横に流した前髪
        add(g.ball, [0.07, 0.2, faceZ(0.07, 0.2) - 0.06], [2.6, 0.75, 0.8], [0.5, 0, 0.35])
        add(g.ball, [-0.25, 0.12, 0.12], [0.8, 0.9, 1])
        break
      case 6: {
        // アホ毛
        bangs(5, 0.44)
        const ah = mesh(g.smile, hair)
        ah.position.set(0.02, 0.38, 0)
        ah.rotation.set(0, Math.PI / 2, 0.5)
        ah.scale.setScalar(1.8)
        this.head.add(ah)
        this.meshes.push(ah)
        break
      }
      default: // さっぱり短髪
        bangs(2, 0.2, 0.22)
        break
    }
  }

  private buildRobotHead(dark: string): void {
    const g = geos()
    const L = this.look
    const shell = mesh(g.robotHead, toonMat(shade(L.body, 0.6)))
    this.head.add(shell)
    this.meshes.push(shell)
    const scr = mesh(g.screen, glowMat('#1f2547'), false)
    scr.position.set(0, -0.01, 0.262)
    this.head.add(scr)
    const eyeCol = shade(L.accent, 0.55)
    const style = ((L.style % 8) + 8) % 8
    for (const x of [-0.11, 0.11]) {
      const e = new THREE.Group()
      e.position.set(x, 0.02, 0.288)
      if (style % 3 === 1) {
        // にっこり目（∩）
        const arc = mesh(g.smile, glowMat(eyeCol), false)
        arc.scale.setScalar(1.1)
        arc.position.y = -0.02
        e.add(arc)
      } else {
        const ball = mesh(g.eye, glowMat(eyeCol), false)
        ball.scale.set(style % 3 === 2 ? 1.0 : 0.85, style % 3 === 2 ? 1.0 : 1.3, 0.3)
        e.add(ball)
      }
      this.head.add(e)
      this.eyes.push(e)
    }
    for (const x of [-0.19, 0.19]) {
      const b = mesh(g.blush, glowMat('#ff8fb1', 0.85), false)
      b.scale.set(0.7, 0.45, 1)
      b.position.set(x, -0.08, 0.286)
      this.head.add(b)
    }
    this.buildMouth(-0.1, 0.288, eyeCol)

    // 耳（種類で形を変える）
    const ears = style % 4
    for (const s of [-1, 1]) {
      if (ears === 1) {
        // ねこ耳
        const c = mesh(g.cone, toonMat(shade(L.body, 0.6)))
        c.position.set(s * 0.2, 0.3, -0.02)
        c.rotation.z = -s * 0.35
        c.scale.set(1.2, 0.9, 0.8)
        const inner = mesh(g.cone, toonMat(L.accent))
        inner.scale.set(0.6, 0.6, 0.5)
        inner.position.set(0, -0.01, 0.03)
        c.add(inner)
        this.head.add(c)
        this.meshes.push(c)
      } else if (ears === 2) {
        // うさぎのアンテナ
        const st = mesh(g.limb, toonMat(shade(L.body, 0.6)))
        st.scale.set(0.6, 1.4, 0.6)
        st.position.set(s * 0.14, 0.4, -0.04)
        st.rotation.z = -s * 0.25
        this.head.add(st)
        this.meshes.push(st)
      } else {
        const d = mesh(g.disc, toonMat(ears === 3 ? dark : L.accent))
        d.rotation.z = Math.PI / 2
        d.position.set(s * 0.345, 0.0, 0)
        d.scale.set(ears === 3 ? 1.3 : 1, 1, ears === 3 ? 1.3 : 1)
        this.head.add(d)
        this.meshes.push(d)
      }
    }
    if (ears !== 2) {
      const stick = mesh(g.stick, toonMat(dark))
      stick.position.set(0, 0.34, 0)
      this.bulbMat = new THREE.MeshBasicMaterial({ color: L.accent })
      this.ownMats.push(this.bulbMat)
      this.bulb = mesh(g.ball, this.bulbMat, false)
      this.bulb.scale.setScalar(0.55)
      this.bulb.position.set(0, 0.45, 0)
      this.head.add(stick, this.bulb)
      this.meshes.push(stick)
    }
  }

  private buildAccessory(): void {
    const g = geos()
    const L = this.look
    const acc = L.accessory ?? 'none'
    const front = this.isRobot ? 0.29 : 0
    const put = (m: THREE.Mesh) => {
      this.head.add(m)
      this.meshes.push(m)
      return m
    }
    switch (acc) {
      case 'glasses': {
        const mat = toonMat('#2b2b3a')
        for (const x of [-0.115, 0.115]) {
          const r = put(mesh(g.ring, mat, false))
          r.position.set(x, 0.0, (front || faceZ(x, 0)) + 0.012)
        }
        const br = put(mesh(g.stick, mat, false))
        br.rotation.z = Math.PI / 2
        br.scale.set(0.7, 0.45, 0.7)
        br.position.set(0, 0.01, (front || faceZ(0, 0)) + 0.01)
        break
      }
      case 'headset': {
        const band = put(mesh(g.band, toonMat('#3a3f55')))
        band.position.y = 0.02
        band.scale.set(this.isRobot ? 0.98 : 1.0, 1, 1)
        for (const s of [-1, 1]) {
          const cup = put(mesh(g.disc, toonMat('#3a3f55')))
          cup.rotation.z = Math.PI / 2
          cup.position.set(s * 0.36, 0.0, 0)
          cup.scale.set(0.9, 0.8, 0.9)
        }
        const mic = put(mesh(g.limb, toonMat(L.accent)))
        mic.scale.set(0.25, 0.9, 0.25)
        mic.rotation.set(0, 0, 1.25)
        mic.position.set(0.24, -0.12, 0.2)
        break
      }
      case 'cap': {
        const top = put(mesh(g.capTop, toonMat(L.accent)))
        top.position.y = this.isRobot ? 0.12 : 0.03
        top.scale.set(this.isRobot ? 1.0 : 1.05, 0.9, 1.02)
        const brim = put(mesh(g.brim, toonMat(L.accent)))
        brim.position.set(0, this.isRobot ? 0.22 : 0.17, 0.22)
        brim.rotation.set(0.15, Math.PI / 2, 0)
        brim.scale.set(1.3, 1, 1.1)
        break
      }
      case 'ribbon': {
        const m = toonMat(L.accent)
        for (const s of [-1, 1]) {
          const c = put(mesh(g.cone, m))
          c.rotation.z = s * Math.PI / 2
          c.scale.set(0.9, 0.7, 0.6)
          c.position.set(0.2 + s * 0.07, 0.3, 0.05)
        }
        const k = put(mesh(g.ball, m))
        k.scale.setScalar(0.35)
        k.position.set(0.2, 0.3, 0.06)
        break
      }
      case 'beret': {
        const b = put(mesh(g.ball, toonMat(L.accent)))
        b.scale.set(3.3, 1.0, 3.3)
        b.position.set(-0.05, this.isRobot ? 0.3 : 0.27, -0.02)
        b.rotation.z = 0.2
        break
      }
      case 'flower': {
        const petal = toonMat('#ffb3cf')
        const cx = 0.25
        const cy = 0.17
        const cz = this.isRobot ? 0.2 : 0.13
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2
          const p = put(mesh(g.ball, petal, false))
          p.scale.setScalar(0.35)
          p.position.set(cx + Math.cos(a) * 0.045, cy + Math.sin(a) * 0.045, cz)
        }
        const c = put(mesh(g.ball, toonMat('#ffd84d'), false))
        c.scale.setScalar(0.28)
        c.position.set(cx, cy, cz + 0.02)
        break
      }
      case 'bowtie': {
        const m = toonMat(L.accent)
        for (const s of [-1, 1]) {
          const c = mesh(g.cone, m)
          c.rotation.z = s * Math.PI / 2
          c.scale.set(0.7, 0.55, 0.5)
          c.position.set(s * 0.06, 0.6, this.isRobot ? 0.19 : 0.15)
          this.body.add(c)
          this.meshes.push(c)
        }
        break
      }
      default:
        break
    }
  }

  // ------------------------------------------------------------------ 状態

  setMode(m: Mode): void {
    this.mode = m
  }

  setStatus(s: MemberStatus): void {
    this.status = s
    if (this.bulbMat) {
      const col = s === 'waiting' ? '#ffb347' : s === 'offline' || s === 'away' ? '#9aa3b5' : s === 'thinking' ? '#b48cff' : this.look.accent
      this.bulbMat.color.set(col)
    }
  }

  setTalking(on: boolean): void {
    this.talking = on
    if (!on) {
      this.openMouth.visible = false
      this.smile.visible = true
    }
  }

  hop(strength = 1): void {
    if (this.hopY < 0.02) this.hopV = 2.6 * strength
  }

  setGhost(on: boolean): void {
    if (on === this.ghost) return
    this.ghost = on
    this.root.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const ud = m.userData as { orig?: THREE.Material }
      if (on) {
        ud.orig = m.material as THREE.Material
        m.material = ghostOf(ud.orig)
        m.castShadow = false
      } else if (ud.orig) {
        m.material = ud.orig
        m.castShadow = this.meshes.includes(m)
      }
    })
  }

  hitSpheres(): { c: THREE.Vector3; r: number }[] {
    const h = new THREE.Vector3()
    this.head.getWorldPosition(h)
    const b = new THREE.Vector3()
    this.body.getWorldPosition(b)
    b.y += 0.42
    return [
      { c: h, r: 0.38 },
      { c: b, r: 0.3 },
    ]
  }

  update(dt: number, t: number, speed: number): void {
    const k = (tau: number) => 1 - Math.exp(-dt / tau)
    const walking = this.mode === 'walk' && speed > 0.05
    const sitTarget = this.mode === 'sit' ? 1 : 0
    this.sitK += (sitTarget - this.sitK) * k(0.12)
    const s = this.sitK
    const st = this.status
    const ts = t + this.seed

    // ぴょん
    if (this.hopV !== 0 || this.hopY > 0) {
      this.hopV -= 9.8 * dt
      this.hopY = Math.max(0, this.hopY + this.hopV * dt)
      if (this.hopY === 0 && this.hopV < 0) this.hopV = 0
    }

    // 体の高さ・ゆれ
    let bob = Math.sin(ts * 2.2) * 0.008
    let squash = 1
    if (walking) {
      this.walkPhase += dt * (5 + speed * 2.6)
      bob = Math.abs(Math.sin(this.walkPhase)) * 0.05
    }
    if (this.talking || st === 'talking') {
      bob += Math.abs(Math.sin(ts * 9)) * 0.025
      squash = 1 + Math.sin(ts * 18) * 0.02
    }
    this.body.position.y = s * 0.11 + bob + this.hopY
    this.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash))
    this.tagAnchor.position.y = 1.45 + s * 0.11 + this.hopY
    this.headAnchor.position.y = 1.0 + s * 0.11 + this.hopY

    // 脚：座ると前へ、歩くと交互に
    const legSwing = walking ? Math.sin(this.walkPhase) * 0.65 : 0
    this.legL.rotation.x = -s * 1.5 + legSwing * (1 - s)
    this.legR.rotation.x = -s * 1.5 - legSwing * (1 - s)

    // 腕
    let aLx = walking ? -legSwing * 0.8 : 0
    let aRx = walking ? legSwing * 0.8 : 0
    let aLz = -0.28
    let aRz = 0.28
    const typing = st === 'working' && this.mode === 'sit'
    if (typing) {
      aLx = -1.05 + Math.sin(ts * 16) * 0.12
      aRx = -1.05 + Math.sin(ts * 16 + 1.7) * 0.12
      aLz = -0.12
      aRz = 0.12
    } else if (st === 'thinking') {
      aRx = -2.3 + Math.sin(ts * 1.5) * 0.05
      aRz = 0.55
    } else if (this.talking || st === 'talking') {
      aRx = -0.9 + Math.sin(ts * 6) * 0.35
      aRz = 0.4
    } else if (this.mode === 'sit') {
      aLx = -0.7
      aRx = -0.7
    }
    if (this.hopY > 0.02) {
      aLz = -1.9
      aRz = 1.9
    }
    this.armL.rotation.x += (aLx - this.armL.rotation.x) * k(0.07)
    this.armR.rotation.x += (aRx - this.armR.rotation.x) * k(0.07)
    this.armL.rotation.z += (aLz - this.armL.rotation.z) * k(0.07)
    this.armR.rotation.z += (aRz - this.armR.rotation.z) * k(0.07)

    // 頭
    let tilt = 0
    let yaw = Math.sin(ts * 0.37) * 0.15
    let pitch = 0
    if (st === 'thinking') {
      tilt = 0.2 + Math.sin(ts * 0.8) * 0.05
      pitch = -0.1
    } else if (st === 'waiting') {
      yaw = Math.sin(ts * 0.9) * 0.45
    } else if (typing) {
      pitch = 0.15 + Math.sin(ts * 3) * 0.02
      yaw = Math.sin(ts * 0.5) * 0.08
    } else if (st === 'offline' || st === 'away') {
      pitch = 0.3
      tilt = 0.15
    }
    this.head.rotation.z += (tilt - this.head.rotation.z) * k(0.2)
    this.head.rotation.y += (yaw - this.head.rotation.y) * k(0.3)
    this.head.rotation.x += (pitch - this.head.rotation.x) * k(0.2)

    // まばたき（オフラインは目を閉じる）
    this.blinkT -= dt
    let eyeY = 1
    if (st === 'offline') eyeY = 0.12
    else if (this.blinkT < 0.12) eyeY = 0.12
    if (this.blinkT < 0) this.blinkT = 1.8 + Math.random() * 3.5
    for (const e of this.eyes) e.scale.y += (eyeY - e.scale.y) * k(0.03)

    // 口
    if (this.talking || st === 'talking') {
      const open = Math.sin(ts * 14) > 0
      this.openMouth.visible = open
      this.smile.visible = !open
    }

    // アンテナの玉
    if (this.bulb) {
      const rate = st === 'working' ? 7 : st === 'thinking' ? 10 : st === 'waiting' ? 3 : 1.6
      const blink = st === 'waiting' ? (Math.sin(ts * rate) > 0 ? 1 : 0.4) : 0.8 + 0.25 * Math.sin(ts * rate)
      this.bulb.scale.setScalar(0.5 * blink + 0.1)
    }
  }

  dispose(): void {
    for (const m of this.ownMats) m.dispose()
    this.root.removeFromParent()
  }
}
