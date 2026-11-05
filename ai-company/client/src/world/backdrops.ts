// オフィスの奥に立てる「街の絵」（パステルのイラスト）。キャンバスで描く。
// 大阪：通天閣と大阪城・ビル街・桜 / 東京：東京タワーとビル街 / プノンペン：王宮（玉座殿の金の尖塔・チャンチャヤー・パビリオン）とヤシ・川沿い。
// client/public/backdrops/manifest.json に書かれた画像（osaka.webp など）があれば、そちらを使う（codex などで生成した絵に差し替えられる）。
import * as THREE from 'three'
import type { OfficeId } from '../../../shared/types'
import { canvas, toTexture } from './textures'

const W = 1600
const H = 760

type G = CanvasRenderingContext2D

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function rr(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/** ビル街（奥ほど淡い）。base = 地面の y */
function skyline(g: G, seed: number, base: number, minH: number, maxH: number, color: string, windowColor: string | null, from = 0, to = W, skip?: (x: number, w: number) => boolean): void {
  const r = rng(seed)
  let x = from - 20
  while (x < to) {
    const w = 46 + r() * 70
    const h = minH + r() * (maxH - minH)
    if (!skip || !skip(x, w)) {
      g.fillStyle = color
      const top = base - h
      const round = r() < 0.3 ? 10 : 3
      rr(g, x, top, w, h + 40, round)
      g.fill()
      if (r() < 0.25) {
        // 屋上の塔
        g.fillRect(x + w * 0.4, top - 18, w * 0.2, 20)
      }
      if (windowColor) {
        g.fillStyle = windowColor
        const cols = Math.max(2, Math.floor(w / 16))
        const rows = Math.floor(h / 22)
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if (r() < 0.75) g.fillRect(x + 6 + i * ((w - 12) / cols), top + 10 + j * 22, (w - 12) / cols - 5, 9)
      }
    }
    x += w + 4 + r() * 10
  }
}

function softGround(g: G, base: number, color: string): void {
  const grd = g.createLinearGradient(0, base - 30, 0, H)
  grd.addColorStop(0, color)
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, base - 6, W, H - base + 6)
}

function cloud(g: G, x: number, y: number, s: number, alpha = 0.9): void {
  g.fillStyle = `rgba(255,255,255,${alpha})`
  for (const [dx, dy, r] of [
    [0, 0, 40],
    [45, -18, 46],
    [95, 0, 38],
    [-40, 8, 30],
    [130, 12, 26],
  ]) {
    g.beginPath()
    g.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2)
    g.fill()
  }
}

function sakuraTree(g: G, x: number, base: number, s: number, seed: number): void {
  const r = rng(seed)
  g.strokeStyle = '#9b6b58'
  g.lineCap = 'round'
  g.lineWidth = 16 * s
  g.beginPath()
  g.moveTo(x, base)
  g.quadraticCurveTo(x + 10 * s, base - 90 * s, x - 10 * s, base - 170 * s)
  g.stroke()
  g.lineWidth = 8 * s
  for (const [dx, dy] of [
    [-70, -200],
    [60, -210],
    [-30, -250],
  ]) {
    g.beginPath()
    g.moveTo(x - 6 * s, base - 150 * s)
    g.lineTo(x + dx * s, base + dy * s)
    g.stroke()
  }
  const pinks = ['#ffc8da', '#ffb3cc', '#ffd9e6', '#ffa6c4']
  for (let i = 0; i < 26; i++) {
    g.fillStyle = pinks[i % 4]
    g.beginPath()
    g.arc(x + (r() - 0.5) * 260 * s, base - (170 + r() * 130) * s, (26 + r() * 30) * s, 0, Math.PI * 2)
    g.fill()
  }
  g.fillStyle = '#ffffff'
  for (let i = 0; i < 40; i++) {
    g.globalAlpha = 0.7
    g.beginPath()
    g.arc(x + (r() - 0.5) * 250 * s, base - (170 + r() * 130) * s, 3 * s, 0, Math.PI * 2)
    g.fill()
  }
  g.globalAlpha = 1
}

