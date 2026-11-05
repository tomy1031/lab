// 出典：tomy1031/nexmax_chronicle（web/src/world/nexmax/geom.ts）から流用。ネクマックスの 3D モデル（コードで組んだ部品＋手続きアニメーション）。
// ネクマックス用のジオメトリ生成ヘルパー。
// - lathe(): 断面プロファイルから回転体（法線は解析的に計算するので継ぎ目が出ない）
// - blob(): 上下で丸みの違う超楕円体（頭・手・足）
// - projectPatch(): 2D の輪郭を曲面（頭など）へ正面から投影して厚みを付けたパッチ（顔プレート・目・口）
// - strokeTube(): 曲面に沿った両端の丸い線（眉）
// - withHull(): 反転ハル輪郭線を同じジオメトリに同居させる（aOutline=1 の頂点はシェーダで外へ押し出して黒く塗る）
// すべて「index 付き・position/normal/uv/color/aOutline」の同じ属性構成にそろえ、mergeGeometries で 1 メッシュにまとめる。
import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type V2 = [number, number]

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const _n = new THREE.Vector3()

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** sign(x)·|x|^p */
export function spow(x: number, p: number): number {
  return Math.sign(x) * Math.pow(Math.abs(x), p)
}

/** 三角形ごとに、面の向きと頂点法線の平均がそろうよう巻き順を直す */
export function fixWinding(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.attributes.position
  const nor = g.attributes.normal
  const idx = g.index
  if (!idx || !nor) return g
  const arr = idx.array as Uint16Array | Uint32Array
  for (let i = 0; i < arr.length; i += 3) {
    const i0 = arr[i]
    const i1 = arr[i + 1]
    const i2 = arr[i + 2]
    _a.fromBufferAttribute(pos, i0)
    _b.fromBufferAttribute(pos, i1).sub(_a)
    _c.fromBufferAttribute(pos, i2).sub(_a)
    _b.cross(_c)
    if (_b.lengthSq() < 1e-20) continue
    _n.fromBufferAttribute(nor, i0)
    _a.fromBufferAttribute(nor, i1)
    _n.add(_a)
    _a.fromBufferAttribute(nor, i2)
    _n.add(_a)
    if (_b.dot(_n) < 0) {
      arr[i + 1] = i2
      arr[i + 2] = i1
    }
  }
  idx.needsUpdate = true
  return g
}

/** index・uv・color をそろえる（color は線形 RGB） */
export function finalize(g: THREE.BufferGeometry, color: THREE.ColorRepresentation = '#ffffff'): THREE.BufferGeometry {
  if (!g.index) {
    const n = g.attributes.position.count
    const ix = new Uint32Array(n)
    for (let i = 0; i < n; i++) ix[i] = i
    g.setIndex(new THREE.BufferAttribute(ix, 1))
  }
  if (!g.attributes.normal) g.computeVertexNormals()
  const n = g.attributes.position.count
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2))
  if (!g.attributes.color) paint(g, color)
  for (const k of Object.keys(g.attributes)) {
    if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color' && k !== 'aOutline') g.deleteAttribute(k)
  }
  return g
}

/** 頂点色を一色で塗る */
export function paint(g: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const c = new THREE.Color(color)
  const n = g.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return g
}

/** uv をすべて一点に（模様テクスチャの無地部分を指す） */
export function flatUV(g: THREE.BufferGeometry, u: number, v: number): THREE.BufferGeometry {
  const n = g.attributes.position.count
  const arr = new Float32Array(n * 2)
  for (let i = 0; i < n; i++) {
    arr[i * 2] = u
    arr[i * 2 + 1] = v
  }
  g.setAttribute('uv', new THREE.BufferAttribute(arr, 2))
  return g
}

/** 位置だけの index 付きジオメトリにしてから、重複頂点を統合して法線を作り直す（継ぎ目なしの滑らかな法線） */
export function smoothNormals(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = new THREE.BufferGeometry()
  p.setAttribute('position', g.attributes.position.clone())
  if (g.index) p.setIndex(g.index.clone())
  const m = mergeVertices(p, 1e-5)
  m.computeVertexNormals()
  return fixWinding(m)
}

