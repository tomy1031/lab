// 会社の司令塔（オーケストレーター）。
// ゴール → ネクマックスが分解（plan）→ 足りない職種の AI社員を採用 → タスクを担当者へ（人間にしかできない仕事は人間へ）
// → 前のタスクが終わったものから着手（AI は Claude Code のセッション、人間は画面の「マイタスク」）
// → 終わるたびに担当者の記憶（コンテキスト）を足す → 全部終わったら完了報告。
import { mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Goal, Member, MessageKind, OfficeId, Task } from '../shared/types'
import { OFFICES } from '../shared/types'
import type { Engine, HireSpec } from './engine/types'
import { contextOf, remember } from './memory'
import type { Store } from './store'
import { agentName, clip, hashStr, id, lookForAgent, now, sleep } from './util'

const MAX_PARALLEL = Number(process.env.MAX_PARALLEL_AGENTS || 3)

export class Company {
  private running = new Map<string, AbortController>()
  private streamBuf = new Map<string, { text: string; at: number }>()

  constructor(
    readonly store: Store,
    private readonly getEngine: () => Engine,
    readonly workspaceRoot: string,
  ) {}

  get engine(): Engine {
    return this.getEngine()
  }

  // ------------------------------------------------------------------ 人

  nexmaxFor(office: OfficeId): Member {
    const all = this.store.state.members.filter((m) => m.kind === 'nexmax')
    return all.find((m) => m.office === office) ?? all[0]
  }

  private freeDesk(office: OfficeId): number | null {
    const desks = OFFICES.find((o) => o.id === office)?.desks ?? 12
    const used = new Set(this.store.state.members.filter((m) => m.office === office && m.deskIndex >= 0).map((m) => m.deskIndex))
    for (let i = 0; i < desks; i++) if (!used.has(i)) return i
    return null
  }

  /** 席の空いている拠点（希望の拠点が満席ならもう一方） */
  placeFor(office: OfficeId): { office: OfficeId; desk: number } | null {
    const d = this.freeDesk(office)
    if (d !== null) return { office, desk: d }
    const other: OfficeId = office === 'jp' ? 'kh' : 'jp'
    const d2 = this.freeDesk(other)
    return d2 !== null ? { office: other, desk: d2 } : null
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
    this.activity('hire', `🎉 ${m.name}（${m.role}）を${place.office === 'jp' ? '大阪本社' : 'プノンペン'}に採用：${spec.reason}`, m.id)
    remember(this.store, m.id, 'note', `入社。採用理由：${spec.reason}`, { importance: 4 })
    return m
  }

  // ------------------------------------------------------------------ 記録の小道具

  activity(level: 'info' | 'success' | 'warn' | 'hire', text: string, memberId?: string, goalId?: string): void {
    this.store.addActivity({ id: id('act'), at: now(), level, text, memberId, goalId })
  }

  say(from: Member, to: Member | null, kind: MessageKind, text: string, goalId?: string, taskId?: string): void {
    this.store.addMessage({ id: id('msg'), at: now(), fromId: from.id, toId: to?.id ?? null, kind, text: clip(text, 400), goalId, taskId })
  }

  status(m: Member, status: Member['status'], statusText?: string, currentTaskId?: string | null): void {
    this.store.patchMember(m.id, { status, statusText, ...(currentTaskId !== undefined ? { currentTaskId } : {}) })
  }

  // ------------------------------------------------------------------ ゴール

  createGoal(by: Member, title: string, description: string): Goal {
    const g: Goal = { id: id('goal'), title, description, createdBy: by.id, createdAt: now(), status: 'planning', taskIds: [] }
    this.store.putGoal(g)
    this.activity('info', `${by.name} さんがゴール「${title}」を伝えました`, by.id, g.id)
    void this.planGoal(g, by)
    return g
  }

