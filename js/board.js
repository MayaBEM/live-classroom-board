// The board screen: page view, drawing tools, live sync, follow-me, lock, laser, panels.
import { h, uuid, clamp, debounce, throttle, toast, modal, confirmDialog, copyText, asset, joinUrl, BASE } from './util.js';
import { icon, iconEl } from './icons.js';
import { drawObject, drawObjects, drawPatternBase, hit, bounds, simplify, layoutText,
  PEN_COLORS, HL_COLORS, PEN_SIZES, HL_SIZES, TEXT_SIZES, FONT, TEXT_LH, STAMPS, STAMP_SIZES, STUDENT_ASSIGN_COLORS } from './render.js';
import { renderPdfPage, getImage, pdfPageMm } from './pdf.js';
import { Instruments } from './instruments.js';
import { TimerController } from './timer.js';
import { PageRenderer } from './thumbs.js';
import { exportDialog } from './export.js';
import { shareDialog } from './share.js';
import { CONFIG } from '../config.js';
import { friendlyError } from './db.js';
import { openAddPages } from './pages.js';

const TOOLS = [
  ['move', 'Move', 'move'], ['pen', 'Pen', 'pen'], ['highlighter', 'Highlight', 'highlighter'], ['text', 'Text', 'text'],
  ['line', 'Line', 'line'], ['arrow', 'Arrow', 'arrow'], ['rect', 'Box', 'rect'], ['ellipse', 'Circle', 'ellipse'],
  ['stamp', 'Stamp', 'check'], ['eraser', 'Eraser', 'eraser'], ['laser', 'Laser', 'laser'],
];
const fmtWhen = iso => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const SHAPES = new Set(['line', 'arrow', 'rect', 'ellipse']);
const MIN_S = 0.12, MAX_S = 8;

export class BoardView {
  // embedded: the review screen owns the store; studentNav: { name, index, count, prev(), next(), back() } for a teacher looking at one student's copy
  constructor({ sb, store, role, root, onExit, code, embedded = false, renderer = null, studentNav = null }) {
    Object.assign(this, { sb, store, role, root, onExit, code, embedded, studentNav });
    this.isTeacher = role === 'teacher';
    this.assign = store.mode === 'assignment';
    this.review = this.isTeacher && this.assign;        // teacher looking at one student's copy
    this.copy = !this.isTeacher && this.assign;         // a student's own copy
    this.renderer = renderer || new PageRenderer(sb);
    this.pageMm = {}; this.instr = new Instruments(this, state => this.onInstrChange(state));
    this.stampKind = 'check'; this.lastFeedbackToast = 0;
    this.tool = 'pen'; this.color = this.review ? '#D62F2F' : PEN_COLORS[0][1]; this.hlColor = HL_COLORS[0][1]; this.sizeIdx = 1;
    this.pageId = null; this.view = { s: 1, tx: 0, ty: 0 }; this.q = 1; this.autoFit = true;
    this.undoStack = []; this.redoStack = []; this.pointers = new Map();
    this.ghosts = new Map(); this.laserPts = []; this.cur = null; this.editor = null; this.hiddenId = null;
    this.following = false; this.followSeq = null; this.online = new Map(); this.panel = null; this.focusPerson = null;
    this.penSeen = false; this.baseTok = 0; this.thumbs = new Map(); this.thumbQueue = []; this.thumbBusy = 0;
    this.participants = []; this.spaceDown = false;
  }

  // ===================================================================== build
  start() {
    document.body.classList.add('in-board');
    window.__bem = this;
    this.buildUI();
    const st = this.store;
    this.instr.attach(this.overlay);
    this.timerCtl = new TimerController({ store: st, sb: this.sb, isTeacher: this.isTeacher });
    this.renderTop(); this.renderRail(); this.renderOpts(); this.placePop();
    this.ro2 = new ResizeObserver(() => this.placePop()); this.ro2.observe(this.elTop);
    this.unsubs = [
      st.on('objects', (pids, id) => this.onObjects(pids, id)),
      st.on('pages', () => this.onPages()),
      st.on('board', () => this.onBoard()),
      st.on('sync', s => this.renderStatus(s)),
      st.on('live', p => this.onLive(p)),
      st.on('laser', p => this.onLaser(p)),
      st.on('view', v => this.onRemoteView(v)),
      st.on('presence', s => this.onPresence(s)),
      st.on('participants', () => { if (this.panel === 'people') this.loadPeople(); if (this.review) { this.updateTopState(); } }),
      st.on('me', () => this.onMe()),
      st.on('instr', p => { if (!this.isTeacher) this.instr.setRemote(p); }),
      st.on('denied', () => toast(st.board && st.board.locked ? 'Writing is locked by your teacher.' : 'That change was not saved.', 'bad')),
      st.on('removed', () => this.showRemoved()),
    ];
    this.ro = new ResizeObserver(() => this.onResize());
    this.ro.observe(this.stage);
    this.keyHandler = e => this.onKey(e); this.keyUp = e => { if (e.code === 'Space') this.spaceDown = false; };
    document.addEventListener('keydown', this.keyHandler); document.addEventListener('keyup', this.keyUp);
    const first = st.pages[0];
    if (first) this.setPage(first.id);
    else this.showEmpty();
    this.onBoard(true);
    st.track({ name: st.name, role: this.role, page: first ? 1 : null });
    if (this.review) st.watchStudent(st.scopeId);
    if (this.copy) { const me0 = st.me || {}; this.prevMe = { score: me0.score, comment: me0.comment }; st.curPage = first ? 1 : null; this.lockTimer = setInterval(() => this.tickLock(), 20000); this.lastLock = this.lockReason(); }
  }

  destroy() {
    document.body.classList.remove('in-board');
    this.unsubs.forEach(u => u()); this.ro.disconnect(); if (this.ro2) this.ro2.disconnect();
    document.removeEventListener('keydown', this.keyHandler); document.removeEventListener('keyup', this.keyUp);
    clearInterval(this.tick); clearInterval(this.lockTimer); clearInterval(this.shareTimer);
    this.instr.detach(); this.timerCtl.destroy();
    if (this.review) this.store.unwatch();
    if (!this.embedded) this.store.close();
  }

  buildUI() {
    this.tbLeft = h('div', { class: 'tb-left' }); this.tbRight = h('div', { class: 'tb-right' });
    this.elRail = h('nav', { class: 'tb-tools', 'aria-label': 'Tools' });
    this.elTop = h('header', { class: 'b-top' + (this.review ? ' wide-wrap' : '') }, this.tbLeft, this.elRail, this.tbRight);
    this.elOpts = h('div', { class: 'b-pop', hidden: true });
    this.sheet = h('div', { class: 'sheet' });
    this.cBase = h('canvas'); this.cInk = h('canvas'); this.cLive = h('canvas');
    this.overlay = h('div', { class: 'overlay' });
    this.loadingEl = h('div', { class: 'loading', hidden: true }, 'Loading page…');
    this.sheet.append(this.cBase, this.cInk, this.cLive, this.overlay, this.loadingEl);
    this.banner = h('div', { class: 'banner', hidden: true });
    this.zoomPill = h('div', { class: 'zoom-pill' }, ...this.navControls());
    this.stage = h('main', { class: 'b-stage', 'aria-label': 'Page' }, this.sheet, this.banner, this.zoomPill);
    this.elSide = h('aside', { class: 'b-side' });
    this.el = h('div', { class: 'board side-closed' }, this.elTop, this.stage, this.elSide, this.elOpts);
    this.root.replaceChildren(this.el);

    const s = this.stage;
    s.addEventListener('pointerdown', e => this.onDown(e));
    s.addEventListener('pointermove', e => this.onMove(e));
    s.addEventListener('pointerup', e => this.onUp(e));
    s.addEventListener('pointercancel', e => this.onUp(e, true));
    s.addEventListener('pointerleave', e => { if (this.tool === 'laser' && this.isTeacher && !this.pointers.size) this.store.sendLaser({ page: this.pageId, off: true }); });
    s.addEventListener('wheel', e => this.onWheel(e), { passive: false });
    s.addEventListener('contextmenu', e => e.preventDefault());
    this.tick = setInterval(() => this.renderStatusTime(), 5000);
  }

