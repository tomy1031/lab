// 会社の司令塔（オーケストレーター）。
// ゴール → ネクマックスが分解（plan）→ 足りない職種の AI社員を採用 → タスクを担当者へ（人間にしかできない仕事は人間へ）
// → 前のタスクが終わったものから着手（AI は Claude Code のセッション、人間は画面の「マイタスク」）
// → 終わるたびに担当者の記憶（コンテキスト）を足す → 全部終わったら完了報告。
// Node（server/index.ts）でも、ブラウザ（アーティファクト版の、承認する人のページ）でも動く。
import type { GateInfo, GateSettings, Goal, Member, Message, MessageKind, OfficeId, StockItem, StockKind, StockStatus, Task } from '../shared/types'
import { OFFICES, countryOf, officeInfo } from '../shared/types'
import type { CoreStore } from './coreStore'
import type { Engine, HireSpec } from './engine/types'
import { contextOf, remember } from './memory'
import { agentName, clip, hashStr, id, lookForAgent, now, sleep } from './util'
import type { Workspace } from './workspace'

const env = (k: string): string | undefined => (typeof process !== 'undefined' ? process.env?.[k] : undefined)

export interface CompanyOptions {
  /** 同時に動かす AI社員の数 */
  maxParallel?: number
  /** 演出の間（採用の登場・ネクマックスが歩く時間）の倍率。テストでは 0 */
  pace?: number
  /** 自動承認してよい状況か（アーティファクト版：承認する人のページが開いていて見えているときだけ） */
  canAutoApprove?: () => boolean
  /** 承認の関所の状態に足す情報（アーティファクト版：承認する人のページが開いているか） */
  gateExtra?: () => Partial<GateInfo>
}

export class Company {
  private running = new Map<string, AbortController>()
  private streamBuf = new Map<string, { text: string; at: number }>()
  private readonly maxParallel: number
  private readonly pace: number

  constructor(
    readonly store: CoreStore,
    private readonly getEngine: () => Engine,
    readonly workspace: Workspace,
    private readonly opts: CompanyOptions = {},
  ) {
    this.maxParallel = opts.maxParallel ?? Number(env('MAX_PARALLEL_AGENTS') || 3)
    this.pace = opts.pace ?? Number(env('PACE') ?? 1)
  }

  private beat(ms: number): Promise<void> {
    return sleep(ms * this.pace)
  }

  get engine(): Engine {
    return this.getEngine()
  }

  // ------------------------------------------------------------------ 人

  /** その拠点に仕事を配るネクマックス（東京は大阪の初号機が受け持つ） */
  nexmaxFor(office: OfficeId): Member {
    const all = this.store.state.members.filter((m) => m.kind === 'nexmax')
    return all.find((m) => m.office === office) ?? all.find((m) => countryOf(m.office) === countryOf(office)) ?? all[0]
  }

  /** 社長（ネクマックスはその分身） */
  ceo(): Member | undefined {
    return this.store.state.members.find((m) => m.kind === 'human' && /代表|社長|CEO/i.test(m.role))
  }

  private freeDesk(office: OfficeId): number | null {
    const desks = OFFICES.find((o) => o.id === office)?.desks ?? 12
    const used = new Set(this.store.state.members.filter((m) => m.office === office && m.deskIndex >= 0).map((m) => m.deskIndex))
    for (let i = 0; i < desks; i++) if (!used.has(i)) return i
    return null
  }

  /** 席の空いている拠点（希望の拠点が満席ならもう一方） */
  placeFor(office: OfficeId): { office: OfficeId; desk: number } | null {
    // 希望の拠点 → 同じ国の別の拠点 → どこか
    const order = [office, ...OFFICES.filter((o) => o.id !== office && o.country === countryOf(office)).map((o) => o.id), ...OFFICES.filter((o) => o.country !== countryOf(office)).map((o) => o.id)]
    for (const o of order) {
      const d = this.freeDesk(o)
      if (d !== null) return { office: o, desk: d }
    }
    return null
  }

  hireAgent(spec: HireSpec, by: Member): Member | null {
    const place = this.placeFor(spec.office)
    if (!place) {
      this.activity('warn', `席が満席のため「${spec.role}」を採用できませんでした`)
      return null
    }
    const taken = new Set(this.store.state.members.map((m) => m.name))
    const name = spec.name && !taken.has(spec.name) ? spec.name : agentName(place.office, taken)
    const m: Member = {
      id: id('ag'),
      kind: 'agent',
      name,
      role: spec.role,
      office: place.office,
      skills: spec.skills,
      languages: spec.languages,
      persona: spec.persona,
      look: lookForAgent(spec.role, hashStr(name + spec.role)),
      deskIndex: place.desk,
      status: 'idle',
      hiredAt: now(),
      hiredBy: by.id,
      hireReason: spec.reason,
      stats: { tasksDone: 0, messages: 0 },
    }
    this.store.state.members.push(m)
    this.store.send({ t: 'hired', member: m, reason: spec.reason, by: by.id })
    this.activity('hire', `🎉 ${m.name}（${m.role}）を${officeInfo(place.office).name}に採用：${spec.reason}`, m.id)
    remember(this.store, m.id, 'note', `入社。採用理由：${spec.reason}`, { importance: 4 })
    return m
  }

  // ------------------------------------------------------------------ 記録の小道具

