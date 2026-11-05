// アーティファクト版の頭脳（SampleEngine）：claude.ai の sample の代わりに決まった答えを返して、
// 分解の読み取り・成果のファイル化・同僚への相談の道具・承認の関所（CoreStore の上の Company）を確かめる
import { describe, expect, it } from 'vitest'
import type { Goal, Member } from '../shared/types'
import { SampleEngine } from '../client/src/artifact/sampleEngine'
import type { SampleFn, SampleOptions } from '../client/src/artifact/runtime'
import { CoreStore } from '../server/coreStore'
import { Company } from '../server/company'
import type { Workspace } from '../server/workspace'

function fakeSample(answers: { plan: unknown; task: unknown }, seen: { prompt: string; opts?: SampleOptions }[]): SampleFn {
  const fn = (async (prompt: string, opts?: SampleOptions) => {
    seen.push({ prompt, opts })
    return { text: '了解です。前提を確認しながら進めましょう。', truncated: false }
  }) as SampleFn
  fn.json = (async (prompt: string, opts?: SampleOptions) => {
    seen.push({ prompt, opts })
    if (prompt.includes('タスク（3〜8 個）に分解')) return answers.plan
    // 道具を使えるときは、同僚に 1 回相談してから答える
    const ask = opts?.tools?.find((t) => t.name === 'ask_colleague')
    if (ask) await ask.execute({ to: 'ネクマックス', question: '優先順位は？' }, { signal: new AbortController().signal })
    return answers.task
  }) as SampleFn['json']
  fn.limits = async () => ({ maxPromptBytes: 262144, tools: { maxCount: 8 } })
  return fn
}

const human = (id: string, name: string, admin = false): Member => ({
  id,
  kind: 'human',
  name,
  role: admin ? '代表' : 'メンバー',
  office: 'osaka',
  skills: [],
  languages: ['ja'],
  look: { body: '#000000', accent: '#ffffff', style: 0 },
  deskIndex: admin ? 0 : 2,
  status: 'idle',
  hiredAt: new Date().toISOString(),
  isAdmin: admin,
  stats: { tasksDone: 0, messages: 0 },
})

describe('アーティファクト版の頭脳（SampleEngine）', () => {
  const plan = {
    summary: '調べて、案を作り、代表が決める',
    hires: [{ key: 'h1', role: 'リサーチャー', name: 'アイ', office: 'osaka', skills: ['調査'], languages: ['ja'], persona: '丁寧', reason: '調査が要る' }],
    tasks: [
      { key: 't1', title: '調べる', description: '要点をまとめる', skills: ['調査'], requiresHuman: false, dependsOn: [], assignee: 'h1' },
      { key: 't2', title: '決める', description: '最終判断', skills: [], requiresHuman: true, humanReason: '最終の意思決定', dependsOn: ['t1', 'zz'], assignee: 'owner' },
    ],
  }
  const task = { summary: '## 要点\n- A\n- B', files: [{ name: '../../etc/passwd', content: '# 調査' }, { name: 'plan.md', content: '# 案' }], memory: '相手は結論から聞きたい' }

  it('分解：JSON を読み、存在しない依存を落とす。会社の前提に実在の社名・人名を入れない', async () => {
    const seen: { prompt: string }[] = []
    const eng = new SampleEngine(fakeSample({ plan, task }, seen))
    const goal = { id: 'g1', title: '交流会を開く', description: '', createdBy: 'owner', createdAt: '', status: 'planning', taskIds: [] } as Goal
    const p = await eng.plan({ goal, roster: [], requester: undefined })
    expect(p.tasks).toHaveLength(2)
    expect(p.tasks[1].dependsOn).toEqual(['t1'])
    expect(p.hires[0].office).toBe('osaka')
    expect(seen[0].prompt).not.toMatch(/ネクストメイク|NEXTMAKE|松井/)
  })

  it('作業：成果をファイルに残し（フォルダの外を指す名前は無害にする）、同僚への相談の道具を渡す', async () => {
    const seen: { prompt: string; opts?: SampleOptions }[] = []
    const eng = new SampleEngine(fakeSample({ plan, task }, seen))
    const written: [string, string][] = []
    const asked: string[] = []
    const me = { member: { ...human('a1', 'アイ'), kind: 'agent' as const }, memories: [] }
    const goal = { id: 'g1', title: '交流会を開く', description: '', createdBy: 'owner', createdAt: '', status: 'running', taskIds: [] } as Goal
    const r = await eng.runTask({
      goal,
      task: { id: 't1', goalId: 'g1', key: 't1', title: '調べる', description: '', skills: [], requiresHuman: false, dependsOn: [], status: 'in_progress', order: 0 },
      me,
      colleagues: [],
      inputs: [],
      workdir: 'db:g1',
      writeFile: (n, c) => written.push([n, c]),
      tools: { askColleague: async (to, q) => (asked.push(`${to}:${q}`), 'まずは会場から'), postUpdate: () => {} },
      onText: () => {},
      signal: new AbortController().signal,
    })
    expect(r.output).toContain('要点')
    expect(r.memoryNote).toContain('結論から')
    expect(written.map(([n]) => n)).toEqual(['../../etc/passwd', 'plan.md'])
    expect(asked).toEqual(['ネクマックス:優先順位は？'])
    expect(seen.at(-1)?.opts?.tools?.map((t) => t.name)).toEqual(['ask_colleague', 'post_update'])
  })

  it('ブラウザの中の司令塔：承認する人の Claude で、承認されたゴールだけを分解する', async () => {
    const seen: { prompt: string }[] = []
    const eng = new SampleEngine(fakeSample({ plan, task }, seen))
    const store = new CoreStore()
    const owner = human('owner', '代表', true)
    const member = human('u2', 'さくら')
    store.state.members.push(owner, member, { ...human('nexmax', 'ネクマックス'), kind: 'nexmax', deskIndex: 1 })
    store.setGate({ approverId: owner.id })
    const files = new Map<string, string>()
    const ws: Workspace = {
      dir: (g) => `db:${g}`,
      list: (g) => [...files.keys()].filter((k) => k.startsWith(g + '/')).map((k) => k.slice(g.length + 1)),
      write: (g, n, c) => void files.set(`${g}/${n}`, c),
      read: (g, n) => files.get(`${g}/${n}`) ?? null,
    }
    const company = new Company(store, () => eng, ws, { pace: 0, maxParallel: 2 })
    const g = company.createGoal(member, '交流会を開く', '')
    expect(g.status).toBe('awaiting_approval')
    expect(seen).toHaveLength(0) // 承認されるまで Claude は呼ばない
    company.approveGoal(g.id, owner)
    const t0 = Date.now()
    while (store.goal(g.id)!.status !== 'waiting_human' && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 10))
    expect(store.goal(g.id)!.status).toBe('waiting_human')
    expect(ws.list(g.id)).toContain('plan.md')
    expect(store.state.members.some((m) => m.kind === 'agent' && m.name === 'アイ')).toBe(true)
  })
})
