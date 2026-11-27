// PDF export of a student's copy (pages + the student's writing + the teacher's feedback), or of the whole class.
import { h, modal, toast, BASE } from './util.js';
import { iconEl } from './icons.js';
import { renderPageFull } from './thumbs.js';
import { FONT } from './render.js';
import { friendlyError } from './db.js';

let libP = null;
function loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (!libP) libP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = BASE + 'vendor/pdf-lib.min.js';
    s.onload = () => res(window.PDFLib); s.onerror = () => rej(new Error('Could not load the PDF tool. Check your connection.'));
    document.head.append(s);
  });
  return libP;
}

function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}

// a plain page with the student's name, score and the teacher's comment
function summaryCanvas(board, st) {
  const W = 1240, H = 1754, c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#FBF8F1'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1D2127'; ctx.textBaseline = 'top';
  ctx.font = `600 60px ${FONT}`; ctx.fillText(st.name, 90, 120);
  ctx.font = `400 34px ${FONT}`; ctx.fillStyle = '#4A545E'; ctx.fillText(board.title, 90, 205);
  let y = 300;
  ctx.fillStyle = '#FF9150'; ctx.fillRect(90, y - 20, 1060, 6);
  ctx.fillStyle = '#1D2127';
  if (st.score) { ctx.font = `600 120px ${FONT}`; ctx.fillText(st.score, 90, y + 20); y += 200; }
  if (st.comment) {
    ctx.font = `500 34px ${FONT}`; ctx.fillStyle = '#4A545E'; ctx.fillText('Teacher comment', 90, y); y += 60;
    ctx.font = `400 38px ${FONT}`; ctx.fillStyle = '#1D2127';
    for (const ln of wrap(ctx, st.comment, 1060)) { ctx.fillText(ln, 90, y); y += 56; if (y > H - 120) break; }
  }
  if (st.submitted_at) { ctx.font = `400 28px ${FONT}`; ctx.fillStyle = '#4A545E'; ctx.fillText('Submitted ' + new Date(st.submitted_at).toLocaleString(), 90, H - 110); }
  return c;
}

export async function buildPdf({ sb, store, students, onlyWritten, onProgress, isCancelled }) {
  const { PDFDocument } = await loadPdfLib();
  const pdf = await PDFDocument.create();
  const W = 1240, A4w = 595;
  const total = Math.max(1, students.reduce((n, st) => n + store.pagesFor(st.id).length, 0));
  let done = 0;
  const addCanvas = async cv => {
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.88));
    const img = await pdf.embedJpg(new Uint8Array(await blob.arrayBuffer()));
    const ph = A4w * cv.height / cv.width, pg = pdf.addPage([A4w, ph]);
    pg.drawImage(img, { x: 0, y: 0, width: A4w, height: ph });
  };
  for (const st of students) {
    const pages = store.pagesFor(st.id);       // the shared pages, and any page this student added
    for (let i = 0; i < pages.length; i++) {
      if (isCancelled()) throw new Error('Cancelled');
      const pg = pages[i], objs = store.pageObjects(pg.id, st.id).filter(o => !o.deleted);
      done++;
      onProgress(`${st.name}: page ${i + 1} of ${pages.length}`, done / total);
      if (onlyWritten && !objs.length) continue;
      const footer = `${st.name}   |   ${store.board.title}   |   page ${i + 1}` + (st.score ? `   |   Score ${st.score}` : '');
      await addCanvas(await renderPageFull(sb, pg, objs, W, footer));
    }
    if (st.score || st.comment) await addCanvas(summaryCanvas(store.board, st));
  }
  if (!pdf.getPageCount()) throw new Error('There is nothing to export yet. Try again without "only pages with writing".');
  pdf.setTitle(store.board.title); pdf.setProducer('Bright EngMath Live Board');
  return pdf.save();
}

export function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const safe = s => String(s).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'export';

