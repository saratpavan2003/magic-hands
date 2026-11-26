// Archery: reads a whole-body pose and decides when the bow is drawn and when an arrow flies.
// No page code here, so it's easy to test. Points are screen pixels: { x, y }.
//
// How you shoot: stretch one arm out (the bow arm), bring the other hand to your face (drawing
// the string), then move that hand away while the bow arm stays out: the arrow flies from the bow
// hand, in the direction from the drawing hand to the bow hand.

// Body points from MediaPipe's pose model (33 points).
export const BODY = { nose: 0, ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16 };

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Distances are measured in shoulder widths, so they work near or far from the camera.
// Each has an "in" and an "out" level, so wobbly tracking doesn't flip back and forth.
export const ARM_OUT = 1.3, ARM_IN = 1.0;   // bow arm: wrist this far from its shoulder
export const ARM_LOW = 0.8;                 // ...and no lower than this below its shoulder
export const DRAW_IN = 0.8, DRAW_OUT = 1.3; // drawing hand: wrist this close to the nose
export const DRAW_TIME = 0.6;               // seconds to pull the bow all the way back
export const MIN_POWER = 0.3;               // pull at least this much, or the arrow isn't ready

/** Picks the points archery needs from a pose (screen points), or null if the shoulders can't be seen. */
export function bodyFrom(pts) {
  if (!pts) return null;
  const b = {};
  for (const [k, i] of Object.entries(BODY)) b[k] = pts[i];
  if (!b.ls || !b.rs) return null;
  b.sw = dist(b.ls, b.rs);
  return b.sw > 1 ? b : null;
}

/** A new bow. */
export const newBow = () => ({ side: null, drawn: false, power: 0, bow: null, hand: null });

/**
 * Is this arm (l or r) stretched out and held up (not hanging down by the side)?
 * `already`: it was out last time, so it must bend or drop a bit more to count as in.
 */
function armOut(b, s, already) {
  const w = b[s + 'w'], sh = b[s + 's'];
  return dist(w, sh) > b.sw * (already ? ARM_IN : ARM_OUT) && w.y - sh.y < b.sw * (already ? ARM_LOW + 0.2 : ARM_LOW);
}

/**
 * One step of the bow. body: from bodyFrom(), or null when nobody can be seen.
 * Changes `st` and returns null, or { from, dir, power } when an arrow is shot
 * (from: the bow hand; dir: a unit direction; power: 0.3–1).
 */
export function bowStep(st, body, dt) {
  if (!body) { st.drawn = false; st.power = 0; st.side = null; return null; }

  // Which arm holds the bow: keep the same one while it stays out, or pick the arm stretched out farther.
  if (!st.side || !armOut(body, st.side, true)) {
    const l = armOut(body, 'l', false) ? dist(body.lw, body.ls) : 0;
    const r = armOut(body, 'r', false) ? dist(body.rw, body.rs) : 0;
    const side = l || r ? (l >= r ? 'l' : 'r') : null;
    if (side !== st.side) { st.side = side; st.drawn = false; st.power = 0; }
  }
  if (!st.side) { st.bow = st.hand = null; return null; }

  const other = st.side === 'l' ? 'r' : 'l';
  st.bow = body[st.side + 'w'];
  st.hand = body[other + 'w'];
  const near = dist(st.hand, body.nose) / body.sw;

  if (!st.drawn) {
    if (near < DRAW_IN) { st.drawn = true; st.power = 0; }
    return null;
  }
  if (near < DRAW_OUT) { st.power = Math.min(1, st.power + dt / DRAW_TIME); return null; }

  // The drawing hand let go of the string.
  st.drawn = false;
  const power = st.power;
  st.power = 0;
  if (power < MIN_POWER) return null;
  return { from: { ...st.bow }, dir: aim(st.hand, st.bow, body.nose), power };
}

/** Direction the arrow flies: from the drawing hand (or the face, if the hand is right on the bow) to the bow hand. */
export function aim(hand, bow, face) {
  let dx = bow.x - hand.x, dy = bow.y - hand.y;
  if (Math.hypot(dx, dy) < 1) { dx = bow.x - face.x; dy = bow.y - face.y; }
  const d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
}

/**
 * Points for an arrow tip hitting a target { x, y, r, kind }: a balloon is worth 3, a target
 * 10 for the bullseye, 5 for the middle ring and 2 for the outside. 0 means a miss.
 */
export function hitPoints(tip, t) {
  const d = dist(tip, t) / t.r;
  if (d > 1) return 0;
  if (t.kind === 'balloon') return 3;
  return d < 0.33 ? 10 : d < 0.66 ? 5 : 2;
}
