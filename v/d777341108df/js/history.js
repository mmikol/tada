/* History: every change with undo, the comparison with the event as first loaded, the import log, exports, and the one-time import of the first Claude page's backup. */
import { esc, S, X, W, views, acts, CW, P, LOG_MAX, eq, plural, stamp, secLabel, tableDef, go, ctxOf, rowName, fieldLabel, showVal, fold, action, write, create, restore, remove, curOf, render, renderSoon, toast, store, tag, head } from './core.js';
import { api } from './store.js';
import { ENTRY_FIELDS, ITEM_FIELDS, fromClaudePage } from './model.js';
import { csv } from './tables.js';

const cmpFields = (c, r) => c === 'entries' ? ENTRY_FIELDS : c === 'items' ? ITEM_FIELDS : c === 'decisions' ? ['topic', 'detail', 'status', 'decision'] : c === 'handouts' ? ['name', 'lines'] : c === 'rows' ? ((tableDef(r.t) || { fields: [] }).fields.map(f => f.key)) : [];
export function loadOrigin() {                          // the event exactly as it was first loaded, kept by the server; a failure is not kept, so the next call asks again
  if (S.orig && S.origFor === S.plan) return Promise.resolve(S.orig);
  if (!S.origP || S.origFor !== S.plan) {
    const plan = S.origFor = S.plan; S.orig = null; S.origFail = false;
    S.origP = api('api/origin?plan=' + plan).then(list => { if (plan === S.plan) S.orig = new Map(list.map(d => [d.path, d.data])); return S.orig; },
      () => { if (plan === S.origFor) { S.origP = null; S.origFail = true; } throw new Error('The event as first loaded could not be fetched. Try again in a moment.'); });
  }
  return S.origP;
}
export const originFailed = () => !!S.origFail && S.origFor === S.plan;
acts['orig-retry'] = () => { S.origFail = false; };
function diffOriginal() {
  const out = [];
  for (const [path, o] of S.orig) {
    const i = path.indexOf('/'), c = path.slice(0, i), id = path.slice(i + 1);
    if (!['entries', 'items', 'rows', 'decisions', 'handouts'].includes(c)) continue;
    const cur = curOf(c, id);
    if (!cur) { out.push({ k: 'gone', c, id, o }); continue; }
    const f = cmpFields(c, cur).filter(k => !eq(cur[k], o[k]));
    if (f.length) out.push({ k: 'changed', c, id, o, cur, f });
  }
  for (const c of ['entries', 'items', 'rows', 'decisions', 'handouts']) for (const r of X[c].values()) if (!S.orig.has(c + '/' + r.id)) out.push({ k: 'new', c, id: r.id, cur: r });
  return out;
}
views.history = () => {
  const list = X.log.filter(e => !S.pruned.has(e.id)).slice(0, LOG_MAX);
  let h = head('History') + '<h3>Changes</h3><div class="box">';
  if (!list.length) h += '<div class="rr muted">No changes yet.</div>';
  for (const e of list) {
    const r = e.rc && e.rid && ['entries', 'items', 'rows', 'decisions', 'handouts'].includes(e.rc) ? curOf(e.rc, e.rid) : null, off = e.undone || S.undid.has(e.id);
    h += '<div class="rr' + (off ? ' undone' : '') + '"><div class="who"><span class="lb">' + esc(e.label) + '</span><span class="ctx">' + esc(stamp(e.ms)) + (e.by ? ' by ' + esc(e.by) : '') + (e.row ? tag(r ? go(e.rc, r, e.row) : esc(e.row)) : '') + '</span></div><div class="ctl">' +
      (off ? '<span class="muted">Undone</span>' : CW() ? '<button type="button" class="btn sm" data-act="change-reverse" data-id="' + esc(e.id) + '">' + (/^Undo: /.test(e.label) ? 'Redo this' : 'Undo this') + '</button>' : '') + '</div></div>';
  }
  h += '</div>';
  if (!S.orig || S.origFor !== S.plan) {
    if (originFailed()) return h + '<p class="empty">The event as first loaded could not be fetched. <button type="button" class="btn sm" data-act="orig-retry">Try again</button></p>';
    loadOrigin().then(renderSoon, renderSoon); return h;
  }
  if (S.orig.size) {
    const d = diffOriginal(), n = k => d.filter(x => x.k === k).length;
    h += '<h3>Compared with the event as first loaded</h3>' + fold('orig', d.length, n('changed') + ' changed, ' + n('new') + ' added, ' + n('gone') + ' deleted', () => d.map(x => {
      const nm = rowName(x.c, x.cur || x.o);
      if (x.k === 'changed') return '<div class="rr"><div class="who">' + go(x.c, x.cur, nm) + '<span class="chgs">' + esc(ctxOf(x.c, x.cur)) + '<br>' + x.f.map(k => esc(fieldLabel(x.c, x.cur, k)) + ': <s>' + esc(showVal(k, x.o[k])) + '</s> → ' + esc(showVal(k, x.cur[k]))).join('<br>') + '</span></div><div class="ctl">' +
        (CW() ? '<button type="button" class="btn sm" data-act="put-back" data-c="' + x.c + '" data-id="' + esc(x.id) + '">Put back</button>' : '') + '</div></div>';
      if (x.k === 'gone') return '<div class="rr"><div class="who"><span class="lb">' + esc(nm) + '</span><span class="chgs">Deleted' + (x.c === 'entries' ? ' from ' + esc(secLabel(x.o.sec)) : '') + '</span></div><div class="ctl">' + (CW() ? '<button type="button" class="btn sm" data-act="bring-back" data-c="' + x.c + '" data-id="' + esc(x.id) + '">Bring back</button>' : '') + '</div></div>';
      return '<div class="rr"><div class="who">' + go(x.c, x.cur, nm) + '<span class="chgs">Added in ' + esc(ctxOf(x.c, x.cur)) + '</span></div></div>';
    }).join(''));
  }
  const o = X.origin;
  if (o) {
    const all = [];
    for (const c of ['entries', 'items', 'rows']) for (const r of X[c].values()) for (const ch of (Array.isArray(r.chg) ? r.chg : [])) if (ch && typeof ch === 'object') all.push({ c, r, ch });
    h += '<h3>Import log</h3><p class="muted num">' + esc(o.source || '').replace(/([._-])/g, '$1<wbr>') + '<br>' + plural(all.length, 'cleanup change') + '</p>';
    for (const ru of Array.isArray(o.rules) ? o.rules.filter(x => x && typeof x === 'object') : []) {
      const hit = all.filter(x => x.ch.r === ru.r);
      if (!hit.length) continue;
      const grp = new Map();
      for (const x of hit) { const k = x.ch.f + '|' + x.ch.was + '|' + x.ch.now; if (!grp.has(k)) grp.set(k, []); grp.get(k).push(x); }
      h += fold('rule-' + ru.r, hit.length, ru.label, () => [...grp.values()].map(g => { const x = g[0]; return '<div class="rr"><div class="who was"><s>' + esc(x.ch.was) + '</s>' + (x.ch.now ? ' → <span class="ink">' + esc(x.ch.now) + '</span>' : ' removed') + '<span class="ctx">' + go(x.c, x.r, rowName(x.c, x.r)) + (g.length > 1 ? ' and ' + (g.length - 1) + ' more' : '') + '</span></div></div>'; }).join(''));
    }
    const words = Array.isArray(o.words) ? o.words.filter(w => Array.isArray(w) && w.length === 2) : [];      // an imported file says what it likes here: only a list of pairs is taken
    if (words.length) h += fold('words', words.length, 'Words changed everywhere', () => words.map(w => '<div class="rr"><div class="who was"><s>' + esc(w[0]) + '</s> → <span class="ink">' + esc(w[1]) + '</span></div></div>').join(''));
  }
  return h;
};
acts['put-back'] = d => {
  const o = S.orig && S.orig.get(d.c + '/' + d.id), cur = curOf(d.c, d.id);
  if (!o || !cur) return;
  const p = {};
  for (const k of cmpFields(d.c, cur)) if (!eq(cur[k], o[k])) p[k] = o[k] === undefined ? null : o[k];
  action('Put back as first loaded', () => write(d.c, d.id, p), { row: rowName(d.c, cur), rc: d.c, rid: d.id });
};
acts['bring-back'] = d => { const o = S.orig && S.orig.get(d.c + '/' + d.id); if (o && !curOf(d.c, d.id)) restore(d.c, Object.assign({ id: d.id }, o)); };

