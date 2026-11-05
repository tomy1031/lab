// ドックから開く画面（シート）と、人物のプロフィール、上のバーの小窓（お知らせ・検索・タイムライン・設定）
import type { Goal, Member, MemoryEntry, Message, OfficeId, Task } from '../../../shared/types'
import { GOAL_STATUS_LABEL, OFFICES, STATUS_LABEL, TASK_STATUS_LABEL, countryOf, officeInfo } from '../../../shared/types'
import type { AppState } from '../state'
import { face } from './avatar'
import { PHASES, activeProjects, allProjects, humanRequests, kpis, minutesLabel, officeStats, project, stages, unansweredQuestions, type ProjectView } from './derive'
import { esc, h, md, timeAgo } from './dom'
import { KIND_LABEL, feedRow, type SheetId } from './hud'
import { flag, icon } from './icons'

export interface UiState {
  goalId: string | null
  projFilter: 'active' | 'done' | 'all'
  taskFilter: 'all' | 'mine' | 'human' | 'ai'
  taskOffice: 'all' | OfficeId
  chatWith: string | null
  doc: { goalId: string; path: string; content: string | null } | null
  peopleFilter: 'all' | 'human' | 'agent'
  profileId: string | null
  profileMemory: MemoryEntry[] | null
  focusTaskId: string | null
  composeFocus: boolean
}

export const initialUi = (): UiState => ({
  goalId: null,
  projFilter: 'active',
  taskFilter: 'all',
  taskOffice: 'all',
  chatWith: 'nexmax',
  doc: null,
  peopleFilter: 'all',
  profileId: null,
  profileMemory: null,
  focusTaskId: null,
  composeFocus: false,
})

export interface Actions {
  set(patch: Partial<UiState>): void
  open(id: SheetId, patch?: Partial<UiState>): void
  close(): void
  createGoal(title: string, description: string): Promise<boolean>
  cancelGoal(g: Goal): void
  retryTask(t: Task): void
  complete(taskId: string): void
  reply(m: Message, text: string): void
  talk(memberId: string, text: string): void
  openFile(goalId: string, path: string): void
  openProfile(id: string): void
  focusMember(id: string): void
  register(): void
  edit(m: Member): void
  retire(m: Member): void
  addMemory(m: Member, text: string): void
  setEngine(mode: 'claude' | 'sim'): void
  logout(): void
}

const TITLES: Record<SheetId, [string, string]> = {
  projects: ['folder', 'プロジェクト'],
  tasks: ['task', 'タスク'],
  chat: ['chat', 'チャット'],
  docs: ['doc', '資料'],
  people: ['people', '人材'],
  reports: ['chart', 'レポート'],
}

export function sheet(id: SheetId, state: AppState, ui: UiState, act: Actions): HTMLElement {
  const [ic, title] = TITLES[id]
  const body =
    id === 'projects'
      ? projectsSheet(state, ui, act)
      : id === 'tasks'
        ? tasksSheet(state, ui, act)
        : id === 'chat'
          ? chatSheet(state, ui, act)
          : id === 'docs'
            ? docsSheet(state, ui, act)
            : id === 'people'
              ? peopleSheet(state, ui, act)
              : reportsSheet(state, act)
  return h(
    'section',
    { class: `sheet glass sheet-${id}`, role: 'dialog', 'aria-label': title },
    h('header', { class: 'sheet-head' }, h('span', { class: 'sheet-ico' }, icon(ic, 22)), h('h2', {}, title), h('div', { class: 'sheet-tools', id: 'sheet-tools' }), h('button', { class: 'sheet-close', title: '閉じる（Esc）', onclick: act.close }, icon('close', 20))),
    h('div', { class: 'sheet-body' }, body),
  )
}

// ------------------------------------------------------------------ 共通部品

const seg = <T extends string>(value: T, options: [T, string][], on: (v: T) => void) =>
  h('div', { class: 'seg' }, ...options.map(([v, label]) => h('button', { class: v === value ? 'on' : '', onclick: () => on(v) }, label)))

function who(state: AppState, id: string | null | undefined, size = 22): HTMLElement {
  const m = state.member(id)
  return h('span', { class: 'who' }, face(m, size), h('span', {}, m?.name ?? '担当未定'), m ? flag(countryOf(m.office), 10) : null)
}

