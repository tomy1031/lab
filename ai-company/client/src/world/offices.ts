// 3 つのオフィスのジオラマ（空に浮かぶ、ガラス張りの未来的なフロア）と、あいだをつなぐガラスの橋・坂道、地球儀、雲。
// 大阪本社：木の床・社長席（松井社長とネクマックス）・桜。東京オフィス：小さめの島。プノンペン：白い石の床・ヤシ。
// どのオフィスにも：奥の大きなモニター（その拠点の「いま」）、ガラスの丸い会議室とホログラム、ラウンジのソファ、本棚、観葉植物。
// 動かない物は材質ごとに 1 つのメッシュへまとめる（ドローコールを減らす）。
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { OfficeId, OfficeInfo } from '../../../shared/types'
import type { OfficeBoard } from './api'
import { buildBackdrop, type Backdrop } from './backdrops'
import { DESK_TOP, OFFICE_GAP_X, bridgeCurve, layoutOf, tokyoCurve, toWorld, type OfficeLayout } from './layout'
import { glowMat, shade, toonMat } from './mats'
import { bannerTexture, globeTexture, paintBoard } from './screens'
import { type DayPhase, canvas, flowTexture, glowTexture, localTime, paintClock, phaseOfHour, tileFloor, toTexture, woodFloor } from './textures'

export type OfficeTheme = {
  desk: string
  deskEdge: string
  deskLeg: string
  chair: string
  laptop: string
  accent: string
  sofa: string
  clock: string
}

const THEMES: Record<OfficeId, OfficeTheme> = {
  osaka: { desk: '#ffffff', deskEdge: '#e8cfae', deskLeg: '#c9d4e3', chair: '#6f9be0', laptop: '#c3cddb', accent: '#ff7aa2', sofa: '#f4a86c', clock: '#ff7aa2' },
  tokyo: { desk: '#ffffff', deskEdge: '#cfe0f2', deskLeg: '#c9d4e3', chair: '#8a7ae0', laptop: '#c3cddb', accent: '#ff6f4f', sofa: '#8fb6e8', clock: '#ff6f4f' },
  phnompenh: { desk: '#ffffff', deskEdge: '#f1dcb9', deskLeg: '#c9d4e3', chair: '#43b59a', laptop: '#c3cddb', accent: '#f0a04b', sofa: '#5fbf8f', clock: '#f0a04b' },
}

export interface OfficeBuild {
  id: OfficeId
  group: THREE.Group
  door: THREE.Group
  openDoor(): void
  setBoard(board: OfficeBoard | null): void
  /** 会議室にいる人数（ホログラムの明るさ） */
  setMeeting(n: number): void
  /** 会議室のホログラムの中心（世界座標） */
  meetingPoint: THREE.Vector3
  update(dt: number, t: number, now: Date): void
  phase: DayPhase
  dispose(): void
}

// ------------------------------------------------------------------ 小物のヘルパー

class Builder {
  readonly statics = new THREE.Group()
  constructor(readonly theme: OfficeTheme) {}
  add(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, opts: { rx?: number; ry?: number; rz?: number; sx?: number; sy?: number; sz?: number } = {}): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    m.rotation.set(opts.rx ?? 0, opts.ry ?? 0, opts.rz ?? 0)
    m.scale.set(opts.sx ?? 1, opts.sy ?? 1, opts.sz ?? 1)
    this.statics.add(m)
    return m
  }
}

/**
 * 動かない物を少ないメッシュにまとめる。単色のトゥーン・単色の発光は「頂点の色」に色を書いて 1 つのマテリアルにまとめ、
 * テクスチャ付きなどはマテリアルごとにまとめる（オフィス 1 つが数ドローコールになる）
 */
function bake(src: THREE.Group, castShadow: boolean): THREE.Group {
  src.updateMatrixWorld(true)
  type Bucket = { list: THREE.BufferGeometry[]; make: () => THREE.Material; own: boolean }
  const buckets = new Map<string, Bucket>()
  src.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const mat = m.material as THREE.Material
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    g.applyMatrix4(m.matrixWorld)
    let key: string
    let make: () => THREE.Material
    let own = true
    const toon = mat as THREE.MeshToonMaterial
    const basic = mat as THREE.MeshBasicMaterial
    if (toon.isMeshToonMaterial && !toon.map) {
      key = 'toon'
      make = () => new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon.gradientMap })
    } else if (basic.isMeshBasicMaterial && !basic.map) {
      key = `basic|${basic.opacity}|${basic.transparent}|${basic.side}|${basic.blending}|${basic.depthWrite}`
      make = () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: basic.transparent, opacity: basic.opacity, side: basic.side, blending: basic.blending, depthWrite: basic.depthWrite })
    } else {
      key = mat.uuid
      make = () => mat
      own = false
    }
    if (own) {
      const c = (mat as THREE.MeshBasicMaterial).color
      const n = g.attributes.position.count
      const col = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        col[i * 3] = c.r
        col[i * 3 + 1] = c.g
        col[i * 3 + 2] = c.b
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    }
    let b = buckets.get(key)
    if (!b) {
      b = { list: [], make, own }
      buckets.set(key, b)
    }
    b.list.push(g)
  })
  const out = new THREE.Group()
  for (const b of buckets.values()) {
    if (!b.own) for (const g of b.list) g.deleteAttribute('color')
    const merged = mergeGeometries(b.list, false)
    for (const g of b.list) g.dispose()
    if (!merged) continue
    const mat = b.make()
    const mesh = new THREE.Mesh(merged, mat)
    if (b.own) mesh.userData.ownMaterial = true
    const transparent = mat.transparent
    mesh.castShadow = castShadow && !transparent
    mesh.receiveShadow = !transparent
    if (transparent) mesh.renderOrder = 2
    out.add(mesh)
  }
  return out
}

function disposeBaked(g: THREE.Group): void {
  g.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.geometry.dispose()
    if (m.userData.ownMaterial) (m.material as THREE.Material).dispose()
  })
}

// 共有ジオメトリ
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  rbox: new RoundedBoxGeometry(1, 1, 1, 2, 0.12),
  rboxS: new RoundedBoxGeometry(1, 1, 1, 2, 0.04),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 18),
  cylTaper: new THREE.CylinderGeometry(0.8, 1, 1, 14),
  sphere: new THREE.SphereGeometry(1, 16, 12),
  cone: new THREE.ConeGeometry(1, 1, 12),
  plane: new THREE.PlaneGeometry(1, 1),
  disc: new THREE.CircleGeometry(1, 32),
}

/** ガラス（薄い水色・半透明） */
const glassMat = (): THREE.MeshBasicMaterial => {
  const k = 'glass'
  let m = sharedBasic.get(k)
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: '#d4f0ff', transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide })
    sharedBasic.set(k, m)
  }
  return m
}
const sharedBasic = new Map<string, THREE.MeshBasicMaterial>()

