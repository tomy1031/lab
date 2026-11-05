// claude.ai の外で開いたとき（ローカルの確認・テスト）の代わりの道具。
// - データベース：この端末のブラウザ（localStorage）に置き、同じブラウザの別タブへ BroadcastChannel で知らせる。読み書きのルールも同じように確かめる
// - 誰が見ているか：URL の ?as=名前（無ければオーナー＝承認する人）
// - いま開いている人：BroadcastChannel で知らせ合う
// - Claude に頼む：使えない（会社を動かす係はシミュレーションで動く）
import { DB_RULES, seg } from './paths'
import type { CollRef, Db, DocChange, DocRef, DocSnap, Peer, Query, QuerySnap, RoomCap, Runtime, Unsubscribe, UserCap } from './runtime'

const KEY = 'nmai.mockdb.v1'
type Level = 'view' | 'interact' | 'admin' | 'owner'
const RANK: Record<string, number> = { view: 0, interact: 1, admin: 2, owner: 3, self: 9 }

function viewer(): { id: string; name: string; owner: boolean } {
  const as = new URLSearchParams(location.search).get('as')
  if (!as || as === 'owner') return { id: 'u_owner', name: 'オーナー', owner: true }
  return { id: `u_${seg(as)}`, name: as, owner: false }
}

function snap(id: string, data: Record<string, unknown> | undefined): DocSnap {
  const frozen = data ? Object.freeze(JSON.parse(JSON.stringify(data))) : undefined
  return { id, exists: !!data, data: () => frozen, metadata: { fromCache: false, hasPendingWrites: false } }
}

class MockDb implements Db {
  private docs = new Map<string, Record<string, unknown>>()
  private listeners = new Set<() => void>()
  private leases = new Map<string, { holder: string; until: number }>()
  private ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('nmai-mockdb') : null