export function taskCard(state: AppState, t: Task, act: Actions, opts: { showGoal?: boolean; focus?: boolean } = {}): HTMLElement {
  const me = state.me
  const g = state.snap?.goals.find((x) => x.id === t.goalId)
  const live = t.status === 'in_progress' ? state.streams.get(t.id) : undefined
  const waited = t.status === 'waiting_human' && t.startedAt ? minutesLabel(Math.round((Date.now() - Date.parse(t.startedAt)) / 60000)) : null
  const canComplete = t.status === 'waiting_human' && me && (t.assigneeId === me.id || me.isAdmin)
  return h(
    'article',
    { class: `tcard ${t.requiresHuman ? 'human' : 'ai'} ts-${t.status} ${opts.focus ? 'focus' : ''}`, id: `task-${t.id}` },
    h('div', { class: 'tc-top' }, h('span', { class: `tc-kind ${t.requiresHuman ? 'human' : 'ai'}` }, icon(t.requiresHuman ? 'hand' : 'robot', 13), t.requiresHuman ? '人間' : 'AI'), h('span', { class: `tstatus ts-${t.status}` }, TASK_STATUS_LABEL[t.status]), waited ? h('span', { class: 'tc-wait' }, icon('clock', 12), `${waited}待ち`) : null),
    h('h4', {}, t.title),
    opts.showGoal && g ? h('div', { class: 'tc-goal', onclick: () => act.open('projects', { goalId: g.id }) }, icon('folder', 12), g.title) : null,
    h('p', { class: 'tc-desc' }, t.description),
    h('div', { class: 'tc-meta' }, h('a', { onclick: () => t.assigneeId && act.openProfile(t.assigneeId) }, who(state, t.assigneeId))),
    t.requiresHuman && (t.assignReason || t.humanReason)
      ? h(
          'div',
          { class: 'tc-why' },
          t.humanReason ? h('div', {}, h('b', {}, '人間の仕事にした理由'), t.humanReason) : null,
          t.assignReason ? h('div', {}, h('b', {}, 'この人にお願いした理由'), t.assignReason) : null,
        )
      : null,
    live ? h('pre', { class: 'live' }, live.slice(-260)) : null,
    t.output && t.status === 'done' ? h('details', { class: 'tc-out' }, h('summary', {}, '成果を見る'), h('div', { class: 'md', html: md(t.output) })) : null,
    t.files?.length ? h('div', { class: 'files' }, ...t.files.map((f) => h('button', { class: 'file', onclick: () => act.openFile(t.goalId, f) }, icon('file', 13), f))) : null,
    h(
      'div',
      { class: 'tc-actions' },
      canComplete ? h('button', { class: 'btn small primary', onclick: () => act.complete(t.id) }, t.assigneeId === me!.id ? '対応して完了にする' : '管理者として完了にする') : null,
      t.status === 'failed' ? h('button', { class: 'btn small', onclick: () => act.retryTask(t) }, 'やり直す') : null,
    ),
  )
}

// ------------------------------------------------------------------ プロジェクト

function composer(act: Actions, focus: boolean): HTMLElement {
  const title = h('input', { 'data-keep': 'goal-title', placeholder: '例：プノンペンで日本企業向けIT人材の交流会を開く', maxlength: 200 }) as HTMLInputElement
  const desc = h('textarea', { 'data-keep': 'goal-desc', rows: 3, placeholder: '詳しく（目的・期限・予算・相手など。なくても OK）' }) as HTMLTextAreaElement
  const form = h(
    'form',
    {
      class: 'composer',
      onsubmit: async (e: Event) => {
        e.preventDefault()
        if (!title.value.trim()) return title.focus()
        if (await act.createGoal(title.value.trim(), desc.value.trim())) {
          title.value = ''
          desc.value = ''
        }
      },
    },
    h('div', { class: 'cp-head' }, icon('target', 18), h('b', {}, 'ゴールを伝える'), h('small', {}, 'ネクマックスが分解し、足りない職種は AI社員を採用。人間にしかできない仕事は人間へ')),
    title,
    desc,
    h('button', { class: 'btn primary', type: 'submit' }, icon('send', 16), 'ネクマックスにお願いする'),
  )
  if (focus) setTimeout(() => title.focus(), 50)
  return form
}

function phaseStepper(p: ProjectView): HTMLElement {
  const idx = PHASES.findIndex((x) => x.id === p.phase)
  return h(
    'ol',
    { class: `stepper ${p.phase === 'stopped' ? 'stopped' : ''}` },
    ...PHASES.map((ph, i) => h('li', { class: i < idx ? 'past' : i === idx ? 'now' : '' }, h('i', {}, String(i + 1)), ph.label)),
  )
}

function projectRow(p: ProjectView, selected: boolean, act: Actions): HTMLElement {
  return h(
    'li',
    { class: `prow ${selected ? 'sel' : ''} gs-${p.goal.status}`, onclick: () => act.set({ goalId: p.goal.id }) },
    h('div', { class: 'prow-top' }, h('b', {}, p.goal.title), h('span', { class: `gstatus gs-${p.goal.status}` }, GOAL_STATUS_LABEL[p.goal.status])),
    h('div', { class: 'bar' }, h('i', { style: `width:${Math.max(3, p.pct * 100)}%` })),
    h('div', { class: 'prow-meta' }, `${Math.round(p.pct * 100)}%・${p.done}/${p.total}`, p.humanWaiting ? h('span', { class: 'chip human' }, `人間待ち ${p.humanWaiting}`) : null, p.aiWorking ? h('span', { class: 'chip ai' }, `AI 作業中 ${p.aiWorking}`) : null, h('small', {}, timeAgo(p.goal.createdAt))),
  )
}

