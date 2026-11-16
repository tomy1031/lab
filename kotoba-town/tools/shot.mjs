#!/usr/bin/env node
// Screenshots of dev/scene.html for visual checks.
//   node tools/shot.mjs <outDir> "scene=office&view=spawn" "scene=office&view=overview&labels=1" …
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import path from 'node:path';
import { serve } from '../tests/serve.mjs';

const [outDir, ...queries] = process.argv.slice(2);
if (!outDir || !queries.length) { console.error('usage: node tools/shot.mjs <outDir> <query>…'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });
const srv = await serve(0);
const port = srv.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
for (const q of queries) {
  const name = q.replace(/[^a-z0-9=_,-]+/gi, '_').replace(/=/g, '-');
  await page.goto(`http://127.0.0.1:${port}/dev/scene.html?${q}`);
  try { await page.waitForFunction('window.__ready === true', null, { timeout: 60000 }); } catch { errors.push(`timeout ${q}`); }
  await page.waitForTimeout(400);
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, timeout: 180000 });
  console.log(file);
}
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
srv.close();
