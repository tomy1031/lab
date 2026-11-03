// バーチャルオフィスだけを試すページ（client/world-preview.html）。
// 仮の社員 16 人＋ネクマックス 2 体で、やり取り・採用・状態の変化・作業札をくり返し見せる。
// URL パラメータ：?still（デモを動かさない）&focus=jp|kh|all&select=<id>
import type { Member, MemberStatus, MessageKind, OfficeId } from '../../../shared/types'
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
    languages: office === 'jp' ? ['ja'] : ['km', 'en'],
    look: { body: '#7aa7ff', accent: '#ff7aa2', hair: '#3b2a20', skin: '#ffd9c0', style: 0, accessory: 'none', ...look },
    deskIndex: desk,
    status,
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

const members: Member[] = [
  {
    id: 'nexmax',
    kind: 'nexmax',
    name: 'ネクマックス',
    role: 'AI統括',
    office: 'jp',
    skills: [],
    languages: ['ja', 'km', 'en'],
    look: { body: '#66b2f0', accent: '#ffffff', style: 0, nexmaxVariant: 'protagonist' },
    deskIndex: -1,
    status: 'idle',
    hiredAt: now,
    stats: { tasksDone: 0, messages: 0 },
  },
  {
    id: 'nx086',
    kind: 'nexmax',
    name: 'NX-086',
    role: 'カンボジア統括',
    office: 'kh',
    skills: [],
    languages: ['km', 'ja', 'en'],
    look: { body: '#66b2f0', accent: '#ffffff', style: 0, nexmaxVariant: 'production', serial: 86 },
    deskIndex: -1,
    status: 'idle',
    hiredAt: now,
    stats: { tasksDone: 0, messages: 0 },
  },
  human('さくら', '営業', 'jp', 0, { body: '#ff9fb4', hair: '#5a3a2a', style: 0, accessory: 'ribbon', accent: '#ff5f8f' }),
  human('たけし', 'PM', 'jp', 1, { body: '#5b8def', hair: '#222233', style: 2, accessory: 'glasses', accent: '#ffd23f' }, 'working'),
  agent('リサ', 'リサーチャー', 'jp', 2, { body: '#9be3c9', accent: '#1dd1a1', style: 1, accessory: 'headset' }, 'thinking'),
  agent('コード丸', 'エンジニア', 'jp', 3, { body: '#a7b8ff', accent: '#54a0ff', style: 0 }, 'working'),
  human('ゆい', 'デザイナー', 'jp', 4, { body: '#ffd166', hair: '#8a4b2a', style: 4, accessory: 'flower', accent: '#ff9f43' }, 'offline'),
  agent('ペン子', 'ライター', 'jp', 5, { body: '#ffc4dd', accent: '#ff6b9a', style: 1, accessory: 'beret' }, 'working'),
  agent('カズ', '経理', 'jp', 6, { body: '#cfd8e3', accent: '#ffb347', style: 3, accessory: 'bowtie' }, 'waiting'),
  human('けんじ', '代表補佐', 'jp', 8, { body: '#3d4a6b', hair: '#1a1a22', style: 5, accent: '#ff5a4f', skin: '#f5c9a8' }),
  human('Sokha', '現地コーディネーター', 'kh', 0, { body: '#4fc3a1', hair: '#1a1410', style: 3, accessory: 'none', accent: '#ffd23f', skin: '#d9a47a' }, 'working'),
  human('Dara', '営業', 'kh', 1, { body: '#f0a04b', hair: '#15110e', style: 2, accessory: 'cap', accent: '#5b8def', skin: '#c99068' }),
  agent('Srey', 'クメール語翻訳', 'kh', 2, { body: '#ffd6a5', accent: '#ff9f43', style: 2, accessory: 'flower' }, 'working'),
  agent('Bot-Lin', 'QAテスター', 'kh', 3, { body: '#b9f3e4', accent: '#10c9a0', style: 5 }, 'thinking'),
  human('Chanthy', '講師', 'kh', 4, { body: '#c3a6ff', hair: '#2a1d14', style: 1, accessory: 'glasses', accent: '#a06cff', skin: '#e0b08a' }, 'away'),
  agent('Vibol', 'データ分析', 'kh', 5, { body: '#9fc8ff', accent: '#a06cff', style: 6, accessory: 'headset' }, 'working'),
  human('Piseth', 'インターン', 'kh', 8, { body: '#ff8fa3', hair: '#18120e', style: 6, accent: '#1dd1a1', skin: '#cf9a72' }),
  agent('マモル', 'セキュリティ', 'jp', 9, { body: '#ffb3a7', accent: '#ff5a4f', style: 7, accessory: 'cap' }, 'idle'),
]

const container = document.getElementById('world')!
const world = new OfficeWorld(container)
;(window as unknown as { __world: OfficeWorld }).__world = world
world.syncMembers(members)
world.onSelect = (id) => {
  world.setSelected(id)
  if (id) world.focus({ memberId: id })
  log(id ? `選択：${members.find((m) => m.id === id)?.name}` : '選択解除')
}

