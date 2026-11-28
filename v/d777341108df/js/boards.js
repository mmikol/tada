/* Boards: an event's Overview and Insights. Each is a set of widgets kept in the event's setup (config.boards), so everyone in the plan sees the
   same and a template carries it; an event that has not arranged its own shows model.js DEFAULT_BOARDS. Anyone who can edit can add widgets,
   take them out, move and resize them, and choose what each counts and how it shows it. A widget can also be folded away, on this device only.
   Every figure a bar shows is printed beside it, so nothing is read from colour or from hovering alone. */
import { eventEditor } from './settings.js';
import { esc, S, X, W, views, acts, changes, CW, isTemplate, kpis, progress, legend, amountBar, meter, pct, plural, an, money, moneyShort, daySecs, secOf, secLabel, secDot,
  real, live, isDone, led, lead, entryOf, secOfItem, allEntries, allItems, fmtTime, fmtDate, today, NOBODY, href, render, idOf, tableDef, go, isDoing, listName, tag, head, moneyRole, spentOf, editBtn, putCfg, saveCfg } from './core.js';
import { newId } from './rules.js';
import { kept } from './device.js';
import { DEFAULT_BOARDS, pluralOf, isDate } from './model.js';
import { gapList } from './plan.js';
import { planStats } from './stats.js';
import { tableGroups } from './tables.js';

