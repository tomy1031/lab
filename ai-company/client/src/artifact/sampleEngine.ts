// アーティファクト版の頭脳：claude.ai のページから Claude に頼む（sample）。承認する人のアカウントの利用枠で動く。
// Claude Code 版と違ってファイルの道具や Web は使えないので、成果は JSON で受け取り、ファイルとしてデータベースに残す。
import type { EngineInfo } from '../../../shared/types'
import { SimEngine } from '../../../server/engine/sim'
import { describeContext, describeMember, normalizePlan, personaPrompt, planPrompt } from '../../../server/engine/prompts'
import type { ConsultInput, Engine, MemberContext, OrganizeInput, OrganizedStock, Plan, PlanInput, ReportInput, RunTaskInput, RunTaskResult } from '../../../server/engine/types'
import type { SampleFn, SampleTool } from './runtime'

/** アーティファクト版の会社の前提（実在の会社名・人名は入れない） */
export const ARTIFACT_CONTEXT = `# 会社
日本（大阪本社 = osaka・東京オフィス = tokyo、Asia/Tokyo）とカンボジア（プノンペンオフィス = phnompenh、Asia/Phnom_Penh、日本より2時間遅い）に拠点がある会社の「AI オフィス」。人間の社員と、必要に応じて採用された AI社員が一緒に働く。
- 統括 AI「ネクマックス」が仕事を分けて配る。カンボジアには量産型ネクマックス NX-086 もいる
- このオフィスの仕事は、承認する人（代表）が「始める」を押してから動く
- 社内の言葉は日本語。カンボジアの人とはクメール語・英語も使う
- AI社員は Web を見られない。手元の情報と同僚への相談だけで進め、分からない事実は推測で断定せず「要確認」と書く`

const PLAN_SHAPE = `# 返し方
次の形の JSON だけを返す（説明の文は付けない）：
{"summary":"分解の方針を 2〜3 文","hires":[{"key":"h1","role":"職種","name":"カタカナの愛称","office":"osaka|tokyo|phnompenh","skills":["…"],"languages":["ja"],"persona":"性格と仕事の流儀","reason":"採用理由"}],"tasks":[{"key":"t1","title":"…","description":"…","skills":["…"],"requiresHuman":false,"humanReason":"","office":"osaka","dependsOn":[],"assignee":"既存メンバーの id か hires の key","assigneeReason":"40 字以内"}]}`

interface TaskJson {
  summary?: string
  files?: { name?: string; content?: string }[]
  memory?: string
}

export class SampleEngine implements Engine {
  readonly info: EngineInfo = { mode: 'artifact', detail: 'claude.ai のアーティファクト：承認する人の Claude で動きます（ファイルの道具・Web は使いません）' }
  private sim = new SimEngine(1)
  private toolsOk: Promise<boolean>

  constructor(private readonly sample: SampleFn) {
    this.toolsOk = sample
      .limits()
      .then((l) => !!l.tools)
      .catch(() => false)
  }

  async plan(input: PlanInput): Promise<Plan> {
    const prompt = `${planPrompt(input, ARTIFACT_CONTEXT)}\n- AI社員はファイルの道具も Web も使えない。調査は「手元の知識で整理し、要確認の点を挙げる」形にする。\n\n${PLAN_SHAPE}`
    const raw = await this.sample.json<Plan>(prompt, { modelTier: 'default', cache: false })
    if (!raw || typeof raw !== 'object') throw new Error('分解の結果を読めませんでした')
    return normalizePlan(raw)
  }

