// 会社の状態をまるごとメモリに持ち、JSON ファイル（data/state.json）へ間引いて保存する。
// 変化はすべて emit() で ServerEvent として流し、WebSocket で全員の画面に届ける。
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Activity, Goal, Member, MemoryEntry, Message, ServerEvent, StockItem, Task } from '../shared/types'

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
  settings: { engine?: 'claude' | 'sim' }
}

const MAX_MESSAGES = 2000
const MAX_ACTIVITIES = 1000

export function emptyState(): State {
  return { version: 1, members: [], users: [], sessions: [], goals: [], tasks: [], messages: [], activities: [], memory: [], stock: [], settings: {} }
}

export class Store extends EventEmitter {
  state: State
  private timer: NodeJS.Timeout | null = null

  constructor(readonly file: string) {
    super()
    this.state = emptyState()
    if (existsSync(file)) {
      try {
        this.state = { ...emptyState(), ...JSON.parse(readFileSync(file, 'utf8')) }
      } catch (e) {
        console.error('[store] state.json を読めませんでした。空の状態で始めます', e)
      }
    }
  }

  get isFresh(): boolean {
    return this.state.members.length === 0
  }

  emit(event: 'event', ev: ServerEvent): boolean
  emit(event: string, ...args: unknown[]): boolean {
    return super.emit(event, ...args)
  }

  send(ev: ServerEvent): void {
    this.emit('event', ev)
    this.save()
  }

  /** 書き込みをまとめる（0.4 秒に 1 回まで） */
  save(): void {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush()
    }, 400)
  }

  flush(): void {
    const s = this.state
    if (s.messages.length > MAX_MESSAGES) s.messages.splice(0, s.messages.length - MAX_MESSAGES)
    if (s.activities.length > MAX_ACTIVITIES) s.activities.splice(0, s.activities.length - MAX_ACTIVITIES)
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = this.file + '.tmp'
    // 本人（サーバーを動かすユーザー）だけが読み書きできるように
    writeFileSync(tmp, JSON.stringify(s, null, 1), { mode: 0o600 })
    renameSync(tmp, this.file)
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
}
