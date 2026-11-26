// Snakes & Ladders rules: the board, moving, snakes, ladders, turns and winning.
// No page code here, so it's easy to test.
//
// Squares are numbered 1–100, starting bottom-left and snaking back and forth row by row.
// Players start at 0 (beside square 1). Land exactly on 100 to win: a roll that would go past it
// doesn't move the piece. Rolling a 6 gives another turn. When someone reaches 100 they get a place
// (1st, 2nd…) and the others keep playing, until only one player is left.

export const LADDERS = { 4: 25, 13: 46, 33: 49, 42: 63, 50: 69, 62: 81, 74: 92 };
export const SNAKES = { 27: 5, 40: 3, 43: 18, 54: 31, 66: 45, 76: 58, 89: 53, 97: 56 };
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
 * Where a roll takes a player from `pos`. Returns { steps, landed, jump, final, won, tooFar }:
 * steps: each square passed through, one per dice point; landed: the square the dice took them to;
 * jump: 'ladder', 'snake' or null; final: where they end up. tooFar: the roll would go past 100,
 * so the piece stays where it is (steps is empty).
 */
export function move(pos, roll) {
  if (pos + roll > 100) return { steps: [], landed: pos, jump: null, final: pos, won: false, tooFar: true };
  const steps = [];
  for (let at = pos + 1; at <= pos + roll; at++) steps.push(at);
  const landed = pos + roll;
  const jump = LADDERS[landed] ? 'ladder' : SNAKES[landed] ? 'snake' : null;
  const final = LADDERS[landed] || SNAKES[landed] || landed;
  return { steps, landed, jump, final, won: final === 100, tooFar: false };
}

/**
 * A new game. players: [{ name, bot }] (2–4). Each gets a colour, starts at 0, and gets a `place`
 * (1 for first) when they finish. `places` lists players in finishing order; `over` when all are placed.
 */
export function newGame(players) {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`Snakes & Ladders needs ${MIN_PLAYERS}–${MAX_PLAYERS} players`);
  return {
    players: players.map((p, i) => ({ name: p.name || COLORS[i].name, bot: !!p.bot, color: COLORS[i].hex, pos: 0, place: null })),
    turn: 0,
    places: [],
    over: false,
  };
}

/** The next player after `who` who hasn't finished yet. */
function nextPlayer(game, who) {
  const n = game.players.length;
  for (let k = 1; k <= n; k++) if (game.players[(who + k) % n].place === null) return (who + k) % n;
  return who;
}

/**
 * Plays a roll for whoever's turn it is. Changes `game` and returns the move (see move()) plus
 * who moved, `again` when they rolled a 6 and go again, `place` when they just finished (1 = first),
 * and `over` when the game has ended (only one player was left, so they take the last place).
 */
export function play(game, roll) {
  if (game.over) throw new Error('The game is over');
  if (!(roll >= 1 && roll <= 6)) throw new Error('A dice roll is 1 to 6');
  const who = game.turn;
  const p = game.players[who];
  const m = move(p.pos, roll);
  p.pos = m.final;
  let place = null;
  if (m.won) {
    game.places.push(who);
    place = p.place = game.places.length;
    const left = game.players.map((_, i) => i).filter(i => game.players[i].place === null);
    if (left.length <= 1) {
      for (const i of left) { game.places.push(i); game.players[i].place = game.places.length; }
      game.over = true;
    }
  }
  const again = roll === 6 && !m.won;
  if (!game.over && !again) game.turn = nextPlayer(game, who);
  return { ...m, who, again, place, over: game.over };
}

/** A fair dice roll, 1–6. */
export function rollDice(random = Math.random) {
  return 1 + Math.floor(random() * 6);
}
