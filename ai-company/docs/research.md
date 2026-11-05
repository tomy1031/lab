# 調査メモ: AI社員・エージェント会社・マルチエージェント可視化

調査日: 2026-11-03 / 対象: 目標 → Claude がタスク分解 → AI社員を必要なときに採用 → 人間専用タスクは人間へ → 社員ごとに記憶を蓄積 → three.js の 3D オフィス（日本・カンボジア）で可視化

## 1. 要点（このプロダクトへの反映）

- **オーケストレーターとワーカーの構成を採る**。「CEO（Claude）」が目標をタスクに分解し、社員に割り当てて、結果を統合する。Anthropic はこの構成を「必要なサブタスクを事前に予測できない複雑なタスク」に向くとしている。
- **分解結果は JSON で受け取る**。分解は `query()` の `outputFormat: { type: 'json_schema', schema }` で行い、`result.structured_output` から読む。各タスクには `objective / outputFormat / tools / boundaries / assignee(ai|human) / requiredSkills / dependsOn / acceptanceCriteria` を持たせる。Anthropic の調査システムは、サブエージェントへの指示に「目的・出力形式・使うツールと情報源・タスク境界」が必要だと報告している。
- **評価役と最適化役のループで品質を確認する**。レビュー担当の社員（評価役）が `acceptanceCriteria` と照らして判定し、差し戻しには上限回数（`maxTurns` や再試行回数）を設ける。上限を超えたら人間へエスカレーションする。
- **AI社員のペルソナは `role + goal + backstory + tools + model` で定義し、DB に保存する**。CrewAI・MetaGPT・SDK の `AgentDefinition` に共通する型。表示用に `name / 社員番号(ID) / office(JP|KH) / skills / avatar` を足す。採用は、実行時に定義を生成する「Dynamic agent configuration」と同じ考え方で行う。
- **実行はアプリ側で制御する**。Agent ツールによる自動委譲（どの社員に委譲するかを Claude に任せる方式）は非決定的なので使わない。タスクごとに担当社員の `query()` を 1 回起動し、`systemPrompt` にペルソナと記憶ダイジェスト、`cwd` に社員ごとの作業ディレクトリ、`tools` / `allowedTools` に必要最小限のツール、`permissionMode: 'dontAsk'`（事前承認のないツールは拒否）、上限として `maxTurns` と `maxBudgetUsd` を設定する。
- **社内ツールはプロセス内 MCP（`createSdkMcpServer` と `tool()`）で提供する**。例は `request_human`（人間タスクの登録）、`save_memory`、`report_progress`、`hire_employee`。名前は `mcp__company__request_human` の形になる。
- **人間タスクは非同期で扱う**。AI の実行は「人間へ引き継ぎ」で一度終了し、人間が完了したら続きを実行する。AutoGen は、実行中に人間の応答を待つ方式だとチームが止まり、状態の保存も再開もできなくなると警告している。
- **人間に回すタスクを判定するルール**: (a) 高リスク・不可逆・金銭（支払い、返金、注文取消）、(b) 失敗が閾値を超えたとき、(c) 押印・署名・法的責任、(d) 現地での物理作業（JP/KH の各オフィス）、(e) 対人関係・交渉。(a)(b) は OpenAI のガイド、(d) は RentAHuman の報道、(e) は GENAI の「判断と対話は人」を根拠とする。(c) は出典のない本プロダクト独自の追加。ツールごとにリスク low/medium/high を付けて判定に使う（OpenAI のガイド）。タスクごとの自律度は L1〜L5（Feng ら）で持たせ、既定は L4（承認者）とする。
- **記憶は社員ごとの「記憶ストリーム」に貯める**。
  - レコード: 観察・反省・計画・タスク結果。各レコードに作成時刻、最終参照時刻、重要度（1〜10、LLM が採点）、埋め込みを持たせる。
  - 検索スコア: 新しさ（`0.995^経過時間`）＋重要度＋関連度（コサイン類似度）。各値を min-max で正規化して合計する。
  - 反省: 重要度の合計が閾値を超えたら、上位レベルの「反省」を生成する（Generative Agents）。
  - 簡易版: SDK の `AgentDefinition.memory`（MEMORY.md、先頭 200 行または 25KB まで読み込み）も使える。
