// Student side: open the link, type a first name (and optional PIN), join the board.
import { h, toast } from './util.js';
import { makeClient, friendlyError } from './db.js';
import { Store } from './store.js';
import { BoardView } from './board.js';
import { brand, artSvg } from './teacher.js';

const MESSAGES = {
  NAME_IN_USE: 'Someone is using that name right now. Add the first letter of your last name, like "Emma K".',
  PIN_REQUIRED: 'This name has a PIN. Type your 4-number PIN.',
  PIN_WRONG: 'That PIN is not right. Try again.',
  PIN_FORMAT: 'A PIN is 4 numbers, like 2580.',
  NAME_REQUIRED: 'Type your first name.',
  BOARD_CLOSED: 'This board is closed right now. Ask your teacher.',
};
const msgFor = e => { const m = (e && e.message) || ''; for (const k of Object.keys(MESSAGES)) if (m.includes(k)) return MESSAGES[k]; return friendlyError(e); };

export async function startStudent(root, code) {
  if (!code) return askCode(root);
  code = code.toUpperCase();
  const sb = makeClient('student');
  const page = (...kids) => root.replaceChildren(h('div', { class: 'entry' }, h('div', { class: 'side' }, brand(true), ...kids), h('div', { class: 'art', 'aria-hidden': 'true' }, artSvg())));
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
  if (!info.found) return page(h('h1', null, 'Board not found'), h('p', { class: 'lead' }, 'Check the link or the code your teacher sent. Letters and numbers must match.'));
  if (!info.enabled) return page(h('h1', null, info.title), h('div', { class: 'notice' }, 'This board is closed right now. Ask your teacher to open it.'));

  const saveKey = `bem-join-${code}`;
  let saved = null; try { saved = JSON.parse(localStorage.getItem(saveKey) || 'null'); } catch (e) { /* ignore */ }

  const enter = async (name, pin, errBox, btn) => {
    if (btn) { btn.disabled = true; btn.textContent = 'Joining…'; }
    try {
      const { data, error } = await sb.rpc('join_board', { p_code: code, p_name: name, p_pin: pin || null });
      if (error) throw error;
      try { localStorage.setItem(saveKey, JSON.stringify({ name: data.name })); } catch (e) { /* ignore */ }
      const store = new Store(sb, { boardId: data.board_id, role: 'student', participantId: data.participant_id, name: data.name });
      await store.load(); await store.connect();
      const view = new BoardView({ sb, store, role: 'student', root, code, onExit: () => {} });
      view.start();
    } catch (e) {
      console.error(e);
      if (errBox) errBox.textContent = msgFor(e);
      if (btn) { btn.disabled = false; btn.textContent = 'Join the board'; }
      if (!errBox) toast(msgFor(e), 'bad');
    }
  };

  const name = h('input', { class: 'input big', id: 'nm', maxlength: '24', autocomplete: 'off', autocapitalize: 'words', placeholder: 'Your first name' });
  const pin = h('input', { class: 'input', id: 'pin', maxlength: '4', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', placeholder: '4 numbers', 'aria-describedby': 'pinhint' });
  const err = h('p', { class: 'error', role: 'alert' });
  const btn = h('button', { class: 'btn primary', type: 'submit', style: { width: '100%', minHeight: '60px', fontSize: '20px' } }, 'Join the board');
  pin.addEventListener('input', () => { pin.value = pin.value.replace(/\D/g, '').slice(0, 4); });
  const roster = info.names && info.names.length ? h('div', null, h('div', { class: 'label', style: { marginBottom: '8px' } }, 'Tap your name'), h('div', { class: 'roster' }, info.names.map(n => h('button', { type: 'button', onclick: () => { name.value = n; pin.focus(); } }, n))), h('p', { class: 'hint', style: { marginBottom: '14px' } }, 'Not in the list? Type your name below.')) : null;
  const form = h('form', { novalidate: true, onsubmit: e => { e.preventDefault(); err.textContent = ''; if (!name.value.trim()) { err.textContent = MESSAGES.NAME_REQUIRED; name.focus(); return; } enter(name.value, pin.value, err, btn); } },
    roster,
    h('div', { class: 'field' }, h('label', { for: 'nm' }, 'Your first name'), name),
    h('div', { class: 'field' }, h('label', { for: 'pin' }, 'PIN (optional)'), pin, h('span', { class: 'hint', id: 'pinhint' }, 'Make a 4-number PIN if you want to come back to your own work later. Remember it!')),
    err, btn);

  const welcome = saved && saved.name ? h('div', { class: 'notice', style: { marginBottom: '8px' } },
    h('p', { style: { marginBottom: '10px' } }, `Welcome back, ${saved.name}.`),
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      h('button', { class: 'btn primary', onclick: e => enter(saved.name, '', null, e.currentTarget) }, `Continue as ${saved.name}`),
      h('button', { class: 'btn', onclick: () => { try { localStorage.removeItem(saveKey); } catch (e2) { /* ignore */ } welcome.remove(); } }, 'I am someone else'))) : null;

  page(h('div', null, h('p', { class: 'hint' }, 'You are joining'), h('h1', null, info.title)), welcome, form);
  if (!welcome) name.focus();
}

function askCode(root) {
  const input = h('input', { class: 'input big', id: 'cd', maxlength: '12', autocomplete: 'off', autocapitalize: 'characters', placeholder: 'Class code', style: { letterSpacing: '.16em', textTransform: 'uppercase' } });
  const err = h('p', { class: 'error', role: 'alert' });
  const form = h('form', { novalidate: true, onsubmit: e => { e.preventDefault(); const c = input.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c.length < 4) { err.textContent = 'Type the code your teacher gave you.'; return; } location.hash = '#/join/' + c; } },
    h('div', { class: 'field' }, h('label', { for: 'cd' }, 'Class code from your teacher'), input), err,
    h('button', { class: 'btn primary', type: 'submit', style: { width: '100%', minHeight: '60px', fontSize: '20px' } }, 'Continue'));
  root.replaceChildren(h('div', { class: 'entry' }, h('div', { class: 'side' }, brand(true), h('h1', null, 'Join your class'), form), h('div', { class: 'art', 'aria-hidden': 'true' }, artSvg())));
  input.focus();
}
