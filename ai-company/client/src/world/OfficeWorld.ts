// 3D バーチャルオフィス：日本（大阪本社・左）とカンボジア（プノンペン・右）を 1 つの画面で見渡す。
// 社員（人間・AI社員・ネクマックス）を席に出し、やり取りを光の粒で、採用をドアからの登場で見せる。
// 外向きの約束は ./api.ts（OfficeWorldApi）。
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { OFFICES, STATUS_LABEL, type Member, type MemberStatus, type MessageKind, type OfficeId } from '../../../shared/types'
import type { FocusTarget, OfficeWorldApi } from './api'
import { Chibi, type Avatar } from './chibi'
import { Fx, KIND_COLOR } from './fx'
import { DOOR_U, DOOR_Z, HALF_D, OFFICE_CENTER_X, deskSpot, nexmaxHome, officeCenter, officeSign, route, toWorld } from './layout'
import { disposeAllMats } from './mats'
import { NexmaxAvatar } from './nexmaxAvatar'
import { setOutlineViewport } from './nexmax/materials'
import { buildBridge, buildClouds, buildOffice, type BridgeBuild, type OfficeBuild } from './offices'
import './world.css'

type P2 = { u: number; z: number }

const KIND_LABEL: Record<MessageKind, string> = {
  assign: '依頼',
  chat: '会話',
  question: '質問',
  answer: '回答',
  handoff: '引き継ぎ',
  report: '報告',
  review: 'レビュー',
  hire: '採用',
  system: 'お知らせ',
}

const STATUS_ICON: Partial<Record<MemberStatus, string>> = {
  working: '⌨️',
  thinking: '⚙️',
  talking: '💬',
  waiting: '⏳',
  away: '☕',
  offline: '💤',
}

type Entity = {
  id: string
  member: Member
  avatar: Avatar
  office: OfficeId
  /** いまいる場所（オフィスの中の u, z） */
  pos: P2
  /** 向き（世界の yaw）と目標 */
  yaw: number
  yawTarget: number
  path: P2[]
  speed: number
  onArrive: (() => void) | null
  /** 席（座る場所）または立ち位置 */
  home: P2
  homeLane?: number
  seated: boolean
  tag: CSS2DObject
  tagEl: HTMLDivElement
  nameEl: HTMLElement
  roleEl: HTMLElement
  icoEl: HTMLElement
  taskEl: HTMLElement
  bubble: { obj: CSS2DObject; el: HTMLDivElement; until: number } | null
  newUntil: number
  talkUntil: number
  scale: number
  scaleTarget: number
  removing: boolean
  lookKey: string
  /** ネクマックス：届け物の予定 */
  visits: { toId: string; text: string; kind: MessageKind }[]
  busy: boolean
}

function easeInOut(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2
}