- **タスク単位の文脈は 3 つで持つ**。`session_id`（同じタスクの続きは `resume`、分岐は `forkSession`）、進捗ノート（Anthropic の `claude-progress.txt` 相当）、1,000〜2,000 トークン程度の引き継ぎ要約。
- **可視化は SDK のメッセージストリームを状態機械に変換して作る**。
  - `system/init` → 出社
  - `assistant` の `tool_use` → 作業アニメーション
  - `system/task_started` / `task_progress` / `task_notification` → サブ作業の開始・進捗・終了
  - `result` → 完了
  - 人間待ちや承認待ちは吹き出しで示す（Pixel Agents）。行動は頭上の絵文字で示し、クリックで全文と記憶を表示する（Smallville）。
- **オフィスは木構造で表現する**（会社 → オフィス(JP/KH) → 部屋 → 机 → 物）。Smallville が環境を「エリアと物の木構造」で表したのに倣う。
- **AI社員は人間の社員と同じ管理項目で運用する**。社員番号（固有 ID）、権限、報告ライン、評価指標、入社・評価・退職のライフサイクルを持たせる。操作履歴（監査ログ）も残す。これは日本の事例と AI事業者ガイドライン（第1.2版）が求める「権限設定・人間の判断の介在・操作履歴確認」に対応する。
- **コストを可視化する**。`result.total_cost_usd` と `modelUsage` をタスクと社員ごとに集計し、ダッシュボードに出す。マルチエージェントはトークン消費が多い（Anthropic）。

## 2. Anthropic の設計指針

- **Building effective agents（2024-12-19）**
  - ワークフロー（コードで経路を決める）とエージェント（LLM が自分で進め方を決める）を区別する。
  - パターン: prompt chaining / routing / parallelization / orchestrator-workers / evaluator-optimizer / autonomous agents。
  - orchestrator-workers は "well-suited for complex tasks where you can't predict the subtasks needed"。
  - evaluator-optimizer は "particularly effective when we have clear evaluation criteria"。
  - 原則は 3 つ: 設計を単純に保つ、計画の過程を見せる、ツールの説明とテストを丁寧に作る（ACI）。
  - 人間のチェックポイントと、停止条件（最大反復回数）を設けることを推奨している。
  - https://www.anthropic.com/engineering/building-effective-agents
- **How we built our multi-agent research system（2025-06-13）**
  - リードエージェントが計画を立て、サブエージェントを並列（3〜5）に起動する。
  - 委譲するときは目的・出力形式・ツールの指針・タスク境界を明示する。
  - 労力はクエリの複雑さに合わせる（単純な事実確認は 1 エージェントで 3〜10 回のツール呼び出し）。
  - 計画は外部メモリに保存する（200k トークンを超えると打ち切られるため）。
  - 評価には LLM-as-judge（0.0〜1.0 のスコア）を使う。
  - BrowseComp では、性能のばらつきの 80% がトークン使用量で説明できた。
  - https://www.anthropic.com/engineering/multi-agent-research-system
- **Effective context engineering for AI agents（2025-09-29）**
  - 長期タスク向けの手法: compaction、構造化ノート（エージェントの外部メモリ）、サブエージェントが要約（1,000〜2,000 トークン）だけを返す構成、just-in-time な情報取得。
  - https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- **Effective harnesses for long-running agents（2025-11-26）**
  - 初回だけ initializer エージェントが環境を準備し、以降のセッションは少しずつ前進させる。
  - 進捗は `claude-progress.txt`、機能一覧は JSON（`passes` フラグ付き）、加えて git コミットで管理する。
  - 1 セッションで扱う機能は 1 つ。
  - https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents

## 3. Claude Agent SDK（TypeScript）API の確認結果

npm の `@anthropic-ai/claude-agent-sdk@0.3.317`（2026-11-03 時点の latest）の `sdk.d.ts` を読み、公式ドキュメントと照合した。peerDependencies は `zod ^4.0.0`、`@modelcontextprotocol/sdk ^1.29.0`、`@anthropic-ai/sdk >=0.93.0`。
ドキュメント: https://code.claude.com/docs/en/agent-sdk/typescript ・ /custom-tools ・ /subagents ・ https://github.com/anthropics/claude-agent-sdk-typescript

- **query**: `query({ prompt: string | AsyncIterable<SDKUserMessage>, options?: Options }): Query`
  - `Query` は `AsyncGenerator<SDKMessage>` で、`interrupt()` / `setPermissionMode()` / `setModel()` などのメソッドを持つ。
