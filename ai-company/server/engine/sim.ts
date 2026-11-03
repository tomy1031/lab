// オフラインのシミュレーション。Claude を呼ばずに、それらしい分解・やり取り・成果を作る（デモ・画面の確認用）。
// 同じ流れ（分解 → 採用 → 分担 → 相談 → 記憶 → 報告）を通るので、3D 空間の見え方はほぼ本番と同じ。
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EngineInfo } from '../../shared/types'
import { pick, sleep } from '../util'
import type { ConsultInput, Engine, HireSpec, Plan, PlanInput, PlanTask, ReportInput, RunTaskInput, RunTaskResult } from './types'

type Tpl = { match: RegExp; tasks: Omit<PlanTask, 'assignee'>[]; hires: HireSpec[] }

const H = (key: string, role: string, office: 'jp' | 'kh', skills: string[], languages: string[], persona: string, reason: string): HireSpec => ({
  key,
  role,
  office,
  skills,
  languages,
  persona,
  reason,
})

const TEMPLATES: Tpl[] = [
  {
    match: /イベント|セミナー|フォーラム|説明会|展示|交流会/,
    hires: [
      H('h_plan', 'イベントプランナー', 'jp', ['企画', '進行台本', 'スケジュール'], ['ja', 'en'], '段取り命。チェックリストで抜け漏れを潰す', 'イベント企画の専任がいないため'),
      H('h_tr', 'クメール語翻訳', 'kh', ['翻訳', 'クメール語', '現地文化'], ['km', 'ja', 'en'], 'やわらかい言い回しが得意。現地の慣習も添える', '告知をクメール語でも出すため'),
      H('h_pr', '広報ライター', 'jp', ['告知文', 'SNS', 'コピー'], ['ja'], '短く刺さる言葉を探す', '集客の告知文が必要なため'),
    ],
    tasks: [
      { key: 'research', title: '過去の類似イベントと参加者像の調査', description: '類似イベントの規模・形式・集客方法を調べ、参加者像を 1 枚にまとめる', skills: ['調査'], requiresHuman: false, dependsOn: [] },
      { key: 'plan', title: '企画書と当日の進行台本', description: '目的・対象・プログラム・役割分担を企画書に、当日の進行を台本にする', skills: ['企画', '進行台本'], requiresHuman: false, dependsOn: ['research'] },
      { key: 'venue', title: '会場の下見と仮押さえ', description: '候補会場を実際に見て、収容人数・設備を確認し仮押さえする', skills: ['現地対応'], requiresHuman: true, humanReason: '現地での下見と、会場との契約が必要', office: 'kh', dependsOn: ['plan'] },
      { key: 'copy', title: '告知文（日本語）', description: 'Web・SNS 用の告知文を 3 パターン作る', skills: ['告知文', 'SNS'], requiresHuman: false, dependsOn: ['plan'] },
      { key: 'km', title: '告知文のクメール語版', description: '告知文をクメール語に訳し、現地向けの言い回しに整える', skills: ['翻訳', 'クメール語'], requiresHuman: false, office: 'kh', dependsOn: ['copy'] },
      { key: 'approve', title: '予算と最終案の承認', description: '企画・会場・告知をまとめて確認し、予算を承認する', skills: ['意思決定'], requiresHuman: true, humanReason: '予算の最終承認は人間の責任', dependsOn: ['venue', 'km'] },
    ],
  },
  {
    match: /採用|求人|人材|インターン|面接/,
    hires: [
      H('h_hr', '採用コーディネーター', 'kh', ['採用', '求人票', '面接設計'], ['km', 'en', 'ja'], '候補者の良さを見つけるのが得意', '採用の段取りを回す専任がいないため'),
      H('h_wr', '広報ライター', 'jp', ['求人原稿', 'コピー', 'SNS'], ['ja'], '会社の魅力を具体的な言葉にする', '求人原稿を書くため'),
    ],
    tasks: [
      { key: 'persona', title: '求める人物像の整理', description: '必須・歓迎スキル、カルチャー、待遇の前提を 1 枚にまとめる', skills: ['採用'], requiresHuman: false, dependsOn: [] },
      { key: 'jd', title: '求人票（日本語・英語）', description: '人物像をもとに求人票を作る', skills: ['求人原稿'], requiresHuman: false, dependsOn: ['persona'] },
      { key: 'school', title: '大学・学校への訪問と紹介依頼', description: '提携校を訪問し、学生の紹介を依頼する', skills: ['現地対応'], requiresHuman: true, humanReason: '対面での関係づくりが必要', office: 'kh', dependsOn: ['jd'] },
      { key: 'interview', title: '面接の質問と評価シート', description: '面接の質問と評価基準を作る', skills: ['面接設計'], requiresHuman: false, dependsOn: ['persona'] },
      { key: 'decide', title: '面接と採否の決定', description: '面接を行い、採否を決める', skills: ['意思決定'], requiresHuman: true, humanReason: '採否の判断と責任は人間', dependsOn: ['school', 'interview'] },
    ],
  },
  {
    match: /サイト|Web|ウェブ|LP|アプリ|システム|開発|ツール/i,
    hires: [
      H('h_pm', 'プロジェクトマネージャー', 'jp', ['要件定義', 'スケジュール', 'PM'], ['ja', 'en'], '曖昧なことを質問で具体にする', '要件をまとめる担当が必要なため'),
      H('h_dev', 'Webエンジニア', 'kh', ['開発', 'HTML/CSS', 'TypeScript'], ['en', 'km', 'ja'], '小さく作ってすぐ見せる派', '実装を担当するため'),
      H('h_ds', 'UIデザイナー', 'jp', ['デザイン', 'UI', 'ワイヤーフレーム'], ['ja'], '余白と読みやすさにこだわる', '画面設計を担当するため'),
    ],
    tasks: [
      { key: 'req', title: '要件の整理', description: '目的・利用者・必要な機能・期限を要件書にする', skills: ['要件定義'], requiresHuman: false, dependsOn: [] },
      { key: 'hearing', title: 'お客様へのヒアリング', description: 'お客様と打ち合わせし、要件書の不明点を確認する', skills: ['顧客対応'], requiresHuman: true, humanReason: 'お客様との打ち合わせ（関係づくり）', dependsOn: ['req'] },
      { key: 'wire', title: '画面のワイヤーフレーム', description: '主要画面のワイヤーフレームと画面遷移を作る', skills: ['UI', 'デザイン'], requiresHuman: false, dependsOn: ['hearing'] },
      { key: 'build', title: '試作の実装', description: 'ワイヤーをもとに動く試作を作る', skills: ['開発'], requiresHuman: false, office: 'kh', dependsOn: ['wire'] },
      { key: 'estimate', title: '見積もりの承認と送付', description: '工数から見積もりを作り、承認して送付する', skills: ['意思決定'], requiresHuman: true, humanReason: '金額の最終判断と社外への送付', dependsOn: ['build'] },
    ],
  },
  {
    match: /営業|提案|顧客|販売|売上|商談|営業資料/,
    hires: [
      H('h_rs', 'マーケットリサーチャー', 'jp', ['調査', '市場分析', '競合分析'], ['ja', 'en'], '数字と出典を必ず添える', '市場と競合を調べるため'),
      H('h_sl', 'セールスライター', 'jp', ['提案書', 'コピー', '資料作成'], ['ja'], '相手の課題から書き始める', '提案資料を作るため'),
    ],
    tasks: [
      { key: 'market', title: '対象市場と競合の調査', description: '対象顧客の課題・市場規模・競合の提供価値を調べる', skills: ['調査', '市場分析'], requiresHuman: false, dependsOn: [] },
      { key: 'deck', title: '提案資料の作成', description: '課題 → 解決策 → 事例 → 費用感の流れで提案資料を作る', skills: ['提案書'], requiresHuman: false, dependsOn: ['market'] },
      { key: 'list', title: 'アプローチ先リストの作成', description: '優先度つきのアプローチ先リストを作る', skills: ['調査'], requiresHuman: false, dependsOn: ['market'] },
      { key: 'meet', title: '商談（訪問・オンライン）', description: '優先度の高い相手と商談する', skills: ['営業'], requiresHuman: true, humanReason: '顧客との信頼関係づくりは人間', dependsOn: ['deck', 'list'] },
    ],
  },
]

