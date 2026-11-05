// REST と WebSocket（切れたら自動でつなぎ直す）
import type { Member, MemoryEntry, ServerEvent } from '../../shared/types'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    msg: string,
  ) {
    super(msg)
  }
}

export async function api<T = unknown>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `エラー（${res.status}）`)
  return data as T
}

export const Api = {
  me: () => api<{ me: Member | null }>('/api/me'),
  login: (login: string, password: string) => api<{ me: Member }>('/api/login', { login, password }),
  logout: () => api('/api/logout', {}),
  createGoal: (title: string, description: string) => api('/api/goals', { title, description }),
  cancelGoal: (id: string) => api(`/api/goals/${id}/cancel`, {}),
  completeTask: (id: string, note: string) => api(`/api/tasks/${id}/complete`, { note }),
  retryTask: (id: string) => api(`/api/tasks/${id}/retry`, {}),
  memory: (id: string) => api<{ memory: MemoryEntry[]; context: string[] }>(`/api/members/${id}/memory`),
  addMemory: (id: string, text: string) => api(`/api/members/${id}/memory`, { text }),
  registerHuman: (body: Record<string, unknown>) => api<{ member: Member }>('/api/members', body),
  retire: (id: string) => api(`/api/members/${id}/retire`, {}),
  updateMember: (id: string, body: Record<string, unknown>) => api<{ member: Member }>(`/api/members/${id}/update`, body),
  setEngine: (mode: 'claude' | 'sim') => api('/api/engine', { mode }),
  talk: (to: string, text: string) => api('/api/talk', { to, text }),
  reply: (messageId: string, text: string) => api(`/api/messages/${messageId}/reply`, { text }),
  file: (goalId: string, path: string) => api<{ path: string; content: string }>(`/api/goals/${goalId}/files?path=${encodeURIComponent(path)}`),
}

export function connect(onEvent: (ev: ServerEvent) => void, onState: (s: 'open' | 'closed' | 'unauthorized') => void): () => void {
  let ws: WebSocket | null = null
  let stopped = false
  let delay = 1000
  const open = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    ws = new WebSocket(`${proto}://${location.host}/ws`)
    let opened = false
    ws.onopen = () => {
      opened = true
      delay = 1000
      onState('open')
    }
    ws.onmessage = (e) => onEvent(JSON.parse(e.data))
    ws.onclose = async () => {
      if (stopped) return
      onState('closed')
      if (!opened) {
        const me = await Api.me().catch(() => null)
        if (me && !me.me) return onState('unauthorized')
      }
      setTimeout(open, delay)
      delay = Math.min(delay * 2, 15000)
    }
  }
  open()
  return () => {
    stopped = true
    ws?.close()
  }
}
