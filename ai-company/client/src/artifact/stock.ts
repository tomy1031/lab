// アーティファクト版のやることストック：各自の非公開の場所（data/users/<自分の id>/）に置き、整理は手元の決まりで行う（Claude は使わない）。
import type { StockItem } from '../../../shared/types'
import { SimEngine } from '../../../server/engine/sim'
import { clip, id, now } from '../../../server/util'
import { plain } from './paths'
import type { Db } from './runtime'

const sim = new SimEngine(4)

export class LocalStock {
  private timer: ReturnType<typeof setTimeout> | null = null
  private busy = false

  constructor(
    private readonly db: Db,
    private readonly uid: string,
    private readonly items: () => StockItem[],
  ) {}

  private path(itemId: string): string {
    return `data/users/${this.uid}/${itemId}`
  }

  async put(item: StockItem): Promise<StockItem> {
    await this.db.doc(this.path(item.id)).set(plain(item))
    return item
  }

  /** 話した（書いた）ことを受け取る。少し待って、まとめて整理する */
  async add(text: string): Promise<StockItem> {
    const t = now()
    const item = await this.put({ id: id('stk'), owner: this.uid, at: t, updatedAt: t, raw: text, title: clip(text, 20), kind: 'goal', priority: 2, status: 'organizing' })
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.organize(), 1200)
    return item
  }

  private async organize(): Promise<void> {
    if (this.busy) {
      this.timer = setTimeout(() => void this.organize(), 800)
      return
    }
    this.busy = true
    try {
      const all = this.items()
      const pending = all.filter((s) => s.status === 'organizing')
      if (!pending.length) return
      const existing = all.filter((s) => s.status === 'ready' || s.status === 'later').slice(-40)
      const out = await sim.organize({ member: { id: this.uid } as never, items: pending.map((p) => ({ id: p.id, raw: p.raw })), existing: existing.map((e) => ({ id: e.id, title: e.title })) })
      for (const src of pending) {
        const mine = out.filter((o) => o.from === src.id)
        if (!mine.length) {
          await this.put({ ...src, status: 'archived', updatedAt: now() })
          continue
        }
        for (const [i, o] of mine.entries()) {
          const dup = o.duplicateOf ? existing.find((s) => s.id === o.duplicateOf) : undefined
          const base: StockItem = i === 0 ? src : { ...src, id: id('stk') }
          if (dup) {
            await this.put({ ...dup, raw: `${dup.raw}\n${src.raw}`, priority: Math.min(dup.priority, o.priority) as 1 | 2 | 3, updatedAt: now(), status: 'ready' })
            if (i === 0) await this.put({ ...base, status: 'archived', mergedInto: dup.id, title: clip(o.title, 24), updatedAt: now() })
            continue
          }
          await this.put({ ...base, title: clip(o.title, 24), summary: clip(o.summary, 60), kind: o.kind, priority: o.priority, status: 'ready', updatedAt: now() })
        }
      }
    } catch (e) {
      console.error('[stock]', e)
      for (const src of this.items().filter((s) => s.status === 'organizing')) await this.put({ ...src, status: 'ready', updatedAt: now() }).catch(() => {})
    } finally {
      this.busy = false
    }
  }
}
