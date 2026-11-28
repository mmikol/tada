/* Settings: the event's own vocabulary (sections, entry types, item kinds, statuses, tables), its details, and its data. */
import { $, esc, S, X, W, isTemplate, views, acts, changes, submits, CW, plural, options, line, fold, action, setView, write, remove, toast, download, eq, store, P, idOf, stageOf, renderSoon, head, askDel, delBtn, formEnd, moneyRole, create, nextSeq, listName , navHead, splitK, HEADS, ownHeads, refused, putCfg, saveCfg } from './core.js';
import { api } from './store.js';
import { filesOf } from './remote.js';
import { newId, withIds, idFor, copy } from './rules.js';
import { COLORS, FIELD_TYPES, WORDS, VIEWS, slug, uniqueKey, isDate, addDays, dayLabel, dayLong, dateRange, templatePack, layoutFor, grouped, fieldBlank } from './model.js';
import { exportPack, planCsv, importClaudeBackup, loadOrigin, originFailed } from './history.js';
import { gapList } from './plan.js';
import { deviceBox } from './home.js';

const TYPE_NAMES = { text: 'Text', long: 'Long text', number: 'Number', money: 'Money', date: 'Date', choice: 'Choice', check: 'Tick box', person: 'One person', people: 'People', photo: 'Photo' };
const T = (k, label, t, more) => Object.assign({ k, label, t: t || 'text' }, more);
const PROPS = {
  sections: [T('label', 'Short name'), T('long', 'Full name'), T('kind', 'Kind', 'choice', { options: [['day', 'A day'], ['general', 'A list, not a day']] }), T('date', 'Date', 'date'), T('note', 'Note'), T('color', 'Colour', 'color')],
  entryTypes: [T('name', 'Name'), T('general', 'For general sections', 'check'), T('slots', 'Slots', 'list'), T('daily', 'Expected every day', 'list'), T('sourceLabel', 'Source label'), T('sources', 'Sources', 'list'), T('tasks', 'Standard tasks', 'list'), T('taskSlots', 'Tasks only for slots', 'list')],
  itemKinds: [T('label', 'Checklist name'), T('task', 'Standard tasks go here', 'check'), T('quiet', 'Left off printed checklists unless ticked', 'check')],
  statuses: [T('name', 'Name'), T('stage', 'Counts as', 'stage'), T('tone', 'Colour', 'choice', { options: [['', 'None'], ['good', 'Green'], ['warn', 'Amber']] }), T('items', 'Items only', 'check')],
  fields: [T('label', 'Name'), T('type', 'Type', 'choice', { options: FIELD_TYPES.map(t => [t, TYPE_NAMES[t] || t]) }), T('options', 'Choices', 'list'), T('title', 'Shown as the row’s name', 'check'), T('quick', 'Editable in the list', 'check'), T('sum', 'Totalled', 'check'), T('counts', 'Counts as', 'choice', { options: [['', 'Neither'], ['spent', 'Money spent'], ['planned', 'Money planned']] }), T('attention', 'Flag in Gaps when', 'list'), T('once', 'Each person in one row only', 'check'), T('gap', 'List in Gaps who is left out', 'check')],
};
const titleOf = kind => ({ sections: 'Days and lists', entryTypes: W().Entry + ' types', itemKinds: 'Checklists', statuses: 'Statuses' })[kind];      // a settings list by its kind
const listTitle = L => titleOf(L.kind) || L.table.name + ' fields';
/* Where each status sits in the workflow. The progress figures count Finished as done and Under way as under way; Left out of counts takes a row out of them. */
const STAGES = [['todo', 'Not started'], ['doing', 'Under way'], ['done', 'Finished'], ['skip', 'Left out of counts']];      // named with the event's own words
/* A settings list by its id: "statuses", or "fields:<table id>". Returns a copy to change and a way to save it. The copy is of what this screen
   shows, and is saved saying so, so a change someone else made meanwhile stays. Every item carries an id (or a key), which a rename keeps. */