  constructor(
    private readonly me: { id: string; owner: boolean },
  ) {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, Record<string, unknown>>)) this.docs.set(k, v)
    } catch {
      /* 空から始める */
    }
    if (this.ch) {
      this.ch.onmessage = (e) => {
        const m = e.data as { path: string; data: Record<string, unknown> | null }
        if (m.data) this.docs.set(m.path, m.data)
        else this.docs.delete(m.path)
        this.notify()
      }
    }
  }

  // ---- ルール（claude.ai と同じ考え方を簡単に）
  private level(): Level {
    return this.me.owner ? 'owner' : 'interact'
  }
  /** 浅いルールから順に当てはめ、深いルールで上書きする。{self} は自分の id のときだけ当てはまる（他人の分はプレフィックスのルールだけ） */
  private rule(path: string): { read: string; write: string } {
    const segs = path.split('/')
    let read = 'view'
    let write = 'interact'
    const hits = DB_RULES.map((r) => ({ r, rs: r.path ? r.path.split('/') : [] }))
      .filter(({ rs }) => rs.length <= segs.length && rs.every((x, i) => (x === '{self}' ? segs[i] === this.me.id : x === segs[i])))
      .sort((a, b) => a.rs.length - b.rs.length)
    for (const { r } of hits) {
      if ('read' in r && r.read) read = r.read
      if ('write' in r && r.write) write = r.write
    }
    return { read, write }
  }
  /** data/users/<id>/ は本人だけ（オーナーも見られない） */
  private othersPrivate(path: string): boolean {
    const s = path.split('/')
    return s[0] === 'data' && s[1] === 'users' && s.length > 2 && s[2] !== this.me.id
  }
  canRead(path: string): boolean {
    return !this.othersPrivate(path) && RANK[this.level()] >= RANK[this.rule(path).read]
  }
  canWrite(path: string): boolean {
    return !this.othersPrivate(path) && RANK[this.level()] >= RANK[this.rule(path).write]
  }

  private persist(path: string, data: Record<string, unknown> | null): void {
    if (data) this.docs.set(path, data)
    else this.docs.delete(path)
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(this.docs)))
    } catch {
      /* 入りきらないときは保存しない */
    }
    this.ch?.postMessage({ path, data })
    queueMicrotask(() => this.notify())
  }

  private notify(): void {
    for (const l of this.listeners) l()
  }

  private listen(fn: () => void): Unsubscribe {
    this.listeners.add(fn)
    queueMicrotask(fn)
    return () => this.listeners.delete(fn)
  }

  doc(path: string): DocRef {
    const parts = path.split('/')
    if (parts.length % 2) throw new TypeError(`文書のパスではありません：${path}`)
    const id = parts.at(-1)!
    const self = this
    const reject = (code: string, message: string) => Promise.reject({ code, message })
    return {
      id,
      path,
      async get() {
        return snap(id, self.canRead(path) ? self.docs.get(path) : undefined)
      },
      async set(data) {
        if (!self.canWrite(path)) return reject('invalid_argument', `書けません：${path}`)
        self.persist(path, JSON.parse(JSON.stringify(data)))
      },
      async update(data) {
        if (!self.canWrite(path)) return reject('invalid_argument', `書けません：${path}`)
        const cur = self.docs.get(path)
        if (!cur) return reject('invalid_argument', `ありません：${path}`)
        self.persist(path, { ...cur, ...JSON.parse(JSON.stringify(data)) })
      },
      async delete() {
        if (!self.canWrite(path)) return reject('invalid_argument', `消せません：${path}`)
        self.persist(path, null)
      },
      async acquire(o) {
        const now = Date.now()
        const cur = self.leases.get(path)
        if (cur && cur.until > now && cur.holder !== o.holder) return { acquired: false, expiresAt: new Date(cur.until).toISOString() }
        const until = now + Math.min(600000, Math.max(1000, o.ttlMs || 30000))
        self.leases.set(path, { holder: o.holder, until })
        return { acquired: true, expiresAt: new Date(until).toISOString() }
      },
      onSnapshot(next) {
        let last: string | undefined = '\u0000'
        return self.listen(() => {
          const d = self.canRead(path) ? self.docs.get(path) : undefined
          const key = d ? JSON.stringify(d) : undefined
          if (key === last) return
          last = key
          next(snap(id, d))
        })
      },
      collection(sub: string) {
        return self.collection(`${path}/${sub}`)
      },
    }
  }

  collection(path: string): CollRef {
    if (path.split('/').length % 2 === 0) throw new TypeError(`コレクションのパスではありません：${path}`)
    const make = (filters: [string, string, unknown][], order: [string, 'asc' | 'desc'] | null, lim: number | null): Query => {
      const run = (): [string, Record<string, unknown>][] => {
        const depth = path.split('/').length + 1
        let rows = [...this.docs.entries()].filter(([p]) => p.startsWith(path + '/') && p.split('/').length === depth && this.canRead(p))
        for (const [f, op, v] of filters) {
          rows = rows.filter(([, d]) => {
            const x = d[f] as never
            switch (op) {
              case '==':
                return x === v
              case '!=':
                return x !== v
              case '<':
                return x < (v as never)
              case '<=':
                return x <= (v as never)
              case '>':
                return x > (v as never)
              case '>=':
                return x >= (v as never)
              case 'in':
                return (v as unknown[]).includes(x)
              case 'not-in':
                return !(v as unknown[]).includes(x)
              case 'array-contains':
                return Array.isArray(x) && (x as unknown[]).includes(v)
            }
            return true
          })
        }
        if (order) {
          const [f, dir] = order
          rows.sort(([, a], [, b]) => {
            const x = a[f] as string
            const y = b[f] as string
            if (x === y) return 0
            if (x === undefined) return 1
            if (y === undefined) return -1
            return (x < y ? -1 : 1) * (dir === 'desc' ? -1 : 1)
          })
        } else rows.sort(([a], [b]) => (a < b ? -1 : 1))
        if (lim) rows = rows.slice(0, lim)
        return rows
      }
      const toSnap = (rows: [string, Record<string, unknown>][], changes: DocChange[]): QuerySnap => {
        const docs = rows.map(([p, d]) => snap(p.split('/').at(-1)!, d))
        return { docs, size: docs.length, empty: !docs.length, docChanges: () => changes, metadata: { fromCache: false, hasPendingWrites: false } }
      }
      const q: Query = {
        where: (f, op, v) => make([...filters, [f, op, v]], order, lim),
        orderBy: (f, dir = 'asc') => make(filters, [f, dir], lim),
        limit: (n) => make(filters, order, n),
        get: async () => {
          const rows = run()
          return toSnap(rows, rows.map(([p, d]) => ({ type: 'added' as const, doc: snap(p.split('/').at(-1)!, d) })))
        },
        onSnapshot: (next) => {
          let prev = new Map<string, string>()
          let first = true
          return this.listen(() => {
            const rows = run()
            const cur = new Map(rows.map(([p, d]) => [p, JSON.stringify(d)]))
            const changes: DocChange[] = []
            for (const [p, d] of rows) {
              const id = p.split('/').at(-1)!
              if (!prev.has(p)) changes.push({ type: 'added', doc: snap(id, d) })
              else if (prev.get(p) !== cur.get(p)) changes.push({ type: 'modified', doc: snap(id, d) })
            }
            for (const [p, raw] of prev) if (!cur.has(p)) changes.push({ type: 'removed', doc: snap(p.split('/').at(-1)!, JSON.parse(raw)) })
            prev = cur
            if (!changes.length && !first) return
            first = false
            next(toSnap(rows, changes))
          })
        },
      }
      return q
    }
    const base = make([], null, null)
    return { ...base, path, doc: (id?: string) => this.doc(`${path}/${id ?? Math.random().toString(36).slice(2, 12)}`) }
  }
}

