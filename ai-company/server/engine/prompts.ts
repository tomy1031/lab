// プロンプトの共通部品（会社の前提・人物の書き方）
import type { Member } from '../../shared/types'
import type { MemberContext } from './types'

export const COMPANY_CONTEXT = `# 会社
株式会社ネクストメイク（NEXTMAKE Inc.）の「AIカンパニー」。人間の社員と、必要に応じて採用された AI社員が一緒に働く。
- ミッション：人、文化、技術をつなぎ、まだ見ぬ価値を社会へ届ける
- 拠点：日本（大阪本社・Asia/Tokyo）とカンボジア（プノンペン・Asia/Phnom_Penh、日本より2時間遅い）
- 事業の例：受託開発（Web・アプリ・システム）、カンボジアの IT 人材育成「Japanese IT Pathway」、NMClaw（会話を AI で業務データに）、観光DX「IDO」、Verify（文書検証）、Internship Lab
- 統括 AI は「ネクマックス」（日本の初号機）と、カンボジアの量産型ネクマックス
- 社内の言葉は日本語。カンボジアの人とはクメール語・英語も使う
- 事実が分からないことは推測で断定しない。分からない点は「要確認」と書く`

export function describeMember(m: Member): string {
  const kind = m.kind === 'human' ? '人間' : m.kind === 'agent' ? 'AI社員' : '統括AI'
  const office = m.office === 'jp' ? '日本' : 'カンボジア'
  return `- id=${m.id}｜${m.name}（${kind}・${office}・${m.role}）スキル：${m.skills.join('、') || 'なし'}｜言語：${m.languages.join('/')}`
}

export function describeContext(c: MemberContext, maxLines = 8): string {
  const lines = c.memories.slice(-maxLines)
  return lines.length ? lines.map((l) => `    ・${l}`).join('\n') : '    ・（まだ記録なし）'
}

export function personaPrompt(me: MemberContext): string {
  const m = me.member
  return `# あなた
あなたは ${m.name}。${m.office === 'jp' ? '大阪本社' : 'プノンペン オフィス'}の AI社員で、職種は「${m.role}」。
スキル：${m.skills.join('、')}／使える言語：${m.languages.join('・')}
人物設定：${m.persona ?? '誠実で手際のよい担当者'}

# あなたのこれまでの仕事の記憶（コンテキスト）
${describeContext(me, 12)}`
}

/** 出力の末尾から「記憶メモ」を取り出す */
export function splitMemory(text: string): { output: string; memoryNote: string } {
  const m = text.match(/\n?-{2,}\s*MEMORY\s*-{2,}\s*\n([\s\S]*)$/i) ?? text.match(/\n?#+\s*記憶メモ\s*\n([\s\S]*)$/)
  if (!m) return { output: text.trim(), memoryNote: '' }
  return { output: text.slice(0, m.index).trim(), memoryNote: m[1].trim().split('\n').slice(0, 4).join(' / ') }
}

/** テキストから最初の JSON オブジェクトを取り出す */
export function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fence ? fence[1] : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('JSON が見つかりません')
  return JSON.parse(body.slice(start, end + 1))
}
