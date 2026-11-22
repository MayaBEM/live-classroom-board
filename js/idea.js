// The small idea board: a 2:1 sheet where a student writes or draws anything for the teacher, and the teacher can write back over it.
// Strokes are kept as small numbers (0..1000 across and down), so the picture looks the same at any size.
import { h } from './util.js';
import { iconEl } from './icons.js';

export const STUDENT_INK = ['#1D2127', '#1F5FBF', '#D62F2F', '#1F8A4C'];
export const TEACHER_INK = '#7B2CBF';

const ERASE_R = 34;      // how close the eraser must be to a line (out of 1000)
const MIN_STEP = 3;      // ignore points closer than this (out of 1000)
const MAX_POINTS = 4000; // one stroke never gets longer than this many numbers

function drawStrokes(ctx, strokes, inks, W, H, widthPx) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = widthPx;
  for (const s of strokes) {
    const p = s.p || []; if (p.length < 2) continue;
    ctx.strokeStyle = Array.isArray(inks) ? (inks[s.c] || inks[0]) : inks;
    ctx.fillStyle = ctx.strokeStyle;
    if (p.length === 2) { ctx.beginPath(); ctx.arc(p[0] / 1000 * W, p[1] / 1000 * H, widthPx / 2, 0, Math.PI * 2); ctx.fill(); continue; }
    ctx.beginPath(); ctx.moveTo(p[0] / 1000 * W, p[1] / 1000 * H);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i] / 1000 * W, p[i + 1] / 1000 * H);
    ctx.stroke();
  }
}

const near = (s, x, y) => {
  const p = s.p; if (!p) return false;
  for (let i = 0; i < p.length; i += 2) { const dx = p[i] - x, dy = p[i + 1] - y; if (dx * dx + dy * dy < ERASE_R * ERASE_R) return true; }
  return false;
};

// opts: { strokes, other, ink (array for students, one colour for the teacher), otherInk, onChange(strokes), readonly, label, compact }
export class IdeaBoard {
  constructor(opts = {}) {
    Object.assign(this, { strokes: [], other: [], ink: STUDENT_INK, otherInk: TEACHER_INK, readonly: false, onChange: null, label: '', compact: false }, opts);
    this.strokes = (this.strokes || []).slice(); this.other = (this.other || []).slice();
    this.tool = 'pen'; this.colour = 0; this.cur = null; this.down = null; this.lastPen = 0; this.clearArmed = false;
    this.canvas = h('canvas', { class: 'idea-canvas', 'aria-label': this.label || 'Drawing board', role: 'img' });
    this.ctx = this.canvas.getContext('2d');
    this.bar = this.readonly ? null : this.buildBar();
    this.el = h('div', { class: 'idea-board' + (this.compact ? ' compact' : '') }, this.bar, h('div', { class: 'idea-sheet' }, this.canvas));
    if (!this.readonly) this.attach();
    if (window.ResizeObserver) { this.ro = new ResizeObserver(() => this.draw()); this.ro.observe(this.canvas); }
    setTimeout(() => this.draw(), 0);
  }

  buildBar() {
    const mk = (cls, label, icon, fn) => h('button', { type: 'button', class: 'ib ' + cls, 'aria-label': label, title: label, onclick: fn }, iconEl(icon, 16));
    this.btnPen = mk('pen', 'Pen', 'pen', () => { this.tool = 'pen'; this.refreshBar(); });
    this.btnErase = mk('erase', 'Eraser', 'eraser', () => { this.tool = 'eraser'; this.refreshBar(); });
    this.btnUndo = mk('undo', 'Undo', 'undo', () => this.undo());
    this.btnClear = mk('clear', 'Clear my writing', 'trash', () => this.clear());
    this.dots = Array.isArray(this.ink) ? this.ink.map((c, i) => { const d = h('button', { type: 'button', class: 'ib dot', 'aria-label': 'Colour ' + (i + 1), onclick: () => { this.colour = i; this.tool = 'pen'; this.refreshBar(); } }); d.style.setProperty('--c', c); return d; }) : [];
    const bar = h('div', { class: 'idea-bar' }, this.label ? h('span', { class: 'idea-label' }, this.label) : null, this.btnPen, this.dots, this.btnErase, this.btnUndo, this.btnClear);
    this.refreshBar(bar);
    return bar;
  }

