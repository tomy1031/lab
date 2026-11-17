#!/usr/bin/env node
// Copy finished recordings from the nexmax-academy voice branch into audio/voice/ and write
// audio/voice/index.json ({ id: { h: hash, d: seconds } }) — the game only plays lines listed there,
// and only when the hash still matches the current text (edited lines fall back to Gemini Live / text).
//   git -C <academy> fetch origin claude/kotoba-town-voices && git -C <academy> archive FETCH_HEAD kotoba-town/out | tar -x -C /tmp/kv
//   node kotoba-town/tools/import_voices.mjs /tmp/kv/kotoba-town/out
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(path.join(src, 'index.json'))) {
  console.error('usage: node tools/import_voices.mjs <academy kotoba-town/out folder>');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data', 'voice_manifest.json'), 'utf8'));
const made = JSON.parse(fs.readFileSync(path.join(src, 'index.json'), 'utf8'));
const destDir = path.join(root, 'audio', 'voice');
const indexPath = path.join(destDir, 'index.json');
const index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : {};
let copied = 0; let missing = 0; let stale = 0;
for (const line of manifest.lines) {
  const rec = made[line.id];
  if (!rec) { missing++; continue; }
  if (rec.hash !== line.hash) { stale++; continue; }
  const from = path.join(src, 'voice', `${line.id}.mp3`);
  if (!fs.existsSync(from)) { missing++; continue; }
  const to = path.join(destDir, `${line.id}.mp3`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  index[line.id] = { h: line.hash, d: Math.round((rec.seconds || 0) * 100) / 100 };
  copied++;
}
// drop entries whose line no longer exists
const live = new Set(manifest.lines.map((l) => l.id));
for (const id of Object.keys(index)) if (!live.has(id)) delete index[id];
fs.writeFileSync(indexPath, JSON.stringify(index) + '\n');
console.log(`copied ${copied}, not yet made ${missing}, outdated ${stale}; index has ${Object.keys(index).length}/${manifest.lines.length}`);
