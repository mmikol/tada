/* State, the index every view reads from, the write layer (one action = one History entry = one saved batch), and the render loop. */
import { Store } from './store.js';
import { kept } from './device.js';
import { isObj } from './rules.js';
import { NOBODY, WORDS, FORMAT, FINISH, VIEWS, bytes, eq, pluralOf, upgradeConfig, blankEntry, blankItem } from './model.js';
export { NOBODY, eq };

export const $ = (s, r = document) => r.querySelector(s);
/* Part of an element id that stands for one item, whatever its name holds: a box keeps its id when the items around it change. */
export const idOf = v => String(v == null ? '' : v).replace(/[^A-Za-z0-9-]/g, c => '_' + c.charCodeAt(0).toString(36) + '_');
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const store = new Store();
export const LOG_MAX = 200;
export const S = { app: '', role: 'none', locked: false, screen: 'boot', hv: 'events', harg: '', plan: null, ready: false, view: 'overview', arg: '', open: new Set(), edit: null, confirm: null, q: '', flash: null, jump: null,
  ui: {}, undoStack: [], redoStack: [], undid: new Set(), pruned: new Set(), me: '', savedAt: 0, lastErr: false, stale: false };
export let X = null;                                   // the index, rebuilt on every render
export const views = {}, acts = {}, changes = {}, submits = {};
export const CW = () => S.role === 'edit' && !!S.plan && S.ready;
export const P = () => 'p/' + S.plan + '/';
const main = $('#view');

/* ---------- formatting ---------- */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = () => (X && X.fmt) || FORMAT;            // the open event's formats: its currency sign and its clock
const hm = (h, m) => fmt().clock === '24' ? String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') : (h % 12 || 12) + ':' + String(m).padStart(2, '0') + (h >= 12 ? ' PM' : ' AM');
export const fmtTime = t => { if (!t) return ''; const p = String(t).split(':'); return hm(+p[0], +p[1] || 0); };
export const fmtSpan = (a, b) => { const nb = t => fmtTime(t).replace(' ', ' '); return a ? nb(a) + (b ? '–' + nb(b) : '') : b ? 'until ' + nb(b) : ''; };      // a time never breaks inside itself; a span may break after its dash
export const fmtDate = d => { if (!d) return ''; const p = String(d).split('-'); return p.length === 3 ? MON[+p[1] - 1] + ' ' + (+p[2]) : String(d); };
export const money = n => fmt().currency + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const moneyShort = n => fmt().currency + Math.round(Number(n || 0)).toLocaleString('en-US');
export const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
export const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || pluralOf(one)));
export const an = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
export const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
export const qtyText = it => [it.qty != null && it.qty !== '' ? it.qty : '', it.unit || ''].filter(x => x !== '').join(' ');
export const clock = ms => { const d = new Date(ms); return hm(d.getHours(), d.getMinutes()); };
export const stamp = ms => { const d = new Date(ms), n = new Date(); return (d.toDateString() === n.toDateString() ? '' : MON[d.getMonth()] + ' ' + d.getDate() + ', ') + clock(ms); };
export const lettersOnly = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');      // letters of any alphabet

/* ---------- the index ---------- */
const cap1 = w => w.charAt(0).toUpperCase() + w.slice(1);
function wordsOf(cfg) {                                // what this event calls things, in the forms the screens need
  const w = {};
  for (const k of Object.keys(WORDS)) w[k] = String((cfg && cfg.words && cfg.words[k]) || '').replace(/[<>]/g, '').trim().slice(0, 24) || WORDS[k];
  const fin = String((((cfg && cfg.statuses) || []).find(s => s.done) || {}).name || '').trim() || FINISH;      // the finish line is whatever this event named it
  return { Done: fin, done: /[a-z]/.test(fin) ? fin.toLowerCase() : fin, owner: w.owner, helper: w.helper, helpers: pluralOf(w.helper).toLowerCase(), Helpers: cap1(pluralOf(w.helper)), Helper: cap1(w.helper), entry: w.entry, entries: pluralOf(w.entry), Entry: cap1(w.entry), Entries: cap1(pluralOf(w.entry)),
    item: w.item, items: pluralOf(w.item), Item: cap1(w.item), Items: cap1(pluralOf(w.item)) };
}
/* One event's documents, indexed. `docs` is any map of path -> document that holds the list of events and that event's own documents. */
export function makeIndex(docs, plan) {
  const ix = { id: plan, plans: [], events: [], templates: [], plan: null, cfg: null, people: { people: [], teams: [] }, origin: null, entries: new Map(), items: new Map(), rows: new Map(), handouts: new Map(), decisions: new Map(), log: [],
    secs: [], bySec: {}, kids: new Map(), loose: {}, byTable: new Map(), names: [], teams: [], team: new Map(), memberOf: new Map(), type: new Map(), status: new Map(), kind: new Map(), w: wordsOf(null), fmt: FORMAT, off: new Set() };
  const pre = plan ? 'p/' + plan + '/' : null;
  for (const [path, d] of docs) {
    if (path.startsWith('plans/')) { const id = path.slice(6), r = Object.assign({ id }, d); ix.plans.push(r); if (id === plan) ix.plan = r; continue; }
    if (!pre || !path.startsWith(pre)) continue;
    const i = path.indexOf('/', pre.length), c = path.slice(pre.length, i), id = path.slice(i + 1);
    if (c === 'meta') { if (id === 'config') { ix.cfg = upgradeConfig(d); ix.cfgRaw = d; } else if (id === 'people') ix.people = d; else if (id === 'origin') ix.origin = d; }      // cfgRaw: as stored, which a change to it says it was
    else if (c === 'log') ix.log.push(Object.assign({ id }, d));
    else if (ix[c] instanceof Map) ix[c].set(id, Object.assign({ id }, d));
  }
  ix.plans.sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')) || String(a.name || '').localeCompare(String(b.name || '')));
  ix.events = ix.plans.filter(p => p.kind !== 'template'); ix.templates = ix.plans.filter(p => p.kind === 'template').sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  ix.log.sort((a, b) => b.ms - a.ms);
  if (!ix.cfg) return ix;
  const cfg = ix.cfg, seq = (a, b) => (a.seq || 0) - (b.seq || 0);
  ix.w = wordsOf(cfg); ix.fmt = Object.assign({}, FORMAT, cfg.format); ix.fmt.currency = String(ix.fmt.currency || '').replace(/[<>&"']/g, '').slice(0, 4);      // a sign, never markup: it is written into the page as it stands
  ix.off = new Set((cfg.viewsOff || []).concat((cfg.checksOff || []).map(k => 'check:' + k)));
  ix.secs = cfg.sections || [];
  for (const s of ix.secs) { ix.bySec[s.key] = []; ix.loose[s.key] = []; }
  for (const t of cfg.entryTypes || []) ix.type.set(t.name, t);
  for (const t of cfg.statuses || []) ix.status.set(t.name, t);
  for (const t of cfg.itemKinds || []) ix.kind.set(t.name, t);
  for (const t of cfg.tables || []) ix.byTable.set(t.id, []);
  const first = (ix.secs.find(s => s.kind !== 'day') || ix.secs[0] || { key: '' }).key;
  for (const e of [...ix.entries.values()].sort(seq)) { (ix.bySec[e.sec] || ix.bySec[first] || (ix.bySec[e.sec] = [])).push(e); ix.kids.set(e.id, []); }      // an entry whose section is gone shows in the first, as loose items do
  for (const s of ix.secs) {
    if (s.kind !== 'day') continue;                    // inside a day, a row with no time stays after the row above it
    let t = '';
    const keyed = ix.bySec[s.key].map((e, i) => { if (e.start) t = e.start; return [t || '00:00', i, e]; });
    keyed.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]);
    ix.bySec[s.key] = keyed.map(x => x[2]);
  }
  for (const it of [...ix.items.values()].sort(seq)) {
    const kids = ix.kids.get(it.entry);
    if (kids) kids.push(it); else { const k = ix.loose[it.sec] ? it.sec : first; (ix.loose[k] || (ix.loose[k] = [])).push(it); }
  }
  for (const r of [...ix.rows.values()].sort(seq)) { const l = ix.byTable.get(r.t); if (l) l.push(r); }
  ix.names = (ix.people.people || []).map(p => p.name);
  ix.teams = ix.people.teams || [];
  for (const g of ix.teams) { ix.team.set(g.name, g); for (const m of g.members || []) { if (!ix.memberOf.has(m)) ix.memberOf.set(m, []); ix.memberOf.get(m).push(g.name); } }
  return ix;
}
export function buildIndex() { X = makeIndex(store.docs, S.plan); return X; }
/* Run fn with another event's index standing in for the open one: every helper below then reads that event. For the views that add events up. */
export function using(ix, fn) { const keep = X; X = ix; try { return fn(); } finally { X = keep; } }
export const W = () => X.w;
export const isTemplate = () => !!(X.plan && X.plan.kind === 'template');
export const daySecs = () => X.secs.filter(s => s.kind === 'day');
export const secOf = k => X.secs.find(s => s.key === k) || null;
export const secLabel = k => { const s = secOf(k); return s ? s.label : k; };
export const secDot = k => { const s = secOf(k); return '<span class="dot c' + (s ? Number(s.color) || 0 : 0) + '"></span>'; };
export const typeDef = name => X.type.get(name) || {};
export const named = r => (r.title || '') !== '';
export const live = r => !(X.status.get(r.status) || {}).skip;
export const isDone = r => !!(X.status.get(r.status) || {}).done;
/* Where a status sits in the event's workflow: finished, left out of counts, under way, or not started. Each status says so in Settings ("Counts as");
   one saved before that choice existed counts as under way when it has a colour, as it always did. */
