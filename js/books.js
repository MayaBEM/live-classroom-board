// Textbooks (e-books): a PDF is uploaded once and kept as a book with a cover. A lesson is a board whose pages point at the same file,
// so the book is used again and again (no new copy each time) and students open it from their own page like any other board.
import { h, uuid, modal, toast, confirmDialog } from './util.js';
import { BUCKET, friendlyError } from './db.js';
import { pdfFromFile, pdfInfo } from './pdf.js';
import { deleteBoard } from './pages.js';

const MAX_FILE = 50 * 1024 * 1024;      // the free storage plan allows files up to 50 MB

// the first page as a small JPEG (the book's cover)
async function coverOfDoc(doc) {
  const page = await doc.getPage(1), base = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: 320 / base.width });
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp, canvas: c }).promise;
  for (let q = 0.8; q >= 0.4; q -= 0.1) { const d = c.toDataURL('image/jpeg', q); if (d.length <= 220000) return d; }
  return c.toDataURL('image/jpeg', 0.35);
}

// add a book (a PDF file) or, with `book`, change its name
export function bookDialog({ sb, book = null, onSaved }) {
  const title = h('input', { class: 'input', id: 'bk-t', value: book ? book.title : '', maxlength: '120', placeholder: 'Example: Math Grade 5 Student Book' });
  const subject = h('input', { class: 'input', id: 'bk-s', value: book && book.subject || '', maxlength: '60', placeholder: 'Subject or grade (optional)' });
  const file = h('input', { type: 'file', class: 'input', id: 'bk-f', accept: 'application/pdf,.pdf', 'aria-label': 'Choose the book (PDF file)' });
  const bar = h('div', { class: 'progress', hidden: true }, h('div'));
  const msg = h('p', { class: 'hint', style: { marginTop: '8px' } });
  const err = h('p', { class: 'error', role: 'alert' });
  const go = h('button', { class: 'btn primary' }, book ? 'Save' : 'Add the book');
  const m = modal({ title: book ? 'Change the book' : 'Add a textbook', body: h('div', null,
      h('div', { class: 'field' }, h('label', { for: 'bk-t' }, 'Book name'), title),
      h('div', { class: 'field' }, h('label', { for: 'bk-s' }, 'Subject or grade'), subject),
      book ? null : h('div', { class: 'field' }, h('label', { for: 'bk-f' }, 'The book (PDF file)'), file, h('span', { class: 'hint' }, 'Up to 50 MB. The first page becomes the cover. If your book is bigger, split it into two files and add each as its own book.')),
      bar, msg, err),
    actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), go] });
  const progress = (t, f) => { bar.hidden = false; msg.textContent = t; bar.firstChild.style.width = Math.round(f * 100) + '%'; };
  go.addEventListener('click', async () => {
    err.textContent = ''; go.disabled = true;
    try {
      let t = title.value.trim();
      if (book) {
        if (!t) throw new Error('Give the book a name.');
        const { error } = await sb.from('textbooks').update({ title: t, subject: subject.value.trim() || null }).eq('id', book.id);
        if (error) throw error; m.close(); toast('Saved.', 'ok'); onSaved && onSaved(); return;
      }
      const f = file.files && file.files[0];
      if (!f) throw new Error('Choose the PDF file of the book first.');
      if (f.size > MAX_FILE) throw new Error(`"${f.name}" is bigger than 50 MB. The free plan allows files up to 50 MB: split the book into parts.`);
      if (!t) t = f.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 120);
      progress('Reading the book…', 0.1);
      let doc; try { doc = await pdfFromFile(f); } catch (e) { throw new Error('That file could not be opened as a PDF.'); }
      if (doc.numPages > 1000) throw new Error('Please use a book with 1000 pages or fewer.');
      const info = await pdfInfo(doc);
      progress('Making the cover…', 0.35);
      const cover = await coverOfDoc(doc);
      progress('Uploading the book…', 0.5);
      const id = uuid(), path = `books/${id}/${uuid()}.pdf`;
      const up = await sb.storage.from(BUCKET).upload(path, f, { contentType: 'application/pdf', upsert: false });
      if (up.error) throw up.error;
      progress('Saving…', 0.95);
      const { error } = await sb.from('textbooks').insert({ id, title: t, subject: subject.value.trim() || null, file_path: path, pages: doc.numPages, heights: info.map(p => p.h), cover });
      if (error) { await sb.storage.from(BUCKET).remove([path]).catch(() => {}); throw error; }
      try { (doc.loadingTask || doc).destroy(); } catch (e) { /* ignore */ }
      m.close(); toast(`"${t}" added. Press New lesson to use it with a class.`, 'ok'); onSaved && onSaved();
    } catch (e) { console.error(e); err.textContent = friendlyError(e); go.disabled = false; bar.hidden = true; msg.textContent = ''; }
  });
}

// delete a book, its file and every lesson made from it
export async function deleteBookDialog({ sb, book, lessons, onDone }) {
  const n = lessons.length;
  const ok = await confirmDialog({ title: `Delete "${book.title}"?`, text: n ? `This deletes the book and its ${n} lesson${n === 1 ? '' : 's'}, including everything that was written on them. This cannot be undone.` : 'This deletes the book file. This cannot be undone.', confirmLabel: 'Delete the book', danger: true });
  if (!ok) return;
  try {
    for (const b of lessons) await deleteBoard(sb, b.id);
    await sb.storage.from(BUCKET).remove([book.file_path]).catch(() => {});
    const { error } = await sb.from('textbooks').delete().eq('id', book.id); if (error) throw error;
    toast('Book deleted.', 'ok'); onDone && onDone();
  } catch (e) { toast(friendlyError(e), 'bad'); }
}
