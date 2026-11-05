// 会社の初期メンバーと、古いデータの読み替え。
// - ネクマックス（初号機）は大阪本社の社長席で、松井社長の隣（0 番 = 社長、1 番 = ネクマックス）。社長の分身として働く
// - ネクマックス NX-086（量産型）はプノンペンの統括
// - 東京オフィスは、いまは人間 1 人
// AI社員は最初はいない（ゴールに応じて「採用」される）。
import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Member, OfficeId } from '../shared/types'
import { OFFICES, normalizeOffice } from '../shared/types'
import { setPassword } from './auth'
import { remember } from './memory'
import type { Store } from './store'
import { id, lookForHuman, now } from './util'

export const CEO_DESK = 0
export const NEXMAX_DESK = 1

function human(name: string, office: OfficeId, role: string, skills: string[], languages: string[], desk: number, login?: string, isAdmin = false, persona?: string): Member {
  return {
    id: id('hu'),
    kind: 'human',
    name,
    role,
    office,
    skills,
    languages,
    persona,
    look: lookForHuman(name, office),
    deskIndex: desk,
    status: 'offline',
    hiredAt: now(),
    hiredBy: 'system',
    login,
    isAdmin,
    online: false,
    stats: { tasksDone: 0, messages: 0 },
  }
}

function nexmax(): Member {
  return {
    id: 'nexmax',
    kind: 'nexmax',
    name: 'ネクマックス',
    role: 'AI統括（社長の分身）',
    office: 'osaka',
    skills: ['タスク分解', '採用', '進行管理', '報告'],
    languages: ['ja', 'en', 'km'],
    persona: '松井社長の隣の席で、社長の分身として働く統括 AI。社長の方針と過去の判断を踏まえ、ゴールを分け、人と AI に仕事を配る。明るく前向き',
    look: { body: '#66b2f0', accent: '#59e6ff', style: 0, nexmaxVariant: 'protagonist' },
    deskIndex: NEXMAX_DESK,
    status: 'idle',
    hiredAt: now(),
    hiredBy: 'system',
    stats: { tasksDone: 0, messages: 0 },
  }
}

function nexmaxKh(): Member {
  return {
    ...nexmax(),
    id: 'nexmax_kh',
    name: 'ネクマックス NX-086',
    role: 'AI統括（量産型・カンボジア）',
    office: 'phnompenh',
    persona: 'プノンペンオフィスの統括を任された量産型ネクマックス。初号機と連携して、カンボジア側の仕事を配る',
    look: { body: '#66b2f0', accent: '#ffd166', style: 1, nexmaxVariant: 'production', serial: 86 },
    deskIndex: -1,
    stats: { tasksDone: 0, messages: 0 },
  }
}

/** その拠点の空いている席（避けたい席を指定できる） */
function freeDesk(store: Store, office: OfficeId, avoid: number[] = []): number {
  // 社長席（0・1 番）を空けておくのは大阪本社だけ
  if (office !== 'osaka') avoid = []
  const desks = OFFICES.find((o) => o.id === office)?.desks ?? 12
  const used = new Set(store.state.members.filter((m) => m.office === office).map((m) => m.deskIndex))
  for (let i = 0; i < desks; i++) if (!used.has(i) && !avoid.includes(i)) return i
  return desks + used.size // 満席なら手前の広場
}

/** 席を空けてから座らせる（座っていた人は空いている席へ） */
function seat(store: Store, m: Member, office: OfficeId, desk: number): void {
  const occupant = store.state.members.find((x) => x !== m && x.office === office && x.deskIndex === desk)
  m.office = office
  m.deskIndex = desk
  if (occupant) occupant.deskIndex = freeDesk(store, office, [CEO_DESK, NEXMAX_DESK])
}

function account(store: Store, m: Member, login: string, lines: string[]): void {
  if (store.state.users.some((u) => u.login === login)) return
  const pw = randomBytes(6).toString('base64url')
  setPassword(store, m.id, login, pw)
  m.login = login
  lines.push(`${m.name.padEnd(12)} login=${login}  password=${pw}`)
}

