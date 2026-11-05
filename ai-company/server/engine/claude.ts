// Claude Code（Claude Agent SDK）で動く頭脳。
// - plan：ネクマックス（統括）がゴールをタスクに分け、人間にしかできない仕事を見分け、足りない職種の採用を提案する
// - runTask：AI社員 1 人 = Claude Code の 1 セッション。ゴールの作業フォルダでファイルを書き、同僚に相談できる（社内ツールは SDK の MCP）
// - consult：同僚からの相談に、その人の記憶を踏まえて答える
// - report：ゴール完了の報告書
import { createSdkMcpServer, query, tool, type HookCallbackMatcher, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type { EngineInfo } from '../../shared/types'
import { checkTool } from './guard'
import { COMPANY_CONTEXT, describeContext, describeMember, extractJson, normalizePlan, personaPrompt, planPrompt, splitMemory } from './prompts'
import type { ConsultInput, Engine, MemberContext, OrganizeInput, OrganizedStock, Plan, PlanInput, ReportInput, RunTaskInput, RunTaskResult } from './types'

const MODEL = process.env.AI_MODEL || undefined
const ALLOW_BASH = process.env.AGENT_ALLOW_BASH === '1'
/** 1 タスクあたりの上限（USD）。超えると止まる */
const TASK_BUDGET = Number(process.env.TASK_BUDGET_USD || 1.5)

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', description: '分解の方針（2〜3 文）' },
    hires: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: { type: 'string' },
          role: { type: 'string' },
          name: { type: 'string' },
          office: { type: 'string', enum: ['osaka', 'tokyo', 'phnompenh'] },
          skills: { type: 'array', items: { type: 'string' } },
          languages: { type: 'array', items: { type: 'string' } },
          persona: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['key', 'role', 'office', 'skills', 'languages', 'persona', 'reason'],
      },
    },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          skills: { type: 'array', items: { type: 'string' } },
          requiresHuman: { type: 'boolean' },
          humanReason: { type: 'string' },
          office: { type: 'string', enum: ['osaka', 'tokyo', 'phnompenh'] },
          dependsOn: { type: 'array', items: { type: 'string' } },
          assignee: { type: 'string' },
          assigneeReason: { type: 'string', description: 'なぜその担当か（拠点・スキル・これまでの仕事）を 40 字以内で' },
        },
        required: ['key', 'title', 'description', 'skills', 'requiresHuman', 'dependsOn', 'assignee'],
      },
    },
  },
  required: ['summary', 'hires', 'tasks'],
} as const

function baseOptions(extra: Partial<Options> = {}): Options {
  return {
    model: MODEL,
    settingSources: [],
    persistSession: false,
    ...extra,
  } as Options
}

/** 使った額（API の料金に換算した目安）。種類ごと（分解・作業・相談…）にも足していく */
export const spend = { totalUsd: 0, byKind: {} as Record<string, number> }

type ModelUsage = Record<string, { inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number; cacheCreationInputTokens?: number }>

function logCost(kind: string, cost: number, usage: ModelUsage | undefined): void {
  spend.totalUsd += cost
  spend.byKind[kind] = (spend.byKind[kind] ?? 0) + cost
  const models = Object.entries(usage ?? {})
    .map(([m, u]) => `${m} in=${u.inputTokens ?? 0} out=${u.outputTokens ?? 0} cacheR=${u.cacheReadInputTokens ?? 0} cacheW=${u.cacheCreationInputTokens ?? 0}`)
    .join(' / ')
  console.log(`[cost] ${kind} $${cost.toFixed(4)}（累計 $${spend.totalUsd.toFixed(4)}）${models ? ' ' + models : ''}`)
}

async function collect(q: AsyncIterable<SDKMessage>, onText?: (t: string) => void, kind = 'other'): Promise<{ text: string; structured?: unknown; cost: number }> {
  let text = ''
  let lastAssistant = ''
  let structured: unknown
  let cost = 0
  for await (const msg of q) {
    if (msg.type === 'stream_event' && onText && !msg.parent_tool_use_id) {
      const ev = msg.event as { type: string; delta?: { type: string; text?: string } }
      if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) onText(ev.delta.text)
    } else if (msg.type === 'assistant' && !msg.parent_tool_use_id) {
      const parts = (msg.message.content as { type: string; text?: string }[]).filter((b) => b.type === 'text').map((b) => b.text ?? '')
      if (parts.length) lastAssistant = parts.join('\n')
    } else if (msg.type === 'result') {
      cost = msg.total_cost_usd ?? 0
      logCost(kind, cost, (msg as { modelUsage?: ModelUsage }).modelUsage)
      if (msg.subtype === 'success') {
        text = msg.result
        structured = msg.structured_output
      } else {
        throw new Error(`Claude Code の実行が止まりました（${msg.subtype}）`)
      }
    }
  }
  return { text: text || lastAssistant, structured, cost }
}

