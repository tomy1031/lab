// HTTP（REST）＋ WebSocket（リアルタイム）＋ 書き出した画面（dist/）の配信。
// 起動：npm run dev（開発。画面は http://localhost:5173）／ npm run build && npm start（本番。http://localhost:8787）
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import type { Member, Message, OfficeId, ServerEvent, Snapshot } from '../shared/types'
import { OFFICES, countryOf, normalizeOffice, officeInfo } from '../shared/types'
import { isHttps, login, logout, memberFrom, passwordProblem, pruneSessions, sessionCookie, setPassword, tokenFrom, verifyPassword } from './auth'
import { Company } from './company'
import { ClaudeEngine } from './engine/claude'
import { SimEngine } from './engine/sim'
import type { Engine } from './engine/types'
import { contextOf, remember } from './memory'
import { NodeWorkspace } from './nodeWorkspace'
import { ensureCore, seed } from './seed'
import { Store } from './store'
import { hashStr, id, lookForHuman, now } from './util'

const ROOT = resolve(import.meta.dirname, '..')
const DATA = resolve(process.env.DATA_DIR || join(ROOT, 'data'))
const WORKSPACE = resolve(process.env.WORKSPACE_DIR || join(ROOT, 'workspace'))
const DIST = join(ROOT, 'dist')
const PORT = Number(process.env.PORT || 8787)
/** 既定は自分の PC の中だけ（127.0.0.1）。外から直接つながせず、Cloudflare Tunnel などの入口だけを通す。直接公開するときだけ HOST=0.0.0.0 */
const HOST = process.env.HOST || '127.0.0.1'
/** 画面を開いてよい Origin（カンマ区切り）。未指定なら、リクエストの Host と同じ Origin だけ */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)

const store = new Store(join(DATA, 'state.json'))
if (store.isFresh) {
  const lines = seed(store, join(DATA, 'credentials.txt'))
  console.log('\n=== 初期アカウントを作りました（data/credentials.txt にも保存）===')
  for (const l of lines) console.log('  ' + l)
  console.log('')
}
{
  // 古いデータの読み替え・社長とネクマックスの社長席・東京オフィス（何度呼んでも同じ）
  const lines = ensureCore(store, join(DATA, 'credentials.txt'))
  if (lines.length) {
    console.log('\n=== 新しいアカウント（data/credentials.txt に追記）===')
    for (const l of lines) console.log('  ' + l)
  }
}

// ------------------------------------------------------------------ エンジン

function defaultEngine(): 'claude' | 'sim' {
  const env = process.env.AI_ENGINE
  if (env === 'claude' || env === 'sim') return env
  return store.state.settings.engine ?? 'sim'
}
const engines: Record<'claude' | 'sim', Engine> = { claude: new ClaudeEngine(), sim: new SimEngine() }
let engineMode = defaultEngine()
const company = new Company(store, () => engines[engineMode], new NodeWorkspace(WORKSPACE))
company.recover()

// ------------------------------------------------------------------ WebSocket

const clients = new Map<WebSocket, string>()
const onlineCount = new Map<string, number>()

store.on('event', (ev: ServerEvent) => {
  const data = JSON.stringify(ev)
  // やることストックは持ち主の画面にだけ届ける
  const only = ev.t === 'stock' ? ev.item.owner : null
  for (const [ws, mid] of clients) if (ws.readyState === ws.OPEN && (!only || mid === only)) ws.send(data)
})

function snapshot(me: Member | null): Snapshot {
  const s = store.state
  return {
    me,
    offices: OFFICES,
    members: s.members,
    goals: s.goals.slice(-60),
    tasks: s.tasks.filter((t) => s.goals.slice(-60).some((g) => g.id === t.goalId)),
    messages: mergeMessages(s.messages.slice(-200), me ? s.messages.filter((m) => m.toId === me.id && m.kind === 'question').slice(-30) : []),
    activities: s.activities.slice(-200),
    engine: engines[engineMode].info,
    stock: me ? store.stockOf(me.id).filter((x) => x.status !== 'archived' || Date.now() - Date.parse(x.updatedAt) < 3600_000).slice(-200) : [],
    gate: company.gateInfo(),
  }
}

