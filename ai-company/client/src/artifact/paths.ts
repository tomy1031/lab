// アーティファクト版のデータベースの置き場所と、読み書きのルール。
//
// members/<id>        社員。人間は本人が自分の文書（id = claude.ai の利用者 id）を書く。AI社員・ネクマックスは承認する人のページが書く
// goals/<id> tasks/<id> msgs/<id> acts/<id> memory/<id> files/<id>   承認する人のページ（会社を動かす係）だけが書く
// meta/settings       承認の設定・会社を動かす係の id
// meta/inbox          処理済みの依頼の id（各自が自分の依頼箱を片づけるのに使う）
// meta/runner         会社を動かす係のタブを 1 つに決めるための札（lease）
// inbox/<uid>         各自の依頼箱（ゴール・話しかけ・完了の報告など）。本人が書き、会社を動かす係だけが読む
// data/users/<uid>/<id>  各自のやることストック（本人だけが読み書き）

/** 公開するときに宣言するルール（scripts/artifact-publish.mjs と mock.ts が使う） */
export const DB_RULES = [
  { path: '', read: 'view', write: 'admin' },
  { path: 'members', read: 'view', write: 'admin' },
  { path: 'members/{self}', read: 'view', write: 'interact' },
  { path: 'inbox', read: 'admin', write: 'admin' },
  { path: 'inbox/{self}', read: 'interact', write: 'interact' },
  { path: 'data/users/{self}', write: 'interact' },
] as const

export const COL = {
  members: 'members',
  goals: 'goals',
  tasks: 'tasks',
  msgs: 'msgs',
  acts: 'acts',
  memory: 'memory',
  files: 'files',
  meta: 'meta',
  inbox: 'inbox',
} as const

export const SETTINGS = 'meta/settings'
export const INBOX_DONE = 'meta/inbox'
export const RUNNER = 'meta/runner'

/** 1 つの依頼（各自の依頼箱に積む） */
export type InboxItem =
  | { id: string; at: string; type: 'goal'; title: string; description: string; stockId?: string }
  | { id: string; at: string; type: 'talk'; to: string; text: string }
  | { id: string; at: string; type: 'reply'; messageId: string; text: string }
  | { id: string; at: string; type: 'complete'; taskId: string; note: string }
  | { id: string; at: string; type: 'retry'; taskId: string }
  | { id: string; at: string; type: 'cancel'; goalId: string }
  | { id: string; at: string; type: 'memory'; memberId: string; text: string; kind?: 'feedback' | 'note' | 'task' }

/** パスの 1 区切りに使えない文字を除く（英数字と _ - . ~ : @ + だけ） */
export function seg(s: string): string {
  return s.replace(/[^A-Za-z0-9_\-.~:@+]/g, '_').slice(0, 180) || '_'
}

/** 成果物のファイルの文書 id：ゴール + ファイル名（ファイル名は日本語もあるので短いハッシュに） */
export function fileDocId(goalId: string, path: string): string {
  let h = 2166136261
  for (let i = 0; i < path.length; i++) {
    h ^= path.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `${seg(goalId)}~${(h >>> 0).toString(36)}`
}

/** 文書を JSON にして書けるようにする（undefined を落とす） */
export function plain<T>(v: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(v)) as Record<string, unknown>
}
