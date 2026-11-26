// Archery: reads a whole-body pose and decides when the bow is drawn and when an arrow flies.
// No page code here, so it's easy to test. Points are screen pixels: { x, y }.
//
// How you shoot: raise one hand (the bow hand) and a bow appears in it. It stays there while that
// hand is up, wherever you point it. Bring the other hand to your face (drawing the string), then
// move it away to let go. The arrow flies from the bow hand, away from where the drawing hand was.
// If the drawing hand was right behind the bow hand on screen, you're aiming at the camera: the
// arrow flies into the screen and lands where the bow hand is (the page shows a crosshair there).

// Body points from MediaPipe's pose model (33 points).
export const BODY = { nose: 0, ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16 };

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Distances are measured in shoulder widths, so they work near or far from the camera.
// Some have an "in" and an "out" level, so wobbly tracking doesn't flip back and forth.
export const RAISE = 0.6, LOWER = 1.1;      // bow hand: raised to no lower than this below its shoulder; dropped below LOWER puts it away
export const DRAW_IN = 0.8, DRAW_OUT = 1.3; // drawing hand: wrist this close to the nose
export const AT_FACE = 0.55;                // a hand this close to the nose is at the face (can't pick up the bow)
export const SWITCH = 0.5;                  // the other hand must be this much farther out to take the bow
export const AT_CAMERA = 0.7;               // drawing hand this close to the bow hand on screen: aiming at the camera
export const DRAW_TIME = 0.6;               // seconds to pull the bow all the way back
export const MIN_POWER = 0.3;               // pull at least this much, or the arrow isn't ready
export const LOST_TIME = 0.6;               // keep the bow this long when the camera briefly loses you

/** Picks the points archery needs from a pose (screen points), or null if the shoulders can't be seen. */
export function bodyFrom(pts) {
  if (!pts) return null;
  const b = {};
  for (const [k, i] of Object.entries(BODY)) b[k] = pts[i];
  if (!b.ls || !b.rs) return null;
  b.sw = dist(b.ls, b.rs);
  return b.sw > 1 ? b : null;
}

/** A new bow. anchor: where the drawing hand was while pulling, so letting go doesn't change the aim. */
export const newBow = () => ({ side: null, drawn: false, power: 0, bow: null, hand: null, anchor: null, lost: 0 });

/** Is this hand (l or r) up? `already`: it was up last time, so it must drop lower to count as down. */
const up = (b, s, already) => b[s + 'w'].y - b[s + 's'].y < b.sw * (already ? LOWER : RAISE);

/** Is the drawing hand behind the bow hand on screen (aiming at the camera)? */
export const atCamera = (st, body) => !!(st.anchor && st.bow && dist(st.anchor, st.bow) < body.sw * AT_CAMERA);

/**
 * One step of the bow. body: from bodyFrom(), or null when nobody can be seen.
 * Changes `st` and returns null, or { from, dir, power, atCamera } when an arrow is shot
 * (from: the bow hand; dir: a unit direction; power: 0.3–1).
 */
export function bowStep(st, body, dt) {
  if (!body) {
    st.lost += dt;
    if (st.lost > LOST_TIME) Object.assign(st, newBow());
    return null;
  }
  st.lost = 0;

  // Which hand holds the bow: keep it while it stays up. Otherwise pick a raised hand that isn't right at
  // the face (that one is drawing the string); if both are, the one farther from the face. Before the
  // string is pulled, switch hands if the other one is raised and clearly farther out.
  const face = s => dist(body[s + 'w'], body.nose);
  if (!st.side || !up(body, st.side, true)) {
    const ok = ['l', 'r'].filter(s => up(body, s, false) && face(s) > body.sw * AT_FACE);
    const side = ok.length === 2 ? (face('l') >= face('r') ? 'l' : 'r') : ok[0] || null;
    if (side !== st.side) Object.assign(st, newBow(), { side });
  } else if (!st.drawn) {
    const o = st.side === 'l' ? 'r' : 'l';
    // (Only for an arm stretched well out, so a hand on its way up to the chin doesn't steal the bow.)
    if (up(body, o, false) && face(o) > body.sw * 1.5 && face(o) > face(st.side) + body.sw * SWITCH) Object.assign(st, newBow(), { side: o });
  }
  if (!st.side) { st.bow = st.hand = null; return null; }

  const other = st.side === 'l' ? 'r' : 'l';
  st.bow = body[st.side + 'w'];
  st.hand = body[other + 'w'];
  const near = dist(st.hand, body.nose) / body.sw;

  if (!st.drawn) {
    if (near < DRAW_IN) { st.drawn = true; st.power = 0; st.anchor = { ...st.hand }; }
    return null;
  }
  if (near < DRAW_OUT) {
    st.power = Math.min(1, st.power + dt / DRAW_TIME);
    st.anchor = { ...st.hand };
    return null;
  }

  // The drawing hand let go of the string.
  const shot = { from: { ...st.bow }, dir: aim(st.anchor, st.bow, body.nose), power: st.power, atCamera: atCamera(st, body) };
  Object.assign(st, { drawn: false, power: 0, anchor: null });
  return shot.power < MIN_POWER ? null : shot;
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
