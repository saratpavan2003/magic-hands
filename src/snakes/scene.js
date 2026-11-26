// Snakes & Ladders 3D world: a bookcase, the pop-up book that holds the game, the board with
// snakes and ladders, the players' pieces and the dice. Drawn with three.js.
// Sizes are in metres; the person holding the phone is at the origin, looking down -z.
import * as THREE from '../../vendor/three/three.module.js';
import { LADDERS, SNAKES, cell } from './game.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// The open book lies on a "table" in front of you; the bookcase stands farther back.
export const TABLE = V(0, -0.62, -0.85);
export const SHELF = V(0, -0.45, -1.8);
const HALF_W = 0.42, BOOK_H = 0.6, COVER = 0.008, PAGES = 0.022, T = COVER + PAGES; // one half of the book
const BOARD = 0.56, SQ = BOARD / 10;              // the pop-up board and one square
const BOOK_ON_SHELF = 0.45;                       // the book is smaller on the shelf, and grows as it flies out
const DIE = 0.045;
const LIFT = 0.02;                                // how high the pop-up board stands above the pages

// ---------- Painted textures (drawn on a canvas, no image files) ----------
function canvasTexture(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const FONT = '"Fredoka","Nunito",system-ui,-apple-system,sans-serif';

function boardTexture() {
  const PAL = ['#fff3c4', '#ffd6e0', '#d4f1ff', '#dcf7d4', '#ece0ff'];
  return canvasTexture(1024, 1024, (g, W) => {
    const s = W / 10;
    for (let n = 1; n <= 100; n++) {
      const { row, col } = cell(n);
      const x = col * s, y = (9 - row) * s;
      g.fillStyle = PAL[(row + col) % PAL.length];
      g.fillRect(x, y, s, s);
      g.strokeStyle = 'rgba(29,43,83,.25)'; g.lineWidth = 2;
      g.strokeRect(x + 1, y + 1, s - 2, s - 2);
      g.fillStyle = '#1d2b53';
      g.font = `700 ${s * 0.32}px ${FONT}`;
      g.textAlign = 'left'; g.textBaseline = 'top';
      g.fillText(String(n), x + s * 0.08, y + s * 0.06);
    }
    // Start and finish
    const label = (n, text, color) => {
      const { row, col } = cell(n);
      g.fillStyle = color;
      g.font = `800 ${s * 0.2}px ${FONT}`;
      g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.fillText(text, col * s + s / 2, (9 - row) * s + s * 0.94);
    };
    label(1, 'START', '#e63946');
    const { row, col } = cell(100);
    g.font = `${s * 0.55}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('👑', col * s + s / 2, (9 - row) * s + s * 0.6);
    g.strokeStyle = '#1d2b53'; g.lineWidth = 10;
    g.strokeRect(5, 5, W - 10, W - 10);
  });
}

function coverTexture() {
  return canvasTexture(840, 1200, (g, W, H) => {
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#2fbf71'); grad.addColorStop(1, '#13804a');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#ffcc29'; g.lineWidth = 16; g.strokeRect(40, 40, W - 80, H - 80);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `800 120px ${FONT}`;
    g.fillText('Snakes', W / 2, H * 0.3);
    g.font = `700 70px ${FONT}`;
    g.fillText('&', W / 2, H * 0.4);
    g.font = `800 120px ${FONT}`;
    g.fillText('Ladders', W / 2, H * 0.5);
    g.font = `200px ${FONT}`;
    g.fillText('🐍🪜', W / 2, H * 0.72);
    g.font = `700 46px ${FONT}`; g.fillStyle = '#ffcc29';
    g.fillText('A pop-up game book', W / 2, H * 0.88);
  });
}

/** A book spine with its title. wide: the spine is drawn lying on its side (for the game book). */
function spineTexture(title, color, wide = false) {
  return canvasTexture(wide ? 1024 : 128, wide ? 128 : 1024, (g, W, H) => {
    g.fillStyle = color; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.25)';
    if (wide) { g.fillRect(60, 0, 14, H); g.fillRect(W - 74, 0, 14, H); } else { g.fillRect(0, 60, W, 14); g.fillRect(0, H - 74, W, 14); }
    g.save(); g.translate(W / 2, H / 2); if (!wide) g.rotate(-Math.PI / 2);
    g.fillStyle = '#fff'; g.font = `800 ${title.length > 14 ? 56 : 66}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(title, 0, 0);
    g.restore();
  });
}

function pageTexture(text) {
  return canvasTexture(512, 728, (g, W, H) => {
    g.fillStyle = '#fffaf0'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(0,0,0,.06)'; g.lineWidth = 2;
    for (let y = 60; y < H; y += 36) { g.beginPath(); g.moveTo(30, y); g.lineTo(W - 30, y); g.stroke(); }
    g.fillStyle = '#8c6bff'; g.font = `700 34px ${FONT}`; g.textAlign = 'center';
    g.fillText(text, W / 2, H - 40);
  });
}

function stripeTexture(a, b) {
  const t = canvasTexture(256, 32, (g, W, H) => {
    g.fillStyle = a; g.fillRect(0, 0, W, H);
    g.fillStyle = b;
    for (let x = 0; x < W; x += 32) g.fillRect(x, 0, 14, H);
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function pipTexture(n) {
  const spots = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] }[n];
  return canvasTexture(128, 128, (g, W) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, W);
    g.fillStyle = n === 1 ? '#e63946' : '#1d2b53';
    for (const [i, j] of spots) { g.beginPath(); g.arc(28 + i * 36, 28 + j * 36, n === 1 ? 18 : 12, 0, Math.PI * 2); g.fill(); }
  });
}