function desk(b: Builder, u: number, z: number, w: number, index: number, chairU: number, chairZ: number): void {
  const t = b.theme
  const top = toonMat(t.desk)
  const leg = toonMat(t.deskLeg)
  b.add(GEO.rboxS, top, u, DESK_TOP - 0.03, z, { sx: w, sy: 0.06, sz: 0.74 })
  b.add(GEO.box, toonMat(t.deskEdge), u, DESK_TOP - 0.075, z, { sx: w - 0.06, sy: 0.03, sz: 0.7 })
  b.add(GEO.box, leg, u - w / 2 + 0.08, (DESK_TOP - 0.08) / 2, z, { sx: 0.05, sy: DESK_TOP - 0.08, sz: 0.62 })
  b.add(GEO.box, leg, u + w / 2 - 0.08, (DESK_TOP - 0.08) / 2, z, { sx: 0.05, sy: DESK_TOP - 0.08, sz: 0.62 })
  b.add(GEO.box, toonMat('#eef3f9'), u, 0.34, z + 0.3, { sx: w - 0.2, sy: 0.4, sz: 0.03 })
  // ノート PC（画面は座る人の側を向く。カメラからは銀色のふたが見える）
  b.add(GEO.rboxS, toonMat('#dfe5ee'), u, DESK_TOP + 0.012, z - 0.06, { sx: 0.44, sy: 0.022, sz: 0.3 })
  b.add(GEO.rboxS, toonMat(t.laptop), u, DESK_TOP + 0.16, z + 0.09, { sx: 0.44, sy: 0.29, sz: 0.022, rx: -0.18 })
  b.add(GEO.disc, glowMat('#9fe3ff'), u, DESK_TOP + 0.17, z + 0.104, { sx: 0.035, sy: 0.035, rx: -0.18 })
  // いす（座面の高さ 0.33）
  const chair = toonMat(t.chair)
  b.add(GEO.cyl, chair, chairU, 0.33, chairZ, { sx: 0.24, sy: 0.08, sz: 0.24 })
  b.add(GEO.cyl, leg, chairU, 0.15, chairZ, { sx: 0.035, sy: 0.3, sz: 0.035 })
  b.add(GEO.cyl, leg, chairU, 0.02, chairZ, { sx: 0.2, sy: 0.03, sz: 0.2 })
  b.add(GEO.rbox, chair, chairU, 0.64, chairZ - 0.25, { sx: 0.44, sy: 0.42, sz: 0.07, rx: -0.12 })
  // 机の上の小物
  const k = index % 4
  const ox = u + (index % 2 ? -0.48 : 0.48)
  if (k === 0) {
    b.add(GEO.cyl, toonMat('#ffffff'), ox, DESK_TOP + 0.06, z + 0.1, { sx: 0.055, sy: 0.1, sz: 0.055 })
    b.add(GEO.cyl, toonMat('#6b3e26'), ox, DESK_TOP + 0.105, z + 0.1, { sx: 0.045, sy: 0.01, sz: 0.045 })
  } else if (k === 1) {
    b.add(GEO.cylTaper, toonMat('#f4f1ea'), ox, DESK_TOP + 0.055, z + 0.05, { sx: 0.06, sy: 0.1, sz: 0.06, rx: Math.PI })
    b.add(GEO.sphere, toonMat('#6cc46b'), ox, DESK_TOP + 0.15, z + 0.05, { sx: 0.09, sy: 0.08, sz: 0.09 })
  } else if (k === 2) {
    b.add(GEO.box, toonMat('#7aa7ff'), ox, DESK_TOP + 0.025, z + 0.08, { sx: 0.22, sy: 0.04, sz: 0.16, ry: 0.2 })
    b.add(GEO.box, toonMat('#ffcf5c'), ox, DESK_TOP + 0.06, z + 0.08, { sx: 0.2, sy: 0.03, sz: 0.15, ry: -0.1 })
  } else {
    b.add(GEO.sphere, toonMat('#66b2f0'), ox, DESK_TOP + 0.07, z + 0.08, { sx: 0.06, sy: 0.065, sz: 0.06 })
    b.add(GEO.sphere, toonMat('#f6f6f4'), ox, DESK_TOP + 0.08, z + 0.13, { sx: 0.038, sy: 0.032, sz: 0.02 })
  }
}

/** 社長席：2 人並びの大きな木の机・モニター 2 台・名札 */
function execDesk(b: Builder, us: number[], z: number): void {
  const minU = Math.min(...us) - 0.95
  const maxU = Math.max(...us) + 0.95
  const cu = (minU + maxU) / 2
  const w = maxU - minU
  const wood = toonMat('#d8ae7e')
  const woodD = toonMat('#b98a59')
  b.add(GEO.rboxS, wood, cu, DESK_TOP + 0.02, z, { sx: w, sy: 0.08, sz: 0.95 })
  b.add(GEO.rboxS, woodD, cu, DESK_TOP / 2, z + 0.4, { sx: w - 0.1, sy: DESK_TOP - 0.05, sz: 0.08 })
  b.add(GEO.rboxS, woodD, minU + 0.08, DESK_TOP / 2, z, { sx: 0.1, sy: DESK_TOP - 0.05, sz: 0.85 })
  b.add(GEO.rboxS, woodD, maxU - 0.08, DESK_TOP / 2, z, { sx: 0.1, sy: DESK_TOP - 0.05, sz: 0.85 })
  // 前板の NM ライン
  b.add(GEO.box, glowMat('#7fd4ff'), cu, DESK_TOP - 0.12, z + 0.445, { sx: w - 0.4, sy: 0.03, sz: 0.01 })
  for (const u of us) {
    // モニター（背面がカメラ側）
    b.add(GEO.rboxS, toonMat('#2b3550'), u, DESK_TOP + 0.33, z + 0.12, { sx: 0.62, sy: 0.38, sz: 0.04 })
    b.add(GEO.box, toonMat('#9aa8bd'), u, DESK_TOP + 0.12, z + 0.14, { sx: 0.05, sy: 0.18, sz: 0.05 })
    b.add(GEO.box, toonMat('#9aa8bd'), u, DESK_TOP + 0.065, z + 0.14, { sx: 0.22, sy: 0.02, sz: 0.14 })
    // 背の高いいす
    const ch = toonMat('#34416a')
    const cz = z - 0.72
    b.add(GEO.cyl, ch, u, 0.33, cz, { sx: 0.27, sy: 0.09, sz: 0.27 })
    b.add(GEO.cyl, toonMat('#9aa8bd'), u, 0.15, cz, { sx: 0.04, sy: 0.3, sz: 0.04 })
    b.add(GEO.cyl, toonMat('#9aa8bd'), u, 0.02, cz, { sx: 0.22, sy: 0.03, sz: 0.22 })
    b.add(GEO.rbox, ch, u, 0.78, cz - 0.27, { sx: 0.5, sy: 0.72, sz: 0.09, rx: -0.1 })
  }
  // 卓上の旗（日本・カンボジア）
  for (const [du, col] of [
    [-0.25, '#ffffff'],
    [0.25, '#2b4fa8'],
  ] as const) {
    b.add(GEO.cyl, toonMat('#9aa8bd'), cu + du, DESK_TOP + 0.14, z + 0.3, { sx: 0.008, sy: 0.22, sz: 0.008 })
    b.add(GEO.box, toonMat(col), cu + du + 0.06, DESK_TOP + 0.21, z + 0.3, { sx: 0.12, sy: 0.08, sz: 0.005 })
  }
  b.add(GEO.disc, toonMat('#e0303c'), cu - 0.19, DESK_TOP + 0.21, z + 0.304, { sx: 0.02, sy: 0.02 })
  b.add(GEO.box, toonMat('#e0303c'), cu + 0.31, DESK_TOP + 0.21, z + 0.304, { sx: 0.12, sy: 0.035, sz: 0.004 })
}

function plant(b: Builder, u: number, z: number, size = 1, tall = false): void {
  b.add(GEO.cylTaper, toonMat('#ffffff'), u, 0.22 * size, z, { sx: 0.22 * size, sy: 0.44 * size, sz: 0.22 * size, rx: Math.PI })
  b.add(GEO.cyl, toonMat('#e3e9f2'), u, 0.45 * size, z, { sx: 0.235 * size, sy: 0.03 * size, sz: 0.235 * size })
  const leaf = toonMat('#4fb468')
  const leaf2 = toonMat('#78cf7a')
  if (tall) {
    b.add(GEO.cyl, toonMat('#8a6a4a'), u, 0.8 * size, z, { sx: 0.03 * size, sy: 0.7 * size, sz: 0.03 * size })
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      b.add(GEO.sphere, i % 2 ? leaf : leaf2, u + Math.cos(a) * 0.22 * size, (1.1 + (i % 3) * 0.18) * size, z + Math.sin(a) * 0.22 * size, { sx: 0.26 * size, sy: 0.12 * size, sz: 0.14 * size, ry: -a, rz: 0.5 })
    }
    b.add(GEO.sphere, leaf2, u, 1.42 * size, z, { sx: 0.16 * size, sy: 0.2 * size, sz: 0.16 * size })
    return
  }
  b.add(GEO.sphere, leaf, u, 0.66 * size, z, { sx: 0.3 * size, sy: 0.34 * size, sz: 0.3 * size })
  b.add(GEO.sphere, leaf2, u + 0.15 * size, 0.86 * size, z + 0.05, { sx: 0.2 * size, sy: 0.22 * size, sz: 0.2 * size })
  b.add(GEO.sphere, leaf, u - 0.13 * size, 0.9 * size, z - 0.05, { sx: 0.19 * size, sy: 0.21 * size, sz: 0.19 * size })
}