function palmTree(g: G, x: number, base: number, s: number, lean: number): void {
  g.strokeStyle = '#b98b5c'
  g.lineCap = 'round'
  g.lineWidth = 12 * s
  const topX = x + lean * 60 * s
  const topY = base - 260 * s
  g.beginPath()
  g.moveTo(x, base)
  g.quadraticCurveTo(x + lean * 10 * s, base - 140 * s, topX, topY)
  g.stroke()
  g.fillStyle = '#4fb36d'
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    g.save()
    g.translate(topX, topY)
    g.rotate(a)
    g.beginPath()
    g.ellipse(52 * s, 8 * s, 58 * s, 13 * s, 0.35, 0, Math.PI * 2)
    g.fill()
    g.restore()
  }
  g.fillStyle = '#3d9a5a'
  g.beginPath()
  g.arc(topX, topY, 14 * s, 0, Math.PI * 2)
  g.fill()
}

// ------------------------------------------------------------------ 大阪

function paintOsaka(g: G): void {
  const base = 600
  cloud(g, 180, 170, 1.1, 0.75)
  cloud(g, 1180, 120, 0.9, 0.7)
  skyline(g, 11, base, 120, 300, '#d6e9fb', null)
  // あべのハルカス（段々の高いビル）
  g.fillStyle = '#c7def6'
  rr(g, 1180, base - 430, 110, 470, 6)
  g.fill()
  rr(g, 1160, base - 330, 150, 380, 6)
  g.fill()
  rr(g, 1140, base - 230, 190, 280, 6)
  g.fill()
  g.fillStyle = '#e9f4ff'
  for (let j = 0; j < 18; j++) g.fillRect(1192, base - 420 + j * 22, 86, 8)
  skyline(g, 23, base, 70, 200, '#e6f2fe', '#cfe4fa', 0, W, (x, w) => (x + w > 640 && x < 900) || (x + w > 180 && x < 430))

  // 大阪城（左）
  const cx = 300
  g.fillStyle = '#9ab8a4'
  rr(g, cx - 120, base - 60, 240, 70, 6)
  g.fill()
  const tiers: [number, number][] = [
    [210, 46],
    [170, 42],
    [130, 40],
    [92, 38],
  ]
  let y = base - 60
  for (const [w, h] of tiers) {
    g.fillStyle = '#ffffff'
    g.fillRect(cx - w / 2 + 10, y - h, w - 20, h)
    g.fillStyle = '#5c9b84'
    g.beginPath()
    g.moveTo(cx - w / 2 - 12, y - h + 10)
    g.lineTo(cx + w / 2 + 12, y - h + 10)
    g.lineTo(cx + w / 2 - 20, y - h - 14)
    g.lineTo(cx - w / 2 + 20, y - h - 14)
    g.closePath()
    g.fill()
    g.fillStyle = '#e9b949'
    g.fillRect(cx - w / 2 + 6, y - h + 8, w - 12, 3)
    y -= h + 10
  }
  g.fillStyle = '#e9b949'
  g.beginPath()
  g.arc(cx - 30, y + 8, 6, 0, Math.PI * 2)
  g.arc(cx + 30, y + 8, 6, 0, Math.PI * 2)
  g.fill()

  // 通天閣（中央）
  const tx = 770
  g.fillStyle = '#eef3fa'
  g.strokeStyle = '#b9c9dd'
  g.lineWidth = 3
  // 4 本の脚（アーチ）
  g.beginPath()
  g.moveTo(tx - 75, base)
  g.lineTo(tx - 32, base - 120)
  g.lineTo(tx + 32, base - 120)
  g.lineTo(tx + 75, base)
  g.lineTo(tx + 40, base)
  g.quadraticCurveTo(tx, base - 70, tx - 40, base)
  g.closePath()
  g.fill()
  g.stroke()
  // 胴
  g.beginPath()
  g.moveTo(tx - 32, base - 120)
  g.lineTo(tx - 22, base - 330)
  g.lineTo(tx + 22, base - 330)
  g.lineTo(tx + 32, base - 120)
  g.closePath()
  g.fill()
  g.stroke()
  // 格子
  g.strokeStyle = '#c8d6e8'
  g.lineWidth = 2
  for (let j = 0; j < 9; j++) {
    const yy = base - 130 - j * 22
    g.beginPath()
    g.moveTo(tx - 30 + j, yy)
    g.lineTo(tx + 30 - j, yy - 22)
    g.moveTo(tx + 30 - j, yy)
    g.lineTo(tx - 30 + j, yy - 22)
    g.stroke()
  }
  // 展望台
  g.fillStyle = '#ffffff'
  g.strokeStyle = '#a8bcd6'
  g.lineWidth = 3
  rr(g, tx - 46, base - 392, 92, 62, 8)
  g.fill()
  g.stroke()
  g.fillStyle = '#7fb6e8'
  g.fillRect(tx - 38, base - 380, 76, 16)
  // ネオンの帯
  g.fillStyle = '#ff9fbf'
  g.fillRect(tx - 46, base - 350, 92, 8)
  // 丸い屋根と避雷針
  g.fillStyle = '#f2f6fb'
  g.beginPath()
  g.ellipse(tx, base - 392, 34, 26, 0, Math.PI, 0)
  g.fill()
  g.stroke()
  g.strokeStyle = '#a8bcd6'
  g.beginPath()
  g.moveTo(tx, base - 418)
  g.lineTo(tx, base - 470)
  g.stroke()
  g.fillStyle = '#ff6b8a'
  g.beginPath()
  g.arc(tx, base - 472, 5, 0, Math.PI * 2)
  g.fill()

  skyline(g, 37, base + 10, 30, 110, '#f5faff', '#dbeafa', 0, W, (x, w) => x + w > 690 && x < 850)
  softGround(g, base + 20, 'rgba(232,244,255,0.95)')
  sakuraTree(g, 70, base + 120, 1.15, 5)
  sakuraTree(g, 1520, base + 130, 1.0, 9)
  sakuraTree(g, 1080, base + 140, 0.7, 13)
}

