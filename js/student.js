// Student side: open the link, tap your name, type the 4-number code from your teacher, join the board.
// (A board without a class list asks the student to type a first name instead, with an optional PIN.)
import { h, toast, modal } from './util.js';
import { makeClient, friendlyError } from './db.js';
import { Store } from './store.js';
import { BoardView } from './board.js';
import { brand, artSvg } from './teacher.js';
import { iconEl } from './icons.js';
import { CONFIG } from '../config.js';
import { appThumb } from './shelf.js';
import { IdeaBoard } from './idea.js';

const MESSAGES = {
  NAME_IN_USE: 'Someone is using that name right now. Add the first letter of your last name, like "Emma K".',
  PIN_REQUIRED: 'Type your 4-number code.',
  PIN_WRONG: 'That code is not right. Try again.',
  PIN_FORMAT: 'A code is 4 numbers, like 2580.',
  NAME_REQUIRED: 'Type your first name.',
  BOARD_CLOSED: 'This board is closed right now. Ask your teacher.',
  NAME_TAKEN_ASSIGNMENT: 'Your work is saved under this name on another device. Type your 4-number PIN, or ask your teacher to let you back in.',
  NOT_STARTED: 'This assignment is not open yet.',
  NOT_ON_LIST: 'That name is not on the list. Ask your teacher.',
  NOT_IN_BOARD: 'This board is not for you. Ask your teacher.',
  TOO_MANY: 'Too many tries. Wait ten minutes, or ask your teacher.',
};
const msgFor = e => { const m = (e && e.message) || ''; for (const k of Object.keys(MESSAGES)) if (m.includes(k)) return MESSAGES[k]; return friendlyError(e); };
const TILE = ['c1', 'c2', 'c3', 'c4', 'c5'];

// the list of all of a student's work, for the bar that slides out from the left of a board
function workPanelDom(boards, currentCode, pick) {
  const row = b => {
    const [label, cls] = STATUS[b.status] || STATUS.new, locked = !b.code, cur = !!b.code && b.code === currentCode, d = dueInfo(b.due_at, b.status);
    return h('button', { class: 'wd-row ' + cls + (cur ? ' current' : ''), disabled: locked, onclick: () => pick(b) },
      h('b', null, b.title),
      h('span', { class: 'wd-meta' }, h('span', { class: 'tag ' + (b.mode === 'assignment' ? 'assign' : 'live') }, b.mode === 'assignment' ? 'Assignment' : 'Live class'), d ? h('span', { class: 'due-chip ' + d.cls }, d.text) : null),
      h('span', { class: 'bc-status' }, cur ? 'You are here' : locked ? 'Not open yet' : label + (b.status === 'checked' && b.score ? ` · Score ${b.score}` : '')));
  };
  const todo = boards.filter(b => b.status === 'new' || b.status === 'working' || b.status === 'live').sort(dueSort), done = boards.filter(b => b.status === 'sent' || b.status === 'checked');
  return h('div', { class: 'wd-body' }, todo.length ? h('h3', null, 'To do') : null, todo.map(row), done.length ? h('h3', null, 'Sent') : null, done.map(row), boards.length ? null : h('p', { class: 'hint', style: { padding: '14px' } }, 'No work yet.'));
}

// For a student who came in with a board link (not their own page): the boards they have opened so far, taken from their own records
function joinWork(sb, name, pin, root, boardId) {
  const work = {
    workPanel: async ({ currentCode, pick }) => {
      // the whole list for a student on a class list (every piece of work, also what is not opened yet) ...
      if (boardId) { const r = await sb.rpc('my_work_after_join', { p_board: boardId }); const list = r.data && r.data.boards; if (list && list.length) return workPanelDom(list, currentCode, pick); }
      // ... or, if there is no list, the boards this student has opened so far
      const { data: parts } = await sb.from('participants').select('board_id,submitted_at,score,comment,checked_at');
      const ids = (parts || []).map(p => p.board_id), pm = new Map((parts || []).map(p => [p.board_id, p]));
      const { data: bs } = ids.length ? await sb.from('boards').select('id,code,title,mode,due_at,starts_at,created_at').in('id', ids) : { data: [] };
      const boards = (bs || []).map(b => { const p = pm.get(b.id) || {}; return { id: b.id, code: b.starts_at && Date.parse(b.starts_at) > Date.now() ? null : b.code, title: b.title, mode: b.mode, due_at: b.due_at, created_at: b.created_at, score: p.score,
        status: b.mode !== 'assignment' ? 'live' : p.submitted_at && (p.checked_at || p.score || p.comment) ? 'checked' : p.submitted_at ? 'sent' : 'working' }; }).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return workPanelDom(boards, currentCode, pick);
    },
    onSwitch: b => switchTo({ sb, root, b, name, pin, onBack: null, work }),
  };
  return work;
}

