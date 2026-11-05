// 3D の上に浮かぶガラスのカード（参考デザイン：上にプロジェクト進捗・AIアシスタント・世界のチーム、
// 左下に人間の対応待ち、右下にやり取り、下の中央にドック）
import type { Member, Message } from '../../../shared/types'
import { OFFICES, STATUS_LABEL, countryOf, officeInfo } from '../../../shared/types'
import type { AppState } from '../state'
import { face, nexmaxBadge } from './avatar'
import { activeProjects, approvals, approverOf, humanRequests, isApprover, minutesLabel, officeStats, project, unansweredQuestions, upcomingHuman } from './derive'
import { approvalRow, type Actions } from './sheets'
import { IS_ARTIFACT, brandMark } from '../brand'
import { clock, esc, h } from './dom'
import { flag, gicon, icon, type GlossyIcon } from './icons'
import { MAP_DOTS } from './mapDots'

export type SheetId = 'projects' | 'tasks' | 'chat' | 'docs' | 'people' | 'reports' | 'stock'
export type View = 'all' | 'jp' | 'tokyo' | 'osaka' | 'phnompenh'

export const KIND_LABEL: Record<string, string> = {
  assign: '依頼',
  chat: '会話',
  question: '質問',
  answer: '回答',
  handoff: '引き継ぎ',
  report: '報告',
  review: 'レビュー',
  hire: '採用',
  system: 'お知らせ',
}

// ------------------------------------------------------------------ 上のバー

export interface TopbarHandlers {
  view: View
  onView(v: View): void
  onGoal(): void
  onSearch(anchor: HTMLElement): void
  onBell(anchor: HTMLElement): void
  onTimeline(anchor: HTMLElement): void
  onSettings(anchor: HTMLElement): void
  onMe(anchor: HTMLElement): void
}

export function topbar(state: AppState, hd: TopbarHandlers): HTMLElement {
  const me = state.me
  const bellCount =
    (state.snap?.tasks ?? []).filter((t) => t.assigneeId === me?.id && t.status === 'waiting_human').length + unansweredQuestions(state, me).length + (isApprover(state) ? approvals(state).length : 0)
  const views: [View, string][] = [
    ['all', '全体'],
    ['jp', '日本'],
    ['tokyo', '東京'],
    ['osaka', '大阪'],
    ['phnompenh', 'プノンペン'],
  ]
  const btn = (name: GlossyIcon, title: string, on: (el: HTMLElement) => void, badge?: number) => {
    const b = h('button', { class: 'tb-icon', title, 'aria-label': title }, icon(name, 24), badge ? h('i', { class: 'tb-dot' }, String(badge)) : null)
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      on(b)
    })
    return b
  }
  const meBtn = h('button', { class: 'tb-me', title: 'アカウント' }, face(me ?? undefined, 34, { dot: false }), icon('chevron', 16))
  meBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    hd.onMe(meBtn)
  })
  return h(
    'header',
    { class: 'topbar' },
    brandMark(),
    h('nav', { class: 'pills' }, ...views.map(([v, label]) => h('button', { class: `pill ${hd.view === v ? 'on' : ''}`, onclick: () => hd.onView(v) }, label))),
    h('button', { class: 'pill cta', onclick: hd.onGoal }, icon('plus', 16), 'ゴールを伝える'),
    h('div', { class: 'tb-spacer' }),
    h(
      'div',
      { class: 'tb-tools' },
      btn('search', '検索', hd.onSearch),
      btn('bell', 'お知らせ', hd.onBell, bellCount),
      btn('calendar', '今日のタイムライン', hd.onTimeline),
      btn('settings', '設定', hd.onSettings),
    ),
    meBtn,
  )
}

// ------------------------------------------------------------------ プロジェクト進捗

function ring(pct: number, size = 78): SVGSVGElement {
  const r = 32
  const c = 2 * Math.PI * r
  const wrap = document.createElement('span')
  wrap.innerHTML = `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 80 80"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5ee7ff"/><stop offset="1" stop-color="#2f80ed"/></linearGradient></defs><circle cx="40" cy="40" r="${r}" fill="none" stroke="rgba(47,128,237,.12)" stroke-width="8"/><circle cx="40" cy="40" r="${r}" fill="none" stroke="url(#rg)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(c * pct).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 40 40)"/><text x="40" y="46" text-anchor="middle" font-size="19" font-weight="800" fill="#1c3f78">${Math.round(pct * 100)}%</text></svg>`
  return wrap.firstElementChild as SVGSVGElement
}

