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
