// Magic Hands: camera, hand and body tracking, and the magic effects.
// The camera picture is looked at on this device only. Nothing is recorded, saved or sent:
// the tracking engine and models are served from this site and run in the browser.
import { MAGIC } from './words.js';
import { TIPS, handShape, palmCenter, handSize, videoRect, videoMap, ease, newFire, fireStep, popped } from './magic.js';
import { bodyFrom, newBow, bowStep, aim, atCamera, hitPoints, MIN_POWER } from './archery.js';

const $ = s => document.querySelector(s);
const ENGINE = { wasmLoaderPath: './vendor/wasm/vision_wasm_internal.js', wasmBinaryPath: './vendor/wasm/vision_wasm_internal.wasm' };
const MODELS = { hand: './model/hand_landmarker.task', pose: './model/pose_landmarker_lite.task' };
/** Archery follows the whole body; the other magic follows hands. */
const trackerFor = m => (m === 'archery' ? 'pose' : 'hand');
const MAX_PARTICLES = 700;

let stage, video, canvas, ctx, hintEl, scoreEl, flipBtn;
let W = 0, H = 0;
let mode = 'wand', facing = 'user', stream = null;
const trackers = { hand: null, pose: null }, trackerLoading = {};
let running = false, useCamera = false, raf = 0, last = 0, lastVideoTime = -1, lastSeen = 0;
let sound = true, score = 0, flash = 0, flashColor = '255,190,90';
let hintText = '', hintUntil = 0, loadingMsg = '';
let pointer = null; // finger or mouse on the screen: { x, y, down }
let fit = 'fill';   // camera picture: 'fill' the screen, or 'fit' all of it on screen (remembered on this device)
const taps = [];   // where the screen was tapped since the last frame

/** Hands we're following, by id: { present, palm, tip, tips, size, shape, vel, sizeRate, t, lost, trail, fire } */
const hands = new Map();
const particles = [], shots = [], bubbles = [];

// Archery: the bow, arrows in the air, things to hit, the body we can see, and the finger slingshot.
let bow = newBow(), body = null, sling = null;
const arrows = [], targets = [];

// ---------- Sounds (made on the spot, no sound files) ----------
let ac = null, noiseBuf = null;
function audio() {
  const A = window.AudioContext || window.webkitAudioContext;
  if (!ac && A) ac = new A();
  if (ac && ac.state === 'suspended') ac.resume();
}
function tone(f1, f2, dur, type = 'sine', vol = 0.15) {
  if (!sound || !ac) return;
  const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f1, t);
  o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t); o.stop(t + dur);
}
function hiss(dur, f1, f2, vol = 0.3, q = 1) {
  if (!sound || !ac) return;
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ac.currentTime, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = noiseBuf;
  f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(f1, t);
  f.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(ac.destination);
  src.start(t); src.stop(t + dur);
}
const SFX = {
  ting: () => { tone(1200, 2400, 0.25); tone(1800, 3200, 0.35, 'triangle', 0.05); },
  whoosh: () => hiss(0.35, 300, 2500, 0.35, 1.5),
  boom: () => { hiss(0.8, 1500, 60, 0.6, 0.7); tone(140, 35, 0.6, 'sine', 0.45); },
  pop: () => tone(650 + Math.random() * 300, 160, 0.12, 'sine', 0.25),
  fizzle: () => hiss(0.5, 4000, 7000, 0.15, 0.8),
  twang: () => { tone(260, 120, 0.3, 'triangle', 0.3); hiss(0.25, 800, 3000, 0.2, 2); },
  thunk: () => { tone(200, 70, 0.15, 'square', 0.12); hiss(0.1, 1500, 400, 0.3, 1); },
};

// ---------- Opening and closing ----------
async function open(withCamera) {
  audio();
  running = true; useCamera = false;
  stage.hidden = false;
  document.body.classList.add('mg-open');
  resize();
  setMode(mode);
  last = performance.now();
  raf = requestAnimationFrame(loop);
  $('#mg-close').focus();
  flipBtn.hidden = true; $('#mg-fit').hidden = true;
  if (!withCamera) { say(MAGIC.touch, 5000); return; }

  loadingMsg = MAGIC.loading;
  try { await startCamera(); }
  catch (e) { loadingMsg = ''; say(MAGIC.noCamera, 7000); return; }
  loadingMsg = '';
  useCamera = true;
  flipBtn.hidden = false; $('#mg-fit').hidden = false;
  await ensureTracker();
}

