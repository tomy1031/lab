// キャラクターの絵（client/public/sprites/）を、社員ごとに割り当てる。3D の板と画面のアイコンが同じ規則を使う。
// 絵は codex（OpenAI の画像生成）で docs/img/design_reference.jpg の画風に合わせて作ったスプライトシートを、
// scripts/slice_sprites.py で 1 体ずつ切り出したもの：
//   jp-0..3（日本の社員：0 = スーツの男性〔社長〕、1 = ボブの女性、2 = 眼鏡の男性、3 = ポニーテールの女性）
//   kh-0..3（カンボジアの社員：0 = ネクタイの男性、1 = 長い髪の女性、2 = ポロシャツの男性、3 = おだんごの女性）
//   robot-0..3（AI社員：耳と胸の色が 0 水色・1 ミント・2 ピンク・3 黄色）
// ポーズは stand / walk / sit。ネクマックスは 3D モデルのまま（スプライトなし）。
import { asset } from './brand'
import type { Member } from '../../shared/types'
import { countryOf } from '../../shared/types'

export type SpritePose = 'stand' | 'walk' | 'sit'

export interface SpriteMeta {
  w: number
  h: number
  /** 足元の高さ（上からの割合） */
  footY: number
  /** 体の中心（左からの割合） */
  cx: number
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const ROBOT_HUES = [205, 150, 350, 48] // 水色・ミント・ピンク・黄色

function hueOf(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return 0
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return 0
  const d = max - min
  const hh = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (hh * 60 + 360) % 360
}

/** その社員の絵の名前（例 'jp-2'）。ネクマックスは null */
export function spriteIdFor(m: Pick<Member, 'id' | 'kind' | 'office' | 'role' | 'look' | 'name'>): string | null {
  if (m.kind === 'nexmax') return null
  if (m.kind === 'agent') {
    // 職種の色（体の色）にいちばん近い耳の色のロボット
    const hue = hueOf(m.look.accent || m.look.body)
    let best = 0
    let bestD = 999
    ROBOT_HUES.forEach((x, i) => {
      const d = Math.min(Math.abs(x - hue), 360 - Math.abs(x - hue))
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    return `robot-${best}`
  }
  const country = countryOf(m.office)
  if (country === 'jp' && /社長|代表|CEO/i.test(m.role)) return 'jp-0'
  const h = hash(m.id + m.name)
  // 日本の 0 番（スーツの男性）は社長用。ほかの人は 1..3
  return country === 'jp' ? `jp-${1 + (h % 3)}` : `kh-${h % 4}`
}

export function spriteUrl(id: string, pose: SpritePose): string {
  return asset(`sprites/${id}-${pose}.webp`)
}

export function faceUrl(id: string): string {
  return asset(`sprites/faces/${id}.webp`)
}

let meta: Promise<Record<string, SpriteMeta>> | null = null
export function spriteMeta(): Promise<Record<string, SpriteMeta>> {
  meta ??= fetch(asset('sprites/sprites.json'))
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
  return meta
}