function mergeMessages(a: Message[], b: Message[]): Message[] {
  const ids = new Set(a.map((m) => m.id))
  return [...b.filter((m) => !ids.has(m.id)), ...a].sort((x, y) => x.at.localeCompare(y.at))
}

function setOnline(memberId: string, delta: number): void {
  const n = Math.max(0, (onlineCount.get(memberId) ?? 0) + delta)
  onlineCount.set(memberId, n)
  const m = store.member(memberId)
  if (!m || m.kind !== 'human') return
  const online = n > 0
  if (m.online !== online) {
    store.patchMember(m.id, { online, status: online ? 'idle' : 'offline' })
    if (online) company.activity('info', `${m.name} さんがログインしました`, m.id)
  }
}

// ------------------------------------------------------------------ HTTP

type Handler = (req: IncomingMessage, res: ServerResponse, me: Member | null, params: string[], body: Record<string, unknown>) => unknown

const routes: { method: string; re: RegExp; auth: boolean; h: Handler }[] = []
const route = (method: string, path: string, auth: boolean, h: Handler) =>
  routes.push({ method, re: new RegExp('^' + path.replace(/:[a-z]+/g, '([^/]+)') + '$'), auth, h })

class HttpError extends Error {
  constructor(
    readonly status: number,
    msg: string,
  ) {
    super(msg)
  }
}
const need = (cond: unknown, status: number, msg: string) => {
  if (!cond) throw new HttpError(status, msg)
}
const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const list = (v: unknown) =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,、，\s]+/) : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 20)

