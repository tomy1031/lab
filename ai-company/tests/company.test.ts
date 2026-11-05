// 司令塔の流れをシミュレーションのエンジンで通す（Claude は呼ばない）
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ServerEvent } from '../shared/types'

process.env.PACE = '0'
process.env.SIM_SPEED = '200'

const { Store } = await import('../server/store')
const { Company } = await import('../server/company')
const { NodeWorkspace } = await import('../server/nodeWorkspace')
const { SimEngine } = await import('../server/engine/sim')
const { seed } = await import('../server/seed')
const { contextOf, score } = await import('../server/memory')
const { normalizePlan } = await import('../server/engine/claude')
const { splitMemory, extractJson } = await import('../server/engine/prompts')

const until = async (cond: () => boolean, ms = 8000) => {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timeout')
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('Company（シミュレーション）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nmai-'))
  const store = new Store(join(dir, 'state.json'))
  const events: ServerEvent[] = []
  store.on('event', (e: ServerEvent) => events.push(e))
  let company: InstanceType<typeof Company>

  beforeAll(() => {
    seed(store, join(dir, 'cred.txt'))
    company = new Company(store, () => new SimEngine(200), new NodeWorkspace(join(dir, 'ws')))
    // この流れのテストでは、ゴールを出す管理者を承認する人にしておく（承認の関所は別のテストで確かめる）
    store.setGate({ approverId: store.state.members.find((m) => m.isAdmin)!.id })
  })

  it('ゴールを分解し、足りない職種を採用し、人間の仕事を人間に渡す', async () => {
    const admin = store.state.members.find((m) => m.isAdmin)!
    const g = company.createGoal(admin, 'プノンペンで交流イベントを開く', '')
    await until(() => store.goal(g.id)!.status !== 'planning')
    const tasks = store.tasksOf(g.id)
    expect(tasks.length).toBeGreaterThan(3)
    expect(events.some((e) => e.t === 'hired')).toBe(true)
    // 人間のタスクは人間に、AI のタスクは AI社員に
    for (const t of tasks) {
      const a = store.member(t.assigneeId)!
      expect(a.kind).toBe(t.requiresHuman ? 'human' : 'agent')
    }
    // カンボジアの現地の仕事はカンボジアの人へ
    const venue = tasks.find((t) => t.office === 'phnompenh' && t.requiresHuman)
    if (venue) expect(store.member(venue.assigneeId)!.office).toBe('phnompenh')
    // 人間のタスクには「なぜこの人か」が付く
    for (const t of tasks.filter((x) => x.requiresHuman)) expect(t.assignReason).toBeTruthy()

    // 人間の対応待ちになったら完了にしていく
    for (let i = 0; i < 6 && store.goal(g.id)!.status !== 'done'; i++) {
      await until(() => ['waiting_human', 'done'].includes(store.goal(g.id)!.status), 15000)
      for (const t of store.tasksOf(g.id).filter((x) => x.status === 'waiting_human')) {
        company.completeHumanTask(t.id, store.member(t.assigneeId)!, '対応しました')
      }
    }
    await until(() => store.goal(g.id)!.status === 'done', 15000)
    expect(store.goal(g.id)!.report).toBeTruthy()

    // 担当した全員にコンテキストがたまっている
    for (const t of store.tasksOf(g.id)) {
      const mem = store.memoryOf(t.assigneeId!)
      expect(mem.some((m) => m.taskId === t.id)).toBe(true)
    }
    // AI どうしのやり取りがある
    expect(events.some((e) => e.t === 'message' && e.message.kind === 'question')).toBe(true)
  }, 60000)

  it('同じ職種は二重に採用しない', async () => {
    const before = store.state.members.filter((m) => m.kind === 'agent').map((m) => m.role)
    const admin = store.state.members.find((m) => m.isAdmin)!
    const g = company.createGoal(admin, '次のイベントの準備', 'セミナー')
    await until(() => store.goal(g.id)!.status !== 'planning')
    const after = store.state.members.filter((m) => m.kind === 'agent').map((m) => m.role)
    expect(after.length).toBe(before.length)
    company.cancelGoal(g.id, admin)
    expect(store.goal(g.id)!.status).toBe('cancelled')
  })

  it('担当者以外は人間のタスクを完了にできない', () => {
    const t = store.state.tasks.find((x) => x.requiresHuman)!
    store.patchTask(t.id, { status: 'waiting_human' })
    const other = store.state.members.find((m) => m.kind === 'human' && !m.isAdmin && m.id !== t.assigneeId)!
    expect(() => company.completeHumanTask(t.id, other, 'x')).toThrow()
  })
})