function projectDetail(state: AppState, p: ProjectView, act: Actions): HTMLElement {
  const g = p.goal
  const by = state.member(g.createdBy)
  const cols = stages(p.tasks)
  const hired = p.hires
  const files = p.tasks.flatMap((t) => (t.files ?? []).map((f) => ({ f, t })))
  return h(
    'div',
    { class: 'pdetail' },
    h('div', { class: 'pd-head' }, h('div', {}, h('h3', {}, g.title), h('div', { class: 'pd-sub' }, who(state, g.createdBy, 18), `が ${timeAgo(g.createdAt)} に依頼`)), h('div', { class: 'pd-pct' }, h('b', {}, `${Math.round(p.pct * 100)}%`), h('small', {}, `${p.done}/${p.total} 完了`))),
    phaseStepper(p),
    g.description ? h('p', { class: 'pd-desc' }, g.description) : null,
    g.planSummary ? h('div', { class: 'plan' }, h('span', { class: 'who-l' }, icon('robot', 14), 'ネクマックスの方針（社長の分身として）'), h('p', {}, g.planSummary)) : g.status === 'planning' ? h('div', { class: 'plan thinking' }, icon('robot', 14), 'ネクマックスがゴールを分解しています…') : null,
    hired.length ? h('div', { class: 'pd-hires' }, icon('spark', 14), h('b', {}, '採用'), ...hired.map((m) => h('span', { class: 'chip hire' }, m.text.replace(/を採用しました！?/, '')))) : null,
    cols.length
      ? h(
          'div',
          { class: 'flow' },
          ...cols.map((col, i) => h('div', { class: 'flow-col' }, h('div', { class: 'flow-head' }, i === 0 ? 'すぐ着手' : `ステップ ${i + 1}`), ...col.map((t) => taskCard(state, t, act)))),
        )
      : null,
    files.length
      ? h('div', { class: 'pd-files' }, h('h4', {}, icon('doc', 15), '成果物'), h('div', { class: 'files' }, ...files.map(({ f, t }) => h('button', { class: 'file', title: t.title, onclick: () => act.openFile(g.id, f) }, icon('file', 13), f))))
      : null,
    g.report ? h('div', { class: 'pd-report' }, h('h4', {}, icon('chart', 15), '完了報告'), h('div', { class: 'md report', html: md(g.report) })) : null,
    by && ['planning', 'running', 'waiting_human'].includes(g.status) ? h('button', { class: 'btn small ghost', onclick: () => act.cancelGoal(g) }, 'このプロジェクトを中止') : null,
  )
}

function projectsSheet(state: AppState, ui: UiState, act: Actions): HTMLElement {
  const all = allProjects(state)
  const list = all.filter((p) => (ui.projFilter === 'all' ? true : ui.projFilter === 'active' ? ['planning', 'running', 'waiting_human'].includes(p.goal.status) : p.goal.status === 'done'))
  const sel = all.find((p) => p.goal.id === ui.goalId) ?? list[0] ?? null
  return h(
    'div',
    { class: 'split' },
    h(
      'div',
      { class: 'split-l' },
      composer(act, ui.composeFocus),
      seg(ui.projFilter, [['active', `進行中 ${all.filter((p) => ['planning', 'running', 'waiting_human'].includes(p.goal.status)).length}`], ['done', '完了'], ['all', 'すべて']], (v) => act.set({ projFilter: v })),
      list.length ? h('ul', { class: 'plist' }, ...list.map((p) => projectRow(p, p.goal.id === sel?.goal.id, act))) : h('p', { class: 'empty' }, 'ここに表示するプロジェクトはありません'),
    ),
    h('div', { class: 'split-r' }, sel ? projectDetail(state, sel, act) : h('div', { class: 'empty big' }, icon('target', 40), h('p', {}, '上の欄にゴールを書くと、ネクマックスが分解して、AI社員と人間に仕事を配ります'))),
  )
}

// ------------------------------------------------------------------ タスク（かんばん）

function tasksSheet(state: AppState, ui: UiState, act: Actions): HTMLElement {
  const me = state.me
  const goals = new Set(activeProjects(state).map((p) => p.goal.id))
  let tasks = (state.snap?.tasks ?? []).filter((t) => goals.has(t.goalId) || (t.status === 'done' && t.finishedAt && Date.now() - Date.parse(t.finishedAt) < 86400000))
  if (ui.taskFilter === 'mine') tasks = tasks.filter((t) => t.assigneeId === me?.id)
  if (ui.taskFilter === 'human') tasks = tasks.filter((t) => t.requiresHuman)
  if (ui.taskFilter === 'ai') tasks = tasks.filter((t) => !t.requiresHuman)
  if (ui.taskOffice !== 'all') tasks = tasks.filter((t) => state.member(t.assigneeId)?.office === ui.taskOffice)
  const cols: [string, string, (t: Task) => boolean][] = [
    ['wait', '前の作業待ち・未着手', (t) => t.status === 'blocked' || t.status === 'todo'],
    ['ai', 'AI 作業中', (t) => t.status === 'in_progress' || t.status === 'review'],
    ['human', '人間の対応待ち', (t) => t.status === 'waiting_human'],
    ['done', '完了（24時間）', (t) => t.status === 'done'],
    ['fail', '失敗・中止', (t) => t.status === 'failed'],
  ]
  return h(
    'div',
    { class: 'kanban-wrap' },
    h(
      'div',
      { class: 'filters' },
      seg(ui.taskFilter, [['all', 'すべて'], ['mine', '自分の仕事'], ['human', '人間の仕事'], ['ai', 'AI の仕事']], (v) => act.set({ taskFilter: v })),
      seg(ui.taskOffice, [['all', '全拠点'], ...OFFICES.map((o) => [o.id, o.name.replace('オフィス', '')] as [OfficeId, string])], (v) => act.set({ taskOffice: v })),
    ),
    h(
      'div',
      { class: 'kanban' },
      ...cols
        .filter(([k]) => k !== 'fail' || tasks.some((t) => t.status === 'failed'))
        .map(([k, label, f]) => {
          const ts = tasks.filter(f)
          return h('div', { class: `kcol kc-${k}` }, h('div', { class: 'kcol-head' }, h('b', {}, label), h('span', {}, String(ts.length))), ...ts.map((t) => taskCard(state, t, act, { showGoal: true, focus: t.id === ui.focusTaskId })), ts.length ? null : h('p', { class: 'empty' }, '—'))
        }),
    ),
  )
}

