// Who is in a board. The teacher keeps one list of students; a class and each board take students from it.
// A board with nobody listed is for the whole class. A board with some students listed is only for them.
import { h, modal, toast } from './util.js';
import { friendlyError } from './db.js';

const TILE = ['c1', 'c2', 'c3', 'c4', 'c5'];

export async function boardMemberIds(sb, boardId) {
  const { data, error } = await sb.from('board_students').select('student_id').eq('board_id', boardId);
  if (error) throw error;
  return new Set((data || []).map(r => r.student_id));
}

// the students of a board, with their codes: class members, narrowed to the board's own list when it has one
export async function boardRoster(sb, board) {
  if (!board.class_id) {
    const ids = await boardMemberIds(sb, board.id);
    if (!ids.size) return [];
    const r = await sb.from('students').select('id,first_name,code').in('id', [...ids]).order('first_name');
    if (r.error) throw r.error;
    return (r.data || []).map(x => ({ first_name: x.first_name, code: x.code, student_id: x.id }));
  }
  const { data, error } = await sb.from('class_students').select('first_name,code,student_id').eq('class_id', board.class_id).order('first_name');
  if (error) throw error;
  const rows = data || [];
  const ids = await boardMemberIds(sb, board.id);
  return ids.size ? rows.filter(r => ids.has(r.student_id)) : rows;
}

// a list of students with a tick box each; items: [{ id, first_name, code }]
export function checklist(items, checked, { empty = 'Nobody to choose from.' } = {}) {
  const on = new Set(checked);
  const count = h('span', { class: 'pick-count' });
  const boxes = new Map();
  const upd = () => { count.textContent = `${on.size} of ${items.length} chosen`; };
  const rows = items.map((s, i) => {
    const cb = h('input', { type: 'checkbox', checked: on.has(s.id), 'aria-label': s.first_name });
    cb.addEventListener('change', () => { if (cb.checked) on.add(s.id); else on.delete(s.id); upd(); });
    boxes.set(s.id, cb);
    return h('label', { class: 'pick ' + TILE[i % TILE.length], title: s.first_name }, cb, h('span', { class: 'nm' }, s.first_name), s.code ? h('span', { class: 'cd' }, s.code) : null);
  });
  const setAll = v => { items.forEach(s => { boxes.get(s.id).checked = v; if (v) on.add(s.id); else on.delete(s.id); }); upd(); };
  upd();
  const el = h('div', { class: 'pick-wrap' },
    items.length ? h('div', { class: 'pick-bar' }, h('button', { type: 'button', class: 'btn sm', onclick: () => setAll(true) }, 'Choose all'), h('button', { type: 'button', class: 'btn sm', onclick: () => setAll(false) }, 'Choose none'), count) : null,
    items.length ? h('div', { class: 'pick-list' }, rows) : h('p', { class: 'empty' }, empty));
  return { el, ids: () => [...on], size: () => on.size, setAll };
}

// change who a board is for
export async function boardStudentsDialog({ sb, board, onSaved }) {
  if (!board.class_id) { toast('This board has no class.', 'bad'); return; }
  let members, chosen;
  try {
    const [cs, ids] = await Promise.all([
      sb.from('class_students').select('first_name,code,student_id').eq('class_id', board.class_id).order('first_name'),
      boardMemberIds(sb, board.id),
    ]);
    if (cs.error) throw cs.error;
    members = (cs.data || []).filter(r => r.student_id).map(r => ({ id: r.student_id, first_name: r.first_name, code: r.code }));
    chosen = ids.size ? [...ids].filter(id => members.some(m => m.id === id)) : members.map(m => m.id);
  } catch (e) { toast(friendlyError(e), 'bad'); return; }
  const list = checklist(members, chosen, { empty: 'This class has no students yet. Add students to the class first.' });
  const err = h('p', { class: 'error', role: 'alert' });
  const save = async () => {
    err.textContent = '';
    const ids = list.ids();
    if (!ids.length) { err.textContent = 'Choose at least one student.'; return; }
    const all = ids.length === members.length;
    let r = await sb.from('board_students').delete().eq('board_id', board.id);
    if (r.error) { err.textContent = friendlyError(r.error); return; }
    if (!all) {
      r = await sb.from('board_students').insert(ids.map(id => ({ board_id: board.id, student_id: id })));
      if (r.error) { err.textContent = friendlyError(r.error); return; }
    }
    m.close(); toast(all ? 'This board is for the whole class.' : `This board is for ${ids.length} student${ids.length === 1 ? '' : 's'}.`, 'ok');
    if (onSaved) onSaved();
  };
  const m = modal({
    title: `Who is "${board.title}" for?`,
    body: h('div', null, h('p', { class: 'hint', style: { marginBottom: '10px' } }, 'Only the students you tick see this board on their class page and can open it with their code.'), list.el, err),
    actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: save }, 'Save')],
  });
}
