// 最初の起動：ネクマックス 2 体（日本の初号機・カンボジアの量産型）と、管理者、デモの人間を用意する。
// AI社員は最初はいない（ゴールに応じて「採用」される）。
import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Member, OfficeId } from '../shared/types'
import { setPassword } from './auth'
import { remember } from './memory'
import type { Store } from './store'
import { id, lookForHuman, now } from './util'

function human(name: string, office: OfficeId, role: string, skills: string[], languages: string[], desk: number, login?: string, isAdmin = false): Member {
  return {
    id: id('hu'),
    kind: 'human',
    name,
    role,
    office,
    skills,
    languages,
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

export function seed(store: Store, credentialsFile: string): string[] {
  const lines: string[] = []
  const nx: Member = {
    id: 'nexmax',
    kind: 'nexmax',
    name: 'ネクマックス',
    role: 'AI統括（初号機）',
    office: 'jp',
    skills: ['タスク分解', '採用', '進行管理', '報告'],
    languages: ['ja', 'en', 'km'],
    persona: 'ネクストメイクのマスコット。明るく前向きで、みんなの仕事をつなぐ',
    look: { body: '#66b2f0', accent: '#59e6ff', style: 0, nexmaxVariant: 'protagonist' },
    deskIndex: -1,
    status: 'idle',
    hiredAt: now(),
    hiredBy: 'system',
    stats: { tasksDone: 0, messages: 0 },
  }
  const nxKh: Member = {
    ...nx,
    id: 'nexmax_kh',
    name: 'ネクマックス NX-086',
    role: 'AI統括（量産型・カンボジア）',
    office: 'kh',
    look: { body: '#66b2f0', accent: '#ffd166', style: 1, nexmaxVariant: 'production', serial: 86 },
    stats: { tasksDone: 0, messages: 0 },
  }
  store.state.members.push(nx, nxKh)

  const adminLogin = process.env.ADMIN_LOGIN || 'admin'
  const adminPass = process.env.ADMIN_PASSWORD || randomBytes(6).toString('base64url')
  const admin = human(process.env.ADMIN_NAME || '管理者', 'jp', '管理者', ['意思決定', '承認', '顧客対応'], ['ja'], 0, adminLogin, true)
  store.state.members.push(admin)
  setPassword(store, admin.id, adminLogin, adminPass)
  lines.push(`管理者    login=${adminLogin}  password=${adminPass}`)

  if (process.env.SEED_DEMO !== '0') {
    const demo: [string, OfficeId, string, string[], string[], number, string][] = [
      ['さくら（デモ）', 'jp', '営業', ['営業', '顧客対応', '商談', '意思決定'], ['ja', 'en'], 1, 'sakura'],
      ['ソカ（デモ）', 'kh', '現地マネージャー', ['現地対応', '現地調整', 'クメール語', '学校との調整'], ['km', 'en', 'ja'], 0, 'sokha'],
      ['ダリス（デモ）', 'kh', '会場・総務', ['現地対応', '会場手配', '支払い'], ['km', 'en'], 1, 'dalis'],
    ]
    for (const [name, office, role, skills, langs, desk, login] of demo) {
      const m = human(name, office, role, skills, langs, desk, login)
      store.state.members.push(m)
      const pw = randomBytes(6).toString('base64url')
      setPassword(store, m.id, login, pw)
      lines.push(`${name.padEnd(10)} login=${login}  password=${pw}`)
    }
  }
  for (const m of store.state.members) {
    remember(store, m.id, 'note', m.kind === 'nexmax' ? '会社の統括 AI として起動' : '会社に登録', { importance: 2 })
  }
  store.flush()
  mkdirSync(dirname(credentialsFile), { recursive: true })
  writeFileSync(credentialsFile, `# 初期アカウント（このファイルはリポジトリに入れない）\n${lines.join('\n')}\n`)
  return lines
}