/** Loads the tracker the current magic needs (hands or body), showing "Waking up the magic…" meanwhile. */
async function ensureTracker() {
  const kind = trackerFor(mode);
  if (!useCamera || trackers[kind]) return;
  loadingMsg = ''; // the loop says "Waking up the magic…" until this tracker is ready
  try { await loadTracker(kind); }
  catch (e) { useCamera = false; flipBtn.hidden = true; stopCamera(); say(MAGIC.oldPhone, 7000); return; }
  if (!running) return;
  stage.dataset.tracking = trackers[kind].__delegate;
  lastSeen = performance.now();
  if (trackerFor(mode) === kind) say(modeHint());
}

function close() {
  running = false;
  cancelAnimationFrame(raf);
  stopCamera();
  stage.hidden = true;
  document.body.classList.remove('mg-open');
  hands.clear(); particles.length = 0; shots.length = 0; bubbles.length = 0; taps.length = 0;
  arrows.length = 0; targets.length = 0; bow = newBow(); body = null; sling = null;
  pointer = null; loadingMsg = ''; useCamera = false;
  $('#mg-start').focus();
}

async function startCamera() {
  stopCamera();
  const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  if (!running) { s.getTracks().forEach(t => t.stop()); return; }
  stream = s;
  video.srcObject = s;
  stage.classList.toggle('mg-mirror', facing === 'user');
  lastVideoTime = -1;
  await video.play().catch(() => {});
}

function stopCamera() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
  video.srcObject = null;
}

/** Starts a tracker once: 'hand' (21 points per hand, up to 2 hands) or 'pose' (33 body points, 1 person). */
function loadTracker(kind) {
  trackerLoading[kind] ||= (async () => {
    const vision = await import('../vendor/vision_bundle.mjs');
    const Task = kind === 'pose' ? vision.PoseLandmarker : vision.HandLandmarker;
    const opts = delegate => ({
      baseOptions: { modelAssetPath: MODELS[kind], delegate },
      runningMode: 'VIDEO',
      ...(kind === 'pose'
        ? { numPoses: 1, minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5 }
        : { numHands: 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 }),
    });
    let t;
    try { t = await Task.createFromOptions(ENGINE, opts('GPU')); t.__delegate = 'gpu'; }
    catch (e) { t = await Task.createFromOptions(ENGINE, opts('CPU')); t.__delegate = 'cpu'; }
    trackers[kind] = t;
    return t;
  })().catch(e => { trackerLoading[kind] = null; throw e; });
  return trackerLoading[kind];
}