// ---------- Board positions ----------
/** Centre of square n on the board, in board coordinates (board centre at 0, top surface at y = 0). */
export function squareXZ(n) {
  const { row, col } = cell(n);
  return { x: (col - 4.5) * SQ, z: (4.5 - row) * SQ };
}

/** Snake shape: a wiggly curve from its head (start square) to its tail (end square). */
function snakeCurve(from, to, seed) {
  const a = squareXZ(from), b = squareXZ(to);
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
  const nx = -dz / len, nz = dx / len;
  const pts = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const t = i / N, w = Math.sin(t * Math.PI * (2 + (seed % 2)) + seed) * SQ * 0.45 * Math.sin(t * Math.PI);
    pts.push(V(a.x + dx * t + nx * w, 0.006 + Math.sin(t * Math.PI) * 0.012, a.z + dz * t + nz * w));
  }
  return new THREE.CatmullRomCurve3(pts);
}

/** Ladder shape: an arch from its bottom square to its top square. side: -1 left rail, 1 right rail, 0 middle. */
function ladderCurve(from, to, side = 0) {
  const a = squareXZ(from), b = squareXZ(to);
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
  const off = side * SQ * 0.22, nx = (-dz / len) * off, nz = (dx / len) * off;
  const h = Math.min(0.09, len * 0.25);
  return new THREE.QuadraticBezierCurve3(V(a.x + nx, 0.004, a.z + nz), V((a.x + b.x) / 2 + nx, 0.004 + h * 2, (a.z + b.z) / 2 + nz), V(b.x + nx, 0.004, b.z + nz));
}

