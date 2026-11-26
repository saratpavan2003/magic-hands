// Fills in the page's words from words.js, then starts Magic Hands.
import { MAGIC } from './words.js';
import { initMagic } from './magic-page.js';

const $ = s => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

$('#mg-safe').textContent = `🔒 ${MAGIC.safety}`;
for (const m of MAGIC.modes) {
  const c = el('div', 'card');
  c.append(el('span', 'e', m.emoji), el('h3', '', m.name), el('p', '', m.how));
  $('#mg-cards').append(c);

  const b = el('button');
  b.type = 'button'; b.dataset.mode = m.id; b.setAttribute('aria-pressed', 'false');
  const icon = el('span', '', m.emoji); icon.setAttribute('aria-hidden', 'true');
  b.append(icon, m.name);
  $('#mg-modes').append(b);
}
for (const t of MAGIC.tips) $('#mg-tips').append(el('li', '', t));

initMagic();