// how soon is it due: "Overdue", "Due today", "Due tomorrow", or the date
function dueInfo(due_at, status) {
  if (!due_at || status === 'sent' || status === 'checked') return null;
  const ms = Date.parse(due_at) - Date.now(), day = 864e5;
  const start = d => new Date(d).setHours(0, 0, 0, 0), diffDays = Math.round((start(due_at) - start(Date.now())) / day);
  if (ms < 0) return { text: 'Overdue', cls: 'late' };
  if (diffDays === 0) return { text: 'Due today', cls: 'soon' };
  if (diffDays === 1) return { text: 'Due tomorrow', cls: 'soon' };
  return null;
}
const dueSort = (a, b) => {
  const da = a.due_at ? Date.parse(a.due_at) : Infinity, db = b.due_at ? Date.parse(b.due_at) : Infinity;
  if (da !== db) return da - db;
  return (b.status === 'new' && b.code ? 1 : 0) - (a.status === 'new' && a.code ? 1 : 0);
};
// "Teacher Maya" on every student page, so it is clear who is teaching
// The teacher pressed "Mark as checked": the student is told once, with a pop-up and a NEW mark on the card (no sound).
const checkedMs = b => (b.status === 'checked' && b.checked_at) ? Date.parse(b.checked_at) : 0;
const checkedNews = (boards, key) => { let seen = 0; try { seen = Number(localStorage.getItem(key) || 0); } catch (e) { /* ignore */ } return boards.filter(b => checkedMs(b) > seen); };
function checkedPopup(news, key) {
  if (!news.length) return;
  const mark = () => { try { localStorage.setItem(key, String(Math.max(...news.map(checkedMs)))); } catch (e) { /* ignore */ } };
  const m = modal({
    title: `Teacher ${CONFIG.TEACHER_NAME || ''} checked your work!`,
    body: h('div', { class: 'checked-pop' }, news.map(b => h('p', { class: 'cp-row' }, h('b', null, b.title), b.score ? h('span', { class: 'cp-score' }, `Score ${b.score}`) : null))),
    actions: [h('button', { class: 'btn primary big', onclick: () => m.close() }, 'OK')],
    onClose: mark,
  });
}
const teacherTag = () => h('p', { class: 'teacher-tag' }, h('b', null, 'Teacher ' + (CONFIG.TEACHER_NAME || '')));

