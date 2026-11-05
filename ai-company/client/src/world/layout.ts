// オフィスの配置（座標の約束）。拠点は 3 つ：大阪本社（左手前・大）、東京オフィス（大阪の奥の上に浮かぶ小さな島）、
// プノンペンオフィス（右・大）。大阪とプノンペンのあいだはガラスの橋（JAPAN ⇄ CAMBODIA）、大阪と東京は小さなガラスの坂道。
//
// オフィスの中は (u, z) で考える：u = 外側へ向かう向き（+ が外の壁側、- が橋の側）、z = 手前（カメラ側）が +。
// 机は列 × 行。人は机の奥のいすに座り、手前（カメラ）を向く。
// 歩く道は「横の通り道（各行のいすの後ろ・机の列の手前の廊下）」と「縦の通り道（机の列のすき間・両外側）」だけ。
// 席・会議室・ラウンジなどの場所は、通り道からの入り方（approach）を持つ。
import * as THREE from 'three'
import type { OfficeId } from '../../../shared/types'

export type P2 = { u: number; z: number }

/** 行き先：approach（通り道の上の点 → … ）をたどって pos に着く */
export interface Spot {
  pos: P2
  approach: P2[]
  /** 着いたときに向く向き（オフィスの中の角度。0 = 手前、π = 奥） */
  face?: number
  /** 座る場所か */
  sit?: boolean
}

export interface DeskSpot {
  desk: P2
  /** 机の幅（u） */
  w: number
  chair: Spot
  /** 机の手前（話しかけに来る位置。通り道の上） */
  front: Spot
  exec?: boolean
  overflow?: boolean
}

export interface OfficeLayout {
  id: OfficeId
  center: THREE.Vector3
  /** +u が世界の +x なら 1、-x なら -1 */
  s: 1 | -1
  halfW: number
  halfD: number
  /** 横の通り道の z（奥から手前へ。最後が廊下） */
  lanes: number[]
  corridor: number
  /** 縦の通り道の u */
  aisles: number[]
  desks: DeskSpot[]
  door: Spot
  meeting: { center: P2; radius: number; table: number; seats: Spot[]; entrance: P2 }
  lounge: Spot[]
  windows: Spot[]
  /** ネクマックスが立つ台（席が無いとき） */
  pads: Spot[]
  /** 他の拠点への出入口（東京への坂道の下・橋のたもと） */
  gates: Partial<Record<OfficeId, Spot>>
  /** 机の列の中心 u（飾り用） */
  cols: number[]
  rows: number[]
  /** 奥の壁のモニターの中心 u と幅 */
  board: { u: number; w: number }
  overflowSpot(k: number): Spot
}

const ROW_LANE = 1.6
const CHAIR_BACK = 0.72