export const stageOf = s => !s ? '' : s.done ? 'done' : s.skip ? 'skip' : (typeof s.doing === 'boolean' ? s.doing : !!s.tone) ? 'doing' : 'todo';
export const isDoing = r => stageOf(X.status.get(r.status)) === 'doing';
export const real = r => named(r) && live(r);
export const skipName = () => ((X.cfg.statuses || []).find(s => s.skip) || {}).name || '';
export const entryOf = it => X.entries.get(it.entry) || null;
export const secOfItem = it => { const e = entryOf(it); return e ? e.sec : (X.loose[it.sec] ? it.sec : (X.secs.find(s => s.kind !== 'day') || X.secs[0] || { key: '' }).key); };
export const allEntries = () => X.secs.flatMap(s => X.bySec[s.key] || []);
export const allItems = () => X.secs.flatMap(s => (X.bySec[s.key] || []).flatMap(e => X.kids.get(e.id)).concat(X.loose[s.key] || []));
export const sortedNames = () => [...X.names].sort((a, b) => a.localeCompare(b));
export const tableDef = id => (X.cfg.tables || []).find(t => t.id === id) || null;
export const rowTitle = (t, r) => { const f = t.fields.filter(x => x.title); return (f.length ? f : t.fields.slice(0, 1)).map(x => r[x.key]).filter(v => v != null && v !== '').join(' ') || '(no name)'; };
/* The captains of any team among a row's helpers. */
export function capsOf(r) { const out = []; for (const h of r.helpers || []) { const g = X.team.get(h); if (g) for (const c of g.captains || []) if (!out.includes(c)) out.push(c); } return out; }
/* A row's DRIs. One is kept as plain text and several as a list, so a row with one reads the same to every copy of the app; "No one needed" says nobody, on purpose. */
export const ownersOf = r => { const o = r && r.owner; return (Array.isArray(o) ? o : o ? [o] : []).filter(n => typeof n === 'string' && n && n !== NOBODY); };
export const ownerValue = list => { const l = [...new Set(list.filter(n => typeof n === 'string' && n && n !== NOBODY))]; return l.length > 1 ? l : l[0] || ''; };
export const ownerText = r => Array.isArray(r.owner) ? ownersOf(r).join(' + ') : (r.owner || '');
/* Who leads a row. A named DRI wins; with none, the captains of any team among the helpers lead it; an item with neither follows its entry. */
export function lead(r, parent) {
  const own = ownersOf(r);
  if (own.length) return { how: 'own', who: own };
  if (r.owner === NOBODY) return { how: 'nobody', who: [] };
  const caps = capsOf(r);
  if (caps.length) return { how: 'cap', who: caps };
  if (r.helpers && r.helpers.length) return { how: 'help', who: [] };
  if (parent) { const p = lead(parent); if (p.how === 'own' || p.how === 'cap' || p.how === 'nobody') return { how: 'via', who: p.who, nobody: p.how === 'nobody' }; }
  return { how: 'none', who: [] };
}
export const led = l => l.how === 'own' || l.how === 'cap' || l.how === 'nobody';
/* Whether a row is this person's: they lead it (named, as a team's captain, or through the entry an item belongs to), or help on it by name or through a team. */
export function isMine(r, name, parent) {
  if (!name) return true;
  if (lead(r, parent).who.includes(name)) return true;
  const hs = r.helpers || [], mine = X.memberOf.get(name) || [];
  return hs.includes(name) || hs.some(g => mine.includes(g));
}

/* ---------- small renderers ---------- */
export function options(list, cur, blank) {
  let h = blank == null ? '' : '<option value="">' + esc(blank) + '</option>';
  for (const v of list) h += '<option' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>';
  if (cur && !list.includes(cur)) h += '<option selected>' + esc(cur) + '</option>';
  return h;
}
/* A picker is a real drop-down with its current value written over it as ordinary text, so a long name wraps onto a second line instead of being cut. */
export const pick = (select, shown, cls, name) => '<span class="pick' + (cls ? ' ' + cls : '') + '">' + (name ? '<span class="pn" aria-hidden="true">' + esc(name) + '</span>' : '') + select + '<span class="pv" aria-hidden="true">' + esc(shown) + '</span></span>';
export function sel(ctx, c, id, f, list, cur, blank, label, extra, name) {      // name: written before the value, for a row that has several pickers
  if (name && (!blank || blank === name)) blank = 'Not set';      // never "Recipe Recipe"
  return pick('<select id="' + esc(ctx + '-' + id + '-' + f) + '" class="s" data-c="' + esc(c) + '" data-id="' + esc(id) + '" data-f="' + esc(f) + '" data-v="' + esc(cur || '') + '" aria-label="' + esc(label) + '"' +
    (extra || '') + (CW() ? '' : ' disabled') + '>' + options(list, cur || '', blank) + '</select>', cur || blank || '', '', name);
}
/* A one-line text box that grows downward when its text is longer than the line. Text that already holds line breaks keeps them: its box is an ordinary one. */
export const line = (attrs, v) => '<textarea rows="1"' + (/[\r\n]/.test(String(v == null ? '' : v)) ? '' : ' class="line"') + attrs + '>' + esc(v == null ? '' : v) + '</textarea>';
export const tone = name => { const s = X.status.get(name); return !s ? '' : s.done ? 'done' : s.skip ? 'skip' : s.tone || ''; };
export const ownerSel = (ctx, c, r, parent) => {
  const l = lead(r, parent), via = l.how === 'cap' || l.how === 'via';
  const blank = l.how === 'cap' ? '↳ ' + l.who.join(' + ') : l.how === 'via' ? '↳ ' + (l.nobody ? NOBODY : l.who.join(' + ')) : 'No ' + W().owner;
  const own = ownersOf(r), list = sortedNames().concat([NOBODY]), label = W().owner + ' for ' + (r.title || r.slot || 'this row'), soft = (via ? ' data-via="1"' : '') + (c === 'items' ? ' data-soft="1"' : '');
  if (own.length < 2) return sel(ctx, c, r.id, 'owner', list, own[0] || (r.owner === NOBODY ? NOBODY : ''), blank, label, soft);
  /* Several: the picker shows them all, and choosing one name makes that person the only one (the row's details add or take away each). */
  const both = own.join(' + ');
  return pick('<select id="' + esc(ctx + '-' + r.id + '-owner') + '" class="s" data-act="owner-one" data-c="' + esc(c) + '" data-id="' + esc(r.id) + '" data-v="' + esc(both) + '" aria-label="' + esc(label) + '"' + soft + (CW() ? '' : ' disabled') + '>' +
    '<option value="@all" selected>' + esc(both) + '</option>' + options(list, '', 'No ' + W().owner) + '</select>', both);
};
changes['owner-one'] = (d, t) => { if (t.value !== '@all') write(d.c, d.id, { owner: t.value }); };
export const statusSel = (ctx, c, r) => sel(ctx, c, r.id, 'status', (X.cfg.statuses || []).filter(s => c === 'items' || !s.items).map(s => s.name), r.status, 'No status', 'Status of ' + (r.title || r.slot || 'this row'), ' data-tone="' + esc(tone(r.status)) + '"');
/* An item's list: what its kind is called on the Lists page ("To buy"). An item on no list waits under Unlisted until someone puts it on one. */
export const UNLISTED = 'Unlisted';
export const listName = k => !k ? UNLISTED : (X.kind.get(k) || {}).label || k;
export const kindSel = (ctx, r) => {
  const names = (X.cfg.itemKinds || []).map(k => k.name), cur = r.kind || '';
  const opt = (v, l, on) => '<option value="' + esc(v) + '"' + (on ? ' selected' : '') + '>' + esc(l) + '</option>';
  return pick('<select id="' + esc(ctx + '-' + r.id + '-kind') + '" class="s" data-c="items" data-id="' + esc(r.id) + '" data-f="kind" data-v="' + esc(cur) + '" aria-label="' + esc('Checklist for ' + W().item + ': ' + r.title) + '"' + (CW() ? '' : ' disabled') + '>' +
    opt('', UNLISTED, !cur) + names.map(n => opt(n, listName(n), n === cur)).join('') + (cur && !names.includes(cur) ? opt(cur, cur, true) : '') + '</select>', listName(cur));
};
export const helpersText = r => (r.helpers && r.helpers.length) ? r.helpers.join(', ') : '';
export function ctxOf(c, r) {
  if (c === 'entries') return [secLabel(r.sec), r.start && fmtTime(r.start), r.slot].filter(Boolean).join(', ');
  if (c === 'rows') { const t = tableDef(r.t); return t ? t.name : ''; }
  const e = entryOf(r);
  return [secLabel(secOfItem(r)), e && (e.title || e.slot)].filter(Boolean).join(', ');
}
export const rowName = (c, r) => c === 'decisions' ? (r.topic || '') : c === 'handouts' ? (r.name || '') : c === 'plan' ? 'Event details' : c === 'meta' ? (r.sections ? 'Settings' : 'People and teams')
  : c === 'rows' ? (tableDef(r.t) ? rowTitle(tableDef(r.t), r) : '(row)') : (r.title || r.slot || '(no name)');