- **Options（主なもの）**
  - 実行環境: `cwd`、`additionalDirectories`、`env`（TS では環境変数を置き換えるため `...process.env` を展開して渡す）
  - モデル: `model`、`fallbackModel`、`effort`
  - システムプロンプト: `systemPrompt`。形は `string`、`string[]`、`{type:'custom', prompt}`、`{type:'preset', preset:'claude_code', append?, excludeDynamicSections?}` のいずれか。
  - ツール: `tools`（`string[]` または `{type:'preset',preset:'claude_code'}`。利用可能性を制御）、`allowedTools`（自動承認するだけで、利用範囲は制限しない）、`disallowedTools`
  - 権限: `permissionMode`（`'default'|'acceptEdits'|'bypassPermissions'|'plan'|'dontAsk'|'auto'`）、`canUseTool(toolName, input, {signal,...}) => {behavior:'allow',updatedInput?} | {behavior:'deny',message}`
  - 拡張: `mcpServers`、`agents: Record<string, AgentDefinition>`、`hooks`
  - 上限: `maxTurns`、`maxBudgetUsd`
  - 出力: `outputFormat: {type:'json_schema', schema}`、`includePartialMessages`
  - セッション: `resume`、`forkSession`、`continue`、`persistSession`（既定 true、`~/.claude/projects/` に保存）、`settingSources`（`[]` で user/project/local の設定を読まない）
  - 中断: `abortController`
- **AgentDefinition**
  - 必須: `description`、`prompt`
  - 任意: `tools`、`disallowedTools`、`model`（`'opus'|'sonnet'|'haiku'|'inherit'|ID`）、`mcpServers`、`skills`、`maxTurns`、`memory`（`'user'|'project'|'local'`）、`background`、`effort`、`permissionMode`
  - Agent ツールで呼び出す。init メッセージの tools 一覧では "Task" と表示される。
- **主なメッセージ型**
  - `{type:'system', subtype:'init', session_id, cwd, tools, mcp_servers, model, permissionMode}`
  - `{type:'assistant', message: BetaMessage, parent_tool_use_id, session_id}`: 本文は `message.message.content` にある text / tool_use ブロック。
  - `{type:'result', subtype:'success', result: string, structured_output?, session_id, total_cost_usd, usage, modelUsage, num_turns, is_error}`
  - エラー時の result は `subtype: 'error_max_turns'|'error_during_execution'|'error_max_budget_usd'|'error_max_structured_output_retries'` で、`errors: string[]` を持つ。単発の `query()` はエラーの result を流した後に例外を投げる。
  - サブエージェント: メッセージに `parent_tool_use_id` が付く。進捗は `system` の `task_started` / `task_progress` / `task_notification`（`status: completed|failed|stopped`）で届く。
- **カスタムツールの定義**: `tool(name, description, zodRawShape, async (args, extra) => CallToolResult, { annotations?, alwaysLoad? }?)`
  - 結果は `{ content: [{type:'text', text}], isError?, structuredContent? }`。
  - サーバーは `createSdkMcpServer({ name, version?, instructions?, tools?, alwaysLoad?, timeout? })` で作り、`mcpServers: { company: server }` に渡す。
  - ツール名は `mcp__company__<tool>`。`allowedTools` では `mcp__company__*` も使える。

```ts
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
const requestHuman = tool("request_human", "人間にしか出来ないタスクを登録する",
  { title: z.string(), reason: z.enum(["approval", "signature", "onsite", "relationship", "payment"]) },
  async (a) => ({ content: [{ type: "text", text: `queued: ${a.title}` }] }));
const company = createSdkMcpServer({ name: "company", version: "1.0.0", tools: [requestHuman] });
for await (const m of query({ prompt, options: { systemPrompt: persona, cwd, mcpServers: { company },
  allowedTools: ["mcp__company__request_human"], permissionMode: "dontAsk", maxTurns: 20 } })) {
  if (m.type === "result" && m.subtype === "success") save(m.session_id, m.result, m.total_cost_usd);
}
```

## 4. マルチエージェント「会社」フレームワークの役割定義

| フレームワーク | 役割定義 | 連携の仕方 |
|---|---|---|
| CrewAI | `role`（役割・専門）、`goal`（個人の目的）、`backstory`（文脈・性格）、`tools`、`llm`、`memory`、`allow_delegation` | sequential（前タスクの出力を次の文脈に渡す）、または hierarchical（`manager_llm` / `manager_agent` が計画・委譲・検証を行う） |
| MetaGPT（ICLR 2024） | 社員は PM / Architect / Project Manager / Engineer / QA Engineer の 5 役割。各役割に name・profile・goal・constraints を持たせる | 「Code = SOP(Team)」。会話ではなく文書や図で受け渡す。共有メッセージプールを購読し、自分の役割に関係する情報だけを受け取る。生成したコードを実行して修正する（最大 3 回） |
| ChatDev（ACL 2024） | "Virtual Software Company"。CEO、CTO、Programmer などの役割を持つ | chat chain で設計・コーディング・テスト・文書化を進める。2.0 の Web コンソールではログと中間成果物を見ながら人がフィードバックできる |
| AutoGen | `AssistantAgent(name, model_client, system_message, tools)` | `UserProxyAgent`、`HandoffTermination` で人間に制御を戻す。現在は maintenance mode で、新規利用者には Microsoft Agent Framework を案内している |
| OpenAI Swarm | Agent = `name` + `instructions` + `functions`（+ `context_variables`） | 関数が Agent を返すと handoff になる。現在は OpenAI Agents SDK に置き換えられた。ガイドでは manager パターン（agents as tools）と分散パターン（handoff）を区別している |

