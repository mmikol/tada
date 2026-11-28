/* The browser's copy of the documents, kept in step with the server.
   base = what the server has confirmed; pend = this tab's changes not yet echoed back; docs = base with pend applied on top.
   A change shows at once (docs), is sent in order, and is rolled back if the server refuses it. */
import * as remote from './remote.js';
import { merge, sleep, newId, mergeLists } from './rules.js';

export async function api(path, o) {
  if (remote.STATIC) { try { return await remote.api(path, o); } catch (e) { throw e && (e.code || e.status) ? e : { code: 'error', message: (e && e.message) || 'Something went wrong.' }; } }      // no server here: the browser answers for itself
  o = o || {};
  const init = { method: o.method || 'GET', headers: {}, credentials: 'same-origin' };
  if (init.method !== 'GET') init.headers['x-app'] = '1';
  if (o.body !== undefined) { if (o.raw) init.body = o.body; else { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(o.body); } }
  let res;
  try { res = await fetch(path, init); } catch (e) { throw { code: 'network', message: 'The server could not be reached.' }; }
  const UNREAD = {}, data = await res.json().catch(() => UNREAD);      // an answer that is not JSON (a proxy's error page) carries no code or message
  if (!res.ok) throw { code: (data !== UNREAD && data && data.code) || (res.status >= 502 ? 'unwell' : 'error'), message: (data !== UNREAD && data && data.message) || 'Something went wrong.', status: res.status };
  if (data === UNREAD) throw { code: 'bad_reply', message: 'The server sent an answer this page could not read.', status: res.status };      // never counted as saved
  return data;
}

export class Store {
  constructor() {
    this.client = newId(); this.base = new Map(); this.docs = new Map(); this.pend = []; this.n = 0;
    this.key = ''; this.es = null; this.loaded = false; this.buffer = []; this.subs = new Set(); this.tail = Promise.resolve(); this.busy = 0; this.online = true;
    this.paused = false; this.failed = false; this.idleMs = 30000; this.queue = []; this.sending = false; this.waiters = []; this.held = 0;
  }
  on(fn) { this.subs.add(fn); }
  emit(ev) { for (const f of this.subs) f(ev); }

