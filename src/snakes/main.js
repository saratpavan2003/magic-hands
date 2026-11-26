// Snakes & Ladders page: choosing players, the camera and motion sensors, rolling the dice
// (button, tap or shake), taking turns and the winner screen. The 3D world is in scene.js,
// the rules in game.js.
import * as THREE from '../../vendor/three/three.module.js';
import { COLORS, MAX_PLAYERS, MIN_PLAYERS, newGame, play, rollDice } from './game.js';
import { createWorld } from './scene.js';

const $ = s => document.querySelector(s);
const SAY = {
  findBook: 'Tap the glowing green book on the bookcase 📗',
  lookAround: 'Look around with your phone to find the bookcase 📚',
  soon: title => `“${title}” is coming soon! 📚`,
  turn: (p, bot) => (bot ? `${p.name} (computer) is rolling…` : `${p.name}'s turn! Roll the dice 🎲`),
  rolled: n => `🎲 ${n}!`,
  ladder: p => `🪜 ${p.name} climbs a ladder!`,
  snake: p => `🐍 Oh no! ${p.name} slides down a snake!`,
  again: p => `🎲 A 6! ${p.name} rolls again!`,
  bounce: 'Too far! Bounce back from 100 ↩️',
  win: p => `${p.name} wins!`,
};

// ---------- Choosing players ----------
let count = 2;
const seats = COLORS.map(c => ({ name: c.name, bot: false }));

function drawSeats() {
  const list = $('#sl-players');
  list.textContent = '';
  for (let i = 0; i < count; i++) {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'sl-dot'; dot.style.background = COLORS[i].hex;
    const name = document.createElement('input');
    name.value = seats[i].name; name.maxLength = 12;
    name.setAttribute('aria-label', `Player ${i + 1} name`);
    name.oninput = () => { seats[i].name = name.value.trim() || COLORS[i].name; };
    const who = document.createElement('div');
    who.className = 'sl-who'; who.setAttribute('role', 'group'); who.setAttribute('aria-label', `Player ${i + 1} is`);
    for (const [bot, label] of [[false, '🧒 Person'], [true, '🤖 Computer']]) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label;
      b.setAttribute('aria-pressed', String(seats[i].bot === bot));
      b.onclick = () => { seats[i].bot = bot; drawSeats(); };
      who.append(b);
    }
    li.append(dot, name, who);
    list.append(li);
  }
  document.querySelectorAll('[data-count]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.count === count)));
}

// ---------- Sounds (made on the spot, no sound files) ----------
let ac = null, sound = true;
function audio() {
  const A = window.AudioContext || window.webkitAudioContext;
  if (!ac && A) ac = new A();
  if (ac?.state === 'suspended') ac.resume();
}
function tone(f1, f2, dur, type = 'sine', vol = 0.15, delay = 0) {
  if (!sound || !ac) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
}
const SFX = {
  hop: () => tone(500, 700, 0.08, 'triangle', 0.12),
  dice: () => { for (let i = 0; i < 6; i++) tone(180 + Math.random() * 120, 120, 0.05, 'square', 0.06, i * 0.09); },
  ladder: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.14, 'triangle', 0.14, i * 0.12)),
  snake: () => { tone(900, 150, 1.0, 'sawtooth', 0.06); tone(400, 90, 1.0, 'sine', 0.12); },
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, f, 0.18, 'triangle', 0.16, i * 0.14)),
  pop: () => tone(300, 900, 0.2, 'sine', 0.15),
};

// ---------- The game screen ----------
let world, stage, canvas, video, stream = null;
let game = null, busy = false, running = false, raf = 0, msgTimer = 0;
let phoneQ = null, gotOrientation = false, centred = false;

function say(text, ms = 2600) {
  const el = $('#sl-msg');
  el.textContent = text;
  clearTimeout(msgTimer);
  if (ms) msgTimer = setTimeout(() => { el.textContent = ''; }, ms);
}

function drawTurns() {
  const box = $('#sl-turns');
  box.textContent = '';
  if (!game) return;
  game.players.forEach((p, i) => {
    const c = document.createElement('span');
    c.className = 'sl-chip' + (i === game.turn && game.winner === null ? ' now' : '');
    const dot = document.createElement('i'); dot.style.background = p.color;
    c.append(dot, `${p.bot ? '🤖 ' : ''}${p.name} · ${p.pos || 'start'}`);
    box.append(c);
  });
  const human = game.winner === null && !game.players[game.turn].bot;
  $('#sl-roll').disabled = busy || !human;
}

