// A cover picture for every board / assignment: the first page of what the teacher uploaded, kept small.
// The teacher's browser makes it (when a board is made, and once for older boards); students ask for it through board_covers().
import { h } from './util.js';
import { renderPdfPage, getImage } from './pdf.js';

const W = 320;                       // pixels wide: enough for a card, small enough to be quick
const cache = new Map();            // board id -> data url, or null when there is none
const boxes = new Map();            // board id -> the cover boxes waiting on the page

// the first page of a board, as a small JPEG (null when the board does not start with a PDF or a picture)
export async function makeCover(sb, boardId) {
  const { data: pg } = await sb.from('pages').select('kind,file_path,pdf_page,h').eq('board_id', boardId).order('idx').limit(1).maybeSingle();
  if (!pg || !pg.file_path || (pg.kind !== 'pdf' && pg.kind !== 'image')) return null;
  const H = Math.round(W * pg.h / 1000), c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  if (pg.kind === 'pdf') ctx.drawImage(await renderPdfPage(sb, pg.file_path, pg.pdf_page, W), 0, 0, W, H);
  else ctx.drawImage(await getImage(sb, pg.file_path), 0, 0, W, H);
  const url = c.toDataURL('image/jpeg', 0.72);
  return url.length < 240000 ? url : c.toDataURL('image/jpeg', 0.5);
}
export async function saveCover(sb, boardId) {
  const image = await makeCover(sb, boardId); if (!image) return false;
  const { error } = await sb.from('board_covers').upsert({ board_id: boardId, image, updated_at: new Date().toISOString() });
  if (error) throw error; cache.set(boardId, image); return true;
}

// older boards (made before covers existed): the teacher's browser makes them quietly, a few at a time
export async function backfillCovers(sb, limit = 6) {
  const { data: pages } = await sb.from('pages').select('board_id,idx,kind').in('kind', ['pdf', 'image']).eq('idx', 0);
  const ids = [...new Set((pages || []).map(p => p.board_id))]; if (!ids.length) return;
  const { data: have } = await sb.from('board_covers').select('board_id').in('board_id', ids);
  const done = new Set((have || []).map(r => r.board_id)); let n = 0;
  for (const id of ids) { if (done.has(id)) continue; if (n++ >= limit) break; try { await saveCover(sb, id); } catch (e) { /* try again next time */ } }
}

// ---- on the student pages
// a portrait (A4-shaped) box; it fills itself when the picture arrives, and stays hidden when the board has none
export function coverBox(id) {
  const box = h('div', { class: 'bc-cover', hidden: true, 'aria-hidden': 'true' });
  if (cache.get(id)) show(box, cache.get(id)); else { (boxes.get(id) || boxes.set(id, []).get(id)).push(box); }
  return box;
}
// the same, for the bookshelf: the box is always there, showing `ph` (a plain coloured tile) until the picture arrives
export function bookCover(id, ph) {
  const box = h('span', { class: 'book-cv', 'aria-hidden': 'true' }, ph);
  if (cache.get(id)) show(box, cache.get(id)); else (boxes.get(id) || boxes.set(id, []).get(id)).push(box);
  return box;
}
function show(box, url) { box.replaceChildren(h('img', { src: url, alt: '', draggable: 'false' })); box.hidden = false; }
export async function fillCovers(sb, ids) {
  const need = ids.filter(id => !cache.has(id)).slice(0, 80);
  if (need.length) { try { const { data } = await sb.rpc('board_covers', { p_ids: need }); for (const id of need) cache.set(id, (data && data[id]) || null); } catch (e) { /* the cover is optional */ } }
  for (const id of ids) { const url = cache.get(id), list = boxes.get(id); if (url && list) { list.forEach(b => show(b, url)); boxes.delete(id); } }
}

// a picture chosen by the teacher for a link task: cut to an upright sheet (like the other covers), small enough to send to every student
export async function portraitCover(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('That file is not a picture.')); i.src = url; });
    const w = 320, hh = 453, c = document.createElement('canvas'); c.width = w; c.height = hh;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, hh);
    const r = Math.max(w / img.naturalWidth, hh / img.naturalHeight), dw = img.naturalWidth * r, dh = img.naturalHeight * r;
    g.drawImage(img, (w - dw) / 2, (hh - dh) / 2, dw, dh);
    for (let q = 0.82; q >= 0.4; q -= 0.1) { const d = c.toDataURL('image/jpeg', q); if (d.length <= 200000) return d; }
    return c.toDataURL('image/jpeg', 0.35);
  } finally { URL.revokeObjectURL(url); }
}
export async function saveCoverImage(sb, boardId, image) {
  if (!image) { const { error } = await sb.from('board_covers').delete().eq('board_id', boardId); if (error) throw error; cache.delete(boardId); return; }
  const { error } = await sb.from('board_covers').upsert({ board_id: boardId, image, updated_at: new Date().toISOString() });
  if (error) throw error; cache.set(boardId, image);
}
