// 2 つのオフィスのジオラマ（浮かぶ島の上のおもちゃのオフィス）と、あいだをつなぐ光の道。
// 日本（大阪本社）：木の床・桜・障子・のれん・ちょうちん・窓の外に城と格子の塔。
// カンボジア（プノンペン）：タイルの床・ヤシ・蓮の池・クメールの模様の壁・窓の外にアンコールふうの塔。
// 動かない物は材質ごとに 1 つのメッシュへまとめる（ドローコールを減らす）。
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { OfficeId, OfficeInfo } from '../../../shared/types'
import { DESK_TOP, DOOR_U, HALF_D, HALF_W, MEETING, OFFICE_CENTER_X, bridgeCurve, deskSpot, officeSign } from './layout'
import { shade, toonMat } from './mats'
import {
  type DayPhase,
  canvas,
  flowTexture,
  glowTexture,
  khmerWallTexture,
  localTime,
  paintClock,
  paintWindow,
  phaseOfHour,
  shojiTexture,
  signTexture,
  tileFloor,
  toTexture,
  woodFloor,
} from './textures'

export type OfficeTheme = {
  floorSide: string
  soil: string
  wall: string
  trim: string
  desk: string
  deskLeg: string
  chair: string
  laptop: string
  accent: string
  door: string
}

const THEMES: Record<OfficeId, OfficeTheme> = {
  jp: { floorSide: '#d9a877', soil: '#a7c97a', wall: '#fff3e2', trim: '#c8875a', desk: '#f2d7b3', deskLeg: '#b98b5e', chair: '#ff8fa3', laptop: '#5b8def', accent: '#ff7aa2', door: '#c8875a' },
  kh: { floorSide: '#e7c79c', soil: '#9fd08a', wall: '#fde9cd', trim: '#d79a5c', desk: '#fffaf0', deskLeg: '#c08a54', chair: '#4fc3a1', laptop: '#3fb6a8', accent: '#ffb347', door: '#a86a3c' },
}

export interface OfficeBuild {
  id: OfficeId
  group: THREE.Group
  /** ドアの蝶番（rotation.y を開閉に使う） */
  door: THREE.Group
  openDoor(): void
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

/** 材質ごとにまとめた静的メッシュを返す */
function bake(src: THREE.Group, castShadow: boolean): THREE.Group {
  src.updateMatrixWorld(true)
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>()
  src.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2))
    g.applyMatrix4(m.matrixWorld)
    const mat = m.material as THREE.Material
    if (!byMat.has(mat)) byMat.set(mat, [])
    byMat.get(mat)!.push(g)
  })
  const out = new THREE.Group()
  for (const [mat, list] of byMat) {
    const merged = mergeGeometries(list, false)
    for (const g of list) g.dispose()
    if (!merged) continue
    const mesh = new THREE.Mesh(merged, mat)
    mesh.castShadow = castShadow
    mesh.receiveShadow = true
    out.add(mesh)
  }
  return out
}

// 共有ジオメトリ
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  rbox: new RoundedBoxGeometry(1, 1, 1, 2, 0.12),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  cylTaper: new THREE.CylinderGeometry(0.8, 1, 1, 14),
  sphere: new THREE.SphereGeometry(1, 16, 12),
  cone: new THREE.ConeGeometry(1, 1, 12),
  plane: new THREE.PlaneGeometry(1, 1),
  disc: new THREE.CircleGeometry(1, 28),
}