function resize() {
  const r = stage.getBoundingClientRect();
  W = r.width; H = r.height;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ---------- Modes and messages ----------
const modeInfo = () => MAGIC.modes.find(m => m.id === mode);
const modeHint = () => `${modeInfo().emoji} ${(!useCamera && modeInfo().touch) || modeInfo().how}`;
function say(text, ms = 4500) { hintText = text; hintUntil = performance.now() + ms; }

const SCORE_ICON = { bubbles: '🫧', archery: '🎯' };
function setScore(n) { score = n; scoreEl.textContent = `${SCORE_ICON[mode] || ''} ${score}`; }

function setMode(m) {
  mode = m;
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  bubbles.length = 0; shots.length = 0; arrows.length = 0; targets.length = 0;
  bow = newBow(); body = null; sling = null; hands.clear();
  setScore(0);
  scoreEl.hidden = !SCORE_ICON[m];
  lastSeen = performance.now();
  say(modeHint());
  if (running) ensureTracker();
}

// ---------- Reading hands ----------
function ingest(id, d, now) {
  let h = hands.get(id);
  if (!h) { h = { present: false, trail: [], fire: newFire(), vel: { x: 0, y: 0 }, sizeRate: 0, shape: 'other', raw: '' }; hands.set(id, h); }
  const gap = h.present ? (now - h.t) / 1000 : 0;
  const palm = ease(h.present ? h.palm : null, d.palm, 0.65);
  if (gap > 0.001 && gap < 0.4) {
    h.vel = { x: h.vel.x + ((palm.x - h.palm.x) / gap - h.vel.x) * 0.5, y: h.vel.y + ((palm.y - h.palm.y) / gap - h.vel.y) * 0.5 };
    h.sizeRate += ((d.size - h.size) / h.size / gap - h.sizeRate) * 0.5;
  } else { h.vel = { x: 0, y: 0 }; h.sizeRate = 0; }
  h.prevShape = h.present ? h.shape : 'none';
  if (d.shape === h.raw || !h.present) h.shape = d.shape; // a shape must show up twice in a row, so flickers don't count
  h.raw = d.shape;
  h.tip = ease(h.present ? h.tip : null, d.tip, 0.7);
  Object.assign(h, { present: true, palm, tips: d.tips, size: d.size, t: now, lost: 0 });
}

function readHands(now) {
  const tracker = trackers.hand;
  if (useCamera && tracker && video.readyState >= 2 && video.videoWidth && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    let res = null;
    try { res = tracker.detectForVideo(video, now); } catch (e) { /* skip this frame */ }
    if (res) {
      const map = videoMap(video.videoWidth, video.videoHeight, W, H, facing === 'user', fit);
      const ids = new Set();
      res.landmarks.forEach((lm, i) => {
        let id = res.handedness?.[i]?.[0]?.categoryName || 'Hand';
        if (ids.has(id)) id += i;
        ids.add(id);
        const pts = lm.map(map);
        ingest(id, { palm: palmCenter(pts), tip: pts[8], tips: TIPS.map(j => pts[j]), size: handSize(pts), shape: handShape(pts) }, now);
      });
      for (const [id, h] of hands) if (id !== 'touch' && !ids.has(id)) h.present = false;
    }
  }
  if (pointer?.down) {
    const p = { x: pointer.x, y: pointer.y };
    ingest('touch', { palm: p, tip: p, tips: [p], size: Math.min(W, H) * 0.14, shape: mode === 'wand' ? 'point' : 'open' }, now);
  } else if (hands.has('touch')) hands.get('touch').present = false;
}

// ---------- Particles ----------
function add(p) {
  if (particles.length >= MAX_PARTICLES) particles.shift();
  particles.push({ vx: 0, vy: 0, drag: 2, grav: 0, size: 3, kind: 'spark', ...p, max: p.life });
}
const rnd = (a, b) => a + Math.random() * (b - a);

function sparkle(x, y, hue) {
  const a = rnd(0, Math.PI * 2), s = rnd(20, 120);
  add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + 30, life: rnd(0.4, 0.9), size: rnd(1.5, 4), color: `hsl(${hue},100%,70%)`, kind: Math.random() < 0.25 ? 'star' : 'spark', grav: 60 });
}
function starBurst(x, y) {
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2, s = rnd(150, 420);
    add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.6, 1.1), size: rnd(4, 9), color: `hsl(${rnd(0, 360)},100%,70%)`, kind: 'star', drag: 3 });
  }
}
function ember(x, y, r) {
  add({ x: x + rnd(-r, r) * 0.6, y: y + rnd(-r, r) * 0.4, vx: rnd(-30, 30), vy: rnd(-160, -60), life: rnd(0.3, 0.7), size: rnd(2, 5), color: `hsl(${rnd(15, 45)},100%,60%)`, drag: 1 });
}
function smoke(x, y, r) {
  for (let i = 0; i < 18; i++) add({ x: x + rnd(-r, r) * 0.5, y: y + rnd(-r, r) * 0.5, vx: rnd(-40, 40), vy: rnd(-120, -40), life: rnd(0.8, 1.4), size: rnd(r * 0.3, r * 0.7), color: '150,150,160', kind: 'smoke', drag: 1.5 });
}
function boom(x, y, r, big) {
  for (let i = 0; i < (big ? 90 : 60); i++) {
    const a = rnd(0, Math.PI * 2), s = rnd(100, big ? 900 : 600);
    add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.5, 1.2), size: rnd(3, big ? 12 : 8), color: `hsl(${rnd(5, 50)},100%,${rnd(50, 70)}%)`, drag: 2.5, grav: 120 });
  }
  smoke(x, y, r * 1.5);
  flash = big ? 0.9 : 0.5; flashColor = '255,190,90';
  stage.classList.remove('mg-shake'); void stage.offsetWidth; stage.classList.add('mg-shake');
  SFX.boom();
  stage.dataset.booms = String(+(stage.dataset.booms || 0) + 1);
}
function popBurst(b) {
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    add({ x: b.x + Math.cos(a) * b.r, y: b.y + Math.sin(a) * b.r, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, life: 0.4, size: 3, color: `hsl(${b.hue},90%,80%)`, drag: 4 });
  }
}

// ---------- Each kind of magic ----------
function wand(h, now) {
  if (h.present) {
    h.trail.push({ x: h.tip.x, y: h.tip.y, t: now });
    const n = 1 + Math.min(4, Math.hypot(h.vel.x, h.vel.y) / 400);
    for (let i = 0; i < n; i++) sparkle(h.tip.x, h.tip.y, (now / 8) % 360);
    if (h.shape === 'open' && h.prevShape !== 'open' && now - (h.burstAt || 0) > 700) {
      h.burstAt = now; starBurst(h.palm.x, h.palm.y); SFX.ting();
    }
  }
  h.trail = h.trail.filter(p => now - p.t < 450);
}