  /* Follow these scopes ("root", "p/<plan>") and nothing else. Resolves true once their documents are loaded, by whichever connection gets there, and false when a later use() replaced them first. */
  use(scopes) {
    const q = scopes.map(s => 'scope=' + encodeURIComponent(s)).join('&');
    if (q === this.key && (this.loaded || (this.synced === q && this.es && !this.paused && !this.failed))) return Promise.resolve(true);      // loaded, or loaded before a connection that is only out for now: what is here is shown
    const p = new Promise((ok, no) => this.waiters.push({ q, ok, no }));
    if (q !== this.key || !this.es || this.failed || this.paused) { this.key = q; this.connect(); }      // the same scopes already on their way: wait for them
    return p;
  }
  heard(q, e) { const keep = []; for (const w of this.waiters) { if (w.q !== q) keep.push(w); else if (e) w.no(e); else w.ok(true); } this.waiters = keep; }
  /* A browser allows about six connections to one site, and every tab's live stream holds one. A tab left in the background lets go of its stream; it catches up when it is looked at again. */
  pause() { if (this.es && this.loaded) { this.es.close(); this.es = null; this.loaded = false; this.paused = true; } }
  resume() { if (this.paused || (this.key && this.failed)) this.connect(); }      // also when an earlier load failed; one still on its way is left to finish
  connect() {
    const q = this.key;
    this.loaded = false; this.buffer = []; this.paused = false; this.failed = false; this.synced = '';
    if (this.es) this.es.close();
    this.waiters = this.waiters.filter(w => { if (w.q === q) return true; w.ok(false); return false; });      // anyone waiting for other scopes has moved on: told false
    const es = this.es = remote.STATIC ? new remote.Source('api/stream?' + q) : new EventSource('api/stream?' + q);
    let running = false, again = false;      // one sync at a time: a reconnect during one asks for one more after it, so an older snapshot never lands last
    const load = () => {
      if (running) { again = true; return; }
      running = true;
      this.sync(es, q).then(() => { running = false; if (again && this.es === es) { again = false; load(); } }, e => {
        running = false; again = false;
        if (this.es !== es) return;
        this.failed = true; this.heard(q, e); this.setOnline(false);
        setTimeout(() => { if (this.es === es && !this.loaded) load(); }, 4000);      // a reload that fails is tried again until it works
      });
    };
    es.onopen = load;       // also runs after every reconnect
    es.onmessage = m => { if (this.es !== es) return; const msg = JSON.parse(m.data); if (this.loaded) this.apply(msg); else this.buffer.push(msg); };
    es.onerror = () => { if (this.es !== es) return; this.loaded = false; this.setOnline(false); if (es.readyState === 2) { this.failed = true; this.heard(q, { code: 'unavailable', message: 'The live connection was refused.' }); } };
  }
  async sync(es, q) {
    const snap = await api('api/docs?' + q);
    if (this.es !== es) return;
    this.base = new Map(snap.docs.map(d => [d.path, d.data]));
    this.pend = this.pend.filter(o => !o.acked);
    this.docs = new Map(this.base);
    for (const p of new Set(this.pend.map(o => o.path))) this.view(p);
    this.loaded = true; this.failed = false; this.synced = q;
    const buf = this.buffer; this.buffer = [];
    for (const m of buf) if (m.gone || m.rev > snap.rev) this.apply(m, true);
    this.setOnline(true);
    this.heard(q);
    this.emit({ remote: true });
    const scopes = new URLSearchParams(q).getAll('scope');      // an event deleted while this page was not listening: nothing else would say so
    if (scopes.includes('root')) for (const s of scopes) if (s.startsWith('p/') && !this.base.has('plans/' + s.slice(2))) this.emit({ gone: s });
  }
  setOnline(v) { if (this.online !== v) { this.online = v; this.emit({ status: true }); } }
  view(path) {
    let d = this.base.get(path);
    for (const o of this.pend) if (o.path === path) d = o.op === 'delete' ? undefined : o.op === 'set' ? o.data : d === undefined ? undefined : mergeLists(d, o, merge(d, o.data));
    if (d === undefined) this.docs.delete(path); else this.docs.set(path, d);
  }
  apply(msg, quiet) {
    if (msg.gone) { this.emit({ gone: msg.gone }); return; }
    const mine = msg.client === this.client;
    for (const c of msg.changes) {
      if (c.data == null && /^plans\//.test(c.path) && this.base.has(c.path)) this.emit({ gone: 'p/' + c.path.slice(6) });      // taken off the list of events: gone, even if its own file is still there
      if (c.data == null) this.base.delete(c.path); else this.base.set(c.path, c.data);
      if (mine && c.n != null) { const i = this.pend.findIndex(o => o.n === c.n); if (i >= 0) this.pend.splice(i, 1); }
    }
    for (const c of msg.changes) this.view(c.path);
    if (!quiet) this.emit({ remote: !mine });
  }

  /* A batch is one thing the person did: every write in it shows at once, is saved together, or not at all. */
  batch() {
    const ops = [], add = (op, path, data, was) => { const o = { op, path, data, n: ++this.n, acked: false }; if (was) o.was = was; ops.push(o); this.pend.push(o); this.view(path); };
    return {
      size: () => ops.length,
      set: (path, data) => add('set', path, data),
      update: (path, data, was) => add('update', path, data, was),      // was: for a list or a set of settings, what it held on this person's screen, so the far side can merge
      delete: path => add('delete', path),
      commit: () => {
        if (!ops.length) return Promise.resolve();
        this.busy++; this.emit({ status: true });
        const job = { ops };
        const p = new Promise((ok, no) => { job.ok = ok; job.no = no; });
        this.queue.push(job); this.drain();
        return p.finally(() => { this.busy--; this.emit({ status: true }); });
      },
    };
  }
  /* Changes go up in the order made. Any that queued up behind one in flight go together as one request, which matters where a save is slow.
     A change is never sent twice once it is known to have arrived (its echo came back), and one sent again after no answer is recognised at the far end.
     When GitHub asks for a short pause, the changes wait for it and then go. A long one is not waited out, since a page closed meanwhile would
     lose them without a word: they are reported as not saved, with the time to try again. */
  async drain() {
    if (this.sending) return;
    this.sending = true;
    const left = list => list.flatMap(j => j.ops).filter(o => this.pend.includes(o));
    const send = async list => {
      for (let i = 0; ; i++) {
        const ops = left(list);
        if (!ops.length) return null;                     // every part of it arrived already
        const body = { client: this.client, ops: ops.map(o => Object.assign({ op: o.op, path: o.path, data: o.data, n: o.n }, o.was ? { was: o.was } : null)) };
        try { return await api('api/write', { method: 'POST', body }); }
        catch (e) { if ((e.code === 'network' || e.code === 'unwell') && i < 3) { await sleep(600 * Math.pow(2, i)); continue; } throw e; }
      }
    };
    const settle = (job, e) => {
      if (!e) { for (const o of job.ops) o.acked = true; job.ok(); return; }
      this.pend = this.pend.filter(o => !job.ops.includes(o));
      for (const o of job.ops) this.view(o.path);
      job.no(e);
    };
    const wait = e => e && e.code === 'slow_down' && e.until > Date.now() && e.until - Date.now() <= 120000;
    try {
      while (this.queue.length) {
        if (remote.STATIC) await remote.pace().catch(() => {});      // where saves are spaced out, what is changed during the wait goes up in the same one
        const jobs = [];
        let n = 0;
        do { const j = this.queue.shift(); jobs.push(j); n += j.ops.length; } while (this.queue.length && n + this.queue[0].ops.length <= 1500);      // at least one, then as many as fit in 1,500 writes
        try { const r = await send(jobs); if (r && r.again && Array.isArray(r.changes)) this.apply({ client: this.client, changes: r.changes }, true); jobs.forEach(j => settle(j)); }      // recognised as arrived before: take what is stored now
        catch (e) {
          if (wait(e)) { this.queue.unshift(...jobs); await this.hold(e.until); continue; }
          if (jobs.length === 1 || e.code === 'network' || e.code === 'unwell') { jobs.forEach(j => settle(j, e)); continue; }
          for (let i = 0; i < jobs.length; i++) {         // one of them was refused: send each by itself so only that one fails
            try { await send([jobs[i]]); settle(jobs[i]); }
            catch (e2) { if (wait(e2)) { this.queue.unshift(...jobs.slice(i)); await this.hold(e2.until); break; } settle(jobs[i], e2); }
          }
        }
      }
    } finally { this.sending = false; }      // whatever happens, the next change must be able to go
  }
  async hold(until) { this.held = until; this.emit({ status: true }); await sleep(Math.max(500, until - Date.now())); this.held = 0; this.emit({ status: true }); }
}
