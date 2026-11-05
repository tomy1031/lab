// 出典：tomy1031/nexmax_chronicle（web/src/world/nexmax/head.ts）から流用。ネクマックスの 3D モデル（コードで組んだ部品＋手続きアニメーション）。
// 頭：丸いヘルメット（超楕円体）・耳パッド・白い顔プレート（上辺の中央が M 字にくぼむ）・目・眉・口。
// 寸法は見本（nexmax_game_turnaround.png の正面図）をピクセルで測って m に換算したもの（全高 1.2m 基準）。
// 顔のパーツは正面図の 2D 輪郭を頭の曲面へ投影して作るので、正面から見ると見本の形と一致する。
import * as THREE from 'three'
import {
  blob,
  blobFrontHit,
  finalize,
  inflate,
  lathe,
  merge,
  paint,
  place,
  projectPatch,
  strokeTube,
  superEllipse,
  type BlobSpec,
  type Surface,
  type V2,
} from './geom'
import { NX_COLORS } from './materials'

/** 見本 1px あたりの m（全高 731px = 1.2m） */
export const PX = 1.2 / 731
/** 見本の正面図のピクセル座標 → モデル座標（x は右手側が +、y は足元が 0） */
export const fx = (X: number) => (333 - X) * PX
export const fy = (Y: number) => (848 - Y) * PX

export const HEAD_CENTER = new THREE.Vector3(0, fy(272.5), 0)
export const HEAD_SPEC: BlobSpec = {
  a: 183 * PX,
  bTop: 155.5 * PX,
  bBot: 156 * PX,
  cFront: 0.243,
  cBack: 0.252,
  r: 2.3,
  tTop: 2.2,
  tBot: 3.0,
}
/** 首の付け根（頭の回転中心） */
export const HEAD_PIVOT_Y = 0.7

/** 顔プレートの厚み（頭の表面から） */
const PLATE_T = 0.0075
const PLATE_BEVEL = 0.011

export type Expression = 'happy' | 'determined' | 'worried' | 'surprised'
export const EXPRESSIONS: Expression[] = ['happy', 'determined', 'worried', 'surprised']

/** 頭の表面（モデル座標）を正面から */
export const headSurface: Surface = (x, y, out, n) => {
  if (!blobFrontHit(HEAD_SPEC, x - HEAD_CENTER.x, y - HEAD_CENTER.y, out, n)) return false
  out.add(HEAD_CENTER)
  return true
}

/** 顔プレートの上の面（目や口を載せる） */
function plateTop(h: number): Surface {
  return (x, y, out, n) => {
    if (!headSurface(x, y, out, n)) return false
    out.addScaledVector(n, PLATE_T + h)
    return true
  }
}

/** 輪郭を弧長で等間隔に取り直す */
function resample(pts: V2[], count: number): V2[] {
  const L: number[] = [0]
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i % pts.length]
    L.push(L[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]))
  }
  const total = L[L.length - 1]
  const out: V2[] = []
  let k = 0
  for (let i = 0; i < count; i++) {
    const d = (i / count) * total
    while (L[k + 1] < d) k++
    const t = (d - L[k]) / (L[k + 1] - L[k] || 1)
    const a = pts[k]
    const b = pts[(k + 1) % pts.length]
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  }
  return out
}

/** 顔プレートの輪郭（正面図で測った値）：下半分は超楕円 n=3.2、上半分は n=4、上辺中央をガウス形にくぼませる */
export const PLATE_CENTER: V2 = [0, fy(296)]
export function plateOutline(count = 112): V2[] {
  const [cx, cy] = PLATE_CENTER
  const dense = superEllipse(cx, cy, 157.5 * PX, 96 * PX, 94 * PX, 4, 3.2, 1600)
  const notchDepth = 26 * PX
  const notchW = 35.8 * PX
  for (const p of dense) {
    if (p[1] > cy) {
      const w = Math.exp(-(((p[0] - cx) / notchW) ** 2))
      // 上辺の近くだけくぼませる
      const nearTop = Math.min(1, Math.max(0, (p[1] - cy) / (96 * PX * 0.7)))
      p[1] -= notchDepth * w * nearTop
    }
  }
  return resample(dense, count)
}

// ------------------------------------------------------------------ ヘルメット＋耳

