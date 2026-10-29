// Supabase Edge Function: authoritative private rooms for Nstar Ludo.
// Bundle this file with the shared engine before deployment.
import { PLAYER_COLORS, createGame, currentColor, movePawn, rollDice } from '../../../engine.js';

const URL_BASE = Deno.env.get('SUPABASE_URL') || '';
const SECRET = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || '';
const PUBLIC = Deno.env.get('SUPABASE_ANON_KEY') || JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default || '';
const CORS = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type', 'Cache-Control':'no-store' };
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;
class RequestError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status; } }
class DatabaseError extends Error { status: number; constructor(status: number) { super('Database request failed'); this.status = status; } }
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), {status, headers:{...CORS,'Content-Type':'application/json'}});
const cleanName = (value: unknown) => String(value || 'Guest Player').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0,24) || 'Guest Player';
const bytes = (length: number) => crypto.getRandomValues(new Uint8Array(length));
function randomIndex(max: number) { const limit = Math.floor(256 / max) * max; let n; do { n = bytes(1)[0]; } while (n >= limit); return n % max; }
function roomCode() { return Array.from({length:6}, () => ALPHABET[randomIndex(ALPHABET.length)]).join(''); }
function newToken() { return btoa(String.fromCharCode(...bytes(32))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
async function hash(value: string) { const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(buffer), x => x.toString(16).padStart(2,'0')).join(''); }
async function db(path: string, method = 'GET', value?: unknown) {
  if (!URL_BASE || !SECRET) throw new Error('Server environment is not configured');
  const result = await fetch(`${URL_BASE}/rest/v1/${path}`, {method, headers:{apikey:SECRET, Authorization:`Bearer ${SECRET}`, 'Content-Type':'application/json', Prefer:'return=representation'}, body:value === undefined ? undefined : JSON.stringify(value)});
  const text = await result.text();
  if (!result.ok) { console.error('Database operation failed', result.status); throw new DatabaseError(result.status); }
  try { return text ? JSON.parse(text) : null; } catch { throw new Error('Invalid database response'); }
}
async function authenticatedUser(req: Request) {
  const authorization = req.headers.get('Authorization');
  if (!authorization || !PUBLIC) return null;
  const res = await fetch(`${URL_BASE}/auth/v1/user`, {headers:{apikey:PUBLIC, Authorization:authorization}});
  if (!res.ok) return null;
  const user = await res.json();
  return typeof user.id === 'string' ? user.id : null;
}
async function takeLimit(req: Request, op: string) {
  const ip = (req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').slice(0,100);
  const allowed = await db('rpc/nstar_take_rate_limit','POST',{p_key:`${op}:${await hash(ip)}`,p_limit:op === 'create' ? 15 : op === 'join' ? 45 : 300,p_seconds:60});
  if (allowed !== true) throw new RequestError('Too many requests. Please wait a moment and try again.',429);
}
function validatedCode(value: unknown) { const code = String(value || '').trim().toUpperCase(); if (!/^[A-Z2-9]{6}$/.test(code)) throw new RequestError('Enter a valid 6-character room code.'); return code; }
async function getRoom(code: string) {
  const rows = await db(`nstar_rooms?code=eq.${encodeURIComponent(code)}&select=*`);
  const room = rows?.[0];
  if (!room || Date.now() - Date.parse(room.updated_at) > EXPIRE_MS) throw new RequestError('Room not found or expired.',404);
  return room;
}
async function playerFor(room: any, token: unknown) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new RequestError('Invalid room session.',403);
  const digest = await hash(token);
  const player = room.players.find((p: any) => p.tokenHash === digest);
  if (!player) throw new RequestError('Invalid room session.',403);
  return player;
}
function snapshot(room: any, player: any) {
  return { code:room.code, channel:room.channel, capacity:room.capacity, status:room.status, revision:room.revision, host:room.players[0]?.color || null, you:player.color, players:room.players.map((p:any) => ({color:p.color,name:p.name,connected:false})), game:room.game };
}
async function saveRoom(room: any, patch: any) {
  const rows = await db(`nstar_rooms?code=eq.${encodeURIComponent(room.code)}&revision=eq.${room.revision}`,'PATCH',{...patch,revision:room.revision+1,updated_at:new Date().toISOString()});
  if (!Array.isArray(rows) || rows.length !== 1) throw new RequestError('The room changed. Please try again.',409);
  return rows[0];
}
async function createRoom(req: Request, input: any) {
  const capacity = Number(input.players) as 2 | 3 | 4;
  if (!PLAYER_COLORS[capacity]) throw new RequestError('Choose 2, 3, or 4 players.');
  const token = newToken();
  const player = {tokenHash:await hash(token),color:PLAYER_COLORS[capacity][0],name:cleanName(input.name),userId:await authenticatedUser(req)};
  // Opportunistic housekeeping. Rooms are considered expired even if cleanup fails.
  if (randomIndex(20) === 0) {
    const before = encodeURIComponent(new Date(Date.now()-EXPIRE_MS).toISOString());
    const old = encodeURIComponent(new Date(Date.now()-24*60*60*1000).toISOString());
    await Promise.allSettled([db(`nstar_rooms?updated_at=lt.${before}`,'DELETE'),db(`nstar_rate_limits?window_start=lt.${old}`,'DELETE')]);
  }
  for (let attempt=0; attempt<6; attempt++) {
    const code = roomCode();
    try {
      const rows = await db('nstar_rooms','POST',{code,capacity,players:[player]});
      return {code,token,room:snapshot(rows[0],player)};
    } catch (error) { if (error instanceof DatabaseError && error.status === 409) continue; throw error; }
  }
  throw new RequestError('Could not create a room. Please try again.',503);
}
async function joinRoom(req: Request, input: any) {
  const code = validatedCode(input.code), userId = await authenticatedUser(req);
  const token = newToken(), tokenHash = await hash(token);
  for (let attempt=0; attempt<4; attempt++) {
    const room = await getRoom(code);
    if (room.status !== 'waiting' || room.players.length >= room.capacity) throw new RequestError('This room is full or the game has already started.',409);
    if (userId && room.players.some((p:any) => p.userId === userId)) throw new RequestError('This account already has a seat in this room.',409);
    const used = new Set(room.players.map((p:any) => p.color));
    const color = PLAYER_COLORS[room.capacity as 2 | 3 | 4].find((c:string) => !used.has(c));
    const player = {tokenHash,color,name:cleanName(input.name),userId};
    try { const updated = await saveRoom(room,{players:[...room.players,player]}); return {code,token,room:snapshot(updated,player)}; }
    catch(error) { if (error instanceof RequestError && error.status === 409) continue; throw error; }
  }
  throw new RequestError('The room changed. Please try joining again.',409);
}
async function interact(input: any) {
  const room = await getRoom(validatedCode(input.code)), player = await playerFor(room,input.token);
  if (input.op === 'snapshot') return snapshot(room,player);
  if (input.op === 'leave') {
    if (room.status !== 'waiting') throw new RequestError('A started game keeps your seat so you can return.',409);
    const players = room.players.filter((p:any) => p.tokenHash !== player.tokenHash);
    if (players.length) await saveRoom(room,{players});
    else {
      const removed = await db(`nstar_rooms?code=eq.${encodeURIComponent(room.code)}&revision=eq.${room.revision}`,'DELETE');
      if (!Array.isArray(removed) || removed.length !== 1) throw new RequestError('The room changed. Please try again.',409);
    }
    return {ok:true};
  }
  if (!Number.isInteger(input.revision) || input.revision !== room.revision) throw new RequestError('The game changed. Refreshing your room; please try again.',409);
  let status = room.status, game = room.game;
  if (input.op === 'start') {
    if (room.players[0].tokenHash !== player.tokenHash) throw new RequestError('Only the host can start.',403);
    if (status !== 'waiting' || room.players.length !== room.capacity) throw new RequestError('Wait for all players to join.',409);
    game = createGame(room.capacity,Object.fromEntries(room.players.map((p:any) => [p.color,p.name]))); status = 'playing';
  } else {
    if (status !== 'playing' || !game) throw new RequestError('The game is not active.',409);
    if (currentColor(game) !== player.color) throw new RequestError('It is not your turn.',403);
    try {
      if (input.op === 'roll') game = rollDice(game,randomIndex(6)+1);
      else if (input.op === 'move') game = movePawn(game,Number(input.pawn),input.die === undefined ? undefined : Number(input.die));
      else throw new RequestError('Unknown action.');
    } catch(error) { if (error instanceof RequestError) throw error; throw new RequestError(error instanceof Error ? error.message : 'Invalid move.'); }
    if (game.winner) status = 'finished';
  }
  return snapshot(await saveRoom(room,{game,status}),player);
}
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok',{headers:CORS});
  if (req.method !== 'POST') return reply({error:'Method not allowed.'},405);
  try {
    const raw = await req.text();
    if (raw.length > 8192) throw new RequestError('Request is too large.',413);
    let input; try { input = JSON.parse(raw); } catch { throw new RequestError('Invalid request.'); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RequestError('Invalid request.');
    const op = String(input.op || '');
    if (op === 'health') { await db('nstar_rooms?select=code&limit=1'); return reply({online:true}); }
    if (!['create','join','snapshot','leave','start','roll','move'].includes(op)) throw new RequestError('Unknown action.');
    await takeLimit(req,op === 'create' || op === 'join' ? op : 'play');
    const result = op === 'create' ? await createRoom(req,input) : op === 'join' ? await joinRoom(req,input) : await interact(input);
    return reply(result);
  } catch(error) {
    if (error instanceof RequestError) return reply({error:error.message},error.status);
    console.error('Nstar room request failed',error instanceof Error ? error.message : 'unknown error');
    return reply({error:'The room service is temporarily unavailable. Please try again.'},503);
  }
});
