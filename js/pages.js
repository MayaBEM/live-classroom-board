// Creating boards and pages: uploads (PDF / images), blank / lined / grid pages, deleting boards with their files.
import { h, uuid, makeCode, modal, toast } from './util.js';
import { BUCKET, friendlyError } from './db.js';
import { pdfFromFile, pdfInfo } from './pdf.js';
import { iconEl } from './icons.js';
import { saveCover } from './covers.js';

export const PAGE_H = { landscape: 625, portrait: 1414 };
const MAX_FILE = 50 * 1024 * 1024;

async function prepareImage(file) {
  let bmp;
  try { bmp = await createImageBitmap(file); }
  catch (e) { throw new Error(`"${file.name}" could not be read as a picture. Use PNG, JPG or WebP.`); }
  const iw = bmp.width, ih = bmp.height, big = Math.max(iw, ih) > 2600 || file.size > 1.6 * 1024 * 1024;
  let blob = file, ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) ext = 'jpg';
  let w = iw, hh = ih;
  if (big) {
    const k = Math.min(1, 2600 / Math.max(iw, ih));
    w = Math.round(iw * k); hh = Math.round(ih * k);
    const c = document.createElement('canvas'); c.width = w; c.height = hh;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh); ctx.drawImage(bmp, 0, 0, w, hh);
    blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88)); ext = 'jpg';
  }
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
  return { blob, ext, mime, h: Math.max(200, Math.min(6000, Math.round(1000 * hh / w))) };
}

async function upload(sb, path, blob, contentType) {
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType, upsert: false });
  if (error) throw error;
}

// spec: { source: 'pdf'|'images'|'blank'|'lined'|'grid', files: File[], count, orient }
export async function addPagesToBoard(sb, boardId, startIdx, spec, progress = () => {}) {
  const rows = [];
  if (spec.source === 'pdf') {
    if (!spec.files.length) throw new Error('Choose a PDF file first.');
    for (let i = 0; i < spec.files.length; i++) {
      const f = spec.files[i];
      if (f.size > MAX_FILE) throw new Error(`"${f.name}" is bigger than 50 MB. The free plan allows files up to 50 MB.`);
      progress(`Reading ${f.name}…`, i / spec.files.length);
      let doc;
      try { doc = await pdfFromFile(f); } catch (e) { throw new Error(`"${f.name}" could not be opened as a PDF.`); }
      if (doc.numPages > 150) throw new Error('Please use a PDF with 150 pages or fewer.');
      const info = await pdfInfo(doc);
      progress(`Uploading ${f.name}…`, (i + 0.4) / spec.files.length);
      const path = `${boardId}/${uuid()}.pdf`;
      await upload(sb, path, f, 'application/pdf');
      for (const p of info) rows.push({ kind: 'pdf', file_path: path, pdf_page: p.n, h: p.h });
      try { (doc.loadingTask || doc).destroy(); } catch (e) { /* ignore */ }
    }
  } else if (spec.source === 'images') {
    if (!spec.files.length) throw new Error('Choose at least one picture first.');
    for (let i = 0; i < spec.files.length; i++) {
      const f = spec.files[i];
      progress(`Uploading picture ${i + 1} of ${spec.files.length}…`, i / spec.files.length);
      const im = await prepareImage(f);
      if (im.blob.size > MAX_FILE) throw new Error(`"${f.name}" is too big.`);
      const path = `${boardId}/${uuid()}.${im.ext}`;
      await upload(sb, path, im.blob, im.mime);
      rows.push({ kind: 'image', file_path: path, h: im.h });
    }
  } else {
    const n = Math.max(1, Math.min(40, spec.count || 1));
    for (let i = 0; i < n; i++) rows.push({ kind: spec.source, h: PAGE_H[spec.orient || 'landscape'] });
  }
  progress('Saving pages…', 0.95);
  const full = rows.map((r, i) => ({ board_id: boardId, idx: startIdx + i, w: 1000, ...r }));
  for (let i = 0; i < full.length; i += 100) {
    const { error } = await sb.from('pages').insert(full.slice(i, i + 100));
    if (error) throw error;
  }
  return full.length;
}

export async function createBoard(sb, { title, classId, spec, mode = 'live', startsAt = null, dueAt = null }, progress) {
  let board = null;
  for (let tries = 0; tries < 6 && !board; tries++) {
    const { data, error } = await sb.from('boards').insert({ title, class_id: classId || null, code: makeCode(6), mode, starts_at: startsAt, due_at: dueAt }).select().single();
    if (!error) board = data;
    else if (error.code !== '23505') throw error;
  }
  if (!board) throw new Error('Could not make a short code. Try again.');
  try { await addPagesToBoard(sb, board.id, 0, spec, progress); }
  catch (e) { await deleteBoard(sb, board.id).catch(() => {}); throw e; }
  try { await saveCover(sb, board.id); } catch (e) { /* the cover picture is a nice extra: the board is fine without it */ }
  return board;
}