/** 複数の部品を 1 つに。aOutline の有無はそろえる */
export function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const anyHull = list.some((g) => !!g.attributes.aOutline)
  const prepared = list.map((g) => {
    finalize(g)
    if (anyHull && !g.attributes.aOutline) g.setAttribute('aOutline', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1))
    return g
  })
  const m = mergeGeometries(prepared, false)
  if (!m) throw new Error('[nexmax] mergeGeometries failed')
  return m
}

/**
 * 反転ハル輪郭線を同じジオメトリに追加。複製した三角形は巻き順を逆にし、aOutline=1。
 * シェーダ側で法線方向へ押し出して輪郭色で塗る（FrontSide のまま 1 ドローコールで描ける）。
 */
export function withHull(g: THREE.BufferGeometry): THREE.BufferGeometry {
  finalize(g)
  const n = g.attributes.position.count
  const out = new THREE.BufferGeometry()
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const a = g.attributes[name] as THREE.BufferAttribute
    const arr = new Float32Array(a.count * a.itemSize * 2)
    arr.set(a.array as Float32Array, 0)
    arr.set(a.array as Float32Array, a.count * a.itemSize)
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize))
  }
  const ol = new Float32Array(n * 2)
  ol.fill(1, n)
  out.setAttribute('aOutline', new THREE.BufferAttribute(ol, 1))
  const src = g.index!.array
  const ix = new Uint32Array(src.length * 2)
  for (let i = 0; i < src.length; i += 3) {
    ix[i] = src[i]
    ix[i + 1] = src[i + 1]
    ix[i + 2] = src[i + 2]
    const j = src.length + i
    ix[j] = src[i] + n
    ix[j + 1] = src[i + 2] + n
    ix[j + 2] = src[i + 1] + n
  }
  out.setIndex(new THREE.BufferAttribute(ix, 1))
  return out
}

// ------------------------------------------------------------------ 回転体

/**
 * 断面 [r, y]（上 → 下の順）を Y 軸まわりに回す。法線は断面の接線から解析的に求める。
 * phiStart: 継ぎ目の位置。uv の v は y の範囲で 0..1（上が 1）。
 */
export function lathe(profile: V2[], seg: number, phiStart = 0): THREE.BufferGeometry {
  const n = profile.length
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  let ymin = Infinity
  let ymax = -Infinity
  for (const [, y] of profile) {
    ymin = Math.min(ymin, y)
    ymax = Math.max(ymax, y)
  }
  const prof2n: V2[] = profile.map((_, i) => {
    const p0 = profile[Math.max(0, i - 1)]
    const p1 = profile[Math.min(n - 1, i + 1)]
    let dr = p1[0] - p0[0]
    let dy = p1[1] - p0[1]
    const l = Math.hypot(dr, dy) || 1
    dr /= l
    dy /= l
    // 外向き法線 = (-dy, dr)（上 → 下の順のとき）
    return [-dy, dr]
  })
  for (let i = 0; i < n; i++) {
    const [r, y] = profile[i]
    const [nr, ny] = prof2n[i]
    for (let j = 0; j <= seg; j++) {
      const phi = phiStart + (j / seg) * Math.PI * 2
      const s = Math.sin(phi)
      const c = Math.cos(phi)
      pos.push(r * s, y, r * c)
      nor.push(nr * s, ny, nr * c)
      uv.push(j / seg, (y - ymin) / (ymax - ymin || 1))
    }
  }
  const idx: number[] = []
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j
      const b = (i + 1) * (seg + 1) + j
      if (profile[i][0] > 1e-6) idx.push(a, b, a + 1)
      if (profile[i + 1][0] > 1e-6) idx.push(b, b + 1, a + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return fixWinding(g)
}

/** 玉（ビーズ）の断面：上下の半径、長さ、角の丸さ p（2 = 楕円、大きいほど四角い）、ふくらみ */
export function beadProfile(rTop: number, rBot: number, len: number, p = 2.4, n = 12, bulge = 0): V2[] {
  const out: V2[] = []
  for (let i = 0; i <= n; i++) {
    const th = (Math.PI * i) / n
    const y = (len / 2) * spow(Math.cos(th), 2 / p)
    const rr = Math.pow(Math.abs(Math.sin(th)), 2 / p)
    const t = (1 - y / (len / 2)) / 2
    const R = lerp(rTop, rBot, t) * (1 + bulge * Math.sin(Math.PI * t))
    out.push([R * rr, y])
  }
  out[0][0] = 0
  out[n][0] = 0
  return out
}

/** 球（または楕円球） */
export function ball(r: number, seg = 16, rings = 10, sy = 1): THREE.BufferGeometry {
  const prof: V2[] = []
  for (let i = 0; i <= rings; i++) {
    const th = (Math.PI * i) / rings
    prof.push([Math.sin(th) * r, Math.cos(th) * r * sy])
  }
  prof[0][0] = 0
  prof[rings][0] = 0
  return lathe(prof, seg)
}

/** 非等方の拡大（法線も正しく補正） */
export function scaleGeo(g: THREE.BufferGeometry, sx: number, sy: number, sz: number): THREE.BufferGeometry {
  const m = new THREE.Matrix4().makeScale(sx, sy, sz)
  g.applyMatrix4(m) // applyMatrix4 は normalMatrix で法線も変換する
  return g
}

/** 位置・回転（オイラー）・拡大をまとめて適用 */
export function place(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, order: THREE.EulerOrder = 'XYZ'): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, order)),
    new THREE.Vector3(1, 1, 1),
  )
  g.applyMatrix4(m)
  return g
}

