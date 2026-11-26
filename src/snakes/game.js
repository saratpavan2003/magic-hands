// Snakes & Ladders rules: the board, moving, snakes, ladders, turns and winning.
// No page code here, so it's easy to test.
//
// Squares are numbered 1–100, starting bottom-left and snaking back and forth row by row.
// Players start at 0 (beside square 1). Land exactly on 100 to win: a roll that goes past it
// bounces back. Rolling a 6 gives another turn.

export const LADDERS = { 4: 25, 13: 46, 33: 49, 42: 63, 50: 69, 62: 81, 74: 92 };
export const SNAKES = { 27: 5, 40: 3, 43: 18, 54: 31, 66: 45, 76: 58, 89: 53, 99: 41 };
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 2;

export const COLORS = [
  { name: 'Red', hex: '#ff4d4d' },
  { name: 'Blue', hex: '#3d8bff' },
  { name: 'Green', hex: '#2ecc71' },
  { name: 'Yellow', hex: '#ffcc29' },
];

/** Row (0 = bottom) and column (0 = left) of a square 1–100. Square 0 is just left of square 1. */
export function cell(n) {
  if (n <= 0) return { row: 0, col: -1 };
  const row = Math.floor((n - 1) / 10);
  const i = (n - 1) % 10;
  return { row, col: row % 2 ? 9 - i : i };
}

/**
 * Where a roll takes a player from `pos`. Returns { steps, landed, jump, final, won }:
 * steps: each square passed through, one per dice point (bouncing back from 100);
 * landed: the square the dice took them to; jump: 'ladder', 'snake' or null; final: where they end up.
 */
export function move(pos, roll) {
  const steps = [];
  let at = pos, dir = 1;
  for (let i = 0; i < roll; i++) {
    if (at === 100) dir = -1;
    at += dir;
    steps.push(at);
  }
  const landed = at;
  const jump = LADDERS[landed] ? 'ladder' : SNAKES[landed] ? 'snake' : null;
  const final = LADDERS[landed] || SNAKES[landed] || landed;
  return { steps, landed, jump, final, won: final === 100 };
}

/** A new game. players: [{ name, bot }] (2–4). Each gets a colour and starts at 0. */
export function newGame(players) {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`Snakes & Ladders needs ${MIN_PLAYERS}–${MAX_PLAYERS} players`);
  return {
    players: players.map((p, i) => ({ name: p.name || COLORS[i].name, bot: !!p.bot, color: COLORS[i].hex, pos: 0 })),
    turn: 0,
    winner: null,
  };
}

/**
 * Plays a roll for whoever's turn it is. Changes `game` and returns the move (see move()) plus
 * who moved, and `again` when they rolled a 6 and go again.
 */
export function play(game, roll) {
  if (game.winner !== null) throw new Error('The game is over');
  if (!(roll >= 1 && roll <= 6)) throw new Error('A dice roll is 1 to 6');
  const who = game.turn;
  const p = game.players[who];
  const m = move(p.pos, roll);
  p.pos = m.final;
  if (m.won) game.winner = who;
  const again = roll === 6 && !m.won;
  if (!m.won && !again) game.turn = (who + 1) % game.players.length;
  return { ...m, who, again };
}

/** A fair dice roll, 1–6. */
export function rollDice(random = Math.random) {
  return 1 + Math.floor(random() * 6);
}
