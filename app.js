import { COLORS, PLAYER_COLORS, createGame, currentColor, currentPlayer, countHome, legalMoves, legalDiceForPawn, movePawn, pawnPosition, rollDice } from './engine.js';
import * as Auth from './auth.js';
import * as Cloud from './supabase.js';

const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const toastNode = document.querySelector('#toast');
const announcer = document.querySelector('#game-announcer');
let lastAnnouncement = '';
const storage = {
  get(key, fallback, session = false) { try { const raw = (session ? sessionStorage : localStorage).getItem(`nstar.${key}`); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } },
  set(key, value, session = false) { try { (session ? sessionStorage : localStorage).setItem(`nstar.${key}`, JSON.stringify(value)); } catch {} },
  remove(key, session = false) { try { (session ? sessionStorage : localStorage).removeItem(`nstar.${key}`); } catch {} },
};
const defaults = { sound:true, vibration:true, notifications:false, music:false, theme:'system', language:'en', boardTheme:'nstar' };
const saved = storage.get('game', null);
const state = {
  view:'home', tab:'play', menu:false,
  profile:{ name:'Guest Player', email:'', ...storage.get('profile', {}) },
  settings:{ ...defaults, ...storage.get('settings', {}) },
  stats:{ games:0, wins:0, ...storage.get('stats', {}) },
  local:saved?.state?.players && saved?.state?.pieces ? saved : null,
  game:null, mode:null, busy:false,
  online:{ available:null, room:null, session:storage.get('online-session', null, true), stream:null, connecting:false, joinCode:'', selectedCount:2, realtimeHealthy:false, presence:[], generation:0, pollTimer:null, fallbackTimer:null, pendingRefresh:null, refreshAgain:false },
  authMode:'login', authUser:null, cloudStats:null, tourPage:0,
};
const $ = (selector, root = document) => root.querySelector(selector);
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const cap = color => COLORS[color]?.label || String(color);
const initials = name => String(name).trim().split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase() || 'GP';
const isGuest = () => !state.authUser && state.profile.name === 'Guest Player';
const shownStats = () => state.authUser && state.cloudStats ? state.cloudStats : state.stats;
let toastTimer;
function toast(message) {
  toastNode.textContent = message; toastNode.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastNode.classList.remove('show'), 3400);
}
function persistProfile(){ storage.set('profile', state.profile); }
function persistSettings(){ storage.set('settings', state.settings); }
function persistStats(){ storage.set('stats', state.stats); }
function persistGame(){ if (state.local) storage.set('game', state.local); else storage.remove('game'); }
function applyTheme() {
  const selected = state.settings.theme;
  const dark = selected === 'dark' || (selected === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

function avatar(sizeClass = '') {
  const guest = isGuest();
  const picture = state.profile.avatarUrl && /^https:\/\//.test(state.profile.avatarUrl) ? `<img class="avatar-photo" src="${escapeHTML(state.profile.avatarUrl)}" alt="">` : '';
  return `<div class="avatar ${guest ? '' : 'initials'} ${sizeClass}" aria-hidden="true">${picture || (guest ? icon('user') : escapeHTML(initials(state.profile.name)))}<span class="avatar-dot"></span></div>`;
}
function brand() {
  return `<button type="button" class="brand" data-action="home" aria-label="Nstar Ludo home"><img src="assets/icons/brand.svg" alt=""><span class="brand-text"><strong>Nstar</strong> Ludo<span class="brand-dot">.</span></span></button>`;
}
function homeTabs(){
  return `<nav class="tabs" aria-label="Main navigation">${[['play','gamepad','Play'],['friends','users','Friends'],['leaderboard','chart','Leaderboard']].map(([key,ic,label]) => `<button type="button" data-action="tab" data-value="${key}" class="${state.tab === key ? 'active' : ''}" ${state.tab === key ? 'aria-current="page"' : ''}>${icon(ic)}${label}</button>`).join('')}</nav>`;
}
function profileMenu(){
  if (!state.menu) return '';
  return `<div class="profile-menu" role="menu"><button role="menuitem" data-action="settings">${icon('settings')} Settings</button><button role="menuitem" data-action="${state.authUser ? 'sign-out' : 'sign-in'}">${icon('logout')} ${state.authUser ? 'Sign out' : 'Sign in'}</button></div>`;
}
function statCard(type, number, label) {
  return `<div class="stat-card ${type === 'trophy' ? 'wins' : ''}"><div class="stat-icon ${type === 'trophy' ? 'gold' : ''}">${icon(type)}</div><strong class="stat-number">${number}</strong><span class="stat-label">${label}</span></div>`;
}
function modeCard(tone, title, description, detail, action, badge = '') {
  const online = action === 'online';
  const pawns = online ? `<span class="mode-wifi">${icon('wifi')}</span>` : `<span class="mini-pawns" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`;
  return `<article class="mode-card ${tone}"><div class="mode-card-top">${pawns}<span class="mode-badge">${badge || 'PASS & PLAY'}</span></div><h3>${title}</h3><p>${description}<br>${detail}</p><button type="button" class="mode-action" data-action="${action}">${online ? 'Create or join' : 'Play now'} ${icon('arrow-right')}</button></article>`;
}
function homeContent(){
  if (state.tab !== 'play') {
    const friends = state.tab === 'friends';
    return `<h2 class="content-heading">${friends ? 'Friends' : 'Leaderboard'}</h2><div class="empty-panel"><div class="empty-art">${icon(friends ? 'users' : 'chart')}</div><h3>Coming Soon!</h3><p>${friends ? 'Your friends list is on its way. For now, invite someone to a private room.' : 'The global leaderboard is on its way. For now, enjoy a friendly match.'}</p><button class="secondary-button empty-action" data-action="${friends ? 'online' : 'tab'}" ${friends ? '' : 'data-value="play"'}>${friends ? 'Play online' : 'Back to play'}</button></div>`;
  }
  const hasLocal = !!state.local && state.local.state.phase !== 'finished';
  const hasOnline = !!state.online.session;
  return `<section class="feature-banner" aria-label="Welcome to NStar Ludo"><div class="feature-copy"><span class="feature-eyebrow"><span class="feature-spark">✦</span> YOUR TABLE IS READY</span><h2>Game night<br><em>starts here.</em></h2><p>Roll, race, and make every move count.</p><button class="feature-button" data-action="${hasLocal ? 'resume-local' : 'start-2'}">${icon('play')} ${hasLocal ? 'Continue game' : 'Quick play'} <span>${icon('arrow-right')}</span></button></div></section>
    <div class="heading-row"><div class="section-title"><div><span class="section-overline">PICK YOUR GAME</span><h2>Game Modes</h2><p>Choose how you want to play</p></div></div><button class="section-help" data-action="help">How to play ${icon('arrow-right')}</button></div>
    <div class="mode-grid">
      ${modeCard('', '2 Players', 'The classic face-off', 'Share one device', 'start-2')}
      ${modeCard('green', '3 Players', 'Three-way challenge', 'Share one device', 'start-3')}
      ${modeCard('orange', '4 Players', 'A full table of fun', 'Share one device', 'start-4')}
      ${modeCard('purple', 'Play Online', 'Private rooms with friends', 'Play from anywhere', 'online', 'BETA')}
    </div>
    <div class="guide-banner"><img class="guide-board" src="assets/images/board.png" alt=""><div class="guide-copy"><h3>${hasLocal ? 'Your game is waiting' : hasOnline ? 'Return to your online room' : 'New to the game?'}</h3><p>${hasLocal ? 'Pick up your pass-and-play game where you left off.' : hasOnline ? 'Jump back in while your room is still active.' : 'Learn the basics in less than a minute.'}</p></div><button class="text-button" data-action="${hasLocal ? 'resume-local' : hasOnline ? 'resume-online' : 'help'}">${hasLocal || hasOnline ? 'Resume game' : 'Learn the rules'} ${icon('arrow-right')}</button></div>`;
}
function renderHome(){
  return `<div class="home-page"><header class="home-top"><div class="container"><div class="topbar">${brand()}<div class="top-actions"><button class="top-link" data-action="help" aria-label="How to play">${icon('help')}<span>How to play</span></button><span class="offline-badge">Ready to play</span></div></div>
    <div class="home-hero"><div class="welcome-row"><div class="profile-wrap"><div class="welcome-profile">${avatar()}<div class="welcome-copy"><p>Welcome back,</p><h1>${escapeHTML(state.profile.name)}</h1><div class="welcome-sub">${icon('sparkles')} Let’s make it a game night</div></div></div><button class="gear-button" data-action="profile-menu" aria-label="Open account menu" aria-expanded="${state.menu}">${icon('settings')}</button>${profileMenu()}</div><div class="stats-grid">${statCard('gamepad', shownStats().games, 'Games')}${statCard('trophy', shownStats().wins, 'Wins')}</div></div></div>${homeTabs()}</div></header>
    <main class="container home-content">${homeContent()}</main><div class="small-footnote">NSTAR LUDO &nbsp;·&nbsp; MADE FOR GAME NIGHTS</div></div>`;
}
function settingToggle(key, label, description, glyph) {
  return `<label class="setting-row"><span class="setting-icon">${icon(glyph)}</span><span class="setting-copy"><strong>${label}</strong><small>${description}</small></span><span class="switch"><input type="checkbox" role="switch" data-setting="${key}" aria-label="${label}" ${state.settings[key] ? 'checked' : ''}><span></span></span></label>`;
}
function settingButton(glyph, title, description, action){
  return `<button class="setting-row setting-row-button" data-action="${action}"><span class="setting-icon">${icon(glyph)}</span><span class="setting-copy"><strong>${title}</strong><small>${description}</small></span>${icon('chevron')}</button>`;
}
function renderSettings(){
  const stats = shownStats();
  const rate = stats.games ? Math.round(stats.wins / stats.games * 100) : 0;
  return `<div class="settings-page"><header class="subpage-top"><div class="container"><div class="page-heading"><button class="back-button" data-action="home" aria-label="Back to home">${icon('arrow-left')}</button><h1>Settings</h1></div><div class="profile-card">${avatar()}<div class="profile-copy"><strong>${escapeHTML(state.profile.name)}</strong><span>${escapeHTML(state.profile.email || 'Playing as a guest')}</span><em>★ &nbsp; Ludo Player</em></div><button class="edit-button" data-action="edit-profile" aria-label="Edit profile">${icon('edit')}</button></div></div></header>
  <main class="container settings-content"><section class="settings-block"><h2>Game Statistics</h2><p class="stats-source">${state.authUser && state.cloudStats ? 'Cloud stats · online games' : 'This device · pass-and-play and online games'}</p><div class="settings-stats"><div class="settings-stat">${icon('gamepad')}<strong>${stats.games}</strong><span>Games</span></div><div class="settings-stat">${icon('trophy')}<strong>${stats.wins}</strong><span>Wins</span></div><div class="settings-stat">${icon('chart')}<strong>${rate}%</strong><span>Win Rate</span></div></div></section>
  <section class="settings-block"><h2>Game Settings</h2><div class="setting-list">${settingToggle('sound','Sound','Enable game sounds','sound')}${settingToggle('music','Background music','Play a gentle game-night tune','music')}${settingToggle('vibration','Vibration','Enable vibration feedback when supported','vibrate')}${settingToggle('notifications','Notifications','Turn notifications on when allowed','bell')}</div></section>
  <section class="settings-block"><h2>Appearance</h2><div class="setting-list"><label class="setting-row"><span class="setting-icon">${icon('gamepad')}</span><span class="setting-copy"><strong>Board style</strong><small>Choose the NStar or original LudoVerse board</small></span><select class="setting-select" data-setting="boardTheme" aria-label="Board style"><option value="nstar" ${state.settings.boardTheme === 'nstar' ? 'selected' : ''}>NStar</option><option value="classic" ${state.settings.boardTheme === 'classic' ? 'selected' : ''}>Classic</option></select></label><label class="setting-row"><span class="setting-icon">${icon('palette')}</span><span class="setting-copy"><strong>Theme</strong><small>Choose app theme</small></span><select class="setting-select" data-setting="theme" aria-label="Theme"><option value="system" ${state.settings.theme === 'system' ? 'selected' : ''}>System</option><option value="light" ${state.settings.theme === 'light' ? 'selected' : ''}>Light</option><option value="dark" ${state.settings.theme === 'dark' ? 'selected' : ''}>Dark</option></select></label><label class="setting-row"><span class="setting-icon">${icon('globe')}</span><span class="setting-copy"><strong>Language</strong><small>Preference saved; interface currently in English</small></span><select class="setting-select" data-setting="language" aria-label="Language"><option value="en" ${state.settings.language === 'en' ? 'selected' : ''}>English</option><option value="es" ${state.settings.language === 'es' ? 'selected' : ''}>Spanish</option><option value="fr" ${state.settings.language === 'fr' ? 'selected' : ''}>French</option><option value="hi" ${state.settings.language === 'hi' ? 'selected' : ''}>Hindi</option></select></label></div></section>
  <section class="settings-block"><h2>Account</h2><div class="setting-list">${settingButton('lock','Change Password','Update your account password','change-password')}${settingButton('shield','Privacy Information','How your game data is stored','privacy')}${settingButton('file','Terms Information','About this demonstration','terms')}</div></section><button class="primary-button settings-signout" data-action="${state.authUser ? 'sign-out' : 'sign-in'}">${icon('logout')} ${state.authUser ? 'Sign Out' : 'Sign In'}</button></main></div>`;
}
function onlinePlayerRow(color, player, snapshot){
  const you = player?.color === snapshot.you;
  return `<div class="room-player ${player ? '' : 'waiting'}" style="--player:${COLORS[color].hex}"><span class="room-player-dot"></span><div><strong>${player ? escapeHTML(player.name) : 'Waiting for player…'}</strong><small>${cap(color)}${you ? ' · You' : ''}${player && player.color === snapshot.host ? ' · Host' : ''}</small></div><span class="room-status">${player ? (Cloud.cloudConfigured ? (state.online.realtimeHealthy ? (player.connected ? 'Connected' : 'Away') : 'Joined') : (player.connected ? 'Connected' : 'Reconnecting')) : ''}</span></div>`;
}
function renderLobby(snapshot){
  const host = snapshot.host === snapshot.you;
  const full = snapshot.players.length === snapshot.capacity;
  return `<div class="room-head"><div><span class="field-label">YOUR PRIVATE ROOM</span><div class="room-code">${escapeHTML(snapshot.code)}</div><p class="room-sub">Share this code with ${snapshot.capacity - 1 === 1 ? 'a friend' : `${snapshot.capacity - 1} friends`} to play together.</p></div><button class="secondary-button" data-action="copy-room">${icon('copy')} Copy invite</button></div>
  <div class="room-list">${PLAYER_COLORS[snapshot.capacity].map(color => onlinePlayerRow(color, snapshot.players.find(p => p.color === color), snapshot)).join('')}</div>
  <div class="room-actions"><button class="secondary-button" data-action="leave-room">Leave room</button>${host ? `<button class="primary-button" data-action="start-room" ${full ? '' : 'disabled'}>${icon('play')} ${full ? 'Start game' : 'Waiting for players'}</button>` : `<button class="primary-button" disabled>Waiting for host to start</button>`}</div>
  <div class="status-line ${state.online.connecting ? 'connecting' : ''}">${state.online.connecting ? 'Connecting to room…' : `${snapshot.players.length} of ${snapshot.capacity} players joined`}</div>`;
}
function renderOnline(){
  const snap = state.online.room;
  const available = state.online.available;
  return `<div class="online-page"><header class="subpage-top online-top"><div class="container"><div class="topbar">${brand()}<span class="connection-status ${available === true ? 'connected' : available === false ? 'disconnected' : 'checking'}" role="status">${available === true ? 'Connected' : available === false ? 'Offline' : 'Connecting…'}</span></div><div class="page-heading"><button class="back-button" data-action="online-back" aria-label="Back to home">${icon('arrow-left')}</button><div class="heading-copy"><h1>Play Online</h1><p>Bring your friends to the board, wherever they are.</p></div></div></div></header><main class="container online-content">${snap && snap.status === 'waiting' ? renderLobby(snap) : `<div class="online-intro"><h2>Let’s play together</h2><p>Create a private room or join one with a code. Share it with friends wherever they are.</p></div>
    <div class="online-grid"><section class="online-card"><span class="section-icon">${icon('users')}</span><h3>Create a room</h3><p>Choose the number of players, then send your room code to friends.</p><label class="field-label" for="room-size">Number of players</label><select id="room-size" class="field" data-setting="room-size"><option value="2" ${state.online.selectedCount===2?'selected':''}>2 players</option><option value="3" ${state.online.selectedCount===3?'selected':''}>3 players</option><option value="4" ${state.online.selectedCount===4?'selected':''}>4 players</option></select><button class="primary-button" data-action="create-room" ${available !== true ? 'disabled' : ''}>${icon('play')} Create room</button></section>
    <section class="online-card"><span class="section-icon">${icon('wifi')}</span><h3>Join a room</h3><p>Have a code from a friend? Enter it below to join their game.</p><form data-form="join-room"><label class="field-label" for="room-code">Room code</label><input class="field field-code" id="room-code" name="code" placeholder="e.g. ABC234" value="${escapeHTML(state.online.joinCode)}" minlength="6" maxlength="6" autocomplete="off" required><button class="secondary-button" type="submit" ${available !== true ? 'disabled' : ''}>Join room ${icon('arrow-right')}</button></form></section></div>
    <div class="info-note">${icon('info')}<span>${available === false ? (Cloud.cloudConfigured ? 'The online service is unavailable. Check your connection and try again.' : 'Online play needs the included JavaScript room server. Run npm start, or deploy the server, then open the app from it.') : available === null ? 'Checking the room service…' : (Cloud.cloudConfigured ? 'Private rooms use secure cloud storage and real-time updates. Rooms expire after 7 days of inactivity.' : 'Rooms are private and temporary. They last while this server is running; local pass-and-play also works offline.')}</span>${available === false ? '<button class="retry-online" data-action="retry-online">Try again</button>' : ''}</div>`}</main></div>`;
}
function canAct(){ return state.mode !== 'online' || (!state.online.connecting && state.online.room?.you === currentColor(state.game)); }
function renderBoard(game){
  const legal = game.phase === 'move' && canAct() && !state.busy ? legalMoves(game) : [];
  const current = currentColor(game);
  const pawns = [];
  for (const player of game.players) {
    game.pieces[player.color].forEach((progress, index) => {
      const [row,col] = pawnPosition(player.color,index,progress);
      pawns.push({color:player.color,index,progress,row,col});
    });
  }
  const groups = new Map();
  for (const pawn of pawns) {
    const key = `${pawn.row}:${pawn.col}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(pawn);
  }
  const pawnMarkup = pawns.map(pawn => {
    const group = groups.get(`${pawn.row}:${pawn.col}`);
    const i = group.indexOf(pawn);
    const angle = group.length > 1 ? (Math.PI * 2 * i / group.length - Math.PI / 2) : 0;
    const radius = group.length > 1 ? .28 : 0;
    const row = pawn.row + Math.sin(angle) * radius;
    const col = pawn.col + Math.cos(angle) * radius;
    const selectable = pawn.color === current && legal.includes(pawn.index);
    const positionLabel = pawn.progress === -1 ? 'in the yard' : pawn.progress === 56 ? 'home' : 'on the board';
    return `<button type="button" class="pawn ${selectable ? 'selectable' : ''}" style="--pawn:${COLORS[pawn.color].hex};left:${(col+.5)/15*100}%;top:${(row+.5)/15*100}%" data-action="move" data-pawn="${pawn.index}" aria-label="${cap(pawn.color)} pawn ${pawn.index + 1}, ${positionLabel}${selectable ? ', select to move' : ''}" ${selectable ? '' : 'disabled'}></button>`;
  }).join('');
  const centers = {red:[11.5,2.5],green:[2.5,2.5],yellow:[2.5,11.5],blue:[11.5,11.5]};
  const [row,col] = centers[current];
  const turnLabel = game.phase === 'finished' ? '' : `<div class="yard-indicator" style="color:${COLORS[current].hex};left:${(col+.5)/15*100}%;top:${(row+.5)/15*100}%">${state.mode === 'online' && !canAct() ? `${cap(current)}'s turn` : 'Your turn!'}<small>${game.phase === 'move' ? 'Choose a pawn' : 'Roll the dice'}</small></div>`;
  const corners = game.players.map(player => {
    const ready = player.color === current && game.phase === 'roll' && canAct() && !state.busy;
    const number = game.lastRoll?.color === player.color ? game.lastRoll.value : 1;
    return `<button type="button" class="corner-die ${player.color} ${ready ? 'ready' : 'inactive'}" style="--player:${COLORS[player.color].hex}" data-action="roll" aria-label="Roll dice for ${cap(player.color)}" ${ready ? '' : 'disabled'}><img src="assets/images/dice/${number}.png" alt=""></button>`;
  }).join('');
  const boardAsset = state.settings.boardTheme === 'classic' ? 'assets/images/board.png' : 'assets/boards/nstar-board.svg';
  return `<div class="board-stage"><div class="board-frame"><img class="board-image" src="${boardAsset}" alt="Ludo board with green, yellow, red and blue corners">${pawnMarkup}${turnLabel}${corners}</div></div>`;
}
function renderScores(game){
  const places = ['1st','2nd','3rd','4th'];
  return `<div class="scoreboard" aria-label="Player scores">${game.players.map(player => {
    const place = (game.winners || []).indexOf(player.color);
    const current = player.color === currentColor(game) && game.phase !== 'finished';
    const home = countHome(game,player.color);
    const display = state.mode === 'online' ? player.name : cap(player.color);
    const detail = place >= 0 ? `${places[place]} place` : `${home}/4 home`;
    return `<div class="score-player ${current ? 'active' : ''}" style="--player:${COLORS[player.color].hex}" aria-label="${escapeHTML(display)}, ${detail}${current ? ', current turn' : ''}"><i class="score-dot" aria-hidden="true">${icon('user')}</i><span class="score-name">${escapeHTML(display)}</span><small>${detail}</small>${current ? '<b class="seat-active">PLAYING</b>' : ''}</div>`;
  }).join('')}</div>`;
}
function renderHistory(game){
  if (!game.history.length) return `<div class="history-empty">No rolls yet. Tap the dice to get started!</div>`;
  return `<div class="history-list">${game.history.slice(-10).reverse().map(item => `<span class="history-item" style="--player:${COLORS[item.color].hex}" title="${cap(item.color)} rolled ${item.value}"><i></i><img src="assets/images/dice/${item.value}.png" alt=""><span>${item.value}</span></span>`).join('')}</div>`;
}
function renderGamePanel(game){
  const color = currentColor(game), label = cap(color), allowed = canAct();
  const moving = game.phase === 'move';
  const reconnecting = state.mode === 'online' && state.online.connecting;
  const pending = game.pendingRolls || (moving && game.roll ? [game.roll] : []);
  const canRoll = game.phase === 'roll' && allowed && !state.busy;
  const lastNumber = game.lastRoll?.value || 1;
  const rollText = reconnecting ? 'Reconnecting…' : state.busy ? 'Rolling…' : moving ? (allowed ? 'Choose a pawn' : 'Waiting for a move') : allowed ? (pending.length ? 'Roll again' : 'Roll the dice') : `Waiting for ${label}`;
  const subtitle = reconnecting ? 'Waiting to reconnect to your room' : moving ? (allowed ? 'Tap a glowing pawn, then choose a saved die' : 'Another player is choosing a pawn') : allowed ? (pending.length ? 'Your six is saved. Roll again before moving.' : 'Tap here or the dice beside the board') : 'It’s another player’s turn';
  const available = pending.length ? `<div class="saved-dice"><span>Your Dice Rolls</span><div>${pending.map(value => `<span class="saved-die"><img src="assets/images/dice/${value}.png" alt="${value}"></span>`).join('')}</div></div>` : '';
  const options = moving && allowed ? `<div class="pawn-options" aria-label="Available pawns">${legalMoves(game).map(i => `<button class="pawn-option" style="--player:${COLORS[color].hex}" data-action="move" data-pawn="${i}">Pawn ${i+1}</button>`).join('')}</div>` : '';
  const rankings = (game.rankings || []).map((rankColor,i) => `<div class="ranking-row"><span class="ranking-medal rank-${i+1}">${i+1}</span><strong style="color:${rankColor === 'yellow' ? '#9b7400' : COLORS[rankColor].hex}">${cap(rankColor)}</strong><small>${(game.winners || []).includes(rankColor) ? 'Finished' : 'Remaining player'}</small></div>`).join('');
  const winner = game.winner ? `<div class="winner-box"><span class="winner-crown">${icon('crown')}</span><strong>${cap(game.winner)} wins!</strong><p>All places have been decided. Nice game!</p><div class="rankings">${rankings}</div><div class="winner-actions"><button class="primary-button" data-action="play-again">${icon('play')} ${state.mode === 'online' ? 'New room' : 'Play again'}</button><button class="secondary-button" data-action="finish-home">Home</button></div></div>` : '';
  return `<aside class="game-panel" style="--player:${COLORS[color].hex};--player-text:${color === 'yellow' ? '#9b7400' : COLORS[color].hex}"><p class="turn-kicker">${game.winner ? 'GAME OVER' : state.mode === 'online' && !allowed ? 'WAITING FOR PLAYER' : 'NOW PLAYING'}</p><div class="turn-line"><span class="turn-color-dot"></span><h1>${game.winner ? `${cap(game.winner)} wins!` : `${label}’s turn`}</h1></div><p class="turn-message" aria-live="polite">${escapeHTML(game.message)}</p>
    ${game.winner ? winner : `<button class="roll-control ${state.busy ? 'rolling' : ''}" data-action="roll" ${canRoll ? '' : 'disabled'}><img src="assets/images/dice/${state.busy ? 'draw.gif' : `${lastNumber}.png`}" alt=""><span><strong>${rollText}</strong><small>${subtitle}</small></span>${icon('arrow-right')}</button>${available}${options}`}
    <div class="history-heading">${icon('history')}<h2>Dice History</h2><span class="history-count">${game.rollCount} ${game.rollCount === 1 ? 'roll' : 'rolls'}</span></div>${renderHistory(game)}<div class="game-help">${icon('help')}<span>Need a refresher on the rules?</span><button data-action="help">How to play</button></div></aside>`;
}
function renderGame(){
  const game = state.game;
  if (!game) return '';
  const sub = state.mode === 'online' ? `Room ${escapeHTML(state.online.room?.code || '')} · ${state.online.connecting ? 'Reconnecting…' : `You are ${cap(state.online.room?.you || 'red')}`}` : `${game.players.length} players · Pass & play`;
  return `<div class="game-page"><div class="container"><header class="game-toolbar"><button class="back-button" data-action="exit-game" aria-label="Exit game">${icon('arrow-left')}</button><div class="game-title"><strong>Nstar Ludo</strong><small>${sub}</small></div><button class="circle-icon-btn" data-action="toggle-sound" aria-label="${state.settings.sound ? 'Mute sounds' : 'Enable sounds'}">${icon(state.settings.sound ? 'sound' : 'muted')}</button><button class="circle-icon-btn" data-action="help" aria-label="How to play">${icon('help')}</button></header><main class="game-layout"><div class="board-column">${renderScores(game)}${renderBoard(game)}</div>${renderGamePanel(game)}</main></div></div>`;
}
function renderAuth(){
  const signup = state.authMode === 'signup';
  return `<div class="auth-page ${signup ? 'signup' : ''}"><div class="auth-shell"><button class="auth-back" data-action="home" aria-label="Back to home">${icon('arrow-left')}</button><img class="auth-logo" src="assets/icons/brand.svg" alt=""><h1 class="auth-title">NSTAR LUDO</h1><section class="auth-card"><h1>${signup ? 'Create Account' : 'Login'}</h1>${Auth.authConfigured ? `<p class="auth-note">Online rooms work without an account. Email sign-up currently needs a configured mail provider for public users.</p>` : `<p class="auth-note">Account sign-in is unavailable in local-server mode. You can continue as a guest.</p>`}<form data-form="auth">${signup ? '<input class="field" name="name" placeholder="Full name" aria-label="Full name" maxlength="24" required autocomplete="name">' : ''}<input class="field" type="email" name="email" placeholder="Email" aria-label="Email" required autocomplete="email"><input class="field" type="password" name="password" placeholder="Password" aria-label="Password" required minlength="6" autocomplete="${signup ? 'new-password' : 'current-password'}">${signup ? '<input class="field" type="password" name="confirm" placeholder="Confirm password" aria-label="Confirm password" required minlength="6" autocomplete="new-password">' : '<button type="button" class="forgot" data-action="forgot-password">Forgot Password?</button>'}<button class="primary-button" type="submit" ${Auth.authConfigured ? '' : 'disabled'}>${signup ? 'SIGN UP' : 'LOGIN'}</button></form></section><p class="auth-switch">${signup ? 'Already have an account?' : "Don’t have an account?"} <button data-action="auth-switch">${signup ? 'Login' : 'Sign Up'}</button></p><div class="auth-divider">OR</div><button class="auth-google" data-action="google-login" ${Auth.googleConfigured ? '' : 'disabled'}><span class="google-g">G</span> Sign in with Google${Auth.googleConfigured ? '' : ' (setup required)'}</button><button class="auth-offline" data-action="home">${icon('gamepad')} Play Offline</button></div></div>`;
}
function render(){
  if (state.view === 'home') app.innerHTML = renderHome();
  else if (state.view === 'settings') app.innerHTML = renderSettings();
  else if (state.view === 'online') app.innerHTML = renderOnline();
  else if (state.view === 'game') app.innerHTML = renderGame();
  else if (state.view === 'auth') app.innerHTML = renderAuth();
  document.title = `${state.view === 'game' ? 'Game · ' : state.view === 'settings' ? 'Settings · ' : state.view === 'online' ? 'Online · ' : ''}Nstar Ludo`;
  const announcement = state.view === 'game' && state.game ? state.game.message : '';
  if (announcer && announcement !== lastAnnouncement) { announcer.textContent = announcement; lastAnnouncement = announcement; }
}
function navigate(view, scroll = true){ state.view = view; state.menu = false; render(); if (scroll) window.scrollTo({top:0,behavior:'instant'}); }
function openModal(title, body, footer = '') {
  if (modal.open) modal.close();
  modal.innerHTML = `<div class="modal-inner"><div class="modal-head"><h2 id="modal-title">${escapeHTML(title)}</h2><button class="modal-close" data-action="close-modal" aria-label="Close">${icon('x')}</button></div><div class="modal-body">${body}</div>${footer ? `<div class="modal-actions">${footer}</div>` : ''}</div>`;
  modal.showModal();
}
function closeModal(){ if (modal.open) modal.close(); }
function showHelp(){
  openModal('How to play', `<p>Gather 2, 3, or 4 players and race your four pawns home.</p><ol><li><strong>Roll a six</strong> to bring a pawn out of its yard. A six gives you another roll; your dice are saved so you can choose which to use.</li><li><strong>Tap a glowing pawn</strong> after rolling to move it around the board.</li><li><strong>Land on an opponent</strong> to send their pawn back. Starting squares and starred squares are safe.</li><li><strong>Reach home exactly.</strong> You need the exact roll to bring each pawn into the center.</li><li>The first player to bring <strong>all four pawns home</strong> wins. In a 3- or 4-player game, the others keep playing for the remaining places. Three sixes in a row pass your turn.</li></ol><p>For pass & play, share the device. For online play, share your private room code.</p>`, `<button class="secondary-button" data-action="tour-start">Take a tour</button><button class="primary-button" data-action="close-modal">Got it!</button>`);
}
function showTour(page = 0){
  const slides = [
    ['Welcome to Nstar Ludo', 'Experience the classic board game in a whole new way.'],
    ['Play with Friends', 'Challenge your friends and family to exciting matches, together on one device or in a private room.'],
    ['Ready to roll?', 'Choose 2, 3, or 4 players, pick your colors, and let the game night begin.']
  ];
  state.tourPage = Math.max(0,Math.min(page,slides.length-1));
  const [title,description] = slides[state.tourPage];
  openModal(title, `<div class="tour-graphic"><img src="assets/images/board.png" alt="Colorful Ludo board"><span class="tour-sparkle">${icon('sparkles')}</span></div><p class="tour-description">${description}</p><div class="tour-dots" aria-label="Tour page ${state.tourPage+1} of ${slides.length}">${slides.map((_,i) => `<button class="tour-dot ${i === state.tourPage ? 'active' : ''}" data-action="tour-page" data-page="${i}" aria-label="Go to tour page ${i+1}"></button>`).join('')}</div>`, `<button class="secondary-button" data-action="close-modal">Skip</button><button class="primary-button" data-action="${state.tourPage === slides.length-1 ? 'close-modal' : 'tour-next'}">${state.tourPage === slides.length-1 ? 'Get started' : 'Next'} ${icon('arrow-right')}</button>`);
}
function editProfile(){
  openModal('Edit profile', `<form class="modal-form" data-form="profile"><label class="field-label" for="profile-name">Player name</label><input class="field" id="profile-name" name="name" value="${escapeHTML(state.profile.name)}" maxlength="24" required autocomplete="nickname">${state.authUser ? `<label class="field-label" for="profile-avatar">Profile photo (optional)</label><input class="field" id="profile-avatar" name="avatar" type="file" accept="image/jpeg,image/png,image/webp"><p class="auth-note">Your name, picture, and online-game stats are saved to your account. Photos are public and must be 2 MB or smaller.</p>` : `<p class="auth-note">Your guest profile and stats are saved on this device. Sign in to save a profile photo.</p>`}<div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancel</button><button type="submit" class="primary-button">Save changes</button></div></form>`);
  $('#profile-name', modal)?.focus();
}
function confirmExit(){
  if (!state.game || state.game.phase === 'finished') return finishHome();
  const message = state.mode === 'online' ? 'You can resume this room from this browser while the server keeps it open.' : 'Are you sure you want to exit the game? Your progress will be lost.';
  openModal('Exit Game', `<p>${message}</p>`, `<button class="secondary-button" data-action="close-modal">Cancel</button><button class="danger-button" data-action="confirm-exit">Exit game</button>`);
}
function requestStart(count){
  if (state.local && state.local.state.phase !== 'finished') {
    openModal('Start a new game?', '<p>Your current pass-and-play game will be replaced.</p>', `<button class="secondary-button" data-action="close-modal">Cancel</button><button class="primary-button" data-action="confirm-new-game" data-count="${count}">Start new game</button>`);
  } else startLocal(count);
}
function newId(){ return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function startLocal(count){
  closeModal();
  const game = createGame(count);
  state.local = { id:newId(), state:game, winRecorded:false };
  state.game = game; state.mode = 'local'; state.busy = false;
  state.stats.games += 1; persistStats(); persistGame();
  navigate('game');
}
function saveLocal(next){
  state.game = next;
  if (!state.local) return;
  state.local.state = next;
  const firstWinner = next.winners?.[0] || next.winner;
  if (firstWinner && !state.local.winRecorded) {
    state.local.winRecorded = true;
    if (firstWinner === 'red') { state.stats.wins += 1; persistStats(); }
    playSound('win');
  }
  persistGame();
}
function finishHome(){
  closeModal();
  if (state.mode === 'local') { state.local = null; persistGame(); }
  if (state.mode === 'online') { disconnectRoom(); state.online.room = null; state.online.session = null; storage.remove('online-session', true); }
  state.game = null; state.mode = null; state.busy = false;
  navigate('home');
}
function confirmExitNow(){
  closeModal();
  if (state.mode === 'local') { state.local = null; persistGame(); }
  else { disconnectRoom(); state.online.room = null; }
  state.game = null; state.mode = null; state.busy = false; navigate('home');
}
function randomDie(){
  if (!globalThis.crypto?.getRandomValues) return Math.floor(Math.random()*6)+1;
  const bytes = new Uint8Array(1);
  do { crypto.getRandomValues(bytes); } while (bytes[0] >= 252);
  return bytes[0] % 6 + 1;
}
const effects = { roll:'assets/sounds/roll_the_dice.mp3', move:'assets/sounds/move.wav', win:'assets/sounds/victory.wav' };
function playSound(kind){
  if (!state.settings.sound || !effects[kind]) return;
  try { const audio = new Audio(effects[kind]); audio.volume = kind === 'win' ? .45 : .65; audio.play().catch(() => {}); } catch {}
}
function vibrate(ms = 20){ if (state.settings.vibration) { try { navigator.vibrate?.(ms); } catch {} } }
let musicTimer, musicContext, musicStep = 0;
function stopMusic(){ clearInterval(musicTimer); musicTimer = null; musicContext?.suspend?.().catch?.(() => {}); }
function startMusic(){
  if (!state.settings.music || musicTimer) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    musicContext ||= new AudioContextClass();
    musicContext.resume().catch(() => {});
    const notes = [261.63,329.63,392,493.88,440,392,329.63,293.66,261.63,329.63,392,440,392,329.63,293.66,246.94];
    const note = () => {
      if (!state.settings.music || musicContext.state !== 'running') return;
      const osc = musicContext.createOscillator(), gain = musicContext.createGain();
      osc.type = 'sine'; osc.frequency.value = notes[musicStep++ % notes.length];
      gain.gain.setValueAtTime(.0001, musicContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.025, musicContext.currentTime + .04);
      gain.gain.exponentialRampToValueAtTime(.0001, musicContext.currentTime + .38);
      osc.connect(gain).connect(musicContext.destination); osc.start(); osc.stop(musicContext.currentTime + .4);
    };
    note(); musicTimer = setInterval(note, 460);
  } catch { toast('Background music is not supported by this browser.'); }
}
async function performRoll(){
  if (!state.game || state.game.phase !== 'roll' || !canAct() || state.busy) return;
  const mode = state.mode, gameRef = state.game;
  state.busy = true; playSound('roll'); vibrate(20); render();
  await new Promise(resolve => setTimeout(resolve, 400));
  if (state.view !== 'game' || state.mode !== mode || !state.game) { state.busy = false; return; }
  try {
    if (mode === 'local') {
      if (state.game !== gameRef) return;
      saveLocal(rollDice(state.game, randomDie()));
    } else await onlineAction('roll');
  } catch(error) { toast(error.message); }
  finally { state.busy = false; if (state.view === 'game') render(); }
}
function requestPawn(index){
  if (!state.game || state.game.phase !== 'move' || !canAct() || state.busy || !legalMoves(state.game).includes(index)) return;
  const choices = legalDiceForPawn(state.game,index);
  const dice = state.game.pendingRolls || [state.game.roll];
  if (dice.length < 2) { performMove(index,choices[0]); return; }
  const color = currentColor(state.game);
  const options = dice.map((value,die) => `<button class="die-choice" style="--player:${COLORS[color].hex}" data-action="choose-die" data-pawn="${index}" data-die="${die}" aria-label="Use ${value} for pawn ${index+1}" ${choices.includes(die) ? '' : 'disabled'}><img src="assets/images/dice/${value}.png" alt=""><span>${value}</span></button>`).join('');
  openModal('Select Dice to Move', `<p>Which dice do you want to use for Pawn ${index+1}?</p><div class="die-choices">${options}</div>`, `<button class="secondary-button" data-action="close-modal">Cancel</button>`);
}
async function animateLocalPawn(before, after, index){
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const color = currentColor(before), from = before.pieces[color][index], to = after.pieces[color][index];
  const element = app.querySelector(`.pawn.selectable[data-pawn="${index}"]`);
  if (!element) return;
  const steps = from < 0 ? [to] : Array.from({length:to-from},(_,i) => from+i+1);
  app.querySelectorAll('.pawn.selectable').forEach(pawn => { pawn.classList.remove('selectable'); pawn.disabled = true; });
  element.style.zIndex = '8'; element.style.transition = 'left 100ms ease-out, top 100ms ease-out';
  for (const step of steps) {
    const [row,col] = pawnPosition(color,index,step);
    element.style.left = `${(col+.5)/15*100}%`; element.style.top = `${(row+.5)/15*100}%`;
    await new Promise(resolve => setTimeout(resolve,105));
    if (state.view !== 'game' || state.game !== before) break;
  }
}
async function performMove(index, die){
  if (!state.game || state.game.phase !== 'move' || !canAct() || state.busy || !legalDiceForPawn(state.game,index).includes(die)) return;
  state.busy = true; playSound('move'); vibrate(15);
  try {
    if (state.mode === 'local') {
      const before = state.game, after = movePawn(before,index,die);
      await animateLocalPawn(before,after,index);
      if (state.view === 'game' && state.mode === 'local' && state.game === before) saveLocal(after);
    } else await onlineAction('move',{pawn:index,die});
  } catch(error) { toast(error.message); }
  finally { state.busy = false; if (state.view === 'game') render(); }
}
async function api(path, body, timeout = 10000){
  if (Cloud.cloudConfigured) return Cloud.roomApi(path,body,timeout);
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`./api/${path}`, { method:body ? 'POST' : 'GET', headers:body ? {'Content-Type':'application/json'} : {}, body:body ? JSON.stringify(body) : undefined, signal:controller.signal, cache:'no-store' });
    let data;
    try { data = await response.json(); } catch { throw new Error('The room server returned an invalid response.'); }
    if (!response.ok) throw new Error(data.error || 'Could not reach the room server.');
    return data;
  } finally { clearTimeout(timer); }
}
async function checkOnline(){
  state.online.available = null; if (state.view === 'online' && !state.online.room) render();
  try { const health = await api('health', null, 4000); state.online.available = !!health.online; }
  catch { state.online.available = false; }
  if (state.view === 'online') render();
}
function disconnectRoom(){
  state.online.generation++;
  state.online.stream?.close(); state.online.stream = null;
  clearInterval(state.online.pollTimer); clearTimeout(state.online.fallbackTimer);
  state.online.pollTimer = null; state.online.fallbackTimer = null;
  state.online.connecting = false; state.online.realtimeHealthy = false; state.online.presence = [];
  state.online.pendingRefresh = null; state.online.refreshAgain = false;
}
async function refreshOnline(){
  const session = state.online.session;
  if (!session) return;
  if (state.online.pendingRefresh) { state.online.refreshAgain = true; return state.online.pendingRefresh; }
  const generation = state.online.generation;
  const pending = api(`rooms/${encodeURIComponent(session.code)}?token=${encodeURIComponent(session.token)}`)
    .then(snapshot => { if (state.online.generation === generation && state.online.session?.token === session.token) applyOnlineSnapshot(snapshot); })
    .finally(() => {
      if (state.online.pendingRefresh === pending) state.online.pendingRefresh = null;
      if (state.online.refreshAgain && state.online.generation === generation) { state.online.refreshAgain = false; refreshOnline().catch(() => {}); }
    });
  state.online.pendingRefresh = pending;
  return pending;
}
function connectRoom(){
  disconnectRoom();
  const session = state.online.session, room = state.online.room;
  if (!session) return;
  state.online.connecting = true;
  if (Cloud.cloudConfigured && room?.channel) {
    const generation = state.online.generation;
    const current = () => generation === state.online.generation && state.online.session?.token === session.token;
    const updateView = () => { if (state.view === 'online' || (state.view === 'game' && state.mode === 'online')) render(); };
    state.online.fallbackTimer = setTimeout(() => { if (current() && state.online.connecting) { state.online.connecting=false; state.online.realtimeHealthy=false; updateView(); } },7000);
    Cloud.subscribeRoom(room.channel, room.you,
      () => { if (current()) refreshOnline().catch(() => {}); },
      colors => { if (!current()) return; state.online.presence = colors; if (state.online.room) state.online.room.players = state.online.room.players.map(p => ({...p,connected:colors.includes(p.color)})); updateView(); },
      status => {
        if (!current()) return;
        if (status === 'SUBSCRIBED') { clearTimeout(state.online.fallbackTimer); state.online.connecting=false; state.online.realtimeHealthy=true; refreshOnline().catch(() => {}); }
        else if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)) { state.online.connecting=false; state.online.realtimeHealthy=false; }
        updateView();
      }
    ).then(stream => { if (current()) state.online.stream=stream; else stream.close(); })
     .catch(() => { if (current()) { state.online.connecting=false; state.online.realtimeHealthy=false; updateView(); } });
    // Poll as a recovery path when the websocket or a notification is missed.
    state.online.pollTimer = setInterval(() => { if (current()) refreshOnline().catch(() => {}); },15000);
    return;
  }
  const stream = new EventSource(`./api/rooms/${encodeURIComponent(session.code)}/events?token=${encodeURIComponent(session.token)}`);
  state.online.stream = stream;
  stream.onopen = () => { state.online.connecting = false; if (state.view === 'online' || (state.view === 'game' && state.mode === 'online')) render(); };
  stream.onerror = () => { state.online.connecting = true; if (state.view === 'online' || (state.view === 'game' && state.mode === 'online')) render(); };
  stream.onmessage = event => {
    if (state.online.stream !== stream) return;
    try { applyOnlineSnapshot(JSON.parse(event.data)); } catch(error) { console.error('Invalid room update', error); }
  };
}
async function refreshCloudStats(){
  const user = state.authUser;
  if (!user || !Cloud.cloudConfigured) return;
  try { const stats = await Cloud.loadStats(user.id); if (state.authUser?.id === user.id) { state.cloudStats=stats; if (state.view === 'home' || state.view === 'settings') render(); } }
  catch(error) { console.warn('Could not refresh cloud statistics:',error.message); }
}
function recordOnline(snapshot, previous){
  if (!snapshot.game) return;
  const key = `${snapshot.code}:${snapshot.you}`;
  const records = storage.get('online-records', {});
  let record = records[key];
  if (!record) {
    record = { won:false };
    state.stats.games += 1; persistStats();
  }
  const firstWinner = snapshot.game.winners?.[0] || snapshot.game.winner;
  if (!previous?.game || (firstWinner && !(previous.game?.winners?.[0] || previous.game?.winner))) refreshCloudStats();
  if (firstWinner && !record.resultRecorded) {
    record.resultRecorded = true;
    if (firstWinner === snapshot.you) { state.stats.wins += 1; persistStats(); }
  }
  records[key] = record;
  const entries = Object.entries(records);
  storage.set('online-records', Object.fromEntries(entries.slice(-100)));
  if ((snapshot.game.winners?.length || 0) > (previous?.game?.winners?.length || 0)) playSound('win');
  const wasMine = previous?.game && previous.game.phase !== 'finished' && currentColor(previous.game) === snapshot.you;
  const isMine = snapshot.game.phase !== 'finished' && currentColor(snapshot.game) === snapshot.you;
  if (!wasMine && isMine && previous?.game && document.hidden && state.settings.notifications && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification('Nstar Ludo', { body:'It’s your turn to play!', icon:'assets/icons/icon-192.png' }); } catch {}
  }
}
function applyOnlineSnapshot(snapshot){
  const previous = state.online.room;
  if (previous?.code === snapshot.code && (previous.revision ?? 0) > (snapshot.revision ?? 0)) return;
  if (Cloud.cloudConfigured) snapshot.players = snapshot.players.map(p => ({...p,connected:state.online.presence.includes(p.color)}));
  state.online.room = snapshot;
  recordOnline(snapshot, previous);
  if (snapshot.game && (state.view === 'online' || (state.view === 'game' && state.mode === 'online'))) {
    state.game = snapshot.game; state.mode = 'online';
    if (state.view === 'online') { state.view = 'game'; window.scrollTo({top:0,behavior:'instant'}); }
  }
  if (state.view === 'online' || (state.view === 'game' && state.mode === 'online')) render();
}
async function createRoom(){
  try {
    const data = await api('rooms', {players:state.online.selectedCount, name:state.profile.name});
    state.online.session = {code:data.code, token:data.token};
    storage.set('online-session', state.online.session, true);
    state.online.room = data.room; connectRoom(); render();
  } catch(error){ toast(error.message); }
}
async function joinRoom(code){
  try {
    const data = await api('rooms/join', {code:String(code).toUpperCase(), name:state.profile.name});
    state.online.session = {code:data.code, token:data.token};
    storage.set('online-session', state.online.session, true);
    state.online.room = data.room; state.online.joinCode = '';
    if (location.search) history.replaceState(null, '', location.pathname);
    connectRoom(); render();
  } catch(error){ toast(error.message); }
}
async function onlineAction(action, extra = {}){
  const session = state.online.session;
  if (!session) throw new Error('Your room session has expired.');
  try {
    const snapshot = await api(`rooms/${encodeURIComponent(session.code)}/action`, {token:session.token,action,revision:state.online.room?.revision,...extra});
    applyOnlineSnapshot(snapshot);
  } catch(error) { if (error.status === 409) await refreshOnline().catch(() => {}); throw error; }
}
async function leaveRoom(){
  const session = state.online.session;
  if (session && state.online.room?.status === 'waiting') {
    try { await api(`rooms/${encodeURIComponent(session.code)}/leave`, {token:session.token}); }
    catch(error) { toast(error.message); return; }
  }
  disconnectRoom(); state.online.session = null; state.online.room = null; storage.remove('online-session', true); navigate('home');
}
async function resumeOnline(){
  const session = state.online.session;
  if (!session) return;
  try {
    const snapshot = await api(`rooms/${encodeURIComponent(session.code)}?token=${encodeURIComponent(session.token)}`);
    state.view = 'online'; state.online.room = snapshot; connectRoom(); applyOnlineSnapshot(snapshot);
    window.scrollTo({top:0,behavior:'instant'});
  } catch(error){
    state.online.session = null; state.online.room = null; storage.remove('online-session', true); toast(error.message);
    if (state.view === 'online') { render(); checkOnline(); } else render();
  }
}
async function copyRoom(){
  const code = state.online.room?.code;
  if (!code) return;
  const url = new URL(location.href); url.search = `?room=${code}`; url.hash = '';
  try { await navigator.clipboard.writeText(url.toString()); toast('Invite link copied!'); }
  catch {
    openModal('Share this room', `<p>Give this room code to your friends:</p><p class="room-code">${escapeHTML(code)}</p><p>Or copy this link:</p><input class="field" readonly aria-label="Invite link" value="${escapeHTML(url.toString())}">`, `<button class="primary-button" data-action="close-modal">Done</button>`);
  }
}
function friendlyError(error){
  const code = error?.code || '';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return 'Email or password is incorrect.';
  if (code === 'auth/email-already-in-use') return 'This email is already registered.';
  if (code === 'auth/weak-password') return 'Please use a stronger password.';
  if (code === 'auth/requires-recent-login') return 'Please sign out and sign in again before changing your password.';
  if (code === 'auth/popup-closed-by-user') return 'Google sign-in was cancelled.';
  return error?.message || 'Something went wrong. Please try again.';
}
function forgotPassword(){
  if (!Auth.authConfigured) { toast('Account sign-in is unavailable in local-server mode.'); return; }
  openModal('Reset password', `<p>Enter your account email and we’ll send a password reset link.</p><form data-form="reset-password"><label class="field-label" for="reset-email">Email address</label><input class="field" id="reset-email" name="email" type="email" required autocomplete="email"><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancel</button><button type="submit" class="primary-button">Send reset link</button></div></form>`);
}
function passwordModal(){
  if (!state.authUser) { toast('Sign in to change an account password.'); state.authMode='login'; navigate('auth'); return; }
  openModal('Change password', `<form data-form="change-password"><label class="field-label" for="new-password">New password</label><input class="field" id="new-password" name="password" type="password" minlength="6" required autocomplete="new-password"><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancel</button><button type="submit" class="primary-button">Update password</button></div></form>`);
}
async function doSignOut(){
  try { if (state.authUser) await Auth.signOut(); state.authUser = null; state.cloudStats = null; state.profile = {name:'Guest Player',email:'',avatarUrl:''}; persistProfile(); state.authMode='login'; navigate('auth'); }
  catch(error){ toast(friendlyError(error)); }
}
async function setPreference(input){
  const key = input.dataset.setting;
  if (key === 'room-size') { state.online.selectedCount = Number(input.value); return; }
  if (key === 'boardTheme') { state.settings.boardTheme = input.value === 'classic' ? 'classic' : 'nstar'; persistSettings(); return; }
  if (key === 'theme') { state.settings.theme = input.value; applyTheme(); persistSettings(); return; }
  if (key === 'language') { state.settings.language = input.value; persistSettings(); if (input.value !== 'en') toast('Preference saved. Interface translations are not available yet.'); return; }
  let value = input.checked;
  if (key === 'notifications' && value) {
    if (!('Notification' in window) || typeof Notification.requestPermission !== 'function') { value = false; toast('Notifications are not available in this browser.'); }
    else {
      try { const permission = await Notification.requestPermission(); value = permission === 'granted'; if (!value) toast('Browser notification permission was not granted.'); }
      catch { value = false; toast('Could not enable notifications.'); }
    }
    input.checked = value;
  }
  state.settings[key] = value; persistSettings();
  if (key === 'music') value ? startMusic() : stopMusic();
}
document.addEventListener('change', event => {
  const input = event.target.closest('[data-setting]');
  if (input) setPreference(input);
});
document.addEventListener('click', async event => {
  if (event.target === modal) { closeModal(); return; }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (state.settings.music && !musicTimer) startMusic();
  switch(action){
    case 'home':
      if (state.view === 'online' && state.online.room?.status === 'waiting') await leaveRoom();
      else navigate('home');
      break;
    case 'profile-menu': state.menu = !state.menu; render(); break;
    case 'settings': navigate('settings'); break;
    case 'tab': state.tab = button.dataset.value; state.menu = false; render(); break;
    case 'help': showHelp(); break;
    case 'tour-start': showTour(0); break;
    case 'tour-next': showTour(state.tourPage + 1); break;
    case 'tour-page': showTour(Number(button.dataset.page)); break;
    case 'edit-profile': editProfile(); break;
    case 'start-2': case 'start-3': case 'start-4': requestStart(Number(action.slice(-1))); break;
    case 'confirm-new-game': startLocal(Number(button.dataset.count)); break;
    case 'resume-local': if (state.local) { state.game = state.local.state; state.mode = 'local'; state.busy = false; navigate('game'); } break;
    case 'online':
      if (state.online.session) await resumeOnline();
      else { state.online.room = null; navigate('online'); checkOnline(); }
      break;
    case 'resume-online': await resumeOnline(); break;
    case 'online-back': if (state.online.room?.status === 'waiting') await leaveRoom(); else navigate('home'); break;
    case 'retry-online': await checkOnline(); break;
    case 'create-room': await createRoom(); break;
    case 'leave-room': await leaveRoom(); break;
    case 'copy-room': await copyRoom(); break;
    case 'start-room': try { await onlineAction('start'); } catch(error){ toast(error.message); } break;
    case 'roll': await performRoll(); break;
    case 'move': requestPawn(Number(button.dataset.pawn)); break;
    case 'choose-die': { const pawn = Number(button.dataset.pawn), die = Number(button.dataset.die); closeModal(); await performMove(pawn,die); break; }
    case 'toggle-sound': state.settings.sound = !state.settings.sound; persistSettings(); render(); toast(`Sound ${state.settings.sound ? 'on' : 'off'}`); break;
    case 'exit-game': confirmExit(); break;
    case 'confirm-exit': confirmExitNow(); break;
    case 'finish-home': finishHome(); break;
    case 'play-again':
      if (state.mode === 'local') startLocal(state.game.players.length);
      else { disconnectRoom(); state.online.session = null; state.online.room = null; storage.remove('online-session', true); state.game=null; state.mode=null; navigate('online'); checkOnline(); }
      break;
    case 'close-modal': closeModal(); break;
    case 'sign-in': state.authMode='login'; navigate('auth'); break;
    case 'sign-out': await doSignOut(); break;
    case 'auth-switch': state.authMode = state.authMode === 'login' ? 'signup' : 'login'; render(); break;
    case 'google-login':
      try { await Auth.googleLogin(); navigate('home'); } catch(error){ toast(friendlyError(error)); }
      break;
    case 'forgot-password': forgotPassword(); break;
    case 'change-password': passwordModal(); break;
    case 'privacy': openModal('Privacy information', `<p><strong>On this device:</strong> guest profile, preferences, pass-and-play saves, and local statistics are stored in your browser.</p><p><strong>Cloud:</strong> Supabase stores account information, uploaded public profile photos, online-game statistics, player names, and private room game state. Room session tokens stay in this browser; the server stores only their hashes. Rooms expire after 7 days of inactivity.</p><p>Replace this notice with a privacy policy appropriate for your deployment.</p>`, `<button class="primary-button" data-action="close-modal">Done</button>`); break;
    case 'terms': openModal('Terms information', `<p>Nstar Ludo is a browser-based recreation of the referenced game. Play responsibly and respect other players.</p><p>Online rooms are a demonstration and do not provide a production service guarantee. Add your own terms before deploying publicly.</p>`, `<button class="primary-button" data-action="close-modal">Done</button>`); break;
  }
});
document.addEventListener('submit', async event => {
  const form = event.target.closest('[data-form]');
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form), kind = form.dataset.form;
  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    if (kind === 'profile') {
      const name = String(data.get('name') || '').trim().slice(0,24);
      if (!name) throw new Error('Please enter a player name.');
      if (state.authUser) {
        await Auth.updateName(name);
        state.profile = await Cloud.saveProfile(state.authUser,name,data.get('avatar'));
      } else state.profile.name = name;
      persistProfile(); closeModal(); render(); toast('Profile updated.');
    } else if (kind === 'join-room') {
      const code = String(data.get('code') || '').trim().toUpperCase();
      if (!/^[A-Z2-9]{6}$/.test(code)) throw new Error('Enter the 6-character room code.');
      await joinRoom(code);
    } else if (kind === 'auth') {
      const email = String(data.get('email') || '').trim(), password = String(data.get('password') || '');
      if (state.authMode === 'signup') {
        if (password !== String(data.get('confirm'))) throw new Error('Passwords do not match.');
        const name = String(data.get('name') || '').trim();
        if (!name) throw new Error('Please enter your name.');
        const result = await Auth.signUp(name,email,password);
        if (result.requiresEmailConfirmation) { state.authMode='login'; navigate('auth'); toast('Check your email to confirm your account, then sign in.'); return; }
        state.authUser = result.user; state.profile = {name,email,avatarUrl:'',ownerId:result.user?.id}; persistProfile();
      } else {
        const result = await Auth.logIn(email,password);
        state.authUser = result.user; state.profile = {name:result.user.displayName || email.split('@')[0],email,avatarUrl:'',ownerId:result.user.id}; persistProfile();
      }
      navigate('home'); toast('Welcome to Nstar Ludo!');
    } else if (kind === 'reset-password') {
      await Auth.resetPassword(String(data.get('email') || '').trim()); closeModal(); toast('Password reset email sent.');
    } else if (kind === 'change-password') {
      await Auth.changePassword(String(data.get('password') || '')); closeModal(); toast('Password updated.');
    }
  } catch(error){ toast(friendlyError(error)); }
  finally { if (submit?.isConnected) submit.disabled = false; }
});

const incomingRoom = new URL(location.href).searchParams.get('room');
if (incomingRoom && /^[A-Z2-9]{6}$/i.test(incomingRoom)) { state.online.joinCode = incomingRoom.toUpperCase(); state.view='online'; }
render();
if (state.view === 'online') checkOnline();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) navigator.serviceWorker.register('./sw.js').catch(() => {});
let authGeneration = 0;
if (Auth.authConfigured) Auth.observeAuth(async (user,event) => {
  const generation = ++authGeneration;
  state.authUser = user;
  if (user) {
    try {
      const account = await Cloud.loadAccount(user);
      if (generation !== authGeneration) return;
      state.profile = account.profile; state.cloudStats = account.stats; persistProfile();
    } catch(error) { console.warn('Cloud profile unavailable:',error.message); }
  } else {
    state.cloudStats = null;
    if (state.profile.ownerId) { state.profile = {name:'Guest Player',email:'',avatarUrl:''}; persistProfile(); }
  }
  if (state.view === 'home' || state.view === 'settings') render();
  if (event === 'PASSWORD_RECOVERY' && user) passwordModal();
}).catch(error => console.warn('Account sign-in unavailable:', error.message));
window.addEventListener('online', () => { if (state.view === 'online') checkOnline(); });
window.addEventListener('offline', () => { if (state.view === 'online') { state.online.available=false; render(); } });