// the "Games and apps" shelf on a student's page: tiles that open the teacher's web apps in a new tab.
// An app the student has not opened yet on this device is marked NEW.
function appsSection(apps, seenKey) {
  if (!apps || !apps.length) return null;
  let seen = []; try { seen = JSON.parse(localStorage.getItem(seenKey) || '[]'); } catch (e) { /* ignore */ }
  const mark = id => { if (!seen.includes(id)) { seen.push(id); try { localStorage.setItem(seenKey, JSON.stringify(seen)); } catch (e) { /* ignore */ } } };
  const safe = u => /^https?:\/\//i.test(u) ? u : '#';
  return h('aside', { class: 'me-apps', 'aria-label': 'Games and apps' }, h('h2', { class: 'bsec' }, 'Games and apps'),
    h('div', { class: 'agrid' }, apps.map((a, i) => {
      const fresh = !seen.includes(a.id);
      const tile = h('a', { class: 'atile ' + TILE[i % TILE.length] + (fresh ? ' is-new' : ''), href: safe(a.url), target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Play ' + a.title, title: a.note || a.title },
        appThumb(a, false) || h('span', { class: 'aph', 'aria-hidden': 'true' }, (a.title || '?').trim().charAt(0).toUpperCase()),
        fresh ? h('span', { class: 'new-badge' }, 'NEW') : null,
        h('span', { class: 'atx' }, h('b', { class: 'at' }, a.title)),
        null);
      tile.addEventListener('click', () => { mark(a.id); tile.classList.remove('is-new'); const nb = tile.querySelector('.new-badge'); if (nb) nb.remove(); });
      return tile;
    })));
}

export async function startStudent(root, code) {
  if (!code) return askCode(root);
  code = code.toUpperCase();
  const sb = makeClient('student');
  const page = (...kids) => root.replaceChildren(h('div', { class: 'entry student' }, h('div', { class: 'side' }, brand(true), ...kids), h('div', { class: 'art', 'aria-hidden': 'true' }, artSvg())));
  page(h('p', { class: 'lead' }, 'Opening the board…'));

  let info;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { const { error } = await sb.auth.signInAnonymously(); if (error) throw error; }
    const r = await sb.rpc('get_join_info', { p_code: code });
    if (r.error) throw r.error;
    info = r.data;
  } catch (e) {
    console.error(e);
    return page(h('div', { class: 'notice bad' }, 'We could not connect. ' + friendlyError(e)), h('button', { class: 'btn primary', onclick: () => startStudent(root, code) }, 'Try again'));
  }
  if (!info.found) {
    const ci = await sb.rpc('get_class_info', { p_code: code });
    if (ci.data && ci.data.found) { location.hash = '#/class/' + code; return; }
  }
  if (!info.found) return page(h('h1', null, 'Board not found'), h('p', { class: 'lead' }, 'Check the link or the code your teacher sent. Letters and numbers must match.'));
  if (!info.enabled) return page(h('h1', null, info.title), h('div', { class: 'notice' }, 'This board is closed right now. Ask your teacher to open it.'));
  const when = iso => new Date(iso).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  if (info.mode === 'assignment' && info.starts_at && new Date(info.starts_at) > Date.now()) return page(h('h1', null, info.title), h('div', { class: 'notice' }, `This assignment opens on ${when(info.starts_at)}. Come back then.`));

  const saveKey = `bem-join-${code}-${new URLSearchParams(location.search).get('slot') || ''}`;
  let saved = null; try { saved = JSON.parse(localStorage.getItem(saveKey) || 'null'); } catch (e) { /* ignore */ }

  // returns an error message, or null when the student is in
  const enter = async (name, pin) => {
    try {
      const { data, error } = await sb.rpc('join_board', { p_code: code, p_name: name, p_pin: pin || null });
      if (error) throw error;
      if (data && data.error) throw new Error(data.error);
      try { localStorage.setItem(saveKey, JSON.stringify({ name: data.name })); } catch (e) { /* ignore */ }
      const store = new Store(sb, { boardId: data.board_id, role: 'student', participantId: data.participant_id, name: data.name });
      await store.load(); await store.connect();
      new BoardView({ sb, store, role: 'student', root, code, onExit: () => {}, ...joinWork(sb, data.name, pin, root, data.board_id) }).start();
      return null;
    } catch (e) { console.error(e); const m = (e && e.message) || ''; return { key: Object.keys(MESSAGES).find(k => m.includes(k)) || '', text: msgFor(e) }; }
  };

  const heading = () => h('div', { class: 'join-head' }, h('p', { class: 'hint' }, info.mode === 'assignment' ? 'Assignment' : 'You are joining'), h('h1', null, info.title), teacherTag(),
    info.mode === 'assignment' ? h('div', { class: 'notice yellow' }, h('b', null, 'This is your own private copy.'), ' Only your teacher can see your work.', info.due_at ? h('span', null, ` Due ${when(info.due_at)}.`) : null) : null);

  // ----------------------------------------------------------- class list: tap your name, then type your code
  function showNames() {
    const tiles = info.names.map((n, i) => h('button', { class: 'name-tile ' + TILE[i % TILE.length], onclick: () => showCode(n) }, h('span', null, n)));
    page(heading(), saved && saved.name ? h('div', { class: 'welcome' },
      h('p', null, `Welcome back, ${saved.name}.`),
      h('button', { class: 'btn primary big', onclick: async e => { e.currentTarget.disabled = true; const r = await enter(saved.name, ''); if (r) showCode(saved.name, r.key === 'PIN_REQUIRED' ? '' : r.text); } }, `Continue as ${saved.name}`)) : null,
      h('p', { class: 'step' }, h('span', { class: 'n n2' }, '1'), 'Tap your name'), h('div', { class: 'name-grid' }, tiles));
  }

  function showCode(name, firstError = '') {
    const boxes = [0, 1, 2, 3].map(i => h('input', { class: 'pin-box', inputmode: 'numeric', maxlength: '1', autocomplete: i === 0 ? 'one-time-code' : 'off', 'aria-label': `Code number ${i + 1}`, pattern: '[0-9]' }));
    const err = h('p', { class: 'error', role: 'alert' }, firstError);
    const btn = h('button', { class: 'btn primary big', disabled: true }, iconEl('check', 22), 'Join the board');
    const val = () => boxes.map(b => b.value).join('');
    const go = async () => {
      const v = val(); if (v.length !== 4) return;
      btn.disabled = true; err.textContent = '';
      const r = await enter(name, v);
      if (r) { err.textContent = r.text; boxes.forEach(b => { b.value = ''; }); boxes[0].focus(); btn.disabled = true; }
    };
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => {
        b.value = b.value.replace(/\D/g, '').slice(-1);
        if (b.value && i < 3) boxes[i + 1].focus();
        btn.disabled = val().length !== 4; if (val().length === 4) go();
      });
      b.addEventListener('keydown', e => { if (e.key === 'Backspace' && !b.value && i > 0) boxes[i - 1].focus(); if (e.key === 'Enter') go(); });
      b.addEventListener('paste', e => { const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 4); if (!d) return; e.preventDefault(); d.split('').forEach((c, k) => { boxes[k].value = c; }); btn.disabled = d.length !== 4; if (d.length === 4) go(); });
    });
    btn.addEventListener('click', go);
    const idx = Math.max(0, info.names.indexOf(name));
    page(heading(),
      h('div', { class: 'whoami ' + TILE[idx % TILE.length] }, h('small', null, 'You are'), h('b', null, name)),
      h('p', { class: 'step' }, h('span', { class: 'n n3' }, '2'), 'Type your 4-number code'),
      h('div', { class: 'pin-row' }, boxes), err, btn,
      h('button', { class: 'btn quiet', style: { marginTop: '10px' }, onclick: showNames }, 'That is not me'));
    boxes[0].focus();
  }

  // ----------------------------------------------------------- no class list: type a name
  function showTyped() {
    const name = h('input', { class: 'input big', id: 'nm', maxlength: '24', autocomplete: 'off', autocapitalize: 'words', placeholder: 'Your first name' });
    const pin = h('input', { class: 'input', id: 'pin', maxlength: '4', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', placeholder: '4 numbers', 'aria-describedby': 'pinhint' });
    const err = h('p', { class: 'error', role: 'alert' });
    const btn = h('button', { class: 'btn primary big', type: 'submit' }, 'Join the board');
    pin.addEventListener('input', () => { pin.value = pin.value.replace(/\D/g, '').slice(0, 4); });
    const form = h('form', { novalidate: true, onsubmit: async e => { e.preventDefault(); err.textContent = ''; if (!name.value.trim()) { err.textContent = MESSAGES.NAME_REQUIRED; name.focus(); return; } btn.disabled = true; const r = await enter(name.value, pin.value); if (r) { err.textContent = r.text; btn.disabled = false; } } },
      h('div', { class: 'field' }, h('label', { for: 'nm' }, 'Your first name'), name),
      h('div', { class: 'field' }, h('label', { for: 'pin' }, 'PIN (optional)'), pin, h('span', { class: 'hint', id: 'pinhint' }, 'Make a 4-number PIN if you want to come back to your own work later. Remember it!')),
      err, btn);
    const welcome = saved && saved.name ? h('div', { class: 'welcome' }, h('p', null, `Welcome back, ${saved.name}.`),
      h('button', { class: 'btn primary big', onclick: async e => { e.currentTarget.disabled = true; const r = await enter(saved.name, ''); if (r) { toast(r.text, 'bad'); e.currentTarget.disabled = false; } } }, `Continue as ${saved.name}`),
      h('button', { class: 'btn quiet', onclick: () => { try { localStorage.removeItem(saveKey); } catch (e2) { /* ignore */ } welcome.remove(); } }, 'I am someone else')) : null;
    page(heading(), welcome, form);
    if (!welcome) name.focus();
  }

  if (info.roster && info.names.length) showNames(); else showTyped();
}

function askCode(root) {
  const input = h('input', { class: 'input big', id: 'cd', maxlength: '12', autocomplete: 'off', autocapitalize: 'characters', placeholder: 'Class code', style: { letterSpacing: '.16em', textTransform: 'uppercase' } });
  const err = h('p', { class: 'error', role: 'alert' });
  const form = h('form', { novalidate: true, onsubmit: e => { e.preventDefault(); const c = input.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c.length < 4) { err.textContent = 'Type the code your teacher gave you.'; return; } location.hash = '#/join/' + c; } },
    h('div', { class: 'field' }, h('label', { for: 'cd' }, 'Board code from your teacher'), input), err,
    h('button', { class: 'btn primary big', type: 'submit' }, 'Continue'));
  root.replaceChildren(h('div', { class: 'entry student' }, h('div', { class: 'side' }, brand(true), h('h1', null, 'Join your class'), form), h('div', { class: 'art', 'aria-hidden': 'true' }, artSvg())));
  input.focus();
}


