// 画面の入口：ログイン → 3D のバーチャルオフィス（東京・大阪・プノンペン）＋ ガラスの HUD
// 参考デザイン（docs/img/design_reference.jpg）：上にロゴ・表示の切り替え・道具、上の中央にプロジェクト進捗・AIアシスタント・世界のチーム、
// 左下に人間の対応待ち、右下にやり取り、下の中央にドック（プロジェクト・タスク・チャット・資料・人材・レポート）
import './styles.css'
import type { Goal, Member, Message, OfficeId, Task } from '../../shared/types'
import { OFFICES, officeInfo } from '../../shared/types'
import { Api, connect, setNotifier } from './api'
import { IS_ARTIFACT, asset, brandMark } from './brand'
import { VOICE_LANGS, Voice } from './voice'
import { AppState } from './state'
import { clock, h } from './ui/dom'
import { activeProjects, approverOf, isApprover } from './ui/derive'
import { assistantCard, dock, feedCard, humanCard, micButton, projectCard, topbar, voicePanel, worldCard, type Captured, type SheetId, type View } from './ui/hud'
import { flag, icon } from './ui/icons'
import { initialUi, mePop, notificationsPop, profilePanel, searchPop, settingsPop, sheet, timelinePop, type Actions, type UiState } from './ui/sheets'
import type { OfficeBoard, OfficeWorldApi } from './world/api'

const root = document.getElementById('app')!

async function boot(): Promise<void> {
  try {
    const r = await Api.me()
    if (r.me) startApp()
    else if (r.join) showJoin(r.join)
    else showLogin()
  } catch (e) {
    if (IS_ARTIFACT) showProblem((e as Error).message)
    else showLogin()
  }
}

// ------------------------------------------------------------------ アーティファクト版：参加（claude.ai のアカウントで入る。パスワードは無い）

function showProblem(msg: string): void {
  root.replaceChildren(h('div', { class: 'login-wrap' }, h('div', { class: 'login-bg', style: `background-image:url(${asset('brand/login-bg.webp')})` }), h('div', { class: 'login-card' }, brandMark(true), h('h1', {}, '開けませんでした'), h('p', { class: 'lead' }, msg))))
}

function showJoin(info: { name: string; owner: boolean }): void {
  root.replaceChildren()
  root.className = ''
  const name = h('input', { id: 'join-name', value: info.name, placeholder: '名前（例：山田 花子）', autocomplete: 'name', required: true, maxlength: 40 }) as HTMLInputElement
  const office = h('select', { id: 'join-office' }, ...OFFICES.map((o) => h('option', { value: o.id }, `${o.country === 'jp' ? '🇯🇵' : '🇰🇭'} ${o.name}`))) as HTMLSelectElement
  const role = h('input', { id: 'join-role', placeholder: info.owner ? '役割（例：代表）' : '役割（例：営業・現地マネージャー）', maxlength: 40 }) as HTMLInputElement
  const skills = h('input', { id: 'join-skills', placeholder: 'スキル（読点区切り：営業、顧客対応、クメール語）' }) as HTMLInputElement
  const persona = h('textarea', { id: 'join-persona', rows: 2, placeholder: '自己紹介・得意なこと（仕事の割り振りに使います）' }) as HTMLTextAreaElement
  const err = h('p', { class: 'err' })
  const field = (label: string, el: HTMLElement) => h('label', { class: 'lg-field' }, h('span', {}, label), el)
  const form = h(
    'form',
    {
      class: 'login-card join-card',
      onsubmit: async (e: Event) => {
        e.preventDefault()
        err.textContent = ''
        try {
          await Api.join({ name: name.value, office: office.value, role: role.value, skills: skills.value, persona: persona.value })
          startApp()
        } catch (x) {
          err.textContent = (x as Error).message
        }
      },
    },
    brandMark(true),
    h('h1', {}, info.owner ? 'オフィスを開きましょう' : 'オフィスに参加'),
    h('p', { class: 'lead' }, info.owner ? 'あなたが承認する人です。ほかの人のゴールは、あなたが「始める」を押してから、あなたの Claude で動きます。' : '参加すると、人間にしかできない仕事があなたに届きます。ゴールは承認する人が「始める」を押してから動きます。'),
    field('名前', name),
    field('拠点', office),
    field('役割', role),
    field('スキル', skills),
    field('自己紹介', persona),
    h('button', { class: 'btn primary lg-btn', type: 'submit' }, info.owner ? '開く' : '参加する', h('span', { class: 'lg-arrow' }, '→')),
    err,
    h('small', { class: 'hint' }, '名前と自己紹介は、このページを開ける人に見えます'),
  )
  const welcome = h('div', { class: 'lg-welcome' }, h('div', { class: 'lg-bubble' }, 'ようこそ！'), h('img', { src: asset('brand/nexmax-face.webp'), alt: 'ネクマックス' }))
  root.append(h('div', { class: 'login-wrap' }, h('div', { class: 'login-bg', style: `background-image:url(${asset('brand/login-bg.webp')})` }), form, welcome))
  name.focus()
}

// ------------------------------------------------------------------ ログイン

