// 出典：tomy1031/nexmax_chronicle（web/src/world/nexmax/body.ts）から流用。ネクマックスの 3D モデル（コードで組んだ部品＋手続きアニメーション）。
// 胴・首・背中の特殊鉱石の窓・腕（右は NMClaw のワイヤー射出器）・手・脚・足・爪。
// 寸法は見本の正面図（px）→ m。各部品は「回転の中心（関節）」を原点にしたローカル座標で返す。
import * as THREE from 'three'
import {
  ball,
  beadProfile,
  blob,
  facet,
  flatUV,
  lathe,
  lerp,
  merge,
  paint,
  place,
  projectPatch,
  scaleGeo,
  type Surface,
  type V2,
} from './geom'
import { fy, PX } from './head'
import { NX_COLORS } from './materials'

// ------------------------------------------------------------------ 関節の位置（モデル座標）

export const J = {
  hips: 0.42,
  torsoPivot: 0.42,
  shoulder: { x: 114 * PX, y: fy(477) },
  upperLen: 0.1,
  lowerLen: 0.143,
  hip: { x: 0.077, y: 0.41 },
  thighLen: 0.156,
  shinLen: 0.129,
  ankleY: 0.125,
}

/** 胴の奥行きの縮尺（正面幅 178px・側面 154px） */
const TORSO_Z = 0.865

/** 胴の断面（見本の px：Y, 半幅） */
const TORSO_PX: [number, number][] = [
  [440, 0],
  [440, 40],
  [440.5, 55],
  [441.5, 64],
  [443.5, 71],
  [447, 77],
  [452, 81],
  [460, 85],
  [472, 88],
  [488, 89.5],
  [505, 89.5],
  [522, 87.5],
  [538, 83.5],
  [553, 78],
  [566, 71.5],
  [577, 63.5],
  [586, 54],
  [593, 43],
  [598, 30],
  [600.5, 15],
  [601, 0],
]
const TORSO_PROFILE: V2[] = TORSO_PX.map(([Y, r]) => [r * PX, fy(Y)])
export const TORSO_TOP = TORSO_PROFILE[0][1]
export const TORSO_BOTTOM = TORSO_PROFILE[TORSO_PROFILE.length - 1][1]

/** 高さ y での胴の半径（正面方向） */
function torsoR(y: number): number {
  const p = TORSO_PROFILE
  if (y >= p[1][1]) return p[1][0]
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i]
    const b = p[i + 1]
    if (y <= a[1] && y >= b[1]) {
      const t = (a[1] - y) / (a[1] - b[1] || 1)
      return lerp(a[0], b[0], t)
    }
  }
  return 0
}

/** 胴の背中の表面（背面から投影） */
export const torsoBack: Surface = (x, y, out, n) => {
  const r = torsoR(y)
  if (Math.abs(x) >= r) return false
  const z = TORSO_Z * Math.sqrt(r * r - x * x)
  const e = 0.002
  const dr = (torsoR(y + e) - torsoR(y - e)) / (2 * e)
  out.set(x, y, z)
  n.set(x, -r * dr, z / (TORSO_Z * TORSO_Z)).normalize()
  return true
}

/** 胴のロゴの位置（uv）：正面（φ=π）が u=0.25 になるよう継ぎ目を右脇に置く */
export function torsoLogoUV(): { u: number; v: number; w: number; h: number } {
  const yc = fy(500)
  const rFront = torsoR(yc)
  const H = TORSO_TOP - TORSO_BOTTOM
  return {
    u: 0.25,
    v: (yc - TORSO_BOTTOM) / H,
    w: (60 * PX) / (rFront * Math.PI * 2),
    h: (56 * PX) / H,
  }
}

export const ORE_CENTER: V2 = [0, fy(490)]
export const ORE_R = 36 * PX
export const ORE_RIM_R = 41 * PX

