/* Every event at once: who is doing what across them, one shopping or to-do list for all of them, the figures side by side, and one search.
   These views read; a row links into its own event, which is where it is changed. */
import { esc, S, X, W, views, acts, changes, makeIndex, using, far, moneyShort, fmtDate, today, plural, pct, qtyText, live, isDone, real, entryOf, allEntries, allItems, lead, ctxOf, tone, tableDef, rowTitle, seg, moreMenu, count, tag, renderSoon, toast, download, kpis, progress, legend, amountBar, meter, isMine, sortedNames, pick, UNLISTED } from './core.js';
import { api } from './store.js';
import { personStats, csv } from './tables.js';
import { whoLabel } from './plan.js';
import { planStats, whenText } from './stats.js';

/* ---------- loading ---------- */
const ALL = { key: '', list: [], ready: false, loading: false };
async function load(key, plans) {
  ALL.loading = true; document.body.dataset.busy = '1';      // what is on screen stays, dimmed, until the fresh figures arrive
  try {
    const list = [];
    for (let i = 0; i < plans.length; i += 8) {            // the server takes eight events per request
      const part = plans.slice(i, i + 8), r = await api('api/docs?lean=1&' + part.map(p => 'scope=' + encodeURIComponent('p/' + p.id)).join('&'));
      const by = new Map(part.map(p => [p.id, new Map()]));
      for (const d of r.docs) { const m = by.get(d.path.split('/')[1]); if (m) m.set(d.path, d.data); }
      for (const p of part) { const m = by.get(p.id), doc = Object.assign({}, p); delete doc.id; m.set('plans/' + p.id, doc); const ix = makeIndex(m, p.id); if (ix.cfg) { ix.stats = using(ix, planStats); list.push(ix); } }
    }
    ALL.list = list;
  } catch (e) { toast('The events could not be read (' + ((e && e.message) || 'error') + ').'); }
  ALL.key = key; ALL.ready = true; ALL.loading = false; delete document.body.dataset.busy;
  renderSoon();
}
/* Every event and template, indexed and added up; null until the first answer. Read again each time one of these screens is opened. */
export function everything() {
  const key = X.plans.map(p => p.id + ':' + (p.name || '') + ':' + (p.dates || '')).join('|');
  if ((S.fresh || ALL.key !== key) && !ALL.loading) { S.fresh = false; load(key, X.plans.slice()); }
  return ALL.ready ? ALL.list : null;
}
const byDate = (a, b) => (a.stats.first || '9999').localeCompare(b.stats.first || '9999') || String(a.plan.name || '').localeCompare(String(b.plan.name || ''));
/* The events as last read, without reading them again. */
export const known = () => ALL.ready ? ALL.list.filter(ix => ix.plan.kind !== 'template') : null;
export const events = () => { const all = everything(); return all && all.filter(ix => ix.plan.kind !== 'template').sort(byDate); };
export const templates = () => { const all = everything(); return all && all.filter(ix => ix.plan.kind === 'template'); };
const wait = title => '<h2>' + title + '</h2><p class="empty">Adding up…</p>';
const none = title => '<h2>' + title + '</h2><p class="empty">No events yet. <a class="lnk" href="#/">Start one</a>.</p>';
const evHead = (ix, n) => '<div class="gh"><a class="lnk" href="#/' + esc(ix.id) + '">' + esc(ix.plan.name) + '</a>' + (ix.plan.dates ? '<span class="gx">' + esc(ix.plan.dates) + '</span>' : '') + (n != null ? count(n) : '') + '</div>';
const statusTag = r => r.status ? '<span class="st" data-tone="' + esc(tone(r.status)) + '">' + esc(r.status) + '</span>' : '';
const openOnly = () => [['', 'Still to do'], ['1', 'Everything']];
/* What the events call a finished row. Each names it in its own statuses; across several, the name most of them use. */
const finish = evs => { const n = new Map(); for (const ix of evs) n.set(ix.w.Done, (n.get(ix.w.Done) || 0) + 1); const top = [...n].sort((a, b) => b[1] - a[1])[0]; return top ? top[0] : W().Done; };
const lower = w => /[a-z]/.test(w) ? w.toLowerCase() : w;
const fin1 = x => using(x[0], () => isDone(x[1]));      // a row is finished by its own event's statuses
acts.done = d => { S.ui.done = d.v === '1'; };
acts.aby = d => { S.ui.aby = d.v; };
changes['seg-go'] = (d, t) => { location.hash = t.value; return false; };

