// マイクで話したことを文字にする（ブラウザの音声認識 Web Speech API）。
// - 話しっぱなしで OK：区切り（ひと息）ごとに onFinal が呼ばれ、やることストックへ送る
// - ブラウザが途中で止めても、止めるボタンを押すまで自動でつなぎ直す
// - Chrome・Edge・Safari で使える（Firefox は未対応）。音声はブラウザの音声認識サービスで文字にされる
export type VoiceState = 'idle' | 'listening' | 'error' | 'unsupported'

type Rec = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

export const VOICE_LANGS: [string, string][] = [
  ['ja-JP', '日本語'],
  ['km-KH', 'ខ្មែរ'],
  ['en-US', 'English'],
]

export class Voice {
  state: VoiceState = 'idle'
  interim = ''
  lang = 'ja-JP'
  private rec: Rec | null = null
  private wanted = false
  private restarts = 0

  constructor(
    private readonly onFinal: (text: string) => void,
    private readonly onChange: (v: Voice, message?: string) => void,
  ) {
    try {
      const saved = localStorage.getItem('nmai.voiceLang')
      if (saved && VOICE_LANGS.some(([k]) => k === saved)) this.lang = saved
    } catch {
      /* 保存できない環境でも動く */
    }
    if (!Voice.supported()) this.state = 'unsupported'
  }

  static supported(): boolean {
    const w = window as unknown as Record<string, unknown>
    return typeof (w.SpeechRecognition ?? w.webkitSpeechRecognition) === 'function'
  }

  setLang(lang: string): void {
    this.lang = lang
    try {
      localStorage.setItem('nmai.voiceLang', lang)
    } catch {
      /* noop */
    }
    if (this.wanted) {
      this.rec?.abort()
    }
    this.onChange(this)
  }

  toggle(): void {
    if (this.wanted) this.stop()
    else this.start()
  }

  start(): void {
    if (this.state === 'unsupported') {
      this.onChange(this, 'このブラウザは音声入力に対応していません。Chrome・Edge・Safari で開くか、文字で入力してください')
      return
    }
    this.wanted = true
    this.restarts = 0
    this.open()
  }

  stop(): void {
    this.wanted = false
    if (this.interim.trim()) this.onFinal(this.interim.trim())
    this.interim = ''
    this.rec?.stop()
    this.state = 'idle'
    this.onChange(this)
  }

  private open(): void {
    const w = window as unknown as Record<string, new () => Rec>
    const R = w.SpeechRecognition ?? w.webkitSpeechRecognition
    const rec = new R()
    rec.lang = this.lang
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1
    rec.onstart = () => {
      this.state = 'listening'
      this.onChange(this)
    }
    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        const text = r[0].transcript.trim()
        if (r.isFinal) {
          if (text) this.onFinal(text)
        } else interim += text
      }
      this.interim = interim
      this.restarts = 0
      this.onChange(this)
    }
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.wanted = false
        this.state = 'error'
        this.onChange(this, 'マイクが許可されていません。アドレスバーのマイクのボタンから許可してください')
        return
      }
      this.onChange(this, `音声入力でエラーが起きました（${e.error}）。つなぎ直します`)
    }
    rec.onend = () => {
      this.rec = null
      if (!this.wanted) {
        this.state = 'idle'
        this.onChange(this)
        return
      }
      // ブラウザが区切りで止めたら、すぐにつなぎ直す（失敗が続いたら止める）
      if (++this.restarts > 8) {
        this.wanted = false
        this.state = 'error'
        this.onChange(this, '音声入力が続けて止まりました。もう一度マイクを押してください')
        return
      }
      setTimeout(() => this.wanted && this.open(), 250)
    }
    this.rec = rec
    try {
      rec.start()
    } catch {
      setTimeout(() => this.wanted && this.open(), 400)
    }
  }
}
