// Teacher's overview of an assignment: every student's current page, updating live. Click a card to open that student's copy.
import { h, toast, modal, debounce, asset } from './util.js';
import { iconEl } from './icons.js';
import { friendlyError } from './db.js';
import { BoardView } from './board.js';
import { PageRenderer } from './thumbs.js';
import { exportDialog } from './export.js';
import { openAddPages } from './pages.js';
import { TimerController } from './timer.js';
import { shareDialog } from './share.js';
import { boardRoster, boardStudentsDialog } from './members.js';
import { renameBoardDialog } from './pages.js';

const ONLINE_MS = 75000;
const fmtWhen = iso => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const toLocalInput = iso => { if (!iso) return ''; const d = new Date(iso), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

export class ReviewView {
  constructor({ sb, store, root, onExit }) {
    Object.assign(this, { sb, store, root, onExit });
    this.renderer = new PageRenderer(sb);
    this.filter = 'all'; this.pageChoice = 'current'; this.cards = new Map(); this.roster = []; this.view = null;
    this.queue = []; this.busy = 0;
  }

  async start() {
    const st = this.store;
    try {
      if (st.board.class_id) this.roster = (await boardRoster(this.sb, st.board)).map(r => r.first_name);
    } catch (e) { /* roster is optional */ }
    this.timerCtl = new TimerController({ store: st, sb: this.sb, isTeacher: true });
    this.unsubs = [
      st.on('objects', pids => this.onObjects(pids)),
      st.on('participants', () => this.onPeople()),
      st.on('board', () => this.renderHeader()),
      st.on('pages', () => { this.renderHeader(); this.refreshAll(); }),
      st.on('sync', s => { if (this.elStatus) this.elStatus.textContent = s === 'offline' ? 'Offline' : s === 'saving' ? 'Saving…' : 'Live'; }),
    ];
    this.tick = setInterval(() => this.onPeople(true), 15000);
    this.render();
  }

  destroy() {
    this.unsubs.forEach(u => u()); clearInterval(this.tick); if (this.timerCtl) this.timerCtl.destroy();
    if (this.view) { this.view.destroy(); this.view = null; }
    document.body.classList.remove('in-board');
    this.store.close();
  }

  // ----------------------------------------------------------------- people
  people() { return [...this.store.participantsMap.values()].sort((a, b) => a.name.localeCompare(b.name)); }
  isOnline(p) { return p.last_seen && Date.now() - Date.parse(p.last_seen) < ONLINE_MS; }
  statusOf(p) { return p.submitted_at ? 'submitted' : 'working'; }
  notJoined() {
    const have = new Set(this.people().map(p => p.name.toLowerCase()));
    return this.roster.filter(n => !have.has(n.toLowerCase())).sort((a, b) => a.localeCompare(b));
  }

  // ----------------------------------------------------------------- screen
  render() {
    document.body.classList.remove('in-board');
    this.cards.clear();
    this.elStatus = h('span', { class: 'status' }, 'Live');
    this.elHead = h('div', { class: 'rv-head' });
    this.elSummary = h('div', { class: 'rv-sum' });
    this.elTools = h('div', { class: 'rv-tools' });
    this.elGrid = h('div', { class: 'rv-grid' });
    this.root.replaceChildren(h('div', { class: 'dash rv' },
      h('div', { class: 'dash-top' }, h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
        h('button', { class: 'btn quiet sm', onclick: () => this.onExit(), 'aria-label': 'Back to my boards' }, iconEl('back', 18), 'Boards'),
        h('a', { class: 'brand', href: '#', 'aria-label': 'Bright EngMath' }, h('img', { class: 'mark', src: asset('img/logo-mark.png'), alt: '' }), h('img', { class: 'word', src: asset('img/logo-word.png'), alt: 'Bright EngMath' }))),
        this.elHead),
      h('main', { class: 'dash-main rv-main' }, this.elSummary, this.elTools, this.elGrid)));
    this.renderHeader(); this.renderTools(); this.renderGrid();
  }

  renderHeader() {
    const b = this.store.board;
    const due = b.due_at ? `Due ${fmtWhen(b.due_at)}` : 'No due date';
    this.elHead.replaceChildren(
      h('div', { class: 'rv-title' }, h('b', null, b.title), h('button', { class: 'btn quiet sm', title: 'Change the name', 'aria-label': 'Rename', onclick: () => renameBoardDialog({ sb: this.sb, board: this.store.board, onSaved: () => this.renderHeader() }) }, iconEl('pen', 16)), h('span', { class: 'tag' }, 'Assignment'), h('span', { class: 'tag' + (b.due_at && new Date(b.due_at) < Date.now() ? ' warn' : '') }, due), this.timerCtl.el, this.elStatus),
      h('div', { class: 'rv-acts' },
        h('button', { class: 'btn sm' + (b.locked ? ' on' : ''), onclick: () => this.toggleLock() }, iconEl(b.locked ? 'lock' : 'unlock', 18), b.locked ? 'Writing locked' : 'Lock writing'),
        h('button', { class: 'btn sm', title: 'Class timer', 'aria-label': 'Class timer', onclick: () => this.timerCtl.dialog() }, iconEl('timer', 18), h('span', { class: 'rv-lbl' }, 'Timer')),
        h('button', { class: 'btn sm', title: 'Start and due time', 'aria-label': 'Start and due time', onclick: () => this.datesDialog() }, iconEl('file', 18), h('span', { class: 'rv-lbl' }, 'Dates')),
        b.class_id ? h('button', { class: 'btn sm', title: 'Choose which students this board is for', 'aria-label': 'Students of this board', onclick: () => this.studentsDialog() }, iconEl('plus', 18), h('span', { class: 'rv-lbl' }, 'Students')) : null,
        h('button', { class: 'btn sm', title: 'Share with students', 'aria-label': 'Share with students', onclick: () => this.shareDialog() }, iconEl('share', 18), h('span', { class: 'rv-lbl' }, 'Share')),
        h('button', { class: 'btn sm', onclick: () => openAddPages({ sb: this.sb, boardId: this.store.boardId, pages: this.store.pages, onDone: () => { this.store.resync(); this.store.sendResync(); } }) }, iconEl('plus', 18), h('span', { class: 'rv-lbl' }, 'Add pages')),
        h('button', { class: 'btn sm primary', onclick: () => this.exportClass() }, iconEl('file', 18), 'Export class PDF')));
  }

  renderSummary() {
    const ps = this.people(), sub = ps.filter(p => p.submitted_at).length, on = ps.filter(p => !p.submitted_at && this.isOnline(p)).length;
    const nj = this.notJoined().length;
    const item = (n, label) => h('div', { class: 'rv-stat' }, h('b', null, n), h('span', null, label));
    this.elSummary.replaceChildren(item(ps.length, 'joined'), item(sub, 'submitted'), item(on, 'working now'), item(ps.length - sub - on, 'not submitted'), nj ? item(nj, 'not joined yet') : null);
  }

  renderTools() {
    const f = [['all', 'Everyone'], ['submitted', 'Submitted'], ['working', 'Not submitted']];
    const opts = [h('option', { value: 'current' }, "Each student's current page"), ...this.store.pages.map((p, i) => h('option', { value: String(i) }, `Page ${i + 1}`))];
    const sel = h('select', { class: 'select', 'aria-label': 'Which page to show', style: { width: 'auto', minHeight: '44px' }, onchange: e => { this.pageChoice = e.target.value; this.refreshAll(); } }, opts);
    sel.value = this.pageChoice;
    this.elTools.replaceChildren(
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter students' }, f.map(([k, label]) => h('button', { type: 'button', 'aria-pressed': String(this.filter === k), onclick: () => { this.filter = k; this.renderTools(); this.renderGrid(); } }, label))),
      h('label', { class: 'rv-sel' }, h('span', null, 'Show'), sel));
  }

  pageFor(p) {
    const ps = this.store.pages; if (!ps.length) return null;
    if (this.pageChoice === 'current') return ps[Math.min(ps.length - 1, Math.max(0, (p.cur_page || 1) - 1))];
    return ps[parseInt(this.pageChoice, 10)] || ps[0];
  }

  renderGrid() {
    this.renderSummary();
    const ps = this.people().filter(p => this.filter === 'all' || this.statusOf(p) === this.filter);
    const nodes = [];
    for (const p of ps) {
      let c = this.cards.get(p.id);
      if (!c) c = this.makeCard(p);
      this.updateCard(c, p); nodes.push(c.el);
    }
    for (const id of [...this.cards.keys()]) if (!ps.some(p => p.id === id)) this.cards.delete(id);
    if (this.filter === 'all') for (const n of this.notJoined()) nodes.push(h('button', { class: 'rv-card ghost', title: `Open ${n}'s copy before they join`, onclick: () => this.openGhost(n) }, h('div', { class: 'rv-name' }, h('b', null, n), h('span', { class: 'rv-state' }, 'Not started')), h('p', { class: 'hint' }, 'Has not joined yet. Click to open their copy and write on it first.')));
    this.elGrid.replaceChildren(...(nodes.length ? nodes : [h('div', { class: 'empty' }, this.people().length ? 'No students match this filter.' : h('span', null, h('b', null, 'No students yet. '), 'Press Share and send the link or the code. Each student gets their own private copy of every page, and you will see their writing here as they work.'))]));
  }

  makeCard(p) {
    const cv = h('canvas', { width: 420, height: 300 });
    const name = h('b', { class: 'nm' }), state = h('span', { class: 'rv-state' }), score = h('span', { class: 'tag', hidden: true }), pg = h('span', { class: 'hint' });
    const el = h('button', { class: 'rv-card', 'aria-label': `Open ${p.name}'s work`, onclick: () => this.openStudent(p.id) },
      h('div', { class: 'rv-name' }, name, state), h('div', { class: 'rv-thumb' }, cv), h('div', { class: 'rv-foot' }, pg, score));
    const c = { el, cv, name, state, score, pg, page: null, done: false };
    this.cards.set(p.id, c);
    if (!this.io) this.io = new IntersectionObserver(es => { for (const en of es) { const c2 = [...this.cards.values()].find(x => x.el === en.target); if (c2) { c2.visible = en.isIntersecting; if (en.isIntersecting && !c2.done) this.queueCard(c2); } } }, { rootMargin: '200px' });
    this.io.observe(el);
    return c;
  }

  updateCard(c, p) {
    c.name.textContent = p.name;
    const sub = !!p.submitted_at, on = this.isOnline(p);
    c.state.className = 'rv-state ' + (sub ? 'sub' : on ? 'on' : '');
    c.state.textContent = sub ? 'Submitted' : on ? 'Working' : 'Not submitted';
    c.score.hidden = !p.score; c.score.textContent = p.score ? `Score ${p.score}` : '';
    const pg = this.pageFor(p); const idx = pg ? this.store.pages.indexOf(pg) + 1 : 0;
    c.pg.textContent = pg ? `Page ${idx}` : '';
    if (c.page !== pg) { c.page = pg; c.done = false; }
    c.pid = p.id;
    if (!c.done && c.visible) this.queueCard(c);
  }

  queueCard(c) { if (!this.queue.includes(c)) this.queue.push(c); this.pump(); }
  async pump() {
    while (this.busy < 2 && this.queue.length) {
      const c = this.queue.shift(); this.busy++;
      this.draw(c).catch(() => {}).finally(() => { this.busy--; this.pump(); });
    }
  }
  async draw(c) {
    const pg = c.page; if (!pg) return;
    c.cv.height = Math.round(c.cv.width * pg.h / 1000);
    await this.renderer.draw(c.cv, pg, this.store.pageObjects(pg.id, c.pid));
    c.done = true;
  }

  refreshAll() { for (const c of this.cards.values()) c.done = false; this.renderTools(); this.renderGrid(); for (const c of this.cards.values()) if (c.visible) this.queueCard(c); }

  onObjects(pids) {
    if (this.view) return;
    if (!this._objSoon) this._objSoon = debounce(() => { for (const c of this.cards.values()) { if (c.page && this._pids && this._pids.has(c.page.id)) { c.done = false; if (c.visible) this.queueCard(c); } } this._pids = new Set(); }, 700);
    this._pids = this._pids || new Set(); pids.forEach(x => this._pids.add(x));
    this._objSoon();
  }

  onPeople() {
    if (this.view) return;
    const ids = this.people().map(p => p.id).join();
    if (ids !== this._ids) { this._ids = ids; this.renderGrid(); return; }
    for (const p of this.people()) { const c = this.cards.get(p.id); if (c) this.updateCard(c, p); }
    this.renderSummary();
    if (this.filter !== 'all') this.renderGrid();
  }

  // ----------------------------------------------------------------- one student
  openStudent(pid) {
    const list = this.people().filter(p => this.filter === 'all' || this.statusOf(p) === this.filter), idx = Math.max(0, list.findIndex(p => p.id === pid));
    const p = this.store.participantsMap.get(pid); if (!p) return;
    const c = this.cards.get(pid), pageId = c && c.page ? c.page.id : null;
    this.show(pid, list, idx, pageId);
  }

  show(pid, list, idx, pageId) {
    if (this.view) { this.view.destroy(); this.view = null; }
    const p = this.store.participantsMap.get(pid);
    this.store.scopeId = pid; this.store.cache.clear();
    const go = d => { const n = list[(idx + d + list.length) % list.length]; if (n) this.show(n.id, list, list.indexOf(n), this.view && this.view.pageId); };
    this.view = new BoardView({
      sb: this.sb, store: this.store, role: 'teacher', root: this.root, embedded: true, renderer: this.renderer,
      onExit: () => this.onExit(),
      studentNav: { name: p.name, index: idx, count: list.length, prev: () => go(-1), next: () => go(1), back: () => this.backToGrid() },
    });
    this.view.start();
    if (pageId && this.store.pages.some(x => x.id === pageId)) this.view.setPage(pageId);
    this.view.setTool('pen');
  }

  backToGrid() {
    if (this.view) { this.view.destroy(); this.view = null; }
    this.store.scopeId = null; this.store.cache.clear();
    this.render(); this.refreshAll();
  }

  // a student who has not joined yet: make their copy so the teacher can already write on it (the student takes it over with their code)
  async openGhost(name) {
    try {
      const { data: { user } } = await this.sb.auth.getUser();
      const { data, error } = await this.sb.from('participants').insert({ board_id: this.store.boardId, user_id: user.id, name }).select().single();
      if (error) throw error;
      this.store.participantsMap.set(data.id, data); this._ids = null; this.openStudent(data.id);
    } catch (e) { toast(friendlyError(e), 'bad'); }
  }

  // ----------------------------------------------------------------- actions
  async toggleLock() {
    const b = this.store.board, val = !b.locked; b.locked = val; this.renderHeader();
    const { error } = await this.sb.from('boards').update({ locked: val }).eq('id', b.id);
    if (error) { b.locked = !val; this.renderHeader(); toast(friendlyError(error), 'bad'); } else toast(val ? 'Everyone is locked out of writing.' : 'Students can write again.');
  }

  studentsDialog() {
    return boardStudentsDialog({ sb: this.sb, board: this.store.board, onSaved: async () => {
      try { this.roster = (await boardRoster(this.sb, this.store.board)).map(r => r.first_name); } catch (e) { /* keep the old list */ }
      this.onPeople(true);
    } });
  }
  shareDialog() { return shareDialog({ sb: this.sb, store: this.store }); }

  datesDialog() {
    const b = this.store.board;
    const start = h('input', { class: 'input', id: 'sd', type: 'datetime-local', value: toLocalInput(b.starts_at) });
    const due = h('input', { class: 'input', id: 'dd', type: 'datetime-local', value: toLocalInput(b.due_at) });
    const err = h('p', { class: 'error', role: 'alert' });
    const m = modal({
      title: 'Start and due time',
      body: h('div', null,
        h('div', { class: 'field' }, h('label', { for: 'sd' }, 'Opens at (optional)'), start, h('span', { class: 'hint' }, 'Before this time students cannot open the assignment.')),
        h('div', { class: 'field' }, h('label', { for: 'dd' }, 'Due at (optional)'), due, h('span', { class: 'hint' }, 'After this time students can still look at their work but cannot change it.')), err),
      actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => {
        const s = start.value ? new Date(start.value).toISOString() : null, d = due.value ? new Date(due.value).toISOString() : null;
        if (s && d && new Date(d) <= new Date(s)) { err.textContent = 'The due time must be after the start time.'; return; }
        const { error } = await this.sb.from('boards').update({ starts_at: s, due_at: d }).eq('id', b.id);
        if (error) { err.textContent = friendlyError(error); return; }
        b.starts_at = s; b.due_at = d; this.renderHeader(); m.close(); toast('Saved.', 'ok');
      } }, 'Save')],
    });
  }

  exportClass() {
    const ps = this.people();
    if (!ps.length) return toast('No students have joined yet.');
    exportDialog({ sb: this.sb, store: this.store, students: ps, renderer: this.renderer, label: 'class' });
  }
}
