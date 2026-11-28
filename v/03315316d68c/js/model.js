/* The data model: shared by the browser modules and the Node unit tests. No DOM, no network.

   One event ("plan") is a set of documents:
     app/settings                    name (what the app calls itself)
     plans/<plan>                    name, dates, venue, note, created, from; kind "template" (and days) when it is one to copy from
     p/<plan>/meta/config            sections, entryTypes, itemKinds, statuses, teamTypes, tables; optional words, format, viewsOff, checksOff, boards
     p/<plan>/meta/people            people [{name, note}], teams [{name, type, captains, members, note}]
     p/<plan>/meta/origin            where imported rows came from (optional, never edited)
     p/<plan>/entries/<id>           sec, seq, type, slot, title, start, end, due, location, owner, helpers, source, status, notes
     p/<plan>/items/<id>             entry | sec, seq, kind, title, qty, unit, where, owner, helpers, status, notes (rows from before Nov 26 may still carry cost; money lives in sheets)
     p/<plan>/rows/<id>              t (table id), seq, then one value per field of that table
     p/<plan>/handouts/<id>          name, seq, lines [{role, label, text}]
     p/<plan>/decisions/<id>         seq, topic, detail, refs, status, decision
     p/<plan>/log/<id>               one entry per change, for History and undo                                  */

import { canon, eq, bytes, copy } from './rules.js';
export { canon, eq, bytes };      // kept here too, where the screens and the tests first looked for them

export const NOBODY = 'No one needed';          // owner value meaning "deliberately nobody"
export const FIELD_TYPES = ['text', 'long', 'number', 'money', 'date', 'choice', 'check', 'person', 'people', 'photo'];
export const COLORS = 8;                         // section colours c0..c7 in app.css

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const utc = iso => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(utc(s).getTime()) && utc(s).toISOString().slice(0, 10) === s;      // a day that exists: 2026-02-30 is not Mar 2
export const addDays = (iso, n) => new Date(utc(iso).getTime() + n * 864e5).toISOString().slice(0, 10);
export const dayLabel = iso => { const d = utc(iso); return DOW[d.getUTCDay()].slice(0, 3) + ' ' + d.getUTCDate(); };
export const dayLong = iso => { const d = utc(iso); return DOW[d.getUTCDay()] + ', ' + MONTH[d.getUTCMonth()] + ' ' + d.getUTCDate(); };
export function dateRange(a, b) {
  if (!isDate(a)) return '';
  const x = utc(a), y = isDate(b) ? utc(b) : x, m = d => MONTH[d.getUTCMonth()].slice(0, 3);
  if (a === b || !isDate(b)) return m(x) + ' ' + x.getUTCDate() + ', ' + x.getUTCFullYear();
  if (x.getUTCFullYear() !== y.getUTCFullYear()) return m(x) + ' ' + x.getUTCDate() + ', ' + x.getUTCFullYear() + ' – ' + m(y) + ' ' + y.getUTCDate() + ', ' + y.getUTCFullYear();
  return m(x) + ' ' + x.getUTCDate() + '–' + (x.getUTCMonth() === y.getUTCMonth() ? '' : m(y) + ' ') + y.getUTCDate() + ', ' + x.getUTCFullYear();
}
export const slug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
export function uniqueKey(want, taken) { let k = want || 'x', i = 2; while (taken.includes(k)) k = want + i++; return k; }

/* ---------- blank rows ---------- */
export const blankEntry = o => Object.assign({ sec: '', seq: 0, type: '', slot: '', title: '', start: '', end: '', due: '', location: '', owner: '', helpers: [], source: '', status: '', notes: '' }, o);
export const blankItem = o => Object.assign({ entry: '', sec: '', seq: 0, kind: '', title: '', qty: null, unit: '', where: '', owner: '', helpers: [], status: '', notes: '' }, o);
export const fieldBlank = f => f.type === 'number' || f.type === 'money' ? null : f.type === 'check' ? false : f.type === 'people' ? [] : '';
export const ENTRY_FIELDS = ['sec', 'type', 'slot', 'title', 'start', 'end', 'due', 'location', 'owner', 'helpers', 'source', 'status', 'notes'];
export const ITEM_FIELDS = ['entry', 'sec', 'kind', 'title', 'qty', 'unit', 'where', 'owner', 'helpers', 'status', 'notes'];