// open one board (used by the class page)
// join a board and get it ready; start() puts it on the screen
async function prepareBoard({ sb, root, code, name, pin, onBack, workPanel = null, onSwitch = null }) {
  const { data, error } = await sb.rpc('join_board', { p_code: code, p_name: name, p_pin: pin || null });
  if (error) throw error;
  if (data && data.error) throw new Error(data.error);
  const store = new Store(sb, { boardId: data.board_id, role: 'student', participantId: data.participant_id, name: data.name });
  await store.load(); await store.connect();
  return { start: () => new BoardView({ sb, store, role: 'student', root, code, onBack, onExit: () => {}, workPanel, onSwitch }).start() };
}
async function enterBoard(opts) {
  try { (await prepareBoard(opts)).start(); return null; }
  catch (e) { console.error(e); const m = (e && e.message) || ''; return { key: Object.keys(MESSAGES).find(k => m.includes(k)) || '', text: msgFor(e) }; }
}
// ask for the 4-number code (when another board needs it and this device does not know it yet)
function askPin() {
  return new Promise(resolve => {
    const input = h('input', { class: 'input', inputmode: 'numeric', maxlength: '4', pattern: '[0-9]*', autocomplete: 'off', 'aria-label': 'Your 4-number code', placeholder: '4 numbers', style: { fontSize: '24px', textAlign: 'center', letterSpacing: '.3em' } });
    input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 4); if (input.value.length === 4) { done = true; m.close(); resolve(input.value); } });
    let done = false;
    const m = modal({ title: 'Type your code', body: h('div', null, h('p', { class: 'hint', style: { marginBottom: '10px' } }, 'This board needs your 4-number code.'), input), actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel')], onClose: () => { if (!done) resolve(null); } });
    setTimeout(() => input.focus(), 60);
  });
}
// the switch used by "My work": make the other board ready (asking for the code if needed), or say what went wrong
async function switchTo({ sb, root, b, name, pin, onBack, work }) {
  if (!b.code) { toast('That one is not open yet.', 'bad'); return null; }
  let use = pin;
  for (let tries = 0; tries < 3; tries++) {
    try { return await prepareBoard({ sb, root, code: b.code, name, pin: use, onBack, ...work }); }
    catch (e) {
      const m = (e && e.message) || '';
      if (/PIN_REQUIRED|PIN_WRONG/.test(m)) { const p = await askPin(); if (!p) return null; use = p; continue; }
      toast(msgFor(e), 'bad'); return null;
    }
  }
  return null;
}

const STATUS = {
  new: ['New', 'st-new'], working: ['Working', 'st-working'], sent: ['Sent. Waiting for Teacher ' + (CONFIG.TEACHER_NAME || 'your teacher') + ' to check', 'st-sent'],
  checked: ['Checked', 'st-checked'], live: ['Everyone writes together', 'st-live'],
};