// ------------------------------------------------------------------ 超楕円体

export type BlobSpec = {
  /** X 半径 */
  a: number
  /** 上半分の Y 半径 */
  bTop: number
  /** 下半分の Y 半径 */
  bBot: number
  /** 前（-Z）側の Z 半径 */
  cFront: number
  /** 後ろ（+Z）側の Z 半径 */
  cBack?: number
  /** 水平断面の丸さ（2 = 楕円） */
  r?: number
  /** 上半分の縦の丸さ */
  tTop?: number
  /** 下半分の縦の丸さ */
  tBot?: number
}

/** 陰関数 F(p) = (|x/a|^r + |z/c|^r)^(t/r) + |y/b|^t（F=1 が表面） */
export function blobF(s: BlobSpec, x: number, y: number, z: number): number {
  const r = s.r ?? 2
  const up = y >= 0
  const t = up ? (s.tTop ?? 2) : (s.tBot ?? 2)
  const b = up ? s.bTop : s.bBot
  const c = z <= 0 ? s.cFront : (s.cBack ?? s.cFront)
  const h = Math.pow(Math.abs(x / s.a), r) + Math.pow(Math.abs(z / c), r)
  return Math.pow(h, t / r) + Math.pow(Math.abs(y / b), t)
}

/** 中心からの方向 d に沿って表面までの距離（二分法） */
function blobRay(s: BlobSpec, dx: number, dy: number, dz: number): number {
  let lo = 0
  let hi = Math.max(s.a, s.bTop, s.bBot, s.cFront, s.cBack ?? 0) * 1.5
  for (let k = 0; k < 28; k++) {
    const m = (lo + hi) / 2
    if (blobF(s, dx * m, dy * m, dz * m) > 1) hi = m
    else lo = m
  }
  return (lo + hi) / 2
}

/** 超楕円体のメッシュ。deform で頂点を自由に変形できる（法線は変形後に作り直す） */
export function blob(s: BlobSpec, wSeg: number, hSeg: number, deform?: (v: THREE.Vector3) => void): THREE.BufferGeometry {
  const sph = new THREE.SphereGeometry(1, wSeg, hSeg)
  const pos = sph.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const d = blobRay(s, v.x, v.y, v.z)
    v.multiplyScalar(d)
    if (deform) deform(v)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  return smoothNormals(sph)
}

