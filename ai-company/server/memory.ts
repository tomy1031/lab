// 人物ごとのコンテキスト（記憶）。Generative Agents の「記憶の流れ」にならい、
// 新しさ（時間で薄れる）と重要度（1..10）を足した点数で、プロンプトに入れる記憶を選ぶ。
import type { Member, MemoryEntry, MemoryKind } from '../shared/types'
import type { MemberContext } from './engine/types'
import type { CoreStore as Store } from './coreStore'
import { id, now } from './util'

const HALF_LIFE_H = 72

export function score(e: MemoryEntry, at = Date.now()): number {
  const ageH = (at - Date.parse(e.at)) / 3_600_000
  const recency = Math.pow(0.5, ageH / HALF_LIFE_H)
  return e.importance / 10 + recency
}

export function contextOf(store: Store, member: Member, limit = 12): MemberContext {
  const all = store.memoryOf(member.id)
  const top = [...all].sort((a, b) => score(b) - score(a)).slice(0, limit)
  top.sort((a, b) => a.at.localeCompare(b.at))
  const fmt = (e: MemoryEntry) => {
    const d = new Date(e.at)
    return `[${d.getMonth() + 1}/${d.getDate()}] ${e.text}`
  }
  return { member, memories: top.map(fmt) }
}

export function remember(
  store: Store,
  memberId: string,
  kind: MemoryKind,
  text: string,
  opts: { importance?: number; goalId?: string; taskId?: string } = {},
): MemoryEntry {
  return store.addMemory({
    id: id('mem'),
    memberId,
    at: now(),
    kind,
    text: text.trim().slice(0, 600),
    importance: opts.importance ?? 5,
    goalId: opts.goalId,
    taskId: opts.taskId,
  })
}
