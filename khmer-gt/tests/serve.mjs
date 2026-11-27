// tests/serve.mjs — Minimal static file server for khmer-gt
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

export function startServer(port = 4173) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const urlPath = (req.url || '/').split('?')[0];
      let rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      const full = path.resolve(ROOT, rel);
      if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      const ext = path.extname(full);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(full).pipe(res);
    });
    srv.listen(port, '127.0.0.1', () => {
      const addr = srv.address();
      resolve({ server: srv, port: addr.port, url: `http://127.0.0.1:${addr.port}/` });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  startServer(port).then(({ url }) => console.log(`KHMER GT serving at ${url}`));
}
