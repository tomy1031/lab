// claude.ai のアーティファクトの中で使う道具（データベース・誰が見ているか・Claude に頼む・いま開いている人）。
// claude.ai の外（ローカルで開いたとき・テスト）では mock.ts の代わりの道具を使う。
// 型は使う所だけを書く（正式な定義は claude.ai が配る window.claude の型）。

export type Unsubscribe = () => void

export interface DocSnap {
  id: string
  exists: boolean
  data(): Record<string, unknown> | undefined
  metadata: { fromCache: boolean; hasPendingWrites: boolean }
}

export interface DocChange {
  type: 'added' | 'modified' | 'removed'
  doc: DocSnap
}

export interface QuerySnap {
  docs: DocSnap[]
  size: number
  empty: boolean
  docChanges(): DocChange[]
  metadata: { fromCache: boolean; hasPendingWrites: boolean }
}

export interface DbError {
  code: string
  message: string
}

export interface DocRef {
  id: string
  path: string
  get(): Promise<DocSnap>
  set(data: Record<string, unknown>): Promise<void>
  update(data: Record<string, unknown>): Promise<void>
  delete(): Promise<void>
  acquire(o: { holder: string; ttlMs?: number; data?: Record<string, unknown> }): Promise<{ acquired: boolean; expiresAt?: string }>
  onSnapshot(next: (s: DocSnap) => void, error?: (e: DbError) => void): Unsubscribe
  collection(path: string): CollRef
}

export interface Query {
  where(field: string, op: string, value: unknown): Query
  orderBy(field: string, dir?: 'asc' | 'desc'): Query
  limit(n: number): Query
  get(): Promise<QuerySnap>
  onSnapshot(next: (s: QuerySnap) => void, error?: (e: DbError) => void): Unsubscribe
}

export interface CollRef extends Query {
  path: string
  doc(id?: string): DocRef
}

export interface Db {
  doc(path: string): DocRef
  collection(path: string): CollRef
}

export interface Viewer {
  id: string | null
  name: string
  isOwner: boolean
  canEdit: boolean
}

export interface UserCap {
  me(): Promise<Viewer>
  id(): Promise<string | null>
  isOwner(): Promise<boolean>
}

export interface SampleTool {
  name: string
  description: string
  inputSchema?: { type: 'object'; properties?: Record<string, unknown>; required?: string[] }
  execute(input: Record<string, unknown>, ctx: { signal: AbortSignal }): unknown
}

export interface SampleOptions {
  onText?: (u: { text: string; delta: string }) => void
  signal?: AbortSignal
  tools?: SampleTool[]
  modelTier?: 'default' | 'complex' | 'quick'
  cache?: boolean
}

export interface SampleFn {
  (input: string, opts?: SampleOptions): Promise<{ text: string; truncated: boolean }>
  json<T = unknown>(input: string, opts?: SampleOptions): Promise<T>
  limits(): Promise<{ maxPromptBytes: number; tools?: { maxCount: number } }>
}

export interface Peer {
  peer: string
  by: string | null
  isMe: boolean
  presence: Readonly<Record<string, unknown>>
}

export interface RoomCap {
  presence(patch: Record<string, unknown>): Promise<void>
  onPeers(handler: (c: { peers: readonly Peer[] }) => void, onError?: (e: DbError) => void): Unsubscribe
  peers(): readonly Peer[]
  emit(topic: string, data?: unknown): Promise<void>
  on(topic: string, handler: (m: { data?: unknown; isMe: boolean }) => void): Unsubscribe
}

export interface Runtime {
  /** claude.ai の外で動いている（代わりの道具） */
  mock: boolean
  db: Db | null
  user: UserCap | null
  /** Claude に頼む。承認する人のページだけが使う */
  sample: SampleFn | null
  room: RoomCap | null
}

type ClaudeGlobal = { use(name: string): Promise<unknown> }

let cached: Promise<Runtime> | null = null

export function runtime(): Promise<Runtime> {
  cached ??= (async () => {
    const claude = (window as unknown as { claude?: ClaudeGlobal }).claude
    if (!claude?.use) {
      const { mockRuntime } = await import('./mock')
      return mockRuntime()
    }
    const [db, user, sample, room] = await Promise.all(['db', 'user', 'sample', 'room'].map((n) => claude.use(n).catch(() => null)))
    return { mock: false, db: db as Db | null, user: user as UserCap | null, sample: sample as SampleFn | null, room: room as RoomCap | null }
  })()
  return cached
}