export function projectCard(state: AppState, onOpen: (goalId?: string) => void): HTMLElement {
  const active = activeProjects(state)
  const tasks = active.flatMap((p) => p.tasks)
  const pct = tasks.length ? tasks.filter((t) => t.status === 'done').length / tasks.length : 0
  const recentDone = (state.snap?.goals ?? []).filter((g) => g.status === 'done').slice(-1)[0]
  const rows = active.slice(0, 3)
  const tone = (p: (typeof active)[number]) => (p.phase === 'plan' ? 'plan' : p.humanWaiting ? 'human' : 'ai')
  return h(
    'section',
    { class: 'card glass hud-project', onclick: () => onOpen() },
    h('div', { class: 'card-title' }, gicon('chart', 20), 'プロジェクト進捗', h('span', { class: 'card-sub' }, active.length ? `進行中 ${active.length}` : '待機中')),
    h(
      'div',
      { class: 'pc-body' },
      ring(active.length ? pct : recentDone ? 1 : 0),
      rows.length
        ? h(
            'ul',
            { class: 'pc-bars' },
            ...rows.map((p) =>
              h(
                'li',
                {
                  class: `pc-row t-${tone(p)}`,
                  onclick: (e: Event) => {
                    e.stopPropagation()
                    onOpen(p.goal.id)
                  },
                },
                h('span', { class: 'pc-name', title: p.goal.title }, p.goal.title),
                h('span', { class: 'pc-bar' }, h('i', { style: `width:${Math.max(4, p.pct * 100)}%` })),
                h('b', {}, `${Math.round(p.pct * 100)}%`),
              ),
            ),
          )
        : h('p', { class: 'pc-empty' }, recentDone ? `最近の完了：${recentDone.title}` : 'ゴールを伝えると、ここに進み具合が出ます'),
    ),
    h(
      'div',
      { class: 'pc-foot' },
      h('span', { class: 'chip ai' }, icon('robot', 14), `AI 作業中 ${tasks.filter((t) => !t.requiresHuman && t.status === 'in_progress').length}`),
      h('span', { class: 'chip human' }, icon('hand', 14), `人間待ち ${tasks.filter((t) => t.status === 'waiting_human').length}`),
      h('span', { class: 'chip done' }, `完了 ${tasks.filter((t) => t.status === 'done').length}/${tasks.length}`),
    ),
  )
}

// ------------------------------------------------------------------ AIアシスタント（ネクマックス）

export interface AssistantHandlers {
  onGoal(): void
  onAsk(): void
  onReport(): void
  onNexmax(): void
}

export function assistantCard(state: AppState, hd: AssistantHandlers): HTMLElement {
  const nx = state.member('nexmax')
  const ceo = (state.snap?.members ?? []).find((m) => m.kind === 'human' && /社長|代表/.test(m.role))
  const busy = nx && nx.status !== 'idle'
  const status = nx ? (nx.statusText || (busy ? STATUS_LABEL[nx.status] : `待機中${ceo ? `・${ceo.name.split(/\s/)[0]}社長の隣の席` : ''}`)) : '—'
  return h(
    'section',
    { class: `card glass hud-assistant ${busy ? 'busy' : ''}` },
    h('div', { class: 'card-title' }, gicon('robot', 20), 'AIアシスタント', h('span', { class: 'card-sub' }, 'ネクマックス')),
    h(
      'div',
      { class: 'as-body' },
      h('button', { class: 'as-face', title: 'ネクマックスのプロフィール', onclick: hd.onNexmax }, nexmaxBadge(62)),
      h(
        'div',
        { class: 'as-actions' },
        h('div', { class: 'as-status' }, h('i', { class: `pres st-${nx?.status ?? 'idle'}` }), status),
        h('button', { class: 'as-chip', onclick: hd.onGoal }, icon('target', 16), 'ゴールを伝える'),
        h('button', { class: 'as-chip', onclick: hd.onAsk }, icon('chat', 16), 'いまの進み具合を聞く'),
        IS_ARTIFACT ? h('button', { class: 'as-chip', onclick: hd.onReport }, icon('inbox', 16), 'メモしてストック') : h('button', { class: 'as-chip', onclick: hd.onReport }, icon('mic', 16), '話してストック'),
      ),
    ),
  )
}

// ------------------------------------------------------------------ 世界のチーム（ドット地図）

const MAP = { lon0: 96, lon1: 146, lat0: 7, lat1: 40, w: 270, h: 96 }
const px = (lon: number) => ((lon - MAP.lon0) / (MAP.lon1 - MAP.lon0)) * MAP.w
const py = (lat: number) => MAP.h - ((lat - MAP.lat0) / (MAP.lat1 - MAP.lat0)) * MAP.h
const PLACES: Record<string, { lon: number; lat: number; label: string }> = {
  tokyo: { lon: 139.7, lat: 35.7, label: '東京' },
  osaka: { lon: 135.5, lat: 34.7, label: '大阪' },
  phnompenh: { lon: 104.9, lat: 11.6, label: 'プノンペン' },
}

