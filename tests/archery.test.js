import { describe, it, expect } from 'vitest';
import { bodyFrom, newBow, bowStep, aim, hitPoints, DRAW_TIME, LOST_TIME } from '../src/archery.js';

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
const AT_PHONE = { x: 255, y: 215 };  // left arm pointing at the camera: the hand looks close to the shoulder
const HIGH = { x: 230, y: 40 };       // left hand raised high
const LOW = { x: 240, y: 380 };       // left hand down by the side
const DOWN = { x: 360, y: 380 };      // right hand down by the side
const CHIN = { x: 310, y: 165 };      // right hand pulled back to the chin
const AWAY = { x: 420, y: 200 };      // right hand let go, moved away from the face

/** Draws the bow all the way, then lets go. */
function fullShot(st, bowHand, chin = CHIN) {
  bowStep(st, person({ left: bowHand, right: DOWN }), 0.03);
  for (let t = 0; t <= DRAW_TIME + 0.05; t += 0.05) bowStep(st, person({ left: bowHand, right: chin }), 0.05);
  return bowStep(st, person({ left: bowHand, right: AWAY }), 0.03);
}

describe('bodyFrom', () => {
  it('needs both shoulders', () => {
    expect(bodyFrom(null)).toBe(null);
    const pts = Array.from({ length: 33 }, () => ({ x: 5, y: 5 }));
    expect(bodyFrom(pts)).toBe(null); // shoulders on top of each other
    expect(person({ left: OUT, right: DOWN }).sw).toBe(100);
  });
});

describe('the bow', () => {
  it('appears in a raised hand, stretched out or pointing at the camera', () => {
    for (const hand of [OUT, AT_PHONE, HIGH]) {
      const st = newBow();
      bowStep(st, person({ left: hand, right: DOWN }), 0.03);
      expect(st.side).toBe('l');
      expect(st.bow).toEqual(hand);
    }
  });

  it("doesn't appear with both hands down", () => {
    const st = newBow();
    bowStep(st, person({ left: LOW, right: DOWN }), 0.03);
    expect(st.side).toBe(null);
  });

  it('moves to the other hand if that one is clearly stretched out farther before pulling', () => {
    const st = newBow();
    bowStep(st, person({ left: { x: 240, y: 230 }, right: DOWN }), 0.03); // left hand up, near the body
    expect(st.side).toBe('l');
    bowStep(st, person({ left: { x: 240, y: 230 }, right: { x: 520, y: 210 } }), 0.03); // right arm stretched out
    expect(st.side).toBe('r');
  });

  it('stays while the bow hand moves around, and goes when it drops', () => {
    const st = newBow();
    for (const hand of [HIGH, OUT, AT_PHONE, { x: 150, y: 300 }]) {
      bowStep(st, person({ left: hand, right: DOWN }), 0.03);
      expect(st.side).toBe('l');
    }
    bowStep(st, person({ left: LOW, right: DOWN }), 0.03);
    expect(st.side).toBe(null);
  });

  it('shoots sideways when the drawing hand leaves the face after a good pull', () => {
    const st = newBow();
    const shot = fullShot(st, OUT);
    expect(shot.power).toBe(1);
    expect(shot.from).toEqual(OUT);
    expect(shot.atCamera).toBe(false);
    expect(shot.dir.x).toBeLessThan(-0.9); // flies out past the bow hand, to the left
    expect(st.drawn).toBe(false);
  });

  it('aims from where the hand was while pulling, not where it went when letting go', () => {
    const shot = fullShot(newBow(), HIGH);
    expect(shot.dir).toEqual(aim(CHIN, HIGH, CHIN));
  });

  it('shoots at the camera when the drawing hand was right behind the bow hand', () => {
    const st = newBow();
    bowStep(st, person({ left: OUT, right: DOWN }), 0.03); // raise the bow arm, then point it at the phone
    const shot = fullShot(st, { x: 290, y: 170 }, { x: 300, y: 175 });
    expect(shot.atCamera).toBe(true);
    expect(shot.from).toEqual({ x: 290, y: 170 });
  });

  it("doesn't shoot after only a tiny pull", () => {
    const st = newBow();
    bowStep(st, person({ left: OUT, right: CHIN }), 0.03);
    bowStep(st, person({ left: OUT, right: CHIN }), 0.05);
    expect(bowStep(st, person({ left: OUT, right: AWAY }), 0.03)).toBe(null);
  });

  it('keeps the bow when the camera loses you for a moment', () => {
    const st = newBow();
    bowStep(st, person({ left: OUT, right: CHIN }), 0.03);
    bowStep(st, null, LOST_TIME / 2);
    expect(st.side).toBe('l');
    bowStep(st, null, LOST_TIME);
    expect(st).toMatchObject({ side: null, drawn: false, power: 0 });
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