const GENERIC: Tpl = {
  match: /.*/,
  hires: [
    H('h_rs', 'リサーチャー', 'jp', ['調査', '分析', '要約'], ['ja', 'en'], '一次情報にあたり、出典を残す', '下調べを担当するため'),
    H('h_pl', 'プランナー', 'jp', ['企画', '資料作成', '段取り'], ['ja'], 'やることを小さく分けて並べる', '実行計画を作るため'),
    H('h_kh', '現地コーディネーター', 'kh', ['現地調整', 'クメール語', '翻訳'], ['km', 'en', 'ja'], 'カンボジア側の事情を先回りして伝える', 'カンボジア側の調整役として'),
  ],
  tasks: [
    { key: 'research', title: '現状と前提の調査', description: 'ゴールに関わる事実・制約・先行事例を調べる', skills: ['調査'], requiresHuman: false, dependsOn: [] },
    { key: 'plan', title: '実行計画の作成', description: '調査をもとに、手順・担当・期限を計画書にする', skills: ['企画'], requiresHuman: false, dependsOn: ['research'] },
    { key: 'local', title: 'カンボジア側の確認事項の整理', description: '現地で確認が要ることを洗い出し、クメール語の連絡文を用意する', skills: ['現地調整', '翻訳'], requiresHuman: false, office: 'kh', dependsOn: ['plan'] },
    { key: 'approve', title: '計画の承認', description: '計画を確認し、進めるかどうかを決める', skills: ['意思決定'], requiresHuman: true, humanReason: '最終の意思決定は人間', dependsOn: ['plan', 'local'] },
  ],
}

