// 出典：tomy1031/nexmax_chronicle（web/src/world/nexmax/production.ts）から流用。ネクマックスの 3D モデル（コードで組んだ部品＋手続きアニメーション）。
// 量産型NEXMAX（2086年ナンバタウンの最新型）の部品と色。
// 主人公（初号機）と同じ家系のシルエット（丸いヘルメット・耳パッド・玉の関節・大きな足）を保ちつつ、
// ・白いボディに青いパネル（交互の二色）
// ・顔は暗いバイザーに光る縦長の LED の目（眉と口は無い）
// ・頭のてっぺんに通信アンテナ（主人公には無い部品）
// ・背中は特殊鉱石の窓ではなく、ただの整備ハッチ（量産型は鉱石の働きを再現できていない）
// ・右腕にワイヤー射出器は無い（両腕とも普通の前腕）
// 形はすべて主人公と同じ生成関数から作り、頂点色の塗り替えと小さな追加部品だけで差を付ける。
import * as THREE from 'three'
import { ball, beadProfile, lathe, merge, paint, projectPatch, superEllipse, type V2 } from './geom'
import { HEAD_CENTER, HEAD_PIVOT_Y, HEAD_SPEC, PX, fy, headSurface } from './head'
import { ORE_CENTER, ORE_R, torsoBack } from './body'
import { NX_COLORS, type TorsoTexSpec } from './materials'

export const PROD_COLORS = {
  white: '#eef2f7',
  blue: '#2c6fe2',
  navy: '#1d3f86',
  dark: '#2b3545',
  visor: '#101826',
  led: '#7ff2ff',
  ledCore: '#e8ffff',
  hatch: '#c9d3df',
  hatchSlot: '#36404f',
}

/** 体の比率（主人公との違い）。頭は少し小さく、脚は少し長く、胴は少し細い */
export const PROD_PROPORTIONS = {
  head: 0.9,
  torso: new THREE.Vector3(0.94, 1.03, 0.94),
  leg: 1.08,
}

/** 足元から股関節までの高さ（主人公の見本の寸法） */
const HIP_HEIGHT = 0.41

/** 脚を伸ばした分だけ全体を持ち上げる量（モデルの寸法 = 全高 1.2m 基準） */
export const PROD_LIFT = HIP_HEIGHT * (PROD_PROPORTIONS.leg - 1)

const _c = new THREE.Color()
const _ref = new THREE.Color()

/**
 * 頂点色のうち「本体の青」（NX_COLORS.body）だけを別の色に塗り替える。
 * pick を渡すと、位置ごとに色を選べる（耳だけ青など）。
 */
export function recolorBody(g: THREE.BufferGeometry, color: THREE.ColorRepresentation | ((p: THREE.Vector3) => THREE.ColorRepresentation)): THREE.BufferGeometry {
  const col = g.attributes.color as THREE.BufferAttribute | undefined
  if (!col) return paint(g, typeof color === 'function' ? PROD_COLORS.white : color)
  _ref.set(NX_COLORS.body)
  const pos = g.attributes.position
  const p = new THREE.Vector3()
  const fixed = typeof color === 'function' ? null : new THREE.Color(color)
  for (let i = 0; i < col.count; i++) {
    const dr = col.getX(i) - _ref.r
    const dg = col.getY(i) - _ref.g
    const db = col.getZ(i) - _ref.b
    if (dr * dr + dg * dg + db * db > 1e-4) continue
    if (fixed) _c.copy(fixed)
    else {
      p.fromBufferAttribute(pos, i)
      _c.set((color as (p: THREE.Vector3) => THREE.ColorRepresentation)(p))
    }
    col.setXYZ(i, _c.r, _c.g, _c.b)
  }
  col.needsUpdate = true
  return g
}

/** ヘルメットの塗り分け：殻は白、耳パッドは青（|x| が耳の付け根より外） */
export function paintProductionHelmet(g: THREE.BufferGeometry): THREE.BufferGeometry {
  return recolorBody(g, (p) => (Math.abs(p.x) > 0.252 ? PROD_COLORS.blue : PROD_COLORS.white))
}

/**
 * 通信アンテナ（モデル座標、頭の回転中心の補正前）。
 * body：土台の小さなドーム＋細い棒（ヘルメットと同じ本体マテリアル・輪郭線あり）
 * tip：先端の光る玉（発光マテリアル）
 */
