// 2D の小さな似顔絵（3D のちびキャラと同じ色・同じ印象）。人間 = 髪と顔、AI社員 = 画面の顔のロボット、ネクマックス = 青い頭
import type { Member } from '../../../shared/types'
import { faceUrl, spriteIdFor, spriteUrl, type SpritePose } from '../sprites'

function human(m: Member): string {
  const skin = m.look.skin ?? '#ffe0c7'
  const hair = m.look.hair ?? '#3a2a20'
  const body = m.look.body
  const st = Math.abs(m.look.style | 0) % 4
  const hairPath = [
    'M8 21c0-9 5-13 12-13s12 4 12 13c-3-4-7-6-12-6s-9 2-12 6z',
    'M8 22c-1-9 4-14 12-14s13 5 12 14c-2-3-5-5-6-8-3 3-9 5-18 8z',
    'M7 24c0-10 5-16 13-16s13 6 13 16l-2 2c0-5-2-9-4-11-5 2-12 2-17 0-2 2-3 6-3 11z',
    'M9 20c0-8 5-12 11-12s11 4 11 12c-2-2-4-4-11-4s-9 2-11 4zM26 9c3-3 7-2 7 1-2 0-4 0-7-1z',
  ][st]
  return `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#eaf4ff"/><path d="M6 40c1-8 7-11 14-11s13 3 14 11z" fill="${body}"/><circle cx="20" cy="21" r="11" fill="${skin}"/><path d="${hairPath}" fill="${hair}"/><circle cx="16" cy="22.5" r="1.5" fill="#2a2a32"/><circle cx="24" cy="22.5" r="1.5" fill="#2a2a32"/><circle cx="13.5" cy="25.5" r="1.8" fill="#ff9fb0" opacity=".55"/><circle cx="26.5" cy="25.5" r="1.8" fill="#ff9fb0" opacity=".55"/><path d="M18 26.5q2 1.6 4 0" stroke="#c0564a" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>`
}

function robot(m: Member): string {
  const body = m.look.body
  const accent = m.look.accent
  return `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#eef6ff"/><path d="M20 6v4" stroke="${accent}" stroke-width="2" stroke-linecap="round"/><circle cx="20" cy="5.5" r="2.2" fill="${accent}"/><rect x="8" y="10" width="24" height="20" rx="9" fill="#fbfdff" stroke="${body}" stroke-width="2.4"/><rect x="11.5" y="14" width="17" height="11" rx="5" fill="#1d2a44"/><ellipse cx="16.5" cy="19.5" rx="2" ry="2.6" fill="#7fe3ff"/><ellipse cx="23.5" cy="19.5" rx="2" ry="2.6" fill="#7fe3ff"/><rect x="5" y="16" width="3" height="7" rx="1.5" fill="${body}"/><rect x="32" y="16" width="3" height="7" rx="1.5" fill="${body}"/><path d="M10 40c1-6 5-8 10-8s9 2 10 8z" fill="${body}"/></svg>`
}

function nexmax(m: Member): string {
  const prod = m.look.nexmaxVariant === 'production'
  return `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#e6f3ff"/>${prod ? '<path d="M20 4v5" stroke="#9fb6cc" stroke-width="2"/><circle cx="20" cy="4" r="2" fill="#ffd166"/>' : ''}<circle cx="20" cy="21" r="14" fill="#66b2f0"/><path d="M9 21a11 9 0 0 1 22 0v3a11 7 0 0 1-22 0z" fill="#f6f6f4"/><ellipse cx="15.5" cy="22" rx="2.1" ry="2.8" fill="#141416"/><ellipse cx="24.5" cy="22" rx="2.1" ry="2.8" fill="#141416"/><circle cx="16.1" cy="21" r=".8" fill="#fff"/><circle cx="25.1" cy="21" r=".8" fill="#fff"/><path d="M17.5 27q2.5 2.2 5 0" stroke="#fb7a52" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`
}

/** 顔の画像（生成したキャラクターの顔・ネクマックスは chronicle の公式ポートレート） */
export function faceSrc(m: Member | undefined): string | null {
  if (!m) return null
  if (m.kind === 'nexmax') return m.look.nexmaxVariant === 'production' ? '/brand/nexmax-unit-face.webp' : '/brand/nexmax-face.webp'
  const id = spriteIdFor(m)
  return id ? faceUrl(id) : null
}

function fallbackSvg(m: Member | undefined): string {
  return !m ? '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#e8eef6"/></svg>' : m.kind === 'human' ? human(m) : m.kind === 'agent' ? robot(m) : nexmax(m)
}

export function face(m: Member | undefined, size = 30, opts: { ring?: boolean; dot?: boolean } = {}): HTMLElement {
  const el = document.createElement('span')
  el.className = `face kind-${m?.kind ?? 'none'}${opts.ring ? ' ring' : ''}`
  el.style.width = el.style.height = `${size}px`
  const src = faceSrc(m)
  if (src) {
    const img = document.createElement('img')
    img.src = src
    img.alt = ''
    img.decoding = 'async'
    img.draggable = false
    img.onerror = () => {
      img.remove()
      el.insertAdjacentHTML('afterbegin', fallbackSvg(m))
    }
    el.append(img)
  } else el.innerHTML = fallbackSvg(m)
  if (m) el.title = `${m.name}（${m.role}）`
  if (m && opts.dot !== false && (m.kind === 'human' || opts.dot)) {
    const d = document.createElement('i')
    d.className = `pres st-${m.status}${m.kind === 'human' && m.online ? ' on' : ''}`
    el.append(d)
  }
  return el
}

/** 全身の絵（飾り・空の状態の説明用）。ネクマックスはポートレート */
export function figure(m: Pick<Member, 'id' | 'kind' | 'office' | 'role' | 'look' | 'name'> | { sprite: string }, pose: SpritePose = 'stand', height = 120): HTMLImageElement {
  const img = document.createElement('img')
  img.className = 'figure'
  img.alt = ''
  img.decoding = 'async'
  img.draggable = false
  img.style.height = `${height}px`
  const id = 'sprite' in m ? m.sprite : spriteIdFor(m)
  img.src = id ? spriteUrl(id, pose) : '/brand/nexmax-face.webp'
  return img
}

/** ネクマックスの大きめの顔（AIアシスタントのカード用・公式ポートレート） */
export function nexmaxBadge(size = 64): HTMLElement {
  const el = document.createElement('span')
  el.className = 'nx-badge'
  el.style.width = el.style.height = `${size}px`
  const img = document.createElement('img')
  img.src = '/brand/nexmax-face.webp'
  img.alt = 'ネクマックス'
  el.append(img)
  return el
}
