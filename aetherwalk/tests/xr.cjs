// tests/xr.cjs — drives the real WebXR code path with Meta's emulator (IWER, Quest 3 profile):
// enter VR → frames render → head bob counts as steps → a fast right-controller arc causes no errors.
//   npm install && node tests/xr.cjs
const { chromium } = require('playwright');
const serve = require('./serve.cjs');

const IWER = process.env.IWER_PATH || require.resolve('iwer/build/iwer.min.js', { paths: [process.cwd(), __dirname] });
const log = (...a) => console.log('[xr]', ...a);
const fail = [];
const check = (cond, msg) => { log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) fail.push(msg); };

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  // emulated headset + controllers, installed before the game starts
  await page.addInitScript({ path: IWER });
  await page.addInitScript(() => {
    const d = new window.IWER.XRDevice(window.IWER.metaQuest3);
    d.installRuntime({ forceInstall: true });
    d.position.set(0, 1.62, 0);
    window.__xrd = d;
    // count the frames of the XR session the game starts
    const xr = navigator.xr, rs = xr.requestSession.bind(xr);
    window.__xrFrames = 0;
    xr.requestSession = async (...a) => {
      const s = await rs(...a);
      window.__xrSession = s;
      const tick = () => { if (window.__xrSession !== s) return; window.__xrFrames++; s.requestAnimationFrame(tick); };
      s.requestAnimationFrame(tick);
      return s;
    };
  });

  await page.goto(`${base}?nosound&seed=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.AW && window.AW.ready, null, { timeout: 60000 });
  // the enter-VR button: id "enter-vr", or any button whose text contains "VR"
  await page.waitForFunction(() => {
    const b = document.querySelector('#enter-vr') || [...document.querySelectorAll('button')].find((x) => /VR/.test(x.textContent));
    return !!b && !b.disabled;
  }, null, { timeout: 15000 });
  await page.locator('#enter-vr, button:has-text("VR")').first().click();
  await page.waitForFunction(() => !!window.__xrSession, null, { timeout: 15000 });
  check(true, 'XR session started');

  // frames render for 5 s
  const f0 = await page.evaluate(() => window.__xrFrames);
  await page.waitForTimeout(5000);
  const frames = (await page.evaluate(() => window.__xrFrames)) - f0;
  check(frames > 30, `XR frames rendered in 5 s: ${frames}`);

  // head bob: the headset rises and falls 4 cm at 2.3 Hz for 6 s, which should count as steps
  const steps0 = await page.evaluate(() => AW.debug.state().steps);
  await page.evaluate(() => new Promise((res) => {
    const d = window.__xrd, t0 = performance.now();
    const timer = setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      d.position.y = 1.62 + 0.04 * Math.sin(2 * Math.PI * 2.3 * t);
      if (t >= 6) { clearInterval(timer); d.position.y = 1.62; res(); }
    }, 16);
  }));
  await page.waitForTimeout(500);
  const steps = (await page.evaluate(() => AW.debug.state().steps)) - steps0;
  check(steps >= 6, `head bob counted as steps: ${steps}`);

  // a fast arc with the right controller, from the front, over the top and down
  await page.evaluate(() => new Promise((res) => {
    const c = window.__xrd.controllers.right;
    let i = 0;
    const timer = setInterval(() => {
      const a = (i / 30) * Math.PI;
      c.position.set(0.3 * Math.cos(a), 1.1 + 0.35 * Math.sin(a), -0.3);
      if (++i > 30) { clearInterval(timer); res(); }
    }, 16);
  }));
  await page.waitForTimeout(500);

  const awErr = await page.evaluate(() => (window.AW && window.AW.errors) || []);
  check(errors.length === 0 && awErr.length === 0, `no errors ${[...errors, ...awErr].join(' | ')}`);
  await browser.close();
  srv.close();
  if (fail.length) { log(`FAILED (${fail.length})`); process.exit(1); }
  log('all passed');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