  activity(level: 'info' | 'success' | 'warn' | 'hire', text: string, memberId?: string, goalId?: string): void {
    this.store.addActivity({ id: id('act'), at: now(), level, text, memberId, goalId })
  }

  say(from: Member, to: Member | null, kind: MessageKind, text: string, goalId?: string, taskId?: string, replyTo?: string): Message {
    return this.store.addMessage({ id: id('msg'), at: now(), fromId: from.id, toId: to?.id ?? null, kind, text: clip(text, 600), goalId, taskId, replyTo })
  }

  // ------------------------------------------------------------------ 人間との会話

  /**
   * 人間が誰かに話しかける。AI社員・ネクマックスはその人の記憶を踏まえてすぐ答える。
   * 承認する人以外から AI への話しかけは、承認されてから答える（Claude を動かすため）
   */
  async talk(from: Member, to: Member, text: string): Promise<void> {
    if (to.kind !== 'human' && this.needsApproval(from)) {
      const q = this.store.addMessage({ id: id('msg'), at: now(), fromId: from.id, toId: to.id, kind: 'chat', text: clip(text, 600), approval: { state: 'pending' } })
      this.askApproval(from, `${to.name}への話しかけ「${clip(text, 40)}」`)
      if (this.autoAllowed(from)) await this.approveTalk(q.id, null)
      return
    }
    const q = this.say(from, to, 'chat', text)
    if (to.kind === 'human') {
      remember(this.store, to.id, 'conversation', `${from.name}さんから：${clip(text, 160)}`, { importance: 4 })
      return
    }
    await this.answerTalk(q, from, to, text)
  }

  private async answerTalk(q: Message, from: Member, to: Member, text: string): Promise<void> {
    const prev = { status: to.status, statusText: to.statusText }
    this.status(to, 'talking', `${from.name}さんと会話中`)
    try {
      const answer = await this.engine.consult({ goal: undefined, from, to: contextOf(this.store, to), question: text })
      this.say(to, from, 'answer', answer, undefined, undefined, q.id)
      remember(this.store, to.id, 'conversation', `${from.name}さん（人間）と会話：「${clip(text, 80)}」→ ${clip(answer, 120)}`, { importance: 5 })
      remember(this.store, from.id, 'conversation', `${to.name}に「${clip(text, 80)}」と話した`, { importance: 3 })
    } catch (e) {
      this.say(to, from, 'answer', `ごめんなさい、いま答えられませんでした（${(e as Error).message}）`, undefined, undefined, q.id)
    } finally {
      const cur = this.store.member(to.id)
      if (cur?.status === 'talking') this.status(cur, prev.status === 'talking' ? 'idle' : prev.status, prev.statusText)
    }
  }

  /** AI社員から人間への質問に返事する。返事は質問した人の記憶に入り、次の仕事で使われる */
  reply(messageId: string, by: Member, text: string): Message {
    const q = this.store.state.messages.find((m) => m.id === messageId)
    if (!q || q.toId !== by.id) throw new Error('あなた宛ての質問ではありません')
    if (this.store.state.messages.some((m) => m.replyTo === messageId)) throw new Error('もう返事しています')
    const asker = this.store.member(q.fromId)
    if (!asker) throw new Error('質問した人がいません')
    const a = this.say(by, asker, 'answer', text, q.goalId, q.taskId, q.id)
    remember(this.store, asker.id, 'feedback', `${by.name}さん（人間）から回答：「${clip(q.text, 60)}」→ ${clip(text, 200)}`, { importance: 8, goalId: q.goalId, taskId: q.taskId })
    remember(this.store, by.id, 'conversation', `${asker.name}の質問「${clip(q.text, 60)}」に回答`, { importance: 3, goalId: q.goalId })
    return a
  }

  status(m: Member, status: Member['status'], statusText?: string, currentTaskId?: string | null): void {
    this.store.patchMember(m.id, { status, statusText, ...(currentTaskId !== undefined ? { currentTaskId } : {}) })
  }

  // ------------------------------------------------------------------ ゴール

  /** ゴールを受け取る。承認する人以外が出したゴールは、承認されるまで「承認待ち」 */
  createGoal(by: Member, title: string, description: string): Goal {
    const gated = this.needsApproval(by)
    const g: Goal = {
      id: id('goal'),
      title,
      description,
      createdBy: by.id,
      createdAt: now(),
      status: gated ? 'awaiting_approval' : 'planning',
      taskIds: [],
      ...(gated ? { approval: { state: 'pending' as const } } : {}),
    }
    this.store.putGoal(g)
    this.activity('info', `${by.name} さんがゴール「${title}」を伝えました${gated ? '（承認待ち）' : ''}`, by.id, g.id)
    if (!gated) void this.planGoal(g, by)
    else {
      this.askApproval(by, `ゴール「${clip(title, 40)}」`, g.id)
      if (this.autoAllowed(by)) this.approveGoal(g.id, null)
    }
    return g
  }

  // ------------------------------------------------------------------ 承認の関所（Claude を動かすものは、承認する人が「始める」を押してから）

  /** 承認する人：設定された人 → 管理者の社長 → 最初の管理者 */
  approver(): Member | undefined {
    const humans = this.store.state.members.filter((m) => m.kind === 'human')
    const set = this.store.member(this.store.gate().approverId)
    if (set?.kind === 'human') return set
    const ceo = this.ceo()
    if (ceo?.isAdmin) return ceo
    return humans.find((m) => m.isAdmin)
  }

