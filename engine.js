/**
 * Nstar Ludo's shared, deterministic game rules.
 * The same functions run in the browser and on the room server.
 */
export const COLOR_ORDER = ['red', 'green', 'yellow', 'blue'];
export const PLAYER_COLORS = {
  2: ['red', 'yellow'],
  3: ['red', 'yellow', 'blue'],
  4: ['red', 'green', 'yellow', 'blue'],
};
export const COLORS = {
  red: { label: 'Red', hex: '#f64909', start: 0 },
  green: { label: 'Green', hex: '#12a331', start: 13 },
  yellow: { label: 'Yellow', hex: '#ffca18', start: 26 },
  blue: { label: 'Blue', hex: '#465bd2', start: 39 },
};

// [row, column] cells on the 15 x 15 board, starting at red's entry.
export const TRACK = [
  [13,6],[12,6],[11,6],[10,6],[9,6], [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  [7,0], [6,0],[6,1],[6,2],[6,3],[6,4],[6,5], [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
  [0,7],[0,8], [1,8],[2,8],[3,8],[4,8],[5,8], [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
  [7,14], [8,14],[8,13],[8,12],[8,11],[8,10],[8,9], [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
  [14,7],[14,6],
];
// Entry squares and the four starred squares are safe.
export const SAFE_TRACK = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
export const HOME_LANES = {
  red: [[13,7],[12,7],[11,7],[10,7],[9,7]],
  green: [[7,1],[7,2],[7,3],[7,4],[7,5]],
  yellow: [[1,7],[2,7],[3,7],[4,7],[5,7]],
  blue: [[7,13],[7,12],[7,11],[7,10],[7,9]],
};
const YARDS = {
  red: [[10.5,1.5],[10.5,3.5],[12.5,1.5],[12.5,3.5]],
  green: [[1.5,1.5],[1.5,3.5],[3.5,1.5],[3.5,3.5]],
  yellow: [[1.5,10.5],[1.5,12.5],[3.5,10.5],[3.5,12.5]],
  blue: [[10.5,10.5],[10.5,12.5],[12.5,10.5],[12.5,12.5]],
};
const CENTERS = { red: [7.75,7], green: [7,6.25], yellow: [6.25,7], blue: [7,7.75] };
const copy = value => JSON.parse(JSON.stringify(value));
export const currentPlayer = state => state.players[state.turn];
export const currentColor = state => currentPlayer(state).color;
export const trackIndex = (color, progress) => (COLORS[color].start + progress) % TRACK.length;
export const countHome = (state, color) => state.pieces[color].filter(step => step === 56).length;
const pending = state => Array.isArray(state.pendingRolls) ? state.pendingRolls : (state.phase === 'move' && Number.isInteger(state.roll) ? [state.roll] : []);
const canMove = (position, die) => position === -1 ? die === 6 : position < 56 && position + die <= 56;
const ordinal = number => ['1st','2nd','3rd','4th'][number - 1] || `${number}th`;

export function createGame(count, names = {}) {
  const colors = PLAYER_COLORS[count];
  if (!colors) throw new Error('Choose 2, 3, or 4 players.');
  return {
    version: 2,
    players: colors.map(color => ({ color, name: String(names[color] || COLORS[color].label).slice(0, 24) })),
    pieces: Object.fromEntries(colors.map(color => [color, [-1, -1, -1, -1]])),
    turn: 0, phase: 'roll', roll: null, pendingRolls: [], consecutiveSixes: 0,
    lastRoll: null, history: [], rollCount: 0, winners: [], rankings: [], winner: null,
    message: `${COLORS[colors[0]].label}'s turn. Roll the dice!`,
  };
}

/** Return indices of stored dice that can be used by this pawn. */
export function legalDiceForPawn(state, pawn) {
  if (state.phase !== 'move' || !Number.isInteger(pawn) || pawn < 0 || pawn > 3) return [];
  const position = state.pieces[currentColor(state)][pawn];
  return pending(state).flatMap((die, index) => canMove(position, die) ? [index] : []);
}
export function legalMoves(state) {
  if (state.phase !== 'move') return [];
  return state.pieces[currentColor(state)].flatMap((_, index) => legalDiceForPawn(state,index).length ? [index] : []);
}

function nextTurn(state) {
  const completed = new Set(state.winners || []);
  do { state.turn = (state.turn + 1) % state.players.length; }
  while (completed.has(currentColor(state)) && completed.size < state.players.length);
  state.phase = 'roll'; state.roll = null; state.pendingRolls = []; state.consecutiveSixes = 0;
}

/** Sixes are saved and grant another roll. The resulting dice can be used in any order. */
export function rollDice(previous, value) {
  if (previous.phase !== 'roll' || previous.winner) throw new Error('You cannot roll right now.');
  if (!Number.isInteger(value) || value < 1 || value > 6) throw new Error('A die must be between 1 and 6.');
  const state = copy(previous);
  state.winners ||= []; state.rankings ||= []; state.pendingRolls = [...pending(previous)];
  const color = currentColor(state), label = COLORS[color].label;
  state.rollCount += 1; state.lastRoll = { color, value };
  state.history.push({ color, value }); state.history = state.history.slice(-24);
  state.consecutiveSixes = value === 6 ? state.consecutiveSixes + 1 : 0;
  if (state.consecutiveSixes === 3) {
    nextTurn(state);
    state.message = `${label} rolled three sixes. Turn passes to ${COLORS[currentColor(state)].label}.`;
    return state;
  }
  state.pendingRolls.push(value); state.roll = value;
  if (value === 6) {
    state.phase = 'roll';
    state.message = `${label} rolled a six! Roll again; your dice are saved.`;
    return state;
  }
  state.phase = 'move';
  if (legalMoves(state).length === 0) {
    nextTurn(state);
    state.message = `${label} rolled ${value} and has no move. ${COLORS[currentColor(state)].label} is next.`;
  } else {
    state.message = `${label} rolled ${value}. Select a glowing pawn to move.`;
  }
  return state;
}

/** Move a pawn with one of the saved dice, identified by its index. */
export function movePawn(previous, index, diceIndex) {
  const choices = legalDiceForPawn(previous,index);
  const selected = diceIndex === undefined ? choices[0] : diceIndex;
  if (!Number.isInteger(index) || !Number.isInteger(selected) || !choices.includes(selected)) throw new Error('That pawn cannot move with this die.');
  const state = copy(previous);
  state.winners ||= []; state.rankings ||= []; state.pendingRolls = [...pending(previous)];
  const color = currentColor(state), label = COLORS[color].label;
  const [rolled] = state.pendingRolls.splice(selected,1);
  state.roll = state.pendingRolls.at(-1) ?? null;
  const oldPosition = state.pieces[color][index];
  const destination = oldPosition === -1 ? 0 : oldPosition + rolled;
  state.pieces[color][index] = destination;
  let captured = 0;
  if (destination <= 50) {
    const landing = trackIndex(color, destination);
    if (!SAFE_TRACK.has(landing)) {
      for (const other of state.players) {
        if (other.color === color) continue;
        state.pieces[other.color] = state.pieces[other.color].map(position => {
          if (position >= 0 && position <= 50 && trackIndex(other.color, position) === landing) { captured++; return -1; }
          return position;
        });
      }
    }
  }
  if (countHome(state, color) === 4 && !state.winners.includes(color)) {
    state.winners.push(color);
    if (state.winners.length === state.players.length - 1) {
      state.rankings = [...state.winners, ...state.players.map(p => p.color).filter(c => !state.winners.includes(c))];
      state.phase = 'finished'; state.roll = null; state.pendingRolls = []; state.winner = state.winners[0];
      state.message = `${COLORS[state.winner].label} wins! All places have been decided.`;
      return state;
    }
    nextTurn(state);
    state.message = `${label} finished in ${ordinal(state.winners.length)} place! ${COLORS[currentColor(state)].label} is next.`;
    return state;
  }
  const action = captured ? `${label} sent ${captured === 1 ? 'a pawn' : `${captured} pawns`} back!` :
    destination === 56 ? `${label} got a pawn home!` : oldPosition === -1 ? `${label} brought a pawn onto the board.` : `${label} moved a pawn.`;
  if (state.pendingRolls.length && legalMoves(state).length) {
    state.message = `${action} Choose a pawn for your remaining ${state.pendingRolls.length === 1 ? 'die' : 'dice'}.`;
  } else {
    const stranded = state.pendingRolls.length > 0;
    nextTurn(state);
    state.message = `${action}${stranded ? ' No remaining moves.' : ''} ${COLORS[currentColor(state)].label} is next.`;
  }
  return state;
}

/** Board coordinates are cell-centered, and can be mapped directly to percentages. */
export function pawnPosition(color, pawn, progress) {
  if (progress === -1) return YARDS[color][pawn];
  if (progress <= 50) return TRACK[trackIndex(color, progress)];
  if (progress <= 55) return HOME_LANES[color][progress - 51];
  const [row, col] = CENTERS[color];
  return [row + (pawn >= 2 ? 0.16 : -0.16), col + (pawn % 2 ? 0.16 : -0.16)];
}