/* ---------- assignments ---------- */
function peopleAcross(evs) {                              // the same name in two events is the same person
  const m = new Map();
  for (const ix of evs) using(ix, () => {
    for (const name of X.names) {
      const st = ix.stats.byPerson.get(name) || personStats(name), key = name.trim().toLowerCase();
      const rows = st.ev.map(r => ['entries', r, W().owner]).concat(st.it.map(r => ['items', r, W().owner]), st.cap.map(x => [x[0], x[1], 'Captain, ' + x[2]]), st.help.map(x => [x[0], x[1], W().Helper]), st.via.map(x => [x[0], x[1], 'In ' + x[2]]));
      const leadN = st.ev.length + st.it.length + st.cap.length;
      if (!m.has(key)) m.set(key, { name, events: [], lead: 0, help: 0, done: 0, open: 0 });
      const p = m.get(key);
      p.events.push({ ix, rows, lead: leadN }); p.lead += leadN; p.help += rows.length - leadN;
      p.done += rows.slice(0, leadN).filter(x => isDone(x[1])).length; p.open += rows.filter(x => !isDone(x[1])).length;
    }
  });
  return [...m.values()].sort((a, b) => b.lead - a.lead || b.help - a.help || a.name.localeCompare(b.name));
}
views['~assignments'] = () => {
  const evs = events();
  if (!evs) return wait('Assignments');
  if (!evs.length) return none('Assignments');
  const people = peopleAcross(evs), who = people.find(p => p.name.toLowerCase() === S.harg.toLowerCase());
  if (who) {
    const all = !!S.ui.done;
    let h = '<p class="crumb"><a class="lnk" href="#/~/assignments">Assignments</a></p><div class="sec-h"><h2>' + esc(who.name) + '</h2></div>' +
      '<div class="tools">' + seg('done', openOnly(), all ? '1' : '') + '</div>';
    let any = false;
    for (const e of who.events) {
      const rows = using(e.ix, () => e.rows.filter(x => all || !isDone(x[1])));
      if (!rows.length) continue;
      any = true;
      h += '<div class="box">' + evHead(e.ix, rows.length) + using(e.ix, () => rows.map(([c, r, why]) => '<div class="rr"><div class="who">' + far(e.ix.id, c, r.id, r.title || r.slot || '(no name)') + '<span class="ctx">' + esc(ctxOf(c, r)) + tag(esc(why)) + '</span></div><div class="ctl">' + statusTag(r) + '</div></div>').join('')) + '</div>';
    }
    return h + (any ? '' : '<p class="empty">' + (all ? 'Nothing assigned.' : 'Nothing left to do.') + '</p>');
  }
  const shown = people.filter(p => p.lead || p.help), max = Math.max(1, ...shown.map(p => p.lead));
  let h = '<h2>Assignments</h2><p class="muted num">' + esc(plural(shown.length, 'person', 'people') + ' with something to do across ' + plural(evs.length, 'event')) + '</p>';
  if (!shown.length) return h + '<p class="empty">Nobody is assigned to anything yet.</p>';
  return h + meter(['Person', 'Rows they lead', 'Leads', finish(evs), 'Helps', 'Events'], shown.map(p => ['<a class="lnk" href="#/~/assignments/' + encodeURIComponent(p.name) + '">' + esc(p.name) + '</a>',
    amountBar(p.lead, max, p.name + ' leads ' + plural(p.lead, 'row') + ', ' + p.done + ' ' + lower(finish(evs))), String(p.lead || ''), p.lead ? pct(p.done, p.lead) + '%' : '', String(p.help || ''), String(p.events.filter(e => e.rows.length).length)]));
};

