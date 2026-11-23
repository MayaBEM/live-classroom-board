// The small idea board: a 2:1 sheet where a student writes or draws anything for the teacher, and the teacher can write back over it.
// Strokes are kept as small numbers (0..1000 across and down), so the picture looks the same at any size.
// Writing is kept smooth: finished strokes sit on one canvas that is only redrawn when something finishes, and the stroke being written
// is drawn on a second canvas on top (smoothed, with the pencil's predicted next points) so every frame is cheap.
import { h } from './util.js';
import { iconEl } from './icons.js';
import { pencil, TwoFingerTap } from './pencil.js';

export const STUDENT_INK = ['#1D2127', '#1F5FBF', '#D62F2F', '#1F8A4C', '#EE7A1C', '#7A3FA0'];   // new colours are only ever added at the end: saved strokes keep their colour
const HEX = /^#[0-9a-fA-F]{6}$/;    // a colour a person chose with the colour picker is saved as "#RRGGBB"
export const TEACHER_INK = '#7B2CBF';

const ERASE_R = 34;      // how close the eraser must be to a line (out of 1000)
const MIN_STEP = 2;      // ignore points closer than this (out of 1000)
const MAX_POINTS = 4000; // one stroke never gets longer than this many numbers

// a line through points that is rounded, not made of straight pieces
function smoothPath(ctx, p, W, H) {
  const n = p.length / 2;
  ctx.beginPath(); ctx.moveTo(p[0] / 1000 * W, p[1] / 1000 * H);
  if (n === 2) { ctx.lineTo(p[2] / 1000 * W, p[3] / 1000 * H); return; }
  for (let i = 1; i < n - 1; i++) {
    const x = p[i * 2] / 1000 * W, y = p[i * 2 + 1] / 1000 * H;
    ctx.quadraticCurveTo(x, y, (x + p[(i + 1) * 2] / 1000 * W) / 2, (y + p[(i + 1) * 2 + 1] / 1000 * H) / 2);
  }
  ctx.lineTo(p[(n - 1) * 2] / 1000 * W, p[(n - 1) * 2 + 1] / 1000 * H);
}

function drawStrokes(ctx, strokes, inks, W, H, widthPx, tip) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = widthPx;
  for (const s of strokes) {
    let p = s.p || []; if (p.length < 2) continue;
    ctx.strokeStyle = Array.isArray(inks) ? (typeof s.c === 'string' ? (HEX.test(s.c) ? s.c : inks[0]) : (inks[s.c] || inks[0])) : inks;
    ctx.fillStyle = ctx.strokeStyle;
    if (tip && s === strokes[strokes.length - 1]) p = p.concat(tip);
    if (p.length === 2) { ctx.beginPath(); ctx.arc(p[0] / 1000 * W, p[1] / 1000 * H, widthPx / 2, 0, Math.PI * 2); ctx.fill(); continue; }
    smoothPath(ctx, p, W, H); ctx.stroke();
  }
}

// the eraser rubs out only the part of a line it passes over: the pieces left over stay as lines of their own
const ERASE_PART = 22;   // how close the eraser must be to rub a point out (out of 1000)
function cutStroke(s, x, y) {
  const p = s.p || [], n = p.length / 2;
  if (n < 2) { return Math.hypot(p[0] - x, p[1] - y) < ERASE_PART ? [] : [s]; }
  // fast writing leaves long gaps between points: fill them in so the cut is exact
  const dense = [];
  for (let i = 0; i < n; i++) {
    const px = p[i * 2], py = p[i * 2 + 1];
    if (i > 0) { const qx = dense[dense.length - 2], qy = dense[dense.length - 1], L = Math.hypot(px - qx, py - qy), k = Math.min(80, Math.floor(L / 8)); for (let j = 1; j <= k; j++) dense.push(qx + (px - qx) * j / (k + 1), qy + (py - qy) * j / (k + 1)); }
    dense.push(px, py);
  }
  const out = []; let cur = [], cutAny = false;
  for (let i = 0; i < dense.length; i += 2) {
    if (Math.hypot(dense[i] - x, dense[i + 1] - y) < ERASE_PART) { cutAny = true; if (cur.length >= 4) out.push({ c: s.c, p: cur }); cur = []; }
    else cur.push(Math.round(dense[i]), Math.round(dense[i + 1]));
  }
  if (!cutAny) return [s];
  if (cur.length >= 4) out.push({ c: s.c, p: cur });
  return out;
}
const near = (s, x, y) => {
  const p = s.p; if (!p) return false;
  for (let i = 0; i < p.length; i += 2) {
    const ax = p[i], ay = p[i + 1], bx = i + 2 < p.length ? p[i + 2] : ax, by = i + 2 < p.length ? p[i + 3] : ay, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0, qx = ax + t * dx - x, qy = ay + t * dy - y;
    if (qx * qx + qy * qy < ERASE_PART * ERASE_PART) return true;
  }
  return false;
};