function gridLayout(o: {
  id: OfficeId
  center: THREE.Vector3
  s: 1 | -1
  halfW: number
  halfD: number
  cols: number[]
  rows: number[]
  corridor: number
  exec?: { z: number; us: number[] }
  meeting: { center: P2; radius: number; table: number; seatsN: number }
  /** ソファの座る位置（u は座面の中心、walkU はソファの前の通り道） */
  lounge: { u: number; zs: number[]; walkU: number }
  board: { u: number; w: number }
}): OfficeLayout {
  const lanes = [...o.rows.map((z) => z - ROW_LANE), o.corridor]
  const colGap = o.cols.length > 1 ? Math.abs(o.cols[1] - o.cols[0]) : 2.3
  const sorted = [...o.cols].sort((a, b) => a - b)
  const aisles: number[] = [sorted[0] - colGap / 2 - 0.45]
  for (let i = 0; i < sorted.length - 1; i++) aisles.push((sorted[i] + sorted[i + 1]) / 2)
  aisles.push(sorted[sorted.length - 1] + colGap / 2 + 0.45)

  // 机の順番：手前の行から（よく見える席が先に埋まる）
  const gridSpots: DeskSpot[] = []
  const rowOrder = o.rows.map((z, i) => ({ z, i })).sort((a, b) => b.z - a.z)
  for (const { z, i } of rowOrder) {
    const frontLane = i + 1 < o.rows.length ? o.rows[i + 1] - ROW_LANE : o.corridor
    // rows は奥 → 手前の順なので、i + 1 が 1 つ手前の行
    for (const u of o.cols) {
      gridSpots.push({
        desk: { u, z },
        w: 1.5,
        chair: { pos: { u, z: z - CHAIR_BACK }, approach: [{ u, z: z - ROW_LANE }], face: 0, sit: true },
        front: { pos: { u, z: frontLane }, approach: [], face: Math.PI },
      })
    }
  }
  let desks: DeskSpot[] = gridSpots
  if (o.exec) {
    const ez = o.exec.z
    const execSpots: DeskSpot[] = o.exec.us.map((u) => ({
      desk: { u, z: ez },
      w: 1.5,
      exec: true,
      chair: { pos: { u, z: ez - CHAIR_BACK }, approach: [{ u, z: o.corridor }], face: 0, sit: true },
      front: { pos: { u, z: ez + 0.95 }, approach: [{ u: u + (u >= 0 ? 1.7 : -1.7), z: o.corridor }, { u: u + (u >= 0 ? 1.7 : -1.7), z: ez + 0.95 }], face: Math.PI },
    }))
    desks = [...execSpots, ...gridSpots]
  }

  const m = o.meeting
  // 入口は奥側（机の側）。会議室の中は、テーブルのまわりの輪の上を回って席へ
  const entrance: P2 = { u: m.center.u, z: m.center.z - m.radius + 0.05 }
  const seats: Spot[] = []
  const ring = Math.min(m.radius - 0.3, m.table + 0.85)
  const at = (a: number, r: number): P2 => ({ u: m.center.u + Math.cos(a) * r, z: m.center.z + Math.sin(a) * r })
  const entA = -Math.PI / 2
  for (let k = 0; k < m.seatsN; k++) {
    // 入口（奥側）を空けて、手前と横に座る
    const a = Math.PI / 2 + ((k - (m.seatsN - 1) / 2) / Math.max(1, m.seatsN - 1)) * (Math.PI * 1.25)
    const pos = at(a, m.table + 0.5)
    const approach: P2[] = [{ u: entrance.u, z: o.corridor }, entrance, at(entA, ring)]
    // 入口から席の角度まで、短いほうへ回る（60° ごとに点を置く）
    let d = Math.atan2(Math.sin(a - entA), Math.cos(a - entA))
    if (Math.abs(Math.abs(d) - Math.PI) < 0.01) d = Math.PI
    const steps = Math.max(1, Math.ceil(Math.abs(d) / (Math.PI / 3)))
    for (let i = 1; i <= steps; i++) approach.push(at(entA + (d * i) / steps, ring))
    seats.push({ pos, approach, face: Math.atan2(m.center.u - pos.u, m.center.z - pos.z), sit: true })
  }

  const lo = o.lounge
  const lounge: Spot[] = lo.zs.map((z) => ({ pos: { u: lo.u, z }, approach: [{ u: lo.walkU, z: o.corridor }, { u: lo.walkU, z }], face: -Math.PI / 2, sit: true }))
  const backLane = lanes[0]
  const windows: Spot[] = [-0.6, 0.6, 0.35, -0.35].map((f) => ({ pos: { u: f * o.halfW, z: -o.halfD + 0.45 }, approach: [{ u: f * o.halfW, z: backLane }], face: Math.PI }))
  const doorU = o.halfW - 1.2
  const door: Spot = { pos: { u: doorU, z: -o.halfD + 0.45 }, approach: [{ u: doorU, z: backLane }], face: 0 }
  const padZ = Math.min(o.halfD - 1.4, o.corridor + 2.2)
  const pads: Spot[] = [0, 1, 2].map((n) => ({ pos: { u: 0.4 - n * 1.6, z: padZ }, approach: [{ u: 0.4 - n * 1.6, z: o.corridor }], face: 0 }))

  return {
    id: o.id,
    center: o.center,
    s: o.s,
    halfW: o.halfW,
    halfD: o.halfD,
    lanes,
    corridor: o.corridor,
    aisles,
    desks,
    door,
    meeting: { center: m.center, radius: m.radius, table: m.table, seats, entrance },
    lounge,
    windows,
    pads,
    gates: {},
    cols: o.cols,
    rows: o.rows,
    board: o.board,
    overflowSpot(k) {
      const u = -1.6 + (k % 5) * 0.8
      const z = o.corridor + 0.7 + Math.floor(k / 5) * 0.7
      return { pos: { u, z }, approach: [{ u, z: o.corridor }], face: 0 }
    },
  }
}