/** ログインの失敗が続いたら待たせる（ログイン名ごと 10 分に 8 回・接続元ごと 10 分に 30 回まで） */
const failures = new Map<string, number[]>()
const clientIp = (req: IncomingMessage) =>
  (process.env.TRUST_PROXY === '1' ? String(req.headers['cf-connecting-ip'] ?? req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '') || req.socket.remoteAddress || '?'
const tooMany = (key: string, limit: number) => (failures.get(key) ?? []).filter((t) => Date.now() - t < 10 * 60_000).length >= limit
const fail = (key: string) => failures.set(key, [...(failures.get(key) ?? []).filter((t) => Date.now() - t < 10 * 60_000), Date.now()])
setInterval(() => {
  for (const [k, v] of failures) if (!v.some((t) => Date.now() - t < 10 * 60_000)) failures.delete(k)
}, 10 * 60_000).unref()

route('POST', '/api/login', false, (req, res, _me, _p, b) => {
  const name = str(b.login, 64)
  const ip = `ip:${clientIp(req)}`
  need(!tooMany(name, 8) && !tooMany(ip, 30), 429, 'ログインの失敗が続いたので、10 分ほど待ってからお試しください')
  const r = login(store, name, str(b.password, 200))
  if (!r) {
    fail(name)
    fail(ip)
  }
  need(r, 401, 'ログイン名かパスワードが違います')
  failures.delete(name)
  res.setHeader('Set-Cookie', sessionCookie(r!.token, isHttps(req)))
  return { me: r!.member }
})

route('POST', '/api/logout', false, (req, res) => {
  logout(store, tokenFrom(req))
  res.setHeader('Set-Cookie', sessionCookie('', isHttps(req), 0))
  return { ok: true }
})

/** 自分のパスワードを変える（今のパスワードが要る）。変えたらほかの端末のログインは切れる */
route('POST', '/api/password', true, (req, res, me, _p, b) => {
  const u = store.state.users.find((x) => x.memberId === me!.id)
  need(u, 400, 'この人はログインできません')
  need(!tooMany(`pw:${me!.id}`, 8), 429, '失敗が続いたので、10 分ほど待ってからお試しください')
  if (!verifyPassword(str(b.current, 200), u!.salt, u!.hash)) {
    fail(`pw:${me!.id}`)
    throw new HttpError(400, '今のパスワードが違います')
  }
  const next = typeof b.next === 'string' ? b.next : ''
  const problem = passwordProblem(next)
  need(!problem, 400, problem ?? '')
  setPassword(store, me!.id, u!.login, next)
  const r = login(store, u!.login, next)
  if (r) res.setHeader('Set-Cookie', sessionCookie(r.token, isHttps(req)))
  company.activity('info', `${me!.name} さんがパスワードを変更しました`, me!.id)
  return { ok: true }
})

route('GET', '/api/me', false, (_req, _res, me) => ({ me }))
route('GET', '/api/snapshot', true, (_req, _res, me) => snapshot(me))

route('POST', '/api/goals', true, (_req, _res, me, _p, b) => {
  const title = str(b.title, 200)
  need(title, 400, 'ゴールを書いてください')
  return { goal: company.createGoal(me!, title, str(b.description, 4000)) }
})

// ---- 承認の関所：承認する人だけが「始める／見送る」を押せる
const asBad = <T>(f: () => T): T => {
  try {
    return f()
  } catch (e) {
    throw new HttpError(400, (e as Error).message)
  }
}
route('POST', '/api/goals/:id/approve', true, (_req, _res, me, [gid]) => ({ goal: asBad(() => company.approveGoal(gid, me!)) }))
route('POST', '/api/goals/:id/decline', true, (_req, _res, me, [gid], b) => ({ goal: asBad(() => company.declineGoal(gid, me!, str(b.note, 400))) }))
route('POST', '/api/messages/:id/approve', true, async (_req, _res, me, [mid]) => {
  const q = store.state.messages.find((m) => m.id === mid)
  need(q?.approval?.state === 'pending', 400, 'この話しかけはいま承認待ちではありません')
  asBad(() => company.checkApprover(me!))
  void company.approveTalk(mid, me!).catch((e) => console.error('[talk]', e))
  return { ok: true }
})
route('POST', '/api/messages/:id/decline', true, (_req, _res, me, [mid], b) => {
  asBad(() => company.declineTalk(mid, me!, str(b.note, 400)))
  return { ok: true }
})
route('POST', '/api/gate', true, (_req, _res, me, _p, b) => ({
  gate: asBad(() =>
    company.setGate(me!, {
      mode: b.mode === 'auto' || b.mode === 'manual' ? b.mode : undefined,
      approverId: typeof b.approverId === 'string' ? b.approverId : undefined,
      autoFrom: b.autoFrom === 'all' ? 'all' : Array.isArray(b.autoFrom) ? b.autoFrom.map(String) : undefined,
      dailyLimit: b.dailyLimit === undefined ? undefined : Number(b.dailyLimit),
    }),
  ),
}))

route('POST', '/api/goals/:id/cancel', true, (_req, _res, me, [gid]) => {
  asBad(() => company.cancelGoal(gid, me!))
  return { ok: true }
})

route('POST', '/api/tasks/:id/complete', true, (_req, _res, me, [tid], b) => {
  try {
    return { task: company.completeHumanTask(tid, me!, str(b.note, 4000)) }
  } catch (e) {
    throw new HttpError(400, (e as Error).message)
  }
})

route('POST', '/api/tasks/:id/retry', true, (_req, _res, me, [tid]) => {
  company.retryTask(tid, me!)
  return { ok: true }
})

route('POST', '/api/talk', true, (_req, _res, me, _p, b) => {
  const to = store.member(str(b.to, 80))
  const text = str(b.text, 1000)
  need(to && to.id !== me!.id, 400, '相手を選んでください')
  need(text, 400, '話す内容を書いてください')
  void company.talk(me!, to!, text)
  return { ok: true }
})

route('POST', '/api/messages/:id/reply', true, (_req, _res, me, [mid], b) => {
  const text = str(b.text, 2000)
  need(text, 400, '返事を書いてください')
  try {
    return { message: company.reply(mid, me!, text) }
  } catch (e) {
    throw new HttpError(400, (e as Error).message)
  }
})

// ------------------------------------------------------------------ やることストック（本人だけ）

/** 話した（書いた）ことを 1 つ受け取る。1 人 1 分に 40 件まで */
const stockRate = new Map<string, number[]>()
route('POST', '/api/stock', true, (_req, _res, me, _p, b) => {
  const text = str(b.text, 1000)
  need(text.length >= 2, 400, '話した内容が空です')
  const recent = (stockRate.get(me!.id) ?? []).filter((t) => Date.now() - t < 60_000)
  need(recent.length < 40, 429, '少し待ってから話してください')
  stockRate.set(me!.id, [...recent, Date.now()])
  return { item: company.addStock(me!, text) }
})

route('POST', '/api/stock/:id/:action', true, (_req, _res, me, [sid, action], b) => {
  need(['send', 'done', 'later', 'archive', 'restore'].includes(action), 400, '操作が違います')
  const patch: { title?: string; kind?: 'goal' | 'self' | 'memo' } = {}
  if (typeof b.title === 'string' && str(b.title, 60)) patch.title = str(b.title, 60)
  if (b.kind === 'goal' || b.kind === 'self' || b.kind === 'memo') patch.kind = b.kind
  try {
    return { item: company.actOnStock(sid, me!, action as 'send' | 'done' | 'later' | 'archive' | 'restore', patch) }
  } catch (e) {
    throw new HttpError(400, (e as Error).message)
  }
})

route('GET', '/api/members/:id/memory', true, (_req, _res, _me, [mid]) => {
  const m = store.member(mid)
  need(m, 404, '見つかりません')
  return { memory: store.memoryOf(mid).slice(-200), context: contextOf(store, m!).memories }
})

route('POST', '/api/members/:id/memory', true, (_req, _res, me, [mid], b) => {
  const m = store.member(mid)
  need(m, 404, '見つかりません')
  const text = str(b.text, 600)
  need(text, 400, 'メモを書いてください')
  return { entry: remember(store, mid, 'feedback', `${me!.name}より：${text}`, { importance: 8 }) }
})

/** 人間の登録（管理者）。login と password があればログインできる */
route('POST', '/api/members', true, (_req, _res, me, _p, b) => {
  need(me!.isAdmin, 403, '管理者だけが登録できます')
  const name = str(b.name, 40)
  need(name, 400, '名前を書いてください')
  const office: OfficeId = normalizeOffice(b.office)
  const place = company.placeFor(office)
  need(place, 409, '席が満席です')
  const loginName = str(b.login, 40)
  if (loginName) need(!store.state.users.some((u) => u.login === loginName), 409, 'そのログイン名は使われています')
  const m: Member = {
    id: id('hu'),
    kind: 'human',
    name,
    role: str(b.role, 40) || 'メンバー',
    office: place!.office,
    skills: list(b.skills),
    languages: list(b.languages).length ? list(b.languages) : [countryOf(office) === 'kh' ? 'km' : 'ja'],
    persona: str(b.persona, 400) || undefined,
    look: lookForHuman(name + hashStr(now()), place!.office),
    deskIndex: place!.desk,
    status: 'offline',
    hiredAt: now(),
    hiredBy: me!.id,
    login: loginName || undefined,
    isAdmin: b.isAdmin === true,
    online: false,
    stats: { tasksDone: 0, messages: 0 },
  }
  store.putMember(m)
  if (loginName) {
    const pw = typeof b.password === 'string' ? b.password : ''
    const problem = passwordProblem(pw)
    if (problem) {
      store.removeMember(m.id)
      throw new HttpError(400, problem)
    }
    setPassword(store, m.id, loginName, pw)
  }
  remember(store, m.id, 'note', `${me!.name} さんが登録`, { importance: 2 })
  company.activity('hire', `👤 ${m.name} さん（${m.role}）を${officeInfo(m.office).name}に登録`, m.id)
  return { member: m }
})

/** 人物の編集：本人か管理者。拠点の移動は管理者だけ */
route('POST', '/api/members/:id/update', true, (_req, _res, me, [mid], b) => {
  const m = store.member(mid)
  need(m, 404, '見つかりません')
  need(me!.isAdmin || me!.id === mid, 403, '本人か管理者だけが編集できます')
  const patch: Partial<Member> = {}
  if (typeof b.name === 'string' && str(b.name, 40)) patch.name = str(b.name, 40)
  if (typeof b.role === 'string' && str(b.role, 40)) patch.role = str(b.role, 40)
  if (b.skills !== undefined) patch.skills = list(b.skills)
  if (b.languages !== undefined) patch.languages = list(b.languages)
  if (typeof b.persona === 'string') patch.persona = str(b.persona, 400) || undefined
  if (b.office !== undefined && me!.isAdmin && m!.kind !== 'nexmax') {
    const office = normalizeOffice(b.office)
    if (office !== m!.office) {
      const place = company.placeFor(office)
      need(place && place.office === office, 409, 'その拠点は満席です')
      patch.office = office
      patch.deskIndex = place!.desk
    }
  }
  store.patchMember(mid, patch)
  company.activity('info', `${me!.name} さんが ${m!.name} のプロフィールを更新しました`, mid)
  return { member: store.member(mid) }
})

route('POST', '/api/members/:id/retire', true, (_req, _res, me, [mid]) => {
  need(me!.isAdmin, 403, '管理者だけができます')
  const m = store.member(mid)
  need(m && m.kind === 'agent', 400, 'AI社員だけが対象です')
  need(!store.state.tasks.some((t) => t.assigneeId === mid && t.status === 'in_progress'), 409, '作業中は退職できません')
  store.removeMember(mid)
  company.activity('info', `${m!.name}（${m!.role}）が退職しました`)
  return { ok: true }
})

route('POST', '/api/engine', true, (_req, _res, me, _p, b) => {
  need(me!.isAdmin, 403, '管理者だけが切り替えられます')
  need(b.mode === 'claude' || b.mode === 'sim', 400, 'mode は claude か sim')
  engineMode = b.mode as 'claude' | 'sim'
  store.state.settings.engine = engineMode
  store.save()
  company.activity('info', `頭脳を「${engines[engineMode].info.detail}」に切り替えました`, me!.id)
  broadcastSnapshot()
  return { engine: engines[engineMode].info }
})

route('GET', '/api/goals/:id/files', true, (req, _res, _me, [gid]) => {
  const url = new URL(req.url ?? '/', 'http://x')
  const rel = url.searchParams.get('path') ?? ''
  // ゴールの id だけを受け付ける（'..' などで作業フォルダの外を読ませない）
  need(/^goal_[a-z0-9]+$/.test(gid) && store.goal(gid), 404, 'ゴールがありません')
  const base = resolve(WORKSPACE, gid)
  const p = normalize(join(base, rel))
  need(p.startsWith(base + sep) && existsSync(p) && statSync(p).isFile(), 404, 'ファイルがありません')
  need(statSync(p).size < 2_000_000, 413, '大きすぎます')
  return { path: rel, content: readFileSync(p, 'utf8') }
})

function broadcastSnapshot(): void {
  for (const [ws, mid] of clients) if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: 'snapshot', data: snapshot(store.member(mid) ?? null) } satisfies ServerEvent))
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.method === 'GET' || req.method === 'HEAD') return {}
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > 1_000_000) throw new HttpError(413, '大きすぎます')
    chunks.push(c as Buffer)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'JSON が読めません')
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.hdr': 'application/octet-stream',
}

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://x')
  let p = normalize(join(DIST, decodeURIComponent(url.pathname)))
  if (!p.startsWith(DIST + sep)) p = join(DIST, 'index.html')
  if (!existsSync(p) || statSync(p).isDirectory()) p = join(DIST, 'index.html')
  if (!existsSync(p)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('画面がまだ書き出されていません。npm run build を実行するか、npm run dev で http://localhost:5173 を開いてください')
    return
  }
  res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream', 'cache-control': p.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache' })
  res.end(readFileSync(p))
}

