// 画面の入口：ログイン → 3D のバーチャルオフィス（日本・カンボジア）＋ 操作パネル
import './styles.css'
import type { Goal, Member, MemoryEntry, Task } from '../../shared/types'
import { OFFICES } from '../../shared/types'
import { Api, connect } from './api'
import { AppState } from './state'
import { clock, h, md } from './ui/dom'
import { avatar, goalDetail, goalList, logView, memberCard, memberList, messageRow, myTasks } from './ui/view'
import type { OfficeWorldApi } from './world/api'

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
    h('div', { class: 'logo' }, h('span', { class: 'logo-mark' }, 'NM'), h('div', {}, h('b', {}, 'NEXTMAKE AI COMPANY'), h('small', {}, 'バーチャルオフィス 大阪 × プノンペン'))),
    h('p', { class: 'lead' }, 'ゴールを伝えると、ネクマックスが仕事を分解。必要な AI社員を採用し、人間にしかできない仕事は人間へ。'),
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
  const state = new AppState()
  let world: OfficeWorldApi | null = null
  let selectedGoal: string | null = null
  let selectedMember: string | null = null
  let memberMemory: MemoryEntry[] | null = null
  let rightTab: 'mine' | 'members' | 'log' = 'mine'
  let mobilePanel: 'world' | 'goals' | 'right' = 'world'

  // ---- 骨組み
  const worldEl = h('div', { id: 'world' })
  const top = h('header', { class: 'topbar' })
  const left = h('aside', { class: 'panel left' })
  const right = h('aside', { class: 'panel right' })
  const ticker = h('ul', { class: 'ticker' })
  const toasts = h('div', { class: 'toasts' })
  const modal = h('div', { class: 'modal hidden' })
  const mobileNav = h('nav', { class: 'mobile-nav' })
  root.append(worldEl, top, left, right, ticker, toasts, modal, mobileNav)

  // ---- 3D の空間（作れなくても画面は動く）
  // import.meta.glob：ファイルが無い（作りかけ）ときも画面は動く
  const worldModules = import.meta.glob<{ OfficeWorld: new (el: HTMLElement) => OfficeWorldApi }>('./world/OfficeWorld.ts')
  const loadWorld = worldModules['./world/OfficeWorld.ts']
  void (loadWorld ? loadWorld() : Promise.reject(new Error('OfficeWorld.ts がありません')))
    .then(({ OfficeWorld }) => {
      world = new OfficeWorld(worldEl)
      world.onSelect = (id) => {
        if (id) openMember(id)
      }
      if (state.snap) syncWorld()
    })
    .catch((e) => {
      console.error('3D の空間を作れませんでした', e)
      worldEl.append(h('div', { class: 'world-fallback' }, '3D の空間を表示できませんでした（WebGL が使えない端末かもしれません）。パネルは使えます。'))
    })

  const syncWorld = () => {
    if (!world || !state.snap) return
    world.syncMembers(state.snap.members)
    for (const m of state.snap.members) {
      const t = state.snap.tasks.find((x) => x.assigneeId === m.id && (x.status === 'in_progress' || x.status === 'waiting_human'))
      world.setTaskLabel(m.id, t ? `${t.requiresHuman ? '👤' : '💻'} ${t.title}` : null)
    }
    world.setSelected(selectedMember)
  }

  // ---- 上のバー
  const renderTop = () => {
    const me = state.me
    const s = state.snap
    const online = (s?.members ?? []).filter((m) => m.kind === 'human' && m.online)
    const eng = s?.engine
    const parts: (HTMLElement | null)[] = [
      h('div', { class: 'logo small' }, h('span', { class: 'logo-mark' }, 'NM'), h('div', {}, h('b', {}, 'NEXTMAKE AI COMPANY'), h('small', {}, 'Virtual Office'))),
      h('div', { class: 'clocks' }, ...OFFICES.map((o) => h('button', { class: 'clock', onclick: () => world?.focus(o.id), title: `${o.name}を見る` }, h('span', {}, o.id === 'jp' ? '🇯🇵 大阪' : '🇰🇭 プノンペン'), h('b', { 'data-tz': o.tz }, clock(o.tz))))),
      h('div', { class: 'views' }, h('button', { onclick: () => world?.focus('all') }, '全体'), h('button', { onclick: () => world?.focus('jp') }, '日本'), h('button', { onclick: () => world?.focus('kh') }, 'カンボジア')),
      h('div', { class: 'spacer' }),
      eng
        ? h(
            'button',
            {
              class: `engine eng-${eng.mode}`,
              title: me?.isAdmin ? 'クリックで切り替え（管理者）' : eng.detail,
              onclick: async () => {
                if (!me?.isAdmin) return
                const next = eng.mode === 'claude' ? 'sim' : 'claude'
                const msg = next === 'claude' ? 'Claude Code で本当に動かします（API の利用料がかかります）。切り替えますか？' : 'シミュレーション（Claude を呼ばないデモ）に切り替えますか？'
                if (confirm(msg)) await Api.setEngine(next).catch((e) => toast(e.message, 'warn'))
              },
            },
            eng.mode === 'claude' ? '🧠 Claude Code' : '🎮 シミュレーション',
          )
        : null,
      h('div', { class: 'online', title: 'ログイン中の人' }, ...online.slice(0, 6).map((m) => avatar(m, 26)), h('span', {}, `${online.length}人`)),
      me ? h('div', { class: 'me' }, avatar(me, 26), h('span', {}, me.name), h('button', { class: 'link', onclick: logout }, 'ログアウト')) : null,
    ]
    top.replaceChildren(...parts.filter((x): x is HTMLElement => !!x))
  }
  setInterval(() => top.querySelectorAll<HTMLElement>('[data-tz]').forEach((el) => (el.textContent = clock(el.dataset.tz!))), 15_000)

  // ---- 左：ゴール
  const goalTitle = h('input', { placeholder: '例：プノンペンで日本企業向けのIT人材説明会を開く', maxlength: 200 }) as HTMLInputElement
  const goalDesc = h('textarea', { rows: 3, placeholder: '詳しく（目的・期限・予算・相手など。なくても OK）' }) as HTMLTextAreaElement
  const goalForm = h(
    'form',
    {
      class: 'goal-form',
      onsubmit: async (e: Event) => {
        e.preventDefault()
        if (!goalTitle.value.trim()) return goalTitle.focus()
        try {
          const r = (await Api.createGoal(goalTitle.value.trim(), goalDesc.value.trim())) as { goal: Goal }
          selectedGoal = r.goal.id
          goalTitle.value = ''
          goalDesc.value = ''
          renderLeft()
        } catch (x) {
          toast((x as Error).message, 'warn')
        }
      },
    },
    h('h2', {}, '🎯 ゴールを伝える'),
    goalTitle,
    goalDesc,
    h('button', { class: 'btn primary', type: 'submit' }, 'ネクマックスにお願いする'),
  )
  const goalsBox = h('div', { class: 'goals-box' })
  left.append(goalForm, goalsBox)

  const goalHandlers = {
    onCancel: async (g: Goal) => {
      if (confirm(`「${g.title}」を中止しますか？`)) await Api.cancelGoal(g.id).catch((e) => toast(e.message, 'warn'))
    },
    onRetry: (t: Task) => Api.retryTask(t.id).catch((e) => toast(e.message, 'warn')),
    onMember: (id: string) => openMember(id),
    onFile: (g: Goal, path: string) => openFile(g, path),
    onComplete: (t: Task) => openComplete(t),
  }

  const renderLeft = () => {
    const goal = state.snap?.goals.find((g) => g.id === selectedGoal)
    goalsBox.replaceChildren(
      goal
        ? h('div', {}, h('button', { class: 'link back', onclick: () => ((selectedGoal = null), renderLeft()) }, '← ゴール一覧'), goalDetail(state, goal, goalHandlers))
        : h('div', {}, h('h2', {}, '📋 ゴール'), goalList(state, selectedGoal, (id) => ((selectedGoal = id), renderLeft()))),
    )
  }

  // ---- 右：マイタスク・社員・ログ
  const renderRight = () => {
    const me = state.me
    const waitingMine = (state.snap?.tasks ?? []).filter((t) => t.assigneeId === me?.id && t.status === 'waiting_human').length
    const tabs = h(
      'div',
      { class: 'tabs' },
      h('button', { class: rightTab === 'mine' ? 'on' : '', onclick: () => ((rightTab = 'mine'), renderRight()) }, 'マイタスク', waitingMine ? h('i', { class: 'count' }, String(waitingMine)) : null),
      h('button', { class: rightTab === 'members' ? 'on' : '', onclick: () => ((rightTab = 'members'), renderRight()) }, '社員'),
      h('button', { class: rightTab === 'log' ? 'on' : '', onclick: () => ((rightTab = 'log'), renderRight()) }, 'ログ'),
    )
    let body: HTMLElement
    const m = state.member(selectedMember)
    if (rightTab === 'members' && m) {
      body = memberCard(state, m, memberMemory, {
        onClose: () => {
          selectedMember = null
          world?.setSelected(null)
          renderRight()
        },
        onNote: async (mm, text) => {
          await Api.addMemory(mm.id, text).catch((e) => toast(e.message, 'warn'))
          void loadMemory(mm.id)
        },
        onRetire: async (mm) => {
          if (confirm(`${mm.name}（${mm.role}）を退職させますか？記憶は残ります。`)) {
            await Api.retire(mm.id).catch((e) => toast(e.message, 'warn'))
            selectedMember = null
            renderRight()
          }
        },
        onFocus: (mm) => {
          world?.focus({ memberId: mm.id })
          mobilePanel = 'world'
          renderMobileNav()
        },
      })
    } else if (rightTab === 'members') {
      body = h(
        'div',
        {},
        memberList(state, openMember, selectedMember),
        me?.isAdmin ? h('button', { class: 'btn', onclick: openRegister }, '＋ 人間を登録する') : null,
        h('p', { class: 'hint' }, 'AI社員は、ゴールに必要な職種が足りないときにネクマックスが採用します。'),
      )
    } else if (rightTab === 'log') {
      body = logView(state)
    } else {
      body = myTasks(state, openComplete, (id) => {
        selectedGoal = id
        renderLeft()
        mobilePanel = 'goals'
        renderMobileNav()
      })
    }
    right.replaceChildren(tabs, h('div', { class: 'tab-body' }, body))
  }

  const openMember = (id: string) => {
    selectedMember = id
    rightTab = 'members'
    memberMemory = null
    world?.setSelected(id)
    renderRight()
    mobilePanel = 'right'
    renderMobileNav()
    void loadMemory(id)
  }

  const loadMemory = async (id: string) => {
    const r = await Api.memory(id).catch(() => null)
    if (selectedMember !== id) return
    memberMemory = r?.memory ?? []
    renderRight()
  }

  // ---- 下：やり取りのテロップ
  const pushTicker = (msgEl: HTMLElement) => {
    ticker.prepend(msgEl)
    while (ticker.children.length > 4) ticker.lastElementChild?.remove()
  }

  // ---- スマホの切り替え
  const renderMobileNav = () => {
    root.dataset.mobile = mobilePanel
    mobileNav.replaceChildren(
      ...(['world', 'goals', 'right'] as const).map((p) =>
        h('button', { class: mobilePanel === p ? 'on' : '', onclick: () => ((mobilePanel = p), renderMobileNav()) }, p === 'world' ? '🏢 オフィス' : p === 'goals' ? '🎯 ゴール' : '👥 仕事・社員'),
      ),
    )
  }

  // ---- モーダル
  const closeModal = () => {
    modal.classList.add('hidden')
    modal.replaceChildren()
  }
  const showModal = (...children: (Node | null)[]) => {
    modal.replaceChildren(h('div', { class: 'modal-card' }, h('button', { class: 'close', onclick: closeModal }, '×'), ...children))
    modal.classList.remove('hidden')
  }
  modal.addEventListener('click', (e) => e.target === modal && closeModal())

  const openComplete = (t: Task) => {
    const note = h('textarea', { rows: 5, placeholder: '対応した内容・結果・次の人へのメモ（AI社員が続きの作業に使います）' }) as HTMLTextAreaElement
    showModal(
      h('h3', {}, `✅ ${t.title}`),
      h('p', {}, t.description),
      t.humanReason ? h('div', { class: 'reason' }, `人間にお願いした理由：${t.humanReason}`) : null,
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

  const openFile = async (g: Goal, path: string) => {
    try {
      const f = await Api.file(g.id, path)
      showModal(h('h3', {}, `📄 ${path}`), /\.(md|markdown|txt)$/i.test(path) ? h('div', { class: 'md file-view', html: md(f.content) }) : h('pre', { class: 'file-view' }, f.content))
    } catch (e) {
      toast((e as Error).message, 'warn')
    }
  }

  const openRegister = () => {
    const f = {
      name: h('input', { placeholder: '名前（例：山田 花子）', required: true }) as HTMLInputElement,
      office: h('select', {}, h('option', { value: 'jp' }, '🇯🇵 大阪本社'), h('option', { value: 'kh' }, '🇰🇭 プノンペン')) as HTMLSelectElement,
      role: h('input', { placeholder: '役割（例：営業・現地マネージャー）' }) as HTMLInputElement,
      skills: h('input', { placeholder: 'スキル（読点区切り：営業、顧客対応、クメール語）' }) as HTMLInputElement,
      languages: h('input', { placeholder: '言語（ja, km, en）' }) as HTMLInputElement,
      persona: h('textarea', { rows: 2, placeholder: '自己紹介・得意なこと（タスクの割り振りに使います）' }) as HTMLTextAreaElement,
      login: h('input', { placeholder: 'ログイン名（空ならログインなしの登録だけ）' }) as HTMLInputElement,
      password: h('input', { type: 'password', placeholder: 'パスワード（6 文字以上）' }) as HTMLInputElement,
    }
    showModal(
      h('h3', {}, '👤 人間を登録する'),
      h('p', { class: 'hint' }, '登録した人には「人間にしかできない仕事」（対面・現地・署名・承認など）が割り振られます。仕事のたびに、その人のコンテキストがたまっていきます。'),
      ...Object.values(f),
      h(
        'button',
        {
          class: 'btn primary',
          onclick: async () => {
            try {
              await Api.registerHuman({
                name: f.name.value,
                office: f.office.value,
                role: f.role.value,
                skills: f.skills.value,
                languages: f.languages.value,
                persona: f.persona.value,
                login: f.login.value,
                password: f.password.value,
              })
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

  const toast = (text: string, level: 'info' | 'success' | 'warn' | 'hire' = 'info') => {
    const el = h('div', { class: `toast tl-${level}` }, text)
    toasts.append(el)
    setTimeout(() => el.classList.add('out'), 4200)
    setTimeout(() => el.remove(), 4800)
  }

  const logout = async () => {
    await Api.logout().catch(() => {})
    stop()
    world?.dispose()
    showLogin()
  }

  // ---- 状態の変化 → 画面と 3D
  let renderQueued = false
  const renderAll = () => {
    if (renderQueued) return
    renderQueued = true
    requestAnimationFrame(() => {
      renderQueued = false
      renderTop()
      renderLeft()
      renderRight()
    })
  }

  state.on((c) => {
    const me = state.me
    switch (c.kind) {
      case 'all':
        syncWorld()
        renderAll()
        renderMobileNav()
        break
      case 'member':
      case 'removed':
        if (world && state.snap) world.syncMembers(state.snap.members)
        if (c.kind === 'removed' && c.id === selectedMember) selectedMember = null
        renderAll()
        break
      case 'hired':
        world?.hire(c.member)
        toast(`🎉 ${c.member.name}（${c.member.role}）を採用しました`, 'hire')
        renderAll()
        break
      case 'task': {
        const t = c.task
        const prev = c.prev?.status
        if (world && t.assigneeId) {
          if (t.status === 'in_progress' || t.status === 'waiting_human') world.setTaskLabel(t.assigneeId, `${t.requiresHuman ? '👤' : '💻'} ${t.title}`)
          else world.setTaskLabel(t.assigneeId, null)
          if (t.status === 'done' && prev !== 'done') world.celebrate(t.assigneeId)
        }
        if (t.status === 'waiting_human' && prev !== 'waiting_human' && t.assigneeId === me?.id) toast(`👤 あなたにお願い：「${t.title}」`, 'hire')
        renderAll()
        break
      }
      case 'goal':
        if (c.goal.status === 'done') toast(`🎊 「${c.goal.title}」完了！`, 'success')
        renderAll()
        break
      case 'message':
        world?.message(c.message.fromId, c.message.toId, c.message.kind, c.message.text)
        pushTicker(messageRow(state, c.message))
        if (rightTab === 'log' || (rightTab === 'members' && selectedMember)) renderAll()
        break
      case 'activity':
        if (rightTab === 'log') renderAll()
        break
      case 'memory':
        if (c.memberId === selectedMember) void loadMemory(c.memberId)
        break
      case 'stream':
        if (selectedGoal) renderAll()
        break
    }
  })

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
  renderMobileNav()
}

void boot()