  // ----------------------------------------------------------------- top bar
  renderTop() {
    const st = this.store, L = [], Rt = [];
    const brand = h('span', { class: 'brand' }, h('img', { class: 'mark', src: asset('img/logo-mark.png'), alt: '' }), h('img', { class: 'word', src: asset('img/logo-word.png'), alt: 'Bright EngMath' }));
    const tb = (ic, label, fn, cls = '') => h('button', { class: 'tbtn ' + cls, title: label, 'aria-label': label, onclick: fn }, iconEl(ic, 22), h('span', { class: 'lbl' }, label));
    this.elStatus = h('span', { class: 'status', role: 'status' }, 'Saved');
    this.elFollowTag = h('span', { class: 'tag', hidden: true });
    this.elLockTag = h('span', { class: 'tag warn', hidden: true });
    this.btnBackToTeacher = h('button', { class: 'btn primary sm', hidden: true, onclick: () => this.rejoinTeacher() }, iconEl('follow', 18), h('span', { class: 'lbl' }, 'Back to teacher'));
    this.btnPages = tb('pages', 'Pages', () => this.togglePanel('pages'));

    if (this.review) {
      const nav = this.studentNav;
      L.push(tb('back', 'Back to the class overview', () => nav.back()), brand,
        h('button', { class: 'tbtn', 'aria-label': 'Previous student', title: 'Previous student', disabled: nav.count < 2, onclick: () => nav.prev() }, iconEl('left', 20)),
        h('span', { class: 'title', title: nav.name }, nav.name),
        h('button', { class: 'tbtn', 'aria-label': 'Next student', title: 'Next student', disabled: nav.count < 2, onclick: () => nav.next() }, iconEl('right', 20)),
        this.elStatus);
      this.elStudentTag = h('span', { class: 'tag' });
      this.btnScore = h('button', { class: 'btn sm primary', onclick: () => this.scoreDialog() }, iconEl('check', 18), h('span', { class: 'lbl' }, 'Score and comment'));
      this.btnExport = tb('file', 'Export PDF', () => this.exportThis());
      Rt.push(this.elStudentTag, this.btnScore, this.btnExport, this.btnPages);
    } else if (this.copy) {
      this.elDueTag = h('span', { class: 'tag', hidden: true });
      this.elScoreTag = h('span', { class: 'tag', hidden: true });
      this.btnFeedback = h('button', { class: 'tbtn', hidden: true, title: 'Teacher comment', 'aria-label': 'Teacher comment', onclick: () => this.feedbackDialog() }, iconEl('file', 22));
      this.btnSubmit = h('button', { class: 'btn primary sm', onclick: () => this.submitWork() }, iconEl('check', 18), h('span', { class: 'lbl' }, 'Submit'));
      L.push(brand, h('span', { class: 'title', title: st.board.title }, st.board.title), this.elStatus);
      Rt.push(this.elDueTag, this.elScoreTag, this.btnFeedback, this.elLockTag, this.btnSubmit, this.btnPages);
    } else {
      this.elLockTag.append(iconEl('lock', 16), h('span', { class: 'lbl long' }, 'Writing is locked'), h('span', { class: 'lbl short' }, 'Locked'));
      if (this.isTeacher) L.push(tb('back', 'Back to my boards', () => this.onExit()));
      L.push(brand, h('span', { class: 'title', title: st.board.title }, st.board.title), this.elStatus);
      Rt.push(this.elFollowTag, this.btnBackToTeacher, this.elLockTag);
      if (this.isTeacher) {
        this.btnFollow = tb('follow', 'Follow me', () => this.toggleFollow()); this.btnFollow.setAttribute('aria-pressed', 'false'); this.btnFollow.title = 'Follow me: students see the page and zoom you are looking at';
        this.btnLock = tb('lock', 'Lock writing', () => this.toggleLock()); this.btnLock.setAttribute('aria-pressed', 'false');
        this.btnClear = tb('clear', 'Clear the board', () => this.clearDialog());
        this.btnShare = tb('share', 'Share with students', () => this.shareDialog());
        this.btnPeople = h('button', { class: 'tbtn', title: 'People', 'aria-label': 'People', onclick: () => this.togglePanel('people') }, iconEl('people', 22), h('b', { class: 'cnt' }, '0'));
        this.btnTimer = tb('timer', 'Class timer', () => this.timerCtl.dialog());
        Rt.push(this.btnFollow, this.btnLock, this.btnClear, h('span', { class: 'tsep' }), this.btnPeople, this.btnTimer, this.btnShare);
      }
      Rt.push(this.btnPages);
    }
    L.splice(L.indexOf(this.elStatus) + 1, 0, this.timerCtl.el);
    this.tbLeft.replaceChildren(...L); this.tbRight.replaceChildren(...Rt);
    this.renderStatus(st.sync);
    this.updateTopState();
  }

  // why a student cannot write right now ('' = can write)
  lockReason() {
    const b = this.store.board, me = this.store.me;
    if (!b || this.isTeacher) return '';
    if (this.assign) {
      if (me && me.submitted_at) return 'submitted';
      if (b.locked) return 'locked';
      if (b.starts_at && new Date(b.starts_at) > Date.now()) return 'notstarted';
      if (b.due_at && new Date(b.due_at) < Date.now()) return 'pastdue';
      return '';
    }
    return b.locked ? 'locked' : '';
  }

  updateTopState() {
    const b = this.store.board; if (!b) return;
    const f = b.follow || {};
    if (this.review) {
      const p = this.store.participantsMap.get(this.store.scopeId) || {};
      const online = p.last_seen && Date.now() - Date.parse(p.last_seen) < 75000;
      this.elStudentTag.className = 'tag' + (p.submitted_at ? '' : ' warn');
      this.elStudentTag.textContent = p.submitted_at ? `Submitted ${fmtWhen(p.submitted_at)}` : (online ? 'Working now' : 'Not submitted');
      this.btnScore.querySelector('.lbl').textContent = p.score ? `Score ${p.score}` : 'Score and comment';
    } else if (this.copy) {
      const me = this.store.me || {}, why = this.lockReason();
      const names = { submitted: 'Submitted', locked: 'Writing is locked', pastdue: 'Past due', notstarted: 'Not open yet' };
      this.elLockTag.hidden = !why || why === 'submitted';
      this.elLockTag.replaceChildren(iconEl('lock', 16), h('span', { class: 'lbl' }, names[why] || ''));
      this.elDueTag.hidden = !b.due_at;
      if (b.due_at) { const late = new Date(b.due_at) < Date.now(); this.elDueTag.className = 'tag' + (late ? ' warn' : ''); this.elDueTag.textContent = `Due ${fmtWhen(b.due_at)}`; }
      this.elScoreTag.hidden = !me.score; if (me.score) this.elScoreTag.textContent = `Score ${me.score}`;
      this.btnFeedback.hidden = !me.comment;
      const sent = why === 'submitted', T = CONFIG.TEACHER_NAME || 'your teacher';
      this.btnSubmit.hidden = !!(why === 'pastdue' || why === 'notstarted');
      this.btnSubmit.disabled = sent;
      this.btnSubmit.className = sent ? 'btn sent sm' : 'btn primary sm';
      this.btnSubmit.replaceChildren(iconEl('check', 18), h('span', { class: 'lbl' }, sent ? 'Sent' : 'Submit'));
      this.btnSubmit.title = sent ? 'You sent your work' : 'Send your work to your teacher';
      if (sent) {
        const checked = !!(me.score || me.comment);
        this.banner.className = 'banner sent' + (checked ? ' checked' : '');
        this.banner.replaceChildren(iconEl(checked ? 'star' : 'check', 20), h('span', null, checked ? `Teacher ${T} checked your work.` : `Sent! Waiting for Teacher ${T} to check your work.`));
        this.banner.hidden = false;
      } else this.banner.hidden = true;
    } else if (this.isTeacher) {
      this.btnFollow.setAttribute('aria-pressed', String(!!f.on)); this.btnFollow.classList.toggle('on', !!f.on);
      this.btnFollow.querySelector('.lbl').textContent = f.on ? 'Following: ON' : 'Follow me';
      this.btnLock.setAttribute('aria-pressed', String(b.locked)); this.btnLock.classList.toggle('on', b.locked);
      this.btnLock.replaceChildren(iconEl(b.locked ? 'lock' : 'unlock', 22), h('span', { class: 'lbl' }, b.locked ? 'Writing locked' : 'Lock writing')); this.btnLock.title = b.locked ? 'Writing is locked. Tap to let students write' : 'Lock writing';
    } else {
      this.elLockTag.hidden = !b.locked;
      const on = !!f.on;
      this.elFollowTag.hidden = !(on && this.following);
      this.elFollowTag.replaceChildren(iconEl('follow', 16), h('span', { class: 'lbl long' }, 'Following your teacher'), h('span', { class: 'lbl short' }, 'Following'));
      this.btnBackToTeacher.hidden = !(on && !this.following);
    }
  }

  // ---- assignment: student side
  async submitWork() {
    const ok = await confirmDialog({ title: 'Submit your work?', text: 'After you submit, you cannot change your answers. Your teacher will check your work.', confirmLabel: 'Yes, submit' });
    if (!ok) return;
    for (let i = 0; i < 40 && this.store.dirty.size; i++) await new Promise(r => setTimeout(r, 250));
    if (this.store.dirty.size) return toast('Your work is still saving. Wait a moment and try again.', 'bad');
    const { data, error } = await this.sb.rpc('submit_work', { p_participant: this.store.participantId });
    if (error) return toast(friendlyError(error), 'bad');
    this.store.me = { ...(this.store.me || {}), submitted_at: data };
    this.commitEditor(); this.setTool('move'); this.renderRail(); this.renderOpts(); this.updateTopState();
    toast('Submitted. Your teacher will check your work.', 'ok');
  }

