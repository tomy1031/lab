// ドックから開く画面（シート）と、人物のプロフィール、上のバーの小窓（お知らせ・検索・タイムライン・設定）。
// デザインは codex が出した改善案（docs/design/ の画像とメモ）に合わせている：大きな見出し＋立体アイコン＋ひとことの説明、
// 右上に「いま見るべき数」のバッジ、人間の対応待ちはオレンジ、完了は緑、アバターは生成したキャラクターの顔。
// アイコンは参考デザインと同じ「白いガラスのタイル＋青い線画」（ui/icons.ts の gicon）。
import type { Goal, Member, MemoryEntry, Message, MessageKind, OfficeId, Task } from '../../../shared/types'
import { GOAL_STATUS_LABEL, OFFICES, STATUS_LABEL, TASK_STATUS_LABEL, countryOf, officeInfo } from '../../../shared/types'
import type { AppState } from '../state'
import { face, figure } from './avatar'
import { PHASES, activeProjects, allProjects, humanRequests, kpis, minutesLabel, officeStats, project, stages, unansweredQuestions, type ProjectView } from './derive'
import { esc, h, md, timeAgo } from './dom'
import { KIND_LABEL, type SheetId } from './hud'
import { flag, gicon, icon, type GlossyIcon } from './icons'

export interface UiState {
  goalId: string | null
  projFilter: 'active' | 'done' | 'all'
  taskFilter: 'all' | 'mine' | 'human' | 'ai'
  taskOffice: 'all' | OfficeId
  chatWith: string | null
  chatKind: 'all' | MessageKind
  chatSearch: string
  doc: { goalId: string; path: string; content: string | null } | null
  peopleFilter: 'all' | 'human' | 'agent'
  profileId: string | null
  profileMemory: MemoryEntry[] | null
  memKind: 'all' | MemoryEntry['kind']
  focusTaskId: string | null
  composeFocus: boolean
}

