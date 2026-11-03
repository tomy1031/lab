// オフィスの配置（座標の約束）。2 つのオフィスは左右対称：日本は左（外側 = -X）、カンボジアは右（外側 = +X）。
// オフィスの中は (u, z) で考える：u = 外側へ向かう向き（+ が外の壁側、- が光の道の側）、z = 手前（カメラ側）が +。
// 机は 4 列 × 3 行 = 12 席。人は机の奥のいすに座り、手前（カメラ）を向く。
import * as THREE from 'three'
import type { OfficeId } from '../../../shared/types'

export const OFFICE_CENTER_X = 9.5
/** 床の半分の幅（u）と奥行き（z） */
export const HALF_W = 7
export const HALF_D = 6
/** 外側の通路（ここを通って行き来する） */
export const CORRIDOR_U = 5.5
/** 入口のドア（奥の壁の外側寄り） */
export const DOOR_U = 5.5
export const DOOR_Z = -HALF_D
/** 机の天板の高さ */
export const DESK_TOP = 0.62

const COLS = [-1.2, 1.2, -3.6, 3.6]
const ROWS = [-0.6, 2.2, -3.4] // 0..3 = 真ん中の行、4..7 = 手前、8..11 = 奥

export function officeSign(office: OfficeId): number {
  return office === 'jp' ? -1 : 1
}

export function officeCenter(office: OfficeId): THREE.Vector3 {
  return new THREE.Vector3(officeSign(office) * OFFICE_CENTER_X, 0, 0)
}

/** オフィスの中の (u, z) → 世界座標 */
export function toWorld(office: OfficeId, u: number, z: number, y = 0, out = new THREE.Vector3()): THREE.Vector3 {
  const s = officeSign(office)
  return out.set(s * OFFICE_CENTER_X + s * u, y, z)
}

export type DeskSpot = {
  /** 机の中心 */
  desk: { u: number; z: number }
  /** いす（座る位置） */
  chair: { u: number; z: number }
  /** いすの後ろの通り道の z */
  laneZ: number
  /** 机の手前（ネクマックスが話しかけに来る位置） */
  front: { u: number; z: number }
  overflow: boolean
}

export function deskSpot(index: number): DeskSpot {
  if (index >= 0 && index < 12) {
    const u = COLS[index % 4]
    const z = ROWS[Math.floor(index / 4)]
    return { desk: { u, z }, chair: { u, z: z - 0.72 }, laneZ: z - 1.6, front: { u, z: z + 0.98 }, overflow: false }
  }
  // 席が足りないとき：手前の広場に立つ
  const k = Math.max(0, index - 12)
  const u = -2.6 + (k % 8) * 0.85
  const z = 5.3 - Math.floor(k / 8) * 0.8
  return { desk: { u, z }, chair: { u, z }, laneZ: z, front: { u, z: z + 0.7 }, overflow: true }
}

/** ネクマックスの定位置（同じオフィスに何体かいたら横に並べる） */
export function nexmaxHome(n: number): { u: number; z: number } {
  return { u: 0.2 - n * 1.5, z: 4.5 }
}

export const MEETING = { u: -4.7, z: 4.3 }

/** 縦の通り道（机の列のすき間と外側の通路） */
const AISLES = [-2.4, 0, 2.4, CORRIDOR_U]

/**
 * 2 点の間の道（u, z の点列。from は含まない）：横は「通り道の行」、縦は「すき間の列」を通って机といすを避ける。
 * fromLane / toLane：いすに座っている（座りに行く）ときの、いすの後ろの通り道の z
 */
export function route(from: { u: number; z: number }, to: { u: number; z: number }, toLaneZ?: number, fromLaneZ?: number): { u: number; z: number }[] {
  const FRONT = 3.3
  const pts: { u: number; z: number }[] = []
  let cur = { ...from }
  if (fromLaneZ !== undefined && Math.abs(fromLaneZ - from.z) > 0.05) {
    cur = { u: from.u, z: fromLaneZ }
    pts.push(cur)
  }
  const destLane = toLaneZ ?? to.z
  const sameLane = Math.abs(cur.z - destLane) < 0.3
  const bothFront = cur.z > FRONT && destLane > FRONT - 0.3
  if (!sameLane && !bothFront) {
    let a = AISLES[0]
    let best = Infinity
    for (const x of AISLES) {
      const d = Math.abs(cur.u - x) + Math.abs(x - to.u)
      if (d < best - 1e-6) {
        best = d
        a = x
      }
    }
    if (Math.abs(cur.u - a) > 0.05) pts.push({ u: a, z: cur.z })
    pts.push({ u: a, z: destLane })
  }
  if (toLaneZ !== undefined && Math.abs(toLaneZ - to.z) > 0.05) pts.push({ u: to.u, z: toLaneZ })
  pts.push(to)
  return pts
}

/** 光の道（日本 → カンボジア）。両端は床の内側の縁 */
export function bridgeCurve(): THREE.CubicBezierCurve3 {
  const inner = OFFICE_CENTER_X - HALF_W
  return new THREE.CubicBezierCurve3(
    new THREE.Vector3(-inner - 0.2, 0.25, 0.4),
    new THREE.Vector3(-inner + 0.6, 4.2, 0.4),
    new THREE.Vector3(inner - 0.6, 4.2, 0.4),
    new THREE.Vector3(inner + 0.2, 0.25, 0.4),
  )
}
