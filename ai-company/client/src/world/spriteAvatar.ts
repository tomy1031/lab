// 絵（スプライト）の社員。参考デザインの画風で生成したキャラクターの絵（client/public/sprites/）を、
// カメラの方を向く板にして立たせる。ポーズは 立ち / 歩き（立ちと歩きを交互に出す）/ 座り。
// 原点は足元。絵の向き（左向きの 3/4）と逆へ歩くときは左右を反転する。座っているときは机が下半身を隠す。
// 絵が読めなかったときは、コードで組んだちびキャラ（Chibi）に切り替える。
import * as THREE from 'three'
import type { Member, MemberStatus } from '../../../shared/types'
import { spriteIdFor, spriteMeta, spriteUrl, type SpriteMeta, type SpritePose } from '../sprites'
import { Chibi, type Avatar, type Mode } from './chibi'

/** 立ち姿の高さ（m）。昔のちびキャラとほぼ同じ */
export const SPRITE_STAND_H = 1.42
/** 座ったときに持ち上げる高さ（m） */
const SIT_LIFT = 0.1
/** シートの立ち姿の高さ（px）。scripts/slice_sprites.py がそろえた値 */
const STAND_PX = 512

// ------------------------------------------------------------------ 共有（絵・板・影）

const loader = new THREE.TextureLoader()
const texCache = new Map<string, Promise<THREE.Texture>>()

function loadTex(url: string): Promise<THREE.Texture> {
  let p = texCache.get(url)
  if (!p) {
    p = new Promise((resolve, reject) => {
      loader.load(
        url,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace
          // 透明の縁が黒くにじまないよう、乗算済みアルファで読み込む（ミップマップでも縁がきれい）
          t.premultiplyAlpha = true
          t.anisotropy = 4
          t.generateMipmaps = true
          t.minFilter = THREE.LinearMipmapLinearFilter
          t.needsUpdate = true
          resolve(t)
        },
        undefined,
        () => reject(new Error(`sprite ${url}`)),
      )
    })
    texCache.set(url, p)
  }
  return p
}

let planeGeo: THREE.PlaneGeometry | null = null
let shadowGeo: THREE.CircleGeometry | null = null
let shadowMat: THREE.MeshBasicMaterial | null = null

function plane(): THREE.PlaneGeometry {
  planeGeo ??= new THREE.PlaneGeometry(1, 1)
  return planeGeo
}