// ------------------------------------------------------------------ チャット

function chatSheet(state: AppState, ui: UiState, act: Actions): HTMLElement {
  const me = state.me
  const members = (state.snap?.members ?? []).filter((m) => m.id !== me?.id)
  const msgs = state.snap?.messages ?? []
  const qs = unansweredQuestions(state, me)
  const withM = state.member(ui.chatWith)
  const thread = ui.chatWith ? msgs.filter((m) => (m.fromId === ui.chatWith && m.toId === me?.id) || (m.toId === ui.chatWith && m.fromId === me?.id) || (ui.chatWith && (m.fromId === ui.chatWith || m.toId === ui.chatWith))) : msgs
  const input = h('textarea', { 'data-keep': `talk-${ui.chatWith ?? 'all'}`, rows: 2, placeholder: withM ? `${withM.name}に話しかける（${withM.kind === 'human' ? 'メッセージが届きます' : 'その人の記憶を踏まえて答えます'}）` : '相手を選んでください' }) as HTMLTextAreaElement
  const send = () => {
    if (!withM || !input.value.trim()) return
    act.talk(withM.id, input.value.trim())
    input.value = ''
  }
  input.addEventListener('keydown', (e) => {
    const k = e as KeyboardEvent
    if (k.key === 'Enter' && (k.metaKey || k.ctrlKey) && !k.isComposing) send()
  })
  return h(
    'div',
    { class: 'split chat' },
    h(
      'div',
      { class: 'split-l' },
      h('button', { class: `chan ${ui.chatWith === null ? 'sel' : ''}`, onclick: () => act.set({ chatWith: null }) }, icon('globe', 18), h('span', {}, '全体のやり取り')),
      qs.length ? h('div', { class: 'chan-q' }, icon('hand', 14), `あなたへの質問 ${qs.length} 件（下に表示）`) : null,
      ...OFFICES.map((o) => {
        const rank = (m: Member) => (/社長|代表/.test(m.role) ? 0 : m.kind === 'nexmax' ? 1 : m.kind === 'human' ? 2 : 3)
        const ms = members.filter((m) => m.office === o.id).sort((a, b) => rank(a) - rank(b))
        if (!ms.length) return null
        return h(
          'div',
          { class: 'chan-group' },
          h('div', { class: 'chan-office' }, flag(o.country, 11), o.name),
          ...ms.map((m) => h('button', { class: `chan ${ui.chatWith === m.id ? 'sel' : ''}`, onclick: () => act.set({ chatWith: m.id }) }, face(m, 26), h('span', {}, m.name), h('small', {}, m.role))),
        )
      }),
    ),
    h(
      'div',
      { class: 'split-r chat-main' },
      qs.length
        ? h(
            'div',
            { class: 'questions' },
            h('h4', {}, icon('hand', 15), 'AI社員からあなたへの質問'),
            ...qs.slice(-6).reverse().map((q) => {
              const box = h('input', { 'data-keep': `reply-${q.id}`, placeholder: '返事（質問した AI社員の記憶に入り、次の仕事で使われます）' }) as HTMLInputElement
              return h('div', { class: 'q' }, who(state, q.fromId, 22), h('p', {}, q.text), h('div', { class: 'q-reply' }, box, h('button', { class: 'btn small primary', onclick: () => box.value.trim() && act.reply(q, box.value.trim()) }, '返事する')))
            }),
          )
        : null,
      h('div', { class: 'thread-head' }, withM ? h('a', { onclick: () => act.openProfile(withM.id) }, who(state, withM.id, 26), h('small', {}, `${withM.role}・${STATUS_LABEL[withM.status]}`)) : h('b', {}, '全体のやり取り（AI社員どうし・人間との会話）')),
      h('ul', { class: 'thread' }, ...thread.slice(-80).map((m) => bubble(state, m, me))),
      withM ? h('div', { class: 'talkbox' }, input, h('button', { class: 'btn primary', onclick: send, title: '送る（⌘/Ctrl + Enter）' }, icon('send', 16), '送る')) : null,
    ),
  )
}

function bubble(state: AppState, m: Message, me: Member | null): HTMLElement {
  const from = state.member(m.fromId)
  const to = state.member(m.toId)
  const mine = m.fromId === me?.id
  return h(
    'li',
    { class: `bub ${mine ? 'mine' : ''} k-${m.kind}` },
    mine ? null : face(from, 28),
    h('div', { class: 'bub-body' }, h('div', { class: 'bub-meta' }, h('b', {}, from?.name ?? '?'), h('span', {}, '→', to?.name ?? '全員'), h('span', { class: `kchip k-${m.kind}` }, KIND_LABEL[m.kind] ?? m.kind), h('small', {}, timeAgo(m.at))), h('div', { class: 'bub-text', html: esc(m.text).replace(/\n/g, '<br>') })),
  )
}