/* ---------- what an event's setup can say, and the words it falls back on ---------- */
export const WORDS = { owner: 'DRI', helper: 'Helper', entry: 'entry', item: 'item' };      // each event can rename these in its settings
export const FORMAT = { currency: '$', clock: '12' };
export const DECIDED = 'Decided', OPEN = 'Open';      // a decision's two states
export const FINISH = 'Done/Planned';      // what a row is called when nothing is left to arrange: an event's own word is the name of its status marked as the finish
export const singularOf = w => /ies$/i.test(w) ? w.slice(0, -3) + 'y' : /(ch|sh|x|z|ss)es$/i.test(w) ? w.slice(0, -2) : w.length > 3 && /[^su]s$/i.test(w) ? w.slice(0, -1) : w;      // Kids -> Kid, Boxes -> Box, Families -> Family; Glass and Bus stay
export const pluralOf = w => /[^aeiou]y$/i.test(w) ? w.slice(0, -1) + 'ies' : /(s|x|z|ch|sh)$/i.test(w) ? w + 'es' : w + 's';
/* The Overview and Insights of an event are boards of widgets. An event that has arranged its own keeps them in config.boards (one list per board);
   one that has not shows these. Each widget is data: a kind, and the choices that kind takes (see public/js/boards.js). */
export const DEFAULT_BOARDS = {
  overview: [
    { id: 'figures', kind: 'figures', show: ['done', 'led', 'attention', 'days', 'cost'] },
    { id: 'coming', kind: 'coming', n: 5, min: 1 },
    { id: 'sections', kind: 'sections', as: 'cards' },
    { id: 'attention', kind: 'attention' },
    { id: 'slots', kind: 'slots' },
    { id: 'tables', kind: 'tables' },
  ],
  insights: [
    { id: 'figures', kind: 'figures', show: ['done', 'doing', 'led', 'attention', 'cost', 'days'] },
    { id: 'by-section', kind: 'chart', title: 'Progress by day and list', what: 'rows', by: 'section', as: 'progress' },
    { id: 'people', kind: 'people', n: 12 },
    { id: 'lists', kind: 'chart', title: 'Checklists', what: 'items', by: 'kind', as: 'progress' },
    { id: 'statuses', kind: 'chart', title: 'Statuses', what: 'rows', by: 'status', as: 'bars' },
    { id: 'paid', kind: 'chart', title: 'Spent by category', what: 'cost', by: 'group', as: 'bars', min: 2 },
    { id: 'grouped', kind: 'grouped' },
  ],
};
export const VIEWS = [['people', 'Everyone'], ['teams', 'Teams'], ['lists', 'Checklists'], ['gaps', 'Gaps'], ['decisions', 'Decisions'], ['insights', 'Insights']];      // the views an event can switch off, by the names the side list gives them

/* The one setup kept in code: what "Blank" gives. Every other starting point is a template, and a template is an event. */
export function blankConfig() {
  return { sections: [{ key: 'gen', kind: 'general', label: 'Planning', long: 'Planning', date: '', note: '', color: 0 }, { key: 'd1', kind: 'day', label: 'Day 1', long: 'Day 1', date: '', note: '', color: 1 }],
    entryTypes: [{ name: 'Activity' }, { name: 'Meal' }, { name: 'Travel' }, { name: 'Task', general: true }],
    itemKinds: [{ name: 'Do', label: 'To do', task: true }, { name: 'Buy', label: 'To buy' }, { name: 'Bring', label: 'To bring' }],
    statuses: [{ name: 'Not started' }, { name: 'In progress', tone: 'warn' }, { name: FINISH, done: true }, { name: 'Not needed', skip: true }],
    teamTypes: ['Team'], tables: [] };
}
/* Setups saved before these switches existed: the kind called Do holds standard tasks, and Menu stays off printed lists. */
export function upgradeConfig(cfg) {
  const kinds = cfg.itemKinds || [];
  if (kinds.some(k => 'task' in k) && kinds.some(k => 'quiet' in k)) return cfg;
  return Object.assign({}, cfg, { itemKinds: kinds.map(k => Object.assign({}, k, !kinds.some(x => 'task' in x) && k.name === 'Do' ? { task: true } : null, !kinds.some(x => 'quiet' in x) && k.name === 'Menu' ? { quiet: true } : null)) });
}
/* How a table opens when its settings do not say: a grouped table that holds photos (rooms in their buildings) reads best as a map. */
export const grouped = t => !!t.group && (t.fields || []).some(f => f.key === t.group);
export const layoutFor = t => !grouped(t) ? 'list' : t.layout === 'map' || t.layout === 'list' ? t.layout : (t.fields || []).some(f => f.type === 'photo') ? 'map' : 'list';

