/* Custom tables (guests, rooms, vendors, budget: whatever the event's settings define) and the People view with its teams. */
import { tableEditor } from './settings.js';
import { $, esc, S, X, W, an, pct, amountBar, meter, isDone, views, acts, changes, submits, CW, P, fmtDate, money, plural, secDot, secLabel, live, real, entryOf, secOfItem, allEntries, allItems, sortedNames, tableDef, rowTitle, lead, led, options, sel, ownerSel, statusSel, helpersText, go, refRow, seg, moreMenu, moreFields, count, line, head, newBtn, newForm, editBtn, formEnd, delBtn, askDel, tag, moneyRole, action, write, create, curOf, nextSeq, render, toast, download, store, idOf, ownersOf, ownerValue, refused, putCfg, saveCfg, moneyOf } from './core.js';
import { api } from './store.js';
import { fileUrl, compact } from './remote.js';
import { withIds, idFor } from './rules.js';
import { fieldBlank, singularOf, layoutFor, grouped } from './model.js';

/* ---------- tables ---------- */
const blankVal = v => v == null || v === '' || v === false || (Array.isArray(v) && !v.length);
export function fieldText(f, v) {
  if (blankVal(v)) return '';
  return Array.isArray(v) ? v.join(', ') : f.type === 'money' ? money(v) : f.type === 'date' ? fmtDate(v) : f.type === 'check' ? 'Yes' : String(v);
}
function fieldInput(ctx, r, f, wide) {
  const id = esc(ctx + '-' + r.id + '-' + f.key), v = r[f.key], dis = CW() ? '' : ' disabled', at = ' id="' + id + '" data-c="rows" data-id="' + esc(r.id) + '" data-f="' + esc(f.key) + '"' + dis;
  let inner;
  if (f.type === 'long') inner = '<textarea' + at + '>' + esc(v == null ? '' : v) + '</textarea>';
  else if (f.type === 'choice') inner = '<select' + at + '>' + options(f.options || [], v || '', '') + '</select>';
  else if (f.type === 'person') inner = '<select' + at + '>' + options(sortedNames(), v || '', '') + '</select>';
  else if (f.type === 'check') return '<label class="chk" for="' + id + '"><input type="checkbox"' + at + (v ? ' checked' : '') + '> ' + esc(f.label) + '</label>';
  else if (f.type === 'people') return '<div class="wide"><span class="lab">' + esc(f.label) + '</span>' + peopleEdit(tableDef(r.t), r, f, ctx) + '</div>';
  else if (f.type === 'photo') return '<div class="wide"><span class="lab">' + esc(f.label) + '</span>' + (v ? '<a href="' + esc(fileUrl(v)) + '" data-file="' + esc(v) + '" target="_blank" rel="noopener"><img class="photo" src="' + esc(fileUrl(v)) + '" data-file="' + esc(v) + '" alt="' + esc(f.label) + '"></a>' : '') +
    (CW() ? '<div class="row"><label class="btn sm file" for="' + id + '">' + (v ? 'Change photo' : 'Choose a photo') + '<input type="file" accept="image/*" id="' + id + '" data-act="upload" data-id="' + esc(r.id) + '" data-f="' + esc(f.key) + '"></label>' + (v ? '<button type="button" class="btn sm" data-act="set" data-c="rows" data-id="' + esc(r.id) + '" data-f="' + esc(f.key) + '" data-v="">Remove photo</button>' : '') + '</div>' : '') + '</div>';
  else if (f.type === 'number' || f.type === 'money' || f.type === 'date') inner = '<input type="' + (f.type === 'date' ? 'date' : 'number') + '" value="' + esc(v == null ? '' : v) + '"' + at + (f.type === 'number' ? ' data-num step="any"' : f.type === 'money' ? ' data-num step="0.01"' : '') + '>';
  else inner = line(at, v);
  return '<label class="' + (wide || f.type === 'long' ? 'wide' : '') + '" for="' + id + '">' + esc(f.label) + inner + '</label>';
}
function tableRow(t, r) {
  const editing = S.edit === 'rows/' + r.id, titles = t.fields.filter(f => f.title), tk = (titles.length ? titles : t.fields.slice(0, 1)).map(f => f.key);
  const shown = f => !tk.includes(f.key) && !f.quick && f.key !== t.group && !blankVal(r[f.key]);
  const pf = t.fields.filter(f => f.type === 'photo' && shown(f)).pop(), sf = t.fields.find(f => f.type === 'text' && shown(f));      // sf: one plain line under the name, so rows with the same name can be told apart
  const photo = pf ? '<img class="thumb" src="' + esc(fileUrl(r[pf.key])) + '" data-file="' + esc(r[pf.key]) + '" alt="" loading="lazy">' : '', sub1 = sf ? String(r[sf.key]) : '';
  return '<div class="it' + (S.flash === r.id ? ' flash' : '') + '" id="r-row-' + esc(r.id) + '">' + photo + '<div class="it-t"><span class="ttl">' + esc(rowTitle(t, r)) + '</span>' + (sub1 ? '<span class="subl">' + esc(sub1) + '</span>' : '') +
    t.fields.filter(f => f.type === 'people' && f.quick).map(f => '<span class="subl">' + peopleEdit(t, r, f) + '</span>').join('') +
    '</div><div class="ctl">' + quickCtl(t, r) + amountOf(t, r) + moreBtn(t, r) + '</div>' + (editing ? rowEditor(t, r, '') : '') + '</div>';
}
/* The parts a row shows in either layout: the fields that can be changed in place, the button that opens the rest, and the form it opens. */
function quickCtl(t, r) {
  let h = '';
  const several = t.fields.filter(f => f.quick && f.type !== 'people' && f.type !== 'check').length > 1;      // two unnamed pickers side by side cannot be told apart
  for (const f of t.fields.filter(f => f.quick && f.type !== 'people')) {
    if (f.type === 'check') h += '<label class="chk"><input type="checkbox" id="r-' + esc(r.id) + '-' + esc(f.key) + '-q" data-c="rows" data-id="' + esc(r.id) + '" data-f="' + esc(f.key) + '"' + (r[f.key] ? ' checked' : '') + (CW() ? '' : ' disabled') + '> ' + esc(f.label) + '</label>';
    else h += sel('r', 'rows', r.id, f.key, f.type === 'person' ? sortedNames() : (f.options || []), r[f.key], f.label, f.label + ' of ' + rowTitle(t, r), (f.attention || []).includes(String(r[f.key] || '')) ? ' data-tone="warn"' : '', several ? f.label : '');
  }
  return h;
}
const moreBtn = (t, r) => editBtn('rows/' + r.id, rowTitle(t, r));
/* What a row holds in money, beside its controls: what was spent, else what was planned. */
function amountOf(t, r) {
  const { spent: s, planned: p } = moneyOf(t, [r]);
  return s ? '<span class="amt num">' + esc(money(s)) + '</span>' : p ? '<span class="amt num muted" title="Planned">' + esc(money(p)) + '</span>' : '';
}
/* A table that holds money says its totals beside its name. */
function moneyNote(t, rows) {
  if (!t.fields.some(f => moneyRole(f))) return '';
  const tot = moneyOf(t, rows);
  return 'Spent ' + money(tot.spent) + (tot.planned ? ' of ' + money(tot.planned) + ' planned' : '');
}
/* A row's form: its name, its quick fields, who is in it, and whatever already holds a value; empty fields wait behind More details. */
const coreField = (r, f) => f.title || f.quick || f.type === 'people' || f.type === 'person' || !blankVal(r[f.key]);
const rowEditor = (t, r, cls) => '<div class="ed' + cls + '">' + t.fields.filter(f => coreField(r, f)).map(f => fieldInput('re', r, f, f.title)).join('') + moreFields(t.fields.filter(f => !coreField(r, f)).map(f => fieldInput('re', r, f, f.title)).join('')) + formEnd('rows/' + r.id, delBtn(' data-act="del-row" data-c="rows" data-id="' + esc(r.id) + '"', 'Delete ' + (t.one || 'row'))) + '</div>';

