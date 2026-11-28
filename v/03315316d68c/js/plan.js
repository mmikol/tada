/* The plan itself: one view per day or section, checklists, gaps, decisions, search. */
import { secEditor, listKindEditor } from './settings.js';
import { DECIDED, OPEN } from './model.js';
import { $, esc, S, X, W, an, views, acts, changes, submits, CW, NOBODY, fmtSpan, fmtDate, line, today, plural, qtyText, lettersOnly, daySecs, secOf, secLabel, secDot, typeDef, named, live, isDone, real, skipName, entryOf, secOfItem, allEntries, allItems, tableDef, lead, led, ownerSel, statusSel, kindSel, helpersText, ctxOf, go, refRow, ownersEdit, helpersEdit, fld, listName, UNLISTED, selFld, seg, moreMenu, moreFields, count, fold, head, newBtn, newForm, editBtn, formEnd, delBtn, askDel, printOpts, pick, isMine, sortedNames, action, write, remove, curOf, newItem, newEntry, create, nextSeq, render, setView, toast, putCfg, saveCfg } from './core.js';
import { withIds, idFor } from './rules.js';
import { unplaced, twice } from './tables.js';

const kindOrder = () => (X.cfg.itemKinds || []).map(k => k.name).concat(['']);

/* ---------- editors ---------- */
function moveSel(ctx, it) {
  let h = '<label for="' + esc(ctx + '-' + it.id + '-move') + '">Belongs to<select id="' + esc(ctx + '-' + it.id + '-move') + '" data-act="move" data-id="' + esc(it.id) + '"' + (CW() ? '' : ' disabled') + '>';
  for (const s of X.secs) {
    h += '<optgroup label="' + esc(s.long || s.label) + '">';
    for (const e of X.bySec[s.key]) if (named(e)) h += '<option value="' + esc(e.id) + '"' + (it.entry === e.id ? ' selected' : '') + '>' + esc(e.title) + '</option>';
    h += '<option value="@' + esc(s.key) + '"' + (!entryOf(it) && secOfItem(it) === s.key ? ' selected' : '') + '>' + esc(s.label) + ': loose</option></optgroup>';
  }
  return h + '</select></label>';
}
function itemEditor(ctx, it) {
  return '<div class="ed">' + fld(ctx, 'items', it, 'title', W().Item, 'text', 'wide') + fld(ctx, 'items', Object.assign({}, it, { amount: qtyText(it) }), 'amount', 'Amount', 'text', '', ' data-act="amount" placeholder="e.g. 2 bags"') +
    ownersEdit(ctx, 'items', it) + helpersEdit(ctx, 'items', it) + fld(ctx, 'items', it, 'notes', 'Notes', 'textarea', 'wide') +
    moreFields(fld(ctx, 'items', it, 'where', 'Where / how', 'text') + moveSel(ctx, it)) +
    formEnd('items/' + it.id, delBtn(' data-act="del-item" data-id="' + esc(it.id) + '"', 'Delete ' + W().item)) + '</div>';
}
function entryEditor(ctx, e) {
  const n = (X.kids.get(e.id) || []).length, t = typeDef(e.type), s = secOf(e.sec);
  const secList = X.secs.map(x => '<option value="' + esc(x.key) + '"' + (e.sec === x.key ? ' selected' : '') + '>' + esc(x.long || x.label) + '</option>').join('');
  const opt = '<label for="' + esc(ctx + '-' + e.id + '-sec') + '">Section<select id="' + esc(ctx + '-' + e.id + '-sec') + '" data-c="entries" data-id="' + esc(e.id) + '" data-f="sec"' + (CW() ? '' : ' disabled') + '>' + secList + '</select></label>' +
    selFld(ctx, 'entries', e, 'type', 'Type', (X.cfg.entryTypes || []).map(x => x.name), null) +
    ((t.slots || []).length ? selFld(ctx, 'entries', e, 'slot', 'Slot', t.slots, 'None') : '') + ((t.sources || []).length ? selFld(ctx, 'entries', e, 'source', t.sourceLabel || 'Source', t.sources, 'Not decided') : '') +
    fld(ctx, 'entries', e, 'location', 'Location', 'text');
  let h = '<div class="ed">' + fld(ctx, 'entries', e, 'title', 'Name', 'text', 'wide') +
    (s && s.kind === 'day' ? fld(ctx, 'entries', e, 'start', 'Start', 'time') + fld(ctx, 'entries', e, 'end', 'End', 'time') : fld(ctx, 'entries', e, 'due', 'Due', 'date')) +
    ownersEdit(ctx, 'entries', e) + helpersEdit(ctx, 'entries', e) + fld(ctx, 'entries', e, 'notes', 'Notes', 'textarea', 'wide') + moreFields(opt);
  return h + formEnd('entries/' + e.id, !CW() ? '' : S.confirm === e.id ? askDel('Delete it and its ' + plural(n, W().item) + '?', ' data-act="del-entry-yes" data-id="' + esc(e.id) + '"')
    : delBtn(' data-act="del-entry" data-id="' + esc(e.id) + '"', 'Delete ' + W().entry)) + '</div>';
}