function desk(b: Builder, index: number): void {
  const t = b.theme
  const s = deskSpot(index)
  const { u, z } = s.desk
  const top = toonMat(t.desk)
  const leg = toonMat(t.deskLeg)
  b.add(GEO.rbox, top, u, DESK_TOP - 0.04, z, { sx: 1.5, sy: 0.08, sz: 0.74 })
  b.add(GEO.box, leg, u - 0.66, (DESK_TOP - 0.08) / 2, z, { sx: 0.06, sy: DESK_TOP - 0.08, sz: 0.62 })
  b.add(GEO.box, leg, u + 0.66, (DESK_TOP - 0.08) / 2, z, { sx: 0.06, sy: DESK_TOP - 0.08, sz: 0.62 })
  b.add(GEO.box, leg, u, 0.32, z + 0.28, { sx: 1.3, sy: 0.38, sz: 0.04 })
  // ノートPC（画面は座る人の側を向く。カメラからは背面のふたが見える）
  const lap = toonMat(t.laptop)
  b.add(GEO.rbox, toonMat('#d9dee8'), u, DESK_TOP + 0.015, z - 0.08, { sx: 0.46, sy: 0.025, sz: 0.3 })
  b.add(GEO.rbox, lap, u, DESK_TOP + 0.16, z + 0.08, { sx: 0.46, sy: 0.3, sz: 0.025, rx: -0.18 })
  b.add(GEO.disc, toonMat('#ffffff'), u, DESK_TOP + 0.17, z + 0.097, { sx: 0.045, sy: 0.045, rx: -0.18 })
  // いす
  const chair = toonMat(t.chair)
  b.add(GEO.cyl, chair, s.chair.u, 0.33, s.chair.z, { sx: 0.24, sy: 0.08, sz: 0.24 })
  b.add(GEO.cyl, leg, s.chair.u, 0.15, s.chair.z, { sx: 0.035, sy: 0.3, sz: 0.035 })
  b.add(GEO.cyl, leg, s.chair.u, 0.02, s.chair.z, { sx: 0.2, sy: 0.03, sz: 0.2 })
  b.add(GEO.rbox, chair, s.chair.u, 0.62, s.chair.z - 0.24, { sx: 0.44, sy: 0.4, sz: 0.07, rx: -0.12 })
  // 机の上の小物（席ごとに決まる）
  const k = index % 4
  const ox = u + (index % 2 ? -0.5 : 0.5)
  if (k === 0) {
    b.add(GEO.cyl, toonMat('#ffffff'), ox, DESK_TOP + 0.06, z + 0.1, { sx: 0.06, sy: 0.1, sz: 0.06 })
    b.add(GEO.cyl, toonMat('#6b3e26'), ox, DESK_TOP + 0.105, z + 0.1, { sx: 0.05, sy: 0.01, sz: 0.05 })
  } else if (k === 1) {
    b.add(GEO.cylTaper, toonMat('#e58b5a'), ox, DESK_TOP + 0.06, z + 0.05, { sx: 0.07, sy: 0.11, sz: 0.07, rx: Math.PI })
    b.add(GEO.sphere, toonMat('#6cc46b'), ox, DESK_TOP + 0.17, z + 0.05, { sx: 0.1, sy: 0.09, sz: 0.1 })
  } else if (k === 2) {
    b.add(GEO.box, toonMat('#7aa7ff'), ox, DESK_TOP + 0.025, z + 0.08, { sx: 0.24, sy: 0.04, sz: 0.17, ry: 0.2 })
    b.add(GEO.box, toonMat('#ffcf5c'), ox, DESK_TOP + 0.065, z + 0.08, { sx: 0.22, sy: 0.04, sz: 0.16, ry: -0.1 })
  } else {
    // 小さなネクマックスの人形
    b.add(GEO.sphere, toonMat('#66b2f0'), ox, DESK_TOP + 0.07, z + 0.08, { sx: 0.065, sy: 0.07, sz: 0.065 })
    b.add(GEO.sphere, toonMat('#f6f6f4'), ox, DESK_TOP + 0.08, z + 0.135, { sx: 0.04, sy: 0.035, sz: 0.02 })
  }
}

function plant(b: Builder, u: number, z: number, size = 1): void {
  b.add(GEO.cylTaper, toonMat('#f4f1ea'), u, 0.22 * size, z, { sx: 0.24 * size, sy: 0.44 * size, sz: 0.24 * size, rx: Math.PI })
  const leaf = toonMat('#5fbf6a')
  const leaf2 = toonMat('#7fd17a')
  b.add(GEO.sphere, leaf, u, 0.66 * size, z, { sx: 0.32 * size, sy: 0.36 * size, sz: 0.32 * size })
  b.add(GEO.sphere, leaf2, u + 0.16 * size, 0.86 * size, z + 0.05, { sx: 0.22 * size, sy: 0.24 * size, sz: 0.22 * size })
  b.add(GEO.sphere, leaf, u - 0.14 * size, 0.92 * size, z - 0.05, { sx: 0.2 * size, sy: 0.22 * size, sz: 0.2 * size })
}