/* ---------- lists ---------- */
function kindsAcross(evs, who) {                          // kinds with the same name are one list, in the order first met; Unlisted first; who: one person's items only
  const m = new Map([['', { key: '', label: UNLISTED, rows: [] }]]);      // Unlisted first, then the rest in the order first met
  for (const ix of evs) for (const k of ix.cfg.itemKinds || []) { const key = k.name.toLowerCase(); if (!m.has(key)) m.set(key, { key, label: k.label || k.name, rows: [] }); }
  for (const ix of evs) using(ix, () => { for (const i of allItems()) if (live(i) && (!entryOf(i) || real(entryOf(i))) && isMine(i, who, entryOf(i))) m.get(X.kind.has(i.kind) ? i.kind.toLowerCase() : '').rows.push([ix, i]); });
  return [...m.values()].filter(k => k.rows.length);
}
views['~lists'] = () => {
  const evs = events();
  if (!evs) return wait('Checklists');
  if (!evs.length) return none('Checklists');
  const names = [...new Set(evs.flatMap(ix => using(ix, sortedNames)))].sort((a, b) => a.localeCompare(b)), who = names.includes(S.ui.awho) ? S.ui.awho : '';
  const whoSel = names.length ? pick('<select class="s" data-act="all-who" data-v="' + esc(who) + '" aria-label="Whose checklists"><option value="">Everyone</option>' + names.map(x => '<option' + (x === who ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>', who ? who + '’s checklists' : 'Everyone’s checklists', 'framed') : '';
  const kinds = kindsAcross(evs, who), all = !!S.ui.done, by = S.ui.aby || 'event';
  if (!kinds.length) return '<h2>Checklists</h2>' + (whoSel ? '<div class="tools">' + whoSel + '</div>' : '') + '<p class="empty">' + (who ? 'Nothing for ' + esc(who) + ' on any checklist.' : 'Nothing on any checklist yet.') + '</p>';
  const k = kinds.find(x => (x.key || '-') === S.harg.toLowerCase()) || kinds[0], rows = k.rows.filter(x => all || !fin1(x));
  let h = '<h2>' + (who ? esc(who) + '’s checklists' : 'Checklists') + '</h2><div class="tools">' + whoSel + '<div class="seg' + (kinds.length > 4 ? ' many' : '') + '">' + kinds.map(x => '<a href="#/~/lists/' + encodeURIComponent(x.key || '-') + '" aria-pressed="' + (x === k) + '">' + esc(x.label) + count(x.rows.filter(y => !fin1(y)).length) + '</a>').join('') + '</div>' +
    '<select class="segsel" data-act="seg-go" aria-label="List">' + kinds.map(x => '<option value="#/~/lists/' + encodeURIComponent(x.key || '-') + '"' + (x === k ? ' selected' : '') + '>' + esc(x.label + ' (' + x.rows.filter(y => !fin1(y)).length + ')') + '</option>').join('') + '</select></div>' +
    '<div class="tools">' + seg('done', openOnly(), all ? '1' : '') + seg('aby', [['event', 'By event'], ['person', 'By person']], by) + moreMenu('<button type="button" class="btn" data-act="all-csv" data-v="' + esc(k.key) + '">Download .csv</button>') + '</div>' +
    '';
  /* One event's rows, under the entry each belongs to, so the place and time are said once. */
  const block = (ix, list, byPerson) => using(ix, () => {
    let out = '', last = null;
    for (const i of list) {
      const ctx = ctxOf('items', i), q = qtyText(i);
      if (ctx !== last) { out += '<div class="kg">' + esc(ctx) + '</div>'; last = ctx; }
      out += '<div class="rr"><div class="who"><span>' + (q ? '<span class="q">' + esc(q) + '</span> ' : '') + '<a class="lnk" href="#/' + esc(ix.id) + '/list/' + encodeURIComponent(i.id) + '">' + esc(i.title || '(no name)') + '</a>' + '</span>' + (i.where ? '<span class="ctx">' + esc(i.where) + '</span>' : '') + '</div><div class="ctl">' +
        (byPerson ? '' : '<span class="st">' + esc(whoLabel(i)) + '</span>') + statusTag(i) + '</div></div>';
    }
    return out;
  });
  if (by === 'event') for (const ix of evs) { const mine = rows.filter(x => x[0] === ix).map(x => x[1]); if (mine.length) h += '<div class="box">' + evHead(ix, mine.length) + block(ix, mine, false) + '</div>'; }
  else {
    const g = new Map();
    for (const [ix, i] of rows) { const who = using(ix, () => whoLabel(i)); if (!g.has(who)) g.set(who, new Map()); if (!g.get(who).has(ix)) g.get(who).set(ix, []); g.get(who).get(ix).push(i); }
    for (const who of [...g.keys()].sort((a, b) => (a === 'Nobody yet') - (b === 'Nobody yet') || a.localeCompare(b))) {
      const parts = [...g.get(who)];
      h += '<div class="box"><div class="gh">' + esc(who) + count(parts.reduce((a, x) => a + x[1].length, 0)) + '</div>' + parts.map(([ix, list]) => (evs.length > 1 ? '<div class="kg ev-n">' + esc(ix.plan.name) + '</div>' : '') + block(ix, list, true)).join('') + '</div>';
    }
  }
  return h + (rows.length ? '' : '<p class="empty">Nothing left on this list.</p>');
};
changes['all-who'] = (d, t) => { S.ui.awho = t.value; };
acts['all-csv'] = d => {
  const k = kindsAcross(events() || [], S.ui.awho || '').find(x => x.key === d.v);
  if (!k) return false;
  const rows = [['Event', 'Section and entry', 'Item', 'Quantity', 'Unit', 'Where / how', 'Who', 'Status', 'Notes']];
  for (const [ix, i] of k.rows) using(ix, () => rows.push([ix.plan.name, ctxOf('items', i), i.title || '', i.qty == null ? '' : i.qty, i.unit || '', i.where || '', whoLabel(i), i.status || '', i.notes || '']));
  download('all-events-' + (k.key || 'not-sorted') + '.csv', csv(rows), 'text/csv');
  return false;
};

/* ---------- insights ---------- */
views['~insights'] = () => {
  const evs = events();
  if (!evs) return wait('Insights');
  if (!evs.length) return none('Insights');
  const sum = k => evs.reduce((a, ix) => a + (ix.stats[k] || 0), 0), rowsN = sum('rows'), done = sum('done'), td = today(), fin = finish(evs);
  const oneSign = new Set(evs.map(ix => ix.fmt.currency)).size === 1, cash = (ix, n) => using(ix, () => moneyShort(n));
  const next = evs.find(ix => ix.stats.days != null && ix.stats.days >= 0), people = peopleAcross(evs).filter(p => p.lead || p.help);
  let h = '<h2>Insights</h2>' + kpis([
    ['Events', String(evs.length), next ? 'Next ' + whenText(next.stats).toLowerCase() : ''],
    [fin, pct(done, rowsN) + '%', done + ' of ' + plural(rowsN, 'row')],
    ['Still to do', String(rowsN - done), sum('doing') + ' under way'],
    ['Needs attention', String(sum('attention')), plural(sum('openDecisions'), 'open decision')],
    ['People', String(people.length), 'with something to do'],
    sum('cost') && oneSign ? ['Paid so far', cash(evs[0], sum('cost')), ''] : null]);

  h += '<h3>Events</h3>' + legend(fin, 'Under way', 'Not started') + meter(['Event', '', fin, 'To do', 'No lead', 'Attention', 'Paid', 'When'], evs.map(ix => { const s = ix.stats;
    return ['<a class="lnk" href="#/' + esc(ix.id) + '/insights">' + esc(ix.plan.name) + '</a>', progress(s.done, s.doing, s.rows, ix.plan.name, ix.w.done), s.rows ? pct(s.done, s.rows) + '%' : '', String(s.rows - s.done), String(s.entries - s.led || ''), String(s.attention || ''), s.cost ? cash(ix, s.cost) : '', esc(whenText(s))]; }), 'wide');

  if (people.length) {
    const top = people.slice(0, 12), max = Math.max(1, ...top.map(p => p.lead));
    h += '<h3>Who carries the most</h3>' + meter(['Person', 'Rows they lead', 'Leads', fin, 'Helps'], top.map(p => ['<a class="lnk" href="#/~/assignments/' + encodeURIComponent(p.name) + '">' + esc(p.name) + '</a>',
      amountBar(p.lead, max, p.name + ' leads ' + plural(p.lead, 'row') + ' across ' + plural(p.events.filter(e => e.rows.length).length, 'event')), String(p.lead || ''), p.lead ? pct(p.done, p.lead) + '%' : '', String(p.help || '')])) +
      (people.length > top.length ? '<p class="muted"><a class="lnk" href="#/~/assignments">All ' + people.length + ' people</a></p>' : '');
  }
  const due = [];                                           // dated rows not yet done: late ones, then the next four weeks
  for (const ix of evs) using(ix, () => { for (const e of allEntries()) if (real(e) && e.due && !isDone(e)) due.push({ ix, e, late: e.due < td }); });
  const soon = new Date(Date.now() + 28 * 864e5).toISOString().slice(0, 10), list = due.filter(x => x.late || x.e.due <= soon).sort((a, b) => a.e.due.localeCompare(b.e.due)).slice(0, 14);
  if (list.length) h += '<h3>Due</h3><div class="box">' + list.map(x => using(x.ix, () => { const l = lead(x.e);
    return '<div class="rr"><div class="who">' + far(x.ix.id, 'entries', x.e.id, x.e.title) + '<span class="ctx">' + esc(x.ix.plan.name) + (l.who.length ? tag(esc(l.who.join(' + '))) : '') + '</span></div><div class="ctl"><span class="st' + (x.late ? ' bad' : '') + '">' + (x.late ? 'Was due ' : 'Due ') + esc(fmtDate(x.e.due)) + '</span></div></div>'; })).join('') + '</div>';
  return h;
};

/* ---------- one search for every event ---------- */
views['~find'] = () => {
  const evs = events();
  if (!evs) return wait('Search');
  const q = S.q.toLowerCase(), has = v => v != null && String(v).toLowerCase().includes(q), hit = r => [r.title, r.notes, r.owner, (r.helpers || []).join(' '), r.where, r.location, r.slot].some(has);
  let h = '<h2>Results for “' + esc(S.q) + '”</h2>', n = 0;
  for (const ix of evs) using(ix, () => {
    const ev = allEntries().filter(hit), it = allItems().filter(hit), rows = [...X.rows.values()].filter(r => { const t = tableDef(r.t); return t && t.fields.some(f => f.type !== 'photo' && has(r[f.key])); }), total = ev.length + it.length + rows.length;
    if (!total) return;
    n += total;
    const line = (c, r, name) => '<div class="rr"><div class="who">' + far(ix.id, c, r.id, name) + '<span class="ctx">' + esc(ctxOf(c, r)) + '</span></div><div class="ctl">' + (c === 'rows' ? '' : statusTag(r)) + '</div></div>';
    h += '<div class="box">' + evHead(ix, total) + ev.slice(0, 20).map(e => line('entries', e, e.title || e.slot || '(no name)')).join('') + it.slice(0, 40).map(i => line('items', i, i.title || '(no name)')).join('') + rows.slice(0, 20).map(r => line('rows', r, rowTitle(tableDef(r.t), r))).join('') +
      (total > 80 ? '<div class="rr muted">Open the event to see the rest.</div>' : '') + '</div>';
  });
  return h + (n ? '' : '<p class="empty">No match in any event.</p>');
};