  needsApproval(by: Member): boolean {
    const a = this.approver()
    return !!a && a.id !== by.id
  }

  /** 今日、自動承認で通した件数（ゴール＋話しかけ） */
  autoToday(): number {
    const today = new Date().toDateString()
    const isToday = (at?: string) => !!at && new Date(at).toDateString() === today
    return (
      this.store.state.goals.filter((g) => g.approval?.auto && isToday(g.approval.at)).length +
      this.store.state.messages.filter((m) => m.approval?.auto && isToday(m.approval.at)).length
    )
  }

  autoAllowed(by: Member): boolean {
    const gate = this.store.gate()
    if (gate.mode !== 'auto') return false
    if (gate.autoFrom !== 'all' && !gate.autoFrom.includes(by.id)) return false
    if (this.autoToday() >= gate.dailyLimit) return false
    return this.opts.canAutoApprove ? this.opts.canAutoApprove() : true
  }

  gateInfo(): GateInfo {
    return { ...this.store.gate(), approverId: this.approver()?.id ?? null, autoToday: this.autoToday(), ...this.opts.gateExtra?.() }
  }

  /** 承認の関所の状態を、全員の画面へ */
  sendGate(): void {
    this.store.emit('event', { t: 'gate', gate: this.gateInfo() })
  }

  setGate(by: Member, patch: Partial<GateSettings>): GateInfo {
    const a = this.approver()
    if (!by.isAdmin && by.id !== a?.id) throw new Error('承認の設定を変えられるのは、承認する人か管理者だけです')
    const next: Partial<GateSettings> = {}
    if (patch.mode === 'manual' || patch.mode === 'auto') next.mode = patch.mode
    if (patch.approverId !== undefined) {
      const m = this.store.member(patch.approverId)
      if (!m || m.kind !== 'human') throw new Error('承認する人は、登録された人間から選んでください')
      next.approverId = m.id
    }
    if (patch.autoFrom !== undefined) {
      next.autoFrom = patch.autoFrom === 'all' ? 'all' : (Array.isArray(patch.autoFrom) ? patch.autoFrom : []).filter((x) => this.store.member(x)?.kind === 'human').slice(0, 50)
    }
    if (patch.dailyLimit !== undefined) next.dailyLimit = Math.max(0, Math.min(50, Math.round(Number(patch.dailyLimit) || 0)))
    this.store.setGate(next)
    this.activity('info', `${by.name} さんが承認の設定を変えました（${this.store.gate().mode === 'auto' ? `自動承認・1 日 ${this.store.gate().dailyLimit} 件まで` : '毎回手で承認'}）`, by.id)
    this.sendGate()
    this.sweepAuto()
    return this.gateInfo()
  }

  /** 承認する人へ「お願いします」を届ける */
  private askApproval(from: Member, what: string, goalId?: string): void {
    const a = this.approver()
    if (!a) return
    this.say(from, a, 'chat', `承認をお願いします：${what}`, goalId)
    this.activity('info', `🔒 ${from.name} さんの${what}が、${a.name} さんの承認待ちになりました`, from.id, goalId)
  }

  checkApprover(by: Member | null): void {
    if (!by) return // 自動承認
    const a = this.approver()
    if (a && by.id !== a.id) throw new Error(`承認できるのは ${a.name} さんだけです`)
  }

  /** ゴールを承認して始める（by = null は自動承認） */
  approveGoal(goalId: string, by: Member | null): Goal {
    const g = this.store.goal(goalId)
    if (!g || g.status !== 'awaiting_approval') throw new Error('このゴールはいま承認待ちではありません')
    this.checkApprover(by)
    const requester = this.store.member(g.createdBy)
    this.store.patchGoal(g.id, { status: 'planning', approval: { state: 'approved', by: by?.id, at: now(), auto: !by } })
    this.activity('success', by ? `✅ ${by.name} さんが「${g.title}」を承認しました` : `✅ 「${g.title}」を自動承認しました（今日 ${this.autoToday()} 件目）`, by?.id, g.id)
    if (requester) void this.planGoal(this.store.goal(g.id)!, requester)
    this.sendGate()
    return g
  }

  declineGoal(goalId: string, by: Member, note = ''): Goal {
    const g = this.store.goal(goalId)
    if (!g || g.status !== 'awaiting_approval') throw new Error('このゴールはいま承認待ちではありません')
    this.checkApprover(by)
    this.store.patchGoal(g.id, { status: 'cancelled', finishedAt: now(), approval: { state: 'declined', by: by.id, at: now(), note: note || undefined } })
    const requester = this.store.member(g.createdBy)
    if (requester) this.say(by, requester, 'chat', `「${clip(g.title, 40)}」は今回は見送ります${note ? `：${clip(note, 120)}` : ''}`, g.id)
    this.activity('warn', `${by.name} さんが「${g.title}」を見送りました`, by.id, g.id)
    return g
  }

  /** AI への話しかけを承認して、答えさせる（by = null は自動承認） */
  async approveTalk(messageId: string, by: Member | null): Promise<void> {
    const q = this.store.state.messages.find((m) => m.id === messageId)
    if (!q || q.approval?.state !== 'pending') throw new Error('この話しかけはいま承認待ちではありません')
    this.checkApprover(by)
    const from = this.store.member(q.fromId)
    const to = this.store.member(q.toId)
    this.store.patchMessage(q.id, { approval: { state: 'approved', by: by?.id, at: now(), auto: !by } })
    this.sendGate()
    if (from && to) await this.answerTalk(q, from, to, q.text)
  }

