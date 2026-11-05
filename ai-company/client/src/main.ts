// 画面の入口：ログイン → 3D のバーチャルオフィス（東京・大阪・プノンペン）＋ ガラスの HUD
// 参考デザイン（docs/img/design_reference.jpg）：上にロゴ・表示の切り替え・道具、上の中央にプロジェクト進捗・AIアシスタント・世界のチーム、
// 左下に人間の対応待ち、右下にやり取り、下の中央にドック（プロジェクト・タスク・チャット・資料・人材・レポート）
import './styles.css'
import type { Goal, Member, Message, OfficeId, Task } from '../../shared/types'
import { OFFICES, officeInfo } from '../../shared/types'
import { Api, connect } from './api'
import { AppState } from './state'
import { clock, h } from './ui/dom'
import { activeProjects } from './ui/derive'
import { assistantCard, dock, feedCard, humanCard, projectCard, topbar, worldCard, type SheetId, type View } from './ui/hud'
import { icon } from './ui/icons'
import { initialUi, mePop, notificationsPop, profilePanel, searchPop, settingsPop, sheet, timelinePop, type Actions, type UiState } from './ui/sheets'
import type { OfficeBoard, OfficeWorldApi } from './world/api'

const root = document.getElementById('app')!

async function boot(): Promise<void> {
  const { me } = await Api.me().catch(() => ({ me: null }))
  if (me) startApp()
  else showLogin()
}

// ------------------------------------------------------------------ ログイン

function showLogin(msg = ''): void {
  root.replaceChildren()
  const loginIn = h('input', { name: 'login', placeholder: 'ログイン名', autocomplete: 'username', required: true }) as HTMLInputElement
  const passIn = h('input', { name: 'password', type: 'password', placeholder: 'パスワード', autocomplete: 'current-password', required: true }) as HTMLInputElement
  const err = h('p', { class: 'err' }, msg)
  const form = h(
    'form',
    {
      class: 'login-card glass',
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
    h('div', { class: 'brand big' }, h('img', { src: '/brand/nextmake-logo.png', alt: 'NEXTMAKE', class: 'brand-logo' }), h('span', { class: 'brand-ai' }, 'AI')),
    h('p', { class: 'lead' }, '日本とカンボジアを結ぶ AI オフィス。ゴールを伝えると、ネクマックスが仕事を分け、AI社員を採用し、人間にしかできない仕事は人間へ。'),
    loginIn,
    passIn,
    h('button', { class: 'btn primary', type: 'submit' }, 'ログイン'),
    err,
    h('small', { class: 'hint' }, '初期アカウントはサーバーを最初に起動したときに表示され、data/credentials.txt に保存されます'),
  )
  root.append(h('div', { class: 'login-wrap' }, h('div', { class: 'login-bg' }), form))
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
  const sheetEl = h('div', { class: 'sheet-layer' })
  const profileEl = h('div', { class: 'profile-layer' })
  const popEl = h('div', { class: 'pop-layer' })
  const modal = h('div', { class: 'modal hidden' })
  const toasts = h('div', { class: 'toasts' })
  root.append(worldEl, cardsEl, humanEl, feedEl, dockEl, sheetEl, profileEl, topEl, popEl, modal, toasts)

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

  const applyInsets = () => {
    if (!world || typeof world.setInsets !== 'function') return
    const mobile = innerWidth <= 860
    world.setInsets({ left: 0, right: 0, top: mobile ? 64 : 84, bottom: mobile ? 92 : 126 })
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
        toast('ネクマックスがゴールを受け取りました。分解を始めます', 'info')
        render()
        return true
      } catch (e) {
        toast((e as Error).message, 'warn')
        return false
      }
    },
    cancelGoal(g) {
      if (confirm(`「${g.title}」を中止しますか？`)) Api.cancelGoal(g.id).catch((e) => toast(e.message, 'warn'))
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
      Api.talk(memberId, text).catch((e) => toast(e.message, 'warn'))
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
    edit: (m) => openEdit(m),
    retire(m) {
      if (confirm(`${m.name}（${m.role}）を退職させますか？記憶は残ります。`)) {
        Api.retire(m.id)
          .then(() => act.set({ profileId: null }))
          .catch((e) => toast(e.message, 'warn'))
      }
    },
    addMemory(m, text) {
      Api.addMemory(m.id, text)
        .then(() => loadMemory(m.id))
        .catch((e) => toast(e.message, 'warn'))
    },
    setEngine(mode) {
      const msg = mode === 'claude' ? 'Claude Code で本当に動かします（API の利用料がかかります）。切り替えますか？' : 'シミュレーション（Claude を呼ばないデモ）に切り替えますか？'
      if (confirm(msg)) Api.setEngine(mode).catch((e) => toast(e.message, 'warn'))
    },
    async logout() {
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
        onReport: () => act.open('reports'),
        onNexmax: () => act.openProfile('nexmax'),
      }),
      worldCard(state, pulse, (id) => {
        view = id as View
        world?.focus(id as OfficeId)
        render()
      }),
    )
    humanEl.replaceChildren(humanCard(state, (taskId) => act.open('tasks', { focusTaskId: taskId, taskFilter: 'all', taskOffice: 'all' }), (taskId) => act.complete(taskId)))
    feedEl.replaceChildren(feedCard(state, () => act.open('chat', { chatWith: null })))
    dockEl.replaceChildren(dock(state, openSheet, (id) => (openSheet === id ? act.close() : act.open(id))))
    const sheetScroll = sheetEl.querySelector('.sheet-body')?.scrollTop ?? 0
    const splitScroll = [...sheetEl.querySelectorAll<HTMLElement>('.split-l, .split-r, .kcol, .thread')].map((e) => e.scrollTop)
    sheetEl.replaceChildren(...(openSheet ? [sheet(openSheet, state, ui, act)] : []))
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
    profileEl.replaceChildren(...(pf ? [pf] : []))
    restoreProfile()
    root.classList.toggle('profile-open', !!pf)
    renderPop()
  }

  const togglePop = (kind: NonNullable<typeof pop>['kind'], anchor: HTMLElement) => {
    pop = pop?.kind === kind ? null : { kind, anchor }
    renderPop()
  }
  const renderPop = () => {
    if (!pop) {
      popEl.replaceChildren()
      return
    }
    const el = pop.kind === 'search' ? searchPop(state, act) : pop.kind === 'bell' ? notificationsPop(state, act) : pop.kind === 'timeline' ? timelinePop(state) : pop.kind === 'settings' ? settingsPop(state, act) : mePop(state, act)
    const r = pop.anchor.getBoundingClientRect()
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
      password: h('input', { type: 'password', placeholder: 'パスワード（6 文字以上）' }) as HTMLInputElement,
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

  const toast = (text: string, level: 'info' | 'success' | 'warn' | 'hire' = 'info') => {
    const el = h('div', { class: `toast glass tl-${level}` }, text)
    toasts.append(el)
    setTimeout(() => el.classList.add('out'), 4200)
    setTimeout(() => el.remove(), 4800)
  }

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
        world?.message(m.fromId, m.toId, m.kind, m.text)
        const a = state.member(m.fromId)
        const b = state.member(m.toId)
        if (a && b && a.office !== b.office) pulse = { from: a.office, to: b.office, at: Date.now() }
        if (m.toId === me?.id && m.kind === 'question') toast(`❓ ${a?.name ?? ''}から質問が届きました`, 'hire')
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
