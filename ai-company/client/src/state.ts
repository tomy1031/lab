// 画面側の状態：サーバーのスナップショット＋WebSocket のイベントで更新し、購読者へ知らせる
import type { Activity, Goal, Member, Message, ServerEvent, Snapshot, StockItem, Task } from '../../shared/types'

export type Change =
  | { kind: 'all' }
  | { kind: 'member'; member: Member }
  | { kind: 'removed'; id: string }
  | { kind: 'hired'; member: Member; reason: string }
  | { kind: 'goal'; goal: Goal }
  | { kind: 'task'; task: Task; prev?: Task }
  | { kind: 'message'; message: Message; updated?: boolean }
  | { kind: 'gate' }
  | { kind: 'engine' }
  | { kind: 'activity'; activity: Activity }
  | { kind: 'memory'; memberId: string }
  | { kind: 'stream'; memberId: string; taskId: string; text: string }
  | { kind: 'stock'; item: StockItem; prev?: StockItem }

export class AppState {
  snap: Snapshot | null = null
  streams = new Map<string, string>()
  private subs = new Set<(c: Change) => void>()

  on(fn: (c: Change) => void): () => void {
    this.subs.add(fn)
    return () => this.subs.delete(fn)
  }

  private fire(c: Change): void {
    for (const f of this.subs) f(c)
  }

  get me(): Member | null {
    return this.snap?.me ? (this.member(this.snap.me.id) ?? this.snap.me) : null
  }

  member(id: string | null | undefined): Member | undefined {
    return id ? this.snap?.members.find((m) => m.id === id) : undefined
  }

  tasksOf(goalId: string): Task[] {
    return (this.snap?.tasks ?? []).filter((t) => t.goalId === goalId).sort((a, b) => a.order - b.order)
  }

  apply(ev: ServerEvent): void {
    if (ev.t === 'snapshot') {
      this.snap = ev.data
      this.fire({ kind: 'all' })
      return
    }
    const s = this.snap
    if (!s) return
    switch (ev.t) {
      case 'member': {
        upsert(s.members, ev.member)
        this.fire({ kind: 'member', member: ev.member })
        break
      }
      case 'member.removed':
        s.members = s.members.filter((m) => m.id !== ev.id)
        this.fire({ kind: 'removed', id: ev.id })
        break
      case 'hired':
        upsert(s.members, ev.member)
        this.fire({ kind: 'hired', member: ev.member, reason: ev.reason })
        break
      case 'goal':
        upsert(s.goals, ev.goal)
        this.fire({ kind: 'goal', goal: ev.goal })
        break
      case 'task': {
        const prev = s.tasks.find((t) => t.id === ev.task.id)
        const copy = prev ? { ...prev } : undefined
        upsert(s.tasks, ev.task)
        if (ev.task.status !== 'in_progress') this.streams.delete(ev.task.id)
        this.fire({ kind: 'task', task: ev.task, prev: copy })
        break
      }
      case 'message': {
        // 同じ id はあとから書き換わったもの（承認の状態など）：差し替える
        const i = s.messages.findIndex((m) => m.id === ev.message.id)
        if (i >= 0) {
          s.messages[i] = ev.message
          this.fire({ kind: 'message', message: ev.message, updated: true })
          break
        }
        s.messages.push(ev.message)
        if (s.messages.length > 400) s.messages.splice(0, s.messages.length - 400)
        this.fire({ kind: 'message', message: ev.message })
        break
      }
      case 'gate':
        s.gate = ev.gate
        this.fire({ kind: 'gate' })
        break
      case 'engine':
        s.engine = ev.engine
        this.fire({ kind: 'engine' })
        break
      case 'activity':
        s.activities.push(ev.activity)
        if (s.activities.length > 400) s.activities.splice(0, s.activities.length - 400)
        this.fire({ kind: 'activity', activity: ev.activity })
        break
      case 'memory':
        this.fire({ kind: 'memory', memberId: ev.entry.memberId })
        break
      case 'stock': {
        const list = (s.stock ??= [])
        const prev = list.find((x) => x.id === ev.item.id)
        upsert(list, ev.item)
        this.fire({ kind: 'stock', item: ev.item, prev: prev ? { ...prev } : undefined })
        break
      }
      case 'stream':
        this.streams.set(ev.taskId, ev.text)
        this.fire({ kind: 'stream', memberId: ev.memberId, taskId: ev.taskId, text: ev.text })
        break
    }
  }
}

function upsert<T extends { id: string }>(arr: T[], item: T): void {
  const i = arr.findIndex((x) => x.id === item.id)
  if (i >= 0) arr[i] = item
  else arr.push(item)
}
