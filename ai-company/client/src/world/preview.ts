// バーチャルオフィスだけを試すページ（client/world-preview.html）。
// 大阪（松井社長とネクマックスが社長席）・東京（人間 1 人＋AI）・プノンペン（NX-086）に仮の社員を置き、
// 依頼・相談（会議室）・引き継ぎ・人間へのお願い・モニター・採用をくり返し見せる。
// URL パラメータ：?still（デモを動かさない）&focus=all|jp|osaka|tokyo|phnompenh&select=<id>&insets=L,R,T,B
import type { Member, MemberStatus, MessageKind, OfficeId } from '../../../shared/types'
import { countryOf } from '../../../shared/types'
import type { FocusTarget } from './api'
import { OfficeWorld } from './OfficeWorld'

const params = new URLSearchParams(location.search)
const now = new Date().toISOString()

let seq = 0
function human(name: string, role: string, office: OfficeId, desk: number, look: Partial<Member['look']>, status: MemberStatus = 'idle'): Member {
  return {
    id: `h${seq++}`,
    kind: 'human',
    name,
    role,
    office,
    skills: [],
    languages: countryOf(office) === 'jp' ? ['ja'] : ['km', 'en'],
    look: { body: '#7aa7ff', accent: '#ff7aa2', hair: '#3b2a20', skin: '#ffd9c0', style: 0, accessory: 'none', ...look },
    deskIndex: desk,
    status,
    online: status !== 'offline',
    hiredAt: now,
    stats: { tasksDone: 0, messages: 0 },
  }
}
function agent(name: string, role: string, office: OfficeId, desk: number, look: Partial<Member['look']>, status: MemberStatus = 'working'): Member {
  return {
    id: `a${seq++}`,
    kind: 'agent',
    name,
    role,
    office,
    skills: [],
    languages: ['ja', 'en'],
    look: { body: '#8fd3ff', accent: '#ffd23f', style: 0, accessory: 'none', ...look },
    deskIndex: desk,
    status,
    hiredAt: now,
    stats: { tasksDone: 0, messages: 0 },
  }
}

const ceo = human('松井社長', '代表取締役社長', 'osaka', 0, { body: '#2f4a8a', accent: '#ffffff', hair: '#2b2b2b', skin: '#f6d0b1', style: 1, accessory: 'none' }, 'idle')
const members: Member[] = [
  ceo,
  {
    id: 'nexmax',
    kind: 'nexmax',
    name: 'ネクマックス',
    role: 'AI統括（社長の分身）',
    office: 'osaka',
    skills: [],
    languages: ['ja', 'km', 'en'],
    look: { body: '#66b2f0', accent: '#59e6ff', style: 0, nexmaxVariant: 'protagonist' },
    deskIndex: 1,
    status: 'idle',
    hiredAt: now,
    stats: { tasksDone: 0, messages: 0 },
  },
  {
    id: 'nx086',
    kind: 'nexmax',
    name: 'ネクマックス NX-086',
    role: 'AI統括（量産型）',
    office: 'phnompenh',
    skills: [],
    languages: ['ja', 'km', 'en'],
    look: { body: '#66b2f0', accent: '#ffd166', style: 1, nexmaxVariant: 'production', serial: 86 },
    deskIndex: -1,
    status: 'idle',
    hiredAt: now,
    stats: { tasksDone: 0, messages: 0 },
  },
  human('さくら', '営業', 'osaka', 2, { body: '#ef6f6c', hair: '#4a3426', style: 2, accessory: 'flower' }),
  agent('リサ', 'リサーチャー', 'osaka', 3, { body: '#8ecae6', accent: '#ffb703', style: 1, accessory: 'glasses' }),
  agent('コード丸', 'Webエンジニア', 'osaka', 4, { body: '#90be6d', accent: '#277da1', style: 2, accessory: 'headset' }),
  human('たけし', 'ディレクター', 'osaka', 5, { body: '#5b8def', hair: '#1f2a44', style: 4, accessory: 'glasses' }),
  agent('ミライ', 'マーケター', 'osaka', 6, { body: '#ff9f80', accent: '#4361ee', style: 3, accessory: 'bowtie' }, 'idle'),
  human('ゆい', 'デザイナー', 'osaka', 7, { body: '#f08bb6', hair: '#6b4423', style: 5, accessory: 'beret' }, 'idle'),
  agent('カズ', '経理AI', 'osaka', 8, { body: '#a3c4bc', accent: '#e76f51', style: 4 }, 'idle'),
  human('東京メンバー', '東京オフィス（営業）', 'tokyo', 0, { body: '#56c596', hair: '#2b2b2b', style: 6, accessory: 'none' }),
  agent('ソラ', 'セールスライター', 'tokyo', 1, { body: '#bde0fe', accent: '#fb8500', style: 5, accessory: 'headset' }),
  human('Sokha', '現地マネージャー', 'phnompenh', 0, { body: '#56c596', hair: '#2b2b2b', skin: '#c98e66', style: 3 }),
  human('Dara', '会場・総務', 'phnompenh', 1, { body: '#f2b134', hair: '#1f1f1f', skin: '#a86f4c', style: 6, accessory: 'cap' }, 'idle'),
  agent('Srey', 'クメール語翻訳', 'phnompenh', 2, { body: '#b8a1e8', accent: '#43aa8b', style: 6, accessory: 'ribbon' }),
  human('Chanthy', '学校との調整', 'phnompenh', 3, { body: '#9b7ede', hair: '#2b2b2b', skin: '#c98e66', style: 7, accessory: 'glasses' }, 'offline'),
  agent('Vibol', 'Webエンジニア', 'phnompenh', 4, { body: '#90be6d', accent: '#277da1', style: 7, accessory: 'headset' }),
  agent('Bot-Lin', 'データ分析', 'phnompenh', 5, { body: '#cdb4db', accent: '#ff7b9c', style: 0 }, 'idle'),
]