class MockRoom implements RoomCap {
  private peerId = Math.random().toString(36).slice(2, 10)
  private mine: Record<string, unknown> = {}
  private others = new Map<string, { by: string; presence: Record<string, unknown>; at: number }>()
  private handlers = new Set<(c: { peers: readonly Peer[] }) => void>()
  private topics = new Map<string, Set<(m: { data?: unknown; isMe: boolean }) => void>>()
  private ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('nmai-mockroom') : null

  constructor(private readonly by: string) {
    if (this.ch) {
      this.ch.onmessage = (e) => {
        const m = e.data as { kind: string; peer: string; by: string; presence?: Record<string, unknown>; topic?: string; data?: unknown }
        if (m.kind === 'presence') this.others.set(m.peer, { by: m.by, presence: m.presence ?? {}, at: Date.now() })
        else if (m.kind === 'bye') this.others.delete(m.peer)
        else if (m.kind === 'hello') this.announce()
        else if (m.kind === 'emit') for (const h of this.topics.get(m.topic!) ?? []) h({ data: m.data, isMe: false })
        this.fire()
      }
      this.ch.postMessage({ kind: 'hello', peer: this.peerId, by })
    }
    setInterval(() => {
      this.announce()
      const now = Date.now()
      let changed = false
      for (const [k, v] of this.others) if (now - v.at > 12000) changed = this.others.delete(k) || changed
      if (changed) this.fire()
    }, 4000)
    addEventListener('beforeunload', () => this.ch?.postMessage({ kind: 'bye', peer: this.peerId, by }))
  }

  private announce(): void {
    this.ch?.postMessage({ kind: 'presence', peer: this.peerId, by: this.by, presence: this.mine })
  }

  peers(): readonly Peer[] {
    return [
      { peer: this.peerId, by: this.by, isMe: true, presence: this.mine },
      ...[...this.others].map(([peer, v]) => ({ peer, by: v.by, isMe: false, presence: v.presence })),
    ]
  }

  private fire(): void {
    const peers = this.peers()
    for (const h of this.handlers) h({ peers })
  }

  async presence(patch: Record<string, unknown>): Promise<void> {
    this.mine = { ...this.mine, ...patch }
    for (const [k, v] of Object.entries(patch)) if (v === null) delete this.mine[k]
    this.announce()
    this.fire()
  }

  onPeers(handler: (c: { peers: readonly Peer[] }) => void): Unsubscribe {
    this.handlers.add(handler)
    queueMicrotask(() => handler({ peers: this.peers() }))
    return () => this.handlers.delete(handler)
  }

  async emit(topic: string, data?: unknown): Promise<void> {
    this.ch?.postMessage({ kind: 'emit', peer: this.peerId, by: this.by, topic, data })
    for (const h of this.topics.get(topic) ?? []) h({ data, isMe: true })
  }

  on(topic: string, handler: (m: { data?: unknown; isMe: boolean }) => void): Unsubscribe {
    const set = this.topics.get(topic) ?? new Set()
    set.add(handler)
    this.topics.set(topic, set)
    return () => set.delete(handler)
  }
}

export function mockRuntime(): Runtime {
  const v = viewer()
  const db = new MockDb({ id: v.id, owner: v.owner })
  const user: UserCap = {
    me: async () => ({ id: v.id, name: v.name, isOwner: v.owner, canEdit: v.owner }),
    id: async () => v.id,
    isOwner: async () => v.owner,
  }
  ;(window as unknown as { __mockdb: MockDb }).__mockdb = db
  return { mock: true, db, user, sample: null, room: new MockRoom(v.id) }
}
