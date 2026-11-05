// アーティファクト版の「サーバーとのやり取り」：client/src/api.ts と同じ形で、中身はアーティファクトのデータベースと会社を動かす係。
// ビルド（vite.artifact.config.ts）で client/src/api.ts の代わりに使われる。
import type { GateSettings, Member, MemoryEntry, OfficeId, ServerEvent, StockItem } from '../../../shared/types'
import { OFFICES, normalizeOffice } from '../../../shared/types'
import { score } from '../../../server/memory'
import { hashStr, id, lookForHuman, now } from '../../../server/util'
import { Mirror } from './mirror'
import { COL, fileDocId, plain, type InboxItem } from './paths'
import { Runner } from './runner'
import { runtime, type Runtime, type Viewer } from './runtime'
import { LocalStock } from './stock'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    msg: string,
  ) {
    super(msg)
  }
}

type Request = InboxItem extends infer T ? (T extends InboxItem ? Omit<T, 'id' | 'at'> : never) : never

class Hub {
  rt!: Runtime
  viewer!: Viewer
  uid = ''
  mirror!: Mirror
  runner: Runner | null = null
  stock!: LocalStock
  private initP: Promise<void> | null = null
  private listeners = new Set<(ev: ServerEvent) => void>()
  private inboxChain: Promise<void> = Promise.resolve()
  notify: ((text: string) => void) | null = null

  init(): Promise<void> {
    this.initP ??= (async () => {
      this.rt = await runtime()
      if (!this.rt.db || !this.rt.user) throw new ApiError(503, 'このページではデータベースを使えません。claude.ai で開いてください')
      this.viewer = await this.rt.user.me()
      if (!this.viewer.id) throw new ApiError(401, 'claude.ai にサインインしてから開いてください')
      this.uid = this.viewer.id
      this.mirror = new Mirror(this.rt, this.uid, { owner: this.viewer.isOwner })
      this.mirror.on((ev) => this.forward(ev))
      await this.mirror.ready
      this.stock = new LocalStock(this.rt.db, this.uid, () => [...this.mirror.stock.values()])
      if (this.viewer.isOwner && this.mirror.members.has(this.uid)) await this.startRunner()
    })()
    return this.initP
  }

  async startRunner(): Promise<void> {
    if (this.runner) return
    const r = new Runner(this.rt, this.mirror, this.uid, (ev) => this.forward(ev), (t) => this.notify?.(t))
    if (await r.start()) {
      this.runner = r
      this.mirror.runnerOnline = true
      this.mirror.sendGate()
    }
  }

