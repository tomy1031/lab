// tests/browser.mjs — shared browser setup (software WebGL in the container)
import { chromium } from 'playwright';
export async function launch() {
  return chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
}
