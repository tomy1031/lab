// 頭脳（エンジン）の約束。Claude Code（Claude Agent SDK）版と、オフラインで動くシミュレーション版がある。
import type { EngineInfo, Goal, Member, OfficeId, Task } from '../../shared/types'

export interface PlanTask {
  key: string
  title: string
  description: string
  skills: string[]
  requiresHuman: boolean
  humanReason?: string
  office?: OfficeId
  dependsOn: string[]
  /** 担当の希望（既存メンバーの id か、hires[].key） */
  assignee?: string
}

export interface HireSpec {
  key: string
  role: string
  name?: string
  office: OfficeId
  skills: string[]
  languages: string[]
  persona: string
  reason: string
}

export interface Plan {
  summary: string
  tasks: PlanTask[]
  hires: HireSpec[]
}

/** プロンプトに入れる、人物ごとのコンテキスト */
export interface MemberContext {
  member: Member
  /** 重要度と新しさで選んだ記憶（古い順） */
  memories: string[]
}

export interface PlanInput {
  goal: Goal
  roster: MemberContext[]
  requester: Member | undefined
}

export interface AgentToolbox {
  /** 同僚（AI社員・人間・ネクマックス）に相談する。AI 同士ならその場で答えが返る。人間には質問を残す */
  askColleague(nameOrId: string, question: string): Promise<string>
  /** 進み具合をひとこと共有（3D 空間の吹き出しになる） */
  postUpdate(text: string): void
}

export interface RunTaskInput {
  goal: Goal
  task: Task
  me: MemberContext
  colleagues: Member[]
  /** 先に終わったタスクの成果（タイトル → 成果） */
  inputs: { title: string; by: string; output: string }[]
  workdir: string
  tools: AgentToolbox
  onText(text: string): void
  signal: AbortSignal
}

export interface RunTaskResult {
  output: string
  /** 担当者の記憶に残すひとこと */
  memoryNote: string
}

export interface ConsultInput {
  goal: Goal | undefined
  from: Member
  to: MemberContext
  question: string
}

export interface ReportInput {
  goal: Goal
  tasks: (Task & { assigneeName: string })[]
}

export interface Engine {
  readonly info: EngineInfo
  plan(input: PlanInput): Promise<Plan>
  runTask(input: RunTaskInput): Promise<RunTaskResult>
  consult(input: ConsultInput): Promise<string>
  report(input: ReportInput): Promise<string>
}