// opts: { strokes, other, ink (array for students, one colour for the teacher), otherInk, onChange(strokes), readonly, label, compact }
export class IdeaBoard {
  constructor(opts = {}) {
    Object.assign(this, { strokes: [], other: [], ink: STUDENT_INK, otherInk: TEACHER_INK, readonly: false, onChange: null, label: '', compact: false }, opts);
    this.strokes = (this.strokes || []).slice(); this.other = (this.other || []).slice();
    this.tool = 'pen'; this.colour = 0; this.cur = null; this.down = null; this.clearArmed = false; this.rect = null; this.pred = null;
    this.touches = new Map(); this.redoStack = []; this.hist = []; this.erasedSnap = false; this.tap = new TwoFingerTap(); this.palmAt = -1e9;
    this.canvas = h('canvas', { class: 'idea-canvas', 'aria-label': this.label || 'Drawing board', role: 'img' });
    this.ctx = this.canvas.getContext('2d');
    this.live = h('canvas', { class: 'idea-live', 'aria-hidden': 'true' });       // the stroke being written, on top
    try { this.lctx = this.live.getContext('2d', { desynchronized: true }); } catch (e) { this.lctx = this.live.getContext('2d'); }
    this.bar = this.readonly ? null : this.buildBar();
    this.el = h('div', { class: 'idea-board' + (this.compact ? ' compact' : '') }, this.bar, h('div', { class: 'idea-sheet' }, this.canvas, this.live));
    if (!this.readonly) this.attach();
    if (window.ResizeObserver) { this.ro = new ResizeObserver(() => { this.rect = null; this.draw(); }); this.ro.observe(this.canvas); }
    this.unsub = this.readonly ? null : pencil.subscribe(() => this.refreshBar());
    setTimeout(() => this.draw(), 0);
  }