function fire(h, dt) {
  const f = h.fire;
  const ev = fireStep(f, h.present ? h : null, dt, Math.min(W, H) * 1.4);
  const r = h.size * 0.55;
  if (ev === 'throw') {
    // Throw at least fast enough to fly off the screen.
    const s = Math.hypot(f.vx, f.vy), min = Math.min(W, H) * 1.6, k = Math.max(1.3, min / (s || 1));
    shots.push({ x: f.x, y: f.y, vx: (s ? f.vx : 0) * k, vy: s ? f.vy * k : -min, r, t: 0, push: false });
    SFX.whoosh();
  } else if (ev === 'push') {
    shots.push({ x: f.x, y: f.y, vx: 0, vy: 0, r, t: 0, push: true });
    SFX.whoosh();
  } else if (ev === 'fizzle') {
    smoke(f.x, f.y, r); SFX.fizzle();
  }
  if (f.charge > 0) for (let i = 0; i < 1 + f.charge * 3; i++) ember(f.x, f.y, fireRadius(h));
}
const fireRadius = h => h.size * (0.2 + 0.5 * h.fire.charge);

function moveShots(dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    s.t += dt;
    if (s.push) {
      s.r *= 1 + 5 * dt;
      if (s.t > 0.35) { shots.splice(i, 1); boom(s.x, s.y, s.r, true); }
      continue;
    }
    s.x += s.vx * dt; s.y += s.vy * dt; s.r *= 1 + 0.3 * dt;
    for (let k = 0; k < 3; k++) ember(s.x, s.y, s.r);
    if (s.x < 0 || s.x > W || s.y < 0 || s.y > H || s.t > 1.5) {
      shots.splice(i, 1);
      boom(Math.max(0, Math.min(W, s.x)), Math.max(0, Math.min(H, s.y)), s.r, false);
    }
  }
}

function bubbleStep(dt) {
  const R = Math.min(W, H) / 9;
  if (bubbles.length < 7 && Math.random() < dt * 2.2) {
    bubbles.push({ x: rnd(R, W - R), y: H + R, r: R * rnd(0.6, 1.2), vy: -rnd(40, 95) * (H / 700), phase: rnd(0, 6), hue: rnd(0, 360) });
  }
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    b.y += b.vy * dt; b.phase += dt * 2; b.x += Math.sin(b.phase) * 25 * dt;
    if (b.y < -b.r) bubbles.splice(i, 1);
  }
  const pts = taps.splice(0); // quick taps that started and ended between two frames
  for (const h of hands.values()) if (h.present) pts.push(...h.tips);
  const hit = popped(bubbles, pts);
  for (let k = hit.length - 1; k >= 0; k--) {
    const [b] = bubbles.splice(hit[k], 1);
    popBurst(b); SFX.pop();
    score++;
  }
  if (hit.length) scoreEl.textContent = `🫧 ${score}`;
}