export async function deleteBoardFiles(sb, boardId) {
  const { data } = await sb.storage.from(BUCKET).list(boardId, { limit: 1000 });
  if (data && data.length) await sb.storage.from(BUCKET).remove(data.map(f => `${boardId}/${f.name}`));
}
export async function deleteBoard(sb, boardId) {
  await deleteBoardFiles(sb, boardId);
  const { error } = await sb.from('boards').delete().eq('id', boardId);
  if (error) throw error;
}
export async function deleteClass(sb, classId) {
  const { data } = await sb.from('boards').select('id').eq('class_id', classId);
  for (const b of data || []) await deleteBoardFiles(sb, b.id);
  const { error } = await sb.from('classes').delete().eq('id', classId);
  if (error) throw error;
}

// ---------------------------------------------------------------- form used by "New board" and "Add pages"
export function sourceForm({ defaultSource = 'pdf' } = {}) {
  let src = defaultSource, orient = 'landscape';
  const file = h('input', { type: 'file', class: 'input', id: 'src-file', 'aria-label': 'Choose file' });
  const count = h('input', { type: 'number', class: 'input', id: 'src-count', min: '1', max: '40', value: '1', inputmode: 'numeric' });
  const fileBox = h('div', { class: 'field' }, h('label', { for: 'src-file' }, 'File'), file, h('span', { class: 'hint', id: 'src-hint' }));
  const orientSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Page shape' });
  const patBox = h('div', null,
    h('div', { class: 'field' }, h('label', { for: 'src-count' }, 'How many pages?'), count),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Page shape'), orientSeg));
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Start from' });
  const el = h('div', null, h('div', { class: 'field' }, h('span', { class: 'label' }, 'Start from'), seg), fileBox, patBox);
  const SRC = [['pdf', 'PDF file'], ['images', 'Pictures'], ['blank', 'Blank'], ['lined', 'Lined'], ['grid', 'Grid']];
  function draw() {
    seg.replaceChildren(...SRC.map(([k, label]) => h('button', { type: 'button', 'aria-pressed': String(src === k), onclick: () => { src = k; draw(); } }, label)));
    orientSeg.replaceChildren(...[['landscape', 'Wide'], ['portrait', 'Tall (A4)']].map(([k, label]) => h('button', { type: 'button', 'aria-pressed': String(orient === k), onclick: () => { orient = k; draw(); } }, label)));
    const isFile = src === 'pdf' || src === 'images';
    fileBox.hidden = !isFile; patBox.hidden = isFile;
    file.accept = src === 'pdf' ? 'application/pdf,.pdf' : 'image/png,image/jpeg,image/webp,image/gif';
    file.multiple = true; file.value = '';
    fileBox.querySelector('#src-hint').textContent = src === 'pdf' ? 'Worksheets and exam papers. Up to 50 MB each.' : 'You can choose several pictures. Each picture becomes one page.';
  }
  draw();
  return { el, spec: () => ({ source: src, files: [...(file.files || [])], count: parseInt(count.value, 10) || 1, orient }) };
}

export function openAddPages({ sb, boardId, pages, onDone }) {
  const form = sourceForm({ defaultSource: 'lined' });
  const bar = h('div', { class: 'progress', hidden: true }, h('div'));
  const msg = h('p', { class: 'hint', style: { marginTop: '8px' } });
  const err = h('p', { class: 'error', role: 'alert' });
  const go = h('button', { class: 'btn primary' }, iconEl('plus', 18), 'Add pages');
  const m = modal({ title: 'Add pages', body: h('div', null, form.el, bar, msg, err), actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), go] });
  go.addEventListener('click', async () => {
    err.textContent = ''; go.disabled = true; bar.hidden = false;
    try {
      const start = pages.length ? Math.max(...pages.map(p => p.idx)) + 1 : 0;
      const n = await addPagesToBoard(sb, boardId, start, form.spec(), (t, f) => { msg.textContent = t; bar.firstChild.style.width = Math.round(f * 100) + '%'; });
      m.close(); toast(`${n} page${n === 1 ? '' : 's'} added.`, 'ok'); onDone && onDone();
    } catch (e) { err.textContent = friendlyError(e); go.disabled = false; bar.hidden = true; }
  });
}

