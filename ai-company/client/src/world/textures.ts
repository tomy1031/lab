// キャンバスで描くテクスチャ（床・窓の景色・障子・看板・時計・光の粒）。
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

// ------------------------------------------------------------------ 窓の景色

const SKY: Record<DayPhase, [string, string]> = {
  dawn: ['#9fb8ff', '#ffd2b0'],
  day: ['#8fd3ff', '#e6f7ff'],
  evening: ['#7a6cc4', '#ffb27a'],
  night: ['#1b2350', '#3d3f7a'],
}

/** 窓の外の景色。jp = 大阪（通天閣ふうの塔・城の屋根・ビル）、kh = プノンペン（アンコールふうの塔・ヤシ） */
export function paintWindow(c: HTMLCanvasElement, kind: 'jp' | 'kh', phase: DayPhase): void {
  const g = c.getContext('2d')!
  const W = c.width
  const H = c.height
  const [top, bottom] = SKY[phase]
  const grd = g.createLinearGradient(0, 0, 0, H)
  grd.addColorStop(0, top)
  grd.addColorStop(1, bottom)
  g.fillStyle = grd
  g.fillRect(0, 0, W, H)

  // 太陽・月・星
  if (phase === 'night') {
    g.fillStyle = 'rgba(255,255,255,0.85)'
    for (let i = 0; i < 40; i++) {
      const x = (i * 97) % W
      const y = (i * 53) % (H * 0.55)
      g.fillRect(x, y, 2, 2)
    }
    g.fillStyle = '#fff6c8'
    g.beginPath()
    g.arc(W * 0.8, H * 0.22, 26, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = top
    g.beginPath()
    g.arc(W * 0.8 + 12, H * 0.2, 24, 0, Math.PI * 2)
    g.fill()
  } else {
    g.fillStyle = phase === 'evening' ? '#ff8a5c' : phase === 'dawn' ? '#ffc38a' : '#fff3b0'
    g.beginPath()
    g.arc(W * 0.78, phase === 'day' ? H * 0.24 : H * 0.55, 34, 0, Math.PI * 2)
    g.fill()
    // 雲
    g.fillStyle = 'rgba(255,255,255,0.8)'
    for (const [x, y, s] of [
      [0.18, 0.2, 1],
      [0.45, 0.12, 0.7],
      [0.62, 0.3, 0.8],
    ] as const) {
      g.beginPath()
      g.ellipse(W * x, H * y, 46 * s, 16 * s, 0, 0, Math.PI * 2)
      g.ellipse(W * x + 26 * s, H * y - 10 * s, 30 * s, 16 * s, 0, 0, Math.PI * 2)
      g.fill()
    }
  }

  const far = phase === 'night' ? '#2a2f66' : phase === 'evening' ? '#8a6a9e' : '#9fb6d6'
  const near = phase === 'night' ? '#151a3c' : phase === 'evening' ? '#5e4b7c' : '#6f8fb8'
  const lit = phase === 'night' || phase === 'evening' ? '#ffd86b' : 'rgba(255,255,255,0.55)'

  if (kind === 'jp') {
    // 遠くのビル
    g.fillStyle = far
    let x = 0
    let i = 0
    while (x < W) {
      const w = 40 + ((i * 37) % 50)
      const h = 70 + ((i * 53) % 90)
      g.fillRect(x, H - h, w, h)
      x += w + 6
      i++
    }
    // 城の屋根（左）
    g.fillStyle = near
    const cx = W * 0.2
    const base = H - 60
    g.fillRect(cx - 60, base, 120, 60)
    for (let k = 0; k < 3; k++) {
      const w = 150 - k * 36
      const y = base - k * 34
      g.beginPath()
      g.moveTo(cx - w / 2 - 10, y)
      g.quadraticCurveTo(cx, y - 30, cx + w / 2 + 10, y)
      g.lineTo(cx + w / 2 - 14, y + 6)
      g.lineTo(cx - w / 2 + 14, y + 6)
      g.closePath()
      g.fill()
      g.fillRect(cx - w / 2 + 20, y, w - 40, 28)
    }
    // 格子の塔（右）
    g.fillStyle = near
    const tx = W * 0.62
    g.beginPath()
    g.moveTo(tx - 46, H)
    g.lineTo(tx - 14, H - 170)
    g.lineTo(tx + 14, H - 170)
    g.lineTo(tx + 46, H)
    g.closePath()
    g.fill()
    g.fillRect(tx - 24, H - 200, 48, 34)
    g.fillRect(tx - 4, H - 236, 8, 40)
    g.strokeStyle = top
    g.lineWidth = 2
    for (let k = 0; k < 6; k++) {
      const y = H - 20 - k * 26
      g.beginPath()
      g.moveTo(tx - 40 + k * 4, y)
      g.lineTo(tx + 40 - k * 4, y - 22)
      g.moveTo(tx + 40 - k * 4, y)
      g.lineTo(tx - 40 + k * 4, y - 22)
      g.stroke()
    }
    // 手前のビル
    g.fillStyle = near
    for (const [bx, bw, bh] of [
      [0.38, 70, 120],
      [0.46, 50, 90],
      [0.82, 80, 130],
      [0.92, 60, 100],
    ] as const) {
      g.fillRect(W * bx, H - bh, bw, bh)
      g.fillStyle = lit
      for (let wy = H - bh + 12; wy < H - 10; wy += 18) for (let wx = W * bx + 8; wx < W * bx + bw - 8; wx += 14) if ((wx * 7 + wy * 3) % 5 < 3) g.fillRect(wx, wy, 6, 8)
      g.fillStyle = near
    }
  } else {
    // ヤシの並木（遠景）
    g.fillStyle = far
    g.fillRect(0, H - 40, W, 40)
    // アンコールふうの塔（5 つ、中央が高い）
    g.fillStyle = near
    const cx = W * 0.42
    const towers: [number, number, number][] = [
      [-150, 120, 34],
      [-80, 150, 40],
      [0, 200, 52],
      [80, 150, 40],
      [150, 120, 34],
    ]
    g.fillRect(cx - 200, H - 50, 400, 50)
    for (const [dx, h, w] of towers) {
      const x = cx + dx
      g.beginPath()
      g.moveTo(x - w, H - 40)
      g.bezierCurveTo(x - w, H - h * 0.7, x - w * 0.5, H - h * 0.95, x, H - h - 20)
      g.bezierCurveTo(x + w * 0.5, H - h * 0.95, x + w, H - h * 0.7, x + w, H - 40)
      g.closePath()
      g.fill()
      g.strokeStyle = far
      g.lineWidth = 2
      for (let k = 1; k < 5; k++) {
        const y = H - 40 - k * (h / 5)
        const ww = w * (1 - k * 0.16)
        g.beginPath()
        g.moveTo(x - ww, y)
        g.lineTo(x + ww, y)
        g.stroke()
      }
    }
    // ヤシ（左右）
    for (const px of [W * 0.08, W * 0.85, W * 0.95]) {
      g.strokeStyle = near
      g.lineWidth = 7
      g.beginPath()
      g.moveTo(px, H)
      g.quadraticCurveTo(px + 10, H - 70, px + 4, H - 130)
      g.stroke()
      g.fillStyle = near
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2
        g.beginPath()
        g.ellipse(px + 4 + Math.cos(a) * 26, H - 132 + Math.sin(a) * 8, 30, 8, a, 0, Math.PI * 2)
        g.fill()
      }
    }
    if (phase === 'night' || phase === 'evening') {
      g.fillStyle = lit
      for (let k = 0; k < 18; k++) g.fillRect((k * 61) % W, H - 30 + ((k * 7) % 12), 4, 4)
    }
  }
}

