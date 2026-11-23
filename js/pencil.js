// Which touches may write. Shared by the big board and the small idea board.
//  - A mouse always writes.
//  - An Apple Pencil (or any pen) always writes.
//  - A finger writes only when "Pencil only" is off. The device remembers if a pencil was ever used on it, and then turns "Pencil only" on by itself.
//    The teacher or student can still switch it either way with the Pencil only button.
//  - While a pen is touching the screen (and for a moment after), every finger is a resting hand and is ignored.
const KEY = 'bem-pencil';
let mode = 'auto';      // 'auto' | 'only' | 'any'
let seen = false;       // a pen has been used on this device
let lastPen = -1e9;     // when the pen last touched the screen (ms)
const listeners = new Set();
try { const m = localStorage.getItem(KEY + '-mode'); if (m === 'only' || m === 'any') mode = m; seen = localStorage.getItem(KEY + '-seen') === '1'; } catch (e) { /* private window: it just starts fresh each time */ }
const save = () => { try { localStorage.setItem(KEY + '-mode', mode); localStorage.setItem(KEY + '-seen', seen ? '1' : '0'); } catch (e) { /* fine */ } };
const tell = () => listeners.forEach(f => { try { f(); } catch (e) { /* fine */ } });

export const pencil = {
  // true: fingers must not write
  get only() { return mode === 'only' || (mode === 'auto' && seen); },
  // the pen touched the screen just now
  pen() {
    lastPen = performance.now();
    if (!seen) { seen = true; save(); if (mode === 'auto') tell(); }
  },
  // within ms of the pen touching, a finger is a resting hand
  recent(ms = 900) { return performance.now() - lastPen < ms; },
  toggle() { mode = this.only ? 'any' : 'only'; save(); tell(); return this.only; },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

// A quick tap with several fingers at once (down together, lifted quickly, hardly moving):
//  two fingers = undo, three fingers = redo.  up() tells how many fingers the tap had (2 or 3), or 0 when it was not a tap.
export class TwoFingerTap {
  constructor() { this.s = null; }
  reset() { this.s = null; }
  down(pts) {   // pts: Map of pointer id -> {x, y}, after the new finger was added
    const now = performance.now(), copy = () => new Map([...pts].map(([k, v]) => [k, { x: v.x, y: v.y }]));
    if (pts.size === 2) this.s = { t: now, n: 2, start: copy(), moved: false, done: false };
    else if (pts.size === 3 && this.s && this.s.n === 2 && !this.s.done && !this.s.moved && now - this.s.t < 160) this.s = { t: this.s.t, n: 3, start: copy(), moved: false, done: false };   // the third finger came right after the second
    else this.s = null;
  }
  move(id, x, y) { const s = this.s, p = s && s.start.get(id); if (p && Math.hypot(x - p.x, y - p.y) > 14) s.moved = true; }
  up(id) {
    const s = this.s; if (!s || !s.start.has(id)) return 0;
    const ok = !s.moved && !s.done && performance.now() - s.t < 350; s.done = true; return ok ? s.n : 0;
  }
}
