// The app shelf: Maya's own web apps and games (links). Each one is put on the page of the students she chooses.
import { h, modal, toast } from './util.js';
import { friendlyError } from './db.js';
import { checklist } from './members.js';

export const cleanUrl = raw => {
  let u = String(raw || '').trim();
  if (!u) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
  return u;
};
const validUrl = u => /^https?:\/\/[^\s]+$/i.test(u) && u.length <= 500 && /^https?:\/\/[^\s/]+\.[^\s/]+/i.test(u);

// make a new app or change one; tick the students who get it
// app: existing row or null; have: Set of student ids who have it now; preselect: student ids ticked for a new app
export function appDialog({ sb, master, app = null, have = new Set(), preselect = [], onSaved }) {
  const title = h('input', { class: 'input', id: 'ap-t', value: app ? app.title : '', maxlength: '60', placeholder: 'Example: Fraction Pizza' });
  const url = h('input', { class: 'input', id: 'ap-u', value: app ? app.url : '', inputmode: 'url', autocapitalize: 'off', autocomplete: 'off', placeholder: 'https://…', maxlength: '500' });
  const note = h('input', { class: 'input', id: 'ap-n', value: app && app.note ? app.note : '', maxlength: '140', placeholder: 'Optional: what to practise, like "Halves and quarters"' });
  const list = checklist(master, app ? [...have] : preselect, { empty: 'Your list of students is empty.' });
  const err = h('p', { class: 'error', role: 'alert' });
  const go = h('button', { class: 'btn primary' }, app ? 'Save' : 'Add to shelf');
  const m = modal({
    title: app ? 'Change app' : 'Add an app or game', wide: true,
    body: h('div', null,
      h('div', { class: 'field' }, h('label', { for: 'ap-t' }, 'Name'), title),
      h('div', { class: 'field' }, h('label', { for: 'ap-u' }, 'Link to the app'), url, h('span', { class: 'hint' }, 'The web address of your app or game. Students tap it and it opens in a new tab.')),
      h('div', { class: 'field' }, h('label', { for: 'ap-n' }, 'Note for the student'), note),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Who gets this app?'), list.el), err),
    actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), go],
  });
  go.addEventListener('click', async () => {
    err.textContent = '';
    const t = title.value.trim(), u = cleanUrl(url.value);
    if (!t) { err.textContent = 'Give the app a name.'; title.focus(); return; }
    if (!validUrl(u)) { err.textContent = 'That link does not look right. It should look like https://example.com/game'; url.focus(); return; }
    go.disabled = true;
    try {
      const row = { title: t, url: u, note: note.value.trim() || null };
      let id = app && app.id;
      if (app) { const r = await sb.from('apps').update(row).eq('id', id); if (r.error) throw r.error; }
      else { const r = await sb.from('apps').insert(row).select().single(); if (r.error) throw r.error; id = r.data.id; }
      const want = new Set(list.ids());
      const drop = [...have].filter(s => !want.has(s)), add = [...want].filter(s => !have.has(s));
      if (drop.length) { const r = await sb.from('student_apps').delete().eq('app_id', id).in('student_id', drop); if (r.error) throw r.error; }
      if (add.length) { const r = await sb.from('student_apps').insert(add.map(s => ({ app_id: id, student_id: s }))); if (r.error) throw r.error; }
      m.close(); toast(app ? 'App saved.' : `Added. ${want.size} student${want.size === 1 ? '' : 's'} can play it.`, 'ok');
      if (onSaved) onSaved();
    } catch (e) { err.textContent = friendlyError(e); go.disabled = false; }
  });
}

// put apps that are already on the shelf onto one student's page
export function giveAppsDialog({ sb, student, apps, have, onSaved }) {
  const cand = apps.filter(a => !have.has(a.id)).map(a => ({ id: a.id, first_name: a.title, code: null }));
  const list = checklist(cand, [], { empty: apps.length ? 'Every app on your shelf is already on this page. Use "Add app" to put a new one on the shelf.' : 'Your shelf is empty. Close this and press "Add app" first: type a name and paste the link of a web app. After that it appears here.' });
  const err = h('p', { class: 'error', role: 'alert' });
  const go = async () => {
    const ids = list.ids(); if (!ids.length) { err.textContent = 'Tick at least one app.'; return; }
    const r = await sb.from('student_apps').insert(ids.map(a => ({ app_id: a, student_id: student.id })));
    if (r.error) { err.textContent = friendlyError(r.error); return; }
    m.close(); toast(`${ids.length} app${ids.length === 1 ? '' : 's'} added to ${student.first_name}'s page.`, 'ok'); if (onSaved) onSaved();
  };
  const m = modal({ title: `Apps for ${student.first_name}`, body: h('div', null, h('p', { class: 'hint', style: { marginBottom: '10px' } }, 'Tick apps from your shelf.'), list.el, err),
    actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), ...(cand.length ? [h('button', { class: 'btn primary', onclick: go }, 'Add to page')] : [])] });
}
