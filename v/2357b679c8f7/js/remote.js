/* The app without its server. On a plain file host (GitHub Pages) the same screens run against a "space":
   this browser's own storage, or a private GitHub repository that everyone holding its key reads and writes.
   This module answers the requests the server answers (api/docs, api/write, the change stream …), so nothing above it knows the difference.

   A space is a handful of JSON files: root.json (the list of events and the app's settings), p/<event>.json (one event's documents),
   origin/<event>.json (the event as first loaded), trash/… (deleted events, kept), files/<event>/<name> (photos).
   Writing is optimistic: a file is replaced only if it is still the version this browser last read. If someone else got there first,
   the latest is fetched, this browser's change is laid on top of it, and it tries again. A change to a list says what the list was on this
   person's screen, so the two are merged; neither replaces the other. Reading is a poll that costs nothing while nothing has changed.
   Each file is also kept in this browser as last read, so the plan can still be looked at when the space cannot be reached. */
import { kept, tab, guard } from './device.js';
import { isObj, merge, sleep, eq, bytes, MAX_DOC, mergeLists, randomId } from './rules.js';
const meta = n => (document.querySelector('meta[name="' + n + '"]') || {}).content || '';
export const STATIC = meta('planner-backend') === 'static';
const API = (meta('planner-api') || 'https://api.github.com').replace(/\/+$/, '');      // only a test build names another address
const AT = location.pathname.replace(/[^/]*$/, '');      // this copy's folder: another copy of the app at the same address keeps its own space and its own plan
const KEY = 'app.space:' + AT, DB = 'planner-space:' + AT, NAME = meta('planner-name') || 'TA-DA', WROTE = 'app.wrote:' + AT;
const PLAN_ID = /^[a-z0-9][a-z0-9-]{1,60}$/, SEG = /^[A-Za-z0-9_.~:@+-]{1,200}$/, MAX_FILE = 12 * 1024 * 1024;
const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/, FINE = /^github_pat_[A-Za-z0-9_]{1,250}$/;
const PHOTO = /^files\/([a-z0-9][a-z0-9-]{1,60})\/([A-Za-z0-9_-][A-Za-z0-9_.-]{0,119}\.(?:jpe?g|png|webp|gif))$/i;
const OBJ = 'application/vnd.github.object+json';        // the form in which GitHub answers alike for a file of any size: over a megabyte the content is left out and fetched separately
const DATA = meta('planner-data');                       // the private repository made for the plan when the site was published, if the build was told it
/* A site that moved (renamed, so published in another folder of the same address) is told where it was and what its plan repository was called.
   A device that kept a connection or files there carries them over once, and a plan repository that was renamed is followed under its new name,
   in a saved connection and in an invitation made before the move. */
const WAS_AT = /^\/[A-Za-z0-9_.~/-]*\/$/.test(meta('planner-was-at')) && meta('planner-was-at') !== AT ? meta('planner-was-at') : '';
const DATA_WAS = meta('planner-data-was').toLowerCase();
const movedRepo = repo => DATA_WAS && REPO.test(DATA) && String(repo || '').toLowerCase() === DATA_WAS ? DATA : String(repo || '');
if (WAS_AT) {
  const was = 'app.space:' + WAS_AT, old = kept.json(was, null);
  if (old && old.repo && old.token && !kept.get(KEY)) kept.set(KEY, JSON.stringify({ repo: movedRepo(old.repo), token: old.token }));
  kept.drop(was);                                        // once only: leaving the plan here later is not undone by the old copy
}
const fail = (status, code, message, more) => Object.assign({ status, code, message }, more);
const jsonOf = res => res.json().catch(() => { throw fail(502, 'bad_reply', 'GitHub sent an answer this page could not read.'); });      // a reply that is not JSON is an error, never a SyntaxError
const clockOf = ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });


/* ---------- text and bytes ---------- */
function toB64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
function fromB64(b64) { const s = atob(String(b64).replace(/\s+/g, '')), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
const textB64 = t => toB64(new TextEncoder().encode(t)), b64Text = b => new TextDecoder().decode(fromB64(b));
const b64url = t => textB64(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), unb64url = t => b64Text(t.replace(/-/g, '+').replace(/_/g, '/'));
const TYPE = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
const typeOf = p => TYPE[((/\.([a-z0-9]+)$/i.exec(p) || [])[1] || '').toLowerCase()] || 'application/octet-stream';
const dataUrl = b => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(b); });

/* ---------- which space ---------- */
export function spaceInfo() { const s = kept.json(KEY, null); if (!s || typeof s !== 'object') return null; s.repo = movedRepo(s.repo); return REPO.test(s.repo || '') && s.token ? s : null; }
export function setSpace(s) { if (s) kept.set(KEY, JSON.stringify({ repo: s.repo, token: s.token })); else kept.drop(KEY); space_ = null; }
const heldOf = repo => 'held:' + String(repo).toLowerCase() + ':';      // the copy of a plan kept for when there is no connection, under the repository's name in any letter case
/* Stop using the shared space on this device: the key is forgotten, and so is the copy of the plan that was kept here for when there is no connection. */
export async function leaveSpace() { const s = spaceInfo(); if (s) await new DeviceDrive(true).clear(heldOf(s.repo)).catch(() => {}); setSpace(null); }
if (STATIC) window.addEventListener('storage', e => { if (e.key === KEY) location.reload(); });      // another tab joined, switched or left: this one follows
/* What is wrong with a key, in words, or '' when it is the kind this needs: a fine-grained one (reach() then checks it opens one repository only). */
export const keyFault = t => FINE.test(t) ? '' : /^gh[pousr]_/.test(t) ? 'That is a classic token, which opens every repository you have. Make a fine-grained one, for this repository only.' : 'That is not a fine-grained key. One starts with github_pat_.';
export const dataRepo = () => REPO.test(DATA) ? DATA : '';
/* An invitation is this page's address with the space and its key after the #, which a browser never sends to any server. */
export const inviteLink = s => location.origin + location.pathname + '#join=' + b64url(JSON.stringify({ r: s.repo, t: s.token }));
export function readInvite(text) {                       // a whole invitation link, or just what follows "join="
  const m = /join=([A-Za-z0-9_-]+)/.exec(String(text || ''));
  if (!m) return null;
  try { const o = JSON.parse(unb64url(m[1])); return o && REPO.test(String(o.r)) && FINE.test(String(o.t)) ? { repo: movedRepo(o.r), token: String(o.t) } : null; } catch (e) { return null; }
}
/* Answers that say the key itself is no good, as opposed to no answer at all (no connection, GitHub unwell, GitHub asking for a pause). */
export const refused = e => !!e && (e.status === 401 || e.code === 'not_found' || e.code === 'public' || e.code === 'no_contents');
const unwell = e => !!e && (e.code === 'network' || e.code === 'unwell' || e.code === 'slow_down');
/* Whether a key opens its plan, the files included: 'ok', 'dead' (GitHub refuses it), or 'unknown' (no answer to go on). A plan with no list yet is fine. */
const keyState = async s => { const d = new GitHubDrive(s); try { await d.check(); await d.get('root.json'); return 'ok'; } catch (e) { return refused(e) ? 'dead' : 'unknown'; } };
/* Whether a key may change its plan: 'yes', 'no', or '' when that could not be found out. Asked only of a plan that already has its list of events. */
async function editRight(s) {
  const d = new GitHubDrive(s);
  try { const f = await d.get('root.json'); if (!f) return ''; const w = await d.canWrite('root.json', f.text); return w === true ? 'yes' : w === false ? 'no' : ''; } catch (e) { return ''; }
}
const keepInvite = s => { tab.set('app.join', b64url(JSON.stringify({ r: s.repo, t: s.token }))); tab.set('app.join.kept', Date.now()); };      // tried again on the next start, for a day
let waiting = null;
/* Take an invitation. A device that is already in a shared plan keeps it unless the new one opens: a link to a different plan asks first,
   a link that does not work changes nothing, and a link that only looks never quietly replaces a key that can change the plan. */
