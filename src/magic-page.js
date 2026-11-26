// Magic Hands page (/magic): camera, hand tracking and the magic effects.
// The camera picture is looked at on this device only. Nothing is recorded, saved or sent:
// the hand-tracking engine and model are served from this site and run in the browser.
import { MAGIC } from './words.js';
import { TIPS, handShape, palmCenter, handSize, coverMap, ease, newFire, fireStep, popped } from './magic.js';

const $ = s => document.querySelector(s);
const ENGINE = { wasmLoaderPath: './vendor/wasm/vision_wasm_internal.js', wasmBinaryPath: './vendor/wasm/vision_wasm_internal.wasm' };
const MODEL = './model/hand_landmarker.task';
const MAX_PARTICLES = 700;

let stage, video, canvas, ctx, hintEl, scoreEl, flipBtn;
let W = 0, H = 0;
let mode = 'wand', facing = 'user', stream = null, tracker = null, trackerLoading = null;
let running = false, useCamera = false, raf = 0, last = 0, lastVideoTime = -1, lastSeen = 0;
let sound = true, score = 0, flash = 0, flashColor = '255,190,90';
let hintText = '', hintUntil = 0, loadingMsg = '';
let pointer = null; // finger or mouse on the screen: { x, y, down }
const taps = [];   // where the screen was tapped since the last frame

/** Hands we're following, by id: { present, palm, tip, tips, size, shape, vel, sizeRate, t, lost, trail, fire } */
const hands = new Map();
const particles = [], shots = [], bubbles = [];

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
  flipBtn.hidden = true;
  if (!withCamera) { say(MAGIC.touch, 5000); return; }

  loadingMsg = MAGIC.loading;
  try { await startCamera(); }
  catch (e) { loadingMsg = ''; say(MAGIC.noCamera, 7000); return; }
  try { await loadTracker(); }
  catch (e) { loadingMsg = ''; say(MAGIC.oldPhone, 7000); return; }
  loadingMsg = '';
  if (!running) return;
  useCamera = true;
  stage.dataset.tracking = tracker.__delegate || 'on';
  flipBtn.hidden = false;
  lastSeen = performance.now();
  say(modeHint());
}

function close() {
  running = false;
  cancelAnimationFrame(raf);
  stopCamera();
  stage.hidden = true;
  document.body.classList.remove('mg-open');
  hands.clear(); particles.length = 0; shots.length = 0; bubbles.length = 0; taps.length = 0;
  pointer = null; loadingMsg = '';
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

function loadTracker() {
  trackerLoading ||= (async () => {
    const { HandLandmarker } = await import('../vendor/vision_bundle.mjs');
    const opts = delegate => ({
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'VIDEO', numHands: 2,
      minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    try { tracker = await HandLandmarker.createFromOptions(ENGINE, opts('GPU')); tracker.__delegate = 'gpu'; }
    catch (e) { tracker = await HandLandmarker.createFromOptions(ENGINE, opts('CPU')); tracker.__delegate = 'cpu'; }
    return tracker;
  })().catch(e => { trackerLoading = null; throw e; });
  return trackerLoading;
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
const modeHint = () => `${modeInfo().emoji} ${modeInfo().how}`;
function say(text, ms = 4500) { hintText = text; hintUntil = performance.now() + ms; }

function setMode(m) {
  mode = m;
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  bubbles.length = 0; shots.length = 0;
  for (const h of hands.values()) { h.trail = []; h.fire = newFire(); }
  score = 0; scoreEl.textContent = '🫧 0';
  scoreEl.hidden = m !== 'bubbles';
  say(modeHint());
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
  if (useCamera && tracker && video.readyState >= 2 && video.videoWidth && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    let res = null;
    try { res = tracker.detectForVideo(video, now); } catch (e) { /* skip this frame */ }
    if (res) {
      const map = coverMap(video.videoWidth, video.videoHeight, W, H, facing === 'user');
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

// ---------- The main loop ----------
function loop(now) {
  if (!running) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  readHands(now);

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

  // Message at the bottom
  let text = loadingMsg;
  if (!text && useCamera) {
    if ([...hands.values()].some(h => h.present)) lastSeen = now;
    if (now - lastSeen > 1500) text = MAGIC.showHand;
  }
  if (!text && now < hintUntil) text = hintText;
  if (hintEl.textContent !== text) hintEl.textContent = text;

  // What the page sees, for tests and curious grown-ups: <div id="mg-stage" data-hands="open point">
  const seen = [...hands.values()].filter(h => h.present).map(h => h.shape).join(' ');
  if (stage.dataset.hands !== seen) stage.dataset.hands = seen;

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

function draw(now) {
  ctx.clearRect(0, 0, W, H);

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