export const OFFICE_GAP_X = 10.3
/** 大阪と東京のあいだ（ガラスの橋）の長さ */
const TOKYO_LINK = 2.6

export const LAYOUTS: Record<OfficeId, OfficeLayout> = {
  osaka: gridLayout({
    id: 'osaka',
    center: new THREE.Vector3(-OFFICE_GAP_X, 0, 0),
    s: -1,
    halfW: 7.2,
    halfD: 6.2,
    cols: [-3.45, -1.15, 1.15, 3.45],
    rows: [-3.9, -1.5, 0.9],
    corridor: 1.85,
    exec: { z: 3.45, us: [0.85, -0.85] },
    meeting: { center: { u: -5.05, z: 4.05 }, radius: 1.75, table: 0.62, seatsN: 5 },
    lounge: { u: 6.2, zs: [2.9, 3.7, 4.5], walkU: 5.3 },
    board: { u: -0.4, w: 6.4 },
  }),
  phnompenh: gridLayout({
    id: 'phnompenh',
    center: new THREE.Vector3(OFFICE_GAP_X, 0, 0),
    s: 1,
    halfW: 7.2,
    halfD: 6.2,
    cols: [-3.45, -1.15, 1.15, 3.45],
    rows: [-3.9, -1.5, 0.9],
    corridor: 1.85,
    meeting: { center: { u: -5.05, z: 4.05 }, radius: 1.75, table: 0.62, seatsN: 5 },
    lounge: { u: 6.2, zs: [2.9, 3.7, 4.5], walkU: 5.3 },
    board: { u: -0.4, w: 6.4 },
  }),
  // 東京：大阪の外側（左）に並ぶ小さめの島。少し高く・少し奥。大阪の通り道（z = -0.7）と東京の通り道の高さをそろえ、短いガラスの橋でつなぐ
  tokyo: gridLayout({
    id: 'tokyo',
    center: new THREE.Vector3(-OFFICE_GAP_X - 7.2 - TOKYO_LINK - 4.7, 0.6, 0.65),
    s: -1,
    halfW: 4.7,
    halfD: 4.0,
    cols: [-2.3, 0, 2.3],
    rows: [-2.15, 0.25],
    corridor: 1.2,
    meeting: { center: { u: 1.2, z: 2.7 }, radius: 1.25, table: 0.45, seatsN: 3 },
    lounge: { u: 3.95, zs: [2.3, 3.1], walkU: 3.15 },
    board: { u: -0.3, w: 4.2 },
  }),
}

/** 大阪と東京のあいだのすき間（ガラスの橋の長さ） */
export const TOKYO_LINK_Z = -0.7

// 拠点のあいだの出入口（大阪の外側の壁の切れ目 ⇄ 東京の内側の手すりの切れ目）
LAYOUTS.osaka.gates.tokyo = { pos: { u: LAYOUTS.osaka.halfW - 0.45, z: TOKYO_LINK_Z }, approach: [], face: Math.PI / 2 }
LAYOUTS.tokyo.gates.osaka = { pos: { u: -LAYOUTS.tokyo.halfW + 0.45, z: TOKYO_LINK_Z - LAYOUTS.tokyo.center.z }, approach: [], face: -Math.PI / 2 }
LAYOUTS.osaka.gates.phnompenh = { pos: { u: -LAYOUTS.osaka.halfW + 0.5, z: 0.4 }, approach: [{ u: -LAYOUTS.osaka.halfW + 1.3, z: LAYOUTS.osaka.lanes[2] }, { u: -LAYOUTS.osaka.halfW + 0.5, z: 0.4 }], face: -Math.PI / 2 }
LAYOUTS.phnompenh.gates.osaka = { pos: { u: -LAYOUTS.phnompenh.halfW + 0.5, z: 0.4 }, approach: [{ u: -LAYOUTS.phnompenh.halfW + 1.3, z: LAYOUTS.phnompenh.lanes[2] }, { u: -LAYOUTS.phnompenh.halfW + 0.5, z: 0.4 }], face: -Math.PI / 2 }

export const ALL_OFFICES: OfficeId[] = ['osaka', 'tokyo', 'phnompenh']

/** 机の天板の高さ */
export const DESK_TOP = 0.62

