// A pick list of the web apps in Maya's library (brightengmath.com/library).
// The library does not let other sites read it live, so this uses a copy (data/library-apps.json, made by tools/library-snapshot.mjs).
import { h, modal, toast } from './util.js';
import { friendlyError } from './db.js';
import { coverFromFile, cleanUrl, validUrl } from './shelf.js';   // (shelf.js also imports this file: fine, it is only used when a button is tapped)

let cache = null;
export async function loadLibrary() {
  if (!cache) {
    const r = await fetch('./data/library-apps.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('The library list is missing.');
    cache = await r.json();
  }
  return cache;
}

// a library title is long and written for search engines: keep the front of it, cut at a word, max 60 letters
export function shortTitle(t) {
  let s = String(t || '').replace(/\s+/g, ' ').trim();
  if (s.length <= 60) return s;
  s = s.slice(0, 60);
  const i = s.lastIndexOf(' ');
  return (i > 30 ? s.slice(0, i) : s).replace(/(\s+(to|and|for|with|the|a|of|in|on|&|\+|\|))+$/i, '').replace(/[\s,:;|\-–—+]+$/, '');
}

export async function libraryCover(app) {
  if (!app.cover) return null;
  const r = await fetch('./' + app.cover);
  if (!r.ok) return null;
  return coverFromFile(await r.blob());
}

// A search box and a short list. onPick(app) is called when she taps one.
export function libraryPicker({ onPick, have = new Set() }) {
  const q = h('input', { class: 'input', type: 'search', placeholder: 'Search your library, like "fish" or "angles"', 'aria-label': 'Search your library', autocomplete: 'off' });
  const list = h('div', { class: 'lib-list', role: 'list' });
  const note = h('p', { class: 'hint', style: { marginTop: '6px' } });
  let data = null;
  const draw = () => {
    if (!data) return;
    const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = data.apps.filter(a => words.every(w => (a.title + ' ' + (a.subject || '') + ' ' + (a.grades || []).join(' ')).toLowerCase().includes(w)));
    const shown = hit.slice(0, 12);
    list.replaceChildren(...shown.map(a => h('button', { type: 'button', class: 'lib-row', role: 'listitem', onclick: () => onPick(a) },
      a.cover ? h('img', { class: 'lib-thumb', src: './' + a.cover, alt: '', loading: 'lazy' }) : h('span', { class: 'lib-thumb' }),
      h('span', { class: 'lib-txt' }, h('span', { class: 'lib-name' }, shortTitle(a.title)), h('span', { class: 'lib-sub' }, [a.subject, (a.grades || []).map(g => g.replace('Grade ', 'G')).join(' ')].filter(Boolean).join(' · ')),
        a.url ? null : h('span', { class: 'lib-sub warn' }, 'Link needed')),
      have.has(a.url) ? h('span', { class: 'lib-on' }, 'On shelf') : null)));
    note.textContent = hit.length ? (hit.length > shown.length ? `Showing ${shown.length} of ${hit.length}. Type more to narrow it.` : `${hit.length} found.`) : 'Nothing found. Try another word.';
  };
  q.addEventListener('input', draw);
  loadLibrary().then(d => { data = d; note.textContent = ''; draw(); }, () => { note.textContent = 'The library list could not be opened.'; });
  return { el: h('div', { class: 'lib-pick' }, q, list, note), focus: () => q.focus() };
}

// the picture file of a library app as a small JPEG data address (it is already a small square, so it is only wrapped)
async function coverData(a) {
  if (!a.cover) return null;
  const r = await fetch('./' + a.cover); if (!r.ok) return null;
  const blob = await r.blob();
  const d = await new Promise((ok, no) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = no; f.readAsDataURL(blob); });
  return /^data:image\/jpeg;base64,/.test(d) && d.length <= 140000 ? d : coverFromFile(blob);
}