/** 耳パッドの断面（外側の面から付け根へ、上 → 下の順）。h は頭の外へ向かう距離 */
const EAR_PROFILE: V2[] = (() => {
  const pts: V2[] = [
    [0.0, 0.113],
    [0.028, 0.111],
    [0.045, 0.104],
    [0.05, 0.098],
    [0.0545, 0.0945],
    [0.0595, 0.0965],
  ]
  // 外周は大きな丸み（見本の正面図で楕円に見える）
  const cx = 0.06
  const cy = 0.064
  const R = 0.035
  for (let i = 0; i <= 5; i++) {
    const th = (i / 5) * (Math.PI / 2)
    pts.push([cx + Math.sin(th) * R, cy + Math.cos(th) * R])
  }
  pts.push([0.0948, 0.055], [0.093, 0.038], [0.088, 0.02], [0.079, 0.006], [0.066, 0.0], [0.0, 0.0])
  return pts
})()
export const EAR_POS = { x: 0.262, y: fy(293), z: 0.042 }

/** ヘルメット（頭の殻）と耳。モデル座標のまま返す */
export function buildHelmet(): THREE.BufferGeometry {
  const shell = blob(HEAD_SPEC, 36, 26)
  shell.translate(HEAD_CENTER.x, HEAD_CENTER.y, HEAD_CENTER.z)
  const parts = [shell]
  for (const side of [1, -1]) {
    const ear = lathe(EAR_PROFILE, 18)
    // Y 軸の回転体 → X 軸（外向き）へ
    place(ear, side * EAR_POS.x, EAR_POS.y, EAR_POS.z, 0, 0, side > 0 ? -Math.PI / 2 : Math.PI / 2)
    parts.push(ear)
  }
  for (const g of parts) paint(g, NX_COLORS.body)
  return merge(parts)
}

// ------------------------------------------------------------------ 顔プレート

export function buildPlate(): THREE.BufferGeometry {
  const outline = plateOutline(96)
  const rings = [0, 0.3, 0.55, 0.75, 0.88, 0.94, 0.968, 0.982, 0.992, 0.997, 1]
  const g = projectPatch({
    outline,
    center: PLATE_CENTER,
    rings,
    surface: headSurface,
    offset: (_s, edge) => {
      if (edge >= PLATE_BEVEL) return PLATE_T
      const u = edge / PLATE_BEVEL
      return -0.003 + (PLATE_T + 0.003) * Math.sqrt(1 - (1 - u) * (1 - u))
    },
  })
  return finalize(g, '#ffffff')
}

