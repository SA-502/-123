/*
 * GRAVEWAVE server: serves the game's static files. Runs behind the VPS's Traefik proxy, which
 * handles HTTPS. No dependencies (Node 18+). Co-op signalling is added to this file in a later step.
 *
 *   PORT=8080 node server/server.js
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
// only the game itself is public; never the server code, docs, tools or git metadata
const PUBLIC_DIRS = new Set(['', 'css', 'js', 'icons', 'assets', 'fonts']);

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function resolve(urlPath) {
  let p;
  try {
    p = decodeURIComponent(urlPath.split('?')[0]);
  } catch (e) {
    return null;
  }
  if (p === '/' || p === '') p = '/index.html';
  const full = path.resolve(ROOT, '.' + p);
  if (!full.startsWith(ROOT + path.sep)) return null; // path traversal
  const rel = path.relative(ROOT, full);
  if (rel.split(path.sep).some((part) => part.startsWith('.'))) return null; // dotfiles, .git
  const top = rel.includes(path.sep) ? rel.split(path.sep)[0] : '';
  if (!PUBLIC_DIRS.has(top)) return null;
  if (!TYPES[path.extname(full).toLowerCase()]) return null;
  return full;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  if (req.url === '/healthz') return send(res, 200, 'ok');
  const file = resolve(req.url);
  if (!file) return send(res, 404, 'Not found');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    const ext = path.extname(file).toLowerCase();
    const isMedia = ['.png', '.webp', '.jpg', '.jpeg', '.svg', '.ico', '.woff2'].includes(ext);
    res.writeHead(200, {
      'Content-Type': TYPES[ext],
      'Content-Length': st.size,
      // code updates must show up at once; images can be cached for an hour
      'Cache-Control': isMedia ? 'public, max-age=3600' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, () => console.log('[gravewave] serving ' + ROOT + ' on :' + PORT));
