// tools/pw.mjs — shared test helpers: Playwright's Chromium (software WebGL) and a server for the game folder.
// REAL=1 sends the browser through this machine's HTTPS proxy (when there is one) to reach the real tile servers.
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';

const require = createRequire(import.meta.url);
export const { chromium } = require('playwright');

export function browser(extra = [], { real = false } = {}) {
  const proxy = real && process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined;
  return chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', ...extra], proxy });
}

export async function serveApp(root) {
  const srv = await serve(0, root);
  return { srv, base: `http://127.0.0.1:${srv.address().port}/` };
}