// ---------- Archery ----------
/** Reads the body from the camera (when there's a new video frame) and smooths its points. */
function readBody(now) {
  const tracker = trackers.pose;
  if (!useCamera || !tracker || video.readyState < 2 || !video.videoWidth || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  let res = null;
  try { res = tracker.detectForVideo(video, now); } catch (e) { return; }
  const lm = res?.landmarks?.[0];
  if (!lm || (lm[11].visibility ?? 1) < 0.5 || (lm[12].visibility ?? 1) < 0.5) { body = null; return; }
  const map = videoMap(video.videoWidth, video.videoHeight, W, H, facing === 'user', fit);
  const next = bodyFrom(lm.map(map));
  if (next && body) for (const k of Object.keys(next)) if (k !== 'sw') next[k] = ease(body[k], next[k], 0.6);
  body = next;
}

function archery(now, dt) {
  readBody(now);
  const shot = bowStep(bow, body, dt);
  if (shot?.atCamera) { arrows.push({ into: true, x: shot.from.x, y: shot.from.y, t: 0 }); SFX.twang(); stage.dataset.arrows = String(+(stage.dataset.arrows || 0) + 1); }
  else if (shot) shoot(shot.from, shot.dir, shot.power);

  // Finger slingshot: press, drag back, let go.
  if (pointer?.down) {
    sling ||= { x: pointer.x, y: pointer.y };
    sling.cur = { x: pointer.x, y: pointer.y };
  } else if (sling) {
    const pull = sling.cur ? Math.hypot(sling.x - sling.cur.x, sling.y - sling.cur.y) : 0;
    const power = Math.min(1, pull / (Math.min(W, H) * 0.35));
    if (power >= MIN_POWER) shoot({ x: sling.x, y: sling.y }, aim(sling.cur, sling, sling), power);
    sling = null;
  }

  // Keep three things to hit on the screen.
  const R = Math.min(W, H) * 0.085;
  while (targets.length < 3) {
    const balloon = Math.random() < 0.4, r = balloon ? R * 0.8 : R;
    targets.push({ kind: balloon ? 'balloon' : 'target', r, x: rnd(r + 10, W - r - 10), y0: rnd(90 + r, H * 0.62), y: 0, t: rnd(0, 6), hue: rnd(0, 360), fade: 0 });
  }
  for (const t of targets) { t.t += dt; t.y = t.y0 + Math.sin(t.t * 1.3) * R * 0.35; t.fade = Math.min(1, t.fade + dt * 3); }

  // Arrows fly in an arc and hit things.
  const g = H * 0.45;
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    if (a.into) {
      // Shot at the camera: the arrow flies into the screen for a moment, then lands where the bow pointed.
      a.t += dt;
      if (a.t < INTO_TIME) continue;
      arrows.splice(i, 1);
      const k = targets.findIndex(t => hitPoints(a, { ...t, r: t.r * 1.4 }));
      if (k >= 0) { const [t] = targets.splice(k, 1); const pts = hitPoints(a, { ...t, r: t.r * 1.4 }); hitBurst(t, pts); setScore(score + pts); }
      else for (let j = 0; j < 10; j++) add({ x: a.x, y: a.y, vx: rnd(-90, 90), vy: rnd(-90, 90), life: 0.4, size: 3, color: '#ffd23f', drag: 3 });
      continue;
    }
    a.vy += g * dt; a.x += a.vx * dt; a.y += a.vy * dt;
    if (Math.random() < 0.6) add({ x: a.x, y: a.y, vx: rnd(-20, 20), vy: rnd(-20, 20), life: 0.35, size: 2.5, color: `hsl(${rnd(40, 60)},100%,70%)`, drag: 3 });
    let hit = false;
    for (let k = targets.length - 1; k >= 0; k--) {
      const t = targets[k];
      const pts = hitPoints(a, t);
      if (!pts) continue;
      targets.splice(k, 1);
      hitBurst(t, pts);
      setScore(score + pts);
      hit = true;
      break;
    }
    if (hit || a.x < -50 || a.x > W + 50 || a.y > H + 50 || a.y < -H) arrows.splice(i, 1);
  }
}

const INTO_TIME = 0.3; // seconds an arrow shot at the camera takes to land

function shoot(from, dir, power) {
  const speed = Math.min(W, H) * (1.8 + 2.4 * power);
  arrows.push({ x: from.x, y: from.y, vx: dir.x * speed, vy: dir.y * speed });
  SFX.twang();
  stage.dataset.arrows = String(+(stage.dataset.arrows || 0) + 1);
}

function hitBurst(t, pts) {
  const n = t.kind === 'balloon' ? 24 : 36;
  for (let i = 0; i < n; i++) {
    const a = rnd(0, Math.PI * 2), s = rnd(80, 380);
    const color = t.kind === 'balloon' ? `hsl(${t.hue},90%,65%)` : `hsl(${[0, 45, 200][i % 3]},100%,65%)`;
    add({ x: t.x, y: t.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.5, 1), size: rnd(3, 7), color, kind: i % 4 ? 'spark' : 'star', drag: 2.5, grav: 200 });
  }
  labels.push({ x: t.x, y: t.y, text: pts === 10 ? '🎯 +10!' : `+${pts}`, life: 1 });
  if (t.kind === 'balloon') SFX.pop(); else { SFX.thunk(); if (pts === 10) SFX.ting(); }
  stage.dataset.hits = String(+(stage.dataset.hits || 0) + 1);
}
const labels = []; // "+10" words that float up after a hit