/** すべての応答に付ける守りのヘッダー（読み込み先の制限・枠への埋め込み禁止・種類の推測禁止など） */
function securityHeaders(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "frame-src 'self'",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  )
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  // マイクは自分のページだけ（やることストックの音声入力）。ほかは使わせない
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=(), usb=()')
  if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
}

/** よそのサイトからの操作（CSRF・WebSocket の乗っ取り）を断る：ブラウザが付ける Origin が自分と違えば拒否 */
function originOk(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (!origin) return true // ブラウザ以外（curl など）。それでもログインのクッキーは要る
  if (ALLOWED_ORIGINS.includes(origin)) return true
  try {
    // 開発中（npm run dev）は Vite の開発サーバー（localhost の別ポート）から来る。本番では認めない
    if (process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(new URL(origin).hostname) && HOST === '127.0.0.1') return true
    const host = String(req.headers['x-forwarded-host'] && process.env.TRUST_PROXY === '1' ? req.headers['x-forwarded-host'] : req.headers.host ?? '')
    return new URL(origin).host === host
  } catch {
    return false
  }
}

const server = createServer(async (req, res) => {
  securityHeaders(req, res)
  const url = new URL(req.url ?? '/', 'http://x')
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res)
  if (req.method !== 'GET' && !originOk(req)) {
    res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'よそのサイトからの操作は受け付けません' }))
    return
  }
  const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname))
  res.setHeader('content-type', 'application/json; charset=utf-8')
  try {
    need(r, 404, 'ありません')
    const me = memberFrom(store, req)
    if (r!.auth) need(me, 401, 'ログインしてください')
    const body = await readBody(req)
    const params = url.pathname.match(r!.re)!.slice(1).map(decodeURIComponent)
    const out = await r!.h(req, res, me, params, body)
    res.end(JSON.stringify(out ?? { ok: true }))
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500
    if (status === 500) console.error(e)
    res.statusCode = status
    // 想定外のエラーの中身（内部の情報）は返さない
    res.end(JSON.stringify({ error: status === 500 ? 'サーバーでエラーが起きました' : (e as Error).message }))
  }
})