export function layoutOf(id: OfficeId): OfficeLayout {
  return LAYOUTS[id] ?? LAYOUTS.osaka
}

/** オフィスの中の (u, z) → 世界座標 */
export function toWorld(office: OfficeId, u: number, z: number, y = 0, out = new THREE.Vector3()): THREE.Vector3 {
  const L = layoutOf(office)
  return out.set(L.center.x + L.s * u, L.center.y + y, L.center.z + z)
}

export function officeCenter(office: OfficeId): THREE.Vector3 {
  return layoutOf(office).center.clone()
}

/** 席の番号 → 机（足りないときは手前の広場に立つ） */
export function deskSpot(office: OfficeId, index: number): DeskSpot {
  const L = layoutOf(office)
  if (index >= 0 && index < L.desks.length) return L.desks[index]
  const k = Math.max(0, index - L.desks.length)
  const sp = L.overflowSpot(k)
  return { desk: sp.pos, w: 0, chair: { ...sp, sit: false }, front: { pos: { u: sp.pos.u, z: sp.pos.z + 0.7 }, approach: sp.approach, face: Math.PI }, overflow: true }
}

const near = (a: P2, b: P2, e = 0.05) => Math.abs(a.u - b.u) < e && Math.abs(a.z - b.z) < e

/** 通り道の上の 2 点を結ぶ（横 → 縦の通り道 → 横） */
function network(L: OfficeLayout, a: P2, b: P2): P2[] {
  if (Math.abs(a.z - b.z) < 0.08) return [b]
  let best = L.aisles[0]
  let bd = Infinity
  for (const x of L.aisles) {
    const d = Math.abs(a.u - x) + Math.abs(x - b.u)
    if (d < bd - 1e-6) {
      bd = d
      best = x
    }
  }
  const out: P2[] = []
  if (Math.abs(a.u - best) > 0.05) out.push({ u: best, z: a.z })
  out.push({ u: best, z: b.z })
  out.push(b)
  return out
}

/**
 * いまいる場所（exit：通り道へ出るまでの点列。pos から近い順）から、行き先 spot までの道。
 * 返す点列は from を含まない
 */
export function routeTo(L: OfficeLayout, from: P2, exit: P2[], to: Spot): P2[] {
  const pts: P2[] = []
  let cur = from
  for (const p of exit) {
    if (!near(cur, p)) pts.push(p)
    cur = p
  }
  const entry = to.approach.length ? to.approach[0] : to.pos
  for (const p of network(L, cur, entry)) {
    if (!near(cur, p)) pts.push(p)
    cur = p
  }
  for (const p of to.approach.slice(1)) {
    if (!near(cur, p)) pts.push(p)
    cur = p
  }
  if (!near(cur, to.pos)) pts.push(to.pos)
  return pts
}

/** spot に着いたあと、通り道へ戻るまでの点列（approach の逆順） */
export function exitOf(to: Spot): P2[] {
  return [...to.approach].reverse()
}

// ------------------------------------------------------------------ 拠点のあいだの光の道

/** 大阪 → プノンペンの光の道（橋の上の弧） */
export function bridgeCurve(): THREE.CubicBezierCurve3 {
  const inner = OFFICE_GAP_X - 7.2
  return new THREE.CubicBezierCurve3(
    new THREE.Vector3(-inner - 0.4, 1.2, 0.4),
    new THREE.Vector3(-inner + 0.9, 4.6, 0.4),
    new THREE.Vector3(inner - 0.9, 4.6, 0.4),
    new THREE.Vector3(inner + 0.4, 1.2, 0.4),
  )
}

/** 大阪 → 東京の光の道（ガラスの橋の上の弧） */
export function tokyoCurve(): THREE.CubicBezierCurve3 {
  const a = toWorld('osaka', LAYOUTS.osaka.halfW - 0.4, TOKYO_LINK_Z, 1.2)
  const b = toWorld('tokyo', -LAYOUTS.tokyo.halfW + 0.4, TOKYO_LINK_Z - LAYOUTS.tokyo.center.z, 1.2)
  const m1 = a.clone().lerp(b, 0.25).add(new THREE.Vector3(0, 2.6, 0))
  const m2 = a.clone().lerp(b, 0.75).add(new THREE.Vector3(0, 2.6, 0))
  return new THREE.CubicBezierCurve3(a, m1, m2, b)
}