// ---------- The main loop ----------
function loop(now) {
  if (!running) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (mode === 'archery') archery(now, dt);
  else readHands(now);

  for (const [id, h] of hands) {
    if (!h.present) h.lost += dt;
    if (mode === 'wand') wand(h, now);
    else if (mode === 'fire') fire(h, dt);
    if (!h.present && h.lost > 1 && h.fire.charge === 0 && !h.trail.length) hands.delete(id);
  }
  if (mode === 'fire') moveShots(dt);
  if (mode === 'bubbles') bubbleStep(dt);
  taps.length = 0;

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    const k = Math.exp(-p.drag * dt);
    p.vx *= k; p.vy = p.vy * k + p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  flash = Math.max(0, flash - dt * 2.5);
  for (let i = labels.length - 1; i >= 0; i--) { labels[i].life -= dt; labels[i].y -= 60 * dt; if (labels[i].life <= 0) labels.splice(i, 1); }

  // Message at the bottom
  let text = loadingMsg || (useCamera && !trackers[trackerFor(mode)] ? MAGIC.loading : '');
  if (!text && useCamera) {
    if (mode === 'archery' ? body : [...hands.values()].some(h => h.present)) lastSeen = now;
    if (now - lastSeen > 1500) text = mode === 'archery' ? MAGIC.showBody : MAGIC.showHand;
  }
  if (!text && now < hintUntil) text = hintText;
  if (hintEl.textContent !== text) hintEl.textContent = text;

  // What the page sees, for tests and curious grown-ups: <div id="mg-stage" data-hands="open point">
  const seen = [...hands.values()].filter(h => h.present).map(h => h.shape).join(' ');
  if (stage.dataset.hands !== seen) stage.dataset.hands = seen;
  const bowState = bow.drawn ? 'drawn' : bow.side ? 'ready' : body ? 'body' : '';
  if (stage.dataset.bow !== bowState) stage.dataset.bow = bowState;

  draw(now);
  raf = requestAnimationFrame(loop);
}

// ---------- Drawing ----------
function drawFireball(x, y, r, now) {
  const rr = r * (1 + 0.07 * Math.sin(now / 45) + 0.04 * Math.sin(now / 17));
  const g = ctx.createRadialGradient(x, y, 0, x, y, rr * 1.8);
  g.addColorStop(0, 'rgba(255,255,235,1)');
  g.addColorStop(0.25, 'rgba(255,220,80,1)');
  g.addColorStop(0.5, 'rgba(255,120,30,.9)');
  g.addColorStop(1, 'rgba(255,40,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, rr * 1.8, 0, Math.PI * 2); ctx.fill();
}

function drawStar(x, y, s) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, d = i % 2 ? s * 0.35 : s;
    ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.closePath(); ctx.fill();
}

