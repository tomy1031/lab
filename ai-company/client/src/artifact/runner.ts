// 会社を動かす係：承認する人（アーティファクトのオーナー）のページの中で、司令塔（server/company.ts と同じもの）を動かす。
// - Claude を呼ぶのはこのページだけ（承認する人のアカウントの利用枠）。ほかの人は依頼箱に積むだけ
// - オーナーが同じページを 2 つ開いても、動かすのは 1 つ（データベースの札 = lease）
// - 自動承認は、このページが開いていて画面に見えている間だけ
import type { Member, ServerEvent } from '../../../shared/types'
import { Company } from '../../../server/company'
import type { State } from '../../../server/coreStore'
import { emptyState } from '../../../server/coreStore'
import { SimEngine } from '../../../server/engine/sim'
import type { Engine } from '../../../server/engine/types'
import { remember } from '../../../server/memory'
import { now } from '../../../server/util'
import { safeName, type Workspace } from '../../../server/workspace'
import { DbStore } from './dbStore'
import type { Mirror } from './mirror'
import { COL, INBOX_DONE, RUNNER, fileDocId, type InboxItem } from './paths'
import type { Runtime } from './runtime'
import { SampleEngine } from './sampleEngine'

const TAB = Math.random().toString(36).slice(2, 10)

/** データベースに置く作業場所（成果物のファイル） */
class DbWorkspace implements Workspace {
  private files = new Map<string, string[]>()
  constructor(
    private readonly rt: Runtime,
    private readonly mirrorFiles: Map<string, string[]>,
  ) {}
  dir(goalId: string): string {
    return `db:${goalId}`
  }
  list(goalId: string): string[] {
    return [...(this.files.get(goalId) ?? this.mirrorFiles.get(goalId) ?? [])]
  }
  write(goalId: string, name: string, content: string): void {
    const path = safeName(name)
    const list = this.files.get(goalId) ?? [...(this.mirrorFiles.get(goalId) ?? [])]
    if (!list.includes(path)) list.push(path)
    this.files.set(goalId, list)
    void this.rt.db!.doc(`${COL.files}/${fileDocId(goalId, path)}`).set({ goalId, path, content, at: now() }).catch((e) => console.error('[file]', e))
  }
  async read(goalId: string, name: string): Promise<string | null> {
    const d = await this.rt.db!.doc(`${COL.files}/${fileDocId(goalId, name)}`).get()
    return (d.data()?.content as string | undefined) ?? null
  }
}

/** ネクマックス（初号機と量産型）。アーティファクト版は実在の人の名前を入れない */
function coreMembers(): Member[] {
  const base = { kind: 'nexmax' as const, languages: ['ja', 'en', 'km'], status: 'idle' as const, hiredAt: now(), hiredBy: 'system', stats: { tasksDone: 0, messages: 0 } }
  return [
    {
      ...base,
      id: 'nexmax',
      name: 'ネクマックス',
      role: 'AI統括（代表の分身）',
      office: 'osaka',
      skills: ['タスク分解', '採用', '進行管理', '報告'],
      persona: '代表の隣の席で、代表の分身として働く統括 AI。代表の方針と過去の判断を踏まえ、ゴールを分け、人と AI に仕事を配る。明るく前向き',
      look: { body: '#66b2f0', accent: '#59e6ff', style: 0, nexmaxVariant: 'protagonist' },
      deskIndex: 1,
    },
    {
      ...base,
      id: 'nexmax_kh',
      name: 'ネクマックス NX-086',
      role: 'AI統括（量産型・カンボジア）',
      office: 'phnompenh',
      skills: ['タスク分解', '進行管理', 'クメール語'],
      persona: 'プノンペンオフィスの統括を任された量産型ネクマックス。初号機と連携して、カンボジア側の仕事を配る',
      look: { body: '#66b2f0', accent: '#ffd166', style: 1, nexmaxVariant: 'production', serial: 86 },
      deskIndex: -1,
    },
  ]
}

export class Runner {
  company!: Company
  store!: DbStore
  private beat: ReturnType<typeof setInterval> | null = null
  private processing = false
  private doneDirty = false

  constructor(
    private readonly rt: Runtime,
    private readonly mirror: Mirror,
    private readonly ownerId: string,
    private readonly emitLocal: (ev: ServerEvent) => void,
    private readonly notify: (text: string) => void,
  ) {}