  refreshBar() {
    if (!this.btnPen) return;
    this.btnPen.setAttribute('aria-pressed', String(this.tool === 'pen')); this.btnErase.setAttribute('aria-pressed', String(this.tool === 'eraser'));
    this.dots.forEach((d, i) => d.setAttribute('aria-pressed', String(this.tool === 'pen' && this.colour === i)));
    this.btnClear.classList.toggle('armed', this.clearArmed);
    this.btnClear.setAttribute('aria-label', this.clearArmed ? 'Tap again to clear' : 'Clear my writing');
  }

  // ---- drawing on screen
  draw() {
    const c = this.canvas, r = c.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height));
    if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; }
    const ctx = this.ctx; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#DCE6F2'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 1; i < 4; i++) { const y = Math.round(H * i / 4) + .5; ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    const wpx = Math.max(1.6, 2.4 * W / 250);
    drawStrokes(ctx, this.other, this.otherInk, W, H, wpx);
    drawStrokes(ctx, this.strokes, this.ink, W, H, wpx);
    if (this.cur) drawStrokes(ctx, [this.cur], this.ink, W, H, wpx);
  }

  setOther(list) { this.other = (list || []).slice(); this.draw(); }
  setStrokes(list) { if (this.down) return; this.strokes = (list || []).slice(); this.draw(); }
  empty() { return !this.strokes.length; }
  destroy() { if (this.ro) this.ro.disconnect(); }

  // ---- touch and pen
  pos(e) { const r = this.canvas.getBoundingClientRect(); return [Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * 1000), Math.round(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) * 1000)]; }

  attach() {
    const c = this.canvas;
    c.addEventListener('pointerdown', e => {
      if (e.pointerType === 'pen') this.lastPen = performance.now();
      else if (e.pointerType === 'touch' && performance.now() - this.lastPen < 1500) return;     // a resting palm
      if (this.down !== null && performance.now() - this.downAt < 8000) return;                  // one finger at a time
      e.preventDefault(); this.down = e.pointerId; this.downAt = performance.now(); this.clearArmed = false; this.refreshBar();
      try { c.setPointerCapture(e.pointerId); } catch (x) { /* fine */ }
      const [x, y] = this.pos(e);
      if (this.tool === 'eraser') { this.erased = false; this.eraseAt(x, y); }
      else { this.cur = { c: this.colour, p: [x, y] }; this.draw(); }
    });
    c.addEventListener('pointermove', e => {
      if (this.down !== e.pointerId) return; e.preventDefault();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of (evs.length ? evs : [e])) {
        const [x, y] = this.pos(ev);
        if (this.tool === 'eraser') this.eraseAt(x, y);
        else if (this.cur) { const p = this.cur.p, dx = x - p[p.length - 2], dy = y - p[p.length - 1]; if (dx * dx + dy * dy >= MIN_STEP * MIN_STEP && p.length < MAX_POINTS) p.push(x, y); }
      }
      if (this.tool !== 'eraser') this.draw();
    });
    const end = e => {
      if (this.down !== e.pointerId) return;
      this.down = null;
      if (this.tool === 'eraser') { if (this.erased) this.changed(); }
      else if (this.cur) { this.strokes.push(this.cur); this.cur = null; this.draw(); this.changed(); }
    };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
    c.addEventListener('contextmenu', e => e.preventDefault());
  }

  eraseAt(x, y) {
    const keep = this.strokes.filter(s => !near(s, x, y));
    if (keep.length !== this.strokes.length) { this.strokes = keep; this.erased = true; this.draw(); }
  }
  undo() { if (!this.strokes.length) return; this.strokes.pop(); this.draw(); this.changed(); }
  clear() {
    if (!this.strokes.length) return;
    if (!this.clearArmed) { this.clearArmed = true; this.refreshBar(); setTimeout(() => { this.clearArmed = false; this.refreshBar(); }, 2500); return; }
    this.clearArmed = false; this.strokes = []; this.refreshBar(); this.draw(); this.changed();
  }
  changed() { if (this.onChange) this.onChange(this.strokes.slice()); }
}
