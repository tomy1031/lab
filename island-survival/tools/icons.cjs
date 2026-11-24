// tools/icons.cjs — draws the app icons (img/icon-*.png) from img/icon.svg in Chromium (the palm-tree island tile).
// Maskable / apple icons put the picture inside the safe zone on a full-bleed background.
//   node tools/icons.cjs
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const svg = fs.readFileSync(path.join(root, 'img', 'icon.svg'), 'utf8');
  const b = await chromium.launch();
  const page = await b.newPage();
  const sizes = [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true], ['apple-touch-icon.png', 180, true]];
  for (const [name, size, full] of sizes) {
    const data = await page.evaluate(async ([svg, size, full]) => {
      const img = new Image();
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
      await img.decode();
      const c = document.createElement('canvas'); c.width = c.height = size;
      const x = c.getContext('2d');
      if (full) { x.fillStyle = '#123a3f'; x.fillRect(0, 0, size, size); const k = 0.8, o = (size * (1 - k)) / 2; x.drawImage(img, o, o, size * k, size * k); }
      else x.drawImage(img, 0, 0, size, size);
      return c.toDataURL('image/png').split(',')[1];
    }, [svg, size, full]);
    fs.writeFileSync(path.join(root, 'img', name), Buffer.from(data, 'base64'));
    console.log('wrote img/' + name);
  }
  await b.close();
})();