// change the name of a board or assignment (students see the new name the next time they open their page)
export function renameBoardDialog({ sb, board, onSaved }) {
  const input = h('input', { class: 'input', id: 'rb-t', value: board.title, maxlength: '120' });
  const err = h('p', { class: 'error', role: 'alert' });
  const save = async () => {
    const t = input.value.trim().replace(/\s+/g, ' ');
    if (!t) { err.textContent = 'Give it a name.'; input.focus(); return; }
    if (t === board.title) { m.close(); return; }
    go.disabled = true;
    const { error } = await sb.from('boards').update({ title: t }).eq('id', board.id);
    if (error) { err.textContent = friendlyError(error); go.disabled = false; return; }
    board.title = t; m.close(); toast('Name changed.', 'ok'); if (onSaved) onSaved(t);
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  const go = h('button', { class: 'btn primary', onclick: save }, 'Save');
  const m = modal({ title: 'Rename', body: h('div', null, h('div', { class: 'field' }, h('label', { for: 'rb-t' }, 'Name of the board or assignment'), input), err), actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), go] });
  setTimeout(() => input.select(), 60);
}


// ------------------------------------------------------------------ when can students see a board?
export const toLocalInput = iso => { if (!iso) return ''; const d = new Date(iso), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
export const fmtWhen = iso => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
// a board that opens in the future is hidden from students (the teacher always sees it)
export const isScheduled = b => !!(b && b.starts_at && new Date(b.starts_at) > Date.now());

// Choose when students can see this board or assignment (and, for an assignment, when it is due).
export function scheduleDialog({ sb, board, onSaved }) {
  const asg = board.mode === 'assignment';
  let when = isScheduled(board) ? 'later' : 'now';
  const start = h('input', { class: 'input', id: 'sch-s', type: 'datetime-local', value: isScheduled(board) ? toLocalInput(board.starts_at) : '' });
  const due = asg ? h('input', { class: 'input', id: 'sch-d', type: 'datetime-local', value: toLocalInput(board.due_at) }) : null;
  const err = h('p', { class: 'error', role: 'alert' });
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'When students can see it' });
  const later = h('div', null);
  const at = (days, hh, mm = 0) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hh, mm, 0, 0); return d; };
  const nextMonday = () => { const d = new Date(), add = ((8 - d.getDay()) % 7) || 7; return at(add, 8); };
  const quick = [['In 1 hour', () => new Date(Date.now() + 3600e3)], ['Tomorrow 8:00', () => at(1, 8)], ['Next Monday 8:00', nextMonday]];
  const draw = () => {
    seg.replaceChildren(...[['now', 'Students see it now'], ['later', 'From a set time']].map(([k, label]) => h('button', { type: 'button', 'aria-pressed': String(when === k), onclick: () => { when = k; if (k === 'later' && !start.value) start.value = toLocalInput(at(1, 8)); draw(); } }, label)));
    later.hidden = when !== 'later';
  };
  later.append(
    h('div', { class: 'field' }, h('label', { for: 'sch-s' }, 'Students can see it from'), start,
      h('div', { class: 'chip-row', style: { marginTop: '8px' } }, quick.map(([label, fn]) => h('button', { type: 'button', class: 'chip', onclick: () => { start.value = toLocalInput(fn()); when = 'later'; draw(); } }, label)))),
    h('p', { class: 'hint' }, 'Until then students do not see it at all, not on their page and not by its link. You always see everything. It shows up by itself at that time.'));
  draw();
  const go = h('button', { class: 'btn primary' }, 'Save');
  const m = modal({
    title: `When can students see "${board.title}"?`,
    body: h('div', null, seg, later, due ? h('div', { class: 'field', style: { marginTop: '12px' } }, h('label', { for: 'sch-d' }, 'Due at (optional)'), due, h('span', { class: 'hint' }, 'After this time students can still look at their work but cannot change it.')) : null, err),
    actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), go],
  });
  go.addEventListener('click', async () => {
    err.textContent = '';
    let s = null;
    if (when === 'later') {
      if (!start.value) { err.textContent = 'Choose the date and time.'; start.focus(); return; }
      s = new Date(start.value).toISOString();
      if (new Date(s) <= new Date()) { err.textContent = 'That time has already passed. Choose a time in the future, or choose "Students see it now".'; return; }
    }
    const d = due && due.value ? new Date(due.value).toISOString() : null;
    if (asg && d && new Date(d) <= new Date(s || Date.now())) { err.textContent = 'The due time must be after the time students can see it.'; return; }
    go.disabled = true;
    const row = asg ? { starts_at: s, due_at: d } : { starts_at: s };
    const { error } = await sb.from('boards').update(row).eq('id', board.id);
    if (error) { err.textContent = friendlyError(error); go.disabled = false; return; }
    Object.assign(board, row); m.close();
    toast(s ? `Hidden from students until ${fmtWhen(s)}.` : 'Students can see it now.', 'ok');
    if (onSaved) onSaved(board);
  });
}