export function exportDialog({ sb, store, students, label }) {
  const many = students.length > 1;
  const only = h('input', { type: 'checkbox', id: 'ow', checked: many });
  const anySub = students.some(x => x.submitted_at);
  const subOnly = h('input', { type: 'checkbox', id: 'so', checked: true });
  const bar = h('div', { class: 'progress', hidden: true }, h('div'));
  const msg = h('p', { class: 'hint', style: { marginTop: '8px' } });
  const err = h('p', { class: 'error', role: 'alert' });
  let cancelled = false, running = false;
  const go = h('button', { class: 'btn primary' }, iconEl('file', 18), 'Make PDF');
  const m = modal({
    title: many ? 'Export the whole class as PDF' : `Export ${label} as PDF`,
    body: h('div', null,
      h('p', null, many ? `One PDF with the work of ${students.length} students, each page marked with the student's name, plus the teacher's feedback, stamps and scores.` : 'One PDF with every page: the student\'s writing, your feedback and stamps, and a last page with the score and comment.'),
      many && anySub ? h('label', { style: { display: 'flex', gap: '10px', alignItems: 'center', margin: '14px 0 0', fontWeight: '500' } }, subOnly, `Only students who submitted (${students.filter(x => x.submitted_at).length} of ${students.length})`) : null,
      h('label', { style: { display: 'flex', gap: '10px', alignItems: 'center', margin: '14px 0', fontWeight: '500' } }, only, 'Only pages with writing on them'),
      bar, msg, err),
    actions: [h('button', { class: 'btn', onclick: () => { cancelled = true; m.close(); } }, 'Close'), go],
    onClose: () => { cancelled = true; },
  });
  go.addEventListener('click', async () => {
    if (running) return; running = true; cancelled = false; err.textContent = ''; go.disabled = true; bar.hidden = false;
    try {
      const sorted = [...students].filter(x => !(many && anySub && subOnly.checked) || x.submitted_at).sort((a, b) => a.name.localeCompare(b.name));
      const bytes = await buildPdf({ sb, store, students: sorted, onlyWritten: only.checked, isCancelled: () => cancelled, onProgress: (t, f) => { msg.textContent = t; bar.firstChild.style.width = Math.round(f * 100) + '%'; } });
      download(bytes, `${safe(store.board.title)}-${many ? 'class' : safe(label)}.pdf`);
      toast('PDF saved to your downloads.', 'ok'); cancelled = true; m.close();
    } catch (e) { if (!cancelled) err.textContent = friendlyError(e); go.disabled = false; bar.hidden = true; running = false; }
  });
}

// ---- some pages of a board as one PDF (the pages the teacher picked), with or without the writing on them
export async function buildPagesPdf({ sb, store, pages, withMarks, onProgress, isCancelled }) {
  const { PDFDocument } = await loadPdfLib();
  const pdf = await PDFDocument.create(), A4w = 595;
  for (let i = 0; i < pages.length; i++) {
    if (isCancelled()) throw new Error('Cancelled');
    const pg = pages[i]; onProgress(`Page ${i + 1} of ${pages.length}`, i / pages.length);
    const objs = withMarks ? store.pageObjects(pg.id).filter(o => !o.deleted) : [];
    const cv = await renderPageFull(sb, pg, objs, 1240);
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.88));
    const img = await pdf.embedJpg(new Uint8Array(await blob.arrayBuffer()));
    const ph = A4w * cv.height / cv.width, pp = pdf.addPage([A4w, ph]);
    pp.drawImage(img, { x: 0, y: 0, width: A4w, height: ph });
  }
  pdf.setTitle(store.board.title); pdf.setProducer('Bright EngMath Live Board');
  return pdf.save();
}
export function exportPagesDialog({ sb, store, pages, numbers }) {
  const marks = h('input', { type: 'checkbox', id: 'xp-m', checked: true });
  const bar = h('div', { class: 'progress', hidden: true }, h('div'));
  const msg = h('p', { class: 'hint', style: { marginTop: '8px' } });
  const err = h('p', { class: 'error', role: 'alert' });
  let cancelled = false, running = false;
  const go = h('button', { class: 'btn primary' }, iconEl('file', 18), 'Make PDF');
  const m = modal({
    title: `Export ${pages.length} page${pages.length === 1 ? '' : 's'} as PDF`,
    body: h('div', null,
      h('p', null, `One PDF with page ${numbers.length > 8 ? numbers.slice(0, 8).join(', ') + '…' : numbers.join(', ')} of "${store.board.title}".`),
      h('label', { style: { display: 'flex', gap: '10px', alignItems: 'center', margin: '14px 0', fontWeight: '500' } }, marks, 'Include the writing and marks on the pages'),
      bar, msg, err),
    actions: [h('button', { class: 'btn', onclick: () => { cancelled = true; m.close(); } }, 'Close'), go],
    onClose: () => { cancelled = true; },
  });
  go.addEventListener('click', async () => {
    if (running) return; running = true; cancelled = false; err.textContent = ''; go.disabled = true; bar.hidden = false;
    try {
      const bytes = await buildPagesPdf({ sb, store, pages, withMarks: marks.checked, isCancelled: () => cancelled, onProgress: (t, f) => { msg.textContent = t; bar.firstChild.style.width = Math.round(f * 100) + '%'; } });
      download(bytes, `${safe(store.board.title)}-pages.pdf`);
      toast('PDF saved to your downloads.', 'ok'); cancelled = true; m.close();
    } catch (e) { if (!cancelled) err.textContent = friendlyError(e); go.disabled = false; bar.hidden = true; running = false; }
  });
}
