/*
 * GRAVEWAVE server: serves the game's static files. Runs behind the VPS's Traefik proxy, which
 * handles HTTPS. No dependencies (Node 18+). Also hosts co-op games over WebSocket (/ws): see sim.js.
 *
 *   PORT=8080 node server/server.js
 *
 * Home play (same Wi-Fi, no internet server): run the play-at-home script on a computer, or
 *   GW_LAN=1 node server/server.js   — it prints the address the phones should open.
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
  '.mp3': 'audio/mpeg',
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
    const isMedia = ['.png', '.webp', '.jpg', '.jpeg', '.svg', '.ico', '.woff2', '.mp3'].includes(ext);
    res.writeHead(200, {
      'Content-Type': TYPES[ext],
      'Content-Length': st.size,
      // code updates must show up at once; images and sounds can be cached for an hour
      'Cache-Control': isMedia ? 'public, max-age=3600' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
});

/* ------------------------------------------------------------------ */
/* co-op: rooms, a tiny WebSocket layer (no dependencies) and one     */
/* server-side game per room                                          */
/* ------------------------------------------------------------------ */
/*
 * Rooms of up to 4 players. The server itself runs each room's game (server/sim.js): rounds,
 * spawns and every zombie. Phones send their own moves and shots and draw what the server sends.
 * The first player in a room is its leader and starts the game; if they leave, the next one leads.
 *
 * client -> server   {t:'create'} | {t:'join', code} | {t:'start'} | {t:'ping'} | game messages with `to`
 *                    (omitted = everyone else in the room incl. the server game, 'host' = the server game,
 *                    a number = one player)
 * server -> client   {t:'created'|'joined', code, id, players, leader} | {t:'leader', id} | {t:'err', msg}
 *                    {t:'peer+', id} | {t:'peer-', id} | {t:'start', seed, players, map} | game messages with `from`
 */
const crypto = require('crypto');
const { Sim } = require('./sim');
const { ArenaSim } = require('../js/arena/sim.js'); // the PvP arena (arena.html)
const MAX_ARENA = 10;
const MAX_PLAYERS = 4;
const MAX_FRAME = 256 * 1024;
const rooms = new Map(); // code -> { code, clients: Map<id, client>, leader, nextId, sim }
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I / O: easy to read out loud

function newCode() {
  for (let tries = 0; tries < 1000; tries++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
  return null;
}

function wsSend(cl, obj) {
  if (cl.closed) return;
  const data = Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj));
  const n = data.length;
  let head;
  if (n < 126) head = Buffer.from([0x81, n]);
  else if (n < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x81;
    head[1] = 126;
    head.writeUInt16BE(n, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x81;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(n), 2);
  }
  try {
    cl.sock.write(Buffer.concat([head, data]));
  } catch (e) {
    /* socket already gone */
  }
}

function wsControl(cl, op, payload) {
  if (cl.closed) return;
  const p = payload || Buffer.alloc(0);
  try {
    cl.sock.write(Buffer.concat([Buffer.from([0x80 | op, p.length]), p]));
  } catch (e) {
    /* ignore */
  }
}

function stopGame(room) {
  if (room.sim) room.sim.stop();
  room.sim = null;
}

function leave(cl) {
  if (cl.closed) return;
  cl.closed = true;
  try {
    cl.sock.destroy();
  } catch (e) {
    /* ignore */
  }
  const room = cl.room;
  if (!room) return;
  cl.room = null;
  room.clients.delete(cl.id);
  if (!room.clients.size) {
    stopGame(room);
    rooms.delete(room.code);
    return;
  }
  for (const o of room.clients.values()) wsSend(o, { t: 'peer-', id: cl.id });
  if (room.sim) room.sim.receive({ t: 'peer-', id: cl.id });
  if (room.leader === cl.id) {
    room.leader = Math.min(...room.clients.keys());
    for (const o of room.clients.values()) wsSend(o, { t: 'leader', id: room.leader });
  }
}