const container = document.getElementById('world')!
const world = new OfficeWorld(container)
;(window as unknown as { __world: OfficeWorld }).__world = world
world.syncMembers(members)
world.onSelect = (id) => {
  world.setSelected(id)
  log(id ? `選択：${members.find((m) => m.id === id)?.name}` : '選択解除')
}

const ins = params.get('insets')
if (ins) {
  const [l, r, t, b] = ins.split(',').map(Number)
  world.setInsets({ left: l || 0, right: r || 0, top: t || 0, bottom: b || 0 })
}
const f = params.get('focus') as FocusTarget | null
if (f) world.focus(f)
if (params.get('select')) world.setSelected(params.get('select'))

const byName = (n: string) => members.find((m) => m.name === n)!
// 人間へのお願い（待ち時間つき）
world.setTaskLabel(byName('Sokha').id, '会場の下見と仮押さえ', { human: true, since: new Date(Date.now() - 23 * 60000).toISOString() })
world.setTaskLabel(byName('東京メンバー').id, 'お客様へのヒアリング', { human: true, since: new Date(Date.now() - 4 * 60000).toISOString() })
world.setTaskLabel(byName('リサ').id, '💻 市場調査')
world.setTaskLabel(byName('コード丸').id, '💻 LP制作')
world.setTaskLabel(byName('Srey').id, '💻 翻訳（日→クメール）')

function boards(): void {
  world.setOfficeBoard('osaka', {
    headline: '進行中 2 件・人間待ち 1 件',
    progress: 0.62,
    rows: [
      { label: 'IT人材 交流イベント', value: '4/6 完了・会場の確認待ち', tone: 'human' },
      { label: 'LP リニューアル', value: '実装中（コード丸）', tone: 'ai' },
      { label: '市場調査レポート', value: '完了', tone: 'done' },
      { label: '予算の承認', value: '松井社長の確認待ち', tone: 'warn' },
    ],
  })
  world.setOfficeBoard('tokyo', {
    headline: 'ヒアリング準備中',
    progress: 0.35,
    rows: [
      { label: 'お客様ヒアリング', value: '東京メンバーの対応待ち', tone: 'human' },
      { label: '提案資料', value: '作成中（ソラ）', tone: 'ai' },
    ],
  })
  world.setOfficeBoard('phnompenh', {
    headline: '交流イベント準備・翻訳中',
    progress: 0.48,
    rows: [
      { label: '告知文のクメール語版', value: '翻訳中（Srey）', tone: 'ai' },
      { label: '会場の下見', value: 'Sokha の対応待ち', tone: 'human' },
      { label: '学校への案内', value: '完了', tone: 'done' },
    ],
  })
}
boards()

const logEl = document.getElementById('log')!
function log(s: string): void {
  const d = document.createElement('div')
  d.textContent = s
  logEl.prepend(d)
  while (logEl.children.length > 12) logEl.lastElementChild?.remove()
}

document.querySelectorAll<HTMLButtonElement>('[data-f]').forEach((b) => b.addEventListener('click', () => world.focus(b.dataset.f as FocusTarget)))

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
const LINES: Record<MessageKind, string[]> = {
  assign: ['この調査をお願いします', '告知文の翻訳をお願いします', '会場の下見をお願いします！', '見積もりの確認をお願いします'],
  chat: ['数字を確認しています', 'たたき台ができました'],
  question: ['締め切りはいつですか？', '優先順位はどれが上ですか？', 'この表現、現地で誤解されませんか？'],
  answer: ['はい、まずは大阪の企業です', '金曜までにお願いします', 'やわらかい言い方にしましょう'],
  handoff: ['「告知文」できました。翻訳に使ってください'],
  report: ['3社分まとめました', '完了しました！成果物をアップしました'],
  review: ['表現を少し直しました'],
  hire: ['新しい仲間です！'],
  system: ['ゴールを 5 つに分けました'],
}

