/**
 * Zero-dependency static server and in-memory Ludo room server.
 * Rooms use server-authoritative dice/moves. They are intentionally ephemeral;
 * use durable storage, auth, rate limiting and TLS before production deployment.
 */
import http from 'node:http';
import { createReadStream, statSync, realpathSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, randomInt } from 'node:crypto';
import { createGame, currentColor, movePawn, rollDice, PLAYER_COLORS } from './engine.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.ico':'image/x-icon', '.woff2':'font/woff2' };
// The development preview serves the browser app only, never repository metadata,
// backend source, tests, build tooling, or unrecognized root files.
const PUBLIC_FILES = new Set(['/index.html','/styles.css','/ui-refresh.css','/app.js','/engine.js','/auth.js','/supabase.js','/supabase-config.js','/sw.js','/manifest.webmanifest','/LICENSE','/THIRD_PARTY_NOTICES.md']);
const PUBLIC_ASSET_EXTENSIONS = new Set(['.svg','.png','.jpg','.jpeg','.gif','.webp','.mp3','.wav','.woff2','.txt']);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL = 2 * 60 * 60 * 1000;

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
  res.end(JSON.stringify(data));
}
function bodyJSON(req) {
  return new Promise((resolveBody, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; if (body.length > 16384) req.destroy(); });
    req.on('end', () => { try { resolveBody(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON.')); } });
    req.on('error', reject);
  });
}
function cleanName(value) {
  return String(value || 'Guest Player').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24) || 'Guest Player';
}
function newCode(rooms) {
  let code;
  do { code = Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join(''); } while (rooms.has(code));
  return code;
}
function token() { return randomBytes(24).toString('base64url'); }

export function createAppServer({ rollDie = () => randomInt(1, 7) } = {}) {
  const rooms = new Map();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (now - room.updatedAt > ROOM_TTL) {
        for (const responses of room.streams.values()) for (const response of responses) response.end();
        rooms.delete(code);
      }
    }
  }, 5 * 60 * 1000);
  sweep.unref();

  const findPlayer = (room, key) => room?.players.find(p => p.token === key);
  const snapshot = (room, you) => ({
    code: room.code,
    capacity: room.capacity,
    status: room.status,
    revision: room.revision,
    host: room.players[0]?.color || null,
    you: you.color,
    players: room.players.map(p => ({ color:p.color, name:p.name, connected:!!room.streams.get(p.token)?.size })),
    game: room.game,
  });
  function broadcast(room) {
    for (const player of room.players) {
      const msg = `data: ${JSON.stringify(snapshot(room, player))}\n\n`;
      for (const response of room.streams.get(player.token) || []) response.write(msg);
    }
  }
  async function api(req, res, url) {
    const method = req.method;
    const path = url.pathname;
    if (method === 'GET' && path === '/api/health') return json(res, 200, { online: true });
    if (method === 'POST' && path === '/api/rooms') {
      const input = await bodyJSON(req);
      const capacity = Number(input.players);
      if (!PLAYER_COLORS[capacity]) return json(res, 400, { error:'Choose 2, 3, or 4 players.' });
      const code = newCode(rooms);
      const player = { token:token(), color:PLAYER_COLORS[capacity][0], name:cleanName(input.name) };
      const room = { code, capacity, status:'waiting', players:[player], streams:new Map(), game:null, revision:0, updatedAt:Date.now() };
      rooms.set(code, room);
      return json(res, 201, { code, token:player.token, room:snapshot(room, player) });
    }
    if (method === 'POST' && path === '/api/rooms/join') {
      const input = await bodyJSON(req);
      const code = String(input.code || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return json(res, 404, { error:'Room not found. Check the code and try again.' });
      if (room.status !== 'waiting' || room.players.length >= room.capacity) return json(res, 409, { error:'This room is full or the game has already started.' });
      const used = new Set(room.players.map(p => p.color));
      const color = PLAYER_COLORS[room.capacity].find(c => !used.has(c));
      const player = { token:token(), color, name:cleanName(input.name) };
      room.players.push(player); room.revision++; room.updatedAt = Date.now();
      broadcast(room);
      return json(res, 200, { code, token:player.token, room:snapshot(room, player) });
    }
    const match = path.match(/^\/api\/rooms\/([A-Z2-9]{6})(?:\/(events|action|leave))?$/);
    if (!match) return json(res, 404, { error:'Not found.' });
    const [, code, operation] = match;
    const room = rooms.get(code);
    if (!room) return json(res, 404, { error:'Room not found or expired.' });
    if (method === 'GET') {
      const player = findPlayer(room, url.searchParams.get('token'));
      if (!player) return json(res, 403, { error:'Invalid room session.' });
      if (operation === 'events') {
        res.writeHead(200, { 'Content-Type':'text/event-stream; charset=utf-8', 'Cache-Control':'no-cache, no-transform', 'Connection':'keep-alive', 'X-Accel-Buffering':'no' });
        res.write(': connected\n\n');
        if (!room.streams.has(player.token)) room.streams.set(player.token, new Set());
        room.streams.get(player.token).add(res);
        const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25000);
        heartbeat.unref();
        req.on('close', () => {
          clearInterval(heartbeat);
          room.streams.get(player.token)?.delete(res);
          if (rooms.has(code)) broadcast(room);
        });
        broadcast(room);
        return;
      }
      if (!operation) return json(res, 200, snapshot(room, player));
      return json(res, 405, { error:'Method not allowed.' });
    }
    if (method === 'POST' && (operation === 'action' || operation === 'leave')) {
      const input = await bodyJSON(req);
      const player = findPlayer(room, input.token);
      if (!player) return json(res, 403, { error:'Invalid room session.' });
      room.updatedAt = Date.now();
      if (operation === 'leave') {
        if (room.status !== 'waiting') return json(res, 409, { error:'A started game keeps your seat so you can return.' });
        room.players = room.players.filter(p => p.token !== player.token); room.revision++;
        for (const response of room.streams.get(player.token) || []) response.end();
        room.streams.delete(player.token);
        if (!room.players.length) rooms.delete(code); else broadcast(room);
        return json(res, 200, { ok:true });
      }
      if (input.action === 'start') {
        if (room.players[0].token !== player.token) return json(res, 403, { error:'Only the host can start.' });
        if (room.status !== 'waiting' || room.players.length !== room.capacity) return json(res, 409, { error:'Wait for all players to join.' });
        room.game = createGame(room.capacity, Object.fromEntries(room.players.map(p => [p.color,p.name])));
        room.status = 'playing';
      } else {
        if (room.status !== 'playing' || !room.game) return json(res, 409, { error:'The game is not active.' });
        if (currentColor(room.game) !== player.color) return json(res, 403, { error:'It is not your turn.' });
        try {
          if (input.action === 'roll') room.game = rollDice(room.game, rollDie());
          else if (input.action === 'move') room.game = movePawn(room.game, Number(input.pawn), input.die === undefined ? undefined : Number(input.die));
          else return json(res, 400, { error:'Unknown action.' });
        } catch (error) { return json(res, 400, { error:error.message }); }
        if (room.game.winner) room.status = 'finished';
      }
      room.revision++;
      broadcast(room);
      return json(res, 200, snapshot(room, player));
    }
    return json(res, 405, { error:'Method not allowed.' });
  }
  function serve(req, res, url) {
    if (!['GET','HEAD'].includes(req.method)) return json(res, 405, { error:'Method not allowed.' });
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { return json(res, 400, { error:'Bad URL.' }); }
    if (pathname === '/') pathname = '/index.html';
    const ext = extname(pathname).toLowerCase();
    const isAsset = pathname.startsWith('/assets/') && PUBLIC_ASSET_EXTENSIONS.has(ext);
    const isVendor = pathname.startsWith('/vendor/') && (ext === '.mjs' || ext === '.txt');
    if (pathname.split('/').some(part => part.startsWith('.')) || (!PUBLIC_FILES.has(pathname) && !isAsset && !isVendor)) return json(res, 404, { error:'Not found.' });
    const file = resolve(ROOT, '.' + pathname);
    if (!file.startsWith(ROOT + sep)) return json(res, 403, { error:'Forbidden.' });
    let info;
    try {
      // Reject symlinks, including directory symlinks, rather than serving a
      // non-public file that happens to be reachable from a public path.
      if (realpathSync(file) !== file) return json(res, 404, { error:'Not found.' });
      info = statSync(file);
    } catch { return json(res, 404, { error:'Not found.' }); }
    if (!info.isFile()) return json(res, 404, { error:'Not found.' });
    res.writeHead(200, { 'Content-Type':TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control':/\.(html|js|css|webmanifest)$/.test(file) ? 'no-cache' : 'public, max-age=3600', 'Content-Length':info.size });
    if (req.method === 'HEAD') res.end(); else createReadStream(file).pipe(res);
  }
  const server = http.createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return json(res, 400, { error:'Bad URL.' }); }
    if (url.pathname.startsWith('/api/')) api(req, res, url).catch(error => {
      if (!res.headersSent) json(res, 400, { error:error.message || 'Request failed.' });
      else res.end();
    });
    else serve(req, res, url);
  });
  server.on('close', () => clearInterval(sweep));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST || '0.0.0.0';
  createAppServer().listen(port, host, () => console.log(`Nstar Ludo running on http://${host}:${port}`));
}
