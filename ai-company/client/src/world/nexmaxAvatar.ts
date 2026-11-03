// ネクマックス（会社の統括 AI）を OfficeWorld の「体」として包む。
// モデルは nexmax/（tomy1031/nexmax_chronicle から流用）。モデルの正面は -Z なので、内側で 180° 回して +Z 正面にそろえる。
import * as THREE from 'three'
import type { Look, MemberStatus } from '../../../shared/types'
import type { Avatar, Mode } from './chibi'
import { createNexmax, type NexmaxCharacter } from './nexmax/nexmaxModel'

export const NEXMAX_HEIGHT = 1.75

export class NexmaxAvatar implements Avatar {
  readonly root = new THREE.Group()
  readonly tagAnchor = new THREE.Object3D()
  readonly headAnchor = new THREE.Object3D()
  private readonly nx: NexmaxCharacter
  private readonly inner = new THREE.Group()
  private mode: Mode = 'stand'
  private status: MemberStatus = 'idle'
  private talking = false
  private waveT = 0
  private hopV = 0
  private hopY = 0

  constructor(look: Look) {
    this.nx = createNexmax(NEXMAX_HEIGHT, { variant: look.nexmaxVariant ?? 'protagonist', serial: look.serial })
    this.nx.autoExpression = false
    this.nx.setExpression('happy')
    this.nx.setOreGlow(1.1)
    this.nx.root.rotation.y = Math.PI
    this.inner.add(this.nx.root)
    this.root.add(this.inner)
    this.tagAnchor.position.y = NEXMAX_HEIGHT + 0.25
    this.headAnchor.position.y = NEXMAX_HEIGHT * 0.78
    this.root.add(this.tagAnchor, this.headAnchor)
    this.nx.root.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) m.castShadow = true
    })
  }

  /** 手を振る（秒） */
  wave(sec = 1.6): void {
    this.waveT = sec
  }

  setMode(m: Mode): void {
    this.mode = m
  }

  setStatus(s: MemberStatus): void {
    this.status = s
    this.nx.setExpression(s === 'thinking' ? 'determined' : s === 'waiting' ? 'worried' : 'happy')
    this.nx.setOreGlow(s === 'working' || s === 'thinking' ? 1.8 : 1.1)
  }

  setTalking(on: boolean): void {
    this.talking = on
  }

  hop(strength = 1): void {
    if (this.hopY < 0.02) this.hopV = 2.4 * strength
  }

  setGhost(): void {
    // ネクマックスは消えない
  }

  hitSpheres(): { c: THREE.Vector3; r: number }[] {
    const c = new THREE.Vector3()
    this.root.getWorldPosition(c)
    const h = c.clone()
    c.y += 0.45
    h.y += NEXMAX_HEIGHT * 0.75
    return [
      { c, r: 0.4 },
      { c: h, r: 0.45 },
    ]
  }

  update(dt: number, _t: number, speed: number): void {
    if (this.hopV !== 0 || this.hopY > 0) {
      this.hopV -= 9.8 * dt
      this.hopY = Math.max(0, this.hopY + this.hopV * dt)
      if (this.hopY === 0 && this.hopV < 0) this.hopV = 0
    }
    this.inner.position.y = this.hopY
    this.tagAnchor.position.y = NEXMAX_HEIGHT + 0.25 + this.hopY
    this.waveT = Math.max(0, this.waveT - dt)
    const walking = this.mode === 'walk' && speed > 0.05
    if (walking) this.nx.setPose('walk')
    else if (this.waveT > 0 || this.talking) this.nx.setPose('wave')
    else if (this.hopY > 0.05) this.nx.setPose('jump')
    else this.nx.setPose('idle')
    this.nx.update(dt, walking ? speed : 0)
    void this.status
  }

  dispose(): void {
    this.nx.dispose()
    this.root.removeFromParent()
  }
}