async function start(withCamera) {
  audio();
  // iPhone asks for motion sensors only from a tap, so ask straight away.
  const asks = [];
  for (const E of [window.DeviceOrientationEvent, window.DeviceMotionEvent]) if (E && typeof E.requestPermission === 'function') asks.push(E.requestPermission().catch(() => 'denied'));

  $('#sl-setup').hidden = true;
  stage.hidden = false;
  document.body.classList.add('sl-open');
  running = true;
  resize();
  $('#sl-open').hidden = false; $('#sl-roll').hidden = true; $('#sl-shake').hidden = true; $('#sl-win').hidden = true;
  stage.dataset.state = 'shelf';
  game = null; drawTurns();
  last = performance.now();
  raf = requestAnimationFrame(loop);

  if (withCamera) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (!running) { stream.getTracks().forEach(t => t.stop()); stream = null; return; }
      video.srcObject = stream;
      await video.play().catch(() => {});
      world.setVideo(video);
    } catch (e) { stream = null; say('The camera didn’t start, so here’s the game without it! 🖥️', 4000); }
    await Promise.all(asks);
    addEventListener('deviceorientation', onOrientation);
    addEventListener('devicemotion', onMotion);
    // No motion sensor (or not allowed)? Drag to look around instead.
    setTimeout(() => { if (running && !gotOrientation) { world.setOrbit(); say(SAY.findBook, 4000); } }, 1200);
    say(SAY.lookAround, 3500);
  } else {
    world.setOrbit();
    say(SAY.findBook, 4000);
  }
}

function stop() {
  running = false;
  cancelAnimationFrame(raf);
  removeEventListener('deviceorientation', onOrientation);
  removeEventListener('devicemotion', onMotion);
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null; video.srcObject = null; world.setVideo(null);
  gotOrientation = false; centred = false; phoneQ = null;
  stage.hidden = true;
  $('#sl-setup').hidden = false;
  document.body.classList.remove('sl-open');
  if (world.isOpen()) world.closeBook();
}

function resize() {
  const r = stage.getBoundingClientRect();
  world.resize(r.width, r.height);
}

// ---------- Phone orientation → camera (the classic device-orientation formula) ----------
const zee = new THREE.Vector3(0, 0, 1), euler = new THREE.Euler(), q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // camera looks out the back of the phone
function onOrientation(e) {
  if (e.alpha === null && e.beta === null) return;
  const d = Math.PI / 180;
  const orient = (screen.orientation?.angle ?? window.orientation ?? 0) * d;
  euler.set((e.beta || 0) * d, (e.alpha || 0) * d, -(e.gamma || 0) * d, 'YXZ');
  phoneQ ||= new THREE.Quaternion();
  phoneQ.setFromEuler(euler).multiply(q1).multiply(q0.setFromAxisAngle(zee, -orient));
  gotOrientation = true;
}

// Shake to roll: a sudden big change in the phone's movement.
let lastAcc = null, lastShake = 0;
function onMotion(e) {
  const a = e.accelerationIncludingGravity;
  if (!a || a.x === null) return;
  if (lastAcc) {
    const jolt = Math.hypot(a.x - lastAcc.x, a.y - lastAcc.y, a.z - lastAcc.z);
    const now = performance.now();
    if (jolt > 22 && now - lastShake > 1500) { lastShake = now; if (canRoll()) roll(); }
  }
  lastAcc = { x: a.x, y: a.y, z: a.z };
}

let last = 0;
function loop(now) {
  if (!running) return;
  if (gotOrientation && phoneQ) {
    world.setCameraFromPhone(phoneQ);
    if (!centred) { world.faceCamera(); centred = true; }
  }
  world.frame(now);
  raf = requestAnimationFrame(loop);
}

// ---------- Opening the book and playing ----------
async function openBook() {
  if (busy || world.isOpen()) return;
  busy = true;
  $('#sl-open').hidden = true;
  stage.dataset.state = 'opening';
  SFX.pop();
  say('', 0);
  await world.openBook();
  busy = false;
  newRound();
}

function newRound() {
  game = newGame(seats.slice(0, count));
  world.setPlayers(game.players);
  $('#sl-win').hidden = true;
  $('#sl-roll').hidden = false;
  $('#sl-shake').hidden = !gotOrientation;
  stage.dataset.state = 'playing';
  nextTurn();
}

const canRoll = () => game && !busy && game.winner === null && !game.players[game.turn].bot && !$('#sl-roll').hidden;

function nextTurn() {
  drawTurns();
  if (game.winner !== null) return;
  const p = game.players[game.turn];
  say(SAY.turn(p, p.bot), p.bot ? 1500 : 0);
  if (p.bot) setTimeout(() => { if (running && game && !busy) roll(); }, 1100);
}