/* ---------- exports ---------- */
export function exportPack() {                          // everything in this event, in the shape Import takes
  const docs = [];
  for (const [path, data] of store.docs) if (path.startsWith(P()) && !path.startsWith(P() + 'log/')) docs.push({ path: path.slice(P().length), data });
  docs.sort((a, b) => a.path.localeCompare(b.path));
  const plan = Object.assign({}, X.plan);
  return { format: 1, exported: new Date().toISOString(), plan, docs };
}
export function planCsv() {
  const own = r => Array.isArray(r.owner) ? r.owner.join('; ') : r.owner || '';
  const w = W(), rows = [['Section', w.Entry, 'Row', 'Type or kind', 'Name', 'Qty', 'Unit', 'Where / how', 'Start', 'End', 'Due', w.owner, w.Helpers, 'Status', 'Location', 'Notes']];
  const item = (s, e, i) => [s.label, e ? (e.title || e.slot || '') : '', w.Item, i.kind || '', i.title || '', i.qty == null ? '' : i.qty, i.unit || '', i.where || '', '', '', '', own(i), (i.helpers || []).join('; '), i.status || '', '', i.notes || ''];
  for (const s of X.secs) {
    for (const e of X.bySec[s.key] || []) {
      rows.push([s.label, e.title || '', w.Entry, [e.type, e.slot].filter(Boolean).join(': '), e.title || '', '', '', e.source || '', e.start || '', e.end || '', e.due || '', own(e), (e.helpers || []).join('; '), e.status || '', e.location || '', e.notes || '']);
      for (const i of X.kids.get(e.id) || []) rows.push(item(s, e, i));
    }
    for (const i of X.loose[s.key] || []) rows.push(item(s, null, i));
  }
  return csv(rows);
}