// ------------------------------------------------------------------ 東京

function paintTokyo(g: G): void {
  const base = 600
  cloud(g, 300, 160, 1.0, 0.75)
  cloud(g, 1250, 200, 0.8, 0.7)
  skyline(g, 51, base, 140, 330, '#d6e9fb', null)
  // スカイツリー（遠く）
  g.fillStyle = '#c6dcf3'
  g.beginPath()
  g.moveTo(1240, base)
  g.lineTo(1262, base - 500)
  g.lineTo(1268, base - 560)
  g.lineTo(1274, base - 500)
  g.lineTo(1296, base)
  g.closePath()
  g.fill()
  g.fillRect(1250, base - 360, 36, 18)
  g.fillRect(1256, base - 450, 24, 12)
  skyline(g, 63, base, 90, 230, '#e6f2fe', '#cfe4fa', 0, W, (x, w) => x + w > 600 && x < 960)

  // 東京タワー
  const tx = 780
  const red = '#ff6f4f'
  const white = '#ffffff'
  const legs = (y0: number, y1: number, w0: number, w1: number, col: string) => {
    g.fillStyle = col
    g.beginPath()
    g.moveTo(tx - w0, y0)
    g.lineTo(tx - w1, y1)
    g.lineTo(tx + w1, y1)
    g.lineTo(tx + w0, y0)
    g.closePath()
    g.fill()
  }
  const sections: [number, number, number, number, string][] = [
    [base, base - 120, 150, 70, red],
    [base - 120, base - 210, 70, 44, white],
    [base - 210, base - 300, 44, 28, red],
    [base - 300, base - 370, 28, 20, white],
    [base - 370, base - 450, 20, 10, red],
    [base - 450, base - 520, 10, 4, white],
  ]
  for (const s of sections) legs(...s)
  // 脚のあいだのアーチ
  g.fillStyle = 'rgba(230,242,255,1)'
  g.beginPath()
  g.moveTo(tx - 100, base)
  g.quadraticCurveTo(tx, base - 170, tx + 100, base)
  g.closePath()
  g.fill()
  // 格子
  g.strokeStyle = 'rgba(255,255,255,0.65)'
  g.lineWidth = 2
  for (let j = 0; j < 22; j++) {
    const y = base - 20 - j * 22
    const w = 150 - (j * 140) / 22
    g.beginPath()
    g.moveTo(tx - w, y)
    g.lineTo(tx + w * 0.6, y - 22)
    g.moveTo(tx + w, y)
    g.lineTo(tx - w * 0.6, y - 22)
    g.stroke()
  }
  // 展望台 2 つ
  for (const [y, w] of [
    [base - 215, 64],
    [base - 375, 34],
  ] as const) {
    g.fillStyle = '#f7fbff'
    rr(g, tx - w, y - 22, w * 2, 26, 6)
    g.fill()
    g.fillStyle = '#86bdf0'
    g.fillRect(tx - w + 6, y - 16, w * 2 - 12, 10)
  }
  g.strokeStyle = red
  g.lineWidth = 4
  g.beginPath()
  g.moveTo(tx, base - 520)
  g.lineTo(tx, base - 585)
  g.stroke()

  skyline(g, 77, base + 10, 30, 120, '#f5faff', '#dbeafa', 0, W, (x, w) => x + w > 640 && x < 920)
  softGround(g, base + 20, 'rgba(232,244,255,0.95)')
  // 街路樹
  for (const [x, s] of [
    [120, 1],
    [1480, 0.9],
  ] as const) {
    g.fillStyle = '#7fcf8a'
    g.beginPath()
    g.arc(x, base + 40, 70 * s, 0, Math.PI * 2)
    g.arc(x + 60 * s, base + 60, 55 * s, 0, Math.PI * 2)
    g.arc(x - 55 * s, base + 65, 50 * s, 0, Math.PI * 2)
    g.fill()
  }
}