async function roll() {
  if (!game || busy || game.winner !== null) return;
  busy = true;
  drawTurns();
  const value = rollDice();
  SFX.dice();
  await world.throwDie(value);
  say(SAY.rolled(value), 1200);
  const who = game.turn, p = game.players[who];
  const result = play(game, value);
  if (result.steps.includes(100) && result.landed !== 100) setTimeout(() => say(SAY.bounce, 1800), 300);
  await world.movePiece(who, result, game.players.map(x => x.pos), () => SFX.hop());
  stage.dataset.rolls = String(+(stage.dataset.rolls || 0) + 1);
  if (result.jump === 'ladder') { SFX.ladder(); say(SAY.ladder(p)); }
  if (result.jump === 'snake') { SFX.snake(); say(SAY.snake(p)); }
  busy = false;
  if (result.won) return win(p);
  if (result.again) { say(SAY.again(p)); drawTurns(); if (p.bot) setTimeout(() => { if (running && game && !busy) roll(); }, 1500); return; }
  setTimeout(() => { if (running && game && !busy) nextTurn(); }, result.jump ? 1600 : 400);
}

function win(p) {
  SFX.win();
  drawTurns();
  stage.dataset.state = 'won';
  $('#sl-win-text').textContent = `${p.bot ? '🤖 ' : ''}${SAY.win(p)}`;
  $('#sl-win').hidden = false;
  $('#sl-roll').hidden = true; $('#sl-shake').hidden = true;
  for (let i = 0; i < 40; i++) {
    const c = document.createElement('span');
    c.className = 'sl-confetti';
    c.textContent = ['🎉', '⭐', '🎊', '✨', '🐍', '🪜'][i % 6];
    c.style.left = `${Math.random() * 100}%`;
    c.style.animationDelay = `${Math.random() * 1.2}s`;
    stage.append(c);
    setTimeout(() => c.remove(), 4000);
  }
}

async function backToShelf() {
  $('#sl-win').hidden = true; $('#sl-roll').hidden = true; $('#sl-shake').hidden = true;
  game = null; drawTurns();
  busy = true;
  await world.closeBook();
  busy = false;
  $('#sl-open').hidden = false;
  stage.dataset.state = 'shelf';
  say(SAY.findBook, 4000);
}

// ---------- Touch: tap things, drag to turn, pinch to zoom ----------
function initTouch() {
  const pts = new Map();
  let downAt = null, moved = 0, pinch0 = 0, zoom0 = 1;
  canvas.addEventListener('pointerdown', e => {
    audio();
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { downAt = { x: e.clientX, y: e.clientY }; moved = 0; }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = world.view.zoom; }
  });
  canvas.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    moved += Math.hypot(dx, dy);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      world.view.zoom = Math.min(2.5, Math.max(0.5, zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / (pinch0 || 1)));
    } else if (pts.size === 1) {
      if (world.view.mode === 'orbit') {
        world.view.yaw -= dx * 0.006;
        world.view.pitch = Math.min(-0.15, Math.max(-1.35, world.view.pitch - dy * 0.006));
      } else world.view.spin += dx * 0.008;
    }
  });
  const up = e => {
    pts.delete(e.pointerId);
    if (pts.size || !downAt || moved > 10) return;
    const r = canvas.getBoundingClientRect();
    const hit = world.pick(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    downAt = null;
    if (hit?.kind === 'book') openBook();
    else if (hit?.kind === 'soon') say(SAY.soon(hit.title));
    else if (hit?.kind === 'dice' && canRoll()) roll();
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', e => pts.delete(e.pointerId));
}

// ---------- Setup ----------
function init() {
  stage = $('#sl-stage'); canvas = $('#sl-canvas'); video = $('#sl-video');
  world = createWorld(canvas);
  if (new URLSearchParams(location.search).has('debug')) window.snakesWorld = world; // for testing
  drawSeats();
  document.querySelectorAll('[data-count]').forEach(b => { b.onclick = () => { count = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, +b.dataset.count)); drawSeats(); }; });
  $('#sl-ar').onclick = () => start(true);
  $('#sl-flat').onclick = () => start(false);
  $('#sl-close').onclick = stop;
  $('#sl-open').onclick = openBook;
  $('#sl-roll').onclick = () => { if (canRoll()) roll(); };
  $('#sl-again').onclick = () => { $('#sl-win').hidden = true; newRound(); };
  $('#sl-shelf').onclick = backToShelf;
  $('#sl-center').onclick = () => { if (world.view.mode === 'phone') world.faceCamera(); else { world.view.yaw = 0; world.view.pitch = world.isOpen() ? -0.95 : -0.3; world.view.zoom = 1; } world.view.spin = 0; };
  const soundBtn = $('#sl-sound');
  soundBtn.onclick = () => { sound = !sound; audio(); soundBtn.textContent = sound ? '🔊' : '🔇'; soundBtn.setAttribute('aria-pressed', String(sound)); };
  addEventListener('resize', () => { if (running) resize(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && running) stop(); });
  initTouch();
}

init();