  buildBar() {
    const mk = (cls, label, icon, fn) => h('button', { type: 'button', class: 'ib ' + cls, 'aria-label': label, title: label, onclick: fn }, iconEl(icon, 16));
    this.btnPen = mk('pen', 'Pen', 'pen', () => { this.tool = 'pen'; this.refreshBar(); });
    this.btnErase = mk('erase', 'Eraser', 'eraser', () => { this.tool = 'eraser'; this.refreshBar(); });
    this.btnUndo = mk('undo', 'Undo', 'undo', () => this.undo());
    this.btnClear = mk('clear', 'Clear my writing', 'trash', () => this.clear());
    this.btnPencil = mk('pencilonly', 'Pencil only', 'hand', () => pencil.toggle());
    this.dots = Array.isArray(this.ink) ? this.ink.slice(0, 4).map((c, i) => { const d = h('button', { type: 'button', class: 'ib dot', 'aria-label': 'Colour ' + (i + 1), onclick: () => { this.colour = i; this.tool = 'pen'; this.refreshBar(); } }); d.style.setProperty('--c', c); return d; }) : [];
    // any colour of your own
    this.picker = h('input', { type: 'color', class: 'sw-input', 'aria-label': 'Choose any colour', value: '#1f5fbf' });
    this.picker.addEventListener('input', () => { this.colour = this.picker.value; this.tool = 'pen'; this.refreshBar(); });
    this.picker.addEventListener('change', () => { this.colour = this.picker.value; this.tool = 'pen'; this.refreshBar(); });
    this.btnCustom = h('label', { class: 'ib dot custom', title: 'Choose any colour' }, this.picker, h('span', { 'aria-hidden': 'true' }, '+'));
    const bar = h('div', { class: 'idea-bar' }, this.label ? h('span', { class: 'idea-label' }, this.label) : null, this.btnPen, this.dots, this.btnCustom, this.btnErase, this.btnUndo, this.btnClear, this.btnPencil);
    // a resting hand must not press the colours or the other buttons while the pencil is writing
    const block = e => { if (e.pointerType === 'touch' && (pencil.recent() || this.down !== null && this.downType === 'pen')) { e.preventDefault(); e.stopPropagation(); this.palmAt = performance.now(); } };
    bar.addEventListener('pointerdown', block, true);
    bar.addEventListener('click', e => { if (performance.now() - this.palmAt < 700) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    this.refreshBar(bar);
    return bar;
  }

  refreshBar() {
    if (!this.btnPen) return;
    this.btnPen.setAttribute('aria-pressed', String(this.tool === 'pen')); this.btnErase.setAttribute('aria-pressed', String(this.tool === 'eraser'));
    this.dots.forEach((d, i) => d.setAttribute('aria-pressed', String(this.tool === 'pen' && this.colour === i)));
    if (this.btnCustom) { const on = this.tool === 'pen' && typeof this.colour === 'string'; this.btnCustom.setAttribute('aria-pressed', String(on)); this.btnCustom.style.setProperty('--c', on ? this.colour : '#fff'); }
    this.btnClear.classList.toggle('armed', this.clearArmed);
    this.btnClear.setAttribute('aria-label', this.clearArmed ? 'Tap again to clear' : 'Clear my writing');
    const only = pencil.only;
    this.btnPencil.setAttribute('aria-pressed', String(only));
    this.btnPencil.setAttribute('aria-label', only ? 'Pencil only is on. Fingers do not write. Tap to let fingers write' : 'Pencil only is off. Tap to write with the pencil only');
    this.btnPencil.title = only ? 'Pencil only: ON (fingers do not write)' : 'Pencil only: OFF (fingers write)';
  }

  // ---- drawing on screen
  size() {
    const r = this.rect || (this.rect = this.canvas.getBoundingClientRect());
    return [Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height))];
  }
  fit(c, W, H, dpr) { if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; } }
  draw() {   // the sheet: the lines, the teacher's writing and every finished stroke
    const [W, H] = this.size(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.fit(this.canvas, W, H, dpr); this.fit(this.live, W, H, dpr);
    const ctx = this.ctx; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#DCE6F2'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 1; i < 4; i++) { const y = Math.round(H * i / 4) + .5; ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    const wpx = this.widthPx(W);
    drawStrokes(ctx, this.other, this.otherInk, W, H, wpx);
    drawStrokes(ctx, this.strokes, this.ink, W, H, wpx);
    this.drawLive();
  }
  widthPx(W) { return Math.max(1.6, 2.4 * W / 250); }
  drawLive() {   // only the stroke that is being written
    const [W, H] = this.size(), dpr = Math.min(window.devicePixelRatio || 1, 2), ctx = this.lctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    if (this.cur && this.tool !== 'eraser') drawStrokes(ctx, [this.cur], this.ink, W, H, this.widthPx(W), this.pred);
  }
  queueLive() { if (this.liveQ) return; this.liveQ = true; requestAnimationFrame(() => { this.liveQ = false; this.drawLive(); }); }

  setOther(list) { this.other = (list || []).slice(); this.draw(); }
  setStrokes(list) { if (this.down) return; this.strokes = (list || []).slice(); this.draw(); }
  empty() { return !this.strokes.length; }
  destroy() { if (this.ro) this.ro.disconnect(); if (this.unsub) this.unsub(); }

  // ---- touch and pen
  pos(e) {
    const r = this.rect || (this.rect = this.canvas.getBoundingClientRect());
    return [Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * 1000), Math.round(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) * 1000)];
  }

  // a pen or a mouse writes; a finger writes only when "Pencil only" is off, never while a pen is on the screen, and two fingers never write
  attach() {
    const c = this.canvas;
    const stopStroke = () => { this.cur = null; this.pred = null; this.down = null; this.downType = null; this.drawLive(); };
    c.addEventListener('pointerdown', e => {
      this.rect = c.getBoundingClientRect();
      if (e.pointerType === 'pen') {
        pencil.pen();
        if (this.down !== null && this.downType === 'touch') stopStroke();       // the hand landed first: the pencil wins
        this.touches.clear(); this.tap.reset();
      } else if (e.pointerType === 'touch') {
        this.armStraight(e);                                                         // one finger HELD down makes the line straight
        if (pencil.recent() || (this.down !== null && this.downType === 'pen')) return;   // a resting hand
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.touches.size >= 2) {                                              // two fingers: not writing
          if (this.down !== null && this.downType === 'touch') stopStroke();
          this.tap.down(this.touches);
          e.preventDefault(); return;
        }
        if (pencil.only) { e.preventDefault(); return; }                           // Pencil only: a finger does not write
      }
      if (this.down !== null && performance.now() - this.downAt < 8000) return;
      e.preventDefault(); this.down = e.pointerId; this.downType = e.pointerType; this.downAt = performance.now(); this.clearArmed = false; this.refreshBar();
      try { c.setPointerCapture(e.pointerId); } catch (x) { /* fine */ }
      const [x, y] = this.pos(e);
      if (this.tool === 'eraser') { this.erased = false; this.erasedSnap = false; this.eraseAt(x, y); }
      else { this.cur = { c: this.colour, p: [x, y] }; this.straight = false; this.drawLive(); }
    });
    c.addEventListener('pointermove', e => {
      if (e.pointerType === 'pen' && this.down === e.pointerId) pencil.pen();
      const t = this.touches.get(e.pointerId); if (t) { t.x = e.clientX; t.y = e.clientY; this.tap.move(e.pointerId, e.clientX, e.clientY); }
      if (this.holdId === e.pointerId && Math.hypot(e.clientX - this.holdXY[0], e.clientY - this.holdXY[1]) > 22) this.cancelHold();
      if (this.down !== e.pointerId) return; e.preventDefault();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of (evs.length ? evs : [e])) {
        const [x, y] = this.pos(ev);
        if (this.tool === 'eraser') this.eraseAt(x, y);
        else if (this.cur && this.straight) { this.cur.p = [this.cur.p[0], this.cur.p[1], x, y]; }
        else if (this.cur) { const p = this.cur.p, dx = x - p[p.length - 2], dy = y - p[p.length - 1]; if (dx * dx + dy * dy >= MIN_STEP * MIN_STEP && p.length < MAX_POINTS) p.push(x, y); }
      }
      if (this.tool !== 'eraser') {
        const pe = e.pointerType !== 'mouse' && e.getPredictedEvents ? e.getPredictedEvents() : [];     // where the pencil is heading: drawn only on screen, never saved (not for a mouse: it made the end of the line flick)
        let lead = pe.length ? pe.slice(0, 2).flatMap(ev => this.pos(ev)) : null;
        if (!lead && e.pointerType !== 'mouse' && this.cur && this.cur.p.length >= 6) {       // no predicted points (Safari): look a little ahead ourselves
          const q = this.cur.p, n = q.length, vx = (q[n - 2] - q[n - 6]) / 2, vy = (q[n - 1] - q[n - 5]) / 2, sp = Math.hypot(vx, vy);
          if (sp > 1) { const ext = Math.min(sp * 1.1, 30); lead = [Math.round(q[n - 2] + vx / sp * ext), Math.round(q[n - 1] + vy / sp * ext)]; }
        }
        this.pred = lead;
        this.queueLive();
      }
    });
    const end = e => {
      if (this.holdId === e.pointerId) this.cancelHold();
      if (e.pointerType === 'pen') pencil.pen();
      if (this.touches.has(e.pointerId)) {
        this.touches.delete(e.pointerId);
        const tapN = this.tap.up(e.pointerId);
        if (tapN === 3) this.redo(); else if (tapN === 2 && e.type === 'pointerup') this.undo();      // two fingers tapped together: undo; three fingers: redo
        if (!this.touches.size) this.tap.reset();
      }
      if (this.down !== e.pointerId) return;
      const cancelled = e.type === 'pointercancel';
      this.downTypeWas = this.downType; this.down = null; this.downType = null;
      if (this.tool === 'eraser') { if (this.erased) this.changed(); }
      else if (this.cur) {
        const s = this.cur; this.cur = null; this.pred = null;
        if (!cancelled) { this.hist.push(this.strokes.slice()); this.strokes.push(s); this.redoStack = []; this.lastStroke = this.downTypeWas === 'pen' ? s : null; this.lastStrokeAt = performance.now(); this.draw(); this.changed(); } else this.drawLive();
      }
    };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
    c.addEventListener('contextmenu', e => e.preventDefault());
    // nothing on the sheet may be selected, dragged or pinched
    for (const t of ['selectstart', 'dragstart']) c.addEventListener(t, e => e.preventDefault());
  }

  cancelHold() { clearTimeout(this.holdT); this.holdId = null; }
  // a finger that stays down makes the line being drawn (or the one just finished, within 3 seconds) straight
  armStraight(e) {
    this.cancelHold();
    if (!pencil.straight || this.tool !== 'pen' || (e.width || 0) > 70 || (e.height || 0) > 70) return;
    const live = this.cur && this.down !== null && this.downType === 'pen', recent = !live && !this.cur && this.lastStroke && performance.now() - this.lastStrokeAt < 3000;
    if (!live && !recent) return;
    if (!live && this.touches.size > 0) return;
    const id = e.pointerId; this.holdId = id; this.holdXY = [e.clientX, e.clientY];
    this.holdT = setTimeout(() => {
      if (this.holdId !== id) return; this.holdId = null;
      if (live && this.cur && !this.straight) { const q = this.cur.p, n = q.length; this.cur.p = [q[0], q[1], q[n - 2], q[n - 1]]; this.straight = true; this.pred = null; this.queueLive(); }
      else if (!live && this.lastStroke && this.strokes.includes(this.lastStroke)) {
        const s = this.lastStroke, p = s.p; this.lastStroke = null; if (p.length < 6) return;
        this.hist.push(this.strokes.slice()); this.strokes = this.strokes.map(x => x === s ? { c: s.c, p: [p[0], p[1], p[p.length - 2], p[p.length - 1]] } : x); this.redoStack = []; this.draw(); this.changed();
      }
    }, live ? 150 : 250);
  }
  eraseAt(x, y) {
    const out = []; let changed = false;
    for (const s of this.strokes) { if (near(s, x, y)) { changed = true; out.push(...cutStroke(s, x, y)); } else out.push(s); }
    if (changed) { if (!this.erasedSnap) { this.hist.push(this.strokes.slice()); this.erasedSnap = true; } this.strokes = out; this.erased = true; this.redoStack = []; this.draw(); }
  }
  undo() { if (!this.hist.length) return; this.redoStack.push(this.strokes); this.strokes = this.hist.pop(); this.draw(); this.changed(); }
  redo() { if (!this.redoStack.length) return; this.hist.push(this.strokes); this.strokes = this.redoStack.pop(); this.draw(); this.changed(); }
  clear() {
    if (!this.strokes.length) return;
    if (!this.clearArmed) { this.clearArmed = true; this.refreshBar(); setTimeout(() => { this.clearArmed = false; this.refreshBar(); }, 2500); return; }
    this.clearArmed = false; this.hist.push(this.strokes); this.redoStack = []; this.strokes = []; this.refreshBar(); this.draw(); this.changed();
  }
  changed() { if (this.onChange) this.onChange(this.strokes.slice()); }
}