/** 胴（＋首・鉱石の窓の縁）。胴の回転中心からのローカル座標。頂点色は白（色はテクスチャ） */
export function buildTorso(): THREE.BufferGeometry {
  const torso = lathe(TORSO_PROFILE, 28, Math.PI / 2)
  scaleGeo(torso, 1, 1, TORSO_Z)
  paint(torso, '#ffffff')
  // 首：短い円柱（頭の中へ入る）
  const neck = lathe(
    [
      [0, 0.716],
      [0.044, 0.716],
      [0.05, 0.71],
      [0.053, 0.698],
      [0.053, 0.672],
      [0.05, 0.66],
      [0.0, 0.66],
    ],
    20,
  )
  paint(flatUV(neck, 0.5, 0.95), '#ffffff')
  // 鉱石の窓の縁：背中の曲面に沿った輪（少し盛り上がったベベル）
  const rim = rimRing()
  paint(flatUV(rim, 0.6, 0.6), '#ffffff')
  const g = merge([torso, neck, rim])
  g.translate(0, -J.torsoPivot, 0)
  return g
}

/** 背中の窓の縁：断面が丸い輪を曲面に沿って作る */
function rimRing(): THREE.BufferGeometry {
  const seg = 36
  const radial = 6
  const tube = 0.0078
  const P = new THREE.Vector3()
  const N = new THREE.Vector3()
  const pos: number[] = []
  const nor: number[] = []
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2
    const cx = ORE_CENTER[0] + Math.cos(a) * ORE_RIM_R
    const cy = ORE_CENTER[1] + Math.sin(a) * ORE_RIM_R
    torsoBack(cx, cy, P, N)
    // 放射方向（窓の中心から外）を曲面に沿わせる
    const R = new THREE.Vector3(Math.cos(a), Math.sin(a), 0)
    R.addScaledVector(N, -R.dot(N)).normalize()
    const C = P.clone().addScaledVector(N, tube * 0.35)
    for (let k = 0; k <= radial; k++) {
      const th = (k / radial) * Math.PI * 2
      const dir = R.clone().multiplyScalar(Math.cos(th)).addScaledVector(N, Math.sin(th))
      pos.push(C.x + dir.x * tube, C.y + dir.y * tube * 1, C.z + dir.z * tube)
      nor.push(dir.x, dir.y, dir.z)
    }
  }
  const idx: number[] = []
  for (let i = 0; i < seg; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * (radial + 1) + k
      const b = (i + 1) * (radial + 1) + k
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setIndex(idx)
  // 巻き順を法線に合わせる
  const arr = g.index!.array as Uint32Array | Uint16Array
  const va = new THREE.Vector3()
  const vb = new THREE.Vector3()
  const vc = new THREE.Vector3()
  const vn = new THREE.Vector3()
  for (let i = 0; i < arr.length; i += 3) {
    va.fromBufferAttribute(g.attributes.position, arr[i])
    vb.fromBufferAttribute(g.attributes.position, arr[i + 1]).sub(va)
    vc.fromBufferAttribute(g.attributes.position, arr[i + 2]).sub(va)
    vn.fromBufferAttribute(g.attributes.normal, arr[i])
    if (vb.cross(vc).dot(vn) < 0) {
      const t = arr[i + 1]
      arr[i + 1] = arr[i + 2]
      arr[i + 2] = t
    }
  }
  return g
}

