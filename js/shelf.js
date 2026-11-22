// The app shelf: Maya's own web apps and games (links). Each one is put on the page of the students she chooses.
import { h, modal, toast } from './util.js';
import { friendlyError } from './db.js';
import { checklist } from './members.js';

// a picture file -> a small 16:10 JPEG (as a data address) that is cheap to send to every student
export async function coverFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('That file is not a picture.')); i.src = url; });
    const W = 560, H = 350, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    const r = Math.max(W / img.naturalWidth, H / img.naturalHeight), w = img.naturalWidth * r, hh = img.naturalHeight * r;
    g.drawImage(img, (W - w) / 2, (H - hh) / 2, w, hh);
    for (let q = 0.82; q >= 0.4; q -= 0.1) { const d = c.toDataURL('image/jpeg', q); if (d.length <= 110000) return d; }
    return c.toDataURL('image/jpeg', 0.35);
  } finally { URL.revokeObjectURL(url); }
}

// What an app looks like, at a glance: its cover picture, or else the app itself shown small (it cannot be touched, a tap goes to the tile).
export function appThumb(a) {
  if (a.cover && /^data:image\/jpeg;base64,/.test(a.cover)) return h('img', { class: 'acover', src: a.cover, alt: '' });
  if (!/^https?:\/\//i.test(a.url || '')) return null;
  const W = 1000, H = 625;
  const frame = h('iframe', { class: 'alive-frame', src: a.url, title: '', tabindex: '-1', 'aria-hidden': 'true', loading: 'lazy', referrerpolicy: 'no-referrer', sandbox: 'allow-scripts allow-same-origin', width: String(W), height: String(H) });
  const box = h('div', { class: 'alive', 'aria-hidden': 'true' }, frame);
  const fit = () => { const w = box.clientWidth; if (w) frame.style.transform = `scale(${w / W})`; };
  if (window.ResizeObserver) new ResizeObserver(fit).observe(box); else setTimeout(fit, 50);
  return box;
}

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
  let cover = app && app.cover ? app.cover : null;
  const coverImg = h('img', { class: 'acover cover-edit', alt: 'Cover picture' });
  const coverBox = h('div', { class: 'cover-box' }, coverImg);
  const file = h('input', { type: 'file', accept: 'image/*', id: 'ap-c', hidden: true });
  const pickBtn = h('button', { type: 'button', class: 'btn sm', onclick: () => file.click() }, 'Choose picture');
  const dropBtn = h('button', { type: 'button', class: 'btn sm', onclick: () => { cover = null; drawCover(); } }, 'Remove picture');
  const drawCover = () => { coverImg.hidden = !cover; if (cover) coverImg.src = cover; dropBtn.hidden = !cover; pickBtn.textContent = cover ? 'Change picture' : 'Choose picture'; };
  file.addEventListener('change', async () => { const f = file.files && file.files[0]; if (!f) return; err.textContent = ''; try { cover = await coverFromFile(f); drawCover(); } catch (e) { err.textContent = friendlyError(e); } file.value = ''; });
  drawCover();
  const go = h('button', { class: 'btn primary' }, app ? 'Save' : 'Add to my shelf');
  const m = modal({
    title: app ? 'Change app' : 'Add an app to my shelf', wide: true,
    body: h('div', null,
      h('div', { class: 'field' }, h('label', { for: 'ap-t' }, 'Name'), title),
      h('div', { class: 'field' }, h('label', { for: 'ap-u' }, 'Link to the app'), url, h('span', { class: 'hint' }, 'The web address of your app or game. Students tap it and it opens in a new tab.')),
      h('div', { class: 'field' }, h('label', { for: 'ap-n' }, 'Note for the student'), note),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Cover picture (optional)'), h('span', { class: 'hint' }, 'A screenshot of the app. Students see it on their tile so they know what they are about to play.'), coverBox, h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, pickBtn, dropBtn), file),
      app ? h('div', { class: 'field' }, h('span', { class: 'label' }, 'Who has this app?'), list.el)
        : h('details', Object.assign({ class: 'field' }, preselect.length ? { open: true } : {}), h('summary', { class: 'label', style: { cursor: 'pointer' } }, preselect.length ? 'Also give it to' : 'Give it to students now (optional)'),
          h('p', { class: 'hint', style: { margin: '6px 0' } }, 'You can leave this empty. The app goes on your shelf, and you add it to students later with "Add from my shelf".'), list.el), err),
    actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), go],
  });
  go.addEventListener('click', async () => {
    err.textContent = '';
    const t = title.value.trim(), u = cleanUrl(url.value);
    if (!t) { err.textContent = 'Give the app a name.'; title.focus(); return; }
    if (!validUrl(u)) { err.textContent = 'That link does not look right. It should look like https://example.com/game'; url.focus(); return; }
    go.disabled = true;
    try {
      const row = { title: t, url: u, note: note.value.trim() || null, cover };
      let id = app && app.id;
      if (app) { const r = await sb.from('apps').update(row).eq('id', id); if (r.error) throw r.error; }
      else { const r = await sb.from('apps').insert(row).select().single(); if (r.error) throw r.error; id = r.data.id; }
      const want = new Set(list.ids());
      const drop = [...have].filter(s => !want.has(s)), add = [...want].filter(s => !have.has(s));
      if (drop.length) { const r = await sb.from('student_apps').delete().eq('app_id', id).in('student_id', drop); if (r.error) throw r.error; }
      if (add.length) { const r = await sb.from('student_apps').insert(add.map(s => ({ app_id: id, student_id: s }))); if (r.error) throw r.error; }
      m.close(); toast(app ? 'App saved.' : want.size ? `Added to your shelf and to ${want.size} student${want.size === 1 ? '' : 's'}.` : 'Added to your shelf. Now add it to students with "Give to students".', 'ok');
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

// from the shelf: choose which students have one app
export function giveToStudentsDialog({ sb, master, app, have, onSaved }) {
  const list = checklist(master, [...have], { empty: 'Your list of students is empty.' });
  const err = h('p', { class: 'error', role: 'alert' });
  const go = async () => {
    const want = new Set(list.ids());
    const drop = [...have].filter(x => !want.has(x)), add = [...want].filter(x => !have.has(x));
    try {
      if (drop.length) { const r = await sb.from('student_apps').delete().eq('app_id', app.id).in('student_id', drop); if (r.error) throw r.error; }
      if (add.length) { const r = await sb.from('student_apps').insert(add.map(x => ({ app_id: app.id, student_id: x }))); if (r.error) throw r.error; }
      m.close(); toast(`${app.title} is on ${want.size} student page${want.size === 1 ? '' : 's'}.`, 'ok'); if (onSaved) onSaved();
    } catch (e) { err.textContent = friendlyError(e); }
  };
  const m = modal({ title: `Who plays "${app.title}"?`, body: h('div', null, h('p', { class: 'hint', style: { marginBottom: '10px' } }, 'Tick the students who get this app on their page. Untick to take it away.'), list.el, err),
    actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: go }, 'Save')] });
}

// look at an app inside the teacher page, as a tablet or as a phone, before giving it to students
export function previewDialog(app) {
  const frame = h('iframe', { class: 'pv-frame', src: app.url, title: app.title, loading: 'lazy', referrerpolicy: 'no-referrer', sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-modals' });
  const stage = h('div', { class: 'pv-stage' }, frame);
  let size = 'tablet';
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Preview size' });
  const draw = () => {
    seg.replaceChildren(...[['tablet', 'Tablet'], ['phone', 'Phone']].map(([k, label]) => h('button', { type: 'button', 'aria-pressed': String(size === k), onclick: () => { size = k; draw(); } }, label)));
    stage.className = 'pv-stage ' + size;
  };
  draw();
  modal({ title: `Preview: ${app.title}`, wide: true,
    body: h('div', null,
      h('div', { class: 'pv-bar' }, seg, h('button', { class: 'btn sm', onclick: () => { frame.src = app.url; } }, 'Reload'), h('a', { class: 'btn sm', href: app.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open in new tab')),
      stage,
      h('p', { class: 'hint', style: { marginTop: '8px' } }, 'This is the real app, so you can play it here. If the window stays blank, that app does not allow previews: press Open in new tab.')) });
}