  declineTalk(messageId: string, by: Member, note = ''): void {
    const q = this.store.state.messages.find((m) => m.id === messageId)
    if (!q || q.approval?.state !== 'pending') throw new Error('この話しかけはいま承認待ちではありません')
    this.checkApprover(by)
    this.store.patchMessage(q.id, { approval: { state: 'declined', by: by.id, at: now(), note: note || undefined } })
    const from = this.store.member(q.fromId)
    if (from) this.say(by, from, 'chat', `${this.store.member(q.toId)?.name ?? 'AI'}への話しかけは今回は見送ります${note ? `：${clip(note, 120)}` : ''}`, undefined, undefined, q.id)
  }

  /** 承認待ちの一覧（古い順） */
  pendingApprovals(): { kind: 'goal' | 'talk'; id: string; by: string; at: string; text: string }[] {
    return [
      ...this.store.state.goals.filter((g) => g.status === 'awaiting_approval').map((g) => ({ kind: 'goal' as const, id: g.id, by: g.createdBy, at: g.createdAt, text: g.title })),
      ...this.store.state.messages.filter((m) => m.approval?.state === 'pending').map((m) => ({ kind: 'talk' as const, id: m.id, by: m.fromId, at: m.at, text: m.text })),
    ].sort((a, b) => a.at.localeCompare(b.at))
  }

  /** 自動承認にした・承認する人がページを開いた：ルールに合う承認待ちを通す */
  sweepAuto(): void {
    for (const p of this.pendingApprovals()) {
      const by = this.store.member(p.by)
      if (!by || !this.autoAllowed(by)) continue
      if (p.kind === 'goal') this.approveGoal(p.id, null)
      else void this.approveTalk(p.id, null).catch((e) => console.error('[auto]', e))
    }
  }

  private async planGoal(goal: Goal, by: Member): Promise<void> {
    const nx = this.nexmaxFor(by.office)
    this.say(by, nx, 'assign', `ゴール：${goal.title}`, goal.id)
    this.status(nx, 'thinking', 'ゴールを分解中…')
    try {
      const roster = this.store.state.members.map((m) => contextOf(this.store, m, 6))
      const ceo = this.ceo()
      const plan = await this.engine.plan({ goal, roster, requester: by, ceo: ceo ? contextOf(this.store, ceo, 10) : undefined })
      if (this.store.goal(goal.id)?.status === 'cancelled') return

      // 採用
      const hiredByKey = new Map<string, string>()
      for (const h of plan.hires) {
        const m = this.hireAgent(h, nx)
        if (m) {
          hiredByKey.set(h.key, m.id)
          this.say(nx, null, 'hire', `${m.name}さん（${m.role}）を採用しました！`, goal.id)
          await this.beat(1400)
        }
      }

      // タスク
      const keyToId = new Map<string, string>()
      for (const t of plan.tasks) keyToId.set(t.key, id('task'))
      const tasks: Task[] = plan.tasks.map((t, i) => {
        let assignee = t.assignee ? (hiredByKey.get(t.assignee) ?? (this.store.member(t.assignee) ? t.assignee : undefined)) : undefined
        let assignReason = t.assigneeReason
        const am = this.store.member(assignee)
        if (!am || am.kind === 'nexmax' || (t.requiresHuman && am.kind !== 'human') || (!t.requiresHuman && am.kind === 'human' && !am.login)) {
          const s = this.staff(t.requiresHuman, t.skills, t.office, by)
          assignee = s?.id
          assignReason = s ? this.reasonFor(s, t.skills, t.office) : undefined
        }
        if (!assignReason && assignee && t.requiresHuman) assignReason = this.reasonFor(this.store.member(assignee)!, t.skills, t.office)
        return {
          id: keyToId.get(t.key)!,
          goalId: goal.id,
          key: t.key,
          title: t.title,
          description: t.description,
          skills: t.skills,
          requiresHuman: t.requiresHuman,
          humanReason: t.humanReason,
          office: t.office,
          assigneeId: assignee ?? null,
          assignReason,
          dependsOn: t.dependsOn.map((d) => keyToId.get(d)!).filter(Boolean),
          status: 'todo',
          order: i,
        }
      })
      for (const t of tasks) this.store.putTask(t)
      this.store.patchGoal(goal.id, { status: 'running', planSummary: plan.summary, taskIds: tasks.map((t) => t.id) })
      this.status(nx, 'idle', undefined)
      this.say(nx, null, 'system', plan.summary || `「${goal.title}」を ${tasks.length} 個に分けました`, goal.id)
      this.activity('info', `ネクマックスが「${goal.title}」を ${tasks.length} 個のタスクに分解（人間 ${tasks.filter((t) => t.requiresHuman).length}・AI ${tasks.filter((t) => !t.requiresHuman).length}）`, nx.id, goal.id)
      remember(this.store, nx.id, 'task', `ゴール「${goal.title}」を分解：${tasks.map((t) => t.title).join(' / ')}`, { importance: 5, goalId: goal.id })
      this.schedule()
    } catch (e) {
      console.error('[plan]', e)
      this.status(nx, 'idle', undefined)
      this.store.patchGoal(goal.id, { status: 'failed', report: `分解に失敗しました：${(e as Error).message}` })
      this.activity('warn', `「${goal.title}」の分解に失敗：${(e as Error).message}`, nx.id, goal.id)
    }
  }

