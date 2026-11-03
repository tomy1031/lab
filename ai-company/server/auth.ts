// ログイン（scrypt でハッシュしたパスワード + HttpOnly クッキーのセッション）
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Member } from '../shared/types'
import type { Store } from './store'
import { now } from './util'

export const COOKIE = 'nmai_session'

export function hashPassword(password: string, salt = randomBytes(16).toString('hex')): { salt: string; hash: string } {
  return { salt, hash: scryptSync(password, salt, 32).toString('hex') }
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  const a = scryptSync(password, salt, 32)
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export function setPassword(store: Store, memberId: string, login: string, password: string): void {
  const { salt, hash } = hashPassword(password)
  const users = store.state.users.filter((u) => u.memberId !== memberId && u.login !== login)
  users.push({ login, memberId, salt, hash })
  store.state.users = users
  store.save()
}

export function login(store: Store, loginName: string, password: string): { token: string; member: Member } | null {
  const u = store.state.users.find((x) => x.login === loginName)
  if (!u || !verifyPassword(password, u.salt, u.hash)) return null
  const member = store.member(u.memberId)
  if (!member) return null
  const token = randomBytes(24).toString('base64url')
  store.state.sessions.push({ token, memberId: member.id, createdAt: now() })
  // 古いセッションは 1 人 10 個まで
  const mine = store.state.sessions.filter((s) => s.memberId === member.id)
  if (mine.length > 10) {
    const drop = new Set(mine.slice(0, mine.length - 10).map((s) => s.token))
    store.state.sessions = store.state.sessions.filter((s) => !drop.has(s.token))
  }
  store.save()
  return { token, member }
}

export function logout(store: Store, token: string | undefined): void {
  if (!token) return
  store.state.sessions = store.state.sessions.filter((s) => s.token !== token)
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

export function memberFrom(store: Store, req: IncomingMessage): Member | null {
  const token = tokenFrom(req)
  if (!token) return null
  const s = store.state.sessions.find((x) => x.token === token)
  return (s && store.member(s.memberId)) || null
}

/** HTTPS の裏で動かすときは COOKIE_SECURE=1 */
const SECURE = process.env.COOKIE_SECURE === '1' ? '; Secure' : ''

export function sessionCookie(token: string, maxAgeSec = 60 * 60 * 24 * 30): string {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${SECURE}`
}
