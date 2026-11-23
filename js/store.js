// Board data + realtime + safe saving.
//  - Marks are shown immediately on this device, then saved in the background.
//  - Every unsaved change is also kept in localStorage, so a dropped connection or a refresh never loses work.
//  - Live strokes in progress travel by Realtime broadcast; finished marks are saved in the database.
import { uuid, debounce, sleep } from './util.js';

const SAVE_AFTER = 3000, SAVE_MAX = 8000;   // ms

const rowOf = o => ({ id: o.id, board_id: o.board_id, page_id: o.page_id, participant_id: o.participant_id, scope_id: o.scope_id || null, is_feedback: !!o.is_feedback, type: o.type, data: o.data, deleted: !!o.deleted, created_at: o.created_at });
const norm = r => ({ ...r, t: Date.parse(r.created_at) || Date.now(), _b: null });

export class Store {
  constructor(sb, { boardId, role, participantId = null, name = 'Teacher' }) {
    this.sb = sb; this.boardId = boardId; this.role = role; this.participantId = participantId; this.name = name;
    this.board = null; this.pages = []; this.objs = new Map(); this.dirty = new Map();
    this.cursor = null; this.sync = 'saved'; this.online = true; this.listeners = {};
    this.cache = new Map(); this.flushing = false; this.retry = 0; this.closed = false; this.wasDown = false;
    this.outboxKey = `bem-outbox-${boardId}-${participantId || 'teacher'}`;
    this.persistSoon = debounce(() => this.persist(), 80);
    this.timers = [];
    this.clockOffset = 0; this.scopeId = null; this.mode = 'live'; this.participantsMap = new Map(); this.me = null; this.curPage = null; this.liveCh = null;
  }

  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); return () => { this.listeners[evt] = this.listeners[evt].filter(f => f !== fn); }; }
  emit(evt, ...a) { for (const f of (this.listeners[evt] || [])) { try { f(...a); } catch (e) { console.error(e); } } }

  // ---------------------------------------------------------------- loading
  async load() {
    const sb = this.sb, id = this.boardId;
    const [b, p] = await Promise.all([
      sb.from('boards').select('*').eq('id', id).maybeSingle(),
      sb.from('pages').select('*').eq('board_id', id).order('idx'),
    ]);
    if (b.error) throw b.error;
    if (!b.data) throw new Error('NO_ACCESS');
    if (p.error) throw p.error;
    this.board = b.data; this.pages = p.data; this.mode = b.data.mode || 'live';
    await this.syncClock();
    if (this.role === 'student' && this.mode === 'assignment') this.scopeId = this.participantId;   // a student only ever sees their own copy
    await this.loadPeople();
    await this.fetchObjects(null, true);
    this.restoreOutbox();
  }

  // everybody counts down against the server's clock, not their own
  async syncClock() {
    try {
      const t0 = Date.now(), { data, error } = await this.sb.rpc('server_now'), t1 = Date.now();
      if (!error && data) this.clockOffset = Date.parse(data) - (t0 + t1) / 2;
    } catch (e) { /* keep the old offset */ }
  }
  serverNow() { return Date.now() + (this.clockOffset || 0); }

  // teacher: every participant of the board. student: only their own row ("me": score, comment, submitted).
  async loadPeople() {
    let q = this.sb.from('participants').select('id,name,last_seen,created_at,submitted_at,score,comment,cur_page,reclaim_ok,user_id').eq('board_id', this.boardId);
    if (this.role === 'student') q = q.eq('id', this.participantId);
    const { data, error } = await q;
    if (error) return;
    this.participantsMap = new Map(data.map(r => [r.id, r]));
    if (this.role === 'student') { this.me = data[0] || null; this.emit('me'); } else this.emit('participants');
  }

  async fetchObjects(since, replace = false) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      let q = this.sb.from('objects').select('*').eq('board_id', this.boardId).order('updated_at').order('id').range(from, from + 999);
      if (since) q = q.gte('updated_at', since);
      const { data, error } = await q;
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    const changed = new Set(), seen = new Set();
    for (const r of rows) { seen.add(r.id); this.applyRow(r, changed); }
    if (replace) {
      for (const [id, o] of this.objs) if (!seen.has(id) && !this.dirty.has(id)) { this.objs.delete(id); changed.add(o.page_id); }
    }
    for (const pid of changed) this.invalidate(pid);
    if (changed.size) this.emit('objects', [...changed]);
  }

  applyRow(r, changed) {
    if (r.updated_at && (!this.cursor || r.updated_at > this.cursor)) this.cursor = r.updated_at;
    if (this.dirty.has(r.id)) return;
    const ex = this.objs.get(r.id);
    if (ex && ex.deleted === r.deleted && ex.author === r.author && (ex.type !== 'text' || ex.data.text === r.data.text)) return;
    this.objs.set(r.id, norm(r));
    changed.add(r.page_id);
  }

  invalidate(pid) { for (const k of [...this.cache.keys()]) if (k.startsWith(pid + '|')) this.cache.delete(k); }

  // objects of one page. In an assignment, `scope` is the student whose private copy we mean (null = shared live board)
  pageObjects(pid, scope = this.scopeId) {
    const key = pid + '|' + (scope || '');
    let a = this.cache.get(key);
    if (!a) {
      a = []; for (const o of this.objs.values()) if (o.page_id === pid && (o.scope_id || null) === (scope || null)) a.push(o);
      a.sort((x, y) => x.t - y.t || (x.id < y.id ? -1 : 1));
      this.cache.set(key, a);
    }
    return a;
  }

  countFor(pid, scope = this.scopeId) { let n = 0; for (const o of this.pageObjects(pid, scope)) if (!o.deleted) n++; return n; }

  async resync(full = false) {
    if (this.closed) return;
    try {
      const [b, p] = await Promise.all([
        this.sb.from('boards').select('*').eq('id', this.boardId).maybeSingle(),
        this.sb.from('pages').select('*').eq('board_id', this.boardId).order('idx'),
      ]);
      if (b.error || p.error) throw (b.error || p.error);
      if (!b.data) { this.emit('removed'); return; }
      const bc = JSON.stringify(b.data) !== JSON.stringify(this.board);
      this.board = b.data;
      if (JSON.stringify(p.data) !== JSON.stringify(this.pages)) { this.pages = p.data; this.emit('pages'); }
      if (bc) this.emit('board');
      if (full || !this.cursor) { await this.loadPeople(); await this.fetchObjects(null, true); }
      else if (this.role === 'teacher' && this.mode === 'assignment') await this.loadPeople();
      else await this.fetchObjects(new Date(Date.parse(this.cursor) - 4000).toISOString(), false);
      this.setConn(true);
      this.flush();
    } catch (e) { console.warn('resync failed', e); this.setConn(false); }
  }

  setConn(ok) {
    if (this.online === ok) return;
    this.online = ok; this.emit('conn', ok);
    if (!ok) this.setSync('offline');
    else this.setSync(this.dirty.size ? 'saving' : 'saved');
  }

  // ---------------------------------------------------------------- realtime
  async connect() {
    const sb = this.sb, id = this.boardId;
    try {
      const { data: { session } } = await sb.auth.getSession();
      await sb.realtime.setAuth(session ? session.access_token : undefined);
      sb.auth.onAuthStateChange((ev, s) => { if (s && s.access_token) sb.realtime.setAuth(s.access_token); });
    } catch (e) { console.warn('realtime auth', e); }
    const tag = uuid().slice(0, 6);

    const db = sb.channel(`db-${id}-${tag}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'objects', filter: `board_id=eq.${id}` }, p => this.onObjectEvent(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boards', filter: `id=eq.${id}` }, p => this.onBoardEvent(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pages', filter: `board_id=eq.${id}` }, () => this.resync());
    if (this.role === 'teacher') db.on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `board_id=eq.${id}` }, p => this.onPersonEvent(p));
    else db.on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `id=eq.${this.participantId}` }, p => this.onPersonEvent(p));
    db.subscribe(status => {
      if (status === 'SUBSCRIBED') { if (this.wasDown) { this.wasDown = false; this.resync(); } this.setConn(true); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { this.wasDown = true; this.setConn(false); }
    });
    this.db = db;

    if (this.mode === 'live') {
      const key = this.role === 'teacher' ? 'teacher' : this.participantId;
      const live = sb.channel(`board:${id}:s`, { config: { private: true, broadcast: { self: false }, presence: { key } } });
      live.on('broadcast', { event: 'live' }, ({ payload }) => this.emit('live', payload))
        .on('presence', { event: 'sync' }, () => this.emit('presence', live.presenceState()))
        .subscribe(async status => {
          if (status === 'SUBSCRIBED') { this.liveReady = true; this.track(this.presence || { name: this.name, role: this.role, page: null }); }
          else if (status === 'CHANNEL_ERROR') console.warn('live channel error (private channel)');
        });
      this.live = live;
    } else if (this.role === 'student') {
      this.watchStudent(this.participantId);   // private channel: only this student and the teacher
    }

    const tch = sb.channel(`board:${id}:t`, { config: { private: true, broadcast: { self: false } } });
    tch.on('broadcast', { event: 'laser' }, ({ payload }) => this.emit('laser', payload))
      .on('broadcast', { event: 'view' }, ({ payload }) => this.emit('view', payload))
      .on('broadcast', { event: 'instr' }, ({ payload }) => this.emit('instr', payload))
      .on('broadcast', { event: 'resync' }, () => this.resync(true))
      .subscribe();
    this.tch = tch;

    const onOnline = () => { this.resync(); this.flush(); };
    const onVis = () => { if (document.visibilityState === 'visible') { this.resync(); this.flush(); } else this.flushNow(); };
    const onHide = () => { this.persist(); this.flushNow(); };
    addEventListener('online', onOnline); addEventListener('offline', () => this.setConn(false));
    document.addEventListener('visibilitychange', onVis); addEventListener('pagehide', onHide);
    this.cleanup = () => { removeEventListener('online', onOnline); document.removeEventListener('visibilitychange', onVis); removeEventListener('pagehide', onHide); };

    this.timers.push(setInterval(() => { if (document.visibilityState === 'visible') this.resync(); }, 20000));
    if (this.role === 'student') {
      const beat = () => this.sb.rpc('heartbeat', { p_page: this.curPage }).then(() => {}, () => {});
      this.beat = beat;
      beat(); this.timers.push(setInterval(beat, 30000));
    }
  }

  // assignment mode: live strokes travel only on the channel of one student's copy
  watchStudent(pid) {
    if (this.liveCh && this.liveCh.pid === pid) return;
    this.unwatch();
    if (!pid) return;
    const ch = this.sb.channel(`board:${this.boardId}:p:${pid}`, { config: { private: true, broadcast: { self: false } } });
    ch.on('broadcast', { event: 'live' }, ({ payload }) => this.emit('live', payload));
    ch.subscribe(s => { if (s === 'SUBSCRIBED') this.liveReady = true; });
    ch.pid = pid; this.liveCh = ch; this.live = ch;
  }
  unwatch() { if (this.liveCh) { this.sb.removeChannel(this.liveCh); this.liveCh = null; this.live = null; this.liveReady = false; } }

  onPersonEvent(p) {
    if (p.eventType === 'DELETE') { if (p.old && p.old.id) this.participantsMap.delete(p.old.id); this.emit('participants'); return; }
    const r = p.new; if (!r || !r.id) return;
    this.participantsMap.set(r.id, { ...(this.participantsMap.get(r.id) || {}), ...r });
    if (this.role === 'student') { this.me = this.participantsMap.get(r.id); this.emit('me'); } else this.emit('participants');
  }

  setCurPage(n) { this.curPage = n; if (this.beat) this.beat(); }

  track(p) {
    if (this.mode !== 'live') return;
    this.presence = p;
    if (this.liveReady) this.live.track(p).catch(() => {});
  }
  sendLive(payload) { if (this.liveReady) this.live.send({ type: 'broadcast', event: 'live', payload }).catch(() => {}); }
  sendLaser(payload) { this.tch.send({ type: 'broadcast', event: 'laser', payload }).catch(() => {}); }
  sendView(payload) { this.tch.send({ type: 'broadcast', event: 'view', payload }).catch(() => {}); }
  sendInstr(payload) { this.tch.send({ type: 'broadcast', event: 'instr', payload }).catch(() => {}); }
    sendResync() { this.tch.send({ type: 'broadcast', event: 'resync', payload: {} }).catch(() => {}); }

  onObjectEvent(p) {
    const r = p.new; if (!r || !r.id) return;
    const changed = new Set();
    this.applyRow(r, changed);
    for (const pid of changed) this.invalidate(pid);
    if (changed.size) this.emit('objects', [...changed], r.id);
  }
  onBoardEvent(p) {
    if (p.eventType === 'DELETE') { this.emit('removed'); return; }
    this.board = p.new; this.emit('board');
  }

  // ---------------------------------------------------------------- local changes
  addObject(type, pageId, data, id = uuid()) {
    const assign = this.mode === 'assignment', teacher = this.role === 'teacher';
    const o = norm({
      id, board_id: this.boardId, page_id: pageId, participant_id: teacher ? null : this.participantId,
      scope_id: assign ? (teacher ? this.scopeId : this.participantId) : null, is_feedback: assign && teacher,
      author: this.name, type, data, deleted: false, created_at: new Date().toISOString(),
    });
    this.objs.set(id, o); this.invalidate(pageId); this.markDirty(id, 'full');
    return o;
  }
  setDeleted(ids, val) {
    const pages = new Set();
    for (const id of ids) {
      const o = this.objs.get(id); if (!o || o.deleted === val) continue;
      o.deleted = val; pages.add(o.page_id);
      if (this.dirty.get(id) !== 'full') this.dirty.set(id, 'flag');
    }
    for (const p of pages) this.invalidate(p);
    this.afterLocalChange();
    return [...pages];
  }
  updateData(id, data) {
    const o = this.objs.get(id); if (!o) return;
    o.data = data; o._b = null; this.invalidate(o.page_id); this.markDirty(id, 'full');
  }
  canEdit(o) {
    if (this.role === 'teacher') return this.mode === 'live' || !!o.is_feedback;   // in a student's copy the teacher only edits their own feedback
    return !o.is_feedback && !!o.participant_id && o.participant_id === this.participantId;
  }

  markDirty(id, kind) { this.dirty.set(id, kind); this.afterLocalChange(); }
  // What is written shows at once and is kept safe on this device straight away; it goes to the internet about 3 seconds after the last change
  // (never later than 8 seconds after the first unsaved one, so long writing is still saved along the way).
  afterLocalChange() { this.setSync(this.online ? 'saving' : 'offline'); this.persistSoon(); this.saveSoon(); }
  saveSoon() {
    clearTimeout(this.saveT);
    if (!this.firstDirtyAt) this.firstDirtyAt = Date.now();
    const wait = Math.max(0, Math.min(SAVE_AFTER, this.firstDirtyAt + SAVE_MAX - Date.now()));
    this.saveT = setTimeout(() => { this.firstDirtyAt = 0; this.flush(); }, wait);
  }
  // save right now (submitting, leaving, the page going to the background)
  flushNow() { clearTimeout(this.saveT); this.firstDirtyAt = 0; return this.flush(); }

  setSync(s) { if (this.sync !== s) { this.sync = s; this.emit('sync', s); } }

  // ---------------------------------------------------------------- saving
  persist() {
    try {
      if (!this.dirty.size) { localStorage.removeItem(this.outboxKey); return; }
      const items = [];
      for (const [id, kind] of this.dirty) {
        const o = this.objs.get(id); if (!o) continue;
        items.push(kind === 'full' ? { id, kind, row: rowOf(o) } : { id, kind, deleted: o.deleted });
      }
      localStorage.setItem(this.outboxKey, JSON.stringify(items));
    } catch (e) { /* storage full or blocked: saving online still works */ }
  }
  restoreOutbox() {
    try {
      const raw = localStorage.getItem(this.outboxKey); if (!raw) return;
      const changed = new Set();
      for (const it of JSON.parse(raw)) {
        if (it.kind === 'full' && it.row) { this.objs.set(it.id, norm({ ...it.row, author: this.name })); this.dirty.set(it.id, 'full'); changed.add(it.row.page_id); }
        else if (it.kind === 'flag') { const o = this.objs.get(it.id); if (o) { o.deleted = it.deleted; this.dirty.set(it.id, 'flag'); changed.add(o.page_id); } }
      }
      for (const p of changed) this.invalidate(p);
      if (this.dirty.size) { this.setSync('saving'); this.flush(); }
    } catch (e) { /* ignore */ }
  }

  async flush() {
    if (this.flushing || this.closed) return;
    this.flushing = true;
    try {
      while (this.dirty.size && !this.closed) {
        try { await this.flushOnce(); this.retry = 0; }
        catch (e) {
          console.warn('save failed, will retry', e);
          this.setConn(false);
          this.retry = Math.min(this.retry + 1, 6);
          await sleep(Math.min(800 * 2 ** this.retry, 12000));
        }
      }
      this.setSync(this.online ? 'saved' : 'offline');
    } finally { this.flushing = false; }
  }

  async flushOnce() {
    const fulls = [], flagT = [], flagF = [], snap = [];
    for (const [id, kind] of this.dirty) {
      const o = this.objs.get(id);
      if (!o) { this.dirty.delete(id); continue; }
      if (kind === 'full') { if (fulls.length < 25) { fulls.push(o); snap.push([id, kind]); } }
      else if (flagT.length + flagF.length < 80) { (o.deleted ? flagT : flagF).push(id); snap.push([id, kind]); }
      if (fulls.length >= 25 && flagT.length + flagF.length >= 80) break;
    }
    if (!snap.length) return;
    let denied = false;
    if (fulls.length) {
      const { error } = await this.sb.from('objects').upsert(fulls.map(rowOf), { onConflict: 'id' });
      if (error) { if (this.isDenied(error)) denied = true; else throw error; }
    }
    for (const [list, val] of [[flagT, true], [flagF, false]]) {
      if (!list.length || denied) continue;
      const { data, error } = await this.sb.from('objects').update({ deleted: val }).in('id', list).select('id');
      if (error) { if (this.isDenied(error)) denied = true; else throw error; }
      else if ((data || []).length !== list.length) denied = true;
    }
    if (denied) {
      for (const [id] of snap) this.dirty.delete(id);
      this.persist();
      this.emit('denied');
      await this.resync(true);
      return;
    }
    for (const [id, kind] of snap) if (this.dirty.get(id) === kind) this.dirty.delete(id);
    this.persist();
    this.setConn(true);
  }
  isDenied(e) { return e && (e.code === '42501' || e.status === 403 || /row-level security/i.test(e.message || '')); }

  close() {
    clearTimeout(this.saveT);
    // leaving the board: send what is still waiting (it is also kept on this device, so nothing is lost if this does not finish)
    if (this.dirty.size && !this.closed && this.online) (async () => { try { for (let i = 0; i < 8 && this.dirty.size; i++) await this.flushOnce(); } catch (e) { /* kept on this device */ } })();
    this.closed = true; this.persist();
    for (const t of this.timers) clearInterval(t);
    if (this.cleanup) this.cleanup();
    for (const c of [this.db, this.live, this.liveCh, this.tch]) if (c) this.sb.removeChannel(c);
  }
}
