// 画面の部品（ゴール・タスクボード・マイタスク・社員・記憶・ログ）。状態から毎回組み立て直す単純な作り。
import type { Goal, Member, MemoryEntry, Message, Task } from '../../../shared/types'
import { GOAL_STATUS_LABEL, STATUS_LABEL, TASK_STATUS_LABEL } from '../../../shared/types'
import type { AppState } from '../state'
import { esc, h, md, timeAgo } from './dom'

export const OFFICE_LABEL = { jp: '🇯🇵 大阪本社', kh: '🇰🇭 プノンペン' } as const

export function kindBadge(m: Member): HTMLElement {
  const label = m.kind === 'human' ? '人間' : m.kind === 'agent' ? 'AI社員' : '統括AI'
  return h('span', { class: `badge kind-${m.kind}` }, label)
}

export function avatar(m: Member | undefined, size = 28): HTMLElement {
  if (!m) return h('span', { class: 'avatar', style: `width:${size}px;height:${size}px` }, '?')
  const bg = m.kind === 'human' ? (m.look.skin ?? '#ffe0c7') : m.look.body
  const ring = m.kind === 'human' ? (m.look.hair ?? '#333') : m.look.accent
  const face = m.kind === 'nexmax' ? '🤖' : m.kind === 'agent' ? '◕‿◕' : m.name.slice(0, 1)
  const el = h('span', { class: `avatar kind-${m.kind}`, title: m.name, style: `width:${size}px;height:${size}px;background:${bg};box-shadow:0 0 0 2px ${ring}` }, face)
  if (m.kind === 'human') el.append(h('i', { class: `dot ${m.online ? 'on' : ''}` }))
  return el
}

export function statusChip(m: Member): HTMLElement {
  return h('span', { class: `status st-${m.status}` }, STATUS_LABEL[m.status])
}

export function taskChip(t: Task): HTMLElement {
  return h('span', { class: `tstatus ts-${t.status}` }, TASK_STATUS_LABEL[t.status])
}

export function goalProgress(state: AppState, g: Goal): { done: number; total: number } {
  const ts = state.tasksOf(g.id)
  return { done: ts.filter((t) => t.status === 'done').length, total: ts.length }
}

// ------------------------------------------------------------------ ゴール

export function goalList(state: AppState, selected: string | null, onPick: (id: string) => void): HTMLElement {
  const goals = [...(state.snap?.goals ?? [])].reverse()
  if (!goals.length) return h('p', { class: 'empty' }, 'まだゴールはありません。上の欄に、やりたいことを書いてください。ネクマックスが分解して、必要なら AI社員を採用します。')
  return h(
    'ul',
    { class: 'goal-list' },
    ...goals.map((g) => {
      const p = goalProgress(state, g)
      const by = state.member(g.createdBy)
      return h(
        'li',
        { class: `goal ${g.id === selected ? 'sel' : ''} gs-${g.status}`, onclick: () => onPick(g.id) },
        h('div', { class: 'goal-top' }, h('b', {}, g.title), h('span', { class: `gstatus gs-${g.status}` }, GOAL_STATUS_LABEL[g.status])),
        h('div', { class: 'bar' }, h('i', { style: `width:${p.total ? (p.done / p.total) * 100 : g.status === 'planning' ? 8 : 0}%` })),
        h('div', { class: 'meta' }, `${by?.name ?? ''}・${timeAgo(g.createdAt)}・${p.done}/${p.total}`),
      )
    }),
  )
}

export interface GoalHandlers {
  onCancel(g: Goal): void
  onRetry(t: Task): void
  onMember(id: string): void
  onFile(g: Goal, path: string): void
  onComplete(t: Task): void
}

