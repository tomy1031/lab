// 線のアイコン（24×24、currentColor）。参考デザインの丸みのあるガラス調ボタンに合わせて太めの線
const P: Record<string, string> = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2"/><circle cx="12" cy="12" r="7"/>',
  chevron: '<path d="M7 10l5 5 5-5"/>',
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M3.5 10.5h17"/>',
  task: '<rect x="4.5" y="4" width="15" height="17" rx="3"/><path d="M9 3v2.5h6V3"/><path d="M8.5 13l2.5 2.5 4.5-5"/>',
  chat: '<path d="M4 12a7.5 6.5 0 1 1 3.4 5.4L4 19l1-3.4A6.3 6.3 0 0 1 4 12z"/><circle cx="8.6" cy="12" r=".9" fill="currentColor"/><circle cx="11.6" cy="12" r=".9" fill="currentColor"/><circle cx="14.6" cy="12" r=".9" fill="currentColor"/>',
  doc: '<path d="M7 3.5h7l4.5 4.5v12a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M14 3.5V8h4.5M8.5 12.5h7M8.5 16h7"/>',
  people: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><circle cx="16.5" cy="9.5" r="2.6"/><path d="M15.5 14.2a4.6 4.6 0 0 1 5 5.3"/>',
  chart: '<path d="M4 20.5h16"/><rect x="5.5" y="12" width="3" height="6.5" rx="1"/><rect x="10.5" y="8" width="3" height="10.5" rx="1"/><rect x="15.5" y="4.5" width="3" height="14" rx="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  send: '<path d="M4 12l16-7-6.5 15-2.5-6z"/><path d="M11 14l9-9"/>',
  user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  robot: '<rect x="5" y="7.5" width="14" height="11" rx="4"/><path d="M12 4v3.5"/><circle cx="12" cy="3.5" r="1.2"/><circle cx="9.5" cy="13" r="1.3" fill="currentColor"/><circle cx="14.5" cy="13" r="1.3" fill="currentColor"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5z"/>',
  logout: '<path d="M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  hand: '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 10V5a1.5 1.5 0 0 1 3 0v5M14 10.5V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5A5.5 5.5 0 0 1 5.6 17l-2-3.5a1.5 1.5 0 0 1 2.6-1.5L8 14"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  file: '<path d="M7 3.5h7l4.5 4.5v12a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M14 3.5V8h4.5"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.7 5.3 3.7 8.5s-1.1 6.1-3.7 8.5c-2.6-2.4-3.7-5.3-3.7-8.5S9.4 5.9 12 3.5z"/>',
  edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M14 7.5l3 3"/>',
  location: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
  inbox: '<path d="M3.5 13l2.6-7.2A2 2 0 0 1 8 4.5h8a2 2 0 0 1 1.9 1.3l2.6 7.2v5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M3.5 13h5l1.5 2.5h4l1.5-2.5h5"/>',
  undo: '<path d="M9 7L4.5 11.5 9 16"/><path d="M5 11.5h9a5 5 0 0 1 0 10h-2"/>',
  eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  flow: '<rect x="3" y="4" width="6" height="5" rx="1.5"/><rect x="15" y="4" width="6" height="5" rx="1.5"/><rect x="9" y="15" width="6" height="5" rx="1.5"/><path d="M6 9v2.5h12V9M12 11.5V15"/>',
}

export function icon(name: keyof typeof P | string, size = 22, cls = ''): SVGSVGElement {
  const wrap = document.createElement('span')
  wrap.innerHTML = `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? ''}</svg>`
  return wrap.firstElementChild as SVGSVGElement
}