function truncate(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

function wrapLabel(inner: HTMLElement, centerY = 1): CSS2DObject {
  const wrap = document.createElement('div')
  wrap.appendChild(inner)
  const o = new CSS2DObject(wrap)
  o.center.set(0.5, centerY)
  return o
}

export class OfficeWorld implements OfficeWorldApi {
  onSelect: ((memberId: string | null) => void) | null = null

  private readonly container: HTMLElement
  private readonly root: HTMLDivElement
  private readonly renderer: THREE.WebGLRenderer
  private readonly labels: CSS2DRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 220)
  private readonly controls: OrbitControls
  private readonly offices: Record<OfficeId, OfficeBuild>
  private readonly bridge: BridgeBuild
  private readonly clouds: ReturnType<typeof buildClouds>
  private readonly fx = new Fx()
  private readonly entities = new Map<string, Entity>()
  private readonly hired = new Set<string>()
  private readonly selRing: THREE.Mesh
  private readonly selMat: THREE.MeshBasicMaterial
  private readonly pmrem: THREE.PMREMGenerator
  private readonly envTex: THREE.Texture
  private readonly ro: ResizeObserver
  private readonly raycaster = new THREE.Raycaster()
  private selected: string | null = null
  private raf = 0
  private last = performance.now()
  private t = 0
  private disposed = false
  private tween: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t: number; dur: number } | null = null
  private focusTarget: FocusTarget = 'all'
  private followId: string | null = null
  private down: { x: number; y: number; t: number } | null = null
  private hoverId: string | null = null
  /** 作業札（作り直しても残す） */
  private readonly taskLabels = new Map<string, string | null>()
  private lastLabelClass = ''
  /** UI のパネルで隠れる幅（CSS px）。見える長方形の中心に向けて写す */
  private insets = { left: 0, right: 0, top: 0, bottom: 0 }
  private viewOff = { x: 0, y: 0 }
  private viewOffTarget = { x: 0, y: 0 }
  /** 描画の統計（調整用） */
  get stats(): { calls: number; triangles: number; entities: number } {
    const r = this.renderer.info.render
    return { calls: r.calls, triangles: r.triangles, entities: this.entities.size }
  }

  constructor(container: HTMLElement) {
    this.container = container
    this.root = document.createElement('div')
    this.root.className = 'ow-root'
    container.appendChild(this.root)

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NeutralToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.setClearColor(0x000000, 0)
    this.root.appendChild(this.renderer.domElement)

    this.labels = new CSS2DRenderer()
    this.labels.domElement.className = 'ow-labels'
    this.root.appendChild(this.labels.domElement)

    // 環境光（ネクマックスの質感用）
    this.pmrem = new THREE.PMREMGenerator(this.renderer)
    const room = new RoomEnvironment()
    this.envTex = this.pmrem.fromScene(room, 0.04).texture
    this.scene.environment = this.envTex
    this.scene.environmentIntensity = 0.55

    // 光：空の色の半球光 + 影を落とす太陽 1 つ
    this.scene.add(new THREE.HemisphereLight('#fdf7ff', '#d8c8b4', 1.55))
    const sun = new THREE.DirectionalLight('#fff3df', 2.1)
    sun.position.set(7, 24, 15)
    sun.target.position.set(0, 0, 0)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 1024)
    const sc = sun.shadow.camera
    sc.left = -19
    sc.right = 19
    sc.top = 9
    sc.bottom = -9
    sc.near = 5
    sc.far = 60
    sun.shadow.bias = -0.0008
    sun.shadow.normalBias = 0.03
    sun.shadow.radius = 3
    this.scene.add(sun, sun.target)

    // オフィス・光の道・雲
    this.offices = {
      jp: buildOffice(OFFICES.find((o) => o.id === 'jp')!),
      kh: buildOffice(OFFICES.find((o) => o.id === 'kh')!),
    }
    this.scene.add(this.offices.jp.group, this.offices.kh.group)
    this.bridge = buildBridge()
    this.scene.add(this.bridge.group)
    const bl = document.createElement('div')
    bl.className = 'ow-bridge-label'
    bl.textContent = 'JAPAN ⇄ CAMBODIA'
    const blo = wrapLabel(bl, 0.5)
    blo.position.copy(this.bridge.top)
    this.scene.add(blo)
    this.clouds = buildClouds()
    this.scene.add(this.clouds.group)
    this.scene.add(this.fx.group)

    // 選択の輪
    this.selMat = new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 40), this.selMat)
    this.selRing.rotation.x = -Math.PI / 2
    this.selRing.visible = false
    this.scene.add(this.selRing)

    // カメラ
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 3.5
    this.controls.maxDistance = 80
    this.controls.minPolarAngle = 0.2
    this.controls.maxPolarAngle = 1.32
    this.controls.screenSpacePanning = true
    this.controls.addEventListener('start', () => {
      this.tween = null
      this.followId = null
    })

    // 入力
    const el = this.renderer.domElement
    el.addEventListener('pointerdown', this.onDown)
    el.addEventListener('pointerup', this.onUp)
    el.addEventListener('pointermove', this.onMove)
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    document.addEventListener('visibilitychange', this.onVis)
    this.resize()
    this.applyFocus('all', true)
    this.loop()
  }

  // ------------------------------------------------------------------ API

  syncMembers(members: Member[]): void {
    const seen = new Set<string>()
    const nexCount: Record<OfficeId, number> = { jp: 0, kh: 0 }
    for (const m of members) {
      seen.add(m.id)
      const nIndex = m.kind === 'nexmax' ? nexCount[m.office]++ : 0
      const e = this.entities.get(m.id)
      if (!e) this.spawn(m, false, nIndex)
      else this.updateEntity(e, m, nIndex)
    }
    for (const [id, e] of this.entities) if (!seen.has(id) && !e.removing) this.remove(e)
  }

  hire(member: Member): void {
    if (this.hired.has(member.id)) return
    this.hired.add(member.id)
    const existing = this.entities.get(member.id)
    if (existing) {
      // 席に出たばかりなら、ドアから出直す
      this.dropEntity(existing)
    }
    const nIndex = member.kind === 'nexmax' ? [...this.entities.values()].filter((e) => e.member.kind === 'nexmax' && e.office === member.office).length : 0
    this.spawn(member, true, nIndex)
  }

  message(fromId: string, toId: string | null, kind: MessageKind, text: string): void {
    const a = this.entities.get(fromId)
    if (!a) return
    this.say(fromId, text, undefined, kind)
    a.talkUntil = this.t + 1.6
    a.avatar.setTalking(true)
    const color = KIND_COLOR[kind] ?? '#54a0ff'

    if (toId === null) {
      const p = this.worldPos(a)
      this.fx.ripple(p, color, 3.2, 1.3)
      setTimeout(() => !this.disposed && this.fx.ripple(this.worldPos(a), color, 4.2, 1.5), 260)
      if (a.avatar instanceof NexmaxAvatar) a.avatar.wave(1.6)
      return
    }
    const b = this.entities.get(toId)
    if (!b || b === a) return

    // ネクマックスの依頼：同じオフィスなら本人が席まで届けに行く
    if (kind === 'assign' && a.avatar instanceof NexmaxAvatar && a.office === b.office && !b.removing) {
      if (a.visits.length < 4) {
        a.visits.push({ toId, text, kind })
        if (!a.busy) this.nextVisit(a)
        return
      }
    }
    if (a.avatar instanceof NexmaxAvatar) a.avatar.wave(1.4)
    this.sendPacket(a, b, color)
  }

  say(memberId: string, text: string, ms?: number, kind: MessageKind = 'chat'): void {
    const e = this.entities.get(memberId)
    if (!e || !text) return
    const dur = ms ?? Math.min(6500, 2600 + text.length * 45)
    if (e.bubble) {
      e.bubble.obj.removeFromParent()
      e.bubble = null
    }
    const el = document.createElement('div')
    el.className = 'ow-bubble'
    el.style.setProperty('--k', KIND_COLOR[kind] ?? '#54a0ff')
    const k = document.createElement('span')
    k.className = 'ow-kind'
    k.textContent = KIND_LABEL[kind] ?? ''
    el.appendChild(k)
    el.appendChild(document.createTextNode(truncate(text, 60)))
    const obj = wrapLabel(el, 1)
    obj.position.y = 0.5
    e.avatar.tagAnchor.add(obj)
    e.bubble = { obj, el, until: this.t + dur / 1000 }
  }

  setTaskLabel(memberId: string, label: string | null): void {
    const e = this.entities.get(memberId)
    if (!e) return
    this.taskLabels.set(memberId, label)
    e.taskEl.hidden = !label
    e.taskEl.textContent = label ? `📄 ${truncate(label, 16)}` : ''
    e.taskEl.title = label ?? ''
  }

  celebrate(memberId: string): void {
    const e = this.entities.get(memberId)
    if (!e) return
    e.avatar.hop(1)
    setTimeout(() => !this.disposed && e.avatar.hop(0.7), 520)
    const p = this.worldPos(e)
    p.y += 1.1
    this.fx.burst(p, 'sparkle', 28)
  }

  focus(target: FocusTarget): void {
    this.applyFocus(target, false)
  }

  setSelected(memberId: string | null): void {
    if (this.selected) this.entities.get(this.selected)?.tagEl.classList.remove('selected')
    this.selected = memberId && this.entities.has(memberId) ? memberId : null
    if (this.selected) this.entities.get(this.selected)!.tagEl.classList.add('selected')
    this.selRing.visible = !!this.selected
  }

  setInsets(insets: { left: number; right: number; top: number; bottom: number }): void {
    const i = { left: Math.max(0, insets.left), right: Math.max(0, insets.right), top: Math.max(0, insets.top), bottom: Math.max(0, insets.bottom) }
    const same = i.left === this.insets.left && i.right === this.insets.right && i.top === this.insets.top && i.bottom === this.insets.bottom
    this.insets = i
    if (same) return
    this.updateViewOffsetTarget()
    if (typeof this.focusTarget === 'string' || this.followId) this.applyFocus(this.focusTarget, false)
  }

  /** 実際に使う隠れ幅（見える所が狭すぎるときは無視する） */
  private effInsets(): { left: number; right: number; top: number; bottom: number } {
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    const i = { ...this.insets }
    if (w - i.left - i.right < Math.min(360, w * 0.45)) {
      i.left = 0
      i.right = 0
    }
    if (h - i.top - i.bottom < Math.min(260, h * 0.45)) {
      i.top = 0
      i.bottom = 0
    }
    return i
  }

  private updateViewOffsetTarget(): void {
    const i = this.effInsets()
    this.viewOffTarget = { x: -(i.left - i.right) / 2, y: -(i.top - i.bottom) / 2 }
  }

  private applyViewOffset(): void {
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    if (Math.abs(this.viewOff.x) < 0.5 && Math.abs(this.viewOff.y) < 0.5) this.camera.clearViewOffset()
    else this.camera.setViewOffset(w, h, this.viewOff.x, this.viewOff.y, w, h)
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    document.removeEventListener('visibilitychange', this.onVis)
    const el = this.renderer.domElement
    el.removeEventListener('pointerdown', this.onDown)
    el.removeEventListener('pointerup', this.onUp)
    el.removeEventListener('pointermove', this.onMove)
    for (const e of this.entities.values()) this.dropEntity(e)
    this.entities.clear()
    this.offices.jp.dispose()
    this.offices.kh.dispose()
    this.bridge.dispose()
    this.fx.dispose()
    this.selRing.geometry.dispose()
    this.selMat.dispose()
    this.envTex.dispose()
    this.pmrem.dispose()
    this.controls.dispose()
    this.renderer.dispose()
    disposeAllMats()
    this.root.remove()
  }

  // ------------------------------------------------------------------ 社員

  private makeAvatar(m: Member): Avatar {
    return m.kind === 'nexmax' ? new NexmaxAvatar(m.look) : new Chibi(m)
  }

  private homeOf(m: Member, nIndex: number): { home: P2; lane?: number; seated: boolean } {
    if (m.kind === 'nexmax' || m.deskIndex < 0) return { home: nexmaxHome(nIndex), seated: false }
    const d = deskSpot(m.deskIndex)
    return { home: d.chair, lane: d.overflow ? undefined : d.laneZ, seated: !d.overflow }
  }

  private spawn(m: Member, viaDoor: boolean, nIndex: number): Entity {
    const avatar = this.makeAvatar(m)
    const { home, lane, seated } = this.homeOf(m, nIndex)

    const tagEl = document.createElement('div')
    tagEl.className = 'ow-tag'
    const chip = document.createElement('div')
    chip.className = 'ow-chip'
    const ico = document.createElement('span')
    ico.className = 'ow-ico'
    const dot = document.createElement('span')
    dot.className = 'ow-dot'
    const name = document.createElement('b')
    name.className = 'ow-name'
    const nw = document.createElement('span')
    nw.className = 'ow-new'
    nw.textContent = 'NEW'
    chip.append(ico, dot, name, nw)
    const role = document.createElement('div')
    role.className = 'ow-role'
    const task = document.createElement('div')
    task.className = 'ow-task'
    task.hidden = true
    tagEl.append(task, chip, role)
    tagEl.addEventListener('click', (ev) => {
      ev.stopPropagation()
      this.onSelect?.(m.id)
    })
    const tag = wrapLabel(tagEl, 1)
    avatar.tagAnchor.add(tag)

    const e: Entity = {
      id: m.id,
      member: m,
      avatar,
      office: m.office,
      pos: viaDoor && m.kind !== 'nexmax' ? { u: DOOR_U, z: DOOR_Z + 0.45 } : { ...home },
      yaw: 0,
      yawTarget: 0,
      path: [],
      speed: 0,
      onArrive: null,
      home,
      homeLane: lane,
      seated,
      tag,
      tagEl,
      nameEl: name,
      roleEl: role,
      icoEl: ico,
      taskEl: task,
      bubble: null,
      newUntil: viaDoor ? this.t + 25 : 0,
      talkUntil: 0,
      scale: viaDoor ? 0.01 : 1,
      scaleTarget: 1,
      removing: false,
      lookKey: JSON.stringify(m.look) + m.kind,
      visits: [],
      busy: false,
    }
    this.entities.set(m.id, e)
    this.scene.add(avatar.root)
    this.applyMember(e, m)
    const tl = this.taskLabels.get(m.id)
    if (tl) this.setTaskLabel(m.id, tl)

    if (viaDoor) {
      const office = this.offices[m.office]
      office.openDoor()
      const doorPos = toWorld(m.office, DOOR_U, DOOR_Z + 0.6, 1.0)
      this.fx.burst(doorPos, 'confetti', 70)
      this.fx.ripple(toWorld(m.office, DOOR_U, DOOR_Z + 0.9, 0.05), KIND_COLOR.hire, 2.4, 1.2)
      this.bridge.pulse()
      setTimeout(() => {
        if (this.disposed || e.removing) return
        e.avatar.hop(1)
        if (m.kind === 'nexmax') {
          ;(e.avatar as NexmaxAvatar).wave(2)
        } else {
          this.walkTo(e, home, lane, () => {
            this.settle(e)
            this.celebrate(e.id)
          })
        }
      }, 450)
      e.yaw = e.yawTarget = 0
    } else {
      this.settle(e)
    }
    this.place(e)
    return e
  }

  /** 名前・役割・状態を反映（見た目が変わったら作り直す） */
  private updateEntity(e: Entity, m: Member, nIndex: number): void {
    const lookKey = JSON.stringify(m.look) + m.kind
    if (lookKey !== e.lookKey) {
      const keepPos = e.pos
      this.dropEntity(e)
      const ne = this.spawn(m, false, nIndex)
      ne.pos = keepPos
      return
    }
    const officeChanged = m.office !== e.office
    const deskChanged = m.deskIndex !== e.member.deskIndex
    e.member = m
    this.applyMember(e, m)
    if (officeChanged || deskChanged || (m.kind === 'nexmax' && !e.busy)) {
      const { home, lane, seated } = this.homeOf(m, nIndex)
      const moved = home.u !== e.home.u || home.z !== e.home.z
      e.home = home
      e.homeLane = lane
      e.seated = seated
      if (officeChanged) {
        // 別のオフィスへ異動：その場で消えて、新しい席に現れる
        e.office = m.office
        e.pos = { ...home }
        e.path = []
        this.settle(e)
        this.fx.burst(this.worldPos(e).setY(1), 'sparkle', 24)
      } else if (moved && !e.busy) {
        this.walkTo(e, home, lane, () => this.settle(e))
      }
    }
  }

  private applyMember(e: Entity, m: Member): void {
    e.nameEl.textContent = m.name
    e.roleEl.textContent = m.role
    e.tagEl.title = `${m.name}（${m.role}）— ${STATUS_LABEL[m.status]}${m.statusText ? `：${m.statusText}` : ''}`
    e.tagEl.className = `ow-tag kind-${m.kind} st-${m.status}${e.newUntil > this.t ? ' is-new' : ''}${this.selected === m.id ? ' selected' : ''}`
    e.icoEl.textContent = STATUS_ICON[m.status] ?? ''
    e.avatar.setStatus(m.status)
    e.avatar.setGhost(m.status === 'offline' || m.status === 'away')
  }

  private remove(e: Entity): void {
    e.removing = true
    e.scaleTarget = 0
    this.fx.burst(this.worldPos(e).setY(0.8), 'pop', 18)
    setTimeout(() => {
      if (this.entities.get(e.id) === e) {
        this.dropEntity(e)
        this.entities.delete(e.id)
      }
    }, 450)
  }

  private dropEntity(e: Entity): void {
    e.tag.removeFromParent()
    e.bubble?.obj.removeFromParent()
    e.avatar.dispose()
    if (this.selected === e.id) this.selRing.visible = false
    this.entities.delete(e.id)
  }

  private settle(e: Entity): void {
    e.path = []
    e.speed = 0
    e.pos = { ...e.home }
    if (e.seated) {
      e.avatar.setMode('sit')
      e.yawTarget = 0
    } else {
      e.avatar.setMode('stand')
      e.yawTarget = 0
    }
  }

  private walkTo(e: Entity, to: P2, lane: number | undefined, onArrive: () => void): void {
    e.path = route(e.pos, to, lane)
    e.onArrive = onArrive
    e.avatar.setMode('walk')
  }

  private nextVisit(nx: Entity): void {
    const v = nx.visits.shift()
    if (!v) {
      nx.busy = false
      if (Math.abs(nx.pos.u - nx.home.u) > 0.05 || Math.abs(nx.pos.z - nx.home.z) > 0.05) this.walkTo(nx, nx.home, undefined, () => this.settle(nx))
      return
    }
    const target = this.entities.get(v.toId)
    if (!target || target.removing || target.office !== nx.office) {
      this.nextVisit(nx)
      return
    }
    nx.busy = true
    const d = target.member.deskIndex >= 0 ? deskSpot(target.member.deskIndex) : null
    const spot: P2 = d ? (d.overflow ? { u: d.front.u, z: d.front.z } : d.front) : { u: target.pos.u, z: target.pos.z + 0.9 }
    this.walkTo(nx, spot, undefined, () => {
      nx.avatar.setMode('stand')
      nx.yawTarget = Math.PI
      ;(nx.avatar as NexmaxAvatar).wave(1.5)
      this.say(nx.id, v.text, 3200, v.kind)
      this.sendPacket(nx, target, KIND_COLOR[v.kind])
      setTimeout(() => {
        if (this.disposed || !this.entities.has(nx.id)) return
        if (nx.visits.length) this.nextVisit(nx)
        else {
          nx.busy = false
          this.walkTo(nx, nx.home, undefined, () => this.settle(nx))
        }
      }, 1500)
    })
  }

  // ------------------------------------------------------------------ やり取りの光

  private headPos(e: Entity): THREE.Vector3 {
    const v = new THREE.Vector3()
    e.avatar.headAnchor.getWorldPosition(v)
    return v
  }

  private sendPacket(a: Entity, b: Entity, color: string): void {
    const pa = this.headPos(a)
    const pb = this.headPos(b)
    let curve: THREE.Curve<THREE.Vector3>
    let len: number
    if (a.office === b.office) {
      const mid = pa.clone().lerp(pb, 0.5)
      mid.y += 1.2 + pa.distanceTo(pb) * 0.22
      curve = new THREE.QuadraticBezierCurve3(pa, mid, pb)
      len = curve.getLength()
    } else {
      const br = a.office === 'jp' ? this.bridge.curve : this.bridge.reverse
      const s0 = br.getPoint(0)
      const s1 = br.getPoint(1)
      const path = new THREE.CurvePath<THREE.Vector3>()
      const m1 = pa.clone().lerp(s0, 0.5)
      m1.y = Math.max(pa.y, s0.y) + 1.6
      const m2 = s1.clone().lerp(pb, 0.5)
      m2.y = Math.max(pb.y, s1.y) + 1.6
      path.add(new THREE.QuadraticBezierCurve3(pa, m1, s0))
      path.add(br)
      path.add(new THREE.QuadraticBezierCurve3(s1, m2, pb))
      curve = path
      len = path.getLength()
      this.bridge.pulse()
    }
    const dur = Math.max(0.75, Math.min(3.4, len / 9))
    this.fx.packet(curve, color, dur, () => {
      if (this.disposed || !this.entities.has(b.id)) return
      b.avatar.hop(0.45)
      this.fx.burst(this.headPos(b), 'pop', 12, [color, '#ffffff'])
    })
  }

  // ------------------------------------------------------------------ 毎フレーム

  private worldPos(e: Entity, out = new THREE.Vector3()): THREE.Vector3 {
    return toWorld(e.office, e.pos.u, e.pos.z, 0, out)
  }

  private place(e: Entity): void {
    this.worldPos(e, e.avatar.root.position)
    e.avatar.root.rotation.y = e.yaw
    e.avatar.root.scale.setScalar(Math.max(0.001, e.scale))
  }

  private step(e: Entity, dt: number): void {
    const s = officeSign(e.office)
    if (e.path.length) {
      const target = e.path[0]
      const du = target.u - e.pos.u
      const dz = target.z - e.pos.z
      const dist = Math.hypot(du, dz)
      const max = e.member.kind === 'nexmax' ? 2.1 : 1.7
      e.speed += (max - e.speed) * (1 - Math.exp(-dt / 0.15))
      const stepLen = e.speed * dt
      if (dist <= stepLen || dist < 1e-4) {
        e.pos = { ...target }
        e.path.shift()
        if (!e.path.length) {
          e.speed = 0
          const cb = e.onArrive
          e.onArrive = null
          cb?.()
        }
      } else {
        e.pos.u += (du / dist) * stepLen
        e.pos.z += (dz / dist) * stepLen
        e.yawTarget = Math.atan2(s * du, dz)
      }
    }
    // 向き
    let d = e.yawTarget - e.yaw
    d = Math.atan2(Math.sin(d), Math.cos(d))
    e.yaw += d * (1 - Math.exp(-dt / 0.1))
    e.scale += (e.scaleTarget - e.scale) * (1 - Math.exp(-dt / (e.scaleTarget > e.scale ? 0.12 : 0.08)))
  }

  private loop = (): void => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    const now = performance.now()
    const realDt = Math.min(0.5, (now - this.last) / 1000)
    const dt = Math.min(0.05, realDt)
    this.last = now
    this.t += dt
    const date = new Date()

    for (const e of this.entities.values()) {
      this.step(e, dt)
      if (e.talkUntil && this.t > e.talkUntil) {
        e.talkUntil = 0
        e.avatar.setTalking(false)
      }
      e.avatar.update(dt, this.t, e.path.length ? e.speed : 0)
      this.place(e)
      if (e.bubble && this.t > e.bubble.until) {
        const b = e.bubble
        if (!b.el.classList.contains('out')) {
          b.el.classList.add('out')
          b.until = this.t + 0.4
        } else {
          b.obj.removeFromParent()
          e.bubble = null
        }
      }
      if (e.newUntil && this.t > e.newUntil) {
        e.newUntil = 0
        e.tagEl.classList.remove('is-new')
      }
    }

    // 選択の輪とカメラの追従
    if (this.selected) {
      const e = this.entities.get(this.selected)
      if (e) {
        this.worldPos(e, this.selRing.position).setY(0.04)
        const k = 1 + Math.sin(this.t * 4) * 0.08
        this.selRing.scale.set(k, k, k)
        this.selMat.opacity = 0.65 + Math.sin(this.t * 4) * 0.25
      }
    }
    if (this.followId && !this.tween) {
      const e = this.entities.get(this.followId)
      if (e && e.path.length) {
        const p = this.worldPos(e).setY(0.9)
        const delta = p.clone().sub(this.controls.target).multiplyScalar(1 - Math.exp(-dt / 0.4))
        this.controls.target.add(delta)
        this.camera.position.add(delta)
      }
    }

    if (this.viewOff.x !== this.viewOffTarget.x || this.viewOff.y !== this.viewOffTarget.y) {
      const k = 1 - Math.exp(-realDt / 0.18)
      this.viewOff.x += (this.viewOffTarget.x - this.viewOff.x) * k
      this.viewOff.y += (this.viewOffTarget.y - this.viewOff.y) * k
      if (Math.abs(this.viewOff.x - this.viewOffTarget.x) < 0.5 && Math.abs(this.viewOff.y - this.viewOffTarget.y) < 0.5) this.viewOff = { ...this.viewOffTarget }
      this.applyViewOffset()
    }

    if (this.tween) {
      const tw = this.tween
      tw.t += realDt
      const u = easeInOut(Math.min(1, tw.t / tw.dur))
      this.camera.position.lerpVectors(tw.from, tw.to, u)
      this.controls.target.lerpVectors(tw.tFrom, tw.tTo, u)
      if (tw.t >= tw.dur) this.tween = null
    }
    this.controls.update()

    // 遠いときは名札を小さく
    const dist = this.camera.position.distanceTo(this.controls.target)
    const cls = dist > 62 ? 'ow-labels far very-far' : dist > 22 ? 'ow-labels far' : 'ow-labels'
    if (cls !== this.lastLabelClass) {
      this.labels.domElement.className = cls
      this.lastLabelClass = cls
    }

    this.offices.jp.update(dt, this.t, date)
    this.offices.kh.update(dt, this.t, date)
    this.bridge.update(dt, this.t)
    this.clouds.update(dt, this.t)
    this.fx.update(dt)

    this.renderer.render(this.scene, this.camera)
    this.labels.render(this.scene, this.camera)
  }

  private onVis = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(this.raf)
      this.raf = 0
    } else if (!this.disposed && !this.raf) {
      this.last = performance.now()
      this.loop()
    }
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    this.renderer.setSize(w, h, false)
    this.renderer.domElement.style.width = `${w}px`
    this.renderer.domElement.style.height = `${h}px`
    this.labels.setSize(w, h)
    this.camera.aspect = w / h
    this.updateViewOffsetTarget()
    this.viewOff = { ...this.viewOffTarget }
    this.applyViewOffset()
    this.camera.updateProjectionMatrix()
    const size = new THREE.Vector2()
    this.renderer.getDrawingBufferSize(size)
    setOutlineViewport(size.y)
    if (!this.tween && typeof this.focusTarget === 'string' && !this.followId) this.applyFocus(this.focusTarget, true)
  }

  // ------------------------------------------------------------------ カメラ

  /** 幅 width・奥行き depth の範囲が収まる距離 */
  private fitDistance(width: number, depth: number, elev: number): number {
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    const i = this.effInsets()
    const visW = Math.max(1, w - i.left - i.right) / w
    const visH = Math.max(1, h - i.top - i.bottom) / h
    const vfov = THREE.MathUtils.degToRad(this.camera.fov)
    const tanV = Math.tan(vfov / 2) * visH
    const tanH = Math.tan(vfov / 2) * this.camera.aspect * visW
    const dW = width / 2 / tanH
    const projDepth = depth * Math.sin(elev) + 2.5 * Math.cos(elev)
    const dH = projDepth / 2 / tanV
    return Math.max(dW, dH) * 1.13
  }

  private applyFocus(target: FocusTarget, instant: boolean): void {
    this.focusTarget = target
    this.followId = null
    let tgt: THREE.Vector3
    let dist: number
    let elev = THREE.MathUtils.degToRad(40)
    const azim = 0
    if (target === 'all') {
      tgt = new THREE.Vector3(0, 0.2, 0.6)
      dist = this.fitDistance((OFFICE_CENTER_X + 7.3) * 2, HALF_D * 2 + 1, elev)
    } else if (target === 'jp' || target === 'kh') {
      tgt = officeCenter(target).add(new THREE.Vector3(0, 0.4, 0.4))
      dist = this.fitDistance(15.2, HALF_D * 2 + 0.6, elev)
    } else {
      const e = this.entities.get(target.memberId)
      if (!e) return
      tgt = this.worldPos(e).setY(0.9)
      dist = 7.5
      elev = THREE.MathUtils.degToRad(30)
      this.followId = e.id
    }
    const pos = tgt.clone().add(new THREE.Vector3(Math.sin(azim) * Math.cos(elev), Math.sin(elev), Math.cos(azim) * Math.cos(elev)).multiplyScalar(dist))
    if (instant) {
      this.camera.position.copy(pos)
      this.controls.target.copy(tgt)
      this.tween = null
      this.controls.update()
    } else {
      this.tween = { from: this.camera.position.clone(), to: pos, tFrom: this.controls.target.clone(), tTo: tgt, t: 0, dur: 1.0 }
    }
  }

  // ------------------------------------------------------------------ 選ぶ

  private pick(clientX: number, clientY: number): string | null {
    const r = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    const ray = this.raycaster.ray
    let best: string | null = null
    let bestD = Infinity
    const hit = new THREE.Vector3()
    for (const e of this.entities.values()) {
      if (e.removing) continue
      for (const s of e.avatar.hitSpheres()) {
        if (ray.intersectSphere(new THREE.Sphere(s.c, s.r), hit)) {
          const d = hit.distanceTo(ray.origin)
          if (d < bestD) {
            bestD = d
            best = e.id
          }
        }
      }
    }
    return best
  }

  private onDown = (ev: PointerEvent): void => {
    this.down = { x: ev.clientX, y: ev.clientY, t: performance.now() }
  }

  private onUp = (ev: PointerEvent): void => {
    const d = this.down
    this.down = null
    if (!d) return
    if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 6 || performance.now() - d.t > 600) return
    this.onSelect?.(this.pick(ev.clientX, ev.clientY))
  }

  private onMove = (ev: PointerEvent): void => {
    if (this.down) return
    const id = this.pick(ev.clientX, ev.clientY)
    if (id !== this.hoverId) {
      this.hoverId = id
      this.renderer.domElement.style.cursor = id ? 'pointer' : ''
    }
  }
}