// ---------- Building the models ----------
function makeSnake(from, to, i) {
  const COLORS = [['#2ecc71', '#1b8a4b'], ['#ff8a3d', '#c4511b'], ['#8c6bff', '#5a3cc9'], ['#ff6b9d', '#c43d6d'], ['#3d8bff', '#1f5bb8'], ['#ffcc29', '#c49a00']];
  const [c1, c2] = COLORS[i % COLORS.length];
  const curve = snakeCurve(from, to, i);
  const seg = 80, radial = 10;
  const geo = new THREE.TubeGeometry(curve, seg, 0.007, radial, false);
  // Thick at the head, thin at the tail.
  const pos = geo.attributes.position, p = new THREE.Vector3(), c = new THREE.Vector3();
  for (let k = 0; k < pos.count; k++) {
    const t = Math.floor(k / (radial + 1)) / seg;
    curve.getPointAt(t, c);
    p.fromBufferAttribute(pos, k).sub(c).multiplyScalar(1.35 - t * 1.05).add(c);
    pos.setXYZ(k, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  const map = stripeTexture(c1, c2);
  map.repeat.set(6, 1);
  const g = new THREE.Group();
  const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, roughness: 0.5 }));
  body.castShadow = true;
  g.add(body);
  // Head with eyes and a tongue, looking away from the body.
  const h0 = curve.getPointAt(0), dir = curve.getTangentAt(0).negate();
  const head = new THREE.Group();
  head.position.copy(h0).add(V(0, 0.004, 0));
  head.lookAt(head.position.clone().add(dir));
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.013, 16, 12), new THREE.MeshStandardMaterial({ color: c1, roughness: 0.5 }));
  skull.scale.set(1, 0.75, 1.35);
  skull.castShadow = true;
  head.add(skull);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 10, 8), new THREE.MeshStandardMaterial({ color: '#fff' }));
    eye.position.set(sx * 0.0065, 0.006, 0.007);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 8, 6), new THREE.MeshBasicMaterial({ color: '#111' }));
    pupil.position.set(0, 0.0008, 0.0032);
    eye.add(pupil);
    head.add(eye);
  }
  const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.0006, 0.012), new THREE.MeshBasicMaterial({ color: '#e63946' }));
  tongue.position.set(0, -0.002, 0.021);
  head.add(tongue);
  g.add(head);
  g.userData = { curve, tongue };
  return g;
}

function makeLadder(from, to) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#b5713a', roughness: 0.7 });
  const left = ladderCurve(from, to, -1), right = ladderCurve(from, to, 1);
  for (const rail of [left, right]) {
    const m = new THREE.Mesh(new THREE.TubeGeometry(rail, 40, 0.0032, 6, false), wood);
    m.castShadow = true;
    g.add(m);
  }
  const len = left.getLength(), rungs = Math.max(3, Math.round(len / 0.028));
  for (let i = 1; i < rungs; i++) {
    const t = i / rungs;
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(left.getPointAt(t), right.getPointAt(t)), 1, 0.0022, 5, false), wood);
    m.castShadow = true;
    g.add(m);
  }
  g.userData = { curve: ladderCurve(from, to, 0) };
  return g;
}

function makePiece(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.03, 20), mat);
  body.position.y = 0.015;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.009, 16, 12), mat);
  head.position.y = 0.033;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.014, 0.004, 20), mat);
  base.position.y = 0.002;
  for (const m of [body, head, base]) { m.castShadow = true; g.add(m); }
  return g;
}

function makeDie() {
  // Box faces in three.js order: +x, -x, +y, -y, +z, -z.
  const FACES = [3, 4, 1, 6, 2, 5];
  const die = new THREE.Mesh(new THREE.BoxGeometry(DIE, DIE, DIE), FACES.map(n => new THREE.MeshStandardMaterial({ map: pipTexture(n), roughness: 0.4 })));
  die.castShadow = true;
  die.userData = { faces: FACES, kind: 'dice' };
  return die;
}
const FACE_NORMALS = [V(1, 0, 0), V(-1, 0, 0), V(0, 1, 0), V(0, -1, 0), V(0, 0, 1), V(0, 0, -1)];