/** 背中の特殊鉱石：濃い青の窓＋光る水色の結晶（MeshBasicMaterial の頂点色で切子面の陰影を焼き込む） */
export function buildOre(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  // 窓の地（中央下ほど明るい）
  const disc = projectPatch({
    outline: Array.from({ length: 40 }, (_, i) => {
      const a = (i / 40) * Math.PI * 2
      return [ORE_CENTER[0] + Math.cos(a) * ORE_R, ORE_CENTER[1] + Math.sin(a) * ORE_R] as V2
    }),
    center: ORE_CENTER,
    rings: [0, 0.3, 0.6, 0.85, 1],
    surface: torsoBack,
    offset: () => 0.0016,
  })
  {
    const pos = disc.attributes.position
    const col = new Float32Array(pos.count * 3)
    const edge = new THREE.Color('#2a62c4')
    const mid = new THREE.Color('#4a8fe6')
    const glow = new THREE.Color('#c4f4ff')
    const c = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const dx = pos.getX(i) - ORE_CENTER[0]
      const dy = pos.getY(i) - (ORE_CENTER[1] - ORE_R * 0.55)
      const d = Math.hypot(dx, dy * 1.3) / ORE_R
      const r = Math.hypot(pos.getX(i) - ORE_CENTER[0], pos.getY(i) - ORE_CENTER[1]) / ORE_R
      c.copy(mid).lerp(edge, Math.min(1, Math.max(0, (r - 0.55) / 0.45)))
      c.lerp(glow, Math.max(0, 1 - d / 0.55) * 0.85)
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b
    }
    disc.setAttribute('color', new THREE.BufferAttribute(col, 3))
  }
  parts.push(disc)
  // 結晶：窓の面の上に寝かせた細長い六角の両錐
  const P = new THREE.Vector3()
  const N = new THREE.Vector3()
  torsoBack(ORE_CENTER[0], ORE_CENTER[1], P, N)
  const frame = new THREE.Matrix4()
  {
    const z = N.clone()
    const x = new THREE.Vector3(1, 0, 0).addScaledVector(z, -z.x).normalize()
    const y = new THREE.Vector3().crossVectors(z, x)
    frame.makeBasis(x, y, z).setPosition(P.clone().addScaledVector(N, 0.0018))
  }
  const crystals: [number, number, number, number, number][] = [
    // x, y, 長さ, 太さ, 傾き
    [0, -0.026, 0.066, 0.0125, 0],
    [-0.017, -0.024, 0.046, 0.0105, 0.42],
    [0.017, -0.024, 0.046, 0.0105, -0.42],
    [-0.031, -0.031, 0.022, 0.0075, 0.95],
    [0.031, -0.031, 0.022, 0.0075, -0.95],
    [-0.009, -0.033, 0.016, 0.006, 1.25],
    [0.009, -0.033, 0.016, 0.006, -1.25],
  ]
  const light = new THREE.Vector3(-0.35, 0.65, 0.68).normalize()
  const cDeep = new THREE.Color('#2f8fe8')
  const cLit = new THREE.Color('#f4fdff')
  const cBase = new THREE.Color('#bdf3ff')
  for (const [x, y, L, w, tilt] of crystals) {
    const g = facet(
      lathe(
        [
          [0, L],
          [w, L * 0.64],
          [w * 0.9, L * 0.06],
          [0, -L * 0.04],
        ],
        6,
        Math.PI / 6,
      ),
    )
    scaleGeo(g, 1, 1, 0.5)
    place(g, x, y, 0, 0, 0, tilt)
    g.applyMatrix4(frame)
    // 切子面の明るさを頂点色に
    const nor = g.attributes.normal
    const pos = g.attributes.position
    const col = new Float32Array(pos.count * 3)
    const c = new THREE.Color()
    const nn = new THREE.Vector3()
    const local = new THREE.Vector3()
    const inv = frame.clone().invert()
    for (let i = 0; i < pos.count; i++) {
      nn.fromBufferAttribute(nor, i)
      // 法線を窓の座標系へ
      nn.transformDirection(inv)
      const lit = Math.min(1, Math.max(0, 0.45 + 0.75 * nn.dot(light)))
      c.copy(cDeep).lerp(cLit, lit)
      local.fromBufferAttribute(pos, i).applyMatrix4(inv)
      // 根元ほど発光色
      const base = Math.max(0, 1 - (local.y + 0.034) / 0.03)
      c.lerp(cBase, base * 0.6)
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2))
    parts.push(g)
  }
  const ore = merge(parts)
  ore.translate(0, -J.torsoPivot, 0)
  return ore
}

// ------------------------------------------------------------------ 腕

/** 上腕（肩の玉＋短い玉）。肩の中心が原点、腕は -Y へ下がる */
export function buildUpperArm(): THREE.BufferGeometry {
  const sh = ball(29 * PX, 16, 8)
  const bead = lathe(beadProfile(0.032, 0.03, 0.06, 2.6, 8), 16)
  bead.translate(0, -0.066, 0)
  for (const g of [sh, bead]) paint(g, NX_COLORS.body)
  return merge([sh, bead])
}