  /** 札を取れたら動かし始める（取れなければ別のタブが動かしている） */
  async start(): Promise<boolean> {
    const lease = await this.rt.db!.doc(RUNNER).acquire({ holder: TAB, ttlMs: 60000 }).catch(() => ({ acquired: false }))
    if (!lease.acquired) return false
    this.beat = setInterval(() => {
      void this.rt.db!.doc(RUNNER).acquire({ holder: TAB, ttlMs: 60000 }).catch(() => {})
    }, 25000)

    const m = this.mirror
    const files = new Map<string, string[]>()
    for (const t of m.tasks.values()) if (t.files?.length) files.set(t.goalId, [...new Set([...(files.get(t.goalId) ?? []), ...t.files])])
    const state: State = {
      ...emptyState(),
      members: [...m.members.values()].map((x) => (x.kind === 'human' ? { ...x, isAdmin: x.id === this.ownerId } : x)),
      goals: [...m.goals.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      tasks: [...m.tasks.values()],
      messages: [...m.msgs.values()].sort((a, b) => a.at.localeCompare(b.at)),
      activities: [...m.acts.values()].sort((a, b) => a.at.localeCompare(b.at)),
      memory: [...m.memory.values()].sort((a, b) => a.at.localeCompare(b.at)),
      settings: { gate: { ...(m.settings.gate ?? {}), approverId: this.ownerId } },
    }
    this.store = new DbStore(this.rt.db!, state, this.ownerId)
    this.store.onError = this.notify
    // 会社を動かす係の知らせのうち、データベースを通らないもの（作業中の文）は、このページと在席の人へ直接
    this.store.on('event', (ev) => {
      if (ev.t === 'stream') {
        this.emitLocal(ev)
        void this.rt.room?.emit('stream', { memberId: ev.memberId, taskId: ev.taskId, text: ev.text }).catch(() => {})
      }
    })
    // 代わりの道具（ローカルの確認）ではシミュレーション。?simspeed=10 で速くできる
    const simSpeed = Number(new URLSearchParams(location.search).get('simspeed')) || 1
    const engine: Engine = this.rt.sample ? new SampleEngine(this.rt.sample) : this.rt.mock ? new SimEngine(simSpeed) : unavailableEngine()
    this.company = new Company(this.store, () => engine, new DbWorkspace(this.rt, files), {
      maxParallel: 2,
      pace: 1,
      canAutoApprove: () => document.visibilityState === 'visible',
      gateExtra: () => ({ runnerOnline: true }),
    })

    // ネクマックスがいなければ置く（初回）
    for (const core of coreMembers()) if (!this.store.member(core.id)) this.store.putMember(core)
    this.store.setGate({ approverId: this.ownerId })
    void this.rt.room?.presence({ runner: true }).catch(() => {})
    m.attachRunner(
      (humans) => this.store.mergeHumans(humans.map((h) => ({ ...h }))),
      () => void this.processInbox(),
    )
    this.company.recover()
    void this.processInbox()
    // 画面が見えるようになったら、自動承認の待ちを通す
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.company.sweepAuto()
    })
    addEventListener('beforeunload', () => this.store.flush())
    return true
  }

  member(id: string): Member | undefined {
    return this.store.member(id)
  }

  /** 全員の依頼箱から、まだ処理していない依頼を順に処理する */
  private async processInbox(): Promise<void> {
    if (this.processing || !this.company) return
    this.processing = true
    try {
      const done = this.mirror.inboxDone
      const all = [...this.mirror.allInbox].flatMap(([uid, items]) => items.map((it) => ({ uid, it })))
      all.sort((a, b) => a.it.at.localeCompare(b.it.at))
      for (const { uid, it } of all) {
        if (done.has(it.id)) continue
        done.set(it.id, now())
        this.doneDirty = true
        const by = this.store.member(uid)
        if (!by) continue
        try {
          await this.handle(by, it)
        } catch (e) {
          this.company.activity('warn', `${by.name} さんの依頼を処理できませんでした：${(e as Error).message}`, by.id)
        }
      }
      if (this.doneDirty) {
        this.doneDirty = false
        // 新しい 400 件だけ残す
        const entries = [...done].sort((a, b) => a[1].localeCompare(b[1])).slice(-400)
        await this.rt.db!.doc(INBOX_DONE).set({ done: Object.fromEntries(entries) }).catch((e) => console.error('[inbox]', e))
      }
    } finally {
      this.processing = false
    }
  }

  /** 1 つの依頼（サーバー版の API と同じ確かめ方） */
  async handle(by: Member, it: InboxItem): Promise<unknown> {
    const c = this.company
    switch (it.type) {
      case 'goal':
        if (!it.title.trim()) throw new Error('ゴールが空です')
        return c.createGoal(by, it.title.slice(0, 200), (it.description ?? '').slice(0, 4000))
      case 'talk': {
        const to = this.store.member(it.to)
        if (!to || to.id === by.id) throw new Error('相手がいません')
        void c.talk(by, to, it.text.slice(0, 1000)).catch((e) => console.error('[talk]', e))
        return null
      }
      case 'reply':
        return c.reply(it.messageId, by, it.text.slice(0, 2000))
      case 'complete':
        return c.completeHumanTask(it.taskId, by, (it.note ?? '').slice(0, 4000))
      case 'retry':
        return c.retryTask(it.taskId, by)
      case 'cancel':
        return c.cancelGoal(it.goalId, by)
      case 'memory': {
        const target = this.store.member(it.memberId)
        if (!target) throw new Error('見つかりません')
        const text = it.text.slice(0, 600)
        if (it.kind === 'note' || it.kind === 'task') {
          if (target.id !== by.id) throw new Error('自分の記憶だけに足せます')
          return remember(this.store, by.id, it.kind, text, { importance: it.kind === 'note' ? 6 : 5 })
        }
        return remember(this.store, target.id, 'feedback', `${by.name}より：${text}`, { importance: 8 })
      }
    }
  }

  stop(): void {
    if (this.beat) clearInterval(this.beat)
    void this.rt.room?.presence({ runner: null }).catch(() => {})
  }
}

function unavailableEngine(): Engine {
  const fail = () => Promise.reject(new Error('このページでは Claude を使えません（claude.ai の設定で、このアーティファクトに Claude の利用を許可してください）'))
  return {
    info: { mode: 'artifact', detail: 'Claude を使えません' },
    plan: fail,
    runTask: fail,
    consult: fail,
    report: fail,
    reflect: fail,
    organize: fail,
  }
}
