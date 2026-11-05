// 3D バーチャルオフィス：大阪本社（左手前）・東京オフィス（大阪の奥に浮かぶ島）・プノンペンオフィス（右）を 1 つの画面で見渡す。
// 社員（人間・AI社員・ネクマックス）を席に出し、やり取りを光の粒で、採用をドアからの登場で見せる。
// 動き：ネクマックスが依頼の札を届けに歩く／相談中（talking）は会議室へ／引き継ぎは相手の席まで／ひまな人はときどきラウンジや窓へ。
// 人間へのお願いは、オレンジの札・頭の上の「！」・足元の輪で目立たせる。
// 外向きの約束は ./api.ts（OfficeWorldApi）。
import { BRIDGE_MARK } from '../brand'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { STATUS_LABEL, countryOf, normalizeOffice, officeInfo, type Member, type MemberStatus, type MessageKind, type OfficeId } from '../../../shared/types'
import type { FocusTarget, OfficeBoard, OfficeWorldApi, TaskLabelOptions } from './api'
import { Chibi, type Avatar } from './chibi'
import { Fx, KIND_COLOR } from './fx'
import { ALL_OFFICES, deskSpot, exitOf, layoutOf, routeTo, toWorld, type P2, type Spot } from './layout'
import { disposeAllMats } from './mats'
import { NexmaxAvatar } from './nexmaxAvatar'
import { setOutlineViewport } from './nexmax/materials'
import { buildBridge, buildClouds, buildOffice, buildTokyoWalkway, type BridgeBuild, type OfficeBuild, type WalkwayBuild } from './offices'
import { SpriteAvatar, hasSprite } from './spriteAvatar'

const PARAMS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
const FORCE_CHIBI = PARAMS.has('chibi')
/** ?lowfx：やわらかい光（ブルーム）を使わない。重い端末では自動でも切る */
const LOW_FX = PARAMS.has('lowfx')

/** 空のグラデーション（参考デザインの明るい空色）。キャンバスを不透明にして、光のにじみをきれいに重ねる */
function skyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 512
  const g = c.getContext('2d')!
  const gr = g.createLinearGradient(0, 0, 0, 512)
  gr.addColorStop(0, '#a9d8ff')
  gr.addColorStop(0.38, '#cfeaff')
  gr.addColorStop(0.7, '#e9f5ff')
  gr.addColorStop(1, '#fbeef6')
  g.fillStyle = gr
  g.fillRect(0, 0, 4, 512)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
import './world.css'

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

const HUMAN_COLOR = '#ff8a2a'

type Activity = 'home' | 'visit' | 'meeting' | 'wander' | 'walking-home' | 'hire'

type Visit = { toId: string; text: string; kind: MessageKind }