export function goalDetail(state: AppState, g: Goal, hd: GoalHandlers): HTMLElement {
  const tasks = state.tasksOf(g.id)
  const me = state.me
  const box = h(
    'div',
    { class: 'goal-detail' },
    h('div', { class: 'gd-head' }, h('h3', {}, g.title), h('span', { class: `gstatus gs-${g.status}` }, GOAL_STATUS_LABEL[g.status])),
    g.description ? h('p', { class: 'gd-desc' }, g.description) : null,
    g.planSummary ? h('div', { class: 'plan' }, h('span', { class: 'who' }, '🤖 ネクマックスの方針'), h('p', {}, g.planSummary)) : null,
    g.status === 'planning' ? h('div', { class: 'plan thinking' }, '🤖 ネクマックスがゴールを分解しています…') : null,
  )
  const board = h('ol', { class: 'tasks' })
  for (const t of tasks) {
    const a = state.member(t.assigneeId)
    const deps = t.dependsOn.map((d) => tasks.find((x) => x.id === d)?.title).filter(Boolean)
    const live = state.streams.get(t.id)
    const li = h(
      'li',
      { class: `task ts-${t.status} ${t.requiresHuman ? 'human' : 'ai'}` },
      h(
        'div',
        { class: 'task-top' },
        h('span', { class: `who-kind ${t.requiresHuman ? 'human' : 'ai'}` }, t.requiresHuman ? '👤 人間' : '🤖 AI'),
        h('b', {}, t.title),
        taskChip(t),
      ),
      h('div', { class: 'task-desc' }, t.description),
      t.humanReason ? h('div', { class: 'reason' }, `人間にお願いする理由：${t.humanReason}`) : null,
      h(
        'div',
        { class: 'task-meta' },
        a ? h('a', { class: 'assignee', onclick: () => hd.onMember(a.id) }, avatar(a, 20), a.name) : h('span', {}, '担当未定'),
        deps.length ? h('span', { class: 'deps' }, `← ${deps.join('、')}`) : null,
      ),
      live && t.status === 'in_progress' ? h('pre', { class: 'live' }, live.slice(-280)) : null,
      t.output ? h('details', { class: 'output' }, h('summary', {}, '成果を見る'), h('div', { class: 'md', html: md(t.output) })) : null,
      t.files?.length
        ? h('div', { class: 'files' }, ...t.files.map((f) => h('button', { class: 'file', onclick: () => hd.onFile(g, f) }, `📄 ${f}`)))
        : null,
      t.status === 'failed' ? h('button', { class: 'btn small', onclick: () => hd.onRetry(t) }, 'やり直す') : null,
      t.status === 'waiting_human' && me && (t.assigneeId === me.id || me.isAdmin)
        ? h('button', { class: 'btn small primary', onclick: () => hd.onComplete(t) }, t.assigneeId === me.id ? '対応して完了にする' : '（管理者として）完了にする')
        : null,
    )
    board.append(li)
  }
  if (tasks.length) box.append(h('h4', {}, 'タスク'), board)
  if (g.report) box.append(h('h4', {}, '🎊 完了報告'), h('div', { class: 'md report', html: md(g.report) }))
  if (['planning', 'running', 'waiting_human'].includes(g.status)) {
    box.append(h('button', { class: 'btn small ghost', onclick: () => hd.onCancel(g) }, 'このゴールを中止'))
  }
  return box
}

// ------------------------------------------------------------------ マイタスク