// the class page: one link, every board of the class that belongs to this student
export async function startClass(root, classCode) {
  classCode = classCode.toUpperCase();
  const sb = makeClient('student');
  const slot = new URLSearchParams(location.search).get('slot') || '';
  const saveKey = `bem-class-${classCode}-${slot}`;
  const page = (cls, ...kids) => root.replaceChildren(h('div', { class: 'entry student ' + cls }, h('div', { class: 'side' }, brand(true), ...kids), h('div', { class: 'art', 'aria-hidden': 'true' }, artSvg())));
  page('', h('p', { class: 'lead' }, 'Opening your class…'));

  let info;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { const { error } = await sb.auth.signInAnonymously(); if (error) throw error; }
    const r = await sb.rpc('get_class_info', { p_code: classCode });
    if (r.error) throw r.error;
    info = r.data;
  } catch (e) {
    console.error(e);
    return page('', h('div', { class: 'notice bad' }, 'We could not connect. ' + friendlyError(e)), h('button', { class: 'btn primary', onclick: () => startClass(root, classCode) }, 'Try again'));
  }
  if (!info.found) return page('', h('h1', null, 'Class page not found'), h('p', { class: 'lead' }, 'Check the link your teacher sent.'));

  let saved = null; try { saved = JSON.parse(localStorage.getItem(saveKey) || 'null'); } catch (e) { /* ignore */ }
  const forget = () => { try { localStorage.removeItem(saveKey); } catch (e) { /* ignore */ } saved = null; };

  const portal = async (name, pin) => {
    const { data, error } = await sb.rpc('class_portal', { p_code: classCode, p_name: name, p_pin: pin });
    if (error) { const m = error.message || ''; return { err: Object.keys(MESSAGES).find(k => m.includes(k)) ? MESSAGES[Object.keys(MESSAGES).find(k => m.includes(k))] : friendlyError(error) }; }
    if (data.error) return { err: MESSAGES[data.error] || 'Try again.' };
    try { localStorage.setItem(saveKey, JSON.stringify({ name: data.name, pin })); } catch (e) { /* ignore */ }
    return { data };
  };

  function showNames() {
    const tiles = info.names.map((n, i) => h('button', { class: 'name-tile ' + TILE[i % TILE.length], onclick: () => showCode(n) }, h('span', null, n)));
    page('', h('div', { class: 'join-head' }, h('p', { class: 'hint' }, 'Your class'), h('h1', null, info.name), teacherTag()),
      saved && saved.name ? h('div', { class: 'welcome' }, h('p', null, `Welcome back, ${saved.name}.`),
        h('button', { class: 'btn primary big', onclick: async e => { e.currentTarget.disabled = true; const r = await portal(saved.name, saved.pin); if (r.data) showBoards(r.data, saved.name, saved.pin); else { forget(); showNames(); } } }, `Continue as ${saved.name}`),
        h('button', { class: 'btn quiet', onclick: () => { forget(); showNames(); } }, 'I am someone else')) : null,
      info.names.length ? [h('p', { class: 'step' }, h('span', { class: 'n n2' }, '1'), 'Tap your name'), h('div', { class: 'name-grid' }, tiles)] : h('div', { class: 'notice' }, 'Your teacher has not added students yet.'));
  }

  function showCode(name) {
    const boxes = [0, 1, 2, 3].map(i => h('input', { class: 'pin-box', inputmode: 'numeric', maxlength: '1', autocomplete: i === 0 ? 'one-time-code' : 'off', 'aria-label': `Code number ${i + 1}`, pattern: '[0-9]' }));
    const err = h('p', { class: 'error', role: 'alert' });
    const val = () => boxes.map(b => b.value).join('');
    const go = async () => {
      const v = val(); if (v.length !== 4) return; err.textContent = '';
      const r = await portal(name, v);
      if (r.data) showBoards(r.data, name, v); else { err.textContent = r.err; boxes.forEach(b => { b.value = ''; }); boxes[0].focus(); }
    };
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => { b.value = b.value.replace(/\D/g, '').slice(-1); if (b.value && i < 3) boxes[i + 1].focus(); if (val().length === 4) go(); });
      b.addEventListener('keydown', e => { if (e.key === 'Backspace' && !b.value && i > 0) boxes[i - 1].focus(); if (e.key === 'Enter') go(); });
      b.addEventListener('paste', e => { const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 4); if (!d) return; e.preventDefault(); d.split('').forEach((c, k) => { boxes[k].value = c; }); if (d.length === 4) go(); });
    });
    const idx = Math.max(0, info.names.indexOf(name));
    page('', h('div', { class: 'join-head' }, h('p', { class: 'hint' }, 'Your class'), h('h1', null, info.name), teacherTag()),
      h('div', { class: 'whoami ' + TILE[idx % TILE.length] }, h('small', null, 'You are'), h('b', null, name)),
      h('p', { class: 'step' }, h('span', { class: 'n n3' }, '2'), 'Type your 4-number code'), h('div', { class: 'pin-row' }, boxes), err,
      h('button', { class: 'btn quiet', onclick: showNames }, 'That is not me'));
    boxes[0].focus();
  }

  const when = iso => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  let classPoll = null;
  function showBoards(data, name, pin) {
    clearInterval(classPoll);
    const refresh = async () => { clearInterval(classPoll); const r = await portal(name, pin); if (r.data) showBoards(r.data, name, pin); };
    const work = {
      workPanel: async ({ currentCode, pick }) => { const r = await portal(name, pin); return workPanelDom(r.data ? r.data.boards : data.boards, currentCode, pick); },
      onSwitch: b => switchTo({ sb, root, b, name, pin, onBack: refresh, work }),
    };
    const newsKey = `bem-checked-class-${classCode}-${name}`, news = checkedNews(data.boards, newsKey);
    const card = b => {
      const [label, cls] = STATUS[b.status] || STATUS.new, locked = !b.code, isNews = news.includes(b);
      return h('div', { class: 'bcard ' + cls + (isNews ? ' is-new' : '') },
        h('div', { class: 'bc-main' }, h('b', null, isNews ? h('span', { class: 'new-badge' }, 'NEW') : null, b.title),
          h('div', { class: 'bc-meta' }, h('span', { class: 'tag ' + (b.mode === 'assignment' ? 'assign' : 'live') }, b.mode === 'assignment' ? 'Assignment' : 'Live class'),
            b.due_at ? h('span', null, 'Due ' + when(b.due_at)) : null, (() => { const d = dueInfo(b.due_at, b.status); return d ? h('span', { class: 'due-chip ' + d.cls }, d.text) : null; })(), b.starts_at && locked ? h('span', null, 'Opens ' + when(b.starts_at)) : null),
          h('span', { class: 'bc-status' }, label + (b.status === 'checked' && b.score ? ` · Score ${b.score}` : ''))),
        h('button', { class: 'btn big' + (b.status === 'sent' || b.status === 'checked' ? '' : ' primary'), disabled: locked, onclick: async e => {
          const btn = e.currentTarget; btn.disabled = true; clearInterval(classPoll);
          const r = await enterBoard({ sb, root, code: b.code, name, pin, onBack: refresh, ...work });
          if (r) { btn.disabled = false; toast(r.text, 'bad'); }
        } }, locked ? 'Not open yet' : b.status === 'sent' || b.status === 'checked' ? 'Look' : 'Open'));
    };
    const todo = data.boards.filter(b => b.status === 'new' || b.status === 'working' || b.status === 'live').sort(dueSort), done = data.boards.filter(b => b.status === 'sent' || b.status === 'checked');
    page('no-art me-wide',
      h('div', { class: 'join-head' }, h('p', { class: 'hint' }, data.class), h('h1', null, `Hi, ${data.name}!`), teacherTag()),
      h('div', { class: 'me-grid' + (data.apps && data.apps.length ? '' : ' no-apps') },
        appsSection(data.apps, `bem-seen-class-${classCode}-${name}`),
        h('div', { class: 'me-work' },
          data.boards.length || (data.apps && data.apps.length) ? null : h('div', { class: 'notice yellow' }, h('b', null, 'No boards yet. '), 'When your teacher adds one, it shows up here.'),
          todo.length ? h('h2', { class: 'bsec' }, 'To do') : null, h('div', { class: 'blist' }, todo.map(card)),
          done.length ? h('h2', { class: 'bsec' }, 'Sent') : null, h('div', { class: 'blist' }, done.map(card)),
          h('div', { class: 'brow' }, h('button', { class: 'btn', onclick: refresh }, 'Refresh'), h('button', { class: 'btn quiet', onclick: () => { forget(); showNames(); } }, 'This is not me')))));
    checkedPopup(news, newsKey);
    // the page notices by itself when the teacher checks something (a quiet look once a minute)
    const sig = d => JSON.stringify(d.boards.map(x => [x.id, x.status, x.checked_at, x.score, x.code ? 1 : 0, x.title, x.due_at])), base = sig(data);
    classPoll = setInterval(async () => { if (document.hidden) return; const r = await portal(name, pin); if (r.data && sig(r.data) !== base) { clearInterval(classPoll); showBoards(r.data, name, pin); } }, 60000);
  }

  if (saved && saved.name && saved.pin) { const r = await portal(saved.name, saved.pin); if (r.data) return showBoards(r.data, saved.name, saved.pin); forget(); }
  showNames();
}