  /** 「なぜこの人か」の短い説明 */
  reasonFor(m: Member, skills: string[], office?: OfficeId): string {
    const matched = skills.filter((s) => m.skills.some((x) => x.includes(s) || s.includes(x)))
    const past = this.store.memoryOf(m.id).filter((e) => e.kind === 'task').length
    const parts = [`${officeInfo(m.office).name}${office && m.office === office ? '（現地）' : ''}`]
    if (matched.length) parts.push(`${matched.slice(0, 3).join('・')}ができる`)
    if (past) parts.push(`これまで ${past} 件担当`)
    return parts.join('・')
  }

  /** 担当者を選ぶ（スキルの一致・拠点・いまの仕事量） */
  staff(human: boolean, skills: string[], office: OfficeId | undefined, requester: Member): Member | undefined {
    const pool = this.store.state.members.filter((m) => (human ? m.kind === 'human' : m.kind === 'agent'))
    if (!pool.length) return human ? requester : undefined
    const load = (m: Member) => this.store.state.tasks.filter((t) => t.assigneeId === m.id && !['done', 'failed', 'cancelled'].includes(t.status)).length
    const scoreOf = (m: Member) =>
      skills.filter((s) => m.skills.some((x) => x.includes(s) || s.includes(x)) || m.role.includes(s)).length * 2 +
      (office && m.office === office ? 1.5 : office && countryOf(m.office) === countryOf(office) ? 0.7 : 0) -
      (human && /代表|社長/.test(m.role) ? 1.5 : 0) -
      load(m) * 0.5 +
      (human && m.login ? 0.5 : 0)
    return [...pool].sort((a, b) => scoreOf(b) - scoreOf(a))[0]
  }

  cancelGoal(goalId: string, by: Member): void {
    const g = this.store.goal(goalId)
    if (!g || ['done', 'cancelled'].includes(g.status)) return
    if (by.id !== g.createdBy && !by.isAdmin && by.id !== this.approver()?.id) throw new Error('中止できるのは、出した人・承認する人・管理者だけです')
    for (const t of this.store.tasksOf(goalId)) {
      this.running.get(t.id)?.abort()
      if (!['done', 'failed'].includes(t.status)) this.store.patchTask(t.id, { status: 'cancelled' })
    }
    this.store.patchGoal(goalId, { status: 'cancelled', finishedAt: now() })
    this.activity('warn', `${by.name} さんが「${g.title}」を中止しました`, by.id, goalId)
  }

  // ------------------------------------------------------------------ 進行

  private scheduling = false

  schedule(): void {
    if (this.scheduling) return
    this.scheduling = true
    try {
      for (const g of this.store.state.goals) {
        if (!['running', 'waiting_human'].includes(g.status)) continue
        const tasks = this.store.tasksOf(g.id)
        if (tasks.length && tasks.every((t) => t.status === 'done')) {
          void this.finishGoal(g)
          continue
        }
        for (const t of tasks) {
          if (!['todo', 'blocked'].includes(t.status)) continue
          const ready = t.dependsOn.every((d) => this.store.task(d)?.status === 'done')
          if (!ready) {
            if (t.status !== 'blocked') this.store.patchTask(t.id, { status: 'blocked' })
            continue
          }
          if (t.requiresHuman) this.handToHuman(g, t)
          else this.tryStartAgent(g, t)
        }
        const open = tasks.filter((t) => !['done', 'cancelled'].includes(t.status))
        const humanWait = open.length > 0 && open.every((t) => t.status === 'waiting_human' || t.status === 'blocked') && open.some((t) => t.status === 'waiting_human')
        const next = humanWait ? 'waiting_human' : 'running'
        if (g.status !== next) this.store.patchGoal(g.id, { status: next })
      }
    } finally {
      this.scheduling = false
    }
  }

  private handToHuman(g: Goal, t: Task): void {
    const human = this.store.member(t.assigneeId) ?? this.store.member(g.createdBy)
    if (!human) return
    this.store.patchTask(t.id, { status: 'waiting_human', assigneeId: human.id, startedAt: now() })
    const nx = this.nexmaxFor(human.office)
    this.say(nx, human, 'assign', `${human.name}さん、お願いします：「${t.title}」${t.humanReason ? `（${t.humanReason}）` : ''}`, g.id, t.id)
    this.activity('info', `👤 ${human.name} さんに「${t.title}」をお願いしました`, human.id, g.id)
  }

  private tryStartAgent(g: Goal, t: Task): void {
    if (this.running.size >= this.maxParallel) return
    let agent = this.store.member(t.assigneeId)
    if (!agent || agent.kind !== 'agent') {
      agent = this.staff(false, t.skills, t.office, this.store.member(g.createdBy)!)
      if (!agent) return
      this.store.patchTask(t.id, { assigneeId: agent.id })
    }
    const busy = this.store.state.tasks.some((x) => x.assigneeId === agent!.id && x.status === 'in_progress')
    if (busy) return
    void this.runAgentTask(g, t, agent)
  }