let hireN = 0
let paused = params.has('still')
document.getElementById('pause')!.addEventListener('click', (ev) => {
  paused = !paused
  ;(ev.target as HTMLButtonElement).textContent = paused ? 'デモ再開' : 'デモ停止'
})
function hireOne(): void {
  const office: OfficeId = pick(['osaka', 'tokyo', 'phnompenh'] as OfficeId[])
  const used = new Set(members.filter((m) => m.office === office).map((m) => m.deskIndex))
  let desk = 0
  while (used.has(desk)) desk++
  const name = pick(['ハル', 'ユメ', 'Rina', 'Pisey', 'ナギ', 'Bopha'])
  const m = agent(`${name}${++hireN}`, pick(['広報ライター', 'イベントプランナー', 'UIデザイナー', 'データ分析']), office, desk, { body: pick(['#ffd6a5', '#caffbf', '#a0c4ff', '#ffc6ff']), accent: '#ff7b9c', style: hireN % 8, accessory: pick(['none', 'headset', 'bowtie', 'ribbon'] as const) }, 'idle')
  members.push(m)
  world.hire(m)
  log(`採用：${m.name}（${m.role}）@${office}`)
  world.message(office === 'phnompenh' ? 'nx086' : 'nexmax', null, 'hire', `${m.name}さんを採用しました！`)
}
document.getElementById('hire')!.addEventListener('click', hireOne)

function setStatus(m: Member, status: MemberStatus, statusText?: string): void {
  m.status = status
  m.statusText = statusText
  world.syncMembers(members.map((x) => ({ ...x })))
}

function meeting(): void {
  // 2 人で相談（同じ拠点か、拠点をまたぐ）
  const cand = members.filter((m) => m.kind === 'agent' || (m.kind === 'human' && m.status !== 'offline'))
  const a = pick(cand)
  const b = pick(cand.filter((x) => x !== a))
  if (!a || !b) return
  setStatus(a, 'talking', `${b.name}に相談中`)
  setStatus(b, 'talking', `${a.name}と相談中`)
  world.message(a.id, b.id, 'question', pick(LINES.question))
  setTimeout(() => world.message(b.id, a.id, 'answer', pick(LINES.answer)), 3500)
  setTimeout(() => {
    setStatus(a, a.kind === 'agent' ? 'working' : 'idle')
    setStatus(b, b.kind === 'agent' ? 'idle' : 'idle')
  }, 11000)
  log(`相談：${a.name} ⇄ ${b.name}`)
}

let tick = 0
setInterval(() => {
  if (paused) return
  tick++
  const r = Math.random()
  if (tick % 9 === 0) {
    hireOne()
    return
  }
  if (r < 0.3) {
    // ネクマックスが仕事を配る（人間なら目立つお願い）
    const nx = pick(['nexmax', 'nexmax', 'nx086'])
    const country = nx === 'nx086' ? 'kh' : 'jp'
    const to = pick(members.filter((m) => m.kind !== 'nexmax' && countryOf(m.office) === country))
    world.message(nx, to.id, 'assign', `${to.name}さん、${pick(LINES.assign)}`)
    if (to.kind === 'human') world.setTaskLabel(to.id, pick(['会場の下見', '契約書の確認', '予算の承認', 'お客様へ電話']), { human: true, since: new Date().toISOString() })
    else world.setTaskLabel(to.id, `💻 ${pick(['市場調査', '翻訳', 'LP制作', '資料作り'])}`)
    log(`依頼：${members.find((m) => m.id === nx)?.name} → ${to.name}`)
  } else if (r < 0.48) {
    meeting()
  } else if (r < 0.62) {
    // 引き継ぎ（同じ拠点）
    const a = pick(members.filter((m) => m.kind === 'agent'))
    const b = pick(members.filter((m) => m.office === a.office && m !== a && m.kind !== 'nexmax'))
    if (b) {
      world.message(a.id, b.id, 'handoff', pick(LINES.handoff))
      log(`引き継ぎ：${a.name} → ${b.name}`)
    }
  } else if (r < 0.8) {
    const a = pick(members)
    const b = pick(members.filter((m) => m !== a))
    const kind = pick(['report', 'chat', 'question'] as MessageKind[])
    world.message(a.id, b.id, kind, pick(LINES[kind]))
  } else if (r < 0.9) {
    // お願いが片づく
    const m = pick(members.filter((x) => x.kind === 'human'))
    world.setTaskLabel(m.id, null)
    world.celebrate(m.id)
    log(`対応完了：${m.name}`)
  } else {
    const m = pick(members.filter((x) => x.kind === 'agent'))
    setStatus(m, pick(['working', 'thinking', 'idle', 'waiting'] as MemberStatus[]))
  }
}, 2200)