function listOf(l) {
  if (!l.startsWith('fields:')) return { kind: l, list: withIds(copy(X.cfg[l] || [])), save: list => putCfg({ [l]: list }) };
  const tables = copy(X.cfg.tables || []), t = tables.find(x => x.id === l.slice(7));
  return { kind: 'fields', table: t, list: t ? t.fields : [], save: () => putCfg({ tables }) };
}
const rowKey = (row, i) => idOf(row.key != null ? 'k' + row.key : row.id != null ? 'i' + row.id : row.name != null ? 'n' + row.name : 'x' + i);      // a box's id follows its item, not its place
/* One item of a settings list as a form: the same boxes whether it is shown in Settings or on its own page (a day, a table, a list). */
function rowFields(l, i) {
  const { kind, list } = listOf(l), row = list[i], dis = CW() ? '' : ' disabled', id = l.replace(/[^a-z0-9]/gi, '-');
  let h = '';
  for (const p of PROPS[kind]) {
    const eid = 'cf-' + id + '-' + rowKey(row, i) + '-' + p.k, at = ' id="' + eid + '" data-act="cfg" data-l="' + esc(l) + '" data-i="' + i + '" data-k="' + p.k + '"' + dis, v = row[p.k];
    if (kind === 'fields' && p.k === 'options' && row.type !== 'choice') continue;
    if (kind === 'fields' && p.k === 'counts' && row.type !== 'money') continue;
    if (kind === 'fields' && (p.k === 'once' || p.k === 'gap') && row.type !== 'people') continue;
    if (kind === 'fields' && (p.k === 'sum' || p.k === 'attention' || p.k === 'title') && row.type === 'people') continue;
    if (kind === 'sections' && p.k === 'date' && row.kind !== 'day') continue;
    if (p.t === 'color') h += '<div><span class="lab">' + esc(p.label) + '</span><div class="sw">' + Array.from({ length: COLORS }, (x, c) => '<button type="button" class="c' + c + '" data-act="cfg-color" data-l="' + esc(l) + '" data-i="' + i + '" data-v="' + c + '" aria-pressed="' + ((Number(v) || 0) === c) + '" aria-label="Colour ' + (c + 1) + '"' + dis + '></button>').join('') + '</div></div>';
    else if (p.t === 'check') h += '<label class="chk" for="' + eid + '"><input type="checkbox"' + at + (v ? ' checked' : '') + '> ' + esc(p.label) + '</label>';
    else if (p.t === 'choice' || p.t === 'stage') { const opts = p.t === 'stage' ? STAGES : p.options, cur = p.t === 'stage' ? stageOf(row) : p.k === 'counts' ? moneyRole(row) : v || '';
      h += '<label for="' + eid + '">' + esc(p.label) + '<select' + at + '>' + (Array.isArray(opts[0]) ? opts.map(([ov, ol]) => '<option value="' + esc(ov) + '"' + (cur === ov ? ' selected' : '') + '>' + esc(ol) + '</option>').join('') : options(opts, cur, null)) + '</select></label>'; }
    else h += '<label for="' + eid + '"' + (p.t === 'list' ? ' class="wide2"' : '') + '>' + esc(p.label) + (p.t === 'date' ? '<input type="date" value="' + esc(v == null ? '' : v) + '"' + at + '>' : line(at + (p.t === 'list' ? ' placeholder="Separate with commas"' : ''), Array.isArray(v) ? v.join(', ') : v)) + '</label>';
  }
return h;
}
function listEditor(l) {
  const { list } = listOf(l);
  let h = '';
  list.forEach((row, i) => {
    h += '<div class="cfg"><div class="ed">' + rowFields(l, i);
    h += '</div>' + (CW() ? '<div class="cfg-b"><button type="button" class="more" data-act="cfg-up" data-l="' + esc(l) + '" data-i="' + i + '" aria-label="Move up"' + (i ? '' : ' disabled') + '>↑</button><button type="button" class="more" data-act="cfg-del" data-l="' + esc(l) + '" data-i="' + i + '" aria-label="Remove ' + esc(row.name || row.label || '') + '">×</button></div>' : '') + '</div>';
  });
  return h + (CW() ? '<div class="pad"><button type="button" class="btn sm" data-act="cfg-add" data-l="' + esc(l) + '" style="margin:0.5rem 0">Add</button></div>' : '');
}
function rename(colls, field, a, b, only) {            // rows using a renamed word follow it
  for (const c of colls) for (const r of X[c].values()) if (r[field] === a && (!only || only(r))) write(c, r.id, { [field]: b });
}
/* A key for a new section or field: one nobody else can pick at the same moment, and never one a deleted item had (rows may still hold its values). */
/* A new day: with no name, the day after the last dated one (or "New day" when none has a date), coloured after the sections before it. */
function nextDay(list, name) {
  const last = list.filter(s => s.kind === 'day' && isDate(s.date)).map(s => s.date).sort().pop(), date = last ? addDays(last, 1) : '';
  const label = name || (date ? dayLabel(date) : 'New day');
  return { key: freshKey('d', list), kind: 'day', label, long: name || (date ? dayLong(date) : label), date, note: '', color: list.length % COLORS };
}
const freshKey = (pre, list) => uniqueKey(pre + '-' + newId().slice(0, 6), list.map(x => x.key));
const oneChanged = (a, b) => { if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return null; const d = a.map((x, i) => i).filter(i => a[i] !== b[i]); return d.length === 1 ? [a[d[0]], b[d[0]]] : null; };
changes.cfg = (d, t) => {
  const L = listOf(d.l), row = L.list[+d.i], p = PROPS[L.kind].find(x => x.k === d.k);
  if (!row || !p) return;
  if (p.t === 'stage') {                                // one choice sets the three switches it stands for
    if (stageOf(row) === t.value || !STAGES.some(x => x[0] === t.value)) return;
    Object.assign(row, { done: t.value === 'done', skip: t.value === 'skip', doing: t.value === 'doing' });
    saveCfg('Statuses: ' + row.name + ' counts as ' + STAGES.find(x => x[0] === t.value)[1].toLowerCase(), () => L.save(L.list));
    return;
  }
  if (d.k === 'counts') {                              // shown as what the field counts as now, guessed from its name until it is set
    if (moneyRole(row) === t.value) return;
    row.counts = t.value;
    saveCfg(L.table.name + ': ' + row.label + ' counts as ' + ({ spent: 'money spent', planned: 'money planned' }[t.value] || 'neither'), () => L.save(L.list));
    return;
  }
  const v = p.t === 'check' ? t.checked : p.t === 'list' ? [...new Set(t.value.split(',').map(x => x.trim()).filter(Boolean))] : t.value.trim(), old = row[d.k];
  if (eq(old == null ? (p.t === 'list' ? [] : p.t === 'check' ? false : '') : old, v)) return;
  const nameKey = L.kind === 'sections' || L.kind === 'fields' || L.kind === 'itemKinds' ? 'label' : 'name';
  if (d.k === nameKey && (!v || L.list.some((x, i) => i !== +d.i && String(x[nameKey]).toLowerCase() === v.toLowerCase()))) { toast(v ? '“' + v + '” is already in use.' : 'A name is needed.'); return; }
  row[d.k] = v;
  if (L.kind === 'sections') {
    if (d.k === 'date' && isDate(v)) { if (!old || row.label === dayLabel(old) || /^(New day|Day \d+)$/.test(row.label)) row.label = dayLabel(v); if (!old || row.long === dayLong(old) || /^(New day|Day \d+)$/.test(row.long)) row.long = dayLong(v); }
    if (d.k === 'kind' && v !== 'day') row.date = '';
  }
  saveCfg(listTitle(L) + ': ' + (row[nameKey] || '') + ' edited', () => {
    if (L.kind === 'entryTypes' && Array.isArray(v)) {   // one slot or source renamed: carry it into the type's other lists and onto the rows
      const ch = oneChanged(old || [], v);
      if (ch && (d.k === 'slots' || d.k === 'sources')) {
        if (d.k === 'slots') for (const k of ['daily', 'taskSlots']) row[k] = (row[k] || []).map(x => x === ch[0] ? ch[1] : x);
        rename(['entries'], d.k === 'slots' ? 'slot' : 'source', ch[0], ch[1], r => r.type === row.name);
      }
    }
    if (d.k === 'options' && L.kind === 'fields') { const ch = oneChanged(old || [], v); if (ch) row.attention = (row.attention || []).map(x => x === ch[0] ? ch[1] : x); }      // a renamed choice is still flagged
    L.save(L.list);
    if (d.k === 'name' && L.kind === 'statuses') rename(['entries', 'items'], 'status', old, v);
    if (d.k === 'name' && L.kind === 'entryTypes') { rename(['entries'], 'type', old, v); renameInBoards('slots', 'type', old, v); }
    if (d.k === 'options' && L.kind === 'fields') { const ch = oneChanged(old || [], v); if (ch) rename(['rows'], row.key, ch[0], ch[1], r => r.t === L.table.id); }
    if (L.kind === 'sections' && d.k === 'date') syncDates(L.list);
  });
};
/* A widget that picks something by name (the daily slots of one type) follows it when it is renamed, in the same change. */
function renameInBoards(kind, key, a, b) {
  const raw = X.cfgRaw, boards = JSON.parse(JSON.stringify(raw.boards || {}));
  let n = 0;
  for (const name of Object.keys(boards)) for (const w of Array.isArray(boards[name]) ? boards[name] : []) if (w && w.kind === kind && w[key] === a) { w[key] = b; n++; }
  if (n) putCfg({ boards }, raw);
}
function syncDates(sections) {                          // the event's date line follows its days
  const ds = sections.filter(s => s.date).map(s => s.date).sort(), was = (X.cfg.sections || []).filter(s => s.date).map(s => s.date).sort();
  if (ds.length && (!X.plan.dates || X.plan.dates === dateRange(was[0], was[was.length - 1]))) write('plan', S.plan, { dates: dateRange(ds[0], ds[ds.length - 1]) });
}
acts['cfg-add'] = d => {
  const L = listOf(d.l), n = L.list.length;
  const taken = k => L.list.map(x => String(x[k] || '').toLowerCase());
  const fresh = base => { let v = base, i = 2; while (taken(L.kind === 'sections' || L.kind === 'fields' ? 'label' : 'name').includes(v.toLowerCase())) v = base + ' ' + i++; return v; };
  if (L.kind === 'sections') { const row = nextDay(L.list); if (taken('label').includes(row.label.toLowerCase())) row.label = row.long = fresh(row.label); L.list.push(row); }
  else if (L.kind === 'fields') { const nm = fresh('New field'); L.list.push({ key: freshKey('f', L.list), label: nm, type: 'text' }); }
  else if (L.kind === 'itemKinds') { let nm = 'New checklist', i = 2; while (L.list.some(x => [x.name, x.label].some(v => String(v || '').toLowerCase() === nm.toLowerCase()))) nm = 'New checklist ' + i++; L.list.push({ id: idFor(nm, L.list), name: nm, label: nm }); }
  else { const nm = fresh(L.kind === 'statuses' ? 'New status' : 'New type'); L.list.push({ id: idFor(nm, L.list), name: nm }); }
  saveCfg(listTitle(L) + ': added one', () => { L.save(L.list); if (L.kind === 'sections') syncDates(L.list); });      // a new day has a date, so the event's date line follows
};
acts['cfg-del'] = d => {
  const L = listOf(d.l), row = L.list[+d.i];
  if (!row) return;
  if (L.kind === 'sections') { const n = (X.bySec[row.key] || []).length + (X.loose[row.key] || []).length; if (n) { toast('Move or delete its ' + plural(n, 'row') + ' first.'); return false; } }
  if (L.kind === 'fields' && L.list.length === 1) { toast('A table needs at least one field.'); return false; }
  L.list.splice(+d.i, 1);
  saveCfg(listTitle(L) + ': removed ' + (row.name || row.label || ''), () => L.save(L.list));
};
acts['cfg-color'] = d => { const L = listOf(d.l), row = L.list[+d.i]; if (!row || (Number(row.color) || 0) === +d.v) return; row.color = +d.v; saveCfg('Sections: ' + row.label + ' colour changed', () => L.save(L.list)); };
acts['cfg-up'] = d => { const L = listOf(d.l), i = +d.i; if (i < 1) return; L.list.splice(i - 1, 0, L.list.splice(i, 1)[0]); saveCfg(listTitle(L) + ': order changed', () => L.save(L.list)); };
changes.tbl = (d, t) => {
  const tables = copy(X.cfg.tables || []), tb = tables[+d.i], v = t.value.trim();
  if (!tb || tb[d.k] === v) return;
  if (d.k === 'name' && (!v || tables.some((x, i) => i !== +d.i && x.name.toLowerCase() === v.toLowerCase()))) { toast(v ? '“' + v + '” is already in use.' : 'A name is needed.'); return; }
  tb[d.k] = v;
  if (d.k === 'layout' || d.k === 'group') delete S.ui['lay-' + tb.id];      // the table's own setting speaks again, over a switch pressed on its page earlier
  saveCfg('Sheet ' + tb.name + ' edited', () => putCfg({ tables }));
};
/* From the side list: a new day or section under Plan, or a new table under the heading whose + was pressed. */
submits['nav-add'] = d => {
  const name = String(d.name || '').trim();
  if (d.kind === 'head') return addHead(name);
  if (d.kind === 'sheet') { const id = newSheet(name, d.g); if (id) { S.ui.navAdd = null; setView('t', id); } return false; }
  const list = copy(X.cfg.sections || []);
  let row;
  if (d.kind === 'day') row = nextDay(list, name);
  else {                                                 // a list: rows with a DRI, a status and a date, under the section it was added from
    if (!name) { toast('A list needs a name.'); return false; }
    row = Object.assign({ key: freshKey('s', list), kind: 'general', label: name, long: name, date: '', note: '', color: list.length % COLORS }, d.g && d.g !== 'Tables' ? { nav: d.g } : null);
  }
  if (list.some(s => String(s.label).toLowerCase() === row.label.toLowerCase())) { toast('“' + row.label + '” is already in use.'); return false; }
  const at = list.map(s => s.kind).lastIndexOf(row.kind);
  list.splice(at < 0 ? list.length : at + 1, 0, row);          // a day after the other days, a list after the other lists
  saveCfg((row.kind === 'day' ? 'Added the day ' : 'Added the list ') + row.label, () => { putCfg({ sections: list }); if (row.date) syncDates(list); });
  S.ui.navAdd = null; setView('s', row.key);
  return false;
};
/* A section of the event's own in the side list, empty until a list or a sheet is added to it or moved there. */
const BUILT_IN = ['schedule', 'lists', 'sheets', 'tables', 'people', 'more', 'plan', 'follow up', 'event', 'template'];
function addHead(name) {
  if (!name) { toast('A section needs a name.'); return false; }
  if (BUILT_IN.includes(name.toLowerCase()) || ownHeads().some(h => h.toLowerCase() === name.toLowerCase())) { toast('“' + name + '” is already in use.'); return false; }
  saveCfg('Added the section ' + name, () => putCfg({ navHeads: (X.cfg.navHeads || []).concat([name]) }));
  S.ui.navAdd = null;
}
/* What a section of the event's own holds: its lists and its sheets. */
const inHead = h => ({ lists: (X.cfg.sections || []).filter(s => s.kind !== 'day' && navHead(s) === h), sheets: (X.cfg.tables || []).filter(t => navHead(t) === h) });
acts['nav-move'] = d => {                               // a list or a sheet to another section (Lists, or one of the event's own)
  const [kind, id] = splitK(d.k), place = x => { if (d.g === 'Tables') delete x.nav; else x.nav = d.g; }, where = HEADS[d.g] || d.g;
  if (kind === 'sec') { const L = listOf('sections'), s = L.list.find(x => x.key === id); if (!s) return; place(s); saveCfg('Moved ' + s.label + ' to ' + where, () => L.save(L.list)); }
  else { const tables = copy(X.cfg.tables || []), x = tables.find(y => y.id === id); if (!x) return; place(x); saveCfg('Moved ' + x.name + ' to ' + where, () => putCfg({ tables })); }
};
/* A new sheet, with a name and a notes field, under the heading it was added from; a missing or taken name is refused with a word. Returns its id. */
function newSheet(name, nav) {
  const tables = copy(X.cfg.tables || []);
  if (!name) { toast('A sheet needs a name.'); return ''; }
  if (tables.some(x => x.name.toLowerCase() === name.toLowerCase())) { toast('“' + name + '” is already in use.'); return ''; }
  const id = uniqueKey(slug(name) || 'table', tables.map(x => x.id));
  tables.push(Object.assign({ id, name, one: 'row', group: '', fields: [{ key: 'name', label: 'Name', type: 'text', title: true }, { key: 'notes', label: 'Notes', type: 'long' }] }, nav && nav !== 'Tables' ? { nav } : null));
  saveCfg('Added sheet ' + name, () => putCfg({ tables }));
  return id;
}
submits['add-table'] = () => { const id = newSheet($('#newtable').value.trim()); if (!id) return false; S.ui.fold = 'tb-' + id; };
acts['table-del'] = d => { S.confirm = 'table-' + d.id; };
acts['table-del-yes'] = d => {
  const t = (X.cfg.tables || []).find(x => x.id === d.id), rows = X.byTable.get(d.id) || [];
  if (!t) return;
  saveCfg('Deleted sheet ' + t.name + ' and ' + plural(rows.length, 'row'), () => { for (const r of rows) remove('rows', r.id); putCfg({ tables: X.cfg.tables.filter(x => x.id !== d.id) }); });
  S.confirm = null; S.ui.fold = null;
  if (S.view === 't' && S.arg === d.id) { S.edit = null; setView('overview'); return false; }      // deleted from its own page
};

