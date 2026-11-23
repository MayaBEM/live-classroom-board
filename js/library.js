// A pick list of the web apps in Maya's library (brightengmath.com/library).
// The library does not let other sites read it live, so this uses a copy (data/library-apps.json, made by tools/library-snapshot.mjs).
import { h } from './util.js';
import { coverFromFile } from './shelf.js';   // (shelf.js also imports this file: fine, it is only used when a button is tapped)

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