/* A grouped table as a map: one outlined block for each group (a building), one cell in it for each row (a room), with the row's photo and everything else it holds.
   The first plain-text field after the name is what the cell is about (who is in the room), so it is written large; the rest follow, each with its name. */
export const layoutOf = t => !grouped(t) ? 'list' : layoutFor(t) === 'map' ? S.ui['lay-' + t.id] || 'map' : 'list';
function mapCell(t, r) {
  const editing = S.edit === 'rows/' + r.id, titles = t.fields.filter(f => f.title), tk = (titles.length ? titles : t.fields.slice(0, 1)).map(f => f.key);
  const main = t.fields.find(f => f.type === 'people') || t.fields.find(f => f.type === 'text' && !tk.includes(f.key) && f.key !== t.group && !f.quick), facts = [], notes = [];
  let photo = '';
  for (const f of t.fields) {
    const v = r[f.key];
    if (tk.includes(f.key) || f.quick || f === main || f.key === t.group || f.type === 'number' || blankVal(v)) continue;
    if (f.type === 'photo') photo = '<a class="rm-p" href="' + esc(fileUrl(v)) + '" data-file="' + esc(v) + '" target="_blank" rel="noopener" aria-label="Photo of ' + esc(rowTitle(t, r)) + '"><img src="' + esc(fileUrl(v)) + '" data-file="' + esc(v) + '" alt="" loading="lazy"></a>';
    else if (f.type === 'long') notes.push(String(v));
    else if (f.type === 'check') facts.push('<span>' + esc(f.label) + '</span>');
    else facts.push('<span><i>' + esc(f.label) + '</i> ' + esc(fieldText(f, v)) + '</span>');
  }
  const who = !main ? '' : main.type === 'people' ? '<div class="rm-w">' + peopleEdit(t, r, main) + '</div>' : blankVal(r[main.key]) ? '<div class="rm-w none">' + esc(main.label) + ': not set</div>' : '<div class="rm-w">' + esc(r[main.key]) + '</div>';
  return '<article class="rm' + (editing ? ' on' : '') + (S.flash === r.id ? ' flash' : '') + '" id="r-row-' + esc(r.id) + '">' + photo + '<div class="rm-b"><div class="rm-n">' + esc(rowTitle(t, r)) + '</div>' + who +
    (facts.length ? '<div class="rm-f">' + facts.join('') + '</div>' : '') + notes.map(n => '<div class="rm-x">' + esc(n) + '</div>').join('') + '</div>' +
    '<div class="rm-c">' + quickCtl(t, r) + moreBtn(t, r) + '</div></article>' + (editing ? rowEditor(t, r, ' rm-ed') : '');
}
/* A field that holds several people. With "each person in one row only", someone placed anywhere in the table is no longer offered, so the list runs out as people are placed. */
const peopleIn = (r, f) => Array.isArray(r[f.key]) ? r[f.key] : [];
export function unplaced(t, f) { const used = new Set(); for (const r of X.byTable.get(t.id) || []) for (const n of peopleIn(r, f)) used.add(n); return sortedNames().filter(n => !used.has(n)); }
/* With "each person in one row only", two people placing the same person at the same moment can leave them in two rows. Who that happened to, and where. */
export function twice(t, f) { const at = new Map(); for (const r of X.byTable.get(t.id) || []) for (const n of peopleIn(r, f)) at.set(n, (at.get(n) || []).concat([r])); return [...at].filter(([, rs]) => rs.length > 1); }
export function placements(name) { const out = []; for (const t of X.cfg.tables || []) for (const f of t.fields.filter(f => f.type === 'people')) for (const r of X.byTable.get(t.id) || []) if (peopleIn(r, f).includes(name)) out.push([t, r]); return out; }
function peopleEdit(t, r, f, ctx) {                     // ctx: set where the same row is drawn a second time (its open form), so each drop-down keeps an id of its own
  const have = peopleIn(r, f), free = f.once ? unplaced(t, f) : sortedNames().filter(n => !have.includes(n)), cw = CW();
  let h = '<span class="hps ppl">';
  const two = f.once ? new Set(twice(t, f).map(([n]) => n)) : new Set();
  for (const n of have) h += '<span class="hp' + (two.has(n) ? ' twice' : '') + '"' + (two.has(n) ? ' title="' + esc(n + ' is in more than one ' + (t.one || 'row')) + '"' : '') + '>' + esc(n) + (two.has(n) ? ' <b class="bad">×2</b>' : '') + (cw ? '<button type="button" data-act="ppl-rm" data-id="' + esc(r.id) + '" data-f="' + esc(f.key) + '" data-v="' + esc(n) + '" aria-label="' + esc('Take ' + n + ' out of ' + rowTitle(t, r)) + '">×</button>' : '') + '</span>';
  if (cw && free.length) h += '<select id="' + (ctx || 'pp') + '-' + esc(r.id) + '-' + esc(f.key) + '-add" data-act="ppl-add" data-id="' + esc(r.id) + '" data-f="' + esc(f.key) + '" aria-label="' + esc('Add a person to ' + rowTitle(t, r)) + '"><option value="">' + (have.length ? 'Add' : 'Add a person') + '</option>' + options(free, '', null) + '</select>';
  else if (!have.length) h += '<span class="muted">' + (cw ? 'Nobody left to place' : 'Nobody yet') + '</span>';
  return h + '</span>';
}
changes['ppl-add'] = (d, t) => { const r = curOf('rows', d.id), cur = r && Array.isArray(r[d.f]) ? r[d.f] : []; if (!r || !t.value || cur.includes(t.value)) return false; write('rows', d.id, { [d.f]: cur.concat([t.value]) }); };
acts['ppl-rm'] = d => { const r = curOf('rows', d.id); if (r) write('rows', d.id, { [d.f]: (Array.isArray(r[d.f]) ? r[d.f] : []).filter(x => x !== d.v) }); };
function freeLine(t) {                                  // who is still without a row, for a table that places each person once
  const f = t.fields.find(f => f.type === 'people' && f.once), one = t.one || 'row';
  if (!f || !X.names.length) return '';
  const free = unplaced(t, f), two = twice(t, f);
  return '<p class="muted free">' + esc(free.length ? 'Not in ' + an(one) + ' yet (' + free.length + '): ' + free.join(', ') : 'Everyone is in ' + an(one) + '.') + '</p>' +
    two.map(([n, rs]) => '<p class="bad free">' + esc(n + ' is in ' + rs.length + ' at once: ' + rs.map(r => rowTitle(t, r)).join(', ') + '. Take them out of all but one.') + '</p>').join('');
}
function mapView(t, rows) {
  let h = '<div class="map">';
  for (const [name, list] of tableGroups(t, rows))
    h += '<section class="bld' + (list.length <= 2 ? ' few' : '') + '" style="--n:' + list.length + '"><div class="bld-h"><b>' + esc(name) + '</b>' + count(list.length) + '</div><div class="rms">' + list.map(r => mapCell(t, r)).join('') + '</div></section>';
  return h + '</div>';
}
acts.lay = d => { const i = d.v.lastIndexOf(':'); S.ui['lay-' + d.v.slice(0, i)] = d.v.slice(i + 1); S.edit = null; };
export function tableSums(t, rows, some) {           // some: leave out the counts that came to nothing
  return t.fields.filter(f => f.sum).map(f => { const v = rows.reduce((a, r) => a + (Number(r[f.key]) || 0), 0); return some && !v && f.type !== 'money' ? '' : (f.type === 'money' ? money(v) : v) + ' ' + (f.type !== 'money' && v === 1 ? singularOf(f.label) : f.label).toLowerCase(); }).filter(Boolean);
}
export function tableGroups(t, rows) {
  const g = t.fields.find(f => f.key === t.group);
  if (!g) return [['', rows]];
  const m = new Map();
  for (const o of g.options || []) m.set(o, []);
  for (const r of rows) { const k = blankVal(r[g.key]) ? '' : String(r[g.key]); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return [...m].filter(x => x[1].length).map(([k, list]) => [k || 'No ' + g.label.toLowerCase(), list]);
}
views.t = id => {
  const t = tableDef(id);
  if (!t) return '<p class="empty">No such table.</p>';
  const rows = X.byTable.get(id) || [], first = t.fields.find(f => f.title) || t.fields[0], lay = layoutOf(t);
  let h = head(esc(t.name), { note: esc(moneyNote(t, rows)), actions: (first ? newBtn('row-' + id, 'New ' + (t.one || 'row')) : '') + editBtn('table/' + id, t.name, 'Edit sheet') + moreMenu('<button type="button" class="btn" data-act="view" data-v="print" data-arg="t:' + esc(id) + '">Print</button><button type="button" class="btn" data-act="table-csv" data-id="' + esc(id) + '">Download .csv</button>') }) +
    (S.edit === 'table/' + id ? tableEditor(id) : '') + (first ? newForm('row-' + id, 'add-row', '<input id="newrow" placeholder="' + esc(first.label) + '" aria-label="' + esc(first.label) + '" autocomplete="off">', ' data-t="' + esc(id) + '"') : '') +
    '<div class="tools">' + (grouped(t) && layoutFor(t) === 'map' ? seg('lay', [[id + ':map', 'Map'], [id + ':list', 'List']], id + ':' + lay) : '') + '</div>';      // the switch is offered where a map is what the table is for
  h += freeLine(t);
  if (lay === 'map') return h + (rows.length ? mapView(t, rows) : '<p class="empty">Nothing here yet.</p>');
  for (const [name, list] of tableGroups(t, rows))
    h += '<div class="box">' + (name ? '<div class="gh">' + esc(name) + count(list.length) + '</div>' : '') + '<div class="pad">' + list.map(r => tableRow(t, r)).join('') + '</div></div>';
  return h + (rows.length ? '' : '<p class="empty">Nothing here yet.</p>');
};
submits['add-row'] = d => {
  const t = tableDef(d.t), v = $('#newrow').value.trim(), first = t.fields.find(f => f.title) || t.fields[0];
  if (!v) return false;
  const row = { t: t.id, seq: nextSeq(X.rows.values()) };
  for (const f of t.fields) row[f.key] = fieldBlank(f);
  row[first.key] = first.type === 'number' || first.type === 'money' ? Number(v) || null : v;
  const id = create('rows', row);
  S.edit = 'rows/' + id; S.flash = id; S.jump = 'r-row-' + id; S.ui.new = null;
};
const sending = new Map();
changes.upload = (d, t) => {
  const file = t.files && t.files[0], ext = file && (/\.(jpe?g|png|webp|gif)$/i.exec(file.name) || [])[0];
  if (!file) return false;
  if (!ext) { toast('Choose a JPEG, PNG, WebP or GIF image.'); return false; }
  const plan = S.plan, path = P() + 'rows/' + d.id, slot = path + '|' + d.f, ticket = (sending.get(slot) || 0) + 1;      // the row this photo is for, in the event that is open now
  sending.set(slot, ticket);
  toast('Sending the photo…');
  compact(file).then(f => api('api/files/' + plan + '/' + d.id.replace(/[^A-Za-z0-9_-]/g, '') + '-' + Date.now().toString(36) + (f === file ? ext.toLowerCase() : '.jpg'), { method: 'PUT', body: f, raw: true }))
    .then(res => {
      if (sending.get(slot) !== ticket) return;          // another photo was chosen for the same place since: that one is kept
      if (S.plan !== plan || !store.docs.has(path)) { toast('The photo was sent, but its row is no longer open, so it was not attached. Choose it again there.', null, null, true); return; }
      write('rows', d.id, { [d.f]: res.url }); render();
    }, e => { if (sending.get(slot) === ticket) refused(e, 'The photo was not saved'); });
  return false;
};
export function csv(rows) { const cell = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }; return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n'); }
acts['table-csv'] = d => {
  const t = tableDef(d.id), f = t.fields.filter(x => x.type !== 'photo');
  download(S.plan + '-' + t.id + '.csv', csv([f.map(x => x.label)].concat((X.byTable.get(t.id) || []).map(r => f.map(x => r[x.key] === true ? 'Yes' : r[x.key] === false ? '' : Array.isArray(r[x.key]) ? r[x.key].join(', ') : r[x.key])))), 'text/csv');
  return false;
};

/* ---------- people and teams ---------- */
/* The people and teams are saved as whole lists, built from what this screen shows (X.people) and saying so, so the far side keeps what someone
   else changed meanwhile. Every person and team carries an id, which a rename keeps: a change made at the same moment still finds them. */
const putPeople = patch => write('meta', 'people', patch, X.people);
const savePeople = (label, patch) => action(label, () => putPeople(patch), { row: 'People and teams', rc: 'meta', rid: 'people' });
const teamsCopy = () => withIds(X.teams).map(g => Object.assign({}, g, { captains: (g.captains || []).slice(), members: (g.members || []).slice() }));
const peopleCopy = () => withIds(X.people.people || []).map(p => Object.assign({}, p));
const tid = g => idOf(g.id || 'n-' + g.name);
/* One person in figures: the rows they lead, how many of those are done, what they help on, and what follows their lead. stats: the rows themselves. */
export const personSummary = name => { const p = personStats(name), mine = p.ev.concat(p.it, p.cap.map(x => x[1])); return { lead: mine.length, done: mine.filter(isDone).length, help: p.help.length + p.via.length, follow: p.inh, stats: p }; };
export function personStats(name) {
  const st = { ev: [], it: [], cap: [], inh: 0, help: [], via: [] }, mine = X.memberOf.get(name) || [];
  const look = (c, r, parent) => {
    const l = lead(r, parent);
    if (ownersOf(r).includes(name)) (c === 'entries' ? st.ev : st.it).push(r);
    else if (l.how === 'cap' && l.who.includes(name)) st.cap.push([c, r, (r.helpers || []).filter(h => X.team.has(h) && (X.team.get(h).captains || []).includes(name)).join(', ')]);
    else if ((r.helpers || []).includes(name)) st.help.push([c, r, W().Helper]);
    else { const g = (r.helpers || []).find(x => mine.includes(x)); if (g) st.via.push([c, r, g]); else if (l.how === 'via' && l.who.includes(name)) st.inh++; }
  };
  for (const e of allEntries().filter(real)) look('entries', e);
  for (const i of allItems().filter(live)) look('items', i, entryOf(i));
  return st;
}
const refCount = name => allEntries().concat(allItems()).filter(r => ownersOf(r).includes(name) || (r.helpers || []).includes(name)).length;
function sheet(p) {
  const isTeam = X.team.has(p) && !X.names.includes(p), g = X.team.get(p);
  let h = head(esc(p), { small: true, note: esc(isTeam ? ((g.captains || []).length ? 'Captain: ' + g.captains.join(', ') : '') : (X.memberOf.get(p) || []).join(', ')),
    actions: (isTeam ? '' : '<button type="button" class="btn" data-act="lists-of" data-v="' + esc(p) + '">Their checklists</button>') + moreMenu('<button type="button" class="btn" data-act="view" data-v="print" data-arg="' + (isTeam ? 'teams' : 'p:' + esc(p)) + '">Print</button>') +
      (!isTeam && CW() ? editBtn('person/' + p, p) : '') });
  if (!isTeam && CW() && S.edit === 'person/' + p) {
    const n = refCount(p);
    h += '<div class="box"><div class="ed"><label class="wide" for="rename">Name<input id="rename" value="' + esc(p) + '" data-act="person-name" data-v="' + esc(p) + '" autocomplete="off"></label>' +
      formEnd('person/' + p, S.confirm === 'person' ? askDel('Delete ' + p + ' and take them off ' + plural(n, 'row') + '?', ' data-act="person-del-yes" data-v="' + esc(p) + '"')
        : delBtn(' data-act="person-del" data-v="' + esc(p) + '"', 'Delete person')) + '</div></div>';
  }
  if (!isTeam) for (const [t, r] of placements(p)) h += '<p class="muted placed">' + esc(t.name) + ': ' + go('rows', r) + (t.group && r[t.group] ? ' (' + esc(r[t.group]) + ')' : '') + '</p>';
  const st = isTeam ? null : personStats(p);
  let any = false;
  for (const s of X.secs) {
    let rows = '';
    const inSec = (c, r) => (c === 'entries' ? r.sec : secOfItem(r)) === s.key;
    if (isTeam) {
      for (const e of (X.bySec[s.key] || []).filter(real)) { if ((e.helpers || []).includes(p)) rows += refRow('entries', e, statusSel('p', 'entries', e)); for (const i of (X.kids.get(e.id) || []).filter(live)) if ((i.helpers || []).includes(p)) rows += refRow('items', i, statusSel('p', 'items', i)); }
      for (const i of (X.loose[s.key] || []).filter(live)) if ((i.helpers || []).includes(p)) rows += refRow('items', i, statusSel('p', 'items', i));
    } else {
      for (const e of st.ev.filter(e => e.sec === s.key)) { const n = (X.kids.get(e.id) || []).filter(i => live(i) && lead(i, e).how === 'via').length; rows += refRow('entries', e, statusSel('p', 'entries', e), '<b>' + esc(W().owner) + '</b>' + (n ? ', ' + esc(plural(n, W().item)) + ' follow' : '')); }
      for (const i of st.it.filter(i => inSec('items', i))) rows += refRow('items', i, statusSel('p', 'items', i), '<b>' + esc(W().owner) + '</b>');
      for (const [c, r, why] of st.cap) if (inSec(c, r)) rows += refRow(c, r, statusSel('p', c, r), '<b>' + esc(W().owner) + ' as captain</b> (' + esc(why) + ')');
      for (const [c, r, why] of st.help.concat(st.via)) if (inSec(c, r)) rows += refRow(c, r, statusSel('p', c, r), esc(why));
    }
    if (rows) { any = true; h += '<div class="box"><div class="gh">' + secDot(s.key) + ' ' + esc(s.long || s.label) + '</div>' + rows + '</div>'; }
  }
  return h + (any ? '' : '<p class="empty">Nothing assigned yet.</p>');
}
/* Teams (owner, Nov 25 2026: "How do I create and assign teams too?"): a page of its own in the side list. Create a team at the top; each
   team is a card with its members (tick the captain) and what it is assigned to. "Assign to" puts the team on a row as a helper, the same
   as adding it from the row's own Helpers; with no DRI on that row, the team's captain leads it. */
function teamsPage() {
  const types = X.cfg.teamTypes || [], names = sortedNames(), cw = CW(), dis = cw ? '' : ' disabled';
  let h = newForm('team', 'add-team', '<input id="newteam" placeholder="Name" aria-label="Name of the new team" autocomplete="off">' +
    (types.length ? '<select id="newteam-type" aria-label="Type">' + options(types, types[0], null) + '</select>' : '<input type="hidden" id="newteam-type" value="">'));
  X.teams.forEach((g, i) => {
    const k = tid(g), on = r => (r.helpers || []).includes(g.name), ed = S.edit === 'team/' + k;
    const mine = allEntries().filter(on).map(r => ['entries', r]).concat(allItems().filter(on).map(r => ['items', r]));
    const where = (c, r) => (r.title || r.slot || '') + ' (' + secLabel(c === 'entries' ? r.sec : secOfItem(r)) + ')';
    h += '<div class="box team" id="team-' + k + '"><div class="tm-h"><b>' + esc(g.name) + '</b>' + (g.type ? tag(esc(g.type)) : '') + '<span class="ctl">' + (cw ? editBtn('team/' + k, g.name) : '') + '</span></div>';
    if (!ed) {
      if (g.note) h += '<p class="tm-n">' + esc(g.note) + '</p>';
      h += '<div class="tm-l"><span class="lab">Members</span><div class="hps">' + ((g.members || []).map(m => '<span class="hp' + ((g.captains || []).includes(m) ? ' cap' : '') + '">' + esc(m) + ((g.captains || []).includes(m) ? ', captain' : '') + '</span>').join('') || '<span class="muted">None yet</span>') + '</div></div>' +
        '<div class="tm-l"><span class="lab">Assigned to</span><div class="hps">' + (mine.slice(0, 6).map(([c, r]) => '<span class="hp">' + go(c, r, where(c, r)) + '</span>').join('') + (mine.length > 6 ? '<span class="muted">and ' + (mine.length - 6) + ' more</span>' : '') || '<span class="muted">Nothing yet</span>') + '</div></div></div>';
      return;
    }
    h += '<div class="ed">' +
      '<label for="tm-' + k + '-name">Name' + line(' id="tm-' + k + '-name" data-act="team-set" data-i="' + i + '" data-k="name"' + dis, g.name) + '</label>' +
      (types.length ? '<label for="tm-' + k + '-type">Type<select id="tm-' + k + '-type" data-act="team-set" data-i="' + i + '" data-k="type"' + dis + '>' + options(types, g.type || '', '') + '</select></label>' : '') +
      '<label class="wide" for="tm-' + k + '-note">Note' + line(' id="tm-' + k + '-note" data-act="team-set" data-i="' + i + '" data-k="note"' + dis, g.note || '') + '</label>' +
      '<div class="wide"><span class="lab">Members (tick the captain)</span><div class="hps">';
    for (const m of g.members || []) h += '<span class="hp' + ((g.captains || []).includes(m) ? ' cap' : '') + '"><label class="chk"><input type="checkbox" id="tm-' + k + '-cap-' + idOf(m) + '" data-act="team-cap" data-i="' + i + '" data-v="' + esc(m) + '"' + ((g.captains || []).includes(m) ? ' checked' : '') + dis + ' aria-label="' + esc(m) + ' is a captain"> ' + esc(m) + '</label>' +
      (cw ? '<button type="button" data-act="team-rm" data-i="' + i + '" data-v="' + esc(m) + '" aria-label="Remove ' + esc(m) + '">×</button>' : '') + '</span>';
    if (cw) h += '<select id="tm-' + k + '-add" data-act="team-add" data-i="' + i + '" style="width:auto" aria-label="Add a member to ' + esc(g.name) + '"><option value="">Add a member</option>' + options(names.filter(x => !(g.members || []).includes(x)), '', null) + '</select>';
    h += '</div></div><div class="wide"><span class="lab">Assigned to</span><div class="hps">';
    for (const [c, r] of mine) h += '<span class="hp">' + go(c, r, where(c, r)) + (cw ? '<button type="button" data-act="rm-helper" data-c="' + c + '" data-id="' + esc(r.id) + '" data-v="' + esc(g.name) + '" aria-label="' + esc('Take ' + g.name + ' off ' + (r.title || r.slot || '')) + '">×</button>' : '') + '</span>';
    if (cw) {
      let o = '';
      for (const s of X.secs) { const free = (X.bySec[s.key] || []).filter(e => real(e) && !on(e)); if (free.length) o += '<optgroup label="' + esc(s.label) + '">' + free.map(e => '<option value="' + esc(e.id) + '">' + esc(e.title || e.slot) + '</option>').join('') + '</optgroup>'; }
      if (o) h += '<select id="tm-' + k + '-assign" data-act="team-assign" data-i="' + i + '" style="width:auto" aria-label="Assign ' + esc(g.name) + ' to a row"><option value="">Assign to…</option>' + o + '</select>';
    }
    h += '</div></div>' + formEnd('team/' + k, S.confirm === 'team-' + k ? askDel('Delete ' + g.name + ' and take it off ' + plural(mine.length, 'row') + '?', ' data-act="team-del-yes" data-i="' + i + '"')
      : delBtn(' data-act="team-del" data-i="' + i + '"', 'Delete team')) + '</div></div>';
  });
  if (!X.teams.length) h += '<p class="empty">No teams yet.</p>';
  if (cw) h += '<h3>Team types</h3><div class="box"><div class="hps types">' + (types.map(t => '<span class="hp">' + esc(t) + '<button type="button" data-act="type-del" data-v="' + esc(t) + '" aria-label="Remove type ' + esc(t) + '">×</button></span>').join('') || '<span class="muted">None yet</span>') + '</div>' +
    '<form class="add" data-act="add-type"><input id="newtype" placeholder="New type" aria-label="New type of team" autocomplete="off"><button class="btn" type="submit">Add</button></form></div>';
  return h;
}
views.teams = () => head('Teams', { actions: newBtn('team', 'New team') }) + teamsPage();
views.people = () => {
  const names = sortedNames(), p = S.ui.person || '';
  const noDri = allEntries().filter(e => real(e) && !led(lead(e)));
  let h = head('People', { actions: newBtn('person', 'New person') }) + newForm('person', 'add-person', '<input id="newp" placeholder="Name" aria-label="Name of the new person" autocomplete="off">') + '<div class="tools">' + seg('person', [['', 'Everyone', names.length], ['@none', 'No ' + W().owner + ' yet', noDri.length]], names.includes(p) || X.team.has(p) ? '-' : p) + '</div>';
  if (p === '@none') {
    h += '<div class="box">' + (noDri.map(e => refRow('entries', e, ownerSel('p', 'entries', e), helpersText(e) ? esc(W().Helpers) + ': ' + esc(helpersText(e)) : '')).join('') || '<div class="rr muted">' + esc('Every ' + W().entry + ' has ' + an(W().owner) + '.') + '</div>') + '</div>';
    const loose = allItems().filter(i => live(i) && !entryOf(i) && lead(i).how === 'none');
    return h + (loose.length ? '<h3>Loose ' + esc(W().items) + ' with nobody</h3><div class="box">' + loose.map(i => refRow('items', i, ownerSel('p', 'items', i, null))).join('') + '</div>' : '');
  }
  if (names.includes(p) || X.team.has(p)) return h + sheet(p);
  const rows = names.map(n => { const s = personSummary(n); return { n, lead: s.lead, done: s.done, help: s.help, follow: s.follow,
    teams: (X.memberOf.get(n) || []).map(g => g + ((X.team.get(g).captains || []).includes(n) ? ' (captain)' : '')).join(', ') }; });
  const max = Math.max(1, ...rows.map(r => r.lead));
  if (names.length) h += meter(['Person', 'Rows they lead', 'Leads', W().Done, 'Helps', 'Teams'], rows.map(r => ['<button type="button" class="lnk" data-act="person" data-v="' + esc(r.n) + '">' + esc(r.n) + '</button>',
    amountBar(r.lead, max, r.n + ' leads ' + plural(r.lead, 'row') + (r.follow ? ', and ' + plural(r.follow, W().item) + ' follow' : '') + ', ' + r.done + ' ' + W().done), String(r.lead || ''), r.lead ? pct(r.done, r.lead) + '%' : '', String(r.help || ''), esc(r.teams)]), 'people');
  else h += '<p class="empty">Nobody yet.</p>';
  return h;
};
acts.person = d => { S.ui.person = d.v || ''; S.confirm = null; };
const taken = name => X.names.concat(X.teams.map(g => g.name)).some(n => n.toLowerCase() === name.toLowerCase());
submits['add-person'] = () => {
  const name = $('#newp').value.trim(); if (!name) return false;
  if (taken(name)) { toast(name + ' is already on the list.'); return false; }
  const people = peopleCopy();
  savePeople('Added ' + name, { people: people.concat([{ id: idFor(name, people), name, note: '' }]) });
  S.ui.new = null;
};
function renameEverywhere(a, b) {                       // rows that name a person or team follow the new name
  for (const [c, m] of [['entries', X.entries], ['items', X.items]]) for (const r of m.values()) {
    const p = {};
    if (Array.isArray(r.owner) ? r.owner.includes(a) : r.owner === a) p.owner = Array.isArray(r.owner) ? ownerValue(r.owner.map(x => x === a ? b : x).filter(x => x != null)) : b == null ? '' : b;
    if ((r.helpers || []).includes(a)) p.helpers = r.helpers.map(x => x === a ? b : x).filter(x => x != null);
    if (Object.keys(p).length) write(c, r.id, p, r);      // built from the row as this screen has it, and said so
  }
  for (const t of X.cfg.tables || []) for (const f of t.fields.filter(f => f.type === 'person')) for (const r of X.byTable.get(t.id) || []) if (r[f.key] === a) write('rows', r.id, { [f.key]: b == null ? '' : b });
  for (const t of X.cfg.tables || []) for (const f of t.fields.filter(f => f.type === 'people')) for (const r of X.byTable.get(t.id) || []) if (peopleIn(r, f).includes(a)) write('rows', r.id, { [f.key]: r[f.key].map(x => x === a ? b : x).filter(x => x != null) }, r);
}
changes['person-name'] = (d, t) => {
  const a = d.v, b = t.value.trim(); if (!b || a === b) return false;
  if (taken(b) && a.toLowerCase() !== b.toLowerCase()) { toast(b + ' is already on the list.'); return false; }
  action('Renamed ' + a + ' to ' + b, () => {
    putPeople({ people: peopleCopy().map(p => p.name === a ? Object.assign(p, { name: b }) : p), teams: teamsCopy().map(g => Object.assign(g, { members: g.members.map(x => x === a ? b : x), captains: g.captains.map(x => x === a ? b : x) })) });
    renameEverywhere(a, b);
  }, { row: 'People and teams', rc: 'meta', rid: 'people' });
  S.ui.person = b; S.edit = 'person/' + b;
};
acts['person-del'] = d => { if (refCount(d.v)) { S.confirm = 'person'; return; } return acts['person-del-yes'](d); };      // asks first when rows would lose them
acts['person-del-yes'] = d => {
  action('Removed ' + d.v, () => {
    putPeople({ people: peopleCopy().filter(p => p.name !== d.v), teams: teamsCopy().map(g => Object.assign(g, { members: g.members.filter(x => x !== d.v), captains: g.captains.filter(x => x !== d.v) })) });
    renameEverywhere(d.v, null);                       // and out of any table that had them
  }, { row: 'People and teams', rc: 'meta', rid: 'people' });
  S.ui.person = ''; S.edit = null; S.confirm = null;
};
changes['team-set'] = (d, t) => {
  const teams = teamsCopy(), g = teams[+d.i], v = t.value.trim(); if (!g || g[d.k] === v) return;
  if (d.k !== 'name') { g[d.k] = v; savePeople(g.name + ': ' + d.k + ' set', { teams }); return; }
  if (!v || taken(v)) { toast(v ? v + ' is already in use.' : 'A team needs a name.'); return; }
  const a = g.name; g.name = v;
  action('Renamed ' + a + ' to ' + v, () => { putPeople({ teams }); renameEverywhere(a, v); }, { row: 'People and teams', rc: 'meta', rid: 'people' });
};
changes['team-assign'] = (d, t) => { const g = X.teams[+d.i], e = t.value && curOf('entries', t.value); if (g && e && !(e.helpers || []).includes(g.name)) write('entries', e.id, { helpers: (e.helpers || []).concat([g.name]) }); };
changes['team-add'] = (d, t) => { const teams = teamsCopy(), g = teams[+d.i]; if (!g || !t.value) return; g.members.push(t.value); savePeople('Added ' + t.value + ' to ' + g.name, { teams }); };
changes['team-cap'] = (d, t) => { const teams = teamsCopy(), g = teams[+d.i]; if (!g) return; g.captains = t.checked ? g.captains.concat([d.v]) : g.captains.filter(x => x !== d.v); savePeople(d.v + (t.checked ? ' made captain of ' : ' no longer captain of ') + g.name, { teams }); };
acts['team-rm'] = d => { const teams = teamsCopy(), g = teams[+d.i]; if (!g) return; g.members = g.members.filter(x => x !== d.v); g.captains = g.captains.filter(x => x !== d.v); savePeople('Removed ' + d.v + ' from ' + g.name, { teams }); };
acts['team-del'] = d => { const g = X.teams[+d.i]; if (!g) return; if (allEntries().concat(allItems()).some(r => (r.helpers || []).includes(g.name))) S.confirm = 'team-' + tid(g); else { savePeople('Deleted ' + g.name, { teams: teamsCopy().filter((x, i) => i !== +d.i) }); S.edit = null; } };
acts['team-del-yes'] = d => { const g = X.teams[+d.i]; if (!g) return; action('Deleted ' + g.name, () => { putPeople({ teams: teamsCopy().filter((x, i) => i !== +d.i) }); renameEverywhere(g.name, null); }, { row: 'People and teams', rc: 'meta', rid: 'people' }); S.confirm = null; S.edit = null; };
submits['add-team'] = () => {
  const name = $('#newteam').value.trim(); if (!name) return false;
  if (taken(name)) { toast(name + ' is already in use.'); return false; }
  const teams = teamsCopy();
  const id = idFor(name, teams);
  savePeople('Added team ' + name, { teams: teams.concat([{ id, name, type: $('#newteam-type').value, captains: [], members: [], note: '' }]) });
  S.ui.new = null; S.edit = 'team/' + idOf(id); S.jump = 'team-' + idOf(id);
};
const saveTypes = (label, teamTypes) => saveCfg(label, () => putCfg({ teamTypes }));
submits['add-type'] = () => { const v = $('#newtype').value.trim(), types = X.cfg.teamTypes || []; if (!v || types.includes(v)) return false; saveTypes('Added team type ' + v, types.concat([v])); };
acts['type-del'] = d => { saveTypes('Removed team type ' + d.v, (X.cfg.teamTypes || []).filter(x => x !== d.v)); };