describe('初期メンバー', () => {
  it('社長とネクマックスが大阪本社の社長席に並び、東京に人間が 1 人いる', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nmai-'))
    const store = new Store(join(dir, 's.json'))
    seed(store, join(dir, 'c.txt'))
    const ceo = store.state.members.find((m) => m.kind === 'human' && /社長/.test(m.role))!
    const nx = store.member('nexmax')!
    expect([ceo.office, ceo.deskIndex]).toEqual(['osaka', 0])
    expect([nx.office, nx.deskIndex]).toEqual(['osaka', 1])
    expect(store.state.members.filter((m) => m.office === 'tokyo' && m.kind === 'human').length).toBe(1)
    // 同じ拠点の同じ席に 2 人いない
    const keys = store.state.members.filter((m) => m.deskIndex >= 0).map((m) => `${m.office}:${m.deskIndex}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('古いデータ（jp / kh）を読み替える', async () => {
    const { ensureCore } = await import('../server/seed')
    const dir = mkdtempSync(join(tmpdir(), 'nmai-'))
    const store = new Store(join(dir, 's.json'))
    seed(store, join(dir, 'c.txt'))
    for (const m of store.state.members) (m as { office: string }).office = m.office === 'phnompenh' ? 'kh' : 'jp'
    ensureCore(store)
    expect(store.state.members.every((m) => ['osaka', 'tokyo', 'phnompenh'].includes(m.office))).toBe(true)
    expect(store.member('nexmax_kh')!.office).toBe('phnompenh')
  })
})

describe('記憶', () => {
  it('新しく重要な記憶ほど点数が高い', () => {
    const now = Date.now()
    const e = (h: number, imp: number) => ({ id: '', memberId: '', kind: 'task' as const, text: '', importance: imp, at: new Date(now - h * 3600_000).toISOString() })
    expect(score(e(1, 5), now)).toBeGreaterThan(score(e(200, 5), now))
    expect(score(e(1, 9), now)).toBeGreaterThan(score(e(1, 2), now))
  })
  it('contextOf は古い順に並べる', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nmai-'))
    const store = new Store(join(dir, 's.json'))
    seed(store, join(dir, 'c.txt'))
    const m = store.state.members[0]
    const c = contextOf(store, m)
    expect(c.memories.length).toBeGreaterThan(0)
  })
})

describe('プロンプトの道具', () => {
  it('記憶メモを切り分ける', () => {
    const r = splitMemory('成果です\n---MEMORY---\n- 学び1\n- 学び2')
    expect(r.output).toBe('成果です')
    expect(r.memoryNote).toContain('学び1')
  })
  it('JSON を取り出す', () => {
    expect(extractJson('はい\n```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
  it('計画の依存関係から存在しない key と自分自身を外す', () => {
    const p = normalizePlan({
      summary: 's',
      hires: [],
      tasks: [
        { key: 'a', title: 'A', description: '', skills: [], requiresHuman: false, dependsOn: ['a', 'zzz'] },
        { key: 'b', title: 'B', description: '', skills: [], requiresHuman: true, dependsOn: ['a'] },
      ],
    })
    expect(p.tasks[0].dependsOn).toEqual([])
    expect(p.tasks[1].dependsOn).toEqual(['a'])
  })
})

describe('やることストック（音声）', () => {
  it('話したことを用件ごとに分け、急ぎ・種類を付け、同じ用件はまとめ、任せるとゴールになる', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nmai-'))
    const store = new Store(join(dir, 's.json'))
    seed(store, join(dir, 'c.txt'))
    const company = new Company(store, () => new SimEngine(200), new NodeWorkspace(join(dir, 'ws')))
    const me = store.state.members.find((m) => m.isAdmin)!
    store.setGate({ approverId: me.id })
    const other = store.state.members.find((m) => m.kind === 'human' && m.id !== me.id)!
    company.addStock(me, 'えっと、カンボジアの大学向けの説明資料を作りたい。あと明日までに会場の担当者に電話する。それから名刺の渡し方は先に結論を言うと覚えておく')
    await until(() => store.stockOf(me.id).every((s) => s.status !== 'organizing'), 5000)
    const ready = store.stockOf(me.id).filter((s) => s.status === 'ready')
    expect(ready.length).toBe(3)
    expect(ready.find((s) => s.kind === 'self')?.priority).toBe(1)
    expect(ready.some((s) => s.kind === 'memo')).toBe(true)
    // 同じ用件をもう一度言うとまとまる
    company.addStock(me, 'カンボジアの大学向けの説明資料を作りたい。急ぎで')
    await until(() => store.stockOf(me.id).every((s) => s.status !== 'organizing'), 5000)
    expect(store.stockOf(me.id).filter((s) => s.status === 'ready').length).toBe(3)
    // 任せるとゴールになる
    const goalItem = store.stockOf(me.id).find((s) => s.status === 'ready' && s.kind === 'goal')!
    const sent = company.actOnStock(goalItem.id, me, 'send')
    expect(sent.status).toBe('sent')
    expect(store.goal(sent.goalId!)?.title).toBe(goalItem.title)
    // ほかの人のストックは触れない
    expect(() => company.actOnStock(goalItem.id, other, 'archive')).toThrow()
  }, 20000)
})

describe('承認の関所', () => {
  const setup = (opts: { canAutoApprove?: () => boolean } = {}) => {
    const dir = mkdtempSync(join(tmpdir(), 'nmai-'))
    const store = new Store(join(dir, 's.json'))
    seed(store, join(dir, 'c.txt'))
    const company = new Company(store, () => new SimEngine(200), new NodeWorkspace(join(dir, 'ws')), opts)
    const approver = company.approver()!
    const other = store.state.members.find((m) => m.kind === 'human' && m.id !== approver.id && m.login && !m.isAdmin)!
    const ai = store.state.members.find((m) => m.kind === 'nexmax')!
    return { store, company, approver, other, ai }
  }

  it('既定は手動：社長が承認する人で、ほかの人のゴールは承認されるまで動かない', async () => {
    const { store, company, approver, other } = setup()
    expect(/社長/.test(approver.role)).toBe(true)
    const g = company.createGoal(other, '展示会のチラシを作る', '')
    expect(g.status).toBe('awaiting_approval')
    expect(store.state.messages.some((m) => m.toId === approver.id && m.text.includes('承認をお願いします'))).toBe(true)
    // 承認する人以外は承認できない
    expect(() => company.approveGoal(g.id, other)).toThrow()
    company.approveGoal(g.id, approver)
    expect(store.goal(g.id)!.approval).toMatchObject({ state: 'approved', by: approver.id })
    await until(() => store.goal(g.id)!.status === 'running' || store.goal(g.id)!.status === 'waiting_human', 8000)
    // 承認する人が自分で出したゴールはすぐ始まる
    expect(company.createGoal(approver, '社内報を書く', '').status).toBe('planning')
  }, 20000)

  it('見送ると中止になり、出した人に知らせる', () => {
    const { store, company, approver, other } = setup()
    const g = company.createGoal(other, '新しい事業の案を出す', '')
    company.declineGoal(g.id, approver, '来月にしましょう')
    expect(store.goal(g.id)!.status).toBe('cancelled')
    expect(store.state.messages.some((m) => m.toId === other.id && m.text.includes('来月にしましょう'))).toBe(true)
  })

  it('AI への話しかけも、承認されてから答える', async () => {
    const { store, company, approver, other, ai } = setup()
    await company.talk(other, ai, '進み具合を教えて')
    const q = store.state.messages.find((m) => m.fromId === other.id && m.toId === ai.id)!
    expect(q.approval?.state).toBe('pending')
    expect(store.state.messages.some((m) => m.replyTo === q.id)).toBe(false)
    await company.approveTalk(q.id, approver)
    expect(store.state.messages.some((m) => m.replyTo === q.id && m.kind === 'answer')).toBe(true)
  })

  it('自動承認：ルールに合えば通し、1 日の上限を超えたら手動に戻る。承認する人のページが閉じていれば通さない', () => {
    let open = true
    const { store, company, approver, other } = setup({ canAutoApprove: () => open })
    company.setGate(approver, { mode: 'auto', dailyLimit: 1 })
    const a = company.createGoal(other, '1 件目', '')
    expect(store.goal(a.id)!.approval).toMatchObject({ state: 'approved', auto: true })
    const b = company.createGoal(other, '2 件目', '')
    expect(store.goal(b.id)!.status).toBe('awaiting_approval')
    expect(company.gateInfo().autoToday).toBe(1)
    company.setGate(approver, { dailyLimit: 5 })
    expect(store.goal(b.id)!.status).not.toBe('awaiting_approval') // 上限を上げたら、待っていた分も通る
    open = false
    const c = company.createGoal(other, '3 件目', '')
    expect(store.goal(c.id)!.status).toBe('awaiting_approval')
    // 自動承認の対象を選んだ人だけにする
    open = true
    company.setGate(approver, { autoFrom: [approver.id] })
    expect(company.createGoal(other, '4 件目', '').status).toBe('awaiting_approval')
    // 承認の設定は承認する人か管理者だけ
    expect(() => company.setGate(other, { mode: 'manual' })).toThrow()
  })
})