/** 超楕円体の表面を正面（-Z 側）から見た点と法線。輪郭の外なら null */
export function blobFrontHit(s: BlobSpec, x: number, y: number, out: THREE.Vector3, normal: THREE.Vector3, back = false): boolean {
  if (blobF(s, x, y, 0) >= 1) return false
  let lo = 0
  let hi = (back ? (s.cBack ?? s.cFront) : s.cFront) * 1.0001
  for (let k = 0; k < 30; k++) {
    const m = (lo + hi) / 2
    if (blobF(s, x, y, back ? m : -m) > 1) hi = m
    else lo = m
  }
  const z = back ? (lo + hi) / 2 : -(lo + hi) / 2
  out.set(x, y, z)
  const e = 1e-4
  normal.set(
    blobF(s, x + e, y, z) - blobF(s, x - e, y, z),
    blobF(s, x, y + e, z) - blobF(s, x, y - e, z),
    blobF(s, x, y, z + e) - blobF(s, x, y, z - e),
  ).normalize()
  return true
}

// ------------------------------------------------------------------ 投影パッチ

export type Surface = (x: number, y: number, out: THREE.Vector3, normal: THREE.Vector3) => boolean

export type PatchSpec = {
  /** 輪郭（モデル座標の x, y）。中心から見て星形であること */
  outline: V2[]
  center: V2
  /** 輪の位置（0 = 中心、1 = 輪郭）。1 を超える値で外側へ広げられる */
  rings: number[]
  /** 輪の位置 s と輪郭までの距離（m）から、表面からの高さ（m） */
  offset: (s: number, edgeDist: number, radius: number) => number
  surface: Surface
  /** 中心の扇を作らない（輪だけ＝ドーナツ形） */
  ringOnly?: boolean
}

