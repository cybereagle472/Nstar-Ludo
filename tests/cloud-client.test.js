import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoomRequest } from '../supabase.js';

test('maps room requests to the serverless API without putting tokens in the network URL', () => {
  const token = 'x'.repeat(43);
  assert.deepEqual(buildRoomRequest('health'), {op:'health'});
  assert.deepEqual(buildRoomRequest('rooms',{players:2,name:'Player'}), {op:'create',players:2,name:'Player'});
  assert.deepEqual(buildRoomRequest('rooms/join',{code:'ABC234',name:'Player'}), {op:'join',code:'ABC234',name:'Player'});
  assert.deepEqual(buildRoomRequest(`rooms/ABC234?token=${token}`), {op:'snapshot',code:'ABC234',token});
  assert.deepEqual(buildRoomRequest('rooms/ABC234/action',{token,action:'roll',revision:5}), {token,action:'roll',revision:5,op:'roll',code:'ABC234'});
  assert.deepEqual(buildRoomRequest('rooms/ABC234/leave',{token}), {op:'leave',code:'ABC234',token});
  assert.throws(() => buildRoomRequest('rooms/../../invalid'), /Invalid room request/);
});