  private async runAgentTask(g: Goal, t: Task, agent: Member): Promise<void> {
    const ac = new AbortController()
    this.running.set(t.id, ac)
    this.store.patchTask(t.id, { status: 'in_progress', startedAt: now() })
    const nx = this.nexmaxFor(agent.office)
    this.say(nx, agent, 'assign', `${agent.name}さん、「${t.title}」をお願いします`, g.id, t.id)
    this.status(agent, 'thinking', t.title, t.id)
    await this.beat(1500)

    const workdir = this.workspace.dir(g.id)
    const before = this.workspace.list(g.id)
    const inputs = t.dependsOn
      .map((d) => this.store.task(d))
      .filter((x): x is Task => !!x && !!x.output)
      .map((x) => ({ title: x.title, by: this.store.member(x.assigneeId)?.name ?? '不明', output: x.output! }))
    const colleagues = this.store.state.members.filter((m) => m.id !== agent.id)

    this.status(agent, 'working', t.title, t.id)
    try {
      const res = await this.engine.runTask({
        goal: g,
        task: t,
        me: contextOf(this.store, agent),
        colleagues,
        inputs,
        workdir,
        writeFile: (name, content) => this.workspace.write(g.id, name, content),
        signal: ac.signal,
        onText: (text) => this.stream(agent, t, text),
        tools: {
          askColleague: (who, q) => this.consult(agent, who, q, g, t),
          postUpdate: (text) => {
            this.say(agent, nx, 'chat', text, g.id, t.id)
          },
        },
      })
      if (ac.signal.aborted) return
      const files = this.workspace.list(g.id).filter((f) => !before.includes(f))
      this.store.patchTask(t.id, { status: 'done', output: res.output, files, finishedAt: now() })
      this.store.patchMember(agent.id, { status: 'idle', statusText: undefined, currentTaskId: null, stats: { ...agent.stats, tasksDone: agent.stats.tasksDone + 1 } })
      remember(this.store, agent.id, 'task', `「${t.title}」（ゴール：${g.title}）を完了。${res.memoryNote || clip(res.output, 160)}`, { importance: 6, goalId: g.id, taskId: t.id })
      void this.maybeReflect(agent.id)

      // 次の担当へ引き継ぎ（いなければネクマックスへ報告）
      const next = this.store.tasksOf(g.id).find((x) => x.dependsOn.includes(t.id) && x.assigneeId && x.assigneeId !== agent.id)
      const nextMember = this.store.member(next?.assigneeId)
      if (next && nextMember) this.say(agent, nextMember, 'handoff', `「${t.title}」できました。「${next.title}」に使ってください`, g.id, t.id)
      else this.say(agent, nx, 'report', `「${t.title}」完了しました`, g.id, t.id)
      this.activity('success', `✅ ${agent.name}：「${t.title}」完了${files.length ? `（ファイル ${files.length} 件）` : ''}`, agent.id, g.id)
    } catch (e) {
      if (ac.signal.aborted) return
      console.error('[task]', t.title, e)
      this.store.patchTask(t.id, { status: 'failed', output: `失敗：${(e as Error).message}`, finishedAt: now() })
      this.status(agent, 'idle', undefined, null)
      this.activity('warn', `⚠️ ${agent.name}：「${t.title}」が失敗しました（${(e as Error).message}）`, agent.id, g.id)
    } finally {
      this.running.delete(t.id)
      this.streamBuf.delete(t.id)
      if (ac.signal.aborted) this.status(agent, 'idle', undefined, null)
      this.schedule()
    }
  }

  retryTask(taskId: string, by: Member): void {
    const t = this.store.task(taskId)
    if (!t || t.status !== 'failed') return
    this.store.patchTask(taskId, { status: 'todo', output: undefined })
    const g = this.store.goal(t.goalId)
    if (g && g.status === 'failed') this.store.patchGoal(g.id, { status: 'running' })
    this.activity('info', `${by.name} さんが「${t.title}」をやり直しにしました`, by.id, t.goalId)
    this.schedule()
  }

  private stream(agent: Member, t: Task, text: string): void {
    const b = this.streamBuf.get(t.id) ?? { text: '', at: 0 }
    b.text = (b.text + text).slice(-600)
    this.streamBuf.set(t.id, b)
    const nowMs = Date.now()
    if (nowMs - b.at > 500) {
      b.at = nowMs
      this.store.emit('event', { t: 'stream', memberId: agent.id, taskId: t.id, text: b.text })
    }
  }

  /** 同僚への相談。AI どうしならその場で答える。人間には質問を残す */
  async consult(from: Member, who: string, question: string, g?: Goal, t?: Task): Promise<string> {
    const to =
      this.store.member(who) ??
      this.store.state.members.find((m) => m.name === who) ??
      this.store.state.members.find((m) => m.id !== from.id && (m.name.includes(who) || who.includes(m.name) || m.role.includes(who)))
    if (!to || to.id === from.id) return `「${who}」という同僚は見つかりませんでした。いる人：${this.store.state.members.filter((m) => m.id !== from.id).map((m) => m.name).join('、')}`
    this.say(from, to, 'question', question, g?.id, t?.id)
    if (to.kind === 'human') {
      remember(this.store, to.id, 'conversation', `${from.name}から質問：${clip(question, 120)}`, { importance: 4, goalId: g?.id })
      return `${to.name}さん（人間）に質問を残しました。返事は後になるので、仮の前提を置いて進め、成果に「要確認」と書いてください。`
    }
    const prev = { status: to.status, statusText: to.statusText }
    this.status(to, 'talking', `${from.name}と相談中`)
    this.status(from, 'talking', `${to.name}に相談中`)
    try {
      const answer = await this.engine.consult({ goal: g, from, to: contextOf(this.store, to), question })
      this.say(to, from, 'answer', answer, g?.id, t?.id)
      remember(this.store, to.id, 'conversation', `${from.name}の相談「${clip(question, 60)}」に回答：${clip(answer, 100)}`, { importance: 3, goalId: g?.id })
      remember(this.store, from.id, 'conversation', `${to.name}に相談「${clip(question, 60)}」→ ${clip(answer, 100)}`, { importance: 3, goalId: g?.id })
      return answer
    } finally {
      this.status(to, prev.status === 'talking' ? 'idle' : prev.status, prev.statusText)
      this.status(from, 'working', t?.title)
    }
  }