function contactShadow(): { geo: THREE.CircleGeometry; mat: THREE.MeshBasicMaterial } {
  if (!shadowGeo || !shadowMat) {
    shadowGeo = new THREE.CircleGeometry(0.5, 28)
    shadowGeo.rotateX(-Math.PI / 2)
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(40,60,110,0.55)')
    gr.addColorStop(0.55, 'rgba(40,60,110,0.22)')
    gr.addColorStop(1, 'rgba(40,60,110,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 64, 64)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    shadowMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false })
  }
  return { geo: shadowGeo, mat: shadowMat }
}

/** すべての絵の社員で共有する、最後に描いたカメラの向き（左右の反転に使う） */
const camRight = new THREE.Vector3(1, 0, 0)
const tmpQ = new THREE.Quaternion()
const tmpQ2 = new THREE.Quaternion()
const tmpV = new THREE.Vector3()
const viewAxis = new THREE.Vector3(0, 0, 1)
const UP = new THREE.Vector3(0, 1, 0)

export function hasSprite(m: Member): boolean {
  return spriteIdFor(m) !== null
}

// ------------------------------------------------------------------ 本体

export class SpriteAvatar implements Avatar {
  readonly root = new THREE.Group()
  readonly tagAnchor = new THREE.Object3D()
  readonly headAnchor = new THREE.Object3D()
  /** カメラの方を向く板の支点（足元） */
  private readonly bill = new THREE.Group()
  private readonly mesh: THREE.Mesh
  private readonly mat: THREE.MeshBasicMaterial
  private readonly shadow: THREE.Mesh
  private readonly spriteId: string
  private frames: Partial<Record<SpritePose, { tex: THREE.Texture; meta: SpriteMeta }>> = {}
  private shownPose: SpritePose | null = null
  private fallback: Chibi | null = null
  private mode: Mode = 'stand'
  private status: MemberStatus = 'idle'
  private talking = false
  private ghost = false
  private walkPhase = 0
  private hopV = 0
  private hopY = 0
  private flip = false
  private roll = 0
  private sitLift = 0
  private seed = Math.random() * 100
  private disposed = false

  constructor(private readonly member: Member) {
    this.spriteId = spriteIdFor(member) ?? 'jp-1'
    this.mat = new THREE.MeshBasicMaterial({
      transparent: true,
      premultipliedAlpha: true,
      alphaTest: 0.02,
      depthWrite: true,
      side: THREE.DoubleSide,
      toneMapped: false,
      visible: false,
    })
    this.mesh = new THREE.Mesh(plane(), this.mat)
    this.mesh.renderOrder = 2
    this.mesh.onBeforeRender = (_r, _s, cam) => this.face(cam)
    this.bill.add(this.mesh)
    const sh = contactShadow()
    this.shadow = new THREE.Mesh(sh.geo, sh.mat)
    this.shadow.position.y = 0.012
    this.shadow.scale.set(0.95, 1, 0.62)
    this.shadow.renderOrder = 1
    this.root.add(this.shadow, this.bill)
    this.bill.add(this.tagAnchor, this.headAnchor)
    this.tagAnchor.position.y = SPRITE_STAND_H + 0.12
    this.headAnchor.position.y = SPRITE_STAND_H * 0.72
    void this.load()
  }

  private async load(): Promise<void> {
    try {
      const meta = await spriteMeta()
      const poses: SpritePose[] = ['stand', 'walk', 'sit']
      const loaded = await Promise.all(poses.map((p) => loadTex(spriteUrl(this.spriteId, p))))
      if (this.disposed) return
      poses.forEach((p, i) => {
        const key = `${this.spriteId}-${p}`
        const img = loaded[i].image as { width: number; height: number }
        this.frames[p] = { tex: loaded[i], meta: meta[key] ?? { w: img.width, h: img.height, footY: 0.97, cx: 0.5 } }
      })
      this.mat.visible = true
      this.show(this.mode === 'sit' ? 'sit' : 'stand')
    } catch {
      if (this.disposed) return
      // 絵が無い・読めない：コードのちびキャラにする
      this.fallback = new Chibi(this.member)
      this.root.remove(this.bill, this.shadow)
      this.root.add(this.fallback.root)
      // 名札・吹き出しは自分の目印に付いたまま、目印ごとちびキャラの頭の上へ移す
      this.tagAnchor.position.set(0, 0, 0)
      this.headAnchor.position.set(0, 0, 0)
      this.fallback.tagAnchor.add(this.tagAnchor)
      this.fallback.headAnchor.add(this.headAnchor)
      this.fallback.setMode(this.mode)
      this.fallback.setStatus(this.status)
      this.fallback.setGhost(this.ghost)
    }
  }

  /** ポーズの絵に差し替え（足元が支点に来るよう板をずらす） */
  private show(p: SpritePose): void {
    const f = this.frames[p]
    if (!f || this.shownPose === p) return
    this.shownPose = p
    this.mat.map = f.tex
    this.mat.needsUpdate = true
    const k = SPRITE_STAND_H / STAND_PX
    const w = f.meta.w * k
    const h = f.meta.h * k
    this.mesh.scale.set(w, h, 1)
    this.mesh.position.set(-(f.meta.cx - 0.5) * w, -(0.5 - f.meta.footY) * h, 0)
    // 名札は頭の少し上（座ると下がる）
    const top = f.meta.footY * h
    this.tagAnchor.position.y = top + 0.1
    this.headAnchor.position.y = top * 0.75
  }

  /**
   * 描く直前：板を立てたまま（いすの背もたれや壁にめり込まない）カメラの方へ向け、
   * 見下ろしで縦が縮んで見える分を縦に伸ばして打ち消す。左右の向きと揺れも付ける
   */
  private face(cam: THREE.Camera): void {
    camRight.setFromMatrixColumn(cam.matrixWorld, 0)
    const parent = this.bill.parent
    if (!parent) return
    cam.getWorldDirection(tmpV)
    const yaw = Math.atan2(-tmpV.x, -tmpV.z)
    const pitch = Math.asin(Math.min(1, Math.max(-1, -tmpV.y)))
    parent.getWorldQuaternion(tmpQ).invert()
    tmpQ.multiply(tmpQ2.setFromAxisAngle(UP, yaw))
    if (this.roll) tmpQ.multiply(tmpQ2.setFromAxisAngle(viewAxis, this.roll))
    this.bill.quaternion.copy(tmpQ)
    this.bill.scale.set(this.flip ? -1 : 1, Math.min(1.55, 1 / Math.max(0.2, Math.cos(pitch))), 1)
    this.bill.updateMatrixWorld(true)
  }

  // ------------------------------------------------------------------ Avatar

  setMode(m: Mode): void {
    this.mode = m
    this.fallback?.setMode(m)
  }

  setStatus(s: MemberStatus): void {
    this.status = s
    this.fallback?.setStatus(s)
  }

  setTalking(on: boolean): void {
    this.talking = on
    this.fallback?.setTalking(on)
  }

  hop(strength = 1): void {
    if (this.fallback) return this.fallback.hop(strength)
    if (this.hopY < 0.02) this.hopV = 2.6 * strength
  }

  setGhost(on: boolean): void {
    this.ghost = on
    if (this.fallback) return this.fallback.setGhost(on)
    this.mat.opacity = on ? 0.5 : 1
    this.mat.color.set(on ? '#c9d2e3' : '#ffffff')
    this.mat.depthWrite = !on
    this.shadow.visible = !on && this.mode !== 'sit'
  }

  hitSpheres(): { c: THREE.Vector3; r: number }[] {
    if (this.fallback) return this.fallback.hitSpheres()
    const top = this.tagAnchor.position.y - 0.1
    const head = this.bill.localToWorld(tmpV.set(0, top * 0.74, 0)).clone()
    const body = this.bill.localToWorld(tmpV.set(0, top * 0.32, 0)).clone()
    return [
      { c: head, r: top * 0.3 },
      { c: body, r: top * 0.24 },
    ]
  }

  update(dt: number, t: number, speed: number): void {
    if (this.fallback) return this.fallback.update(dt, t, speed)
    const ts = t + this.seed
    const walking = this.mode === 'walk' && speed > 0.05
    const sitting = this.mode === 'sit'
    const st = this.status

    // ぴょん
    if (this.hopV !== 0 || this.hopY > 0) {
      this.hopV -= 9.8 * dt
      this.hopY = Math.max(0, this.hopY + this.hopV * dt)
      if (this.hopY === 0 && this.hopV < 0) this.hopV = 0
    }

    // 歩く向き：画面の右へ進むときは反転（絵は左向き）
    if (walking) {
      const yaw = this.root.rotation.y
      const d = Math.sin(yaw) * camRight.x + Math.cos(yaw) * camRight.z
      if (d > 0.18) this.flip = true
      else if (d < -0.18) this.flip = false
    } else if (sitting) {
      this.flip = false
    }

    // ポーズ：歩きは「歩き」と「立ち」を一歩ごとに交互に
    let y = 0
    let sx = 1
    let sy = 1
    let roll = 0
    if (walking) {
      this.walkPhase += dt * (4.2 + speed * 1.6)
      const step = Math.sin(this.walkPhase * Math.PI)
      this.show(Math.floor(this.walkPhase) % 2 === 0 ? 'walk' : 'stand')
      y = Math.abs(step) * 0.05
      sy = 1 - Math.abs(step) * 0.025
      roll = step * 0.035
    } else {
      this.show(sitting ? 'sit' : 'stand')
      y = Math.sin(ts * 2.1) * 0.006
      sy = 1 + Math.sin(ts * 2.1) * 0.008
      if (sitting && st === 'working') {
        // タイピング：小刻みにゆれる
        y += Math.abs(Math.sin(ts * 15)) * 0.012
        roll = Math.sin(ts * 7.5) * 0.012
      } else if (st === 'thinking') {
        roll = 0.05 + Math.sin(ts * 0.9) * 0.03
      } else if (st === 'waiting') {
        roll = Math.sin(ts * 1.3) * 0.035
      }
    }
    if (this.talking || st === 'talking') {
      y += Math.abs(Math.sin(ts * 8.5)) * 0.035
      sy *= 1 + Math.sin(ts * 17) * 0.02
    }
    sx = 1 / Math.sqrt(sy)
    this.roll += (roll - this.roll) * (1 - Math.exp(-dt / 0.08))
    // 座っているときは座面（0.33 m）の分だけ少し上げる（絵の足は床の上に描かれている）
    this.sitLift += ((sitting ? SIT_LIFT : 0) - this.sitLift) * (1 - Math.exp(-dt / 0.12))
    this.bill.position.y = y + this.hopY + this.sitLift
    const f = this.shownPose ? this.frames[this.shownPose] : undefined
    if (f) {
      const k = SPRITE_STAND_H / STAND_PX
      this.mesh.scale.set(f.meta.w * k * sx, f.meta.h * k * sy, 1)
    }
    // 足元の影：座っているときは消す（いすの影がある）。跳ぶと小さく
    this.shadow.visible = !this.ghost && !sitting
    const sk = 1 / (1 + this.hopY * 2.5)
    this.shadow.scale.set(0.95 * sk, 1, 0.62 * sk)
  }

  dispose(): void {
    this.disposed = true
    this.fallback?.dispose()
    this.mat.dispose()
    this.root.removeFromParent()
  }
}
