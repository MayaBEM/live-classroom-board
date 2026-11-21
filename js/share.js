// "Send to your students": a card with the link, and one-tap messages (one for the whole class, one per student with their own code).
import { h, modal, toast, copyText, joinUrl, shareMessage, asset } from './util.js';
import { iconEl } from './icons.js';
import { friendlyError } from './db.js';
import { CONFIG } from '../config.js';

const TILE = ['c1', 'c2', 'c3', 'c4', 'c5'];

export async function shareDialog({ sb, store }) {
  const b = store.board, link = joinUrl(b.code), teacher = CONFIG.TEACHER_NAME || 'Teacher';
  let roster = [];
  if (b.class_id) {
    const { data } = await sb.from('class_students').select('first_name,code').eq('class_id', b.class_id).order('first_name');
    roster = (data || []).filter(r => r.code);
  }
  const copy = async (text, ok) => toast((await copyText(text)) ? ok : 'Could not copy. Select the text and press Ctrl+C.', 'ok');

  const card = h('div', { class: 'share-card' },
    h('div', { class: 'sc-top' }, h('img', { class: 'mark', src: asset('img/logo-mark.png'), alt: '' }), h('div', null, h('small', null, 'Join the board'), h('b', null, b.title))),
    h('ol', { class: 'sc-steps' },
      h('li', null, h('span', { class: 'n n1' }, '1'), 'Open the link'),
      h('li', null, h('span', { class: 'n n2' }, '2'), 'Tap your name'),
      h('li', null, h('span', { class: 'n n3' }, '3'), 'Type your 4-number code')),
    h('div', { class: 'sc-link' }, link));

  const sw = h('button', { class: 'switch', role: 'switch', 'aria-checked': String(b.link_enabled) }, h('span', { class: 'box' }), h('span', { class: 'txt' }, b.link_enabled ? 'Link is ON: students can join' : 'Link is OFF: nobody can join'));
  sw.addEventListener('click', async () => {
    const val = !b.link_enabled;
    const { error } = await sb.from('boards').update({ link_enabled: val }).eq('id', b.id);
    if (error) return toast(friendlyError(error), 'bad');
    b.link_enabled = val; sw.setAttribute('aria-checked', String(val));
    sw.querySelector('.txt').textContent = val ? 'Link is ON: students can join' : 'Link is OFF: nobody can join';
    toast(val ? 'Link is on.' : 'Link is off. Students inside are disconnected.');
  });

  const parts = [card,
    h('div', { class: 'share-actions' },
      h('button', { class: 'btn primary', onclick: () => copy(shareMessage({ title: b.title, link, teacher }), 'Message copied. Paste it into LINE, Zoom or Meet.') }, iconEl('copy', 18), 'Copy message for the class'),
      h('button', { class: 'btn', onclick: () => copy(link, 'Link copied.') }, iconEl('link', 18), 'Copy link only'))];

  if (roster.length) {
    parts.push(h('h3', { class: 'share-h' }, 'Each student has their own code'),
      h('p', { class: 'hint' }, 'A student taps their name and types their code. Nobody can open another student\'s work.'),
      h('div', { class: 'code-list' }, roster.map((r, i) => h('div', { class: 'code-row ' + TILE[i % TILE.length] },
        h('span', { class: 'nm' }, r.first_name), h('b', { class: 'cd' }, r.code),
        h('button', { class: 'btn sm', onclick: () => copy(shareMessage({ title: b.title, link, teacher, name: r.first_name, code: r.code }), `Message for ${r.first_name} copied.`) }, iconEl('copy', 16), 'Copy')))),
      h('button', { class: 'btn sm', style: { marginTop: '10px' }, onclick: () => copy(roster.map(r => `${r.first_name}: ${r.code}`).join('\n'), 'List of codes copied.') }, 'Copy all names and codes'));
  } else {
    parts.push(h('div', { class: 'notice', style: { marginTop: '16px' } }, h('b', null, 'Tip: '), 'Add your students to the class (Dashboard, then the class). Each student gets a 4-number code, and on this board they only tap their name and type the code.'),
      h('p', { class: 'hint', style: { marginTop: '10px' } }, `Without a student list, students type their first name. Class code: ${b.code}`));
  }
  parts.push(h('div', { style: { marginTop: '16px' } }, sw));
  modal({ title: 'Send to your students', body: h('div', null, ...parts), wide: true });
}
