/* The figures one event adds up to (planStats: progress, who carries what, checklists, money, sheets) and how far off it is (whenText).
   Read by the boards (Overview, Insights), the events across the app, and the list of events. */
import { X, moneyTotals, today, live, isDone, real, entryOf, secOfItem, allEntries, allItems, lead, led, isDoing, UNLISTED } from './core.js';
import { DECIDED } from './model.js';
import { personSummary } from './tables.js';
import { gapList } from './plan.js';

/* ---------- one event, added up (reads whichever event is the current index) ---------- */
export function planStats(attention, lite) {           // attention: the count of rows in Gaps, when the caller already has it · lite: without the pass over every person
  const ents = allEntries().filter(real), its = allItems().filter(i => live(i) && (!entryOf(i) || real(entryOf(i)))), td = today();
  const sec = new Map(X.secs.map(s => [s.key, { key: s.key, label: s.label, long: s.long || s.label, n: 0, done: 0, doing: 0, entries: 0, led: 0 }]));
  const kind = new Map((X.cfg.itemKinds || []).map(k => [k.name, { name: k.name, label: k.label || k.name, n: 0, done: 0, doing: 0 }]).concat([['', { name: '', label: UNLISTED, n: 0, done: 0, doing: 0 }]]));
  const stat = new Map((X.cfg.statuses || []).filter(s => !s.skip).map(s => [s.name, { name: s.name, n: 0 }]).concat([['', { name: 'No status', n: 0 }]]));
  const m = moneyTotals(), st = { entries: ents.length, items: its.length, rows: ents.length + its.length, done: 0, doing: 0, led: 0, covered: 0, cost: m.spent, planned: m.planned, overdue: 0 };
  const tally = (r, k, isItem) => {
    const s = sec.get(k), d = isDone(r), u = !d && isDoing(r);
    if (d) st.done++; else if (u) st.doing++;
    if (s) { s.n++; if (d) s.done++; else if (u) s.doing++; }
    stat.get(stat.has(r.status) ? r.status : '').n++;
    if (isItem) { const g = kind.get(kind.has(r.kind) ? r.kind : ''); g.n++; if (d) g.done++; else if (u) g.doing++; }
  };
  for (const e of ents) { tally(e, e.sec, false); const s = sec.get(e.sec); if (s) s.entries++; if (led(lead(e))) { st.led++; if (s) s.led++; } if (e.due && e.due < td && !isDone(e)) st.overdue++; }
  for (const i of its) { tally(i, secOfItem(i), true); if (lead(i, entryOf(i)).how !== 'none') st.covered++; }
  st.secs = [...sec.values()]; st.kinds = [...kind.values()].filter(k => k.n); st.statuses = [...stat.values()].filter(s => s.n);
  st.byPerson = new Map(); st.people = [];
  if (!lite) for (const name of X.names) { const s = personSummary(name); st.byPerson.set(name, s.stats); st.people.push({ name, lead: s.lead, done: s.done, help: s.help, follow: s.follow }); }
  st.decisions = X.decisions.size; st.openDecisions = [...X.decisions.values()].filter(q => q.status !== DECIDED).length;
  st.first = (X.secs.find(s => s.date) || {}).date || ''; st.last = (X.secs.filter(s => s.date).pop() || {}).date || '';
  st.days = st.first ? Math.round((Date.parse(st.first) - Date.parse(td)) / 864e5) : null;
  st.attention = attention != null ? attention : gapList().reduce((a, g) => a + g.rows.length, 0);
  return st;
}
export const whenText = st => st.days == null ? '' : st.days > 1 ? 'In ' + st.days + ' days' : st.days === 1 ? 'Tomorrow' : st.days === 0 ? 'Today' : st.last && st.last >= today() ? 'Under way' : 'Past';

