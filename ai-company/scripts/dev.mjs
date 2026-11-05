// サーバー（tsx watch）と画面（vite）を同時に起動する
import { spawn } from 'node:child_process'

const procs = [
  spawn('npx', ['tsx', 'watch', '--clear-screen=false', 'server/index.ts'], { stdio: 'inherit', env: process.env }),
  spawn('npx', ['vite'], { stdio: 'inherit', env: process.env }),
]
const stop = () => {
  for (const p of procs) p.kill('SIGINT')
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
for (const p of procs) p.on('exit', (code) => code && stop())