/** プレートの縁の細い線（原画の線画の名残）。ヘルメットの表面に貼る帯 */
function plateBorder(width: number, color: string): THREE.BufferGeometry {
  const inner = plateOutline(96)
  const outer = inflate(inner, PLATE_CENTER, width)
  const P = new THREE.Vector3()
  const N = new THREE.Vector3()
  const pos: number[] = []
  const pushPt = (x: number, y: number, h: number) => {
    if (!headSurface(x, y, P, N)) {
      P.set(x, y, 0)
      N.set(0, 0, -1)
    }
    pos.push(P.x + N.x * h, P.y + N.y * h, P.z + N.z * h)
  }
  const n = inner.length
  for (let i = 0; i < n; i++) {
    // 内側はプレートの縁の下へ少しもぐらせる
    const ix = inner[i][0] + (inner[i][0] - PLATE_CENTER[0]) * -0.01
    const iy = inner[i][1] + (inner[i][1] - PLATE_CENTER[1]) * -0.01
    pushPt(ix, iy, 0.0012)
    pushPt(outer[i][0], outer[i][1], 0.0012)
  }
  const idx: number[] = []
  for (let i = 0; i < n; i++) {
    const a = i * 2
    const b = ((i + 1) % n) * 2
    idx.push(a, a + 1, b + 1, a, b + 1, b)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  // 法線は外向き（-Z 寄り）に
  const nor = g.attributes.normal
  for (let i = 0; i < nor.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(g.attributes.position, i).sub(HEAD_CENTER)
    const nn = new THREE.Vector3().fromBufferAttribute(nor, i)
    if (nn.dot(p) < 0) nor.setXYZ(i, -nn.x, -nn.y, -nn.z)
  }
  const idxArr = g.index!.array as Uint32Array | Uint16Array
  // 巻き順を法線にそろえる
  for (let i = 0; i < idxArr.length; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(g.attributes.position, idxArr[i])
    const b = new THREE.Vector3().fromBufferAttribute(g.attributes.position, idxArr[i + 1]).sub(a)
    const c = new THREE.Vector3().fromBufferAttribute(g.attributes.position, idxArr[i + 2]).sub(a)
    const fn = b.cross(c)
    const vn = new THREE.Vector3().fromBufferAttribute(nor, idxArr[i])
    if (fn.dot(vn) < 0) {
      const t = idxArr[i + 1]
      idxArr[i + 1] = idxArr[i + 2]
      idxArr[i + 2] = t
    }
  }
  return paint(g, color)
}

// ------------------------------------------------------------------ 目

const EYE_X = 61 * PX
const EYE_Y = fy(300)

type EyeShape = { rx: number; ry: number; cutA: number; cutB: number; dy: number }
const EYE_SHAPES: Record<Expression, EyeShape> = {
  // cut: 目の上を直線で切る（v = cutA + cutB·u、u は顔の内側へ向かう距離）。cutA が大きければ切らない
  happy: { rx: 25.5 * PX, ry: 26.5 * PX, cutA: 1, cutB: 0, dy: 0 },
  determined: { rx: 25 * PX, ry: 25 * PX, cutA: 0.016, cutB: -0.42, dy: -0.003 },
  worried: { rx: 24 * PX, ry: 25 * PX, cutA: 0.022, cutB: 0.32, dy: -0.003 },
  surprised: { rx: 29 * PX, ry: 32 * PX, cutA: 1, cutB: 0, dy: 0.004 },
}

function eyeOutline(side: number, s: EyeShape): { outline: V2[]; center: V2 } {
  const cx = side * EYE_X
  const cy = EYE_Y + s.dy
  const pts = superEllipse(cx, cy, s.rx, s.ry, s.ry, 2, 2, 400)
  for (const p of pts) {
    const u = (cx - p[0]) * side // 内側（顔の中心側）が +
    const cut = cy + s.cutA + s.cutB * u
    if (p[1] > cut) p[1] = cut
  }
  // 切った後の中心（重心付近）
  let mx = 0
  let my = 0
  for (const p of pts) {
    mx += p[0]
    my += p[1]
  }
  return { outline: resample(pts, 40), center: [mx / pts.length, my / pts.length] }
}

/** 両目（ツヤのある黒・小さなハイライト付き）。まばたきは頭ローカルの y で縮める */
export function buildEyes(expr: Expression): THREE.BufferGeometry {
  const s = EYE_SHAPES[expr]
  const parts: THREE.BufferGeometry[] = []
  for (const side of [1, -1]) {
    const { outline, center } = eyeOutline(side, s)
    const eye = projectPatch({
      outline,
      center,
      rings: [0, 0.45, 0.75, 0.92, 1],
      surface: plateTop(0),
      offset: (u) => -0.0008 + 0.0042 * Math.sqrt(Math.max(0, 1 - u * u)),
    })
    parts.push(paint(eye, NX_COLORS.eye))
    // 小さなハイライト（右上）
    const hr = s.rx * 0.14
    const hx = center[0] + side * -s.rx * 0.34
    const hy = center[1] + s.ry * 0.4
    const hl = projectPatch({
      outline: superEllipse(hx, hy, hr, hr * 1.1, hr * 1.1, 2, 2, 14),
      center: [hx, hy],
      rings: [0, 1],
      surface: plateTop(0),
      offset: () => 0.0039,
    })
    parts.push(paint(hl, '#c9d6e4'))
  }
  return merge(parts)
}

/** 目の中心の高さ（まばたきの基準） */
export const EYE_CENTER_Y = EYE_Y

// ------------------------------------------------------------------ 眉

/** 見本の右眉（キャラの右＝ +x 側）の中心線（px）：内側の端 → 外側の端 */
const BROW_PX: V2[] = [
  [272, 174],
  [258, 170.5],
  [244, 173.5],
  [233, 179],
  [227, 185],
]

type BrowShape = { rot: number; dy: number; arch: number; dx: number }
const BROW_SHAPES: Record<Expression, BrowShape> = {
  happy: { rot: 0, dy: 0, arch: 1, dx: 0 },
  // 内側を下げる（きりっと）
  determined: { rot: -0.42, dy: -0.006, arch: 0.35, dx: -0.004 },
  // 内側を上げる（八の字）
  worried: { rot: 0.52, dy: 0.009, arch: 0.3, dx: 0.002 },
  surprised: { rot: 0.05, dy: 0.02, arch: 1.25, dx: 0 },
}

function browPoints(side: number, s: BrowShape): V2[] {
  const pts = BROW_PX.map(([X, Y]) => [fx(X), fy(Y)] as V2)
  // 中心と弧の高さを調整
  const c = pts[1]
  const a = pts[0]
  const b = pts[pts.length - 1]
  const out: V2[] = []
  // Catmull-Rom で滑らかに
  const curve = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y)))
  const dense = curve.getPoints(18)
  for (const p of dense) {
    // 弦からの高さを arch 倍
    const t = Math.max(0, Math.min(1, (p.x - a[0]) / (b[0] - a[0])))
    const chordY = a[1] + (b[1] - a[1]) * t
    let x = p.x
    let y = chordY + (p.y - chordY) * s.arch
    // 中心まわりに回転（+ で内側の端が上がる）
    const dx = x - c[0]
    const dy = y - c[1]
    const cr = Math.cos(s.rot)
    const sr = Math.sin(s.rot)
    // 内側は x が小さい側：内側を上げる = 時計回り（+x 側の眉で）
    x = c[0] + dx * cr + dy * sr
    y = c[1] - dx * sr + dy * cr
    out.push([side * (x + s.dx), y + s.dy])
  }
  return out
}

