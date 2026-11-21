// Teacher side: sign-in, dashboard (classes + boards), opening a board.
import { h, toast, modal, confirmDialog, copyText, asset, joinUrl, classUrl, classShareMessage, BASE, makeCodes, makeCode } from './util.js';
import { CONFIG } from '../config.js';
import { iconEl } from './icons.js';
import { makeClient, friendlyError } from './db.js';
import { Store } from './store.js';
import { BoardView } from './board.js';
import { ReviewView } from './review.js';
import { createBoard, deleteBoard, deleteClass, sourceForm } from './pages.js';

export const brand = (big = false) => h('a', { class: 'brand' + (big ? ' big stack' : ''), href: BASE, 'aria-label': 'Bright EngMath' },
  h('img', { class: 'mark', src: asset('img/logo-mark.png'), alt: '' }), h('img', { class: 'word', src: asset('img/logo-word.png'), alt: 'Bright EngMath' }));

// A drawing of the product itself: a ruled sheet with a few strokes, a text label and a red laser dot.
export function artSvg() {
  return h('div', { html: `<svg viewBox="0 0 520 600" role="img" aria-label="A worksheet page with handwriting and a red pointer dot">
    <rect x="46" y="40" width="428" height="520" fill="#fff" stroke="#1D2127" stroke-width="2"/>
    <rect x="58" y="52" width="428" height="520" fill="none"/>
    <g stroke="#B9CBE3" stroke-width="2">${[130, 176, 222, 268, 314, 360, 406, 452, 498].map(y => `<path d="M46 ${y}H474"/>`).join('')}</g>
    <path d="M100 40V560" stroke="#E8A9A4" stroke-width="2"/>
    <text x="118" y="116" font-family="Lexend, sans-serif" font-size="26" font-weight="600" fill="#1D2127">Unit 4 · Fractions</text>
    <path d="M122 168c18-20 30 18 48-2s28 16 46-2 26 14 44-2 30 14 44-2" fill="none" stroke="#1F5FBF" stroke-width="5" stroke-linecap="round"/>
    <path d="M122 214c14-18 26 14 40-2s24 16 40-2" fill="none" stroke="#1F5FBF" stroke-width="5" stroke-linecap="round"/>
    <rect x="122" y="256" width="150" height="62" fill="none" stroke="#D62F2F" stroke-width="5"/>
    <path d="M290 288h70" stroke="#D62F2F" stroke-width="5" stroke-linecap="round"/><path d="M346 272l16 16-16 16" fill="none" stroke="#D62F2F" stroke-width="5" stroke-linecap="round"/>
    <rect x="122" y="342" width="260" height="22" fill="#FFE45C" opacity=".6"/>
    <text x="124" y="360" font-family="Lexend, sans-serif" font-size="18" fill="#1D2127">half of eight is four</text>
    <text x="388" y="436" font-family="Lexend, sans-serif" font-size="26" fill="#1F8A4C">Mia</text>
    <path d="M122 440c30-30 60 20 90-6" fill="none" stroke="#1F8A4C" stroke-width="5" stroke-linecap="round"/>
    <path d="M300 520c20-20 40-30 60-36" stroke="#DC2626" stroke-width="8" stroke-linecap="round" opacity=".35" fill="none"/>
    <circle cx="364" cy="482" r="13" fill="#DC2626" stroke="#fff" stroke-width="2.5"/>
  </svg>` });
}

export class TeacherApp {
  constructor(root) {
    this.root = root; this.sb = makeClient('teacher');
    this.sel = 'all'; this.classes = []; this.boards = []; this.students = [];
    this.view = null;
  }

  async init() {
    addEventListener('hashchange', () => this.route());
    const { data: { session } } = await this.sb.auth.getSession();
    if (!session) return this.showLogin();
    const { data: ok, error } = await this.sb.rpc('is_teacher');
    if (error || !ok) { await this.sb.auth.signOut(); return this.showLogin('This account is not the teacher account.'); }
    this.route();
  }