// Archery drawing: targets and balloons, the body we see, the bow, the aim and flying arrows.
function drawTarget(t) {
  ctx.globalAlpha = t.fade;
  if (t.kind === 'balloon') {
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(t.x, t.y + t.r * 1.15); ctx.quadraticCurveTo(t.x + 8, t.y + t.r * 1.6, t.x, t.y + t.r * 2.1); ctx.stroke();
    const g = ctx.createRadialGradient(t.x - t.r * 0.35, t.y - t.r * 0.4, t.r * 0.1, t.x, t.y, t.r * 1.15);
    g.addColorStop(0, `hsl(${t.hue},100%,85%)`); g.addColorStop(1, `hsl(${t.hue},85%,50%)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(t.x, t.y, t.r * 0.9, t.r * 1.15, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    [['#ffffff', 1], ['#e63946', 0.82], ['#ffffff', 0.64], ['#1d8fe1', 0.47], ['#ffcc29', 0.3]].forEach(([c, k]) => {
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(t.x, t.y, t.r * k, 0, Math.PI * 2); ctx.fill();
    });
    ctx.strokeStyle = '#1d2b53'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawArrow(x, y, dx, dy, len, glow) {
  const tx = x - dx * len, ty = y - dy * len;
  ctx.lineCap = 'round';
  if (glow) { ctx.strokeStyle = `rgba(255,220,120,${glow})`; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke(); }
  ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
  const nx = -dy, ny = dx, h = Math.max(8, len * 0.16);
  ctx.fillStyle = '#e8eef5';
  ctx.beginPath(); ctx.moveTo(x + dx * h, y + dy * h); ctx.lineTo(x + nx * h * 0.55, y + ny * h * 0.55); ctx.lineTo(x - nx * h * 0.55, y - ny * h * 0.55); ctx.fill();
  ctx.fillStyle = '#ff6b9d';
  for (const sgn of [1, -1]) {
    ctx.beginPath(); ctx.moveTo(tx + dx * h, ty + dy * h); ctx.lineTo(tx + nx * h * 0.6 * sgn, ty + ny * h * 0.6 * sgn); ctx.lineTo(tx, ty); ctx.fill();
  }
}

/** The bow at `at`, facing `dir`, with the string pulled to `hand` (or straight when hand is null). */
function drawBow(at, dir, size, hand, power) {
  const nx = -dir.y, ny = dir.x, half = size / 2;
  const a = { x: at.x + nx * half - dir.x * size * 0.18, y: at.y + ny * half - dir.y * size * 0.18 };
  const b = { x: at.x - nx * half - dir.x * size * 0.18, y: at.y - ny * half - dir.y * size * 0.18 };
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,215,120,.45)'; ctx.lineWidth = 14;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(at.x + dir.x * size * 0.45, at.y + dir.y * size * 0.45, b.x, b.y); ctx.stroke();
  ctx.strokeStyle = '#a0522d'; ctx.lineWidth = 7;
  ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(a.x, a.y);
  if (hand) ctx.lineTo(hand.x, hand.y);
  ctx.lineTo(b.x, b.y); ctx.stroke();
  if (hand) {
    const len = Math.hypot(at.x - hand.x, at.y - hand.y) + size * 0.35;
    drawArrow(hand.x + dir.x * len, hand.y + dir.y * len, dir.x, dir.y, len, power >= MIN_POWER ? 0.25 + 0.5 * power : 0);
    if (power >= MIN_POWER) drawAim(at, dir, power);
  }
}

/** Crosshair where an arrow shot at the camera will land. Brighter as the bow is pulled. */
function drawCrosshair(at, r, power) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = power >= MIN_POWER ? '#ffcc29' : 'rgba(255,255,255,.8)';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(at.x, at.y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(at.x + dx * r * 0.5, at.y + dy * r * 0.5); ctx.lineTo(at.x + dx * r * 1.3, at.y + dy * r * 1.3); }
  ctx.stroke();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath(); ctx.arc(at.x, at.y, 4, 0, Math.PI * 2); ctx.fill();
}

/** Dotted line showing where the arrow will fly. */
function drawAim(from, dir, power) {
  const speed = Math.min(W, H) * (1.8 + 2.4 * power), g = H * 0.45;
  let x = from.x, y = from.y, vx = dir.x * speed, vy = dir.y * speed;
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  for (let i = 0; i < 14; i++) {
    const st = 0.035;
    vy += g * st; x += vx * st; y += vy * st;
    ctx.globalAlpha = 0.8 * (1 - i / 14);
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawArchery() {
  ctx.globalCompositeOperation = 'source-over';
  for (const t of targets) drawTarget(t);

  if (body) {
    // Soft lines on the arms, so kids can see the camera found them.
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(body.lw.x, body.lw.y); ctx.lineTo(body.le.x, body.le.y); ctx.lineTo(body.ls.x, body.ls.y);
    ctx.lineTo(body.rs.x, body.rs.y); ctx.lineTo(body.re.x, body.re.y); ctx.lineTo(body.rw.x, body.rw.y);
    ctx.stroke();
    if (bow.side) {
      const s = body[bow.side + 's'];
      if (bow.drawn && atCamera(bow, body)) drawCrosshair(bow.bow, body.sw * 0.45, bow.power);
      else {
        const dir = bow.drawn ? aim(bow.anchor, bow.bow, body.nose) : aim(s, bow.bow, s);
        drawBow(bow.bow, dir, body.sw * 1.1, bow.drawn ? bow.hand : null, bow.power);
      }
    }
  }
  if (sling?.cur) {
    const pull = Math.hypot(sling.x - sling.cur.x, sling.y - sling.cur.y);
    const power = Math.min(1, pull / (Math.min(W, H) * 0.35));
    drawBow(sling, aim(sling.cur, sling, { x: sling.x, y: sling.y + 1 }), Math.min(W, H) * 0.3, pull > 4 ? sling.cur : null, power);
  }
  for (const a of arrows) {
    if (a.into) { drawCrosshair(a, Math.min(W, H) * 0.12 * (1 - a.t / INTO_TIME) + 4, 1); continue; }
    const v = Math.hypot(a.vx, a.vy) || 1;
    drawArrow(a.x, a.y, a.vx / v, a.vy / v, Math.min(W, H) * 0.14, 0.3);
  }

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.round(Math.min(W, H) * 0.075)}px Fredoka, Nunito, system-ui, sans-serif`;
  for (const l of labels) {
    ctx.globalAlpha = Math.min(1, l.life * 2);
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(l.text, l.x, l.y);
    ctx.fillStyle = '#ffcc29'; ctx.fillText(l.text, l.x, l.y);
  }
  ctx.globalAlpha = 1;
}

/** The camera picture, filling the screen or fitting all of it (the ⤢ button), flipped like a mirror for the selfie camera. */
function drawVideo() {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!useCamera || !stream || video.readyState < 2 || !vw) return;
  const r = videoRect(vw, vh, W, H, fit);
  ctx.save();
  if (facing === 'user') { ctx.translate(W, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, r.x, r.y, r.w, r.h);
  ctx.restore();
}

function draw(now) {
  ctx.clearRect(0, 0, W, H);
  drawVideo();

  for (const b of bubbles) {
    const g = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.1, b.x, b.y, b.r);
    g.addColorStop(0, 'rgba(255,255,255,.75)');
    g.addColorStop(0.5, `hsla(${b.hue},90%,75%,.12)`);
    g.addColorStop(0.92, `hsla(${b.hue + 60},90%,70%,.45)`);
    g.addColorStop(1, 'rgba(255,255,255,.8)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
  }

  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const h of hands.values()) {
    const t = h.trail;
    for (let i = 1; i < t.length; i++) {
      const age = 1 - (now - t[i].t) / 450;
      const hue = (t[i].t / 8) % 360;
      ctx.strokeStyle = `hsla(${hue},100%,60%,${0.35 * age})`;
      ctx.lineWidth = 18 * age;
      ctx.beginPath(); ctx.moveTo(t[i - 1].x, t[i - 1].y); ctx.lineTo(t[i].x, t[i].y); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * age})`;
      ctx.lineWidth = 4 * age;
      ctx.stroke();
    }
  }
  for (const p of particles) {
    if (p.kind === 'smoke') continue;
    const a = p.life / p.max;
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    if (p.kind === 'star') drawStar(p.x, p.y, p.size * 1.6);
    else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  if (mode === 'fire') {
    for (const h of hands.values()) if (h.fire.charge > 0) drawFireball(h.fire.x, h.fire.y, fireRadius(h), now);
    for (const s of shots) drawFireball(s.x, s.y, s.r, now);
  }

  ctx.globalCompositeOperation = 'source-over';
  for (const p of particles) {
    if (p.kind !== 'smoke') continue;
    ctx.fillStyle = `rgba(${p.color},${0.35 * (p.life / p.max)})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - p.life / p.max * 0.6), 0, Math.PI * 2); ctx.fill();
  }
  if (mode === 'archery') drawArchery();
  if (flash > 0) { ctx.fillStyle = `rgba(${flashColor},${flash * 0.6})`; ctx.fillRect(0, 0, W, H); }
}

