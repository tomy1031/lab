// サーバーとクライアント（3D の空間・画面）で共有する型。
// 会社 = 2 つのオフィス（日本・カンボジア）に、人間・AI社員・ネクマックス（統括）がいる。
// 人間がゴールを伝える → ネクマックス（Claude Code）がタスクに分解 → 足りない職種は AI社員を「採用」→
// AI社員と人間で分担 → タスクのたびに担当者のコンテキスト（記憶）がたまる。

export type OfficeId = 'jp' | 'kh'

/** human = 登録された人間 / agent = 採用された AI社員 / nexmax = 会社の統括 AI（ネクマックス） */
export type MemberKind = 'human' | 'agent' | 'nexmax'

/** idle 待機 / thinking 考え中 / working 作業中 / talking 会話中 / waiting 人間や他のタスク待ち / away 離席 / offline ログアウト中（人間） */
export type MemberStatus = 'idle' | 'thinking' | 'working' | 'talking' | 'waiting' | 'away' | 'offline'

export type Accessory = 'none' | 'glasses' | 'headset' | 'cap' | 'ribbon' | 'beret' | 'flower' | 'bowtie'

/** ちびキャラの見た目（色は #rrggbb） */
export interface Look {
  /** 服（人間）・ボディ（AI社員）の色 */
  body: string
  /** 差し色（ネクタイ・ライン・アンテナの玉など） */
  accent: string
  /** 髪の色（人間） */
  hair?: string
  /** 肌の色（人間） */
  skin?: string
  /** 髪型・頭の形などの種類（0..7） */
  style: number
  accessory?: Accessory
  /** nexmax のとき：protagonist = 初号機（日本）/ production = 量産型（カンボジア） */
  nexmaxVariant?: 'protagonist' | 'production'
  serial?: number
}

export interface Member {
  id: string
  kind: MemberKind
  name: string
  /** 職種（例：リサーチャー、営業、クメール語翻訳） */
  role: string
  office: OfficeId
  skills: string[]
  /** ja / km / en など */
  languages: string[]
  /** AI社員の人物設定（システムプロンプトの元）。人間は自己紹介 */
  persona?: string
  look: Look
  /** オフィス内の席の番号（0 から）。nexmax は -1（歩き回る） */
  deskIndex: number
  status: MemberStatus
  statusText?: string
  currentTaskId?: string | null
  hiredAt: string
  /** 採用した人（member id）か 'system' */
  hiredBy?: string
  hireReason?: string
  /** ログインできる人間のログイン名（パスワードはサーバーだけが持つ） */
  login?: string
  isAdmin?: boolean
  /** 人間がいまログインしているか */
  online?: boolean
  stats: { tasksDone: number; messages: number }
}

export type MemoryKind = 'task' | 'feedback' | 'note' | 'reflection' | 'conversation'

/** 人物ごとに積み上がるコンテキスト（記憶） */
export interface MemoryEntry {
  id: string
  memberId: string
  at: string
  kind: MemoryKind
  text: string
  goalId?: string
  taskId?: string
  /** 1..10（大きいほどプロンプトに残りやすい） */
  importance: number
}

export type GoalStatus = 'planning' | 'running' | 'waiting_human' | 'done' | 'failed' | 'cancelled'

export interface Goal {
  id: string
  title: string
  description: string
  createdBy: string
  createdAt: string
  status: GoalStatus
  /** 分解の方針（ネクマックスの説明） */
  planSummary?: string
  /** 完了報告 */
  report?: string
  taskIds: string[]
  finishedAt?: string
}

export type TaskStatus = 'todo' | 'blocked' | 'in_progress' | 'waiting_human' | 'review' | 'done' | 'failed' | 'cancelled'

export interface Task {
  id: string
  goalId: string
  /** 計画の中での短い名前（依存関係の参照用） */
  key: string
  title: string
  description: string
  skills: string[]
  /** 人間にしかできない仕事か */
  requiresHuman: boolean
  /** なぜ人間か（対面・署名・現地・承認・支払いなど） */
  humanReason?: string
  office?: OfficeId
  assigneeId?: string | null
  /** 先に終わっている必要がある Task.id */
  dependsOn: string[]
  status: TaskStatus
  /** 成果（AI社員の出力 or 人間の完了メモ） */
  output?: string
  /** 作業フォルダに作られたファイル（ゴールのフォルダからの相対パス） */
  files?: string[]
  order: number
  startedAt?: string
  finishedAt?: string
}

export type MessageKind = 'assign' | 'chat' | 'question' | 'answer' | 'handoff' | 'report' | 'review' | 'hire' | 'system'

/** 社員どうしのやり取り（3D 空間では光の粒が飛ぶ） */
export interface Message {
  id: string
  at: string
  fromId: string
  /** null = 全体へ */
  toId: string | null
  kind: MessageKind
  text: string
  goalId?: string
  taskId?: string
  /** 返事のとき、元のメッセージの id */
  replyTo?: string
}

export interface Activity {
  id: string
  at: string
  text: string
  level: 'info' | 'success' | 'warn' | 'hire'
  memberId?: string
  goalId?: string
}

export interface OfficeInfo {
  id: OfficeId
  name: string
  city: string
  /** IANA タイムゾーン */
  tz: string
  desks: number
}

export interface EngineInfo {
  /** claude = Claude Code（Claude Agent SDK）で動く / sim = オフラインのシミュレーション */
  mode: 'claude' | 'sim'
  detail: string
}

export interface Snapshot {
  me: Member | null
  offices: OfficeInfo[]
  members: Member[]
  goals: Goal[]
  tasks: Task[]
  messages: Message[]
  activities: Activity[]
  engine: EngineInfo
}

/** WebSocket：サーバー → クライアント */
export type ServerEvent =
  | { t: 'snapshot'; data: Snapshot }
  | { t: 'member'; member: Member }
  | { t: 'member.removed'; id: string }
  | { t: 'hired'; member: Member; reason: string; by: string }
  | { t: 'goal'; goal: Goal }
  | { t: 'task'; task: Task }
  | { t: 'message'; message: Message }
  | { t: 'activity'; activity: Activity }
  | { t: 'memory'; entry: MemoryEntry }
  /** Claude が作業中に書いている途中の文（ライブ表示用） */
  | { t: 'stream'; memberId: string; taskId: string; text: string }

export const OFFICES: OfficeInfo[] = [
  { id: 'jp', name: '大阪本社', city: 'Osaka', tz: 'Asia/Tokyo', desks: 12 },
  { id: 'kh', name: 'プノンペン オフィス', city: 'Phnom Penh', tz: 'Asia/Phnom_Penh', desks: 12 },
]

export const STATUS_LABEL: Record<MemberStatus, string> = {
  idle: '待機中',
  thinking: '考え中',
  working: '作業中',
  talking: '会話中',
  waiting: '待ち',
  away: '離席',
  offline: 'オフライン',
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: '未着手',
  blocked: '前の作業待ち',
  in_progress: '作業中',
  waiting_human: '人間の対応待ち',
  review: 'レビュー中',
  done: '完了',
  failed: '失敗',
  cancelled: '中止',
}

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  planning: '分解中',
  running: '進行中',
  waiting_human: '人間の対応待ち',
  done: '完了',
  failed: '失敗',
  cancelled: '中止',
}