まとめると、各フレームワークのペルソナは「役割＋目的＋背景（性格）＋ツール（＋制約・モデル）」で共通している。違いは連携の仕方で、文書による受け渡し（MetaGPT）、管理者による委譲（CrewAI の hierarchical、OpenAI の manager）、制御の引き渡し（Swarm の handoff）がある。

出典: https://docs.crewai.com/en/concepts/agents ・ https://docs.crewai.com/en/concepts/processes ・ https://github.com/FoundationAgents/MetaGPT ・ https://arxiv.org/abs/2308.00352 ・ https://github.com/OpenBMB/ChatDev ・ https://arxiv.org/abs/2307.07924 ・ https://github.com/microsoft/autogen ・ https://github.com/openai/swarm ・ https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf

## 5. エージェントの可視化と記憶設計

- **Generative Agents / Smallville（Park ら、UIST '23）** https://arxiv.org/abs/2304.03442
  - 25 体のエージェントが暮らす町。各エージェントはシンプルなスプライトで、行動は頭上の吹き出しに絵文字で表示される。クリックすると行動の全文が見られる。
  - 記憶ストリームには経験を自然言語で全件記録する。
  - 検索スコアは次の 3 つを min-max で正規化し、重み 1 で合計する。
    - recency: 最終参照からのゲーム内経過時間に対する指数減衰（係数 0.995）
    - importance: LLM が 1〜10 で採点（部屋の掃除 = 2、デートに誘う = 8）
    - relevance: 埋め込みのコサイン類似度
  - 反省: 直近の重要度の合計が 150 を超えると生成する（1 日 2〜3 回程度）。直近 100 件から「最も重要な問い 3 つ」を作り、それを手がかりに洞察をまとめる。
  - 計画: 1 日の概要から 1 時間単位、さらに 5〜15 分単位へ再帰的に分解し、記憶ストリームに保存する。
- **a16z AI Town** https://github.com/a16z-infra/ai-town
  - "a virtual town where AI characters live, chat and socialize"。
  - バックエンドは Convex（ゲームエンジン・DB・ベクトル検索）、描画は PixiJS。キャラクターは `data/characters.ts` に定義する。
  - 記憶は埋め込みで検索する。MIT ライセンス。Generative Agents に着想を得ている。
- **Claude Code をオフィスとして見せる OSS**
  - Pixel Agents（https://github.com/pablodelucca/pixel-agents）
    - hooks（予備として JSONL トランスクリプトの監視）でエージェントの状態を取得する。
    - 状態に応じて書く・読む・コマンド実行のアニメーションを出し、入力待ちや承認待ちは吹き出しで示す。
    - サブエージェントは別キャラクターとして表示する。
    - レイアウトエディタがあり、配置を JSON で入出力できる。
  - claude-office（https://github.com/paulrobello/claude-office）
    - メインエージェントを「ボス」、サブエージェントを「社員」として描く。
    - hooks（`pre_tool_use`、`subagent_start`/`stop`、`permission_request`、`context_compaction` など）を FastAPI に送る。
    - ホワイトボードで todo やカンバンを表示する。コンテキストの量をゴミ箱の紙で表し、compaction をボスが踏み潰す演出がある。
- **その他の記憶設計**
  - MemGPT: OS の階層メモリに倣い、コンテキスト内と外部のメモリの間でデータを出し入れする。https://arxiv.org/abs/2310.08560
  - SDK のサブエージェント memory: `.claude/agent-memory/<agent>/MEMORY.md` を先頭 200 行または 25KB まで自動で読み込み、エージェント自身が整理する。https://code.claude.com/docs/en/sub-agents
- **本プロダクトでの記憶の作り**
  - 社員ごとに `memories(employee_id, task_id, kind[observation|reflection|plan|result], text, importance, embedding, created_at, last_accessed_at)` を持つ。
  - タスク開始時に上位 k 件を systemPrompt に注入する。
  - タスク完了時に要約（結果・学び）を書き戻す。
  - 重要度の合計が閾値に達したら反省を生成する。