// 画面からサーバーへは何も送らない作り。届いたら切る（maxPayload で大きな送りつけも防ぐ）
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 })
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://x')
  if (url.pathname !== '/ws') return socket.destroy()
  if (!originOk(req)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
    return socket.destroy()
  }
  const me = memberFrom(store, req)
  if (!me) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    return socket.destroy()
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    clients.set(ws, me.id)
    setOnline(me.id, +1)
    ws.send(JSON.stringify({ t: 'snapshot', data: snapshot(store.member(me.id) ?? me) } satisfies ServerEvent))
    const ping = setInterval(() => ws.readyState === ws.OPEN && ws.ping(), 25_000)
    ws.on('message', () => ws.close(1008, 'unexpected'))
    ws.on('close', () => {
      clearInterval(ping)
      clients.delete(ws)
      setOnline(me.id, -1)
    })
  })
})

pruneSessions(store)
setInterval(() => pruneSessions(store), 3600_000).unref()
server.headersTimeout = 20_000
server.requestTimeout = 30_000

server.listen(PORT, HOST, () => {
  console.log(`NEXTMAKE AI Company  http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}  （頭脳：${engines[engineMode].info.detail}）${HOST === '127.0.0.1' ? '・この PC の中だけで待ち受け中' : ''}`)
})

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    store.flush()
    process.exit(0)
  })
}