/** 国旗（絵文字が出ない端末でも見えるよう SVG で） */
export function flag(country: 'jp' | 'kh', size = 16): SVGSVGElement {
  const w = Math.round(size * 1.5)
  const wrap = document.createElement('span')
  wrap.innerHTML =
    country === 'jp'
      ? `<svg class="flag" width="${w}" height="${size}" viewBox="0 0 30 20"><rect x=".75" y=".75" width="28.5" height="18.5" rx="2.5" fill="#fff" stroke="#c9d3e0" stroke-width="1.5"/><circle cx="15" cy="10" r="5.6" fill="#d7263d"/></svg>`
      : `<svg class="flag" width="${w}" height="${size}" viewBox="0 0 30 20"><rect width="30" height="20" rx="2.5" fill="#032ea1"/><rect y="5" width="30" height="10" fill="#e00025"/><path d="M10.5 13.6h9l-.6-1.2h-.8l-.3-1.4h-.6l-.4-1.6h-.5l-.6-2-.7-1.2-.7 1.2-.6 2h-.5l-.4 1.6h-.6l-.3 1.4h-.8z" fill="#fff"/></svg>`
  return wrap.firstElementChild as SVGSVGElement
}

/**
 * 参考デザイン（docs/img/design_reference.jpg）のアイコン：白いガラスのタイルに、青いグラデーションの線画＋うすい塗り。
 * size が 34 以上ならタイル付き、それより小さいと線画だけ。cls に 'warm' でオレンジ、'white' で白
 */
export type GlossyIcon = 'folder' | 'task' | 'chat' | 'doc' | 'people' | 'chart' | 'target' | 'robot' | 'globe' | 'hand' | 'bell' | 'calendar' | 'settings' | 'search' | 'spark' | 'check' | 'mic' | 'inbox' | 'lock'

/** [塗り, 線]（24×24） */
const DUO: Record<GlossyIcon, [string, string]> = {
  folder: ['<path d="M3 7.5a2 2 0 0 1 2-2h4.2l2 2.2H19a2 2 0 0 1 2 2V17.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', '<path d="M3 7.5a2 2 0 0 1 2-2h4.2l2 2.2H19a2 2 0 0 1 2 2V17.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10.5h18"/>'],
  task: ['<rect x="4.5" y="4.5" width="15" height="16.5" rx="3"/>', '<rect x="4.5" y="4.5" width="15" height="16.5" rx="3"/><path d="M9 3h6v3H9z"/><path d="M8.5 13.2l2.4 2.4 4.6-5"/>'],
  chat: ['<path d="M4 11.5c0-4 3.6-7 8-7s8 3 8 7-3.6 7-8 7c-1 0-2-.1-2.9-.4L5 19.5l.9-3.4A6.6 6.6 0 0 1 4 11.5z"/>', '<path d="M4 11.5c0-4 3.6-7 8-7s8 3 8 7-3.6 7-8 7c-1 0-2-.1-2.9-.4L5 19.5l.9-3.4A6.6 6.6 0 0 1 4 11.5z"/><circle cx="8.5" cy="11.5" r=".6"/><circle cx="12" cy="11.5" r=".6"/><circle cx="15.5" cy="11.5" r=".6"/>'],
  doc: ['<path d="M6.5 3h7.5l4.5 4.5v12A1.5 1.5 0 0 1 17 21H6.5A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3z"/>', '<path d="M6.5 3h7.5l4.5 4.5v12A1.5 1.5 0 0 1 17 21H6.5A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3z"/><path d="M14 3v4.5h4.5M8.5 12h7M8.5 15.5h7"/>'],
  people: ['<circle cx="9" cy="8.2" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0z"/><circle cx="16.6" cy="9.2" r="2.6"/><path d="M15 14.2a4.6 4.6 0 0 1 5.5 5.3H15.5"/>', '<circle cx="9" cy="8.2" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0z"/><circle cx="16.6" cy="9.2" r="2.6"/><path d="M15 14.2a4.6 4.6 0 0 1 5.5 5.3H15.5"/>'],
  chart: ['<rect x="5" y="12" width="3.4" height="7" rx="1"/><rect x="10.3" y="8" width="3.4" height="11" rx="1"/><rect x="15.6" y="4.5" width="3.4" height="14.5" rx="1"/>', '<path d="M3.5 20.5h17"/><rect x="5" y="12" width="3.4" height="7" rx="1"/><rect x="10.3" y="8" width="3.4" height="11" rx="1"/><rect x="15.6" y="4.5" width="3.4" height="14.5" rx="1"/>'],
  target: ['<circle cx="12" cy="12" r="8"/>', '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2"/><path d="M12 12l6.5-6.5M16 4.5h2.5V7"/>'],
  robot: ['<rect x="4.5" y="7.5" width="15" height="11" rx="4.5"/>', '<rect x="4.5" y="7.5" width="15" height="11" rx="4.5"/><path d="M12 4v3.5"/><circle cx="12" cy="3.5" r="1"/><circle cx="9.5" cy="13" r="1.1"/><circle cx="14.5" cy="13" r="1.1"/><path d="M3 12v3M21 12v3"/>'],
  globe: ['<circle cx="12" cy="12" r="8"/>', '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2.3 3.6 5 3.6 8s-1.1 5.7-3.6 8c-2.5-2.3-3.6-5-3.6-8S9.5 6.3 12 4z"/>'],
  hand: ['<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11 5a1.5 1.5 0 0 1 3 0v5.5-4a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5A5.5 5.5 0 0 1 5.6 17l-2-3.5a1.5 1.5 0 0 1 2.6-1.5L8 14z"/>', '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 10V5a1.5 1.5 0 0 1 3 0v5M14 10.5V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5A5.5 5.5 0 0 1 5.6 17l-2-3.5a1.5 1.5 0 0 1 2.6-1.5L8 14"/>'],
  bell: ['<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/>', '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'],
  calendar: ['<rect x="3.5" y="5" width="17" height="15" rx="3"/>', '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'],
  settings: ['<circle cx="12" cy="12" r="7"/>', '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2"/><circle cx="12" cy="12" r="7"/>'],
  search: ['<circle cx="11" cy="11" r="6.5"/>', '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'],
  spark: ['<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>', '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>'],
  check: ['<circle cx="12" cy="12" r="8.5"/>', '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.8 2.8 5.2-5.6"/>'],
  mic: ['<rect x="9" y="3" width="6" height="11" rx="3"/>', '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>'],
  inbox: ['<path d="M3.5 13l2.6-7.2A2 2 0 0 1 8 4.5h8a2 2 0 0 1 1.9 1.3l2.6 7.2v5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>', '<path d="M3.5 13l2.6-7.2A2 2 0 0 1 8 4.5h8a2 2 0 0 1 1.9 1.3l2.6 7.2v5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M3.5 13h5l1.5 2.5h4l1.5-2.5h5"/>'],
  lock: ['<rect x="5" y="10.5" width="14" height="10" rx="2.5"/>', '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2.5"/>'],
}

