// 画面に出す数字・並びを、状態（スナップショット）から計算する。人間が把握しやすい切り口に寄せる：
// - プロジェクトの進み具合と「いまどの段階か」（分解 → 採用 → AI 作業 → 人間の確認 → 完了）
// - 人間の対応待ち（誰が・何を・どれくらい待たせているか）＝ AI が止まっているところ
// - 拠点ごとの人数・稼働、AI と人間の分担
import type { Goal, Member, Message, OfficeId, Task } from '../../../shared/types'
import { OFFICES, countryOf } from '../../../shared/types'
import type { AppState } from '../state'

export const ACTIVE_GOAL: Goal['status'][] = ['awaiting_approval', 'planning', 'running', 'waiting_human']
const OPEN_TASK: Task['status'][] = ['todo', 'blocked', 'in_progress', 'waiting_human', 'review']

export interface ProjectView {
  goal: Goal
  tasks: Task[]
  done: number
  total: number
  pct: number
  aiWorking: number
  humanWaiting: number
  phase: Phase
  hires: Message[]
}

export type Phase = 'approve' | 'plan' | 'hire' | 'work' | 'human' | 'done' | 'stopped'
export const PHASES: { id: Phase; label: string }[] = [
  { id: 'approve', label: '承認' },
  { id: 'plan', label: '分解' },
  { id: 'hire', label: '採用・割り振り' },
  { id: 'work', label: 'AI が作業' },
  { id: 'human', label: '人間の確認' },
  { id: 'done', label: '完了' },
]

export function project(state: AppState, g: Goal): ProjectView {
  const tasks = state.tasksOf(g.id)
  const done = tasks.filter((t) => t.status === 'done').length
  const total = tasks.length
  const aiWorking = tasks.filter((t) => !t.requiresHuman && t.status === 'in_progress').length
  const humanWaiting = tasks.filter((t) => t.status === 'waiting_human').length
  let phase: Phase = 'work'
  if (g.status === 'awaiting_approval') phase = 'approve'
  else if (g.status === 'planning') phase = 'plan'
  else if (g.status === 'done') phase = 'done'
  else if (g.status === 'failed' || g.status === 'cancelled') phase = 'stopped'
  else if (humanWaiting && !aiWorking) phase = 'human'
  else if (done === 0 && !aiWorking && !humanWaiting) phase = 'hire'
  const hires = (state.snap?.messages ?? []).filter((m) => m.kind === 'hire' && m.goalId === g.id)
  return { goal: g, tasks, done, total, pct: total ? done / total : g.status === 'done' ? 1 : 0, aiWorking, humanWaiting, phase, hires }
}

export function activeProjects(state: AppState): ProjectView[] {
  return (state.snap?.goals ?? [])
    .filter((g) => ACTIVE_GOAL.includes(g.status))
    .map((g) => project(state, g))
    .sort((a, b) => b.goal.createdAt.localeCompare(a.goal.createdAt))
}

export function allProjects(state: AppState): ProjectView[] {
  return [...(state.snap?.goals ?? [])].reverse().map((g) => project(state, g))
}

export interface HumanRequest {
  task: Task
  goal: Goal | undefined
  member: Member | undefined
  waitedMin: number
}

/** 人間の対応待ち（長く待たせている順） */
export function humanRequests(state: AppState): HumanRequest[] {
  const s = state.snap
  if (!s) return []
  return s.tasks
    .filter((t) => t.status === 'waiting_human')
    .map((t) => ({
      task: t,
      goal: s.goals.find((g) => g.id === t.goalId),
      member: state.member(t.assigneeId),
      waitedMin: t.startedAt ? Math.max(0, Math.round((Date.now() - Date.parse(t.startedAt)) / 60000)) : 0,
    }))
    .sort((a, b) => b.waitedMin - a.waitedMin)
}

/** このあと人間へ回る予定（前の作業待ち） */
export function upcomingHuman(state: AppState): Task[] {
  return (state.snap?.tasks ?? []).filter((t) => t.requiresHuman && (t.status === 'blocked' || t.status === 'todo'))
}

export function unansweredQuestions(state: AppState, me: Member | null): Message[] {
  const msgs = state.snap?.messages ?? []
  const answered = new Set(msgs.filter((m) => m.replyTo).map((m) => m.replyTo))
  return msgs.filter((m) => m.toId === me?.id && m.kind === 'question' && !answered.has(m.id))
}

export interface OfficeStat {
  id: OfficeId
  humans: number
  agents: number
  online: number
  working: number
  waitingHuman: number
}

