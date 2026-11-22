// Teacher side: sign-in, dashboard (classes + boards), opening a board.
import { h, toast, modal, confirmDialog, copyText, asset, joinUrl, classUrl, studentUrl, classShareMessage, studentPageMessage, BASE, makeCodes, makeCode } from './util.js';
import { CONFIG } from '../config.js';
import { iconEl } from './icons.js';
import { makeClient, friendlyError } from './db.js';
import { Store } from './store.js';
import { BoardView } from './board.js';
import { ReviewView } from './review.js';
import { createBoard, deleteBoard, deleteClass, sourceForm } from './pages.js';
import { boardStudentsDialog, checklist } from './members.js';
import { appDialog, giveAppsDialog, giveToStudentsDialog, previewDialog } from './shelf.js';

const TILE5 = ['c1', 'c2', 'c3', 'c4', 'c5'];
const cleanNames = text => [...new Set(String(text || '').split(/[,\n;]+/).map(s => s.trim().replace(/\s+/g, ' ').slice(0, 24)).filter(Boolean))];

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
    this.master = []; this.members = new Map(); this.apps = []; this.appLinks = new Map();   // appLinks: app id -> set of student ids   // master = the one list of students; members = board id -> set of student ids
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
    const [c, b, s, ms, bm, ap, sa] = await Promise.all([
      this.sb.from('classes').select('*').order('name'),
      this.sb.from('boards').select('*, pages(count), classes(name)').order('created_at', { ascending: false }),
      this.sb.from('class_students').select('*').order('first_name'),
      this.sb.from('students').select('*').order('first_name'),
      this.sb.from('board_students').select('board_id,student_id'),
      this.sb.from('apps').select('*').order('created_at', { ascending: false }),
      this.sb.from('student_apps').select('app_id,student_id'),
    ]);
    const err = c.error || b.error || s.error || ms.error || bm.error || ap.error || sa.error;
    if (err) throw err;
    this.classes = c.data; this.boards = b.data; this.students = s.data; this.master = ms.data;
    this.apps = ap.data;
    this.appLinks = new Map();
    (sa.data || []).forEach(r => { if (!this.appLinks.has(r.app_id)) this.appLinks.set(r.app_id, new Set()); this.appLinks.get(r.app_id).add(r.student_id); });
    this.members = new Map();
    (bm.data || []).forEach(r => { if (!this.members.has(r.board_id)) this.members.set(r.board_id, new Set()); this.members.get(r.board_id).add(r.student_id); });
    if (this.sel.startsWith('stu:')) { if (!this.master.some(x => 'stu:' + x.id === this.sel)) this.sel = 'students'; }
    else if (this.sel !== 'all' && this.sel !== 'students' && this.sel !== 'apps' && !this.classes.some(x => x.id === this.sel)) this.sel = 'all';
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
    const side = h('aside', { class: 'dash-side', 'aria-label': 'Classes' },
      h('h2', null, 'My students'),
      h('button', { class: 'tab stu', 'aria-current': String(this.sel === 'students'), onclick: () => { this.sel = 'students'; this.renderDashboard(); } }, 'All my students', h('span', { class: 'n' }, this.master.length)),
      this.master.map((m, i) => h('button', { class: 'tab c' + (i % 5 + 1), 'aria-current': String(this.sel === 'stu:' + m.id), onclick: () => { this.sel = 'stu:' + m.id; this.renderDashboard(); } }, m.first_name, h('span', { class: 'n' }, this.boardsOfStudent(m).length))),
      h('button', { class: 'tab stu', 'aria-current': String(this.sel === 'apps'), onclick: () => { this.sel = 'apps'; this.renderDashboard(); } }, 'App shelf', h('span', { class: 'n' }, this.apps.length)),
      h('h2', { style: { marginTop: '14px' } }, 'Classes'), tabs,
      h('button', { class: 'btn sm add', onclick: () => this.newClassDialog() }, iconEl('plus', 18), 'New class'));

    const main = h('main', { class: 'dash-main' });
    const stu = this.sel.startsWith('stu:') ? this.master.find(x => 'stu:' + x.id === this.sel) : null;
    if (this.sel === 'students' || this.sel === 'apps' || stu) {
      if (stu) main.append(...this.studentPagePanels(stu)); else if (this.sel === 'apps') main.append(this.appsPanel()); else main.append(this.studentsPanel());
      this.root.replaceChildren(h('div', { class: 'dash' },
        h('div', { class: 'dash-top' }, brand(), h('div', { class: 'who' }, h('span', null, 'Teacher'), h('button', { class: 'btn sm', onclick: () => this.signOut() }, iconEl('logout', 18), 'Sign out'))),
        h('div', { class: 'dash-body' }, side, main)));
      return;
    }
    const cls = this.classes.find(c => c.id === this.sel);
    const list = this.boards.filter(b => this.sel === 'all' || b.class_id === this.sel);
    if (!this.classes.length) {
      main.append(h('section', { class: 'sheet-panel start' },
        h('header', null, h('h2', null, 'Start here')),
        h('ol', { class: 'start-steps' },
          h('li', null, h('span', { class: 'n n1' }, '1'), h('div', null, h('b', null, 'Make a class'), h('p', { class: 'hint' }, 'One class for each group you teach, like "Grade 4 Math".'))),
          h('li', null, h('span', { class: 'n n2' }, '2'), h('div', null, h('b', null, 'Add your students'), h('p', { class: 'hint' }, 'Tick students from your list, or type new first names. Each student keeps the same 4-number code in every class.'))),
          h('li', null, h('span', { class: 'n n3' }, '3'), h('div', null, h('b', null, 'Add boards to the class'), h('p', { class: 'hint' }, 'Every student sees their own copy of each board on one class page.')))),
        h('div', { style: { padding: '0 18px 18px' } }, h('button', { class: 'btn primary', onclick: () => this.newClassDialog() }, iconEl('plus', 18), 'Make my first class'))));
    }
    if (cls) {
      main.append(this.classPanel(cls), this.classLinkPanel(cls));
    }
    if (this.classes.length || list.length) {
      main.append(h('section', { class: 'sheet-panel' },
        h('header', null, h('h2', null, cls ? 'Step 2: boards in this class' : 'All boards'), h('button', { class: 'btn primary', onclick: () => this.newBoardDialog() }, iconEl('plus', 18), 'New board')),
        list.length ? list.map(b => this.boardRow(b)) : h('div', { class: 'empty' }, h('b', null, 'No boards yet. '), cls && !this.students.some(s => s.class_id === cls.id) ? 'Add your students above first, then press New board and tick who it is for.' : 'Press New board, then upload a PDF or start with a blank page. Students find it on their class page.')));
      if (cls) { const pp = this.progressPanel(cls); if (pp) main.append(pp); }
    }

    this.root.replaceChildren(h('div', { class: 'dash' },
      h('div', { class: 'dash-top' }, brand(), h('div', { class: 'who' }, h('span', null, 'Teacher'), h('button', { class: 'btn sm', onclick: () => this.signOut() }, iconEl('logout', 18), 'Sign out'))),
      h('div', { class: 'dash-body' }, side, main)));
  }

  boardRow(b, extra = null) {
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
        h('div', { class: 'meta' }, b.mode === 'assignment' ? h('span', { class: 'tag assign' }, 'Assignment') : h('span', { class: 'tag live' }, 'Live class'), b.mode === 'assignment' && b.due_at ? h('span', null, 'Due ' + new Date(b.due_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : null, b.classes && b.classes.name ? h('span', null, b.classes.name) : null, h('span', null, `${pages} page${pages === 1 ? '' : 's'}`), h('span', null, 'Code ', h('b', null, b.code)), h('span', null, new Date(b.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }))),
        this.whoLine(b), extra),
      h('div', { class: 'acts' }, sw,
        b.class_id ? h('button', { class: 'btn sm', title: 'Choose which students this board is for', onclick: () => boardStudentsDialog({ sb: this.sb, board: b, onSaved: async () => { await this.loadAll(); this.renderDashboard(); } }) }, 'Students') : null,
        h('button', { class: 'btn sm', onclick: async () => toast((await copyText(link)) ? 'Student link copied.' : 'Could not copy. Open the board and use Share.', 'ok') }, iconEl('copy', 18), 'Copy link'),
        h('button', { class: 'btn sm primary', onclick: () => { location.hash = '#/board/' + b.id; } }, 'Open'),
        h('button', { class: 'btn sm danger', 'aria-label': `Delete ${b.title}`, onclick: () => this.deleteBoardDialog(b) }, iconEl('trash', 18))));
  }

  // ----------------------------------------------------------------- students: one list, fixed codes
  async refresh() { await this.loadAll(); this.renderDashboard(); }

  // make sure every typed name is on the master list (a new name gets a new, never-used code); returns the student rows
  async ensureStudents(names) {
    const have = new Map(this.master.map(s => [s.first_name.toLowerCase(), s]));
    const out = [], fresh = names.filter(n => !have.has(n.toLowerCase()));
    names.forEach(n => { if (have.has(n.toLowerCase())) out.push(have.get(n.toLowerCase())); });
    if (fresh.length) {
      const codes = makeCodes(fresh.length, new Set(this.master.map(s => s.code)));
      const { data, error } = await this.sb.from('students').insert(fresh.map((n, i) => ({ first_name: n, code: codes[i] }))).select();
      if (error) throw error;
      out.push(...data); this.master = [...this.master, ...data];
    }
    return out;
  }

  // put students of the list into a class (a student already in it is skipped)
  async addToClass(cls, studentIds) {
    const inClass = new Set(this.students.filter(s => s.class_id === cls.id).map(s => s.student_id));
    const rows = studentIds.filter(id => !inClass.has(id)).map(id => this.master.find(s => s.id === id)).filter(Boolean)
      .map(s => ({ class_id: cls.id, student_id: s.id, first_name: s.first_name, code: s.code }));
    if (!rows.length) return 0;
    const { error } = await this.sb.from('class_students').insert(rows);
    if (error) throw error;
    return rows.length;
  }

  editCode(s) {
    const inp = h('input', { class: 'input big', id: 'ec', value: s.code || '', inputmode: 'numeric', maxlength: '4', style: { letterSpacing: '.3em', textAlign: 'center', width: '200px' } });
    inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 4); });
    const err = h('p', { class: 'error', role: 'alert' });
    const save = async v => {
      if (!/^\d{4}$/.test(v)) { err.textContent = 'A code is 4 numbers.'; return; }
      if (this.master.some(o => o.id !== s.id && o.code === v)) { err.textContent = 'Another student already has this code. Pick a different one.'; return; }
      const { error } = await this.sb.from('students').update({ code: v }).eq('id', s.id);
      if (error) { err.textContent = friendlyError(error); return; }
      m.close(); await this.refresh();
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') save(inp.value); });
    const m = modal({ title: `${s.first_name}: code`, body: h('div', null, h('p', { class: 'hint', style: { marginBottom: '10px' } }, 'This code stays the same in every class and on every board.'), h('div', { class: 'field' }, h('label', { for: 'ec' }, '4-number code'), inp), err),
      actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'btn', onclick: () => save(makeCodes(1, new Set(this.master.map(o => o.code)))[0]) }, 'Random code'), h('button', { class: 'btn primary', onclick: () => save(inp.value) }, 'Save')] });
  }

  // the one list of all my students
  studentsPanel() {
    const input = h('input', { class: 'input', placeholder: 'First names, like: Mia, Ben, Nok', 'aria-label': 'Add student first names' });
    const add = async () => {
      const names = cleanNames(input.value), have = new Set(this.master.map(s => s.first_name.toLowerCase())), fresh = names.filter(n => !have.has(n.toLowerCase()));
      if (!names.length) { toast('Type first names, separated by commas.'); return; }
      if (!fresh.length) { toast('Those students are already on your list.'); return; }
      try { await this.ensureStudents(fresh); } catch (e) { return toast(friendlyError(e), 'bad'); }
      input.value = ''; toast(`${fresh.length} student${fresh.length === 1 ? '' : 's'} added, each with a code that never changes.`, 'ok'); await this.refresh();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    const classesOf = s => this.classes.filter(c => this.students.some(x => x.class_id === c.id && x.student_id === s.id)).map(c => c.name);
    const remove = async s => {
      const own = this.boards.filter(b => !b.class_id && this.members.get(b.id) && this.members.get(b.id).has(s.id));
      const ok = await confirmDialog({ title: `Remove ${s.first_name}?`, text: 'This removes the student from your list, from every class and from every board.' + (own.length ? ` Their own page has ${own.length} board${own.length === 1 ? '' : 's'} made only for ${s.first_name}. ${own.length === 1 ? 'It is' : 'They are'} deleted too, with everything ${s.first_name} wrote. This cannot be undone.` : ' Work they already did on class boards stays until you delete the board.'), confirmLabel: own.length ? 'Remove and delete their boards' : 'Remove', danger: true });
      if (!ok) return;
      try { for (const b of own) await deleteBoard(this.sb, b.id); } catch (e) { return toast(friendlyError(e), 'bad'); }
      const { error } = await this.sb.from('students').delete().eq('id', s.id);
      if (error) return toast(friendlyError(error), 'bad');
      await this.refresh();
    };
    return h('section', { class: 'sheet-panel' },
      h('header', null, h('h2', null, 'All my students')),
      h('p', { class: 'hint', style: { padding: '12px 18px 0' } }, 'Add each student once. Their code never changes. When you make a class or a board, just tick who is in it.'),
      this.master.length ? h('div', { class: 'roster-grid' }, this.master.map((s, i) => { const cl = classesOf(s); return h('div', { class: 'rs-card ' + TILE5[i % 5] },
        h('button', { class: 'nm nm-link', title: `Open ${s.first_name}'s page`, onclick: () => { this.sel = 'stu:' + s.id; this.renderDashboard(); } }, s.first_name),
        h('button', { class: 'code', title: 'Change code', 'aria-label': `${s.first_name}'s code ${s.code}. Change it`, onclick: () => this.editCode(s) }, s.code),
        h('button', { class: 'x', 'aria-label': `Remove ${s.first_name}`, onclick: () => remove(s) }, iconEl('close', 16)),
        h('span', { class: 'rs-in' }, cl.length ? 'In: ' + cl.join(', ') : 'Not in a class yet')); }))
        : h('p', { class: 'empty' }, h('b', null, 'No students yet. '), 'Type first names below. Each student gets a 4-number code that stays the same for every class.'),
      this.master.length ? h('div', { class: 'roster-acts' },
        h('button', { class: 'btn sm', onclick: async () => toast((await copyText(this.master.map(s => `${s.first_name}: ${s.code}`).join('\n'))) ? 'Names and codes copied.' : 'Could not copy.', 'ok') }, iconEl('copy', 16), 'Copy names and codes')) : null,
      h('div', { class: 'add-students' }, input, h('button', { class: 'btn', onclick: add }, 'Add names')));
  }

  // the boards a student sees: made just for them, or boards of their classes that they are part of
  boardsOfStudent(m) {
    const inClass = new Set(this.students.filter(x => x.student_id === m.id).map(x => x.class_id));
    return this.boards.filter(b => {
      const only = this.members.get(b.id);
      if (only && only.size) return only.has(m.id) && (!b.class_id || inClass.has(b.class_id));
      return !!b.class_id && inClass.has(b.class_id);
    });
  }

  // one student's own page: their link, and all their work
  studentPagePanels(m) {
    const link = studentUrl(m.page_code), teacher = CONFIG.TEACHER_NAME || 'Teacher';
    const copy = async (text, ok) => toast((await copyText(text)) ? ok : 'Could not copy.', 'ok');
    const mine = this.boardsOfStudent(m), ids = mine.filter(b => b.mode === 'assignment').map(b => b.id);
    const slots = new Map();
    const row = b => { const slot = h('div', { class: 'who-line' }); slots.set(b.id, slot); return this.boardRow(b, b.mode === 'assignment' ? slot : null); };
    const top = h('section', { class: 'sheet-panel' },
      h('header', null, h('h2', null, `${m.first_name}'s page`),
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, h('button', { class: 'btn sm', onclick: () => this.editCode(m) }, `Code ${m.code}`))),
      h('div', { class: 'class-link' },
        h('p', null, 'Send this link ', h('b', null, 'once'), `. ${m.first_name} types the code and sees all their own work. New work you add here appears there by itself and moves, so it is easy to notice.`),
        h('div', { class: 'sc-link' }, link),
        h('div', { class: 'share-actions' },
          h('button', { class: 'btn primary', onclick: () => copy(studentPageMessage({ name: m.first_name, link, code: m.code, teacher }), `Message for ${m.first_name} copied.`) }, iconEl('copy', 18), `Copy message for ${m.first_name}`),
          h('button', { class: 'btn', onclick: () => copy(link, 'Link copied.') }, iconEl('link', 18), 'Copy link only'),
          h('a', { class: 'btn', href: link, target: '_blank', rel: 'noopener' }, `See ${m.first_name}'s page`))));
    const work = h('section', { class: 'sheet-panel' },
      h('header', null, h('h2', null, `Work for ${m.first_name}`), h('button', { class: 'btn primary', onclick: () => this.newBoardDialog({ forStudent: m }) }, iconEl('plus', 18), 'Add work')),
      mine.length ? mine.map(row) : h('div', { class: 'empty' }, h('b', null, 'No work yet. '), `Press Add work, then upload a worksheet or start with a blank page. ${m.first_name} sees it as NEW.`));
    if (ids.length) this.sb.from('participants').select('board_id,name,submitted_at,score,comment').in('board_id', ids).then(({ data }) => {
      const mp = new Map((data || []).filter(p => p.name.toLowerCase() === m.first_name.toLowerCase()).map(p => [p.board_id, p]));
      ids.forEach(id => {
        const p = mp.get(id), slot = slots.get(id); if (!slot) return;
        let cls2 = 'new', txt = 'Not started';
        if (p) { if (p.submitted_at && (p.score || p.comment)) { cls2 = 'checked'; txt = p.score ? `Score ${p.score}` : 'Checked'; } else if (p.submitted_at) { cls2 = 'sent'; txt = 'Sent. Waiting for you to check'; } else { cls2 = 'working'; txt = 'Working'; } }
        slot.append(h('button', { class: 'pg-chip ' + cls2, onclick: () => { location.hash = '#/board/' + id; } }, txt));
      });
    });
    const mineApps = this.apps.filter(a => (this.appLinks.get(a.id) || new Set()).has(m.id));
    const shelf = h('section', { class: 'sheet-panel' },
      h('header', null, h('h2', null, `Games and apps for ${m.first_name}`),
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          h('button', { class: 'btn sm primary', onclick: () => giveAppsDialog({ sb: this.sb, student: m, apps: this.apps, have: new Set(mineApps.map(a => a.id)), onSaved: () => this.refresh() }) }, iconEl('plus', 18), 'Add from my shelf'),
          h('button', { class: 'btn sm', title: 'Put a brand new app on your shelf and on this page', onclick: () => this.addApp({ preselect: [m.id] }) }, 'New app'))),
      mineApps.length ? h('div', { class: 'app-grid' }, mineApps.map((a, i) => this.appTile(a, i, { onRemove: async () => {
        const { error } = await this.sb.from('student_apps').delete().eq('app_id', a.id).eq('student_id', m.id);
        if (error) return toast(friendlyError(error), 'bad'); await this.refresh();
      }, removeLabel: `Take ${a.title} off ${m.first_name}'s page` })))
        : h('div', { class: 'empty' }, h('b', null, 'No apps yet. '), `Press Add from my shelf and tick the apps ${m.first_name} should play. (Build your shelf first in App shelf on the left.)`));
    return [top, work, shelf];
  }

  addApp(opts) { appDialog({ sb: this.sb, master: this.master, ...opts, onSaved: () => this.refresh() }); }

  appTile(a, i, { onRemove, removeLabel }) {
    return h('div', { class: 'app-tile ' + TILE5[i % 5] },
      h('b', { class: 'at' }, a.title),
      a.note ? h('span', { class: 'an' }, a.note) : null,
      h('span', { class: 'au' }, a.url.replace(/^https?:\/\//i, '')),
      h('div', { class: 'aa' },
        h('button', { class: 'btn sm primary', onclick: () => previewDialog(a) }, 'Preview'),
        h('a', { class: 'btn sm', href: a.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open'),
        h('button', { class: 'btn sm', onclick: () => this.addApp({ app: a, have: this.appLinks.get(a.id) || new Set() }) }, 'Change'),
        h('button', { class: 'x', 'aria-label': removeLabel, title: removeLabel, onclick: onRemove }, iconEl('close', 16))));
  }

  // the shelf: every app and who has it
  appsPanel() {
    const names = id => [...(this.appLinks.get(id) || [])].map(sid => (this.master.find(x => x.id === sid) || {}).first_name).filter(Boolean).sort((a, b) => a.localeCompare(b));
    const remove = async a => {
      const ok = await confirmDialog({ title: `Delete "${a.title}"?`, text: 'This takes the app off the shelf and off every student page. The app itself is not touched, only the link.', confirmLabel: 'Delete', danger: true });
      if (!ok) return;
      const { error } = await this.sb.from('apps').delete().eq('id', a.id);
      if (error) return toast(friendlyError(error), 'bad'); await this.refresh();
    };
    return h('section', { class: 'sheet-panel' },
      h('header', null, h('h2', null, 'App shelf'), h('button', { class: 'btn primary', onclick: () => this.addApp({}) }, iconEl('plus', 18), 'Add app to shelf')),
      h('p', { class: 'hint', style: { padding: '12px 18px 0' } }, 'Step 1: add each of your web apps here once. Step 2: press "Give to students" on an app, or open a student and press "Add from my shelf". It shows on their page as a tile they tap to play.'),
      this.apps.length ? h('div', { class: 'app-grid' }, this.apps.map((a, i) => { const who = names(a.id);
        return h('div', { class: 'app-tile ' + TILE5[i % 5] },
          h('b', { class: 'at' }, a.title), a.note ? h('span', { class: 'an' }, a.note) : null,
          h('span', { class: 'au' }, a.url.replace(/^https?:\/\//i, '')),
          h('span', { class: 'aw' }, who.length ? 'For: ' + who.join(', ') : 'Nobody has this yet'),
          h('div', { class: 'aa' },
            h('button', { class: 'btn sm primary', onclick: () => previewDialog(a) }, 'Preview'),
        h('a', { class: 'btn sm', href: a.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open'),
            h('button', { class: 'btn sm primary', onclick: () => giveToStudentsDialog({ master: this.master, sb: this.sb, app: a, have: this.appLinks.get(a.id) || new Set(), onSaved: () => this.refresh() }) }, 'Give to students'),
            h('button', { class: 'btn sm', onclick: () => this.addApp({ app: a, have: this.appLinks.get(a.id) || new Set() }) }, 'Change'),
            h('button', { class: 'x', 'aria-label': `Delete ${a.title}`, title: 'Delete', onclick: () => remove(a) }, iconEl('trash', 16)))); }))
        : h('div', { class: 'empty' }, h('b', null, 'The shelf is empty. '), 'Press Add app, type a name and paste the link of a web app you made.'));
  }

  // the students in one class
  classPanel(cls) {
    const mine = this.students.filter(s => s.class_id === cls.id);
    const input = h('input', { class: 'input', placeholder: 'New first names, like: Mia, Ben, Nok', 'aria-label': 'Add new student first names' });
    const add = async () => {
      const names = cleanNames(input.value);
      if (!names.length) { toast('Type first names, separated by commas.'); return; }
      try { const rows = await this.ensureStudents(names); const n = await this.addToClass(cls, rows.map(r => r.id)); input.value = ''; toast(n ? `${n} student${n === 1 ? '' : 's'} added to ${cls.name}.` : 'They are already in this class.', 'ok'); await this.refresh(); }
      catch (e) { toast(friendlyError(e), 'bad'); }
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    const removeFromClass = async s => {
      const ok = await confirmDialog({ title: `Take ${s.first_name} out of ${cls.name}?`, text: 'They stay on your list of students with the same code. They no longer see the boards of this class. Work they already did stays until you delete the board.', confirmLabel: 'Take out', danger: true });
      if (!ok) return;
      const ids = this.boards.filter(b => b.class_id === cls.id).map(b => b.id);
      if (ids.length && s.student_id) await this.sb.from('board_students').delete().eq('student_id', s.student_id).in('board_id', ids);
      const { error } = await this.sb.from('class_students').delete().eq('id', s.id);
      if (error) return toast(friendlyError(error), 'bad');
      await this.refresh();
    };
    const pick = () => {
      const inClass = new Set(mine.map(s => s.student_id));
      const cand = this.master.filter(s => !inClass.has(s.id));
      const list = checklist(cand, [], { empty: this.master.length ? 'Everyone on your list is already in this class.' : 'Your list is empty. Type new names below.' });
      const names = h('input', { class: 'input', placeholder: 'Or type new first names', 'aria-label': 'New first names' });
      const err = h('p', { class: 'error', role: 'alert' });
      const go = async () => {
        err.textContent = '';
        try {
          const fresh = cleanNames(names.value), rows = fresh.length ? await this.ensureStudents(fresh) : [];
          const n = await this.addToClass(cls, [...list.ids(), ...rows.map(r => r.id)]);
          if (!n) { err.textContent = 'Tick at least one student, or type a new name.'; return; }
          m.close(); toast(`${n} student${n === 1 ? '' : 's'} added to ${cls.name}.`, 'ok'); await this.refresh();
        } catch (e) { err.textContent = friendlyError(e); }
      };
      const m = modal({ title: `Add students to ${cls.name}`, body: h('div', null, h('p', { class: 'hint', style: { marginBottom: '10px' } }, 'Tick students from your list. Their codes stay the same.'), list.el, h('div', { class: 'field', style: { marginTop: '14px' } }, h('label', null, 'New student'), names), err),
        actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: go }, 'Add to class')] });
    };
    return h('section', { class: 'sheet-panel' },
      h('header', null, h('h2', null, `Step 1: students in ${cls.name}`),
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          h('button', { class: 'btn sm primary', onclick: pick }, iconEl('plus', 18), 'Add students from my list'),
          h('button', { class: 'btn sm', onclick: () => this.renameClass(cls) }, 'Rename class'),
          h('button', { class: 'btn sm danger', onclick: () => this.deleteClassDialog(cls) }, iconEl('trash', 18), 'Delete class'))),
      mine.length ? h('div', { class: 'roster-grid' }, mine.map((s, i) => { const ms = this.master.find(x => x.id === s.student_id); return h('div', { class: 'rs-card ' + TILE5[i % 5] },
        h('b', { class: 'nm' }, s.first_name),
        ms ? h('button', { class: 'code', title: 'Change code', 'aria-label': `${s.first_name}'s code ${s.code}. Change it`, onclick: () => this.editCode(ms) }, s.code) : h('span', { class: 'code' }, s.code || '-'),
        h('button', { class: 'x', 'aria-label': `Take ${s.first_name} out of this class`, onclick: () => removeFromClass(s) }, iconEl('close', 16))); }))
        : h('p', { class: 'empty' }, h('b', null, 'No students in this class yet. '), 'Press "Add students from my list" and tick who learns here. Each student keeps the same code in every class.'),
      mine.length ? h('div', { class: 'roster-acts' },
        h('button', { class: 'btn sm', onclick: async () => toast((await copyText(mine.map(s => `${s.first_name}: ${s.code || '-'}`).join('\n'))) ? 'Names and codes copied.' : 'Could not copy.', 'ok') }, iconEl('copy', 16), 'Copy names and codes')) : null,
      h('div', { class: 'add-students' }, input, h('button', { class: 'btn', onclick: add }, 'Add new names')));
  }

  // "For Mia, Ben, Nok" or "Whole class" under a board's title
  whoLine(b) {
    if (!b.class_id) {
      const raw = this.members.get(b.id), names = [...(raw || [])].map(id => (this.master.find(s => s.id === id) || {}).first_name).filter(Boolean);
      return names.length ? h('div', { class: 'who-line' }, h('span', { class: 'tag who' }, 'For ' + names.join(', '))) : null;
    }
    const inClass = new Set(this.students.filter(s => s.class_id === b.class_id).map(s => s.student_id));
    const total = inClass.size, raw = this.members.get(b.id);
    const ids = raw ? new Set([...raw].filter(id => inClass.has(id))) : null;
    if (raw && raw.size && !ids.size) return h('div', { class: 'who-line' }, h('span', { class: 'tag who' }, 'Nobody'), h('span', null, 'Press Students to choose who this board is for'));
    if (!ids || !ids.size) return h('div', { class: 'who-line' }, h('span', { class: 'tag who' }, 'Whole class'), h('span', null, total ? `${total} student${total === 1 ? '' : 's'}` : 'No students in the class yet'));
    const names = [...ids].map(id => (this.master.find(s => s.id === id) || {}).first_name).filter(Boolean).sort((a, c) => a.localeCompare(c));
    return h('div', { class: 'who-line' }, h('span', { class: 'tag who' }, `For ${names.length} of ${total}`), h('span', { title: names.join(', ') }, names.slice(0, 5).join(', ') + (names.length > 5 ? ` +${names.length - 5}` : '')));
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
        const only = this.members.get(b.id);
        if (only && only.size && !only.has(s.student_id)) return h('td', null, h('span', { class: 'pg-na', title: `${s.first_name} is not in this board` }, '–'));
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
    const list = checklist(this.master, [], { empty: 'Your list of students is empty. Type new names below.' });
    const names = h('input', { class: 'input', id: 'cnn', placeholder: 'Or type new first names, like: Mia, Ben', 'aria-label': 'New first names' });
    const save = async () => {
      if (!name.value.trim()) { err.textContent = 'Give the class a name.'; name.focus(); return; }
      go.disabled = true;
      let data = null, error = null;
      for (let i = 0; i < 6 && !data; i++) { const r = await this.sb.from('classes').insert({ name: name.value.trim(), code: makeCode(6) }).select().single(); if (!r.error) data = r.data; else if (r.error.code !== '23505') { error = r.error; break; } }
      if (!data && !error) error = new Error('Could not make a class code. Try again.');
      if (error) { err.textContent = friendlyError(error); go.disabled = false; return; }
      try {
        const fresh = cleanNames(names.value), rows = fresh.length ? await this.ensureStudents(fresh) : [];
        this.students = this.students.filter(s => s.class_id !== data.id);
        await this.addToClass(data, [...list.ids(), ...rows.map(r => r.id)]);
      } catch (e) { toast(friendlyError(e), 'bad'); }
      m.close(); this.sel = data.id; await this.loadAll(); this.renderDashboard();
    };
    name.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
    const go = h('button', { class: 'btn primary', onclick: save }, 'Create class');
    const m = modal({ title: 'New class', body: h('div', null, h('div', { class: 'field' }, h('label', { for: 'cn' }, 'Class name'), name),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Who is in this class?'), h('span', { class: 'hint' }, 'Tick students from your list. Their codes stay the same.'), list.el), h('div', { class: 'field' }, h('label', { for: 'cnn' }, 'New student'), names), err),
      actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), go], wide: true });
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

  newBoardDialog({ forStudent = null } = {}) {
    const title = h('input', { class: 'input', id: 'bt', placeholder: 'Example: Fractions worksheet 4', maxlength: '120' });
    if (!forStudent && !this.classes.length) {
      const m0 = modal({ title: 'Make a class first', body: h('p', null, 'Boards belong to a class so that every student finds their own boards on one page. Make a class and add your students first, then add boards.'), actions: [h('button', { class: 'btn', onclick: () => m0.close() }, 'Close'), h('button', { class: 'btn primary', onclick: () => { m0.close(); this.newClassDialog(); } }, 'Make a class')] });
      return;
    }
    const clsSel = forStudent ? { value: '' } : h('select', { class: 'select', id: 'bc' }, this.classes.map(c => h('option', { value: c.id, selected: c.id === (this.sel !== 'all' ? this.sel : this.classes[0].id) }, c.name)));
    const form = sourceForm({ defaultSource: 'pdf' });
    // who is this board for: the students of the chosen class, all ticked to begin with
    const whoBox = h('div', { class: 'field' });
    let who = null;
    const drawWho = () => {
      const mem = this.students.filter(s => s.class_id === clsSel.value && s.student_id).map(s => ({ id: s.student_id, first_name: s.first_name, code: s.code }));
      who = checklist(mem, mem.map(x => x.id), { empty: 'This class has no students yet. Add students to the class first (the board will be open to everyone who joins later).' });
      whoBox.replaceChildren(h('span', { class: 'label' }, 'Who is this board for?'), h('span', { class: 'hint' }, 'Untick students who do not learn this topic. Only the ticked students see it.'), who.el);
    };
    if (!forStudent) { clsSel.addEventListener('change', drawWho); drawWho(); }
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
      title: forStudent ? `New work for ${forStudent.first_name}` : 'New board',
      body: h('div', null,
        h('div', { class: 'field' }, h('label', { for: 'bt' }, forStudent ? 'Name of the work' : 'Board name'), title),
        forStudent ? h('p', { class: 'hint', style: { marginBottom: '10px' } }, `Only ${forStudent.first_name} sees this. It appears on their page as NEW.`) : [h('div', { class: 'field' }, h('label', { for: 'bc' }, 'Class'), clsSel), whoBox],
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Type'), modeSeg, modeHint), dates,
        form.el, bar, msg, err),
      actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), go],
    });
    go.addEventListener('click', async () => {
      err.textContent = '';
      if (!title.value.trim()) { err.textContent = 'Give the board a name.'; title.focus(); return; }
      const tot = forStudent ? 0 : this.students.filter(s => s.class_id === clsSel.value && s.student_id).length;
      if (tot && !who.size()) { err.textContent = 'Tick at least one student for this board.'; return; }
      go.disabled = true; bar.hidden = false;
      try {
        const s0 = startIn.value ? new Date(startIn.value).toISOString() : null, d0 = dueIn.value ? new Date(dueIn.value).toISOString() : null;
        if (mode === 'assignment' && s0 && d0 && new Date(d0) <= new Date(s0)) throw new Error('The due time must be after the start time.');
        const b = await createBoard(this.sb, { title: title.value.trim(), classId: forStudent ? null : clsSel.value, spec: form.spec(), mode, startsAt: mode === 'assignment' ? s0 : null, dueAt: mode === 'assignment' ? d0 : null }, (t, f) => { msg.textContent = t; bar.firstChild.style.width = Math.round(f * 100) + '%'; });
        if (forStudent) {
          const { error } = await this.sb.from('board_students').insert({ board_id: b.id, student_id: forStudent.id });
          if (error) { await deleteBoard(this.sb, b.id).catch(() => {}); throw error; }
        }
        if (tot && who.size() < tot) {
          const { error } = await this.sb.from('board_students').insert(who.ids().map(id => ({ board_id: b.id, student_id: id })));
          if (error) toast('The board was made, but the student list was not saved. Press Students on the board to choose again.', 'bad');
        }
        m.close(); location.hash = '#/board/' + b.id;
      } catch (e) { console.error(e); err.textContent = friendlyError(e); go.disabled = false; bar.hidden = true; }
    });
  }
}