// ------------------------------------------------------------------ 壁

export function shojiTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256)
  g.fillStyle = '#fbf6ea'
  g.fillRect(0, 0, 256, 256)
  g.strokeStyle = '#b98b5e'
  g.lineWidth = 6
  g.strokeRect(3, 3, 250, 250)
  g.lineWidth = 3
  for (let i = 1; i < 4; i++) {
    g.beginPath()
    g.moveTo((i * 256) / 4, 0)
    g.lineTo((i * 256) / 4, 256)
    g.stroke()
  }
  for (let i = 1; i < 5; i++) {
    g.beginPath()
    g.moveTo(0, (i * 256) / 5)
    g.lineTo(256, (i * 256) / 5)
    g.stroke()
  }
  return toTexture(c, [4, 1])
}

export function khmerWallTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256)
  g.fillStyle = '#fbe8cc'
  g.fillRect(0, 0, 256, 256)
  // 蓮の花びらの帯
  g.fillStyle = '#e9b27c'
  g.fillRect(0, 196, 256, 60)
  g.fillStyle = '#f7d8b0'
  for (let i = 0; i < 8; i++) {
    const x = i * 32 + 16
    g.beginPath()
    g.moveTo(x, 200)
    g.quadraticCurveTo(x + 16, 222, x, 250)
    g.quadraticCurveTo(x - 16, 222, x, 200)
    g.fill()
  }
  g.strokeStyle = 'rgba(200,130,80,0.35)'
  g.lineWidth = 2
  for (let y = 30; y < 180; y += 50)
    for (let x = 0; x < 256; x += 50) {
      g.beginPath()
      g.moveTo(x + 25, y - 14)
      g.lineTo(x + 39, y)
      g.lineTo(x + 25, y + 14)
      g.lineTo(x + 11, y)
      g.closePath()
      g.stroke()
    }
  return toTexture(c, [4, 1])
}

// ------------------------------------------------------------------ 看板・時計

export function signTexture(lines: { text: string; size: number; color: string; weight?: number }[], bg: string, fg = '#fff', w = 512, h = 192): THREE.CanvasTexture {
  const [c, g] = canvas(w, h)
  g.fillStyle = bg
  roundRect(g, 6, 6, w - 12, h - 12, 28)
  g.fill()
  g.strokeStyle = 'rgba(255,255,255,0.6)'
  g.lineWidth = 4
  roundRect(g, 16, 16, w - 32, h - 32, 20)
  g.stroke()
  const total = lines.reduce((s, l) => s + l.size * 1.15, 0)
  let y = h / 2 - total / 2
  g.textAlign = 'center'
  g.textBaseline = 'top'
  for (const l of lines) {
    g.fillStyle = l.color || fg
    g.font = `${l.weight ?? 700} ${l.size}px ${FONT}`
    g.fillText(l.text, w / 2, y)
    y += l.size * 1.15
  }
  return toTexture(c)
}

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