function meetingTable(b: Builder): void {
  const { u, z } = MEETING
  const t = b.theme
  b.add(GEO.cyl, toonMat(t.desk), u, 0.58, z, { sx: 0.78, sy: 0.07, sz: 0.78 })
  b.add(GEO.cyl, toonMat(t.deskLeg), u, 0.28, z, { sx: 0.08, sy: 0.56, sz: 0.08 })
  b.add(GEO.cyl, toonMat(t.deskLeg), u, 0.02, z, { sx: 0.4, sy: 0.04, sz: 0.4 })
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    b.add(GEO.cyl, toonMat(t.chair), u + Math.cos(a) * 1.08, 0.3, z + Math.sin(a) * 1.08, { sx: 0.22, sy: 0.1, sz: 0.22 })
    b.add(GEO.cyl, toonMat(t.deskLeg), u + Math.cos(a) * 1.08, 0.13, z + Math.sin(a) * 1.08, { sx: 0.04, sy: 0.26, sz: 0.04 })
  }
  // ホワイトボードの代わりに、机の上にふせん
  const notes = ['#ffe066', '#ff9fb4', '#8fd3ff']
  notes.forEach((c, i) => b.add(GEO.box, toonMat(c), u - 0.25 + i * 0.25, 0.625, z + (i % 2) * 0.12, { sx: 0.16, sy: 0.01, sz: 0.16, ry: i * 0.3 }))
}

function sakura(b: Builder, u: number, z: number): void {
  const trunk = toonMat('#8a5a44')
  b.add(GEO.cylTaper, trunk, u, 0.75, z, { sx: 0.16, sy: 1.5, sz: 0.16, rz: 0.06 })
  b.add(GEO.cylTaper, trunk, u - 0.25, 1.65, z, { sx: 0.09, sy: 0.8, sz: 0.09, rz: 0.6 })
  b.add(GEO.cylTaper, trunk, u + 0.22, 1.7, z + 0.1, { sx: 0.08, sy: 0.7, sz: 0.08, rz: -0.55 })
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
  blobs.forEach(([x, y, zz, r], i) => b.add(GEO.sphere, pinks[i % 3], u + x, y, z + zz, { sx: r, sy: r * 0.85, sz: r }))
}

function palm(b: Builder, u: number, z: number, lean = 0.15): void {
  const trunk = toonMat('#b8875a')
  const ring = toonMat('#9c6e45')
  let x = u
  let y = 0
  for (let i = 0; i < 7; i++) {
    const h = 0.42
    b.add(GEO.cylTaper, i % 2 ? trunk : ring, x, y + h / 2, z, { sx: 0.13 - i * 0.008, sy: h, sz: 0.13 - i * 0.008, rz: -lean })
    x += Math.sin(lean) * h * (1 + i * 0.15)
    y += h * 0.98
  }
  const leaf = [toonMat('#4caf6d'), toonMat('#66c27f')]
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const m = b.add(GEO.sphere, leaf[i % 2], x + Math.cos(a) * 0.55, y - 0.12, z + Math.sin(a) * 0.55, { sx: 0.7, sy: 0.06, sz: 0.2 })
    m.rotation.set(0, -a, -0.45)
  }
  b.add(GEO.sphere, toonMat('#7a5a2a'), x, y - 0.08, z, { sx: 0.16, sy: 0.14, sz: 0.16 })
  b.add(GEO.sphere, toonMat('#6b4a22'), x + 0.12, y - 0.16, z + 0.05, { sx: 0.09, sy: 0.09, sz: 0.09 })
}

