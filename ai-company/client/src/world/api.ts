// 3D バーチャルオフィス（OfficeWorld）の外向きの約束。アプリの画面（client/src/main.ts）はこれだけを使う。
// 実装は client/src/world/OfficeWorld.ts。
import type { Member, MessageKind, OfficeId } from '../../../shared/types'

/** 'jp' = 日本の 2 拠点（東京・大阪）をまとめて */
export type FocusTarget = 'all' | 'jp' | OfficeId | { memberId: string }

/** 奥の壁の大きなモニターに出す、その拠点の「いま」 */
export interface OfficeBoard {
  /** 例：「進行中 2 件・人間待ち 1 件」 */
  headline: string
  /** 0..1（その拠点が関わるタスクの完了率） */
  progress: number
  rows: { label: string; value: string; tone?: 'ai' | 'human' | 'done' | 'warn' }[]
}

export interface TaskLabelOptions {
  /** 人間へのお願い（オレンジの札・頭の上の「！」・足元の輪で目立たせる） */
  human?: boolean
  /** お願いした時刻（ISO）。札に「◯分待ち」を出す */
  since?: string
}

export interface OfficeWorldApi {
  /** 社員の一覧をまるごと渡す（差分は内部で取る）：増えた人は席に出す、減った人は消す、状態・見た目・名前の変化を反映 */
  syncMembers(members: Member[]): void
  /** 採用の演出：入口のドアから出てきて、紙吹雪、自分の席まで歩く（syncMembers より先に呼ばれても後でも二重に出さない） */
  hire(member: Member): void
  /**
   * 社員どうしのやり取り：送り手の頭上に吹き出し、光の粒が送り手から受け手へ飛ぶ。
   * 日本⇄カンボジアのやり取りは 2 つのオフィスをつなぐ橋（データの光の道）を通る。
   * nexmax が assign するときは、ネクマックス本人が受け手の席まで歩いて行って戻る。
   * toId = null は全体への発表（波紋が広がる）
   */
  message(fromId: string, toId: string | null, kind: MessageKind, text: string): void
  /** 吹き出しだけ */
  say(memberId: string, text: string, ms?: number): void
  /** 机の上に浮かぶ「いまの仕事」の札。null で消す。human のときは人間へのお願いとして目立たせる */
  setTaskLabel(memberId: string, label: string | null, opts?: TaskLabelOptions): void
  /** 拠点の奥のモニター（ダッシュボード）の中身 */
  setOfficeBoard(office: OfficeId, board: OfficeBoard): void
  /** タスク完了のお祝い（小さくジャンプ＋きらきら） */
  celebrate(memberId: string): void
  /** カメラ：全体（2 つのオフィスが一度に見える）/ 日本 / カンボジア / 人に寄る */
  focus(target: FocusTarget): void
  /**
   * 画面の上に重なる UI（パネル）で隠れる幅（CSS px）。カメラの写し方を、見えている長方形の中心に合わせ、
   * focus（全体・各オフィス・人）もその長方形に収まるように撮り直す（なめらかに動く）。見える所が狭すぎるときは無視する
   */
  setInsets(insets: { left: number; right: number; top: number; bottom: number }): void
  /** 選択中の人（輪が光る）。null で解除 */
  setSelected(memberId: string | null): void
  /** クリックで人を選んだとき（何もない所なら null） */
  onSelect: ((memberId: string | null) => void) | null
  dispose(): void
}