// ------------------------------------------------------------------ 資料

function docsSheet(state: AppState, ui: UiState, act: Actions): HTMLElement {
  const projects = allProjects(state).filter((p) => p.tasks.some((t) => t.files?.length))
  const viewer = ui.doc
    ? h(
        'div',
        { class: 'doc-view' },
        h('div', { class: 'doc-head' }, icon('file', 16), h('b', {}, ui.doc.path)),
        ui.doc.content === null
          ? h('p', { class: 'empty' }, '読み込み中…')
          : /\.html?$/i.test(ui.doc.path)
            ? h('iframe', { class: 'doc-frame', sandbox: '', srcdoc: ui.doc.content, title: ui.doc.path })
            : /\.(md|markdown|txt)$/i.test(ui.doc.path)
              ? h('div', { class: 'md', html: md(ui.doc.content) })
              : h('pre', { class: 'code' }, ui.doc.content),
      )
    : h('div', { class: 'empty big' }, icon('doc', 40), h('p', {}, 'AI社員が作ったファイルが、プロジェクトごとにここへ集まります'))
  return h(
    'div',
    { class: 'split' },
    h(
      'div',
      { class: 'split-l' },
      projects.length
        ? h(
            'div',
            {},
            ...projects.map((p) =>
              h(
                'div',
                { class: 'doc-group' },
                h('div', { class: 'doc-proj' }, icon('folder', 15), p.goal.title),
                ...p.tasks.flatMap((t) =>
                  (t.files ?? []).map((f) =>
                    h('button', { class: `doc-item ${ui.doc?.goalId === p.goal.id && ui.doc.path === f ? 'sel' : ''}`, onclick: () => act.openFile(p.goal.id, f) }, icon('file', 15), h('span', {}, f), h('small', {}, `${state.member(t.assigneeId)?.name ?? ''}・${t.title}`)),
                  ),
                ),
              ),
            ),
          )
        : h('p', { class: 'empty' }, 'まだ成果物はありません'),
    ),
    h('div', { class: 'split-r' }, viewer),
  )
}

// ------------------------------------------------------------------ 人材

function peopleSheet(state: AppState, ui: UiState, act: Actions): HTMLElement {
  const me = state.me
  let ms = state.snap?.members ?? []
  if (ui.peopleFilter === 'human') ms = ms.filter((m) => m.kind === 'human')
  if (ui.peopleFilter === 'agent') ms = ms.filter((m) => m.kind !== 'human')
  const stats = officeStats(state)
  const hires = (state.snap?.members ?? []).filter((m) => m.kind === 'agent').sort((a, b) => b.hiredAt.localeCompare(a.hiredAt))
  return h(
    'div',
    { class: 'people' },
    h(
      'div',
      { class: 'filters' },
      seg(ui.peopleFilter, [['all', 'すべて'], ['human', '人間'], ['agent', 'AI社員・統括AI']], (v) => act.set({ peopleFilter: v })),
      me?.isAdmin ? h('button', { class: 'btn small primary', onclick: act.register }, icon('plus', 14), '人間を登録') : null,
    ),
    h(
      'div',
      { class: 'offices' },
      ...OFFICES.map((o) => {
        const st = stats.find((s) => s.id === o.id)!
        const list = ms.filter((m) => m.office === o.id).sort((a, b) => (a.deskIndex < 0 ? -1 : a.deskIndex) - (b.deskIndex < 0 ? -1 : b.deskIndex))
        return h(
          'div',
          { class: 'office-col' },
          h('div', { class: 'office-head' }, flag(o.country, 14), h('b', {}, o.name), h('small', {}, o.nameEn), h('span', { class: 'office-count' }, `人間 ${st.humans}・AI ${st.agents}`)),
          ...list.map((m) =>
            h(
              'button',
              { class: `pcard kind-${m.kind}`, onclick: () => act.openProfile(m.id) },
              face(m, 40),
              h('div', { class: 'pc-main' }, h('div', {}, h('b', {}, m.name), m.isAdmin ? h('span', { class: 'mini' }, '管理者') : null), h('small', {}, m.role), h('div', { class: 'chips' }, ...m.skills.slice(0, 3).map((s) => h('span', { class: 'chip' }, s)))),
              h('div', { class: 'pc-side' }, h('span', { class: `status st-${m.status}` }, STATUS_LABEL[m.status]), h('small', {}, `完了 ${m.stats.tasksDone}`)),
            ),
          ),
          list.length ? null : h('p', { class: 'empty' }, 'まだいません'),
        )
      }),
    ),
    hires.length
      ? h(
          'div',
          { class: 'hire-log' },
          h('h4', {}, icon('spark', 15), 'AI社員の採用履歴'),
          h('ul', {}, ...hires.slice(0, 12).map((m) => h('li', { onclick: () => act.openProfile(m.id) }, face(m, 24), h('b', {}, m.name), h('span', {}, m.role), h('small', {}, `${officeInfo(m.office).name}・${timeAgo(m.hiredAt)}`), m.hireReason ? h('em', {}, m.hireReason) : null))),
        )
      : null,
  )
}

// ------------------------------------------------------------------ レポート