function lotusPond(b: Builder, u: number, z: number): void {
  b.add(GEO.disc, toonMat('#e3d3b8'), u, 0.012, z, { sx: 0.95, sy: 2.75, rx: -Math.PI / 2 })
  b.add(GEO.disc, toonMat('#7cc8e8'), u, 0.02, z, { sx: 0.78, sy: 2.55, rx: -Math.PI / 2 })
  const pad = toonMat('#5cb85c')
  const pink = toonMat('#ff9cc0')
  const pads: [number, number][] = [
    [-0.2, -1.6],
    [0.25, -0.7],
    [-0.15, 0.3],
    [0.2, 1.2],
    [-0.2, 1.9],
  ]
  pads.forEach(([du, dz], i) => {
    b.add(GEO.disc, pad, u + du, 0.03, z + dz, { sx: 0.22, sy: 0.22, rx: -Math.PI / 2 })
    if (i % 2 === 0) {
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2
        b.add(GEO.cone, pink, u + du + Math.cos(a) * 0.05, 0.1, z + dz + Math.sin(a) * 0.05, { sx: 0.06, sy: 0.16, sz: 0.04, rx: Math.sin(a) * 0.4, rz: -Math.cos(a) * 0.4 })
      }
      b.add(GEO.sphere, toonMat('#ffe066'), u + du, 0.12, z + dz, { sx: 0.035, sy: 0.03, sz: 0.035 })
    }
  })
}

// ------------------------------------------------------------------ オフィス 1 つ

function textPlane(tex: THREE.Texture, w: number, h: number, mirror: number): THREE.Mesh {
  const m = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: tex, transparent: true }))
  m.scale.set(w * mirror, h, 1)
  return m
}

