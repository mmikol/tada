/* The rules every copy of the app writes by: the server (server/server.js, through require), the no-server edition (remote.js), this browser's
   own copy of the documents (store.js) and the screens. No DOM, no network, nothing runs on load, so Node and the browser load the same file.

   Two people changing one list (who is in a room, the people, the sheets) or one set of settings (wording, formats): a change says what it was on
   that person's screen, so what the other person added, took out or moved since then stays, and this person's own additions, removals, edits and
   moves go on top. Items are matched by id, key or name. An item made before items had ids answers to "n-<its name>" (or, with no name, "h-" and a
   hash of what it holds), and keeps that as its id once it is saved again, so renaming it later does not make it a different item. */
export const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
export const merge = (a, b) => { const o = Object.assign({}, a); for (const k of Object.keys(b)) o[k] = isObj(b[k]) && isObj(a[k]) ? merge(a[k], b[k]) : b[k]; return o; };      // b laid over a, nested settings field by field
export const copy = v => JSON.parse(JSON.stringify(v));
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const randomId = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, x => (x % 36).toString(36)).join(''); };
export const newId = () => randomId(15);
export const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : (v && typeof v === 'object') ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v === undefined ? null : v);
export const eq = (a, b) => canon(a == null ? null : a) === canon(b == null ? null : b);      // the same value, whatever order its fields were written in
export const bytes = s => new TextEncoder().encode(String(s)).length;      // size as the server counts it (UTF-8 bytes), not in JavaScript characters
export const MAX_DOC = 256 * 1024;      // one document, in bytes
/* Which space a document is kept in: 'root' (the list of events and templates, and the app's own settings) or 'p/<event>'. '' for a path that
   is not a document path at all, null for one that names no space. */
const SEG = /^[A-Za-z0-9_.~:@+-]{1,200}$/;
export const spaceOf = p => {
  const t = String(p), s = t.split('/');
  if (s.length % 2 || s.length > 16 || t.length > 1000 || !s.every(x => SEG.test(x) && x !== '.' && x !== '..')) return '';
  if ((s[0] === 'plans' || s[0] === 'app') && s.length === 2) return 'root';
  return s[0] === 'p' && s.length >= 4 ? 'p/' + s[1] : null;
};

const hash = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); };
const keyOf = v => isObj(v) ? (v.id != null ? 'i' + v.id : v.key != null ? 'k' + v.key : v.name != null ? 'in-' + v.name : 'ih-' + hash(canon(v))) : 'j' + JSON.stringify(v);
const keysOf = list => { const seen = new Map(); return list.map(v => { const k = keyOf(v), n = seen.get(k) || 0; seen.set(k, n + 1); return n ? k + '-' + n : k; }); };      // the same thing twice stays twice
export function merge3(cur, base, next) {
  if (Array.isArray(cur) && Array.isArray(base) && Array.isArray(next)) {
    const kc = keysOf(cur), kb = keysOf(base), kn = keysOf(next);
    const C = new Map(kc.map((k, i) => [k, cur[i]])), B = new Map(kb.map((k, i) => [k, base[i]])), N = new Map(kn.map((k, i) => [k, next[i]]));
    const keep = k => N.has(k) ? C.has(k) || !B.has(k) : C.has(k) && !B.has(k);      // gone when either side took it out
    const all3 = k => B.has(k) && C.has(k) && N.has(k), sb = kb.filter(all3), sn = kn.filter(all3);
    const moved = sb.some((k, i) => k !== sn[i]);        // the order is this person's only if they moved something; otherwise the stored order stands
    const lead = moved ? kn : kc, other = moved ? kc : kn, out = lead.filter(keep), have = new Set(out);
    other.forEach((k, i) => {                            // the other side's additions go in after their neighbour (before the next one, with none before; last, with neither)
      if (have.has(k) || !keep(k)) return;
      let at = -1;
      for (let j = i - 1; j >= 0 && at < 0; j--) { const p = out.indexOf(other[j]); if (p >= 0) at = p + 1; }
      for (let j = i + 1; j < other.length && at < 0; j++) { const p = out.indexOf(other[j]); if (p >= 0) at = p; }
      out.splice(at < 0 ? out.length : at, 0, k); have.add(k);
    });
    return out.map(k => !N.has(k) ? C.get(k) : C.has(k) && B.has(k) ? merge3(C.get(k), B.get(k), N.get(k)) : N.get(k));
  }
  if (isObj(cur) && isObj(base) && isObj(next)) {
    const o = Object.assign({}, cur);
    for (const k of new Set(Object.keys(base).concat(Object.keys(next)))) { if (eq(base[k], next[k])) continue; if (!(k in next)) delete o[k]; else o[k] = merge3(cur[k], base[k], next[k]); }
    return o;
  }
  return next;
}
/* An update that says what a list or a set of settings was (op.was) is merged into what is stored now (cur); data is the update already laid over cur.
   A field that did not exist yet counts as empty. */
export const mergeLists = (cur, op, data) => {
  if (isObj(op.was)) for (const k of Object.keys(op.was)) {
    const w = op.was[k], n = op.data[k];
    if (Array.isArray(w) && Array.isArray(n)) data[k] = merge3(Array.isArray(cur[k]) ? cur[k] : typeof cur[k] === 'string' && cur[k] ? [cur[k]] : [], w, n);      // a field holding one name is a list of one
    else if (isObj(w) && isObj(n)) data[k] = merge3(isObj(cur[k]) ? cur[k] : {}, w, n);
  }
  return data;
};
/* A list whose items all carry an id: one made before ids existed is given the one it already answers to, so nothing is taken for new. */
export const withIds = list => { if (!Array.isArray(list)) return list; const ks = keysOf(list); return list.map((v, i) => isObj(v) && v.id == null && v.key == null ? Object.assign({ id: ks[i].slice(1) }, v) : v); };
/* The id for a new named item (a person, a team, a status): the one its name would give it, so two people adding the same name at the same moment
   make one item, not two that nobody can tell apart; with a random ending if an item renamed from that name still answers to it. */
export const idFor = (name, list) => { const id = 'n-' + name; return (list || []).some(x => x && x.id === id) ? id + '-' + randomId(5) : id; };
