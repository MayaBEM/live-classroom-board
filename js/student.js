// Student side: open the link, tap your name, type the 4-number code from your teacher, join the board.
// (A board without a class list asks the student to type a first name instead, with an optional PIN.)
import { h, toast } from './util.js';
import { makeClient, friendlyError } from './db.js';
import { Store } from './store.js';
import { BoardView } from './board.js';
import { brand, artSvg } from './teacher.js';
import { iconEl } from './icons.js';
import { CONFIG } from '../config.js';

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
  TOO_MANY: 'Too many tries. Wait ten minutes, or ask your teacher.',
};
const msgFor = e => { const m = (e && e.message) || ''; for (const k of Object.keys(MESSAGES)) if (m.includes(k)) return MESSAGES[k]; return friendlyError(e); };
const TILE = ['c1', 'c2', 'c3', 'c4', 'c5'];

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
      new BoardView({ sb, store, role: 'student', root, code, onExit: () => {} }).start();
      return null;
    } catch (e) { console.error(e); const m = (e && e.message) || ''; return { key: Object.keys(MESSAGES).find(k => m.includes(k)) || '', text: msgFor(e) }; }
  };

  const heading = () => h('div', { class: 'join-head' }, h('p', { class: 'hint' }, info.mode === 'assignment' ? 'Assignment' : 'You are joining'), h('h1', null, info.title),
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
async function enterBoard({ sb, root, code, name, pin, onBack }) {
  try {
    const { data, error } = await sb.rpc('join_board', { p_code: code, p_name: name, p_pin: pin || null });
    if (error) throw error;
    if (data && data.error) throw new Error(data.error);
    const store = new Store(sb, { boardId: data.board_id, role: 'student', participantId: data.participant_id, name: data.name });
    await store.load(); await store.connect();
    new BoardView({ sb, store, role: 'student', root, code, onBack, onExit: () => {} }).start();
    return null;
  } catch (e) { console.error(e); const m = (e && e.message) || ''; return { key: Object.keys(MESSAGES).find(k => m.includes(k)) || '', text: msgFor(e) }; }
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
    page('', h('div', { class: 'join-head' }, h('p', { class: 'hint' }, 'Your class'), h('h1', null, info.name)),
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
    page('', h('div', { class: 'join-head' }, h('p', { class: 'hint' }, 'Your class'), h('h1', null, info.name)),
      h('div', { class: 'whoami ' + TILE[idx % TILE.length] }, h('small', null, 'You are'), h('b', null, name)),
      h('p', { class: 'step' }, h('span', { class: 'n n3' }, '2'), 'Type your 4-number code'), h('div', { class: 'pin-row' }, boxes), err,
      h('button', { class: 'btn quiet', onclick: showNames }, 'That is not me'));
    boxes[0].focus();
  }

  const when = iso => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  function showBoards(data, name, pin) {
    const refresh = async () => { const r = await portal(name, pin); if (r.data) showBoards(r.data, name, pin); };
    const card = b => {
      const [label, cls] = STATUS[b.status] || STATUS.new, locked = !b.code;
      return h('div', { class: 'bcard ' + cls },
        h('div', { class: 'bc-main' }, h('b', null, b.title),
          h('div', { class: 'bc-meta' }, h('span', { class: 'tag ' + (b.mode === 'assignment' ? 'assign' : 'live') }, b.mode === 'assignment' ? 'Assignment' : 'Live class'),
            b.due_at ? h('span', null, 'Due ' + when(b.due_at)) : null, b.starts_at && locked ? h('span', null, 'Opens ' + when(b.starts_at)) : null),
          h('span', { class: 'bc-status' }, label + (b.status === 'checked' && b.score ? ` · Score ${b.score}` : ''))),
        h('button', { class: 'btn big' + (b.status === 'sent' || b.status === 'checked' ? '' : ' primary'), disabled: locked, onclick: async e => {
          const btn = e.currentTarget; btn.disabled = true;
          const r = await enterBoard({ sb, root, code: b.code, name, pin, onBack: refresh });
          if (r) { btn.disabled = false; toast(r.text, 'bad'); }
        } }, locked ? 'Not open yet' : b.status === 'sent' || b.status === 'checked' ? 'Look' : 'Open'));
    };
    const todo = data.boards.filter(b => b.status === 'new' || b.status === 'working' || b.status === 'live'), done = data.boards.filter(b => b.status === 'sent' || b.status === 'checked');
    page('no-art',
      h('div', { class: 'join-head' }, h('p', { class: 'hint' }, data.class), h('h1', null, `Hi, ${data.name}!`)),
      data.boards.length ? null : h('div', { class: 'notice yellow' }, h('b', null, 'No boards yet. '), 'When your teacher adds one, it shows up here.'),
      todo.length ? h('h2', { class: 'bsec' }, 'To do') : null, h('div', { class: 'blist' }, todo.map(card)),
      done.length ? h('h2', { class: 'bsec' }, 'Sent') : null, h('div', { class: 'blist' }, done.map(card)),
      h('div', { class: 'brow' }, h('button', { class: 'btn', onclick: refresh }, 'Refresh'), h('button', { class: 'btn quiet', onclick: () => { forget(); showNames(); } }, 'This is not me')));
  }

  if (saved && saved.name && saved.pin) { const r = await portal(saved.name, saved.pin); if (r.data) return showBoards(r.data, saved.name, saved.pin); forget(); }
  showNames();
}
