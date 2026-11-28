/* Print: agenda, lists, one sheet per person, team rosters, any table, and free-form handouts. The browser's own Print makes the paper or the PDF. */
import { esc, S, X, W, views, acts, changes, CW, NOBODY, fmtTime, fmtSpan, fmtDate, line, qtyText, lettersOnly, typeDef, secOf, live, isDone, real, entryOf, secOfItem, allEntries, allItems, sortedNames, tableDef, rowTitle, lead, ownersOf, listName, options, seg, printOpts, action, write, create, remove, curOf, nextSeq, setView, idOf, head as viewHead, askDel } from './core.js';
import { newId, withIds } from './rules.js';
import { whoLabel } from './plan.js';
import { personStats, fieldText, tableSums, tableGroups, placements } from './tables.js';
/* What is printed unless the options say otherwise: every day, and every checklist that is not left off printed lists. */
const pickedSecs = o => o.secs || X.secs.filter(s => s.kind === 'day').map(s => s.key);
const allKinds = () => (X.cfg.itemKinds || []).map(k => k.name).concat(['']);
const pickedKinds = o => o.kinds || allKinds().filter(k => !(X.kind.get(k) || {}).quiet);

const box = '<span class="tick"></span>';
const who = (r, parent) => { const l = lead(r, parent); return l.how === 'own' || l.how === 'cap' ? l.who.join(' + ') : l.how === 'via' && !l.nobody ? l.who.join(' + ') : ''; };
const head = sub => '<header class="ph"><h1>' + esc(X.plan.name) + '</h1><p>' + esc([X.plan.dates, X.plan.venue].filter(Boolean).join(', ')) + '</p>' + (sub ? '<p class="psub">' + esc(sub) + '</p>' : '') + '</header>';
const chk = (k, v, label, on) => '<label class="chk"><input type="checkbox" id="po-' + k + '-' + esc(v) + '" data-act="popt" data-k="' + k + '" data-v="' + esc(v) + '"' + (on ? ' checked' : '') + '> ' + esc(label) + '</label>';
const when = (e, day) => day ? fmtSpan(e.start, e.end) : (e.due ? fmtDate(e.due) : '');