const UPDATES = ['資料を集めています', '構成を考え中…', 'たたき台ができました', '数字を確認しています', '言い回しを整えています', 'もう少しで完成です']
const QUESTIONS = ['前提の数字はこれで合っていますか？', '相手先の好みで気をつける点は？', 'この表現、現地で誤解されませんか？', '優先順位はどれが上ですか？']
const ANSWERS = ['その前提で大丈夫です。出典だけ添えてください', '丁寧すぎるくらいがちょうどいいです', '少し硬いので、やわらかい言い方にしましょう', 'まずは一番効果が大きいものからでお願いします']

export class SimEngine implements Engine {
  readonly info: EngineInfo = { mode: 'sim', detail: 'シミュレーション（Claude を呼ばないデモ）' }
  constructor(private readonly speed = Number(process.env.SIM_SPEED || 1)) {}

  private wait(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(new Error('中止'))
    return sleep(ms / this.speed)
  }

  async plan({ goal, roster, requester }: PlanInput): Promise<Plan> {
    await this.wait(2500)
    const text = `${goal.title} ${goal.description}`
    const tpl = TEMPLATES.find((t) => t.match.test(text)) ?? GENERIC
    const agents = roster.filter((c) => c.member.kind === 'agent').map((c) => c.member)
    const humans = roster.filter((c) => c.member.kind === 'human').map((c) => c.member)
    const hires: HireSpec[] = []
    const roleOwner = new Map<string, string>()
    for (const h of tpl.hires) {
      const existing = agents.find((a) => a.role === h.role)
      if (existing) roleOwner.set(h.key, existing.id)
      else {
        hires.push(h)
        roleOwner.set(h.key, h.key)
      }
    }
    const tasks: PlanTask[] = tpl.tasks.map((t) => {
      if (t.requiresHuman) {
        const office = t.office ?? 'jp'
        const human = humans.find((h) => h.office === office) ?? requester ?? humans[0]
        return { ...t, assignee: human?.id }
      }
      // スキルが一番合う採用枠へ
      let best = tpl.hires[0]
      let bestScore = -1
      for (const h of tpl.hires) {
        const s = t.skills.filter((sk) => h.skills.some((x) => x.includes(sk) || sk.includes(x))).length + (t.office && t.office === h.office ? 0.5 : 0)
        if (s > bestScore) {
          best = h
          bestScore = s
        }
      }
      return { ...t, assignee: roleOwner.get(best.key) }
    })
    return {
      summary: `「${goal.title}」を ${tasks.length} 個のタスクに分けました。人間にしかできない仕事（${tasks.filter((t) => t.requiresHuman).length} 件）は人間に、それ以外は AI社員が担当します。${hires.length ? `足りない職種は ${hires.map((h) => h.role).join('・')} を採用します。` : '今のメンバーで足ります。'}`,
      tasks,
      hires,
    }
  }

  async runTask({ goal, task, me, colleagues, inputs, workdir, tools, onText, signal }: RunTaskInput): Promise<RunTaskResult> {
    const steps = 3 + Math.floor(Math.random() * 3)
    for (let i = 0; i < steps; i++) {
      await this.wait(1800 + Math.random() * 2200, signal)
      if (i === 0 || Math.random() < 0.4) tools.postUpdate(pick(UPDATES))
      onText(`${pick(UPDATES)}\n`)
      if (i === 1 && colleagues.length && Math.random() < 0.8) {
        const others = colleagues.filter((c) => c.kind === 'agent' && c.id !== me.member.id)
        const to = others.length ? pick(others) : pick(colleagues)
        await tools.askColleague(to.id, pick(QUESTIONS))
      }
    }
    const output = `### ${task.title}
- 目的：${goal.title}
- 担当：${me.member.name}（${me.member.role}）
- 前提にした成果：${inputs.map((i) => i.title).join('、') || 'なし'}

**要点**
1. ${task.description}
2. 関係者への確認事項を 3 点にまとめました
3. 次の担当者がすぐ着手できるよう、たたき台をファイルに残しました

（シミュレーションの成果物です。Claude Code モードでは実際の調査・作成結果が入ります）`
    const file = `${task.key}.md`
    try {
      writeFileSync(join(workdir, file), `# ${task.title}\n\n${output}\n`)
    } catch {
      /* 作業フォルダが無くても続ける */
    }
    return { output, memoryNote: `「${task.title}」を担当。${pick(['相手は簡潔な資料を好む', '数字には出典を添えると通りやすい', '現地の言い回しはやわらかめが良い', '先に結論を書くと早く決まる'])}` }
  }

  async consult({ to, question }: ConsultInput): Promise<string> {
    await this.wait(1500)
    const mem = [...to.memories].reverse().find((m) => m.includes('完了'))
    const title = mem?.match(/「([^」]+)」/)?.[1]
    return `${pick(ANSWERS)}${title ? `（「${title}」のときもそうでした）` : ''}`
  }

  async report({ goal, tasks }: ReportInput): Promise<string> {
    await this.wait(1500)
    return `## 「${goal.title}」完了しました！\n\n- タスク ${tasks.length} 件（人間 ${tasks.filter((t) => t.requiresHuman).length} 件・AI ${tasks.filter((t) => !t.requiresHuman).length} 件）\n${tasks.map((t) => `- ${t.title}：${t.assigneeName}`).join('\n')}\n\n次の一手：成果物を確認して、次のゴールを教えてください。`
  }
}
