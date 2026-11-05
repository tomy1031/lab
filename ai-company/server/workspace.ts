// ゴールごとの作業場所（AI社員が成果のファイルを置く所）。
// サーバー版は data/workspaces/<goalId>/ のフォルダ（nodeWorkspace.ts）、アーティファクト版はデータベースの文書（client/src/artifact）。
export interface Workspace {
  /** Claude Code が作業するフォルダ（ファイルの道具を使える頭脳だけが使う） */
  dir(goalId: string): string
  /** いまあるファイル（ゴールの作業場所からの相対パス） */
  list(goalId: string): string[]
  /** ファイルを書く（道具を使えない頭脳が、成果をファイルにするとき） */
  write(goalId: string, name: string, content: string): void
  /** ファイルを読む（無ければ null） */
  read(goalId: string, name: string): string | null | Promise<string | null>
}

/** ファイル名を安全な形にする（フォルダの外を指さない・おかしな文字を除く） */
export function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'output.md'
  const cleaned = base.replace(/[^\p{L}\p{N}._\- ]/gu, '_').replace(/^\.+/, '').slice(0, 80)
  return cleaned || 'output.md'
}
