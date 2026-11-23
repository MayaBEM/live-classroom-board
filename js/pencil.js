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

// a two-finger tap (both fingers down together, lifted quickly, hardly moving) means "undo"
export class TwoFingerTap {
  constructor() { this.s = null; }
  reset() { this.s = null; }
  down(pts) {   // pts: Map of pointer id -> {x, y}, after the new finger was added
    this.s = pts.size === 2 ? { t: performance.now(), start: new Map([...pts].map(([k, v]) => [k, { x: v.x, y: v.y }])), moved: false, done: false } : null;
  }
  move(id, x, y) { const s = this.s, p = s && s.start.get(id); if (p && Math.hypot(x - p.x, y - p.y) > 14) s.moved = true; }
  up(id) {      // true when this lift completes a tap
    const s = this.s; if (!s || !s.start.has(id)) return false;
    const ok = !s.moved && !s.done && performance.now() - s.t < 350; s.done = true; return ok;
  }
}