// Bring many library apps onto the shelf at once. existing: the apps already on the shelf.
export async function importLibraryDialog({ sb, existing = [], onSaved }) {
  let lib;
  try { lib = await loadLibrary(); } catch (e) { toast('The library list could not be opened.', 'bad'); return; }
  const have = new Set(existing.map(a => a.url)), haveTitle = new Set(existing.map(a => a.title.toLowerCase()));
  const rows = lib.apps.map(a => {
    const title = shortTitle(a.title), onShelf = (a.url && have.has(a.url)) || haveTitle.has(title.toLowerCase());
    const cb = h('input', { type: 'checkbox', 'aria-label': title, disabled: onShelf, checked: !onShelf && !!a.url });
    const link = a.url || onShelf ? null : h('input', { class: 'input lib-link', inputmode: 'url', autocapitalize: 'off', autocomplete: 'off', placeholder: 'Paste its link to include it', 'aria-label': 'Link for ' + title, maxlength: '500' });
    if (link) link.addEventListener('input', () => { cb.checked = validUrl(cleanUrl(link.value)); });
    const el = h('div', { class: 'lib-imp' + (onShelf ? ' done' : '') },
      h('label', { class: 'lib-imp-top' }, cb, a.cover ? h('img', { class: 'lib-thumb sm', src: './' + a.cover, alt: '', loading: 'lazy' }) : h('span', { class: 'lib-thumb sm' }),
        h('span', { class: 'lib-txt' }, h('span', { class: 'lib-name' }, title), h('span', { class: 'lib-sub' }, onShelf ? 'Already on your shelf' : a.url ? a.url.replace(/^https?:\/\//, '') : 'Needs a link'))),
      link);
    return { a, title, cb, link, el, onShelf, text: (a.title + ' ' + (a.subject || '') + ' ' + (a.grades || []).join(' ')).toLowerCase() };
  });
  const count = h('span', { class: 'pick-count' });
  const upd = () => { const n = rows.filter(r => r.cb.checked && !r.onShelf).length; count.textContent = `${n} chosen`; go.disabled = !n; go.textContent = n ? `Add ${n} to my shelf` : 'Add to my shelf'; };
  const q = h('input', { class: 'input', type: 'search', placeholder: 'Search', 'aria-label': 'Search the list', autocomplete: 'off' });
  q.addEventListener('input', () => { const w = q.value.toLowerCase().split(/\s+/).filter(Boolean); rows.forEach(r => { r.el.hidden = !w.every(x => r.text.includes(x)); }); });
  const list = h('div', { class: 'lib-imp-list' }, rows.map(r => r.el));
  list.addEventListener('change', upd); list.addEventListener('input', upd);
  const setAll = v => rows.forEach(r => { if (!r.onShelf && r.a.url && !r.el.hidden) r.cb.checked = v; upd(); });
  const err = h('p', { class: 'error', role: 'alert' });
  const go = h('button', { class: 'btn primary' }, 'Add to my shelf');
  const m = modal({
    title: 'Bring my library apps to the shelf', wide: true,
    body: h('div', null,
      h('p', { class: 'hint', style: { marginBottom: '8px' } }, `${lib.apps.length} web apps in your library (list copied ${lib.taken}). Apps with a link are ticked. The library keeps the others private: paste a link next to one to include it.`),
      h('div', { class: 'pick-bar' }, q, h('button', { type: 'button', class: 'btn sm', onclick: () => setAll(true) }, 'Tick all with a link'), h('button', { type: 'button', class: 'btn sm', onclick: () => setAll(false) }, 'Tick none'), count),
      list, err),
    actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), go],
  });
  upd();
  go.addEventListener('click', async () => {
    err.textContent = '';
    const pick = rows.filter(r => r.cb.checked && !r.onShelf).map(r => ({ r, url: r.a.url || cleanUrl(r.link && r.link.value) }));
    const bad = pick.find(p => !validUrl(p.url));
    if (bad) { err.textContent = `The link for "${bad.r.title}" does not look right.`; bad.r.link && bad.r.link.focus(); return; }
    go.disabled = true; let done = 0;
    try {
      for (let i = 0; i < pick.length; i += 8) {
        const batch = await Promise.all(pick.slice(i, i + 8).map(async p => ({ title: p.r.title, url: p.url, note: null, cover: await coverData(p.r.a).catch(() => null) })));
        const r = await sb.from('apps').insert(batch); if (r.error) throw r.error;
        done += batch.length; go.textContent = `Adding… ${done} of ${pick.length}`;
      }
      m.close(); toast(`${done} app${done === 1 ? '' : 's'} added to your shelf. Now press "Give to students" on the ones you want.`, 'ok'); if (onSaved) onSaved();
    } catch (e) { err.textContent = (done ? `${done} were added, then it stopped: ` : '') + friendlyError(e); go.disabled = false; if (done && onSaved) onSaved(); }
  });
}