function makeBookcase(onShelfBook) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#8a5a33', roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: '#5e3b1f', roughness: 0.9 });
  const W = 1.0, H = 1.25, D = 0.3, th = 0.03;
  const box = (w, h, d, x, y, z, m = wood) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
  box(W, H, th, 0, H / 2, -D / 2, dark);                 // back
  box(th, H, D, -W / 2, H / 2, 0); box(th, H, D, W / 2, H / 2, 0); // sides
  const shelves = [0, 0.4, 0.8, H - th / 2];
  shelves.forEach(y => box(W, th, D, 0, y + th / 2, 0));
  // Books on the shelves; the Snakes & Ladders book glows on the middle shelf.
  const TITLES = [['Space Race', '#3d8bff'], ['Dino Dash', '#ff8a3d'], ['Treasure Hunt', '#8c6bff'], ['Rainbow Run', '#ff6b9d'], ['Robot Party', '#22c993'], ['Pirate Cove', '#e63946']];
  const books = [];
  let k = 0;
  for (let s = 0; s < 3; s++) {
    let x = -W / 2 + th + 0.03;
    const y = shelves[s] + th;
    while (x < W / 2 - 0.08) {
      if (s === 1 && x > -0.08 && !g.userData.placed) {
        g.userData.placed = true;
        onShelfBook.position.set(x + 0.02, y, D / 2 - 0.01);
        g.add(onShelfBook);
        x += 0.07;
        continue;
      }
      const [title, color] = TITLES[k++ % TITLES.length];
      const w = 0.03 + ((k * 37) % 4) * 0.008, h = 0.24 + ((k * 53) % 5) * 0.022;
      const mats = Array(6).fill(new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), mats.slice());
      m.material[4] = new THREE.MeshStandardMaterial({ map: spineTexture(title, color), roughness: 0.7 });
      m.position.set(x + w / 2, y + h / 2, D / 2 - 0.11);
      m.rotation.z = (k % 5 === 0) ? 0.06 : 0;
      m.castShadow = true;
      m.userData = { kind: 'soon', title };
      g.add(m);
      books.push(m);
      x += w + 0.004;
    }
  }
  return g;
}

/** The game book: two halves on a hinge (the spine), with the board inside. Lies flat when its rotation is zero. */
function makeBook() {
  const root = new THREE.Group();
  const coverMat = new THREE.MeshStandardMaterial({ color: '#1f9d5b', roughness: 0.6 });
  const pageSide = new THREE.MeshStandardMaterial({ color: '#f4ecd8', roughness: 0.9 });

  // Right half: back cover and right pages, from the spine (x = 0) to x = HALF_W.
  const right = new THREE.Group();
  const rc = new THREE.Mesh(new THREE.BoxGeometry(HALF_W, COVER, BOOK_H), coverMat);
  rc.position.set(HALF_W / 2, COVER / 2, 0);
  const rp = new THREE.Mesh(new THREE.BoxGeometry(HALF_W - 0.012, PAGES, BOOK_H - 0.02), [pageSide, pageSide, new THREE.MeshStandardMaterial({ map: pageTexture('Roll the dice! 🎲') }), pageSide, pageSide, pageSide]);
  rp.position.set(HALF_W / 2, COVER + PAGES / 2, 0);
  right.add(rc, rp);

  // Left half: front cover (with the cover picture underneath, which faces up when the book is closed)
  // and left pages. It hinges at the top of the spine, so it folds over on top of the right half.
  const hinge = new THREE.Group();
  hinge.position.set(0, T, 0);
  const cover = coverTexture();
  cover.wrapS = THREE.RepeatWrapping; cover.repeat.x = -1;
  const lc = new THREE.Mesh(new THREE.BoxGeometry(HALF_W, COVER, BOOK_H), [coverMat, coverMat, coverMat, new THREE.MeshStandardMaterial({ map: cover, roughness: 0.6 }), coverMat, coverMat]);
  lc.position.set(-HALF_W / 2, COVER / 2 - T, 0);
  const lp = new THREE.Mesh(new THREE.BoxGeometry(HALF_W - 0.012, PAGES, BOOK_H - 0.02), [pageSide, pageSide, new THREE.MeshStandardMaterial({ map: pageTexture('Snakes & Ladders 🐍🪜') }), pageSide, pageSide, pageSide]);
  lp.position.set(-HALF_W / 2, COVER + PAGES / 2 - T, 0);
  hinge.add(lc, lp);

  // The spine you see on the shelf.
  const spine = new THREE.Mesh(new THREE.PlaneGeometry(BOOK_H, 2 * T + 0.004), new THREE.MeshStandardMaterial({ map: spineTexture('Snakes & Ladders', '#1f9d5b', true), roughness: 0.6 }));
  spine.rotation.set(0, -Math.PI / 2, 0); // faces out from the spine edge, running along the book's height
  spine.position.set(-0.001, T, 0);

  for (const m of [rc, rp, lc, lp]) { m.castShadow = true; m.receiveShadow = true; }
  root.add(right, hinge, spine);
  root.userData = { hinge, spine };
  return root;
}

