// サーバー版の保存先：状態を JSON ファイル（data/state.json）へ間引いて保存する。
// 状態の持ち方と更新の約束は coreStore.ts（ブラウザのアーティファクト版と共通）。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { CoreStore, emptyState } from './coreStore'

export type { SessionRecord, State, UserRecord } from './coreStore'
export { CoreStore, emptyState } from './coreStore'

export class Store extends CoreStore {
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(readonly file: string) {
    super()
    if (existsSync(file)) {
      try {
        this.state = { ...emptyState(), ...JSON.parse(readFileSync(file, 'utf8')) }
      } catch (e) {
        console.error('[store] state.json を読めませんでした。空の状態で始めます', e)
      }
    }
  }

  /** 書き込みをまとめる（0.4 秒に 1 回まで） */
  override save(): void {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush()
    }, 400)
  }

  override flush(): void {
    this.trim()
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = this.file + '.tmp'
    // 本人（サーバーを動かすユーザー）だけが読み書きできるように
    writeFileSync(tmp, JSON.stringify(this.state, null, 1), { mode: 0o600 })
    renameSync(tmp, this.file)
  }
}