/* The side list's ⋯ menus: rename in place, delete (asking first when rows would go with it), hide a built-in page, add the next day. */
acts['nav-add-day'] = () => submits['nav-add']({ g: 'Plan', kind: 'day', name: '' });
acts['nav-del'] = d => {
  const [kind, id] = splitK(d.k);
  if (kind === 'sec') {
    const s = (X.cfg.sections || []).find(x => x.key === id); if (!s) return;
    if ((X.cfg.sections || []).length < 2) { toast('An event needs at least one day or list.'); return false; }
    if (!rowsIn(id)) return acts['nav-del-yes'](d);
    S.ui.navAsk = { k: d.k, q: 'Delete ' + (s.long || s.label) + ' and ' + plural(rowsIn(id), 'row') + ' in it?' };
  } else if (kind === 'tbl') {
    const t = (X.cfg.tables || []).find(x => x.id === id), n = (X.byTable.get(id) || []).length; if (!t) return;
    S.ui.navAsk = { k: d.k, q: 'Delete the sheet ' + t.name + (n ? ' and its ' + plural(n, 'row') : '') + '?' };
  } else if (kind === 'head') {
    const { lists, sheets } = inHead(id), bits = [lists.length && plural(lists.length, 'list'), sheets.length && plural(sheets.length, 'sheet')].filter(Boolean);
    if (!bits.length) return acts['nav-del-yes'](d);
    S.ui.navAsk = { k: d.k, q: 'Delete the section ' + id + '? Its ' + bits.join(' and ') + ' move to Lists.' };
  }
};
acts['nav-del-yes'] = d => {
  S.ui.navAsk = null;
  const [kind, id] = splitK(d.k);
  if (kind === 'sec') return acts['sec-del-yes']({ k: id });
  if (kind === 'tbl') return acts['table-del-yes']({ id });
  const L = listOf('sections'), tables = copy(X.cfg.tables || []);      // a section: what it held moves to Lists, nothing is deleted with it
  for (const x of L.list.concat(tables)) if (x.kind !== 'day' && navHead(x) === id) delete x.nav;
  saveCfg('Deleted the section ' + id, () => { L.save(L.list); putCfg({ tables, navHeads: (X.cfg.navHeads || []).filter(h => h !== id) }); });
};
acts['nav-hide'] = d => {
  if ((X.cfg.viewsOff || []).includes(d.v)) return;
  saveCfg('Hid ' + ((VIEWS.find(v => v[0] === d.v) || [])[1] || d.v) + ' from the side list', () => putCfg({ viewsOff: (X.cfg.viewsOff || []).concat([d.v]) }));
};
submits['nav-ren'] = d => {
  const [kind, id] = splitK(d.k), v = String(d.name || '').trim().slice(0, 60), taken = n => toast('“' + n + '” is already in use.');
  if (!v) return;
  if (kind === 'sec') {
    const L = listOf('sections'), s = L.list.find(x => x.key === id);
    if (!s || s.label === v) return;
    if (L.list.some(x => x.key !== id && String(x.label).toLowerCase() === v.toLowerCase())) return taken(v);
    const was = s.label; s.label = v; s.long = v;
    saveCfg('Renamed ' + was + ' to ' + v, () => L.save(L.list));
  } else if (kind === 'tbl') {
    const tables = copy(X.cfg.tables || []), t = tables.find(x => x.id === id);
    if (!t || t.name === v) return;
    if (tables.some(x => x.id !== id && x.name.toLowerCase() === v.toLowerCase())) return taken(v);
    const was = t.name; t.name = v;
    saveCfg('Renamed the sheet ' + was + ' to ' + v, () => putCfg({ tables }));
  } else if (kind === 'head') {                          // a section is its name in the side list's own list and in what it holds: all change together
    if (v === id) return;
    if (BUILT_IN.includes(v.toLowerCase()) || ownHeads().some(h => h !== id && h.toLowerCase() === v.toLowerCase())) return taken(v);
    const L = listOf('sections'), tables = copy(X.cfg.tables || []);
    for (const x of L.list.concat(tables)) if (x.kind !== 'day' && navHead(x) === id) x.nav = v;
    saveCfg('Renamed the section ' + id + ' to ' + v, () => { L.save(L.list); putCfg({ tables, navHeads: (X.cfg.navHeads || []).map(h => h === id ? v : h) }); });
  }
};