async function offer(s) {
  const cur = spaceInfo(), here = cur && cur.repo.toLowerCase() === s.repo.toLowerCase();
  if (here && cur.token === s.token) return { joined: s.repo };
  if (cur && !here) { waiting = s; return { ask: s.repo, now: cur.repo }; }
  if (cur) {
    const w = await keyState(s);
    if (w === 'dead') return { dead: true };
    if (w === 'unknown') { keepInvite(s); return { unknown: true }; }
    const [mine, theirs] = await Promise.all([editRight(cur), editRight(s)]);
    if (theirs !== 'yes' && mine !== 'no' && (mine === 'yes' || (await keyState(cur)) !== 'dead')) { waiting = s; return { weaker: true, ask: s.repo, now: cur.repo }; }      // when in doubt, ask
  }
  setSpace(s);
  return { joined: s.repo };
}
/* The invitation this page was opened with, if any. js/first.js has usually moved it out of the address bar already, before anything else loaded. */
export function takeInvite() {
  if (!STATIC) return Promise.resolve(null);
  let text = '', at = 0;
  text = tab.get('app.join', ''); at = Number(tab.get('app.join.kept')) || 0; tab.drop('app.join', 'app.join.kept');
  if (at && at < Date.now() - 864e5) text = '';           // one kept for lack of a connection a day ago is stale
  if (/^#join=/.test(location.hash)) { text = location.hash; try { history.replaceState(null, '', location.pathname + location.search + '#/'); } catch (e) { location.hash = '#/'; } }      // one opened now wins over one kept from before
  else if (text) text = 'join=' + text;
  else return Promise.resolve(null);
  const s = readInvite(text);
  return s ? offer(s) : Promise.resolve({ bad: true });
}
/* Text pasted into a box: an invitation, one cut short, or the address of an event (which is not one). null when it is none of these. */
export function pasteInvite(text) {
  const t = String(text || '').trim();
  if (!STATIC || !t) return Promise.resolve(null);
  if (!/join=/.test(t)) return Promise.resolve(/^https?:\/\/\S+#\/./.test(t) ? { address: true } : null);
  const s = readInvite(t);
  return s ? offer(s) : Promise.resolve({ bad: true });
}
/* The answer to "open a different shared plan?" (or "use the link that only looks?"): 'ok' once the device has switched, else 'dead' or 'unknown'; 'gone' when no invitation is waiting (it was answered already). */
export async function acceptInvite() {
  const s = waiting;
  if (!s) return 'gone';
  waiting = null;
  const w = await keyState(s);
  if (w === 'ok') setSpace(s); else if (w === 'unknown') keepInvite(s);
  return w;
}

/* ---------- where the files are kept: this browser ---------- */
/* Into a store just made: what this device kept at the site's earlier address (its own events, and the copy of the shared plan, under the plan's
   new name), then the old store is let go. With nothing kept there, nothing is made there. */
function carryOver(db) {
  if (!WAS_AT) return Promise.resolve();
  const WAS_DB = 'planner-space:' + WAS_AT, oldHeld = DATA_WAS ? heldOf(DATA_WAS) : '', newHeld = REPO.test(DATA) ? heldOf(DATA) : '';
  return new Promise(ok => {
    let r;
    try { r = indexedDB.open(WAS_DB); } catch (e) { ok(); return; }
    r.onupgradeneeded = () => r.transaction.abort();
    r.onerror = () => ok();
    r.onsuccess = () => {
      const old = r.result, done = moved => { old.close(); if (moved) guard(() => indexedDB.deleteDatabase(WAS_DB)); ok(); };      // the old copy is only left behind if the browser refuses
      if (!old.objectStoreNames.contains('files')) { done(false); return; }
      const st = old.transaction('files').objectStore('files'), keys = st.getAllKeys(), vals = st.getAll();
      vals.onerror = () => done(false);
      vals.onsuccess = () => {
        const tx = db.transaction('files', 'readwrite'), to = tx.objectStore('files');
        keys.result.forEach((k, i) => to.put(vals.result[i], oldHeld && newHeld && typeof k === 'string' && k.startsWith(oldHeld) ? newHeld + k.slice(oldHeld.length) : k));
        tx.oncomplete = () => done(true);
        tx.onerror = tx.onabort = () => done(false);
      };
    };
  });
}
class DeviceDrive {
  constructor(quiet) { this.every = 2500; this.kind = 'device'; this.db = null; this.bc = !quiet && typeof BroadcastChannel === 'function' ? new BroadcastChannel(DB) : null; }
  open() {
    return this.db || (this.db = new Promise((ok, no) => {
      const r = indexedDB.open(DB, 1);
      let made = false;
      r.onupgradeneeded = () => { made = true; r.result.createObjectStore('files'); };
      r.onsuccess = () => { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); (made ? carryOver(r.result) : Promise.resolve()).then(() => ok(r.result)); };      // ask the browser not to clear this on its own
      r.onerror = () => no(fail(500, 'storage', 'This browser would not open its storage. Private windows often refuse.'));
    }));
  }
  async tx(mode, fn) {                                    // fn(store, give, clash): give(v) is the answer; clash() abandons the write because the file moved on
    const db = await this.open();
    return new Promise((ok, no) => {
      const t = db.transaction('files', mode), st = t.objectStore('files');
      let out, clashed = false;
      t.oncomplete = () => ok(out);
      t.onabort = t.onerror = () => no(clashed ? { conflict: true } : fail(500, 'storage', 'This browser could not save.'));
      fn(st, v => { out = v; }, () => { clashed = true; t.abort(); });
    });
  }
  get(path) { return this.tx('readonly', (st, set) => { const r = st.get(path); r.onsuccess = () => set(r.result && r.result.text != null ? { text: r.result.text, tag: r.result.tag } : null); }); }
  async changed(path, tag) { const f = await this.get(path); return f && f.tag === tag ? false : f; }
  async put(path, text, tag) {
    const next = Date.now().toString(36) + randomId(4);
    await this.tx('readwrite', (st, set, clash) => { const r = st.get(path); r.onsuccess = () => { if (((r.result || {}).tag || null) !== (tag || null)) return clash(); st.put({ text, tag: next }, path); set(next); }; });
    if (this.bc) this.bc.postMessage(path);
    return next;
  }
  hold(path, text, tag) { return this.tx('readwrite', st => { st.put({ text, tag }, path); }); }      // a copy kept as read, whatever was there
  clear(prefix) { return this.tx('readwrite', st => { st.delete(IDBKeyRange.bound(prefix, prefix + '￿')); }); }
  /* Every kept copy except those of one plan. */
  sweep(keep) { return this.tx('readwrite', st => { const r = st.openKeyCursor(IDBKeyRange.bound('held:', 'held:￿')); r.onsuccess = () => { const c = r.result; if (!c) return; if (!String(c.key).startsWith(keep)) st.delete(c.key); c.continue(); }; }); }
  async del(path) { await this.tx('readwrite', st => { st.delete(path); }); if (this.bc) this.bc.postMessage(path); }
  getBlob(path) { return this.tx('readonly', (st, set) => { const r = st.get(path); r.onsuccess = () => set(r.result ? r.result.blob || null : null); }); }
  putBlob(path, blob) { return this.tx('readwrite', st => { st.put({ blob, tag: randomId(6) }, path); }); }
  async check() { await this.open(); return { ok: true }; }
}

/* ---------- where the files are kept: a private GitHub repository ---------- */
/* GitHub allows about 80 saves a minute and 500 an hour to one account, every device holding the key together. Saves are spaced out more
   the more this device has made lately, so a long evening of typing slows down before it reaches the limit. Counted across this device's tabs. */
function gapNow() {
  const t = kept.list(WROTE).filter(x => x > Date.now() - 3600e3);
  const minute = t.filter(x => x > Date.now() - 60e3).length;
  return minute >= 25 ? 6000 : t.length >= 300 ? 20000 : t.length >= 200 ? 10000 : t.length >= 100 ? 4000 : 1000;
}
function noteWrite() { const t = kept.list(WROTE).filter(x => x > Date.now() - 3600e3); t.push(Date.now()); kept.set(WROTE, JSON.stringify(t.slice(-600))); }
class GitHubDrive {
  constructor(s) { this.every = 6000; this.kind = 'shared'; this.repo = s.repo; this.token = s.token; this.etags = new Map(); this.gate = Promise.resolve(); this.last = 0; this.until = 0; this.quick = 0; }
  async ask(method, url, body, headers) {
    if (this.until > Date.now()) throw this.paused();     // GitHub asked for a pause: nothing goes until it is over
    const limit = (method === 'GET' && this.quick) || 25000 + (body && body.content ? Math.min(155000, body.content.length / 50) : 0);      // a photo going up is given longer
    for (let i = 0; ; i++) {
      const stop = new AbortController(), t = setTimeout(() => stop.abort(), limit);
      let res;
      try {
        const got = await fetch(API + url, { method, cache: 'no-store', signal: stop.signal, body: body ? JSON.stringify(body) : undefined,
          headers: Object.assign({ authorization: 'Bearer ' + this.token, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' }, body ? { 'content-type': 'application/json' } : null, headers) });
        const text = got.status === 204 || got.status === 304 ? null : await got.text();      // the whole answer arrives within the time limit, or it counts as none
        res = new Response(text, { status: got.status, statusText: got.statusText, headers: got.headers });
      } catch (e) { throw { code: 'network', message: 'The shared plan could not be reached.' }; }
      finally { clearTimeout(t); }
      const wait = this.waitOf(res);
      if (wait != null) {                                // GitHub asks for a pause: a short one is waited out here, a long one stops everything until it is over
        if (wait <= 20000 && i < 2) { await sleep(wait); continue; }
        this.until = Date.now() + wait;
        return res;
      }
      if (method === 'GET' && res.status >= 502 && res.status <= 504 && i < 2) { await sleep(1500 * (i + 1)); continue; }      // GitHub briefly unwell: a read is safe to ask again
      return res;
    }
  }
  /* How long GitHub asks for before the next request, in ms, or null when it is not asking. As GitHub says: the retry-after header if there is one,
     else until the hour's allowance comes back if it is used up, else a minute. A 403 that says neither is looked at by err(). */
  waitOf(res) {
    const after = res.headers.get('retry-after'), left = res.headers.get('x-ratelimit-remaining'), reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
    if (!(res.status === 429 || (res.status === 403 && (after != null || left === '0')))) return null;
    if (after != null && Number(after) >= 0) return Number(after) * 1000;
    if (left === '0' && reset) return Math.max(1000, reset - Date.now());
    return 60000;
  }
  paused() { return fail(429, 'slow_down', 'GitHub asked for a pause, until ' + clockOf(this.until) + '.', { until: this.until }); }
  /* Reads go as they come. Writes go one at a time with a gap between them, which is how GitHub asks for them. */
  req(method, url, body, headers) {
    if (method === 'GET') return this.ask(method, url, body, headers);
    const run = this.gate.then(async () => { const gap = this.last + gapNow() - Date.now(); if (gap > 0) await sleep(gap); try { return await this.ask(method, url, body, headers); } finally { this.last = Date.now(); noteWrite(); } });
    this.gate = run.catch(() => {});
    return run;
  }
  pause() { return this.gate.then(() => { const gap = Math.max(this.last + gapNow(), this.until) - Date.now(); return gap > 0 ? sleep(gap) : null; }); }      // until the next write may go
  async err(res, read) {                                  // read: what was refused was a read, not a save
    const m = await res.json().then(b => (b && b.message) || '', () => '');      // GitHub's own words, when its answer has any
    if (res.status === 401) return fail(401, 'unauthorized', 'GitHub no longer accepts the key for the shared plan. It may have run out, or been deleted.');
    if (res.status === 429 || /rate limit|abuse|too many|spam/i.test(m)) { if (!(this.until > Date.now())) this.until = Date.now() + 60000; return this.paused(); }
    if (res.status === 403) return read ? fail(403, 'no_contents', 'This key cannot open the plan’s files. On GitHub, give it the Contents permission: Read and write (Read-only for a link that only looks).') : fail(403, 'forbidden', 'This key can look at the shared plan but not change it.');
    if (res.status === 404) return fail(404, 'not_found', 'GitHub cannot find ' + this.repo + ' with this key. On GitHub, the key needs Repository access: Only select repositories, with ' + this.repo + ' picked.');
    if (res.status >= 500) return fail(res.status, 'unwell', 'GitHub is having trouble (' + res.status + '). Try again in a minute.');
    return fail(res.status, 'error', m || 'The shared plan answered with an error.');
  }
  url(path) { return '/repos/' + this.repo + '/contents/' + path.split('/').map(encodeURIComponent).join('/'); }
  async raw(path, tag) {                                  // { b64, tag }, null when there is no such file, false when it is still the version asked about
    const et = tag ? this.etags.get(path) : null, res = await this.req('GET', this.url(path), null, Object.assign({ accept: OBJ }, et && et.tag === tag ? { 'if-none-match': et.etag } : null));
    if (res.status === 304) return false;
    if (res.status === 404) return null;
    if (!res.ok) throw await this.err(res, true);
    const j = await jsonOf(res);
    if (!j || j.type !== 'file') return null;
    let b64 = j.content || '';
    if (!b64 && j.size) { const r2 = await this.req('GET', '/repos/' + this.repo + '/git/blobs/' + j.sha); if (!r2.ok) throw await this.err(r2, true); b64 = (await jsonOf(r2)).content || ''; }      // over a megabyte: the file itself comes separately
    const etag = res.headers.get('etag');
    if (etag) this.etags.set(path, { tag: j.sha, etag });
    return { b64, tag: j.sha };
  }
  async get(path) { const f = await this.raw(path); return f ? { text: b64Text(f.b64), tag: f.tag } : null; }
  async changed(path, tag) { const f = await this.raw(path, tag); return f ? (f.tag === tag ? false : { text: b64Text(f.b64), tag: f.tag }) : f; }
  async send(path, b64, tag, what) {
    const res = await this.req('PUT', this.url(path), Object.assign({ message: what || 'Update ' + path, content: b64 }, tag ? { sha: tag } : null));
    if (res.status === 409 || res.status === 422) {      // the version named is not the one there (or, with none named, there is one); a 422 can also mean "slow down"
      const m = await res.clone().json().then(b => (b && b.message) || '', () => '');
      if (/rate limit|abuse|too many|spam/i.test(m)) throw await this.err(res);
      throw { conflict: true };
    }
    if (!res.ok) throw await this.err(res);
    const j = await jsonOf(res), sha = j.content && j.content.sha;
    this.etags.delete(path);
    if (tag && res.status === 201) throw { revived: true, sha };      // GitHub does not refuse a version named for a file that is gone: it makes the file anew. Whoever asked decides what that means
    return sha;
  }
  put(path, text, tag, what) { return this.send(path, textB64(text), tag, what); }
  async del(path, tag, what, exact) {                     // exact: only the version named may go; a newer one is left for whoever wrote it
    for (let i = 0; i < 3; i++) {
      const sha = (!i && tag) || ((await this.raw(path)) || {}).tag;
      if (!sha) return;
      const res = await this.req('DELETE', this.url(path), { message: what || 'Remove ' + path, sha });
      if (res.ok || res.status === 404) return;
      if (res.status !== 409 && res.status !== 422) throw await this.err(res);
      if (exact) throw { conflict: true };
    }
    throw fail(409, 'busy', 'Others kept saving at the same moment. Try once more.');
  }
  async getBlob(path) { const f = await this.raw(path); return f ? new Blob([fromB64(f.b64)], { type: typeOf(path) }) : null; }
  async putBlob(path, blob) {                             // a photo of that name already there is replaced
    const b64 = toB64(new Uint8Array(await blob.arrayBuffer()));
    try { await this.send(path, b64, null, 'Add ' + path); }
    catch (e) {
      if (!e || !e.conflict) throw e;
      const cur = await this.raw(path);
      if (cur && cur.b64.replace(/\s+/g, '') === b64) return;
      try { await this.send(path, b64, cur ? cur.tag : null, 'Replace ' + path); } catch (e2) { if (e2 && e2.revived) return; throw e2 && e2.conflict ? fail(409, 'busy', 'The photo could not be saved just now. Try once more.') : e2; }
    }
  }
  /* Whether this key may write, found out without writing anything: a save that names a version which cannot exist is refused either way,
     but a key that may write is told the version is wrong, and one that may not is told it may not. null: could not tell.
     Only ever asked about a file that exists: for a missing one, GitHub would make it. */
  async canWrite(path, text) {
    let res;
    try { res = await this.req('PUT', this.url(path), { message: 'Check access', content: textB64(text), sha: '0'.repeat(40) }); } catch (e) { return null; }
    if (res.status === 409 || res.status === 422) return true;
    return res.status === 403 && (await this.err(res)).code === 'forbidden' ? false : null;
  }
  /* The repository must open with this key and must be private; when being set up, it must also hold nothing but a space (or nothing at all). */
  async check(fresh) {
    const res = await this.req('GET', '/repos/' + this.repo);
    if (!res.ok) throw await this.err(res, true);
    const j = await res.json().catch(() => null);
    if (!j || typeof j !== 'object') throw { code: 'network', message: 'The shared plan could not be reached.' };      // an answer that broke off says nothing about the repository
    if (j.private !== true) throw fail(403, 'public', 'That repository is public, so anyone could read the plan. Make it private on GitHub, or make a new private one.');
    if (!fresh) return { ok: true };
    const top = await this.req('GET', '/repos/' + this.repo + '/contents/', null, { accept: OBJ });
    if (top.ok) {                                         // a set-up that stopped part-way left some of the space's own files: that is fine, it carries on
      const t = await top.json().catch(() => null), list = Array.isArray(t) ? t : (t && t.entries) || [];
      if (list.some(x => !['root.json', 'p', 'origin', 'files', 'trash', 'README.md', 'LICENSE', '.gitignore'].includes(x.name))) throw fail(409, 'in_use', 'That repository already holds other files. Use an empty one.');
    }
    return { ok: true };
  }
  /* Whether this key opens more than its plan's repository. GitHub lets a key be made for "All repositories", and such a key, travelling in
     invitation links, would let anyone holding one read or change everything else the owner keeps there, this site's own files included.
     Words saying what is wrong, or ''. Nothing is changed by asking: the write test names a version that cannot exist. */
  async reach() {
    const wide = 'This key opens other repositories too, so anyone with an invitation could read or change them. On GitHub, make a new key with Repository access: Only select repositories, and pick ' + this.repo + ' alone.';
    const owner = this.repo.split('/')[0].toLowerCase(), host = location.hostname.toLowerCase();
    if (host === owner + '.github.io') {                 // the repository this site is published from
      const seg = location.pathname.split('/').filter(Boolean)[0], site = owner + '/' + (seg && !/\.html?$/i.test(seg) ? seg : owner + '.github.io');
      if (site.toLowerCase() !== this.repo.toLowerCase()) {
        const res = await this.req('DELETE', '/repos/' + site + '/contents/index.html', { message: 'Check access', sha: '0'.repeat(40) });
        if (res.status === 409 || res.status === 422) return wide;
        if (res.status >= 500) throw await this.err(res);      // no answer worth the name: not taken as a yes
      }
    }
    const res = await this.req('GET', '/user/repos?visibility=private&affiliation=owner&sort=updated&per_page=8');      // and the owner's other private repositories: one that opens with this key means it was not made for one repository
    if (res.status >= 500) throw await this.err(res);
    const list = res.ok ? await res.json().catch(() => []) : [];
    for (const r of (Array.isArray(list) ? list : []).filter(r => r && r.full_name && r.full_name.toLowerCase() !== this.repo.toLowerCase()).slice(0, 3)) {
      const one = await this.req('GET', '/repos/' + r.full_name);
      if (one.ok) return wide;
      if (one.status >= 500) throw await this.err(one);
    }
    return '';
  }
}

/* ---------- a space: the documents, kept in step with wherever they are stored ---------- */
function scopeOf(p) {
  const s = String(p).split('/');
  if (s.length % 2 || s.length > 16 || p.length > 1000 || !s.every(x => SEG.test(x) && x !== '.' && x !== '..')) throw fail(400, 'bad_path', 'Bad document path: ' + p);
  if ((s[0] === 'plans' || s[0] === 'app') && s.length === 2) return 'root';
  if (s[0] === 'p' && s.length >= 4) return 'p/' + s[1];
  throw fail(400, 'bad_path', 'Unknown document path: ' + p);
}
const inScope = (p, scope) => { try { return scopeOf(p) === scope; } catch (e) { return false; } };
const fileOf = scope => scope === 'root' ? 'root.json' : scope + '.json';
/* One document to a line, in a fixed order: a change to one row is a change to one line, which keeps the repository's history small and readable. */
const pack = f => '{"v":1,"kv":' + JSON.stringify(f.kv || {}) + ',"docs":{\n' + [...f.docs].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0).map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v)).join(',\n') + '\n}}\n';
/* A file as read. Only documents that belong in it are taken: the repository can be edited by hand, and nothing else may reach the screens. */
function unpack(text, scope) {
  let o = {}; try { o = JSON.parse(text) || {}; } catch (e) { throw fail(500, 'damaged', 'A file in the space could not be read.'); }
  return { kv: isObj(o.kv) ? o.kv : {}, docs: new Map(Object.entries(isObj(o.docs) ? o.docs : {}).filter(([k, v]) => isObj(v) && (!scope || inScope(k, scope)))) };
}
const empty = () => ({ tag: null, kv: {}, docs: new Map() });
const AWAY = 'No connection. This is the plan as it was last seen on this device; it catches up when the connection is back.';
const LOOK = 'This invitation only lets you look at the plan.';
/* Who sent what: a browser that sent a change and never heard back sends it again. Each file remembers the newest change number it took
   from each browser, so a change that had in fact arrived is not laid on top a second time, over whatever someone saved in between. */
const noted = (seen, client, n) => { const o = {}; for (const [k, v] of Object.entries(isObj(seen) ? seen : {}).filter(([k]) => k !== client).slice(-29)) o[k] = v; o[client] = n; return o; };

class Space {
  constructor(drive) {
    this.drive = drive; this.files = new Map(); this.rev = 1; this.subs = new Set(); this.timer = 0; this.ready = null; this.down = false;
    this.readonly = false;                               // the key may read but not write
    this.offline = false;                                // the space cannot be reached: what shows is the copy kept in this browser
    this.since = 0;                                      // when the space last answered, for "as it was at …"
    this.denied = null;                                  // the key stopped being accepted while the page was open
    this.heard = new Set();
    this.copy = drive.kind === 'shared' ? new DeviceDrive(true) : null;      // each file as last read, for when the space cannot be reached
  }
  held(file) { return heldOf(this.drive.repo) + file; }
  remember(file, text, tag) { if (this.copy && text != null) this.copy.hold(this.held(file), text, tag).catch(() => {}); }
  forget() { if (this.copy) this.copy.clear(heldOf(this.drive.repo)).catch(() => {}); }      // a key that is refused takes the kept copy with it
  touch() {                                              // the space answered
    this.since = Date.now();
    if (this.copy && !(this.noted > Date.now() - 60000)) { this.noted = Date.now(); this.copy.hold(this.held('@at'), String(this.since), null).catch(() => {}); }
  }
  status() {
    const until = this.offline && this.drive.until > Date.now() ? this.drive.until : 0;      // out of reach because GitHub asked for a pause, not for want of a connection
    return { offline: this.offline, until, since: this.since, readonly: this.readonly, checked: !!this.checked, denied: this.denied,
      why: until ? 'GitHub asked for a pause, until ' + clockOf(until) + '. This is the plan as it was last seen on this device; it catches up then.' : this.offline ? AWAY : this.readonly ? LOOK : '' };
  }
  say() { const st = this.status(); for (const fn of this.heard) { try { fn(st); } catch (e) { console.error(e); } } }      // one listener failing does not keep the news from the others
  away() { if (!this.offline) { this.offline = true; this.say(); } }      // from now until the space answers, the copy kept here stands in and nothing can be changed
  deny(e) { this.denied = e; this.offline = false; this.files.clear(); clearInterval(this.timer); this.timer = 0; this.forget(); this.say(); }      // nothing of the plan stays reachable from this page
  async kept(scope) {                                    // the copy kept here, or null; one that cannot be read is thrown away
    const f = this.copy ? await this.copy.get(this.held(fileOf(scope))).catch(() => null) : null;
    if (!f) return null;
    try { return Object.assign(unpack(f.text, scope), { tag: f.tag }); } catch (e) { this.copy.del(this.held(fileOf(scope))).catch(() => {}); return null; }
  }
  /* The cached copy of a scope's file, read if it has not been yet. With no connection, the copy kept in this browser stands in. */
  async load(scope) {
    if (this.denied) throw this.denied;
    const have = this.files.get(scope);
    if (have) return have;
    let got;
    if (this.offline) { got = await this.kept(scope); if (!got) throw fail(503, 'offline', 'No connection, and this has not been opened on this device before, so there is no copy of it here yet.'); }
    else {
      const f = await this.drive.get(fileOf(scope));
      if (this.copy) this.touch();
      got = f ? Object.assign(unpack(f.text, scope), { tag: f.tag }) : empty();
      if (f) this.remember(fileOf(scope), f.text, f.tag);      // kept only once it has been read whole
    }
    if (!this.files.has(scope)) this.files.set(scope, got);
    return this.files.get(scope);
  }
  /* Ask whether the stored file moved on; if it did, take it and tell whoever is watching what changed. */
  async refresh(scope) {
    if (this.denied) throw this.denied;
    const have = this.files.get(scope);
    if (!have) return this.load(scope);
    if (this.offline) return have;                       // on the copy kept here until the space answers again: the poll finds out when
    let f = await this.drive.changed(fileOf(scope), have.tag);
    if (this.copy) this.touch();
    if (this.files.get(scope) !== have) return this.files.get(scope);      // this browser saved meanwhile: its copy is the newer one
    if (f === false) return have;
    if (!f && have.tag) await this.drive.check();         // a file that was there is gone: first make sure the key still opens the repository at all
    const got = f ? Object.assign(unpack(f.text, scope), { tag: f.tag }) : empty(), changes = [];
    for (const [k, v] of got.docs) if (!have.docs.has(k) || !eq(have.docs.get(k), v)) changes.push({ path: k, data: v });
    for (const k of have.docs.keys()) if (!got.docs.has(k)) changes.push({ path: k, data: null });
    if (this.files.get(scope) !== have) return this.files.get(scope);
    this.files.set(scope, got);
    if (f) this.remember(fileOf(scope), f.text, f.tag);
    if (!f && have.tag && scope !== 'root') this.tell(scope, { rev: ++this.rev, client: '', gone: scope, changes: [] });
    else if (changes.length) this.tell(scope, { rev: ++this.rev, client: '', changes });
    return got;
  }
  /* A read the person asked for got no answer: show the copy kept here if there is one, and say so. */
  async fallback(scope, e) {
    if (!this.copy || !unwell(e)) throw e;
    if (!this.files.has(scope)) { const got = await this.kept(scope); if (!got) throw e; this.files.set(scope, got); }
    if (e.code !== 'slow_down') this.away();              // a pause GitHub asked for is not a lost connection: saves waiting for it still go when it ends
  }
  tell(scope, msg) { for (const s of this.subs) if (s.scopes.has(scope)) s.fn(msg); }
  /* Every way of writing asks this first, so a key that stopped working, a lost connection and a look-only key are refused the same way, in the same words. */
  mayWrite() {
    if (this.denied) throw this.denied;
    if (this.offline) throw fail(503, 'offline', 'No connection. Nothing can be changed until it is back.');
    if (this.readonly) throw fail(403, 'forbidden', 'This key can look at the shared plan but not change it.');
  }
  /* Read, change, write back; if the file moved in between, read again and lay the change on the newer copy. fn(next, cur): next is cur's copy to change. */
  async change(scope, fn, what) {
    this.mayWrite();
    for (let i = 0; i < 8; i++) {
      const cur = i ? await this.refresh(scope) : await this.load(scope), next = { kv: Object.assign({}, cur.kv), docs: new Map(cur.docs) };
      const out = fn(next, cur);
      if (out === false) return null;                     // nothing to write after all
      const text = pack(next);
      try { next.tag = await this.drive.put(fileOf(scope), text, cur.tag, what); this.files.set(scope, next); this.remember(fileOf(scope), text, next.tag); return out; }
      catch (e) {
        if (e && e.revived) {                             // the file had been deleted, and this write has just made it again
          if (scope === 'root') { next.tag = e.sha; this.files.set(scope, next); this.remember(fileOf(scope), text, next.tag); return out; }      // the list of events is wanted back
          await this.drive.del(fileOf(scope), e.sha, 'Remove again: it was deleted', true).catch(async e2 => {      // an event someone deleted stays deleted
            if (!e2 || !e2.conflict) return;              // someone wrote it after this did: if the event has been made anew, the file is theirs
            const root = await this.refresh('root').catch(() => null);
            if (root && !root.docs.has('plans/' + scope.slice(2))) await this.drive.del(fileOf(scope), null, 'Remove again: it was deleted').catch(() => {});
          });
          this.files.set(scope, empty());
          this.tell(scope, { rev: ++this.rev, client: '', gone: scope, changes: [] });
          throw fail(409, 'missing', 'That event was deleted by someone else.');
        }
        if (e && e.status === 401) this.deny(e);
        if (e && e.status === 403 && e.code === 'forbidden') { this.readonly = true; this.say(); }
        if (!e || !e.conflict) throw e;
      }
    }
    throw fail(409, 'busy', 'Others kept saving at the same moment. Try once more.');
  }
  /* A whole file that is only ever written in one go (the copy of a deleted event, an event as first loaded): replaced whatever version is there. */
  async putWhole(path, text, what) {
    this.mayWrite();
    for (let i = 0; i < 3; i++) {
      const o = await this.drive.get(path).catch(e => { if (refused(e)) throw e; return null; });
      if (o && o.text === text) return o.tag;             // an earlier try had got there after all
      try { return await this.drive.put(path, text, o ? o.tag : null, what); }
      catch (e) { if (e && e.revived) return e.sha; if (!e || !e.conflict) throw e; await sleep(800 + 600 * i); }
    }
    throw fail(409, 'busy', 'Someone saved at the same moment. Try again.');
  }
  async docs(scopes, lean) {                              // lean: for the views across events, which show what they can
    const out = [];
    await Promise.all(scopes.map(s => this.refresh(s).catch(e => this.fallback(s, e)).catch(e => { if (!lean || !(unwell(e) || e.code === 'offline')) throw e; })));
    for (const s of scopes) for (const [k, v] of (this.files.get(s) || empty()).docs) if (!lean || !/^p\/[^/]+\/log\//.test(k)) out.push({ path: k, data: v });      // from the copy as it stands now, which may be newer than what the refresh returned
    return { rev: this.rev, docs: out };
  }
  async write(ops, client, max, what) {
    if (!Array.isArray(ops) || !ops.length || ops.length > (max || 2000)) throw fail(400, 'bad_request', 'ops must be a list of 1 to 2000 writes');
    const by = new Map();
    for (const op of ops) { const sc = scopeOf(op.path); if (!by.has(sc)) by.set(sc, []); by.get(sc).push(op); }
    const order = [...by.keys()].sort((a, b) => (a === 'root') - (b === 'root'));      // an event's own file before the list that points to it
    if (order.some(sc => sc !== 'root') && !this.offline) await this.refresh('root').catch(() => {});      // a save into an event first looks at the list (unchanged costs nothing): one taken off it is about to lose its file
    const root = this.files.get('root');
    for (const scope of order) if (scope !== 'root' && root && root.tag && !root.docs.has('plans/' + scope.slice(2))) throw fail(409, 'missing', 'That event was deleted by someone else.');
    let count = 0, saved = 0;
    for (const scope of order) {
      const mine = by.get(scope), top = client ? mine.reduce((a, o) => Math.max(a, Number(o.n) || 0), 0) : 0;
      let changes;
      try {
        changes = await this.change(scope, (f, cur) => {
          if (scope !== 'root' && !cur.tag) throw fail(409, 'missing', 'That event was deleted by someone else.');      // never bring a deleted event's file back by writing into it
          if (top && ((isObj(f.kv.seen) && f.kv.seen[client]) || 0) >= top) return false;      // this had arrived before; only the answer was lost
          const done = [];
          for (const op of mine) {
            if (op.op === 'delete') { f.docs.delete(op.path); done.push({ path: op.path, data: null, n: op.n }); continue; }
            if (!isObj(op.data)) throw fail(400, 'bad_request', 'data must be an object: ' + op.path);
            let data = op.data;
            if (op.op === 'update') { if (!f.docs.has(op.path)) throw fail(409, 'missing', 'That row was deleted by someone else.'); const was = f.docs.get(op.path); data = mergeLists(was, op, merge(was, op.data)); }
            else if (op.op !== 'set') throw fail(400, 'bad_request', 'Unknown op: ' + op.op);
            if (bytes(JSON.stringify(data)) > MAX_DOC) throw fail(413, 'too_large', 'Document too large: ' + op.path);
            f.docs.set(op.path, data); done.push({ path: op.path, data, n: op.n });
          }
          if (top) f.kv.seen = noted(f.kv.seen, client, top);
          return done;
        }, what);
      } catch (e) { throw saved && isObj(e) ? Object.assign({}, e, { partial: true, message: (e.message || 'Something went wrong.') + ' Part of this change was saved' }) : e; }      // one file took the change and the next did not
      if (changes === null) { const f = this.files.get(scope) || empty(); changes = mine.map(op => ({ path: op.path, data: f.docs.has(op.path) ? f.docs.get(op.path) : null, n: op.n })); }      // already there: say what is stored, so the screen agrees
      saved++; count += changes.length;
      this.tell(scope, { rev: ++this.rev, client: client || '', changes });
    }
    return { rev: this.rev, count };
  }
  /* Write one event's own files: its documents, the copy as first loaded, its photos. Returns what the list of events should say about it.
     fresh: the event's file must not exist yet. If it does, someone else has just taken that name, and {conflict} says so. */
  async putPlan(packed, id, say, fresh) {
    const was = 'files/' + packed.plan.id + '/', now = 'files/' + id + '/', move = v => typeof v === 'string' && v.startsWith(was) ? now + v.slice(was.length) : v;
    const docs = packed.docs.map(d => ({ path: d.path, data: was === now || !isObj(d.data) ? d.data : Object.fromEntries(Object.entries(d.data).map(([k, v]) => [k, move(v)])) }));
    const plan = Object.assign({}, packed.plan, { created: new Date().toISOString() }); delete plan.id;
    const scope = 'p/' + id, fill = f => { f.docs.clear(); for (const d of docs) { scopeOf(scope + '/' + d.path); f.docs.set(scope + '/' + d.path, d.data); } return true; };
    if (fresh) {
      this.mayWrite();
      const f = { kv: {}, docs: new Map() }; fill(f);
      const text = pack(f);
      f.tag = await this.drive.put(fileOf(scope), text, null, 'Add ' + (packed.plan.name || id));
      this.files.set(scope, f); this.remember(fileOf(scope), text, f.tag);
    } else {
      this.files.delete(scope);
      await this.change(scope, fill, 'Add ' + (packed.plan.name || id));      // a file left over from an event that is not listed is replaced
    }
    if (plan.kind !== 'template') await this.putWhole('origin/' + id + '.json', JSON.stringify(Array.isArray(packed.origin) ? packed.origin : packed.docs), 'Keep ' + (packed.plan.name || id) + ' as first loaded').catch(e => { if (refused(e)) throw e; });
    let missed = 0;
    const photos = Object.entries(isObj(packed.files) ? packed.files : {});
    for (let i = 0; i < photos.length; i++) {             // photos that travelled inside the file: images only, under this event, made small enough to send
      const m = /^data:image\/(?:jpeg|png|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(photos[i][1])), name = (PHOTO.exec(photos[i][0]) || [])[2];
      if (!m || !name || m[1].length > MAX_FILE * 1.4) { missed++; continue; }
      if (say) say('Photo ' + (i + 1) + ' of ' + photos.length + '…');
      const blob = await compact(new File([fromB64(m[1])], name, { type: typeOf(name) }), true);
      for (let t = 0; ; t++) {
        try { await this.drive.putBlob(now + name, blob); break; }
        catch (e) { if (refused(e) || (e && e.status === 403)) throw e; if (t >= 1) { missed++; break; } await sleep(1500); }
      }
    }
    return { plan, missed };
  }
  async importPlan(packed, exact, say) {
    if (!packed || !packed.plan || !Array.isArray(packed.docs)) throw fail(400, 'bad_request', 'Not an exported event');
    packed.plan.name = String(packed.plan.name || packed.plan.id || 'Event').slice(0, 200);      // a hand-made file without a name would break the list of events for everyone
    let base = exact || String(packed.plan.id || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'event';
    if (base.length < 2) base = 'event-' + base;
    let id = base, put = null;
    for (let i = 0; !put; i++) {
      const root = await this.refresh('root');
      if (!exact && (i || root.docs.has('plans/' + id))) id = base.slice(0, 34) + '-' + randomId(6);      // taken, or just taken by someone else: another ending
      if (!PLAN_ID.test(id)) throw fail(400, 'bad_request', 'Bad plan id');
      if (root.docs.has('plans/' + id)) throw fail(409, 'exists', 'A plan with this id already exists');
      try { put = await this.putPlan(packed, id, say, !exact); }
      catch (e) { if (!e || !e.conflict || exact) throw e; if (i >= 3) throw fail(409, 'busy', 'Others kept saving at the same moment. Try once more.'); }
    }
    const changes = await this.change('root', f => {
      if (f.docs.has('plans/' + id)) throw fail(409, 'exists', 'Someone made an event of that name at the same moment. Try again.');
      f.docs.set('plans/' + id, put.plan); return [{ path: 'plans/' + id, data: put.plan }];
    }, 'List ' + (packed.plan.name || id));
    this.tell('root', { rev: ++this.rev, client: '', changes });
    return { id, missed: put.missed };
  }
  async deletePlan(id) {
    if (!PLAN_ID.test(id)) throw fail(400, 'bad_request', 'Bad plan id');
    const root = await this.refresh('root'), reg = root.docs.get('plans/' + id);
    if (!reg) throw fail(404, 'missing', 'No such plan');
    const f = await this.refresh('p/' + id), pre = 'p/' + id + '/';
    await this.putWhole('trash/' + id + '-' + Date.now() + '.json', JSON.stringify({ plan: Object.assign({ id }, reg), docs: [...f.docs].map(([k, v]) => ({ path: k.slice(pre.length), data: v })) }), 'Keep a copy of ' + (reg.name || id));      // kept, never shown; if the copy cannot be written, nothing is deleted
    await this.change('root', r => { if (!r.docs.has('plans/' + id)) return false; r.docs.delete('plans/' + id); return true; }, 'Remove ' + (reg.name || id));
    this.tell('root', { rev: ++this.rev, client: '', changes: [{ path: 'plans/' + id, data: null }] });
    await this.drive.del('origin/' + id + '.json').catch(() => {});
    await this.drive.del(fileOf('p/' + id), f.tag, 'Remove ' + (reg.name || id)).catch(() => {});      // last: a page that sees this file go takes the event as gone. One left behind is harmless: it is not listed, and a new event of that name gets a name of its own
    this.files.delete('p/' + id);
    this.tell('p/' + id, { rev: ++this.rev, client: '', gone: 'p/' + id, changes: [] });
  }
  /* The starter templates travel with the site as files; a space takes them in once, and "restore" puts back any that were deleted. */
  async loadTemplates(mark, say) {
    let list = [];
    try { list = await (await fetch('templates/index.json', { cache: 'no-store' })).json(); } catch (e) { return 0; }
    const add = [];
    for (const name of Array.isArray(list) ? list : []) {
      let p;
      try { p = await (await fetch('templates/' + name, { cache: 'no-store' })).json(); } catch (e) { continue; }
      if (!p || !p.plan || !PLAN_ID.test(p.plan.id || '') || (await this.load('root')).docs.has('plans/' + p.plan.id)) continue;
      p.plan.kind = 'template';
      if (say) say('Starter template: ' + (p.plan.name || p.plan.id) + '…');
      add.push([p.plan.id, (await this.putPlan(p, p.plan.id)).plan]);
    }
    if (!add.length && !mark) return 0;
    const changes = await this.change('root', f => {       // all of them go onto the list in one write
      const done = [];
      for (const [id, plan] of add) if (!f.docs.has('plans/' + id)) { f.docs.set('plans/' + id, plan); done.push({ path: 'plans/' + id, data: plan }); }
      if (mark && !f.kv.templates) f.kv.templates = new Date().toISOString(); else if (!done.length) return false;
      return done;
    }, 'Starter templates');
    if (changes && changes.length) this.tell('root', { rev: ++this.rev, client: '', changes });
    return changes ? changes.length : 0;
  }
  async checkWrite() {                                     // finds out whether this key may change the plan, once the list of events is there to ask about, and marks the space read-only if not
    const root = this.files.get('root');
    if (this.drive.canWrite && root && root.tag && (await this.drive.canWrite('root.json', pack(root))) === false) this.readonly = true;
    this.checked = true;
  }
  /* Once per visit: check the space opens, find out whether this key may change it, and give a new space its starter templates.
     With no answer from the space, the copy kept here is shown instead; with a copy to fall back on, a request that hangs is given up sooner. */
  start(say) {
    return this.ready || (this.ready = (async () => {
      const kept = await this.kept('root');
      if (this.copy) this.copy.sweep(heldOf(this.drive.repo)).catch(() => {});      // copies kept for any other plan are of no use now
      if (kept) this.drive.quick = 8000;
      let root;
      try { await this.drive.check(); root = await this.load('root'); }
      catch (e) {
        if (refused(e)) { this.forget(); throw e; }
        if (!kept || !unwell(e)) throw e;                 // with a copy here: no answer, GitHub unwell, or a pause asked for all show the copy, said for what it is
        this.files.set('root', kept); this.offline = true;
        const at = await this.copy.get(this.held('@at')).catch(() => null);
        this.since = at ? Number(at.text) || 0 : 0;
        return;
      } finally { this.drive.quick = 0; }
      await this.checkWrite();
      if (!root.kv.templates && !this.readonly) { try { await this.loadTemplates(true, say); } catch (e) { if (!e || e.status !== 403) throw e; } }      // a key that can only look finds the space as it is
    })().catch(e => { this.ready = null; throw e; }));
  }
  /* A photo. A photo never changes under its name, so one kept here is used as it is; one fetched from the shared space is kept for next time. */
  async blob(path) {
    if (this.copy) { const h = await this.copy.getBlob(this.held(path)).catch(() => null); if (h) return h; }
    const b = await this.drive.getBlob(path);
    if (b && this.copy) this.copy.putBlob(this.held(path), b).catch(() => {});
    return b;
  }
  /* Watch these scopes: fn hears every change to them, this browser's own and everyone else's. */
  open(scopes, fn, state) {
    const sub = { scopes: new Set(scopes), fn, state };
    this.subs.add(sub);
    if (!this.timer && !this.denied) {
      this.timer = setInterval(() => this.poll(), this.drive.every);
      if (this.drive.bc && !this.drive.bc.onmessage) this.drive.bc.onmessage = () => this.poll();
      if (!this.wired) { this.wired = true; const now = () => { if (document.visibilityState !== 'hidden') this.poll(); }; document.addEventListener('visibilitychange', now); window.addEventListener('online', now); window.addEventListener('pageshow', now); }      // look at once when the page is looked at again
    }
    return { close: () => { this.subs.delete(sub); if (!this.subs.size) { clearInterval(this.timer); this.timer = 0; } } };
  }
  async poll() {
    if (this.polling || document.visibilityState === 'hidden' || !this.subs.size || this.denied || this.drive.until > Date.now()) return;
    this.polling = true;
    const up = v => { if (this.down === !v) return; this.down = !v; for (const s of this.subs) if (s.state) s.state(v); };
    try {
      const watched = new Set([...this.subs].flatMap(s => [...s.scopes]));
      if (this.offline) {                                // showing the copy kept here: once the space answers again, carry on live from where the page is
        try { await this.drive.check(); } catch (e) { if (refused(e)) this.deny(e); return; }
        this.offline = false;
        try { if (!this.checked) await this.checkWrite(); for (const scope of watched) await this.refresh(scope); }
        catch (e) { if (refused(e)) { this.deny(e); return; } this.offline = true; return; }
        this.say(); up(true);
        return;
      }
      for (const scope of watched) await this.refresh(scope);
      up(true);
    } catch (e) { if (refused(e)) this.deny(e); else up(false); }
    finally { this.polling = false; }
  }
}
let space_ = null;
export function space() { if (!space_) { const s = spaceInfo(); space_ = new Space(s ? new GitHubDrive(s) : new DeviceDrive()); } return space_; }
/* Hear when the space goes out of reach or comes back, turns out to be view-only, or stops taking the key. */
export function onSpace(fn) { space().heard.add(fn); }
/* Resolves when the next write to the space may go out. Whatever is changed while waiting is then sent together, as one save. */
export const pace = () => { const d = space().drive; return d.pause ? d.pause() : Promise.resolve(); };

/* ---------- the same answers the server gives ---------- */
export async function api(path, o) {
  o = o || {};
  const u = new URL(path, 'http://x/'), p = u.pathname, m = o.method || 'GET', sp = space();
  if (p === '/api/login' && m === 'POST') {               // on this edition, signing in is giving a new key for the space this device is already in (an invitation goes through pasteInvite)
    const code = String((o.body || {}).code || '').trim(), s = readInvite(code), cur = spaceInfo();
    if (s) throw fail(400, 'invitation', 'That is an invitation link. Open it from the first screen, where it is checked before it is used.');      // invitations go through pasteInvite only
    if (cur && FINE.test(code)) {
      const next = { repo: cur.repo, token: code }, w = await keyState(next);
      if (w === 'dead') throw fail(401, 'unauthorized', 'GitHub does not accept that key for ' + cur.repo + '. Copy it again from GitHub, or make a new one.');
      if (w === 'unknown') throw fail(503, 'network', 'GitHub could not be reached to check that key. Try again when the connection is back.');
      const wide = await new GitHubDrive(next).reach();
      if (wide) throw fail(400, 'wide', wide);
      setSpace(next);
      return { role: 'edit', newKey: true };
    }
    throw fail(401, 'unauthorized', /^gh[pousr]_|^github_pat_/.test(code) ? (keyFault(code) || 'A key by itself works only on a device that was in the shared plan before. Paste the whole invitation link.') : 'That is not an invitation link.');
  }
  if (p === '/api/logout' && m === 'POST') { await leaveSpace(); return { ok: true }; }
  if (p === '/api/me') {
    const shared = sp.drive.kind === 'shared', base = { app: NAME, locked: false, static: true, space: shared ? sp.drive.repo : '' };
    try { await sp.start(); } catch (e) { if (refused(e)) return Object.assign(base, { role: 'none', why: e.message }); throw e; }
    if (sp.denied) return Object.assign(base, { role: 'none', why: sp.denied.message });
    const name = String(((await sp.load('root')).docs.get('app/settings') || {}).name || '').trim().slice(0, 60), st = sp.status();
    return Object.assign(base, { app: name || NAME, role: sp.readonly || sp.offline ? 'view' : 'edit', offline: sp.offline, until: st.until, since: sp.since, readonly: sp.readonly, checked: st.checked, why: st.why });
  }
  await sp.start();
  const scopes = () => { const l = u.searchParams.getAll('scope'); if (!l.length || l.length > 8 || !l.every(x => x === 'root' || /^p\/[a-z0-9][a-z0-9-]{1,60}$/.test(x))) throw fail(400, 'bad_request', 'Bad scope'); return l; };
  if (p === '/api/docs' && m === 'GET') return sp.docs(scopes(), u.searchParams.get('lean') === '1');
  if (p === '/api/write' && m === 'POST') return sp.write(o.body.ops, String(o.body.client || ''));
  if (p === '/api/plans/import' && m === 'POST') return sp.importPlan(o.body, null, o.say);
  if (p === '/api/templates/restore' && m === 'POST') return { added: await sp.loadTemplates() };
  const del = /^\/api\/plans\/([a-z0-9-]+)$/.exec(p);
  if (del && m === 'DELETE') { await sp.deletePlan(del[1]); return { ok: true }; }
  if (p === '/api/origin' && m === 'GET') { const id = u.searchParams.get('plan') || ''; if (!PLAN_ID.test(id)) throw fail(400, 'bad_request', 'Bad plan id'); const f = await sp.drive.get('origin/' + id + '.json'); try { return f ? JSON.parse(f.text) : []; } catch (e) { return []; } }
  const up = /^\/api\/files\/([a-z0-9-]+)\/([A-Za-z0-9_.-]{1,120})$/.exec(p);
  if (up && m === 'PUT') {
    if (!PHOTO.test('files/' + up[1] + '/' + up[2])) throw fail(400, 'bad_request', 'Only image files can be attached');
    if (sp.offline) throw fail(503, 'offline', 'No connection. Nothing can be changed until it is back.');
    if (sp.readonly) throw fail(403, 'forbidden', 'This key can look at the shared plan but not change it.');
    if (o.body && o.body.size > MAX_FILE) throw fail(413, 'too_large', 'That photo is too large.');
    await sp.drive.putBlob('files/' + up[1] + '/' + up[2], o.body);
    if (sp.copy) sp.copy.putBlob(sp.held('files/' + up[1] + '/' + up[2]), o.body).catch(() => {});
    return { url: 'files/' + up[1] + '/' + up[2] };
  }
  throw fail(404, 'missing', 'Not found');
}
/* What the store listens to in place of the server's stream. It opens at once, and "opens" again whenever the space comes back after being out of reach. */
export class Source {
  constructor(url) {
    this.readyState = 0; this.onopen = this.onmessage = this.onerror = null;
    const scopes = new URL(url, 'http://x/').searchParams.getAll('scope');
    this.sub = space().open(scopes, m => { if (this.readyState === 1 && this.onmessage) this.onmessage({ data: JSON.stringify(m) }); }, up => { if (this.readyState !== 1) return; if (up) { if (this.onopen) this.onopen(); } else if (this.onerror) this.onerror(); });
    Promise.resolve().then(() => { if (this.readyState === 2) return; this.readyState = 1; if (this.onopen) this.onopen(); });
  }
  close() { this.readyState = 2; this.sub.close(); }
}

/* ---------- photos ---------- */
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', urls = new Map();
/* A photo's address: only ever a photo of an event. With a server it is the path itself; here the picture is fetched from the space and shown once it arrives,
   and one that could not be fetched is asked for again the next time it is drawn. */
export function fileUrl(path) {
  if (!PHOTO.test(String(path || ''))) return BLANK;
  if (!STATIC) return path;
  const have = urls.get(path);
  if (typeof have === 'string') return have || BLANK;
  if (!have) urls.set(path, space().blob(path).then(b => {
    const url = b ? URL.createObjectURL(b) : '';
    urls.set(path, url);
    for (const n of document.querySelectorAll('[data-file]')) if (n.dataset.file === path && url) { if (n.tagName === 'IMG') n.src = url; else n.href = url; }
  }, () => { urls.delete(path); }));
  return BLANK;
}
/* An event's photos, as text that can travel inside its exported file. Returns them with how many were asked for and how many could not be read. */
export async function filesOf(paths, id) {
  const files = {}, want = [...new Set(paths)].filter(p => { const m = PHOTO.exec(String(p)); return m && m[1] === id; });
  let missed = 0;
  for (const p of want) {
    try {
      const b = STATIC ? await space().blob(p) : await fetch(p).then(r => r.ok ? r.blob() : null);
      if (b && b.size) files[p] = await dataUrl(b); else missed++;
    } catch (e) { missed++; }
  }
  return { files, asked: want.length, missed };
}
/* A photo made small enough to send: a picture straight from a phone is several megabytes, and here each one travels inside a single request.
   Anything that cannot be read as a picture, and anything already small, goes as it is. same: keep its kind and name (it is already pointed to). */
export async function compact(file, same) {
  if (!STATIC || !file || file.size < 600 * 1024 || !/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== 'function') return file;
  try {
    const img = await createImageBitmap(file), k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const type = same ? file.type : 'image/jpeg', out = await new Promise(ok => c.toBlob(ok, type, 0.85));
    return out && out.size < file.size && out.type === type ? new File([out], same ? file.name : file.name.replace(/\.[^.]+$/, '') + '.jpg', { type }) : file;
  } catch (e) { return file; }
}
/* The events this browser keeps for itself, apart from any shared plan: each with a mark that a copy of it in a shared plan carries. */
const markOf = (id, plan) => id + '@' + ((plan && plan.created) || '');
export async function ownEvents() {
  if (!STATIC) return [];
  try { const root = await new Space(new DeviceDrive(true)).load('root'); return [...root.docs].filter(([k, p]) => k.startsWith('plans/') && p.kind !== 'template').map(([k, p]) => ({ id: k.slice(6), name: String(p.name || k.slice(6)), mark: markOf(k.slice(6), p) })); }
  catch (e) { return []; }
}
/* Copy the events kept in this browser into a shared space. Each goes once: one already there, brought by an earlier try or another time, carries its mark. */
async function carryInto(to, say) {
  const from = new Space(new DeviceDrive(true)), root = await from.load('root'), there = [...(await to.refresh('root')).docs.values()];
  let n = 0, missed = 0;
  for (const [k, plan] of root.docs) {
    if (!k.startsWith('plans/') || plan.kind === 'template') continue;
    const id = k.slice(6), pre = 'p/' + id + '/', mark = markOf(id, plan);
    if (there.some(p => p && p.carried === mark)) continue;
    if (say) say('Copying ' + (plan.name || id) + '…');
    const f = await from.load('p/' + id), files = {};
    const docs = [...f.docs].map(([p, d]) => ({ path: p.slice(pre.length), data: d }));
    for (const d of docs) for (const v of Object.values(isObj(d.data) ? d.data : {})) if (typeof v === 'string' && PHOTO.test(v) && !(v in files)) { const b = await from.drive.getBlob(v).catch(() => null); if (b) files[v] = await dataUrl(b); else { files[v] = ''; missed++; } }
    for (const k2 of Object.keys(files)) if (!files[k2]) delete files[k2];
    missed += (await to.importPlan({ plan: Object.assign({ id }, plan, { carried: mark }), docs, files }, null, say)).missed; n++;
  }
  return { n, missed };
}
/* Bring the events kept on this device into the shared plan it is in now. */
export async function bringHere(say) { const sp = space(); await sp.start(); if (sp.drive.kind !== 'shared') return { n: 0, missed: 0 }; return carryInto(sp, say); }
/* What a key would let someone do with the plan this device is in: { ok, edits: 'yes' | 'no' | '', why }. For making a link for another key. */
export async function checkKey(s) {
  const d = new GitHubDrive(s);
  try {
    await d.check(); await d.get('root.json');           // it must open the plan's files, not only the repository
    const wide = await d.reach();
    return wide ? { ok: false, why: wide } : { ok: true, edits: await editRight(s) };
  } catch (e) { return { ok: false, why: e.status === 401 ? 'GitHub does not accept that key. Copy it again from GitHub, or make a new one.' : refused(e) ? e.message : 'GitHub could not be reached to check it. Try again in a moment.' }; }
}
/* Start working in a shared space from this device, bringing along the events kept here if asked. Returns how many came along, and how many photos did not. */
export async function connectSpace(s, carry, say) {
  s = { repo: String(s.repo || ''), token: String(s.token || '') };
  if (!REPO.test(s.repo)) throw fail(400, 'bad_request', 'Write the repository as owner/name.');
  if (keyFault(s.token)) throw fail(400, 'bad_request', keyFault(s.token));
  const drive = new GitHubDrive(s), to = new Space(drive);
  if (say) say('Checking the repository and the key…');
  try { await drive.check(true); } catch (e) { throw e && e.status === 401 ? fail(401, 'unauthorized', 'GitHub does not accept this key. Copy it again from GitHub (it starts github_pat_), or make a new one.') : e; }
  const wide = await drive.reach();
  if (wide) throw fail(400, 'wide', wide);
  if (say) say('Setting up the shared plan…');
  await to.start(say);
  if (to.offline) throw fail(503, 'offline', 'The shared plan could not be reached.');
  if (to.readonly) throw fail(403, 'forbidden', 'This key can only look. On GitHub, set its Contents permission to Read and write.');
  const r = carry ? await carryInto(to, say) : { n: 0, missed: 0 };
  setSpace(s);
  return r;
}
