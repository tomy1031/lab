// 演出：やり取りの光の粒（尾を引いて弧を描く）、紙吹雪・きらきら、波紋。
import * as THREE from 'three'
import type { MessageKind } from '../../../shared/types'
import { glowTexture } from './textures'

export const KIND_COLOR: Record<MessageKind, string> = {
  assign: '#ff9f43',
  chat: '#54a0ff',
  question: '#ffd23f',
  answer: '#1dd1a1',
  handoff: '#a06cff',
  report: '#10c9a0',
  review: '#ff6b9a',
  hire: '#ffd32a',
  system: '#b8c6db',
}

type Packet = {
  group: THREE.Group
  head: THREE.Sprite
  core: THREE.Mesh
  trail: THREE.Sprite[]
  curve: THREE.Curve<THREE.Vector3> | null
  t: number
  dur: number
  onArrive?: () => void
  active: boolean
}

type Particle = {
  p: THREE.Vector3
  v: THREE.Vector3
  r: THREE.Euler
  rv: THREE.Vector3
  life: number
  max: number
  size: number
  g: number
  drag: number
}

type Ripple = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; dur: number; max: number; active: boolean }

const TRAIL = 7
const MAX_PARTICLES = 700

export class Fx {
  readonly group = new THREE.Group()
  private readonly packets: Packet[] = []
  private readonly spriteMats = new Map<string, THREE.SpriteMaterial>()
  private readonly coreGeo = new THREE.SphereGeometry(0.07, 10, 8)
  private readonly coreMat = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  private readonly confetti: THREE.InstancedMesh
  private readonly particles: (Particle | null)[] = new Array(MAX_PARTICLES).fill(null)
  private nextP = 0
  private readonly ripples: Ripple[] = []
  private readonly rippleGeo = new THREE.RingGeometry(0.85, 1, 48)
  private readonly tmpO = new THREE.Object3D()
  private readonly tmpV = new THREE.Vector3()
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0)

  constructor() {
    const geo = new THREE.PlaneGeometry(1, 1.4)
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: '#ffffff' })
    this.confetti = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES)
    this.confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.confetti.frustumCulled = false
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.confetti.setMatrixAt(i, this.zero)
      this.confetti.setColorAt(i, new THREE.Color('#ffffff'))
    }
    this.group.add(this.confetti)
  }

  private spriteMat(color: string): THREE.SpriteMaterial {
    let m = this.spriteMats.get(color)
    if (!m) {
      m = new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
      this.spriteMats.set(color, m)
    }
    return m
  }

  /** 光の粒を曲線に沿って飛ばす */
  packet(curve: THREE.Curve<THREE.Vector3>, color: string, dur: number, onArrive?: () => void): void {
    let p = this.packets.find((x) => !x.active)
    if (!p) {
      const group = new THREE.Group()
      const head = new THREE.Sprite()
      head.scale.setScalar(0.62)
      const core = new THREE.Mesh(this.coreGeo, this.coreMat)
      const trail: THREE.Sprite[] = []
      for (let i = 0; i < TRAIL; i++) {
        const s = new THREE.Sprite()
        const k = 1 - (i + 1) / (TRAIL + 1)
        s.scale.setScalar(0.42 * k + 0.06)
        trail.push(s)
        group.add(s)
      }
      group.add(head, core)
      this.group.add(group)
      p = { group, head, core, trail, curve: null, t: 0, dur: 1, active: false }
      this.packets.push(p)
    }
    const mat = this.spriteMat(color)
    p.head.material = mat
    for (const s of p.trail) s.material = mat
    p.curve = curve
    p.t = 0
    p.dur = dur
    p.onArrive = onArrive
    p.active = true
    p.group.visible = true
    this.place(p)
  }

  private place(p: Packet): void {
    const c = p.curve!
    const u = Math.min(1, p.t / p.dur)
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
    c.getPointAt(e, this.tmpV)
    p.head.position.copy(this.tmpV)
    p.core.position.copy(this.tmpV)
    for (let i = 0; i < p.trail.length; i++) {
      const ue = Math.max(0, e - (i + 1) * 0.022)
      c.getPointAt(ue, this.tmpV)
      p.trail[i].position.copy(this.tmpV)
      p.trail[i].visible = ue > 0
    }
  }

  /** 紙吹雪（confetti）・きらきら（sparkle）・ぱっと弾ける（pop） */
  burst(pos: THREE.Vector3, kind: 'confetti' | 'sparkle' | 'pop', count = 40, colors?: string[]): void {
    const palette =
      colors ?? (kind === 'confetti' ? ['#ff7aa2', '#ffd23f', '#54a0ff', '#1dd1a1', '#a06cff', '#ff9f43'] : kind === 'sparkle' ? ['#fff6a8', '#ffffff', '#ffe066', '#9ff0ff'] : ['#ffffff', '#c8fbff'])
    const col = new THREE.Color()
    for (let n = 0; n < count; n++) {
      const i = this.nextP
      this.nextP = (this.nextP + 1) % MAX_PARTICLES
      const a = Math.random() * Math.PI * 2
      const up = kind === 'confetti' ? 3.2 + Math.random() * 2.2 : kind === 'sparkle' ? 1.2 + Math.random() * 1.4 : 0.6 + Math.random()
      const out = kind === 'confetti' ? 1 + Math.random() * 1.8 : kind === 'sparkle' ? 0.6 + Math.random() * 0.9 : 1.6 + Math.random()
      this.particles[i] = {
        p: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, Math.random() * 0.2, (Math.random() - 0.5) * 0.2)),
        v: new THREE.Vector3(Math.cos(a) * out, up, Math.sin(a) * out),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        rv: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12),
        life: 0,
        max: kind === 'confetti' ? 2.2 + Math.random() : kind === 'sparkle' ? 0.9 + Math.random() * 0.5 : 0.45,
        size: kind === 'confetti' ? 0.09 + Math.random() * 0.05 : kind === 'sparkle' ? 0.07 + Math.random() * 0.05 : 0.05,
        g: kind === 'confetti' ? 4.2 : kind === 'sparkle' ? 1.2 : 0,
        drag: kind === 'confetti' ? 1.6 : 2.5,
      }
      col.set(palette[n % palette.length])
      this.confetti.setColorAt(i, col)
    }
    if (this.confetti.instanceColor) this.confetti.instanceColor.needsUpdate = true
  }

  /** 床に広がる波紋 */
  ripple(pos: THREE.Vector3, color: string, max = 3, dur = 1.2): void {
    let r = this.ripples.find((x) => !x.active)
    if (!r) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
      const mesh = new THREE.Mesh(this.rippleGeo, mat)
      mesh.rotation.x = -Math.PI / 2
      this.group.add(mesh)
      r = { mesh, mat, t: 0, dur, max, active: false }
      this.ripples.push(r)
    }
    r.mat.color.set(color)
    r.mesh.position.copy(pos)
    r.mesh.position.y = Math.max(pos.y, 0.04)
    r.t = 0
    r.dur = dur
    r.max = max
    r.active = true
    r.mesh.visible = true
  }

  update(dt: number): void {
    for (const p of this.packets) {
      if (!p.active) continue
      p.t += dt
      if (p.t >= p.dur) {
        p.active = false
        p.group.visible = false
        const cb = p.onArrive
        p.onArrive = undefined
        cb?.()
        continue
      }
      this.place(p)
    }

    let any = false
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const q = this.particles[i]
      if (!q) continue
      any = true
      q.life += dt
      if (q.life >= q.max) {
        this.particles[i] = null
        this.confetti.setMatrixAt(i, this.zero)
        continue
      }
      q.v.y -= q.g * dt
      q.v.multiplyScalar(Math.exp(-q.drag * dt))
      q.p.addScaledVector(q.v, dt)
      if (q.p.y < 0.02) {
        q.p.y = 0.02
        q.v.set(0, 0, 0)
      }
      q.r.x += q.rv.x * dt
      q.r.y += q.rv.y * dt
      q.r.z += q.rv.z * dt
      const fade = Math.min(1, (q.max - q.life) / 0.35)
      this.tmpO.position.copy(q.p)
      this.tmpO.rotation.copy(q.r)
      this.tmpO.scale.setScalar(q.size * fade)
      this.tmpO.updateMatrix()
      this.confetti.setMatrixAt(i, this.tmpO.matrix)
    }
    if (any) this.confetti.instanceMatrix.needsUpdate = true

    for (const r of this.ripples) {
      if (!r.active) continue
      r.t += dt
      const u = r.t / r.dur
      if (u >= 1) {
        r.active = false
        r.mesh.visible = false
        continue
      }
      const s = 0.3 + u * r.max
      r.mesh.scale.set(s, s, s)
      r.mat.opacity = (1 - u) * 0.8
    }
  }

  dispose(): void {
    this.coreGeo.dispose()
    this.coreMat.dispose()
    for (const m of this.spriteMats.values()) m.dispose()
    this.confetti.geometry.dispose()
    ;(this.confetti.material as THREE.Material).dispose()
    this.rippleGeo.dispose()
    for (const r of this.ripples) r.mat.dispose()
    this.group.removeFromParent()
  }
}