/* ---------- starting one event from another ---------- */
const plainDay = (s, k) => !s[k] || /^(Day \d+|New day( \d+)?)$/.test(s[k]) || /^(sun|mon|tue|wed|thu|fri|sat)[a-z]*[, ]/i.test(s[k]);      // a name that only says which day it is
/* Lay a setup's days onto real dates: its first `days` day sections get the dates (and new names, unless someone named them), more are added if asked for,
   and the rest are left out. `map` says where each old day went, so its rows can follow or be dropped with it. */
export function placeDays(sections, first, days) {
  const out = [], map = {}, taken = sections.filter(s => s.kind !== 'day').map(s => s.key);
  let n = 0, at = -1, color = 0;
  const day = (s, i) => { const date = isDate(first) ? addDays(first, i) : '', key = uniqueKey('d' + (i + 1), taken); taken.push(key);
    return Object.assign({}, s, { key, kind: 'day', date, label: plainDay(s, 'label') ? (date ? dayLabel(date) : 'Day ' + (i + 1)) : s.label, long: plainDay(s, 'long') ? (date ? dayLong(date) : 'Day ' + (i + 1)) : s.long }); };
  for (const s of sections) {
    if (s.kind !== 'day') { out.push(Object.assign({}, s)); if (at < 0) color = Number(s.color) || 0; continue; }
    if (n >= days) { map[s.key] = null; continue; }
    const d = day(s, n++); map[s.key] = d.key; out.push(d); at = out.length - 1; color = Number(d.color) || 0;
  }
  while (n < days) { const d = day({ note: '', color: ++color % COLORS }, n++); out.splice(++at, 0, d); }      // after the last day placed so far
  return { sections: out, map };
}
const bare = d => { const o = Object.assign({}, d); delete o.src; delete o.chg; return o; };      // without the notes on where an imported row came from
/* A new event as an import pack: {plan, docs}. `config` is the setup to start from (a template's, another event's, or none for blank);
   `docs` are the rows to bring along ([{path: 'entries/…' | 'items/…' | 'rows/…' | 'handouts/…' | 'decisions/…', data}]), each following its day. */
export function newPlan({ id, name, first, days, config, people, docs, from, kind }) {
  const cfg = config ? copy(config) : blankConfig(), placed = placeDays(cfg.sections || [], first, Math.max(kind === 'template' ? 0 : 1, days || 0));
  cfg.sections = placed.sections;
  const secOf = k => k in placed.map ? placed.map[k] : k, kept = new Set(), out = [];
  for (const d of docs || []) if (d.path.startsWith('entries/')) { const sec = secOf(d.data.sec); if (sec != null) { kept.add(d.path.slice(8)); out.push({ path: d.path, data: Object.assign(bare(d.data), { sec }) }); } }
  for (const d of docs || []) {
    if (d.path.startsWith('entries/')) continue;
    if (!d.path.startsWith('items/')) { out.push({ path: d.path, data: bare(d.data) }); continue; }
    if (d.data.entry) { if (kept.has(d.data.entry)) out.push({ path: d.path, data: bare(d.data) }); continue; }
    const sec = secOf(d.data.sec);
    if (sec != null) out.push({ path: d.path, data: Object.assign(bare(d.data), { sec }) });
  }
  const dates = cfg.sections.filter(s => s.date).map(s => s.date).sort();
  const plan = { id, name, dates: dates.length ? dateRange(dates[0], dates[dates.length - 1]) : '', venue: '', note: '', from: from || '' };
  if (kind === 'template') { plan.kind = 'template'; plan.days = cfg.sections.filter(s => s.kind === 'day').length; }
  return { plan, docs: [{ path: 'meta/config', data: cfg }, { path: 'meta/people', data: people ? copy(people) : { people: [], teams: [] } }].concat(out) };
}
/* An event turned into a template: its setup with the dates taken off, and as much of the rest as `keep` asks for.
   keep.rows: entries, items and handouts · keep.people: people, teams and who leads what · keep.tables: the rows of its tables. */
