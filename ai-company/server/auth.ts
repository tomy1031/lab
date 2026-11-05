// ログイン（scrypt でハッシュしたパスワード + HttpOnly クッキーのセッション）
// - セッションの鍵は SHA-256 のハッシュだけを保存する（state.json が漏れても、そのままではログインに使えない）
// - 使われないまま 14 日、または発行から 30 日でセッションは切れる
// - パスワードは 10 文字以上。変えたら、その人のほかのセッションはすべて切る
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Member } from '../shared/types'
import type { Store } from './store'
import { now } from './util'

export const COOKIE = 'nmai_session'
export const MIN_PASSWORD = 10
const IDLE_MS = 14 * 24 * 3600_000
const MAX_AGE_MS = 30 * 24 * 3600_000

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

export function hashPassword(password: string, salt = randomBytes(16).toString('hex')): { salt: string; hash: string } {
  return { salt, hash: scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex') }
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  const a = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 })
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** 初期パスワード（16 文字・記号なし） */
export function randomPassword(): string {
  return randomBytes(12).toString('base64url')
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD) return `パスワードは ${MIN_PASSWORD} 文字以上にしてください`
  if (pw.length > 200) return 'パスワードが長すぎます'
  if (/^(.)\1+$/.test(pw) || /^(password|passw0rd|12345678|qwerty)/i.test(pw)) return '推測されやすいパスワードは使えません'
  return null
}

export function setPassword(store: Store, memberId: string, login: string, password: string): void {
  const { salt, hash } = hashPassword(password)
  const users = store.state.users.filter((u) => u.memberId !== memberId && u.login !== login)
  users.push({ login, memberId, salt, hash })
  store.state.users = users
  // パスワードを変えたら、その人のセッションをすべて切る
  store.state.sessions = store.state.sessions.filter((s) => s.memberId !== memberId)
  store.save()
}

export function login(store: Store, loginName: string, password: string): { token: string; member: Member } | null {
  const u = store.state.users.find((x) => x.login === loginName)
  // ユーザーがいなくても同じくらい時間をかける（ログイン名の有無を時間で当てさせない）
  if (!u) {
    verifyPassword(password, '0'.repeat(32), '0'.repeat(64))
    return null
  }
  if (!verifyPassword(password, u.salt, u.hash)) return null
  const member = store.member(u.memberId)
  if (!member) return null
  const token = randomBytes(32).toString('base64url')
  const t = now()
  store.state.sessions.push({ tokenHash: sha(token), memberId: member.id, createdAt: t, lastSeen: t })
  // 1 人 10 個まで（古いものから捨てる）
  const mine = store.state.sessions.filter((s) => s.memberId === member.id)
  if (mine.length > 10) {
    const drop = new Set(mine.slice(0, mine.length - 10).map((s) => s.tokenHash))
    store.state.sessions = store.state.sessions.filter((s) => !drop.has(s.tokenHash))
  }
  store.save()
  return { token, member }
}

export function logout(store: Store, token: string | undefined): void {
  if (!token) return
  const h = sha(token)
  store.state.sessions = store.state.sessions.filter((s) => s.tokenHash !== h)
  store.save()
}

export function tokenFrom(req: IncomingMessage): string | undefined {
  const raw = req.headers.cookie ?? ''
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === COOKIE) return decodeURIComponent(v.join('='))
  }
  return undefined
}

/** 期限切れと、古い形式（ハッシュでない）のセッションを捨てる */
export function pruneSessions(store: Store): void {
  const t = Date.now()
  const before = store.state.sessions.length
  store.state.sessions = store.state.sessions.filter((s) => s.tokenHash && t - Date.parse(s.lastSeen) < IDLE_MS && t - Date.parse(s.createdAt) < MAX_AGE_MS)
  if (store.state.sessions.length !== before) store.save()
}

export function memberFrom(store: Store, req: IncomingMessage): Member | null {
  const token = tokenFrom(req)
  if (!token || token.length > 100) return null
  const h = sha(token)
  const s = store.state.sessions.find((x) => x.tokenHash === h)
  if (!s) return null
  const t = Date.now()
  if (t - Date.parse(s.lastSeen) > IDLE_MS || t - Date.parse(s.createdAt) > MAX_AGE_MS) {
    store.state.sessions = store.state.sessions.filter((x) => x !== s)
    store.save()
    return null
  }
  // 最後に使った時刻は 10 分に 1 回だけ書く
  if (t - Date.parse(s.lastSeen) > 600_000) {
    s.lastSeen = now()
    store.save()
  }
  return store.member(s.memberId) ?? null
}

/** HTTPS の裏（Cloudflare Tunnel など）で動かすときは Secure を付ける */
export function isHttps(req: IncomingMessage): boolean {
  if (process.env.COOKIE_SECURE === '1') return true
  return process.env.TRUST_PROXY === '1' && String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https'
}

export function sessionCookie(token: string, secure: boolean, maxAgeSec = MAX_AGE_MS / 1000): string {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`
}