function sakura(b: Builder, u: number, z: number, s = 1): void {
  const trunk = toonMat('#8a5a44')
  b.add(GEO.cylTaper, trunk, u, 0.75 * s, z, { sx: 0.15 * s, sy: 1.5 * s, sz: 0.15 * s, rz: 0.06 })
  b.add(GEO.cylTaper, trunk, u - 0.25 * s, 1.65 * s, z, { sx: 0.08 * s, sy: 0.8 * s, sz: 0.08 * s, rz: 0.6 })
  b.add(GEO.cylTaper, trunk, u + 0.22 * s, 1.7 * s, z + 0.1, { sx: 0.07 * s, sy: 0.7 * s, sz: 0.07 * s, rz: -0.55 })
  const pinks = [toonMat('#ffc1d6'), toonMat('#ffadc9'), toonMat('#ffd6e5')]
  const blobs: [number, number, number, number][] = [
    [0, 2.35, 0, 0.75],
    [-0.6, 2.1, 0.1, 0.55],
    [0.6, 2.15, 0.15, 0.55],
    [-0.3, 2.7, -0.2, 0.5],
    [0.35, 2.75, 0.1, 0.48],
    [0, 2.05, 0.5, 0.45],
    [-0.1, 2.3, -0.5, 0.5],
  ]
  blobs.forEach(([x, y, zz, r], i) => b.add(GEO.sphere, pinks[i % 3], u + x * s, y * s, z + zz * s, { sx: r * s, sy: r * 0.85 * s, sz: r * s }))
}

function palm(b: Builder, u: number, z: number, lean = 0.15, s = 1): void {
  const trunk = toonMat('#b8875a')
  const ring = toonMat('#9c6e45')
  let x = u
  let y = 0
  for (let i = 0; i < 7; i++) {
    const h = 0.42 * s
    b.add(GEO.cylTaper, i % 2 ? trunk : ring, x, y + h / 2, z, { sx: (0.13 - i * 0.008) * s, sy: h, sz: (0.13 - i * 0.008) * s, rz: -lean })
    x += Math.sin(lean) * h * (1 + i * 0.15)
    y += h * 0.98
  }
  const leaf = [toonMat('#4caf6d'), toonMat('#66c27f')]
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const m = b.add(GEO.sphere, leaf[i % 2], x + Math.cos(a) * 0.55 * s, y - 0.12 * s, z + Math.sin(a) * 0.55 * s, { sx: 0.7 * s, sy: 0.06 * s, sz: 0.2 * s })
    m.rotation.set(0, -a, -0.45)
  }
  b.add(GEO.sphere, toonMat('#7a5a2a'), x, y - 0.08 * s, z, { sx: 0.16 * s, sy: 0.14 * s, sz: 0.16 * s })
}

function bookshelf(b: Builder, u: number, z0: number, z1: number, h = 2.0): void {
  const frame = toonMat('#ffffff')
  const len = z1 - z0
  const cz = (z0 + z1) / 2
  b.add(GEO.box, frame, u, h / 2, cz, { sx: 0.42, sy: h, sz: len })
  const inner = toonMat('#eef2f8')
  const shelves = 4
  const books = ['#ff9fb4', '#7aa7ff', '#ffd166', '#7fd18a', '#b8a1e8', '#ff9f43', '#4fc3c8']
  let k = 0
  for (let s = 0; s < shelves; s++) {
    const y0 = 0.12 + (s * (h - 0.2)) / shelves
    const sh = (h - 0.2) / shelves - 0.06
    b.add(GEO.box, inner, u - 0.06, y0 + sh / 2, cz, { sx: 0.32, sy: sh, sz: len - 0.1 })
    let zz = z0 + 0.12
    while (zz < z1 - 0.15) {
      const bw = 0.07 + ((k * 37) % 5) * 0.015
      const bh = sh * (0.65 + ((k * 13) % 4) * 0.08)
      b.add(GEO.box, toonMat(books[k % books.length]), u - 0.12, y0 + bh / 2, zz + bw / 2, { sx: 0.2, sy: bh, sz: bw })
      zz += bw + 0.01
      k++
      if (k % 9 === 0) zz += 0.18
    }
  }
}

function sofa(b: Builder, u: number, z0: number, z1: number, color: string): void {
  // 背もたれは外側（+u）、座る人は内側（-u）を向く。座面の高さ 0.33
  const c = toonMat(color)
  const cd = toonMat(shade(color, -0.15))
  const len = z1 - z0
  const cz = (z0 + z1) / 2
  b.add(GEO.rbox, cd, u + 0.05, 0.16, cz, { sx: 0.8, sy: 0.3, sz: len + 0.3 })
  b.add(GEO.rbox, c, u + 0.02, 0.33, cz, { sx: 0.7, sy: 0.12, sz: len })
  b.add(GEO.rbox, c, u + 0.4, 0.62, cz, { sx: 0.18, sy: 0.6, sz: len + 0.3 })
  b.add(GEO.rbox, cd, u + 0.05, 0.45, z0 - 0.2, { sx: 0.8, sy: 0.36, sz: 0.2 })
  b.add(GEO.rbox, cd, u + 0.05, 0.45, z1 + 0.2, { sx: 0.8, sy: 0.36, sz: 0.2 })
  // クッション
  b.add(GEO.rbox, toonMat('#fff3d6'), u + 0.25, 0.52, z0 + len * 0.25, { sx: 0.12, sy: 0.3, sz: 0.3, rz: 0.2 })
  b.add(GEO.rbox, toonMat('#ffffff'), u + 0.25, 0.52, z1 - len * 0.25, { sx: 0.12, sy: 0.3, sz: 0.3, rz: 0.2 })
}

// ------------------------------------------------------------------ オフィス 1 つ

/** 街の絵の置き場所（世界座標の中心と幅） */
const BACKDROP_PLACE: Record<OfficeId, { x: number; y: number; z: number; w: number }> = {
  osaka: { x: -12, y: -5.0, z: -32, w: 34 },
  tokyo: { x: -36, y: -4.0, z: -30, w: 26 },
  phnompenh: { x: 12, y: -5.0, z: -32, w: 36 },
}

function textPlane(tex: THREE.Texture, w: number, h: number, mirror: number): THREE.Mesh {
  const m = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }))
  m.scale.set(w * mirror, h, 1)
  return m
}