const logEl = document.getElementById('log')!
function log(s: string): void {
  const d = document.createElement('div')
  d.textContent = s
  logEl.prepend(d)
  while (logEl.childElementCount > 14) logEl.lastElementChild!.remove()
}

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-f]')) b.onclick = () => world.focus(b.dataset.f as 'all' | 'jp' | 'kh')

const LINES: Record<MessageKind, string[]> = {
  assign: ['市場調査をお願いします！', 'LPの文章を作ってください', 'クメール語に翻訳をお願い', 'テストケースの作成をお願いします'],
  chat: ['了解です！', 'いい感じです', 'このデータ見ました？', 'ちょっと相談いいですか'],
  question: ['締め切りはいつですか？', '対象は日本企業だけ？', 'この数字の出典は？'],
  answer: ['金曜までです', 'はい、まずは大阪の企業です', '経産省の調査です'],
  handoff: ['調査結果を渡します→ライターさんへ', '下書きできたのでレビューへ'],
  report: ['完了しました！成果物をアップしました', '3社分まとめました'],
  review: ['2か所だけ直しましょう', 'OK、承認です'],
  hire: ['新しい仲間です'],
  system: ['全体連絡：15時から定例です'],
}
const KINDS: MessageKind[] = ['assign', 'chat', 'question', 'answer', 'handoff', 'report', 'review']
const STATUSES: MemberStatus[] = ['idle', 'working', 'thinking', 'talking', 'waiting']
const TASKS = ['市場調査', 'LP制作', '翻訳（日→クメール）', '見積書の作成', 'テスト設計', '現地の会場手配', '契約書のレビュー']

function pick<T>(a: T[]): T {
  return a[Math.floor(Math.random() * a.length)]
}

const NAMES = ['ミライ', 'ハル', 'Kosal', 'ソラ', 'Mealea', 'ツムギ', 'Rithy', 'ノア']
const ROLES = ['マーケター', 'カスタマーサポート', '法務アシスタント', '動画編集', 'SNS運用', '採用担当']
let hireN = 0
function hireOne(): void {
  const office: OfficeId = hireN % 2 ? 'kh' : 'jp'
  const used = new Set(members.filter((m) => m.office === office).map((m) => m.deskIndex))
  let desk = 0
  while (used.has(desk)) desk++
  const m = agent(NAMES[hireN % NAMES.length], ROLES[hireN % ROLES.length], office, desk, {
    body: pick(['#ffd6a5', '#caffbf', '#9bf6ff', '#bdb2ff', '#ffc6ff', '#fdffb6']),
    accent: pick(['#ff7aa2', '#54a0ff', '#1dd1a1', '#ff9f43', '#a06cff']),
    style: hireN % 8,
    accessory: pick(['none', 'headset', 'ribbon', 'glasses', 'cap', 'bowtie']),
  })
  hireN++
  members.push(m)
  const nx = office === 'jp' ? 'nexmax' : 'nx086'
  world.hire(m)
  setTimeout(() => world.syncMembers(members), 50)
  world.message(nx, null, 'hire', `${m.name}（${m.role}）を採用しました！`)
  log(`採用：${m.name}（${m.role}）@${office}`)
}
document.getElementById('hire')!.onclick = hireOne

let running = !params.has('still')
const pauseBtn = document.getElementById('pause')!
pauseBtn.onclick = () => {
  running = !running
  pauseBtn.textContent = running ? 'デモ停止' : 'デモ再開'
}

function demoTick(): void {
  if (!running) return
  const pool = members.filter((m) => m.status !== 'offline')
  const r = Math.random()
  if (r < 0.3) {
    // ネクマックスからの依頼
    const nx = Math.random() < 0.6 ? 'nexmax' : 'nx086'
    const to = pick(pool.filter((m) => m.kind !== 'nexmax'))
    const task = pick(TASKS)
    world.message(nx, to.id, 'assign', `${to.name}さん、「${task}」をお願いします！`)
    world.setTaskLabel(to.id, task)
    to.status = 'working'
    to.currentTaskId = task
    world.syncMembers(members)
    log(`依頼：${to.name} ← ${task}`)
  } else if (r < 0.85) {
    const a = pick(pool)
    const b = pick(pool.filter((m) => m.id !== a.id))
    const k = pick(KINDS)
    world.message(a.id, b.id, k, pick(LINES[k]))
    log(`${a.name} → ${b.name}（${k}）${a.office !== b.office ? ' 🌉' : ''}`)
  } else if (r < 0.93) {
    const a = pick(members.filter((m) => m.kind !== 'nexmax' && m.status !== 'offline'))
    a.status = pick(STATUSES)
    world.syncMembers(members)
  } else {
    const a = pick(members.filter((m) => m.kind !== 'nexmax'))
    world.celebrate(a.id)
    world.setTaskLabel(a.id, null)
    log(`完了：${a.name}`)
  }
}

if (params.has('focus')) world.focus(params.get('focus') as 'all' | 'jp' | 'kh')
if (params.has('select')) {
  const id = params.get('select')!
  world.setSelected(id)
}
setInterval(demoTick, 1400)
setInterval(() => running && hireOne(), 8000)
world.setTaskLabel(members[3].id, 'LP制作')
world.setTaskLabel(members[4].id, '市場調査')
world.setTaskLabel(members[12].id, '翻訳（日→クメール）')