/** 前腕（肘の玉＋太い玉＋手首）。肘が原点。右腕はワイヤー射出器（太め・光る輪・射出口） */
export function buildForearm(right: boolean): { geo: THREE.BufferGeometry; ring: THREE.BufferGeometry | null; muzzle: THREE.Vector3 } {
  const parts: THREE.BufferGeometry[] = []
  const elbow = ball(0.029, 14, 7)
  parts.push(elbow)
  let ring: THREE.BufferGeometry | null = null
  const muzzle = new THREE.Vector3()
  if (right) {
    // 手首へ向かって太くなる筒（見本の側面図）。先の近くに光る輪の溝、その先に縁と手首の口
    const fore = lathe(
      [
        [0, -0.002],
        [0.026, -0.005],
        [0.037, -0.012],
        [0.045, -0.028],
        [0.0515, -0.055],
        [0.0555, -0.085],
        [0.057, -0.106],
        [0.0562, -0.114],
        [0.0505, -0.1165],
        [0.0505, -0.1295],
        [0.0548, -0.132],
        [0.0555, -0.139],
        [0.0525, -0.1445],
        [0.044, -0.147],
        [0.0, -0.147],
      ],
      18,
    )
    parts.push(fore)
    // 射出口は手首の先（こぶしの正面）：nexmaxModel が手首の子として置く。ここでは手首の口の中心を返す
    muzzle.set(0, -0.147, 0)
    // 光る輪（別メッシュ・発光）：溝にはまる
    const tor = new THREE.TorusGeometry(0.0522, 0.006, 8, 30)
    tor.rotateX(Math.PI / 2)
    tor.scale(1, 1.25, 1)
    tor.translate(0, -0.123, 0)
    const pos = tor.attributes.position
    const col = new Float32Array(pos.count * 3)
    const core = new THREE.Color('#62e4ff')
    const edge = new THREE.Color('#0a7ee0')
    const c = new THREE.Color()
    const nor = tor.attributes.normal
    for (let i = 0; i < pos.count; i++) {
      // 外向きの面ほど白く光る
      const outward = (nor.getX(i) * pos.getX(i) + nor.getZ(i) * pos.getZ(i)) / Math.hypot(pos.getX(i), pos.getZ(i))
      const t = Math.min(1, Math.max(0, outward))
      c.copy(edge).lerp(core, t * t)
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b
    }
    tor.setAttribute('color', new THREE.BufferAttribute(col, 3))
    ring = tor
  } else {
    const fore = lathe(beadProfile(0.047, 0.05, 0.132, 2.8, 11, 0.12), 16)
    fore.translate(0, -0.071, 0)
    parts.push(fore)
    const cuff = lathe(beadProfile(0.036, 0.036, 0.024, 3, 6), 16)
    cuff.translate(0, -0.14, 0)
    parts.push(cuff)
  }
  for (const g of parts) if (!g.attributes.color) paint(g, NX_COLORS.body)
  return { geo: merge(parts), ring, muzzle }
}

/**
 * ミトンの手（右手）：手のひらは体の内側（-X）、親指は前（-Z）、指先は -Y。
 * 指は 3 本分の溝を彫り、手のひら側へ軽く曲げる。left なら鏡像。
 */