export const initialUi = (): UiState => ({
  goalId: null,
  projFilter: 'active',
  taskFilter: 'all',
  taskOffice: 'all',
  chatWith: 'nexmax',
  chatKind: 'all',
  chatSearch: '',
  doc: null,
  peopleFilter: 'all',
  profileId: null,
  profileMemory: null,
  memKind: 'all',
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

const TITLES: Record<SheetId, [GlossyIcon, string, string]> = {
  projects: ['folder', 'プロジェクト', 'ゴールから成果まで、流れが見える。'],
  tasks: ['task', 'タスク', 'チームの仕事を、ひと目で。'],
  chat: ['chat', 'チャット', 'チームと AI が、ひとつにつながる。'],
  docs: ['doc', '資料', 'AI社員の成果物が、ここに集まる。'],
  people: ['people', '人材', '人と AI で、ひとつのチーム。'],
  reports: ['chart', 'レポート', '会社のいまを、ひと目で。'],
}

export function sheet(id: SheetId, state: AppState, ui: UiState, act: Actions): HTMLElement {
  const [ic, title, tagline] = TITLES[id]
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
    h(
      'header',
      { class: 'sheet-head' },
      gicon(ic, 44, 'sheet-gicon'),
      h('h2', {}, title),
      h('span', { class: 'sheet-tag' }, tagline),
      h('div', { class: 'sheet-tools' }, headBadge(id, state, ui, act)),
      h('button', { class: 'sheet-close', title: '閉じる（Esc）', onclick: act.close }, icon('close', 20)),
    ),
    h('div', { class: 'sheet-body' }, body),
  )
}

/** 見出しの右側：その画面で「いま見るべき数」 */
function headBadge(id: SheetId, state: AppState, ui: UiState, act: Actions): HTMLElement | null {
  const waiting = humanRequests(state).length
  const members = state.snap?.members ?? []
  if (id === 'tasks' || id === 'projects') {
    if (!waiting) return h('span', { class: 'hbadge ok' }, icon('check', 15), '人間待ちはありません')
    return h('button', { class: 'hbadge human', onclick: () => act.open('tasks', { taskFilter: 'human', taskOffice: 'all' }) }, gicon('hand', 22, 'white'), `人間の対応待ち ${waiting} 件`)
  }
  if (id === 'chat') return h('span', { class: 'hbadge live' }, h('i', { class: 'live-dot-i' }), '日本・カンボジア 接続中')
  if (id === 'people')
    return h(
      'div',
      { class: 'hcounts' },
      h('span', {}, icon('user', 15), '人間', h('b', {}, String(members.filter((m) => m.kind === 'human').length))),
      h('span', {}, icon('robot', 15), 'AI', h('b', {}, String(members.filter((m) => m.kind !== 'human').length))),
    )
  if (id === 'reports') return h('span', { class: 'hbadge soft' }, icon('clock', 14), `最終更新 ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`)
  void ui
  return null
}

// ------------------------------------------------------------------ 共通部品

const seg = <T extends string>(value: T, options: [T, string][], on: (v: T) => void, cls = '') =>
  h('div', { class: `seg ${cls}` }, ...options.map(([v, label]) => h('button', { class: v === value ? 'on' : '', onclick: () => on(v) }, label)))

function who(state: AppState, id: string | null | undefined, size = 26): HTMLElement {
  const m = state.member(id)
  return h('span', { class: 'who' }, face(m, size), h('span', { class: 'who-name' }, m?.name ?? '担当未定'), m ? flag(countryOf(m.office), 12) : null)
}

function kindPill(t: Task): HTMLElement {
  return t.requiresHuman ? h('span', { class: 'kpill human' }, icon('user', 13), '人間') : h('span', { class: 'kpill ai' }, icon('robot', 13), 'AI')
}

function waitedOf(t: Task): number | null {
  return t.status === 'waiting_human' && t.startedAt ? Math.round((Date.now() - Date.parse(t.startedAt)) / 60000) : null
}

export function taskCard(state: AppState, t: Task, act: Actions, opts: { showGoal?: boolean; focus?: boolean; compact?: boolean } = {}): HTMLElement {
  const me = state.me
  const g = state.snap?.goals.find((x) => x.id === t.goalId)
  const live = t.status === 'in_progress' ? state.streams.get(t.id) : undefined
  const waited = waitedOf(t)
  const canComplete = t.status === 'waiting_human' && me && (t.assigneeId === me.id || me.isAdmin)
  return h(
    'article',
    { class: `tcard ${t.requiresHuman ? 'human' : 'ai'} ts-${t.status} ${opts.focus ? 'focus' : ''} ${opts.compact ? 'compact' : ''}`, id: `task-${t.id}` },
    h(
      'div',
      { class: 'tc-top' },
      kindPill(t),
      t.status === 'done' ? h('span', { class: 'done-pill' }, icon('check', 13), '完了') : t.status === 'blocked' || t.status === 'todo' ? h('span', { class: 'tstatus ts-blocked' }, TASK_STATUS_LABEL[t.status]) : null,
      waited !== null ? h('span', { class: `wait-pill ${waited >= 60 ? 'late' : ''}` }, icon('clock', 14), `${minutesLabel(waited)}待ち`) : null,
    ),
    h('h4', {}, t.title),
    opts.showGoal && g ? h('button', { class: 'tc-goal', onclick: () => act.open('projects', { goalId: g.id }) }, icon('folder', 14), h('span', {}, h('small', {}, 'プロジェクト'), g.title)) : null,
    opts.compact ? null : h('p', { class: 'tc-desc' }, t.description),
    h('div', { class: 'tc-meta' }, h('a', { onclick: () => t.assigneeId && act.openProfile(t.assigneeId) }, who(state, t.assigneeId, opts.compact ? 26 : 34))),
    t.requiresHuman && (t.assignReason || t.humanReason) && t.status !== 'done'
      ? h(
          'div',
          { class: 'tc-why' },
          t.humanReason ? h('div', {}, h('b', {}, icon('task', 14), '人間の仕事にした理由'), h('span', {}, t.humanReason)) : null,
          t.assignReason ? h('div', {}, h('b', {}, icon('people', 14), 'この人にお願いした理由'), h('span', {}, t.assignReason)) : null,
        )
      : null,
    live !== undefined
      ? h('div', { class: 'live-box' }, h('div', { class: 'live-head' }, h('i', { class: 'live-dot-i' }), 'ライブ出力'), h('pre', {}, (live || '考えています…').slice(-200)), h('div', { class: 'gen-bar' }, h('i', {})), h('small', { class: 'gen-label' }, '生成中'))
      : t.status === 'in_progress' && !t.requiresHuman
        ? h('div', { class: 'live-box' }, h('div', { class: 'live-head' }, h('i', { class: 'live-dot-i' }), '作業中'), h('div', { class: 'gen-bar' }, h('i', {})))
        : null,
    t.output && t.status === 'done' ? h('details', { class: 'tc-out' }, h('summary', {}, '成果を見る'), h('div', { class: 'md', html: md(t.output) })) : null,
    t.files?.length ? h('div', { class: 'files' }, ...t.files.map((f) => h('button', { class: 'file', onclick: () => act.openFile(t.goalId, f) }, icon('file', 14), f))) : null,
    canComplete
      ? h(
          'div',
          { class: 'tc-cta' },
          h('button', { class: 'btn primary block', onclick: () => act.complete(t.id) }, icon('check', 16), opts.compact ? '完了にする' : t.assigneeId === me!.id ? '対応して完了にする' : '管理者として完了にする'),
          h('small', {}, '完了すると、次の作業が進みます'),
        )
      : null,
    t.status === 'failed' ? h('button', { class: 'btn small', onclick: () => act.retryTask(t) }, 'やり直す') : null,
  )
}

// ------------------------------------------------------------------ プロジェクト

function composer(act: Actions, focus: boolean): HTMLElement {
  const title = h('input', { 'data-keep': 'goal-title', placeholder: 'ゴールを入力（例：プノンペンで日本企業向けの交流会を開く）', maxlength: 200 }) as HTMLInputElement
  const desc = h('textarea', { 'data-keep': 'goal-desc', rows: 2, placeholder: '目的・期限・予算など（任意）' }) as HTMLTextAreaElement
  const form = h(
    'form',
    {
      class: 'composer',
      onsubmit: async (e: Event) => {
        e.preventDefault()
        if (!title.value.trim()) return title.focus()
        const btn = form.querySelector('button')!
        btn.disabled = true
        if (await act.createGoal(title.value.trim(), desc.value.trim())) {
          title.value = ''
          desc.value = ''
        }
        btn.disabled = false
      },
    },
    h('div', { class: 'cp-head' }, gicon('target', 34), h('div', {}, h('b', {}, 'ゴールを伝える'), h('small', {}, 'ネクマックスが分解し、AI社員と人間に仕事を割り振ります'))),
    title,
    desc,
    h('button', { class: 'btn primary block', type: 'submit' }, gicon('spark', 20, 'white'), 'ネクマックスにお願いする'),
  )
  if (focus) setTimeout(() => title.focus(), 50)
  return form
}

function ringSvg(pct: number, size: number, stroke = 7): SVGSVGElement {
  const r = 40 - stroke
  const c = 2 * Math.PI * r
  const wrap = document.createElement('span')
  wrap.innerHTML = `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 80 80"><defs><linearGradient id="rg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5ee7ff"/><stop offset="1" stop-color="#2f80ed"/></linearGradient></defs><circle cx="40" cy="40" r="${r}" fill="none" stroke="rgba(47,128,237,.12)" stroke-width="${stroke}"/><circle cx="40" cy="40" r="${r}" fill="none" stroke="url(#rg2)" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(c * pct).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 40 40)"/><text x="40" y="46" text-anchor="middle" font-size="18" font-weight="800" fill="#1c3f78">${Math.round(pct * 100)}%</text></svg>`
  return wrap.firstElementChild as SVGSVGElement
}

function phaseStepper(p: ProjectView): HTMLElement {
  const idx = PHASES.findIndex((x) => x.id === p.phase)
  return h(
    'ol',
    { class: `stepper ${p.phase === 'stopped' ? 'stopped' : ''}` },
    ...PHASES.map((ph, i) =>
      h(
        'li',
        { class: i < idx || p.phase === 'done' ? 'past' : i === idx ? 'now' : '' },
        i < idx || p.phase === 'done' ? h('i', { class: 'st-check' }, icon('check', 14)) : h('i', {}, String(i + 1)),
        h('span', {}, ph.label),
        i === idx && p.humanWaiting ? h('em', { class: 'st-sub' }, icon('user', 11), '人間の対応待ち') : null,
      ),
    ),
  )
}

/** 段の名前（最初のタスクから短い言葉を拾う） */
function stageName(tasks: Task[], i: number): string {
  const t = tasks[0]?.title ?? ''
  const rules: [RegExp, string][] = [
    [/承認|決定|判断|採否/, '承認'],
    [/下見|現地|訪問|対面|会場/, '現地確認'],
    [/商談|打診|ヒアリング/, '商談'],
    [/翻訳|クメール/, '翻訳'],
    [/告知|SNS|広報/, '告知'],
    [/要件/, '要件'],
    [/ワイヤー|デザイン|画面/, '設計'],
    [/実装|開発|試作/, '開発'],
    [/面接/, '面接'],
    [/求人|募集/, '募集'],
    [/提案|資料|原稿|文/, '資料作成'],
    [/企画|計画|台本/, '企画'],
    [/調査|リサーチ|分析|リスト/, '調査'],
    [/まとめ|報告/, 'まとめ'],
  ]
  for (const [re, name] of rules) if (re.test(t)) return name
  return `ステップ ${i + 1}`
}

function projectRow(p: ProjectView, selected: boolean, act: Actions): HTMLElement {
  return h(
    'li',
    { class: `prow ${selected ? 'sel' : ''} gs-${p.goal.status}`, onclick: () => act.set({ goalId: p.goal.id }) },
    h('b', {}, p.goal.title),
    p.humanWaiting ? h('span', { class: 'chip human' }, icon('user', 12), '人間の対応待ち') : h('span', { class: `gstatus gs-${p.goal.status}` }, GOAL_STATUS_LABEL[p.goal.status]),
    h('div', { class: 'prow-bar' }, h('div', { class: 'bar' }, h('i', { style: `width:${Math.max(3, p.pct * 100)}%` })), h('b', {}, `${Math.round(p.pct * 100)}%`)),
    h('div', { class: 'prow-meta' }, `${p.done}/${p.total} 完了`, h('small', {}, timeAgo(p.goal.createdAt))),
  )
}

function projectDetail(state: AppState, p: ProjectView, act: Actions): HTMLElement {
  const g = p.goal
  const cols = stages(p.tasks)
  const files = p.tasks.flatMap((t) => (t.files ?? []).map((f) => ({ f, t })))
  const hiredMembers = p.hires
    .map((m) => {
      const name = m.text.match(/^(.+?)さん/)?.[1]
      return (state.snap?.members ?? []).find((x) => x.kind === 'agent' && x.name === name)
    })
    .filter((x): x is Member => !!x)
  const active = ['planning', 'running', 'waiting_human'].includes(g.status)
  return h(
    'div',
    { class: 'pdetail' },
    h(
      'div',
      { class: 'pd-head card-in' },
      h('div', { class: 'pd-title' }, h('h3', {}, g.title), h('div', { class: 'pd-sub' }, who(state, g.createdBy, 24), h('span', {}, `・${timeAgo(g.createdAt)}に依頼`))),
      h('div', { class: 'pd-pct' }, ringSvg(p.pct, 68), h('div', {}, h('b', {}, `${p.done}/${p.total}`), h('small', {}, '完了'))),
    ),
    phaseStepper(p),
    g.planSummary || g.status === 'planning'
      ? h(
          'div',
          { class: 'plan-card card-in' },
          h('img', { class: 'plan-nx', src: '/brand/nexmax-face.webp', alt: '' }),
          h(
            'div',
            { class: 'plan-main' },
            h('div', { class: 'plan-title' }, 'ネクマックスの方針', h('small', {}, '（社長の分身として）')),
            h('p', { class: g.status === 'planning' ? 'thinking' : '' }, g.planSummary ?? 'ゴールを分解しています…'),
            hiredMembers.length
              ? h('div', { class: 'plan-hires' }, h('span', { class: 'hire-tag' }, '採用'), ...hiredMembers.map((m) => h('button', { class: 'hire-chip', onclick: () => act.openProfile(m.id) }, face(m, 30, { dot: false }), h('span', {}, h('b', {}, `${m.name}さん`), h('small', {}, m.role)))))
              : null,
          ),
        )
      : null,
    cols.length
      ? h(
          'div',
          { class: 'flow-wrap card-in' },
          h('div', { class: 'flow-title' }, gicon('task', 24), h('b', {}, 'タスクの流れ'), h('small', {}, '依存関係に沿って、左から順に進みます')),
          h(
            'div',
            { class: 'flow' },
            ...cols.map((col, i) =>
              h(
                'div',
                { class: 'flow-col' },
                h('div', { class: `flow-head ${col.every((t) => t.status === 'done') ? 'done' : col.some((t) => t.status === 'waiting_human') ? 'human' : ''}` }, h('i', {}, String(i + 1)), stageName(col, i)),
                ...col.map((t) => taskCard(state, t, act, { compact: true })),
              ),
            ),
          ),
        )
      : null,
    g.report ? h('div', { class: 'pd-report card-in' }, h('div', { class: 'flow-title' }, gicon('chart', 24), h('b', {}, '完了報告')), h('div', { class: 'md', html: md(g.report) })) : null,
    h(
      'div',
      { class: 'pd-foot card-in' },
      h('button', { class: 'pf-files', onclick: () => (files[0] ? act.openFile(g.id, files[0].f) : act.open('docs')) }, gicon('doc', 30), h('b', {}, `成果物 ${files.length} 件`)),
      h('div', { class: 'tb-spacer' }),
      g.report ? h('button', { class: 'btn primary', onclick: () => act.open('reports') }, icon('chart', 16), '完了レポートを見る') : null,
      active ? h('button', { class: 'btn ghost', onclick: () => act.cancelGoal(g) }, icon('close', 14), '中止する') : null,
    ),
  )
}

function projectsSheet(state: AppState, ui: UiState, act: Actions): HTMLElement {
  const all = allProjects(state)
  const isActive = (p: ProjectView) => ['planning', 'running', 'waiting_human'].includes(p.goal.status)
  const list = all.filter((p) => (ui.projFilter === 'all' ? true : ui.projFilter === 'active' ? isActive(p) : p.goal.status === 'done'))
  const sel = all.find((p) => p.goal.id === ui.goalId) ?? list[0] ?? null
  return h(
    'div',
    { class: 'split' },
    h(
      'div',
      { class: 'split-l' },
      composer(act, ui.composeFocus),
      seg(ui.projFilter, [['active', `進行中 ${all.filter(isActive).length}`], ['done', '完了'], ['all', 'すべて']], (v) => act.set({ projFilter: v }), 'full'),
      list.length ? h('ul', { class: 'plist' }, ...list.map((p) => projectRow(p, p.goal.id === sel?.goal.id, act))) : h('p', { class: 'empty' }, 'ここに表示するプロジェクトはありません'),
      h('div', { class: 'deco-pair' }, figure({ sprite: 'jp-0' }, 'stand', 96), h('img', { class: 'figure nx', src: '/brand/nexmax-face.webp', alt: '' })),
    ),
    h('div', { class: 'split-r' }, sel ? projectDetail(state, sel, act) : h('div', { class: 'empty big' }, gicon('target', 72), h('p', {}, '左の欄にゴールを書くと、ネクマックスが分解して、AI社員と人間に仕事を配ります'))),
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
    ['done', '完了', (t) => t.status === 'done'],
    ['fail', '失敗・中止', (t) => t.status === 'failed'],
  ]
  return h(
    'div',
    { class: 'kanban-wrap' },
    h(
      'div',
      { class: 'filters' },
      seg(ui.taskFilter, [['all', 'すべて'], ['mine', '自分の仕事'], ['human', '人間の仕事'], ['ai', 'AI の仕事']], (v) => act.set({ taskFilter: v }), 'pills'),
      h('span', { class: 'fdiv' }),
      seg(ui.taskOffice, [['all', '全拠点'], ...OFFICES.map((o) => [o.id, o.name.replace('オフィス', '')] as [OfficeId, string])], (v) => act.set({ taskOffice: v }), 'pills'),
    ),
    h(
      'div',
      { class: 'kanban' },
      ...cols
        .filter(([k]) => k !== 'fail' || tasks.some((t) => t.status === 'failed'))
        .map(([k, label, f]) => {
          const ts = tasks.filter(f)
          const shown = k === 'done' ? ts.slice(-6).reverse() : ts
          return h(
            'div',
            { class: `kcol kc-${k}` },
            h('div', { class: 'kcol-head' }, h('b', {}, label), h('span', { class: 'kcount' }, String(ts.length))),
            ...shown.map((t) => taskCard(state, t, act, { showGoal: true, focus: t.id === ui.focusTaskId })),
            k === 'done' && ts.length > shown.length ? h('div', { class: 'more' }, `ほか ${ts.length - shown.length} 件`) : null,
            ts.length ? null : h('div', { class: 'kempty' }, k === 'human' ? '人間を待っている仕事はありません' : '—'),
          )
        }),
    ),
  )
}

// ------------------------------------------------------------------ チャット

const CHAT_KINDS: ['all' | MessageKind, string][] = [
  ['all', 'すべて'],
  ['assign', '依頼'],
  ['question', '質問'],
  ['answer', '回答'],
  ['handoff', '引き継ぎ'],
  ['report', '報告'],
  ['hire', '採用'],
]

function chatSheet(state: AppState, ui: UiState, act: Actions): HTMLElement {
  const me = state.me
  const q = ui.chatSearch.trim().toLowerCase()
  const members = (state.snap?.members ?? []).filter((m) => m.id !== me?.id && (!q || m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q)))
  const msgs = state.snap?.messages ?? []
  const qs = unansweredQuestions(state, me)
  const answeredCount = msgs.filter((m) => m.replyTo && m.fromId === me?.id).length
  const withM = state.member(ui.chatWith)
  let thread = ui.chatWith ? msgs.filter((m) => m.fromId === ui.chatWith || m.toId === ui.chatWith) : msgs
  if (ui.chatKind !== 'all') thread = thread.filter((m) => m.kind === ui.chatKind)
  const input = h('textarea', { 'data-keep': `talk-${ui.chatWith ?? 'all'}`, rows: 1, placeholder: withM ? `${withM.name}に話しかける` : '相手を選ぶと話しかけられます' }) as HTMLTextAreaElement
  const send = () => {
    if (!withM || !input.value.trim()) return
    act.talk(withM.id, input.value.trim())
    input.value = ''
  }
  input.addEventListener('keydown', (e) => {
    const k = e as KeyboardEvent
    if (k.key === 'Enter' && !k.shiftKey && !k.isComposing) {
      e.preventDefault()
      send()
    }
  })
  const search = h('input', { 'data-keep': 'chat-search', class: 'search-in', placeholder: 'メンバーを検索', value: ui.chatSearch }) as HTMLInputElement
  search.addEventListener('input', () => act.set({ chatSearch: search.value }))
  const rank = (m: Member) => (/社長|代表/.test(m.role) ? 1 : m.kind === 'nexmax' ? 0 : m.kind === 'human' ? 2 : 3)
  return h(
    'div',
    { class: `chat3 ${qs.length ? 'has-q' : ''}` },
    h(
      'div',
      { class: 'chat-members card-in' },
      h('label', { class: 'search-wrap' }, icon('search', 16), search),
      h('button', { class: `chan ${ui.chatWith === null ? 'sel' : ''}`, onclick: () => act.set({ chatWith: null }) }, gicon('globe', 30), h('span', { class: 'chan-name' }, '全体のやり取り'), h('i', { class: 'chan-count' }, String(Math.min(99, msgs.length)))),
      ...OFFICES.map((o) => {
        const ms = members.filter((m) => m.office === o.id).sort((a, b) => rank(a) - rank(b))
        if (!ms.length) return null
        return h(
          'div',
          { class: 'chan-group' },
          h('div', { class: 'chan-office' }, flag(o.country, 13), o.name),
          ...ms.map((m) => h('button', { class: `chan ${ui.chatWith === m.id ? 'sel' : ''}`, onclick: () => act.set({ chatWith: m.id }) }, face(m, 36, { dot: true }), h('span', { class: 'chan-name' }, h('b', {}, m.name), h('small', {}, m.role)))),
        )
      }),
    ),
    qs.length
      ? h(
          'div',
          { class: 'chat-q' },
          h('div', { class: 'q-head' }, gicon('hand', 40, 'warm'), h('div', {}, h('b', {}, 'あなたへの質問'), h('small', {}, '返信すると、AI の仕事が進みます')), h('span', { class: 'q-count' }, `${qs.length} 件`)),
          ...qs.slice(-6).reverse().map((m) => {
            const box = h('textarea', { 'data-keep': `reply-${m.id}`, rows: 2, placeholder: '回答を入力…' }) as HTMLTextAreaElement
            const from = state.member(m.fromId)
            return h(
              'div',
              { class: 'q-card' },
              h('div', { class: 'q-from' }, face(from, 34, { dot: false }), h('div', {}, h('b', {}, from?.name ?? '?'), h('small', {}, from?.role ?? '')), h('span', { class: 'q-wait' }, icon('user', 12), 'あなたの回答待ち')),
              h('p', {}, m.text),
              box,
              h('button', { class: 'btn human block', onclick: () => box.value.trim() && act.reply(m, box.value.trim()) }, '回答する'),
            )
          }),
          answeredCount ? h('div', { class: 'q-done' }, icon('check', 14), `回答済み ${answeredCount} 件`) : null,
        )
      : null,
    h(
      'div',
      { class: 'chat-main card-in' },
      h(
        'div',
        { class: 'thread-head' },
        withM
          ? h('a', { class: 'th-who', onclick: () => act.openProfile(withM.id) }, face(withM, 48, { dot: true }), h('div', {}, h('b', {}, withM.name), h('small', {}, withM.role), h('span', { class: `th-status st-${withM.status}` }, h('i', {}), withM.kind === 'human' ? (withM.online ? 'オンライン' : 'オフライン') : STATUS_LABEL[withM.status])))
          : h('div', { class: 'th-who' }, gicon('globe', 44), h('div', {}, h('b', {}, '全体のやり取り'), h('small', {}, 'AI社員どうし・人間との会話がすべて流れます'))),
      ),
      h('div', { class: 'kind-filter' }, ...CHAT_KINDS.map(([k, label]) => h('button', { class: ui.chatKind === k ? 'on' : '', onclick: () => act.set({ chatKind: k }) }, label))),
      h('ul', { class: 'thread' }, ...threadItems(state, thread.slice(-80), me)),
      withM
        ? h('div', { class: 'talkbox' }, h('div', { class: 'tb-in' }, icon('chat', 18), input, h('small', {}, withM.kind === 'human' ? 'メッセージが届きます' : 'このメンバーの記憶を踏まえて回答します')), h('button', { class: 'btn primary', onclick: send, title: '送信（Enter）' }, icon('send', 16), '送信'))
        : null,
    ),
  )
}

