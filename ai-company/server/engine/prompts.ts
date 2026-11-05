// プロンプトの共通部品（会社の前提・人物の書き方）
import type { Member } from '../../shared/types'
import { normalizeOffice, officeInfo } from '../../shared/types'
import type { MemberContext, Plan, PlanInput } from './types'

export const COMPANY_CONTEXT = `# 会社
株式会社ネクストメイク（NEXTMAKE Inc.）の「AIカンパニー」。人間の社員と、必要に応じて採用された AI社員が一緒に働く。
- ミッション：人、文化、技術をつなぎ、まだ見ぬ価値を社会へ届ける
- 拠点：日本（大阪本社 = osaka・東京オフィス = tokyo、Asia/Tokyo）とカンボジア（プノンペンオフィス = phnompenh、Asia/Phnom_Penh、日本より2時間遅い）
- 代表は松井社長。統括 AI「ネクマックス」は大阪本社で社長の隣の席に座り、社長の分身として、社長の方針と過去の判断を踏まえて仕事を分け、配る
- 事業の例：受託開発（Web・アプリ・システム）、カンボジアの IT 人材育成「Japanese IT Pathway」、NMClaw（会話を AI で業務データに）、観光DX「IDO」、Verify（文書検証）、Internship Lab
- 統括 AI は「ネクマックス」（日本の初号機）と、カンボジアの量産型ネクマックス NX-086
- 社内の言葉は日本語。カンボジアの人とはクメール語・英語も使う
- 事実が分からないことは推測で断定しない。分からない点は「要確認」と書く`

export function describeMember(m: Member): string {
  const kind = m.kind === 'human' ? '人間' : m.kind === 'agent' ? 'AI社員' : '統括AI'
  const office = officeInfo(m.office).name
  return `- id=${m.id}｜${m.name}（${kind}・${office}[${m.office}]・${m.role}）スキル：${m.skills.join('、') || 'なし'}｜言語：${m.languages.join('/')}`
}

export function describeContext(c: MemberContext, maxLines = 8): string {
  const lines = c.memories.slice(-maxLines)
  return lines.length ? lines.map((l) => `    ・${l}`).join('\n') : '    ・（まだ記録なし）'
}

export function personaPrompt(me: MemberContext): string {
  const m = me.member
  return `# あなた
あなたは ${m.name}。${officeInfo(m.office).name}の AI社員で、職種は「${m.role}」。
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

/** ネクマックスがゴールを分解するときのプロンプト（Claude Code 版とアーティファクト版で共通）。context = 会社の前提 */
export function planPrompt({ goal, roster, requester, ceo }: PlanInput, context: string): string {
    const people = roster
      .filter((c) => c.member.kind !== 'nexmax')
      .map((c) => `${describeMember(c.member)}\n  これまでの仕事：\n${describeContext(c, 4)}`)
      .join('\n')
    return `${context}

# いまの社員（id を使って担当を決める）
${people || '（統括AI以外まだ誰もいない）'}

# 依頼者
${requester ? describeMember(requester) : '不明'}

# 社長（${ceo?.member.name ?? '代表'}）の方針・これまでの判断（あなたは社長の分身として、これに沿って判断する）
${ceo ? describeContext(ceo, 8) : '    ・（まだ記録なし）'}

# ゴール
タイトル：${goal.title}
内容：${goal.description || '（説明なし）'}

# やること
あなたは統括AI「ネクマックス」（社長の分身）。このゴールを、AI社員と人間が分担できるタスク（3〜8 個）に分解する。
- requiresHuman=true にするのは人間にしかできない仕事だけ：対面・現地での行動、電話や訪問での関係づくり、契約・署名・押印、支払いや発注の最終承認、法的責任を伴う判断、最終の意思決定、実物の確認。humanReason にその理由を書く。
- 人間のタスクの assignee は既存の人間の id（拠点・スキル・これまでの仕事で選ぶ。適任がいなければ依頼者の id）。assigneeReason に「なぜその人か」を書く（例：プノンペン在籍・学校との調整を担当してきた）。社長本人には、社長にしかできない最終判断だけを回す。
- AI のタスク（調査・企画・文章・翻訳・設計・コード・資料作り・分析など）は、合う AI社員がいればその id、いなければ hires に採用を提案し、assignee にその hires の key を書く。採用は最小限（同じ職種を重複して採用しない。既存の AI社員で足りるなら採用しない）。
- 採用する AI社員：role（職種名）、name（カタカナの短い愛称。カンボジア拠点ならクメール風の名前）、office、skills、languages（ja/km/en）、persona（性格と仕事の流儀を 1〜2 文）、reason（採用理由）。
- 拠点（office）は osaka / tokyo / phnompenh。カンボジアに関わる現地の仕事・クメール語の仕事は phnompenh、東京での対面の仕事は tokyo。
- dependsOn には先に終わるべきタスクの key を書く。最後のタスクは「成果のまとめ・最終確認」にする（人間の承認が要るなら人間）。
- description は担当者がそのまま着手できるよう、成果物の形（例：Markdown の資料 1 枚）まで具体的に。AI社員が作れるのはテキストのファイル（Markdown・HTML・CSV・JSON・コード）だけ。PDF・画像・動画は作れないので、必要なら「印刷用の HTML」などにする。`
}

export function normalizePlan(raw: Plan): Plan {
  const tasks = (raw.tasks ?? []).filter((t) => t && t.key && t.title)
  const keys = new Set(tasks.map((t) => t.key))
  return {
    summary: String(raw.summary ?? ''),
    hires: (raw.hires ?? []).filter((h) => h && h.key && h.role).map((h) => ({
      ...h,
      office: normalizeOffice(h.office),
      skills: h.skills ?? [],
      languages: h.languages?.length ? h.languages : ['ja'],
      persona: h.persona ?? '',
      reason: h.reason ?? '',
    })),
    tasks: tasks.map((t) => ({
      ...t,
      skills: t.skills ?? [],
      requiresHuman: !!t.requiresHuman,
      office: t.office ? normalizeOffice(t.office) : undefined,
      dependsOn: (t.dependsOn ?? []).filter((d) => keys.has(d) && d !== t.key),
    })),
  }
}
