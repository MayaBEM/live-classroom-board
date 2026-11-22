// Class countdown timer. The teacher starts it; everyone on the board sees the same countdown.
// State lives on the board row (boards.timer) and is measured against the server clock, so all screens agree.
import { h, modal, toast } from './util.js';
import { iconEl } from './icons.js';
import { friendlyError } from './db.js';

export const fmtClock = ms => {
  const s = Math.max(0, Math.ceil(ms / 1000)), hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60, p = n => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
};

let audioCtx = null;
export function beep(times = 3) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < times; i++) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t0 = audioCtx.currentTime + i * 0.45;
      o.type = 'square'; o.frequency.value = 880; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      o.connect(g); g.connect(audioCtx.destination); o.start(t0); o.stop(t0 + 0.32);
    }
  } catch (e) { /* sound is a bonus */ }
}

export class TimerController {
  constructor({ store, sb, isTeacher }) {
    Object.assign(this, { store, sb, isTeacher });
    this.handled = new Set();
    this.el = h('span', { class: 'tag timer', hidden: true, role: 'timer', 'aria-label': 'Time left' });
    this.unsub = store.on('board', () => this.refresh());
    this.iv = setInterval(() => this.tick(), 250);
    this.refresh();
  }
  destroy() { clearInterval(this.iv); this.unsub(); }

  get t() { return this.store.board && this.store.board.timer; }

  // milliseconds left, or null when no timer is set
  left() {
    const t = this.t; if (!t || t.state === 'idle') return null;
    if (t.state === 'paused') return t.left;
    return Math.max(0, t.end - this.store.serverNow());
  }

  refresh() { this.tick(true); }

  tick(force) {
    const t = this.t, left = this.left();
    if (left === null) { if (!this.el.hidden) this.el.hidden = true; return; }
    const over = t.state === 'running' && left <= 0, low = left <= 60000 && !over;
    const txt = over ? "Time is up" : fmtClock(left) + (t.state === 'paused' ? ' (paused)' : '');
    const cls = 'tag timer' + (over ? ' over' : low ? ' warn' : '');
    if (this.el.className !== cls) this.el.className = cls;
    if (this.last !== txt || force) { this.el.replaceChildren(iconEl('timer', 16), h('span', null, txt)); this.last = txt; }
    this.el.hidden = false;
    if (over && !this.handled.has(t.seq)) {
      this.handled.add(t.seq);
      if (this.store.serverNow() - t.end < 8000) { if (this.isTeacher) beep(); toast("Time is up.", 'bad'); }   // students see it, they do not hear it   // not for a timer that ended long ago
      if (this.isTeacher && t.lock) this.sb.from('boards').update({ locked: true }).eq('id', this.store.boardId).then(() => {});
    }
  }

  async save(timer) {
    this.store.board.timer = timer; this.store.emit('board');
    const { error } = await this.sb.from('boards').update({ timer }).eq('id', this.store.boardId);
    if (error) toast(friendlyError(error), 'bad');
  }

  start(min, lock) { const now = this.store.serverNow(); return this.save({ state: 'running', end: now + min * 60000, total: min * 60000, lock: !!lock, seq: now }); }
  pause() { const t = this.t; return this.save({ ...t, state: 'paused', left: this.left() }); }
  resume() { const t = this.t, now = this.store.serverNow(); return this.save({ ...t, state: 'running', end: now + t.left, seq: t.seq }); }
  addMinute() { const t = this.t; if (!t) return; return this.save(t.state === 'paused' ? { ...t, left: t.left + 60000 } : { ...t, end: t.end + 60000 }); }
  reset() { return this.save({ state: 'idle', seq: Date.now() }); }

  // ---- teacher's dialog
  dialog() {
    const t = this.t, running = t && t.state === 'running', paused = t && t.state === 'paused';
    let minutes = 10;
    const big = h('div', { class: 'timer-big', role: 'timer' });
    const custom = h('input', { class: 'input', id: 'tm', type: 'number', min: '1', max: '240', value: '10', inputmode: 'numeric', 'aria-label': 'Minutes', style: { width: '110px' } });
    const lock = h('input', { type: 'checkbox', id: 'tl', checked: !!(t && t.lock), disabled: !!(running || paused) });
    const presets = h('div', { class: 'seg presets', role: 'group', 'aria-label': 'Minutes' });
    const drawPresets = () => presets.replaceChildren(...[1, 2, 5, 10, 15, 20, 30, 45, 60].map(m => h('button', { type: 'button', 'aria-pressed': String(minutes === m), onclick: () => { minutes = m; custom.value = m; drawPresets(); } }, String(m))));
    custom.addEventListener('input', () => { minutes = Math.max(1, Math.min(240, parseInt(custom.value, 10) || 1)); drawPresets(); });
    drawPresets();
    const show = () => { const l = this.left(); big.textContent = l === null ? fmtClock(minutes * 60000) : fmtClock(l); };
    show(); const iv = setInterval(show, 500);
    const body = h('div', null,
      big,
      running || paused ? null : h('div', null, h('div', { class: 'label', style: { margin: '14px 0 6px' } }, 'Minutes'), presets, h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px' } }, h('label', { for: 'tm' }, 'or type'), custom)),
      h('label', { style: { display: 'flex', gap: '10px', alignItems: 'center', margin: '16px 0 4px', fontWeight: '500' } }, lock, 'Lock student writing when time is up'),
      h('p', { class: 'hint' }, 'Everyone on the board sees the countdown, and you hear a beep at the end. Students hear nothing. Locking happens while your screen is open.'));
    let m;
    const btn = (label, fn, cls = 'btn') => h('button', { class: cls, onclick: async () => { await fn(); m.close(); } }, label);
    const acts = running
      ? [btn('Pause', () => this.pause()), btn('+1 minute', () => this.addMinute()), btn('Stop and clear', () => this.reset(), 'btn danger')]
      : paused ? [btn('Resume', () => this.resume(), 'btn primary'), btn('+1 minute', () => this.addMinute()), btn('Stop and clear', () => this.reset(), 'btn danger')]
        : [h('button', { class: 'btn', onclick: () => m.close() }, 'Close'), btn('Start timer', () => this.start(minutes, lock.checked), 'btn primary')];
    m = modal({ title: 'Class timer', body, actions: acts, onClose: () => clearInterval(iv) });
  }
}