/* ---------- item + entry rows ---------- */
export function itemRow(ctx, it, parent, withCtx) {
  const q = qtyText(it);
  const editing = S.edit === 'items/' + it.id;
  return '<div class="it' + (live(it) ? '' : ' na') + (S.flash === it.id ? ' flash' : '') + '" id="' + ctx + '-row-' + esc(it.id) + '"><div class="it-t">' + (q ? '<span class="q">' + esc(q) + '</span>' : '') +
    '<span class="ttl">' + esc(it.title) + '</span>' + (withCtx ? '<span class="ctx">' + go('items', it, ctxOf('items', it)) + '</span>' : '') + '</div>' +
    '<div class="ctl">' + kindSel(ctx, it) + ownerSel(ctx, 'items', it, parent) + statusSel(ctx, 'items', it) +
    editBtn('items/' + it.id, it.title) + '</div>' + (editing ? itemEditor(ctx, it) : '') + '</div>';
}
function itemsBlock(ctx, list, parent) {
  let h = '';
  for (const k of kindOrder()) {
    const rows = list.filter(i => (X.kind.has(i.kind) ? i.kind : '') === k);
    if (rows.length) h += '<div class="kg">' + esc(listName(k)) + count(rows.length) + '</div>' + rows.map(it => itemRow(ctx, it, parent)).join('');
  }
  return h;
}
function addItemForm(entryId, sec) {
  if (!CW()) return '';
  const key = entryId || '@' + sec;
  return '<form class="add" data-act="add-item" data-entry="' + esc(entryId) + '" data-sec="' + esc(sec) + '"><input id="add-' + esc(key) + '-t" placeholder="' + esc('New ' + W().item) + '" aria-label="' + esc('New ' + W().item) + '" autocomplete="off">' +
    '<select id="add-' + esc(key) + '-k" aria-label="' + esc('Checklist for the new ' + W().item) + '"><option value="">' + UNLISTED + '</option>' + (X.cfg.itemKinds || []).map(k => '<option value="' + esc(k.name) + '">' + esc(listName(k.name)) + '</option>').join('') + '</select><button class="btn" type="submit">Add</button></form>';
}
function entryRow(e) {
  const kids = X.kids.get(e.id) || [], open = S.open.has(e.id), day = (secOf(e.sec) || {}).kind === 'day', skip = skipName();
  if (!named(e)) {                                     // a placeholder: a slot with nothing planned
    const na = !live(e);
    return '<article class="ev gap' + (S.flash === e.id ? ' flash' : '') + '" id="row-' + esc(e.id) + '"><div class="ev-h"><div class="tg"><span class="time"></span><span><span class="chip">' + esc(e.slot || e.type) + '</span> ' +
      (na ? '<span class="off">' + esc(e.status) + '</span>' : '<span class="hole">Nothing yet</span>') + '</span></div><div class="ctl">' +
      (CW() ? (na ? '<button type="button" class="btn sm" data-act="set" data-c="entries" data-id="' + esc(e.id) + '" data-f="status" data-v="">Reopen</button>'
        : '<button type="button" class="btn sm" data-act="plan" data-id="' + esc(e.id) + '">Add</button>' + (skip ? '<button type="button" class="btn sm" data-act="set" data-c="entries" data-id="' + esc(e.id) + '" data-f="status" data-v="' + esc(skip) + '">' + esc(skip) + '</button>' : '')) : '') +
      '</div></div>' + (S.edit === 'entries/' + e.id ? '<div class="ev-b">' + entryEditor('e', e) + '</div>' : '') + '</article>';
  }
  const when = day ? fmtSpan(e.start, e.end) : (e.due ? 'Due ' + fmtDate(e.due) : '');
  let h = '<article class="ev' + (live(e) ? '' : ' na') + (S.flash === e.id ? ' flash' : '') + '" id="row-' + esc(e.id) + '"><div class="ev-h">' +
    '<button type="button" class="tg" data-act="toggle" data-id="' + esc(e.id) + '" aria-expanded="' + open + '"><span class="time' + (!day && e.due && e.due < today() && live(e) && !isDone(e) ? ' bad' : '') + '">' + esc(when) + '</span>' +
    '<span><span class="caret">▸</span>' + (e.slot ? '<span class="chip">' + esc(e.slot) + '</span> ' : (day && e.type ? '<span class="chip">' + esc(e.type) + '</span> ' : '')) + '<span class="nm">' + esc(e.title) + '</span></span>' +
    '</button><div class="ctl">' + ownerSel('e', 'entries', e) + statusSel('e', 'entries', e) + editBtn('entries/' + e.id, e.title) + '</div></div>';
  const ed = S.edit === 'entries/' + e.id;
  if (open || ed) {
    const facts = [e.source && '<span><b>' + esc(typeDef(e.type).sourceLabel || 'Source') + ':</b> ' + esc(e.source) + '</span>', e.notes && '<span>' + esc(e.notes) + '</span>'].filter(Boolean).join('');
    h += '<div class="ev-b">' + (ed ? entryEditor('e', e) : facts ? '<p class="facts">' + facts + '</p>' : '') + (open ? itemsBlock('i', kids, e) + addItemForm(e.id, e.sec) : '') + '</div>';
  }
  return h + '</article>';
}