export function worldCard(state: AppState, pulse: { from: string; to: string; at: number } | null, onOffice: (id: string) => void): HTMLElement {
  const stats = officeStats(state)
  const dots = MAP_DOTS.map(([lon, lat]) => `<circle cx="${px(lon).toFixed(1)}" cy="${py(lat).toFixed(1)}" r="1.15"/>`).join('')
  const arc = (a: string, b: string, cls: string) => {
    const A = PLACES[a]
    const B = PLACES[b]
    const x1 = px(A.lon)
    const y1 = py(A.lat)
    const x2 = px(B.lon)
    const y2 = py(B.lat)
    const mx = (x1 + x2) / 2
    const my = Math.min(y1, y2) - Math.abs(x2 - x1) * 0.28 - 8
    return `<path class="${cls}" d="M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}"/>`
  }
  const live = pulse && Date.now() - pulse.at < 4000 ? pulse : null
  const isLive = (a: string, b: string) => !!live && ((live.from === a && live.to === b) || (live.from === b && live.to === a))
  const pins = Object.entries(PLACES)
    .map(([id, p]) => `<g class="pin" data-office="${id}"><circle class="pin-glow" cx="${px(p.lon)}" cy="${py(p.lat)}" r="7"/><circle class="pin-dot" cx="${px(p.lon)}" cy="${py(p.lat)}" r="3.6"/></g>`)
    .join('')
  const svg = `<svg class="wc-map" viewBox="0 0 ${MAP.w} ${MAP.h}"><g class="dots">${dots}</g>${arc('osaka', 'phnompenh', `arc ${isLive('osaka', 'phnompenh') || isLive('tokyo', 'phnompenh') ? 'live' : ''}`)}${arc('tokyo', 'osaka', `arc short ${isLive('tokyo', 'osaka') ? 'live' : ''}`)}${pins}</svg>`
  const legend = h(
    'ul',
    { class: 'wc-legend' },
    ...stats.map((s) =>
      h(
        'li',
        { onclick: () => onOffice(s.id) },
        flag(countryOf(s.id), 12),
        h('b', {}, flag(countryOf(s.id), 12), officeInfo(s.id).name.replace('オフィス', '')),
        h('span', { title: '人間（オンライン）' }, icon('user', 12), `${s.humans}${s.online ? `(${s.online})` : ''}`),
        h('span', { title: 'AI社員' }, icon('robot', 12), String(s.agents)),
        s.waitingHuman ? h('em', { title: '人間の対応待ち' }, `待${s.waitingHuman}`) : null,
      ),
    ),
  )
  const card = h('section', { class: 'card glass hud-world' }, h('div', { class: 'card-title' }, gicon('globe', 20), '世界のチーム', h('span', { class: 'card-sub' }, '3 拠点')), h('div', { class: 'wc-body', html: svg }), legend)
  card.querySelectorAll<SVGGElement>('.pin').forEach((g) => g.addEventListener('click', () => onOffice(g.dataset.office!)))
  return card
}

// ------------------------------------------------------------------ 人間の対応待ち（左下）