/* ---------- the first Claude page's backup -> this event ----------
   Applies only what that page changed since the event was first loaded: a field the page left alone keeps whatever it has here. */
export async function importClaudeBackup(dump) {
  if (!dump || !Array.isArray(dump.events) || !Array.isArray(dump.items)) throw new Error('This is not a backup from the Claude page.');
  const orig = await loadOrigin(), page = fromClaudePage(dump), known = new Set((X.origin && X.origin.page1) || []);
  for (const m of [page.entries, page.items]) for (const d of m.values()) if (d.status && !X.status.has(d.status) && /^(done|complete|completed|finished)$/i.test(d.status)) d.status = W().Done;      // the page's word for finished becomes this event's
  if (!known.size || dump.events.filter(e => known.has('entries/' + e.id)).length < dump.events.length / 2) throw new Error('This backup is from a different event.');
  const n = { fields: 0, rows: new Set(), added: 0, deleted: 0, both: 0 };
  const tx = action('Brought in the Claude page backup', () => {
    for (const [c, map, fields] of [['entries', page.entries, ENTRY_FIELDS], ['items', page.items, ITEM_FIELDS], ['decisions', page.decisions, ['status', 'decision']]]) {
      for (const [id, d] of map) {
        const o = orig.get(c + '/' + id), cur = curOf(c, id);
        if (!o) { if (!cur) { create(c, d, null, id); n.added++; } continue; }      // made on the page
        if (!cur) continue;                                                          // deleted here since: leave it deleted
        const p = {};
        for (const k of fields) if (!eq(d[k], o[k]) && !eq(cur[k], d[k])) { p[k] = d[k]; if (!eq(cur[k], o[k])) n.both++; }
        if (Object.keys(p).length) { write(c, id, p); n.fields += Object.keys(p).length; n.rows.add(id); }
      }
      for (const key of known) { const i = key.indexOf('/'), id = key.slice(i + 1); if (key.slice(0, i) === c && !map.has(id) && curOf(c, id)) { remove(c, id); n.deleted++; } }
    }
    const fresh = page.people.people.filter(p => !X.names.includes(p.name));
    if (fresh.length) { write('meta', 'people', { people: (X.people.people || []).concat(fresh) }, X.people); n.added += fresh.length; }
  }, { row: 'Whole event', quiet: true });
  const text = tx ? plural(n.fields, 'field') + ' on ' + plural(n.rows.size, 'row') + ' changed, ' + n.added + ' added, ' + n.deleted + ' deleted' + (n.both ? ' (' + n.both + ' had also been changed here; the page’s value was used)' : '') : 'Nothing to bring in: this event already matches the backup.';
  toast(text);
  render();
  return n;
}