  completeHumanTask(taskId: string, by: Member, note: string): Task {
    const t = this.store.task(taskId)
    if (!t) throw new Error('タスクが見つかりません')
    if (t.status !== 'waiting_human') throw new Error('このタスクはいま人間の対応待ちではありません')
    if (t.assigneeId !== by.id && !by.isAdmin) throw new Error('担当者（または管理者）だけが完了にできます')
    const g = this.store.goal(t.goalId)
    this.store.patchTask(t.id, { status: 'done', output: note || '対応しました', finishedAt: now(), assigneeId: t.assigneeId ?? by.id })
    const m = this.store.member(t.assigneeId) ?? by
    this.store.patchMember(m.id, { stats: { ...m.stats, tasksDone: m.stats.tasksDone + 1 } })
    remember(this.store, m.id, 'task', `「${t.title}」（ゴール：${g?.title ?? ''}）を対応。メモ：${clip(note || 'なし', 200)}`, { importance: 7, goalId: t.goalId, taskId: t.id })
    void this.maybeReflect(m.id)
    this.say(by, this.nexmaxFor(by.office), 'report', `「${t.title}」対応しました${note ? `：${clip(note, 80)}` : ''}`, t.goalId, t.id)
    this.activity('success', `✅ ${by.name}：「${t.title}」対応完了`, by.id, t.goalId)
    this.schedule()
    return t
  }

  private reflecting = new Set<string>()

  /** 仕事の記憶が 3 件たまるごとに、ふりかえり（気づき）を記憶に足す */
  private async maybeReflect(memberId: string): Promise<void> {
    const m = this.store.member(memberId)
    if (!m || this.reflecting.has(memberId)) return
    const mem = this.store.memoryOf(memberId)
    let lastReflect = -1
    mem.forEach((e, i) => {
      if (e.kind === 'reflection') lastReflect = i
    })
    const since = mem.slice(lastReflect + 1).filter((e) => e.kind === 'task').length
    if (since < 3) return
    this.reflecting.add(memberId)
    try {
      const text = await this.engine.reflect(contextOf(this.store, m, 20))
      if (text) {
        remember(this.store, memberId, 'reflection', text, { importance: 8 })
        this.activity('info', `💭 ${m.name}がこれまでの仕事をふりかえりました`, memberId)
      }
    } catch (e) {
      console.error('[reflect]', e)
    } finally {
      this.reflecting.delete(memberId)
    }
  }

  private finishing = new Set<string>()

  private async finishGoal(g: Goal): Promise<void> {
    if (this.finishing.has(g.id)) return
    this.finishing.add(g.id)
    const requester = this.store.member(g.createdBy)
    const nx = this.nexmaxFor(requester?.office ?? 'osaka')
    this.status(nx, 'thinking', '完了報告を作成中…')
    try {
      const tasks = this.store.tasksOf(g.id).map((t) => ({ ...t, assigneeName: this.store.member(t.assigneeId)?.name ?? '不明' }))
      let report: string
      try {
        report = await this.engine.report({ goal: g, tasks })
      } catch (e) {
        report = `「${g.title}」の全タスクが完了しました（報告書の作成に失敗：${(e as Error).message}）`
      }
      this.store.patchGoal(g.id, { status: 'done', report, finishedAt: now() })
      this.say(nx, requester ?? null, 'report', `「${g.title}」完了です！報告書をどうぞ`, g.id)
      // 社長の分身として、依頼者が社長でなくても社長には必ず報告する
      const ceo = this.ceo()
      if (ceo && ceo.id !== requester?.id) this.say(this.nexmaxFor('osaka'), ceo, 'report', `社長、「${g.title}」が完了しました（依頼：${requester?.name ?? '不明'}）`, g.id)
      this.activity('success', `🎊 ゴール「${g.title}」完了！`, nx.id, g.id)
      remember(this.store, nx.id, 'task', `ゴール「${g.title}」完了。担当：${[...new Set(tasks.map((t) => t.assigneeName))].join('、')}`, { importance: 6, goalId: g.id })
      if (requester) remember(this.store, requester.id, 'feedback', `依頼したゴール「${g.title}」が完了`, { importance: 4, goalId: g.id })
    } finally {
      this.status(nx, 'idle', undefined)
      this.finishing.delete(g.id)
    }
  }

  // ------------------------------------------------------------------ やることストック（マイクで話したこと）

  private organizeTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private organizing = new Set<string>()

