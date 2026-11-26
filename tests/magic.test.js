import { describe, it, expect } from 'vitest';
import { fingersUp, handShape, palmCenter, handSize, coverMap, ease, newFire, fireStep, READY, popped } from '../src/magic.js';

// A made-up upright hand in screen pixels: wrist at the bottom, fingers pointing up.
// up: which fingers (index, middle, ring, pinky) are straight; bent ones curl back toward the palm.
function hand(up = [true, true, true, true], at = { x: 200, y: 400 }) {
  const pts = Array.from({ length: 21 }, () => ({ x: at.x, y: at.y }));
  pts[0] = { x: at.x, y: at.y };
  pts[1] = { x: at.x - 30, y: at.y - 20 }; pts[2] = { x: at.x - 50, y: at.y - 45 }; pts[3] = { x: at.x - 65, y: at.y - 65 }; pts[4] = { x: at.x - 75, y: at.y - 85 };
  [-30, -10, 10, 30].forEach((dx, f) => {
    const base = 5 + f * 4; // knuckle, joint 1, joint 2, tip
    pts[base] = { x: at.x + dx, y: at.y - 90 };
    pts[base + 1] = { x: at.x + dx, y: at.y - 130 };
    pts[base + 2] = up[f] ? { x: at.x + dx, y: at.y - 160 } : { x: at.x + dx, y: at.y - 105 };
    pts[base + 3] = up[f] ? { x: at.x + dx, y: at.y - 185 } : { x: at.x + dx, y: at.y - 85 };
  });
  return pts;
}

describe('hand shapes', () => {
  it('reads straight and bent fingers', () => {
    expect(fingersUp(hand())).toEqual([true, true, true, true]);
    expect(fingersUp(hand([true, false, false, true]))).toEqual([true, false, false, true]);
  });
  it('names open hands, fists and pointing', () => {
    expect(handShape(hand())).toBe('open');
    expect(handShape(hand([false, false, false, false]))).toBe('fist');
    expect(handShape(hand([true, false, false, false]))).toBe('point');
    expect(handShape(hand([true, true, false, false]))).toBe('other');
  });
  it('finds the palm and the hand size', () => {
    const pts = hand();
    expect(palmCenter(pts)).toEqual({ x: 200, y: 400 - 90 * 4 / 5 });
    expect(handSize(pts)).toBe(Math.hypot(10, 90));
  });
});

describe('coverMap', () => {
  it('fills a tall phone screen with a wide video, cropping the sides', () => {
    const map = coverMap(1280, 720, 390, 844, false);
    expect(map({ x: 0.5, y: 0.5 })).toEqual({ x: 195, y: 422 });
    expect(map({ x: 0, y: 0 }).y).toBe(0);
    expect(map({ x: 0, y: 0 }).x).toBeLessThan(0); // the left edge is off screen
  });
  it('flips left and right for the selfie camera', () => {
    const map = coverMap(1280, 720, 1280, 720, true);
    expect(map({ x: 0.25, y: 0.5 })).toEqual({ x: 960, y: 360 });
  });
});

describe('ease', () => {
  it('starts at the new point and then moves part of the way', () => {
    expect(ease(null, { x: 10, y: 10 }, 0.5)).toEqual({ x: 10, y: 10 });
    expect(ease({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5)).toEqual({ x: 5, y: 10 });
  });
});

describe('fireball', () => {
  const still = { x: 0, y: 0 };
  const h = (shape, vel = still, sizeRate = 0) => ({ palm: { x: 100, y: 100 }, shape, size: 80, vel, sizeRate });
  const charged = () => { const st = newFire(); st.charge = 1; return st; };

  it('grows while the hand is open and stays put', () => {
    const st = newFire();
    expect(fireStep(st, h('open'), 0.35, 500)).toBe(null);
    expect(st.charge).toBeCloseTo(0.5);
    expect(st).toMatchObject({ x: 100, y: 100 });
    fireStep(st, h('open'), 2, 500);
    expect(st.charge).toBe(1);
  });
  it('is thrown by a fast swing, but only once it is big enough', () => {
    const tiny = newFire();
    expect(fireStep(tiny, h('open', { x: 900, y: 0 }), 0.016, 500)).toBe(null);
    const st = charged();
    expect(fireStep(st, h('open', { x: 900, y: 0 }), 0.016, 500)).toBe('throw');
    expect(st).toMatchObject({ charge: 0, vx: 900, vy: 0 });
  });
  it('is pushed at the camera when the hand quickly gets bigger', () => {
    expect(fireStep(charged(), h('open', still, 3), 0.016, 500)).toBe('push');
  });
  it('fizzles out in a fist', () => {
    const st = charged();
    expect(fireStep(st, h('fist'), 0.016, 500)).toBe('fizzle');
    expect(st.charge).toBe(0);
    expect(fireStep(newFire(), h('fist'), 0.016, 500)).toBe(null);
  });
  it('flies off when a fast-moving hand disappears, and fades when a still one does', () => {
    const fast = charged(); fast.vx = 600;
    expect(fireStep(fast, null, 0.016, 500)).toBe('throw');
    const slow = charged();
    expect(fireStep(slow, null, 0.1, 500)).toBe(null);
    expect(slow.charge).toBeCloseTo(0.8);
    expect(slow.charge).toBeGreaterThan(READY);
  });
});

describe('bubbles', () => {
  it('pops the bubbles a fingertip touches', () => {
    const bubbles = [{ x: 0, y: 0, r: 10 }, { x: 100, y: 100, r: 20 }, { x: 300, y: 0, r: 10 }];
    expect(popped(bubbles, [{ x: 5, y: 5 }, { x: 110, y: 90 }])).toEqual([0, 1]);
    expect(popped(bubbles, [])).toEqual([]);
  });
});