export function humanCard(state: AppState, onOpenTask: (taskId: string) => void, onComplete: (taskId: string) => void, act: Actions): HTMLElement {
  const me = state.me
  const reqs = humanRequests(state)
  const upcoming = upcomingHuman(state)
  // 承認待ち：承認する人にはボタン付きで先頭に。ほかの人には自分が出したものだけ
  const aps = approvals(state)
  const mineAp = isApprover(state)
  const shownAp = mineAp ? aps : aps.filter((a) => a.by?.id === me?.id)
  const approver = approverOf(state)
  const total = reqs.length + (mineAp ? aps.length : 0)
  return h(
    'section',
    { class: `card glass hud-human ${total ? 'has' : ''}` },
    h('div', { class: 'card-title' }, gicon('hand', 20, 'warm'), '人間の対応待ち', h('span', { class: 'card-sub' }, total ? `${total} 件` : 'なし')),
    shownAp.length
      ? h(
          'div',
          { class: 'ap-box' },
          h('div', { class: 'ap-box-title' }, gicon('lock', 16, 'warm'), mineAp ? `あなたの承認待ち ${aps.length} 件` : `${approver?.name ?? '承認する人'}さんの承認待ち ${shownAp.length} 件`),
          ...shownAp.slice(0, mineAp ? 3 : 2).map((a) => approvalRow(state, a, act, mineAp)),
        )
      : null,
    reqs.length
      ? h(
          'ul',
          { class: 'hr-list' },
          ...reqs.slice(0, 4).map((r) => {
            const mine = r.task.assigneeId === me?.id
            return h(
              'li',
              { class: `hr-row ${mine ? 'mine' : ''} ${r.waitedMin >= 60 ? 'late' : ''}`, onclick: () => onOpenTask(r.task.id) },
              face(r.member, 30),
              h(
                'div',
                { class: 'hr-main' },
                h('div', { class: 'hr-who' }, r.member ? flag(countryOf(r.member.office), 11) : null, h('b', {}, r.member?.name ?? '担当未定'), h('span', { class: 'hr-wait' }, icon('clock', 12), `${minutesLabel(r.waitedMin)}待ち`)),
                h('div', { class: 'hr-task' }, r.task.title),
                r.task.assignReason ? h('div', { class: 'hr-why' }, `なぜこの人に：${r.task.assignReason}`) : null,
              ),
              mine
                ? h(
                    'button',
                    {
                      class: 'btn tiny primary',
                      onclick: (e: Event) => {
                        e.stopPropagation()
                        onComplete(r.task.id)
                      },
                    },
                    '対応する',
                  )
                : null,
            )
          }),
        )
      : shownAp.length
        ? null
        : h('p', { class: 'hr-empty' }, 'いま人間を待っている仕事はありません。AI社員が進めています'),
    upcoming.length ? h('div', { class: 'hr-next' }, icon('clock', 13), `このあと人間に回る仕事 ${upcoming.length} 件`) : null,
  )
}

// ------------------------------------------------------------------ やり取り（右下）

export function feedCard(state: AppState, onOpen: () => void): HTMLElement {
  const msgs = (state.snap?.messages ?? []).slice(-6).reverse()
  return h(
    'section',
    { class: 'card glass hud-feed', onclick: onOpen },
    h('div', { class: 'card-title' }, gicon('chat', 20), 'やり取り', h('span', { class: 'card-sub live-dot' }, 'LIVE')),
    msgs.length ? h('ul', { class: 'feed' }, ...msgs.map((m) => feedRow(state, m))) : h('p', { class: 'hr-empty' }, 'まだやり取りはありません'),
  )
}

export function feedRow(state: AppState, m: Message): HTMLElement {
  const from = state.member(m.fromId)
  const to = state.member(m.toId)
  const cross = from && to && countryOf(from.office) !== countryOf(to.office)
  return h(
    'li',
    { class: `fr k-${m.kind}`, title: m.text },
    face(from, 20, { dot: false }),
    h('span', { class: 'fr-names' }, h('b', {}, short(from)), h('span', { class: 'fr-arrow' }, cross ? '⇄' : '→'), h('b', {}, to ? short(to) : '全員')),
    h('span', { class: `kchip k-${m.kind}` }, KIND_LABEL[m.kind] ?? m.kind),
    to ? flag(countryOf(to.office), 11) : null,
    h('span', { class: 'fr-text', html: esc(m.text) }),
  )
}

const short = (m: Member | undefined) => (m ? m.name.replace(/（.*?）/g, '') : '?')

// ------------------------------------------------------------------ ドック（下の中央）

export function dock(state: AppState, open: SheetId | null, onOpen: (id: SheetId) => void): HTMLElement {
  const me = state.me
  const myWaiting = (state.snap?.tasks ?? []).filter((t) => t.assigneeId === me?.id && t.status === 'waiting_human').length
  const qs = unansweredQuestions(state, me).length
  const items: [SheetId, GlossyIcon, string, number][] = [
    ['projects', 'folder', 'プロジェクト', 0],
    ['tasks', 'task', 'タスク', myWaiting],
    ['chat', 'chat', 'チャット', qs],
    ['docs', 'doc', '資料', 0],
    ['people', 'people', '人材', 0],
    ['reports', 'chart', 'レポート', 0],
  ]
  return h(
    'nav',
    { class: 'dock glass' },
    ...items.map(([id, ic, label, badge]) => h('button', { class: `dock-item ${open === id ? 'on' : ''}`, onclick: () => onOpen(id) }, gicon(ic, 66), h('span', { class: 'dock-label' }, label), badge ? h('i', { class: 'dock-badge' }, String(badge)) : null)),
  )
}

// ------------------------------------------------------------------ 拠点の時計（3D の看板と同じ情報を、見出しとして）