/** Deliver a message from the room's game (player 0) to the players. */
function fromGame(room, text) {
  let m;
  try {
    m = JSON.parse(text);
  } catch (e) {
    return;
  }
  const to = m.to;
  delete m.to;
  m.from = 0;
  const out = JSON.stringify(m);
  if (typeof to === 'number') {
    const o = room.clients.get(to);
    if (o) wsSend(o, out);
  } else for (const o of room.clients.values()) wsSend(o, out);
}

/** Maps a room can be played on (js/map.js is 'lumina', js/map_gemini.js is 'gemini'). */
const MAPS = ['lumina', 'gemini', 'frostfall'];

/** An arena match: the leader picked the mode, everyone's characters come with it. */
function startArena(room, m) {
  stopGame(room);
  const mode = m.mode === 'ffa' ? 'ffa' : 'team';
  const players = [...room.clients.keys()].sort((a, b) => a - b);
  if (mode === 'team' && players.length > 6) return wsSend(room.clients.get(room.leader), { t: 'err', msg: 'Too many players for 3 v 3 (6 at most)' });
  const picks = {};
  for (const id of players) if (m.picks && typeof m.picks[id] === 'string') picks[id] = m.picks[id].slice(0, 12);
  try {
    room.sim = new ArenaSim(1 + crypto.randomInt(2147483000), players, (text) => fromGame(room, text), { mode, picks });
  } catch (e) {
    console.error('[gravewave] could not start an arena match', e);
    for (const o of room.clients.values()) wsSend(o, { t: 'err', msg: 'Server error, try again' });
  }
}

function startGame(room) {
  stopGame(room);
  const seed = 1 + crypto.randomInt(2147483000);
  const players = [...room.clients.keys()].sort((a, b) => a - b);
  try {
    room.sim = new Sim(seed, players, (text) => fromGame(room, text), room.map);
  } catch (e) {
    console.error('[gravewave] could not start a game', e);
    for (const o of room.clients.values()) wsSend(o, { t: 'err', msg: 'Server error, try again' });
    return;
  }
  for (const o of room.clients.values()) wsSend(o, { t: 'start', seed, players, map: room.map || 'lumina' });
}