function reportsSheet(state: AppState, act: Actions): HTMLElement {
  const k = kpis(state)
  const stats = officeStats(state)
  const members = state.snap?.members ?? []
  const tasks = state.snap?.tasks ?? []
  const done = tasks.filter((t) => t.status === 'done')
  const aiShare = k.tasksDone ? k.aiDone / k.tasksDone : 0
  const byOffice = OFFICES.map((o) => ({ o, n: done.filter((t) => state.member(t.assigneeId)?.office === o.id).length }))
  const maxOffice = Math.max(1, ...byOffice.map((x) => x.n))
  const top = members
    .filter((m) => m.stats.tasksDone > 0)
    .sort((a, b) => b.stats.tasksDone - a.stats.tasksDone)
    .slice(0, 8)
  const maxTop = Math.max(1, ...top.map((m) => m.stats.tasksDone))
  const reports = (state.snap?.goals ?? []).filter((g) => g.report).slice(-6).reverse()
  const tile = (label: string, value: string, sub: string, cls = '') => h('div', { class: `kpi ${cls}` }, h('small', {}, label), h('b', {}, value), h('span', {}, sub))
  return h(
    'div',
    { class: 'reports' },
    h(
      'div',
      { class: 'kpis' },
      tile('完了したプロジェクト', String(k.goalsDone), `進行中 ${k.goalsActive}`),
      tile('完了したタスク', String(k.tasksDone), `AI ${k.aiDone}・人間 ${k.humanDone}`),
      tile('採用した AI社員', String(k.hires), `人間 ${members.filter((m) => m.kind === 'human').length} 人と協働`),
      tile('人間の平均対応時間', k.avgHumanMin === null ? '—' : minutesLabel(Math.round(k.avgHumanMin)), 'お願いしてから完了まで', 'human'),
      tile('成果物', String(k.filesMade), 'AI社員が作ったファイル'),
    ),
    h(
      'div',
      { class: 'charts' },
      h(
        'div',
        { class: 'chart-card' },
        h('h4', {}, 'AI と人間の分担'),
        h(
          'div',
          { class: 'donut-wrap' },
          h('div', { class: 'donut', style: `--p:${(aiShare * 100).toFixed(1)}` }, h('b', {}, `${Math.round(aiShare * 100)}%`), h('small', {}, 'AI')),
          h('ul', { class: 'legend' }, h('li', { class: 'ai' }, `AI ${k.aiDone} 件`), h('li', { class: 'human' }, `人間 ${k.humanDone} 件`)),
        ),
      ),
      h('div', { class: 'chart-card' }, h('h4', {}, '拠点ごとの完了タスク'), h('ul', { class: 'hbars' }, ...byOffice.map(({ o, n }) => h('li', {}, h('span', { class: 'hb-label' }, flag(o.country, 11), o.name.replace('オフィス', '')), h('span', { class: 'hb-bar' }, h('i', { style: `width:${(n / maxOffice) * 100}%` })), h('b', {}, String(n)))))),
      h(
        'div',
        { class: 'chart-card' },
        h('h4', {}, 'よく働いた人'),
        top.length ? h('ul', { class: 'hbars' }, ...top.map((m) => h('li', { onclick: () => act.openProfile(m.id) }, h('span', { class: 'hb-label' }, face(m, 18, { dot: false }), m.name), h('span', { class: `hb-bar ${m.kind}` }, h('i', { style: `width:${(m.stats.tasksDone / maxTop) * 100}%` })), h('b', {}, String(m.stats.tasksDone))))) : h('p', { class: 'empty' }, 'まだありません'),
      ),
      h('div', { class: 'chart-card' }, h('h4', {}, 'いまの拠点'), h('ul', { class: 'office-now' }, ...stats.map((s) => h('li', {}, flag(countryOf(s.id), 12), h('b', {}, officeInfo(s.id).name), h('span', {}, `稼働中 ${s.working}`), h('span', {}, `オンライン ${s.online}`), s.waitingHuman ? h('em', {}, `人間待ち ${s.waitingHuman}`) : null)))),
    ),
    h('h4', {}, icon('doc', 15), '完了報告'),
    reports.length ? h('div', { class: 'report-list' }, ...reports.map((g) => h('details', { class: 'report-item' }, h('summary', {}, h('b', {}, g.title), h('small', {}, g.finishedAt ? timeAgo(g.finishedAt) : '')), h('div', { class: 'md', html: md(g.report!) })))) : h('p', { class: 'empty' }, 'プロジェクトが完了すると、ネクマックスの完了報告がここに並びます'),
  )
}

// ------------------------------------------------------------------ プロフィール（右側に浮かぶ）

const MEM_LABEL: Record<string, string> = { task: '仕事', feedback: 'フィードバック', note: 'メモ', reflection: 'ふりかえり', conversation: '相談' }

