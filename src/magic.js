// Magic Hands: small helpers that read hand shapes and run the fireball and bubble rules.
// No page code here, so it's easy to test. Points are screen pixels: { x, y }.
// A hand has 21 points (MediaPipe's hand model): 0 wrist, 4 thumb tip, 8 index tip,
// 12 middle tip, 16 ring tip, 20 pinky tip; 5, 9, 13, 17 are the knuckles.

export const TIPS = [4, 8, 12, 16, 20];
const FINGERS = [[8, 6], [12, 10], [16, 14], [20, 18]]; // [tip, middle joint] for index → pinky
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Which of the four fingers (index → pinky) are straight: the tip is clearly farther from the wrist than the middle joint. */
export function fingersUp(pts) {
  const w = pts[0];
  return FINGERS.map(([tip, joint]) => dist(pts[tip], w) > dist(pts[joint], w) * 1.15);
}

/** 'open' (all four fingers up), 'fist' (none), 'point' (just the index finger) or 'other'. */
export function handShape(pts) {
  const up = fingersUp(pts);
  const n = up.filter(Boolean).length;
  if (n === 4) return 'open';
  if (n === 0) return 'fist';
  if (up[0] && n === 1) return 'point';
  return 'other';
}

/** Middle of the palm: the average of the wrist and the four knuckles. */
export function palmCenter(pts) {
  const ids = [0, 5, 9, 13, 17];
  return { x: ids.reduce((s, i) => s + pts[i].x, 0) / ids.length, y: ids.reduce((s, i) => s + pts[i].y, 0) / ids.length };
}

/** How big the hand looks: wrist to middle knuckle. Grows as the hand comes closer to the camera. */
export const handSize = pts => dist(pts[0], pts[9]);

/**
 * Turns camera points (0–1 across the video) into screen pixels, for a video shown with
 * `object-fit: cover` in a W × H box. mirror: the selfie camera is shown flipped, like a mirror.
 */
export function coverMap(vw, vh, W, H, mirror) {
  const s = Math.max(W / vw, H / vh);
  const ox = (W - vw * s) / 2, oy = (H - vh * s) / 2;
  return p => {
    const x = ox + p.x * vw * s;
    return { x: mirror ? W - x : x, y: oy + p.y * vh * s };
  };
}

/** Moves a point part of the way toward a new one, to calm shaky tracking. a = 1 jumps straight there. */
export const ease = (from, to, a) => (from ? { x: from.x + (to.x - from.x) * a, y: from.y + (to.y - from.y) * a } : { ...to });

// ---------- Fireball ----------
export const CHARGE_TIME = 0.7; // seconds of open hand to grow a full fireball
export const READY = 0.35;      // the fireball must be at least this big to throw
const PUSH_RATE = 1.6;          // the hand gets this much bigger per second when pushed at the camera

/** A new fireball for one hand. */
export const newFire = () => ({ charge: 0, x: 0, y: 0, vx: 0, vy: 0 });

/**
 * One step of a hand's fireball. hand: { palm, shape, size, vel, sizeRate } or null when the hand
 * can't be seen. throwSpeed: how fast (pixels per second) a hand must move to throw.
 * Changes `st` and returns what happened: null, 'throw' (st.vx/vy is the throw), 'push' (thrown
 * at the camera), or 'fizzle' (squeezed out).
 */
export function fireStep(st, hand, dt, throwSpeed) {
  if (!hand) {
    // Hand gone. A fast flick often loses the hand, so treat that as a throw.
    const fast = Math.hypot(st.vx, st.vy) > throwSpeed * 0.6;
    if (st.charge >= READY && fast) { st.charge = 0; return 'throw'; }
    st.charge = Math.max(0, st.charge - dt * 2);
    return null;
  }
  st.x = hand.palm.x; st.y = hand.palm.y; st.vx = hand.vel.x; st.vy = hand.vel.y;
  if (hand.shape === 'open') {
    if (st.charge >= READY && hand.sizeRate > PUSH_RATE) { st.charge = 0; return 'push'; }
    if (st.charge >= READY && Math.hypot(st.vx, st.vy) > throwSpeed) { st.charge = 0; return 'throw'; }
    st.charge = Math.min(1, st.charge + dt / CHARGE_TIME);
    return null;
  }
  if (hand.shape === 'fist' && st.charge > 0.2) { st.charge = 0; return 'fizzle'; }
  st.charge = Math.max(0, st.charge - dt / 2);
  return null;
}

// ---------- Bubble pop ----------
/** Indexes of the bubbles ({ x, y, r }) touched by any of the points. */
export function popped(bubbles, points) {
  const out = [];
  bubbles.forEach((b, i) => { if (points.some(p => dist(p, b) < b.r)) out.push(i); });
  return out;
}
