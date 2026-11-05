// Claude Code（Claude Agent SDK）で動く頭脳。
// - plan：ネクマックス（統括）がゴールをタスクに分け、人間にしかできない仕事を見分け、足りない職種の採用を提案する
// - runTask：AI社員 1 人 = Claude Code の 1 セッション。ゴールの作業フォルダでファイルを書き、同僚に相談できる（社内ツールは SDK の MCP）
// - consult：同僚からの相談に、その人の記憶を踏まえて答える
// - report：ゴール完了の報告書
import { createSdkMcpServer, query, tool, type HookCallbackMatcher, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type { EngineInfo } from '../../shared/types'
import { normalizeOffice } from '../../shared/types'
import { checkTool } from './guard'
import { COMPANY_CONTEXT, describeContext, describeMember, extractJson, personaPrompt, splitMemory } from './prompts'
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

async function collect(q: AsyncIterable<SDKMessage>, onText?: (t: string) => void): Promise<{ text: string; structured?: unknown; cost: number }> {
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
    const people = roster
      .filter((c) => c.member.kind !== 'nexmax')
      .map((c) => `${describeMember(c.member)}\n  これまでの仕事：\n${describeContext(c, 4)}`)
      .join('\n')
    const prompt = `${COMPANY_CONTEXT}

# いまの社員（id を使って担当を決める）
${people || '（統括AI以外まだ誰もいない）'}

# 依頼者
${requester ? describeMember(requester) : '不明'}

# 社長（${ceo?.member.name ?? '松井社長'}）の方針・これまでの判断（あなたは社長の分身として、これに沿って判断する）
${ceo ? describeContext(ceo, 8) : '    ・（まだ記録なし）'}

# ゴール
タイトル：${goal.title}
内容：${goal.description || '（説明なし）'}

# やること
あなたは統括AI「ネクマックス」（社長の分身）。このゴールを、AI社員と人間が分担できるタスク（3〜8 個）に分解する。
- requiresHuman=true にするのは人間にしかできない仕事だけ：対面・現地での行動、電話や訪問での関係づくり、契約・署名・押印、支払いや発注の最終承認、法的責任を伴う判断、最終の意思決定、実物の確認。humanReason にその理由を書く。
- 人間のタスクの assignee は既存の人間の id（拠点・スキル・これまでの仕事で選ぶ。適任がいなければ依頼者の id）。assigneeReason に「なぜその人か」を書く（例：プノンペン在籍・学校との調整を担当してきた）。社長本人には、社長にしかできない最終判断だけを回す。
- AI のタスク（調査・企画・文章・翻訳・設計・コード・資料作り・分析など）は、合う AI社員がいればその id、いなければ hires に採用を提案し、assignee にその hires の key を書く。採用は最小限（同じ職種を重複して採用しない。既存の AI社員で足りるなら採用しない）。
- 採用する AI社員：role（職種名）、name（カタカナの短い愛称。カンボジア拠点ならクメール風の名前）、office、skills、languages（ja/km/en）、persona（性格と仕事の流儀を 1〜2 文）、reason（採用理由）。
- 拠点（office）は osaka / tokyo / phnompenh。カンボジアに関わる現地の仕事・クメール語の仕事は phnompenh、東京での対面の仕事は tokyo。
- dependsOn には先に終わるべきタスクの key を書く。最後のタスクは「成果のまとめ・最終確認」にする（人間の承認が要るなら人間）。
- description は担当者がそのまま着手できるよう、成果物の形（例：Markdown の資料 1 枚）まで具体的に。AI社員が作れるのはテキストのファイル（Markdown・HTML・CSV・JSON・コード）だけ。PDF・画像・動画は作れないので、必要なら「印刷用の HTML」などにする。`

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
    const { text, structured } = await collect(q)
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
    const { text } = await collect(q, onText)
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
    return (await collect(q)).text.trim()
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
    const { text, structured } = await collect(q)
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
    return (await collect(q)).text.trim()
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
    return (await collect(q)).text.trim()
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

export function normalizePlan(raw: Plan): Plan {
  const tasks = (raw.tasks ?? []).filter((t) => t && t.key && t.title)
  const keys = new Set(tasks.map((t) => t.key))
  return {
    summary: String(raw.summary ?? ''),
    hires: (raw.hires ?? []).filter((h) => h && h.key && h.role).map((h) => ({
      ...h,
      office: normalizeOffice(h.office),
      skills: h.skills ?? [],
      languages: h.languages?.length ? h.languages : ['ja'],
      persona: h.persona ?? '',
      reason: h.reason ?? '',
    })),
    tasks: tasks.map((t) => ({
      ...t,
      skills: t.skills ?? [],
      requiresHuman: !!t.requiresHuman,
      office: t.office ? normalizeOffice(t.office) : undefined,
      dependsOn: (t.dependsOn ?? []).filter((d) => keys.has(d) && d !== t.key),
    })),
  }
}
