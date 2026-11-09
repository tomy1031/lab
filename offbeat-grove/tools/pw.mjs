// tools/pw.mjs — shared test helpers: Playwright's Chromium (software WebGL) and a server for the game folder
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';

const require = createRequire(import.meta.url);
export const { chromium } = require('playwright');

export function browser(extra = []) {
  return chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required', ...extra] });
}

export async function serveApp(root) {
  const srv = await serve(0, root);
  return { srv, base: `http://127.0.0.1:${srv.address().port}/` };
}