export function profilePanel(state: AppState, ui: UiState, act: Actions): HTMLElement | null {
  const m = state.member(ui.profileId)
  if (!m) return null
  const me = state.me
  const task = (state.snap?.tasks ?? []).find((t) => t.id === m.currentTaskId) ?? (state.snap?.tasks ?? []).find((t) => t.assigneeId === m.id && t.status === 'waiting_human')
  const talk = h('input', { 'data-keep': `pf-talk-${m.id}`, placeholder: m.kind === 'human' ? `${m.name}さんにメッセージ` : `${m.name}に話しかける` }) as HTMLInputElement
  const send = () => {
    if (talk.value.trim()) {
      act.talk(m.id, talk.value.trim())
      talk.value = ''
    }
  }
  talk.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && !(e as KeyboardEvent).isComposing && send())
  const note = h('textarea', { 'data-keep': `pf-note-${m.id}`, rows: 2, placeholder: m.kind === 'human' ? 'この人について覚えておくこと' : 'フィードバック（次の仕事から反映）' }) as HTMLTextAreaElement
  const pair = m.id === 'nexmax' ? (state.snap?.members ?? []).find((x) => x.kind === 'human' && /社長|代表/.test(x.role)) : /社長|代表/.test(m.role) ? state.member('nexmax') : undefined
  return h(
    'aside',
    { class: 'profile glass' },
    h('button', { class: 'sheet-close', onclick: () => act.set({ profileId: null }) }, icon('close', 18)),
    h('div', { class: 'pf-head' }, face(m, 64), h('div', {}, h('h3', {}, m.name), h('div', { class: 'pf-role' }, m.role), h('div', { class: 'pf-office' }, flag(countryOf(m.office), 12), officeInfo(m.office).name, m.deskIndex >= 0 ? `・${m.deskIndex + 1} 番の席` : ''))),
    h('div', { class: 'pf-status' }, h('span', { class: `status st-${m.status}` }, STATUS_LABEL[m.status]), m.statusText ? h('span', {}, m.statusText) : null),
    pair ? h('div', { class: 'pf-pair' }, icon('people', 14), m.id === 'nexmax' ? `${pair.name}社長の隣の席で、社長の分身として働いています` : 'となりの席のネクマックスが、分身として仕事を分けて配ります') : null,
    task ? h('div', { class: `pf-task ${task.requiresHuman ? 'human' : ''}` }, h('small', {}, task.requiresHuman ? 'お願いしている仕事' : 'いまの仕事'), h('b', {}, task.title), task.assignReason ? h('em', {}, `理由：${task.assignReason}`) : null) : null,
    m.persona ? h('p', { class: 'persona' }, m.persona) : null,
    h('div', { class: 'chips' }, ...m.skills.map((s) => h('span', { class: 'chip' }, s)), ...m.languages.map((l) => h('span', { class: 'chip lang' }, l))),
    h('div', { class: 'pf-stats' }, h('span', {}, h('b', {}, String(m.stats.tasksDone)), '完了'), h('span', {}, h('b', {}, String(m.stats.messages)), 'やり取り'), h('span', {}, h('b', {}, timeAgo(m.hiredAt)), m.kind === 'agent' ? '採用' : '登録')),
    m.hireReason ? h('div', { class: 'reason' }, `採用理由：${m.hireReason}`) : null,
    me && me.id !== m.id ? h('div', { class: 'pf-talk' }, talk, h('button', { class: 'btn small primary', onclick: send }, icon('send', 14))) : null,
    h('h4', {}, icon('spark', 14), 'たまっていくコンテキスト'),
    ui.profileMemory === null
      ? h('p', { class: 'empty' }, '読み込み中…')
      : ui.profileMemory.length
        ? h('ol', { class: 'memory' }, ...[...ui.profileMemory].reverse().slice(0, 25).map((e) => h('li', { class: `mem mk-${e.kind}` }, h('span', { class: 'mem-kind' }, MEM_LABEL[e.kind] ?? e.kind), h('span', {}, e.text), h('small', {}, timeAgo(e.at)))))
        : h('p', { class: 'empty' }, 'まだ記憶はありません'),
    h('div', { class: 'pf-note' }, note, h('button', { class: 'btn small', onclick: () => note.value.trim() && act.addMemory(m, note.value.trim()) }, '記憶に足す')),
    h(
      'div',
      { class: 'pf-actions' },
      h('button', { class: 'btn small', onclick: () => act.focusMember(m.id) }, icon('location', 14), '3D で見る'),
      h('button', { class: 'btn small', onclick: () => act.open('chat', { chatWith: m.id }) }, icon('chat', 14), 'チャット'),
      me && (me.isAdmin || me.id === m.id) && m.kind !== 'nexmax' ? h('button', { class: 'btn small', onclick: () => act.edit(m) }, icon('edit', 14), '編集') : null,
      me?.isAdmin && m.kind === 'agent' ? h('button', { class: 'btn small ghost', onclick: () => act.retire(m) }, '退職') : null,
    ),
  )
}

// ------------------------------------------------------------------ 小窓

