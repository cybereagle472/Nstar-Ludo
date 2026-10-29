import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../server.js';

test('online rooms join, authorize turns, and start', async t => {
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function post(path, data) {
    const result = await fetch(base + path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    return [result.status, await result.json()];
  }
  const [made, first] = await post('/api/rooms', {players:2, name:'Host'});
  assert.equal(made, 201);
  assert.match(first.code, /^[A-Z2-9]{6}$/);
  assert.equal(first.room.you, 'red');
  const [early] = await post(`/api/rooms/${first.code}/action`, {token:first.token,action:'start'});
  assert.equal(early, 409);
  const [joined, second] = await post('/api/rooms/join', {code:first.code,name:'Friend'});
  assert.equal(joined, 200);
  assert.equal(second.room.you, 'yellow');
  assert.ok(!JSON.stringify(second.room).includes(first.token), 'a snapshot must not expose anyone else’s token');
  const [notHost] = await post(`/api/rooms/${first.code}/action`, {token:second.token,action:'start'});
  assert.equal(notHost, 403);
  const [started, snapshot] = await post(`/api/rooms/${first.code}/action`, {token:first.token,action:'start'});
  assert.equal(started, 200);
  assert.equal(snapshot.status, 'playing');
  assert.deepEqual(snapshot.game.players.map(p => p.name), ['Host','Friend']);
  const [wrongTurn] = await post(`/api/rooms/${first.code}/action`, {token:second.token,action:'roll'});
  assert.equal(wrongTurn, 403);
  const [rolled, updated] = await post(`/api/rooms/${first.code}/action`, {token:first.token,action:'roll'});
  assert.equal(rolled, 200);
  assert.ok(updated.game.lastRoll.value >= 1 && updated.game.lastRoll.value <= 6);
  const [late] = await post('/api/rooms/join', {code:first.code,name:'Late'});
  assert.equal(late, 409);
});

test('waiting rooms can be left and host transfers', async t => {
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, data) => (await fetch(base + path, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})).json();
  const a = await post('/api/rooms', {players:3,name:'A'});
  const b = await post('/api/rooms/join', {code:a.code,name:'B'});
  await post(`/api/rooms/${a.code}/leave`, {token:a.token});
  const room = await (await fetch(`${base}/api/rooms/${a.code}?token=${encodeURIComponent(b.token)}`)).json();
  assert.equal(room.host, 'yellow');
  assert.equal(room.players.length, 1);
});

test('online server validates saved dice and synchronizes legal moves', async t => {
  const dice = [6,1];
  const server = createAppServer({rollDie:() => dice.shift()});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, data) => { const r = await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); return [r.status,await r.json()]; };
  const [,host] = await post('/api/rooms',{players:2,name:'Host'});
  const [,guest] = await post('/api/rooms/join',{code:host.code,name:'Guest'});
  const url = `/api/rooms/${host.code}/action`;
  let [status,game] = await post(url,{token:host.token,action:'start'});
  assert.equal(status,200); const startRevision = game.revision;
  [,game] = await post(url,{token:host.token,action:'roll'}); assert.deepEqual(game.game.pendingRolls,[6]);
  [,game] = await post(url,{token:host.token,action:'roll'}); assert.deepEqual(game.game.pendingRolls,[6,1]);
  assert.ok(game.revision > startRevision);
  [status] = await post(url,{token:host.token,action:'move',pawn:0,die:1}); assert.equal(status,400);
  [status,game] = await post(url,{token:host.token,action:'move',pawn:0,die:0});
  assert.equal(status,200); assert.deepEqual(game.game.pendingRolls,[1]); assert.equal(game.game.pieces.red[0],0);
  [status,game] = await post(url,{token:host.token,action:'move',pawn:0,die:0});
  assert.equal(status,200); assert.equal(game.game.pieces.red[0],1); assert.equal(game.game.turn,1);
  const guestView = await (await fetch(`${base}/api/rooms/${host.code}?token=${encodeURIComponent(guest.token)}`)).json();
  assert.deepEqual(guestView.game,game.game);
});