export class ClaudeEngine implements Engine {
  readonly info: EngineInfo = {
    mode: 'claude',
    detail: `Claude Code（Claude Agent SDK）${MODEL ? `・${MODEL}` : ''}`,
  }

  async plan({ goal, roster, requester, ceo }: PlanInput): Promise<Plan> {
    const prompt = planPrompt({ goal, roster, requester, ceo }, COMPANY_CONTEXT)

    const q = query({
      prompt,
      options: baseOptions({
        systemPrompt: 'あなたは会社の統括AI。指示どおりの JSON だけを返す。',
        allowedTools: [],
        tools: [],
        maxTurns: 3,
        outputFormat: { type: 'json_schema', schema: PLAN_SCHEMA as unknown as Record<string, unknown> },
      }),
    })
    const { text, structured } = await collect(q, undefined, 'plan')
    const raw = (structured ?? extractJson(text)) as Plan
    return normalizePlan(raw)
  }

  async runTask(input: RunTaskInput): Promise<RunTaskResult> {
    const { goal, task, me, colleagues, inputs, workdir, tools, onText, signal } = input
    const company = createSdkMcpServer({
      name: 'company',
      version: '1.0.0',
      tools: [
        tool(
          'ask_colleague',
          '同僚（AI社員・人間・ネクマックス）に相談・確認する。to には名前か id。AI社員ならその場で答えが返る。人間への質問は記録され、返事は後になる。',
          { to: z.string(), question: z.string() },
          async (a) => ({ content: [{ type: 'text', text: await tools.askColleague(a.to, a.question) }] }),
        ),
        tool('post_update', '作業の進み具合をひとこと（30 字くらい）で社内に共有する。', { text: z.string() }, async (a) => {
          tools.postUpdate(a.text)
          return { content: [{ type: 'text', text: '共有しました' }] }
        }),
      ],
    })
    const team = colleagues.map(describeMember).join('\n')
    const prev = inputs.length
      ? inputs.map((i) => `## ${i.title}（${i.by}）\n${i.output.slice(0, 4000)}`).join('\n\n')
      : '（なし）'
    const prompt = `# ゴール
${goal.title}
${goal.description}

# あなたのタスク
${task.title}
${task.description}
必要なスキル：${task.skills.join('、')}

# 前のタスクの成果
${prev}

# 進め方
- 作業フォルダ（いまのディレクトリ）に成果物のファイルを作る（Markdown 推奨。ファイル名は英数字）。
- 必要なら ask_colleague で同僚に相談する（1〜2 回まで）。節目で post_update を使う。
- 最後に、成果の要約（Markdown、800 字以内）を書き、その下に「---MEMORY---」の行と、次の仕事に活かす学び・相手の好み・決まったことを 1〜3 行書く。`

    const ac = new AbortController()
    signal.addEventListener('abort', () => ac.abort())
    // tools = 使える組み込みの道具（これ以外は存在しない）、allowedTools = 確認なしで使ってよい道具
    // AGENT_WEB=0 で Web の検索・取得を使わせない（外部のページに仕込まれた指示＝プロンプトインジェクションの入口を閉じる）
    const builtins = ['Read', 'Write', 'Edit', 'Glob', 'Grep', ...(process.env.AGENT_WEB === '0' ? [] : ['WebSearch', 'WebFetch'])]
    if (ALLOW_BASH) builtins.push('Bash')
    const allowed = [...builtins, 'mcp__company__ask_colleague', 'mcp__company__post_update']
    const q = query({
      prompt,
      options: baseOptions({
        cwd: workdir,
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: `${COMPANY_CONTEXT}\n\n${personaPrompt(me)}\n\n# 同僚\n${team}`,
        },
        mcpServers: { company },
        tools: builtins,
        allowedTools: allowed,
        permissionMode: 'dontAsk',
        hooks: { PreToolUse: [guardHook(workdir)] },
        maxTurns: 40,
        maxBudgetUsd: TASK_BUDGET,
        includePartialMessages: true,
        abortController: ac,
      }),
    })
    const { text } = await collect(q, onText, 'task')
    return splitMemory(text)
  }

  async consult({ goal, from, to, question }: ConsultInput): Promise<string> {
    const q = query({
      prompt: `${goal ? `（ゴール「${goal.title}」の件）\n` : ''}${from.name}（${from.role}）からの相談：\n${question}\n\n同僚として、自分の専門と記憶を踏まえて、要点を 300 字以内で答えてください。`,
      options: baseOptions({
        systemPrompt: `${COMPANY_CONTEXT}\n\n${personaPrompt(to)}`,
        allowedTools: [],
        tools: [],
        maxTurns: 1,
      }),
    })
    return (await collect(q, undefined, 'consult')).text.trim()
  }

  async organize({ member, items, existing }: OrganizeInput): Promise<OrganizedStock[]> {
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              from: { type: 'string' },
              title: { type: 'string' },
              summary: { type: 'string' },
              kind: { type: 'string', enum: ['goal', 'self', 'memo'] },
              priority: { type: 'integer', enum: [1, 2, 3] },
              duplicateOf: { type: 'string' },
            },
            required: ['from', 'title', 'summary', 'kind', 'priority'],
          },
        },
      },
      required: ['items'],
    }
    const prompt = `${member.name}さん（${member.role}）が、思いついたことをマイクで話しました（音声認識なので、聞き間違いや言いよどみを含みます）。
これを「やることストック」に整理してください。

# 話したこと（id: 内容）
${items.map((i) => `- ${i.id}: ${i.raw}`).join('\n')}

# すでにあるストック（id: 題名）
${existing.map((e) => `- ${e.id}: ${e.title}`).join('\n') || '（なし）'}

# 整理のしかた
- 1 つの発言に用件がいくつかあれば、用件ごとに分ける（from には元の発言の id）。用件が無い発言（相づち・独り言）は出さない。
- title：20 字以内。「〜する」で終わる、見ただけで分かる言い方。聞き間違いは文脈で直す。
- summary：40 字以内の一言。だれと・いつまで・何のため、が分かれば書く。分からないことは書かない（作らない）。
- kind：goal = AI社員に任せて進められる仕事（調査・資料・企画・翻訳など）／ self = 本人がやること（電話・会う・行く・決める・払う）／ memo = 覚えておくこと・気づき。
- priority：1 = 急ぎ（今日・明日・至急などと言った）／ 2 = ふつう ／ 3 = いつか。
- すでにあるストックと同じ用件なら duplicateOf にその id を入れる。`
    const q = query({
      prompt,
      options: baseOptions({
        systemPrompt: `${COMPANY_CONTEXT}\n\nあなたは統括AI「ネクマックス」。人の話を、短く分かりやすい「やること」に整える。指示どおりの JSON だけを返す。`,
        allowedTools: [],
        tools: [],
        maxTurns: 2,
        outputFormat: { type: 'json_schema', schema },
      }),
    })
    const { text, structured } = await collect(q, undefined, 'organize')
    const raw = (structured ?? extractJson(text)) as { items?: OrganizedStock[] }
    return (raw.items ?? []).filter((x) => x && x.from && x.title)
  }

  async reflect(me: MemberContext): Promise<string> {
    const q = query({
      prompt: `あなたのこれまでの記憶：\n${describeContext(me, 20)}\n\nここから、次の仕事に活かす気づき（自分の得意・相手の好み・気をつけること）を、箇条書き 2〜3 行で書いてください。記憶に無いことは書かない。`,
      options: baseOptions({
        systemPrompt: `${COMPANY_CONTEXT}\n\n${personaPrompt(me)}`,
        allowedTools: [],
        tools: [],
        maxTurns: 1,
      }),
    })
    return (await collect(q, undefined, 'reflect')).text.trim()
  }

  async report({ goal, tasks }: ReportInput): Promise<string> {
    const body = tasks
      .map((t) => `## ${t.title}（${t.assigneeName}${t.requiresHuman ? '・人間' : ''}）\n${(t.output ?? '').slice(0, 2500)}`)
      .join('\n\n')
    const q = query({
      prompt: `ゴール「${goal.title}」が完了しました。各タスクの成果：\n\n${body}\n\n依頼者向けの完了報告を Markdown で書いてください（結論 → 成果物 → 次の一手、600 字以内）。`,
      options: baseOptions({
        systemPrompt: `${COMPANY_CONTEXT}\n\nあなたは統括AI「ネクマックス」。明るく簡潔に報告する。`,
        allowedTools: [],
        tools: [],
        maxTurns: 1,
      }),
    })
    return (await collect(q, undefined, 'report')).text.trim()
  }
}

/** 道具を使う直前の検査（作業フォルダの外・社内ネットワークへは行かせない）。止めた理由は AI社員にも伝わる */
function guardHook(workdir: string): HookCallbackMatcher {
  return {
    hooks: [
      async (input) => {
        if (input.hook_event_name !== 'PreToolUse') return {}
        const r = checkTool(workdir, input.tool_name, input.tool_input, ALLOW_BASH)
        if (r.ok) return {}
        console.warn(`[guard] ${input.tool_name} を止めました：${r.reason}`)
        return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: r.reason } }
      },
    ],
  }
}

export { normalizePlan } from './prompts'