const BOARDS = { overview: 'Overview', insights: 'Insights' };
const SIZES = [['full', 'Full width'], ['half', 'Half'], ['third', 'A third']];
const ownerWord = () => /^[A-Z0-9]{2,}$/.test(W().owner) ? W().owner : W().owner.toLowerCase();
export const boardOf = name => { const b = X.cfg.boards && X.cfg.boards[name]; return Array.isArray(b) ? b.filter(w => w && typeof w === 'object' && KINDS[w.kind] && w.id) : DEFAULT_BOARDS[name]; };
const num = (v, isMoney) => isMoney ? money(v) : Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 2 });
/* A picker. A stored choice that is no longer offered (a table or field removed, a type renamed) stays in it, said to be gone, so the reason a widget is empty can be seen. */
const pickerHtml = (at, list, cur) => { const c = String(cur == null ? '' : cur), all = c && !list.some(x => x[0] === c) ? list.concat([[c, c.replace(/^\w+:/, '') + ' (removed)']]) : list; return '<select' + at + '>' + all.map(([v, l]) => '<option value="' + esc(v) + '"' + (c === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>'; };

/* ---------- what a chart can count, what it can group by, how it can show it ---------- */
const ROWS = ['rows', 'entries', 'items'];
function whatList() {
  const w = W(), out = [['rows', w.Entries + ' and ' + w.items], ['entries', w.Entries], ['items', w.Items], ['cost', 'Money spent']];
  for (const t of X.cfg.tables || []) {
    out.push(['table:' + t.id, t.name]);
    for (const f of t.fields) if (f.type === 'number' || f.type === 'money') out.push(['sum:' + t.id + ':' + f.key, t.name + ' ' + f.label.toLowerCase() + ', added up']);
  }
  return out;
}
const tableOf = what => { const m = /^(?:table|sum):([^:]+)/.exec(what || ''); return m ? tableDef(m[1]) : null; };
function byList(what) {
  const w = W(), t = tableOf(what), none = [['', 'Nothing: one total']];
  if (what === 'cost') return none.concat([['group', 'Category']]);
  if (/^(table|sum):/.test(what || '')) return none.concat(t ? t.fields.filter(f => ['choice', 'person', 'people', 'text', 'check'].includes(f.type)).map(f => ['field:' + f.key, f.label]) : []);
  const out = none.concat([['section', 'Day or list'], ['status', 'Status'], ['owner', w.owner]]);
  if (what !== 'entries') out.push(['kind', w.Item + ' kind']);
  if (what === 'rows' || what === 'entries') out.push(['type', w.Entry + ' type']);
  return out;
}
const fieldOf = (what, by) => { const t = tableOf(what); return t && /^field:/.test(by || '') ? t.fields.find(f => f.key === by.slice(6)) || null : null; };
const ranked = (what, by) => { const f = fieldOf(what, by); return by === 'owner' || !!(f && f.type !== 'choice'); };      // groups with no order of their own, shown largest first
function asList(what, by) {
  if (!by) return [['number', 'One number']];
  const many = (fieldOf(what, by) || {}).type === 'people';      // a row with several people counts once for each: its parts are not shares of one whole
  return (ROWS.includes(what) ? [['progress', 'Progress bars']] : []).concat([['bars', 'Bars']], many ? [] : [['split', 'One bar, split']], [['table', 'Figures only'], ['number', 'One number']]);
}
/* The groups a chart shows, in order: a natural order where there is one (sections, statuses, kinds, a field's choices), else largest first. */
function tally(w) {
  const what = w.what || 'rows', by = w.by || '', t = tableOf(what), m = /^(table|sum):[^:]+(?::(.+))?$/.exec(what), recs = [];
  const sumOf = m && m[1] === 'sum' && t ? t.fields.find(f => f.key === m[2]) : null;
  if (m && !t) return { gone: 'The sheet it counted is no longer in this event' };
  if (m && m[1] === 'sum' && !(sumOf && (sumOf.type === 'number' || sumOf.type === 'money'))) return { gone: 'The field it added up is no longer in ' + t.name };
  if (/^field:/.test(by) && !fieldOf(what, by)) return { gone: 'The field it grouped by is no longer in ' + t.name };
  const ents = allEntries().filter(real), its = allItems().filter(i => live(i) && (!entryOf(i) || real(entryOf(i))));
  if (what === 'rows' || what === 'entries') for (const e of ents) recs.push({ c: 'entries', r: e, v: 1 });
  if (what === 'rows' || what === 'items') for (const i of its) recs.push({ c: 'items', r: i, v: 1 });
  const spentTables = what === 'cost' ? (X.cfg.tables || []).filter(x => x.fields.some(f => moneyRole(f) === 'spent')) : [];
  for (const st of spentTables) for (const r of X.byTable.get(st.id) || []) { const v = spentOf(st, r); if (v) recs.push({ c: 'rows', r, v, t: st }); }
  if (t && m) for (const r of X.byTable.get(t.id) || []) recs.push({ c: 'rows', r, v: m[1] === 'sum' ? Number(r[m[2]]) || 0 : 1 });
  const field = t && by.startsWith('field:') ? fieldOf(what, by) : null;
  const keys = rec => {
    const r = rec.r;
    if (!by) return ['All'];
    if (rec.t) { const g = rec.t.fields.find(f => f.key === rec.t.group); const v = g ? r[g.key] : ''; return [v == null || v === '' ? (spentTables.length > 1 ? rec.t.name : 'No ' + (g ? g.label.toLowerCase() : 'category')) : String(v)]; }      // money: by the category its table groups by
    if (by === 'section') return rec.c === 'rows' ? [] : [secLabel(rec.c === 'entries' ? r.sec : secOfItem(r))];
    if (by === 'status') return [r.status || 'No status'];
    if (by === 'owner') { const l = lead(r, rec.c === 'items' ? entryOf(r) : null); return [l.how === 'nobody' || (l.how === 'via' && l.nobody) ? NOBODY : l.who.length ? l.who.join(' + ') : 'Nobody yet']; }
    if (by === 'kind') return rec.c === 'items' ? [listName(r.kind)] : [];
    if (by === 'type') return rec.c === 'entries' ? [r.type || 'No type'] : [];
    if (field) { const v = r[field.key]; if (Array.isArray(v)) return v.length ? v.map(String) : ['None']; if (field.type === 'check') return [v ? 'Yes' : 'No']; return [v == null || v === '' ? 'None' : String(v)]; }
    return [];
  };
  const groups = new Map();
  for (const rec of recs) for (const k of keys(rec)) {
    if (!groups.has(k)) groups.set(k, { name: k, v: 0, n: 0, done: 0, doing: 0 });
    const g = groups.get(k); g.v += rec.v; g.n++;
    if (rec.c !== 'rows') { if (isDone(rec.r)) g.done++; else if (isDoing(rec.r)) g.doing++; }
  }
  const g1 = spentTables.length === 1 ? spentTables[0].fields.find(f => f.key === spentTables[0].group && f.type === 'choice') : null;
  const natural = what === 'cost' ? (g1 ? g1.options || [] : null) : by === 'section' ? X.secs.map(s => s.label) : by === 'status' ? (X.cfg.statuses || []).map(s => s.name) : by === 'kind' ? (X.cfg.itemKinds || []).map(k => k.label || k.name)
    : by === 'type' ? (X.cfg.entryTypes || []).map(x => x.name) : field && field.type === 'choice' ? field.options || [] : null;
  if (by === 'section' && ROWS.includes(what)) for (const s of X.secs) if (!groups.has(s.label)) groups.set(s.label, { name: s.label, v: 0, n: 0, done: 0, doing: 0 });      // a day with nothing in it yet is worth seeing
  let list = [...groups.values()].filter(g => g.v || (by === 'section' && ROWS.includes(what)));
  if (natural) list.sort((a, b) => { const i = natural.indexOf(a.name), j = natural.indexOf(b.name); return (i < 0 ? 1e6 : i) - (j < 0 ? 1e6 : j) || b.v - a.v; });
  else list.sort((a, b) => b.v - a.v || a.name.localeCompare(b.name));
  const isMoney = what === 'cost' || !!(sumOf && sumOf.type === 'money');
  const label = what === 'cost' ? 'Spent' : sumOf ? sumOf.label : ROWS.includes(what) ? 'Rows' : pluralOf(t ? t.one || 'row' : 'row');
  return { list, ranked: !natural, total: recs.reduce((a, r) => a + r.v, 0), count: recs.length, isMoney, label, byLabel: (byList(what).find(x => x[0] === by) || ['', ''])[1] };
}
/* One whole split into parts: a thin bar, a block per part, with the names, figures and shares listed under it. The parts keep the groups' own order
   (and so their colours) instead of re-sorting by size; past six, the smallest go into "Other". */
function split(list, isMoney, what) {
  const some = list.filter(g => g.v > 0), total = some.reduce((a, g) => a + g.v, 0); if (!total) return '';
  const keep = new Set(some.slice().sort((a, b) => b.v - a.v).slice(0, some.length > 6 ? 5 : 6)), rest = some.filter(g => !keep.has(g));
  const parts = some.filter(g => keep.has(g)).map((g, i) => Object.assign({ c: 's' + (i + 1) }, g)).concat(rest.length ? [{ name: 'Other', v: rest.reduce((a, g) => a + g.v, 0), c: 'so' }] : []);
  const share = v => { const p = Math.round(100 * v / total); return p === 0 ? '<1%' : p + '%'; };
  const say = parts.map(p => p.name + ': ' + num(p.v, isMoney) + ' (' + share(p.v) + ')').join(', ');
  return '<span class="split" role="img" aria-label="' + esc(what + ': ' + say) + '">' + parts.map(p => '<i class="' + p.c + '" style="flex:' + p.v + '"></i>').join('') + '</span>' +
    '<ul class="lgd">' + parts.map(p => '<li><i class="' + p.c + '"></i><span>' + esc(p.name) + '</span><b class="num">' + esc(num(p.v, isMoney)) + '</b><small class="num">' + share(p.v) + '</small></li>').join('') + '</ul>';
}

/* ---------- the kinds of widget ---------- */
const FIGURES = {
  done: st => st.rows ? [W().Done, pct(st.done, st.rows) + '%', st.done + ' of ' + plural(st.rows, 'row')] : null,
  doing: st => st.rows ? ['Under way', String(st.doing), pct(st.doing, st.rows) + '% of rows'] : null,
  led: st => st.entries ? ['With ' + an(ownerWord()), pct(st.led, st.entries) + '%', st.led + ' of ' + plural(st.entries, W().entry)] : null,
  attention: st => ['Needs attention', String(st.attention), st.openDecisions ? plural(st.openDecisions, 'open decision') : ''],
  cost: st => st.cost || st.planned ? ['Spent so far', moneyShort(st.cost), st.planned ? 'of ' + moneyShort(st.planned) + ' planned' : ''] : null,
  days: st => st.days != null && st.days >= 0 ? ['To go', plural(st.days, 'day'), ''] : null,
  rows: st => [W().Entries + ' and ' + W().items, String(st.rows), plural(st.entries, W().entry) + ' and ' + plural(st.items, W().item)],
  decisions: st => st.decisions ? ['Decisions', st.openDecisions + ' open', 'of ' + st.decisions] : null,
};
const FIGURE_NAMES = () => [['done', W().Done], ['doing', 'Under way'], ['led', 'With ' + an(ownerWord())], ['attention', 'Needs attention'], ['cost', 'Spent so far'], ['days', 'Days to go'], ['rows', 'How many rows'], ['decisions', 'Decisions']];

const KINDS = {
  figures: {
    label: 'Figures', about: 'Headline numbers: how far along, who leads, what needs attention, days to go.',
    title: () => '',
    make: () => ({ show: ['done', 'led', 'attention'] }),
    draw: (w, c) => { const st = c.st(), list = (Array.isArray(w.show) ? w.show : []).map(k => FIGURES[k] ? FIGURES[k](st) : null).filter(Boolean); return list.length ? kpis(list) : ''; },
    edit: (w, at, box) => '<div class="wide"><span class="lab">Show</span><div class="hps">' + FIGURE_NAMES().map(([k, l]) => box(k, l, (w.show || []).includes(k))).join('') + '</div></div>',
  },
  coming: {
    label: 'Coming up', about: 'What is next by date: the next days’ rows and what is due.',
    title: () => 'Coming up',
    make: () => ({ n: 5 }),
    draw: w => {
      const td = today(), out = [];
      for (const e of allEntries().filter(real)) {
        const s = secOf(e.sec), day = s && s.kind === 'day' && isDate(s.date) ? s.date : '', d = day || e.due || '';
        if (!d || d < td || isDone(e)) continue;
        out.push({ d, t: day ? e.start || '' : '', e, day });
      }
      out.sort((a, b) => (a.d + (a.t || '99')).localeCompare(b.d + (b.t || '99')));
      if (!out.length) return '';
      return '<div class="box">' + out.slice(0, Number(w.n) || 5).map(x => { const l = lead(x.e); return '<div class="rr"><div class="who">' + go('entries', x.e) + '<span class="ctx">' + esc([x.day ? secLabel(x.e.sec) : 'Due ' + fmtDate(x.d), x.t && fmtTime(x.t)].filter(Boolean).join(', ')) + tag(esc(l.who.join(' + ') || (l.how === 'nobody' ? NOBODY : 'No ' + W().owner)), !l.who.length) + '</span></div></div>'; }).join('') + '</div>';
    },
    edit: (w, at) => '<label>How many' + pickerHtml(at('n'), [['3', '3'], ['5', '5'], ['10', '10'], ['20', '20']], String(w.n || 5)) + '</label>',
  },
  sections: {
    label: 'Days and lists', about: 'Each day and list, with how many of its rows have someone leading them.',
    title: () => '',
    make: () => ({ as: 'cards' }),
    draw: w => {
      const ww = W(), list = X.secs.map(s => { const evs = (X.bySec[s.key] || []).filter(real), how = evs.map(e => lead(e)); return { s, evs, c1: how.filter(led).length, c2: how.filter(l => l.how === 'help').length, items: evs.flatMap(e => X.kids.get(e.id)).concat(X.loose[s.key] || []).filter(live) }; });
      if (w.as === 'table') return meter(['Section', 'Who leads', ww.Entries, ww.Items, 'With ' + an(ownerWord())], list.map(x => ['<a class="lnk" href="' + href('s', x.s.key) + '">' + secDot(x.s.key) + ' ' + esc(x.s.label) + '</a>', cover(x), String(x.evs.length), String(x.items.length), x.evs.length ? x.c1 + ' of ' + x.evs.length : '']));
      let h = '<div class="cards">';
      for (const x of list) {
        const { s, evs, c1 } = x;
        h += '<button type="button" class="card c' + (Number(s.color) || 0) + '" data-act="view" data-v="s" data-arg="' + esc(s.key) + '"><b>' + esc(s.label) + '</b><span class="th">' + esc(s.note || '') + '</span>' + cover(x) +
          '<small class="num">' + esc(plural(evs.length, ww.entry)) + '</small><small class="num">' + (evs.length ? c1 === evs.length ? '<span class="good">All have ' + esc(an(ww.owner)) + '</span>' : c1 + ' of ' + evs.length + ' have ' + esc(an(ww.owner)) : '') + '</small></button>';
      }
      return h + '</div>';
    },
    edit: (w, at) => '<label>Show as' + pickerHtml(at('as'), [['cards', 'Cards'], ['table', 'A sheet']], w.as || 'cards') + '</label>',
  },
  attention: {
    label: 'Needs attention', about: 'The checks from Gaps that have something in them.',
    title: () => 'Needs attention',
    make: () => ({}),
    draw: (w, c) => { const G = c.gaps(); return G.length ? '<div class="attn">' + G.map(g => '<button type="button" data-act="gap" data-k="' + esc(g.k) + '"><b>' + g.rows.length + '</b><span>' + esc(g.t) + '</span></button>').join('') + '</div>' : ''; },
  },
  slots: {
    label: 'Daily slots', about: 'A grid of the slots expected every day (meals, say) and who has each one.',
    title: () => '',
    make: () => ({}),
    draw: w => {
      const days = daySecs(), ww = W();
      if (w.type && !(X.cfg.entryTypes || []).some(t => t.name === w.type)) return '<p class="muted">' + esc('“' + w.type + '” is no longer one of this event’s types. Choose another in Customize.') + '</p>';
      let h = '';
      for (const t of (X.cfg.entryTypes || []).filter(t => (t.daily || []).length && days.length && (!w.type || t.name === w.type))) {
        const extra = [...new Set(allEntries().filter(e => e.type === t.name && e.slot && !t.daily.includes(e.slot) && real(e)).map(e => e.slot))];
        h += '<h3>' + esc(t.name) + '</h3><div class="scroll"><table class="grid"><thead><tr><th></th>' + days.map(s => '<th>' + secDot(s.key) + ' ' + esc(s.label) + '</th>').join('') + '</tr></thead><tbody>';
        for (const sl of t.daily.concat(extra)) {
          h += '<tr><th scope="row">' + esc(sl) + '</th>';
          for (const s of days) {
            const inSlot = (X.bySec[s.key] || []).filter(e => e.type === t.name && e.slot === sl), shown = inSlot.filter(real);
            let c = '';
            for (const e of shown) { const l = lead(e); c += '<button type="button" class="cell" data-act="go" data-c="entries" data-id="' + esc(e.id) + '"><span class="nm">' + esc(e.title) + '</span><small>' + [e.start && fmtTime(e.start), l.how === 'own' || l.how === 'cap' ? esc(l.who.join(' + ')) : l.how === 'nobody' ? esc(NOBODY) : l.how === 'help' ? '<span class="warn">' + esc(e.helpers.join(', ') + ' (no ' + ww.owner + ')') + '</span>' : '<span class="bad">' + esc('No ' + ww.owner) + '</span>'].filter(Boolean).join(', ') + '</small></button>'; }
            if (!shown.length) { const off = inSlot.find(e => !live(e)); c = off ? '<span class="off">' + esc(off.status) + '</span>' : (t.daily.includes(sl) ? '<button type="button" class="cell" data-act="view" data-v="s" data-arg="' + esc(s.key) + '"><span class="hole">Nothing yet</span></button>' : ''); }
            h += '<td>' + (c ? '<span class="dl">' + secDot(s.key) + ' ' + esc(s.label) + '</span>' : '') + c + '</td>';      // the day's name rides in the cell for when the grid is stacked
          }
          h += '</tr>';
        }
        h += '</tbody></table></div>';
      }
      return h;
    },
    edit: (w, at) => '<label>Which' + pickerHtml(at('type'), [['', 'Every type with daily slots']].concat((X.cfg.entryTypes || []).filter(t => (t.daily || []).length).map(t => [t.name, t.name])), w.type || '') + '</label>',
  },
  tables: {
    label: 'Sheets', about: 'Each sheet, with how many rows it has and its totals.',
    title: () => 'Sheets',
    make: () => ({}),
    draw: () => {
      const tables = X.cfg.tables || [];
      return tables.length ? '<div class="attn">' + tables.map(t => { const rows = X.byTable.get(t.id) || []; return '<button type="button" data-act="view" data-v="t" data-arg="' + esc(t.id) + '"><b>' + rows.length + '</b><span>' + esc(t.name) + '</span></button>'; }).join('') + '</div>' : '';
    },
  },
  chart: {
    label: 'Chart', about: 'Count anything (rows, a sheet, money) by section, status, person, kind or a sheet’s field, and show it as bars, progress, a split, figures or one number.',
    title: w => {                                        // what it counts, by what: "Rooms by building", "Budget estimate by category"
      const what = w.what || 'rows', t = tableOf(what), m = /^sum:[^:]+:(.+)$/.exec(what), f = m && t ? t.fields.find(x => x.key === m[1]) : null;
      const name = f ? t.name + ' ' + f.label.toLowerCase() : t ? t.name : what === 'cost' ? 'Money spent' : (whatList().find(x => x[0] === what) || ['', 'Rows'])[1];
      const by = w.by ? (byList(what).find(x => x[0] === w.by) || ['', ''])[1] : '';
      return name + (by ? ' by ' + (/^[A-Z0-9]{2,}$/.test(by) ? by : by.toLowerCase()) : '');
    },
    make: () => ({ what: 'rows', by: 'section', as: 'bars' }),
    draw: (w, c, title) => {
      const T = tally(w), list = T.list;
      if (T.gone) return '<p class="muted">' + esc(T.gone + '. Choose another in Customize.') + '</p>';
      if (!T.count || list.length < (Number(w.min) || 1)) return '';
      const as = asList(w.what || 'rows', w.by || '').some(x => x[0] === w.as) ? w.as : (ROWS.includes(w.what || 'rows') && w.by ? 'progress' : w.by ? 'bars' : 'number');
      if (as === 'number') return kpis([[title, T.isMoney ? moneyShort(T.total) : num(T.total), T.isMoney ? '' : T.label.toLowerCase()]]);
      const shown = T.ranked && list.length > (Number(w.limit) || 12) ? list.slice(0, Number(w.limit) || 12) : list, more = list.length - shown.length;
      const tail = more ? '<p class="muted">And ' + more + ' more, smaller.</p>' : '';
      if (as === 'split') return split(list, T.isMoney, title);
      if (as === 'progress') return legend(W().Done, 'Under way', 'Not started') + meter([T.byLabel, '', W().Done, 'Rows'], shown.map(g => [esc(g.name), progress(g.done, g.doing, g.n, g.name), g.n ? pct(g.done, g.n) + '%' : '', String(g.n)])) + tail;
      if (as === 'table') return meter([T.byLabel, '', T.label], shown.map(g => [esc(g.name), '', esc(num(g.v, T.isMoney))])) + tail;
      const max = Math.max(...shown.map(g => g.v));
      return meter([T.byLabel, '', T.label], shown.map(g => [esc(g.name), amountBar(g.v, max, g.name + ': ' + num(g.v, T.isMoney)), esc(num(g.v, T.isMoney))])) + tail;
    },
    edit: (w, at) => {
      const what = w.what || 'rows', by = w.by || '', shows = asList(what, by);
      return '<label>Count' + pickerHtml(at('what'), whatList(), what) + '</label><label>Grouped by' + pickerHtml(at('by'), byList(what), by) + '</label>' +
        '<label>Show as' + pickerHtml(at('as'), shows, shows.some(x => x[0] === w.as) ? w.as : shows[0][0]) + '</label>' + (ranked(what, by) && !['split', 'number'].includes(w.as) ? '<label>Most shown' + pickerHtml(at('limit'), [['5', '5'], ['12', '12'], ['30', '30']], String(w.limit || 12)) + '</label>' : '');
    },
  },
  people: {
    label: 'Who carries what', about: 'The people with the most to lead, and how far along they are.',
    title: () => 'Who carries what',
    make: () => ({ n: 12 }),
    draw: (w, c) => {
      const st = c.st(true), ww = W(), busy = st.people.filter(p => p.lead || p.help).sort((a, b) => b.lead - a.lead || b.help - a.help || a.name.localeCompare(b.name)), ppl = busy.slice(0, Number(w.n) || 12), max = Math.max(1, ...ppl.map(p => p.lead));
      const nobody = st.entries - st.led;
      return (ppl.length ? meter(['Person', 'Rows they lead', 'Leads', ww.Done, 'Helps'], ppl.map(p => ['<a class="lnk" href="' + href('people') + '" data-act="person-open" data-v="' + esc(p.name) + '">' + esc(p.name) + '</a>', amountBar(p.lead, max, p.name + ' leads ' + plural(p.lead, 'row') + ', ' + p.done + ' ' + ww.done), String(p.lead || ''), p.lead ? pct(p.done, p.lead) + '%' : '', String(p.help || '')]))
        : '<p class="empty">Nobody is assigned to anything yet.</p>') + (busy.length > ppl.length ? '<p class="muted"><a class="lnk" href="' + href('people') + '" data-act="person-open" data-v="">All ' + busy.length + ' people</a></p>' : '') +
        (nobody || st.items - st.covered ? '<p class="muted num">' + [nobody ? esc(plural(nobody, ww.entry)) + ' with no ' + esc(ww.owner) : '', st.items - st.covered ? esc(plural(st.items - st.covered, ww.item)) + ' nobody covers' : ''].filter(Boolean).join('<br>') + '</p>' : '');
    },
    edit: (w, at) => '<label>How many' + pickerHtml(at('n'), [['6', '6'], ['12', '12'], ['30', '30']], String(w.n || 12)) + '</label>',
  },
  grouped: {
    label: 'Sheets by group', about: 'For each grouped sheet (rooms by building, say): its rows and totals in each group.',
    title: () => '',
    make: () => ({}),
    draw: () => {
      let h = '';
      for (const t of X.cfg.tables || []) {
        const rows = X.byTable.get(t.id) || [], g = t.fields.find(f => f.key === t.group), sums = t.fields.filter(f => f.sum);
        if (!rows.length || !g) continue;
        const groups = tableGroups(t, rows), m = Math.max(1, ...groups.map(x => x[1].length));
        if (groups.length < 2) continue;                      // one group is one number, which the table's own heading already gives
        const total = (list, f) => list.reduce((a, r) => a + (Number(r[f.key]) || 0), 0), show = (f, v) => !v ? '' : num(v, f.type === 'money');
        h += '<h3>' + esc(t.name) + ' by ' + esc(g.label.toLowerCase()) + '</h3>' + meter([g.label, pluralOf(t.one || 'row'), 'Count'].concat(sums.map(f => f.label)),
          groups.map(([name, list]) => [esc(name), amountBar(list.length, m, name + ': ' + plural(list.length, t.one || 'row')), String(list.length)].concat(sums.map(f => show(f, total(list, f)))))
            .concat([['<b>Total</b>', '', '<b>' + rows.length + '</b>'].concat(sums.map(f => { const v = show(f, total(rows, f)); return v ? '<b>' + v + '</b>' : ''; }))]));
      }
      return h;
    },
  },
  note: {
    label: 'Note', about: 'A few lines of your own: a reminder, a phone number, the plan in a sentence.',
    title: () => '',
    make: () => ({ text: '' }),
    draw: w => String(w.text || '').trim() ? '<p class="wnote">' + esc(String(w.text).trim()).replace(/\n/g, '<br>') + '</p>' : '',
    edit: (w, at) => '<label class="wide">Text<textarea' + at('text') + ' rows="3">' + esc(w.text || '') + '</textarea></label>',
  },
};
function cover(x) {                                       // a section's rows: with someone leading, with helpers only, with nobody
  const ww = W(), c3 = x.evs.length - x.c1 - x.c2;
  return '<span class="cov" role="img" aria-label="' + esc(x.c1 + ' with ' + an(ww.owner) + ', ' + x.c2 + ' with ' + ww.helpers + ' only, ' + c3 + ' with nobody') + '">' + [['c1', x.c1], ['c2', x.c2], ['c3', x.evs.length ? c3 : 1]].map(([k, v]) => v ? '<i class="' + k + '" style="flex:' + v + '"></i>' : '').join('') + '</span>';
}

/* ---------- drawing a board ---------- */
const foldedKey = 'app.folded';
const foldedSet = () => new Set(kept.list(foldedKey));      // per event, board and widget: "event:board:widget"
function board(name) {
  const list = boardOf(name), editing = CW() && S.ui.board === name, folded = foldedSet(), people = list.some(w => w.kind === 'people');
  let gaps = null, st = null;
  const c = { gaps: () => gaps || (gaps = gapList().filter(g => g.rows.length)), st: () => st || (st = planStats(c.gaps().reduce((a, g) => a + g.rows.length, 0), !people)) };      // added up once per drawing, with each person only if a widget needs them
  let h = head(BOARDS[name], { actions: (name === 'overview' ? editBtn('event', X.plan.name, isTemplate() ? 'Edit template' : 'Edit event') : '') + (CW() ? '<button type="button" class="btn' + (editing ? ' pri' : '') + '" id="board-edit-' + name + '" data-act="board-edit" data-v="' + (editing ? '' : name) + '">' + (editing ? 'Done' : 'Customize') + '</button>' : '') });
  if (name === 'overview' && S.edit === 'event') h += eventEditor();
  if (name === 'overview' && isTemplate()) h += '<p class="note">This is a template. New events start as a copy of it, and its days get their dates then.</p>';
  if (editing) h += '<p class="muted">Everyone in this event sees the same board.</p>';
  h += '<div class="board">';
  let drew = 0;
  list.forEach((w, i) => {
    const k = KINDS[w.kind], title = String(w.title || k.title(w) || ''), body = k.draw(w, c, title), key = S.plan + ':' + name + ':' + w.id, shut = !editing && !!title && folded.has(key);
    if (!editing && !body) return;
    if (body && w.kind !== 'figures') drew++;
    h += '<section class="wg w-' + (SIZES.some(s => s[0] === w.size) ? w.size : 'full') + (editing ? ' editing' : '') + '" id="wg-' + idOf(w.id) + '">' + (editing ? controls(name, w, i, list.length, title) : '') +
      (title ? '<h3 class="wh">' + (editing ? esc(title) : '<button type="button" class="wt" id="wg-' + idOf(w.id) + '-fold" data-act="wg-fold" data-k="' + esc(key) + '" aria-expanded="' + !shut + '">' + esc(title) + '</button>') + '</h3>' : '') +
      (shut ? '' : body || '<p class="muted">Nothing to show yet.</p>') + '</section>';
  });
  h += '</div>';
  if (name === 'insights' && !editing && !drew) h += '<p class="empty">Nothing to add up yet.</p>';
  if (editing) h += '<div class="tools"><span class="pick framed" style="flex:0 1 auto"><select id="wg-add-' + name + '" data-act="wg-add" data-b="' + name + '" aria-label="Add a widget"><option value="">Add a widget…</option>' +
    Object.entries(KINDS).map(([k, x]) => '<option value="' + k + '">' + esc(x.label) + ': ' + esc(x.about) + '</option>').join('') + '</select><span class="pv" aria-hidden="true">Add a widget…</span></span>' +
    (S.confirm === 'board-' + name ? '<span class="ask"><span class="bad">Go back to the usual ' + BOARDS[name] + ' for everyone?</span><button type="button" class="btn danger" data-act="board-reset" data-v="' + name + '">Reset</button><button type="button" class="btn" data-act="cancel-confirm">Cancel</button></span>'
      : '<button type="button" class="btn" data-act="board-reset" data-v="' + name + '">Reset to the usual layout</button>') + '</div>';
  return h;
}
function controls(name, w, i, n, title) {
  const k = KINDS[w.kind], base = 'wg-' + idOf(w.id) + '-', dis = CW() ? '' : ' disabled';
  const at = key => ' id="' + base + key + '" data-act="wg-set" data-b="' + name + '" data-id="' + esc(w.id) + '" data-k="' + key + '"' + dis;
  const box = (v, label, on) => '<label class="chk" for="' + base + 'f-' + v + '"><input type="checkbox" id="' + base + 'f-' + v + '" data-act="wg-fig" data-b="' + name + '" data-id="' + esc(w.id) + '" data-v="' + v + '"' + (on ? ' checked' : '') + dis + '> ' + esc(label) + '</label>';
  return '<div class="wg-ed"><span class="wk">' + esc(k.label) + '</span><div class="ed">' +
    '<label for="' + base + 'title">Title<input' + at('title') + ' value="' + esc(w.title || '') + '" placeholder="' + esc(k.title(w) || 'None') + '" maxlength="60"></label>' +
    (k.edit ? k.edit(w, at, box) : '') + '<label for="' + base + 'size">Width' + pickerHtml(at('size'), SIZES, SIZES.some(s => s[0] === w.size) ? w.size : 'full') + '</label></div>' +
    '<div class="row"><button type="button" class="btn sm" id="' + base + 'up" data-act="wg-move" data-b="' + name + '" data-id="' + esc(w.id) + '" data-v="-1"' + (i ? '' : ' disabled') + ' aria-label="' + esc('Move ' + (title || k.label) + ' up') + '">Up</button>' +
    '<button type="button" class="btn sm" id="' + base + 'down" data-act="wg-move" data-b="' + name + '" data-id="' + esc(w.id) + '" data-v="1"' + (i < n - 1 ? '' : ' disabled') + ' aria-label="' + esc('Move ' + (title || k.label) + ' down') + '">Down</button>' +
    '<button type="button" class="btn sm danger" id="' + base + 'del" data-act="wg-del" data-b="' + name + '" data-id="' + esc(w.id) + '">Take out</button></div></div>';
}
views.overview = () => board('overview');
views.insights = () => board('insights');

/* ---------- changing a board: saved in the event's setup, one History entry each ---------- */
const copyOf = name => JSON.parse(JSON.stringify(boardOf(name)));
/* The setup as this screen shows it, with the usual list standing in for a board nobody has arranged yet: a change then says it was that list,
   so two people's first changes merge widget by widget, and Undo takes back only its own. */
const shown = name => { const raw = X.cfgRaw; return Array.isArray((raw.boards || {})[name]) ? raw : Object.assign({}, raw, { boards: Object.assign({}, raw.boards || {}, { [name]: copyOf(name) }) }); };
function save(name, list, label) {
  const snap = shown(name), boards = Object.assign({}, snap.boards, { [name]: list });
  saveCfg(BOARDS[name] + ': ' + label, () => putCfg({ boards }, snap));
}
const after = fn => setTimeout(fn, 0);      // once the board has been drawn again
acts['person-open'] = d => { S.ui.person = d.v; return false; };      // a person's name on a board goes to People; this says whose sheet to show there
const widgetTitle = w => String(w.title || KINDS[w.kind].title(w) || KINDS[w.kind].label);
acts['board-edit'] = d => { S.ui.board = d.v || ''; S.confirm = null; };
acts['wg-fold'] = d => { const f = foldedSet(); if (f.has(d.k)) f.delete(d.k); else f.add(d.k); kept.set(foldedKey, JSON.stringify([...f].slice(-300))); };
changes['wg-set'] = (d, t) => {
  const list = copyOf(d.b), w = list.find(x => x.id === d.id);
  if (!w || !KINDS[w.kind]) return false;
  const v = t.tagName === 'TEXTAREA' ? t.value.replace(/\s+$/, '').slice(0, 2000) : t.value.trim().slice(0, 120);
  if (String(w[d.k] == null ? '' : w[d.k]) === v) return false;
  if (v === '' && d.k !== 'text') delete w[d.k]; else w[d.k] = ['n', 'limit'].includes(d.k) ? Number(v) || null : v;
  if (w.kind === 'chart') {                              // keep the other choices ones that make sense for what is counted now
    const what = w.what || 'rows', bys = byList(what);
    if (!bys.some(x => x[0] === (w.by || ''))) w.by = bys[1] ? bys[1][0] : '';
    const shows = asList(what, w.by || '');
    if (!shows.some(x => x[0] === w.as)) w.as = shows[0][0];
  }
  save(d.b, list, widgetTitle(w) + ' changed');
  if (t.tagName !== 'SELECT') { setTimeout(render, 350); return false; }      // a typed title or note: drawn again a moment later, so the click or Tab that ended the typing still lands
};
changes['wg-fig'] = (d, t) => {
  const list = copyOf(d.b), w = list.find(x => x.id === d.id);
  if (!w) return false;
  const on = new Set(Array.isArray(w.show) ? w.show : []);
  if (t.checked) on.add(d.v); else on.delete(d.v);
  w.show = Object.keys(FIGURES).filter(k => on.has(k));      // in the usual order, whatever order they were ticked in
  save(d.b, list, 'figures changed');
};
changes['wg-add'] = (d, t) => {
  const k = KINDS[t.value];
  if (!k) return false;
  const list = copyOf(d.b), w = Object.assign({ id: newId().slice(0, 10), kind: t.value }, k.make());
  list.push(w);
  save(d.b, list, widgetTitle(w) + ' added');
  S.jump = 'wg-' + idOf(w.id);
};
acts['wg-move'] = d => {
  const list = copyOf(d.b), i = list.findIndex(x => x.id === d.id), j = i + Number(d.v);
  if (i < 0 || j < 0 || j >= list.length) return false;
  const [w] = list.splice(i, 1); list.splice(j, 0, w);
  save(d.b, list, widgetTitle(w) + ' moved'); S.jump = 'wg-' + idOf(w.id);
  after(() => { const b = 'wg-' + idOf(w.id) + '-', n = document.getElementById(b + (d.v < 0 ? 'up' : 'down')), o = document.getElementById(b + (d.v < 0 ? 'down' : 'up')); (n && !n.disabled ? n : o || n).focus({ preventScroll: true }); });      // at the top or the bottom, the other button
};
acts['wg-del'] = d => {
  const list = copyOf(d.b), i = list.findIndex(x => x.id === d.id), w = list[i];
  if (!w) return false;
  const next = list[i + 1] || list[i - 1];
  save(d.b, list.filter(x => x !== w), widgetTitle(w) + ' taken out');
  after(() => { const n = (next && document.getElementById('wg-' + idOf(next.id) + '-title')) || document.getElementById('wg-add-' + d.b); if (n) n.focus({ preventScroll: true }); });
};
acts['board-reset'] = d => {                           // the usual list is written out, so Undo can take the reset back widget by widget
  if (S.confirm !== 'board-' + d.v) { S.confirm = 'board-' + d.v; return; }
  S.confirm = null;
  const snap = shown(d.v), boards = Object.assign({}, snap.boards, { [d.v]: JSON.parse(JSON.stringify(DEFAULT_BOARDS[d.v])) });
  saveCfg(BOARDS[d.v] + ': back to the usual layout', () => putCfg({ boards }, snap));
};
