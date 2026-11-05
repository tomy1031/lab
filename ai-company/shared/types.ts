// サーバーとクライアント（3D の空間・画面）で共有する型。
// 会社 = 2 つのオフィス（日本・カンボジア）に、人間・AI社員・ネクマックス（統括）がいる。
// 人間がゴールを伝える → ネクマックス（Claude Code）がタスクに分解 → 足りない職種は AI社員を「採用」→
// AI社員と人間で分担 → タスクのたびに担当者のコンテキスト（記憶）がたまる。

/** 拠点：東京・大阪（日本）とプノンペン（カンボジア） */
export type OfficeId = 'tokyo' | 'osaka' | 'phnompenh'
export type Country = 'jp' | 'kh'

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

/** awaiting_approval = 承認する人の「始める」を待っている（ほかの人が出したゴール） */
export type GoalStatus = 'awaiting_approval' | 'planning' | 'running' | 'waiting_human' | 'done' | 'failed' | 'cancelled'

/** 承認の記録（ゴール・AI への話しかけ） */
export interface Approval {
  state: 'pending' | 'approved' | 'declined'
  by?: string
  at?: string
  /** 自動承認で通ったとき */
  auto?: boolean
  note?: string
}

/**
 * 承認の関所：ゴールや AI への話しかけ（Claude を動かすもの）は、承認する人（1 人）が「始める」を押してから動く。
 * manual = 毎回手で承認（基本）/ auto = 決めたルールに合えば自動で承認（アーティファクト版では、承認する人がページを開いている間だけ）
 */
export interface GateSettings {
  mode: 'manual' | 'auto'
  /** 承認する人（member id） */
  approverId: string | null
  /** 自動承認の対象：all = 全員 / それ以外は member id の一覧 */
  autoFrom: 'all' | string[]
  /** 自動承認は 1 日にこの件数まで（使いすぎを防ぐ） */
  dailyLimit: number
}

export const DEFAULT_GATE: GateSettings = { mode: 'manual', approverId: null, autoFrom: 'all', dailyLimit: 5 }

export interface Goal {
  id: string
  title: string
  description: string
  createdBy: string
  createdAt: string
  status: GoalStatus
  /** ほかの人が出したゴールの承認（承認する人が自分で出したゴールには無い） */
  approval?: Approval
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
  /** なぜこの人に任せたか（拠点・スキル・これまでの仕事）。人間へのお願いを分かりやすくする */
  assignReason?: string
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
  /** ほかの人から AI への話しかけで、承認が要るもの（承認されると AI が答える） */
  approval?: Approval
}

/**
 * やることストック：マイクで話した（または書いた）ことを、ネクマックスが用件ごとに分けて短くまとめたもの。本人だけが見る。
 * goal = AI社員と進める仕事（ネクマックスに任せる）/ self = 自分でやること / memo = 覚えておくこと
 */
export type StockKind = 'goal' | 'self' | 'memo'
/** organizing 整理中 / ready 整理済み / later あとで / sent ネクマックスに任せた / done やった・記憶に残した / archived 消した・まとめた */
export type StockStatus = 'organizing' | 'ready' | 'later' | 'sent' | 'done' | 'archived'

export interface StockItem {
  id: string
  owner: string
  at: string
  updatedAt: string
  /** 話した（書いた）ままの言葉 */
  raw: string
  /** 20 字くらいの題名（〜する） */
  title: string
  /** 40 字くらいの一言 */
  summary?: string
  kind: StockKind
  /** 1 = 急ぎ / 2 = ふつう / 3 = いつか */
  priority: 1 | 2 | 3
  status: StockStatus
  goalId?: string
  /** 同じ用件のストックにまとめたとき、まとめ先 */
  mergedInto?: string
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
  /** 英語の名前（看板の小さい文字） */
  nameEn: string
  city: string
  country: Country
  /** IANA タイムゾーン */
  tz: string
  desks: number
}

export interface EngineInfo {
  /** claude = Claude Code（Claude Agent SDK）で動く / sim = オフラインのシミュレーション / artifact = claude.ai のアーティファクトの中で、承認する人のアカウントで動く */
  mode: 'claude' | 'sim' | 'artifact'
  detail: string
}

/** 画面に出す、承認の関所のいま */
export interface GateInfo extends GateSettings {
  /** 今日、自動承認で通した件数 */
  autoToday: number
  /** アーティファクト版：承認する人のページがいま開いていて、AI を動かせるか */
  runnerOnline?: boolean
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
  /** 自分のやることストック（新しい順に最大 200） */
  stock: StockItem[]
  /** 承認の関所 */
  gate: GateInfo
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
  /** やることストックの追加・更新（持ち主の画面にだけ届く） */
  | { t: 'stock'; item: StockItem }
  /** Claude が作業中に書いている途中の文（ライブ表示用） */
  | { t: 'stream'; memberId: string; taskId: string; text: string }
  /** 承認の関所の設定・状態が変わった */
  | { t: 'gate'; gate: GateInfo }
  /** 頭脳（エンジン）が変わった */
  | { t: 'engine'; engine: EngineInfo }

/**
 * 拠点の一覧。大阪本社の 0 番・1 番の席は「社長席」：松井社長とネクマックス（社長の分身として働く統括 AI）が並んで座る。
 * 東京オフィスは小さめ（いまは人間 1 人）。
 */
export const OFFICES: OfficeInfo[] = [
  { id: 'osaka', name: '大阪本社', nameEn: 'Osaka HQ', city: 'Osaka', country: 'jp', tz: 'Asia/Tokyo', desks: 12 },
  { id: 'tokyo', name: '東京オフィス', nameEn: 'Tokyo Office', city: 'Tokyo', country: 'jp', tz: 'Asia/Tokyo', desks: 6 },
  { id: 'phnompenh', name: 'プノンペンオフィス', nameEn: 'Phnom Penh Office', city: 'Phnom Penh', country: 'kh', tz: 'Asia/Phnom_Penh', desks: 12 },
]

export const officeInfo = (id: OfficeId): OfficeInfo => OFFICES.find((o) => o.id === id) ?? OFFICES[0]
export const countryOf = (id: OfficeId): Country => officeInfo(id).country
/** 古いデータ（jp / kh）を今の拠点に読み替える */
export function normalizeOffice(v: unknown): OfficeId {
  if (v === 'tokyo' || v === 'osaka' || v === 'phnompenh') return v
  if (v === 'kh') return 'phnompenh'
  return 'osaka'
}

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
  awaiting_approval: '承認待ち',
  planning: '分解中',
  running: '進行中',
  waiting_human: '人間の対応待ち',
  done: '完了',
  failed: '失敗',
  cancelled: '中止',
}