export function officeStats(state: AppState): OfficeStat[] {
  const members = state.snap?.members ?? []
  const tasks = state.snap?.tasks ?? []
  return OFFICES.map((o) => {
    const ms = members.filter((m) => m.office === o.id)
    return {
      id: o.id,
      humans: ms.filter((m) => m.kind === 'human').length,
      agents: ms.filter((m) => m.kind !== 'human').length,
      online: ms.filter((m) => m.kind === 'human' && m.online).length,
      working: ms.filter((m) => ['working', 'thinking', 'talking'].includes(m.status)).length,
      waitingHuman: tasks.filter((t) => t.status === 'waiting_human' && ms.some((m) => m.id === t.assigneeId)).length,
    }
  })
}

/** 依存関係の深さで段に分ける（段 0 = すぐ着手できる） */
export function stages(tasks: Task[]): Task[][] {
  const depth = new Map<string, number>()
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const d = (t: Task, seen = new Set<string>()): number => {
    if (depth.has(t.id)) return depth.get(t.id)!
    if (seen.has(t.id)) return 0
    seen.add(t.id)
    const v = t.dependsOn.length ? 1 + Math.max(...t.dependsOn.map((x) => (byId.get(x) ? d(byId.get(x)!, seen) : 0))) : 0
    depth.set(t.id, v)
    return v
  }
  const out: Task[][] = []
  for (const t of tasks) {
    const k = d(t)
    ;(out[k] ??= []).push(t)
  }
  return out.filter(Boolean)
}

export interface Kpis {
  goalsDone: number
  goalsActive: number
  tasksDone: number
  aiDone: number
  humanDone: number
  hires: number
  avgHumanMin: number | null
  filesMade: number
}

export function kpis(state: AppState): Kpis {
  const s = state.snap
  const tasks = s?.tasks ?? []
  const done = tasks.filter((t) => t.status === 'done')
  const humanDone = done.filter((t) => t.requiresHuman && t.startedAt && t.finishedAt)
  const avg = humanDone.length ? humanDone.reduce((a, t) => a + (Date.parse(t.finishedAt!) - Date.parse(t.startedAt!)), 0) / humanDone.length / 60000 : null
  return {
    goalsDone: (s?.goals ?? []).filter((g) => g.status === 'done').length,
    goalsActive: (s?.goals ?? []).filter((g) => ACTIVE_GOAL.includes(g.status)).length,
    tasksDone: done.length,
    aiDone: done.filter((t) => !t.requiresHuman).length,
    humanDone: done.filter((t) => t.requiresHuman).length,
    hires: (s?.members ?? []).filter((m) => m.kind === 'agent').length,
    avgHumanMin: avg,
    filesMade: tasks.reduce((a, t) => a + (t.files?.length ?? 0), 0),
  }
}

export function openTasks(state: AppState): Task[] {
  return (state.snap?.tasks ?? []).filter((t) => OPEN_TASK.includes(t.status))
}

export function officeFlag(state: AppState, memberId: string | null | undefined): 'jp' | 'kh' | null {
  const m = state.member(memberId)
  return m ? countryOf(m.office) : null
}

export function minutesLabel(min: number): string {
  if (min < 1) return 'たった今'
  if (min < 60) return `${min}分`
  if (min < 60 * 24) return `${Math.floor(min / 60)}時間${min % 60 ? `${min % 60}分` : ''}`
  return `${Math.floor(min / 1440)}日`
}

// ------------------------------------------------------------------ 承認の関所

export interface ApprovalItem {
  kind: 'goal' | 'talk'
  id: string
  by: Member | undefined
  /** 話しかけの相手（AI） */
  to?: Member
  text: string
  at: string
  waitedMin: number
}

/** 承認待ち（古い順）：ほかの人が出したゴールと、AI への話しかけ */
export function approvals(state: AppState): ApprovalItem[] {
  const s = state.snap
  if (!s) return []
  const waited = (at: string) => Math.max(0, Math.round((Date.now() - Date.parse(at)) / 60000))
  return [
    ...s.goals.filter((g) => g.status === 'awaiting_approval').map((g) => ({ kind: 'goal' as const, id: g.id, by: state.member(g.createdBy), text: g.title, at: g.createdAt, waitedMin: waited(g.createdAt) })),
    ...s.messages
      .filter((m) => m.approval?.state === 'pending')
      .map((m) => ({ kind: 'talk' as const, id: m.id, by: state.member(m.fromId), to: state.member(m.toId), text: m.text, at: m.at, waitedMin: waited(m.at) })),
  ].sort((a, b) => a.at.localeCompare(b.at))
}

export function approverOf(state: AppState): Member | undefined {
  return state.member(state.snap?.gate?.approverId)
}

export function isApprover(state: AppState): boolean {
  const me = state.me
  return !!me && state.snap?.gate?.approverId === me.id
}