  /** 話した（書いた）ことを受け取る。少し待って、まとめてネクマックスが整理する */
  addStock(member: Member, text: string): StockItem {
    const t = now()
    const item = this.store.putStock({ id: id('stk'), owner: member.id, at: t, updatedAt: t, raw: text, title: clip(text, 20), kind: 'goal', priority: 2, status: 'organizing' })
    this.scheduleOrganize(member.id, 2500)
    return item
  }

  private scheduleOrganize(memberId: string, ms: number): void {
    clearTimeout(this.organizeTimers.get(memberId))
    this.organizeTimers.set(
      memberId,
      setTimeout(() => void this.organizeFor(memberId), ms * Math.max(this.pace, 0.01)),
    )
  }

  private async organizeFor(memberId: string): Promise<void> {
    if (this.organizing.has(memberId)) return this.scheduleOrganize(memberId, 1500)
    const member = this.store.member(memberId)
    const pending = this.store.stockOf(memberId).filter((s) => s.status === 'organizing')
    if (!member || !pending.length) return
    this.organizing.add(memberId)
    const existing = this.store
      .stockOf(memberId)
      .filter((s) => s.status === 'ready' || s.status === 'later')
      .slice(-40)
    try {
      const out = await this.engine.organize({ member, items: pending.map((p) => ({ id: p.id, raw: p.raw })), existing: existing.map((e) => ({ id: e.id, title: e.title })) })
      for (const src of pending) {
        const mine = out.filter((o) => o.from === src.id)
        if (!mine.length) {
          // 用件が無い（相づちなど）と判断されたら消す
          this.store.putStock({ ...src, status: 'archived', updatedAt: now() })
          continue
        }
        mine.forEach((o, i) => {
          const dup = o.duplicateOf ? this.store.state.stock.find((s) => s.id === o.duplicateOf && s.owner === memberId && (s.status === 'ready' || s.status === 'later')) : undefined
          const base: StockItem = i === 0 ? src : { ...src, id: id('stk') }
          if (dup) {
            // 同じ用件：まとめ先に言葉を足し、急ぎなら上げる
            this.store.putStock({ ...dup, raw: `${dup.raw}\n${src.raw}`, priority: Math.min(dup.priority, o.priority) as 1 | 2 | 3, updatedAt: now(), status: 'ready' })
            if (i === 0) this.store.putStock({ ...base, status: 'archived', mergedInto: dup.id, title: clip(o.title, 24), updatedAt: now() })
            return
          }
          this.store.putStock({ ...base, title: clip(o.title, 24), summary: clip(o.summary, 60), kind: o.kind, priority: o.priority, status: 'ready', updatedAt: now() })
        })
      }
    } catch (e) {
      console.error('[organize]', e)
      // 整理に失敗しても、話したことは失わない（そのままの言葉で並べる）
      for (const src of pending) this.store.putStock({ ...src, status: 'ready', updatedAt: now() })
    } finally {
      this.organizing.delete(memberId)
    }
  }

  /** ストックへの 1 タップの操作 */
  actOnStock(itemId: string, by: Member, action: 'send' | 'done' | 'later' | 'archive' | 'restore', patch: { title?: string; kind?: StockKind } = {}): StockItem {
    const item = this.store.state.stock.find((s) => s.id === itemId)
    if (!item || item.owner !== by.id) throw new Error('あなたのストックではありません')
    const set = (status: StockStatus, extra: Partial<StockItem> = {}) => this.store.putStock({ ...item, ...patch, ...extra, status, updatedAt: now() })
    const title = patch.title ?? item.title
    switch (action) {
      case 'send': {
        // ネクマックスに任せる：そのままゴールにする（話した言葉も添える）
        const g = this.createGoal(by, title, [item.summary, `（話したこと）${item.raw}`].filter(Boolean).join('\n'))
        return set('sent', { goalId: g.id })
      }
      case 'done': {
        // 自分でやった・覚えておく：本人の記憶に入れる（次の割り振りに活きる）
        const kind = patch.kind ?? item.kind
        remember(this.store, by.id, kind === 'memo' ? 'note' : 'task', kind === 'memo' ? `メモ：${title}${item.summary ? `（${item.summary}）` : ''}` : `自分でやった：${title}`, { importance: kind === 'memo' ? 6 : 5 })
        return set('done')
      }
      case 'later':
        return set('later')
      case 'archive':
        return set('archived')
      case 'restore':
        return set('ready')
    }
  }

  /** 起動時：途中で止まったタスクを戻す */
  recover(): void {
    for (const t of this.store.state.tasks) if (t.status === 'in_progress') this.store.patchTask(t.id, { status: 'todo' })
    // 整理の途中で止まったストックは、もう一度整理する
    for (const owner of new Set(this.store.state.stock.filter((s) => s.status === 'organizing').map((s) => s.owner))) this.scheduleOrganize(owner, 1000)
    for (const g of this.store.state.goals) if (g.status === 'planning') this.store.patchGoal(g.id, { status: 'failed', report: 'サーバーの再起動で分解が中断しました。もう一度ゴールを伝えてください。' })
    for (const m of this.store.state.members) {
      if (m.kind !== 'human' && m.status !== 'idle') this.store.patchMember(m.id, { status: 'idle', statusText: undefined, currentTaskId: null })
      if (m.kind === 'human') this.store.patchMember(m.id, { online: false, status: 'offline' })
    }
    this.schedule()
    this.sweepAuto()
  }
}