// ------------------------------------------------------------------ プノンペン（王宮）

/** クメールの段々屋根（下から上へ細くなる）と、両端の反り（チョーファ） */
function khmerRoof(g: G, cx: number, y: number, w: number, tiers: number, tierH: number, gold: string, edge: string): number {
  let ww = w
  let yy = y
  for (let i = 0; i < tiers; i++) {
    g.fillStyle = gold
    g.beginPath()
    g.moveTo(cx - ww / 2, yy)
    g.lineTo(cx - ww / 2 + ww * 0.12, yy - tierH)
    g.lineTo(cx + ww / 2 - ww * 0.12, yy - tierH)
    g.lineTo(cx + ww / 2, yy)
    g.closePath()
    g.fill()
    g.strokeStyle = edge
    g.lineWidth = 4
    g.beginPath()
    g.moveTo(cx - ww / 2, yy)
    g.lineTo(cx - ww / 2 + ww * 0.12, yy - tierH)
    g.moveTo(cx + ww / 2, yy)
    g.lineTo(cx + ww / 2 - ww * 0.12, yy - tierH)
    g.stroke()
    // 反り
    g.strokeStyle = gold
    g.lineWidth = 5
    g.beginPath()
    g.moveTo(cx - ww / 2, yy)
    g.quadraticCurveTo(cx - ww / 2 - 10, yy - 6, cx - ww / 2 - 8, yy - 22)
    g.moveTo(cx + ww / 2, yy)
    g.quadraticCurveTo(cx + ww / 2 + 10, yy - 6, cx + ww / 2 + 8, yy - 22)
    g.stroke()
    yy -= tierH * 0.8
    ww *= 0.72
  }
  return yy
}

function spire(g: G, cx: number, y: number, h: number, w: number, gold: string, light: string): void {
  // 四面の顔の塔（簡略）＋細い尖塔
  g.fillStyle = gold
  rr(g, cx - w / 2, y - h * 0.22, w, h * 0.22, 6)
  g.fill()
  g.fillStyle = light
  g.fillRect(cx - w * 0.18, y - h * 0.2, w * 0.36, h * 0.12)
  g.fillStyle = gold
  g.beginPath()
  g.moveTo(cx - w * 0.42, y - h * 0.22)
  g.lineTo(cx, y - h)
  g.lineTo(cx + w * 0.42, y - h * 0.22)
  g.closePath()
  g.fill()
  // 段の帯
  g.strokeStyle = light
  g.lineWidth = 3
  for (let i = 1; i < 7; i++) {
    const yy = y - h * 0.22 - (h * 0.72 * i) / 7
    const ww = w * 0.42 * (1 - i / 7.5)
    g.beginPath()
    g.moveTo(cx - ww, yy)
    g.lineTo(cx + ww, yy)
    g.stroke()
  }
}