let defsAdded = false
function ensureDefs(): void {
  if (defsAdded || typeof document === 'undefined') return
  defsAdded = true
  const wrap = document.createElement('div')
  wrap.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'
  wrap.setAttribute('aria-hidden', 'true')
  wrap.innerHTML = `<svg width="0" height="0"><defs>
    <linearGradient id="nmIG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#43b4ff"/><stop offset="1" stop-color="#1b5fc9"/></linearGradient>
    <linearGradient id="nmIF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe3ff" stop-opacity=".9"/><stop offset="1" stop-color="#7cc0ff" stop-opacity=".45"/></linearGradient>
    <linearGradient id="nmIW" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb26b"/><stop offset="1" stop-color="#ff6f1f"/></linearGradient>
    <linearGradient id="nmIWF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe0c4" stop-opacity=".9"/><stop offset="1" stop-color="#ffb47d" stop-opacity=".5"/></linearGradient>
  </defs></svg>`
  document.body.append(wrap)
}

export function gicon(name: GlossyIcon, size = 28, cls = ''): HTMLElement {
  ensureDefs()
  if (name === 'hand' && !cls) cls = 'warm' // 人間へのお願いはオレンジ
  const tile = size >= 34
  const [fill, stroke] = DUO[name]
  const el = document.createElement('span')
  el.className = `gicon ${tile ? 'tile' : 'plain'} ${cls}`
  el.style.width = el.style.height = `${size}px`
  el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><g class="f">${fill}</g><g class="s" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${stroke}</g></svg>`
  return el
}