  private async planGoal(goal: Goal, by: Member): Promise<void> {
    const nx = this.nexmaxFor(by.office)
    this.say(by, nx, 'assign', `ゴール：${goal.title}`, goal.id)
    this.status(nx, 'thinking', 'ゴールを分解中…')
    try {
      const roster = this.store.state.members.map((m) => contextOf(this.store, m, 6))
      const plan = await this.engine.plan({ goal, roster, requester: by })
      if (this.store.goal(goal.id)?.status === 'cancelled') return

      // 採用
      const hiredByKey = new Map<string, string>()
      for (const h of plan.hires) {
        const m = this.hireAgent(h, nx)
        if (m) {
          hiredByKey.set(h.key, m.id)
          this.say(nx, null, 'hire', `${m.name}さん（${m.role}）を採用しました！`, goal.id)
          await sleep(1400)
        }
      }

      // タスク
      const keyToId = new Map<string, string>()
      for (const t of plan.tasks) keyToId.set(t.key, id('task'))
      const tasks: Task[] = plan.tasks.map((t, i) => {
        let assignee = t.assignee ? (hiredByKey.get(t.assignee) ?? (this.store.member(t.assignee) ? t.assignee : undefined)) : undefined
        const am = this.store.member(assignee)
        if (!am || am.kind === 'nexmax' || (t.requiresHuman && am.kind !== 'human') || (!t.requiresHuman && am.kind === 'human' && !am.login)) {
          assignee = this.staff(t.requiresHuman, t.skills, t.office, by)?.id
        }
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

  /** 担当者を選ぶ（スキルの一致・拠点・いまの仕事量） */
  staff(human: boolean, skills: string[], office: OfficeId | undefined, requester: Member): Member | undefined {
    const pool = this.store.state.members.filter((m) => (human ? m.kind === 'human' : m.kind === 'agent'))
    if (!pool.length) return human ? requester : undefined
    const load = (m: Member) => this.store.state.tasks.filter((t) => t.assigneeId === m.id && !['done', 'failed', 'cancelled'].includes(t.status)).length
    const scoreOf = (m: Member) =>
      skills.filter((s) => m.skills.some((x) => x.includes(s) || s.includes(x)) || m.role.includes(s)).length * 2 +
      (office && m.office === office ? 1.5 : 0) -
      load(m) * 0.5 +
      (human && m.login ? 0.5 : 0)
    return [...pool].sort((a, b) => scoreOf(b) - scoreOf(a))[0]
  }

  cancelGoal(goalId: string, by: Member): void {
    const g = this.store.goal(goalId)
    if (!g || ['done', 'cancelled'].includes(g.status)) return
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
    if (this.running.size >= MAX_PARALLEL) return
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
    await sleep(1500)

    const workdir = join(this.workspaceRoot, g.id)
    mkdirSync(workdir, { recursive: true })
    const before = listFiles(workdir)
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
      const files = listFiles(workdir).filter((f) => !before.includes(f))
      this.store.patchTask(t.id, { status: 'done', output: res.output, files, finishedAt: now() })
      this.store.patchMember(agent.id, { status: 'idle', statusText: undefined, currentTaskId: null, stats: { ...agent.stats, tasksDone: agent.stats.tasksDone + 1 } })
      remember(this.store, agent.id, 'task', `「${t.title}」（ゴール：${g.title}）を完了。${res.memoryNote || clip(res.output, 160)}`, { importance: 6, goalId: g.id, taskId: t.id })

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
    this.say(by, this.nexmaxFor(by.office), 'report', `「${t.title}」対応しました${note ? `：${clip(note, 80)}` : ''}`, t.goalId, t.id)
    this.activity('success', `✅ ${by.name}：「${t.title}」対応完了`, by.id, t.goalId)
    this.schedule()
    return t
  }

  private finishing = new Set<string>()

  private async finishGoal(g: Goal): Promise<void> {
    if (this.finishing.has(g.id)) return
    this.finishing.add(g.id)
    const requester = this.store.member(g.createdBy)
    const nx = this.nexmaxFor(requester?.office ?? 'jp')
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
      this.activity('success', `🎊 ゴール「${g.title}」完了！`, nx.id, g.id)
      remember(this.store, nx.id, 'task', `ゴール「${g.title}」完了。担当：${[...new Set(tasks.map((t) => t.assigneeName))].join('、')}`, { importance: 6, goalId: g.id })
      if (requester) remember(this.store, requester.id, 'feedback', `依頼したゴール「${g.title}」が完了`, { importance: 4, goalId: g.id })
    } finally {
      this.status(nx, 'idle', undefined)
      this.finishing.delete(g.id)
    }
  }

  /** 起動時：途中で止まったタスクを戻す */
  recover(): void {
    for (const t of this.store.state.tasks) if (t.status === 'in_progress') this.store.patchTask(t.id, { status: 'todo' })
    for (const g of this.store.state.goals) if (g.status === 'planning') this.store.patchGoal(g.id, { status: 'failed', report: 'サーバーの再起動で分解が中断しました。もう一度ゴールを伝えてください。' })
    for (const m of this.store.state.members) {
      if (m.kind !== 'human' && m.status !== 'idle') this.store.patchMember(m.id, { status: 'idle', statusText: undefined, currentTaskId: null })
      if (m.kind === 'human') this.store.patchMember(m.id, { online: false, status: 'offline' })
    }
    this.schedule()
  }
}

function listFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string, depth: number) => {
    if (depth > 4) return
    let names: string[] = []
    try {
      names = readdirSync(d)
    } catch {
      return
    }
    for (const n of names) {
      if (n.startsWith('.') || n === 'node_modules') continue
      const p = join(d, n)
      const st = statSync(p)
      if (st.isDirectory()) walk(p, depth + 1)
      else out.push(relative(dir, p))
    }
  }
  walk(dir, 0)
  return out
}
