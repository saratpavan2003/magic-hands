import { describe, it, expect } from 'vitest';
import { bodyFrom, newBow, bowStep, aim, hitPoints, DRAW_TIME } from '../src/archery.js';

// A made-up person facing the camera, in screen pixels: shoulders 100 px apart, nose above them.
// left/right: where each wrist is. Elbows sit halfway between shoulder and wrist.
function person({ left, right }) {
  const pts = Array.from({ length: 33 }, () => ({ x: 0, y: 0 }));
  pts[0] = { x: 300, y: 150 };  // nose
  pts[11] = { x: 250, y: 220 }; // left shoulder
  pts[12] = { x: 350, y: 220 }; // right shoulder
  pts[15] = left; pts[16] = right;
  pts[13] = { x: (pts[11].x + left.x) / 2, y: (pts[11].y + left.y) / 2 };
  pts[14] = { x: (pts[12].x + right.x) / 2, y: (pts[12].y + right.y) / 2 };
  return bodyFrom(pts);
}
const OUT = { x: 100, y: 220 };       // left arm stretched out to the side
const DOWN = { x: 360, y: 330 };      // right hand down by the side
const CHIN = { x: 310, y: 165 };      // right hand pulled back to the chin
const AWAY = { x: 420, y: 200 };      // right hand let go, moved away from the face

describe('bodyFrom', () => {
  it('needs both shoulders', () => {
    expect(bodyFrom(null)).toBe(null);
    const pts = Array.from({ length: 33 }, () => ({ x: 5, y: 5 }));
    expect(bodyFrom(pts)).toBe(null); // shoulders on top of each other
    expect(person({ left: OUT, right: DOWN }).sw).toBe(100);
  });
});

describe('the bow', () => {
  it('appears in the hand that is stretched out', () => {
    const st = newBow();
    bowStep(st, person({ left: OUT, right: DOWN }), 0.03);
    expect(st.side).toBe('l');
    expect(st.drawn).toBe(false);
    expect(st.bow).toEqual(OUT);
  });

  it('shoots when the drawing hand leaves the face after a good pull', () => {
    const st = newBow();
    bowStep(st, person({ left: OUT, right: DOWN }), 0.03);
    bowStep(st, person({ left: OUT, right: CHIN }), 0.03);
    expect(st.drawn).toBe(true);
    for (let t = 0; t < DRAW_TIME; t += 0.05) bowStep(st, person({ left: OUT, right: CHIN }), 0.05);
    expect(st.power).toBe(1);
    const shot = bowStep(st, person({ left: OUT, right: AWAY }), 0.03);
    expect(shot.power).toBe(1);
    expect(shot.from).toEqual(OUT);
    expect(shot.dir.x).toBeLessThan(-0.9); // flies out past the bow hand, to the left
    expect(st.drawn).toBe(false);
  });

  it("doesn't shoot after only a tiny pull", () => {
    const st = newBow();
    bowStep(st, person({ left: OUT, right: CHIN }), 0.03);
    bowStep(st, person({ left: OUT, right: CHIN }), 0.05);
    expect(bowStep(st, person({ left: OUT, right: AWAY }), 0.03)).toBe(null);
  });

  it('is put away when the bow arm comes down or nobody is seen', () => {
    const st = newBow();
    bowStep(st, person({ left: OUT, right: CHIN }), 0.03);
    bowStep(st, person({ left: OUT, right: CHIN }), 0.5);
    expect(bowStep(st, person({ left: { x: 240, y: 380 }, right: CHIN }), 0.03)).toBe(null); // arm hanging down
    expect(st.side).toBe(null);
    bowStep(st, person({ left: OUT, right: CHIN }), 0.03);
    bowStep(st, null, 0.03);
    expect(st).toMatchObject({ side: null, drawn: false, power: 0 });
  });

  it("doesn't count an arm hanging down by the side", () => {
    const st = newBow();
    bowStep(st, person({ left: { x: 240, y: 380 }, right: { x: 360, y: 380 } }), 0.03);
    expect(st.side).toBe(null);
  });

  it('keeps the same bow arm while it stays out', () => {
    const st = newBow();
    bowStep(st, person({ left: OUT, right: DOWN }), 0.03);
    bowStep(st, person({ left: OUT, right: { x: 520, y: 220 } }), 0.03); // right arm now out even farther
    expect(st.side).toBe('l');
  });
});

describe('aim', () => {
  it('points from the drawing hand to the bow hand', () => {
    expect(aim({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 })).toEqual({ x: 1, y: 0 });
  });
  it('uses the face when the hand is right on the bow', () => {
    expect(aim({ x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 0, y: -1 });
  });
});

describe('hitPoints', () => {
  const target = { x: 0, y: 0, r: 30, kind: 'target' };
  it('scores the rings of a target', () => {
    expect(hitPoints({ x: 5, y: 0 }, target)).toBe(10);
    expect(hitPoints({ x: 15, y: 0 }, target)).toBe(5);
    expect(hitPoints({ x: 25, y: 0 }, target)).toBe(2);
    expect(hitPoints({ x: 31, y: 0 }, target)).toBe(0);
  });
  it('gives 3 for a balloon', () => {
    expect(hitPoints({ x: 20, y: 0 }, { ...target, kind: 'balloon' })).toBe(3);
  });
});
