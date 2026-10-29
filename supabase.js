import { supabaseConfig } from './supabase-config.js';

// ?backend=local is only for the included Node room-server development tests.
const localOverride = typeof location !== 'undefined' && new URLSearchParams(location.search).get('backend') === 'local';
export const cloudConfigured = Boolean(supabaseConfig.url && supabaseConfig.publishableKey && !localOverride);
let clientPromise;
export async function getClient() {
  if (!cloudConfigured) throw new Error('Supabase is not configured for this app.');
  if (!clientPromise) clientPromise = import('./vendor/supabase-js.mjs').then(({createClient}) => createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},
  })).catch(error => { clientPromise = null; throw error; });
  return clientPromise;
}
function unwrap({data,error}) { if (error) throw error; return data; }

export function buildRoomRequest(path, body = {}) {
  const route = new URL(path, 'https://relative.invalid/');
  const clean = route.pathname.slice(1);
  if (clean === 'health') return {op:'health'};
  if (clean === 'rooms') return {op:'create',...body};
  if (clean === 'rooms/join') return {op:'join',...body};
  const match = clean.match(/^rooms\/([A-Z2-9]{6})(?:\/(action|leave))?$/);
  if (!match) throw new Error('Invalid room request.');
  const [,code,action] = match;
  if (!action) return {op:'snapshot',code,token:route.searchParams.get('token')};
  if (action === 'leave') return {op:'leave',code,...body};
  return {...body,op:body.action,code};
}

// The Edge Function is the only service that can read and mutate room rows.
// A player's high-entropy room token is sent in the body, not in a URL.
export async function roomApi(path, body, timeout = 10000) {
  const request = buildRoomRequest(path,body);
  const sb = await getClient();
  const {data:{session}} = await sb.auth.getSession();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(),timeout);
  try {
    const headers = {apikey:supabaseConfig.publishableKey,'Content-Type':'application/json'};
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const response = await fetch(`${supabaseConfig.url}/functions/v1/nstar-room`,{method:'POST',headers,body:JSON.stringify(request),signal:controller.signal,cache:'no-store',credentials:'omit'});
    let result; try { result = await response.json(); } catch { throw new Error('The room service returned an invalid response.'); }
    if (!response.ok) { const error = new Error(result.error || 'The room service is unavailable.'); error.status = response.status; throw error; }
    return result;
  } catch(error) {
    if (error?.name === 'AbortError') throw new Error('The room service timed out. Please try again.');
    throw error;
  } finally { clearTimeout(timer); }
}

export async function subscribeRoom(channelId, color, onUpdate, onPresence, onStatus) {
  const sb = await getClient();
  const channel = sb.channel(`nstar-room:${channelId}`, {config:{broadcast:{self:false},presence:{key:color}}});
  channel.on('broadcast',{event:'update'},() => onUpdate());
  channel.on('presence',{event:'sync'},() => onPresence(Object.keys(channel.presenceState())));
  channel.subscribe(status => {
    onStatus(status);
    if (status === 'SUBSCRIBED') channel.track({color}).catch(() => {});
  });
  return { close(){ sb.removeChannel(channel).catch(() => {}); } };
}

function avatarURL(sb, path, updated) {
  if (!path) return '';
  const url = sb.storage.from('nstar-avatars').getPublicUrl(path).data.publicUrl;
  return `${url}?v=${encodeURIComponent(updated || '')}`;
}
export async function loadAccount(user) {
  const sb = await getClient();
  let profile = unwrap(await sb.from('nstar_profiles').select('id,display_name,avatar_path,updated_at').eq('id',user.id).maybeSingle());
  if (!profile) {
    const name = String(user.displayName || user.email?.split('@')[0] || 'Player').trim().slice(0,24) || 'Player';
    profile = unwrap(await sb.from('nstar_profiles').upsert({id:user.id,display_name:name}).select('id,display_name,avatar_path,updated_at').single());
  }
  const stats = unwrap(await sb.from('nstar_online_stats').select('games_played,games_won').eq('user_id',user.id).maybeSingle());
  return {profile:{name:profile.display_name,email:user.email || '',avatarUrl:avatarURL(sb,profile.avatar_path,profile.updated_at),ownerId:user.id},stats:{games:stats?.games_played || 0,wins:stats?.games_won || 0}};
}
export async function loadStats(userId) {
  const sb = await getClient();
  const stats = unwrap(await sb.from('nstar_online_stats').select('games_played,games_won').eq('user_id',userId).maybeSingle());
  return {games:stats?.games_played || 0,wins:stats?.games_won || 0};
}
export async function saveProfile(user, name, image) {
  const sb = await getClient();
  const patch = {id:user.id,display_name:name,updated_at:new Date().toISOString()};
  if (image?.size) {
    if (!['image/jpeg','image/png','image/webp'].includes(image.type)) throw new Error('Choose a JPEG, PNG, or WebP image.');
    if (image.size > 2*1024*1024) throw new Error('Your profile picture must be 2 MB or smaller.');
    const path = `${user.id}/avatar`;
    unwrap(await sb.storage.from('nstar-avatars').upload(path,image,{upsert:true,contentType:image.type,cacheControl:'3600'}));
    patch.avatar_path = path;
  }
  const row = unwrap(await sb.from('nstar_profiles').upsert(patch).select('display_name,avatar_path,updated_at').single());
  return {name:row.display_name,email:user.email || '',avatarUrl:avatarURL(sb,row.avatar_path,row.updated_at),ownerId:user.id};
}