/* ---------- section ---------- */
views.s = key => {
  const s = secOf(key);
  if (!s) return '<p class="empty">No such section.</p>';
  const evs = X.bySec[key] || [], loose = X.loose[key] || [], anyOpen = evs.some(e => S.open.has(e.id)), day = s.kind === 'day';
  let h = head(esc(s.long || s.label), { dot: secDot(key), note: esc(s.note || ''), actions: newBtn('entry', 'New ' + W().entry) + editBtn('sec/' + key, s.long || s.label, s.kind === 'day' ? 'Edit day' : 'Edit list') +
    (evs.some(named) ? moreMenu('<button type="button" class="btn" data-act="' + (anyOpen ? 'collapse' : 'expand') + '" data-sec="' + esc(key) + '">' + (anyOpen ? 'Close all' : 'Open all') + '</button>') : '') });
  if (S.edit === 'sec/' + key) h += secEditor(key);
  if (S.ui.new === 'entry' && CW()) {
    const types = (X.cfg.entryTypes || []).filter(t => day ? !t.general : t.general), list = types.length ? types : (X.cfg.entryTypes || []);
    const dflt = (list.find(t => !(t.slots || []).length) || list[0] || {}).name;
    let opts = '';
    for (const t of list) { if ((t.slots || []).length) for (const sl of t.slots) opts += '<option value="' + esc(t.name + '|' + sl) + '">' + esc(t.name + ': ' + sl) + '</option>'; opts += '<option value="' + esc(t.name) + '|"' + (t.name === dflt ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }
    h += newForm('entry', 'add-entry', '<input id="newev-t" placeholder="Name" aria-label="Name" autocomplete="off">' +
      (list.length > 1 || opts.includes(':') ? '<select id="newev-k" aria-label="Type">' + opts + '</select>' : '<input type="hidden" id="newev-k" value="' + esc((list[0] || { name: '' }).name) + '|">') +
      (day ? '<input id="newev-s" type="time" aria-label="Start time">' : '<input id="newev-s" type="date" aria-label="Due date">'), ' data-sec="' + esc(key) + '"');
  }
  h += evs.map(entryRow).join('') || '<p class="empty">Nothing here yet.</p>';
  return h + '<h3>Loose ' + esc(W().items) + '</h3><div class="box">' + itemsBlock('i', loose, null) + addItemForm('', key) + '</div>';
};
acts.toggle = d => { S.open.has(d.id) ? S.open.delete(d.id) : S.open.add(d.id); if (S.edit === 'entries/' + d.id) S.edit = null; };
acts.expand = d => { for (const e of X.bySec[d.sec] || []) if (named(e)) S.open.add(e.id); };
acts.collapse = d => { for (const e of X.bySec[d.sec] || []) S.open.delete(e.id); S.edit = null; };
acts.plan = d => { S.edit = 'entries/' + d.id; S.open.add(d.id); render(); const n = document.getElementById('e-' + d.id + '-title'); if (n) n.focus(); return false; };
acts['del-item'] = d => { if (curOf('items', d.id)) { remove('items', d.id); S.edit = null; } };
acts['del-entry'] = d => { const r = curOf('entries', d.id), kids = [...X.items.values()].filter(i => i.entry === d.id); if (r && kids.length) S.confirm = d.id; else if (r) { remove('entries', d.id); S.edit = null; } };
acts['del-entry-yes'] = d => {
  const r = curOf('entries', d.id), kids = [...X.items.values()].filter(i => i.entry === d.id);
  if (r) { action('Deleted “' + (r.title || r.slot) + '” and ' + plural(kids.length, W().item), () => { for (const k of kids) remove('items', k.id); remove('entries', d.id); }, { row: r.title || r.slot, rc: 'entries', rid: d.id }); S.edit = null; S.confirm = null; }
};
changes.move = (d, t) => { if (!curOf('items', d.id)) return; if (t.value[0] === '@') write('items', d.id, { entry: '', sec: t.value.slice(1) }); else write('items', d.id, { entry: t.value, sec: '' }); };
submits['add-item'] = d => {
  const key = d.entry || '@' + d.sec, t = document.getElementById('add-' + key + '-t'), k = document.getElementById('add-' + key + '-k'), title = t.value.trim();
  if (!title) return false;
  newItem(d.entry, d.sec, title, k.value); t.value = ''; render();
  const n = document.getElementById('add-' + key + '-t'); if (n) n.focus();
  return false;
};
submits['add-entry'] = d => {
  const title = $('#newev-t').value.trim(); if (!title) return false;
  const kind = $('#newev-k').value.split('|'), when = $('#newev-s').value, day = (secOf(d.sec) || {}).kind === 'day';
  let id = '';
  action('Added “' + title + '”', () => { id = newEntry(d.sec, title, kind[0], kind[1], day ? when : '', ''); if (!day && when) write('entries', id, { due: when }); }, { row: title, rc: 'entries' });
  S.ui.new = null; S.open.add(id); S.flash = id; S.jump = 'row-' + id;
};

/* ---------- gaps: every check, worked out from the rows ---------- */
export function gapList(all) {                          // all: with the checks this event has switched off, for the list of them in Settings
  const G = [], ents = allEntries(), its = allItems(), td = today(), w = W();
  const rEnt = ents.filter(real), rIt = its.filter(i => live(i) && (!entryOf(i) || real(entryOf(i))));
  const slots = [];
  for (const s of daySecs()) for (const t of X.cfg.entryTypes || []) for (const sl of t.daily || []) {
    const inSlot = (X.bySec[s.key] || []).filter(e => e.type === t.name && e.slot === sl);
    if (!inSlot.some(real) && !inSlot.some(e => !live(e))) slots.push({ sec: s.key, type: t.name, slot: sl, rec: inSlot.find(e => !named(e)) || null });
  }
  G.push({ k: 'slots', t: 'Daily slots still empty', rows: slots });
  G.push({ k: 'nodri', t: w.Entries + ' with no ' + w.owner, rows: rEnt.filter(e => !led(lead(e))) });
  const two = [];
  for (const e of rEnt) { const l = lead(e); if (l.how === 'cap' && l.who.length > 1) two.push(['entries', e]); }
  for (const i of rIt) if (lead(i).how === 'cap' && lead(i).who.length > 1) two.push(['items', i]);
  G.push({ k: 'twocap', t: 'Team rows with more than one captain', rows: two });
  G.push({ k: 'notime', t: 'Day ' + w.entries + ' with no start time', rows: rEnt.filter(e => (secOf(e.sec) || {}).kind === 'day' && !e.start) });
  const tasks = [];
  for (const e of rEnt) {
    const t = typeDef(e.type);
    if (!(t.tasks || []).length || ((t.taskSlots || []).length && !t.taskSlots.includes(e.slot))) continue;
    const kids = (X.kids.get(e.id) || []).filter(live), miss = t.tasks.filter(name => !kids.some(i => lettersOnly(i.title).includes(lettersOnly(name))));
    if (miss.length) tasks.push({ e, miss });
  }
  G.push({ k: 'tasks', t: w.Entries + ' missing a standard task', rows: tasks });
  G.push({ k: 'uncovered', t: w.Items + ' nobody covers', rows: rIt.filter(i => lead(i, entryOf(i)).how === 'none') });
  G.push({ k: 'unsorted', t: w.Items + ' on no checklist', rows: rIt.filter(i => !i.kind) });
  G.push({ k: 'due', t: 'Past due', rows: rEnt.filter(e => e.due && e.due < td && !isDone(e)) });
  const seen = new Map(), dup = [];
  for (const i of rIt) { const k = (i.entry || '@' + i.sec) + '|' + lettersOnly(i.title); if (!seen.has(k)) seen.set(k, []); seen.get(k).push(i); }
  for (const g of seen.values()) if (g.length > 1) dup.push(...g);
  G.push({ k: 'dup', t: 'Same name twice under one ' + w.entry, rows: dup });
  const mention = [], nameRe = X.names.length ? new RegExp('(?<![\\p{L}\\p{N}])(' + X.names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\p{L}\\p{N}])', 'iu') : null;      // whole names, accents included
  if (nameRe) for (const [c, list] of [['entries', rEnt], ['items', rIt]]) for (const r of list) {
    if (r.owner) continue;
    const m = nameRe.exec((r.title || '') + ' ' + (r.notes || '').replace(/Who, as written: "[^"]*"/g, ''));
    if (m) mention.push({ c, r, name: X.names.find(n => n.toLowerCase() === m[1].toLowerCase()) });
  }
  G.push({ k: 'mention', t: 'Text names a person, no ' + w.owner + ' set', rows: mention });
  G.push({ k: 'decisions', t: 'Open decisions', rows: [...X.decisions.values()].filter(q => q.status !== DECIDED) });
  for (const t of X.cfg.tables || []) for (const f of t.fields) if ((f.attention || []).length)
    G.push({ k: 'tb-' + t.id + '-' + f.key, t: t.name + ': ' + f.label + ' ' + f.attention.join(' or '), table: t, field: f, rows: (X.byTable.get(t.id) || []).filter(r => f.attention.includes(String(r[f.key] == null ? '' : r[f.key]))) });
  for (const t of X.cfg.tables || []) for (const f of t.fields) if (f.type === 'people' && f.once && f.gap && X.names.length)      // a table that places each person once can say who is left out
    G.push({ k: 'tb-' + t.id + '-' + f.key + '-free', t: t.name + ': people not in ' + an(t.one || 'row'), table: t, free: true, rows: unplaced(t, f) });
  for (const t of X.cfg.tables || []) for (const f of t.fields) if (f.type === 'people' && f.once)      // placed twice: two people moved the same person at the same moment
    G.push({ k: 'tb-' + t.id + '-' + f.key + '-twice', t: t.name + ': someone in more than one ' + (t.one || 'row'), table: t, rows: [...new Set(twice(t, f).flatMap(x => x[1]))] });
  return all ? G : G.filter(g => !X.off.has('check:' + g.k));
}
const grp = (rows, keyOf) => { const m = new Map(); for (const r of rows) { const k = keyOf(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };
views.gaps = () => {
  let h = head('Gaps') + '<div>';
  for (const g of gapList()) h += fold(g.k, g.rows.length, g.t, () => {
    const cx = 'g' + g.k.replace(/[^a-z0-9]/gi, ''), skip = skipName();
    let b = '';
    if (g.k === 'slots') for (const r of g.rows) b += '<div class="rr"><div class="who"><b>' + esc(secLabel(r.sec)) + ', ' + esc(r.slot) + '</b></div><div class="ctl">' + (CW() ? '<button type="button" class="btn sm" data-act="slot-plan" data-sec="' + esc(r.sec) + '" data-type="' + esc(r.type) + '" data-slot="' + esc(r.slot) + '" data-id="' + esc(r.rec ? r.rec.id : '') + '">Add</button>' +
      (skip ? '<button type="button" class="btn sm" data-act="slot-skip" data-sec="' + esc(r.sec) + '" data-type="' + esc(r.type) + '" data-slot="' + esc(r.slot) + '" data-id="' + esc(r.rec ? r.rec.id : '') + '">' + esc(skip) + '</button>' : '') : '') + '</div></div>';
    else if (g.k === 'nodri') for (const e of g.rows) b += refRow('entries', e, ownerSel(cx, 'entries', e), helpersText(e) ? esc(W().Helpers) + ': ' + esc(helpersText(e)) : '');
    else if (g.k === 'twocap') for (const [c, r] of g.rows) b += refRow(c, r, CW() ? lead(r).who.map(n => '<button type="button" class="btn sm" data-act="set" data-c="' + c + '" data-id="' + esc(r.id) + '" data-f="owner" data-v="' + esc(n) + '">' + esc(n) + '</button>').join('') : '', esc(helpersText(r)));
    else if (g.k === 'notime') for (const e of g.rows) b += refRow('entries', e, '<input type="time" id="' + cx + '-' + esc(e.id) + '-start" class="inl" data-c="entries" data-id="' + esc(e.id) + '" data-f="start" aria-label="Start time for ' + esc(e.title) + '"' + (CW() ? '' : ' disabled') + '>');
    else if (g.k === 'tasks') for (const r of g.rows) b += refRow('entries', r.e, r.miss.map(m => CW() ? '<button type="button" class="btn sm" data-act="add-task" data-id="' + esc(r.e.id) + '" data-v="' + esc(m) + '">Add ' + esc(m) + '</button>' : esc(m)).join(''));
    else if (g.k === 'uncovered' || g.k === 'unsorted' || g.k === 'dup') for (const [key, list] of grp(g.rows, i => i.entry || '@' + secOfItem(i))) {
      const e = X.entries.get(key);
      b += '<div class="gh row"><span style="flex:1">' + (e ? go('entries', e) + ' <span class="ctx" style="display:inline">' + esc(ctxOf('entries', e)) + '</span>' : esc(secLabel(key.slice(1)) + ', loose')) + count(list.length) + '</span>' + (g.k === 'uncovered' && e ? ownerSel(cx, 'entries', e) : '') + '</div><div class="pad">' + list.map(i => itemRow(cx, i, e || null)).join('') + '</div>';
    }
    else if (g.k === 'due') for (const e of g.rows) b += refRow('entries', e, statusSel(cx, 'entries', e), 'Due ' + esc(fmtDate(e.due)));
    else if (g.k === 'mention') for (const m of g.rows) b += refRow(m.c, m.r, CW() && m.name ? '<button type="button" class="btn sm" data-act="set" data-c="' + m.c + '" data-id="' + esc(m.r.id) + '" data-f="owner" data-v="' + esc(m.name) + '">Make ' + esc(m.name) + ' the ' + esc(W().owner) + '</button>' : '');
    else if (g.k === 'decisions') for (const q of g.rows) b += refRow('decisions', q, '');
    else if (g.free) b += '<div class="rr"><div class="who">' + esc(g.rows.join(', ')) + '</div><div class="ctl"><button type="button" class="btn sm" data-act="view" data-v="t" data-arg="' + esc(g.table.id) + '">Open ' + esc(g.table.name) + '</button></div></div>';
    else if (g.table) for (const r of g.rows) b += refRow('rows', r, '');
    return b;
  });
  return h + '</div>';
};
acts['slot-plan'] = d => {
  let id = d.id;
  if (!id) id = newEntry(d.sec, '', d.type, d.slot, '', '', secLabel(d.sec) + ' ' + d.slot + ' opened');
  S.open.add(id); S.edit = 'entries/' + id; S.flash = id; S.jump = 'row-' + id; setView('s', d.sec);
  const n = document.getElementById('e-' + id + '-title'); if (n) n.focus();
  return false;
};
acts['slot-skip'] = d => { const skip = skipName(); if (d.id) write('entries', d.id, { status: skip }); else newEntry(d.sec, '', d.type, d.slot, '', skip, secLabel(d.sec) + ' ' + d.slot + ': ' + skip); };
acts['add-task'] = d => { const e = curOf('entries', d.id); if (e) newItem(e.id, e.sec, d.v, ((X.cfg.itemKinds || []).find(k => k.task) || {}).name || ''); };
acts.gap = d => { S.ui.fold = d.k; S.jump = 'fold-' + d.k; setView('gaps'); return false; };

/* ---------- lists ---------- */
views.lists = () => {
  /* Every item sits on one list (its kind) or waits under Unlisted, which comes first: put each on a list with its picker, or make a new list here.
     Whose: one person's lists, filled by what they are assigned in the event (they lead it, captain it, lead its entry, or help on it). */
  const names = sortedNames(), who = names.includes(S.ui.lwho) ? S.ui.lwho : '';
  const its = allItems().filter(i => (!entryOf(i) || named(entryOf(i))) && isMine(i, who, entryOf(i))), order = [''].concat(kindOrder().filter(Boolean)), kOf = i => X.kind.has(i.kind) ? i.kind : '';
  const n = kk => its.filter(i => kOf(i) === kk && live(i)).length;
  const k = order.includes(S.ui.list) ? S.ui.list : n('') || order.length === 1 ? '' : order[1], by = S.ui.by || 'entry';
  const whoSel = names.length ? pick('<select class="s" data-act="list-who" data-v="' + esc(who) + '" aria-label="Whose checklists">' + '<option value="">Everyone</option>' + names.map(x => '<option' + (x === who ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>', who ? who + '’s checklists' : 'Everyone’s checklists', 'framed') : '';
  let h = head(who ? esc(who) + '’s checklists' : 'Checklists', { actions: newBtn('list', 'New checklist') + (k ? editBtn('list/' + k, listName(k), 'Edit checklist') : '') + moreMenu('<button type="button" class="btn" data-act="print-list" data-v="' + esc(k) + '">Print</button>') }) +
    (k && S.edit === 'list/' + k ? listKindEditor(k) : '') + newForm('list', 'add-list', '<input id="newlist" placeholder="Name, e.g. Packing" aria-label="Name of the new checklist" autocomplete="off" maxlength="40">') +
    '<div class="tools">' + whoSel + seg('list', order.map(kk => [kk, listName(kk), n(kk)]), k) + seg('by', [['entry', 'By ' + W().entry], ['person', 'By person']], by) + '</div>';
  const rows = its.filter(i => kOf(i) === k);
  const groups = grp(rows, i => by === 'entry' ? ctxOf('items', i) : whoLabel(i));
  const keys = by === 'entry' ? [...groups.keys()] : [...groups.keys()].sort((a, b) => (a === 'Nobody yet') - (b === 'Nobody yet') || a.localeCompare(b));
  const moveAll = (g, list) => !CW() || order.length < 2 ? '' : pick('<select class="s" data-act="list-all" data-ids="' + esc(list.map(i => i.id).join(' ')) + '" aria-label="' + esc('Move all of ' + g + ' to a checklist') + '"><option value="@">Move all to…</option>' +
    order.filter(x => x !== k).map(x => '<option value="' + esc(x) + '">' + esc(listName(x)) + '</option>').join('') + '</select>', 'Move all to…', 'mvall');
  for (const g of keys) h += '<div class="box"><div class="gh gh-row"><span>' + esc(g) + count(groups.get(g).length) + '</span>' + moveAll(g, groups.get(g)) + '</div><div class="pad">' + groups.get(g).map(i => itemRow('l', i, entryOf(i), by !== 'entry')).join('') + '</div></div>';
  return h + (rows.length ? '' : '<p class="empty">' + (who ? 'Nothing for ' + esc(who) + ' on this checklist.' : k ? 'Nothing on this checklist yet.' : 'Every ' + esc(W().item) + ' is on a checklist.') + '</p>');
};
changes['list-all'] = (d, t) => {
  const ids = String(d.ids || '').split(' ').filter(id => X.items.has(id)), to = t.value;
  if (to === '@' || !ids.length) return false;
  action('Moved ' + plural(ids.length, W().item) + ' to ' + listName(to), () => { for (const id of ids) write('items', id, { kind: to }); });
};
submits['add-list'] = () => {
  const name = $('#newlist').value.trim().replace(/\s+/g, ' '), kinds = withIds(JSON.parse(JSON.stringify(X.cfg.itemKinds || [])));
  if (!name) return false;
  if (name.toLowerCase() === UNLISTED.toLowerCase() || kinds.some(x => [x.name, x.label].some(v => String(v || '').toLowerCase() === name.toLowerCase()))) { toast('“' + name + '” is already a checklist.'); return false; }
  kinds.push({ id: idFor(name, kinds), name, label: name });
  saveCfg('Checklists: added ' + name, () => putCfg({ itemKinds: kinds }));
  S.ui.list = name; S.ui.new = null;
};
export function whoLabel(i) {
  const l = lead(i, entryOf(i));
  return l.how === 'own' ? l.who.join(' + ') : l.how === 'nobody' ? NOBODY : l.how === 'cap' ? l.who.join(' + ') + ' (captain)' : l.how === 'via' ? (l.nobody ? NOBODY : l.who.join(' + ') + ' (through the ' + W().entry + ')') : helpersText(i) || 'Nobody yet';
}
acts.list = d => { S.ui.list = d.v; };
changes['list-who'] = (d, t) => { S.ui.lwho = t.value; };
acts['lists-of'] = d => { S.ui.lwho = d.v; S.ui.list = undefined; setView('lists'); return false; };
acts['print-list'] = d => { const o = printOpts(); o.kinds = [d.v]; o.by = S.ui.by || 'entry'; setView('print', 'lists'); return false; };
acts.by = d => { S.ui.by = d.v; };

/* ---------- decisions ---------- */
views.decisions = () => {
  const qs = [...X.decisions.values()].sort((a, b) => (a.seq || 0) - (b.seq || 0)), open = qs.filter(q => q.status !== DECIDED).length;
  let h = head('Decisions', { note: qs.length ? open + ' open' : '', actions: newBtn('decision', 'New decision') }) +
    newForm('decision', 'add-decision', '<input id="newq" placeholder="What needs deciding" aria-label="New decision" autocomplete="off">') + '<div class="box">';
  for (const q of qs) {
    const done = q.status === DECIDED, ed = S.edit === 'decisions/' + q.id;
    h += '<div class="qa' + (done ? ' done' : '') + (S.flash === q.id ? ' flash' : '') + '" id="q-' + esc(q.id) + '"><b>' + esc(q.topic) + '</b>' + (q.detail ? '<span class="pre">' + esc(q.detail) + '</span>' : '');
    const refs = (q.refs || []).map(p => { const i = p.indexOf('/'), c = p.slice(0, i), r = curOf(c, p.slice(i + 1)); return r ? go(c, r) : ''; }).filter(Boolean);
    if (refs.length) h += '<span class="ctx">Rows: ' + refs.slice(0, 8).join(', ') + (refs.length > 8 ? ' and ' + (refs.length - 8) + ' more' : '') + '</span>';
    h += '<div class="row">' + line(' id="q-' + esc(q.id) + '-decision" data-c="decisions" data-id="' + esc(q.id) + '" data-f="decision" placeholder="Decision" aria-label="Decision for ' + esc(q.topic) + '"' + (CW() ? '' : ' disabled'), q.decision || '') +
      (CW() ? '<button type="button" class="btn sm" data-act="set" data-c="decisions" data-id="' + esc(q.id) + '" data-f="status" data-v="' + (done ? OPEN : DECIDED) + '">' + (done ? 'Reopen' : 'Mark decided') + '</button>' +
        editBtn('decisions/' + q.id, q.topic) : '') + '</div>';
    if (ed) h += '<div class="ed">' + fld('q', 'decisions', q, 'topic', 'Topic', 'text', 'wide') + fld('q', 'decisions', q, 'detail', 'Detail', 'textarea', 'wide') + formEnd('decisions/' + q.id, delBtn(' data-act="del-row" data-c="decisions" data-id="' + esc(q.id) + '"', 'Delete decision')) + '</div>';
    h += '</div>';
  }
  return h + (qs.length ? '' : '<p class="empty">No decisions yet.</p>') + '</div>';
};
submits['add-decision'] = () => { const t = $('#newq').value.trim(); if (!t) return false; create('decisions', { seq: nextSeq(X.decisions.values()), topic: t, detail: '', refs: [], status: OPEN, decision: '' }); S.ui.new = null; };
acts['del-row'] = d => { if (curOf(d.c, d.id)) { remove(d.c, d.id); S.edit = null; } };

/* ---------- search ---------- */
views.find = () => {
  const q = S.q.toLowerCase(), has = v => v != null && String(v).toLowerCase().includes(q);
  const hit = r => [r.title, r.notes, r.owner, (r.helpers || []).join(' '), r.where, r.location, r.slot].some(has);
  const ev = allEntries().filter(hit), it = allItems().filter(hit), rows = [...X.rows.values()].filter(r => { const t = tableDef(r.t); return t && t.fields.some(f => f.type !== 'photo' && has(r[f.key])); });
  let h = head('Results for “' + esc(S.q) + '”') + '<div class="box">';
  h += ev.slice(0, 60).map(e => refRow('entries', e, ownerSel('s', 'entries', e) + statusSel('s', 'entries', e))).join('') + it.slice(0, 140).map(i => refRow('items', i, ownerSel('s', 'items', i, entryOf(i)) + statusSel('s', 'items', i))).join('') +
    rows.slice(0, 80).map(r => refRow('rows', r, '')).join('');
  return h + ((ev.length + it.length + rows.length) ? '' : '<p class="empty">No match.</p>') + '</div>';
};
