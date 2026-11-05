// AI社員（Claude Code のセッション）の道具の使い方を、実行の直前に検査する（PreToolUse フック）。
// - ファイルの読み書き・検索は、そのゴールの作業フォルダの中だけ（../ や絶対パスで外へ出られない。シンボリックリンクも実体で判定）
// - Web の取得は https だけ。localhost・社内ネットワーク・クラウドのメタデータ（169.254.169.254 など）へは行かせない（SSRF 対策）
// - それ以外の想定外の道具は止める
// 道具そのものは claude.ts の tools / allowedTools でも絞っている。ここは「許した道具の中身」を見る二重の守り。
import { realpathSync } from 'node:fs'
import { isIP } from 'node:net'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

export type GuardResult = { ok: true } | { ok: false; reason: string }

const FILE_TOOLS: Record<string, string[]> = {
  Read: ['file_path'],
  Write: ['file_path'],
  Edit: ['file_path'],
  MultiEdit: ['file_path'],
  NotebookEdit: ['notebook_path'],
  Glob: ['path'],
  Grep: ['path'],
}

/** 実在する一番近い親までたどって実体のパスにする（作る前のファイルにも使える） */
function realish(p: string): string {
  let cur = p
  const rest: string[] = []
  for (let i = 0; i < 64; i++) {
    try {
      return resolve(realpathSync(cur), ...rest.reverse())
    } catch {
      const parent = dirname(cur)
      if (parent === cur) return p
      rest.push(cur.slice(parent.length + 1))
      cur = parent
    }
  }
  return p
}

export function insideDir(root: string, target: string): boolean {
  const base = realish(resolve(root))
  const abs = realish(isAbsolute(target) ? target : resolve(root, target))
  const rel = relative(base, abs)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel) && !rel.split(sep).includes('..'))
}

function privateIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
}

export function safeUrl(raw: string): GuardResult {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return { ok: false, reason: 'URL が読めません' }
  }
  if (u.protocol !== 'https:') return { ok: false, reason: 'https の URL だけ取得できます' }
  if (u.username || u.password) return { ok: false, reason: 'URL に認証情報を含められません' }
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!host.includes('.') || /(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/.test(host) || host === 'metadata.google.internal') {
    return { ok: false, reason: '社内・ローカルのアドレスへはアクセスできません' }
  }
  const v = isIP(host)
  if (v === 4 && privateIPv4(host)) return { ok: false, reason: '社内ネットワークの IP へはアクセスできません' }
  if (v === 6) return { ok: false, reason: 'IP アドレスの直接指定はできません' }
  if (v === 4) return { ok: false, reason: 'IP アドレスの直接指定はできません' }
  return { ok: true }
}

/** 1 回の道具の呼び出しを検査する */
export function checkTool(workdir: string, tool: string, input: unknown, allowBash: boolean): GuardResult {
  const args = (input ?? {}) as Record<string, unknown>
  if (tool in FILE_TOOLS) {
    for (const key of FILE_TOOLS[tool]) {
      const v = args[key]
      if (v === undefined || v === null || v === '') continue
      if (typeof v !== 'string' || !insideDir(workdir, v)) return { ok: false, reason: `作業フォルダの外（${String(v)}）は使えません` }
    }
    const pattern = args.pattern ?? args.glob
    if (typeof pattern === 'string' && (pattern.includes('..') || isAbsolute(pattern))) return { ok: false, reason: '作業フォルダの外を探すパターンは使えません' }
    return { ok: true }
  }
  if (tool === 'WebFetch') return safeUrl(String(args.url ?? ''))
  if (tool === 'WebSearch') return { ok: true }
  if (tool.startsWith('mcp__company__')) return { ok: true }
  if (tool === 'Bash' && allowBash) return { ok: true }
  if (tool === 'TodoWrite') return { ok: true }
  return { ok: false, reason: `この道具（${tool}）は使えません` }
}