function buildBrows(expr: Expression): THREE.BufferGeometry {
  const s = BROW_SHAPES[expr]
  const parts = [1, -1].map((side) => paint(strokeTube(browPoints(side, s), headSurface, 0.0028, 0.0062, 0.5, 8), NX_COLORS.brow))
  return merge(parts)
}

// ------------------------------------------------------------------ 口

const MOUTH_TOP = fy(349)

type MouthShape = {
  rx: number
  ryTop: number
  ryBot: number
  nTop: number
  nBot: number
  cy: number
  /** 塗り：上（奥）の暗い色 → 下の色 */
  dark: string
  light: string
  /** 歯（上半分を白く） */
  teeth?: boolean
}
const MOUTH_SHAPES: Record<Expression, MouthShape> = {
  happy: { rx: 22.5 * PX, ryTop: 3 * PX, ryBot: 22 * PX, nTop: 7, nBot: 2.2, cy: MOUTH_TOP - 2 * PX, dark: NX_COLORS.mouthDark, light: NX_COLORS.mouth },
  determined: { rx: 23 * PX, ryTop: 7 * PX, ryBot: 9.5 * PX, nTop: 3.5, nBot: 3, cy: MOUTH_TOP - 8 * PX, dark: '#8f2a1f', light: '#c9483a', teeth: true },
  worried: { rx: 14 * PX, ryTop: 8 * PX, ryBot: 2.5 * PX, nTop: 2.2, nBot: 6, cy: MOUTH_TOP - 12 * PX, dark: NX_COLORS.mouthDark, light: NX_COLORS.mouth },
  surprised: { rx: 10.5 * PX, ryTop: 12 * PX, ryBot: 13 * PX, nTop: 2, nBot: 2, cy: MOUTH_TOP - 14 * PX, dark: NX_COLORS.mouthDark, light: NX_COLORS.mouth },
}

function buildMouth(expr: Expression): THREE.BufferGeometry {
  const s = MOUTH_SHAPES[expr]
  const outline = resample(superEllipse(0, s.cy, s.rx, s.ryTop, s.ryBot, s.nTop, s.nBot, 600), 48)
  // 星形の中心：上下の中間
  const center: V2 = [0, s.cy + (s.ryTop - s.ryBot) / 2]
  const border = projectPatch({
    outline: inflate(outline, center, 0.0026),
    center,
    rings: [0, 0.6, 1],
    surface: plateTop(0),
    offset: () => 0.0006,
  })
  paint(border, NX_COLORS.mouthLine)
  const fill = projectPatch({
    outline,
    center,
    rings: [0, 0.35, 0.6, 0.8, 0.92, 1],
    surface: plateTop(0),
    offset: () => 0.0012,
  })
  // 上の縁ほど暗い（口の奥の影＝内側の線）。歯は上半分を白く
  const pos = fill.attributes.position
  const col = new Float32Array(pos.count * 3)
  const cDark = new THREE.Color(s.dark)
  const cLight = new THREE.Color(s.light)
  const cTeeth = new THREE.Color('#fbfbf8')
  const top = s.cy + s.ryTop
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (s.teeth) {
      c.copy(y > s.cy - 0.0005 ? cTeeth : cDark)
    } else {
      const t = Math.min(1, Math.max(0, (top - y) / 0.0095))
      c.copy(cDark).lerp(cLight, t * t * (3 - 2 * t))
    }
    col[i * 3] = c.r
    col[i * 3 + 1] = c.g
    col[i * 3 + 2] = c.b
  }
  fill.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return merge([border, fill])
}

/** 眉＋口＋プレートの縁線（頂点色の 1 メッシュ） */
export function buildFeatures(expr: Expression, plateLine: boolean): THREE.BufferGeometry {
  const parts = [buildBrows(expr), buildMouth(expr)]
  if (plateLine) parts.push(plateBorder(0.0026, NX_COLORS.plateLine))
  return merge(parts)
}
