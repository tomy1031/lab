// 会社の状態をまるごとメモリに持ち、変化はすべて ServerEvent として流す（Node でもブラウザでも動く）。
// 保存のしかたは継承先が決める：server/store.ts（JSON ファイル）・client/src/artifact/dbStore.ts（アーティファクトのデータベース）
import type { Activity, GateSettings, Goal, Member, MemoryEntry, Message, ServerEvent, StockItem, Task } from '../shared/types'
import { DEFAULT_GATE } from '../shared/types'

export interface UserRecord {
  login: string
  memberId: string
  salt: string
  hash: string
}

export interface SessionRecord {
  /** セッションの鍵の SHA-256（鍵そのものは保存しない） */
  tokenHash: string
  memberId: string
  createdAt: string
  lastSeen: string
}

export interface State {
  version: 1
  members: Member[]
  users: UserRecord[]
  sessions: SessionRecord[]
  goals: Goal[]
  tasks: Task[]
  messages: Message[]
  activities: Activity[]
  memory: MemoryEntry[]
  stock: StockItem[]
  settings: { engine?: 'claude' | 'sim'; gate?: Partial<GateSettings> }
}

export const MAX_MESSAGES = 2000
export const MAX_ACTIVITIES = 1000

export function emptyState(): State {
  return { version: 1, members: [], users: [], sessions: [], goals: [], tasks: [], messages: [], activities: [], memory: [], stock: [], settings: {} }
}

type Listener = (ev: ServerEvent) => void

export class CoreStore {
  state: State = emptyState()
  private listeners = new Set<Listener>()

  get isFresh(): boolean {
    return this.state.members.length === 0
  }

  on(_event: 'event', fn: Listener): this {
    this.listeners.add(fn)
    return this
  }

  off(_event: 'event', fn: Listener): this {
    this.listeners.delete(fn)
    return this
  }

  emit(_event: 'event', ev: ServerEvent): boolean {
    for (const fn of this.listeners) fn(ev)
    return this.listeners.size > 0
  }

  send(ev: ServerEvent): void {
    this.emit('event', ev)
    this.save(ev)
  }

  /** 変化を保存する（継承先で書く）。ev は何が変わったか */
  save(_ev?: ServerEvent): void {}

  /** すぐに保存する（継承先で書く） */
  flush(): void {}

  /** 古いやり取り・動きを捨てる */
  protected trim(): void {
    const s = this.state
    if (s.messages.length > MAX_MESSAGES) s.messages.splice(0, s.messages.length - MAX_MESSAGES)
    if (s.activities.length > MAX_ACTIVITIES) s.activities.splice(0, s.activities.length - MAX_ACTIVITIES)
  }

  // ------------------------------------------------------------ 参照

  member(id: string | null | undefined): Member | undefined {
    return id ? this.state.members.find((m) => m.id === id) : undefined
  }
  goal(id: string): Goal | undefined {
    return this.state.goals.find((g) => g.id === id)
  }
  task(id: string): Task | undefined {
    return this.state.tasks.find((t) => t.id === id)
  }
  tasksOf(goalId: string): Task[] {
    return this.state.tasks.filter((t) => t.goalId === goalId).sort((a, b) => a.order - b.order)
  }
  memoryOf(memberId: string): MemoryEntry[] {
    return this.state.memory.filter((m) => m.memberId === memberId)
  }
  /** 承認の関所の設定（足りない所は既定値） */
  gate(): GateSettings {
    return { ...DEFAULT_GATE, ...this.state.settings.gate }
  }

  // ------------------------------------------------------------ 更新（必ずイベントを出す）

  putMember(m: Member): Member {
    const i = this.state.members.findIndex((x) => x.id === m.id)
    if (i >= 0) this.state.members[i] = m
    else this.state.members.push(m)
    this.send({ t: 'member', member: m })
    return m
  }

  patchMember(id: string, patch: Partial<Member>): Member | undefined {
    const m = this.member(id)
    if (!m) return undefined
    Object.assign(m, patch)
    this.send({ t: 'member', member: m })
    return m
  }

  removeMember(id: string): void {
    this.state.members = this.state.members.filter((m) => m.id !== id)
    this.send({ t: 'member.removed', id })
  }

  putGoal(g: Goal): Goal {
    const i = this.state.goals.findIndex((x) => x.id === g.id)
    if (i >= 0) this.state.goals[i] = g
    else this.state.goals.push(g)
    this.send({ t: 'goal', goal: g })
    return g
  }

  patchGoal(id: string, patch: Partial<Goal>): Goal | undefined {
    const g = this.goal(id)
    if (!g) return undefined
    Object.assign(g, patch)
    this.send({ t: 'goal', goal: g })
    return g
  }

  putTask(t: Task): Task {
    const i = this.state.tasks.findIndex((x) => x.id === t.id)
    if (i >= 0) this.state.tasks[i] = t
    else this.state.tasks.push(t)
    this.send({ t: 'task', task: t })
    return t
  }

  patchTask(id: string, patch: Partial<Task>): Task | undefined {
    const t = this.task(id)
    if (!t) return undefined
    Object.assign(t, patch)
    this.send({ t: 'task', task: t })
    return t
  }

  addMessage(m: Message): Message {
    this.state.messages.push(m)
    for (const id of [m.fromId, m.toId]) {
      const mem = this.member(id)
      if (mem) mem.stats.messages++
    }
    this.send({ t: 'message', message: m })
    return m
  }

  /** 承認の状態などを書き換える（同じ id のメッセージを差し替えて、もう一度流す） */
  patchMessage(id: string, patch: Partial<Message>): Message | undefined {
    const m = this.state.messages.find((x) => x.id === id)
    if (!m) return undefined
    Object.assign(m, patch)
    this.send({ t: 'message', message: m })
    return m
  }

  addActivity(a: Activity): Activity {
    this.state.activities.push(a)
    this.send({ t: 'activity', activity: a })
    return a
  }

  putStock(item: StockItem): StockItem {
    const i = this.state.stock.findIndex((x) => x.id === item.id)
    if (i >= 0) this.state.stock[i] = item
    else this.state.stock.push(item)
    if (this.state.stock.length > 3000) this.state.stock.splice(0, this.state.stock.length - 3000)
    this.send({ t: 'stock', item })
    return item
  }

  stockOf(owner: string): StockItem[] {
    return this.state.stock.filter((s) => s.owner === owner)
  }

  addMemory(e: MemoryEntry): MemoryEntry {
    this.state.memory.push(e)
    this.send({ t: 'memory', entry: e })
    return e
  }

  setGate(patch: Partial<GateSettings>): GateSettings {
    this.state.settings.gate = { ...this.gate(), ...patch }
    this.save()
    return this.gate()
  }
}