/* What this event calls things, how it writes money and times, and which views and checks it uses: all kept in its setup, so a template carries them. */
const WORD_LABELS = { owner: 'Leader', helper: 'Helper', entry: 'Schedule row', item: 'Checklist row' };
changes.word = (d, t) => {                             // an empty box, or the usual word, takes the word out: the usual one shows again
  const words = Object.assign({}, X.cfg.words), v = t.value.trim().slice(0, 24);
  if (v && v !== WORDS[d.k]) words[d.k] = v; else delete words[d.k];
  if (eq(words, X.cfg.words || {})) { t.value = words[d.k] || ''; return false; }
  saveCfg('Wording: ' + (v || WORDS[d.k]), () => putCfg({ words }));
};
changes.format = (d, t) => {                           // only the one format changes: a change to the other one made meanwhile stays
  const v = d.k === 'currency' ? t.value.trim().slice(0, 4) : t.value;
  if ((X.fmt[d.k] || '') === v) return false;
  saveCfg('Formats changed', () => putCfg({ format: Object.assign({}, X.cfg.format, { [d.k]: v }) }));
};
changes.off = (d, t) => {                              // d.g: viewsOff or checksOff; ticked means on
  const list = (X.cfg[d.g] || []).filter(x => x !== d.v);
  if (!t.checked) list.push(d.v);
  saveCfg((d.g === 'viewsOff' ? 'View ' : 'Check ') + (t.checked ? 'switched on' : 'switched off'), () => putCfg({ [d.g]: list }));
};
submits['save-template'] = () => {
  const name = $('#tpl-name').value.trim(), keep = { rows: $('#tpl-rows').checked, people: $('#tpl-people').checked, tables: $('#tpl-tables').checked };
  if (!name) return false;
  const docs = [];
  for (const [path, data] of store.docs) if (path.startsWith(P()) && !/^(log|meta)\//.test(path.slice(P().length))) docs.push({ path: path.slice(P().length), data });
  const pack = templatePack({ id: uniqueKey('tpl-' + (slug(name) || 'template'), X.plans.map(p => p.id)), name, note: 'Saved from ' + X.plan.name + '.', config: X.cfg, people: X.people, docs, keep });
  api('api/plans/import', { method: 'POST', body: pack }).then(() => toast('Saved as the template “' + name + '”. New events can start from it.'), e => refused(e, 'Not saved'));
};

views.settings = () => {
  const p = X.plan, dis = CW() ? '' : ' disabled', w = X.cfg.words || {}, tpl = isTemplate(), what = tpl ? 'template' : 'event';
  const pf = (k, label, cls) => '<label class="' + (cls || '') + '" for="pl-' + k + '">' + label + line(' id="pl-' + k + '" data-c="plan" data-id="' + esc(S.plan) + '" data-f="' + k + '"' + dis, p[k] || '') + '</label>';
  let h = head('Settings') + '<h3>' + (tpl ? 'Template' : 'Event') + '</h3><div class="box"><div class="pad"><div class="ed">' + pf('name', 'Name', 'wide') + (tpl ? '' : pf('dates', 'Dates') + pf('venue', 'Venue', 'wide2')) + pf('note', tpl ? 'What it is for' : 'Note', 'wide') + '</div></div></div>';

  h += '<h3>Wording and formats</h3><p class="muted hint">Leave a word empty to use the usual one.</p><div class="box"><div class="pad"><div class="ed">' +
    Object.keys(WORDS).map(k => '<label for="wd-' + k + '">' + WORD_LABELS[k] + '<input id="wd-' + k + '" data-act="word" data-k="' + k + '" value="' + esc(w[k] || '') + '" placeholder="' + esc(WORDS[k]) + '" maxlength="24"' + dis + '></label>').join('') +
    '<label for="fm-currency">Currency sign<input id="fm-currency" data-act="format" data-k="currency" value="' + esc(X.fmt.currency) + '" maxlength="4"' + dis + '></label>' +
    '<label for="fm-clock">Clock<select id="fm-clock" data-act="format" data-k="clock"' + dis + '>' + [['12', '12-hour (3:30 PM)'], ['24', '24-hour (15:30)']].map(([v, l]) => '<option value="' + v + '"' + (X.fmt.clock === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label></div></div></div>';

  h += '<h3>Views</h3><div class="box in"><div class="tools">' + VIEWS.map(([v, label]) => '<label class="chk" for="vw-' + v + '"><input type="checkbox" id="vw-' + v + '" data-act="off" data-g="viewsOff" data-v="' + v + '"' + (X.off.has(v) ? '' : ' checked') + dis + '> ' + label + '</label>').join('') + '</div></div>';

  h += '<h3>Vocabulary</h3>';
  for (const l of ['sections', 'entryTypes', 'itemKinds', 'statuses']) h += fold('cfg-' + l, (X.cfg[l] || []).length, titleOf(l), () => (l === 'statuses' ? '<p class="muted pad">The first status that counts as Finished names the progress figures.</p>' : '') + listEditor(l), true);
  const checks = gapList(true).filter(g => !g.table);
  h += fold('cfg-checks', checks.filter(g => !X.off.has('check:' + g.k)).length, 'Checks that run in Gaps', () => '<div class="pad chks">' + checks.map(g => '<label class="chk" for="ck-' + g.k + '"><input type="checkbox" id="ck-' + g.k + '" data-act="off" data-g="checksOff" data-v="' + g.k + '"' + (X.off.has('check:' + g.k) ? '' : ' checked') + dis + '> ' + esc(g.t) + '</label>').join('') +
    '<p class="muted">A table can add its own check: in its fields below, “Flag in Gaps when”.</p></div>');
  h += '<h3>Sheets</h3>';
  (X.cfg.tables || []).forEach((t, i) => {
    h += fold('tb-' + t.id, (X.byTable.get(t.id) || []).length, t.name, () => '<div class="pad"><div class="ed">' + tableProps(t, i) + '</div></div>' +
      '<div class="gh">Fields</div>' + listEditor('fields:' + t.id) + (CW() ? '<div class="pad fe">' + (S.confirm === 'table-' + t.id ? askDel('Delete the sheet and its ' + plural((X.byTable.get(t.id) || []).length, 'row') + '?', ' data-act="table-del-yes" data-id="' + esc(t.id) + '"')
        : delBtn(' data-act="table-del" data-id="' + esc(t.id) + '"', 'Delete sheet')) + '</div>' : ''), true);
  });
  if (CW()) h += '<div class="box in"><form class="add" data-act="add-table"><input id="newtable" placeholder="New table, e.g. Vendors" aria-label="Name of the new table" autocomplete="off"><button class="btn" type="submit">Add table</button></form></div>';

  if (CW() && !tpl) h += '<h3>Save as a template</h3><div class="box in"><p class="muted hint">Keeps this event’s setup for the next one, without its dates, progress or costs.</p>' +
    '<form class="add tplf" data-act="save-template"><input id="tpl-name" placeholder="Name of the template" aria-label="Name of the template" autocomplete="off" required>' +
    '<span class="row" style="flex-basis:100%"><label class="chk" for="tpl-rows"><input type="checkbox" id="tpl-rows" checked> ' + esc(W().Entries + ', ' + W().items) + ' and handouts</label><label class="chk" for="tpl-people"><input type="checkbox" id="tpl-people"> People, teams and rowKey leads what</label>' +
    '<label class="chk" for="tpl-tables"><input type="checkbox" id="tpl-tables"> Table rows</label></span><button class="btn" type="submit">Save as template</button></form></div>';
  h += '<h3>Data</h3><div class="box in"><div class="tools"><button type="button" class="btn" data-act="export-json">Export ' + what + ' (.json)</button><button type="button" class="btn" data-act="export-csv">' + esc(W().Entries + ' and ' + W().items) + ' (.csv)</button></div>';
  const auto = CW() && !tpl ? importText() : null;
  const costs = itemCosts(), into = spentTable();
  if (CW() && costs.length && into) h += '<div class="tools"><button type="button" class="btn" data-act="costs-to-table">Move ' + plural(costs.length, W().item + ' cost') + ' into ' + esc(into.name) + '</button></div>';
  else if (CW() && costs.length) h += '<p class="muted hint">' + esc(plural(costs.length, W().item) + ' still carry a cost. Add a sheet with a money field that counts as money spent, and they can move there.') + '</p>';
  if (auto && (auto.notes.length || auto.asks.length)) h += '<div class="tools">' + (auto.notes.length ? '<button type="button" class="btn" data-act="clear-import" data-v="notes">Clear ' + plural(auto.notes.length, 'note') + ' the import wrote</button>' : '') +
    (auto.asks.length ? '<button type="button" class="btn" data-act="clear-import" data-v="asks">Clear ' + plural(auto.asks.length, 'question') + ' the import raised</button>' : '') + '</div>';
  if (CW() && X.origin && (X.origin.page1 || []).length) h += '<div class="tools"><label class="btn file" for="imp-claude">Bring in a backup from the Claude page<input type="file" id="imp-claude" accept=".json,application/json" data-act="import-claude"></label></div>';
  if (CW()) h += '<div class="tools">' + (S.confirm === 'plan' ? askDel('Delete “' + p.name + '” for everyone?', ' data-act="plan-del-yes"') : '<button type="button" class="btn danger" data-act="plan-del">Delete ' + what + '</button>') + '</div>';
  return h + '</div><h3>This device</h3>' + deviceBox();
};
acts['export-json'] = () => {                           // the event and its photos in one file, so it can be taken to another copy of the app whole
  const pack = exportPack(), id = S.plan, photos = pack.docs.flatMap(d => Object.values(d.data)).filter(v => typeof v === 'string' && v.startsWith('files/' + id + '/'));
  filesOf(photos, id).then(r => {
    download(id + '.json', JSON.stringify(Object.keys(r.files).length ? Object.assign(pack, { files: r.files }) : pack), 'application/json');
    if (r.missed) toast('Only ' + (r.asked - r.missed) + ' of ' + plural(r.asked, 'photo') + ' could be read, so the file is missing the rest. Export again when the connection is steady.', null, null, true);
  });
  return false;
};
/* Text the import wrote, not a person: notes on rows (and "as written" remarks in tables) still exactly as first loaded, and the open questions it raised
   in Decisions that nobody has answered or changed. Clearing them is one change in History, so Undo brings them back. */
function importText() {
  if (!S.orig || S.origFor !== S.plan) { if (!originFailed()) loadOrigin().then(renderSoon, renderSoon); return null; }
  const same = (c, r, k) => { const o = S.orig.get(c + '/' + r.id); return !!o && typeof r[k] === 'string' && r[k] !== '' && o[k] === r[k]; };
  const notes = [];
  for (const c of ['entries', 'items']) for (const r of X[c].values()) if (same(c, r, 'notes')) notes.push([c, r, 'notes']);
  for (const r of X.rows.values()) for (const k of Object.keys(r)) if (/\bas written: /.test(String(r[k])) && same('rows', r, k)) notes.push(['rows', r, k]);
  const asks = [...X.decisions.values()].filter(r => { const o = S.orig.get('decisions/' + r.id); return o && !r.decision && eq(r.topic, o.topic) && eq(r.detail, o.detail) && eq(r.status, o.status); });
  return { notes, asks };
}
acts['clear-import'] = d => {
  const auto = importText();
  if (!auto) return;
  if (d.v === 'notes' && auto.notes.length) action('Cleared ' + plural(auto.notes.length, 'note') + ' the import wrote', () => { for (const [c, r, k] of auto.notes) write(c, r.id, { [k]: '' }, r); });
  if (d.v === 'asks' && auto.asks.length) action('Cleared ' + plural(auto.asks.length, 'question') + ' the import raised', () => { for (const r of auto.asks) remove('decisions', r.id); });
};
acts['export-csv'] = () => { download(S.plan + '.csv', planCsv(), 'text/csv'); return false; };
changes['import-claude'] = (d, t) => {
  const f = t.files && t.files[0];
  if (f) f.text().then(text => importClaudeBackup(JSON.parse(text))).catch(e => toast(e instanceof SyntaxError || !(e && e.message) ? 'That file could not be read.' : e.message));
  return false;
};
acts['plan-del'] = () => { S.confirm = 'plan'; };
acts['plan-del-yes'] = () => { const back = isTemplate() ? '#/~/templates' : '#/'; api('api/plans/' + S.plan, { method: 'DELETE' }).then(() => { location.hash = back; }, e => refused(e, 'Not deleted')); return false; };

/* Item costs from before money moved into tables: each becomes a line in the first table with a field for money spent, named after the item,
   in the category of the item's list where the table has one by that name. One change in History, so Undo puts them back. */
const itemCosts = () => [...X.items.values()].filter(i => Number(i.cost));
const spentTable = () => (X.cfg.tables || []).find(t => t.fields.some(f => moneyRole(f) === 'spent')) || null;
acts['costs-to-table'] = () => {
  const t = spentTable(), its = itemCosts();
  if (!t || !its.length) return false;
  const name = t.fields.find(f => f.title) || t.fields.find(f => f.type === 'text'), paid = t.fields.find(f => moneyRole(f) === 'spent'), grp = t.fields.find(f => f.key === t.group && f.type === 'choice');
  action('Moved ' + plural(its.length, W().item + ' cost') + ' into ' + t.name, () => {
    let seq = nextSeq(X.rows.values());
    for (const i of its) {
      const row = { t: t.id, seq: seq += 10 };
      for (const f of t.fields) row[f.key] = fieldBlank(f);
      if (name) row[name.key] = i.title || '';
      row[paid.key] = Number(i.cost);
      if (grp && (grp.options || []).includes(listName(i.kind))) row[grp.key] = listName(i.kind);
      create('rows', row);
      write('items', i.id, { cost: null });
    }
  }, { row: t.name });
};

function tableProps(t, i) {
  const ti = idOf(t.id), dis = CW() ? '' : ' disabled';
  return '<label for="tb-' + ti + '-name">Sheet name<input id="tb-' + ti + '-name" data-act="tbl" data-i="' + i + '" data-k="name" value="' + esc(t.name) + '"' + dis + '></label>' +
      '<label for="tb-' + ti + '-one">One row is called<input id="tb-' + ti + '-one" data-act="tbl" data-i="' + i + '" data-k="one" value="' + esc(t.one || '') + '"' + dis + '></label>' +
      '<label for="tb-' + ti + '-group">Group by<select id="tb-' + ti + '-group" data-act="tbl" data-i="' + i + '" data-k="group"' + dis + '><option value="">Nothing</option>' + t.fields.filter(f => ['choice', 'text', 'person'].includes(f.type)).map(f => '<option value="' + esc(f.key) + '"' + (t.group === f.key ? ' selected' : '') + '>' + esc(f.label) + '</option>').join('') + '</select></label>' +
      '<label for="tb-' + ti + '-nav">Heading in the side list<input id="tb-' + ti + '-nav" data-act="tbl" data-i="' + i + '" data-k="nav" value="' + esc(t.nav || '') + '" placeholder="Sheets" maxlength="30"' + dis + '></label>' +
      (grouped(t) ? '<label for="tb-' + ti + '-layout">Opens as<select id="tb-' + ti + '-layout" data-act="tbl" data-i="' + i + '" data-k="layout"' + dis + '>' + [['list', 'A list'], ['map', 'A map: a block for each group']].map(([v, l]) => '<option value="' + v + '"' + (layoutFor(t) === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' : '');
}

/* A day or section, a table, a list and the event itself are changed and deleted from their own pages, the same way as a row
   (owner, Nov 26: "how do I remove plan or table? see the CRUD HAS NOT BEEN FIXED YET"): Edit beside the title opens this form,
   and its foot has Delete on the left and Done on the right. Settings keeps the same forms for every one at once. */
const card = (inner, k, del) => '<div class="box page-ed"><div class="ed">' + inner + formEnd(k, del) + '</div></div>';
export function secEditor(key) {
  const secsNow = X.cfg.sections || [], i = secsNow.findIndex(s => s.key === key), s = secsNow[i];
  if (!s || !CW()) return '';
  const what = s.kind === 'day' ? 'day' : 'list', n = rowsIn(key);
  return card(rowFields('sections', i), 'sec/' + key, S.confirm === 'sec-' + key ? askDel('Delete ' + (s.long || s.label) + ' and ' + plural(n, 'row') + ' in it?', ' data-act="sec-del-yes" data-k="' + esc(key) + '"')
    : delBtn(' data-act="sec-del" data-k="' + esc(key) + '"', 'Delete ' + what));
}
const rowsIn = key => (X.bySec[key] || []).reduce((a, e) => a + 1 + (X.kids.get(e.id) || []).length, 0) + (X.loose[key] || []).length;
acts['sec-del'] = d => {
  if ((X.cfg.sections || []).length < 2) { toast('An event needs at least one day or list.'); return false; }
  if (rowsIn(d.k)) { S.confirm = 'sec-' + d.k; return; }
  acts['sec-del-yes'](d);
};
acts['sec-del-yes'] = d => {
  const s = (X.cfg.sections || []).find(x => x.key === d.k); if (!s) return;
  const ents = X.bySec[d.k] || [], left = (X.cfg.sections || []).filter(x => x.key !== d.k);
  saveCfg('Deleted ' + (s.long || s.label) + (rowsIn(d.k) ? ' and ' + plural(rowsIn(d.k), 'row') : ''), () => {
    for (const e of ents) { for (const i of X.kids.get(e.id) || []) remove('items', i.id); remove('entries', e.id); }
    for (const i of X.loose[d.k] || []) remove('items', i.id);
    putCfg({ sections: withIds(copy(left)) });
    syncDates(left);
  });
  S.edit = null; S.confirm = null;
  if (S.view === 's' && S.arg === d.k) { setView('overview'); return false; }      // deleted from its own page
};
export function tableEditor(id) {
  const i = (X.cfg.tables || []).findIndex(t => t.id === id), t = (X.cfg.tables || [])[i];
  if (!t || !CW()) return '';
  return '<div class="box page-ed"><div class="ed">' + tableProps(t, i) + '</div><div class="gh">Fields</div>' + listEditor('fields:' + id) +
    '<div class="ed">' + formEnd('table/' + id, S.confirm === 'table-' + id ? askDel('Delete ' + t.name + ' and its ' + plural((X.byTable.get(id) || []).length, 'row') + '?', ' data-act="table-del-yes" data-id="' + esc(id) + '"')
      : delBtn(' data-act="table-del" data-id="' + esc(id) + '"', 'Delete sheet')) + '</div></div>';
}
export function listKindEditor(name) {
  const kinds = X.cfg.itemKinds || [], i = kinds.findIndex(k => k.name === name);
  if (i < 0 || !CW()) return '';
  const n = [...X.items.values()].filter(it => it.kind === name).length;
  return card(rowFields('itemKinds', i), 'list/' + name, S.confirm === 'list-' + name ? askDel('Delete the checklist? Its ' + plural(n, W().item) + ' go to ' + listName('') + '.', ' data-act="list-del-yes" data-v="' + esc(name) + '"')
    : delBtn(' data-act="list-del" data-v="' + esc(name) + '"', 'Delete checklist'));
}
acts['list-del'] = d => { if ([...X.items.values()].some(it => it.kind === d.v)) { S.confirm = 'list-' + d.v; return; } acts['list-del-yes'](d); };
acts['list-del-yes'] = d => {
  const k = (X.cfg.itemKinds || []).find(x => x.name === d.v); if (!k) return;
  saveCfg('Deleted the checklist ' + (k.label || k.name), () => {
    for (const it of X.items.values()) if (it.kind === d.v) write('items', it.id, { kind: '' });
    putCfg({ itemKinds: withIds(copy(X.cfg.itemKinds || [])).filter(x => x.name !== d.v) });
  });
  S.edit = null; S.confirm = null; S.ui.list = '';
};
export function eventEditor() {
  if (!CW()) return '';
  const p = X.plan, tpl = isTemplate(), what = tpl ? 'template' : 'event';
  const pf = (k, label, cls) => '<label class="' + (cls || '') + '" for="ev-' + k + '">' + label + line(' id="ev-' + k + '" data-c="plan" data-id="' + esc(S.plan) + '" data-f="' + k + '"', p[k] || '') + '</label>';
  return card(pf('name', 'Name', 'wide') + (tpl ? '' : pf('dates', 'Dates') + pf('venue', 'Venue', 'wide2')) + pf('note', tpl ? 'What it is for' : 'Note', 'wide'), 'event',
    S.confirm === 'plan' ? askDel('Delete “' + p.name + '” for everyone?', ' data-act="plan-del-yes"') : delBtn(' data-act="plan-del"', 'Delete ' + what));
}