function paintPhnomPenh(g: G): void {
  const base = 600
  const gold = '#f2c14e'
  const goldD = '#d99a2b'
  const light = '#fff1c4'
  cloud(g, 220, 140, 1.0, 0.75)
  cloud(g, 1300, 180, 0.9, 0.7)
  // 遠くの街
  skyline(g, 91, base - 30, 60, 170, '#d9ebfb', null)
  // 王宮の塀
  g.fillStyle = '#fff6e6'
  g.fillRect(80, base - 70, 1440, 80)
  g.fillStyle = gold
  for (let x = 80; x < 1520; x += 36) {
    g.beginPath()
    g.moveTo(x, base - 70)
    g.lineTo(x + 18, base - 92)
    g.lineTo(x + 36, base - 70)
    g.closePath()
    g.fill()
  }
  // 玉座殿（中央・大）
  const cx = 820
  g.fillStyle = '#fffaf0'
  g.fillRect(cx - 300, base - 190, 600, 130)
  g.fillStyle = '#f6e3b8'
  for (let i = 0; i < 9; i++) g.fillRect(cx - 280 + i * 68, base - 180, 14, 120)
  g.fillStyle = '#c98a2e'
  g.fillRect(cx - 310, base - 196, 620, 10)
  const ry = khmerRoof(g, cx, base - 196, 640, 3, 46, gold, '#2f8f74')
  spire(g, cx, ry + 4, 300, 90, gold, light)
  // 両側の小さな屋根
  for (const dx of [-250, 250]) {
    const yy = khmerRoof(g, cx + dx, base - 196, 150, 2, 34, goldD, '#2f8f74')
    spire(g, cx + dx, yy + 2, 90, 34, gold, light)
  }

  // チャンチャヤー・パビリオン（左手前）
  const px = 360
  g.fillStyle = '#fff8ea'
  g.fillRect(px - 150, base - 120, 300, 70)
  g.fillStyle = '#f2dcae'
  for (let i = 0; i < 7; i++) g.fillRect(px - 140 + i * 46, base - 118, 10, 66)
  khmerRoof(g, px, base - 122, 340, 3, 30, gold, '#2f8f74')
  // 銀寺の尖塔（右）
  spire(g, 1270, base - 70, 230, 60, '#e8e8ef', '#ffffff')
  khmerRoof(g, 1270, base - 70, 200, 2, 30, '#e3b453', '#3d7fa8')

  // 川沿いの遊歩道と旗
  softGround(g, base + 10, 'rgba(255,248,232,0.95)')
  g.fillStyle = 'rgba(126,196,232,0.55)'
  g.fillRect(0, base + 70, W, 34)
  for (let x = 140; x < 1500; x += 170) {
    g.strokeStyle = '#c0c8d6'
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(x, base + 60)
    g.lineTo(x, base - 10)
    g.stroke()
    // カンボジアの旗（青・赤・青）
    g.fillStyle = '#2b4fa8'
    g.fillRect(x, base - 10, 30, 5)
    g.fillStyle = '#e03a3e'
    g.fillRect(x, base - 5, 30, 9)
    g.fillStyle = '#2b4fa8'
    g.fillRect(x, base + 4, 30, 5)
  }
  palmTree(g, 60, base + 130, 1.1, 0.4)
  palmTree(g, 1510, base + 130, 1.15, -0.45)
  palmTree(g, 1080, base + 110, 0.75, 0.25)
  palmTree(g, 560, base + 115, 0.7, -0.2)
}

const PAINTERS: Record<OfficeId, (g: G) => void> = { osaka: paintOsaka, tokyo: paintTokyo, phnompenh: paintPhnomPenh }

export interface Backdrop {
  mesh: THREE.Mesh
  /** 夜は少し暗く・青く */
  setPhase(night: number): void
  dispose(): void
}

let manifest: Promise<string[]> | null = null
function availableImages(): Promise<string[]> {
  if (!manifest) {
    manifest = fetch('/backdrops/manifest.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : { images: [] }))
      .then((j: { images?: string[] }) => (Array.isArray(j.images) ? j.images : []))
      .catch(() => [])
  }
  return manifest
}

/** 街の絵（幅 w・高さ h の板）。画像があれば読み込んで差し替える */
export function buildBackdrop(id: OfficeId, w: number): Backdrop {
  const [c, g] = canvas(W, H)
  PAINTERS[id](g)
  const tex = toTexture(c)
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false })
  const geo = new THREE.PlaneGeometry(1, 1)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.scale.set(w, (w * H) / W, 1)
  mesh.renderOrder = -10
  let img: THREE.Texture | null = null
  void availableImages().then((list) => {
    const file = list.find((f) => f.replace(/\.[a-z]+$/i, '') === id)
    if (!file) return
    new THREE.TextureLoader().load(`/backdrops/${file}`, (t) => {
      t.colorSpace = THREE.SRGBColorSpace
      img = t
      mat.map = t
      mat.needsUpdate = true
      const ar = (t.image as { width: number; height: number }).height / (t.image as { width: number; height: number }).width
      mesh.scale.y = w * ar
    })
  })
  const day = new THREE.Color('#ffffff')
  const night = new THREE.Color('#7f8fc8')
  return {
    mesh,
    setPhase(n) {
      mat.color.copy(day).lerp(night, n)
    },
    dispose() {
      tex.dispose()
      img?.dispose()
      mat.dispose()
      geo.dispose()
    },
  }
}