  onMe() {
    const me = this.store.me || {}, prev = this.prevMe || {};
    if (this.prevMe && ((me.score && me.score !== prev.score) || (me.comment && me.comment !== prev.comment))) toast('Your teacher added feedback.', 'ok');
    this.prevMe = { score: me.score, comment: me.comment };
    this.renderRail(); this.renderOpts(); this.updateTopState();
  }

  tickLock() {
    const why = this.lockReason();
    if (why !== this.lastLock) { this.lastLock = why; if (why && this.tool !== 'move') this.setTool('move'); this.renderRail(); this.renderOpts(); this.updateTopState(); }
    else this.updateTopState();
  }

  feedbackDialog() {
    const me = this.store.me || {};
    modal({ title: 'Feedback from your teacher', body: h('div', null, me.score ? h('p', { style: { fontSize: '26px', fontWeight: '600', marginBottom: '10px' } }, `Score: ${me.score}`) : null, h('p', { style: { whiteSpace: 'pre-wrap', fontSize: '17px' } }, me.comment || ''), h('p', { class: 'hint', style: { marginTop: '12px' } }, 'Look for your teacher\'s writing, ticks and stamps on the pages too.')) });
  }

  // ---- assignment: teacher side (one student's copy)
  scoreDialog() {
    const id = this.store.scopeId, p = this.store.participantsMap.get(id) || {};
    const score = h('input', { class: 'input', id: 'sc', value: p.score || '', maxlength: '24', placeholder: 'Example: 18/20 or A' });
    const comment = h('textarea', { class: 'input', id: 'cm', rows: '5', maxlength: '1500', placeholder: 'Write a short comment for the student' }); comment.value = p.comment || '';
    const err = h('p', { class: 'error', role: 'alert' });
    const patch = async (obj, msg) => {
      const { error } = await this.sb.from('participants').update(obj).eq('id', id);
      if (error) { err.textContent = friendlyError(error); return false; }
      Object.assign(p, obj); this.store.participantsMap.set(id, p); this.store.emit('participants'); this.updateTopState(); if (msg) toast(msg, 'ok'); return true;
    };
    const extra = [];
    if (p.submitted_at) extra.push(h('button', { class: 'btn sm', onclick: async () => { if (await patch({ submitted_at: null }, `${p.name} can edit again.`)) m.close(); } }, 'Let student edit again (undo Submit)'));
    extra.push(h('button', { class: 'btn sm danger', onclick: async () => {
      m.close();
      const ok = await confirmDialog({ title: `Delete ${p.name}?`, text: `${p.name} and all of their writing and your feedback on their copy will be deleted. This cannot be undone.`, confirmLabel: 'Delete student', danger: true });
      if (!ok) return;
      const { error } = await this.sb.from('participants').delete().eq('id', id);
      if (error) return toast(friendlyError(error), 'bad');
      this.store.participantsMap.delete(id); this.store.emit('participants'); toast(`${p.name} was deleted.`, 'ok');
      if (this.studentNav) this.studentNav.back();
    } }, 'Delete this student and their work'));
    extra.push(h('button', { class: 'btn sm', onclick: async () => { await patch({ reclaim_ok: true }, `${p.name} can open this copy from another device once.`); } }, 'Allow this student to rejoin from another device'));
    const m = modal({
      title: `Score: ${p.name || 'student'}`,
      body: h('div', null, h('div', { class: 'field' }, h('label', { for: 'sc' }, 'Score'), score), h('div', { class: 'field' }, h('label', { for: 'cm' }, 'Comment'), comment), err,
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' } }, extra)),
      actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => { if (await patch({ score: score.value.trim() || null, comment: comment.value.trim() || null }, 'Saved. The student can see it.')) m.close(); } }, 'Save')],
    });
  }

  exportThis() {
    const p = this.store.participantsMap.get(this.store.scopeId); if (!p) return;
    exportDialog({ sb: this.sb, store: this.store, students: [p], renderer: this.renderer, label: p.name });
  }

  renderStatus(s) {
    if (!this.elStatus) return;
    this.elStatus.className = 'status ' + (s === 'saving' ? 'saving' : s === 'offline' ? 'offline' : '');
    this.elStatus.textContent = s === 'saving' ? 'Saving…' : s === 'offline' ? 'Offline: work kept safe' : 'Saved';
  }
  renderStatusTime() { /* reserved */ }

  // ----------------------------------------------------------------- tools rail
  get locked() { return !this.isTeacher && !!this.lockReason(); }
  toolAllowed(t) {
    if (t === 'laser') return this.isTeacher && !this.assign;
    if (t === 'stamp') return this.review;
    return t === 'move' || !this.locked;
  }

  renderRail() {
    const items = [];
    this.btnUndo = h('button', { class: 'tbtn', title: 'Undo', 'aria-label': 'Undo', onclick: () => this.doUndo() }, iconEl('undo', 22));
    this.btnRedo = h('button', { class: 'tbtn', title: 'Redo', 'aria-label': 'Redo', onclick: () => this.doRedo() }, iconEl('redo', 22));
    items.push(this.btnUndo, this.btnRedo, h('span', { class: 'tsep' }));
    for (const [id, label, ic] of TOOLS) {
      if ((id === 'laser' && !(this.isTeacher && !this.assign)) || (id === 'stamp' && !this.review)) continue;
      items.push(h('button', { class: 'tbtn tool', 'aria-pressed': String(this.tool === id), disabled: !this.toolAllowed(id), 'data-tool': id, title: label, 'aria-label': label, onclick: () => this.setTool(id) }, iconEl(ic, 22)));
      if (id === 'move' || id === 'ellipse') items.push(h('span', { class: 'tsep' }));
    }
    items.push(h('span', { class: 'tsep' }));
    for (const [k, label] of [['protractor', 'Protractor'], ['ruler', 'Ruler']]) {
      items.push(h('button', { class: 'tbtn tool', 'aria-pressed': String(!!this.instr.local[k]), title: label + ' (show or hide)', 'aria-label': label, onclick: () => { this.instr.toggle(k); this.renderRail(); this.renderOpts(); } }, iconEl(k, 22)));
    }
    if (this.isTeacher && !this.assign && this.instr.any()) items.push(h('button', { class: 'tbtn' + (this.instr.sharing ? ' on' : ''), 'aria-pressed': String(this.instr.sharing), title: this.instr.sharing ? 'The class sees your instruments. Tap to hide' : 'Show my protractor and ruler to the class', 'aria-label': 'Show my instruments to the class', onclick: () => this.toggleShareInstr() }, iconEl('eye', 22)));
    this.elRail.replaceChildren(...items);
    this.updateUndo();
  }

  updateUndo() { if (this.btnUndo) { this.btnUndo.disabled = !this.undoStack.length; this.btnRedo.disabled = !this.redoStack.length; } }

  setTool(t) {
    if (!this.toolAllowed(t)) return;
    this.commitEditor();
    this.tool = t;
    this.stage.classList.toggle('move', t === 'move'); this.stage.classList.toggle('erase', t === 'eraser');
    this.renderRail(); this.renderOpts();
    if (t !== 'laser') this.laserPts = [];
  }

  // the little panel under the toolbar: colours and sizes of the current tool
  renderOpts() {
    const o = this.elOpts, t = this.tool, kids = [];
    const colored = t === 'pen' || t === 'highlighter' || t === 'text' || SHAPES.has(t);
    const sizes = onPick => [0, 1, 2].map(i => h('button', { class: 'sz', 'aria-label': ['Thin', 'Medium', 'Thick'][i], title: ['Thin', 'Medium', 'Thick'][i], 'aria-pressed': String(this.sizeIdx === i), onclick: () => onPick(i) }, h('i', { style: { height: [2, 4, 8][i] + 'px' } })));
    if (t === 'stamp') {
      kids.push(h('div', { class: 'grp', role: 'group', 'aria-label': 'Stamp' }, STAMPS.map(([k, name]) =>
        h('button', { class: 'stampbtn', 'aria-label': name, title: name, 'aria-pressed': String(this.stampKind === k), onclick: () => { this.stampKind = k; this.renderOpts(); } }, this.stampPreview(k)))));
      kids.push(h('span', { class: 'sep' }), h('div', { class: 'grp', role: 'group', 'aria-label': 'Size' }, sizes(i => { this.sizeIdx = i; this.renderOpts(); })));
      kids.push(h('span', { class: 'note' }, 'Tap the page to place it'));
    } else if (colored) {
      const pal = t === 'highlighter' ? HL_COLORS : (this.copy ? STUDENT_ASSIGN_COLORS : PEN_COLORS), cur = t === 'highlighter' ? this.hlColor : this.color;
      kids.push(h('div', { class: 'grp', role: 'group', 'aria-label': 'Colour' }, pal.map(([name, hex]) =>
        h('button', { class: 'sw', style: { background: hex }, 'aria-label': name, title: name, 'aria-pressed': String(cur === hex), onclick: () => { if (t === 'highlighter') this.hlColor = hex; else this.color = hex; this.applyEditorStyle(); this.renderOpts(); } }))));
      kids.push(h('span', { class: 'sep' }), h('div', { class: 'grp', role: 'group', 'aria-label': 'Size' }, sizes(i => { this.sizeIdx = i; this.applyEditorStyle(); this.renderOpts(); })));
    } else {
      const notes = { eraser: 'Touch a mark to remove it. Undo brings it back.', laser: 'Move over the page: everyone sees a red dot.' };
      if (notes[t]) kids.push(h('span', { class: 'note' }, notes[t]));
    }
    if (this.editor) kids.push(h('button', { class: 'btn primary sm', onclick: () => this.commitEditor() }, iconEl('check', 18), 'Done'));
    o.hidden = !kids.length;
    o.replaceChildren(...kids);
    this.updateUndo(); this.updatePager();
  }

  navControls() {
    return [
      h('button', { class: 'ib', onclick: () => this.zoomStep(1 / 1.25), 'aria-label': 'Zoom out', title: 'Zoom out' }, iconEl('minus', 20)),
      h('button', { class: 'ib', onclick: () => { this.fit(); }, 'aria-label': 'Fit page', title: 'Fit page' }, iconEl('fit', 20)),
      h('button', { class: 'ib', onclick: () => this.zoomStep(1.25), 'aria-label': 'Zoom in', title: 'Zoom in' }, iconEl('plus', 20)),
      h('span', { class: 'sep' }),
      h('div', { class: 'pg-nav' },
        h('button', { class: 'ib', onclick: () => this.goPage(-1), 'aria-label': 'Previous page', title: 'Previous page' }, iconEl('left', 20)),
        h('span', { class: 'pg-num', 'aria-live': 'polite' }, ''),
        h('button', { class: 'ib', onclick: () => this.goPage(1), 'aria-label': 'Next page', title: 'Next page' }, iconEl('right', 20))),
    ];
  }

  updatePager() { if (!this.el) return; for (const e of this.el.querySelectorAll('.pg-num')) e.textContent = this.pagerText(); }

  stampPreview(k) {
    const c = document.createElement('canvas'); c.width = 96; c.height = 56; c.style.width = '48px'; c.style.height = '28px';
    const ctx = c.getContext('2d'); ctx.scale(2, 2);
    drawObject(ctx, { type: 'stamp', data: { k, x: 24, y: 14, s: k === 'good' || k === 'try' ? 17 : 24 } });
    return c;
  }

  placeStamp(p) {
    if (!this.review) return;
    const o = this.store.addObject('stamp', this.pageId, { k: this.stampKind, x: Math.round(p.x), y: Math.round(p.y), s: STAMP_SIZES[this.sizeIdx] });
    this.pushUndo({ t: 'create', id: o.id });
    const ctx = this.cInk.getContext('2d'); ctx.setTransform(this.q, 0, 0, this.q, 0, 0); drawObject(ctx, o);
    this.thumbDirty(this.pageId);
  }

  pagerText() { const i = this.store.pages.findIndex(p => p.id === this.pageId); return `${i + 1} / ${this.store.pages.length}`; }

  // ===================================================================== pages + view
  get page() { return this.store.pages.find(p => p.id === this.pageId); }

  setPage(id, { keepView = false, user = false } = {}) {
    const pg = this.store.pages.find(p => p.id === id); if (!pg) return;
    if (user) this.userMoved();
    this.commitEditor();
    this.pageId = id; this.cur = null; this.ghosts.clear(); this.laserPts = [];
    this.sheet.style.width = '1000px'; this.sheet.style.height = pg.h + 'px';
    if (!keepView) { this.autoFit = true; this.fitNow(false); }
    this.q = this.wantQ(); this.sizeCanvases(); this.renderBase(); this.renderInk(); this.renderLive();
    this.loadPageMm(pg); this.instr.fit(); this.instr.render();
    this.updatePager();
    this.store.track({ name: this.store.name, role: this.role, page: this.store.pages.indexOf(pg) + 1 });
    if (this.copy) this.store.setCurPage(this.store.pages.indexOf(pg) + 1);
    this.markThumbCurrent();
    this.broadcastView(true);
  }

  goPage(d) {
    const ps = this.store.pages, i = ps.findIndex(p => p.id === this.pageId), n = clamp(i + d, 0, ps.length - 1);
    if (ps[n] && ps[n].id !== this.pageId) this.setPage(ps[n].id, { user: true });
  }

  showEmpty() {
    this.sheet.style.display = 'none';
    this.empty = h('div', { class: 'banner', style: { top: '40%' } }, this.isTeacher ? 'This board has no pages yet. Open Pages and add some.' : 'Your teacher has not added any pages yet. Please wait.');
    this.stage.append(this.empty);
  }

  onPages() {
    const ps = this.store.pages;
    if (this.empty && ps.length) { this.empty.remove(); this.empty = null; this.sheet.style.display = ''; }
    if (!ps.length) { this.pageId = null; this.showEmpty(); this.renderPanel(); return; }
    if (!ps.some(p => p.id === this.pageId)) this.setPage(ps[0].id);
    else if (this.page && this.sheet.style.height !== this.page.h + 'px') this.setPage(this.pageId);
    this.updatePager();
    this.renderPanel();
  }

  placePop() { if (this.elOpts && this.elTop) this.elOpts.style.top = (this.elTop.offsetHeight + 10) + 'px'; }

  onResize() { this.placePop(); if (this.autoFit && this.page) { this.fitNow(false); this.applyView(); } }

  stageSize() { return { w: this.stage.clientWidth || 800, h: this.stage.clientHeight || 600 }; }

  insetTop() {   // room for the floating colour panel
    const narrow = this.stage && this.stage.clientWidth < 720;
    if (!narrow) return 58;
    return this.elOpts && !this.elOpts.hidden ? Math.min(110, this.elOpts.offsetHeight + 14) : 10;
  }

  fitScale() { const { w, h } = this.stageSize(), pg = this.page; if (!pg) return 1; const pad = w < 600 ? 8 : 20; return Math.max(MIN_S, Math.min((w - pad * 2) / 1000, (h - pad * 2 - this.insetTop()) / pg.h)); }

  fitNow() {
    const pg = this.page; if (!pg) return;
    const { w, h } = this.stageSize(), s = this.fitScale(), top = this.insetTop();
    this.view = { s, tx: (w - 1000 * s) / 2, ty: Math.max(12, top + (h - top - pg.h * s) / 2) };
  }
  fit() { this.userMoved(); this.autoFit = true; this.fitNow(); this.applyView(); }

  clampView() {
    const pg = this.page; if (!pg) return;
    const { w, h } = this.stageSize(), v = this.view, keep = 90;
    v.s = clamp(v.s, MIN_S, MAX_S);
    v.tx = clamp(v.tx, keep - 1000 * v.s, w - keep);
    v.ty = clamp(v.ty, keep - pg.h * v.s, h - keep);
  }

  applyView(fromRemote = false) {
    this.clampView();
    const v = this.view;
    this.sheet.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.s})`;
    this.sheet.style.borderWidth = Math.max(1, 1 / v.s) + 'px';
    this.scheduleQuality();
    if (this.instr && this.instr.any() || (this.instr && this.instr.remote)) { if (!this._ir) { this._ir = true; requestAnimationFrame(() => { this._ir = false; this.instr.render(); }); } }
    if (!fromRemote) this.broadcastView();
  }

  zoomAt(f, cx, cy) {
    const v = this.view, ns = clamp(v.s * f, MIN_S, MAX_S), k = ns / v.s;
    v.tx = cx - (cx - v.tx) * k; v.ty = cy - (cy - v.ty) * k; v.s = ns;
    this.autoFit = false; this.applyView();
  }
  zoomStep(f) { this.userMoved(); const { w, h } = this.stageSize(); this.zoomAt(f, w / 2, h / 2); }

  wantQ() {
    const pg = this.page; if (!pg) return 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const maxQ = Math.min(3, Math.sqrt(9e6 / (1000 * pg.h)));
    return clamp(Math.ceil(this.view.s * dpr * 2) / 2, 1, Math.max(1, maxQ));
  }
  scheduleQuality() {
    clearTimeout(this.qTimer);
    this.qTimer = setTimeout(() => {
      const q = this.wantQ();
      if (q !== this.q) { this.q = q; this.sizeCanvases(); this.renderBase(); this.renderInk(); this.renderLive(); }
    }, 220);
  }
  sizeCanvases() {
    const pg = this.page; if (!pg) return;
    const W = Math.round(1000 * this.q), H = Math.round(pg.h * this.q);
    for (const c of [this.cBase, this.cInk, this.cLive]) { c.width = W; c.height = H; }
  }

  async loadPageMm(pg) {
    if (pg.kind !== 'pdf' || this.pageMm[pg.id]) return;
    try { this.pageMm[pg.id] = await pdfPageMm(this.sb, pg.file_path, pg.pdf_page); if (this.pageId === pg.id) this.instr.render(); } catch (e) { /* default A4 */ }
  }

  // ---- instruments (protractor, ruler)
  onInstrChange(state) {
    if (!(this.isTeacher && !this.assign && this.instr.sharing)) return;
    if (!this._si) this._si = throttle(s => this.store.sendInstr(s), 60);
    this._si(state);
  }
  toggleShareInstr() {
    const on = this.instr.sharing = !this.instr.sharing;
    clearInterval(this.shareTimer);
    if (on) { this.store.sendInstr(this.instr.shared()); this.shareTimer = setInterval(() => this.store.sendInstr(this.instr.shared()), 4000); toast('Students now see your protractor and ruler.'); }
    else { this.store.sendInstr({ page: this.pageId, protractor: null, ruler: null }); toast('Students no longer see them.'); }
    this.renderRail();
  }

  // ===================================================================== rendering
  async renderBase() {
    const pg = this.page; if (!pg) return;
    const tok = ++this.baseTok, c = this.cBase, ctx = c.getContext('2d'), q = this.q;
    ctx.setTransform(q, 0, 0, q, 0, 0);
    if (pg.kind === 'blank' || pg.kind === 'lined' || pg.kind === 'grid') { drawPatternBase(ctx, pg.kind, 1000, pg.h); this.loadingEl.hidden = true; return; }
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1000, pg.h);
    this.loadingEl.hidden = false; this.loadingEl.textContent = 'Loading page…';
    try {
      if (pg.kind === 'pdf') {
        const cv = await renderPdfPage(this.sb, pg.file_path, pg.pdf_page, c.width);
        if (tok !== this.baseTok) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(cv, 0, 0, c.width, c.height);
      } else {
        const im = await getImage(this.sb, pg.file_path);
        if (tok !== this.baseTok) return;
        ctx.imageSmoothingQuality = 'high'; ctx.drawImage(im, 0, 0, 1000, pg.h);
      }
      this.loadingEl.hidden = true;
    } catch (e) {
      console.error(e);
      if (tok === this.baseTok) { this.loadingEl.hidden = false; this.loadingEl.textContent = 'Could not load this page. Check your connection.'; setTimeout(() => { if (tok === this.baseTok) this.renderBase(); }, 4000); }
    }
  }

  renderInk() {
    if (!this.pageId) return;
    const ctx = this.cInk.getContext('2d'), q = this.q;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.cInk.width, this.cInk.height);
    ctx.setTransform(q, 0, 0, q, 0, 0);
    const fp = this.focusPerson;
    for (const o of this.store.pageObjects(this.pageId)) {
      if (o.deleted || o.id === this.hiddenId) continue;
      drawObject(ctx, o, fp && o.participant_id !== fp ? { alpha: 0.18 } : undefined);
    }
  }
  scheduleInk() { if (this.inkQueued) return; this.inkQueued = true; requestAnimationFrame(() => { this.inkQueued = false; this.renderInk(); }); }

  requestLive() { if (this.liveQueued) return; this.liveQueued = true; requestAnimationFrame(() => { this.liveQueued = false; this.renderLive(); }); }

  renderLive() {
    const c = this.cLive, ctx = c.getContext('2d'), q = this.q, now = performance.now();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
    if (!this.pageId) return;
    ctx.setTransform(q, 0, 0, q, 0, 0);
    let again = false;
    for (const [id, g] of this.ghosts) {
      if (now - g.t > 6000) { this.ghosts.delete(id); continue; }
      if (g.page_id === this.pageId) { drawObject(ctx, g); again = again || now - g.t < 6000; }
    }
    if (this.ghosts.size) again = true;
    if (this.cur) drawObject(ctx, this.cur);
    // laser
    this.laserPts = this.laserPts.filter(p => now - p.t < 900);
    if (this.laserPts.length) {
      const L = this.laserPts, last = L[L.length - 1];
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 1; i < L.length; i++) {
        const a = 1 - (now - L[i].t) / 900;
        ctx.strokeStyle = `rgba(220,38,38,${Math.max(0, a) * 0.8})`; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(L[i - 1].x, L[i - 1].y); ctx.lineTo(L[i].x, L[i].y); ctx.stroke();
      }
      const fade = clamp(1 - (now - last.t) / 900, 0, 1);
      ctx.fillStyle = `rgba(220,38,38,${fade})`; ctx.beginPath(); ctx.arc(last.x, last.y, 13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${fade})`; ctx.lineWidth = 2.5; ctx.stroke();
      again = true;
    }
    if (again || this.cur) this.requestLive();
  }

  // ===================================================================== store events
  onObjects(pids, id) {
    if (id) {
      this.ghosts.delete(id);
      const o = this.store.objs.get(id);
      if (this.copy && o && o.is_feedback && !o.deleted && Date.now() - this.lastFeedbackToast > 60000) { this.lastFeedbackToast = Date.now(); toast('Your teacher wrote feedback on your work.', 'ok'); }
    }
    if (pids.includes(this.pageId)) { this.scheduleInk(); if (this.ghosts.size) this.requestLive(); }
    for (const p of pids) this.thumbDirty(p);
  }

  onBoard(first = false) {
    const b = this.store.board;
    if (!first) { this.renderRail(); this.renderOpts(); }
    if (!this.isTeacher && !this.assign) {
      const f = b.follow || {};
      if (f.on) {
        if (f.seq !== this.followSeq) { this.followSeq = f.seq; this.following = true; }
        if (this.following) this.applyRemoteView(f);
      } else { this.following = false; this.followSeq = null; }
    }
    if (this.locked && this.tool !== 'move') this.setTool('move');
    this.updateTopState();
    if (this.panel === 'people') this.renderPanel();
  }

  userMoved() { if (!this.isTeacher && this.following) { this.following = false; this.updateTopState(); } }
  rejoinTeacher() { const f = this.store.board.follow || {}; this.following = true; this.applyRemoteView(f); this.updateTopState(); }

  onRemoteView(v) { if (!this.isTeacher && this.following) this.applyRemoteView(v); }

  applyRemoteView(v) {
    if (!v || !v.page || !v.vw) return;
    if (!this.store.pages.some(p => p.id === v.page)) return;
    if (v.page !== this.pageId) this.setPage(v.page, { keepView: true });
    const pg = this.store.pages.find(p => p.id === v.page), { w, h } = this.stageSize();
    // show the part of the page the teacher is looking at (fits phones and tablets too)
    const x0 = Math.max(0, v.cx - v.vw / 2), x1 = Math.min(1000, v.cx + v.vw / 2);
    const y0 = Math.max(0, v.cy - v.vh / 2), y1 = Math.min(pg.h, v.cy + v.vh / 2);
    const iw = Math.max(50, x1 - x0), ih = Math.max(50, y1 - y0), pad = w < 600 ? 8 : 20;
    const s = clamp(Math.min((w - pad * 2) / iw, (h - pad * 2) / ih), MIN_S, MAX_S);
    this.view = { s, tx: w / 2 - (x0 + iw / 2) * s, ty: h / 2 - (y0 + ih / 2) * s };
    this.autoFit = false; this.applyView(true);
  }

  currentViewPayload() {
    const { w, h } = this.stageSize(), v = this.view;
    return { page: this.pageId, cx: (w / 2 - v.tx) / v.s, cy: (h / 2 - v.ty) / v.s, vw: w / v.s, vh: h / v.s };
  }

  broadcastView(now = false) {
    if (!this.isTeacher || !this.store.board || !this.store.board.follow || !this.store.board.follow.on || !this.pageId) return;
    if (!this.sendViewT) this.sendViewT = throttle(() => this.store.sendView(this.currentViewPayload()), 70);
    this.sendViewT();
    if (!this.saveViewD) this.saveViewD = debounce(() => this.saveFollow(true), 700);
    if (now) this.saveFollow(true); else this.saveViewD();
  }

  async saveFollow(on) {
    const f = { ...(this.store.board.follow || {}), ...this.currentViewPayload(), on };
    this.store.board.follow = f;
    const { error } = await this.sb.from('boards').update({ follow: f }).eq('id', this.store.boardId);
    if (error) console.warn(error);
  }

  async toggleFollow() {
    const on = !(this.store.board.follow && this.store.board.follow.on);
    const f = { ...this.currentViewPayload(), on, seq: Date.now() };
    this.store.board.follow = f; this.updateTopState();
    const { error } = await this.sb.from('boards').update({ follow: f }).eq('id', this.store.boardId);
    if (error) toast(friendlyError(error), 'bad');
    else toast(on ? 'Students now see what you see. They can tap "Back to teacher\'s view" after moving away.' : 'Students can look around freely again.');
    if (on) this.store.sendView(this.currentViewPayload());
  }

  async toggleLock() {
    const b = this.store.board, val = !b.locked; b.locked = val; this.updateTopState();
    const { error } = await this.sb.from('boards').update({ locked: val }).eq('id', b.id);
    if (error) { b.locked = !val; this.updateTopState(); toast(friendlyError(error), 'bad'); }
    else toast(val ? 'Student writing is locked.' : 'Students can write again.');
  }

  // ===================================================================== live strokes from others
  onLive(p) {
    if (!p || !p.id) return;
    let g = this.ghosts.get(p.id);
    if (!g) { g = { id: p.id, page_id: p.pid, type: p.type, data: { c: p.c, s: p.s, pr: p.pr ? 1 : 0, p: [] }, deleted: false, t: 0 }; this.ghosts.set(p.id, g); }
    g.t = performance.now();
    if (p.shape) g.data = p.shape; else if (p.add) g.data.p.push(...p.add);
    if (p.pid === this.pageId) this.requestLive();
  }

  onLaser(p) {
    if (!p || p.page !== this.pageId) return;
    if (p.off) { this.laserPts = []; this.requestLive(); return; }
    this.laserPts.push({ x: p.x, y: p.y, t: performance.now() });
    this.requestLive();
  }

  onPresence(state) {
    this.online.clear();
    for (const [key, metas] of Object.entries(state)) { const m = metas[metas.length - 1]; this.online.set(key, m); }
    if (this.isTeacher) {
      const n = [...this.online.values()].filter(m => m.role === 'student').length;
      const c = this.btnPeople && this.btnPeople.querySelector('.cnt'); if (c) c.textContent = n;
      if (this.panel === 'people') this.renderPanel();
    }
  }

  // ===================================================================== pointer handling
  toPage(e) {
    const r = this.sheet.getBoundingClientRect(), k = 1000 / r.width;
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
  }
  stagePt(e) { const r = this.stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  onDown(e) {
    if (!this.page) return;
    if (e.target.closest('.text-editor, .banner')) return;
    if (e.pointerType === 'mouse' && e.button > 1) return;
    try { this.stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (e.pointerType === 'pen') this.penSeen = true;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (this.editor) { const wasText = this.tool === 'text'; this.commitEditor(); if (wasText) this.skipTextOpen = true; }
    if (this.pointers.size >= 2) { this.cancelCurrent(); this.startGesture(); return; }
    this.suppress = false;
    const panning = this.tool === 'move' || e.button === 1 || this.spaceDown || (e.pointerType === 'touch' && this.penSeen) || (!this.toolAllowed(this.tool));
    if (panning) { this.startPan(e); return; }
    const p = this.toPage(e); this.downAt = { x: e.clientX, y: e.clientY, p, moved: false };
    const t = this.tool;
    if (t === 'pen' || t === 'highlighter') {
      const pr = e.pointerType === 'pen' && t === 'pen';
      const data = { c: t === 'pen' ? this.color : this.hlColor, s: (t === 'pen' ? PEN_SIZES : HL_SIZES)[this.sizeIdx], pr: pr ? 1 : 0, p: pr ? [p.x, p.y, e.pressure || 0.5] : [p.x, p.y] };
      this.cur = { id: uuid(), type: t, page_id: this.pageId, data, deleted: false }; this.sentTo = 0;
      this.sendCur(); this.requestLive();
    } else if (SHAPES.has(t)) {
      this.cur = { id: uuid(), type: t, page_id: this.pageId, deleted: false, data: { c: this.color, s: PEN_SIZES[this.sizeIdx] * (t === 'line' || t === 'arrow' ? 1 : 1), x0: p.x, y0: p.y, x1: p.x, y1: p.y } };
      this.requestLive();
    } else if (t === 'eraser') {
      this.eraseIds = []; this.eraseAt(p);
    } else if (t === 'laser') {
      this.laserMove(p);
    }
  }

  onMove(e) {
    const pt = this.pointers.get(e.pointerId);
    if (!pt) {
      if (this.tool === 'laser' && this.isTeacher && this.page && e.pointerType === 'mouse') this.laserMove(this.toPage(e));
      return;
    }
    pt.x = e.clientX; pt.y = e.clientY;
    if (this.g) { this.updateGesture(); return; }
    if (this.pan) { this.updatePan(e); return; }
    if (!this.downAt) return;
    if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 5) this.downAt.moved = true;
    const t = this.tool;
    if (this.cur && (t === 'pen' || t === 'highlighter')) {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e], d = this.cur.data, stride = d.pr ? 3 : 2;
      for (const ev of (evs.length ? evs : [e])) {
        const p = this.toPage(ev), n = d.p.length;
        if (n >= stride && Math.hypot(p.x - d.p[n - stride], p.y - d.p[n - stride + 1]) < 0.5 / Math.max(.3, this.view.s * 1.2)) continue;
        d.p.push(p.x, p.y); if (stride === 3) d.p.push(ev.pressure || 0.5);
      }
      this.sendCurT(); this.requestLive();
    } else if (this.cur && SHAPES.has(t)) {
      const p = this.toPage(e), d = this.cur.data; d.x1 = p.x; d.y1 = p.y;
      if (e.shiftKey && (t === 'rect' || t === 'ellipse')) { const m = Math.max(Math.abs(p.x - d.x0), Math.abs(p.y - d.y0)); d.x1 = d.x0 + Math.sign(p.x - d.x0 || 1) * m; d.y1 = d.y0 + Math.sign(p.y - d.y0 || 1) * m; }
      this.sendShapeT(); this.requestLive();
    } else if (t === 'eraser') this.eraseAt(this.toPage(e));
    else if (t === 'laser') this.laserMove(this.toPage(e));
  }

  onUp(e, cancelled = false) {
    const had = this.pointers.has(e.pointerId);
    this.pointers.delete(e.pointerId);
    try { this.stage.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (!had) return;
    if (this.g) {
      if (this.pointers.size < 2) { this.g = null; this.suppress = true; const rem = [...this.pointers.values()][0]; if (rem) this.startPanFrom(rem); }
      return;
    }
    if (this.pan) {
      const moved = this.pan.moved, tool = this.tool; this.pan = null; this.stage.classList.remove('panning');
      if (!moved && !cancelled && tool === 'move' && !this.pointers.size) this.whoWrote(this.toPage(e), e);
      return;
    }
    if (this.suppress) { if (!this.pointers.size) this.suppress = false; return; }
    const t = this.tool, da = this.downAt; this.downAt = null;
    if (cancelled) { this.cur = null; this.requestLive(); return; }
    if (this.cur && (t === 'pen' || t === 'highlighter')) {
      const d = this.cur.data, stride = d.pr ? 3 : 2;
      d.p = simplify(d.p, stride, 0.7).map(v => Math.round(v * 10) / 10);
      this.finishCur();
    } else if (this.cur && SHAPES.has(t)) {
      const d = this.cur.data;
      if (Math.hypot(d.x1 - d.x0, d.y1 - d.y0) < 3) { this.cur = null; this.requestLive(); }
      else { for (const k of ['x0', 'y0', 'x1', 'y1']) d[k] = Math.round(d[k] * 10) / 10; this.finishCur(); }
    } else if (t === 'eraser') {
      if (this.eraseIds && this.eraseIds.length) this.pushUndo({ t: 'delete', ids: this.eraseIds });
      this.eraseIds = null;
    } else if (t === 'text' && da && !da.moved) {
      if (this.skipTextOpen) { this.skipTextOpen = false; return; }
      this.openTextAt(da.p);
    } else if (t === 'stamp' && da && !da.moved) this.placeStamp(da.p);
    else if (t === 'laser' && this.isTeacher && e.pointerType !== 'mouse') this.store.sendLaser({ page: this.pageId, off: true });
    this.skipTextOpen = false;
  }

  cancelCurrent() { this.cur = null; this.downAt = null; this.eraseIds = null; this.requestLive(); }

  finishCur() {
    const c = this.cur; this.cur = null;
    if (c.type === 'pen' || c.type === 'highlighter') this.sendCur(true);
    const o = this.store.addObject(c.type, c.page_id, c.data, c.id);
    this.pushUndo({ t: 'create', id: o.id });
    if (this.pageId === c.page_id) {
      const ctx = this.cInk.getContext('2d'); ctx.setTransform(this.q, 0, 0, this.q, 0, 0); drawObject(ctx, o);
    }
    this.thumbDirty(c.page_id);
    if (!this.store.online) toast('You are offline. Your work is kept safely and will save when the internet is back.');
    this.requestLive();
  }

  // ---- broadcast own live stroke
  sendCur(final = false) {
    const c = this.cur; if (!c) return;
    const d = c.data, stride = d.pr ? 3 : 2, add = d.p.slice(this.sentTo);
    this.sentTo = d.p.length;
    if (!add.length && !final) return;
    this.store.sendLive({ id: c.id, pid: c.page_id, type: c.type, c: d.c, s: d.s, pr: d.pr, add: add.map(v => Math.round(v * 10) / 10) });
  }
  sendCurT() { if (!this._sc) this._sc = throttle(() => this.sendCur(), 70); this._sc(); }
  sendShapeT() {
    if (!this._ss) this._ss = throttle(() => { const c = this.cur; if (c) this.store.sendLive({ id: c.id, pid: c.page_id, type: c.type, c: c.data.c, s: c.data.s, shape: { ...c.data } }); }, 70);
    this._ss();
  }

  laserMove(p) {
    this.laserPts.push({ x: p.x, y: p.y, t: performance.now() }); this.requestLive();
    if (!this._sl) this._sl = throttle(q => this.store.sendLaser({ page: this.pageId, x: q.x, y: q.y }), 30);
    this._sl(p);
  }

  eraseAt(p) {
    const r = Math.max(5, 11 / this.view.s), hits = [];
    const list = this.store.pageObjects(this.pageId);
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i];
      if (o.deleted || !this.store.canEdit(o)) continue;
      if (hit(o, p.x, p.y, r)) hits.push(o.id);
    }
    if (hits.length) {
      this.store.setDeleted(hits, true);
      if (this.eraseIds) this.eraseIds.push(...hits);
      this.renderInk(); this.thumbDirty(this.pageId);
    }
  }

  // ---- gestures
  startPan(e) {
    this.userMoved(); this.autoFit = false;
    this.pan = { x: e.clientX, y: e.clientY, tx: this.view.tx, ty: this.view.ty, moved: false };
    this.stage.classList.add('panning');
  }
  startPanFrom(pt) { this.userMoved(); this.pan = { x: pt.x, y: pt.y, tx: this.view.tx, ty: this.view.ty, moved: true }; this.stage.classList.add('panning'); }
  updatePan(e) {
    const p = this.pan, dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (!p.moved && Math.hypot(dx, dy) < 6) return;
    p.moved = true; this.view.tx = p.tx + dx; this.view.ty = p.ty + dy; this.applyView();
  }
  startGesture() {
    this.userMoved(); this.autoFit = false; this.pan = null;
    const [a, b] = [...this.pointers.values()], r = this.stage.getBoundingClientRect();
    this.g = { cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top, d: Math.hypot(a.x - b.x, a.y - b.y) || 1, v: { ...this.view } };
  }
  updateGesture() {
    const [a, b] = [...this.pointers.values()], r = this.stage.getBoundingClientRect(), g = this.g;
    const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top, d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const ns = clamp(g.v.s * d / g.d, MIN_S, MAX_S), px = (g.cx - g.v.tx) / g.v.s, py = (g.cy - g.v.ty) / g.v.s;
    this.view = { s: ns, tx: cx - px * ns, ty: cy - py * ns }; this.applyView();
  }
  onWheel(e) {
    e.preventDefault(); this.userMoved(); this.autoFit = false;
    if (e.ctrlKey || e.metaKey) { const p = this.stagePt(e); this.zoomAt(Math.exp(-e.deltaY * 0.012), p.x, p.y); }
    else { this.view.tx -= e.deltaX; this.view.ty -= e.deltaY; this.applyView(); }
  }

  onKey(e) {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (e.code === 'Space') { this.spaceDown = true; e.preventDefault(); return; }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.doRedo() : this.doUndo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this.doRedo(); }
    else if (e.key === '+' || e.key === '=') this.zoomStep(1.25);
    else if (e.key === '-') this.zoomStep(1 / 1.25);
    else if (e.key === '0') this.fit();
    else if (e.key === 'PageDown') this.goPage(1);
    else if (e.key === 'PageUp') this.goPage(-1);
  }

  // ===================================================================== who wrote this
  whoWrote(p, e) {
    const r = 6 / this.view.s, list = this.store.pageObjects(this.pageId);
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i]; if (o.deleted) continue;
      if (hit(o, p.x, p.y, r)) {
        const tip = h('div', { class: 'whotip', style: { left: p.x + 'px', top: p.y + 'px', fontSize: (14 / this.view.s) + 'px', padding: `${4 / this.view.s}px ${10 / this.view.s}px` } }, o.author || 'Unknown');
        this.overlay.append(tip); setTimeout(() => tip.remove(), 2600); return;
      }
    }
  }

  // ===================================================================== text
  openTextAt(p) {
    if (this.locked) return;
    const list = this.store.pageObjects(this.pageId);
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i];
      if (o.type === 'text' && !o.deleted && this.store.canEdit(o)) { const b = bounds(o); if (p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1) { this.openEditor(o.data.x, o.data.y, o); return; } }
    }
    this.openEditor(p.x, p.y, null);
  }

  openEditor(x, y, obj) {
    this.commitEditor();
    const fs = obj ? obj.data.fs : TEXT_SIZES[this.sizeIdx];
    let w = obj ? obj.data.w : Math.min(460, 985 - x);
    if (!obj && w < 160) { x = Math.max(10, 985 - 160); w = 160; }
    const color = obj ? obj.data.c : this.color;
    const ta = h('textarea', { class: 'text-editor', rows: '1', spellcheck: 'false', 'aria-label': 'Type your text', style: { left: x + 'px', top: y + 'px', width: w + 'px', fontSize: fs + 'px', color } });
    ta.value = obj ? obj.data.text : '';
    const grow = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
    ta.addEventListener('input', grow);
    ta.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); this.cancelEditor(); } e.stopPropagation(); });
    this.overlay.append(ta);
    this.editor = { ta, obj, x, y, w, fs, color, pageId: this.pageId };
    if (obj) { this.hiddenId = obj.id; this.renderInk(); }
    grow(); ta.focus({ preventScroll: true });
    this.renderOpts();
  }
  applyEditorStyle() { const e = this.editor; if (!e) return; e.color = this.color; e.ta.style.color = this.color; if (!e.obj) { e.fs = TEXT_SIZES[this.sizeIdx]; e.ta.style.fontSize = e.fs + 'px'; e.ta.style.height = 'auto'; e.ta.style.height = e.ta.scrollHeight + 'px'; } }
  cancelEditor() { const e = this.editor; if (!e) return; e.ta.remove(); this.editor = null; this.hiddenId = null; this.renderInk(); this.renderOpts(); }
  commitEditor() {
    const e = this.editor; if (!e) return;
    const text = e.ta.value.replace(/\s+$/, ''); e.ta.remove(); this.editor = null; this.hiddenId = null;
    if (e.obj) {
      if (text === '') { this.store.setDeleted([e.obj.id], true); this.pushUndo({ t: 'delete', ids: [e.obj.id] }); }
      else if (text !== e.obj.data.text || e.color !== e.obj.data.c) { const before = e.obj.data; const after = { ...before, text, c: e.color }; this.store.updateData(e.obj.id, after); this.pushUndo({ t: 'edit', id: e.obj.id, before, after }); }
    } else if (text !== '') {
      const o = this.store.addObject('text', e.pageId, { c: e.color, fs: e.fs, x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.w), text });
      this.pushUndo({ t: 'create', id: o.id });
    }
    this.renderInk(); this.renderOpts(); this.thumbDirty(e.pageId);
  }

  // ===================================================================== undo / redo
  pushUndo(a) { this.undoStack.push(a); if (this.undoStack.length > 120) this.undoStack.shift(); this.redoStack = []; this.updateUndo(); }
  applyAction(a, inverse) {
    let pages = [];
    if (a.t === 'create') pages = this.store.setDeleted([a.id], inverse);
    else if (a.t === 'delete') pages = this.store.setDeleted(a.ids, !inverse);
    else if (a.t === 'edit') { this.store.updateData(a.id, inverse ? a.before : a.after); const o = this.store.objs.get(a.id); if (o) pages = [o.page_id]; }
    this.renderInk(); for (const p of pages) this.thumbDirty(p);
  }
  doUndo() {
    if (this.locked) return toast('Writing is locked by your teacher.', 'bad');
    this.commitEditor(); const a = this.undoStack.pop(); if (!a) return;
    this.applyAction(a, true); this.redoStack.push(a); this.updateUndo();
  }
  doRedo() {
    if (this.locked) return toast('Writing is locked by your teacher.', 'bad');
    this.commitEditor(); const a = this.redoStack.pop(); if (!a) return;
    this.applyAction(a, false); this.undoStack.push(a); this.updateUndo();
  }

  // ===================================================================== side panels
  togglePanel(name) {
    this.panel = this.panel === name ? null : name;
    this.el.classList.toggle('side-closed', !this.panel);
    this.elSide.classList.toggle('wide', this.panel === 'people');
    this.renderPanel();
    if (this.panel === 'people') this.loadPeople();
    setTimeout(() => this.onResize(), 30);
  }

  setSide(...nodes) { this.elSide.replaceChildren(...nodes.filter(Boolean)); }

  renderPanel() {
    if (!this.panel) return;
    if (this.panel === 'pages') this.renderPagesPanel(); else this.renderPeoplePanel();
  }

  renderPagesPanel() {
    const ps = this.store.pages;
    const list = ps.map((p, i) => {
      const cv = h('canvas', { width: 200, height: Math.round(200 * p.h / 1000) });
      const b = h('button', { class: 'thumb', 'aria-label': `Page ${i + 1}`, 'aria-current': String(p.id === this.pageId), 'data-page': p.id, onclick: () => this.setPage(p.id, { user: true }) }, cv, h('span', { class: 'num' }, i + 1));
      this.thumbs.set(p.id, { cv, btn: b, page: p, done: false });
      return b;
    });
    const foot = [];
    if (this.isTeacher) {
      foot.push(h('button', { class: 'btn sm primary', onclick: () => openAddPages({ sb: this.sb, boardId: this.store.boardId, pages: this.store.pages, onDone: () => { this.store.resync(); this.store.sendResync(); } }) }, iconEl('plus', 18), 'Add pages'));
      foot.push(h('button', { class: 'btn sm danger', disabled: ps.length < 1, onclick: () => this.deleteCurrentPage() }, iconEl('trash', 18), 'Delete this page'));
    }
    this.setSide(
      h('header', null, `Pages (${ps.length})`, h('button', { class: 'ib', 'aria-label': 'Close pages', onclick: () => this.togglePanel('pages') }, iconEl('close'))),
      h('div', { class: 'scroll' }, list.length ? list : h('p', { class: 'hint' }, 'No pages yet.')),
      foot.length ? h('footer', null, foot) : null);
    if (!this.io) this.io = null;
    if (this.io) this.io.disconnect();
    this.io = new IntersectionObserver(es => { for (const en of es) if (en.isIntersecting) { const t = this.thumbs.get(en.target.dataset.page); if (t && !t.done) this.queueThumb(t); } }, { root: this.elSide.querySelector('.scroll'), rootMargin: '200px' });
    for (const t of this.thumbs.values()) if (t.btn.isConnected) this.io.observe(t.btn);
  }

  markThumbCurrent() { for (const [id, t] of this.thumbs) if (t.btn.isConnected) t.btn.setAttribute('aria-current', String(id === this.pageId)); }

  thumbDirty(pid) {
    const t = this.thumbs.get(pid);
    if (!t || !t.btn.isConnected) return;
    t.done = false;
    clearTimeout(t.timer); t.timer = setTimeout(() => { if (t.btn.isConnected && !t.done) this.queueThumb(t); }, 900);
  }
  queueThumb(t) { if (!this.thumbQueue.includes(t)) this.thumbQueue.push(t); this.pumpThumbs(); }
  async pumpThumbs() {
    while (this.thumbBusy < 2 && this.thumbQueue.length) {
      const t = this.thumbQueue.shift(); this.thumbBusy++;
      this.drawThumb(t).catch(() => {}).finally(() => { this.thumbBusy--; this.pumpThumbs(); });
    }
  }
  async drawThumb(t) {
    await this.renderer.draw(t.cv, t.page, this.store.pageObjects(t.page.id));
    t.done = true;
  }

  async deleteCurrentPage() {
    const pg = this.page; if (!pg) return;
    const i = this.store.pages.indexOf(pg) + 1;
    const ok = await confirmDialog({ title: `Delete page ${i}?`, text: 'The page and everything written on it will be removed for everyone. This cannot be undone.', confirmLabel: 'Delete page', danger: true });
    if (!ok) return;
    const { error } = await this.sb.from('pages').delete().eq('id', pg.id);
    if (error) return toast(friendlyError(error), 'bad');
    await this.store.resync(true); this.store.sendResync();
    toast('Page deleted.', 'ok');
  }

  // ---- people (teacher)
  async loadPeople() {
    const { data, error } = await this.sb.from('participants').select('id,name,last_seen,created_at').eq('board_id', this.store.boardId).order('name');
    if (error) return;
    this.participants = data; this.renderPeoplePanel();
  }
  renderPeoplePanel() {
    const onl = [...this.online.entries()].filter(([, m]) => m.role === 'student');
    const rows = this.participants.map(p => {
      const m = this.online.get(p.id);
      const isOn = !!m;
      return h('div', { class: 'person' + (isOn ? ' online' : '') + (this.focusPerson === p.id ? ' mark' : '') },
        h('span', { class: 'dot', title: isOn ? 'Online' : 'Offline' }),
        h('div', null, h('span', { class: 'nm' }, p.name), h('small', null, isOn ? (m.page ? `Online, page ${m.page}` : 'Online') : 'Offline')),
        h('div', { style: { display: 'flex' } },
          h('button', { class: 'x', title: 'Show only this student\'s ink', 'aria-label': `Show only ${p.name}'s ink`, 'aria-pressed': String(this.focusPerson === p.id), onclick: () => { this.focusPerson = this.focusPerson === p.id ? null : p.id; this.renderInk(); this.renderPeoplePanel(); } }, iconEl('eye', 18)),
          h('button', { class: 'x', title: 'Remove student', 'aria-label': `Remove ${p.name}`, onclick: () => this.removeStudent(p) }, iconEl('trash', 18))));
    });
    this.setSide(
      h('header', null, `People (${onl.length} online)`, h('button', { class: 'ib', 'aria-label': 'Close people', onclick: () => this.togglePanel('people') }, iconEl('close'))),
      h('div', { class: 'scroll' }, rows.length ? rows : h('p', { class: 'hint' }, 'No students have joined yet. Share the link or the code so they can type their name.')),
      this.focusPerson ? h('footer', null, h('button', { class: 'btn sm', onclick: () => { this.focusPerson = null; this.renderInk(); this.renderPeoplePanel(); } }, 'Show everyone\'s ink')) : null);
  }
  async removeStudent(p) {
    const ok = await confirmDialog({ title: `Remove ${p.name}?`, text: `${p.name} will be removed from this board and everything they wrote will be deleted. This cannot be undone.`, confirmLabel: 'Remove student', danger: true });
    if (!ok) return;
    const { error } = await this.sb.from('participants').delete().eq('id', p.id);
    if (error) return toast(friendlyError(error), 'bad');
    this.participants = this.participants.filter(x => x.id !== p.id);
    await this.store.resync(true); this.store.sendResync(); this.renderInk(); this.renderPeoplePanel();
    toast(`${p.name} was removed.`, 'ok');
  }

  // ===================================================================== dialogs (teacher)
  shareDialog() { return shareDialog({ sb: this.sb, store: this.store }); }

  clearDialog() {
    const doClear = all => {
      const ids = [];
      const pages = all ? this.store.pages.map(p => p.id) : [this.pageId];
      for (const pid of pages) for (const o of this.store.pageObjects(pid)) if (!o.deleted) ids.push(o.id);
      if (!ids.length) { toast('Nothing to clear.'); return; }
      this.store.setDeleted(ids, true); this.pushUndo({ t: 'delete', ids }); this.renderInk(); pages.forEach(p => this.thumbDirty(p));
      toast(`Cleared ${ids.length} mark${ids.length === 1 ? '' : 's'}. Undo brings them back.`, 'ok');
    };
    const m = modal({
      title: 'Clear the board?',
      body: h('p', null, 'This removes the writing of everyone, including students. You can press Undo straight afterwards to bring it back.'),
      actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'),
        h('button', { class: 'btn danger', onclick: () => { m.close(); doClear(false); } }, 'Clear this page'),
        h('button', { class: 'btn danger', onclick: () => { m.close(); doClear(true); } }, 'Clear all pages')],
    });
  }

  showRemoved() {
    this.root.replaceChildren(h('div', { class: 'entry' }, h('div', { class: 'side' },
      h('a', { class: 'brand big stack', href: BASE }, h('img', { class: 'mark', src: asset('img/logo-mark.png'), alt: '' }), h('img', { class: 'word', src: asset('img/logo-word.png'), alt: 'Bright EngMath' })),
      h('h1', null, 'You are not on this board any more'),
      h('p', { class: 'lead' }, 'Your teacher closed the link or removed you. Ask your teacher for the link again.'))));
    this.destroy();
  }
}
