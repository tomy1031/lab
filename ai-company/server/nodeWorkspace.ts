// サーバー版の作業場所：data/workspaces/<goalId>/ のフォルダ
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { safeName, type Workspace } from './workspace'

export class NodeWorkspace implements Workspace {
  constructor(readonly root: string) {}

  dir(goalId: string): string {
    const d = join(this.root, goalId)
    mkdirSync(d, { recursive: true })
    return d
  }

  list(goalId: string): string[] {
    const dir = join(this.root, goalId)
    const out: string[] = []
    const walk = (d: string, depth: number) => {
      if (depth > 4) return
      let names: string[] = []
      try {
        names = readdirSync(d)
      } catch {
        return
      }
      for (const n of names) {
        if (n.startsWith('.') || n === 'node_modules') continue
        const p = join(d, n)
        const st = statSync(p)
        if (st.isDirectory()) walk(p, depth + 1)
        else out.push(relative(dir, p))
      }
    }
    walk(dir, 0)
    return out
  }

  write(goalId: string, name: string, content: string): void {
    writeFileSync(join(this.dir(goalId), safeName(name)), content)
  }

  read(goalId: string, name: string): string | null {
    const base = resolve(this.root, goalId)
    const p = resolve(base, name)
    if (p !== base && !p.startsWith(base + sep)) return null
    try {
      return readFileSync(p, 'utf8')
    } catch {
      return null
    }
  }
}