## 6. 人間へのタスク振り分け（Human-in-the-loop）

- **OpenAI「A practical guide to building agents」**: 人間が介入すべき主なきっかけは 2 つ。
  - 失敗の閾値を超えたとき（再試行や行動の回数に上限を設け、超えたらエスカレーションする）。
  - 高リスクな行動（"sensitive, irreversible, or have high stakes"。例: 注文の取消、高額の返金、支払い）。
  - ツールごとのリスク評価（low/medium/high。基準は読み取りか書き込みか、元に戻せるか、必要な権限、金銭的な影響）を、一時停止や人間へのエスカレーションのきっかけに使う。
- **Levels of Autonomy for AI Agents（Feng, McDonald, Zhang, 2025）**: 人間の役割で自律度を 5 段階に分ける。operator → collaborator → consultant → approver → observer。自律度は能力とは別に設計で決めるものとし、「autonomy certificate」も提案している。https://arxiv.org/abs/2506.12469
- **AutoGen**
  - 実行中に `UserProxyAgent` で人間を待つ方式と、実行を終了して次の run に人間のフィードバックを渡す方式（`max_turns`、`HandoffTermination` など）がある。
  - 前者は「チームの実行をブロックし、保存・再開できない不安定な状態になる」ため、承認クリックのような短いやり取りに限るべきとしている。
  - https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/human-in-the-loop.html
- **Anthropic**: エージェントは、情報や判断が必要なときと行き詰まったときに人間へ戻るべきとしている。チェックポイントで一時停止する設計を推奨している。
- **AI事業者ガイドライン（第1.2版、総務省・経産省、2026-03-31）**: AIエージェントとフィジカルAIに関して次の点を追記した。
  - 人間の判断を介在させる仕組みが重要であること
  - 適切な権限設定
  - 連携するツールやシステムの制限
  - 定期的な操作履歴の確認と報告
  - 重大な影響が出うる出力は、人間の判断を介在させる仕組みに基づいて判断すること
  - https://www.meti.go.jp/shingikai/mono_info_service/ai_shakai_jisso/20260331_report.html ・ https://www.soumu.go.jp/main_content/001059300.pdf
- **物理作業の外部化（参考）**: AI エージェントが現地での作業のために人間を雇う「RentAHuman.ai」が 2026 年 2 月に登場したと報じられている。統治・同意・責任の所在が懸念点として挙がっている。https://builtin.com/articles/what-is-rentahuman

## 7. 日本の「AI社員」事例

- **ペンシル（2025-03-27 発表）**
  - 2025-04-01 の入社式に、新卒 5 名と並んで AI社員「ノナ」「ヘキサ」が参加した。
  - 1 年前に入社した第 1 号「ペンタ」は、自社知識を学習して人間社員の業務に伴走している。年間 550 時間分の「名もなき仕事」（調べもの、タスク管理など）を担うことを目指す。
  - 名前とキャラクター（妖怪モチーフ）を持たせている。
  - https://www.pencil.co.jp/release/20250327_01/
- **CS Technologies（2026-10）**
  - AIエージェントを組織図上の役割を持つ「AI社員」として各部門に置いている。
  - 「AI社員一人ひとりに担当業務・権限・報告ライン・評価指標を定め、人の社員と同じように管理」する。
  - 指示は「AI司令塔」が振り分け、PM 役の AI が計画を立てる。人は「指示」と要所の「承認」に集中し、例外は人へ戻す。
  - https://ascii.jp/elem/000/004/441/4441915/
- **キャスター（2026-04）**
  - 「AI社員を採用する」を掲げるサービス。窓口は 1 人の AI社員で、背後では職種別のサブエージェントが連携する。
  - Slack や Teams から指示を出す。アシスタントモードとプロフェッショナルモードがある。
  - https://hrog.net/news/134788/
- **GENAI のブログ（2026-10-10、自社サービス紹介を含む）**
  - AIエージェントを社員のように管理する考え方を紹介している。
  - 固有 ID（社員番号に相当）で「どの AI が、いつ、何をしたか」を追跡し、権限を個別に設定する。入社・評価・退職に近い管理サイクルを回す。
  - 判断と対話は人が担い、重要な場面では人が最終確認する。
  - https://genai-ai.co.jp/ai-kanri/blog/cc-ai-employee-concept/
- **AI社員の定義**: SHIFT AI の解説（2026-09-07 更新）は、AIエージェントを「技術・機能」、AI社員をそれに「役割や名前を持たせた運用形態」と区別している。https://shift-ai.co.jp/blog/61739/
