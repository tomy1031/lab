// キャンバスで描くテクスチャ（床・看板・時計・光の粒）。街の絵は backdrops.ts、モニターと看板は screens.ts。
// 画像ファイルを使わず、色と形だけで「おもちゃのジオラマ」らしく見せる。
import * as THREE from 'three'

export const FONT = '"Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans Khmer", "Khmer OS", system-ui, sans-serif'

export type DayPhase = 'dawn' | 'day' | 'evening' | 'night'

export function phaseOfHour(h: number): DayPhase {
  if (h >= 5 && h < 7) return 'dawn'
  if (h >= 7 && h < 16.5) return 'day'
  if (h >= 16.5 && h < 19) return 'evening'
  return 'night'
}

/** タイムゾーンの現在時刻（時・分） */
export function localTime(tz: string, now = new Date()): { h: number; m: number; text: string } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now)
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return { h, m, text: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` }
}

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}

export function toTexture(c: HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(repeat[0], repeat[1])
  }
  return t
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

// ------------------------------------------------------------------ 床

export function woodFloor(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512)
  const tones = ['#e9c7a0', '#e3bd93', '#eccfab', '#e0b88d', '#e7c49b']
  const plank = 64
  for (let row = 0; row < 512 / plank; row++) {
    const off = (row % 2) * 128
    for (let x = -256; x < 512; x += 256) {
      g.fillStyle = tones[(row * 3 + ((x + 256) / 256)) % tones.length]
      g.fillRect(x + off, row * plank, 256, plank)
      g.strokeStyle = 'rgba(150,100,60,0.35)'
      g.lineWidth = 2
      g.strokeRect(x + off + 1, row * plank + 1, 254, plank - 2)
      // 木目
      g.strokeStyle = 'rgba(170,120,80,0.12)'
      g.lineWidth = 1.5
      for (let k = 0; k < 3; k++) {
        const y = row * plank + 14 + k * 16
        g.beginPath()
        g.moveTo(x + off + 10, y)
        g.bezierCurveTo(x + off + 90, y - 5, x + off + 160, y + 5, x + off + 246, y)
        g.stroke()
      }
    }
  }
  return toTexture(c, [3, 3])
}

export function tileFloor(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512)
  const s = 128
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 ? '#f6f1e7' : '#efe7d8'
      g.fillRect(x * s, y * s, s, s)
      g.strokeStyle = 'rgba(190,160,120,0.45)'
      g.lineWidth = 3
      g.strokeRect(x * s + 1.5, y * s + 1.5, s - 3, s - 3)
      // 中央のひし形（クメールの床の模様を思わせる小さな飾り）
      if ((x + y) % 2 === 0) {
        g.fillStyle = 'rgba(214,140,90,0.28)'
        g.beginPath()
        const cx = x * s + s / 2
        const cy = y * s + s / 2
        g.moveTo(cx, cy - 18)
        g.lineTo(cx + 18, cy)
        g.lineTo(cx, cy + 18)
        g.lineTo(cx - 18, cy)
        g.closePath()
        g.fill()
      }
    }
  return toTexture(c, [3.5, 3])
}

// ------------------------------------------------------------------ 看板・時計

/** 浮かぶ時計（街の名前・時刻・昼夜のマーク）を描き直す */
export function paintClock(c: HTMLCanvasElement, city: string, time: string, phase: DayPhase, accent: string): void {
  const g = c.getContext('2d')!
  const W = c.width
  const H = c.height
  g.clearRect(0, 0, W, H)
  g.fillStyle = phase === 'night' ? '#26305e' : '#ffffff'
  roundRect(g, 4, 4, W - 8, H - 8, H / 2 - 4)
  g.fill()
  g.lineWidth = 6
  g.strokeStyle = accent
  roundRect(g, 4, 4, W - 8, H - 8, H / 2 - 4)
  g.stroke()
  // 太陽・月
  const ix = H / 2 + 8
  const iy = H / 2
  if (phase === 'night') {
    g.fillStyle = '#ffe680'
    g.beginPath()
    g.arc(ix, iy, 26, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#26305e'
    g.beginPath()
    g.arc(ix + 12, iy - 8, 22, 0, Math.PI * 2)
    g.fill()
  } else {
    g.fillStyle = phase === 'evening' ? '#ff8a5c' : '#ffc93c'
    g.beginPath()
    g.arc(ix, iy, 20, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = g.fillStyle
    g.lineWidth = 5
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      g.beginPath()
      g.moveTo(ix + Math.cos(a) * 27, iy + Math.sin(a) * 27)
      g.lineTo(ix + Math.cos(a) * 35, iy + Math.sin(a) * 35)
      g.stroke()
    }
  }
  g.fillStyle = phase === 'night' ? '#ffffff' : '#2b3550'
  g.textBaseline = 'middle'
  g.textAlign = 'left'
  g.font = `800 64px ${FONT}`
  g.fillText(time, H + 8, H / 2 + 3)
  g.font = `700 30px ${FONT}`
  g.fillStyle = phase === 'night' ? '#c9d3ff' : '#6b7896'
  g.textAlign = 'right'
  g.fillText(city, W - 40, H / 2 + 2)
}

// ------------------------------------------------------------------ 光

let glowTex: THREE.Texture | null = null
/** 光の粒のにじみ（中心が白く、外へ透明に） */
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex
  const [c, g] = canvas(64, 64)
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.25, 'rgba(255,255,255,0.8)')
  grd.addColorStop(0.6, 'rgba(255,255,255,0.18)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  glowTex = toTexture(c)
  return glowTex
}

/** 光の道の流れる縞 */
export function flowTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 32)
  const grd = g.createLinearGradient(0, 0, 256, 0)
  grd.addColorStop(0, 'rgba(120,230,255,0.15)')
  grd.addColorStop(0.45, 'rgba(160,240,255,0.95)')
  grd.addColorStop(0.55, 'rgba(255,255,255,1)')
  grd.addColorStop(1, 'rgba(120,230,255,0.15)')
  g.fillStyle = grd
  g.fillRect(0, 0, 256, 32)
  const t = toTexture(c, [10, 1])
  return t
}

/** 階調の少ないトゥーンの陰影 */
let toonGrad: THREE.DataTexture | null = null
export function toonGradient(): THREE.DataTexture {
  if (toonGrad) return toonGrad
  const data = new Uint8Array([150, 150, 150, 255, 205, 205, 205, 255, 255, 255, 255, 255])
  const t = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat)
  t.minFilter = THREE.NearestFilter
  t.magFilter = THREE.NearestFilter
  t.generateMipmaps = false
  t.needsUpdate = true
  toonGrad = t
  return t
}
