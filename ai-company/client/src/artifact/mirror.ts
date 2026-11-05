// アーティファクトのデータベースを見張り、画面に「サーバーからの知らせ」（ServerEvent）と同じ形で届ける。
// 誰のページでも動く。承認する人のページでは、会社を動かす係（runner.ts）に人間の文書・依頼箱も渡す。
import type { Activity, GateInfo, Goal, Member, MemoryEntry, Message, ServerEvent, Snapshot, StockItem, Task } from '../../../shared/types'
import { DEFAULT_GATE, OFFICES } from '../../../shared/types'
import { COL, INBOX_DONE, SETTINGS, type InboxItem } from './paths'
import type { DocSnap, QuerySnap, Runtime, Unsubscribe } from './runtime'

export interface MirrorOptions {
  /** 承認する人のページ：記憶と全員の依頼箱も読む */
  owner: boolean
}

type Settings = { gate?: Partial<GateInfo>; ownerId?: string }

export class Mirror {
  members = new Map<string, Member>()
  goals = new Map<string, Goal>()
  tasks = new Map<string, Task>()
  msgs = new Map<string, Message>()
  acts = new Map<string, Activity>()
  memory = new Map<string, MemoryEntry>()
  stock = new Map<string, StockItem>()
  settings: Settings = {}
  /** 自分の依頼箱（まだ届いていない依頼） */
  myInbox: InboxItem[] = []
  inboxDone = new Map<string, string>()
  /** 全員の依頼箱（承認する人のページだけ）：利用者 id → 依頼 */
  allInbox = new Map<string, InboxItem[]>()
  /** いまページを開いている人（利用者 id） */
  online = new Set<string>()
  runnerOnline = false
  ready: Promise<void>

  private listeners = new Set<(ev: ServerEvent) => void>()
  private unsubs: Unsubscribe[] = []
  private isReady = false
  private onHumans: ((humans: Member[]) => void) | null = null
  private onInbox: (() => void) | null = null

  constructor(
    private readonly rt: Runtime,
    readonly uid: string,
    private readonly opts: MirrorOptions,
  ) {
    let resolve!: () => void
    this.ready = new Promise((r) => (resolve = r))
    this.start(resolve)
  }