export function seed(store: Store, credentialsFile: string): string[] {
  const lines: string[] = []
  store.state.members.push(nexmax(), nexmaxKh())

  const adminLogin = process.env.ADMIN_LOGIN || 'admin'
  const adminPass = process.env.ADMIN_PASSWORD || randomBytes(6).toString('base64url')
  const admin = human(process.env.ADMIN_NAME || '管理者', 'osaka', '管理者', ['意思決定', '承認', '顧客対応'], ['ja'], 2, adminLogin, true)
  store.state.members.push(admin)
  setPassword(store, admin.id, adminLogin, adminPass)
  lines.push(`${admin.name.padEnd(12)} login=${adminLogin}  password=${adminPass}`)

  if (process.env.SEED_DEMO !== '0') {
    const demo: [string, OfficeId, string, string[], string[], string][] = [
      ['さくら（デモ）', 'osaka', '営業', ['営業', '顧客対応', '商談', '意思決定'], ['ja', 'en'], 'sakura'],
      ['ソカ（デモ）', 'phnompenh', '現地マネージャー', ['現地対応', '現地調整', 'クメール語', '学校との調整'], ['km', 'en', 'ja'], 'sokha'],
      ['ダリス（デモ）', 'phnompenh', '会場・総務', ['現地対応', '会場手配', '支払い'], ['km', 'en'], 'dalis'],
    ]
    for (const [name, office, role, skills, langs, login] of demo) {
      const m = human(name, office, role, skills, langs, freeDesk(store, office, [CEO_DESK, NEXMAX_DESK]))
      store.state.members.push(m)
      account(store, m, login, lines)
    }
  }
  lines.push(...ensureCore(store))
  for (const m of store.state.members) {
    remember(store, m.id, 'note', m.kind === 'nexmax' ? '会社の統括 AI として起動' : '会社に登録', { importance: 2 })
  }
  store.flush()
  mkdirSync(dirname(credentialsFile), { recursive: true })
  writeFileSync(credentialsFile, `# 初期アカウント（このファイルはリポジトリに入れない）\n${lines.join('\n')}\n`)
  return lines
}

/**
 * 毎回の起動で呼ぶ（何度呼んでも同じ結果）：
 * 古い拠点 id（jp / kh）の読み替え、社長とネクマックスの社長席、東京オフィスの人間 1 人。
 * 新しく作ったアカウントの行を返す（credentials.txt に追記する）
 */
export function ensureCore(store: Store, credentialsFile?: string): string[] {
  const lines: string[] = []
  const s = store.state
  for (const m of s.members) m.office = normalizeOffice(m.office)
  for (const t of s.tasks) if (t.office) t.office = normalizeOffice(t.office)

  // 社長
  let ceo = s.members.find((m) => m.kind === 'human' && /代表|社長/.test(m.role))
  if (!ceo) {
    ceo = human(process.env.CEO_NAME || '松井 亮', 'osaka', '代表取締役社長', ['経営判断', '意思決定', '承認', '営業', 'カンボジア事業'], ['ja', 'en'], CEO_DESK, undefined, true, 'ネクストメイクの代表。隣の席のネクマックスに、自分の分身として仕事を任せている')
    s.members.push(ceo)
    account(store, ceo, process.env.CEO_LOGIN || 'matsui', lines)
    remember(store, ceo.id, 'note', '会社に登録（代表）', { importance: 2 })
  }
  seat(store, ceo, 'osaka', CEO_DESK)

  // ネクマックス（初号機）は社長の隣
  let nx = s.members.find((m) => m.id === 'nexmax')
  if (!nx) {
    nx = nexmax()
    s.members.push(nx)
  }
  nx.role = 'AI統括（社長の分身）'
  nx.persona = nexmax().persona
  seat(store, nx, 'osaka', NEXMAX_DESK)
  if (!s.members.some((m) => m.id === 'nexmax_kh')) s.members.push(nexmaxKh())
  const nk = s.members.find((m) => m.id === 'nexmax_kh')!
  nk.office = 'phnompenh'
  nk.deskIndex = -1

  // 東京オフィス（いまは人間 1 人）
  if (!s.members.some((m) => m.office === 'tokyo' && m.kind === 'human')) {
    const tk = human(process.env.TOKYO_NAME || '東京メンバー（仮）', 'tokyo', '東京オフィス（営業・顧客対応）', ['営業', '顧客対応', '東京での対面'], ['ja'], freeDesk(store, 'tokyo'))
    s.members.push(tk)
    account(store, tk, process.env.TOKYO_LOGIN || 'tokyo', lines)
    remember(store, tk.id, 'note', '東京オフィスに登録', { importance: 2 })
  }

  // 席の重なりを解く（同じ拠点・同じ席に 2 人いたら後の人を空いている席へ）
  for (const o of OFFICES) {
    const seen = new Set<number>()
    for (const m of s.members.filter((x) => x.office === o.id && x.deskIndex >= 0)) {
      if (seen.has(m.deskIndex)) m.deskIndex = freeDesk(store, o.id, [CEO_DESK, NEXMAX_DESK])
      seen.add(m.deskIndex)
    }
  }
  store.save()
  if (credentialsFile && lines.length) {
    mkdirSync(dirname(credentialsFile), { recursive: true })
    if (!existsSync(credentialsFile)) writeFileSync(credentialsFile, '# 初期アカウント（このファイルはリポジトリに入れない）\n')
    appendFileSync(credentialsFile, lines.join('\n') + '\n')
  }
  return lines
}
