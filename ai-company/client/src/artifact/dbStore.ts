// 会社を動かす係（承認する人のページ）の保存先：変わった文書だけをアーティファクトのデータベースへ書く。
// - 同じ文書への書き込みは 1 つずつ（前の書き込みが終わってから次）。0.25 秒ぶんをまとめて書く
// - やり取り・動きは新しい 300 件、記憶は 1 人 80 件までを残し、古いものは消す（データベースの文書数には上限がある）
// - 人間の文書は本人が書くので、ここでは書かない
import type { Member, ServerEvent } from '../../../shared/types'
import { CoreStore, type State } from '../../../server/coreStore'
import { now } from '../../../server/util'
import { COL, SETTINGS, plain } from './paths'
import type { Db } from './runtime'

const KEEP_MSGS = 300
const KEEP_ACTS = 300
const KEEP_MEMORY_PER_MEMBER = 80
const MAX_INFLIGHT = 6

export class DbStore extends CoreStore {
  private dirty = new Map<string, Record<string, unknown> | null>()
  private inflight = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private msgIds: string[]
  private actIds: string[]
  /** 書き込みに失敗したとき（画面に知らせる） */
  onError: ((message: string) => void) | null = null

  constructor(
    private readonly db: Db,
    initial: State,
    readonly ownerId: string,
  ) {
    super()
    this.state = initial
    this.msgIds = initial.messages.map((m) => m.id)
    this.actIds = initial.activities.map((a) => a.id)
  }

  override save(ev?: ServerEvent): void {
    if (!ev) {
      this.mark(SETTINGS, { gate: this.state.settings.gate ?? {}, ownerId: this.ownerId, updatedAt: now() })
      return
    }
    switch (ev.t) {
      case 'member':
      case 'hired':
        if (ev.member.kind !== 'human') this.mark(`${COL.members}/${ev.member.id}`, plain(ev.member))
        break
      case 'member.removed': {
        const m = this.state.members.find((x) => x.id === ev.id)
        if (!m || m.kind !== 'human') this.mark(`${COL.members}/${ev.id}`, null)
        break
      }
      case 'goal':
        this.mark(`${COL.goals}/${ev.goal.id}`, plain(ev.goal))
        break
      case 'task':
        this.mark(`${COL.tasks}/${ev.task.id}`, plain(ev.task))
        break
      case 'message':
        if (!this.msgIds.includes(ev.message.id)) {
          this.msgIds.push(ev.message.id)
          while (this.msgIds.length > KEEP_MSGS) this.mark(`${COL.msgs}/${this.msgIds.shift()}`, null)
        }
        this.mark(`${COL.msgs}/${ev.message.id}`, plain(ev.message))
        break
      case 'activity':
        this.actIds.push(ev.activity.id)
        while (this.actIds.length > KEEP_ACTS) this.mark(`${COL.acts}/${this.actIds.shift()}`, null)
        this.mark(`${COL.acts}/${ev.activity.id}`, plain(ev.activity))
        break
      case 'memory': {
        this.mark(`${COL.memory}/${ev.entry.id}`, plain(ev.entry))
        const mine = this.state.memory.filter((e) => e.memberId === ev.entry.memberId)
        if (mine.length > KEEP_MEMORY_PER_MEMBER) {
          // 重要度の低い古いものから消す
          const drop = [...mine].sort((a, b) => a.importance - b.importance || a.at.localeCompare(b.at))[0]
          this.state.memory = this.state.memory.filter((e) => e.id !== drop.id)
          this.mark(`${COL.memory}/${drop.id}`, null)
        }
        break
      }
      default:
        break
    }
  }

  /** 人間の文書（本人が書いたもの）を取り込む。書き戻さない */
  mergeHumans(humans: Member[]): void {
    const ids = new Set(humans.map((h) => h.id))
    for (const h of humans) {
      const i = this.state.members.findIndex((m) => m.id === h.id)
      if (i >= 0) {
        const cur = this.state.members[i]
        this.state.members[i] = { ...h, stats: cur.stats.tasksDone > h.stats.tasksDone ? cur.stats : h.stats, isAdmin: h.id === this.ownerId }
      } else this.state.members.push({ ...h, isAdmin: h.id === this.ownerId })
    }
    // 消えた人間（参加をやめた人）
    this.state.members = this.state.members.filter((m) => m.kind !== 'human' || ids.has(m.id))
  }

  private mark(path: string, data: Record<string, unknown> | null): void {
    this.dirty.set(path, data)
    this.timer ??= setTimeout(() => {
      this.timer = null
      void this.flushNow()
    }, 250)
  }

  override flush(): void {
    void this.flushNow()
  }

  private async flushNow(): Promise<void> {
    this.trim()
    const jobs: Promise<void>[] = []
    for (const [path, data] of [...this.dirty]) {
      if (this.inflight.has(path) || this.inflight.size >= MAX_INFLIGHT) continue
      this.dirty.delete(path)
      this.inflight.add(path)
      const ref = this.db.doc(path)
      jobs.push(
        (data ? ref.set(data) : ref.delete())
          .catch((e: { code?: string; message?: string }) => {
            console.error('[db]', path, e)
            if (e?.code === 'quota_exceeded') this.onError?.('データベースがいっぱいです。古いプロジェクトを消してください')
            else if (e?.code === 'resource_exhausted') this.dirty.set(path, data) // 少し待ってもう一度
          })
          .finally(() => this.inflight.delete(path)),
      )
    }
    await Promise.all(jobs)
    if (this.dirty.size) this.timer ??= setTimeout(() => {
      this.timer = null
      void this.flushNow()
    }, this.inflight.size ? 300 : 800)
  }

  /** 書き残しがあるか（ページを閉じる前の確認用） */
  get pending(): number {
    return this.dirty.size + this.inflight.size
  }
}