export function buildAntenna(): { body: THREE.BufferGeometry; tip: THREE.BufferGeometry; tipPos: THREE.Vector3 } {
  const topY = HEAD_CENTER.y + HEAD_SPEC.bTop
  const baseX = 0.07
  // 超楕円体の上面は端ほど下がる：少しもぐらせて置く
  const baseY = topY - 0.012
  const tilt = -0.2 // 外側（+x）へ傾ける
  const base = ball(0.032, 14, 8, 0.55)
  base.translate(baseX, baseY, 0.02)
  paint(base, PROD_COLORS.blue)
  const collar = lathe(beadProfile(0.012, 0.014, 0.024, 2.4, 6), 10)
  const rodLen = 0.15
  const rod = lathe(
    [
      [0, rodLen],
      [0.0052, rodLen],
      [0.0058, rodLen * 0.5],
      [0.0066, 0.0],
      [0, 0],
    ],
    8,
  )
  const m = new THREE.Matrix4().compose(new THREE.Vector3(baseX, baseY + 0.012, 0.02), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0, tilt)), new THREE.Vector3(1, 1, 1))
  collar.translate(0, 0.008, 0)
  collar.applyMatrix4(m)
  rod.applyMatrix4(m)
  paint(collar, PROD_COLORS.dark)
  paint(rod, '#dfe6ee')
  const tipPos = new THREE.Vector3(0, rodLen + 0.012, 0).applyMatrix4(m)
  const tip = ball(0.017, 12, 8)
  const tc = new THREE.Color(PROD_COLORS.led)
  const core = new THREE.Color(PROD_COLORS.ledCore)
  const pos = tip.attributes.position
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const k = Math.max(0, pos.getY(i) / 0.017)
    _c.copy(tc).lerp(core, k * 0.7)
    col[i * 3] = _c.r
    col[i * 3 + 1] = _c.g
    col[i * 3 + 2] = _c.b
  }
  tip.setAttribute('color', new THREE.BufferAttribute(col, 3))
  tip.translate(tipPos.x, tipPos.y, tipPos.z)
  const body = merge([base, collar, rod])
  body.translate(0, -HEAD_PIVOT_Y, 0)
  tip.translate(0, -HEAD_PIVOT_Y, 0)
  tipPos.y -= HEAD_PIVOT_Y
  return { body, tip: merge([tip]), tipPos }
}

/** 顔プレートの上の面（目を載せる）。プレートの厚み 0.0075 は head.ts と同じ */
const plateTop = (h: number) => (x: number, y: number, out: THREE.Vector3, n: THREE.Vector3) => {
  if (!headSurface(x, y, out, n)) return false
  out.addScaledVector(n, 0.0075 + h)
  return true
}

/** LED の目：縦長の角丸（中心ほど白く光る）。目の中心の高さは主人公と同じ */
export function buildLedEyes(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const EX = 58 * PX
  const EY = fy(300)
  const rx = 13 * PX
  const ry = 27 * PX
  const edge = new THREE.Color(PROD_COLORS.led)
  const core = new THREE.Color(PROD_COLORS.ledCore)
  for (const side of [1, -1]) {
    const cx = side * EX
    const outline = superEllipse(cx, EY, rx, ry, ry, 3.2, 3.2, 40)
    const eye = projectPatch({
      outline,
      center: [cx, EY] as V2,
      rings: [0, 0.4, 0.75, 1],
      surface: plateTop(0),
      offset: (u) => 0.0012 + 0.0016 * Math.sqrt(Math.max(0, 1 - u * u)),
    })
    const pos = eye.attributes.position
    const col = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const d = Math.hypot((pos.getX(i) - cx) / rx, (pos.getY(i) - EY) / ry)
      _c.copy(core).lerp(edge, Math.min(1, d * 1.15))
      col[i * 3] = _c.r
      col[i * 3 + 1] = _c.g
      col[i * 3 + 2] = _c.b
    }
    eye.setAttribute('color', new THREE.BufferAttribute(col, 3))
    parts.push(eye)
  }
  return merge(parts)
}