export function buildOffice(info: OfficeInfo): OfficeBuild {
  const id = info.id
  const s = officeSign(id)
  const theme = THEMES[id]
  const group = new THREE.Group()
  group.position.set(s * OFFICE_CENTER_X, 0, 0)
  group.scale.x = s
  const b = new Builder(theme)
  const disposables: { dispose(): void }[] = []

  // --- 浮かぶ島
  b.add(GEO.rbox, toonMat(theme.floorSide), 0, -0.33, 0, { sx: HALF_W * 2 + 0.5, sy: 0.66, sz: HALF_D * 2 + 0.5 })
  b.add(GEO.rbox, toonMat(theme.soil), 0, -0.8, 0, { sx: HALF_W * 2 + 0.2, sy: 0.4, sz: HALF_D * 2 + 0.2 })
  b.add(GEO.rbox, toonMat(shade(theme.soil, -0.25)), 0, -1.35, 0, { sx: HALF_W * 2 - 1.2, sy: 0.9, sz: HALF_D * 2 - 1.4 })
  b.add(GEO.rbox, toonMat(shade(theme.soil, -0.4)), 0, -2.05, -0.3, { sx: HALF_W * 2 - 4.5, sy: 0.8, sz: HALF_D * 2 - 4.5 })

  // 床（影を受ける）
  const floorTex = id === 'jp' ? woodFloor() : tileFloor()
  disposables.push(floorTex)
  const floorMat = new THREE.MeshLambertMaterial({ map: floorTex })
  const floor = new THREE.Mesh(GEO.plane, floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.scale.set(HALF_W * 2, HALF_D * 2, 1)
  floor.position.y = 0.002
  floor.receiveShadow = true
  group.add(floor)

  // --- 壁（奥と外側）
  const wallMat = new THREE.MeshLambertMaterial({ color: theme.wall })
  const back = new THREE.Mesh(GEO.box, wallMat)
  back.scale.set(HALF_W * 2 + 0.3, 3.0, 0.3)
  back.position.set(0, 1.5, -HALF_D - 0.15)
  back.receiveShadow = true
  group.add(back)
  const side = new THREE.Mesh(GEO.box, wallMat)
  side.scale.set(0.3, 3.0, HALF_D * 2 + 0.3)
  side.position.set(HALF_W + 0.15, 1.5, 0)
  side.receiveShadow = true
  group.add(side)
  const trim = toonMat(theme.trim)
  b.add(GEO.box, trim, 0, 3.04, -HALF_D - 0.15, { sx: HALF_W * 2 + 0.4, sy: 0.12, sz: 0.4 })
  b.add(GEO.box, trim, HALF_W + 0.15, 3.04, 0, { sx: 0.4, sy: 0.12, sz: HALF_D * 2 + 0.4 })
  b.add(GEO.box, trim, 0, 0.08, -HALF_D + 0.02, { sx: HALF_W * 2, sy: 0.16, sz: 0.06 })
  // 外側の壁の模様（障子・クメールの模様）
  const wallTex = id === 'jp' ? shojiTexture() : khmerWallTexture()
  disposables.push(wallTex)
  const deco = new THREE.Mesh(GEO.plane, new THREE.MeshLambertMaterial({ map: wallTex }))
  deco.rotation.y = -Math.PI / 2
  deco.scale.set(HALF_D * 2 - 0.4, 2.2, 1)
  deco.position.set(HALF_W - 0.005, 1.35, 0)
  group.add(deco)

  // --- 窓（外の景色）
  const [winC] = canvas(640, 220)
  const winTex = toTexture(winC)
  disposables.push(winTex)
  const win = textPlane(winTex, 6.4, 2.0, 1)
  win.scale.x = 6.4 * s // 景色も左右を正しく
  win.position.set(-0.6, 1.72, -HALF_D + 0.02)
  group.add(win)
  const frame = toonMat('#ffffff')
  b.add(GEO.box, frame, -0.6, 2.76, -HALF_D + 0.05, { sx: 6.6, sy: 0.1, sz: 0.08 })
  b.add(GEO.box, frame, -0.6, 0.68, -HALF_D + 0.05, { sx: 6.6, sy: 0.1, sz: 0.08 })
  for (const x of [-3.85, -1.7, 0.5, 2.65]) b.add(GEO.box, frame, x, 1.72, -HALF_D + 0.05, { sx: 0.1, sy: 2.1, sz: 0.08 })
  b.add(GEO.box, toonMat(theme.trim), -0.6, 0.6, -HALF_D + 0.18, { sx: 6.7, sy: 0.07, sz: 0.3 })

  // --- 看板
  const signTex =
    id === 'jp'
      ? signTexture(
          [
            { text: '大阪本社', size: 72, color: '#ffffff', weight: 800 },
            { text: 'OSAKA · NEXTMAKE', size: 28, color: '#ffe3ec' },
          ],
          '#ff7aa2',
        )
      : signTexture(
          [
            { text: 'プノンペン', size: 62, color: '#ffffff', weight: 800 },
            { text: 'PHNOM PENH · ភ្នំពេញ', size: 30, color: '#fff3dc' },
          ],
          '#f0a04b',
        )
  disposables.push(signTex)
  const sign = textPlane(signTex, 2.6, 0.98, s)
  sign.position.set(-5.05, 2.05, -HALF_D + 0.03)
  group.add(sign)

  // --- ドア（採用された人が出てくる）
  const door = new THREE.Group()
  door.position.set(DOOR_U - 0.5, 0, -HALF_D + 0.06)
  const panel = new THREE.Mesh(GEO.rbox, toonMat(theme.door))
  panel.scale.set(1.0, 1.95, 0.08)
  panel.position.set(0.5, 0.98, 0)
  panel.castShadow = true
  const knob = new THREE.Mesh(GEO.sphere, toonMat('#ffd166'))
  knob.scale.setScalar(0.06)
  knob.position.set(0.85, 0.95, 0.06)
  door.add(panel, knob)
  group.add(door)
  b.add(GEO.box, toonMat(shade(theme.door, -0.3)), DOOR_U, 2.02, -HALF_D + 0.05, { sx: 1.25, sy: 0.12, sz: 0.12 })
  b.add(GEO.box, toonMat(shade(theme.door, -0.3)), DOOR_U - 0.58, 1.0, -HALF_D + 0.05, { sx: 0.1, sy: 2.0, sz: 0.12 })
  b.add(GEO.box, toonMat(shade(theme.door, -0.3)), DOOR_U + 0.58, 1.0, -HALF_D + 0.05, { sx: 0.1, sy: 2.0, sz: 0.12 })
  // 玄関マット
  b.add(GEO.rbox, toonMat(theme.accent), DOOR_U, 0.01, -HALF_D + 0.8, { sx: 1.2, sy: 0.02, sz: 0.7 })

  let lantern: THREE.MeshBasicMaterial | null = null
  if (id === 'jp') {
    // のれん（3 枚、藍色に白い丸）
    const [nc, ng] = canvas(256, 192)
    ng.fillStyle = '#2f4a8a'
    ng.fillRect(0, 0, 256, 192)
    ng.fillStyle = '#ffffff'
    ng.beginPath()
    ng.arc(128, 96, 44, 0, Math.PI * 2)
    ng.fill()
    ng.fillStyle = '#2f4a8a'
    ng.beginPath()
    ng.arc(128, 96, 30, 0, Math.PI * 2)
    ng.fill()
    ng.fillStyle = '#ffffff'
    ng.font = '700 34px sans-serif'
    ng.textAlign = 'center'
    ng.textBaseline = 'middle'
    ng.fillText('NM', 128, 98)
    const nt = toTexture(nc)
    disposables.push(nt)
    const noren = textPlane(nt, 1.1, 0.55, s)
    noren.position.set(DOOR_U, 1.78, -HALF_D + 0.13)
    group.add(noren)
    // ちょうちん
    lantern = new THREE.MeshBasicMaterial({ color: '#ff5a4f' })
    const lan = new THREE.Mesh(GEO.sphere, lantern)
    lan.scale.set(0.22, 0.3, 0.22)
    lan.position.set(DOOR_U - 1.05, 2.15, -HALF_D + 0.35)
    group.add(lan)
    b.add(GEO.cyl, toonMat('#2b2b2b'), DOOR_U - 1.05, 2.47, -HALF_D + 0.35, { sx: 0.13, sy: 0.06, sz: 0.13 })
    b.add(GEO.cyl, toonMat('#2b2b2b'), DOOR_U - 1.05, 1.84, -HALF_D + 0.35, { sx: 0.13, sy: 0.06, sz: 0.13 })
    b.add(GEO.cyl, toonMat('#2b2b2b'), DOOR_U - 1.05, 2.62, -HALF_D + 0.25, { sx: 0.012, sy: 0.3, sz: 0.012 })
    sakura(b, 6.15, 4.9)
    plant(b, -6.3, -5.3, 1.1)
    plant(b, -6.4, 1.2, 0.9)
  } else {
    // 入口の上のアーチ
    b.add(GEO.cone, toonMat('#e0a060'), DOOR_U, 2.35, -HALF_D + 0.08, { sx: 0.7, sy: 0.55, sz: 0.08 })
    palm(b, -6.1, -5.0, 0.12)
    palm(b, 6.2, 5.15, -0.18)
    lotusPond(b, 6.35, 0.6)
    plant(b, -6.4, 1.2, 0.9)
    // 吊りランプ（夜に灯る）
    lantern = new THREE.MeshBasicMaterial({ color: '#ffcf73' })
    const lan = new THREE.Mesh(GEO.sphere, lantern)
    lan.scale.set(0.2, 0.2, 0.2)
    lan.position.set(DOOR_U - 1.05, 2.2, -HALF_D + 0.35)
    group.add(lan)
    b.add(GEO.cone, toonMat('#a86a3c'), DOOR_U - 1.05, 2.4, -HALF_D + 0.35, { sx: 0.3, sy: 0.2, sz: 0.3 })
  }

  // --- 机・会議テーブル
  for (let i = 0; i < info.desks; i++) desk(b, i)
  meetingTable(b)
  // ネクマックスの立つ台（円）
  b.add(GEO.cyl, toonMat(id === 'jp' ? '#bfe3ff' : '#c9f2e4'), 0.2, 0.02, 4.5, { sx: 0.75, sy: 0.04, sz: 0.75 })

  const baked = bake(b.statics, true)
  group.add(baked)

  // --- 浮かぶ時計
  const [clockC] = canvas(512, 150)
  const clockTex = toTexture(clockC)
  disposables.push(clockTex)
  const clock = textPlane(clockTex, 2.9, 0.85, s)
  clock.position.set(-0.6, 3.75, -HALF_D + 0.1)
  group.add(clock)

  // --- 部屋の明かり（時間帯で色が変わる）
  const roomLight = new THREE.PointLight('#ffffff', 0, 22, 1.2)
  roomLight.position.set(0, 5.5, 1.5)
  group.add(roomLight)

  // --- 桜の花びら（日本のみ）
  let petals: THREE.InstancedMesh | null = null
  const petalState: { x: number; y: number; z: number; vx: number; vz: number; r: number; rv: number }[] = []
  if (id === 'jp') {
    const pg = new THREE.PlaneGeometry(0.08, 0.06)
    const pm = new THREE.MeshBasicMaterial({ color: '#ffc1d6', side: THREE.DoubleSide })
    petals = new THREE.InstancedMesh(pg, pm, 24)
    disposables.push(pg, pm)
    for (let i = 0; i < 24; i++) petalState.push({ x: 6.15 + (Math.random() - 0.5) * 2, y: Math.random() * 2.6, z: 4.9 + (Math.random() - 0.5) * 2, vx: -0.15 - Math.random() * 0.2, vz: -0.1 + Math.random() * 0.2, r: Math.random() * 6, rv: 1 + Math.random() * 2 })
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
    openDoor() {
      doorTarget = 1
      doorTimer = 2.2
    },
    update(dt, t, now) {
      // ドア
      if (doorTimer > 0) {
        doorTimer -= dt
        if (doorTimer <= 0) doorTarget = 0
      }
      doorOpen += (doorTarget - doorOpen) * (1 - Math.exp(-dt / 0.15))
      door.rotation.y = doorOpen * 1.6
      // 時計と景色（分が変わったら描き直す）
      const lt = localTime(info.tz, now)
      const phase = phaseOfHour(lt.h + lt.m / 60)
      if (lt.text !== lastClock) {
        lastClock = lt.text
        paintClock(clockC, id === 'jp' ? 'OSAKA  JST' : 'PHNOM PENH  ICT', lt.text, phase, id === 'jp' ? '#ff7aa2' : '#f0a04b')
        clockTex.needsUpdate = true
        if (phase !== build.phase || !winTex.userData.painted) {
          build.phase = phase
          paintWindow(winC, id, phase)
          winTex.needsUpdate = true
          winTex.userData.painted = true
          const night = phase === 'night'
          roomLight.color.set(night ? '#9fb3ff' : phase === 'evening' ? '#ffb27a' : phase === 'dawn' ? '#ffd2b0' : '#fff6e5')
          roomLight.intensity = night ? 22 : phase === 'evening' ? 18 : phase === 'dawn' ? 8 : 0
          if (lantern) lantern.color.set(night || phase === 'evening' ? (id === 'jp' ? '#ff7a5a' : '#ffe08a') : id === 'jp' ? '#e8584e' : '#e9c27a')
        }
      }
      clock.position.y = 3.75 + Math.sin(t * 1.3) * 0.06
      // 花びら
      if (petals) {
        for (let i = 0; i < petalState.length; i++) {
          const p = petalState[i]
          p.y -= dt * 0.35
          p.x += p.vx * dt
          p.z += p.vz * dt + Math.sin(t * 1.5 + i) * dt * 0.1
          p.r += p.rv * dt
          if (p.y < 0.02) {
            p.y = 1.8 + Math.random() * 1.2
            p.x = 6.15 + (Math.random() - 0.5) * 1.6
            p.z = 4.9 + (Math.random() - 0.5) * 1.6
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
      baked.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) m.geometry.dispose()
      })
      floorMat.dispose()
      wallMat.dispose()
      group.removeFromParent()
    },
  }
  return build
}

// ------------------------------------------------------------------ 光の道

export interface BridgeBuild {
  group: THREE.Group
  curve: THREE.CubicBezierCurve3
  /** カンボジア → 日本 */
  reverse: THREE.CubicBezierCurve3
  /** 中央の上（ラベルを付ける位置） */
  top: THREE.Vector3
  update(dt: number, t: number): void
  /** やり取りがあったとき、少し明るく光る */
  pulse(): void
  dispose(): void
}

export function buildBridge(): BridgeBuild {
  const group = new THREE.Group()
  const curve = bridgeCurve()
  const reverse = new THREE.CubicBezierCurve3(curve.v3.clone(), curve.v2.clone(), curve.v1.clone(), curve.v0.clone())
  const flow = flowTexture()
  const coreGeo = new THREE.TubeGeometry(curve, 80, 0.09, 10, false)
  const coreMat = new THREE.MeshBasicMaterial({ map: flow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: '#9ff0ff' })
  const core = new THREE.Mesh(coreGeo, coreMat)
  const haloGeo = new THREE.TubeGeometry(curve, 80, 0.26, 12, false)
  const haloMat = new THREE.MeshBasicMaterial({ color: '#7fe3ff', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false })
  const halo = new THREE.Mesh(haloGeo, haloMat)
  group.add(core, halo)
  // 両端の光る台
  const padGeo = new THREE.RingGeometry(0.25, 0.55, 32)
  const padMat = new THREE.MeshBasicMaterial({ color: '#8ff0ff', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  for (const p of [curve.v0, curve.v3]) {
    const pad = new THREE.Mesh(padGeo, padMat)
    pad.rotation.x = -Math.PI / 2
    pad.position.set(p.x, 0.03, p.z)
    group.add(pad)
  }
  // 行き交う小さな光（いつも流れている）
  const dotMat = new THREE.SpriteMaterial({ map: glowTexture(), color: '#c8fbff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
  const dots: { s: THREE.Sprite; u: number; dir: number; v: number }[] = []
  for (let i = 0; i < 8; i++) {
    const sp = new THREE.Sprite(dotMat)
    sp.scale.setScalar(0.32)
    group.add(sp)
    dots.push({ s: sp, u: i / 8, dir: i % 2 ? 1 : -1, v: 0.12 + (i % 3) * 0.04 })
  }
  const top = curve.getPoint(0.5).add(new THREE.Vector3(0, 0.55, 0))
  let glow = 0
  const tmp = new THREE.Vector3()
  return {
    group,
    curve,
    reverse,
    top,
    pulse() {
      glow = 1
    },
    update(dt, t) {
      flow.offset.x -= dt * 0.6
      glow = Math.max(0, glow - dt * 0.8)
      haloMat.opacity = 0.14 + 0.05 * Math.sin(t * 2) + glow * 0.35
      padMat.opacity = 0.55 + 0.2 * Math.sin(t * 3) + glow * 0.3
      for (const d of dots) {
        d.u = (d.u + d.dir * d.v * dt + 1) % 1
        curve.getPoint(d.u, tmp)
        d.s.position.copy(tmp)
      }
    },
    dispose() {
      coreGeo.dispose()
      haloGeo.dispose()
      coreMat.dispose()
      haloMat.dispose()
      padGeo.dispose()
      padMat.dispose()
      dotMat.dispose()
      flow.dispose()
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
    [-20, -2.6, 5, 1.2],
    [-1, -3.4, 7, 1.5],
    [19, -2.4, 4, 1.1],
    [-14, -4, -8, 1.6],
    [13, -3.8, -9, 1.4],
    [0, -1.5, -10, 1.0],
    [-24, 1.5, -6, 1.0],
    [24, 1.2, -4, 0.9],
  ]
  for (const [x, y, z, sc] of spots) {
    const g = new THREE.Group()
    for (const [dx, dy, r] of [
      [0, 0, 1],
      [0.9, -0.15, 0.75],
      [-0.9, -0.2, 0.7],
      [0.35, 0.45, 0.65],
    ] as const) {
      const m = new THREE.Mesh(GEO.sphere, mat)
      m.position.set(dx * sc, dy * sc, 0)
      m.scale.setScalar(r * sc)
      g.add(m)
    }
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
