// tests/serve.cjs — tiny static server for the game folder (used by the tests)
const http = require('http'), fs = require('fs'), path = require('path');
const defaultRoot = path.resolve(__dirname, '..');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.webp': 'image/webp',
};
// serve(port, root): root defaults to the game folder; tests/pwa.cjs serves a built dist folder instead
module.exports = function serve(port = 0, root = defaultRoot) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(root, p);
      if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
};