  // ----------------------------------------------------------------- sign in
  showLogin(message = '') {
    this.leaveBoard();
    const email = h('input', { class: 'input', id: 'em', type: 'email', autocomplete: 'username', required: true, inputmode: 'email' });
    const pw = h('input', { class: 'input', id: 'pw', type: 'password', autocomplete: 'current-password', required: true });
    const err = h('p', { class: 'error', role: 'alert' }, message);
    const btn = h('button', { class: 'btn primary', type: 'submit', style: { width: '100%', minHeight: '52px' } }, 'Sign in');
    const form = h('form', { novalidate: true },
      h('div', { class: 'field' }, h('label', { for: 'em' }, 'Email'), email),
      h('div', { class: 'field' }, h('label', { for: 'pw' }, 'Password'), pw),
      err, btn,
      h('p', { style: { marginTop: '22px' } }, h('a', { href: '#/join' }, 'I am a student: enter a class code')));
    form.addEventListener('submit', async e => {
      e.preventDefault(); err.textContent = '';
      if (!email.value.trim() || !pw.value) { err.textContent = 'Type your email and password.'; return; }
      btn.disabled = true; btn.textContent = 'Signing in…';
      const { error } = await this.sb.auth.signInWithPassword({ email: email.value.trim(), password: pw.value });
      if (error) { err.textContent = /Invalid login/i.test(error.message) ? 'That email or password is not right.' : friendlyError(error); btn.disabled = false; btn.textContent = 'Sign in'; return; }
      const { data: ok } = await this.sb.rpc('is_teacher');
      if (!ok) { await this.sb.auth.signOut(); err.textContent = 'This account is not the teacher account.'; btn.disabled = false; btn.textContent = 'Sign in'; return; }
      this.route();
    });
    this.root.replaceChildren(h('div', { class: 'entry' },
      h('div', { class: 'side' }, brand(true), h('div', null, h('h1', null, 'Teacher sign in'), h('p', { class: 'lead', style: { marginTop: '10px' } }, 'Your classroom board: upload a worksheet, send the link, and everyone writes on the same page.')), form),
      h('div', { class: 'art', 'aria-hidden': 'true' }, artSvg())));
    email.focus();
  }

  async signOut() { await this.sb.auth.signOut(); this.showLogin(); }

  leaveBoard() { if (this.view) { this.view.destroy(); this.view = null; } }