  async runTask(input: RunTaskInput): Promise<RunTaskResult> {
    const { goal, task, me, colleagues, inputs, tools, signal, writeFile } = input
    const useTools = await this.toolsOk
    const prev = inputs.length ? inputs.map((i) => `## ${i.title}（${i.by}）\n${i.output.slice(0, 3000)}`).join('\n\n') : '（なし）'
    const prompt = `${ARTIFACT_CONTEXT}

${personaPrompt(me)}

# 同僚
${colleagues.map(describeMember).join('\n')}

# ゴール
${goal.title}
${goal.description}

# あなたのタスク
${task.title}
${task.description}
必要なスキル：${task.skills.join('、')}

# 前のタスクの成果
${prev}

# 進め方
${useTools ? '- 必要なら ask_colleague で同僚に相談する（1 回まで）。始めに post_update で進み具合をひとこと共有する。\n' : ''}- 成果物はファイルにする（1〜2 個。Markdown か HTML。1 つ 6000 字以内。ファイル名は英数字）。
- 最後に次の形の JSON だけを返す：
{"summary":"成果の要約（Markdown、600 字以内）","files":[{"name":"plan.md","content":"…"}],"memory":"次の仕事に活かす学び・相手の好み・決まったことを 1〜2 行"}`

    const sampleTools: SampleTool[] = useTools
      ? [
          {
            name: 'ask_colleague',
            description: '同僚（AI社員・人間・ネクマックス）に相談する。to に名前か id。AI社員ならすぐ答えが返る。人間への質問は記録され、返事は後になる。',
            inputSchema: { type: 'object', properties: { to: { type: 'string' }, question: { type: 'string' } }, required: ['to', 'question'] },
            execute: async (a) => tools.askColleague(String(a.to ?? ''), String(a.question ?? '')),
          },
          {
            name: 'post_update',
            description: '作業の進み具合をひとこと（30 字くらい）で社内に共有する。',
            inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
            execute: (a) => {
              tools.postUpdate(String(a.text ?? '').slice(0, 80))
              return '共有しました'
            },
          },
        ]
      : []
    const res = await this.sample.json<TaskJson>(prompt, { modelTier: 'default', signal, ...(useTools ? { tools: sampleTools } : { cache: false }) })
    const files = Array.isArray(res?.files) ? res.files.slice(0, 3) : []
    for (const f of files) if (f?.name && typeof f.content === 'string') writeFile(String(f.name), f.content.slice(0, 60000))
    return { output: String(res?.summary ?? '').trim() || '（要約なし）', memoryNote: String(res?.memory ?? '').trim() }
  }

  async consult({ goal, from, to, question }: ConsultInput): Promise<string> {
    const prompt = `${ARTIFACT_CONTEXT}\n\n${personaPrompt(to)}\n\n${goal ? `（ゴール「${goal.title}」の件）\n` : ''}${from.name}（${from.role}）からの相談：\n${question}\n\n同僚として、自分の専門と記憶を踏まえて、要点を 300 字以内で答えてください。`
    return (await this.sample(prompt, { modelTier: 'quick', cache: false })).text.trim()
  }

  async report({ goal, tasks }: ReportInput): Promise<string> {
    const body = tasks.map((t) => `## ${t.title}（${t.assigneeName}${t.requiresHuman ? '・人間' : ''}）\n${(t.output ?? '').slice(0, 2000)}`).join('\n\n')
    const prompt = `${ARTIFACT_CONTEXT}\n\nあなたは統括AI「ネクマックス」。明るく簡潔に報告する。\nゴール「${goal.title}」が完了しました。各タスクの成果：\n\n${body}\n\n依頼者向けの完了報告を Markdown で書いてください（結論 → 成果物 → 次の一手、600 字以内）。`
    return (await this.sample(prompt, { modelTier: 'default', cache: false })).text.trim()
  }

  async reflect(me: MemberContext): Promise<string> {
    const prompt = `${personaPrompt(me)}\n\nあなたのこれまでの記憶：\n${describeContext(me, 20)}\n\nここから、次の仕事に活かす気づき（自分の得意・相手の好み・気をつけること）を、箇条書き 2〜3 行で書いてください。記憶に無いことは書かない。`
    return (await this.sample(prompt, { modelTier: 'quick', cache: false })).text.trim()
  }

  /** やることストックの整理は、各自のページで手元の決まりで行う（Claude を使わない） */
  organize(input: OrganizeInput): Promise<OrganizedStock[]> {
    return this.sim.organize(input)
  }
}