export function buildOffice(L: OfficeLayout, info: OfficeInfo): OfficeBuild {
  const id = L.id
  const s = L.s
  const theme = THEMES[id]
  const group = new THREE.Group()
  group.position.copy(L.center)
  group.scale.x = s
  const b = new Builder(theme)
  const disposables: { dispose(): void }[] = []
  const HW = L.halfW
  const HD = L.halfD
  const WALL_H = 2.9

  // --- 浮かぶ床（白い台・水色に光る縁・下に浮遊の土台）
  b.add(GEO.rbox, toonMat('#f6f9fd'), 0, -0.24, 0, { sx: HW * 2 + 0.7, sy: 0.48, sz: HD * 2 + 0.7 })
  b.add(GEO.rbox, toonMat('#e3ecf7'), 0, -0.62, 0, { sx: HW * 2 + 0.2, sy: 0.4, sz: HD * 2 + 0.2 })
  b.add(GEO.rbox, toonMat('#d3e1f1'), 0, -0.98, -0.2, { sx: HW * 2 - 1.6, sy: 0.4, sz: HD * 2 - 1.6 })
  const edge = glowMat('#8fe8ff', 0.9)
  b.add(GEO.box, edge, 0, -0.06, HD + 0.36, { sx: HW * 2 + 0.6, sy: 0.05, sz: 0.04 })
  b.add(GEO.box, edge, -HW - 0.36, -0.06, 0, { sx: 0.04, sy: 0.05, sz: HD * 2 + 0.6 })
  b.add(GEO.box, edge, HW + 0.36, -0.06, 0, { sx: 0.04, sy: 0.05, sz: HD * 2 + 0.6 })
  b.add(GEO.box, glowMat('#bfefff', 0.7), 0, -0.44, HD + 0.11, { sx: HW * 2, sy: 0.03, sz: 0.04 })

  const floorTex = id === 'phnompenh' ? tileFloor() : woodFloor()
  disposables.push(floorTex)
  const floorMat = new THREE.MeshLambertMaterial({ map: floorTex })
  const floor = new THREE.Mesh(GEO.plane, floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.scale.set(HW * 2, HD * 2, 1)
  floor.position.y = 0.003
  floor.receiveShadow = true
  group.add(floor)

  // --- ガラスの壁（奥・外側）と、手前・内側の低い手すり
  const frame = toonMat('#ffffff')
  const glass = glassMat()
  // 奥の壁
  b.add(GEO.plane, glass, 0, WALL_H / 2, -HD, { sx: HW * 2, sy: WALL_H })
  b.add(GEO.box, frame, 0, WALL_H, -HD, { sx: HW * 2 + 0.2, sy: 0.12, sz: 0.16 })
  b.add(GEO.box, frame, 0, 0.06, -HD, { sx: HW * 2, sy: 0.12, sz: 0.12 })
  for (let u = -HW; u <= HW + 0.01; u += (HW * 2) / Math.round((HW * 2) / 1.8)) b.add(GEO.box, frame, u, WALL_H / 2, -HD, { sx: 0.08, sy: WALL_H, sz: 0.1 })
  // 外側の壁（大阪は東京への橋の出入口を空ける）
  const outerGap = id === 'osaka' ? [L.gates.tokyo!.pos.z - 0.75, L.gates.tokyo!.pos.z + 0.75] : null
  const outerWall = (z0: number, z1: number) => b.add(GEO.plane, glass, HW, WALL_H / 2, (z0 + z1) / 2, { sx: z1 - z0, sy: WALL_H, ry: Math.PI / 2 })
  if (outerGap) {
    outerWall(-HD, outerGap[0])
    outerWall(outerGap[1], HD)
    b.add(GEO.box, frame, HW, 1.05, outerGap[0], { sx: 0.12, sy: 2.1, sz: 0.12 })
    b.add(GEO.box, frame, HW, 1.05, outerGap[1], { sx: 0.12, sy: 2.1, sz: 0.12 })
    b.add(GEO.box, frame, HW, 2.1, (outerGap[0] + outerGap[1]) / 2, { sx: 0.12, sy: 0.1, sz: 1.5 })
  } else outerWall(-HD, HD)
  b.add(GEO.box, frame, HW, WALL_H, 0, { sx: 0.16, sy: 0.12, sz: HD * 2 + 0.2 })
  for (let z = -HD; z <= HD + 0.01; z += (HD * 2) / Math.round((HD * 2) / 1.8)) {
    if (outerGap && z > outerGap[0] - 0.05 && z < outerGap[1] + 0.05) continue
    b.add(GEO.box, frame, HW, WALL_H / 2, z, { sx: 0.1, sy: WALL_H, sz: 0.08 })
  }
  // 手前の手すり（光る天板）
  const RAIL_H = 0.85
  const railTop = glowMat('#aef2ff', 0.95)
  b.add(GEO.plane, glass, 0, RAIL_H / 2, HD, { sx: HW * 2, sy: RAIL_H })
  b.add(GEO.box, railTop, 0, RAIL_H, HD, { sx: HW * 2, sy: 0.05, sz: 0.06 })
  for (let u = -HW; u <= HW + 0.01; u += (HW * 2) / 6) b.add(GEO.box, frame, u, RAIL_H / 2, HD, { sx: 0.06, sy: RAIL_H, sz: 0.06 })
  // 内側（橋の側）の手すり：橋のたもとは空ける
  const gapZ0 = id === 'tokyo' ? 99 : -0.9
  const gapZ1 = id === 'tokyo' ? 99 : 1.7
  const sideRail = (z0: number, z1: number) => {
    if (z1 - z0 < 0.1) return
    b.add(GEO.plane, glass, -HW, RAIL_H / 2, (z0 + z1) / 2, { sx: z1 - z0, sy: RAIL_H, ry: Math.PI / 2 })
    b.add(GEO.box, railTop, -HW, RAIL_H, (z0 + z1) / 2, { sx: 0.06, sy: 0.05, sz: z1 - z0 })
    b.add(GEO.box, frame, -HW, RAIL_H / 2, z0, { sx: 0.06, sy: RAIL_H, sz: 0.06 })
    b.add(GEO.box, frame, -HW, RAIL_H / 2, z1, { sx: 0.06, sy: RAIL_H, sz: 0.06 })
  }
  if (id === 'tokyo') {
    const gz = L.gates.osaka!.pos.z
    sideRail(-HD, gz - 0.75)
    sideRail(gz + 0.75, HD)
  } else {
    sideRail(-HD, gapZ0)
    sideRail(gapZ1, HD)
  }

  // --- 奥の大きなモニター（その拠点の「いま」）
  const [boardC] = canvas(1536, 480)
  const boardTex = toTexture(boardC)
  disposables.push(boardTex)
  const bw = L.board.w
  const bh = bw * (480 / 1536)
  b.add(GEO.rboxS, toonMat('#3a4766'), L.board.u, 1.05 + bh / 2, -HD + 0.1, { sx: bw + 0.18, sy: bh + 0.18, sz: 0.1 })
  const boardMesh = textPlane(boardTex, bw, bh, s)
  ;(boardMesh.material as THREE.MeshBasicMaterial).transparent = false
  boardMesh.position.set(L.board.u, 1.05 + bh / 2, -HD + 0.16)
  group.add(boardMesh)
  // モニターの下の光る棚
  b.add(GEO.box, frame, L.board.u, 0.95, -HD + 0.22, { sx: bw + 0.4, sy: 0.08, sz: 0.3 })
  b.add(GEO.box, glowMat('#7fd4ff', 0.9), L.board.u, 0.9, -HD + 0.38, { sx: bw + 0.3, sy: 0.02, sz: 0.02 })
  plant(b, L.board.u - bw / 2 - 0.55, -HD + 0.45, 1.0, true)
  plant(b, L.board.u + bw / 2 + 0.55, -HD + 0.45, 0.9, true)
  let lastBoardKey = '__'

  // --- 看板（国旗＋名前）
  const banTex = bannerTexture(info)
  disposables.push(banTex)
  const ban = textPlane(banTex, id === 'tokyo' ? 3.0 : 3.8, id === 'tokyo' ? 0.73 : 0.93, s)
  ban.position.set(HW * 0.42, WALL_H + 0.62, -HD + 0.05)
  group.add(ban)

  // --- 浮かぶ時計
  const [clockC] = canvas(640, 150)
  const clockTex = toTexture(clockC)
  disposables.push(clockTex)
  const clock = textPlane(clockTex, id === 'tokyo' ? 2.2 : 2.7, id === 'tokyo' ? 0.52 : 0.64, s)
  clock.position.set(-HW * 0.45, WALL_H + 0.62, -HD + 0.05)
  group.add(clock)
  const clockLabel = id === 'phnompenh' ? 'プノンペン ICT' : id === 'tokyo' ? '東京 JST' : '大阪 JST'

  // --- ドア（採用された人が出てくる）
  const du = L.door.pos.u
  const door = new THREE.Group()
  door.position.set(du - 0.48, 0, -HD + 0.05)
  const panel = new THREE.Mesh(GEO.rboxS, new THREE.MeshLambertMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.75 }))
  panel.scale.set(0.96, 2.0, 0.06)
  panel.position.set(0.48, 1.0, 0)
  const bar = new THREE.Mesh(GEO.box, toonMat('#ffffff'))
  bar.scale.set(0.06, 0.5, 0.06)
  bar.position.set(0.85, 1.0, 0.06)
  door.add(panel, bar)
  group.add(door)
  disposables.push(panel.material as THREE.Material)
  b.add(GEO.box, frame, du, 2.08, -HD + 0.05, { sx: 1.2, sy: 0.14, sz: 0.16 })
  b.add(GEO.box, frame, du - 0.56, 1.04, -HD + 0.05, { sx: 0.1, sy: 2.08, sz: 0.16 })
  b.add(GEO.box, frame, du + 0.56, 1.04, -HD + 0.05, { sx: 0.1, sy: 2.08, sz: 0.16 })
  b.add(GEO.rbox, toonMat(theme.accent), du, 0.01, -HD + 0.75, { sx: 1.1, sy: 0.02, sz: 0.6 })

  // --- 机
  for (let i = 0; i < L.desks.length; i++) {
    const d = L.desks[i]
    if (d.exec) continue
    desk(b, d.desk.u, d.desk.z, d.w, i, d.chair.pos.u, d.chair.pos.z)
  }
  const exec = L.desks.filter((d) => d.exec)
  if (exec.length) execDesk(b, exec.map((d) => d.desk.u), exec[0].desk.z)

  // --- ガラスの丸い会議室（入口は奥側）
  const M = L.meeting
  const mc = M.center
  const R = M.radius
  const ringGeo = new THREE.CylinderGeometry(R, R, 2.1, 40, 1, true, Math.PI + 0.62, Math.PI * 2 - 1.24)
  disposables.push(ringGeo)
  b.add(ringGeo, glass, mc.u, 1.05, mc.z)
  const topRing = new THREE.TorusGeometry(R, 0.05, 6, 48)
  disposables.push(topRing)
  b.add(topRing, frame, mc.u, 2.1, mc.z, { rx: Math.PI / 2 })
  b.add(topRing, frame, mc.u, 0.04, mc.z, { rx: Math.PI / 2 })
  for (const a of [Math.PI + 0.62, Math.PI - 0.62, 0.0, Math.PI / 2, -Math.PI / 2 + 0.0 + Math.PI]) {
    b.add(GEO.box, frame, mc.u + Math.sin(a) * R, 1.05, mc.z + Math.cos(a) * R, { sx: 0.07, sy: 2.1, sz: 0.07 })
  }
  b.add(GEO.disc, toonMat('#e6f3ff'), mc.u, 0.008, mc.z, { sx: R - 0.05, sy: R - 0.05, rx: -Math.PI / 2 })
  // テーブルといす
  b.add(GEO.cyl, toonMat('#ffffff'), mc.u, 0.6, mc.z, { sx: M.table, sy: 0.06, sz: M.table })
  b.add(GEO.cyl, toonMat('#c9d4e3'), mc.u, 0.3, mc.z, { sx: 0.08, sy: 0.56, sz: 0.08 })
  b.add(GEO.cyl, toonMat('#c9d4e3'), mc.u, 0.02, mc.z, { sx: M.table * 0.6, sy: 0.04, sz: M.table * 0.6 })
  const tableEdge = new THREE.TorusGeometry(M.table, 0.02, 6, 40)
  disposables.push(tableEdge)
  b.add(tableEdge, glowMat('#7fe3ff'), mc.u, 0.63, mc.z, { rx: Math.PI / 2 })
  for (const seat of M.seats) {
    b.add(GEO.cyl, toonMat('#5f86d6'), seat.pos.u, 0.33, seat.pos.z, { sx: 0.22, sy: 0.08, sz: 0.22 })
    b.add(GEO.cyl, toonMat('#c9d4e3'), seat.pos.u, 0.15, seat.pos.z, { sx: 0.03, sy: 0.3, sz: 0.03 })
    const a = Math.atan2(seat.pos.u - mc.u, seat.pos.z - mc.z)
    b.add(GEO.rbox, toonMat('#5f86d6'), seat.pos.u + Math.sin(a) * 0.22, 0.6, seat.pos.z + Math.cos(a) * 0.22, { sx: 0.4, sy: 0.36, sz: 0.06, ry: a })
  }
  // ホログラム（会議中は明るく回る）
  const holo = new THREE.Group()
  holo.position.set(mc.u, 0.64, mc.z)
  const beamGeo = new THREE.CylinderGeometry(0.12, M.table * 0.75, 0.9, 24, 1, true)
  const beamMat = new THREE.MeshBasicMaterial({ color: '#7fe3ff', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  const beam = new THREE.Mesh(beamGeo, beamMat)
  beam.position.y = 0.45
  const iconTex = holoIconTexture()
  const iconMat = new THREE.SpriteMaterial({ map: iconTex, color: '#bff4ff', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending })
  const icon = new THREE.Sprite(iconMat)
  icon.scale.set(0.9, 0.45, 1)
  icon.position.y = 1.05
  const discMat = new THREE.MeshBasicMaterial({ color: '#8fe8ff', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
  const disc = new THREE.Mesh(GEO.disc, discMat)
  disc.rotation.x = -Math.PI / 2
  disc.scale.setScalar(0.16)
  disc.position.y = 0.005
  holo.add(beam, icon, disc)
  group.add(holo)
  disposables.push(beamGeo, beamMat, iconTex, iconMat, discMat)
  let meetingN = 0
  let meetingK = 0
  const meetingPoint = toWorld(id, mc.u, mc.z, 1.6)

  // --- ラウンジ（ソファ）
  if (L.lounge.length) {
    const zs = L.lounge.map((p) => p.pos.z)
    const lu = Math.max(...L.lounge.map((p) => p.pos.u))
    sofa(b, lu + 0.05, Math.min(...zs) - 0.1, Math.max(...zs) + 0.1, theme.sofa)
    // ラグと、小さなテーブル
    b.add(GEO.rbox, toonMat(shade(theme.sofa, 0.55)), lu - 0.55, 0.006, (Math.min(...zs) + Math.max(...zs)) / 2, { sx: 1.5, sy: 0.012, sz: Math.max(...zs) - Math.min(...zs) + 1.0 })
    const tz = (Math.min(...zs) + Math.max(...zs)) / 2
    b.add(GEO.cyl, toonMat('#ffffff'), lu - 0.62, 0.3, tz, { sx: 0.26, sy: 0.04, sz: 0.26 })
    b.add(GEO.cyl, toonMat('#c9d4e3'), lu - 0.62, 0.15, tz, { sx: 0.03, sy: 0.28, sz: 0.03 })
    b.add(GEO.cyl, toonMat('#ffe9b0'), lu - 0.58, 0.36, tz + 0.05, { sx: 0.05, sy: 0.07, sz: 0.05 })
  }

  // --- 本棚（外側の壁ぞい）
  if (id === 'tokyo') bookshelf(b, HW - 0.25, -HD + 0.9, -0.6, 1.8)
  else bookshelf(b, HW - 0.25, -HD + 1.2, id === 'osaka' ? -1.7 : -0.9, 2.1)

  // --- 観葉植物・拠点らしさ
  plant(b, -HW + 0.5, -HD + 0.5, 1.0, true)
  if (id !== 'osaka') plant(b, HW - 0.55, id === 'tokyo' ? 1.2 : 0.1, 0.9)
  plant(b, -HW + 0.45, HD - 0.5, 0.85)
  plant(b, L.aisles[0], HD - 0.45, 0.8)
  if (id === 'osaka') {
    sakura(b, HW - 0.7, HD - 0.75, 0.82)
    plant(b, 2.6, HD - 0.5, 0.8, true)
    plant(b, -2.7, HD - 0.5, 0.8)
  } else if (id === 'phnompenh') {
    palm(b, HW - 0.7, HD - 0.75, -0.15, 0.85)
    palm(b, -HW + 0.6, -HD + 1.6, 0.12, 0.8)
    plant(b, 2.6, HD - 0.5, 0.8, true)
    plant(b, -2.7, HD - 0.5, 0.8)
  } else {
    plant(b, HW - 0.6, HD - 0.6, 1.0, true)
  }
  // ネクマックスの台（席が無いネクマックスが立つ）
  for (const p of L.pads.slice(0, id === 'phnompenh' ? 1 : 0)) {
    b.add(GEO.cyl, toonMat('#e6f3ff'), p.pos.u, 0.025, p.pos.z, { sx: 0.7, sy: 0.05, sz: 0.7 })
  }
  const padRings: THREE.Mesh[] = []
  const padMat = new THREE.MeshBasicMaterial({ color: '#7fe3ff', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  const padGeo = new THREE.RingGeometry(0.55, 0.72, 40)
  disposables.push(padMat, padGeo)
  for (const p of L.pads.slice(0, id === 'phnompenh' ? 1 : 0)) {
    const r = new THREE.Mesh(padGeo, padMat)
    r.rotation.x = -Math.PI / 2
    r.position.set(p.pos.u, 0.06, p.pos.z)
    group.add(r)
    padRings.push(r)
  }

  const baked = bake(b.statics, true)
  group.add(baked)

  // --- 部屋の明かり（時間帯で色が変わる）
  const roomLight = new THREE.PointLight('#ffffff', 0, 26, 1.2)
  roomLight.position.set(0, 5.5, 1.5)
  group.add(roomLight)

  // --- 街の絵（奥）
  // 世界座標で置き場所を決めて、オフィスの中の座標に直す（左右反転を打ち消す）
  const BD = BACKDROP_PLACE[id]
  const backdrop: Backdrop = buildBackdrop(id, BD.w)
  backdrop.mesh.scale.x *= s
  backdrop.mesh.position.set((BD.x - L.center.x) * s, BD.y - L.center.y, BD.z - L.center.z)
  group.add(backdrop.mesh)

  // --- 桜の花びら（大阪）
  let petals: THREE.InstancedMesh | null = null
  const petalState: { x: number; y: number; z: number; vx: number; vz: number; r: number; rv: number }[] = []
  const petalHome = { u: HW - 0.7, z: HD - 0.75 }
  if (id === 'osaka') {
    const pg = new THREE.PlaneGeometry(0.08, 0.06)
    const pm = new THREE.MeshBasicMaterial({ color: '#ffc1d6', side: THREE.DoubleSide })
    petals = new THREE.InstancedMesh(pg, pm, 30)
    disposables.push(pg, pm)
    for (let i = 0; i < 30; i++) petalState.push({ x: petalHome.u + (Math.random() - 0.5) * 2, y: Math.random() * 2.4, z: petalHome.z + (Math.random() - 0.5) * 2, vx: -0.15 - Math.random() * 0.2, vz: -0.1 + Math.random() * 0.2, r: Math.random() * 6, rv: 1 + Math.random() * 2 })
    group.add(petals)
  }

  let doorOpen = 0
  let doorTarget = 0
  let doorTimer = 0
  let lastClock = ''
  const tmp = new THREE.Object3D()
  const build: OfficeBuild = {
    id,
    group,
    door,
    phase: 'day',
    meetingPoint,
    openDoor() {
      doorTarget = 1
      doorTimer = 2.2
    },
    setBoard(board) {
      const key = JSON.stringify(board)
      if (key === lastBoardKey) return
      lastBoardKey = key
      paintBoard(boardC, info, board, theme.accent)
      boardTex.needsUpdate = true
    },
    setMeeting(n) {
      meetingN = n
    },
    update(dt, t, now) {
      if (doorTimer > 0) {
        doorTimer -= dt
        if (doorTimer <= 0) doorTarget = 0
      }
      doorOpen += (doorTarget - doorOpen) * (1 - Math.exp(-dt / 0.15))
      door.rotation.y = doorOpen * 1.5
      const lt = localTime(info.tz, now)
      const phase = phaseOfHour(lt.h + lt.m / 60)
      if (lt.text !== lastClock) {
        lastClock = lt.text
        paintClock(clockC, clockLabel, lt.text, phase, theme.clock)
        clockTex.needsUpdate = true
        if (phase !== build.phase || lastBoardKey === '__') {
          build.phase = phase
          const night = phase === 'night'
          roomLight.color.set(night ? '#9fb3ff' : phase === 'evening' ? '#ffb27a' : phase === 'dawn' ? '#ffd2b0' : '#fff6e5')
          roomLight.intensity = night ? 26 : phase === 'evening' ? 18 : phase === 'dawn' ? 8 : 0
          backdrop.setPhase(night ? 0.55 : phase === 'evening' ? 0.25 : phase === 'dawn' ? 0.12 : 0)
        }
        if (lastBoardKey === '__') build.setBoard(null)
      }
      clock.position.y = WALL_H + 0.62 + Math.sin(t * 1.3) * 0.04
      // 会議室のホログラム
      const target = meetingN > 0 ? 1 : 0
      meetingK += (target - meetingK) * (1 - Math.exp(-dt / 0.4))
      beamMat.opacity = 0.05 + meetingK * 0.22 + Math.sin(t * 3) * 0.02 * meetingK
      iconMat.opacity = 0.18 + meetingK * 0.7
      discMat.opacity = 0.35 + meetingK * 0.5
      icon.position.y = 1.05 + Math.sin(t * 1.6) * 0.05
      holo.rotation.y += dt * (0.3 + meetingK * 0.8)
      for (const r of padRings) {
        const k = 1 + Math.sin(t * 2.4) * 0.05
        r.scale.set(k, k, k)
      }
      if (petals) {
        for (let i = 0; i < petalState.length; i++) {
          const p = petalState[i]
          p.y -= dt * 0.35
          p.x += p.vx * dt
          p.z += p.vz * dt + Math.sin(t * 1.5 + i) * dt * 0.1
          p.r += p.rv * dt
          if (p.y < 0.02) {
            p.y = 1.6 + Math.random() * 1.0
            p.x = petalHome.u + (Math.random() - 0.5) * 1.6
            p.z = petalHome.z + (Math.random() - 0.5) * 1.6
          }
          tmp.position.set(p.x, p.y, p.z)
          tmp.rotation.set(p.r, p.r * 0.7, 0)
          tmp.updateMatrix()
          petals.setMatrixAt(i, tmp.matrix)
        }
        petals.instanceMatrix.needsUpdate = true
      }
    },
    dispose() {
      for (const d of disposables) d.dispose()
      disposeBaked(baked)
      for (const m of [boardMesh, ban, clock]) (m.material as THREE.Material).dispose()
      backdrop.dispose()
      floorMat.dispose()
      group.removeFromParent()
    },
  }
  return build
}

function holoIconTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 128)
  g.fillStyle = '#ffffff'
  const person = (x: number, y: number, s: number) => {
    g.beginPath()
    g.arc(x, y - 22 * s, 14 * s, 0, Math.PI * 2)
    g.fill()
    g.beginPath()
    g.ellipse(x, y + 14 * s, 24 * s, 20 * s, 0, Math.PI, 0)
    g.fill()
  }
  person(70, 70, 0.9)
  person(128, 62, 1.1)
  person(186, 70, 0.9)
  g.strokeStyle = '#ffffff'
  g.lineWidth = 4
  g.strokeRect(20, 10, 216, 100)
  return toTexture(c)
}

// ------------------------------------------------------------------ 橋（大阪 ⇄ プノンペン）と地球儀

export interface BridgeBuild {
  group: THREE.Group
  curve: THREE.CubicBezierCurve3
  reverse: THREE.CubicBezierCurve3
  /** アーチの上（ラベルの位置） */
  top: THREE.Vector3
  globe: THREE.Vector3
  update(dt: number, t: number): void
  pulse(): void
  dispose(): void
}

function chevronTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 64)
  g.clearRect(0, 0, 256, 64)
  g.strokeStyle = '#ffffff'
  g.lineWidth = 10
  g.lineCap = 'round'
  g.lineJoin = 'round'
  for (let i = 0; i < 4; i++) {
    const x = 20 + i * 60
    g.beginPath()
    g.moveTo(x, 12)
    g.lineTo(x + 22, 32)
    g.lineTo(x, 52)
    g.stroke()
  }
  const t = toTexture(c)
  t.wrapS = THREE.RepeatWrapping
  return t
}

export function buildBridge(markUrl: string): BridgeBuild {
  const group = new THREE.Group()
  const disposables: { dispose(): void }[] = []
  const curve = bridgeCurve()
  const reverse = new THREE.CubicBezierCurve3(curve.v3.clone(), curve.v2.clone(), curve.v1.clone(), curve.v0.clone())
  const inner = OFFICE_GAP_X - 7.2
  const z0 = -0.9
  const z1 = 1.7
  const zc = (z0 + z1) / 2
  const len = inner * 2 + 0.6
  const b = new Builder(THEMES.osaka)
  // ガラスの床と、光る縁
  b.add(GEO.rboxS, toonMat('#f6f9fd'), 0, -0.12, zc, { sx: len, sy: 0.24, sz: z1 - z0 + 0.3 })
  b.add(GEO.box, glowMat('#8fe8ff', 0.9), 0, -0.02, z1 + 0.16, { sx: len, sy: 0.04, sz: 0.04 })
  b.add(GEO.box, glowMat('#8fe8ff', 0.9), 0, -0.02, z0 - 0.16, { sx: len, sy: 0.04, sz: 0.04 })
  b.add(GEO.rboxS, toonMat('#e3ecf7'), 0, -0.4, zc, { sx: len - 0.6, sy: 0.3, sz: z1 - z0 - 0.2 })
  // 手すり
  const glass = glassMat()
  for (const z of [z0 - 0.1, z1 + 0.1]) {
    b.add(GEO.plane, glass, 0, 0.45, z, { sx: len, sy: 0.9 })
    b.add(GEO.box, glowMat('#aef2ff', 0.95), 0, 0.9, z, { sx: len, sy: 0.05, sz: 0.06 })
  }
  // アーチ（紫〜青のガラス）
  const archMat = new THREE.MeshLambertMaterial({ color: '#8e8cf0', transparent: true, opacity: 0.85 })
  disposables.push(archMat)
  // 橋をまたぐ虹のようなアーチ（ラベルはこの上）
  const archR = inner - 0.25
  const archH = 0.62
  const archGeo = new THREE.TorusGeometry(archR, 0.13, 10, 48, Math.PI)
  disposables.push(archGeo)
  b.add(archGeo, archMat, 0, 0, z0 + 0.2, { sy: archH })
  b.add(archGeo, glowMat('#c8f6ff', 0.9), 0, 0.02, z0 + 0.2, { sx: 1.0, sy: archH, sz: 1.6 })
  const baked = bake(b.statics, true)
  group.add(baked)

  // 床の矢印（流れる）
  const chev = chevronTexture()
  chev.repeat.set(3, 1)
  disposables.push(chev)
  const chevMat = new THREE.MeshBasicMaterial({ map: chev, color: '#7fe3ff', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })
  disposables.push(chevMat)
  const chevMesh = new THREE.Mesh(GEO.plane, chevMat)
  chevMesh.rotation.x = -Math.PI / 2
  chevMesh.scale.set(len - 1.6, 0.7, 1)
  chevMesh.position.set(0, 0.012, zc)
  group.add(chevMesh)

  // 光の道（やり取りが通る弧）
  const flow = flowTexture()
  disposables.push(flow)
  const coreGeo = new THREE.TubeGeometry(curve, 80, 0.06, 10, false)
  const coreMat = new THREE.MeshBasicMaterial({ map: flow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: '#9ff0ff', opacity: 0.8 })
  const haloGeo = new THREE.TubeGeometry(curve, 80, 0.2, 12, false)
  const haloMat = new THREE.MeshBasicMaterial({ color: '#7fe3ff', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })
  disposables.push(coreGeo, coreMat, haloGeo, haloMat)
  group.add(new THREE.Mesh(coreGeo, coreMat), new THREE.Mesh(haloGeo, haloMat))

  // 地球儀（NEXTMAKE のマーク）
  const globePos = new THREE.Vector3(0, 6.6, -1.4)
  const globeGroup = new THREE.Group()
  globeGroup.position.copy(globePos)
  const gTex = globeTexture()
  disposables.push(gTex)
  const sphereGeo = new THREE.SphereGeometry(1.55, 48, 32)
  const sphereMat = new THREE.MeshBasicMaterial({ map: gTex, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  const sphere = new THREE.Mesh(sphereGeo, sphereMat)
  const innerMat = new THREE.MeshBasicMaterial({ color: '#4aa8ff', transparent: true, opacity: 0.18, depthWrite: false })
  const innerSphere = new THREE.Mesh(sphereGeo, innerMat)
  innerSphere.scale.setScalar(0.97)
  disposables.push(sphereGeo, sphereMat, innerMat)
  globeGroup.add(innerSphere, sphere)
  // 軌道の輪
  const orbitGeo = new THREE.TorusGeometry(2.15, 0.025, 6, 80)
  const orbitMat = new THREE.MeshBasicMaterial({ color: '#c8f6ff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
  disposables.push(orbitGeo, orbitMat)
  const orbit1 = new THREE.Mesh(orbitGeo, orbitMat)
  orbit1.rotation.set(Math.PI / 2 - 0.35, 0.2, 0)
  const orbit2 = new THREE.Mesh(orbitGeo, orbitMat)
  orbit2.scale.setScalar(1.12)
  orbit2.rotation.set(Math.PI / 2 + 0.5, -0.3, 0)
  globeGroup.add(orbit1, orbit2)
  // マーク（いつもカメラを向く板）
  const markMat = new THREE.SpriteMaterial({ color: '#ffffff', transparent: true, depthWrite: false, depthTest: false })
  disposables.push(markMat)
  const mark = new THREE.Sprite(markMat)
  mark.scale.set(1.5, 1.5, 1)
  mark.renderOrder = 5
  globeGroup.add(mark)
  new THREE.TextureLoader().load(markUrl, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace
    markMat.map = tex
    markMat.needsUpdate = true
    disposables.push(tex)
  })
  // 光のにじみ
  const glowSpriteMat = new THREE.SpriteMaterial({ map: glowTexture(), color: '#8fdcff', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })
  disposables.push(glowSpriteMat)
  const glowSprite = new THREE.Sprite(glowSpriteMat)
  glowSprite.scale.set(6.5, 6.5, 1)
  globeGroup.add(glowSprite)
  group.add(globeGroup)

  // 行き交う小さな光
  const dotMat = new THREE.SpriteMaterial({ map: glowTexture(), color: '#c8fbff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
  disposables.push(dotMat)
  const dots: { s: THREE.Sprite; u: number; dir: number; v: number }[] = []
  for (let i = 0; i < 8; i++) {
    const sp = new THREE.Sprite(dotMat)
    sp.scale.setScalar(0.28)
    group.add(sp)
    dots.push({ s: sp, u: i / 8, dir: i % 2 ? 1 : -1, v: 0.12 + (i % 3) * 0.04 })
  }
  const top = new THREE.Vector3(0, archR * archH + 0.3, z0 + 0.2)
  let glow = 0
  const tmp = new THREE.Vector3()
  return {
    group,
    curve,
    reverse,
    top,
    globe: globePos.clone(),
    pulse() {
      glow = 1
    },
    update(dt, t) {
      flow.offset.x -= dt * 0.6
      chev.offset.x -= dt * 0.55
      glow = Math.max(0, glow - dt * 0.8)
      haloMat.opacity = 0.1 + 0.04 * Math.sin(t * 2) + glow * 0.35
      chevMat.opacity = 0.6 + 0.2 * Math.sin(t * 3) + glow * 0.3
      sphere.rotation.y += dt * 0.15
      innerSphere.rotation.y = sphere.rotation.y
      orbit1.rotation.z += dt * 0.25
      orbit2.rotation.z -= dt * 0.18
      globeGroup.position.y = globePos.y + Math.sin(t * 0.9) * 0.12
      glowSpriteMat.opacity = 0.45 + glow * 0.4 + Math.sin(t * 1.4) * 0.05
      for (const d of dots) {
        d.u = (d.u + d.dir * d.v * dt + 1) % 1
        curve.getPoint(d.u, tmp)
        d.s.position.copy(tmp)
      }
    },
    dispose() {
      for (const d of disposables) d.dispose()
      disposeBaked(baked)
      group.removeFromParent()
    },
  }
}

// ------------------------------------------------------------------ 坂道（大阪 ⇄ 東京）

export interface WalkwayBuild {
  group: THREE.Group
  curve: THREE.CubicBezierCurve3
  reverse: THREE.CubicBezierCurve3
  pulse(): void
  update(dt: number, t: number): void
  dispose(): void
}

/** 曲線にそった平たい板（幅 w・厚さ th）。yOff だけ上下にずらす */
function ribbon(curve: THREE.Curve<THREE.Vector3>, w: number, th: number, n: number, yOff = 0): THREE.BufferGeometry {
  const pos: number[] = []
  const idx: number[] = []
  const up = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const p = curve.getPoint(t)
    const tan = curve.getTangent(t)
    const side = new THREE.Vector3().crossVectors(tan, up).normalize().multiplyScalar(w / 2)
    const a = p.clone().add(side).setY(p.y + yOff)
    const b = p.clone().sub(side).setY(p.y + yOff)
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, a.x, a.y - th, a.z, b.x, b.y - th, b.z)
    if (i < n) {
      const k = i * 4
      const m = k + 4
      idx.push(k, m, k + 1, k + 1, m, m + 1) // 上面
      idx.push(k + 2, k + 3, m + 2, k + 3, m + 3, m + 2) // 下面
      idx.push(k, k + 2, m, m, k + 2, m + 2) // 横
      idx.push(k + 1, m + 1, k + 3, k + 3, m + 1, m + 3)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

export function buildTokyoWalkway(): WalkwayBuild {
  const group = new THREE.Group()
  const disposables: { dispose(): void }[] = []
  const curve = tokyoCurve()
  const reverse = new THREE.CubicBezierCurve3(curve.v3.clone(), curve.v2.clone(), curve.v1.clone(), curve.v0.clone())
  // 大阪の外側の壁の切れ目 → 東京の内側の手すりの切れ目（少し上り坂）
  const a = toWorld('osaka', 7.2 + 0.2, -0.7, 0)
  const tk = layoutOf('tokyo')
  const bb = toWorld('tokyo', -tk.halfW - 0.2, -0.7 - tk.center.z, 0)
  const ramp = new THREE.LineCurve3(a, bb)
  const deckGeo = ribbon(ramp, 1.4, 0.18, 8)
  const deckMat = new THREE.MeshLambertMaterial({ color: '#f2f7fd' })
  disposables.push(deckGeo, deckMat)
  const deck = new THREE.Mesh(deckGeo, deckMat)
  deck.receiveShadow = true
  group.add(deck)
  const edgeGeo = ribbon(ramp, 1.5, 0.02, 8, -0.19)
  const edgeMat = new THREE.MeshBasicMaterial({ color: '#8fe8ff', transparent: true, opacity: 0.85 })
  disposables.push(edgeGeo, edgeMat)
  group.add(new THREE.Mesh(edgeGeo, edgeMat))
  // 手すり（ガラス＋光る天板）
  const railMat = new THREE.MeshBasicMaterial({ color: '#aef2ff', transparent: true, opacity: 0.95 })
  const glass = glassMat()
  disposables.push(railMat)
  for (const side of [-0.7, 0.7]) {
    const p0 = a.clone().add(new THREE.Vector3(0, 0, side))
    const p1 = bb.clone().add(new THREE.Vector3(0, 0, side))
    const rg = new THREE.TubeGeometry(new THREE.LineCurve3(p0.clone().setY(p0.y + 0.85), p1.clone().setY(p1.y + 0.85)), 4, 0.03, 6, false)
    disposables.push(rg)
    group.add(new THREE.Mesh(rg, railMat))
    const pg = new THREE.BufferGeometry().setFromPoints([p0, p1, p1.clone().setY(p1.y + 0.85), p0.clone().setY(p0.y + 0.85)])
    pg.setIndex([0, 1, 2, 0, 2, 3])
    disposables.push(pg)
    group.add(new THREE.Mesh(pg, glass))
  }
  // 光の道
  const flow = flowTexture()
  disposables.push(flow)
  const coreGeo = new THREE.TubeGeometry(curve, 40, 0.05, 8, false)
  const coreMat = new THREE.MeshBasicMaterial({ map: flow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: '#9ff0ff', opacity: 0.7 })
  disposables.push(coreGeo, coreMat)
  group.add(new THREE.Mesh(coreGeo, coreMat))
  let glow = 0
  return {
    group,
    curve,
    reverse,
    pulse() {
      glow = 1
    },
    update(dt) {
      flow.offset.x -= dt * 0.6
      glow = Math.max(0, glow - dt * 0.8)
      coreMat.opacity = 0.6 + glow * 0.4
    },
    dispose() {
      for (const d of disposables) d.dispose()
      group.removeFromParent()
    },
  }
}

// ------------------------------------------------------------------ 雲

export function buildClouds(): { group: THREE.Group; update(dt: number, t: number): void } {
  const group = new THREE.Group()
  const mat = toonMat('#ffffff')
  const items: { g: THREE.Group; base: THREE.Vector3; sp: number }[] = []
  const spots: [number, number, number, number][] = [
    [-21, -3.0, 6, 1.4],
    [-2, -3.6, 8, 1.7],
    [19, -2.8, 5, 1.3],
    [-12, -4.2, -4, 1.6],
    [12, -4.0, -6, 1.5],
    [0, -2.2, -6, 1.1],
    [-27, -1.0, -10, 1.2],
    [26, 0.5, -8, 1.0],
    [-8, -2.0, 11, 1.0],
    [8, -2.4, 12, 1.2],
  ]
  const puffs: THREE.BufferGeometry[] = []
  for (const [dx, dy, r] of [
    [0, 0, 1],
    [0.9, -0.15, 0.75],
    [-0.9, -0.2, 0.7],
    [0.35, 0.45, 0.65],
    [1.6, -0.3, 0.5],
  ] as const) {
    const g = GEO.sphere.clone()
    g.scale(r, r, r)
    g.translate(dx, dy, 0)
    puffs.push(g)
  }
  const cloudGeo = mergeGeometries(puffs, false)!
  for (const g of puffs) g.dispose()
  for (const [x, y, z, sc] of spots) {
    const g = new THREE.Group()
    const m = new THREE.Mesh(cloudGeo, mat)
    m.scale.setScalar(sc)
    g.add(m)
    g.position.set(x, y, z)
    group.add(g)
    items.push({ g, base: new THREE.Vector3(x, y, z), sp: 0.3 + Math.random() * 0.3 })
  }
  return {
    group,
    update(_dt, t) {
      for (const it of items) {
        it.g.position.x = it.base.x + Math.sin(t * 0.05 * it.sp + it.base.z) * 1.5
        it.g.position.y = it.base.y + Math.sin(t * it.sp + it.base.x) * 0.15
      }
    },
  }
}
