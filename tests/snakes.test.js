import { describe, it, expect } from 'vitest';
import { LADDERS, SNAKES, cell, move, newGame, play, rollDice, MAX_PLAYERS } from '../src/snakes/game.js';

describe('the board', () => {
  it('snakes back and forth from the bottom-left', () => {
    expect(cell(1)).toEqual({ row: 0, col: 0 });
    expect(cell(10)).toEqual({ row: 0, col: 9 });
    expect(cell(11)).toEqual({ row: 1, col: 9 });
    expect(cell(20)).toEqual({ row: 1, col: 0 });
    expect(cell(100)).toEqual({ row: 9, col: 0 });
    expect(cell(0)).toEqual({ row: 0, col: -1 });
  });

  it('has ladders going up and snakes going down, never on the same square', () => {
    for (const [a, b] of Object.entries(LADDERS)) expect(b).toBeGreaterThan(+a);
    for (const [a, b] of Object.entries(SNAKES)) expect(b).toBeLessThan(+a);
    const starts = [...Object.keys(LADDERS), ...Object.keys(SNAKES)];
    expect(new Set(starts).size).toBe(starts.length);
    for (const end of [...Object.values(LADDERS), ...Object.values(SNAKES)]) expect(starts).not.toContain(String(end));
    expect(starts).not.toContain('100');
  });
});

describe('moving', () => {
  it('steps one square per dice point', () => {
    expect(move(0, 3)).toEqual({ steps: [1, 2, 3], landed: 3, jump: null, final: 3, won: false, tooFar: false });
  });
  it('climbs ladders and slides down snakes', () => {
    expect(move(1, 3)).toMatchObject({ landed: 4, jump: 'ladder', final: 25 });
    expect(move(25, 2)).toMatchObject({ landed: 27, jump: 'snake', final: 5 });
  });
  it('wins by landing exactly on 100', () => {
    expect(move(96, 4)).toMatchObject({ final: 100, won: true });
  });
  it("doesn't move when the roll would go past 100", () => {
    expect(move(98, 3)).toEqual({ steps: [], landed: 98, jump: null, final: 98, won: false, tooFar: true });
    expect(move(95, 6)).toMatchObject({ final: 95, tooFar: true });
  });
  it('has no snake right before the finish', () => {
    for (const n of [98, 99]) expect(move(n - 1, 1).jump).toBe(null);
  });
  it('a roll that stays put still passes the turn on', () => {
    const g = newGame([{}, {}]);
    g.players[0].pos = 98;
    expect(play(g, 4)).toMatchObject({ tooFar: true, who: 0 });
    expect(g.players[0].pos).toBe(98);
    expect(g.turn).toBe(1);
  });
});

describe('a game', () => {
  it('takes 2 to 4 players', () => {
    expect(() => newGame([{ name: 'A' }])).toThrow();
    expect(() => newGame(Array(MAX_PLAYERS + 1).fill({}))).toThrow();
    const g = newGame([{ name: 'Mom' }, { bot: true }]);
    expect(g.players).toEqual([
      { name: 'Mom', bot: false, color: '#ff4d4d', pos: 0 },
      { name: 'Blue', bot: true, color: '#3d8bff', pos: 0 },
    ]);
  });

  it('takes turns, and a 6 rolls again', () => {
    const g = newGame([{}, {}, {}]);
    expect(play(g, 2)).toMatchObject({ who: 0, again: false });
    expect(g.turn).toBe(1);
    expect(play(g, 6)).toMatchObject({ who: 1, again: true });
    expect(g.turn).toBe(1);
    play(g, 1);
    play(g, 5);
    expect(g.turn).toBe(0); // back around to the first player
  });

  it('ends when someone reaches 100', () => {
    const g = newGame([{}, {}]);
    g.players[1].pos = 94;
    g.turn = 1;
    expect(play(g, 6)).toMatchObject({ won: true, again: false });
    expect(g.winner).toBe(1);
    expect(() => play(g, 3)).toThrow();
  });

  it('rolls 1 to 6', () => {
    expect(rollDice(() => 0)).toBe(1);
    expect(rollDice(() => 0.9999)).toBe(6);
  });
});