function showLogin(msg = ''): void {
  root.replaceChildren()
  root.className = ''
  const field = (label: string, ic: string, input: HTMLInputElement, extra?: HTMLElement) => h('label', { class: 'lg-field' }, h('span', {}, label), h('div', { class: 'lg-input' }, icon(ic, 18), input, extra ?? null))
  const loginIn = h('input', { name: 'login', placeholder: 'ログイン名を入力', autocomplete: 'username', required: true }) as HTMLInputElement
  const passIn = h('input', { name: 'password', type: 'password', placeholder: 'パスワードを入力', autocomplete: 'current-password', required: true }) as HTMLInputElement
  const eye = h('button', { type: 'button', class: 'lg-eye', title: 'パスワードを表示', onclick: () => (passIn.type = passIn.type === 'password' ? 'text' : 'password') }, icon('eye', 16))
  const err = h('p', { class: 'err' }, msg)
  const form = h(
    'form',
    {
      class: 'login-card',
      onsubmit: async (e: Event) => {
        e.preventDefault()
        err.textContent = ''
        try {
          await Api.login(loginIn.value.trim(), passIn.value)
          startApp()
        } catch (x) {
          err.textContent = (x as Error).message
        }
      },
    },
    brandMark(true),
    h('h1', {}, 'おかえりなさい'),
    h('p', { class: 'lead' }, '日本とカンボジアを結ぶ AI オフィス'),
    h('div', { class: 'lg-flags' }, flag('jp', 26), h('span', {}, '⇄'), flag('kh', 26)),
    field('ログイン名', 'user', loginIn),
    field('パスワード', 'lock', passIn, eye),
    h('button', { class: 'btn primary lg-btn', type: 'submit' }, 'ログイン', h('span', { class: 'lg-arrow' }, '→')),
    err,
    h('small', { class: 'hint' }, '初期アカウントはサーバーを最初に起動したときに表示され、data/credentials.txt に保存されます'),
  )
  const welcome = h('div', { class: 'lg-welcome' }, h('div', { class: 'lg-bubble' }, 'ようこそ！'), h('img', { src: asset('brand/nexmax-face.webp'), alt: 'ネクマックス' }), h('span', { class: 'lg-ready' }, h('i', { class: 'live-dot-i' }), '接続準備完了'))
  root.append(h('div', { class: 'login-wrap' }, h('div', { class: 'login-bg' }), form, welcome))
  loginIn.focus()
}

// ------------------------------------------------------------------ 本体