type Entity = {
  id: string
  member: Member
  avatar: Avatar
  office: OfficeId
  /** いまいる場所（オフィスの中の u, z） */
  pos: P2
  /** 通り道へ出るまでの点列（いまの場所から） */
  exit: P2[]
  yaw: number
  yawTarget: number
  path: P2[]
  speed: number
  onArrive: (() => void) | null
  /** 歩いている先 */
  dest: Spot | null
  home: Spot
  activity: Activity
  tag: CSS2DObject
  tagEl: HTMLDivElement
  nameEl: HTMLElement
  shortEl: HTMLElement
  roleEl: HTMLElement
  icoEl: HTMLElement
  taskEl: HTMLElement
  alertEl: HTMLElement
  bubble: { obj: CSS2DObject; el: HTMLDivElement; until: number } | null
  newUntil: number
  talkUntil: number
  scale: number
  scaleTarget: number
  removing: boolean
  lookKey: string
  visits: Visit[]
  /** 会議室の席（office, 番号） */
  seat: number | null
  /** 手に持つ光る札 */
  card: THREE.Mesh | null
  /** 人間へのお願い（足元の輪） */
  request: { since: number; ring: THREE.Mesh } | null
  wanderUntil: number
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

function waitText(sinceMs: number): string {
  const min = Math.max(0, Math.floor((Date.now() - sinceMs) / 60000))
  if (min < 1) return 'いま届いた'
  if (min < 60) return `${min}分待ち`
  const h = Math.floor(min / 60)
  return h < 24 ? `${h}時間待ち` : `${Math.floor(h / 24)}日待ち`
}

export class OfficeWorld implements OfficeWorldApi {
  onSelect: ((memberId: string | null) => void) | null = null

  private readonly container: HTMLElement
  private readonly root: HTMLDivElement
  private readonly renderer: THREE.WebGLRenderer
  /** やわらかい光（ブルーム）つきの描画。重いときは null にして直接描く */
  private composer: EffectComposer | null = null
  private bloom: UnrealBloomPass | null = null
  private readonly sky = skyTexture()
  /** 重さの見張り：直近のフレーム時間の平均 */
  private frameAvg = 1 / 60
  private slowFor = 0
  private readonly labels: CSS2DRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 260)
  private readonly controls: OrbitControls
  private readonly offices: Record<OfficeId, OfficeBuild>
  private readonly bridge: BridgeBuild
  private readonly walkway: WalkwayBuild
  private readonly clouds: ReturnType<typeof buildClouds>
  private readonly fx = new Fx()
  private readonly entities = new Map<string, Entity>()
  private readonly hired = new Set<string>()
  private readonly selRing: THREE.Mesh
  private readonly selMat: THREE.MeshBasicMaterial
  private readonly reqGeo = new THREE.RingGeometry(0.45, 0.62, 40)
  private readonly reqMat = new THREE.MeshBasicMaterial({ color: HUMAN_COLOR, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide })
  private readonly cardGeo = new THREE.BoxGeometry(0.3, 0.21, 0.02)
  private readonly cardMats = new Map<string, THREE.MeshBasicMaterial>()
  private readonly pmrem: THREE.PMREMGenerator
  private readonly envTex: THREE.Texture
  private readonly ro: ResizeObserver
  private readonly raycaster = new THREE.Raycaster()
  /** 会議室の席の使用者（拠点ごと） */
  private readonly seats: Record<OfficeId, (string | null)[]>
  /** 拠点をまたぐ会議（ホログラム通話）の光 */
  private readonly calls = new Map<string, { mesh: THREE.Mesh; geo: THREE.BufferGeometry }>()
  private readonly callMat = new THREE.MeshBasicMaterial({ color: '#8fe8ff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
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
  private readonly taskLabels = new Map<string, { label: string | null; opts?: TaskLabelOptions }>()
  private lastLabelClass = ''
  private insets = { left: 0, right: 0, top: 0, bottom: 0 }
  private viewOff = { x: 0, y: 0 }
  private viewOffTarget = { x: 0, y: 0 }
  private nextWander = 8
  private nextSlowTick = 0
  /** シミュレーションの時間で動くタイマー（debugAdvance でもすすむ） */
  private timers: { at: number; fn: () => void }[] = []

  private after(sec: number, fn: () => void): void {
    this.timers.push({ at: this.t + sec, fn })
  }
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
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMappingExposure = 1.04
    this.renderer.setClearColor(0xcfeaff, 1)
    this.root.appendChild(this.renderer.domElement)
    this.scene.background = this.sky

    this.labels = new CSS2DRenderer()
    this.labels.domElement.className = 'ow-labels'
    this.root.appendChild(this.labels.domElement)

    this.pmrem = new THREE.PMREMGenerator(this.renderer)
    const room = new RoomEnvironment()
    this.envTex = this.pmrem.fromScene(room, 0.04).texture
    this.scene.environment = this.envTex
    this.scene.environmentIntensity = 0.55

    // 光：空の色の半球光 + 影を落とす太陽 1 つ
    this.scene.add(new THREE.HemisphereLight('#fdfdff', '#d3dfee', 1.8))
    const sun = new THREE.DirectionalLight('#fff6e8', 2.0)
    sun.position.set(6, 26, 16)
    sun.target.position.set(-2, 0, -3)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const sc = sun.shadow.camera
    sc.left = -22
    sc.right = 22
    sc.top = 16
    sc.bottom = -12
    sc.near = 5
    sc.far = 70
    sun.shadow.bias = -0.0008
    sun.shadow.normalBias = 0.03
    sun.shadow.radius = 3
    this.scene.add(sun, sun.target)

    // オフィス・橋・坂道・雲
    this.offices = {} as Record<OfficeId, OfficeBuild>
    this.seats = {} as Record<OfficeId, (string | null)[]>
    for (const id of ALL_OFFICES) {
      const b = buildOffice(layoutOf(id), officeInfo(id))
      this.offices[id] = b
      this.scene.add(b.group)
      this.seats[id] = layoutOf(id).meeting.seats.map(() => null)
    }
    this.bridge = buildBridge(BRIDGE_MARK)
    this.scene.add(this.bridge.group)
    const bl = document.createElement('div')
    bl.className = 'ow-bridge-label'
    bl.textContent = 'JAPAN ⇄ CAMBODIA'
    const blo = wrapLabel(bl, 0.5)
    blo.position.copy(this.bridge.top)
    this.scene.add(blo)
    this.walkway = buildTokyoWalkway()
    this.scene.add(this.walkway.group)
    const wl = document.createElement('div')
    wl.className = 'ow-bridge-label small'
    wl.textContent = 'TOKYO ⇄ OSAKA'
    const wlo = wrapLabel(wl, 0.5)
    wlo.position.copy(this.walkway.curve.getPoint(0)).lerp(this.walkway.curve.getPoint(1), 0.5).add(new THREE.Vector3(0, 0.6, 0))
    this.scene.add(wlo)
    this.clouds = buildClouds()
    this.scene.add(this.clouds.group)
    this.scene.add(this.fx.group)

    this.selMat = new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 40), this.selMat)
    this.selRing.rotation.x = -Math.PI / 2
    this.selRing.visible = false
    this.scene.add(this.selRing)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 3.5
    this.controls.maxDistance = 95
    this.controls.minPolarAngle = 0.25
    this.controls.maxPolarAngle = 1.3
    this.controls.minAzimuthAngle = -1.1
    this.controls.maxAzimuthAngle = 1.1
    this.controls.screenSpacePanning = true
    this.controls.addEventListener('start', () => {
      this.tween = null
      this.followId = null
    })

    const el = this.renderer.domElement
    el.addEventListener('pointerdown', this.onDown)
    el.addEventListener('pointerup', this.onUp)
    el.addEventListener('pointermove', this.onMove)
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    document.addEventListener('visibilitychange', this.onVis)
    if (!LOW_FX) this.setupComposer()
    this.resize()
    this.applyFocus('all', true)
    this.loop()
  }

  // ------------------------------------------------------------------ API

  syncMembers(members: Member[]): void {
    const seen = new Set<string>()
    const nexCount: Record<OfficeId, number> = { osaka: 0, tokyo: 0, phnompenh: 0 }
    for (const raw of members) {
      const m = raw.office === normalizeOffice(raw.office) ? raw : { ...raw, office: normalizeOffice(raw.office) }
      seen.add(m.id)
      const nIndex = m.kind === 'nexmax' && m.deskIndex < 0 ? nexCount[m.office]++ : 0
      const e = this.entities.get(m.id)
      if (!e) this.spawn(m, false, nIndex)
      else this.updateEntity(e, m, nIndex)
    }
    for (const [id, e] of this.entities) if (!seen.has(id) && !e.removing) this.remove(e)
  }

  hire(member: Member): void {
    if (this.hired.has(member.id)) return
    this.hired.add(member.id)
    const m = { ...member, office: normalizeOffice(member.office) }
    const existing = this.entities.get(m.id)
    if (existing) this.dropEntity(existing)
    const nIndex = m.kind === 'nexmax' && m.deskIndex < 0 ? [...this.entities.values()].filter((e) => e.member.kind === 'nexmax' && e.office === m.office && e.member.deskIndex < 0).length : 0
    this.spawn(m, true, nIndex)
  }

  message(fromId: string, toId: string | null, kind: MessageKind, text: string): void {
    const a = this.entities.get(fromId)
    if (!a) return
    const b = toId ? this.entities.get(toId) : undefined
    const color = kind === 'assign' && b?.member.kind === 'human' ? HUMAN_COLOR : (KIND_COLOR[kind] ?? '#54a0ff')

    if (toId === null) {
      this.say(fromId, text, undefined, kind)
      this.talkFor(a, 1.6)
      const p = this.worldPos(a)
      this.fx.ripple(p, color, 3.2, 1.3)
      this.after(0.26, () => this.fx.ripple(this.worldPos(a), color, 4.2, 1.5))
      if (a.avatar instanceof NexmaxAvatar) a.avatar.wave(1.6)
      return
    }
    if (!b || b === a) return

    // ネクマックスの依頼：同じ国なら本人が席まで（東京へは坂道の下まで）届けに行く
    const nx = a.avatar instanceof NexmaxAvatar
    const walkable = a.office === b.office || (nx && countryOf(a.office) === countryOf(b.office) && this.gateSpot(a.office, b.office))
    if (kind === 'assign' && nx && walkable && !b.removing && a.visits.length < 5) {
      a.visits.push({ toId, text, kind })
      if (a.activity === 'home') this.nextVisit(a)
      return
    }
    // 引き継ぎ：同じ拠点なら、手渡しに行く
    if (kind === 'handoff' && !nx && a.office === b.office && a.activity === 'home' && a.member.status !== 'talking' && a.visits.length < 2) {
      a.visits.push({ toId, text, kind })
      this.nextVisit(a)
      return
    }
    this.say(fromId, text, undefined, kind)
    this.talkFor(a, 1.6)
    if (nx) (a.avatar as NexmaxAvatar).wave(1.4)
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

  setTaskLabel(memberId: string, label: string | null, opts?: TaskLabelOptions): void {
    this.taskLabels.set(memberId, { label, opts })
    const e = this.entities.get(memberId)
    if (!e) return
    this.applyTaskLabel(e)
  }

  setOfficeBoard(office: OfficeId, board: OfficeBoard): void {
    this.offices[normalizeOffice(office)]?.setBoard(board)
  }

  celebrate(memberId: string): void {
    const e = this.entities.get(memberId)
    if (!e) return
    e.avatar.hop(1)
    this.after(0.52, () => e.avatar.hop(0.7))
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

  private effInsets(): { left: number; right: number; top: number; bottom: number } {
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    const i = { ...this.insets }
    // 見える所が狭すぎるときは、隠れ幅を比率を保って縮める（少なくとも画面の 45% か 360×240 px は見せる）
    const minW = Math.min(360, w * 0.45)
    const minH = Math.min(240, h * 0.45)
    const sw = i.left + i.right
    if (w - sw < minW && sw > 0) {
      const k = Math.max(0, w - minW) / sw
      i.left *= k
      i.right *= k
    }
    const sh = i.top + i.bottom
    if (h - sh < minH && sh > 0) {
      const k = Math.max(0, h - minH) / sh
      i.top *= k
      i.bottom *= k
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
    for (const o of Object.values(this.offices)) o.dispose()
    this.bridge.dispose()
    this.walkway.dispose()
    for (const c of this.calls.values()) c.geo.dispose()
    this.callMat.dispose()
    this.fx.dispose()
    this.selRing.geometry.dispose()
    this.selMat.dispose()
    this.reqGeo.dispose()
    this.reqMat.dispose()
    this.cardGeo.dispose()
    for (const m of this.cardMats.values()) m.dispose()
    this.envTex.dispose()
    this.pmrem.dispose()
    this.controls.dispose()
    this.composer?.dispose()
    this.sky.dispose()
    this.renderer.dispose()
    disposeAllMats()
    this.root.remove()
  }

  // ------------------------------------------------------------------ 社員

  private makeAvatar(m: Member): Avatar {
    if (m.kind === 'nexmax') return new NexmaxAvatar(m.look)
    // 参考デザインの画風の絵（スプライト）。?chibi でコードのちびキャラに戻せる
    return hasSprite(m) && !FORCE_CHIBI ? new SpriteAvatar(m) : new Chibi(m)
  }

  private homeOf(m: Member, nIndex: number): Spot {
    const L = layoutOf(m.office)
    if (m.deskIndex < 0) return L.pads[Math.min(nIndex, L.pads.length - 1)]
    return deskSpot(m.office, m.deskIndex).chair
  }

  private spawn(m: Member, viaDoor: boolean, nIndex: number): Entity {
    const avatar = this.makeAvatar(m)
    const home = this.homeOf(m, nIndex)
    const L = layoutOf(m.office)

    const tagEl = document.createElement('div')
    tagEl.className = 'ow-tag'
    const alert = document.createElement('div')
    alert.className = 'ow-alert'
    alert.textContent = '!'
    alert.hidden = true
    const chip = document.createElement('div')
    chip.className = 'ow-chip'
    const ico = document.createElement('span')
    ico.className = 'ow-ico'
    const dot = document.createElement('span')
    dot.className = 'ow-dot'
    const name = document.createElement('b')
    name.className = 'ow-name'
    const short = document.createElement('b')
    short.className = 'ow-short'
    const nw = document.createElement('span')
    nw.className = 'ow-new'
    nw.textContent = 'NEW'
    chip.append(ico, dot, name, short, nw)
    const role = document.createElement('div')
    role.className = 'ow-role'
    const task = document.createElement('div')
    task.className = 'ow-task'
    task.hidden = true
    tagEl.append(alert, task, chip, role)
    tagEl.addEventListener('click', (ev) => {
      ev.stopPropagation()
      this.onSelect?.(m.id)
    })
    const tag = wrapLabel(tagEl, 1)
    avatar.tagAnchor.add(tag)

    const start = viaDoor && m.kind !== 'nexmax' ? L.door : home
    const e: Entity = {
      id: m.id,
      member: m,
      avatar,
      office: m.office,
      pos: { ...start.pos },
      exit: exitOf(start),
      yaw: 0,
      yawTarget: 0,
      path: [],
      speed: 0,
      onArrive: null,
      dest: null,
      home,
      activity: viaDoor ? 'hire' : 'home',
      tag,
      tagEl,
      nameEl: name,
      shortEl: short,
      roleEl: role,
      icoEl: ico,
      taskEl: task,
      alertEl: alert,
      bubble: null,
      newUntil: viaDoor ? this.t + 25 : 0,
      talkUntil: 0,
      scale: viaDoor ? 0.01 : 1,
      scaleTarget: 1,
      removing: false,
      lookKey: JSON.stringify(m.look) + m.kind,
      visits: [],
      seat: null,
      card: null,
      request: null,
      wanderUntil: 0,
    }
    this.entities.set(m.id, e)
    this.scene.add(avatar.root)
    this.applyMember(e, m)
    this.applyTaskLabel(e)

    if (viaDoor) {
      const office = this.offices[m.office]
      office.openDoor()
      const doorPos = toWorld(m.office, L.door.pos.u, L.door.pos.z, 1.0)
      this.fx.burst(doorPos, 'confetti', 70)
      this.fx.ripple(toWorld(m.office, L.door.pos.u, L.door.pos.z + 0.3, 0.05), KIND_COLOR.hire, 2.4, 1.2)
      this.bridge.pulse()
      this.after(0.45, () => {
        if (this.disposed || e.removing) return
        e.avatar.hop(1)
        if (m.kind === 'nexmax' && m.deskIndex < 0) {
          ;(e.avatar as NexmaxAvatar).wave(2)
          e.activity = 'home'
          this.settle(e)
        } else {
          this.walkTo(e, home, () => {
            e.activity = 'home'
            this.settle(e)
            this.celebrate(e.id)
            this.afterArrive(e)
          })
        }
      })
    } else {
      this.settle(e)
      if (m.status === 'talking') this.goMeeting(e)
    }
    this.place(e)
    return e
  }

  private updateEntity(e: Entity, m: Member, nIndex: number): void {
    const lookKey = JSON.stringify(m.look) + m.kind
    if (lookKey !== e.lookKey) {
      const keepPos = e.pos
      const office = e.office
      this.dropEntity(e)
      const ne = this.spawn(m, false, nIndex)
      if (office === m.office) ne.pos = keepPos
      return
    }
    const prevStatus = e.member.status
    const officeChanged = m.office !== e.office
    const deskChanged = m.deskIndex !== e.member.deskIndex
    e.member = m
    this.applyMember(e, m)
    if (officeChanged || deskChanged) {
      const home = this.homeOf(m, nIndex)
      e.home = home
      if (officeChanged) {
        // 別の拠点へ異動：その場で消えて、新しい席に現れる
        this.releaseSeat(e)
        e.office = m.office
        e.path = []
        e.activity = 'home'
        this.settle(e)
        this.fx.burst(this.worldPos(e).setY(this.worldPos(e).y + 1), 'sparkle', 24)
      } else if (e.activity === 'home') {
        this.goHome(e)
      }
    }
    // 状態の変化で動く
    if (m.status !== prevStatus) this.onStatus(e, prevStatus)
  }

  private onStatus(e: Entity, prev: MemberStatus): void {
    const st = e.member.status
    if (st === 'talking' && prev !== 'talking') {
      if (e.activity === 'home' || e.activity === 'wander' || e.activity === 'walking-home') this.goMeeting(e)
    } else if (prev === 'talking' && st !== 'talking') {
      if (e.activity === 'meeting') this.goHome(e)
    }
    if ((st === 'working' || st === 'thinking') && e.activity === 'wander') this.goHome(e)
  }

  /** 隣の列の名札と重ならないよう、1 列おきに名札を少し上げる */
  private staggered(m: Member): boolean {
    if (m.deskIndex < 0) return false
    const d = deskSpot(m.office, m.deskIndex)
    if (d.overflow) return m.deskIndex % 2 === 1
    if (d.exec) return m.kind === 'nexmax'
    const cols = layoutOf(m.office).cols
    const i = cols.findIndex((c) => Math.abs(c - d.desk.u) < 0.01)
    return i % 2 === 1
  }

  private applyMember(e: Entity, m: Member): void {
    e.nameEl.textContent = m.name
    e.shortEl.textContent = truncate(m.name.replace(/（[^）]*）|\([^)]*\)/g, '').trim() || m.name, 6)
    e.roleEl.textContent = m.role
    e.tagEl.title = `${m.name}（${m.role}）— ${STATUS_LABEL[m.status]}${m.statusText ? `：${m.statusText}` : ''}`
    const stag = this.staggered(m) ? ' stag' : ''
    e.tagEl.className = `ow-tag kind-${m.kind} st-${m.status}${stag}${e.newUntil > this.t ? ' is-new' : ''}${this.selected === m.id ? ' selected' : ''}${e.request ? ' has-request' : ''}`
    e.icoEl.textContent = STATUS_ICON[m.status] ?? ''
    e.avatar.setStatus(m.status)
    e.avatar.setGhost(m.status === 'offline' || m.status === 'away')
  }

  private applyTaskLabel(e: Entity): void {
    const t = this.taskLabels.get(e.id)
    const label = t?.label ?? null
    const human = !!t?.opts?.human && !!label
    e.taskEl.hidden = !label
    e.taskEl.classList.toggle('human', human)
    e.taskEl.title = label ?? ''
    if (!label) e.taskEl.textContent = ''
    else if (human) {
      const since = t?.opts?.since ? Date.parse(t.opts.since) : Date.now()
      e.taskEl.innerHTML = ''
      const head = document.createElement('span')
      head.className = 'ow-req-head'
      head.textContent = '👤 お願い'
      const body = document.createElement('span')
      body.className = 'ow-req-body'
      body.textContent = truncate(label.replace(/^👤\s*/, ''), 18)
      const wait = document.createElement('span')
      wait.className = 'ow-req-wait'
      wait.textContent = waitText(since)
      e.taskEl.append(head, body, wait)
      if (!e.request) {
        const ring = new THREE.Mesh(this.reqGeo, this.reqMat)
        ring.rotation.x = -Math.PI / 2
        ring.renderOrder = 3
        this.scene.add(ring)
        e.request = { since, ring }
      } else e.request.since = since
    } else {
      e.taskEl.textContent = `📄 ${truncate(label.replace(/^💻\s*/, ''), 16)}`
    }
    if (!human && e.request) {
      e.request.ring.removeFromParent()
      e.request = null
    }
    e.alertEl.hidden = !human
    e.tagEl.classList.toggle('has-request', human)
  }

  private remove(e: Entity): void {
    e.removing = true
    e.scaleTarget = 0
    this.fx.burst(this.worldPos(e).setY(this.worldPos(e).y + 0.8), 'pop', 18)
    setTimeout(() => {
      if (this.entities.get(e.id) === e) {
        this.dropEntity(e)
        this.entities.delete(e.id)
      }
    }, 450)
  }

  private dropEntity(e: Entity): void {
    this.releaseSeat(e)
    e.tag.removeFromParent()
    e.bubble?.obj.removeFromParent()
    e.request?.ring.removeFromParent()
    e.request = null
    e.avatar.dispose()
    if (this.selected === e.id) this.selRing.visible = false
    this.entities.delete(e.id)
  }

  // ------------------------------------------------------------------ 歩く

  private faceYaw(e: Entity, face: number): number {
    const s = layoutOf(e.office).s
    return Math.atan2(s * Math.sin(face), Math.cos(face))
  }

  /** いまの場所に落ち着く（座る・立つ） */
  private settleAt(e: Entity, spot: Spot): void {
    e.path = []
    e.speed = 0
    e.pos = { ...spot.pos }
    e.exit = exitOf(spot)
    e.avatar.setMode(spot.sit ? 'sit' : 'stand')
    e.yawTarget = this.faceYaw(e, spot.face ?? 0)
  }

  private settle(e: Entity): void {
    this.settleAt(e, e.home)
  }

  /** 歩いている途中で行き先を変えるとき：机を横切らないよう、通り道へ戻る点列 */
  private interruptExit(e: Entity): P2[] {
    const next = e.path[0]
    const d = e.dest
    const same = (a: P2, b: P2) => Math.abs(a.u - b.u) < 0.01 && Math.abs(a.z - b.z) < 0.01
    if (d) {
      if (same(next, d.pos)) return [next, ...[...d.approach].reverse()]
      const k = d.approach.findIndex((p) => same(p, next))
      if (k >= 0) return d.approach.slice(0, k + 1).reverse()
    }
    return [next]
  }

  private walkTo(e: Entity, to: Spot, onArrive: () => void): void {
    const L = layoutOf(e.office)
    const exit = e.path.length ? this.interruptExit(e) : e.exit
    e.path = routeTo(L, e.pos, exit, to)
    e.dest = to
    e.exit = []
    e.onArrive = () => {
      this.settleAt(e, to)
      onArrive()
    }
    if (!e.path.length) {
      const cb = e.onArrive
      e.onArrive = null
      cb()
      return
    }
    e.avatar.setMode('walk')
  }

  private goHome(e: Entity): void {
    this.releaseSeat(e)
    this.setCard(e, null)
    e.activity = 'walking-home'
    this.walkTo(e, e.home, () => {
      e.activity = 'home'
      this.afterArrive(e)
    })
  }

  /** 席に着いたあと：残っている用事・状態に合わせて次へ */
  private afterArrive(e: Entity): void {
    if (e.removing) return
    if (e.visits.length) return this.nextVisit(e)
    if (e.member.status === 'talking') return this.goMeeting(e)
  }

  private gateSpot(from: OfficeId, to: OfficeId): Spot | undefined {
    return layoutOf(from).gates[to]
  }

  private setCard(e: Entity, color: string | null): void {
    if (!color) {
      if (e.card) e.card.visible = false
      return
    }
    let mat = this.cardMats.get(color)
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
      this.cardMats.set(color, mat)
    }
    if (!e.card) {
      e.card = new THREE.Mesh(this.cardGeo, mat)
      e.avatar.root.add(e.card)
    }
    e.card.material = mat
    const h = e.avatar instanceof NexmaxAvatar ? 0.95 : 0.7
    e.card.position.set(0, h, 0.42)
    e.card.visible = true
  }

  /** 届け物（依頼・引き継ぎ）を 1 つずつ */
  private nextVisit(e: Entity): void {
    const v = e.visits.shift()
    if (!v) {
      this.goHome(e)
      return
    }
    const target = this.entities.get(v.toId)
    if (!target || target.removing) return this.nextVisit(e)
    e.activity = 'visit'
    this.releaseSeat(e)
    const human = target.member.kind === 'human'
    const color = v.kind === 'assign' ? (human ? HUMAN_COLOR : KIND_COLOR.assign) : KIND_COLOR[v.kind]
    this.setCard(e, color)
    const handOver = (dest: Spot) => {
      e.avatar.setMode('stand')
      e.yawTarget = this.faceYaw(e, dest.face ?? Math.PI)
      if (e.avatar instanceof NexmaxAvatar) e.avatar.wave(1.5)
      this.say(e.id, v.text, 3200, v.kind)
      this.talkFor(e, 1.6)
      this.setCard(e, null)
      this.sendPacket(e, target, color)
      this.after(1.4, () => {
        if (this.disposed || !this.entities.has(e.id)) return
        if (e.visits.length) this.nextVisit(e)
        else this.goHome(e)
      })
    }
    if (target.office === e.office) {
      const d = target.member.deskIndex >= 0 ? deskSpot(target.office, target.member.deskIndex) : null
      let dest: Spot
      if (target.activity === 'meeting' || target.activity === 'wander') {
        dest = { pos: { u: target.pos.u, z: target.pos.z + 0.9 }, approach: target.exit.length ? [target.exit[target.exit.length - 1]] : [], face: Math.PI }
      } else if (d && !d.overflow) dest = d.front
      else dest = { pos: { u: target.pos.u, z: target.pos.z + 0.9 }, approach: [{ u: target.pos.u, z: layoutOf(e.office).corridor }], face: Math.PI }
      this.walkTo(e, dest, () => handOver(dest))
    } else {
      const gate = this.gateSpot(e.office, target.office)
      if (!gate) {
        e.activity = 'home'
        this.setCard(e, null)
        this.sendPacket(e, target, color)
        return this.nextVisit(e)
      }
      this.walkTo(e, gate, () => handOver(gate))
    }
  }

  // ------------------------------------------------------------------ 会議室

  private goMeeting(e: Entity): void {
    if (e.member.kind === 'nexmax' && e.member.deskIndex < 0) return
    const list = this.seats[e.office]
    const free = list.findIndex((x) => x === null)
    if (free < 0) return
    list[free] = e.id
    e.seat = free
    e.activity = 'meeting'
    this.updateMeeting(e.office)
    const spot = layoutOf(e.office).meeting.seats[free]
    this.walkTo(e, spot, () => {
      e.activity = 'meeting'
      if (e.member.status !== 'talking') this.goHome(e)
    })
  }

  private releaseSeat(e: Entity): void {
    if (e.seat === null) return
    const list = this.seats[e.office]
    if (list && list[e.seat] === e.id) list[e.seat] = null
    e.seat = null
    this.updateMeeting(e.office)
  }

  private updateMeeting(office: OfficeId): void {
    const n = this.seats[office].filter(Boolean).length
    this.offices[office].setMeeting(n)
  }

  /** 拠点をまたいで相談している 2 人の会議室を、ホログラムの光でつなぐ */
  private updateCalls(): void {
    const want = new Map<string, [OfficeId, OfficeId]>()
    for (const e of this.entities.values()) {
      if (e.activity !== 'meeting' || e.member.status !== 'talking') continue
      const txt = e.member.statusText ?? ''
      for (const o of this.entities.values()) {
        if (o === e || o.office === e.office || o.member.status !== 'talking') continue
        if (!txt.includes(o.member.name)) continue
        const pair = [e.office, o.office].sort() as [OfficeId, OfficeId]
        want.set(pair.join('|'), pair)
      }
    }
    for (const [key, c] of this.calls) {
      if (!want.has(key)) {
        c.mesh.removeFromParent()
        c.geo.dispose()
        this.calls.delete(key)
      }
    }
    for (const [key, [a, b]] of want) {
      if (this.calls.has(key)) continue
      const pa = this.offices[a].meetingPoint
      const pb = this.offices[b].meetingPoint
      const mid = pa.clone().lerp(pb, 0.5)
      mid.y = Math.max(pa.y, pb.y) + 5
      const geo = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(pa.clone(), mid, pb.clone()), 60, 0.05, 6, false)
      const mesh = new THREE.Mesh(geo, this.callMat)
      this.scene.add(mesh)
      this.calls.set(key, { mesh, geo })
    }
  }

  // ------------------------------------------------------------------ ひまなときの散歩

  private wanderTick(): void {
    const busy = [...this.entities.values()].filter((e) => e.activity === 'wander').length
    if (busy >= 2) return
    const cands = [...this.entities.values()].filter(
      (e) => e.activity === 'home' && !e.removing && e.member.kind !== 'nexmax' && e.member.status === 'idle' && !e.request && e.home.sit,
    )
    if (!cands.length) return
    const e = cands[Math.floor(Math.random() * cands.length)]
    const L = layoutOf(e.office)
    const taken = new Set([...this.entities.values()].filter((x) => x.activity === 'wander' && x.office === e.office).map((x) => `${x.pos.u},${x.pos.z}`))
    const opts = [...L.lounge, ...L.windows].filter((s) => !taken.has(`${s.pos.u},${s.pos.z}`))
    if (!opts.length) return
    const dest = opts[Math.floor(Math.random() * opts.length)]
    e.activity = 'wander'
    e.wanderUntil = this.t + 1e9
    this.walkTo(e, dest, () => {
      if (e.activity !== 'wander') return
      e.wanderUntil = this.t + 6 + Math.random() * 6
    })
  }

  private talkFor(e: Entity, sec: number): void {
    e.talkUntil = this.t + sec
    e.avatar.setTalking(true)
  }

  // ------------------------------------------------------------------ やり取りの光

  private headPos(e: Entity): THREE.Vector3 {
    const v = new THREE.Vector3()
    e.avatar.headAnchor.getWorldPosition(v)
    return v
  }

  /** 拠点のあいだの道（光の道を順につなぐ） */
  private links(from: OfficeId, to: OfficeId): THREE.Curve<THREE.Vector3>[] {
    const w = this.walkway
    const br = this.bridge
    if (from === to) return []
    if (from === 'osaka' && to === 'tokyo') return [w.curve]
    if (from === 'tokyo' && to === 'osaka') return [w.reverse]
    if (from === 'osaka' && to === 'phnompenh') return [br.curve]
    if (from === 'phnompenh' && to === 'osaka') return [br.reverse]
    if (from === 'tokyo' && to === 'phnompenh') return [w.reverse, br.curve]
    return [br.reverse, w.curve]
  }

  private sendPacket(a: Entity, b: Entity, color: string): void {
    const pa = this.headPos(a)
    const pb = this.headPos(b)
    let curve: THREE.Curve<THREE.Vector3>
    if (a.office === b.office) {
      const mid = pa.clone().lerp(pb, 0.5)
      mid.y += 1.2 + pa.distanceTo(pb) * 0.22
      curve = new THREE.QuadraticBezierCurve3(pa, mid, pb)
    } else {
      const links = this.links(a.office, b.office)
      const path = new THREE.CurvePath<THREE.Vector3>()
      let cur = pa
      for (const l of links) {
        const s0 = l.getPoint(0)
        const m = cur.clone().lerp(s0, 0.5)
        m.y = Math.max(cur.y, s0.y) + 1.2
        path.add(new THREE.QuadraticBezierCurve3(cur, m, s0))
        path.add(l)
        cur = l.getPoint(1)
      }
      const m2 = cur.clone().lerp(pb, 0.5)
      m2.y = Math.max(cur.y, pb.y) + 1.2
      path.add(new THREE.QuadraticBezierCurve3(cur, m2, pb))
      curve = path
      if (countryOf(a.office) !== countryOf(b.office)) this.bridge.pulse()
      if (a.office === 'tokyo' || b.office === 'tokyo') this.walkway.pulse()
    }
    const len = curve.getLength()
    const dur = Math.max(0.75, Math.min(3.8, len / 9))
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
    const s = layoutOf(e.office).s
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
    let d = e.yawTarget - e.yaw
    d = Math.atan2(Math.sin(d), Math.cos(d))
    e.yaw += d * (1 - Math.exp(-dt / 0.1))
    e.scale += (e.scaleTarget - e.scale) * (1 - Math.exp(-dt / (e.scaleTarget > e.scale ? 0.12 : 0.08)))
  }

  /** 確認用：描画せずに時間だけ sec 秒すすめる（遅い端末のテストで歩く様子を見る） */
  debugAdvance(sec: number): void {
    const n = Math.ceil(sec / 0.05)
    for (let i = 0; i < n; i++) this.simulate(0.05, 0.05)
  }

  private loop = (): void => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    const now = performance.now()
    const realDt = Math.min(0.5, (now - this.last) / 1000)
    const dt = Math.min(0.05, realDt)
    this.last = now
    this.simulate(dt, realDt)
    if (this.composer) this.composer.render(dt)
    else this.renderer.render(this.scene, this.camera)
    this.labels.render(this.scene, this.camera)
    // 3 秒続けて 24fps を下回ったら軽くする（見えていないときの長い間隔は数えない）
    if (realDt < 0.25) {
      this.frameAvg += (realDt - this.frameAvg) * 0.05
      this.slowFor = this.frameAvg > 1 / 24 ? this.slowFor + realDt : 0
      if (this.slowFor > 3 && this.composer && !PARAMS.has('debug')) this.dropQuality()
    }
  }

  private simulate(dt: number, realDt: number): void {
    this.t += dt
    const date = new Date()
    if (this.timers.length) {
      const due = this.timers.filter((x) => x.at <= this.t)
      if (due.length) {
        this.timers = this.timers.filter((x) => x.at > this.t)
        for (const x of due) x.fn()
      }
    }

    const pulse = 0.55 + Math.sin(this.t * 5) * 0.3
    this.reqMat.opacity = pulse
    for (const e of this.entities.values()) {
      this.step(e, dt)
      if (e.talkUntil && this.t > e.talkUntil) {
        e.talkUntil = 0
        e.avatar.setTalking(false)
      }
      if (e.activity === 'wander' && this.t > e.wanderUntil) this.goHome(e)
      e.avatar.update(dt, this.t, e.path.length ? e.speed : 0)
      this.place(e)
      if (e.request) {
        this.worldPos(e, e.request.ring.position)
        e.request.ring.position.y += 0.03
        const k = 1 + Math.sin(this.t * 5) * 0.12
        e.request.ring.scale.set(k, k, k)
      }
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

    // ゆっくりの用事（散歩・通話の光・待ち時間の表示）
    if (this.t > this.nextSlowTick) {
      this.nextSlowTick = this.t + 0.5
      this.updateCalls()
      if (this.t > this.nextWander) {
        this.nextWander = this.t + 9 + Math.random() * 14
        this.wanderTick()
      }
      if (Math.floor(this.t * 2) % 40 === 0) {
        for (const e of this.entities.values()) {
          if (!e.request) continue
          const w = e.taskEl.querySelector('.ow-req-wait')
          if (w) w.textContent = waitText(e.request.since)
        }
      }
    }
    this.callMat.opacity = 0.35 + Math.sin(this.t * 4) * 0.2

    if (this.selected) {
      const e = this.entities.get(this.selected)
      if (e) {
        this.worldPos(e, this.selRing.position)
        this.selRing.position.y += 0.04
        const k = 1 + Math.sin(this.t * 4) * 0.08
        this.selRing.scale.set(k, k, k)
        this.selMat.opacity = 0.65 + Math.sin(this.t * 4) * 0.25
      }
    }
    if (this.followId && !this.tween) {
      const e = this.entities.get(this.followId)
      if (e && e.path.length) {
        const p = this.worldPos(e)
        p.y += 0.9
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

    const dist = this.camera.position.distanceTo(this.controls.target)
    const ppu = this.container.clientHeight / 2 / (dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2))
    const cls = ppu < 17 ? 'ow-labels far very-far' : ppu < 38 ? 'ow-labels far' : 'ow-labels'
    if (cls !== this.lastLabelClass) {
      this.labels.domElement.className = cls
      this.lastLabelClass = cls
    }

    for (const o of Object.values(this.offices)) o.update(dt, this.t, date)
    this.bridge.update(dt, this.t)
    this.walkway.update(dt, this.t)
    this.clouds.update(dt, this.t)
    this.fx.update(dt)
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

  /** ブルーム：地球儀・光の橋・ホログラム・モニターなど明るい所だけを、やわらかくにじませる */
  private setupComposer(): void {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
    const composer = new EffectComposer(this.renderer, rt)
    composer.addPass(new RenderPass(this.scene, this.camera))
    // 調整用：?bloom=強さ&thr=しきい値&brad=広がり
    const num = (k: string, d: number) => (PARAMS.has(k) ? Number(PARAMS.get(k)) : d)
    const strength = num('bloom', 0.6)
    if (strength > 0) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), strength, num('brad', 0.45), num('thr', 2.1))
      composer.addPass(this.bloom)
    }
    composer.addPass(new OutputPass())
    this.composer = composer
  }

  /** 重い端末：ブルームをやめて直接描き、画素比も下げる */
  private dropQuality(): void {
    if (!this.composer) return
    this.composer.dispose()
    this.composer = null
    this.bloom = null
    this.renderer.setPixelRatio(Math.min(1.25, window.devicePixelRatio || 1))
    this.resize()
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    this.renderer.setSize(w, h, false)
    if (this.composer) {
      const pr = this.renderer.getPixelRatio()
      this.composer.setPixelRatio(pr)
      this.composer.setSize(w, h)
      // にじみは半分の解像度で十分
      this.bloom?.setSize(Math.max(1, Math.round((w * pr) / 2)), Math.max(1, Math.round((h * pr) / 2)))
    }
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

  /** 点の集まりが、見えている長方形（パネルを除く）に収まるカメラの注視点と距離を探す */
  private fitPoints(pts: THREE.Vector3[], elev: number, margin = 1.06): { target: THREE.Vector3; dist: number } {
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    const i = this.effInsets()
    const visW = Math.max(1, w - i.left - i.right) / w
    const visH = Math.max(1, h - i.top - i.bottom) / h
    const cam = new THREE.PerspectiveCamera(this.camera.fov, this.camera.aspect, 0.1, 500)
    const dir = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev))
    const target = new THREE.Vector3()
    for (const p of pts) target.add(p)
    target.multiplyScalar(1 / pts.length)
    let dist = 40
    const v = new THREE.Vector3()
    for (let k = 0; k < 8; k++) {
      cam.position.copy(target).addScaledVector(dir, dist)
      cam.lookAt(target)
      cam.updateMatrixWorld()
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      for (const p of pts) {
        v.copy(p).project(cam)
        minX = Math.min(minX, v.x)
        maxX = Math.max(maxX, v.x)
        minY = Math.min(minY, v.y)
        maxY = Math.max(maxY, v.y)
      }
      // 中心のずれを直す（画面の 1 は、注視点の距離で tan(fov/2)*dist の長さ）
      const halfH = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * dist
      const halfW = halfH * cam.aspect
      const right = new THREE.Vector3(1, 0, 0)
      const up = new THREE.Vector3(0, Math.cos(elev), -Math.sin(elev))
      target.addScaledVector(right, ((minX + maxX) / 2) * halfW * 0.9)
      target.addScaledVector(up, ((minY + maxY) / 2) * halfH * 0.9)
      const sx = (maxX - minX) / 2 / visW
      const sy = (maxY - minY) / 2 / visH
      dist *= Math.max(sx, sy) * margin
    }
    return { target, dist }
  }

  /** 拠点たちの角（床・奥の壁の上・看板）の点 */
  private officePoints(ids: OfficeId[]): THREE.Vector3[] {
    const pts: THREE.Vector3[] = []
    for (const id of ids) {
      const L = layoutOf(id)
      for (const u of [-L.halfW - 0.4, L.halfW + 0.4])
        for (const z of [-L.halfD - 0.3, L.halfD + 0.5]) {
          pts.push(toWorld(id, u, z, -0.3))
          pts.push(toWorld(id, u, z, z < 0 ? 3.9 : 1.0))
        }
    }
    if (ids.includes('osaka') && ids.includes('phnompenh')) pts.push(this.bridge.globe.clone().add(new THREE.Vector3(0, 1.8, 0)))
    return pts
  }

  /** ピンチ・Ctrl+ホイールで寄る・引く（いまの注視点を中心に、なめらかに） */
  zoomBy(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return
    const off = this.camera.position.clone().sub(this.controls.target)
    const d = THREE.MathUtils.clamp(off.length() * factor, this.controls.minDistance, this.controls.maxDistance)
    off.setLength(d)
    this.camera.position.copy(this.controls.target).add(off)
    this.tween = null
    this.followId = null
    this.controls.update()
  }

  private applyFocus(target: FocusTarget, instant: boolean): void {
    this.focusTarget = target
    this.followId = null
    let tgt: THREE.Vector3
    let dist: number
    let elev = THREE.MathUtils.degToRad(36)
    if (target === 'all' || target === 'jp' || target === 'osaka' || target === 'tokyo' || target === 'phnompenh') {
      const ids: OfficeId[] = target === 'all' ? ALL_OFFICES : target === 'jp' ? ['osaka', 'tokyo'] : [target]
      if (target === 'tokyo') elev = THREE.MathUtils.degToRad(42)
      // 全体は参考デザインと同じく、両端の拠点が少し画面の外へはみ出すくらいに寄せる（人が大きく見える）
      const f = this.fitPoints(this.officePoints(ids), elev, target === 'all' ? 0.86 : 1.06)
      tgt = f.target
      dist = f.dist
    } else if (typeof target === 'object') {
      const e = this.entities.get(target.memberId)
      if (!e) return
      tgt = this.worldPos(e)
      tgt.y += 0.9
      dist = 7.5
      elev = THREE.MathUtils.degToRad(30)
      this.followId = e.id
    } else {
      return
    }
    const pos = tgt.clone().add(new THREE.Vector3(0, Math.sin(elev), Math.cos(elev)).multiplyScalar(dist))
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