function onMessage(cl, text) {
  let m;
  try {
    m = JSON.parse(text);
  } catch (e) {
    return;
  }
  if (!m || typeof m.t !== 'string') return;
  if (m.t === 'ping') return wsSend(cl, { t: 'pong', c: m.c });
  if (!cl.room) {
    if (m.t === 'create') {
      const code = newCode();
      if (!code) return wsSend(cl, { t: 'err', msg: 'Server is full, try again later' });
      const room = { code, clients: new Map(), leader: 1, nextId: 2, sim: null, game: m.game === 'arena' ? 'arena' : 'zombies' };
      cl.id = 1;
      cl.room = room;
      room.clients.set(1, cl);
      rooms.set(code, room);
      return wsSend(cl, { t: 'created', code, id: 1, players: [], leader: 1 });
    }
    if (m.t === 'join') {
      const code = String(m.code || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
      const room = rooms.get(code);
      // a zombie room code typed into the arena (or the other way round) finds nothing
      if (!room || room.game !== (m.game === 'arena' ? 'arena' : 'zombies')) return wsSend(cl, { t: 'err', msg: 'No game with code ' + (code || '?') });
      const max = room.game === 'arena' ? MAX_ARENA : MAX_PLAYERS;
      if (room.clients.size >= max) return wsSend(cl, { t: 'err', msg: room.game === 'arena' ? 'That room is full (10 players)' : 'That game is full (4 players)' });
      if (room.sim) return wsSend(cl, { t: 'err', msg: 'That game has already started' });
      // reuse the lowest free number so colours stay P1..P4
      let id = 1;
      while (room.clients.has(id)) id++;
      cl.id = id;
      cl.room = room;
      const players = [...room.clients.keys()];
      room.clients.set(cl.id, cl);
      for (const o of room.clients.values()) if (o !== cl) wsSend(o, { t: 'peer+', id: cl.id });
      return wsSend(cl, { t: 'joined', code, id: cl.id, players, leader: room.leader });
    }
    return;
  }
  const room = cl.room;
  if (m.t === 'start') {
    if (room.leader === cl.id && !room.sim) {
      if (room.game === 'arena') return startArena(room, m);
      room.map = MAPS.includes(m.map) ? m.map : 'lumina';
      startGame(room);
    }
    return;
  }
  const to = m.to;
  delete m.to;
  m.from = cl.id;
  if (room.sim && (to === undefined || to === 'host')) room.sim.receive(m);
  if (to === 'host') return;
  const out = JSON.stringify(m);
  if (typeof to === 'number') {
    const o = room.clients.get(to);
    if (o) wsSend(o, out);
  } else for (const o of room.clients.values()) if (o !== cl) wsSend(o, out);
}

function onData(cl, chunk) {
  cl.buf = cl.buf.length ? Buffer.concat([cl.buf, chunk]) : chunk;
  for (;;) {
    const b = cl.buf;
    if (b.length < 2) return;
    const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f, off = 2;
    if (len === 126) {
      if (b.length < 4) return;
      len = b.readUInt16BE(2);
      off = 4;
    } else if (len === 127) {
      if (b.length < 10) return;
      const big = b.readBigUInt64BE(2);
      if (big > BigInt(MAX_FRAME)) return leave(cl);
      len = Number(big);
      off = 10;
    }
    if (!masked || len > MAX_FRAME) return leave(cl); // browsers always mask
    if (b.length < off + 4 + len) return;
    const mask = b.subarray(off, off + 4);
    const payload = Buffer.from(b.subarray(off + 4, off + 4 + len));
    for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3];
    cl.buf = b.subarray(off + 4 + len);
    cl.seen = Date.now();
    if (op === 0x8) return leave(cl);
    if (op === 0x9) {
      wsControl(cl, 0xa, payload);
      continue;
    }
    if (op === 0xa) continue;
    if (op === 0x1 || op === 0x0) {
      cl.frag = cl.frag ? Buffer.concat([cl.frag, payload]) : payload;
      if (cl.frag.length > MAX_FRAME) return leave(cl);
      if (fin) {
        const text = cl.frag.toString('utf8');
        cl.frag = null;
        onMessage(cl, text);
      }
    }
  }
}

server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!req.url.startsWith('/ws') || !key || String(req.headers.upgrade).toLowerCase() !== 'websocket') {
    sock.destroy();
    return;
  }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  sock.setNoDelay(true);
  const cl = { sock, buf: Buffer.alloc(0), frag: null, room: null, id: 0, closed: false, seen: Date.now() };
  sock.on('data', (c) => onData(cl, c));
  sock.on('close', () => leave(cl));
  sock.on('error', () => leave(cl));
});

// run every room's game at 60 steps a second
setInterval(() => {
  for (const room of rooms.values()) if (room.sim && !room.sim.tick()) room.sim = null; // run over: back to the room
}, 1000 / 60);

// keep idle connections alive through the proxy, and drop the dead ones
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values())
    for (const cl of room.clients.values()) {
      if (now - cl.seen > 45000) leave(cl);
      else wsControl(cl, 0x9);
    }
}, 15000);

server.listen(PORT, () => {
  console.log('[gravewave] serving ' + ROOT + ' on :' + PORT);
  // home play: list this computer's Wi-Fi / LAN addresses, so phones on the same network can join
  if (process.env.GW_LAN) {
    const nets = require('os').networkInterfaces();
    const ips = [];
    for (const list of Object.values(nets))
      for (const n of list || []) if ((n.family === 'IPv4' || n.family === 4) && !n.internal) ips.push(n.address);
    console.log('');
    console.log('  GRAVEWAVE home server is running.');
    console.log('  On every phone connected to the SAME Wi-Fi, open in Safari:');
    for (const ip of ips) console.log('      http://' + ip + ':' + PORT);
    if (!ips.length) console.log('      (no network found: connect this computer to the Wi-Fi first)');
    console.log('  Then: Co-op > one player creates a room, the others join with its code.');
    console.log('  Keep this window open while you play. Close it to stop the server.');
    console.log('');
  }
});
