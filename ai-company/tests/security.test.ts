// 守りのテスト：AI社員の道具の検査、ログインのセッション
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkTool, insideDir, safeUrl } from '../server/engine/guard'
import { Store } from '../server/store'
import { login, logout, memberFrom, passwordProblem, setPassword } from '../server/auth'

describe('AI社員の道具の検査', () => {
  const root = mkdtempSync(join(tmpdir(), 'guard-'))
  const ws = join(root, 'ws', 'goal_1')
  mkdirSync(ws, { recursive: true })
  writeFileSync(join(root, 'secret.json'), '{}')
  symlinkSync(join(root, 'secret.json'), join(ws, 'link.json'))

  it('作業フォルダの中は使える', () => {
    expect(insideDir(ws, 'plan.md')).toBe(true)
    expect(insideDir(ws, join(ws, 'sub', 'a.md'))).toBe(true)
    expect(checkTool(ws, 'Write', { file_path: join(ws, 'a.md'), content: 'x' }, false).ok).toBe(true)
    expect(checkTool(ws, 'Glob', { pattern: '**/*.md' }, false).ok).toBe(true)
  })
  it('外へは出られない（../・絶対パス・シンボリックリンク）', () => {
    expect(checkTool(ws, 'Read', { file_path: '../../secret.json' }, false).ok).toBe(false)
    expect(checkTool(ws, 'Read', { file_path: join(root, 'secret.json') }, false).ok).toBe(false)
    expect(checkTool(ws, 'Read', { file_path: '/etc/passwd' }, false).ok).toBe(false)
    expect(checkTool(ws, 'Read', { file_path: join(ws, 'link.json') }, false).ok).toBe(false)
    expect(checkTool(ws, 'Grep', { pattern: 'x', path: root }, false).ok).toBe(false)
    expect(checkTool(ws, 'Glob', { pattern: '../**/*.json' }, false).ok).toBe(false)
  })
  it('社内ネットワーク・メタデータ・http には行かせない', () => {
    for (const u of ['http://example.com', 'https://localhost/x', 'https://127.0.0.1/', 'https://169.254.169.254/latest/meta-data', 'https://10.0.0.5/', 'https://192.168.1.1', 'https://[::1]/', 'https://metadata.google.internal/', 'https://user:pw@example.com/', 'https://intranet/'])
      expect(safeUrl(u).ok, u).toBe(false)
    expect(safeUrl('https://www.nextmake.site/').ok).toBe(true)
    expect(checkTool(ws, 'WebFetch', { url: 'https://169.254.169.254/' }, false).ok).toBe(false)
  })
  it('許していない道具は止める', () => {
    expect(checkTool(ws, 'Bash', { command: 'cat /etc/passwd' }, false).ok).toBe(false)
    expect(checkTool(ws, 'Task', {}, false).ok).toBe(false)
    expect(checkTool(ws, 'mcp__company__ask_colleague', { to: 'x', question: 'y' }, false).ok).toBe(true)
  })
})

describe('ログインのセッション', () => {
  const dir = mkdtempSync(join(tmpdir(), 'auth-'))
  const store = new Store(join(dir, 's.json'))
  store.state.members.push({ id: 'hu_1', kind: 'human', name: 'A', role: 'x', office: 'osaka', skills: [], languages: [], look: { body: '#fff', accent: '#000', style: 0 }, deskIndex: 0, status: 'idle', hiredAt: new Date().toISOString(), stats: { tasksDone: 0, messages: 0 } })
  setPassword(store, 'hu_1', 'a', 'correct horse battery')
  const req = (token?: string) => ({ headers: { cookie: token ? `nmai_session=${encodeURIComponent(token)}` : '' } }) as never

  it('鍵そのものは保存しない', () => {
    const r = login(store, 'a', 'correct horse battery')!
    expect(r).toBeTruthy()
    expect(JSON.stringify(store.state.sessions)).not.toContain(r.token)
    expect(memberFrom(store, req(r.token))?.id).toBe('hu_1')
    logout(store, r.token)
    expect(memberFrom(store, req(r.token))).toBeNull()
  })
  it('違うパスワード・期限切れは通らない', () => {
    expect(login(store, 'a', 'wrong')).toBeNull()
    expect(login(store, 'nobody', 'x')).toBeNull()
    const r = login(store, 'a', 'correct horse battery')!
    store.state.sessions.at(-1)!.lastSeen = new Date(Date.now() - 15 * 86400_000).toISOString()
    expect(memberFrom(store, req(r.token))).toBeNull()
  })
  it('パスワードを変えるとほかのセッションは切れる', () => {
    const r = login(store, 'a', 'correct horse battery')!
    setPassword(store, 'hu_1', 'a', 'another long passphrase')
    expect(memberFrom(store, req(r.token))).toBeNull()
  })
  it('弱いパスワードは断る', () => {
    expect(passwordProblem('short')).toBeTruthy()
    expect(passwordProblem('aaaaaaaaaaaa')).toBeTruthy()
    expect(passwordProblem('password1234')).toBeTruthy()
    expect(passwordProblem('kumo-no-ue-de-odoru')).toBeNull()
  })
})