export function myTasks(state: AppState, onComplete: (t: Task) => void, onGoal: (id: string) => void): HTMLElement {
  const me = state.me
  const mine = (state.snap?.tasks ?? []).filter((t) => t.assigneeId === me?.id && t.requiresHuman)
  const waiting = mine.filter((t) => t.status === 'waiting_human')
  const upcoming = mine.filter((t) => ['todo', 'blocked'].includes(t.status))
  const done = mine.filter((t) => t.status === 'done').slice(-5).reverse()
  const card = (t: Task, active: boolean) => {
    const g = state.snap?.goals.find((x) => x.id === t.goalId)
    return h(
      'li',
      { class: `mytask ${active ? 'active' : ''}` },
      h('div', { class: 'mt-goal', onclick: () => onGoal(t.goalId) }, `ゴール：${g?.title ?? ''}`),
      h('b', {}, t.title),
      h('p', {}, t.description),
      t.humanReason ? h('div', { class: 'reason' }, `理由：${t.humanReason}`) : null,
      active ? h('button', { class: 'btn primary', onclick: () => onComplete(t) }, '対応して完了にする') : taskChip(t),
    )
  }
  return h(
    'div',
    { class: 'mytasks' },
    waiting.length ? h('ul', {}, ...waiting.map((t) => card(t, true))) : h('p', { class: 'empty' }, 'いま、あなたにお願いしている仕事はありません ☕'),
    upcoming.length ? h('h4', {}, 'このあと回ってくる仕事') : null,
    upcoming.length ? h('ul', {}, ...upcoming.map((t) => card(t, false))) : null,
    done.length ? h('h4', {}, '最近対応した仕事') : null,
    done.length ? h('ul', { class: 'done' }, ...done.map((t) => h('li', {}, `✅ ${t.title}`))) : null,
  )
}

// ------------------------------------------------------------------ 社員

export function memberList(state: AppState, onPick: (id: string) => void, selected: string | null): HTMLElement {
  const members = state.snap?.members ?? []
  const box = h('div', { class: 'members' })
  for (const office of ['jp', 'kh'] as const) {
    const ms = members.filter((m) => m.office === office).sort((a, b) => order(a) - order(b))
    box.append(h('h4', {}, `${OFFICE_LABEL[office]}（${ms.length}人）`))
    box.append(
      h(
        'ul',
        { class: 'member-list' },
        ...ms.map((m) =>
          h(
            'li',
            { class: `member ${m.id === selected ? 'sel' : ''}`, onclick: () => onPick(m.id) },
            avatar(m),
            h('div', { class: 'm-main' }, h('div', {}, h('b', {}, m.name), ' ', kindBadge(m)), h('small', {}, m.role + (m.statusText ? `・${m.statusText}` : ''))),
            statusChip(m),
          ),
        ),
      ),
    )
  }
  return box
}

const order = (m: Member) => (m.kind === 'nexmax' ? 0 : m.kind === 'human' ? 1 : 2) * 1000 + Math.max(0, m.deskIndex)

export interface MemberHandlers {
  onClose(): void
  onNote(m: Member, text: string): void
  onRetire(m: Member): void
  onFocus(m: Member): void
}