  on(fn: (ev: ServerEvent) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private send(ev: ServerEvent): void {
    if (!this.isReady) return
    for (const fn of this.listeners) fn(ev)
  }

  /** 会社を動かす係へ：人間の文書が変わった・依頼箱が変わった */
  attachRunner(onHumans: (humans: Member[]) => void, onInbox: () => void): void {
    this.onHumans = onHumans
    this.onInbox = onInbox
  }

  get ownerId(): string | undefined {
    return this.settings.ownerId
  }

  // ------------------------------------------------------------------ 見張り

  private start(resolve: () => void): void {
    const db = this.rt.db!
    const pending = new Set<string>()
    const done = (key: string) => {
      pending.delete(key)
      if (!pending.size && !this.isReady) {
        this.isReady = true
        resolve()
      }
    }
    const watch = <T extends { id: string }>(key: string, query: ReturnType<typeof db.collection> | ReturnType<ReturnType<typeof db.collection>['orderBy']>, map: Map<string, T>, onChange: (type: 'added' | 'modified' | 'removed', item: T) => void) => {
      pending.add(key)
      this.unsubs.push(
        query.onSnapshot(
          (snap: QuerySnap) => {
            for (const ch of snap.docChanges()) {
              const item = ch.doc.data() as T | undefined
              if (!item) continue
              const it = { ...item, id: item.id ?? ch.doc.id } as T
              if (ch.type === 'removed') map.delete(ch.doc.id)
              else map.set(ch.doc.id, it)
              onChange(ch.type, it)
            }
            done(key)
          },
          (e) => {
            console.error('[mirror]', key, e)
            done(key)
          },
        ),
      )
    }
    const watchDoc = (key: string, path: string, on: (d: DocSnap) => void) => {
      pending.add(key)
      this.unsubs.push(
        db.doc(path).onSnapshot(
          (d) => {
            on(d)
            done(key)
          },
          (e) => {
            console.error('[mirror]', key, e)
            done(key)
          },
        ),
      )
    }

    watch<Member>('members', db.collection(COL.members), this.members, (type, m) => {
      if (type === 'removed') return this.send({ t: 'member.removed', id: m.id })
      const view = this.view(m)
      if (type === 'added' && m.kind === 'agent' && this.isReady) this.send({ t: 'hired', member: view, reason: m.hireReason ?? '', by: m.hiredBy ?? '' })
      else this.send({ t: 'member', member: view })
      if (m.kind === 'human') this.humansChanged()
    })
    watch<Goal>('goals', db.collection(COL.goals).orderBy('createdAt', 'desc').limit(80), this.goals, (type, g) => {
      if (type !== 'removed') this.send({ t: 'goal', goal: g })
      this.sendGate()
    })
    watch<Task>('tasks', db.collection(COL.tasks), this.tasks, (type, t) => {
      if (type !== 'removed') this.send({ t: 'task', task: t })
    })
    watch<Message>('msgs', db.collection(COL.msgs).orderBy('at', 'desc').limit(this.opts.owner ? 300 : 200), this.msgs, (type, m) => {
      if (type !== 'removed') this.send({ t: 'message', message: m })
      if (m.approval) this.sendGate()
    })
    watch<Activity>('acts', db.collection(COL.acts).orderBy('at', 'desc').limit(200), this.acts, (type, a) => {
      if (type === 'added') this.send({ t: 'activity', activity: a })
    })
    watch<StockItem>('stock', db.collection(`data/users/${this.uid}`), this.stock, (type, s) => {
      if (type !== 'removed') this.send({ t: 'stock', item: s })
    })
    watchDoc('settings', SETTINGS, (d) => {
      this.settings = (d.data() as Settings | undefined) ?? {}
      for (const m of this.members.values()) if (m.kind === 'human') this.send({ t: 'member', member: this.view(m) })
      this.sendGate()
    })
    watchDoc('myInbox', `${COL.inbox}/${this.uid}`, (d) => {
      this.myInbox = ((d.data()?.items as InboxItem[] | undefined) ?? []).filter((x) => x && x.id)
    })
    watchDoc('inboxDone', INBOX_DONE, (d) => {
      this.inboxDone = new Map(Object.entries((d.data()?.done as Record<string, string> | undefined) ?? {}))
      this.onInbox?.()
    })
    if (this.opts.owner) {
      watch<MemoryEntry>('memory', db.collection(COL.memory), this.memory, (type, e) => {
        if (type === 'added') this.send({ t: 'memory', entry: e })
      })
      pending.add('allInbox')
      this.unsubs.push(
        db.collection(COL.inbox).onSnapshot(
          (snap) => {
            this.allInbox = new Map(snap.docs.map((d) => [d.id, ((d.data()?.items as InboxItem[] | undefined) ?? []).filter((x) => x && x.id)]))
            this.onInbox?.()
            done('allInbox')
          },
          (e) => {
            console.error('[mirror] inbox', e)
            done('allInbox')
          },
        ),
      )
    }

    // いま開いている人（room の在席）
    const room = this.rt.room
    if (room) {
      void room.presence({ member: this.uid }).catch(() => {})
      this.unsubs.push(
        room.onPeers(({ peers }) => {
          const online = new Set(peers.map((p) => p.by).filter((x): x is string => !!x))
          const runner = peers.some((p) => p.presence?.runner === true)
          const changed = [...new Set([...online, ...this.online])].filter((id) => online.has(id) !== this.online.has(id))
          this.online = online
          if (runner !== this.runnerOnline) {
            this.runnerOnline = runner
            this.sendGate()
          }
          for (const id of changed) {
            const m = this.members.get(id)
            if (m) this.send({ t: 'member', member: this.view(m) })
          }
        }),
      )
      this.unsubs.push(
        room.on('stream', (msg) => {
          const d = msg.data as { memberId?: string; taskId?: string; text?: string } | undefined
          if (!msg.isMe && d?.memberId && d.taskId) this.send({ t: 'stream', memberId: d.memberId, taskId: d.taskId, text: String(d.text ?? '') })
        }),
      )
    }
    // 届かなくても 10 秒で始める（オフラインなど）
    setTimeout(() => {
      if (!this.isReady) {
        this.isReady = true
        resolve()
      }
    }, 10000)
  }

  private humansChanged(): void {
    this.onHumans?.([...this.members.values()].filter((m) => m.kind === 'human'))
  }

  /** 画面に出す形：管理者 = オーナー、人間のオンラインは在席から */
  view(m: Member): Member {
    if (m.kind !== 'human') return m
    const online = this.online.has(m.id) || m.id === this.uid
    return { ...m, isAdmin: m.id === this.ownerId, online, status: online ? (m.status === 'offline' ? 'idle' : m.status) : 'offline' }
  }

  gate(): GateInfo {
    const g = { ...DEFAULT_GATE, ...this.settings.gate }
    const today = new Date().toDateString()
    const isToday = (at?: string) => !!at && new Date(at).toDateString() === today
    const autoToday = [...this.goals.values()].filter((x) => x.approval?.auto && isToday(x.approval.at)).length + [...this.msgs.values()].filter((x) => x.approval?.auto && isToday(x.approval.at)).length
    return { ...g, approverId: this.ownerId ?? null, autoToday, runnerOnline: this.runnerOnline }
  }

  sendGate(): void {
    this.send({ t: 'gate', gate: this.gate() })
  }

  snapshot(detail: string): Snapshot {
    const goals = [...this.goals.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-60)
    const ids = new Set(goals.map((g) => g.id))
    const me = this.members.get(this.uid)
    return {
      me: me ? this.view(me) : null,
      offices: OFFICES,
      members: [...this.members.values()].map((m) => this.view(m)),
      goals,
      tasks: [...this.tasks.values()].filter((t) => ids.has(t.goalId)),
      messages: [...this.msgs.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-200),
      activities: [...this.acts.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-200),
      engine: { mode: 'artifact', detail },
      stock: [...this.stock.values()].filter((x) => x.status !== 'archived' || Date.now() - Date.parse(x.updatedAt) < 3600_000).sort((a, b) => a.at.localeCompare(b.at)),
      gate: this.gate(),
    }
  }

  stop(): void {
    for (const u of this.unsubs) u()
  }
}
