// 画面・看板のテクスチャ：拠点の看板（国旗＋名前）、奥の壁のモニター（その拠点の「いま」）、地球儀の格子。
import * as THREE from 'three'
import type { OfficeInfo } from '../../../shared/types'
import type { OfficeBoard } from './api'
import { FONT, canvas, toTexture } from './textures'

type G = CanvasRenderingContext2D

function rr(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

export function drawFlag(g: G, country: 'jp' | 'kh', x: number, y: number, w: number, h: number): void {
  g.save()
  rr(g, x, y, w, h, 6)
  g.clip()
  if (country === 'jp') {
    g.fillStyle = '#ffffff'
    g.fillRect(x, y, w, h)
    g.fillStyle = '#e0303c'
    g.beginPath()
    g.arc(x + w / 2, y + h / 2, h * 0.3, 0, Math.PI * 2)
    g.fill()
  } else {
    g.fillStyle = '#1f3f9a'
    g.fillRect(x, y, w, h)
    g.fillStyle = '#e0303c'
    g.fillRect(x, y + h * 0.25, w, h * 0.5)
    // 白い寺院（国旗の意匠を簡略に）
    g.fillStyle = '#ffffff'
    const cx = x + w / 2
    const by = y + h * 0.68
    g.fillRect(cx - w * 0.22, by - h * 0.06, w * 0.44, h * 0.06)
    for (const [dx, hh] of [
      [-0.16, 0.2],
      [0, 0.3],
      [0.16, 0.2],
    ]) {
      g.beginPath()
      g.moveTo(cx + (dx - 0.05) * w, by - h * 0.06)
      g.lineTo(cx + dx * w, by - h * (0.06 + hh))
      g.lineTo(cx + (dx + 0.05) * w, by - h * 0.06)
      g.closePath()
      g.fill()
    }
  }
  g.restore()
  g.strokeStyle = 'rgba(0,0,0,0.12)'
  g.lineWidth = 2
  rr(g, x, y, w, h, 6)
  g.stroke()
}

/** 拠点の看板（青い帯に国旗・名前・英語名）。参考デザインの斜めの帯 */
export function bannerTexture(info: OfficeInfo): THREE.CanvasTexture {
  const [c, g] = canvas(900, 220)
  const grd = g.createLinearGradient(0, 0, 900, 0)
  grd.addColorStop(0, '#1f5fbf')
  grd.addColorStop(1, '#3d8ff0')
  g.fillStyle = grd
  g.beginPath()
  g.moveTo(40, 30)
  g.lineTo(880, 30)
  g.lineTo(840, 190)
  g.lineTo(0, 190)
  g.closePath()
  g.fill()
  g.strokeStyle = 'rgba(255,255,255,0.55)'
  g.lineWidth = 5
  g.stroke()
  drawFlag(g, info.country, 60, 62, 132, 92)
  g.fillStyle = '#ffffff'
  g.textBaseline = 'alphabetic'
  let size = 76
  g.font = `800 ${size}px ${FONT}`
  while (size > 40 && g.measureText(info.name).width > 600) {
    size -= 4
    g.font = `800 ${size}px ${FONT}`
  }
  g.fillText(info.name, 222, 124)
  g.font = `600 34px ${FONT}`
  g.fillStyle = '#d7e8ff'
  g.fillText(info.nameEn, 226, 170)
  return toTexture(c)
}

/** 奥の壁のモニター（3 面つなぎ）を描く。board が無いときは「待機中」の画面 */
export function paintBoard(c: HTMLCanvasElement, info: OfficeInfo, board: OfficeBoard | null, accent: string): void {
  const g = c.getContext('2d')!
  const Wd = c.width
  const Ht = c.height
  g.clearRect(0, 0, Wd, Ht)
  const panelW = Wd / 3
  for (let i = 0; i < 3; i++) {
    const x = i * panelW + 6
    const grd = g.createLinearGradient(0, 0, 0, Ht)
    grd.addColorStop(0, '#13284f')
    grd.addColorStop(1, '#0c1a36')
    g.fillStyle = grd
    rr(g, x, 6, panelW - 12, Ht - 12, 14)
    g.fill()
    g.strokeStyle = 'rgba(120,200,255,0.35)'
    g.lineWidth = 3
    g.stroke()
  }
  const pad = 26
  // 左：見出し・進捗
  g.fillStyle = '#7fd4ff'
  g.font = `700 26px ${FONT}`
  g.textBaseline = 'top'
  g.fillText(`${info.name}  LIVE`, pad, 24)
  g.fillStyle = '#ffffff'
  g.font = `800 34px ${FONT}`
  const head = board?.headline ?? '待機中'
  wrapText(g, head, pad, 64, panelW - pad * 2, 40, 2)
  const p = Math.max(0, Math.min(1, board?.progress ?? 0))
  // 円の進捗
  const cx = panelW / 2
  const cy = Ht - 110
  g.lineWidth = 18
  g.strokeStyle = 'rgba(255,255,255,0.12)'
  g.beginPath()
  g.arc(cx, cy, 70, 0, Math.PI * 2)
  g.stroke()
  const arcGrd = g.createLinearGradient(cx - 70, 0, cx + 70, 0)
  arcGrd.addColorStop(0, '#3ee0ff')
  arcGrd.addColorStop(1, accent)
  g.strokeStyle = arcGrd
  g.lineCap = 'round'
  g.beginPath()
  g.arc(cx, cy, 70, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, p))
  g.stroke()
  g.lineCap = 'butt'
  g.fillStyle = '#ffffff'
  g.font = `800 44px ${FONT}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(`${Math.round(p * 100)}%`, cx, cy)
  g.textAlign = 'left'

  // 中・右：行（最大 8 行を 2 面に）
  const rows = board?.rows ?? []
  const TONE: Record<string, string> = { ai: '#54a0ff', human: '#ff9f43', done: '#1dd1a1', warn: '#ff6b6b' }
  const perPanel = 4
  for (let i = 0; i < Math.min(rows.length, perPanel * 2); i++) {
    const r = rows[i]
    const px = panelW * (1 + Math.floor(i / perPanel)) + pad
    const py = 30 + (i % perPanel) * ((Ht - 60) / perPanel)
    const rowH = (Ht - 60) / perPanel - 12
    g.fillStyle = 'rgba(255,255,255,0.06)'
    rr(g, px - 10, py - 6, panelW - pad * 2 + 20, rowH, 10)
    g.fill()
    g.fillStyle = TONE[r.tone ?? 'ai'] ?? '#54a0ff'
    rr(g, px - 10, py - 6, 8, rowH, 4)
    g.fill()
    g.fillStyle = '#e8f3ff'
    g.font = `700 24px ${FONT}`
    g.textBaseline = 'top'
    g.fillText(clipText(g, r.label, panelW - pad * 2 - 10), px + 6, py + 2)
    g.fillStyle = TONE[r.tone ?? 'ai'] ?? '#9fd6ff'
    g.font = `600 21px ${FONT}`
    g.fillText(clipText(g, r.value, panelW - pad * 2 - 10), px + 6, py + 34)
  }
  if (!rows.length) {
    // 待機中の飾り（グラフ）
    for (let k = 0; k < 2; k++) {
      const x0 = panelW * (1 + k) + pad
      g.strokeStyle = k ? '#1dd1a1' : '#54a0ff'
      g.lineWidth = 4
      g.beginPath()
      for (let i = 0; i <= 12; i++) {
        const x = x0 + (i / 12) * (panelW - pad * 2)
        const y = Ht * 0.62 - Math.sin(i * 0.9 + k * 2) * 40 - i * 4
        if (i === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
      g.fillStyle = 'rgba(127,212,255,0.6)'
      for (let i = 0; i < 6; i++) g.fillRect(x0 + i * 46, Ht - 70 - ((i * 37 + k * 50) % 90), 30, 50 + ((i * 37 + k * 50) % 90))
    }
  }
}

function clipText(g: G, s: string, max: number): string {
  if (g.measureText(s).width <= max) return s
  let t = s
  while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1)
  return t + '…'
}

function wrapText(g: G, s: string, x: number, y: number, max: number, lh: number, lines: number): void {
  let line = ''
  let n = 0
  for (const ch of s) {
    if (g.measureText(line + ch).width > max) {
      n++
      if (n >= lines) {
        g.fillText(clipText(g, line + ch + '…', max), x, y)
        return
      }
      g.fillText(line, x, y)
      y += lh
      line = ch
    } else line += ch
  }
  if (line) g.fillText(line, x, y)
}

/** 地球儀の表面（経線・緯線と、ところどころの光の点） */
export function globeTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 512)
  g.fillStyle = 'rgba(80,170,255,0.18)'
  g.fillRect(0, 0, 1024, 512)
  g.strokeStyle = 'rgba(160,230,255,0.9)'
  g.lineWidth = 2
  for (let i = 0; i <= 24; i++) {
    const x = (i / 24) * 1024
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, 512)
    g.stroke()
  }
  for (let j = 1; j < 12; j++) {
    const y = (j / 12) * 512
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(1024, y)
    g.stroke()
  }
  // 大陸っぽい点のかたまり（簡略）
  const blobs: [number, number, number, number][] = [
    [770, 170, 90, 60], // アジア
    [820, 230, 30, 40], // 日本のあたり
    [745, 260, 30, 30], // インドシナ
    [560, 160, 70, 60], // ヨーロッパ・アフリカ
    [560, 280, 50, 80],
    [250, 160, 90, 70], // アメリカ
    [300, 320, 50, 80],
    [880, 360, 50, 30], // オーストラリア
  ]
  g.fillStyle = 'rgba(220,250,255,0.95)'
  let seed = 7
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (const [bx, by, bw, bh] of blobs) {
    for (let k = 0; k < 140; k++) {
      const a = r() * Math.PI * 2
      const d = Math.sqrt(r())
      g.beginPath()
      g.arc(bx + Math.cos(a) * bw * d, by + Math.sin(a) * bh * d, 3, 0, Math.PI * 2)
      g.fill()
    }
  }
  const t = toTexture(c)
  t.wrapS = THREE.RepeatWrapping
  return t
}