export function memberCard(state: AppState, m: Member, memory: MemoryEntry[] | null, hd: MemberHandlers): HTMLElement {
  const me = state.me
  const task = (state.snap?.tasks ?? []).find((t) => t.id === m.currentTaskId)
  const hiredBy = state.member(m.hiredBy)
  const note = h('textarea', { rows: 2, placeholder: m.kind === 'human' ? 'この人について覚えておくこと（例：数字は表で見たい）' : 'この AI社員へのフィードバック（次の仕事から反映されます）' }) as HTMLTextAreaElement
  const msgs = (state.snap?.messages ?? []).filter((x) => x.fromId === m.id || x.toId === m.id).slice(-8).reverse()
  return h(
    'div',
    { class: 'member-card' },
    h('button', { class: 'close', onclick: hd.onClose, title: '閉じる' }, '×'),
    h('div', { class: 'mc-head' }, avatar(m, 52), h('div', {}, h('h3', {}, m.name), h('div', {}, kindBadge(m), ' ', m.role), h('small', {}, OFFICE_LABEL[m.office]))),
    h('div', { class: 'mc-status' }, statusChip(m), m.statusText ? ` ${m.statusText}` : '', task ? h('div', { class: 'mc-task' }, `いまの仕事：${task.title}`) : null),
    m.persona ? h('p', { class: 'persona' }, m.persona) : null,
    h('div', { class: 'chips' }, ...m.skills.map((s) => h('span', { class: 'chip' }, s)), ...m.languages.map((l) => h('span', { class: 'chip lang' }, l))),
    h(
      'div',
      { class: 'mc-stats' },
      h('span', {}, `完了 ${m.stats.tasksDone}`),
      h('span', {}, `やり取り ${m.stats.messages}`),
      h('span', {}, `${m.kind === 'agent' ? '採用' : '登録'} ${timeAgo(m.hiredAt)}${hiredBy ? `（${hiredBy.name}）` : ''}`),
    ),
    m.hireReason ? h('div', { class: 'reason' }, `採用理由：${m.hireReason}`) : null,
    h('h4', {}, '🧠 たまっていくコンテキスト（記憶）'),
    memory === null
      ? h('p', { class: 'empty' }, '読み込み中…')
      : memory.length
        ? h(
            'ol',
            { class: 'memory' },
            ...[...memory].reverse().slice(0, 30).map((e) =>
              h('li', { class: `mem mk-${e.kind}` }, h('span', { class: 'mem-kind' }, MEM_LABEL[e.kind] ?? e.kind), h('span', {}, e.text), h('small', {}, timeAgo(e.at))),
            ),
          )
        : h('p', { class: 'empty' }, 'まだ記憶はありません'),
    h('div', { class: 'note' }, note, h('button', { class: 'btn small', onclick: () => note.value.trim() && hd.onNote(m, note.value.trim()) }, '記憶に足す')),
    msgs.length ? h('h4', {}, '最近のやり取り') : null,
    msgs.length ? h('ul', { class: 'mini-log' }, ...msgs.map((x) => messageRow(state, x))) : null,
    h(
      'div',
      { class: 'mc-actions' },
      h('button', { class: 'btn small', onclick: () => hd.onFocus(m) }, '📍 3D で見る'),
      me?.isAdmin && m.kind === 'agent' ? h('button', { class: 'btn small ghost', onclick: () => hd.onRetire(m) }, '退職させる') : null,
    ),
  )
}

const MEM_LABEL: Record<string, string> = { task: '仕事', feedback: 'フィードバック', note: 'メモ', reflection: 'ふりかえり', conversation: '相談' }

// ------------------------------------------------------------------ ログ

const KIND_ICON: Record<string, string> = { assign: '📨', chat: '💬', question: '❓', answer: '💡', handoff: '🤝', report: '📋', review: '🔍', hire: '🎉', system: '📢' }

export function messageRow(state: AppState, m: Message): HTMLElement {
  const from = state.member(m.fromId)
  const to = state.member(m.toId)
  const cross = from && to && from.office !== to.office
  return h(
    'li',
    { class: `msg mk-${m.kind}` },
    h('span', { class: 'mi' }, KIND_ICON[m.kind] ?? '•'),
    h('span', { class: 'mfrom' }, from?.name ?? '?'),
    h('span', { class: 'marrow' }, cross ? '⇢🌏⇢' : '→'),
    h('span', { class: 'mto' }, to?.name ?? '全員'),
    h('span', { class: 'mtext', html: esc(m.text) }),
  )
}

export function logView(state: AppState): HTMLElement {
  const acts = [...(state.snap?.activities ?? [])].reverse().slice(0, 60)
  const msgs = [...(state.snap?.messages ?? [])].reverse().slice(0, 60)
  return h(
    'div',
    { class: 'log' },
    h('h4', {}, '出来事'),
    h('ul', { class: 'acts' }, ...acts.map((a) => h('li', { class: `act al-${a.level}` }, h('span', {}, a.text), h('small', {}, timeAgo(a.at))))),
    h('h4', {}, '社員どうしのやり取り'),
    h('ul', { class: 'msgs' }, ...msgs.map((m) => messageRow(state, m))),
  )
}