  // ----------------------------------------------------------------- routing
  route() {
    const m = location.hash.match(/^#\/board\/([0-9a-f-]{36})/);
    if (m) this.openBoard(m[1]); else { this.leaveBoard(); this.showDashboard(); }
  }

  async openBoard(id) {
    this.leaveBoard();
    this.root.replaceChildren(h('div', { class: 'entry' }, h('div', { class: 'side' }, brand(true), h('p', { class: 'lead' }, 'Opening your board…'))));
    try {
      const store = new Store(this.sb, { boardId: id, role: 'teacher', name: 'Teacher' });
      await store.load(); await store.connect();
      const onExit = () => { location.hash = ''; };
      if (store.mode === 'assignment') { this.view = new ReviewView({ sb: this.sb, store, root: this.root, onExit }); await this.view.start(); }
      else { this.view = new BoardView({ sb: this.sb, store, role: 'teacher', root: this.root, onExit }); this.view.start(); }
    } catch (e) {
      console.error(e);
      this.root.replaceChildren(h('div', { class: 'entry' }, h('div', { class: 'side' }, brand(true),
        h('div', { class: 'notice bad' }, e.message === 'NO_ACCESS' ? 'This board was not found. It may have been deleted.' : friendlyError(e)),
        h('a', { class: 'btn', href: '#' }, 'Back to my boards'))));
    }
  }

  // ----------------------------------------------------------------- dashboard
  async loadAll() {
    const [c, b, s] = await Promise.all([
      this.sb.from('classes').select('*').order('name'),
      this.sb.from('boards').select('*, pages(count), classes(name)').order('created_at', { ascending: false }),
      this.sb.from('class_students').select('*').order('first_name'),
    ]);
    const err = c.error || b.error || s.error;
    if (err) throw err;
    this.classes = c.data; this.boards = b.data; this.students = s.data;
    if (this.sel !== 'all' && !this.classes.some(x => x.id === this.sel)) this.sel = 'all';
  }

  async showDashboard() {
    if (!this.dash) this.root.replaceChildren(h('div', { class: 'dash' }, h('div', { class: 'dash-top' }, brand()), h('p', { class: 'empty' }, 'Loading your boards…')));
    try { await this.loadAll(); } catch (e) {
      this.root.replaceChildren(h('div', { class: 'entry' }, h('div', { class: 'side' }, brand(true), h('div', { class: 'notice bad' }, 'Could not load your boards. ' + friendlyError(e)), h('button', { class: 'btn primary', onclick: () => this.showDashboard() }, 'Try again'), h('button', { class: 'btn', onclick: () => this.signOut() }, 'Sign out'))));
      return;
    }
    this.dash = true; this.renderDashboard();
  }

  renderDashboard() {
    const tabs = [h('button', { class: 'tab', 'aria-current': String(this.sel === 'all'), onclick: () => { this.sel = 'all'; this.renderDashboard(); } }, 'All boards', h('span', { class: 'n' }, this.boards.length))];
    this.classes.forEach((c, ci) => {
      const n = this.boards.filter(b => b.class_id === c.id).length;
      tabs.push(h('button', { class: 'tab c' + (ci % 5 + 1), 'aria-current': String(this.sel === c.id), onclick: () => { this.sel = c.id; this.renderDashboard(); } }, c.name, h('span', { class: 'n' }, n)));
    });
    const side = h('aside', { class: 'dash-side', 'aria-label': 'Classes' }, h('h2', null, 'Classes'), tabs,
      h('button', { class: 'btn sm add', onclick: () => this.newClassDialog() }, iconEl('plus', 18), 'New class'));

    const main = h('main', { class: 'dash-main' });
    const cls = this.classes.find(c => c.id === this.sel);
    const list = this.boards.filter(b => this.sel === 'all' || b.class_id === this.sel);
    if (!this.classes.length) {
      main.append(h('section', { class: 'sheet-panel start' },
        h('header', null, h('h2', null, 'Start here')),
        h('ol', { class: 'start-steps' },
          h('li', null, h('span', { class: 'n n1' }, '1'), h('div', null, h('b', null, 'Make a class'), h('p', { class: 'hint' }, 'One class for each group you teach, like "Grade 4 Math".'))),
          h('li', null, h('span', { class: 'n n2' }, '2'), h('div', null, h('b', null, 'Add your students'), h('p', { class: 'hint' }, 'Type first names. Each student gets their own 4-number code.'))),
          h('li', null, h('span', { class: 'n n3' }, '3'), h('div', null, h('b', null, 'Add boards to the class'), h('p', { class: 'hint' }, 'Every student sees their own copy of each board on one class page.')))),
        h('div', { style: { padding: '0 18px 18px' } }, h('button', { class: 'btn primary', onclick: () => this.newClassDialog() }, iconEl('plus', 18), 'Make my first class'))));
    }
    if (cls) {
      main.append(this.classPanel(cls), this.classLinkPanel(cls));
    }
    if (this.classes.length || list.length) {
      main.append(h('section', { class: 'sheet-panel' },
        h('header', null, h('h2', null, cls ? 'Step 2: boards in this class' : 'All boards'), h('button', { class: 'btn primary', onclick: () => this.newBoardDialog() }, iconEl('plus', 18), 'New board')),
        list.length ? list.map(b => this.boardRow(b)) : h('div', { class: 'empty' }, h('b', null, 'No boards yet. '), cls && !this.students.some(s => s.class_id === cls.id) ? 'Add your students above first, then press New board.' : 'Press New board, then upload a PDF or start with a blank page. Students find it on their class page.')));
      if (cls) { const pp = this.progressPanel(cls); if (pp) main.append(pp); }
    }

    this.root.replaceChildren(h('div', { class: 'dash' },
      h('div', { class: 'dash-top' }, brand(), h('div', { class: 'who' }, h('span', null, 'Teacher'), h('button', { class: 'btn sm', onclick: () => this.signOut() }, iconEl('logout', 18), 'Sign out'))),
      h('div', { class: 'dash-body' }, side, main)));
  }

  boardRow(b) {
    const pages = (b.pages && b.pages[0] && b.pages[0].count) || 0, link = joinUrl(b.code);
    const sw = h('button', { class: 'switch', role: 'switch', 'aria-checked': String(b.link_enabled), 'aria-label': 'Student link on or off', title: 'Turn the student link on or off' }, h('span', { class: 'box' }), h('span', null, b.link_enabled ? 'Link on' : 'Link off'));
    sw.addEventListener('click', async () => {
      const val = !b.link_enabled;
      const { error } = await this.sb.from('boards').update({ link_enabled: val }).eq('id', b.id);
      if (error) return toast(friendlyError(error), 'bad');
      b.link_enabled = val; sw.setAttribute('aria-checked', String(val)); sw.lastChild.textContent = val ? 'Link on' : 'Link off';
    });
    return h('div', { class: 'board-row' + (b.mode === 'assignment' ? ' assign' : '') },
      h('div', null,
        h('button', { class: 'title', onclick: () => { location.hash = '#/board/' + b.id; } }, b.title),
        h('div', { class: 'meta' }, b.mode === 'assignment' ? h('span', { class: 'tag assign' }, 'Assignment') : h('span', { class: 'tag live' }, 'Live class'), b.mode === 'assignment' && b.due_at ? h('span', null, 'Due ' + new Date(b.due_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : null, b.classes && b.classes.name ? h('span', null, b.classes.name) : null, h('span', null, `${pages} page${pages === 1 ? '' : 's'}`), h('span', null, 'Code ', h('b', null, b.code)), h('span', null, new Date(b.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })))),
      h('div', { class: 'acts' }, sw,
        h('button', { class: 'btn sm', onclick: async () => toast((await copyText(link)) ? 'Student link copied.' : 'Could not copy. Open the board and use Share.', 'ok') }, iconEl('copy', 18), 'Copy link'),
        h('button', { class: 'btn sm primary', onclick: () => { location.hash = '#/board/' + b.id; } }, 'Open'),
        h('button', { class: 'btn sm danger', 'aria-label': `Delete ${b.title}`, onclick: () => this.deleteBoardDialog(b) }, iconEl('trash', 18))));
  }

  classPanel(cls) {
    const mine = this.students.filter(s => s.class_id === cls.id);
    const input = h('input', { class: 'input', placeholder: 'First names, like: Mia, Ben, Nok', 'aria-label': 'Add student first names' });
    const taken = () => new Set(mine.map(s => s.code).filter(Boolean));
    const refresh = async () => { await this.loadAll(); this.renderDashboard(); };
    const add = async () => {
      const have = new Set(mine.map(s => s.first_name.toLowerCase()));
      const names = [...new Set(input.value.split(/[,\n;]+/).map(s => s.trim().slice(0, 24)).filter(Boolean))].filter(n => !have.has(n.toLowerCase()));
      if (!names.length) { toast('Type new first names, separated by commas.'); return; }
      const codes = makeCodes(names.length, taken());
      const { error } = await this.sb.from('class_students').insert(names.map((n, i) => ({ class_id: cls.id, first_name: n, code: codes[i] })));
      if (error) return toast(friendlyError(error), 'bad');
      input.value = ''; toast(`${names.length} student${names.length === 1 ? '' : 's'} added, each with a 4-number code.`, 'ok'); await refresh();
    };
    const fillMissing = async () => {
      const miss = mine.filter(s => !s.code), codes = makeCodes(miss.length, taken());
      for (let i = 0; i < miss.length; i++) await this.sb.from('class_students').update({ code: codes[i] }).eq('id', miss[i].id);
      await refresh();
    };
    const renewAll = async () => {
      const ok = await confirmDialog({ title: 'Make new codes for everyone?', text: 'Every student gets a new 4-number code. Students who already opened their work on a device keep their access there, but the old codes stop working on other devices.', confirmLabel: 'Make new codes' });
      if (!ok) return;
      const codes = makeCodes(mine.length);
      for (let i = 0; i < mine.length; i++) await this.sb.from('class_students').update({ code: codes[i] }).eq('id', mine[i].id);
      await refresh();
    };
    const editCode = s => {
      const inp = h('input', { class: 'input big', id: 'ec', value: s.code || '', inputmode: 'numeric', maxlength: '4', style: { letterSpacing: '.3em', textAlign: 'center', width: '200px' } });
      inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 4); });
      const err = h('p', { class: 'error', role: 'alert' });
      const save = async (v) => {
        if (!/^\d{4}$/.test(v)) { err.textContent = 'A code is 4 numbers.'; return; }
        if (mine.some(o => o.id !== s.id && o.code === v)) { err.textContent = 'Another student already has this code. Pick a different one.'; return; }
        const { error } = await this.sb.from('class_students').update({ code: v }).eq('id', s.id);
        if (error) { err.textContent = friendlyError(error); return; }
        m.close(); await refresh();
      };
      const m = modal({ title: `${s.first_name}: code`, body: h('div', null, h('div', { class: 'field' }, h('label', { for: 'ec' }, '4-number code'), inp), err),
        actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'btn', onclick: () => save(makeCodes(1, taken())[0]) }, 'Random code'), h('button', { class: 'btn primary', onclick: () => save(inp.value) }, 'Save')] });
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    const missing = mine.filter(s => !s.code).length;
    const COL = ['c1', 'c2', 'c3', 'c4', 'c5'];
    return h('section', { class: 'sheet-panel' },
      h('header', null, h('h2', null, `Step 1: students in ${cls.name}`),
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          h('button', { class: 'btn sm', onclick: () => this.renameClass(cls) }, 'Rename class'),
          h('button', { class: 'btn sm danger', onclick: () => this.deleteClassDialog(cls) }, iconEl('trash', 18), 'Delete class'))),
      mine.length ? h('div', { class: 'roster-grid' }, mine.map((s, i) => h('div', { class: 'rs-card ' + COL[i % COL.length] },
        h('b', { class: 'nm' }, s.first_name),
        s.code ? h('button', { class: 'code', title: 'Change code', 'aria-label': `${s.first_name}'s code ${s.code}. Change it`, onclick: () => editCode(s) }, s.code) : h('button', { class: 'btn sm', onclick: () => editCode(s) }, 'Make code'),
        h('button', { class: 'x', 'aria-label': `Remove ${s.first_name}`, onclick: async () => { const ok = await confirmDialog({ title: `Remove ${s.first_name}?`, text: 'This removes the name from the class list. Work they already did on boards stays until you delete it.', confirmLabel: 'Remove', danger: true }); if (!ok) return; const { error } = await this.sb.from('class_students').delete().eq('id', s.id); if (error) return toast(friendlyError(error), 'bad'); await refresh(); } }, iconEl('close', 16)))))
        : h('p', { class: 'empty' }, h('b', null, 'No students yet. '), 'Type first names below. Each student gets a 4-number code. On a board of this class, students tap their own name and type their code, so nobody can open another student\'s work.'),
      mine.length ? h('div', { class: 'roster-acts' },
        missing ? h('button', { class: 'btn sm primary', onclick: fillMissing }, `Make codes for ${missing}`) : null,
        h('button', { class: 'btn sm', onclick: async () => toast((await copyText(mine.map(s => `${s.first_name}: ${s.code || '-'}`).join('\n'))) ? 'Names and codes copied.' : 'Could not copy.', 'ok') }, iconEl('copy', 16), 'Copy names and codes'),
        h('button', { class: 'btn sm', onclick: renewAll }, 'New codes for everyone')) : null,
      h('div', { class: 'add-students' }, input, h('button', { class: 'btn', onclick: add }, 'Add names')));
  }

  classLinkPanel(cls) {
    const link = classUrl(cls.code), teacher = CONFIG.TEACHER_NAME || 'Teacher';
    const copy = async (text, ok) => toast((await copyText(text)) ? ok : 'Could not copy.', 'ok');
    const mine = this.students.filter(s => s.class_id === cls.id && s.code);
    return h('section', { class: 'sheet-panel' },
      h('header', null, h('h2', null, 'Class page for your students')),
      h('div', { class: 'class-link' },
        h('p', null, 'Send this link ', h('b', null, 'once'), '. Students tap their name, type their code, and see all their boards. New boards appear there by themselves, so nobody gets confused.'),
        h('div', { class: 'sc-link' }, link),
        h('div', { class: 'share-actions' },
          h('button', { class: 'btn primary', onclick: () => copy(classShareMessage({ name: cls.name, link, teacher }), 'Message copied. Paste it into LINE, Zoom or Meet.') }, iconEl('copy', 18), 'Copy message for the class'),
          h('button', { class: 'btn', onclick: () => copy(link, 'Link copied.') }, iconEl('link', 18), 'Copy link only')),
        mine.length ? h('details', { class: 'per-student' }, h('summary', null, 'Messages for each student (with their code)'),
          h('div', { class: 'code-list' }, mine.map((s, i) => h('div', { class: 'code-row c' + (i % 5 + 1) }, h('span', { class: 'nm' }, s.first_name), h('b', { class: 'cd' }, s.code),
            h('button', { class: 'btn sm', onclick: () => copy(classShareMessage({ name: cls.name, link, teacher, student: s.first_name, code: s.code }), `Message for ${s.first_name} copied.`) }, iconEl('copy', 16), 'Copy'))))) : null));
  }

  // who has started / sent which assignment of this class
  progressPanel(cls) {
    const boards = this.boards.filter(b => b.class_id === cls.id && b.mode === 'assignment').slice(0, 12).reverse();
    const mine = this.students.filter(s => s.class_id === cls.id);
    if (!boards.length || !mine.length) return null;
    const host = h('div', { class: 'progress-wrap' }, h('p', { class: 'empty' }, 'Loading…'));
    const panel = h('section', { class: 'sheet-panel' }, h('header', null, h('h2', null, 'Who has done what')), host);
    this.sb.from('participants').select('board_id,name,submitted_at,score,comment').in('board_id', boards.map(b => b.id)).then(({ data, error }) => {
      if (error) { host.replaceChildren(h('p', { class: 'empty' }, friendlyError(error))); return; }
      const key = (b, n) => b + '|' + n.toLowerCase(), by = new Map((data || []).map(p => [key(p.board_id, p.name), p]));
      const cell = (b, s) => {
        const p = by.get(key(b.id, s.first_name));
        let cls2 = 'new', txt = 'Not started';
        if (p) { if (p.submitted_at && (p.score || p.comment)) { cls2 = 'checked'; txt = p.score ? `Score ${p.score}` : 'Checked'; } else if (p.submitted_at) { cls2 = 'sent'; txt = 'Sent'; } else { cls2 = 'working'; txt = 'Working'; } }
        return h('td', null, h('button', { class: 'pg-chip ' + cls2, title: `${s.first_name}: ${b.title}`, onclick: () => { location.hash = '#/board/' + b.id; } }, txt));
      };
      host.replaceChildren(h('div', { class: 'tbl-scroll' }, h('table', { class: 'prog' },
        h('thead', null, h('tr', null, h('th', null, 'Student'), boards.map(b => h('th', { title: b.title }, h('button', { class: 'quiet-link', onclick: () => { location.hash = '#/board/' + b.id; } }, b.title))))),
        h('tbody', null, mine.map(s => h('tr', null, h('th', { scope: 'row' }, s.first_name), boards.map(b => cell(b, s))))))));
    });
    return panel;
  }

  newClassDialog() {
    const name = h('input', { class: 'input', id: 'cn', placeholder: 'Example: Grade 4 Math, Tuesday', maxlength: '80' });
    const err = h('p', { class: 'error', role: 'alert' });
    const save = async () => {
      if (!name.value.trim()) { err.textContent = 'Give the class a name.'; return; }
      let data = null, error = null;
      for (let i = 0; i < 6 && !data; i++) { const r = await this.sb.from('classes').insert({ name: name.value.trim(), code: makeCode(6) }).select().single(); if (!r.error) data = r.data; else if (r.error.code !== '23505') { error = r.error; break; } }
      if (!data && !error) error = new Error('Could not make a class code. Try again.');
      if (error) { err.textContent = friendlyError(error); return; }
      m.close(); this.sel = data.id; await this.loadAll(); this.renderDashboard();
    };
    name.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
    const m = modal({ title: 'New class', body: h('div', null, h('div', { class: 'field' }, h('label', { for: 'cn' }, 'Class name'), name), err), actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: save }, 'Create class')] });
  }

  renameClass(cls) {
    const name = h('input', { class: 'input', id: 'rn', value: cls.name, maxlength: '80' });
    const save = async () => {
      if (!name.value.trim()) return;
      const { error } = await this.sb.from('classes').update({ name: name.value.trim() }).eq('id', cls.id);
      if (error) return toast(friendlyError(error), 'bad');
      m.close(); await this.loadAll(); this.renderDashboard();
    };
    name.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
    const m = modal({ title: 'Rename class', body: h('div', { class: 'field' }, h('label', { for: 'rn' }, 'Class name'), name), actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: save }, 'Save')] });
  }

  async deleteClassDialog(cls) {
    const n = this.boards.filter(b => b.class_id === cls.id).length;
    const ok = await confirmDialog({ title: `Delete class "${cls.name}"?`, text: `This deletes the class, its student list, ${n} board${n === 1 ? '' : 's'}, all uploaded files and everything students wrote. This cannot be undone.`, confirmLabel: 'Delete class and everything in it', danger: true });
    if (!ok) return;
    try { await deleteClass(this.sb, cls.id); this.sel = 'all'; await this.loadAll(); this.renderDashboard(); toast('Class deleted.', 'ok'); } catch (e) { toast(friendlyError(e), 'bad'); }
  }

  async deleteBoardDialog(b) {
    const ok = await confirmDialog({ title: `Delete "${b.title}"?`, text: 'This deletes the board, its pages, the uploaded files and everything students wrote. This cannot be undone.', confirmLabel: 'Delete board', danger: true });
    if (!ok) return;
    try { await deleteBoard(this.sb, b.id); await this.loadAll(); this.renderDashboard(); toast('Board deleted.', 'ok'); } catch (e) { toast(friendlyError(e), 'bad'); }
  }

  newBoardDialog() {
    const title = h('input', { class: 'input', id: 'bt', placeholder: 'Example: Fractions worksheet 4', maxlength: '120' });
    if (!this.classes.length) {
      const m0 = modal({ title: 'Make a class first', body: h('p', null, 'Boards belong to a class so that every student finds their own boards on one page. Make a class and add your students first, then add boards.'), actions: [h('button', { class: 'btn', onclick: () => m0.close() }, 'Close'), h('button', { class: 'btn primary', onclick: () => { m0.close(); this.newClassDialog(); } }, 'Make a class')] });
      return;
    }
    const clsSel = h('select', { class: 'select', id: 'bc' }, this.classes.map(c => h('option', { value: c.id, selected: c.id === (this.sel !== 'all' ? this.sel : this.classes[0].id) }, c.name)));
    const form = sourceForm({ defaultSource: 'pdf' });
    let mode = 'live';
    const startIn = h('input', { class: 'input', id: 'bs', type: 'datetime-local' }), dueIn = h('input', { class: 'input', id: 'bd', type: 'datetime-local' });
    const dates = h('div', { hidden: true }, h('div', { class: 'field' }, h('label', { for: 'bs' }, 'Opens at (optional)'), startIn), h('div', { class: 'field' }, h('label', { for: 'bd' }, 'Due at (optional)'), dueIn, h('span', { class: 'hint' }, 'After the due time students can still look but cannot change their work.')));
    const modeHint = h('span', { class: 'hint' });
    const modeSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Type of board' });
    const drawMode = () => {
      modeSeg.replaceChildren(...[['live', 'Live class'], ['assignment', 'Assignment']].map(([k, label]) => h('button', { type: 'button', 'aria-pressed': String(mode === k), onclick: () => { mode = k; drawMode(); } }, label)));
      dates.hidden = mode !== 'assignment';
      modeHint.textContent = mode === 'live' ? 'Everyone writes on the same page at the same time.' : 'Every student gets a private copy. You check it, write feedback and give a score.';
    };
    drawMode();
    const bar = h('div', { class: 'progress', hidden: true }, h('div'));
    const msg = h('p', { class: 'hint', style: { marginTop: '8px' } });
    const err = h('p', { class: 'error', role: 'alert' });
    const go = h('button', { class: 'btn primary' }, 'Create board');
    const m = modal({
      title: 'New board',
      body: h('div', null,
        h('div', { class: 'field' }, h('label', { for: 'bt' }, 'Board name'), title),
        h('div', { class: 'field' }, h('label', { for: 'bc' }, 'Class'), clsSel),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Type'), modeSeg, modeHint), dates,
        form.el, bar, msg, err),
      actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), go],
    });
    go.addEventListener('click', async () => {
      err.textContent = '';
      if (!title.value.trim()) { err.textContent = 'Give the board a name.'; title.focus(); return; }
      go.disabled = true; bar.hidden = false;
      try {
        const s0 = startIn.value ? new Date(startIn.value).toISOString() : null, d0 = dueIn.value ? new Date(dueIn.value).toISOString() : null;
        if (mode === 'assignment' && s0 && d0 && new Date(d0) <= new Date(s0)) throw new Error('The due time must be after the start time.');
        const b = await createBoard(this.sb, { title: title.value.trim(), classId: clsSel.value, spec: form.spec(), mode, startsAt: mode === 'assignment' ? s0 : null, dueAt: mode === 'assignment' ? d0 : null }, (t, f) => { msg.textContent = t; bar.firstChild.style.width = Math.round(f * 100) + '%'; });
        m.close(); location.hash = '#/board/' + b.id;
      } catch (e) { console.error(e); err.textContent = friendlyError(e); go.disabled = false; bar.hidden = true; }
    });
  }
}
