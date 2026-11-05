// 書き出し先ごとの違い：
// - サーバー版（npm run build）：NEXTMAKE のロゴ、絶対パス（/brand/…）
// - アーティファクト版（npm run build:artifact）：claude.ai のページとして公開するので、実在の会社のロゴ・社名は載せず、パスは相対（./brand/…）
import { h } from './ui/dom'

export const IS_ARTIFACT = import.meta.env.VITE_TARGET === 'artifact'

/** 公開フォルダ（client/public）のファイルの URL */
export function asset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`
}

/** 2 つのオフィスをつなぐ橋の真ん中のマーク */
export const BRIDGE_MARK = IS_ARTIFACT ? asset('brand/nexmax-face.webp') : asset('brand/nextmake-mark-270.png')

/** 左上のロゴ */
export function brandMark(big = false): HTMLElement {
  if (IS_ARTIFACT) return h('div', { class: `brand ${big ? 'big' : ''}` }, h('img', { src: asset('brand/nexmax-face.webp'), alt: '', class: 'brand-face' }), h('span', { class: 'brand-word' }, 'AI OFFICE'))
  return h('div', { class: `brand ${big ? 'big' : ''}` }, h('img', { src: asset('brand/nextmake-logo.png'), alt: 'NEXTMAKE', class: 'brand-logo' }), h('span', { class: 'brand-ai' }, 'AI'))
}