/** 2D 輪郭を曲面へ正面から投影して高さを付けたパッチ */
export function projectPatch(spec: PatchSpec): THREE.BufferGeometry {
  const { outline, center, rings, offset, surface } = spec
  const N = outline.length
  const pos: number[] = []
  const tmpP = new THREE.Vector3()
  const tmpN = new THREE.Vector3()
  const push = (x: number, y: number, h: number) => {
    if (!surface(x, y, tmpP, tmpN)) {
      // 曲面の外：最後に当たった点の近くへ（まれ）
      tmpP.set(x, y, 0)
      tmpN.set(0, 0, -1)
    }
    pos.push(tmpP.x + tmpN.x * h, tmpP.y + tmpN.y * h, tmpP.z + tmpN.z * h)
  }
  const ringStart: number[] = []
  if (!spec.ringOnly) push(center[0], center[1], offset(0, Infinity, 1))
  for (let i = 0; i < rings.length; i++) {
    const s = rings[i]
    if (!spec.ringOnly && s === 0) continue
    ringStart.push(pos.length / 3)
    for (let j = 0; j < N; j++) {
      const dx = outline[j][0] - center[0]
      const dy = outline[j][1] - center[1]
      const R = Math.hypot(dx, dy)
      push(center[0] + dx * s, center[1] + dy * s, offset(s, (1 - s) * R, R))
    }
  }
  const idx: number[] = []
  if (!spec.ringOnly && ringStart.length) {
    const r0 = ringStart[0]
    for (let j = 0; j < N; j++) idx.push(0, r0 + j, r0 + ((j + 1) % N))
  }
  for (let k = 0; k < ringStart.length - 1; k++) {
    const a0 = ringStart[k]
    const b0 = ringStart[k + 1]
    for (let j = 0; j < N; j++) {
      const j1 = (j + 1) % N
      idx.push(a0 + j, b0 + j, b0 + j1)
      idx.push(a0 + j, b0 + j1, a0 + j1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  // 法線は曲面の外向き（-Z 寄り）であるべき
  orientOutward(g, center, surface)
  return g
}

/** パッチの法線と巻き順を曲面の外向きにそろえる */
function orientOutward(g: THREE.BufferGeometry, center: V2, surface: Surface): void {
  const p = new THREE.Vector3()
  const sn = new THREE.Vector3()
  if (!surface(center[0], center[1], p, sn)) sn.set(0, 0, -1)
  const nor = g.attributes.normal
  let dot = 0
  for (let i = 0; i < nor.count; i++) dot += nor.getX(i) * sn.x + nor.getY(i) * sn.y + nor.getZ(i) * sn.z
  if (dot < 0) {
    for (let i = 0; i < nor.count; i++) nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i))
  }
  fixWinding(g)
}

/** 超楕円の輪郭点（中心 cx, cy、半径 rx, ry、上下で丸さを変えられる） */
export function superEllipse(cx: number, cy: number, rx: number, ryTop: number, ryBot: number, nTop: number, nBot: number, count: number, startAngle = 0): V2[] {
  const out: V2[] = []
  for (let i = 0; i < count; i++) {
    const a = startAngle + (i / count) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    const up = s >= 0
    const n = up ? nTop : nBot
    const ry = up ? ryTop : ryBot
    const r = Math.pow(Math.pow(Math.abs(c / rx), n) + Math.pow(Math.abs(s / ry), n), -1 / n)
    out.push([cx + c * r, cy + s * r])
  }
  return out
}

/** 輪郭を中心から放射状に w だけ広げる */
export function inflate(outline: V2[], center: V2, w: number): V2[] {
  return outline.map(([x, y]) => {
    const dx = x - center[0]
    const dy = y - center[1]
    const l = Math.hypot(dx, dy) || 1
    return [x + (dx / l) * w, y + (dy / l) * w] as V2
  })
}

// ------------------------------------------------------------------ 曲面に沿う線

/**
 * 曲面上の 2D 曲線（モデル座標 x, y の点列）を、表面から h だけ浮かせた平たい管に。
 * 半径は両端で細くなって丸く閉じる。
 */
export function strokeTube(pts2: V2[], surface: Surface, h: number, radius: number, flatten = 0.55, radial = 8): THREE.BufferGeometry {
  const P: THREE.Vector3[] = []
  const Nn: THREE.Vector3[] = []
  for (const [x, y] of pts2) {
    const p = new THREE.Vector3()
    const n = new THREE.Vector3()
    if (!surface(x, y, p, n)) n.set(0, 0, -1)
    P.push(p.addScaledVector(n, h))
    Nn.push(n)
  }
  const M = P.length
  const pos: number[] = []
  const T = new THREE.Vector3()
  const B = new THREE.Vector3()
  for (let i = 0; i < M; i++) {
    T.copy(P[Math.min(M - 1, i + 1)]).sub(P[Math.max(0, i - 1)]).normalize()
    B.crossVectors(T, Nn[i]).normalize()
    const u = i / (M - 1)
    // 両端を丸く：端からの距離に応じて半径を絞る
    const e = Math.min(u, 1 - u) * (M - 1)
    const taper = e >= 1.5 ? 1 : Math.sqrt(Math.max(0, 1 - Math.pow(1 - e / 1.5, 2)))
    const r = radius * Math.max(0.05, taper)
    for (let k = 0; k < radial; k++) {
      const th = (k / radial) * Math.PI * 2
      const cx = Math.cos(th) * r
      const cy = Math.sin(th) * r * flatten
      pos.push(P[i].x + B.x * cx + Nn[i].x * cy, P[i].y + B.y * cx + Nn[i].y * cy, P[i].z + B.z * cx + Nn[i].z * cy)
    }
  }
  const idx: number[] = []
  for (let i = 0; i < M - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * radial + k
      const b = i * radial + ((k + 1) % radial)
      const c = (i + 1) * radial + k
      const d = (i + 1) * radial + ((k + 1) % radial)
      idx.push(a, c, b, b, c, d)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  // 管の法線は中心線から外向き
  const nor = g.attributes.normal
  const v = new THREE.Vector3()
  const c = new THREE.Vector3()
  for (let i = 0; i < M; i++) {
    for (let k = 0; k < radial; k++) {
      const vi = i * radial + k
      v.fromBufferAttribute(g.attributes.position, vi)
      c.copy(v).sub(P[i])
      const nn = new THREE.Vector3().fromBufferAttribute(nor, vi)
      if (nn.dot(c) < 0) nor.setXYZ(vi, -nn.x, -nn.y, -nn.z)
    }
  }
  return fixWinding(g)
}

/** 平らな面ごとに頂点を分ける（宝石の切子面など） */
export function facet(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const f = g.index ? g.toNonIndexed() : g
  f.deleteAttribute('normal')
  f.computeVertexNormals()
  return f
}