// ---------- The world ----------
export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 20);
  scene.add(camera);

  scene.add(new THREE.HemisphereLight('#ffffff', '#b9a68a', 1.6));
  const sun = new THREE.DirectionalLight('#ffffff', 1.8);
  sun.position.set(0.6, 1.5, 0.4);
  sun.target.position.copy(TABLE);
  sun.position.add(TABLE);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -0.6, right: 0.6, top: 0.6, bottom: -0.6, near: 0.5, far: 3 });

  // "world" turns so the bookcase starts in front of wherever the phone points (the light turns with it).
  const world = new THREE.Group();
  scene.add(world);
  world.add(sun, sun.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShadowMaterial({ opacity: 0.25 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.copy(TABLE).add(V(0, -0.001, 0));
  ground.receiveShadow = true;
  world.add(ground);

  const book = makeBook();
  const shelfSpot = new THREE.Group(); // where the book stands on the shelf
  const bookcase = makeBookcase(shelfSpot);
  bookcase.position.copy(SHELF).add(V(0, -0.65, 0));
  world.add(bookcase);

  // Book standing on the shelf, spine facing you: book +x goes into the shelf, +z (its bottom edge) points down.
  const shelfQuat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 0, -1), V(1, 0, 0), V(0, -1, 0)));
  shelfSpot.add(book);
  book.position.set(0, (BOOK_H / 2) * BOOK_ON_SHELF, 0);
  book.quaternion.copy(shelfQuat);
  book.scale.setScalar(BOOK_ON_SHELF);
  book.userData.hinge.rotation.z = -Math.PI;
  book.traverse(o => { if (o.isMesh) o.userData.kind = 'book'; });

  // Board, snakes, ladders, pieces and dice live in "game", which sits on the open book.
  const game = new THREE.Group();
  game.position.set(0, T + 0.001, 0);
  const boardHolder = new THREE.Group(); // pops up out of the book
  const board = new THREE.Mesh(new THREE.BoxGeometry(BOARD, 0.006, BOARD), [pageSide(), pageSide(), new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.8 }), pageSide(), pageSide(), pageSide()]);
  board.position.y = -0.003;
  board.receiveShadow = true;
  boardHolder.add(board);
  // Folded paper supports under the board, like a pop-up book.
  for (const sx of [-1, 1]) {
    const fold = new THREE.Mesh(new THREE.PlaneGeometry(BOARD * 0.8, LIFT * 1.3), new THREE.MeshStandardMaterial({ color: '#efe2c4', side: THREE.DoubleSide }));
    fold.rotation.set(sx * 0.6, Math.PI / 2, 0, 'YXZ');
    fold.position.set(sx * BOARD * 0.25, -LIFT / 2 - 0.003, 0);
    boardHolder.add(fold);
  }
  boardHolder.position.y = LIFT;
  game.add(boardHolder);
  const extras = new THREE.Group(); // snakes and ladders, popped up one by one
  boardHolder.add(extras);
  const snakes = Object.entries(SNAKES).map(([a, b], i) => { const s = makeSnake(+a, b, i); s.userData.from = +a; extras.add(s); return s; });
  const ladders = Object.entries(LADDERS).map(([a, b]) => { const l = makeLadder(+a, b); l.userData.from = +a; extras.add(l); return l; });
  const piecesGroup = new THREE.Group();
  boardHolder.add(piecesGroup);
  let pieces = [];
  const die = makeDie();
  die.position.set(-BOARD / 2 - 0.07, DIE / 2, BOARD / 2 - 0.06);
  game.add(die);
  game.visible = false;
  book.add(game);

  function pageSide() { return new THREE.MeshStandardMaterial({ color: '#f4ecd8', roughness: 0.9 }); }

  // ---------- Little animation helper ----------
  const tweens = [];
  const tween = (dur, fn) => new Promise(done => tweens.push({ start: performance.now(), dur: dur * 1000, fn, done }));
  const ease = t => 1 - Math.pow(1 - t, 3);
  const back = t => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

  // ---------- Pieces ----------
  /** Where a piece stands on square n; pieces sharing a square stand in its corners. */
  function spot(n, i, all) {
    const { x, z } = n === 0 ? { x: -5.6 * SQ, z: 4.5 * SQ } : squareXZ(n);
    const here = all.filter(p => p === n).length;
    if (n === 0) return V(x, -LIFT, z - i * SQ * 0.9); // waiting on the page beside square 1
    if (here < 2) return V(x, 0, z);
    const k = all.slice(0, i).filter(p => p === n).length;
    return V(x + (k % 2 ? 1 : -1) * SQ * 0.22, 0, z + (k < 2 ? -1 : 1) * SQ * 0.22);
  }

  function setPlayers(players) {
    piecesGroup.clear();
    pieces = players.map(p => { const m = makePiece(p.color); piecesGroup.add(m); return m; });
    placePieces(players.map(p => p.pos));
  }
  function placePieces(positions) { pieces.forEach((m, i) => m.position.copy(spot(positions[i], i, positions))); }

  /** Animates player i's move (from game.play()), then tidies up shared squares. */
  async function movePiece(i, result, positionsAfter, onHop) {
    const m = pieces[i];
    for (const n of result.steps) {
      const from = m.position.clone(), to = spot(n, i, []);
      await tween(0.24, t => { m.position.lerpVectors(from, to, t); m.position.y = Math.sin(t * Math.PI) * 0.035; });
      onHop?.(n);
    }
    if (result.jump) {
      const thing = (result.jump === 'ladder' ? ladders : snakes).find(o => o.userData.from === result.landed);
      const curve = thing.userData.curve, up = result.jump === 'ladder';
      await tween(up ? 1.0 : 1.2, t => {
        const p = curve.getPointAt(up ? ease(t) : t);
        m.position.set(p.x, p.y + 0.004, p.z);
        if (!up) m.rotation.z = Math.sin(t * Math.PI * 6) * 0.3;
      });
      m.rotation.z = 0;
    }
    const before = pieces.map(p => p.position.clone());
    await tween(0.2, t => pieces.forEach((p, k) => p.position.lerpVectors(before[k], spot(positionsAfter[k], k, positionsAfter), t)));
  }

  /** Throws the die and lands it showing `value`. */
  async function throwDie(value) {
    const face = die.userData.faces.indexOf(value);
    const end = new THREE.Quaternion().setFromUnitVectors(FACE_NORMALS[face], V(0, 1, 0));
    end.premultiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.random() * Math.PI * 2));
    const spin = V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const home = die.position.clone(), start = die.quaternion.clone();
    await tween(0.9, t => {
      const e = ease(t);
      die.position.set(home.x, home.y + Math.abs(Math.sin(t * Math.PI * 2.5)) * 0.08 * (1 - t), home.z);
      const tumble = new THREE.Quaternion().setFromAxisAngle(spin, (1 - e) * Math.PI * 6);
      die.quaternion.copy(start).slerp(end, e).premultiply(tumble);
    });
    die.position.copy(home);
    die.quaternion.copy(end);
  }

  // ---------- Opening and closing the book ----------
  let open = false, settled = false; // settled: lying open on the table, so it can be spun and zoomed
  async function openBook() {
    if (open) return;
    open = true;
    if (view.mode === 'orbit') tween(1.2, t => { view.pitch += (-0.95 - view.pitch) * t; });
    // Slide off the shelf, then fly to the table, growing and lying down.
    world.attach(book);
    const p0 = book.position.clone(), q0 = book.quaternion.clone();
    const slide = p0.clone().add(V(0, 0.05, 0.25));
    await tween(0.45, t => book.position.lerpVectors(p0, slide, ease(t)));
    const s0 = book.scale.x;
    const land = TABLE.clone().add(V(-HALF_W / 2, 0, 0));
    await tween(1.1, t => {
      const e = ease(t);
      book.position.lerpVectors(slide, land, e);
      book.position.y += Math.sin(t * Math.PI) * 0.15;
      book.quaternion.copy(q0).slerp(new THREE.Quaternion(), e);
      book.scale.setScalar(s0 + (1 - s0) * e);
    });
    // Open the cover, sliding over so the open book is centred.
    book.userData.spine.visible = false;
    const hinge = book.userData.hinge;
    await tween(1.0, t => { const e = ease(t); hinge.rotation.z = -Math.PI * (1 - e); book.position.x = land.x + (HALF_W / 2) * e; });
    // Pop-up: the board springs up, then the ladders and snakes, one after another.
    game.visible = true;
    boardHolder.scale.setScalar(0.001);
    extras.children.forEach(o => o.scale.setScalar(0.001));
    piecesGroup.visible = false; die.visible = false;
    await tween(0.7, t => { boardHolder.scale.set(back(t), Math.max(0.001, back(t)), back(t)); });
    for (const o of extras.children) {
      tween(0.45, t => o.scale.set(1, Math.max(0.001, back(t)), 1)); // rises up out of the board
      await tween(0.09, () => {});
    }
    await tween(0.4, () => {});
    piecesGroup.visible = true; die.visible = true;
    view.spin = 0; view.zoom = 1;
    settled = true;
  }

  async function closeBook() {
    if (!open) return;
    settled = false;
    if (view.mode === 'orbit') tween(1.2, t => { view.pitch += (-0.3 - view.pitch) * t; });
    book.rotation.y = 0; book.scale.setScalar(1);
    game.visible = false;
    const hinge = book.userData.hinge, x0 = book.position.x;
    await tween(0.8, t => { const e = ease(t); hinge.rotation.z = -Math.PI * e; book.position.x = x0 - (HALF_W / 2) * e; });
    const p0 = book.position.clone(), s0 = book.scale.x;
    const target = world.worldToLocal(shelfSpot.getWorldPosition(V())).add(V(0, (BOOK_H / 2) * BOOK_ON_SHELF, 0));
    const qShelf = shelfQuat.clone(); // the bookcase stands straight in the world
    await tween(1.0, t => {
      const e = ease(t);
      book.position.lerpVectors(p0, target, e);
      book.position.y += Math.sin(t * Math.PI) * 0.12;
      book.quaternion.copy(new THREE.Quaternion()).slerp(qShelf, e);
      book.scale.setScalar(s0 + (BOOK_ON_SHELF - s0) * e);
    });
    shelfSpot.attach(book);
    book.userData.spine.visible = true;
    open = false;
  }

  // ---------- Looking around ----------
  const view = { mode: 'orbit', yaw: 0, pitch: -0.3, spin: 0, zoom: 1 };
  /** AR: the phone's orientation drives the camera. Orbit: drag to look around the book. */
  function setCameraFromPhone(q) { view.mode = 'phone'; camera.quaternion.copy(q); camera.position.set(0, 0, 0); }
  function setOrbit() { view.mode = 'orbit'; }

  /** Turns the world so the bookcase is in front of the camera's current heading. */
  function faceCamera() {
    const f = V(0, 0, -1).applyQuaternion(camera.quaternion);
    world.rotation.y = Math.atan2(-f.x, -f.z);
  }

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w > h ? 45 : 62;
    camera.updateProjectionMatrix();
  }

  const raycaster = new THREE.Raycaster();
  /** What's under a tap (x, y in pixels): 'book', 'soon' (another book, with its title), 'dice' or null. */
  function pick(x, y, w, h) {
    raycaster.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1), camera);
    for (const hit of raycaster.intersectObjects(world.children, true)) {
      if (!hit.object.visible) continue;
      const k = hit.object.userData.kind;
      if (k === 'book' && !open) return { kind: 'book' };
      if (k === 'soon' && !open) return { kind: 'soon', title: hit.object.userData.title };
      if (k === 'dice') return { kind: 'dice' };
    }
    return null;
  }

  // ---------- The camera picture behind everything ----------
  let bg = null, bgVideo = null;
  /** Shows the camera video behind the 3D world (or nothing, with null). */
  function setVideo(video) {
    bgVideo = video;
    if (bg) bg.dispose();
    bg = video ? new THREE.VideoTexture(video) : null;
    if (bg) bg.colorSpace = THREE.SRGBColorSpace;
    scene.background = bg;
  }
  /** Crops the video so it fills the screen without stretching. */
  function coverBackground() {
    if (!bg || !bgVideo.videoWidth) return;
    const size = renderer.getSize(new THREE.Vector2());
    const va = bgVideo.videoWidth / bgVideo.videoHeight, sa = size.x / size.y;
    if (va > sa) { bg.repeat.set(sa / va, 1); bg.offset.set((1 - sa / va) / 2, 0); }
    else { bg.repeat.set(1, va / sa); bg.offset.set(0, (1 - va / sa) / 2); }
  }

  let lastT = performance.now();
  function frame(now) {
    coverBackground();
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i], t = Math.min(1, (now - tw.start) / tw.dur);
      tw.fn(t);
      if (t >= 1) { tweens.splice(i, 1); tw.done(); }
    }
    // The bookcase book glows until it's picked; snakes flick their tongues.
    if (!open) book.traverse(o => { if (o.isMesh && o.material.emissive) o.material.emissive.setRGB(0.15 + 0.15 * Math.sin(now / 250), 0.12 + 0.12 * Math.sin(now / 250), 0); });
    else book.traverse(o => { if (o.isMesh && o.material.emissive) o.material.emissive.setRGB(0, 0, 0); });
    snakes.forEach((s, i) => { s.userData.tongue.scale.z = 0.6 + 0.4 * Math.abs(Math.sin(now / 160 + i)); });

    // Turntable spin and zoom (drag and pinch) move the book's spot.
    const focus = open ? TABLE : SHELF;
    world.updateMatrixWorld();
    if (view.mode === 'orbit') {
      const target = focus.clone().applyMatrix4(world.matrixWorld);
      const tall = camera.aspect < 1; // a phone held upright needs to stand farther back to fit things in
      const d = (open ? (tall ? 1.5 : 1.0) : (tall ? 3.0 : 2.0)) / view.zoom;
      camera.position.set(target.x + Math.sin(view.yaw) * Math.cos(view.pitch) * d, target.y - Math.sin(view.pitch) * d, target.z + Math.cos(view.yaw) * Math.cos(view.pitch) * d);
      camera.lookAt(target);
    }
    if (settled) {
      book.rotation.y = view.spin;
      book.scale.setScalar(view.mode === 'phone' ? view.zoom : 1); // with the phone, pinching makes the book bigger
    }
    renderer.render(scene, camera);
    return dt;
  }

  return { renderer, camera, view, resize, frame, pick, setVideo, openBook, closeBook, setPlayers, placePieces, movePiece, throwDie, setCameraFromPhone, setOrbit, faceCamera, isOpen: () => open };
}