export function officeClocks(): HTMLElement {
  return h(
    'div',
    { class: 'clocks' },
    ...OFFICES.filter((o) => o.id !== 'tokyo').map((o) => {
      const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: o.tz, hour: '2-digit', hour12: false }).format(new Date()))
      const day = hour >= 6 && hour < 18
      return h('span', { class: `clock-pill ${day ? 'day' : 'night'}` }, icon(day ? 'sun' : 'moon', 16), h('b', { 'data-tz': o.tz }, clock(o.tz)), h('small', {}, o.country === 'jp' ? '日本 JST' : 'カンボジア ICT'))
    }),
  )
}

export function progressOf(state: AppState, goalId: string): number {
  const g = state.snap?.goals.find((x) => x.id === goalId)
  return g ? project(state, g).pct : 0
}

// ------------------------------------------------------------------ マイク（話したことを、やることストックへ）

export interface Captured {
  text: string
  at: number
}

/** ドックの右のマイク。押すと聞き始め、もう一度押すと止まる。上の小さなボタンでストックを開く */
export function micButton(listening: boolean, readyCount: number, onToggle: () => void, onOpen: () => void, mode: 'voice' | 'text' = 'voice'): HTMLElement {
  if (mode === 'text')
    return h(
      'div',
      { class: 'mic-dock' },
      h('button', { class: 'stock-chip', onclick: onOpen, title: 'やることストックを開く' }, gicon('inbox', 18), 'ストック', readyCount ? h('b', {}, String(readyCount)) : null),
      h('button', { class: 'mic-btn', onclick: onToggle, title: '思いついたことを書いてストックする' }, gicon('inbox', 66, 'warm'), h('span', { class: 'dock-label' }, 'メモ')),
    )
  return h(
    'div',
    { class: `mic-dock ${listening ? 'on' : ''}` },
    h('button', { class: 'stock-chip', onclick: onOpen, title: 'やることストックを開く' }, gicon('inbox', 18), 'ストック', readyCount ? h('b', {}, String(readyCount)) : null),
    h('button', { class: 'mic-btn', onclick: onToggle, title: listening ? '止める' : '話してストックする', 'aria-pressed': listening ? 'true' : 'false' }, h('span', { class: 'mic-ring' }), gicon('mic', 66, listening ? 'white' : 'warm'), h('span', { class: 'dock-label' }, listening ? '聞いています' : '話す')),
  )
}

/** 聞いている間だけ出る、ドックの上のパネル：いま話している言葉と、ストックに入ったもの */
export function voicePanel(
  state: AppState,
  v: { listening: boolean; interim: string; lang: string; captured: Captured[] },
  langs: [string, string][],
  hd: { onStop: () => void; onLang: (l: string) => void; onOpen: () => void },
): HTMLElement | null {
  if (!v.listening && !v.captured.some((c) => Date.now() - c.at < 6000)) return null
  const stock = state.snap?.stock ?? []
  const organizing = stock.filter((s) => s.status === 'organizing').length
  const recentReady = stock
    .filter((s) => s.status === 'ready' && Date.now() - Date.parse(s.updatedAt) < 120_000)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3)
  const sel = h('select', { class: 'vp-lang', title: '話す言葉' }, ...langs.map(([k, label]) => h('option', { value: k, selected: k === v.lang }, label))) as HTMLSelectElement
  sel.addEventListener('change', () => hd.onLang(sel.value))
  return h(
    'section',
    { class: 'voice-panel glass' },
    h(
      'div',
      { class: 'vp-head' },
      h('span', { class: `vp-dot ${v.listening ? 'on' : ''}` }),
      h('b', {}, v.listening ? h('span', {}, '聞いています', h('small', { class: 'vp-hint' }, ' — 思いついたことを、どんどん話してください')) : 'ストックしました'),
      sel,
      v.listening ? h('button', { class: 'btn small', onclick: hd.onStop }, '止める') : null,
    ),
    h('p', { class: `vp-live ${v.interim ? '' : 'muted'}` }, v.interim || (v.listening ? '（ひと息つくと、ストックに入ります）' : '')),
    h(
      'div',
      { class: 'vp-foot' },
      organizing ? h('span', { class: 'vp-org' }, h('i', { class: 'spin' }), `ネクマックスが整理中（${organizing}）`) : null,
      ...recentReady.map((s) => h('span', { class: `vp-item k-${s.kind}` }, icon('check', 13), s.title)),
      h('div', { class: 'tb-spacer' }),
      h('button', { class: 'link', onclick: hd.onOpen }, `ストックを見る（${stock.filter((s) => s.status === 'ready').length}）`),
    ),
  )
}