function startApp(): void {
  root.replaceChildren()
  root.className = 'app'
  const state = new AppState()
  let world: OfficeWorldApi | null = null
  let ui: UiState = initialUi()
  let openSheet: SheetId | null = null
  let view: View = 'all'
  let pop: { kind: 'search' | 'bell' | 'timeline' | 'settings' | 'me'; anchor: HTMLElement } | null = null
  let pulse: { from: string; to: string; at: number } | null = null

  // ---- 骨組み
  const worldEl = h('div', { id: 'world' })
  const topEl = h('div', { class: 'top-layer' })
  const cardsEl = h('div', { class: 'hud-top' })
  const humanEl = h('div', { class: 'hud-left' })
  const feedEl = h('div', { class: 'hud-right' })
  const dockEl = h('div', { class: 'dock-layer' })
  const voiceEl = h('div', { class: 'voice-layer' })
  const sheetEl = h('div', { class: 'sheet-layer' })
  const profileEl = h('div', { class: 'profile-layer' })
  const popEl = h('div', { class: 'pop-layer' })
  const modal = h('div', { class: 'modal hidden' })
  const toasts = h('div', { class: 'toasts' })
  root.append(worldEl, cardsEl, humanEl, feedEl, dockEl, voiceEl, sheetEl, profileEl, topEl, popEl, modal, toasts)

  // ---- マイク：話したことは区切りごとにやることストックへ（ネクマックスがまとめて整理する）
  const captured: Captured[] = []
  const voice = new Voice(
    (text) => {
      captured.push({ text, at: Date.now() })
      if (captured.length > 20) captured.shift()
      Api.addStock(text).catch((e) => toast(e.message, 'warn'))
      render()
      // 「ストックしました」の表示を数秒で消すため
      setTimeout(render, 6500)
    },
    (_v, message) => {
      if (message) toast(message, 'warn')
      render()
    },
  )

  // ---- 拡大・縮小：3D の上でも、カードの上でも、ピンチ（Ctrl+ホイール・Safari のジェスチャー）は 3D の大きさを変える
  addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey) return
      e.preventDefault() // ページ全体の拡大を止める
      if ((e.target as Element | null)?.tagName === 'CANVAS') return // 3D の上は OrbitControls が受け持つ
      world?.zoomBy(Math.exp(Math.max(-60, Math.min(60, e.deltaY)) * 0.012))
    },
    { passive: false },
  )
  let gestureScale = 1
  const onGesture = (e: Event) => {
    e.preventDefault()
    const scale = (e as Event & { scale?: number }).scale ?? 1
    if (e.type === 'gesturestart') gestureScale = 1
    else if (e.type === 'gesturechange' && (e.target as Element | null)?.tagName !== 'CANVAS') {
      world?.zoomBy(gestureScale / scale)
      gestureScale = scale
    }
  }
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) addEventListener(t, onGesture, { passive: false } as AddEventListenerOptions)

  // ---- 3D の空間（作れなくても画面は動く）
  const worldModules = import.meta.glob<{ OfficeWorld: new (el: HTMLElement) => OfficeWorldApi }>('./world/OfficeWorld.ts')
  const loadWorld = worldModules['./world/OfficeWorld.ts']
  const fontsReady = Promise.race([
    Promise.all([document.fonts.load('700 32px "Noto Sans JP"', '大阪本社'), document.fonts.load('700 32px "Noto Sans Khmer"', 'ភ្នំពេញ')]).catch(() => {}),
    new Promise((r) => setTimeout(r, 2500)),
  ])
  // ?no3d：3D を作らない（古い端末・画面だけの確認用）
  const no3d = new URLSearchParams(location.search).has('no3d')
  void fontsReady
    .then(() => (no3d ? Promise.reject(new Error('?no3d')) : loadWorld ? loadWorld() : Promise.reject(new Error('OfficeWorld.ts がありません'))))
    .then(({ OfficeWorld }) => {
      world = new OfficeWorld(worldEl)
      // ?debug：テスト用に window.__world を出す（遅い GPU では __world.debugAdvance(秒) で動きを進める）
      if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __world: OfficeWorldApi }).__world = world
      world.onSelect = (id) => {
        if (id) act.openProfile(id)
      }
      if (state.snap) syncWorld()
      requestAnimationFrame(applyInsets)
    })
    .catch((e) => {
      if (no3d) return
      console.error('3D の空間を作れませんでした', e)
      worldEl.append(h('div', { class: 'world-fallback' }, '3D の空間を表示できませんでした（WebGL が使えない端末かもしれません）。下のドックから操作できます。'))
    })

  /** 3D に「カードで隠れていない帯」を伝える：上 = 上のカードの下端、下 = 下のカード・ドックの上端（実際の位置から測る） */
  let lastInsets = ''
  const applyInsets = () => {
    if (!world || typeof world.setInsets !== 'function') return
    const visible = (el: Element | null) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none' ? r : null
    }
    const tops = [...cardsEl.children].map(visible).filter((r): r is DOMRect => !!r)
    const dockR = visible(dockEl.firstElementChild)
    const corners = [humanEl.firstElementChild, feedEl.firstElementChild].map(visible).filter((r): r is DOMRect => !!r)
    // 上のカードは参考デザインと同じく空・背景の街に重なってよいので、いちばん短いカードの下端から写す
    const top = tops.length ? Math.min(...tops.map((r) => r.bottom)) + 8 : 72
    // 角のカードは参考デザインと同じく床の手前の角に重なってよい（ドックの上端までを写す）。スマホでは角のカードも避ける
    const cornerInset = innerWidth <= 860 && corners.length ? innerHeight - Math.min(...corners.map((r) => r.top)) : 0
    const bottom = Math.max(dockR ? innerHeight - dockR.top + 8 : 100, cornerInset)
    const key = `${Math.round(top / 8)}:${Math.round(bottom / 8)}:${innerWidth}:${innerHeight}`
    if (key === lastInsets) return
    lastInsets = key
    world.setInsets({ left: 0, right: 0, top, bottom })
  }
  addEventListener('resize', () => {
    applyInsets()
    render()
  })

  const taskLabelOf = (m: Member): { label: string; human: boolean; since?: string } | null => {
    const t = state.snap?.tasks.find((x) => x.assigneeId === m.id && (x.status === 'in_progress' || x.status === 'waiting_human'))
    if (!t) return null
    return { label: t.title, human: t.requiresHuman, since: t.requiresHuman ? t.startedAt : undefined }
  }

  const boardOf = (office: OfficeId): OfficeBoard => {
    const ids = new Set((state.snap?.members ?? []).filter((m) => m.office === office).map((m) => m.id))
    const projects = activeProjects(state)
    const tasks = projects.flatMap((p) => p.tasks).filter((t) => t.assigneeId && ids.has(t.assigneeId))
    const working = tasks.filter((t) => t.status === 'in_progress')
    const waiting = tasks.filter((t) => t.status === 'waiting_human')
    const done = tasks.filter((t) => t.status === 'done')
    const rows: OfficeBoard['rows'] = [
      ...waiting.map((t) => ({ label: `👤 ${state.member(t.assigneeId)?.name ?? ''}`, value: t.title, tone: 'human' as const })),
      ...working.map((t) => ({ label: `🤖 ${state.member(t.assigneeId)?.name ?? ''}`, value: t.title, tone: 'ai' as const })),
      ...done.slice(-2).map((t) => ({ label: `✓ ${state.member(t.assigneeId)?.name ?? ''}`, value: t.title, tone: 'done' as const })),
    ].slice(0, 5)
    return {
      headline: tasks.length ? `進行中 ${working.length}・人間待ち ${waiting.length}・完了 ${done.length}/${tasks.length}` : '待機中',
      progress: tasks.length ? done.length / tasks.length : 0,
      rows,
    }
  }

  const syncWorld = () => {
    if (!world || !state.snap) return
    world.syncMembers(state.snap.members)
    for (const m of state.snap.members) {
      const l = taskLabelOf(m)
      world.setTaskLabel(m.id, l ? `${l.human ? '👤' : '💻'} ${l.label}` : null, l ? { human: l.human, since: l.since } : undefined)
    }
    syncBoards()
    world.setSelected(ui.profileId)
  }
  const syncBoards = () => {
    if (!world || typeof world.setOfficeBoard !== 'function') return
    for (const o of OFFICES) world.setOfficeBoard(o.id, boardOf(o.id))
  }

  // ---- 操作
  const act: Actions = {
    set(patch) {
      ui = { ...ui, ...patch }
      if ('profileId' in patch) world?.setSelected(ui.profileId)
      render()
    },
    open(id, patch = {}) {
      openSheet = id
      pop = null
      ui = { ...ui, composeFocus: false, ...patch }
      render()
      if (patch.focusTaskId) setTimeout(() => document.getElementById(`task-${patch.focusTaskId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80)
    },
    close() {
      openSheet = null
      render()
    },
    async createGoal(title, description) {
      try {
        const r = (await Api.createGoal(title, description)) as { goal: Goal }
        ui = { ...ui, goalId: r.goal.id, projFilter: 'active', composeFocus: false }
        if (r.goal.status === 'awaiting_approval') toast(`${approverOf(state)?.name ?? '承認する人'}さんの承認待ちになりました。承認されると分解が始まります`, 'info')
        else toast('ネクマックスがゴールを受け取りました。分解を始めます', 'info')
        render()
        return true
      } catch (e) {
        toast((e as Error).message, 'warn')
        return false
      }
    },
    cancelGoal(g) {
      void ask({ title: g.status === 'awaiting_approval' ? 'ゴールを取り下げますか？' : 'ゴールを中止しますか？', body: `「${g.title}」`, ok: g.status === 'awaiting_approval' ? '取り下げる' : '中止する', danger: true }).then((r) => {
        if (r !== null) Api.cancelGoal(g.id).catch((e) => toast(e.message, 'warn'))
      })
    },
    retryTask(t) {
      Api.retryTask(t.id).catch((e) => toast(e.message, 'warn'))
    },
    complete(taskId) {
      const t = state.snap?.tasks.find((x) => x.id === taskId)
      if (t) openComplete(t)
    },
    reply(m, text) {
      Api.reply(m.id, text)
        .then(() => toast('返事を届けました。AI社員の記憶に入ります', 'success'))
        .catch((e) => toast(e.message, 'warn'))
    },
    talk(memberId, text) {
      const to = state.member(memberId)
      Api.talk(memberId, text)
        .then(() => {
          if (to && to.kind !== 'human' && !isApprover(state) && state.snap?.gate.approverId) toast(`${approverOf(state)?.name ?? '承認する人'}さんの承認待ちです。承認されると ${to.name} が答えます`, 'info')
        })
        .catch((e) => toast(e.message, 'warn'))
    },
    async openFile(goalId, path) {
      openSheet = 'docs'
      pop = null
      ui = { ...ui, doc: { goalId, path, content: null } }
      render()
      try {
        const f = await Api.file(goalId, path)
        if (ui.doc?.path === path && ui.doc.goalId === goalId) act.set({ doc: { goalId, path, content: f.content } })
      } catch (e) {
        toast((e as Error).message, 'warn')
      }
    },
    openProfile(id) {
      pop = null
      ui = { ...ui, profileId: id, profileMemory: null }
      world?.setSelected(id)
      render()
      void loadMemory(id)
    },
    focusMember(id) {
      world?.focus({ memberId: id })
      openSheet = null
      render()
    },
    register: () => openRegister(),
    changePassword: () => openPassword(),
    edit: (m) => openEdit(m),
    retire(m) {
      void ask({ title: `${m.name}（${m.role}）を退職させますか？`, body: '記憶は残ります。', ok: '退職させる', danger: true }).then((r) => {
        if (r === null) return
        Api.retire(m.id)
          .then(() => act.set({ profileId: null }))
          .catch((e) => toast(e.message, 'warn'))
      })
    },
    addMemory(m, text) {
      Api.addMemory(m.id, text)
        .then(() => loadMemory(m.id))
        .catch((e) => toast(e.message, 'warn'))
    },
    setEngine(mode) {
      const msg = mode === 'claude' ? 'Claude Code で本当に動かします（API の利用料がかかります）。切り替えますか？' : 'シミュレーション（Claude を呼ばないデモ）に切り替えますか？'
      void ask({ title: '頭脳を切り替えますか？', body: msg, ok: '切り替える' }).then((r) => {
        if (r !== null) Api.setEngine(mode).catch((e) => toast(e.message, 'warn'))
      })
    },
    stockAct(item, action, patch = {}) {
      Api.stockAct(item.id, action, patch)
        .then(() => {
          if (action === 'archive') toast('消しました', 'info', { label: '元に戻す', run: () => void Api.stockAct(item.id, 'restore') })
          if (action === 'send') toast(`ネクマックスに任せました：${item.title}`, 'success')
          if (action === 'done') toast(item.kind === 'memo' ? '記憶に残しました' : 'おつかれさまです！', 'success')
          if (action === 'later') toast('あとでに回しました', 'info', { label: '元に戻す', run: () => void Api.stockAct(item.id, 'restore') })
        })
        .catch((e) => toast(e.message, 'warn'))
    },
    addStock(text) {
      Api.addStock(text).catch((e) => toast(e.message, 'warn'))
    },
    approve(kind, id) {
      Api.approve(kind, id)
        .then(() => toast(kind === 'goal' ? '承認しました。ネクマックスが分解を始めます' : '承認しました。AI が答えます', 'success'))
        .catch((e) => toast(e.message, 'warn'))
    },
    decline(kind, id) {
      void ask({ title: kind === 'goal' ? 'このゴールを見送りますか？' : 'この話しかけを見送りますか？', body: '理由は出した人に伝わります（空でもかまいません）。', input: '見送る理由（例：来月にしましょう）', ok: '見送る' }).then((note) => {
        if (note === null) return
        Api.decline(kind, id, note.trim())
          .then(() => toast('見送りました', 'info'))
          .catch((e) => toast(e.message, 'warn'))
      })
    },
    setGate(patch) {
      const go = () => Api.setGate(patch).catch((e) => toast(e.message, 'warn'))
      if (patch.mode !== 'auto') return void go()
      void ask({
        title: '自動承認にしますか？',
        body: IS_ARTIFACT
          ? '決めた上限まで、承認を待たずにあなたの Claude が動きます。動くのは、あなたがこのページを開いていて、画面に見えている間だけです。'
          : '決めた上限まで、承認を待たずに Claude が動きます（使った分の費用がかかります）。',
        ok: '自動承認にする',
      }).then((r) => {
        if (r !== null) go()
      })
    },
    get voice() {
      return {
        listening: voice.state === 'listening',
        supported: !IS_ARTIFACT && voice.state !== 'unsupported',
        lang: voice.lang,
        langs: VOICE_LANGS,
        toggle: () => voice.toggle(),
        setLang: (l: string) => voice.setLang(l),
      }
    },
    async logout() {
      voice.stop()
      await Api.logout().catch(() => {})
      stop()
      world?.dispose()
      root.className = ''
      showLogin()
    },
  }

  const loadMemory = async (id: string) => {
    const r = await Api.memory(id).catch(() => null)
    if (ui.profileId !== id) return
    ui = { ...ui, profileMemory: r?.memory ?? [] }
    render()
  }

  // ---- 描画（requestAnimationFrame でまとめる）
  let queued = false
  const render = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      renderNow()
    })
  }

  /** 描き直しても、書きかけの文字・カーソル・フォーカスを残す（data-keep の付いた欄） */
  const keepInputs = (scope: HTMLElement) => {
    const saved = new Map<string, { value: string; start: number | null; end: number | null; focused: boolean }>()
    scope.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-keep]').forEach((el) => {
      saved.set(el.dataset.keep!, { value: el.value, start: el.selectionStart, end: el.selectionEnd, focused: document.activeElement === el })
    })
    return () => {
      scope.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-keep]').forEach((el) => {
        const s = saved.get(el.dataset.keep!)
        if (!s) return
        if (s.value && !el.value) el.value = s.value
        if (s.focused) {
          el.focus({ preventScroll: true })
          if (s.start !== null) el.setSelectionRange(s.start, s.end ?? s.start)
        }
      })
    }
  }

  // 描き直しのたびに出現アニメーションが繰り返されないよう、前回と同じものには no-anim を付ける
  let shown = { sheet: '', profile: '', pop: '', feedTop: '' }

  const renderNow = () => {
    if (!state.snap) return
    const restoreSheet = keepInputs(sheetEl)
    const restoreProfile = keepInputs(profileEl)
    topEl.replaceChildren(
      topbar(state, {
        view,
        onView: (v) => {
          view = v
          world?.focus(v)
          render()
        },
        onGoal: () => act.open('projects', { composeFocus: true, goalId: null }),
        onSearch: (a) => togglePop('search', a),
        onBell: (a) => togglePop('bell', a),
        onTimeline: (a) => togglePop('timeline', a),
        onSettings: (a) => togglePop('settings', a),
        onMe: (a) => togglePop('me', a),
      }),
    )
    cardsEl.replaceChildren(
      projectCard(state, (goalId) => act.open('projects', goalId ? { goalId } : {})),
      assistantCard(state, {
        onGoal: () => act.open('projects', { composeFocus: true, goalId: null }),
        onAsk: () => {
          act.talk('nexmax', 'いまの進み具合を、人間の対応待ちを中心に 3 行でまとめて')
          act.open('chat', { chatWith: 'nexmax' })
        },
        onReport: () => (IS_ARTIFACT ? act.open('stock') : voice.start()),
        onNexmax: () => act.openProfile('nexmax'),
      }),
      worldCard(state, pulse, (id) => {
        view = id as View
        world?.focus(id as OfficeId)
        render()
      }),
    )
    humanEl.replaceChildren(humanCard(state, (taskId) => act.open('tasks', { focusTaskId: taskId, taskFilter: 'all', taskOffice: 'all' }), (taskId) => act.complete(taskId), act))
    const feed = feedCard(state, () => act.open('chat', { chatWith: null }))
    const topMsg = state.snap.messages.at(-1)?.id ?? ''
    feed.querySelectorAll('.fr').forEach((el, i) => i === 0 && topMsg !== shown.feedTop ? null : el.classList.add('no-anim'))
    shown.feedTop = topMsg
    feedEl.replaceChildren(feed)
    const readyStock = (state.snap.stock ?? []).filter((s) => s.status === 'ready').length
    dockEl.replaceChildren(
      h(
        'div',
        { class: 'dock-row' },
        dock(state, openSheet, (id) => (openSheet === id ? act.close() : act.open(id))),
        micButton(voice.state === 'listening', readyStock, () => (IS_ARTIFACT ? act.open('stock') : voice.toggle()), () => (openSheet === 'stock' ? act.close() : act.open('stock')), IS_ARTIFACT ? 'text' : 'voice'),
      ),
    )
    const vp = openSheet === 'stock' ? null : voicePanel(state, { listening: voice.state === 'listening', interim: voice.interim, lang: voice.lang, captured }, VOICE_LANGS, { onStop: () => voice.stop(), onLang: (l) => voice.setLang(l), onOpen: () => act.open('stock') })
    voiceEl.replaceChildren(...(vp ? [vp] : []))
    const sheetScroll = sheetEl.querySelector('.sheet-body')?.scrollTop ?? 0
    const splitScroll = [...sheetEl.querySelectorAll<HTMLElement>('.split-l, .split-r, .kcol, .thread')].map((e) => e.scrollTop)
    const sh = openSheet ? sheet(openSheet, state, ui, act) : null
    if (sh && shown.sheet === openSheet) sh.classList.add('no-anim')
    shown.sheet = openSheet ?? ''
    sheetEl.replaceChildren(...(sh ? [sh] : []))
    const body = sheetEl.querySelector('.sheet-body')
    if (body) body.scrollTop = sheetScroll
    sheetEl.querySelectorAll<HTMLElement>('.split-l, .split-r, .kcol, .thread').forEach((e, i) => (e.scrollTop = splitScroll[i] ?? 0))
    restoreSheet()
    // 「ゴールを伝える」で開いたときの入力欄へのフォーカスは最初の 1 回だけ
    if (ui.composeFocus) ui = { ...ui, composeFocus: false }
    const thread = sheetEl.querySelector<HTMLElement>('.thread')
    if (thread && thread.dataset.stick !== '0') thread.scrollTop = thread.scrollHeight
    root.classList.toggle('sheet-open', !!openSheet)
    const pf = profilePanel(state, ui, act)
    if (pf && shown.profile === ui.profileId) pf.classList.add('no-anim')
    shown.profile = pf ? (ui.profileId ?? '') : ''
    profileEl.replaceChildren(...(pf ? [pf] : []))
    restoreProfile()
    root.classList.toggle('profile-open', !!pf)
    renderPop()
    // シートを開いている間はカードが隠れるので、撮り直さない
    if (!openSheet) applyInsets()
  }

  const togglePop = (kind: NonNullable<typeof pop>['kind'], anchor: HTMLElement) => {
    pop = pop?.kind === kind ? null : { kind, anchor }
    renderPop()
  }
  const renderPop = () => {
    if (!pop) {
      popEl.replaceChildren()
      shown.pop = ''
      return
    }
    const sameKind = shown.pop === pop.kind
    shown.pop = pop.kind
    const el = pop.kind === 'search' ? searchPop(state, act) : pop.kind === 'bell' ? notificationsPop(state, act) : pop.kind === 'timeline' ? timelinePop(state) : pop.kind === 'settings' ? settingsPop(state, act) : mePop(state, act)
    const r = pop.anchor.getBoundingClientRect()
    if (sameKind && popEl.firstElementChild) el.classList.add('no-anim')
    el.style.top = `${r.bottom + 10}px`
    el.style.right = `${Math.max(10, innerWidth - r.right - 10)}px`
    if (pop.kind === 'search' && popEl.firstElementChild?.classList.contains('wide') && popEl.querySelector('input')?.value) return
    popEl.replaceChildren(el)
  }
  document.addEventListener('click', (e) => {
    if (pop && !popEl.contains(e.target as Node)) {
      pop = null
      renderPop()
    }
  })
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (!modal.classList.contains('hidden')) closeModal()
    else if (pop) {
      pop = null
      renderPop()
    } else if (ui.profileId) act.set({ profileId: null })
    else if (openSheet) act.close()
  })

  // ---- モーダル
  const closeModal = () => {
    modal.classList.add('hidden')
    modal.replaceChildren()
  }
  const showModal = (...children: (Node | null)[]) => {
    modal.replaceChildren(h('div', { class: 'modal-card glass' }, h('button', { class: 'sheet-close', onclick: closeModal }, icon('close', 18)), ...children))
    modal.classList.remove('hidden')
  }
  modal.addEventListener('click', (e) => e.target === modal && closeModal())

  /** ページの中で確かめる（claude.ai のページでは confirm・prompt が出ないため）。やめたら null、入力欄があればその文 */
  const ask = (o: { title: string; body?: string; ok: string; danger?: boolean; input?: string }): Promise<string | null> =>
    new Promise((resolve) => {
      let settled = false
      const done = (v: string | null) => {
        if (settled) return
        settled = true
        observer.disconnect()
        closeModal()
        resolve(v)
      }
      const input = o.input ? (h('textarea', { id: 'ask-input', rows: 2, placeholder: o.input }) as HTMLTextAreaElement) : null
      showModal(
        h('h3', {}, o.title),
        o.body ? h('p', {}, o.body) : null,
        input,
        h('div', { class: 'ask-btns' }, h('button', { class: 'btn ghost', onclick: () => done(null) }, 'やめる'), h('button', { class: `btn ${o.danger ? 'danger' : 'primary'}`, onclick: () => done(input ? input.value : '') }, o.ok)),
      )
      // ×・背景・Esc で閉じたら「やめる」
      const observer = new MutationObserver(() => modal.classList.contains('hidden') && done(null))
      observer.observe(modal, { attributes: true, attributeFilter: ['class'] })
      ;(input ?? modal.querySelector<HTMLButtonElement>('.ask-btns .btn:last-child'))?.focus()
    })

  const openComplete = (t: Task) => {
    const g = state.snap?.goals.find((x) => x.id === t.goalId)
    const note = h('textarea', { rows: 5, placeholder: '対応した内容・結果・次の人へのメモ（AI社員が続きの作業に使います）' }) as HTMLTextAreaElement
    showModal(
      h('div', { class: 'mc-kind' }, icon('hand', 16), '人間へのお願い'),
      h('h3', {}, t.title),
      g ? h('div', { class: 'mc-goal' }, icon('folder', 14), g.title) : null,
      h('p', {}, t.description),
      t.humanReason ? h('div', { class: 'reason' }, `人間の仕事にした理由：${t.humanReason}`) : null,
      t.assignReason ? h('div', { class: 'reason soft' }, `あなたにお願いした理由：${t.assignReason}`) : null,
      note,
      h(
        'button',
        {
          class: 'btn primary',
          onclick: async () => {
            try {
              await Api.completeTask(t.id, note.value.trim())
              closeModal()
              toast('ありがとうございます！続きは AI社員が進めます', 'success')
            } catch (e) {
              toast((e as Error).message, 'warn')
            }
          },
        },
        '完了にする',
      ),
    )
    note.focus()
  }

  const officeSelect = (value: OfficeId) => h('select', {}, ...OFFICES.map((o) => h('option', { value: o.id, selected: o.id === value }, `${o.country === 'jp' ? '🇯🇵' : '🇰🇭'} ${o.name}`))) as HTMLSelectElement

  const openRegister = () => {
    const f = {
      name: h('input', { placeholder: '名前（例：山田 花子）', required: true }) as HTMLInputElement,
      office: officeSelect('osaka'),
      role: h('input', { placeholder: '役割（例：営業・現地マネージャー）' }) as HTMLInputElement,
      skills: h('input', { placeholder: 'スキル（読点区切り：営業、顧客対応、クメール語）' }) as HTMLInputElement,
      languages: h('input', { placeholder: '言語（ja, km, en）' }) as HTMLInputElement,
      persona: h('textarea', { rows: 2, placeholder: '自己紹介・得意なこと（タスクの割り振りに使います）' }) as HTMLTextAreaElement,
      login: h('input', { placeholder: 'ログイン名（空ならログインなしの登録だけ）' }) as HTMLInputElement,
      password: h('input', { type: 'password', placeholder: 'パスワード（10 文字以上・推測されにくいもの）', autocomplete: 'new-password' }) as HTMLInputElement,
    }
    showModal(
      h('h3', {}, '人間を登録する'),
      h('p', { class: 'hint' }, '登録した人には「人間にしかできない仕事」（対面・現地・署名・承認など）が、拠点・スキル・これまでの仕事をもとに割り振られます。'),
      ...Object.values(f),
      h(
        'button',
        {
          class: 'btn primary',
          onclick: async () => {
            try {
              await Api.registerHuman({ ...Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value])) })
              closeModal()
              toast(`${f.name.value} さんを登録しました`, 'success')
            } catch (e) {
              toast((e as Error).message, 'warn')
            }
          },
        },
        '登録する',
      ),
    )
  }

  const openPassword = () => {
    pop = null
    renderPop()
    const cur = h('input', { type: 'password', placeholder: '今のパスワード', autocomplete: 'current-password' }) as HTMLInputElement
    const next = h('input', { type: 'password', placeholder: '新しいパスワード（10 文字以上）', autocomplete: 'new-password' }) as HTMLInputElement
    const again = h('input', { type: 'password', placeholder: '新しいパスワード（もう一度）', autocomplete: 'new-password' }) as HTMLInputElement
    showModal(
      h('h3', {}, 'パスワードを変更'),
      h('p', { class: 'hint' }, '変更すると、ほかの端末でのログインは切れます。初期パスワードのままの人は、必ず変更してください。'),
      h('label', {}, '今のパスワード', cur),
      h('label', {}, '新しいパスワード', next),
      h('label', {}, 'もう一度', again),
      h(
        'button',
        {
          class: 'btn primary',
          onclick: async () => {
            if (next.value !== again.value) return toast('新しいパスワードが一致しません', 'warn')
            try {
              await Api.changePassword(cur.value, next.value)
              closeModal()
              toast('パスワードを変更しました', 'success')
            } catch (e) {
              toast((e as Error).message, 'warn')
            }
          },
        },
        '変更する',
      ),
    )
    cur.focus()
  }

  const openEdit = (m: Member) => {
    const me = state.me
    const f = {
      name: h('input', { value: m.name }) as HTMLInputElement,
      role: h('input', { value: m.role }) as HTMLInputElement,
      skills: h('input', { value: m.skills.join('、') }) as HTMLInputElement,
      languages: h('input', { value: m.languages.join(', ') }) as HTMLInputElement,
      persona: h('textarea', { rows: 3 }, m.persona ?? '') as HTMLTextAreaElement,
    }
    const office = me?.isAdmin ? officeSelect(m.office) : null
    showModal(
      h('h3', {}, `${m.name} のプロフィール`),
      h('label', {}, '名前', f.name),
      h('label', {}, '役割', f.role),
      h('label', {}, 'スキル', f.skills),
      h('label', {}, '言語', f.languages),
      h('label', {}, '自己紹介・人物設定', f.persona),
      office ? h('label', {}, '拠点', office) : null,
      h(
        'button',
        {
          class: 'btn primary',
          onclick: async () => {
            try {
              await Api.updateMember(m.id, { ...Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value])), ...(office ? { office: office.value } : {}) })
              closeModal()
              toast('更新しました', 'success')
              void loadMemory(m.id)
            } catch (e) {
              toast((e as Error).message, 'warn')
            }
          },
        },
        '保存する',
      ),
    )
  }

  const toast = (text: string, level: 'info' | 'success' | 'warn' | 'hire' = 'info', action?: { label: string; run: () => void }) => {
    const el = h('div', { class: `toast glass tl-${level} ${action ? 'has-action' : ''}` }, text)
    if (action) {
      el.append(
        h('button', {
          class: 'toast-act',
          onclick: () => {
            action.run()
            el.remove()
          },
        }, action.label),
      )
    }
    toasts.append(el)
    setTimeout(() => el.classList.add('out'), action ? 6500 : 4200)
    setTimeout(() => el.remove(), action ? 7100 : 4800)
  }

  setNotifier((text) => toast(text, 'info'))

  // ---- 状態の変化 → 画面と 3D
  state.on((c) => {
    const me = state.me
    switch (c.kind) {
      case 'all':
        syncWorld()
        break
      case 'member':
      case 'removed':
        if (world && state.snap) world.syncMembers(state.snap.members)
        if (c.kind === 'removed' && c.id === ui.profileId) ui = { ...ui, profileId: null }
        break
      case 'hired':
        world?.hire(c.member)
        toast(`🎉 ${c.member.name}（${c.member.role}）を${officeInfo(c.member.office).name}に採用しました`, 'hire')
        break
      case 'task': {
        const t = c.task
        const prev = c.prev?.status
        if (world && t.assigneeId) {
          const m = state.member(t.assigneeId)
          const l = m ? taskLabelOf(m) : null
          world.setTaskLabel(t.assigneeId, l ? `${l.human ? '👤' : '💻'} ${l.label}` : null, l ? { human: l.human, since: l.since } : undefined)
          if (t.status === 'done' && prev !== 'done') world.celebrate(t.assigneeId)
        }
        syncBoards()
        if (t.status === 'waiting_human' && prev !== 'waiting_human' && t.assigneeId === me?.id) toast(`👤 あなたにお願い：「${t.title}」`, 'hire')
        break
      }
      case 'goal':
        if (c.goal.status === 'done') toast(`🎊 「${c.goal.title}」完了！`, 'success')
        syncBoards()
        break
      case 'message': {
        const m: Message = c.message
        if (c.updated) break
        world?.message(m.fromId, m.toId, m.kind, m.text)
        const a = state.member(m.fromId)
        const b = state.member(m.toId)
        if (a && b && a.office !== b.office) pulse = { from: a.office, to: b.office, at: Date.now() }
        if (m.toId === me?.id && m.kind === 'question') toast(`❓ ${a?.name ?? ''}から質問が届きました`, 'hire')
        if (m.toId === me?.id && m.text.startsWith('承認をお願いします')) toast(`🔒 ${a?.name ?? ''}さんから${m.text}`, 'hire')
        if (m.toId === me?.id && m.kind === 'answer' && openSheet !== 'chat') toast(`💬 ${a?.name ?? ''}：${m.text.slice(0, 60)}`, 'info')
        break
      }
      case 'memory':
        if (c.memberId === ui.profileId) void loadMemory(c.memberId)
        return
      case 'stream':
        if (openSheet !== 'tasks' && openSheet !== 'projects') return
        break
    }
    render()
  })

  // 時計と「◯分待ち」を 30 秒ごとに
  setInterval(() => {
    document.querySelectorAll<HTMLElement>('[data-tz]').forEach((el) => (el.textContent = clock(el.dataset.tz!)))
    render()
  }, 30_000)

  const stop = connect(
    (ev) => state.apply(ev),
    (s) => {
      root.classList.toggle('offline', s === 'closed')
      if (s === 'unauthorized') {
        stop()
        world?.dispose()
        showLogin('もう一度ログインしてください')
      }
    },
  )
}

void boot()