export function templatePack({ id, name, note, config, people, docs, keep }) {
  const cfg = copy(config);
  let n = 0;
  cfg.sections = (cfg.sections || []).map(s => {
    if (s.kind !== 'day') return s;
    n++;
    return Object.assign(s, { date: '', label: plainDay(s, 'label') ? 'Day ' + n : s.label, long: plainDay(s, 'long') ? 'Day ' + n : s.long });
  });
  const photos = new Map((cfg.tables || []).map(t => [t.id, t.fields.filter(f => f.type === 'photo').map(f => f.key)])), out = [], ents = new Set();
  const blankIn = new Map((cfg.tables || []).map(t => [t.id, t.fields.filter(f => f.type === 'money' || f.type === 'check' || (!keep.people && (f.type === 'person' || f.type === 'people')))]));
  const person = d => keep.people ? {} : { owner: '', helpers: [] };
  for (const d of docs) {
    const c = d.path.split('/')[0];
    if (c === 'entries' && keep.rows && d.data.title) { ents.add(d.path.slice(8)); out.push({ path: d.path, data: Object.assign(bare(d.data), { status: '', due: '' }, person()) }); }
    else if (c === 'handouts' && keep.rows) out.push({ path: d.path, data: bare(d.data) });
    else if (c === 'rows' && keep.tables) { const r = bare(d.data); for (const k of photos.get(r.t) || []) r[k] = ''; for (const f of blankIn.get(r.t) || []) r[f.key] = fieldBlank(f); out.push({ path: d.path, data: r }); }      // photos stay with the event they were added to; money, ticks and (unless people are kept) names start empty
  }
  if (keep.rows) for (const d of docs) if (d.path.startsWith('items/') && (!d.data.entry || ents.has(d.data.entry))) { const it = Object.assign(bare(d.data), { status: '' }, person()); delete it.cost; out.push({ path: d.path, data: it }); }      // an item's old cost stays with its event
  return { plan: { id, name, kind: 'template', dates: '', venue: '', note: note || '', days: n },
    docs: [{ path: 'meta/config', data: cfg }, { path: 'meta/people', data: keep.people && people ? copy(people) : { people: [], teams: [] } }].concat(out) };
}

/* ---------- a backup from the earlier Claude page -> rows here ----------
   Takes that page's data ({trip, people, events, items, questions}: its cleaned file and its JSON backup have the same shape).
   Used to bring a later backup of that page in.                                      */
export function refPath(id, known) { return id.includes('/') ? 'rows/' + id.split('/').pop() : known.entries.has(id) ? 'entries/' + id : known.items.has(id) ? 'items/' + id : id; }
export function fromClaudePage(dump) {
  const out = { entries: new Map(), items: new Map(), decisions: new Map() };
  const fix = chg => (chg || []).map(c => c.f === 'how' ? Object.assign({}, c, { f: 'source' }) : c);
  for (const e of dump.events || []) out.entries.set(e.id, { sec: e.sec, seq: e.seq, type: e.type, slot: e.slot || '', title: e.title || '', start: e.start || '', end: e.end || '', due: e.due || '', location: e.location || '',
    owner: e.owner || '', helpers: e.helpers || [], source: e.how || '', status: e.status || '', notes: e.notes || '', src: e.src || [], chg: fix(e.chg) });
  for (const i of dump.items || []) out.items.set(i.id, { entry: i.event || '', sec: i.sec || '', seq: i.seq, kind: i.kind || '', title: i.title || '', qty: i.qty == null ? null : i.qty, unit: i.unit || '', where: i.where || '',
    owner: i.owner || '', helpers: i.helpers || [], status: i.status || '', cost: i.cost == null ? null : i.cost, notes: i.notes || '', src: i.src || [], chg: fix(i.chg) });
  for (const q of dump.questions || []) out.decisions.set(q.id, { seq: q.seq, topic: q.topic, detail: 'In the plan now: ' + q.used + (q.other ? '\nOther reading: ' + q.other : ''),
    refs: (q.refs || []).map(r => refPath(r, out)), status: q.status === DECIDED ? DECIDED : OPEN, decision: q.decision || '' });
  const p = dump.people || {};
  out.people = { people: (p.names || []).map(n => ({ name: n.name, note: '' })),
    teams: (p.groups || []).map(g => ({ name: g.name, type: g.kind || '', captains: g.captains || [], members: g.members || [],
      note: [g.theme ? 'Theme: ' + g.theme : '', g.crewNames && g.crewNames.length ? 'Crew name ideas: ' + g.crewNames.join(', ') : ''].filter(Boolean).join('. ') })) };
  out.guidelines = p.guidelines || [];
  return out;
}