export const go = (c, r, label) => '<button type="button" class="lnk" data-act="go" data-c="' + c + '" data-id="' + esc(r.id) + '">' + esc(label || (c === 'entries' && !r.title && r.slot ? r.slot + ' (nothing yet)' : rowName(c, r))) + '</button>';
export function refRow(c, r, ctl, extra) {
  return '<div class="rr"><div class="who">' + go(c, r) + '<span class="ctx">' + esc(ctxOf(c, r)) + (extra ? tag(extra) : '') + '</span></div><div class="ctl">' + (ctl || '') + '</div></div>';
}
export function ownersEdit(ctx, c, r) {                 // a row's DRIs, one or several, each taken off on its own
  const have = ownersOf(r), pool = sortedNames().filter(n => !have.includes(n)), w = W().owner, many = pluralOf(w);
  let h = '<div class="wide"><label for="' + esc(ctx + '-' + r.id + '-addo') + '">' + esc(/^[A-Z0-9]{2,}$/.test(w) ? many : many.charAt(0).toUpperCase() + many.slice(1)) + '</label><div class="hps">';
  for (const n of have) h += '<span class="hp">' + esc(n) + (CW() ? '<button type="button" data-act="rm-owner" data-c="' + c + '" data-id="' + esc(r.id) + '" data-v="' + esc(n) + '" aria-label="Remove ' + esc(n) + ' as ' + esc(w) + '">×</button>' : '') + '</span>';
  if (CW()) h += '<select id="' + esc(ctx + '-' + r.id + '-addo') + '" data-act="add-owner" data-c="' + c + '" data-id="' + esc(r.id) + '" style="width:auto"><option value="">' + esc(have.length ? 'Add another ' + w : 'Add ' + an(w)) + '</option>' + options(pool, '', null) + '</select>';
  return h + '</div></div>';
}
export function helpersEdit(ctx, c, r) {
  const have = r.helpers || [];
  const pool = sortedNames().concat(X.teams.map(g => g.name)).filter(n => !have.includes(n));
  let h = '<div class="wide"><label for="' + esc(ctx + '-' + r.id + '-addh') + '">' + esc(W().Helpers) + '</label><div class="hps">';
  for (const n of have) h += '<span class="hp">' + esc(n) + (CW() ? '<button type="button" data-act="rm-helper" data-c="' + c + '" data-id="' + esc(r.id) + '" data-v="' + esc(n) + '" aria-label="Remove ' + esc(n) + '">×</button>' : '') + '</span>';
  if (CW()) h += '<select id="' + esc(ctx + '-' + r.id + '-addh') + '" data-act="add-helper" data-c="' + c + '" data-id="' + esc(r.id) + '" style="width:auto"><option value="">Add a person or team</option>' + options(pool, '', null) + '</select>';
  return h + '</div></div>';
}
export function fld(ctx, c, r, f, label, type, cls, attrs) {
  const id = esc(ctx + '-' + r.id + '-' + f), v = r[f] == null ? '' : r[f], dis = CW() ? '' : ' disabled';
  const common = ' id="' + id + '" data-c="' + c + '" data-id="' + esc(r.id) + '" data-f="' + esc(f) + '"' + (attrs || '') + dis;
  const inner = type === 'textarea' ? '<textarea' + common + '>' + esc(v) + '</textarea>' : type === 'text' ? line(common, v) : '<input type="' + type + '" value="' + esc(v) + '"' + common + '>';
  return '<label class="' + (cls || '') + '" for="' + id + '">' + esc(label) + inner + '</label>';
}
export function selFld(ctx, c, r, f, label, list, blank) {
  const id = esc(ctx + '-' + r.id + '-' + f);
  return '<label for="' + id + '">' + esc(label) + '<select id="' + id + '" data-c="' + c + '" data-id="' + esc(r.id) + '" data-f="' + esc(f) + '"' + (CW() ? '' : ' disabled') + '>' + options(list, r[f] || '', blank) + '</select></label>';
}
/* A box that opens in place; one open at a time per view. */
export function fold(key, n, title, bodyFn, always) {      // always: it opens even when its count is nothing (a list in Settings)
  const open = S.ui.fold === key;
  return '<section class="box' + (n || always ? '' : ' zero') + '" id="fold-' + esc(key) + '"><button type="button" class="fh" data-act="fold" data-k="' + esc(key) + '" aria-expanded="' + open + '"><b>' + esc(n) + '</b><span>' + esc(title) + '</span><small>' + (open ? 'Hide' : n || always ? 'Show' : '') + '</small></button>' + (open ? '<div class="fb">' + bodyFn() + '</div>' : '') + '</section>';
}
/* Figures and bars for the views that add things up. Every bar sits beside its numbers, so nothing is read from colour or from hovering alone. */
export const kpis = list => '<div class="kpis">' + list.filter(Boolean).map(([label, value, sub]) => '<div class="kpi"><span class="kl">' + esc(label) + '</span><b>' + esc(value) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>').join('') + '</div>';
/* Progress: done, under way, and the rest, as one thin bar. The same two steps of one colour everywhere, so darker always means further along. */
export function progress(done, doing, total, what, word) {
  const rest = Math.max(0, total - done - doing), part = (cls, n) => n ? '<i class="' + cls + '" style="flex:' + n + '"></i>' : '';
  const say = (what ? what + ': ' : '') + (total ? done + ' ' + (word || W().done) + ', ' + doing + ' under way, ' + rest + ' not started' : 'Nothing yet');
  return '<span class="pb" role="img" aria-label="' + esc(say) + '" data-tip="' + esc(say) + '">' + (total ? part('p2', done) + part('p1', doing) + part('p0', rest) : '<i class="p0" style="flex:1"></i>') + '</span>';
}
export const legend = (a, b, c) => '<p class="legend"><span><i class="p2"></i>' + esc(a) + '</span><span><i class="p1"></i>' + esc(b) + '</span><span><i class="p0"></i>' + esc(c) + '</span></p>';
/* How much, against the largest in the same list. */
export const amountBar = (n, max, say) => !n ? '' : '<span class="mb" role="img" aria-label="' + esc(say) + '" data-tip="' + esc(say) + '"><i style="width:' + (max > 0 ? Math.max(n > 0 ? 1.5 : 0, 100 * n / max) : 0) + '%"></i></span>';
/* Each cell carries its column's name: in a narrow space the table becomes a stack of rows and every figure keeps its label. */
export const meter = (head, rows, cls) => '<div class="scroll"><table class="meter' + (cls ? ' ' + cls : '') + '"><thead><tr>' + head.map((h, i) => '<th' + (i > 1 ? ' class="r"' : '') + '>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
  rows.map(r => '<tr>' + r.map((c, i) => '<td' + (i === 1 ? ' class="viz"' : i > 1 ? ' class="r"' : '') + (i > 1 && c !== '' ? ' data-th="' + esc(head[i]) + '"' : '') + '>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';

export const printOpts = () => S.ui.print || (S.ui.print = { secs: null, dri: true, help: true, loc: true, notes: false, items: false, kinds: null, by: 'entry', done: false });
/* A ⋯ button that opens a short menu of the actions a page uses now and then (print, download), so the page itself stays simple. */
export const moreMenu = items => '<details class="mm"><summary class="btn" aria-label="More actions" title="More actions">⋯</summary><div class="mm-pop">' + items + '</div></details>';
document.addEventListener('click', e => { for (const d of document.querySelectorAll('details.mm[open]')) if (!d.contains(e.target) || e.target.closest('.mm-pop')) d.open = false; });
/* One way to add, change and delete, on every page (owner, Nov 26: "THE CRUD operations for everything is unclear"):
   the page's title with ＋ New … on its right, which opens a short form under the title; Edit on every row, which opens the row's form;
   and at the foot of every form, Delete on the left and Done on the right. Changes save as they are typed. */
export const head = (title, o = {}) => '<header class="vh">' + (o.dot || '') + '<h2' + (o.small ? ' class="h2s"' : '') + '>' + title + '</h2>' + (o.note ? '<span class="vh-n">' + o.note + '</span>' : '') +
  (o.actions ? '<span class="vh-a">' + o.actions + '</span>' : '') + '</header>';
export const newBtn = (key, label) => !CW() ? '' : '<button type="button" class="btn pri new" data-act="new" data-k="' + esc(key) + '" aria-expanded="' + (S.ui.new === key) + '">' + esc(label) + '</button>';
export const newForm = (key, act, inner, attrs, label) => !CW() || S.ui.new !== key ? '' : '<form class="nf" data-act="' + act + '"' + (attrs || '') + '>' + inner +
  '<span class="nf-b"><button type="button" class="btn" data-act="new" data-k="' + esc(key) + '">Cancel</button><button class="btn pri" type="submit">' + esc(label || 'Add') + '</button></span></form>';
acts.new = d => { S.ui.new = S.ui.new === d.k ? null : d.k; S.confirm = null; if (S.ui.new) { render(); const f = document.querySelector('form.nf input:not([type=hidden]),form.nf textarea'); if (f) f.focus(); return false; } };
export const editBtn = (k, name, label) => !CW() ? '' : '<button type="button" class="eb' + (label ? ' btn' : '') + '" data-act="edit" data-k="' + esc(k) + '" aria-expanded="' + (S.edit === k) + '" aria-label="' + esc((S.edit === k ? 'Done with ' : 'Edit ') + name) + '">' + (S.edit === k ? 'Done' : label || 'Edit') + '</button>';      // label: on a page's title row, what is edited (Edit day, Edit table)
/* The foot of a form. del: the Delete button, or the question it asks first. */
export const formEnd = (k, del) => '<div class="wide fe">' + (del || '') + '<button type="button" class="btn pri" data-act="edit" data-k="' + esc(k) + '">Done</button></div>';
export const delBtn = (attrs, label) => !CW() ? '' : '<button type="button" class="btn danger"' + attrs + '>' + esc(label) + '</button>';
export const askDel = (question, yesAttrs) => '<span class="ask"><span class="bad">' + esc(question) + '</span><button type="button" class="btn danger"' + yesAttrs + '>Delete</button><button type="button" class="btn" data-act="cancel-confirm">Cancel</button></span>';
/* Money lives in tables, never on items (owner, Nov 26: Budget is the one place for money). A money field counts as spent or as planned;
   until a table's settings say, its name decides: Paid, Actual and Spent are spent; Estimate, Budget and Planned are planned. */
export const moneyRole = f => !f || f.type !== 'money' ? '' : f.counts != null ? f.counts : /\b(paid|actual|spent)\b/i.test(f.label || f.key || '') ? 'spent' : /\b(est(imated?)?|budget(ed)?|plan(ned)?)\b/i.test(f.label || f.key || '') ? 'planned' : '';
/* What some rows of one sheet hold in money: spent and planned, by what each money field counts as. */
export function moneyOf(t, rows) {
  const m = { spent: 0, planned: 0 };
  for (const f of t.fields) { const role = moneyRole(f); if (role) for (const r of rows) m[role] += Number(r[f.key]) || 0; }
  return m;
}
export const spentOf = (t, r) => moneyOf(t, [r]).spent;
export function moneyTotals() {
  const m = { spent: 0, planned: 0 };
  for (const t of X.cfg.tables || []) { const s = moneyOf(t, X.byTable.get(t.id) || []); m.spent += s.spent; m.planned += s.planned; }
  return m;
}
export const count = n => '<span class="n">' + n + '</span>';      // a count beside a name
export const tag = (html, bad) => '<span class="tag' + (bad ? ' none' : '') + '">' + html + '</span>';      // who leads a row, in a pill; red when nobody
/* Forms show what a row needs most; the rest waits behind More details (owner, Nov 25: "the forms need to be normalized and simplified, there are LOTs of fields").
   Opening it opens it on every form until it is closed again. */
export const moreFields = inner => !inner ? '' : (S.ui.mf ? inner : '') + '<div class="wide"><button type="button" class="lnk mf-t" data-act="mf" aria-expanded="' + !!S.ui.mf + '">' + (S.ui.mf ? 'Fewer details' : 'More details') + '</button></div>';
acts.mf = () => { S.ui.mf = !S.ui.mf; };
changes.amount = (d, t) => { write(d.c, d.id, amountPatch(t.value)); };
/* Amount: quantity and unit typed as one, "50 each", "2 bags", "per kid"; kept as the number and the words after it. */
export const amountPatch = v => { const m = String(v || '').match(/^\s*(\d+(?:[.,]\d+)?)\s*(.*)$/); return m ? { qty: Number(m[1].replace(/,(\d{3})$/, '$1').replace(',', '.')), unit: m[2].trim() } : { qty: null, unit: String(v || '').trim() }; };
/* A switch between a few choices. With many, a narrow column shows it as one drop-down instead of rows of buttons. */
export const seg = (act, list, cur) => '<div class="seg' + (list.length > 4 ? ' many' : '') + '">' + list.map(([v, label, n]) => '<button type="button" data-act="' + act + '" data-v="' + esc(v) + '" aria-pressed="' + (cur === v) + '">' + esc(label) + (n != null ? count(esc(String(n))) : '') + '</button>').join('') + '</div>' +
  (list.length > 4 ? '<select class="segsel" data-act="seg-pick" data-a="' + act + '" aria-label="Show">' + list.map(([v, label, n]) => '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(label + (n != null ? ' (' + n + ')' : '')) + '</option>').join('') + '</select>' : '');
changes['seg-pick'] = (d, t) => { const fn = acts[d.a]; return fn ? fn({ v: t.value }, t) : false; };

/* ---------- writing: one action = one History entry = one batch saved together ---------- */
const FIELD = { status: 'Status', kind: 'Kind', title: 'Name', start: 'Start', end: 'End', due: 'Due', qty: 'Quantity', unit: 'Unit', where: 'Where / how', cost: 'Cost', notes: 'Notes', location: 'Location',
  slot: 'Slot', type: 'Type', source: 'Source', sec: 'Section', entry: 'Belongs to', decision: 'Decision', topic: 'Topic', detail: 'Detail', name: 'Name', venue: 'Venue', dates: 'Dates', note: 'Note', lines: 'Lines', people: 'People', teams: 'Teams',
  sections: 'Sections', entryTypes: 'Types', itemKinds: 'Kinds', statuses: 'Statuses', teamTypes: 'Team types', tables: 'Sheets', words: 'Wording', format: 'Formats', viewsOff: 'Views', checksOff: 'Checks', boards: 'Overview and Insights' };
export const fieldLabel = (c, r, k) => { if (c === 'rows') { const t = tableDef(r.t), f = t && t.fields.find(x => x.key === k); if (f) return f.label; } return k === 'owner' ? W().owner : k === 'helpers' ? W().Helpers : FIELD[k] || k; };
const short = v => { if (v == null || v === '') return '—'; if (v === true) return 'Yes'; if (v === false) return 'No'; if (Array.isArray(v)) return v.every(x => typeof x === 'string') ? (v.join(', ') || '—') : plural(v.length, 'line'); const t = String(v); return t.length > 90 ? t.slice(0, 89) + '…' : t; };
export const showVal = (k, v) => k === 'start' || k === 'end' ? (fmtTime(v) || '—') : k === 'due' ? (fmtDate(v) || '—') : k === 'cost' && v != null && v !== '' ? money(v) : k === 'sec' ? secLabel(v) : k === 'entry' ? ((X.entries.get(v) || {}).title || '—') : short(v);
export const pathOf = (c, id) => c === 'plan' ? 'plans/' + S.plan : c === 'meta' ? P() + 'meta/' + id : P() + c + '/' + id;
export const curOf = (c, id) => { const d = store.docs.get(pathOf(c, id)); return d ? Object.assign({ id }, d) : null; };
function describe(c, cur, p) {
  const ks = Object.keys(p), k = ks.includes('entry') ? 'entry' : ks[0];
  if (k === 'helpers') { const b = cur.helpers || [], a = p.helpers || [], add = a.filter(x => !b.includes(x)), rm = b.filter(x => !a.includes(x)); return W().Helpers + ': ' + [add.length ? 'added ' + add.join(', ') : '', rm.length ? 'removed ' + rm.join(', ') : ''].filter(Boolean).join(', '); }
  if (['notes', 'title', 'decision', 'detail', 'lines', 'topic'].includes(k) || c === 'meta') return fieldLabel(c, cur, k) + ' edited';
  if (k === 'entry') { const e = X.entries.get(p.entry); return 'Moved to ' + (e ? (e.title || e.slot) : secLabel(p.sec || cur.sec)); }
  if (k === 'sec') return 'Moved to ' + secLabel(p.sec);
  return fieldLabel(c, cur, k) + ': ' + showVal(k, cur[k]) + ' → ' + showVal(k, p[k]);
}
let TX = null;
export function action(label, fn, o) {
  o = o || {};
  const tx = { label, ch: [], batch: store.batch(), row: o.row || '', rc: o.rc || '', rid: o.rid || '', say: '', btn: '', id: '' };
  const outer = TX;
  TX = tx; try { fn(); } finally { TX = outer; }
  if (!tx.ch.length) return null;
  const id = tx.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const big = bytes(JSON.stringify(tx.ch)) > 200000;      // documents are held to 256 KB: past that, the change still saves, and History names it without the details Undo needs
  tx.batch.set(P() + 'log/' + id, { ms: Date.now(), by: S.me || '', label, row: tx.row, rc: tx.rc, rid: tx.rid, ch: big ? [] : tx.ch, big, undone: false, undoOf: o.undoOf || '' });
  if (o.undoOf && store.docs.has(P() + 'log/' + o.undoOf)) tx.batch.update(P() + 'log/' + o.undoOf, { undone: true });
  for (const x of X.log.slice(LOG_MAX - 1)) if (!S.pruned.has(x.id)) { S.pruned.add(x.id); tx.batch.delete(P() + 'log/' + x.id); }      // keep the newest LOG_MAX
  if (!o.undoOf) { S.undoStack.push(id); S.redoStack = []; }
  tx.batch.commit().then(() => {
    if (!sticky) S.lastErr = false;
    S.savedAt = Date.now(); showSaveState();
    if (!o.quiet) toast(tx.say || label, () => { reverseChange(id); render(); }, tx.btn || 'Undo');
  }, e => {
    S.undoStack = S.undoStack.filter(x => x !== id); S.redoStack = S.redoStack.filter(x => x !== id); S.lastErr = true; S.errAt = Date.now();
    if (o.undoOf) { S.undid.delete(o.undoOf); (o.from === 'redo' ? S.redoStack : S.undoStack).push(o.undoOf); showSaveState(); }      // the undo did not save: it can be tried again
    refused(e, 'Not saved', e && e.partial ? '' : e && (e.code === 'network' || e.code === 'unwell' || e.status >= 502) ? ' It may have got there after all: if so, it shows again once the connection is back.' : ' Nothing was changed.');      // no answer is not a no; a 500 from the server was rolled back
  });
  showSaveState();
  return tx;
}
/* Change some fields of one document. snap: the document as this screen drew it, when the new value was built from that (a whole list of teams,
   a settings list). A list or a set of settings goes up saying what it was, so the far side lays only this person's change onto what is stored now. */
export function write(c, id, patch, snap) {
  const cur = curOf(c, id);
  if (!cur) return;
  const p = {}, b = {};
  for (const k in patch) if (!eq(cur[k], patch[k])) { p[k] = patch[k] === undefined ? null : patch[k]; const bv = snap && snap[k] !== undefined ? snap[k] : cur[k]; b[k] = bv === undefined ? null : bv; }      // what it was, as this screen showed it: History and Undo work from that
  if (!Object.keys(p).length) return;
  if (!TX) { action(describe(c, cur, p), () => write(c, id, p, snap), { row: rowName(c, cur), rc: c, rid: id }); return; }
  TX.ch.push({ c, id, b, a: p });
  const was = {};
  for (const k in p) {
    const seen = snap ? snap[k] : b[k], none = seen == null || seen === '';      // a field the document did not have counts as empty
    if (Array.isArray(p[k]) && (Array.isArray(seen) || none)) was[k] = none ? [] : seen;
    else if (Array.isArray(p[k]) && typeof seen === 'string') was[k] = [seen];      // one DRI is a list of one, so a change made meanwhile is merged, not overwritten
    else if (isObj(p[k]) && (isObj(seen) || none)) was[k] = none ? {} : seen;
  }
  TX.batch.update(pathOf(c, id), p, Object.keys(was).length ? was : null);
}
const body = r => { const o = Object.assign({}, r); delete o.id; return o; };
export function create(c, data, label, wantId) {
  if (!TX) { let id = ''; action(label || 'Added “' + rowName(c, data) + '”', () => { id = create(c, data, null, wantId); }, { row: rowName(c, data), rc: c }); return id; }
  const id = wantId || Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  TX.ch.push({ c, id, b: null, a: data });
  if (!TX.rid) TX.rid = id;
  TX.batch.set(pathOf(c, id), data);
  return id;
}
export function restore(c, r) {
  if (!TX) { action('Brought back “' + rowName(c, r) + '”', () => restore(c, r), { row: rowName(c, r), rc: c, rid: r.id }); return; }
  TX.ch.push({ c, id: r.id, b: null, a: body(r) });
  TX.batch.set(pathOf(c, r.id), body(r));
}
export function remove(c, id) {
  const cur = curOf(c, id);
  if (!cur) return;
  if (!TX) { action('Deleted “' + rowName(c, cur) + '”', () => remove(c, id), { row: rowName(c, cur), rc: c, rid: id }); return; }
  TX.ch.push({ c, id, b: body(cur), a: null });
  TX.batch.delete(pathOf(c, id));
}
/* An undo that would take away a section or a table still holding rows leaves it in place, as deleting it in Settings would. */
function inUse(k, now, was) {
  if ((k !== 'sections' && k !== 'tables') || !Array.isArray(now)) return false;
  const id = x => x && (k === 'sections' ? x.key : x.id), kept = new Set((Array.isArray(was) ? was : []).map(id));
  return now.some(x => !kept.has(id(x)) && (k === 'sections' ? (X.bySec[id(x)] || []).length + (X.loose[id(x)] || []).length : (X.byTable.get(id(x)) || []).length));
}
export function reverseChange(eid) {                      // reverses one History entry; undoing an undo is a redo
  const e = X.log.find(x => x.id === eid) || curOf('log', eid);
  const drop = () => { S.undoStack = S.undoStack.filter(x => x !== eid); S.redoStack = S.redoStack.filter(x => x !== eid); showSaveState(); };      // so Undo moves on to the change before
  if (!e) { drop(); toast('That change is no longer in the history.'); return; }
  if (e.undone || S.undid.has(eid)) { drop(); toast('That change was already undone.'); return; }
  const base = e.label.replace(/^(Undo|Redo): /, ''), redo = /^Undo: /.test(e.label), wasRedo = S.redoStack.includes(eid);
  let skipped = 0;
  const tx = action((redo ? 'Redo: ' : 'Undo: ') + base, () => {
    for (const ch of e.ch.slice().reverse()) {
      const cur = curOf(ch.c, ch.id);
      if (ch.b == null) {                              // it was added: take it away again
        if (!cur) continue;
        if (ch.c === 'entries' && [...store.docs].some(([p, d]) => d.entry === ch.id && p.startsWith(P() + 'items/'))) { skipped++; continue; }      // items were added under it since
        remove(ch.c, ch.id);
      } else if (ch.a == null) {                       // it was deleted: bring it back
        if (cur) continue;
        restore(ch.c, Object.assign({ id: ch.id }, ch.b));
      } else {                                         // fields changed: put back only what has not changed again since
        if (!cur) { skipped++; continue; }
        const p = {}, snap = {};
        for (const k in ch.a) {
          if (ch.c === 'meta' && ch.id === 'config' && inUse(k, ch.a[k], ch.b[k])) { skipped++; continue; }      // never take away a day or a table that has rows in it now
          const a = ch.a[k], b = ch.b[k], list = Array.isArray(a) && (b == null || Array.isArray(b)), set = isObj(a) && (b == null || isObj(b));
          if (list || set) { p[k] = b == null ? (list ? [] : {}) : b; snap[k] = a; }      // a list or a set of settings: only this change's own part is taken back, through the same merge, whatever others changed in it since
          else if (eq(cur[k], a)) { p[k] = b; snap[k] = cur[k]; } else skipped++;
        }
        if (Object.keys(p).length) write(ch.c, ch.id, p, snap);
      }
    }
  }, { undoOf: eid, from: wasRedo ? 'redo' : 'undo', row: e.row, rc: e.rc, rid: e.rid });
  S.undoStack = S.undoStack.filter(x => x !== eid); S.redoStack = S.redoStack.filter(x => x !== eid);
  if (!tx) { toast(skipped ? 'Left alone: it has been changed again since.' : 'Nothing to undo: it is already as it was.'); showSaveState(); return; }
  S.undid.add(eid);
  tx.say = (redo ? 'Redone: ' : 'Undone: ') + base + (skipped ? ' (' + skipped + ' left alone: changed again since)' : '');
  tx.btn = redo ? 'Undo' : 'Redo';
  (wasRedo ? S.undoStack : S.redoStack).push(tx.id);
  showSaveState();
}
export function undoLast() { const id = S.undoStack[S.undoStack.length - 1]; if (id && CW()) { reverseChange(id); render(); } }
export function redoLast() { const id = S.redoStack[S.redoStack.length - 1]; if (id && CW()) { reverseChange(id); render(); } }
export const nextSeq = list => [...list].reduce((a, r) => Math.max(a, r.seq || 0), 0) + 10;
export const newItem = (entry, sec, title, kind, label) => create('items', blankItem({ entry: entry || '', sec: entry ? '' : sec, seq: nextSeq(X.items.values()), kind: kind || '', title }), label);
export const newEntry = (sec, title, type, slot, start, status, label) => create('entries', blankEntry({ sec, seq: nextSeq(X.entries.values()), type, slot: slot || '', title, start: start || '', status: status || '' }), label);

/* ---------- render loop ---------- */
export const href = (view, arg) => '#/' + S.plan + (view && view !== 'overview' ? '/' + view + (arg ? '/' + encodeURIComponent(arg) : '') : '');
/* The side list (owner, Nov 27: "add the three dot options on the left menu for each and rename everything to better things", then "schedule should just be
   days, not sections. So I need to be able to add my own sections and things under them, otherwise default to lists").
   Schedule holds the days. Everything else is a list (rows with a DRI, a status, a date: a section of the plan that is not a day) or a sheet (columns of its
   own), and sits under Lists unless it was put in one of the event's own sections. Every row has a ⋯ menu: rename in place, open its form, move it to
   another section, delete it (asking first when rows would go with it); a built-in page can be hidden (Settings, Views brings it back). A heading's ⋯ adds
   what goes under it. A heading's key is what a list's or a sheet's settings store (nav), kept from its first name, so "Tables", "Sheets" and "Lists" land
   in the same place; anything once put under Schedule now sits under Lists. */
const plain = o => Object.assign(Object.create(null), o);      // a name typed by someone ("constructor", "toString") is never mistaken for one of these
export const HEADS = plain({ Plan: 'Schedule', Tables: 'Lists', 'Follow up': 'People', More: 'More' });
const HEAD_OF = plain({ plan: 'Tables', schedule: 'Tables', tables: 'Tables', sheets: 'Tables', lists: 'Tables', 'follow up': 'Follow up', people: 'Follow up', more: 'More' });
const headKey = name => { const k = String(name || '').trim(); return HEAD_OF[k.toLowerCase()] || k; };
/* The event's own sections, in the order they were made: those added from the side list (navHeads), then any a list's or a sheet's settings name.
   One section whatever the case it is written in ("Vendors", "vendors"), under the spelling it was first given. */
export const ownHeads = () => {
  const seen = new Map(), names = (X.cfg.navHeads || []).concat((X.cfg.tables || []).concat((X.cfg.sections || []).filter(s => s.kind !== 'day')).map(x => x.nav || ''));
  for (const n of names) { const k = headKey(n); if (k && !(k in HEADS) && !/^(event|template)$/i.test(k) && !seen.has(k.toLowerCase())) seen.set(k.toLowerCase(), k); }
  return [...seen.values()];
};
export const navHead = x => { const k = headKey(x.nav); if (!k) return 'Tables'; if (k in HEADS) return k; const l = k.toLowerCase(); return ownHeads().find(h => h.toLowerCase() === l) || k; };
export const sameHead = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
export const splitK = k => { const at = String(k).indexOf(':'); return [k.slice(0, at), k.slice(at + 1)]; };      // "sec:d1" -> ["sec", "d1"]
const HIDEABLE = new Set(VIEWS.map(v => v[0])), VIEW_NAME = Object.fromEntries(VIEWS);
/* A heading in the side list folds its links away (the page that is open stays in sight), and this device remembers which are folded. */
const NAV_FOLDED = 'app.navFolded';
const rawFolded = () => new Set(kept.list(NAV_FOLDED));
const FOLDED_FIRST = ['More'];      // headings that start folded; '!' + heading in the stored list means opened
const navFolded = () => { const s = rawFolded(); for (const h of FOLDED_FIRST) if (!s.delete('!' + h)) s.add(h); return s; };
/* Each heading's group and each row keep their own node from one drawing to the next (an id made from the key, one per name), so a redraw never
   hands one's open menu or its motion to another. */
const navId = (pre, key) => pre + (key ? '-' + String(key).replace(/[^A-Za-z0-9-]/g, c => '_' + c.charCodeAt(0).toString(16) + '_') : '');
const groupOpen = (key, folded) => '<div id="' + esc(navId('ng', key)) + '"' + (folded ? ' class="folded"' : '') + '>';
const foldBtn = (key, label, open) => '<button type="button" class="nt" data-nav-fold="' + esc(key) + '" aria-expanded="' + open + '">' + esc(label) + '</button>';
/* A section renamed or deleted takes its folding with it, so a later section of the old name starts open. */
export function foldMoved(was, now) { const s = rawFolded(); if (!s.delete(was)) return; if (now) s.add(now); kept.set(NAV_FOLDED, JSON.stringify([...s])); }
let navFocus = '';      // a field to put the cursor in once the side list is drawn: the one a menu just opened
function renderNav() {
  const nav = $('#nav'), folded = navFolded(), grp = (label, links) => links ? groupOpen(label, label && folded.has(label)) + (label ? '<span class="nl">' + foldBtn(label, label, !folded.has(label)) + '</span>' : '') + links + '</div>' : '';
  if (S.screen === 'home') {                           // every event at once
    const h = (v, label) => '<a href="#/' + (v ? '~/' + v : '') + '"' + ((S.hv === 'events' ? '' : S.hv) === v && !S.q ? ' aria-current="page"' : '') + '>' + label + '</a>';
    setHTML(nav, grp('', h('', 'Events')) + grp('Across events', h('assignments', 'Assignments') + h('lists', 'Checklists') + h('insights', 'Insights')) + grp('Setup', h('templates', 'Templates') + h('settings', 'Settings') + h('about', 'About')));
    return;
  }
  if (!S.plan || !S.ready || !X.cfg) { setHTML(nav, ''); return; }
  const a = (v, arg, label) => X.off.has(v) ? '' : '<a href="' + href(v, arg) + '"' + (S.view === v && (S.arg || '') === (arg || '') && !S.q ? ' aria-current="page"' : '') + '>' + label + '</a>';
  const cw = CW(), last = isTemplate() ? 'Template' : 'Event', tabs = X.cfg.tables || [], lists = X.secs.filter(s => s.kind !== 'day'), own = ownHeads();
  const is = (x, h) => { const n = navHead(x); return n === h || (h === last && /^(event|template)$/i.test(n)); };
  const was = nav.querySelector('.nform input'), wasFor = was ? [was.form.dataset.navForm, was.form.dataset.kind] : null, draft = was ? was.value : '', held = was && document.activeElement === was;
  const menu = (name, items) => cw && items ? '<details class="mm nmm"><summary aria-label="' + esc('Options for ' + name) + '" title="Options">⋯</summary><div class="mm-pop">' + items + '</div></details>' : '';
  const mi = (label, attrs, cls) => '<button type="button" class="btn' + (cls ? ' ' + cls : '') + '"' + attrs + '>' + label + '</button>';
  const ask = k => S.ui.navAsk && S.ui.navAsk.k === k ? '<div class="nask" role="alert"><span>' + esc(S.ui.navAsk.q) + '</span><span><button type="button" class="btn sm danger" data-act="nav-del-yes" data-k="' + esc(k) + '">Delete</button><button type="button" class="btn sm" data-act="nav-ask-no">Cancel</button></span></div>' : '';
  const ren = (k, cur) => '<form class="nren" data-nav-ren="' + esc(k) + '"><input name="name" value="' + esc(cur) + '" aria-label="' + esc('New name for ' + cur) + '" autocomplete="off" maxlength="60"></form>';
  const row = (k, link, name, items) => !link ? '' : S.ui.navRen === k ? ren(k, name) : '<div class="nrow" id="' + esc(navId('nr', k)) + '">' + link + menu(name, items) + '</div>' + ask(k);
  const act = (what, k) => ' data-act="nav-' + what + '" data-k="' + esc(k) + '"';
  const moveTo = (k, x) => ['Tables'].concat(own).filter(h => h !== navHead(x)).map(h => mi('Move to ' + esc(HEADS[h] || h), act('move', k) + ' data-g="' + esc(h) + '"')).join('');
  const dayRow = s => { const k = 'sec:' + s.key; return row(k, a('s', s.key, secDot(s.key) + esc(s.label)), s.label, mi('Rename', act('ren', k)) + mi('Edit day', act('edit', k)) + mi('Delete day', act('del', k), 'danger')); };
  const listRow = s => { const k = 'sec:' + s.key; return row(k, a('s', s.key, secDot(s.key) + esc(s.label)), s.label, mi('Rename', act('ren', k)) + mi('Edit list', act('edit', k)) + moveTo(k, s) + mi('Delete list', act('del', k), 'danger')); };
  const sheetRow = t => { const k = 'tbl:' + t.id; return row(k, a('t', t.id, '<span class="dot sq"></span>' + esc(t.name)), t.name, mi('Rename', act('ren', k)) + mi('Edit sheet', act('edit', k)) + moveTo(k, t) + mi('Delete sheet', act('del', k), 'danger')); };
  const page = (v, label) => row('view:' + v, a(v, '', esc(label || VIEW_NAME[v])), label || VIEW_NAME[v], HIDEABLE.has(v) ? mi('Hide from the side list', ' data-act="nav-hide" data-v="' + v + '"') : '');
  const under = h => lists.filter(s => is(s, h)).map(listRow).join('') + tabs.filter(t => is(t, h)).map(sheetRow).join('');      // lists first, then sheets
  /* A heading adds with +, not ⋯ (owner, Nov 27: "for the lists and adding a day or something use a plus symbol, not the dots"): Schedule's adds the next day
     at once; the others open what can go under them (and, for a section of the event's own, renaming or deleting it). */
  const plus = (name, items) => cw && items ? '<details class="mm nmm plus"><summary aria-label="' + esc('Add to ' + name) + '" title="Add">+</summary><div class="mm-pop">' + items + '</div></details>' : '';
  const head = (key, items) => S.ui.navRen === 'head:' + key ? ren('head:' + key, key) : '<span class="nl">' + foldBtn(key, HEADS[key] || key, !folded.has(key)) + (items.startsWith('<button type="button" class="nplus"') ? (cw ? items : '') : plus(HEADS[key] || key, items)) + '</span>';
  const adds = key => mi('Add a list', ' data-act="nav-add" data-g="' + esc(key) + '" data-kind="list"') + mi('Add a sheet', ' data-act="nav-add" data-g="' + esc(key) + '" data-kind="sheet"');
  const { g: addG, kind: addKind } = S.ui.navAdd || {}, WHAT = { list: 'list', sheet: 'sheet', head: 'section' }, what = WHAT[addKind] || 'list';
  const form = key => !cw || addG !== key ? '' : '<form class="nform" data-nav-form="' + esc(key) + '" data-kind="' + esc(addKind) + '"><input name="name" placeholder="' + esc(what[0].toUpperCase() + what.slice(1)) + ' name" aria-label="Name" autocomplete="off" maxlength="60">' +
    '<span><button class="btn sm" type="submit">Add ' + what + '</button><button class="btn sm" type="button" data-act="nav-add" data-g="">Cancel</button></span></form>';
  const sect = (key, items, links) => links || cw ? groupOpen(key, folded.has(key)) + head(key, items) + ask('head:' + key) + links + form(key) + '</div>' : '';
  setHTML(nav, grp('', '<a class="back" href="#/' + (isTemplate() ? '~/templates' : '') + '">' + (isTemplate() ? 'Templates' : 'All events') + '</a>' + a('overview', '', 'Overview')) +
    sect('Plan', '<button type="button" class="nplus" data-act="nav-add-day" aria-label="Add a day" title="Add a day">+</button>', X.secs.filter(s => s.kind === 'day').map(dayRow).join('')) +
    sect('Tables', adds('Tables'), under('Tables')) +
    own.map(h => sect(h, adds(h) + '<hr class="mm-sep">' + mi('Rename section', act('ren', 'head:' + h)) + mi('Delete section', act('del', 'head:' + h), 'danger'), under(h))).join('') +
    sect('Follow up', adds('Follow up'), page('people') + page('teams') + page('lists') + under('Follow up')) +
    sect('More', adds('More'), page('gaps') + page('decisions') + page('insights') + page('history', 'History') + page('print', 'Print') + page('settings', 'Settings') + under('More') + under(last)) +      // the pages used now and then, folded away (owner, Nov 25: "streamline the interface and make everything simple")
    (cw ? '<div class="nend">' + (addG === '@head' ? form('@head') : '<button type="button" class="nsec" data-act="nav-add" data-g="@head" data-kind="head">Add section</button>') + '</div>' : ''));
  const now = nav.querySelector('.nform input');
  if (now && wasFor && S.ui.navAdd && wasFor[0] === S.ui.navAdd.g && wasFor[1] === S.ui.navAdd.kind) { now.value = draft; if (held) now.focus(); }      // a half-typed name survives a redraw of the same form
  if (navFocus) { const n = nav.querySelector(navFocus); navFocus = ''; if (n) { n.focus(); if (n.select) n.select(); } }
}
/* On a narrow screen the list of views is a drawer that slides out from under the top bar, and Menu turns into the X that closes it (app.css).
   Opening it puts focus on the page that is open in it; closing it puts focus back on Menu if it was inside. */
let movingT = 0;
const moving = () => { const b = document.body; b.classList.add('side-moving'); clearTimeout(movingT); movingT = setTimeout(() => b.classList.remove('side-moving'), 400); };      // the side list slides only while it is being opened or closed
const setMenu = on => {
  const was = document.body.classList.contains('nav-open'), inside = $('.side').contains(document.activeElement);
  if (on !== was) moving();
  document.body.classList.toggle('nav-open', on); $('#menu').setAttribute('aria-expanded', String(on));
  if (on && !was) { const a = $('#nav a[aria-current="page"]') || $('#nav a'); if (a) a.focus({ preventScroll: true }); }
  else if (!on && was && inside) $('#menu').focus({ preventScroll: true });
};
/* On a wide screen the side list can be put away for more room, and brought back with Menu; this device remembers which. */
const WIDE = '(min-width:760px) and (min-height:480px)';      // the same line as in app.css: the side list beside the page, or behind Menu
const wide = () => window.matchMedia(WIDE).matches;
const sideOff = on => {
  const b = document.body;
  setMenu(false);
  if (b.classList.contains('side-hidden') !== on) moving();
  b.classList.toggle('side-hidden', on);
  kept.set('app.sideOff', on ? '1' : '');
  if (!on) { const x = $('#side-off'); if (x) x.focus({ preventScroll: true }); }
};
if (kept.get('app.sideOff')) document.body.classList.add('side-hidden');
window.matchMedia(WIDE).addEventListener('change', () => setMenu(false));      // the drawer belongs to a narrow window only
$('#menu').addEventListener('click', () => { if (wide()) sideOff(false); else setMenu(!document.body.classList.contains('nav-open')); });
$('#side-off').addEventListener('click', () => { sideOff(true); $('#menu').focus({ preventScroll: true }); });
$('#shade').addEventListener('click', () => setMenu(false));
new ResizeObserver(() => document.documentElement.style.setProperty('--bar-h', $('.bar').offsetHeight + 'px')).observe($('.bar'));      // the drawer opens under the top bar
/* The side list's width: drag its edge, or use the arrow keys on it (Shift for bigger steps); a double-click puts back the usual width. This device remembers it. */
const grip = $('#side-grip'), SIDE_W = 'app.sideW';
const sideW = () => Math.round($('.side').getBoundingClientRect().width);
const setSideW = (px, keep) => {
  const root = document.documentElement.style;
  if (px == null) { root.removeProperty('--side-w'); kept.drop(SIDE_W); }
  else {
    const hi = Math.max(200, Math.min(520, Math.round(window.innerWidth * 0.45)));
    px = Math.round(Math.max(160, Math.min(hi, px)));
    root.setProperty('--side-w', px + 'px');
    if (keep) kept.set(SIDE_W, px);
  }
  grip.setAttribute('aria-valuenow', String(sideW()));
};
let dragging = false;
grip.addEventListener('pointerdown', ev => { if (ev.button) return; ev.preventDefault(); dragging = true; grip.setPointerCapture(ev.pointerId); document.body.classList.add('resizing'); });
grip.addEventListener('pointermove', ev => { if (dragging) setSideW(ev.clientX); });
const endDrag = () => { if (!dragging) return; dragging = false; document.body.classList.remove('resizing'); setSideW(sideW(), true); };
grip.addEventListener('pointerup', endDrag); grip.addEventListener('pointercancel', endDrag); grip.addEventListener('lostpointercapture', endDrag);
grip.addEventListener('dblclick', () => setSideW(null));
grip.addEventListener('keydown', ev => {
  const step = ev.shiftKey ? 64 : 16, w = sideW(), to = ev.key === 'ArrowLeft' ? w - step : ev.key === 'ArrowRight' ? w + step : ev.key === 'Home' ? 0 : ev.key === 'End' ? 9999 : undefined;
  if (to === undefined) return;
  ev.preventDefault(); setSideW(to, true);
});
grip.setAttribute('aria-valuenow', String(sideW()));
/* Folding or opening a heading: the links that go shrink away and the links that come grow in, all at once, so what is below slides
   once (owner, Nov 27: "the dropdown animation is weird because it staggers on lists"). */
const NAV_ROWS = ':scope>:is(a,.nrow,.nask,.nren,.nform)', drawn = n => n.getClientRects().length > 0;
function foldNav(k) {
  const group = () => { const b = [...$('#nav').querySelectorAll('[data-nav-fold]')].find(x => x.dataset.navFold === k); return b && b.closest('#nav>div'); };
  const g0 = group(), rows0 = g0 ? [...g0.querySelectorAll(NAV_ROWS)] : [];
  for (const n of rows0) { for (const a of n.getAnimations()) a.cancel(); n.style.display = n.style.overflow = ''; }      // one still moving from a quick second press starts again from where it rests
  const was = rows0.filter(drawn).map(n => [n, getComputedStyle(n).display, box(n)]);
  const s = rawFolded(), key = FOLDED_FIRST.includes(k) ? '!' + k : k;
  if (s.has(key)) s.delete(key); else s.add(key);
  kept.set(NAV_FOLDED, JSON.stringify([...s]));
  renderNav();
  const g = group();
  if (g) g.querySelector('[data-nav-fold]').focus({ preventScroll: true });
  if (!g || STILL.matches) return;
  const stay = new Set(was.map(w => w[0]));
  for (const n of g.querySelectorAll(NAV_ROWS)) if (drawn(n) && !stay.has(n)) { n.style.overflow = 'hidden'; n.animate([flat, box(n)], { duration: 220, easing: EASE }).onfinish = () => { n.style.overflow = ''; }; }
  for (const [n, display, full] of was) if (n.isConnected && !drawn(n)) {
    n.style.display = display; n.style.overflow = 'hidden';      // still drawn while it shrinks, then folded away
    n.animate([full, flat], { duration: 180, easing: EASE }).onfinish = () => { n.style.display = n.style.overflow = ''; };
  }
}
$('#nav').addEventListener('click', ev => {
  const f = ev.target.closest('[data-nav-fold]');
  if (f) { foldNav(f.dataset.navFold); return; }
  const b = ev.target.closest('[data-act]');
  if (b) { const fn = acts[b.dataset.act]; if (fn && fn(b.dataset, b, ev) !== false) render(); return; }
  if (ev.target.closest('a')) setMenu(false);
});
$('#nav').addEventListener('submit', ev => {
  ev.preventDefault();
  const f = ev.target;
  if (f.dataset.navRen) { if (S.ui.navRen !== f.dataset.navRen) return; const fn = submits['nav-ren']; S.ui.navRen = null; if (fn) fn({ k: f.dataset.navRen, name: f.elements.name.value }); render(); return; }
  const fn = submits['nav-add'];
  if (fn && fn({ g: f.dataset.navForm, kind: f.dataset.kind, name: f.elements.name.value }) !== false) render();
  if (!S.ui.navAdd) setMenu(false);
});
/* A name being changed in the side list is kept when the cursor leaves it, and Escape puts the old one back. */
$('#nav').addEventListener('focusout', ev => { const f = ev.target.closest && ev.target.closest('.nren'); if (f && !f.contains(ev.relatedTarget) && S.ui.navRen === f.dataset.navRen) f.requestSubmit(); });
$('#nav').addEventListener('keydown', ev => {
  if (ev.key !== 'Escape' || !(S.ui.navAdd || S.ui.navRen || S.ui.navAsk)) return;
  ev.stopPropagation(); S.ui.navAdd = null; S.ui.navRen = null; S.ui.navAsk = null; renderNav();
});
acts['nav-add'] = d => { const was = S.ui.navAdd, want = d.g ? { g: d.g, kind: d.kind || 'list' } : null; S.ui.navAdd = want && !(was && was.g === want.g && was.kind === want.kind) ? want : null; S.ui.navRen = null; S.ui.navAsk = null; if (S.ui.navAdd) navFocus = '.nform input'; renderNav(); return false; };
acts['nav-ren'] = d => { S.ui.navRen = d.k; S.ui.navAdd = null; S.ui.navAsk = null; navFocus = '.nren input'; renderNav(); return false; };
acts['nav-ask-no'] = () => { S.ui.navAsk = null; renderNav(); return false; };
acts['nav-edit'] = d => { const [kind, id] = splitK(d.k); setView(kind === 'sec' ? 's' : 't', id); S.edit = (kind === 'sec' ? 'sec/' : 'table/') + id; setMenu(false); };      // the page, with its form open
window.addEventListener('hashchange', () => setMenu(false));
let flashT = 0, rafQ = 0, lastKey = '';
export function render() {
  buildIndex();
  const inPlan = S.screen === 'plan' && S.ready && X.cfg && X.plan, app = appName();      // X.plan goes first when the event is being deleted: nothing of it is drawn from then on
  document.body.dataset.screen = S.screen;
  document.body.classList.toggle('app', S.screen === 'plan' || S.screen === 'home');      // the two screens with the side list and the top bar
  $('#title').textContent = inPlan ? X.plan.name : '';
  $('#sub').textContent = inPlan ? (isTemplate() ? 'Template' : [X.plan.dates, X.plan.venue].filter(Boolean).join('\n')) : '';
  document.title = inPlan ? X.plan.name : app;
  $('#mark').textContent = app;
  const acro = $('#acro'), tada = app.replace(/[^a-z]/gi, '').toUpperCase() === 'TADA';      // the letters spelled out under the name, while the app is called TA-DA
  if (tada && !acro.childElementCount) acro.innerHTML = ['Tasks', 'Assignments', 'Dates', 'Attendees'].map(w => '<span><b>' + w[0] + '</b>' + w.slice(1) + '</span>').join('');
  acro.hidden = !tada;
  $('#here').textContent = inPlan ? X.plan.name : S.screen === 'home' ? app : '';
  renderNav();
  const act = document.activeElement;
  const keep = act && act.id && main.contains(act) ? { id: act.id, v: act.value, a: act.selectionStart, b: act.selectionEnd, tag: act.tagName } : null;
  const y = window.scrollY, key = S.screen + '|' + S.hv + '|' + S.harg + '|' + S.plan + '|' + S.view + '|' + S.arg + '|' + S.q, drafts = [];
  if (key === lastKey) for (const n of main.querySelectorAll('form input[id], form select[id], form textarea[id]')) if (n.type !== 'file') drafts.push([n.id, n.type === 'checkbox' ? n.checked : n.value]);
  lastKey = key;
  const v = !inPlan ? views[S.screen === 'plan' ? 'loading' : S.screen] : S.q ? views.find : (views[S.view] || views.overview);
  const page = key.replace(/\|[^|]*$/, '|' + (S.q ? 'find' : '')), samePage = page === shownKey;      // typing in Search is the same page
  shownKey = page;
  const html = v ? v(S.arg) : '';
  const pin = samePage && tapped && main.contains(tapped) ? tapped.getBoundingClientRect().top : null;
  if (samePage) { const t = document.createElement('template'); t.innerHTML = html; dress(t.content); morph(main, t.content); }      // only what differs changes, so it can move
  else { main.innerHTML = html; dress(main); main.classList.remove('enter'); void main.offsetWidth; main.classList.add('enter'); }
  const shut = pin != null && tapped.isConnected && closeAbove(tapped);
  for (const [id, val] of drafts) { const n = document.getElementById(id); if (n && n.closest('form')) { if (n.type === 'checkbox') n.checked = val; else n.value = val; } }      // half-typed "add" forms survive a redraw
  fit();
  if (keep) {
    const n = document.getElementById(keep.id);
    if (n) { if (keep.tag !== 'SELECT' && n.type !== 'checkbox' && n.type !== 'file') { n.value = keep.v; if (n.tagName === 'TEXTAREA') fit(n); } n.focus({ preventScroll: true }); if (keep.a != null && /^(text|search|textarea)$/.test(n.type)) n.setSelectionRange(keep.a, keep.b); }      // text, search and textarea are the fields whose caret can be put back
  }
  if (S.jump) {
    const id = S.jump; S.jump = null;
    const n = document.getElementById(id);
    if (n) n.scrollIntoView({ block: 'center' }); else window.scrollTo(0, 0);
    if (S.flash) { clearTimeout(flashT); flashT = setTimeout(() => { S.flash = null; const f = main.querySelector('.flash'); if (f) f.classList.remove('flash'); }, 2500); }
  } else { window.scrollTo(0, y); if (shut) window.scrollBy(0, tapped.getBoundingClientRect().top - pin); }
  showSaveState();
}
/* Motion (owner, Nov 26: "nice animations", then "animations not good on everything. some things not animated").
   A new page fades up. On the same page the view is not rebuilt: it is changed in place, only where the new drawing differs (morph),
   so every change of state can move: a caret turns, a switch and a picker change colour smoothly, focus and scroll stay put.
   What appears eases in; a panel that opens (a form, a day's entry, a fold) grows to its height, and one that closes shrinks away. */
let shownKey = '', tapped = null;      // tapped: the control in the view whose press is being drawn
/* One fold open at a time: opening one closes the one before. Were that one above, shrinking away while this one grows, the heading just
   pressed would slide up the page under the finger. So a panel closing above it goes at once, and the page scrolls by what it took, so the
   heading stays where it was pressed and only its own panel moves. */
function closeAbove(n) {
  let any = false;
  for (const g of main.querySelectorAll('[data-gone]')) if (g.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING && !g.contains(n)) { for (const a of g.getAnimations()) a.cancel(); g.remove(); any = true; }
  return any;
}
const STILL = window.matchMedia('(prefers-reduced-motion: reduce)'), EASE = 'cubic-bezier(.2,.8,.2,1)';
const GROW = '.ed,.ev-b,.nf,.fb,.page-ed,.rm-ed,.newev', FADE = '.ev,.it,.rr,.qa,.team,.rm,.card,.box,.hp,.kpi';
const KEEP = ['in', 'enter'];
const sameNode = (a, b) => a.nodeType === b.nodeType && (a.nodeType !== 1 || (a.tagName === b.tagName && a.id === b.id && (a.id || a.classList[0] === b.classList[0])));
const here = n => n && !(n.nodeType === 1 && n.dataset.gone);
const box = n => { const cs = getComputedStyle(n); return { height: n.offsetHeight + 'px', paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginTop: cs.marginTop, marginBottom: cs.marginBottom, opacity: 1 }; };
const flat = { height: '0px', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px', opacity: 0 };
function arrive(n) {
  if (n.nodeType !== 1 || STILL.matches) return;
  if (n.matches(GROW)) { const full = box(n); n.style.overflow = 'hidden'; n.animate([flat, full], { duration: 240, easing: EASE }).onfinish = () => { n.style.overflow = ''; }; }
  else if (n.matches(FADE)) n.classList.add('in');
}
function leave(n) {
  if (n.nodeType !== 1 || STILL.matches || !n.matches(GROW)) { n.remove(); return; }
  const full = box(n); n.dataset.gone = '1'; n.style.overflow = 'hidden'; n.style.pointerEvents = 'none';
  n.animate([full, flat], { duration: 180, easing: EASE, fill: 'forwards' }).onfinish = () => n.remove();
}
function morph(from, to) {
  let a = from.firstChild;
  while (a && !here(a)) a = a.nextSibling;
  for (let b = to.firstChild; b;) {
    const next = b.nextSibling;
    if (a && sameNode(a, b)) { const an = a.nextSibling; patch(a, b); a = an; }
    else if (a && here(a.nextSibling) && sameNode(a.nextSibling, b) && !(b.nodeType === 1 && b.id && !a.id)) { const gone = a; a = a.nextSibling; leave(gone); const an = a.nextSibling; patch(a, b); a = an; }      // one taken out here
    else {
      const m = b.nodeType === 1 && b.id ? from.querySelector(':scope > #' + CSS.escape(b.id)) : null;
      if (m && here(m)) { from.insertBefore(m, a); patch(m, b); }      // the same thing, found further on: moved
      else { from.insertBefore(b, a); arrive(b); }
    }
    while (a && !here(a)) a = a.nextSibling;
    b = next;
  }
  while (a) { const an = a.nextSibling; if (here(a)) leave(a); a = an; }
}
function patch(a, b) {
  if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  const typing = a === document.activeElement, tag = a.tagName, val = tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'INPUT' ? b.value : null, on = tag === 'INPUT' ? b.checked : null;
  for (const { name } of [...a.attributes]) if (name !== 'class' && !b.hasAttribute(name) && !(name === 'style' && tag === 'TEXTAREA') && !(name === 'open' && tag === 'DETAILS')) a.removeAttribute(name);      // a menu someone has open stays open through a redraw
  for (const { name, value } of [...b.attributes]) if (name !== 'class' && a.getAttribute(name) !== value) a.setAttribute(name, value);
  const cls = [b.getAttribute('class') || ''].concat(KEEP.filter(c => a.classList.contains(c))).join(' ').trim();
  if ((a.getAttribute('class') || '') !== cls) { if (cls) a.setAttribute('class', cls); else a.removeAttribute('class'); }
  if (tag === 'TEXTAREA') { if (!typing && a.value !== val) a.value = val; return; }
  if (tag === 'INPUT') { if (!typing) { if (a.type === 'checkbox' || a.type === 'radio') a.checked = on; else if (a.type !== 'file' && a.value !== val) a.value = val; } return; }
  morph(a, b);
  if (tag === 'SELECT' && !typing && a.value !== val) a.value = val;
}
export function setHTML(n, html) { const t = document.createElement('template'); t.innerHTML = html; morph(n, t.content); }
/* Nothing typed or chosen is ever cut off: every drop-down shows its value as text that can wrap, and every text box is as tall as its text. */
const shownOf = s => (s.selectedOptions[0] || {}).textContent || '';
function dress(root) {                                 // a drop-down a view wrote as a bare <select> gets the same wrapper pick() makes
  for (const s of root.querySelectorAll('select')) {
    if (s.parentElement.classList.contains('pick')) continue;
    const w = document.createElement('span'), v = document.createElement('span');
    w.className = 'pick framed'; if (s.style.cssText) { w.style.cssText = s.style.cssText; s.removeAttribute('style'); }
    v.className = 'pv'; v.setAttribute('aria-hidden', 'true'); v.textContent = shownOf(s);
    s.replaceWith(w); w.append(s, v);
  }
}
function fit(only) {
  const list = only ? [only] : [...main.querySelectorAll('textarea')];
  if (!list.length) return;
  for (const t of list) t.style.height = 'auto';
  const hs = list.map(t => t.scrollHeight + t.offsetHeight - t.clientHeight);
  list.forEach((t, i) => { t.style.height = hs[i] + 'px'; });
}
let fitW = 0;
new ResizeObserver(es => { const w = Math.round(es[0].contentRect.width); if (w !== fitW) { fitW = w; fit(); } }).observe(main);      // a different width wraps the text differently
main.addEventListener('input', ev => {
  const t = ev.target;
  if (t.tagName !== 'TEXTAREA') return;
  if (t.classList.contains('line') && /[\r\n]/.test(t.value)) { const at = t.selectionStart; t.value = t.value.replace(/\s*[\r\n]+\s*/g, ' '); t.setSelectionRange(at, at); }
  fit(t);
});
main.addEventListener('keydown', ev => {                 // a one-line box: Enter finishes it, and the keyboard stays where it was
  const t = ev.target;
  if (ev.key !== 'Enter' || ev.isComposing || t.tagName !== 'TEXTAREA' || !t.classList.contains('line')) return;
  ev.preventDefault(); t.blur();
  const n = t.id && document.getElementById(t.id);
  if (n) n.focus({ preventScroll: true });
});
export function renderSoon() {                         // for changes arriving from elsewhere: never rebuild under an open dropdown or a box being typed in
  if (rafQ) return;
  rafQ = setTimeout(() => { rafQ = 0; const a = document.activeElement; if (a && main.contains(a) && (a.tagName === 'SELECT' || a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !/^(checkbox|radio|file)$/.test(a.type)))) { S.stale = true; return; } render(); }, 60);      // a redraw would put back typed text by script, and the browser never saves that on leaving the box
}
/* A write that was refused, however it was sent (a change, a delete, an import, a photo): lost access changes this page the same way every time,
   and anything that is not a plain refusal is logged for whoever looks into it. tail: what to add to the message, if anything. */
/* The event's setup is changed one way everywhere: written against the setup as stored (cfgRaw, not as read with its implied switches filled in),
   as one History entry under Settings. snap: another "what it was", when the screen shows a stand-in (a board nobody has arranged yet). */
export const putCfg = (patch, snap) => write('meta', 'config', patch, snap || X.cfgRaw);
export const saveCfg = (label, fn) => action(label, fn, { row: 'Settings', rc: 'meta', rid: 'config' });
export function refused(e, what, tail) {
  if (e && e.status === 401) { S.role = 'none'; S.screen = 'login'; S.plan = null; S.ready = false; S.why = e.message || S.why; toast(what + '. This device is no longer let in.', null, null, true); }      // the key or the passcode stopped being accepted
  else if (e && e.status === 403) { S.role = 'view'; S.why = e.message || S.why; toast(what + '. You can view this event but not edit it.', null, null, true); }
  else { if (!e || (!e.code && !e.status)) console.error(e); toast(what + ' (' + ((e && e.message) || 'error') + ').' + (tail || ''), null, null, true); }
  render();
}
export function showSaveState() {
  const el = $('#save'), inPlan = S.screen === 'plan' && S.ready;
  $('#undo').disabled = !CW() || !S.undoStack.length; $('#redo').disabled = !CW() || !S.redoStack.length;
  if (!inPlan) { el.textContent = ''; return; }
  if (S.offline) { el.dataset.s = 'view'; el.textContent = S.until > Date.now() ? 'Paused until ' + clock(S.until) : 'Offline' + (S.since ? ', as of ' + stamp(S.since) : ''); }
  else if (S.role !== 'edit') { el.dataset.s = 'view'; el.textContent = 'View only'; }
  else if (!store.online) { el.dataset.s = 'view'; el.textContent = 'Reconnecting…'; }
  else if (store.held) { el.dataset.s = 'saving'; el.textContent = 'Paused until ' + clock(store.held); }      // GitHub asked for a pause: the changes wait and then go
  else if (store.busy) { el.dataset.s = 'saving'; el.textContent = 'Saving…'; }
  else if (S.lastErr) { el.dataset.s = 'view'; el.textContent = S.savedAt > (S.errAt || 0) ? 'Saved, but one change failed' : 'Last change not saved'; }
  else { el.dataset.s = 'ok'; el.textContent = S.savedAt ? 'Saved ' + clock(S.savedAt) : 'Saved'; }
}
let toastT = 0, toastFn = null, shown = false, sticky = null;
/* A short note at the foot of the page. stay: it is about something that went wrong, so it stays until it is dismissed. A milder note that comes
   meanwhile ("Saved", "Sending the photo…") shows for its few seconds and then gives way to it again, so neither is lost. */
export function toast(msg, fn, label, stay) { if (stay) sticky = { msg, fn: fn || null, label: label || 'OK' }; showToast(msg, fn, label, stay); }
let outT = 0;
const hideToast = () => { const t = $('#toast'); if (t.hidden || t.classList.contains('out')) return; if (STILL.matches) { t.hidden = true; return; } t.classList.add('out'); outT = setTimeout(() => { t.hidden = true; t.classList.remove('out'); }, 180); };      // it sinks away
function showToast(msg, fn, label, stay) {
  clearTimeout(outT); $('#toast').classList.remove('out');      // a new message while the last one sinks: it stays up
  $('#toast-t').textContent = msg; toastFn = fn || null; shown = !!stay; $('#toast-b').hidden = !fn && !stay; $('#toast-b').textContent = label || (stay ? 'OK' : 'Undo'); $('#toast').hidden = false;
  clearTimeout(toastT); if (!stay) toastT = setTimeout(() => { toastFn = null; if (sticky) showToast(sticky.msg, sticky.fn, sticky.label, true); else hideToast(); }, fn ? 9000 : 4000);
}
$('#toast-b').addEventListener('click', () => {
  const f = toastFn;
  toastFn = null;
  if (shown) { sticky = null; S.lastErr = false; showSaveState(); hideToast(); }
  else if (sticky) showToast(sticky.msg, sticky.fn, sticky.label, true); else hideToast();
  if (f) f();
});
export function download(filename, text, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain' })); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- moving around ---------- */
export function setView(view, arg, replace) {         // replace: the address being left was only a pointer to a row, not a place to come back to
  const changed = S.view !== view || (S.arg || '') !== (arg || '');
  S.view = view; S.arg = arg || ''; S.confirm = null;
  if (changed && !S.jump) S.jump = '@top';
  const h = href(view, arg);
  if (location.hash !== h) { try { history[replace ? 'replaceState' : 'pushState'](null, '', h); } catch (e) { location.hash = h; } }
  render();
}
export function goTo(c, id, replace) {
  const r = curOf(c, id);
  if (!r) { if (replace) setView('overview', '', true); return; }
  S.q = ''; $('#q').value = ''; S.flash = id; S.edit = null;
  if (c === 'rows') { S.jump = 'r-row-' + id; setView('t', r.t, replace); return; }
  if (c === 'decisions') { S.jump = 'q-' + id; setView('decisions', '', replace); return; }
  if (c === 'handouts') { setView('print', 'h:' + id, replace); return; }
  if (c === 'items' && r.entry) S.open.add(r.entry);
  if (c === 'entries') S.open.add(id);
  S.jump = c === 'entries' ? 'row-' + id : 'i-row-' + id;
  setView('s', c === 'entries' ? r.sec : secOfItem(r), replace);
}
export const appName = () => String((store.docs.get('app/settings') || {}).name || '').trim() || S.app;
/* An item opened on its event's Lists page: its own list, its details open, so it can be changed or moved there. */
export function openInList(id, replace) {
  const r = curOf('items', id);
  if (!r) { if (replace) setView('overview', '', true); return; }
  S.q = ''; $('#q').value = ''; S.ui.list = X.kind.has(r.kind) ? r.kind : ''; S.ui.lwho = ''; S.flash = id; S.edit = 'items/' + id; S.jump = 'l-row-' + id;
  setView('lists', '', replace);
}
/* A row of another event, as a link that opens that event at the row. */
export const far = (plan, c, id, label) => '<a class="lnk" href="#/' + esc(plan) + '/go/' + c + '/' + encodeURIComponent(id) + '">' + esc(label) + '</a>';

/* One small readout for anything that carries data-tip (the bars in Insights): shown on hover and on keyboard focus, never the only place a number lives. */
const tip = document.createElement('div');
tip.className = 'tip'; tip.hidden = true; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip);
function showTip(n, x, y) {
  if (!n) { tip.hidden = true; return; }
  tip.textContent = n.dataset.tip; tip.hidden = false;
  const r = n.getBoundingClientRect(), w = tip.offsetWidth, left = Math.max(8, Math.min(window.innerWidth - w - 8, (x == null ? r.left + r.width / 2 : x) - w / 2));
  tip.style.left = left + 'px'; tip.style.top = Math.max(8, (y == null ? r.top : y) - tip.offsetHeight - 10) + 'px';
}
main.addEventListener('pointermove', ev => { const n = ev.target.closest('[data-tip]'); showTip(n, ev.clientX, n ? n.getBoundingClientRect().top : 0); });
main.addEventListener('pointerleave', () => showTip(null));
main.addEventListener('focusin', ev => showTip(ev.target.closest('[data-tip]')));
main.addEventListener('focusout', () => showTip(null));
window.addEventListener('scroll', () => showTip(null), { passive: true });

/* ---------- one set of listeners for every view ---------- */
main.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]');
  if (!b || b.tagName === 'SELECT' || b.tagName === 'FORM' || b.tagName === 'INPUT' || b.tagName === 'TEXTAREA') return;
  const fn = acts[b.dataset.act];
  tapped = b;
  try { if (fn && fn(b.dataset, b, ev) !== false) render(); } finally { tapped = null; }
});
main.addEventListener('change', ev => {
  const t = ev.target, d = t.dataset;
  if (t.tagName === 'SELECT' && t.nextElementSibling && t.nextElementSibling.classList.contains('pv')) t.nextElementSibling.textContent = shownOf(t);
  if (d.act && changes[d.act]) { if (changes[d.act](d, t) !== false) render(); return; }
  if (!d.f || !d.c) return;
  let v = t.type === 'checkbox' ? t.checked : t.value;
  if (d.num !== undefined) { v = v === '' ? null : Number(v); if (v != null && Number.isNaN(v)) v = null; }
  else if (typeof v === 'string') v = v.trim();
  const patch = { [d.f]: v };
  if (d.c === 'entries' && d.f === 'type') { const t2 = typeDef(v), cur = curOf('entries', d.id) || {}; if (!(t2.slots || []).includes(cur.slot)) patch.slot = ''; if (!(t2.sources || []).includes(cur.source)) patch.source = ''; }
  write(d.c, d.id, patch);
  if (t.tagName === 'SELECT' || t.type === 'checkbox') render(); else setTimeout(render, 350);
});
main.addEventListener('focusout', () => { if (S.stale) { S.stale = false; renderSoon(); } });
main.addEventListener('submit', ev => {
  ev.preventDefault();
  const fn = submits[ev.target.dataset.act];
  if (fn && fn(ev.target.dataset, ev.target) !== false) { ev.target.reset(); render(); }
});
acts.go = d => { goTo(d.c, d.id); return false; };
acts.view = d => { setView(d.v, d.arg); return false; };
acts.set = d => { write(d.c, d.id, { [d.f]: d.v }); };
acts.edit = d => { S.edit = S.edit === d.k ? null : d.k; S.confirm = null; S.ui.new = null; };
acts.fold = d => { S.ui.fold = S.ui.fold === d.k ? null : d.k; };
acts.ui = d => { S.ui[d.k] = d.v === undefined ? !S.ui[d.k] : d.v; };
acts['cancel-confirm'] = () => { S.confirm = null; };
acts['rm-owner'] = d => { const r = curOf(d.c, d.id); if (r) write(d.c, d.id, { owner: ownerValue(ownersOf(r).filter(x => x !== d.v)) }); };
changes['add-owner'] = (d, t) => { const r = curOf(d.c, d.id); if (r && t.value) write(d.c, d.id, { owner: ownerValue(ownersOf(r).concat([t.value])) }); };
acts['rm-helper'] = d => { const r = curOf(d.c, d.id); if (r) write(d.c, d.id, { helpers: (r.helpers || []).filter(x => x !== d.v) }); };
changes['add-helper'] = (d, t) => { const r = curOf(d.c, d.id); if (r && t.value) write(d.c, d.id, { helpers: (r.helpers || []).concat([t.value]) }); };
acts['change-reverse'] = d => { reverseChange(d.id); };
$('#undo').addEventListener('click', undoLast);
$('#redo').addEventListener('click', redoLast);
document.addEventListener('keydown', ev => {
  const typing = ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA' || ev.target.tagName === 'SELECT' || ev.target.isContentEditable);
  if (ev.key === 'Escape') { setMenu(false); if (ev.target === $('#q') && S.q) { $('#q').value = ''; S.q = ''; render(); } return; }
  if (ev.key === '/' && !typing && !ev.metaKey && !ev.ctrlKey && !ev.altKey && (S.screen === 'plan' || S.screen === 'home')) { ev.preventDefault(); $('#q').focus(); return; }
  if (!(ev.metaKey || ev.ctrlKey) || ev.altKey) return;
  const k = (ev.key || '').toLowerCase();
  if (k !== 'z' && k !== 'y') return;
  const t = ev.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;   // inside a text box the box's own undo applies
  ev.preventDefault();
  if (k === 'y' || ev.shiftKey) redoLast(); else undoLast();
});
let qT = 0;
$('#find').addEventListener('submit', ev => ev.preventDefault());
$('#q').addEventListener('input', ev => { clearTimeout(qT); const v = ev.target.value.trim(); if (/join=/.test(v)) return; qT = setTimeout(() => { S.q = v; S.jump = '@top'; render(); }, 140); });      // an invitation pasted here is taken as one, never searched for
store.on(ev => { if (ev.status) showSaveState(); if (ev.remote) renderSoon(); });
