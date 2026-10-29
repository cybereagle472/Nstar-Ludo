import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, rollDice, movePawn, legalMoves, legalDiceForPawn, currentColor, countHome, pawnPosition, trackIndex, TRACK, SAFE_TRACK } from '../engine.js';

test('2, 3 and 4 player layouts match the reference board', () => {
  assert.deepEqual(createGame(2).players.map(p => p.color), ['red', 'yellow']);
  assert.deepEqual(createGame(3).players.map(p => p.color), ['red', 'yellow', 'blue']);
  assert.deepEqual(createGame(4).players.map(p => p.color), ['red', 'green', 'yellow', 'blue']);
  assert.equal(TRACK.length, 52);
  assert.deepEqual(TRACK[trackIndex('red', 0)], [13, 6]);
  assert.deepEqual(TRACK[trackIndex('green', 0)], [6, 1]);
  assert.deepEqual(TRACK[trackIndex('yellow', 0)], [1, 8]);
  assert.deepEqual(TRACK[trackIndex('blue', 0)], [8, 13]);
});

test('a six is required to enter and rolls are saved for selection', () => {
  let s = createGame(2);
  s = rollDice(s, 2);
  assert.equal(currentColor(s), 'yellow');
  s = rollDice(s, 6);
  assert.equal(s.phase, 'roll'); assert.deepEqual(s.pendingRolls, [6]);
  s = rollDice(s, 4);
  assert.deepEqual(s.pendingRolls, [6,4]);
  assert.deepEqual(legalMoves(s), [0, 1, 2, 3]);
  assert.deepEqual(legalDiceForPawn(s,1), [0]);
  assert.throws(() => movePawn(s,1,1));
  s = movePawn(s,1,0);
  assert.equal(s.pieces.yellow[1], 0);
  assert.equal(currentColor(s), 'yellow');
  assert.deepEqual(s.pendingRolls, [4]);
  s = movePawn(s,1,0);
  assert.equal(s.pieces.yellow[1],4);
  assert.equal(currentColor(s),'red');
});

test('several saved dice may be used in either order when legal', () => {
  let s = createGame(2); s.pieces.red[0] = 2;
  s = rollDice(rollDice(s,6),3);
  assert.deepEqual(legalDiceForPawn(s,0), [0,1]);
  s = movePawn(s,0,1); assert.equal(s.pieces.red[0],5);
  assert.deepEqual(s.pendingRolls,[6]);
  s = movePawn(s,0,0); assert.equal(s.pieces.red[0],11);
  assert.equal(currentColor(s),'yellow');
});

test('three successive sixes forfeit all stored dice and the turn', () => {
  let s = createGame(2);
  s = rollDice(rollDice(rollDice(s,6),6),6);
  assert.equal(currentColor(s), 'yellow'); assert.deepEqual(s.pendingRolls,[]);
  assert.deepEqual(s.pieces.red,[-1,-1,-1,-1]); assert.match(s.message, /three sixes/);
});

test('opponents are captured on an unsafe square but not on a safe one', () => {
  let s = createGame(2); s.pieces.red[0] = 27; s.pieces.yellow[0] = 2;
  s = movePawn(rollDice(s,1),0); assert.equal(s.pieces.yellow[0], -1);
  let safe = createGame(2); safe.pieces.red[0] = 25; safe.pieces.yellow[0] = 0;
  assert.ok(SAFE_TRACK.has(26)); safe = movePawn(rollDice(safe,1),0); assert.equal(safe.pieces.yellow[0], 0);
});

test('home requires an exact roll and two-player first place wins', () => {
  let s = createGame(2); s.pieces.red = [56,56,56,54];
  const overshoot = rollDice(s,3); assert.equal(currentColor(overshoot), 'yellow');
  s = rollDice(s,2); assert.deepEqual(legalMoves(s), [3]); s = movePawn(s,3);
  assert.equal(countHome(s,'red'),4); assert.equal(s.phase,'finished'); assert.equal(s.winner,'red');
  assert.deepEqual(s.rankings,['red','yellow']); assert.throws(() => rollDice(s,2));
});

test('three or four players keep playing for remaining places', () => {
  let s = createGame(3); s.pieces.red = [56,56,56,55];
  s = movePawn(rollDice(s,1),3);
  assert.deepEqual(s.winners,['red']); assert.equal(currentColor(s),'yellow'); assert.equal(s.phase,'roll');
  s.pieces.yellow = [56,56,56,55]; s = movePawn(rollDice(s,1),3);
  assert.equal(s.phase,'finished'); assert.equal(s.winner,'red'); assert.deepEqual(s.rankings,['red','yellow','blue']);
});

test('coordinate mapping follows colored home lanes', () => {
  assert.deepEqual(pawnPosition('red',0,51),[13,7]); assert.deepEqual(pawnPosition('green',0,55),[7,5]);
  assert.deepEqual(pawnPosition('yellow',0,51),[1,7]); assert.deepEqual(pawnPosition('blue',0,55),[7,9]);
});

test('a remaining unusable die is discarded instead of stalling the game', () => {
  let s = createGame(2); s.pieces.red = [50,56,56,56];
  s = rollDice(rollDice(s,6),4);
  s = movePawn(s,0,1); // 4 leads to 54; the remaining 6 would overshoot.
  assert.equal(s.pieces.red[0],54); assert.equal(currentColor(s),'yellow');
  assert.deepEqual(s.pendingRolls,[]); assert.match(s.message,/No remaining moves/);
});

test('four-player ranking skips players who already finished', () => {
  let s = createGame(4); s.pieces.red = [56,56,56,55];
  s = movePawn(rollDice(s,1),3); assert.equal(currentColor(s),'green');
  s.pieces.green = [56,56,56,55]; s = movePawn(rollDice(s,1),3); assert.equal(currentColor(s),'yellow');
  s.pieces.yellow = [56,56,56,55]; s = movePawn(rollDice(s,1),3);
  assert.equal(s.phase,'finished'); assert.deepEqual(s.rankings,['red','green','yellow','blue']);
});