  on(fn: (ev: ServerEvent) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private forward(ev: ServerEvent): void {
    for (const fn of this.listeners) fn(ev)
  }

  detail(): string {
    if (this.rt.mock) return 'ローカルの確認用：Claude の代わりにシミュレーションで動きます'
    const owner = this.mirror.members.get(this.mirror.ownerId ?? '')
    return `claude.ai のアーティファクト：${owner ? `${owner.name}さん（承認する人）` : '承認する人'}の Claude で動きます`
  }

  me(): Member | null {
    const m = this.mirror.members.get(this.uid)
    return m ? this.mirror.view(m) : null
  }

  need(): Member {
    const m = this.runner?.member(this.uid) ?? this.me()
    if (!m) throw new ApiError(401, '先に参加してください')
    return m
  }

  /** 自分の依頼箱に積む（承認する人のページが処理する）。処理済みのものは片づける */
  request(r: Request): Promise<void> {
    const job = this.inboxChain.then(async () => {
      const ref = this.rt.db!.doc(`${COL.inbox}/${this.uid}`)
      const cur = ((await ref.get()).data()?.items as InboxItem[] | undefined) ?? []
      const done = this.mirror.inboxDone
      const items = [...cur.filter((x) => !done.has(x.id)), { ...r, id: id('req'), at: now() } as InboxItem].slice(-50)
      await ref.set({ items: plain(items) as unknown as InboxItem[] } as unknown as Record<string, unknown>)
      if (!this.mirror.runnerOnline) this.notify?.('承認する人のページが開いていないので、開いたときに届きます')
    })
    this.inboxChain = job.catch(() => {})
    return job
  }

  /** 承認する人のページでしかできないこと */
  asRunner(): Runner {
    if (!this.runner) throw new ApiError(403, this.viewer.isOwner ? 'このページは別のタブで動いています。そちらで操作してください' : '承認する人（オーナー）のページでできます')
    return this.runner
  }
}

const hub = new Hub()
const ok = { ok: true }

/** アーティファクト版：画面の知らせ（トースト）を出す場所を渡す */
export function setNotifier(fn: (text: string) => void): void {
  hub.notify = fn
}

export const Api = {
  mode: 'artifact' as const,
  async me(): Promise<{ me: Member | null; join?: { name: string; owner: boolean } }> {
    await hub.init()
    const me = hub.me()
    return me ? { me } : { me: null, join: { name: hub.viewer.name, owner: hub.viewer.isOwner } }
  },
  /** 参加する（自分の社員の文書を書く） */
  async join(body: { name: string; office: string; role: string; skills: string; persona: string }): Promise<{ me: Member }> {
    await hub.init()
    const office: OfficeId = normalizeOffice(body.office)
    const used = new Set([...hub.mirror.members.values()].filter((m) => m.office === office && m.deskIndex >= 0).map((m) => m.deskIndex))
    const desks = OFFICES.find((o) => o.id === office)?.desks ?? 12
    let desk = -1
    // 大阪本社の 0 番はオーナー（代表）の席、1 番はネクマックス
    if (hub.viewer.isOwner && office === 'osaka' && !used.has(0)) desk = 0
    for (let i = office === 'osaka' ? 2 : 0; desk < 0 && i < desks; i++) if (!used.has(i)) desk = i
    if (desk < 0) throw new ApiError(409, 'その拠点は満席です。ほかの拠点を選んでください')
    const name = body.name.trim().slice(0, 40)
    if (!name) throw new ApiError(400, '名前を書いてください')
    const m: Member = {
      id: hub.uid,
      kind: 'human',
      name,
      role: body.role.trim().slice(0, 40) || (hub.viewer.isOwner ? '代表' : 'メンバー'),
      office,
      skills: body.skills.split(/[,、，\s]+/).map((x) => x.trim()).filter(Boolean).slice(0, 20),
      languages: [office === 'phnompenh' ? 'km' : 'ja'],
      persona: body.persona.trim().slice(0, 400) || undefined,
      look: lookForHuman(name + hashStr(hub.uid), office),
      deskIndex: desk,
      status: 'idle',
      hiredAt: now(),
      hiredBy: hub.uid,
      online: true,
      stats: { tasksDone: 0, messages: 0 },
    }
    await hub.rt.db!.doc(`${COL.members}/${hub.uid}`).set(plain(m))
    if (hub.viewer.isOwner) await hub.startRunner()
    return { me: m }
  },
  login: async (_login: string, _password: string): Promise<{ me: Member }> => {
    throw new ApiError(400, 'アーティファクト版は claude.ai のアカウントで入ります')
  },
  logout: async () => ok,
  async createGoal(title: string, description: string) {
    await hub.init()
    if (hub.runner) return { goal: hub.runner.company.createGoal(hub.need(), title.slice(0, 200), description.slice(0, 4000)) }
    hub.need()
    await hub.request({ type: 'goal', title: title.slice(0, 200), description: description.slice(0, 4000) })
    return { goal: { id: '', title, status: hub.mirror.ownerId && hub.mirror.ownerId !== hub.uid ? 'awaiting_approval' : 'planning' } }
  },
  async cancelGoal(goalId: string) {
    if (hub.runner) hub.runner.company.cancelGoal(goalId, hub.need())
    else await hub.request({ type: 'cancel', goalId })
    return ok
  },
  async completeTask(taskId: string, note: string) {
    if (hub.runner) return { task: hub.runner.company.completeHumanTask(taskId, hub.need(), note) }
    hub.need()
    await hub.request({ type: 'complete', taskId, note })
    return ok
  },
  async retryTask(taskId: string) {
    if (hub.runner) hub.runner.company.retryTask(taskId, hub.need())
    else await hub.request({ type: 'retry', taskId })
    return ok
  },
  async memory(memberId: string): Promise<{ memory: MemoryEntry[]; context: string[] }> {
    await hub.init()
    let all: MemoryEntry[]
    if (hub.runner) all = hub.runner.store.memoryOf(memberId)
    else {
      const snap = await hub.rt.db!.collection(COL.memory).where('memberId', '==', memberId).get()
      all = snap.docs.map((d) => d.data() as unknown as MemoryEntry).sort((a, b) => a.at.localeCompare(b.at))
    }
    const top = [...all].sort((a, b) => score(b) - score(a)).slice(0, 12).sort((a, b) => a.at.localeCompare(b.at))
    return { memory: all.slice(-200), context: top.map((e) => e.text) }
  },
  async addMemory(memberId: string, text: string) {
    await hub.request({ type: 'memory', memberId, text: text.slice(0, 600) })
    return ok
  },
  registerHuman: async (_body: Record<string, unknown>): Promise<{ member: Member }> => {
    throw new ApiError(400, 'アーティファクト版では、このページを共有すると、開いた人が自分で参加します')
  },
  async retire(memberId: string) {
    const r = hub.asRunner()
    const m = r.store.member(memberId)
    if (!m || m.kind !== 'agent') throw new ApiError(400, '退職できるのは AI社員だけです')
    r.store.removeMember(memberId)
    r.company.activity('info', `${m.name}（${m.role}）が退職しました`, memberId)
    return ok
  },
  async updateMember(memberId: string, body: Record<string, unknown>): Promise<{ member: Member }> {
    await hub.init()
    const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
    const list = (v: unknown) => (typeof v === 'string' ? v.split(/[,、，\s]+/) : Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 20)
    const patch: Partial<Member> = {}
    if (str(body.name, 40)) patch.name = str(body.name, 40)
    if (str(body.role, 40)) patch.role = str(body.role, 40)
    if (body.skills !== undefined) patch.skills = list(body.skills)
    if (body.languages !== undefined) patch.languages = list(body.languages)
    if (typeof body.persona === 'string') patch.persona = str(body.persona, 400) || undefined
    if (memberId === hub.uid) {
      const cur = hub.mirror.members.get(hub.uid)
      if (!cur) throw new ApiError(404, '見つかりません')
      const next = { ...cur, ...patch }
      await hub.rt.db!.doc(`${COL.members}/${hub.uid}`).set(plain(next))
      return { member: next }
    }
    const r = hub.asRunner()
    const m = r.store.member(memberId)
    if (!m || m.kind === 'human') throw new ApiError(403, 'ほかの人のプロフィールは本人が編集します')
    return { member: r.store.patchMember(memberId, patch)! }
  },
  setEngine: async (_mode: 'claude' | 'sim') => {
    throw new ApiError(400, 'アーティファクト版は、承認する人の Claude で動きます')
  },
  async addStock(text: string): Promise<{ item: StockItem }> {
    await hub.init()
    return { item: await hub.stock.add(text.slice(0, 1000)) }
  },
  async stockAct(itemId: string, action: 'send' | 'done' | 'later' | 'archive' | 'restore', patch: { title?: string; kind?: string } = {}) {
    await hub.init()
    const item = hub.mirror.stock.get(itemId)
    if (!item) throw new ApiError(404, 'あなたのストックではありません')
    const title = patch.title?.trim() || item.title
    const kind = (patch.kind as StockItem['kind'] | undefined) ?? item.kind
    const set = (status: StockItem['status'], extra: Partial<StockItem> = {}) => hub.stock.put({ ...item, title, kind, ...extra, status, updatedAt: now() })
    switch (action) {
      case 'send': {
        const description = [item.summary, `（話したこと）${item.raw}`].filter(Boolean).join('\n')
        const r = await Api.createGoal(title, description)
        return { item: await set('sent', r.goal.id ? { goalId: r.goal.id } : {}) }
      }
      case 'done': {
        const text = kind === 'memo' ? `メモ：${title}${item.summary ? `（${item.summary}）` : ''}` : `自分でやった：${title}`
        await hub.request({ type: 'memory', memberId: hub.uid, text, kind: kind === 'memo' ? 'note' : 'task' })
        return { item: await set('done') }
      }
      case 'later':
        return { item: await set('later') }
      case 'archive':
        return { item: await set('archived') }
      case 'restore':
        return { item: await set('ready') }
    }
  },
  changePassword: async (_current: string, _next: string) => {
    throw new ApiError(400, 'アーティファクト版にはパスワードがありません')
  },
  async talk(to: string, text: string) {
    await hub.init()
    if (hub.runner) {
      const m = hub.runner.member(to)
      if (!m) throw new ApiError(400, '相手を選んでください')
      void hub.runner.company.talk(hub.need(), m, text.slice(0, 1000)).catch((e) => console.error('[talk]', e))
    } else await hub.request({ type: 'talk', to, text: text.slice(0, 1000) })
    return ok
  },
  async reply(messageId: string, text: string) {
    if (hub.runner) return { message: hub.runner.company.reply(messageId, hub.need(), text) }
    await hub.request({ type: 'reply', messageId, text: text.slice(0, 2000) })
    return ok
  },
  async file(goalId: string, path: string): Promise<{ path: string; content: string }> {
    await hub.init()
    const d = await hub.rt.db!.doc(`${COL.files}/${fileDocId(goalId, path)}`).get()
    const content = d.data()?.content
    if (typeof content !== 'string') throw new ApiError(404, 'ファイルが見つかりません')
    return { path, content }
  },
  async approve(kind: 'goal' | 'talk', itemId: string) {
    const r = hub.asRunner()
    if (kind === 'goal') r.company.approveGoal(itemId, hub.need())
    else void r.company.approveTalk(itemId, hub.need()).catch((e) => hub.notify?.((e as Error).message))
    return ok
  },
  async decline(kind: 'goal' | 'talk', itemId: string, note = '') {
    const r = hub.asRunner()
    if (kind === 'goal') r.company.declineGoal(itemId, hub.need(), note)
    else r.company.declineTalk(itemId, hub.need(), note)
    return ok
  },
  async setGate(patch: Partial<GateSettings>) {
    const r = hub.asRunner()
    return { gate: r.company.setGate(hub.need(), { ...patch, approverId: undefined }) }
  },
}

export function connect(onEvent: (ev: ServerEvent) => void, onState: (s: 'open' | 'closed' | 'unauthorized') => void): () => void {
  let stopped = false
  let off: (() => void) | null = null
  hub
    .init()
    .then(() => {
      if (stopped) return
      onEvent({ t: 'snapshot', data: hub.mirror.snapshot(hub.detail()) })
      off = hub.on((ev) => onEvent(ev))
      onState('open')
    })
    .catch(() => onState('closed'))
  return () => {
    stopped = true
    off?.()
  }
}