// ---------- Setup ----------
export function initMagic() {
  stage = $('#mg-stage'); video = $('#mg-video'); canvas = $('#mg-canvas');
  hintEl = $('#mg-hint'); scoreEl = $('#mg-score'); flipBtn = $('#mg-flip');
  if (!stage) return;
  ctx = canvas.getContext('2d');

  $('#mg-start').onclick = () => open(true);
  $('#mg-touch').onclick = () => open(false);
  $('#mg-close').onclick = close;
  document.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => setMode(b.dataset.mode); });

  const fitBtn = $('#mg-fit');
  const showFit = () => {
    fitBtn.textContent = fit === 'fill' ? '⤢' : '⤡';
    fitBtn.setAttribute('aria-label', fit === 'fill' ? 'Show the whole camera picture' : 'Fill the screen');
  };
  try { if (localStorage.getItem('magic-hands-fit') === 'fit') fit = 'fit'; } catch (e) { /* storage blocked: use the default */ }
  showFit();
  fitBtn.onclick = () => {
    fit = fit === 'fill' ? 'fit' : 'fill';
    showFit();
    say(fit === 'fit' ? MAGIC.fitOn : MAGIC.fitOff, 2500);
    try { localStorage.setItem('magic-hands-fit', fit); } catch (e) { /* not saved, that's fine */ }
  };

  const soundBtn = $('#mg-sound');
  soundBtn.onclick = () => {
    sound = !sound;
    audio();
    soundBtn.textContent = sound ? '🔊' : '🔇';
    soundBtn.setAttribute('aria-pressed', String(sound));
  };
  flipBtn.onclick = async () => {
    facing = facing === 'user' ? 'environment' : 'user';
    hands.clear();
    try { await startCamera(); } catch (e) { say(MAGIC.noCamera, 7000); }
  };

  const at = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointerdown', e => { audio(); canvas.setPointerCapture(e.pointerId); pointer = { ...at(e), down: true }; taps.push(at(e)); });
  canvas.addEventListener('pointermove', e => { if (pointer?.down) Object.assign(pointer, at(e)); });
  const up = () => { if (pointer) pointer.down = false; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  addEventListener('resize', () => { if (running) resize(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && running) close(); });
  // Coming back to the page: phones stop the camera while the page is hidden, so start it again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && running && useCamera && (!stream || stream.getVideoTracks().every(t => t.readyState === 'ended'))) {
      startCamera().catch(() => say(MAGIC.noCamera, 7000));
    }
  });
}