/** 背中の整備ハッチ（鉱石の窓の代わり）：明るい灰色の円盤に 3 本の通気スリット */
export function buildHatch(): THREE.BufferGeometry {
  const [cx, cy] = ORE_CENTER
  const outline: V2[] = Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2
    return [cx + Math.cos(a) * ORE_R * 0.96, cy + Math.sin(a) * ORE_R * 0.96]
  })
  const disc = projectPatch({
    outline,
    center: ORE_CENTER,
    rings: [0, 0.35, 0.7, 0.9, 1],
    surface: torsoBack,
    offset: (s) => 0.0012 + 0.0016 * (1 - s * s),
  })
  const pos = disc.attributes.position
  const col = new Float32Array(pos.count * 3)
  const base = new THREE.Color(PROD_COLORS.hatch)
  const slot = new THREE.Color(PROD_COLORS.hatchSlot)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) - cx
    const y = pos.getY(i) - cy
    const inSlot = Math.abs(x) < ORE_R * 0.55 && [-0.38, 0, 0.38].some((k) => Math.abs(y - k * ORE_R) < ORE_R * 0.09)
    _c.copy(inSlot ? slot : base)
    col[i * 3] = _c.r
    col[i * 3 + 1] = _c.g
    col[i * 3 + 2] = _c.b
  }
  disc.setAttribute('color', new THREE.BufferAttribute(col, 3))
  disc.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2))
  return merge([disc])
}

/**
 * 量産型の胴のテクスチャ：白地に青い脇のパネル、腰の青い帯、胸に紺のロゴと製造番号。
 * uv は主人公と同じ（u=0.25 が正面、0.75 が背中）。
 */
export function makeProductionTorsoTexture(spec: TorsoTexSpec, serial = 86): THREE.CanvasTexture {
  const W = 1024
  const H = 512
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = PROD_COLORS.white
  ctx.fillRect(0, 0, W, H)
  // 脇の青いパネル（u = 0 / 0.5 のまわり）。上下は丸く切る
  ctx.fillStyle = PROD_COLORS.blue
  for (const u of [0, 0.5, 1]) {
    const x = u * W
    const w = 0.16 * W
    ctx.beginPath()
    ctx.roundRect(x - w / 2, H * 0.12, w, H * 0.62, 60)
    ctx.fill()
  }
  // 腰の帯（下端の少し上）
  ctx.fillStyle = PROD_COLORS.navy
  ctx.fillRect(0, H * 0.83, W, H * 0.06)
  // パネルの継ぎ目（細い灰色の線）
  ctx.strokeStyle = 'rgba(70,86,110,0.55)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(0, H * 0.08)
  ctx.lineTo(W, H * 0.08)
  ctx.stroke()
  // 胸のロゴ（主人公と同じ山形を紺と青で）
  const x0 = (spec.logoU - spec.logoW / 2) * W
  const y0 = (1 - spec.logoV - spec.logoH / 2) * H - H * 0.02
  const w = spec.logoW * W * 0.85
  const h = spec.logoH * H * 0.85
  const poly = (pts: number[][], col: string) => {
    ctx.beginPath()
    pts.forEach(([u, v], i) => {
      const x = x0 + w * 0.08 + u * w
      const y = y0 + v * h
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
    ctx.fillStyle = col
    ctx.fill()
  }
  poly([[0, 0.41], [0, 1], [0.525, 1]], PROD_COLORS.navy)
  poly([[1, 0], [1, 1], [0.95, 1], [0.5375, 0.52]], PROD_COLORS.navy)
  poly([[0.18, 0.12], [0.95, 1], [0.525, 1], [0.18, 0.61]], PROD_COLORS.blue)
  // 製造番号
  ctx.fillStyle = PROD_COLORS.navy
  ctx.font = `800 ${Math.round(H * 0.07)}px "M PLUS Rounded 1c", "Hiragino Sans", "Helvetica Neue", Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`NX-${String(serial).padStart(3, '0')}`, spec.logoU * W, y0 + h + H * 0.09)
  // 背中：小さな注意表示の帯（u=0.75 の上）
  ctx.fillStyle = PROD_COLORS.blue
  ctx.fillRect(0.75 * W - W * 0.05, H * 0.1, W * 0.1, H * 0.035)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  t.wrapS = THREE.RepeatWrapping
  return t
}

/** 量産型の追加マテリアル（バイザー・LED・アンテナの先） */
export function createProductionMaterials(): { visor: THREE.MeshPhysicalMaterial; led: THREE.MeshBasicMaterial; tip: THREE.MeshBasicMaterial; hatch: THREE.MeshStandardMaterial; dispose(): void } {
  const visor = new THREE.MeshPhysicalMaterial({
    color: PROD_COLORS.visor,
    roughness: 0.16,
    metalness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    emissive: new THREE.Color('#0b2850'),
    emissiveIntensity: 0.45,
    envMapIntensity: 1.3,
  })
  const led = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.4, 2.4, 2.4) })
  const tip = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.0, 2.0, 2.0) })
  const hatch = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.3 })
  return {
    visor,
    led,
    tip,
    hatch,
    dispose() {
      for (const m of [visor, led, tip, hatch]) m.dispose()
    },
  }
}
