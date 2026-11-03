import { randomBytes } from 'node:crypto'
import type { Look, OfficeId } from '../shared/types'

export const now = (): string => new Date().toISOString()
export const id = (prefix: string): string => `${prefix}_${Date.now().toString(36)}${randomBytes(3).toString('hex')}`

export function pick<T>(arr: readonly T[], seed?: number): T {
  const i = seed === undefined ? Math.floor(Math.random() * arr.length) : Math.abs(Math.floor(seed)) % arr.length
  return arr[i]
}

export function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

// ------------------------------------------------------------------ 見た目

/** 職種の系統ごとの服・ボディの色（パステル） */
const ROLE_PALETTES: { match: RegExp; body: string; accent: string }[] = [
  { match: /調査|リサーチ|分析|research|analy/i, body: '#8ecae6', accent: '#ffb703' },
  { match: /開発|エンジニア|プログラ|engineer|develop|code|IT/i, body: '#90be6d', accent: '#277da1' },
  { match: /デザイン|design|UI|動画|映像|クリエイ/i, body: '#f4a7c3', accent: '#7b2cbf' },
  { match: /営業|セールス|sales|商談|顧客/i, body: '#f9c74f', accent: '#f3722c' },
  { match: /翻訳|通訳|クメール|translat|語/i, body: '#b8a1e8', accent: '#43aa8b' },
  { match: /広報|マーケ|PR|SNS|market|広告|ライター|writer|文章|コピー/i, body: '#ff9f80', accent: '#4361ee' },
  { match: /経理|会計|財務|finance|account|予算/i, body: '#a3c4bc', accent: '#e76f51' },
  { match: /人事|採用|教育|研修|HR|recruit/i, body: '#ffd6a5', accent: '#e5989b' },
  { match: /法務|契約|legal|コンプラ/i, body: '#9fb3c8', accent: '#d62828' },
  { match: /PM|プロジェクト|管理|企画|plan|ディレクター|秘書/i, body: '#bde0fe', accent: '#fb8500' },
]

export function lookForAgent(role: string, seed: number): Look {
  const p = ROLE_PALETTES.find((x) => x.match.test(role)) ?? { body: pick(['#cdb4db', '#a0c4ff', '#caffbf', '#ffc6ff'], seed), accent: '#ff7b9c' }
  return {
    body: p.body,
    accent: p.accent,
    style: seed % 8,
    accessory: pick(['none', 'headset', 'bowtie', 'glasses', 'none', 'ribbon'] as const, seed >> 3),
  }
}

const SKINS = ['#ffe0c7', '#f6d0b1', '#eab68f', '#c98e66', '#a86f4c']
const HAIRS = ['#2b2b2b', '#4a3426', '#6b4423', '#1f2a44', '#8c5a3c', '#d9a066', '#3d3d3d']
const CLOTHES = ['#5b8def', '#ef6f6c', '#56c596', '#f2b134', '#9b7ede', '#4fb3bf', '#f08bb6']

export function lookForHuman(name: string, office: OfficeId): Look {
  const h = hashStr(name)
  return {
    body: pick(CLOTHES, h),
    accent: pick(['#ffffff', '#ffd166', '#06d6a0', '#ef476f'], h >> 4),
    hair: pick(HAIRS, h >> 7),
    skin: office === 'kh' ? pick(SKINS.slice(1), h >> 10) : pick(SKINS.slice(0, 3), h >> 10),
    style: (h >> 13) % 8,
    accessory: pick(['none', 'glasses', 'none', 'cap', 'flower', 'none', 'beret'] as const, h >> 16),
  }
}

// ------------------------------------------------------------------ AI社員の名前

const JP_AGENT_NAMES = ['アイ', 'ルミ', 'ソラ', 'ハル', 'ミライ', 'コトハ', 'ユメ', 'ツムギ', 'ヒカリ', 'カナデ', 'リコ', 'ナギ', 'イロハ', 'シズク', 'アオイ', 'モモ']
const KH_AGENT_NAMES = ['ダラ', 'ソピア', 'リナ', 'ボパ', 'チャンティ', 'ヴィチェア', 'スレイ', 'ピセイ', 'ナリー', 'ソカー', 'ラタナ', 'メアリー']

export function agentName(office: OfficeId, taken: Set<string>): string {
  const pool = office === 'kh' ? KH_AGENT_NAMES : JP_AGENT_NAMES
  for (const n of pool) if (!taken.has(n)) return n
  let i = 2
  for (;;) {
    for (const n of pool) {
      const c = `${n}${i}`
      if (!taken.has(c)) return c
    }
    i++
  }
}