export function buildHand(left: boolean, fist = 0): THREE.BufferGeometry {
  const knuckle = -0.064
  const mitten = blob({ a: 0.03, bTop: 0.064, bBot: 0.074, cFront: 0.057, cBack: 0.053, r: 2.6, tTop: 2.4, tBot: 2.1 }, 18, 14, (v) => {
    v.y -= 0.064
    // 指の部分
    const f = Math.min(1, Math.max(0, (knuckle - v.y) / 0.025))
    // 3 本の指の溝
    let w = 0
    for (const zg of [-0.0172, 0.0172]) w += Math.exp(-(((v.z - zg) / 0.0056) ** 2))
    v.x *= 1 - 0.2 * w * f
    if (v.y < -0.1) v.y += 0.012 * w * Math.min(1, (-0.1 - v.y) / 0.025)
    // 指先ほど少し薄く
    v.x *= 1 - 0.18 * f
    // 手のひら側（-X）へ曲げる
    if (v.y < knuckle) {
      const d = knuckle - v.y
      const ang = -(0.55 + fist * 1.2) * Math.min(1, d / 0.07) * (d / 0.07)
      const px = v.x + 0.004
      const py = d
      const c = Math.cos(ang)
      const s = Math.sin(ang)
      v.x = px * c + py * s - 0.004
      v.y = knuckle - (-px * s + py * c)
    }
  })
  // 親指：手のひらの前寄りから前下へ
  const thumb = lathe(beadProfile(0.024, 0.021, 0.07, 2.3, 7), 10)
  thumb.translate(0, -0.035, 0)
  place(thumb, -0.01, -0.036, -0.036, 0.62, 0, -0.38, 'YXZ')
  const parts = [mitten, thumb].map((g) => paint(g, NX_COLORS.body))
  const g = merge(parts)
  if (left) {
    g.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1))
    // 鏡像で巻き順が逆になるので直す
    const arr = g.index!.array as Uint32Array | Uint16Array
    for (let i = 0; i < arr.length; i += 3) {
      const t = arr[i + 1]
      arr[i + 1] = arr[i + 2]
      arr[i + 2] = t
    }
  }
  return g
}

// ------------------------------------------------------------------ 脚

/** 太もも（腰の玉＋太い玉）。股関節が原点 */
export function buildThigh(): THREE.BufferGeometry {
  const hip = ball(0.034, 14, 7, 0.85)
  const th = lathe(beadProfile(0.047, 0.051, 0.115, 2.5, 10, 0.12), 16)
  th.translate(0, -0.08, 0)
  return merge([hip, th].map((g) => paint(g, NX_COLORS.body)))
}

/** すね（膝の円盤＋下ほど太い玉）。膝が原点 */
export function buildShin(): THREE.BufferGeometry {
  const knee = lathe(beadProfile(0.035, 0.035, 0.04, 2.8, 6), 14)
  const sh = lathe(beadProfile(0.05, 0.066, 0.13, 3.0, 10, 0.06), 16)
  sh.translate(0, -0.076, 0)
  return merge([knee, sh].map((g) => paint(g, NX_COLORS.body)))
}

/** 足：大きな半球（足首が原点、底が -0.125） */
export function buildFoot(): THREE.BufferGeometry {
  const f = blob({ a: 0.108, bTop: 0.118, bBot: 0.018, cFront: 0.152, cBack: 0.122, r: 2.2, tTop: 2.15, tBot: 2.4 }, 22, 12)
  f.translate(0, -J.ankleY + 0.018, -0.02)
  return paint(f, NX_COLORS.body)
}

// ------------------------------------------------------------------ 爪（NMClaw の先端）

/** 爪の土台（射出口から出る小さな筒） */
export function buildClawHub(): THREE.BufferGeometry {
  const g = lathe(
    [
      // 射出口の中へ続く軸（伸びたときにすき間が見えないように）
      [0, 0.034],
      [0.0055, 0.034],
      [0.0055, 0.006],
      [0.009, 0.004],
      [0.0125, 0.0],
      [0.0135, -0.012],
      [0.012, -0.018],
      [0.006, -0.021],
      [0, -0.021],
    ],
    14,
  )
  return g
}

/** 爪の 1 本：根元から -Y へ伸び、先が内側（-X）へ曲がるフック */
export function buildClawProng(): THREE.BufferGeometry {
  const L = 0.036
  const g = lathe(beadProfile(0.0052, 0.0026, L, 2.2, 10), 8)
  g.translate(0, -L / 2, 0)
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, -pos.getY(i) / L))
    pos.setX(i, pos.getX(i) + 0.006 * Math.sin(t * Math.PI * 0.6) - 0.012 * t * t * t)
  }
  g.computeVertexNormals()
  return g
}