// a student's own page: one private link, one code, and every piece of work made for that student.
// Work that has not been started yet is marked NEW and moves, so it is clear what to do.
export async function startMe(root, pageCode, opts = {}) {
  pageCode = pageCode.toUpperCase();
  // the teacher can open any student's page as the student sees it, without the code (only where the teacher is signed in)
  let asTeacher = !!opts.asTeacher, sb = makeClient(asTeacher ? 'teacher' : 'student');
  if (asTeacher) { const { data: { session } } = await sb.auth.getSession(); if (!session) { asTeacher = false; sb = makeClient('student'); } }
  const slot = new URLSearchParams(location.search).get('slot') || '';
  const saveKey = `bem-me-${pageCode}-${slot}`;
  const page = (cls, ...kids) => root.replaceChildren(h('div', { class: 'entry student ' + cls }, h('div', { class: 'side' }, brand(true), ...kids), h('div', { class: 'art', 'aria-hidden': 'true' }, artSvg())));
  page('', h('p', { class: 'lead' }, 'Opening your page…'));

  let info;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session && !asTeacher) { const { error } = await sb.auth.signInAnonymously(); if (error) throw error; }
    const r = await sb.rpc('get_student_page', { p_page: pageCode });
    if (r.error) throw r.error;
    info = r.data;
  } catch (e) {
    console.error(e);
    return page('', h('div', { class: 'notice bad' }, 'We could not connect. ' + friendlyError(e)), h('button', { class: 'btn primary', onclick: () => startMe(root, pageCode) }, 'Try again'));
  }
  if (!info.found) return page('', h('h1', null, 'Page not found'), h('p', { class: 'lead' }, 'Check the link your teacher sent.'));
  const name = info.name;

  let savedPin = null; try { savedPin = localStorage.getItem(saveKey); } catch (e) { /* ignore */ }
  const forget = () => { try { localStorage.removeItem(saveKey); } catch (e) { /* ignore */ } savedPin = null; };
  const portal = async pin => {
    if (asTeacher) { const { data, error } = await sb.rpc('teacher_student_portal', { p_page: pageCode }); return error ? { err: friendlyError(error) } : { data }; }
    const { data, error } = await sb.rpc('student_portal', { p_page: pageCode, p_pin: pin });
    if (error) return { err: friendlyError(error) };
    if (data.error) return { err: MESSAGES[data.error] || 'Try again.' };
    try { localStorage.setItem(saveKey, pin); } catch (e) { /* ignore */ }
    return { data };
  };

  function showCode() {
    const boxes = [0, 1, 2, 3].map(i => h('input', { class: 'pin-box', inputmode: 'numeric', maxlength: '1', autocomplete: i === 0 ? 'one-time-code' : 'off', 'aria-label': `Code number ${i + 1}`, pattern: '[0-9]' }));
    const err = h('p', { class: 'error', role: 'alert' });
    const val = () => boxes.map(b => b.value).join('');
    const go = async () => {
      const v = val(); if (v.length !== 4) return; err.textContent = '';
      const r = await portal(v);
      if (r.data) showBoards(r.data, v); else { err.textContent = r.err; boxes.forEach(b => { b.value = ''; }); boxes[0].focus(); }
    };
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => { b.value = b.value.replace(/\D/g, '').slice(-1); if (b.value && i < 3) boxes[i + 1].focus(); if (val().length === 4) go(); });
      b.addEventListener('keydown', e => { if (e.key === 'Backspace' && !b.value && i > 0) boxes[i - 1].focus(); if (e.key === 'Enter') go(); });
      b.addEventListener('paste', e => { const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 4); if (!d) return; e.preventDefault(); d.split('').forEach((c, k) => { boxes[k].value = c; }); if (d.length === 4) go(); });
    });
    page('', h('div', { class: 'join-head' }, h('p', { class: 'hint' }, 'Your page'), h('h1', null, `Hi, ${name}!`), teacherTag()),
      h('p', { class: 'step' }, h('span', { class: 'n n3' }, '1'), 'Type your 4-number code'), h('div', { class: 'pin-row' }, boxes), err);
    boxes[0].focus();
  }

  const when = iso => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  // ---- the small idea board in the top right corner: write or draw anything, it saves by itself
  let ideaTimer = null, ideaPoll = null, ideaFlush = null, boardsPoll = null;
  const stopIdea = () => { clearInterval(boardsPoll); clearInterval(ideaPoll); clearTimeout(ideaTimer); ideaPoll = null; if (ideaFlush) { ideaFlush(); ideaFlush = null; } };
  // what the student wrote on their small board, shown to the teacher without being able to change it
  function ideaReadOnly(idea) {
    idea = idea || { strokes: [], tstrokes: [] };
    const box = new IdeaBoard({ strokes: idea.strokes, other: idea.tstrokes, label: '', readonly: true });
    return h('div', { class: 'idea-slot' }, h('div', { class: 'idea-wrap' }, box.el, h('div', { class: 'idea-foot' }, h('span', { class: 'idea-status' }, `What ${name} wrote for you`)), idea.reply ? h('p', { class: 'idea-reply' }, idea.reply) : null));
  }
  function ideaPanel(idea, pin) {
    idea = idea || { strokes: [], tstrokes: [], reply: null, reply_at: null };
    const seenKey = `bem-idea-seen-${pageCode}`;
    const seenAt = () => { try { return Number(localStorage.getItem(seenKey) || 0); } catch (e) { return 0; } };
    const markSeen = () => { try { localStorage.setItem(seenKey, String(Date.now())); } catch (e) { /* ignore */ } badge.hidden = true; };
    const hasReply = i => !!(i && ((i.tstrokes && i.tstrokes.length) || i.reply));
    const isNew = i => hasReply(i) && i.reply_at && Date.parse(i.reply_at) > seenAt();
    const status = h('span', { class: 'idea-status' }, '');
    const badge = h('span', { class: 'new-badge', hidden: !isNew(idea) }, 'NEW');
    const replyBox = h('p', { class: 'idea-reply', hidden: !idea.reply }, idea.reply || '');
    let latest = idea.strokes || [], dirty = false, firstAt = 0;
    const save = async () => {
      clearTimeout(ideaTimer); firstAt = 0; if (!dirty) return; dirty = false; status.textContent = 'Saving…';
      try {
        const { data: r, error } = await sb.rpc('idea_save', { p_page: pageCode, p_pin: pin, p_strokes: latest });
        if (error || (r && r.error)) throw new Error('save');
        status.textContent = 'Saved';
      } catch (e) { dirty = true; status.textContent = 'Not saved. Check your internet.'; }
    };
    ideaFlush = () => { if (dirty) save(); };
    const box = new IdeaBoard({ strokes: idea.strokes, other: idea.tstrokes, label: 'Tell Teacher Maya', onChange: list => { latest = list; dirty = true; status.textContent = 'Writing…'; clearTimeout(ideaTimer); if (!firstAt) firstAt = Date.now(); ideaTimer = setTimeout(save, Math.max(0, Math.min(3000, firstAt + 8000 - Date.now()))); } });
    const big = h('button', { type: 'button', class: 'ib', 'aria-label': 'Make the board bigger', title: 'Bigger', onclick: () => {
      const on = !inner.classList.contains('big');
      if (on) slot.style.minHeight = inner.offsetHeight + 'px';
      inner.classList.toggle('big', on); big.setAttribute('aria-pressed', String(on)); big.setAttribute('aria-label', on ? 'Make the board smaller' : 'Make the board bigger');
    } }, iconEl('fit', 16));
    box.bar.append(big);
    if (badge) box.bar.querySelector('.idea-label').append(' ', badge);
    box.canvas.addEventListener('pointerdown', () => { if (!badge.hidden) markSeen(); });
    replyBox.addEventListener('click', markSeen);
    const inner = h('div', { class: 'idea-wrap' }, box.el, h('div', { class: 'idea-foot' }, status), replyBox);
    const slot = h('div', { class: 'idea-slot' }, inner);
    visibilityFlush();
    clearInterval(ideaPoll);
    ideaPoll = setInterval(async () => {   // pick up what the teacher wrote back
      try {
        const { data: r } = await sb.rpc('idea_get', { p_page: pageCode, p_pin: pin });
        if (r && r.idea) { box.setOther(r.idea.tstrokes); replyBox.textContent = r.idea.reply || ''; replyBox.hidden = !r.idea.reply; if (isNew(r.idea)) badge.hidden = false; }
      } catch (e) { /* try again next time */ }
    }, 45000);
    return slot;
  }
  let flushHooked = false;
  function visibilityFlush() { if (flushHooked) return; flushHooked = true; document.addEventListener('visibilitychange', () => { if (document.hidden && ideaFlush) ideaFlush(); }); addEventListener('pagehide', () => { if (ideaFlush) ideaFlush(); }); }

  function showBoards(data, pin) {
    stopIdea();
    const refresh = async () => { stopIdea(); const r = await portal(pin); if (r.data) showBoards(r.data, pin); };
    const work = {
      workPanel: async ({ currentCode, pick }) => { const r = await portal(pin); return workPanelDom(r.data ? r.data.boards : data.boards, currentCode, pick); },
      onSwitch: b => switchTo({ sb, root, b, name, pin, onBack: refresh, work }),
    };
    const newsKey = `bem-checked-${pageCode}`, news = asTeacher ? [] : checkedNews(data.boards, newsKey);
    const card = b => {
      const [label, cls] = STATUS[b.status] || STATUS.new, locked = !b.code, isNews = news.includes(b), fresh = (b.status === 'new' && !locked) || isNews;
      return h('div', { class: 'bcard ' + cls + (fresh ? ' is-new' : '') },
        h('div', { class: 'bc-main' },
          h('b', null, fresh ? h('span', { class: 'new-badge' }, 'NEW') : null, b.title),
          h('div', { class: 'bc-meta' }, h('span', { class: 'tag ' + (b.mode === 'assignment' ? 'assign' : 'live') }, b.mode === 'assignment' ? 'Assignment' : 'Live class'),
            b.class ? h('span', null, b.class) : null,
            b.due_at ? h('span', null, 'Due ' + when(b.due_at)) : null, (() => { const d = dueInfo(b.due_at, b.status); return d ? h('span', { class: 'due-chip ' + d.cls }, d.text) : null; })(), b.starts_at && locked ? h('span', null, 'Opens ' + when(b.starts_at)) : null),
          h('span', { class: 'bc-status' }, label + (b.status === 'checked' && b.score ? ` · Score ${b.score}` : ''))),
        h('button', { class: 'btn big' + (b.status === 'sent' || b.status === 'checked' ? '' : ' primary'), disabled: locked, onclick: async e => {
          const btn = e.currentTarget; btn.disabled = true;
          if (asTeacher) { location.hash = '#/board/' + b.id; return; }     // the teacher opens it in her own screens
          stopIdea(); const r = await enterBoard({ sb, root, code: b.code, name, pin, onBack: refresh, ...work });
          if (r) { btn.disabled = false; toast(r.text, 'bad'); }
        } }, locked ? 'Not open yet' : b.status === 'sent' || b.status === 'checked' ? 'Look' : fresh ? 'Start' : 'Open'));
    };
    const fresh = data.boards.filter(b => b.status === 'new' && b.code);
    const todo = data.boards.filter(b => b.status === 'new' || b.status === 'working' || b.status === 'live').sort(dueSort);
    const done = data.boards.filter(b => b.status === 'sent' || b.status === 'checked');
    page('no-art me-wide',
      asTeacher ? h('div', { class: 'teacher-preview', role: 'status' }, h('span', null, `You are looking at ${data.name}'s page, the way ${data.name} sees it. No code needed.`), h('button', { class: 'btn sm', onclick: () => { location.hash = '#/'; } }, 'Back to my students')) : null,
      h('div', { class: 'me-top' },
        h('div', { class: 'join-head' }, h('p', { class: 'hint' }, asTeacher ? `${data.name}'s page` : 'Your page'), h('h1', null, asTeacher ? data.name : `Hi, ${data.name}!`), teacherTag()),
        asTeacher ? ideaReadOnly(data.idea) : ideaPanel(data.idea, pin)),
      fresh.length ? h('div', { class: 'new-banner', role: 'status' }, h('span', { class: 'new-badge' }, 'NEW'), fresh.length === 1 ? 'You have 1 new thing to do!' : `You have ${fresh.length} new things to do!`) : null,
      h('div', { class: 'me-grid' + (data.apps && data.apps.length ? '' : ' no-apps') },
        appsSection(data.apps, `bem-seen-${pageCode}`),
        h('div', { class: 'me-work' },
        data.boards.length || (data.apps && data.apps.length) ? null : h('div', { class: 'notice yellow' }, h('b', null, 'Nothing yet. '), 'When your teacher adds work for you, it shows up here.'),
        todo.length ? h('h2', { class: 'bsec' }, 'To do') : null, h('div', { class: 'blist' }, todo.map(card)),
        done.length ? h('h2', { class: 'bsec' }, 'Sent') : null, h('div', { class: 'blist' }, done.map(card)),
        h('div', { class: 'brow' }, h('button', { class: 'btn', onclick: refresh }, 'Refresh'), asTeacher ? null : h('button', { class: 'btn quiet', onclick: () => { forget(); showCode(); } }, 'This is not me')))));
    checkedPopup(news, newsKey);
    // the page notices by itself when the teacher checks something (a quiet look once a minute; the idea board is saved first)
    const sig = d => JSON.stringify(d.boards.map(x => [x.id, x.status, x.checked_at, x.score, x.code ? 1 : 0, x.title, x.due_at])), base = sig(data);
    boardsPoll = setInterval(async () => { if (document.hidden) return; const r = await portal(pin); if (r.data && sig(r.data) !== base) { stopIdea(); showBoards(r.data, pin); } }, 60000);
  }

  if (asTeacher) { const r = await portal(); if (r.data) return showBoards(r.data, null); return page('', h('div', { class: 'notice bad' }, r.err || 'Could not open this page.'), h('button', { class: 'btn', onclick: () => { location.hash = '#/'; } }, 'Back to my students')); }
  if (savedPin) { const r = await portal(savedPin); if (r.data) return showBoards(r.data, savedPin); forget(); }
  showCode();
}
