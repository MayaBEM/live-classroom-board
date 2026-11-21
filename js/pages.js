// Creating boards and pages: uploads (PDF / images), blank / lined / grid pages, deleting boards with their files.
import { h, uuid, makeCode, modal, toast } from './util.js';
import { BUCKET, friendlyError } from './db.js';
import { pdfFromFile, pdfInfo } from './pdf.js';
import { iconEl } from './icons.js';

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