/* Who is on it besides the lead: the helpers, and who has each of its standing jobs (the standard tasks its type asks for: a meal's setup and cleanup). */
const jobsOf = e => { const std = typeDef(e.type).tasks || []; return (X.kids.get(e.id) || []).filter(i => live(i) && std.some(n => lettersOnly(i.title).includes(lettersOnly(n)))); };
function crew(e) {
  const bits = [];
  if ((e.helpers || []).length) bits.push('<b>' + esc(W().Helpers) + '</b> ' + esc(e.helpers.join(', ')));
  for (const i of jobsOf(e)) {
    const l = lead(i), names = ownersOf(i).length ? ownersOf(i).join(' + ') : (i.helpers || []).length ? i.helpers.join(', ') : l.how === 'cap' ? l.who.join(' + ') : '';
    bits.push('<b>' + esc(i.title) + '</b> ' + (names ? esc(names) : '<i>nobody yet</i>'));
  }
  return bits.length ? '<div class="pm pp">' + bits.join(', ') + '</div>' : '';
}
function agenda(o) {
  const pick = pickedSecs(o);
  let h = head('');
  for (const s of X.secs.filter(s => pick.includes(s.key))) {
    const day = s.kind === 'day', rows = (X.bySec[s.key] || []).filter(real);
    h += '<section class="psec"><h2>' + esc(s.long || s.label) + (s.note ? ' <small>' + esc(s.note) + '</small>' : '') + '</h2><table class="pt"><tbody>';
    for (const e of rows) {
      const jobs = o.help ? jobsOf(e) : [], kids = o.items ? (X.kids.get(e.id) || []).filter(i => live(i) && !jobs.includes(i)) : [];
      h += '<tr><td class="pw">' + esc(when(e, day)) + '</td><td><b>' + esc(e.title) + '</b>' + (e.slot ? ' <small>' + esc(e.slot) + '</small>' : '') + (o.loc && e.location ? '<div class="pm">' + esc(e.location) + '</div>' : '') + (o.notes && e.notes ? '<div class="pm">' + esc(e.notes) + '</div>' : '') + (o.help ? crew(e) : '') +
        (kids.length ? '<ul class="pl">' + kids.map(i => '<li>' + box + esc([qtyText(i), i.title].filter(Boolean).join(' ')) + (o.dri && ownersOf(i).length ? ' <small>' + esc(ownersOf(i).join(' + ')) + '</small>' : '') + '</li>').join('') + '</ul>' : '') + '</td>' +
        (o.dri ? '<td class="pd">' + esc(who(e)) + '</td>' : '') + '</tr>';
    }
    h += '</tbody></table>' + (rows.length ? '' : '<p class="pm">Nothing yet.</p>') + '</section>';
  }
  return h;
}
function lists(o) {
  const kinds = allKinds(), pick = pickedKinds(o);
  const its = allItems().filter(i => (!entryOf(i) || real(entryOf(i))) && live(i) && (o.done || !isDone(i)));
  let h = head('');
  for (const k of kinds.filter(k => pick.includes(k))) {
    const rows = its.filter(i => (X.kind.has(i.kind) ? i.kind : '') === k);
    if (!rows.length) continue;
    const groups = new Map();
    for (const i of rows) { const e = entryOf(i), g = o.by === 'entry' ? (secOf(secOfItem(i)) || { label: '' }).label + (e ? ', ' + e.title : '') : whoLabel(i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(i); }
    const keys = o.by === 'entry' ? [...groups.keys()] : [...groups.keys()].sort((a, b) => a.localeCompare(b));
    h += '<section class="psec"><h2>' + esc(listName(k)) + ' <small>' + rows.length + '</small></h2>';
    for (const g of keys) h += '<h3>' + esc(g) + '</h3><ul class="pl">' + groups.get(g).map(i => '<li>' + box + esc([qtyText(i), i.title].filter(Boolean).join(' ')) + ' <small>' + esc([i.where, o.by === 'entry' ? who(i, entryOf(i)) : (entryOf(i) || {}).title, i.status, i.notes].filter(Boolean).join(', ')) + '</small></li>').join('') + '</ul>';
    h += '</section>';
  }
  return h;
}
function personSheet(name) {
  const st = personStats(name), line = (c, r, why) => { const e = c === 'entries' ? r : entryOf(r), day = (secOf(c === 'entries' ? r.sec : secOfItem(r)) || {}).kind === 'day'; return '<tr><td class="pw">' + esc(e ? when(e, day) : '') + '</td><td>' + box + '<b>' + esc(r.title) + '</b>' + (c === 'items' && e ? ' <small>' + esc(e.title) + '</small>' : '') + '</td><td class="pd">' + esc(why) + '</td></tr>'; };
  let h = '<div class="sheet">' + head(name + ((X.memberOf.get(name) || []).length ? ', ' + X.memberOf.get(name).join(', ') : '')), any = false;
  for (const [t, r] of placements(name)) h += '<p class="pm"><b>' + esc(t.name) + '</b> ' + esc(rowTitle(t, r) + (t.group && r[t.group] ? ', ' + r[t.group] : '')) + '</p>';      // where they are placed: their room
  for (const s of X.secs) {
    const inSec = (c, r) => (c === 'entries' ? r.sec : secOfItem(r)) === s.key;
    const rows = st.ev.filter(e => e.sec === s.key).map(e => line('entries', e, W().owner)).concat(st.it.filter(i => inSec('items', i)).map(i => line('items', i, W().owner)), st.cap.filter(x => inSec(x[0], x[1])).map(x => line(x[0], x[1], 'Captain, ' + x[2])),
      st.help.concat(st.via).filter(x => inSec(x[0], x[1])).map(x => line(x[0], x[1], x[2])));
    if (rows.length) { any = true; h += '<section class="psec"><h2>' + esc(s.long || s.label) + '</h2><table class="pt"><tbody>' + rows.join('') + '</tbody></table></section>'; }
  }
  return h + (any ? '' : '<p class="pm">Nothing assigned.</p>') + '</div>';
}
function teams() {
  let h = head('Teams');
  for (const g of X.teams) {
    const rows = allEntries().filter(e => real(e) && (e.helpers || []).includes(g.name)).map(e => ['entries', e]).concat(allItems().filter(i => live(i) && (i.helpers || []).includes(g.name)).map(i => ['items', i]));
    h += '<section class="psec"><h2>' + esc(g.name) + (g.type ? ' <small>' + esc(g.type) + '</small>' : '') + '</h2><p class="pm">' + esc([(g.captains || []).length ? 'Captain: ' + g.captains.join(', ') : '', (g.members || []).join(', '), g.note].filter(Boolean).join(', ')) + '</p><table class="pt"><tbody>' +
      rows.map(([c, r]) => { const e = c === 'entries' ? r : entryOf(r), sk = c === 'entries' ? r.sec : secOfItem(r), s = secOf(sk) || { label: '' }; return '<tr><td class="pw">' + esc(s.label + (e && s.kind === 'day' && e.start ? ' ' + fmtTime(e.start) : '')) + '</td><td>' + box + '<b>' + esc(r.title) + '</b>' + (c === 'items' && e ? ' <small>' + esc(e.title) + '</small>' : '') + '</td><td class="pd">' + esc(r.owner && r.owner !== NOBODY ? r.owner : (g.captains || []).join(' + ')) + '</td></tr>'; }).join('') + '</tbody></table></section>';
  }
  return h + (X.teams.length ? '' : '<p class="pm">No teams.</p>');
}
function table(t) {
  const rows = X.byTable.get(t.id) || [], used = t.fields.filter(x => x.type !== 'photo' && x.key !== t.group && rows.some(r => fieldText(x, r[x.key]) !== ''));
  const f = used.filter(x => x.type !== 'long'), notes = used.filter(x => x.type === 'long');      // long text gets a line of its own under the row, so the columns stay narrow enough for the page
  let h = head(t.name);
  for (const [name, list] of tableGroups(t, rows))
    h += '<section class="psec">' + (name ? '<h2>' + esc(name) + ' <small>' + esc([list.length].concat(tableSums(t, list)).join(', ')) + '</small></h2>' : '') + '<div class="scroll"><table class="pt grid"><thead><tr>' + f.map(x => '<th>' + esc(x.label) + '</th>').join('') + '</tr></thead><tbody>' +
      list.map(r => '<tr>' + f.map(x => '<td>' + esc(fieldText(x, r[x.key])) + '</td>').join('') + '</tr>' +
        notes.filter(x => fieldText(x, r[x.key]) !== '').map(x => '<tr class="pn"><td colspan="' + f.length + '"><small>' + esc(x.label) + '</small> ' + esc(fieldText(x, r[x.key])) + '</td></tr>').join('')).join('') + '</tbody></table></div></section>';
  return h;
}
function handout(hd) {
  let h = '<div class="handout">', open = false;
  const close = () => { if (open) { h += '</tbody></table>'; open = false; } };
  for (const l of hd.lines || []) {
    if (l.role === 'title') { close(); h += '<h1>' + esc(l.text) + '</h1>'; }
    else if (l.role === 'note') { close(); h += '<p class="pm">' + esc([l.label, l.text].filter(Boolean).join(' ')) + '</p>'; }
    else { if (!open) { h += '<table class="pt"><tbody>'; open = true; } h += '<tr' + (l.role === 'head' ? ' class="hd"' : '') + '>' + '<td class="pk">' + esc(l.label) + '</td><td>' + esc(l.text) + '</td></tr>'; }
  }
  close();
  return h + ((hd.lines || []).length ? '' : '<p class="pm">Empty.</p>') + '</div>';
}
function handoutEditor(hd) {
  let h = '<div class="box noprint"><div class="pad"><div class="ed"><label class="wide" for="hd-name">Name' + line(' id="hd-name" data-c="handouts" data-id="' + esc(hd.id) + '" data-f="name"', hd.name) + '</label></div>';
  const ided = withIds(hd.lines || []);
  (hd.lines || []).forEach((l, i) => {
    const k = idOf(ided[i].id);      // a box follows its line (by the id it has, or will be given when first saved), so a line added or taken out above it by someone else does not move what is being typed
    h += '<div class="hl"><select id="hl-' + k + '-role" data-act="hl" data-id="' + esc(hd.id) + '" data-i="' + i + '" data-k="role" aria-label="Kind of line ' + (i + 1) + '">' + options(['title', 'head', 'line', 'note'], l.role, null) + '</select>' +
      line(' id="hl-' + k + '-label" data-act="hl" data-id="' + esc(hd.id) + '" data-i="' + i + '" data-k="label" placeholder="Label" aria-label="Label of line ' + (i + 1) + '"', l.label || '') +
      line(' id="hl-' + k + '-text" data-grow data-act="hl" data-id="' + esc(hd.id) + '" data-i="' + i + '" data-k="text" placeholder="Text" aria-label="Text of line ' + (i + 1) + '"', l.text || '') +
      '<button type="button" class="more" data-act="hl-move" data-id="' + esc(hd.id) + '" data-i="' + i + '" data-v="-1" aria-label="Move line ' + (i + 1) + ' up"' + (i ? '' : ' disabled') + '>↑</button><button type="button" class="more" data-act="hl-del" data-id="' + esc(hd.id) + '" data-i="' + i + '" aria-label="Delete line ' + (i + 1) + '">×</button></div>';
  });
  return h + '<div class="row" style="margin:0.625rem 0"><button type="button" class="btn sm" data-act="hl-add" data-id="' + esc(hd.id) + '">Add a line</button>' +
    (S.confirm === 'hd' ? askDel('Delete this handout?', ' data-act="hd-del" data-id="' + esc(hd.id) + '"') : '<button type="button" class="btn danger" data-act="ui-confirm" data-v="hd">Delete handout</button>') + '</div></div></div>';
}
views.print = arg => {
  const o = printOpts(), a = arg || 'agenda', hs = [...X.handouts.values()].sort((x, y) => (x.seq || 0) - (y.seq || 0));
  const tabs = [['agenda', 'Agenda'], ['lists', 'Checklists'], ['people', 'People'], ['teams', 'Teams']].concat((X.cfg.tables || []).map(t => ['t:' + t.id, t.name]), hs.map(x => ['h:' + x.id, x.name]));
  let h = '<div class="noprint">' + viewHead('Print', { actions: CW() ? '<button type="button" class="btn pri new" data-act="hd-new">New handout</button>' : '' }) + '<div class="tools">' + seg('print-tab', tabs, a.startsWith('p:') ? 'people' : a) + '</div><div class="tools">', paper = '', above = '';
  if (a === 'agenda') {
    const pick = pickedSecs(o);
    h += '<span class="row">' + X.secs.map(s => chk('secs', s.key, s.label, pick.includes(s.key))).join('') + '</span><span class="sep"></span><span class="row">' + chk('dri', '', W().owner, o.dri) + chk('help', '', W().Helpers + ' and jobs', o.help) + chk('loc', '', 'Location', o.loc) + chk('notes', '', 'Notes', o.notes) + chk('items', '', W().Items, o.items) + '</span>';
    paper = agenda(o);
  } else if (a === 'lists') {
    const kinds = allKinds(), pick = pickedKinds(o);
    h += kinds.map(k => chk('kinds', k, listName(k), pick.includes(k))).join('') + '<span class="sep"></span>' + seg('print-by', [['entry', 'By ' + W().entry], ['person', 'By person']], o.by) + chk('done', '', 'Include ' + W().done, o.done);
    paper = lists(o);
  } else if (a === 'people' || a.startsWith('p:')) {
    const one = a.startsWith('p:') ? a.slice(2) : '';
    h += '<label class="chk">Who <select id="po-who" data-act="print-who">' + options(sortedNames(), one, 'Everyone, one page each') + '</select></label>';
    paper = (one ? [one] : sortedNames()).filter(n => X.names.includes(n)).map(personSheet).join('') || '<p class="pm">Nobody yet.</p>';
  } else if (a === 'teams') paper = teams();
  else if (a.startsWith('t:') && tableDef(a.slice(2))) paper = table(tableDef(a.slice(2)));
  else if (a.startsWith('h:') && curOf('handouts', a.slice(2))) {
    const hd = curOf('handouts', a.slice(2));
    if (CW()) h += '<button type="button" class="btn" data-act="ui" data-k="hedit" aria-expanded="' + !!S.ui.hedit + '">' + (S.ui.hedit ? 'Close the editor' : 'Edit') + '</button>';
    paper = handout(hd);
    if (S.ui.hedit && CW()) above = handoutEditor(hd);      // the editor sits above the paper, in the app's own colours
  } else paper = '<p class="pm">Nothing to print.</p>';
  return h + (h.endsWith('<div class="tools">') ? '' : '<span class="sep"></span>') + '<button type="button" class="btn pri" data-act="print-now">Print</button></div></div>' + above + '<div class="paper">' + paper + '</div>';
};
acts['print-tab'] = d => { S.ui.hedit = false; setView('print', d.v === 'agenda' ? '' : d.v); return false; };
acts['print-by'] = d => { printOpts().by = d.v; };
acts['print-now'] = () => { window.print(); return false; };
acts['ui-confirm'] = d => { S.confirm = d.v; };
changes.popt = (d, t) => {
  const o = printOpts();
  if (d.k === 'secs') { const cur = pickedSecs(o); o.secs = t.checked ? cur.concat([d.v]) : cur.filter(x => x !== d.v); }
  else if (d.k === 'kinds') { const cur = pickedKinds(o); o.kinds = t.checked ? cur.concat([d.v]) : cur.filter(x => x !== d.v); }
  else o[d.k] = t.checked;
};
changes['print-who'] = (d, t) => { setView('print', t.value ? 'p:' + t.value : 'people'); return false; };
/* The lines as this screen shows them, each with an id of its own, changed and saved saying what they were: a line someone else changed meanwhile stays. */
const setLines = (id, fn, label) => { const hd = X.handouts.get(id); if (!hd || !curOf('handouts', id)) return; const lines = withIds(hd.lines || []).map(l => Object.assign({}, l)); fn(lines); action(label, () => write('handouts', id, { lines }, hd), { row: hd.name, rc: 'handouts', rid: id }); };
changes.hl = (d, t) => setLines(d.id, lines => { lines[+d.i][d.k] = d.k === 'role' ? t.value : t.value.trim(); }, 'Handout line edited');
acts['hl-add'] = d => setLines(d.id, lines => lines.push({ id: newId(), role: 'line', label: '', text: '' }), 'Handout line added');
acts['hl-del'] = d => setLines(d.id, lines => lines.splice(+d.i, 1), 'Handout line deleted');
acts['hl-move'] = d => setLines(d.id, lines => { const i = +d.i, j = i + (+d.v); if (j >= 0 && j < lines.length) lines.splice(j, 0, lines.splice(i, 1)[0]); }, 'Handout line moved');
acts['hd-new'] = () => { const id = create('handouts', { name: 'New handout', seq: nextSeq(X.handouts.values()), lines: [{ id: newId(), role: 'title', label: '', text: X.plan.name }] }); S.ui.hedit = true; setView('print', 'h:' + id); return false; };
acts['hd-del'] = d => { remove('handouts', d.id); S.confirm = null; S.ui.hedit = false; setView('print', ''); return false; };