function threadItems(state: AppState, msgs: Message[], me: Member | null): HTMLElement[] {
  const out: HTMLElement[] = []
  let lastDay = ''
  for (const m of msgs) {
    const d = new Date(m.at)
    const day = d.toDateString()
    if (day !== lastDay) {
      lastDay = day
      const today = day === new Date().toDateString()
      out.push(h('li', { class: 'day-sep' }, h('span', {}, `${today ? '今日 ' : ''}${d.getMonth() + 1}月${d.getDate()}日`)))
    }
    out.push(bubble(state, m, me))
  }
  return out
}

function bubble(state: AppState, m: Message, me: Member | null): HTMLElement {
  const from = state.member(m.fromId)
  const to = state.member(m.toId)
  if (m.kind === 'hire' || m.kind === 'system') return h('li', { class: `sys k-${m.kind}` }, h('span', {}, icon(m.kind === 'hire' ? 'spark' : 'globe', 14), h('span', { class: `kchip k-${m.kind}` }, KIND_LABEL[m.kind]), m.text))
  const mine = m.fromId === me?.id || (from?.kind === 'nexmax' && m.kind === 'assign')
  const time = new Date(m.at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  return h(
    'li',
    { class: `bub ${mine ? 'mine' : ''} k-${m.kind}` },
    face(from, 34, { dot: false }),
    h(
      'div',
      { class: 'bub-body' },
      h('div', { class: 'bub-meta' }, h('b', {}, from?.name ?? '?'), to ? h('span', { class: 'bub-to' }, '→', to.name) : null, h('span', { class: `kchip k-${m.kind}` }, KIND_LABEL[m.kind] ?? m.kind), h('small', {}, time)),
      h('div', { class: 'bub-text', html: esc(m.text).replace(/\n/g, '<br>') }),
    ),
  )
}

// ------------------------------------------------------------------ 資料

const FILE_KIND = (p: string) => (/\.html?$/i.test(p) ? 'HTML' : /\.(md|markdown)$/i.test(p) ? 'MD' : /\.csv$/i.test(p) ? 'CSV' : /\.json$/i.test(p) ? 'JSON' : /\.txt$/i.test(p) ? 'TXT' : 'FILE')

function docsSheet(state: AppState, ui: UiState, act: Actions): HTMLElement {
  const projects = allProjects(state).filter((p) => p.tasks.some((t) => t.files?.length))
  const all = projects.flatMap((p) => p.tasks.flatMap((t) => (t.files ?? []).map((f) => ({ p, t, f }))))
  const cur = ui.doc ? all.find((x) => x.p.goal.id === ui.doc!.goalId && x.f === ui.doc!.path) : undefined
  const copy = () => ui.doc?.content && navigator.clipboard?.writeText(ui.doc.content)
  const viewer = ui.doc
    ? h(
        'div',
        { class: 'doc-view card-in' },
        h(
          'div',
          { class: 'doc-head' },
          h('span', { class: `ftype f-${FILE_KIND(ui.doc.path)}` }, FILE_KIND(ui.doc.path)),
          h('div', { class: 'doc-title' }, h('b', {}, ui.doc.path), cur ? h('small', {}, who(state, cur.t.assigneeId, 20), `・${cur.t.title}`) : null),
          h('button', { class: 'btn small', onclick: copy }, icon('doc', 14), 'コピー'),
        ),
        ui.doc.content === null
          ? h('p', { class: 'empty' }, '読み込み中…')
          : /\.html?$/i.test(ui.doc.path)
            ? h('iframe', { class: 'doc-frame', sandbox: '', srcdoc: ui.doc.content, title: ui.doc.path })
            : /\.(md|markdown|txt)$/i.test(ui.doc.path)
              ? h('div', { class: 'md doc-md' }, h('div', { html: md(ui.doc.content) }))
              : h('pre', { class: 'code' }, ui.doc.content),
      )
    : h('div', { class: 'empty big' }, gicon('doc', 72), h('p', {}, all.length ? '左から資料を選ぶと、ここで読めます' : 'AI社員が作ったファイルが、プロジェクトごとにここへ集まります'))
  return h(
    'div',
    { class: 'split docs' },
    h(
      'div',
      { class: 'split-l' },
      h('div', { class: 'doc-stats' }, gicon('doc', 30), h('b', {}, `${all.length}`), '件の成果物', h('small', {}, `${projects.length} プロジェクト`)),
      projects.length
        ? h(
            'div',
            {},
            ...projects.map((p) =>
              h(
                'div',
                { class: 'doc-group' },
                h('div', { class: 'doc-proj' }, gicon('folder', 22), h('span', {}, p.goal.title)),
                ...p.tasks.flatMap((t) =>
                  (t.files ?? []).map((f) =>
                    h(
                      'button',
                      { class: `doc-item ${ui.doc?.goalId === p.goal.id && ui.doc.path === f ? 'sel' : ''}`, onclick: () => act.openFile(p.goal.id, f) },
                      h('span', { class: `ftype f-${FILE_KIND(f)}` }, FILE_KIND(f)),
                      h('span', { class: 'doc-name' }, h('b', {}, f), h('small', {}, t.title)),
                      face(state.member(t.assigneeId), 26, { dot: false }),
                    ),
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

function personCard(state: AppState, m: Member, act: Actions): HTMLElement {
  return h(
    'button',
    { class: `pcard kind-${m.kind}`, onclick: () => act.openProfile(m.id) },
    face(m, 54, { dot: m.kind !== 'human' }),
    h(
      'div',
      { class: 'pc-main' },
      h('div', { class: 'pc-name' }, h('b', {}, m.name), m.isAdmin ? h('span', { class: 'mini' }, '管理者') : null, h('span', { class: `status st-${m.status}` }, m.kind === 'human' ? (m.online ? 'オンライン' : 'オフライン') : STATUS_LABEL[m.status])),
      h('small', {}, m.role),
      h('div', { class: 'chips' }, ...m.skills.slice(0, 3).map((s) => h('span', { class: 'chip' }, s))),
    ),
    h('span', { class: 'pc-done' }, `完了 ${m.stats.tasksDone}`, m.stats.tasksDone ? icon('check', 12) : null),
  )
}

function peopleSheet(state: AppState, ui: UiState, act: Actions): HTMLElement {
  const me = state.me
  let ms = state.snap?.members ?? []
  if (ui.peopleFilter === 'human') ms = ms.filter((m) => m.kind === 'human')
  if (ui.peopleFilter === 'agent') ms = ms.filter((m) => m.kind !== 'human')
  const stats = officeStats(state)
  const hires = (state.snap?.members ?? []).filter((m) => m.kind === 'agent').sort((a, b) => a.hiredAt.localeCompare(b.hiredAt))
  const ceo = ms.find((m) => m.kind === 'human' && /社長|代表/.test(m.role))
  const nx = ms.find((m) => m.id === 'nexmax')
  return h(
    'div',
    { class: 'people' },
    h(
      'div',
      { class: 'filters' },
      seg(ui.peopleFilter, [['all', 'すべて'], ['human', '人間'], ['agent', 'AI社員・統括AI']], (v) => act.set({ peopleFilter: v }), 'pills'),
      h('div', { class: 'tb-spacer' }),
      me?.isAdmin ? h('div', { class: 'reg' }, h('button', { class: 'btn primary', onclick: act.register }, icon('plus', 16), '人間を登録'), h('small', {}, icon('settings', 11), '管理者のみ')) : null,
    ),
    h(
      'div',
      { class: 'offices' },
      ...OFFICES.map((o) => {
        const st = stats.find((s) => s.id === o.id)!
        const list = ms
          .filter((m) => m.office === o.id && !(o.id === 'osaka' && (m === ceo || m === nx)))
          .sort((a, b) => (a.kind === 'nexmax' ? -1 : 0) - (b.kind === 'nexmax' ? -1 : 0) || (a.kind === 'human' ? 0 : 1) - (b.kind === 'human' ? 0 : 1))
        return h(
          'div',
          { class: `office-col oc-${o.id}` },
          h('div', { class: 'office-banner', style: `background-image:linear-gradient(180deg,rgba(255,255,255,.15),rgba(255,255,255,.85)),url(/backdrops/${o.id}.webp)` }, flag(o.country, 18), h('div', {}, h('b', {}, o.name), h('small', {}, o.nameEn)), h('span', { class: 'office-count' }, icon('user', 12), `人間 ${st.humans}・AI ${st.agents}`)),
          o.id === 'osaka' && (ceo || nx)
            ? h('div', { class: 'pair' }, h('div', { class: 'pair-tag' }, '社長と分身AI'), h('div', { class: 'pair-cards' }, ceo ? personCard(state, ceo, act) : null, h('span', { class: 'pair-link' }, icon('flow', 16)), nx ? personCard(state, nx, act) : null))
            : null,
          h('div', { class: 'pgrid' }, ...list.map((m) => personCard(state, m, act))),
          list.length || (o.id === 'osaka' && (ceo || nx)) ? null : h('p', { class: 'empty' }, 'まだいません'),
        )
      }),
    ),
    hires.length
      ? h(
          'div',
          { class: 'hire-log card-in' },
          h('div', { class: 'flow-title' }, gicon('robot', 26), h('b', {}, 'AI採用履歴'), h('small', {}, '採用の理由が、ひと目でわかる')),
          h(
            'ol',
            { class: 'hire-line' },
            ...hires.slice(-8).map((m) =>
              h(
                'li',
                { onclick: () => act.openProfile(m.id) },
                h('div', { class: 'hl-top' }, face(m, 40, { dot: false }), h('div', {}, h('b', {}, m.name), h('small', {}, new Date(m.hiredAt).toLocaleDateString('ja-JP')))),
                h('p', {}, m.hireReason ?? m.role),
                h('i', { class: 'hl-dot' }, icon('check', 11)),
              ),
            ),
          ),
        )
      : null,
  )
}

// ------------------------------------------------------------------ レポート

function spark(values: number[]): SVGSVGElement {
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * 100},${30 - (v / max) * 26}`).join(' ')
  const wrap = document.createElement('span')
  wrap.innerHTML = `<svg class="spark" viewBox="0 0 100 32" preserveAspectRatio="none"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(47,128,237,.35)"/><stop offset="1" stop-color="rgba(47,128,237,0)"/></linearGradient></defs><polygon points="0,32 ${pts} 100,32" fill="url(#sg)"/><polyline points="${pts}" fill="none" stroke="#2f80ed" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`
  return wrap.firstElementChild as SVGSVGElement
}

/** 直近 7 日の 1 日ごとの数 */
function daily(dates: (string | undefined)[]): number[] {
  const out = new Array(7).fill(0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (const d of dates) {
    if (!d) continue
    const t = new Date(d)
    t.setHours(0, 0, 0, 0)
    const k = 6 - Math.round((today.getTime() - t.getTime()) / 86400000)
    if (k >= 0 && k < 7) out[k]++
  }
  return out
}

function reportsSheet(state: AppState, act: Actions): HTMLElement {
  const k = kpis(state)
  const stats = officeStats(state)
  const members = state.snap?.members ?? []
  const tasks = state.snap?.tasks ?? []
  const goals = state.snap?.goals ?? []
  const done = tasks.filter((t) => t.status === 'done')
  const aiShare = k.tasksDone ? k.aiDone / k.tasksDone : 0
  const byOffice = OFFICES.map((o) => ({ o, n: done.filter((t) => state.member(t.assigneeId)?.office === o.id).length }))
  const maxOffice = Math.max(1, ...byOffice.map((x) => x.n))
  const top = members
    .filter((m) => m.stats.tasksDone > 0)
    .sort((a, b) => b.stats.tasksDone - a.stats.tasksDone)
    .slice(0, 5)
  const maxTop = Math.max(1, ...top.map((m) => m.stats.tasksDone))
  const reports = goals.filter((g) => g.report).slice(-6).reverse()
  const waiting = humanRequests(state)
  const tile = (ic: GlossyIcon, label: string, value: string, sub: string, trend: number[] | null, cls = '') =>
    h('div', { class: `kpi card-in ${cls}` }, h('div', { class: 'kpi-head' }, gicon(ic, 30), h('small', {}, label)), h('div', { class: 'kpi-body' }, h('b', {}, value), trend ? h('div', { class: 'kpi-trend' }, h('small', {}, '推移'), spark(trend)) : null), h('span', {}, sub))
  return h(
    'div',
    { class: 'reports' },
    waiting.length
      ? h(
          'div',
          { class: 'hero-human' },
          figure({ sprite: 'jp-0' }, 'stand', 92),
          h('b', {}, `人間待ち ${waiting.length} 件`),
          h('span', { class: 'hh-div' }),
          h('span', {}, '人間の確認で、次の仕事が動きます'),
          h('div', { class: 'tb-spacer' }),
          h('button', { class: 'btn primary', onclick: () => act.open('tasks', { taskFilter: 'human', taskOffice: 'all' }) }, '確認する', icon('chevron', 14, 'chev-r')),
        )
      : h('div', { class: 'hero-human ok' }, figure({ sprite: 'robot-0' }, 'stand', 84), h('b', {}, '人間待ちはありません'), h('span', { class: 'hh-div' }), h('span', {}, 'AI社員が仕事を進めています')),
    h(
      'div',
      { class: 'kpis' },
      tile('folder', '完了したプロジェクト', String(k.goalsDone), `進行中 ${k.goalsActive}`, daily(goals.map((g) => g.finishedAt))),
      tile('check', '完了したタスク', String(k.tasksDone), `AI ${k.aiDone}・人間 ${k.humanDone}`, daily(done.map((t) => t.finishedAt))),
      tile('robot', '採用した AI社員', String(k.hires), `人間 ${members.filter((m) => m.kind === 'human').length} 人と協働`, daily(members.filter((m) => m.kind === 'agent').map((m) => m.hiredAt))),
      tile('hand', '人間の平均対応時間', k.avgHumanMin === null ? '—' : minutesLabel(Math.round(k.avgHumanMin)), 'お願いしてから完了まで', null, 'human'),
      tile('doc', '成果物', String(k.filesMade), 'AI社員が作ったファイル', daily(tasks.filter((t) => t.files?.length).map((t) => t.finishedAt))),
    ),
    h(
      'div',
      { class: 'charts' },
      h(
        'div',
        { class: 'chart-card card-in' },
        h('div', { class: 'flow-title' }, gicon('people', 24), h('b', {}, 'AI と人間の分担')),
        h('div', { class: 'donut-wrap' }, figure({ sprite: 'robot-0' }, 'stand', 92), h('div', { class: 'donut', style: `--p:${(aiShare * 100).toFixed(1)}` }, h('b', {}, `${Math.round(aiShare * 100)}%`), h('small', {}, 'AI')), h('ul', { class: 'legend' }, h('li', { class: 'ai' }, `AI ${k.aiDone} 件`), h('li', { class: 'human' }, `人間 ${k.humanDone} 件`))),
      ),
      h('div', { class: 'chart-card card-in' }, h('div', { class: 'flow-title' }, gicon('globe', 24), h('b', {}, '拠点ごとの完了タスク')), h('ul', { class: 'hbars' }, ...byOffice.map(({ o, n }) => h('li', {}, h('span', { class: 'hb-label' }, flag(o.country, 13), o.name.replace('オフィス', '')), h('span', { class: 'hb-bar' }, h('i', { style: `width:${(n / maxOffice) * 100}%` })), h('b', {}, String(n)))))),
      h(
        'div',
        { class: 'chart-card card-in' },
        h('div', { class: 'flow-title' }, gicon('spark', 24), h('b', {}, 'よく働いた人')),
        top.length
          ? h('ul', { class: 'ranking' }, ...top.map((m, i) => h('li', { onclick: () => act.openProfile(m.id) }, h('i', { class: `medal m${i + 1}` }, String(i + 1)), face(m, 30, { dot: false }), h('span', { class: 'rk-name' }, m.name), h('span', { class: `hb-bar ${m.kind}` }, h('i', { style: `width:${(m.stats.tasksDone / maxTop) * 100}%` })), h('b', {}, `${m.stats.tasksDone}件`))))
          : h('p', { class: 'empty' }, 'まだありません'),
      ),
    ),
    h(
      'div',
      { class: 'charts two' },
      h('div', { class: 'chart-card card-in' }, h('div', { class: 'flow-title' }, icon('location', 20), h('b', {}, 'いまの拠点')), h('ul', { class: 'office-now' }, ...stats.map((s) => h('li', {}, h('i', { class: `on-dot ${s.online || s.working ? 'on' : ''}` }), flag(countryOf(s.id), 14), h('b', {}, officeInfo(s.id).name), h('span', {}, `稼働中 ${s.working}`), h('span', {}, `オンライン ${s.online}`), s.waitingHuman ? h('em', {}, icon('user', 11), `人間待ち ${s.waitingHuman}`) : null)))),
      h(
        'div',
        { class: 'chart-card card-in' },
        h('div', { class: 'flow-title' }, gicon('doc', 24), h('b', {}, '完了報告'), h('span', { class: 'by-nx' }, h('img', { src: '/brand/nexmax-face.webp', alt: '' }), 'ネクマックス')),
        reports.length
          ? h('div', { class: 'report-list' }, ...reports.map((g) => h('details', { class: 'report-item' }, h('summary', {}, h('b', {}, g.title), h('small', {}, g.finishedAt ? timeAgo(g.finishedAt) : '')), h('div', { class: 'md', html: md(g.report!) }))))
          : h('div', { class: 'report-empty' }, gicon('doc', 64), h('div', {}, h('b', {}, 'まだ完了報告はありません'), h('small', {}, 'プロジェクトが完了すると、ネクマックスがここに報告します'), h('button', { class: 'btn small', onclick: () => act.open('projects') }, 'プロジェクトを見る', icon('chevron', 12, 'chev-r')))),
      ),
    ),
  )
}

// ------------------------------------------------------------------ プロフィール（2 列のパネル：左に人物、右にたまっていくコンテキスト）

const MEM_LABEL: Record<string, string> = { task: '仕事', feedback: 'フィードバック', note: 'メモ', reflection: 'ふりかえり', conversation: '相談' }
const MEM_ICON: Record<string, string> = { task: 'task', feedback: 'spark', note: 'doc', reflection: 'globe', conversation: 'chat' }

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
  const note = h('input', { 'data-keep': `pf-note-${m.id}`, placeholder: '覚えておいてほしいことを書く…' }) as HTMLInputElement
  const addNote = () => {
    if (note.value.trim()) {
      act.addMemory(m, note.value.trim())
      note.value = ''
    }
  }
  note.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && !(e as KeyboardEvent).isComposing && addNote())
  const pair = m.id === 'nexmax' ? (state.snap?.members ?? []).find((x) => x.kind === 'human' && /社長|代表/.test(x.role)) : /社長|代表/.test(m.role) ? state.member('nexmax') : undefined
  const mem = ui.profileMemory ?? []
  const shown = [...mem].reverse().filter((e) => ui.memKind === 'all' || e.kind === ui.memKind)
  const LANG: Record<string, [('jp' | 'kh' | null), string]> = { ja: ['jp', '日本語'], km: ['kh', 'クメール語'], en: [null, '英語'] }
  return h(
    'aside',
    { class: 'profile glass' },
    h('header', { class: 'pf-bar' }, icon('user', 18), h('b', {}, 'プロフィール'), h('div', { class: 'tb-spacer' }), h('button', { class: 'sheet-close', onclick: () => act.set({ profileId: null }) }, icon('close', 18))),
    h(
      'div',
      { class: 'pf-cols' },
      h(
        'div',
        { class: 'pf-left' },
        h(
          'div',
          { class: 'pf-head' },
          h('div', { class: 'pf-avatar' }, face(m, 104, { dot: false })),
          h(
            'div',
            {},
            h('h3', {}, m.name),
            h('div', { class: 'pf-role' }, m.role),
            h('div', { class: 'pf-office' }, flag(countryOf(m.office), 14), officeInfo(m.office).name, m.deskIndex >= 0 ? `・${m.deskIndex + 1} 番の席` : ''),
            h('span', { class: `status st-${m.status}` }, m.kind === 'human' ? (m.online ? 'オンライン' : 'オフライン') : STATUS_LABEL[m.status]),
          ),
        ),
        pair ? h('div', { class: 'pf-pair' }, icon('people', 15), m.id === 'nexmax' ? `${pair.name}社長の隣の席で、社長の分身として働いています` : 'となりの席のネクマックスが、分身として仕事を分けて配ります') : null,
        task
          ? h('div', { class: `pf-task ${task.requiresHuman ? 'human' : ''}` }, h('small', {}, icon('task', 13), task.requiresHuman ? 'お願いしている仕事' : '現在のタスク'), h('b', {}, task.title), task.assignReason ? h('em', {}, `理由：${task.assignReason}`) : null, task.status === 'waiting_human' && me && (task.assigneeId === me.id || me.isAdmin) ? h('button', { class: 'btn small human', onclick: () => act.complete(task.id) }, '対応する') : null)
          : null,
        m.persona ? h('div', { class: 'pf-about' }, h('b', {}, icon('user', 14), 'このメンバーについて'), h('p', {}, m.persona)) : null,
        h('div', { class: 'chips' }, ...m.skills.map((s) => h('span', { class: 'chip' }, s))),
        h('div', { class: 'chips langs' }, icon('globe', 15), ...m.languages.map((l) => h('span', { class: 'chip lang' }, LANG[l]?.[0] ? flag(LANG[l][0]!, 11) : null, LANG[l]?.[1] ?? l))),
        h('div', { class: 'pf-stats' }, h('span', {}, icon('check', 15), h('b', {}, String(m.stats.tasksDone)), '完了'), h('span', {}, icon('chat', 15), h('b', {}, String(m.stats.messages)), 'やり取り'), h('span', {}, icon('people', 15), h('b', {}, timeAgo(m.hiredAt)), m.kind === 'agent' ? '採用' : '登録')),
        m.hireReason ? h('div', { class: 'reason soft' }, `採用理由：${m.hireReason}`) : null,
        me && me.id !== m.id ? h('div', { class: 'pf-talk' }, icon('chat', 16), talk, h('button', { class: 'send-ico', onclick: send, title: '送る' }, icon('send', 16))) : null,
        h(
          'div',
          { class: 'pf-actions' },
          h('button', { class: 'btn small', onclick: () => act.focusMember(m.id) }, icon('location', 14), '3D で見る'),
          h('button', { class: 'btn small', onclick: () => act.open('chat', { chatWith: m.id }) }, icon('chat', 14), 'チャット'),
          me && (me.isAdmin || me.id === m.id) && m.kind !== 'nexmax' ? h('button', { class: 'btn small', onclick: () => act.edit(m) }, icon('edit', 14), '編集') : null,
          me?.isAdmin && m.kind === 'agent' ? h('button', { class: 'link danger', onclick: () => act.retire(m) }, '退職') : null,
        ),
      ),
      h(
        'div',
        { class: 'pf-right' },
        h('div', { class: 'ctx-head' }, gicon('spark', 34), h('div', {}, h('b', {}, 'たまっていくコンテキスト'), h('small', {}, '一緒に働くほど、この人の理解が深まります')), h('span', { class: 'ctx-count' }, `${mem.length} 件`)),
        h('div', { class: 'kind-filter' }, ...(['all', 'task', 'conversation', 'feedback', 'reflection', 'note'] as const).map((k) => h('button', { class: ui.memKind === k ? 'on' : '', onclick: () => act.set({ memKind: k }) }, k === 'all' ? 'すべて' : MEM_LABEL[k]))),
        ui.profileMemory === null
          ? h('p', { class: 'empty' }, '読み込み中…')
          : shown.length
            ? h('ol', { class: 'ctx-line' }, ...shown.slice(0, 40).map((e) => h('li', { class: `ctx mk-${e.kind}` }, h('i', { class: 'ctx-dot' }), h('div', { class: 'ctx-card' }, h('div', { class: 'ctx-meta' }, icon(MEM_ICON[e.kind] ?? 'doc', 14), h('b', {}, MEM_LABEL[e.kind] ?? e.kind), h('small', {}, timeAgo(e.at)), e.kind === 'task' ? h('span', { class: 'done-pill' }, '完了') : null), h('p', {}, e.text)))))
            : h('p', { class: 'empty' }, 'まだ記憶はありません'),
        h('div', { class: 'ctx-add' }, h('div', { class: 'ctx-add-head' }, icon('doc', 15), h('b', {}, '記憶を追加'), h('small', {}, 'このメンバーの次の判断に活かされます')), h('div', { class: 'ctx-add-row' }, note, h('button', { class: 'btn primary small', onclick: addNote }, icon('plus', 14), '記憶に追加'))),
      ),
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