export function notificationsPop(state: AppState, act: Actions): HTMLElement {
  const me = state.me
  const mine = humanRequests(state).filter((r) => r.task.assigneeId === me?.id)
  const qs = unansweredQuestions(state, me)
  const recent = (state.snap?.activities ?? []).filter((a) => a.level === 'success' || a.level === 'hire' || a.level === 'warn').slice(-8).reverse()
  return h(
    'div',
    { class: 'pop glass' },
    h('h4', {}, 'あなたへのお願い'),
    mine.length ? h('ul', { class: 'pop-list' }, ...mine.map((r) => h('li', { class: 'human', onclick: () => act.complete(r.task.id) }, icon('hand', 16), h('span', {}, r.task.title), h('small', {}, `${minutesLabel(r.waitedMin)}待ち`)))) : h('p', { class: 'empty' }, 'いまはありません'),
    qs.length ? h('h4', {}, 'あなたへの質問') : null,
    qs.length ? h('ul', { class: 'pop-list' }, ...qs.slice(-5).map((q) => h('li', { onclick: () => act.open('chat', { chatWith: q.fromId }) }, face(state.member(q.fromId), 20), h('span', {}, q.text)))) : null,
    h('h4', {}, '最近の出来事'),
    h('ul', { class: 'pop-list acts' }, ...recent.map((a) => h('li', { class: `al-${a.level}` }, h('span', {}, a.text), h('small', {}, timeAgo(a.at))))),
  )
}

export function searchPop(state: AppState, act: Actions): HTMLElement {
  const input = h('input', { placeholder: '人・プロジェクト・タスク・資料をさがす' }) as HTMLInputElement
  const results = h('ul', { class: 'pop-list' })
  const run = () => {
    const q = input.value.trim().toLowerCase()
    results.replaceChildren()
    if (!q) return
    const hit = (s: string | undefined) => !!s && s.toLowerCase().includes(q)
    for (const m of (state.snap?.members ?? []).filter((m) => hit(m.name) || hit(m.role) || m.skills.some(hit)).slice(0, 6)) results.append(h('li', { onclick: () => act.openProfile(m.id) }, face(m, 20), h('span', {}, m.name), h('small', {}, m.role)))
    for (const g of (state.snap?.goals ?? []).filter((g) => hit(g.title)).slice(0, 5)) results.append(h('li', { onclick: () => act.open('projects', { goalId: g.id }) }, icon('folder', 16), h('span', {}, g.title), h('small', {}, GOAL_STATUS_LABEL[g.status])))
    for (const t of (state.snap?.tasks ?? []).filter((t) => hit(t.title)).slice(0, 6)) results.append(h('li', { onclick: () => act.open('tasks', { focusTaskId: t.id, taskFilter: 'all', taskOffice: 'all' }) }, icon('task', 16), h('span', {}, t.title), h('small', {}, TASK_STATUS_LABEL[t.status])))
    for (const t of state.snap?.tasks ?? []) for (const f of (t.files ?? []).filter(hit)) results.append(h('li', { onclick: () => act.openFile(t.goalId, f) }, icon('file', 16), h('span', {}, f)))
    if (!results.children.length) results.append(h('li', { class: 'none' }, '見つかりませんでした'))
  }
  input.addEventListener('input', run)
  setTimeout(() => input.focus(), 30)
  return h('div', { class: 'pop glass wide' }, input, results)
}

export function timelinePop(state: AppState): HTMLElement {
  const today = new Date().toDateString()
  const acts = (state.snap?.activities ?? []).filter((a) => new Date(a.at).toDateString() === today)
  const byHour = new Map<string, typeof acts>()
  for (const a of acts) {
    const k = new Date(a.at).toLocaleTimeString('ja-JP', { hour: '2-digit' })
    byHour.set(k, [...(byHour.get(k) ?? []), a])
  }
  return h(
    'div',
    { class: 'pop glass wide' },
    h('h4', {}, `今日のタイムライン（${acts.length} 件）`),
    acts.length
      ? h('ol', { class: 'timeline' }, ...[...byHour.entries()].reverse().map(([hr, as]) => h('li', {}, h('b', {}, hr), h('ul', {}, ...as.reverse().slice(0, 8).map((a) => h('li', { class: `al-${a.level}` }, a.text))))))
      : h('p', { class: 'empty' }, '今日はまだ何も起きていません'),
  )
}

export function settingsPop(state: AppState, act: Actions): HTMLElement {
  const me = state.me
  const eng = state.snap?.engine
  return h(
    'div',
    { class: 'pop glass' },
    h('h4', {}, '頭脳（AI の動かし方）'),
    h('p', { class: 'pop-note' }, eng?.detail ?? ''),
    me?.isAdmin
      ? h(
          'div',
          { class: 'seg' },
          h('button', { class: eng?.mode === 'claude' ? 'on' : '', onclick: () => act.setEngine('claude') }, 'Claude Code'),
          h('button', { class: eng?.mode === 'sim' ? 'on' : '', onclick: () => act.setEngine('sim') }, 'シミュレーション'),
        )
      : h('p', { class: 'empty' }, '切り替えは管理者だけができます'),
    me?.isAdmin ? h('h4', {}, 'メンバー') : null,
    me?.isAdmin ? h('button', { class: 'btn small', onclick: act.register }, icon('plus', 14), '人間を登録する') : null,
  )
}

export function mePop(state: AppState, act: Actions): HTMLElement {
  const me = state.me
  return h(
    'div',
    { class: 'pop glass' },
    me ? h('div', { class: 'pop-me' }, face(me, 40), h('div', {}, h('b', {}, me.name), h('small', {}, `${me.role}・${officeInfo(me.office).name}`))) : null,
    me ? h('button', { class: 'pop-btn', onclick: () => act.openProfile(me.id) }, icon('user', 16), '自分のプロフィールと記憶') : null,
    h('button', { class: 'pop-btn', onclick: act.logout }, icon('logout', 16), 'ログアウト'),
  )
}

export { project }
