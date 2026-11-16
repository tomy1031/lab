#!/usr/bin/env node
// Build data/voice_manifest.json: every pre-generated line (scenario lines + cast utility lines)
// with its voice, speaking style and a content hash. The nexmax-academy workflow
// ("Kotoba Town voices") reads this file and makes one Gemini Live recording per entry.
//   node kotoba-town/tools/voice_manifest.mjs [--utility-only]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CAST } from '../js/content/cast.js';
import { variantLines, utilityLines, resolveCharacter } from '../js/content/lines.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const utilityOnly = process.argv.includes('--utility-only');
const lessonDir = path.join(root, 'data', 'lessons');
const lessons = fs.existsSync(lessonDir)
  ? fs.readdirSync(lessonDir).filter((f) => /^l\d\d\.json$/.test(f)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(lessonDir, f), 'utf8')))
  : [];

const BASE_STYLE = '日本語を 習い始めた 人に 話して います。はっきり、少し ゆっくり 読んで ください。';
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const entries = [];
const chars = new Map(Object.entries(CAST).map(([id, c]) => [id, { id, ...c }]));

if (!utilityOnly) {
  for (const lesson of lessons) {
    for (const v of lesson.variants) {
      for (const c of v.characters) { const r = resolveCharacter(c); if (r) chars.set(r.id, r); }
      for (const line of variantLines(v)) {
        const ch = chars.get(line.who);
        entries.push({ id: line.id, who: line.who, voice: line.voice, text: line.text, style: `${BASE_STYLE}${ch?.styleJa || ''}` });
      }
    }
  }
}
// utility lines for every character that appears (all cast members in utility-only mode)
const used = utilityOnly ? [...chars.keys()] : [...new Set(entries.map((e) => e.who))];
for (const id of used) {
  const ch = chars.get(id);
  if (!ch) continue;
  for (const u of utilityLines(id, ch.voice)) entries.push({ id: u.id, who: id, voice: ch.voice, text: u.text, style: `${BASE_STYLE}${ch.styleJa || ''}` });
}
for (const e of entries) e.hash = hash(`${e.voice}|${e.text}|${e.style}`);

const ids = new Set();
for (const e of entries) { if (ids.has(e.id)) throw new Error(`duplicate line id ${e.id}`); ids.add(e.id); }

const out = path.join(root, 'data', 'voice_manifest.json');
fs.writeFileSync(out, JSON.stringify({ generated: new Date().toISOString(), count: entries.length, lines: entries }, null, 1) + '\n');
console.log(`${entries.length} lines → ${path.relative(process.cwd(), out)}`);
