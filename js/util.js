// Small helpers: DOM builder, toasts, dialogs, timing.

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// Everything is relative to the site folder, so it works at the root of a domain or inside /repo-name/ on GitHub Pages.
export const BASE = new URL('../', import.meta.url).href;
export const asset = p => BASE + p;
export const joinUrl = code => `${BASE}#/join/${code}`;

export const $ = (sel, root = document) => root.querySelector(sel);
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}
export function throttle(fn, ms) {
  let last = 0, t = null, args;
  return (...a) => {
    args = a;
    const now = performance.now();
    if (now - last >= ms) { last = now; fn(...args); }
    else if (!t) t = setTimeout(() => { t = null; last = performance.now(); fn(...args); }, ms - (now - last));
  };
}

export function toast(msg, kind = '') {
  const box = document.getElementById('toasts');
  const el = h('div', { class: 'toast ' + kind, role: 'status' }, msg);
  box.append(el);
  setTimeout(() => el.remove(), kind === 'bad' ? 6000 : 3200);
}

export function modal({ title, body, actions = [], wide = false, onClose } = {}) {
  const prevFocus = document.activeElement;
  const closeBtn = h('button', { class: 'btn quiet sm', 'aria-label': 'Close', onclick: () => close() }, 'Close');
  const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: wide ? { width: 'min(760px,100%)' } : null },
    h('header', null, h('h2', null, title), closeBtn),
    h('div', { class: 'body' }, body),
    actions.length ? h('footer', null, actions) : null);
  const back = h('div', { class: 'modal-back' }, box);
  back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  document.body.append(back);
  const first = box.querySelector('input, select, textarea, .btn.primary') || closeBtn;
  setTimeout(() => first.focus(), 30);
  function close(result) {
    document.removeEventListener('keydown', onKey);
    back.remove();
    if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) { /* ignore */ }
    if (onClose) onClose(result);
  }
  return { close, el: box };
}

export function confirmDialog({ title, text, confirmLabel = 'Yes, do it', danger = false }) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; m.close(); resolve(v); } };
    const m = modal({
      title,
      body: h('p', null, text),
      actions: [
        h('button', { class: 'btn', onclick: () => finish(false) }, 'Cancel'),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => finish(true) }, confirmLabel),
      ],
      onClose: () => { if (!done) { done = true; resolve(false); } },
    });
  });
}

export function mount(root, node) {
  root.replaceChildren(node);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = h('textarea', { style: { position: 'fixed', opacity: 0 } }); ta.value = text; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { /* ignore */ }
    ta.remove(); return ok;
  }
}

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeCode(n = 6) {
  const a = new Uint32Array(n); crypto.getRandomValues(a);
  return [...a].map(v => CODE_ALPHABET[v % CODE_ALPHABET.length]).join('');
}

// ---- share messages (what the teacher copies and sends to students)
export const randomCode4 = () => String(1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000));
export function makeCodes(n, taken = new Set()) {
  const out = [];
  while (out.length < n) { const c = randomCode4(); if (!taken.has(c)) { taken.add(c); out.push(c); } }
  return out;
}
export function shareMessage({ title, link, teacher = 'Maya', name = null, code = null }) {
  const L = [];
  L.push('BRIGHT ENGMATH', title, '--------------------------');
  L.push('1. Open the board:', link, '');
  if (name && code) L.push(`2. Tap your name: ${name}`, `3. Type your code: ${code}`);
  else L.push('2. Tap your name', '3. Type your 4-number code from your teacher');
  L.push('4. Start writing!', '--------------------------', `From Teacher ${teacher}`);
  return L.join('\n');
}
