/* Start-up and routing. #/ is the list of events and #/~/<view> a view across all of them; #/<event>/<view>/<arg> is one view of one event,
   and #/<event>/go/<kind>/<id> opens that event at one row. */
import { S, store, render, toast, goTo, openInList } from './core.js';
import { api } from './store.js';
import { kept, tab } from './device.js';
import { STATIC, takeInvite, pasteInvite, spaceInfo, onSpace, ownEvents } from './remote.js';
import { arrived } from './home.js';
import './all.js';
import './plan.js';
import './tables.js';
import './stats.js';
import './history.js';
import './print.js';
import './settings.js';
import './boards.js';

function resetPlanState() { S.open = new Set(); S.edit = null; S.confirm = null; S.ui = {}; S.q = ''; S.undoStack = []; S.redoStack = []; S.undid = new Set(); S.pruned = new Set(); S.orig = null; S.origFor = null; S.origP = null; S.origFail = false; S.lastErr = false; S.savedAt = 0; document.getElementById('q').value = ''; }
let routing = 0;
async function route() {
  if (S.static && /^#join=/.test(location.hash)) {       // an invitation pasted into the address bar of a page that is already open
    const r = await takeInvite().catch(() => null);
    if (/^#join=/.test(location.hash)) return;           // the address could not be cleaned by rewriting it, so it was changed, and that brings this back round
    arrived(r);
    if (!r || r.bad || r.dead || r.unknown) route();
    return;
  }
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(x => { try { return decodeURIComponent(x); } catch (e) { return x; } });
  const plan = parts[0] === '~' ? '' : parts[0] || '', turn = ++routing;
  try {
    if (!plan) {
      if (S.plan || S.screen !== 'home') resetPlanState();
      const hv = parts[1] || 'events', harg = parts.slice(2).join('/');
      if (hv !== S.hv || harg !== S.harg) { S.jump = '@top'; S.confirm = null; }
      S.screen = 'home'; S.plan = null; S.ready = false; S.hv = hv; S.harg = harg; S.q = ''; S.fresh = true; document.getElementById('q').value = '';
      await store.use(['root']);
      if (turn === routing) render();
      return;
    }
    if (plan !== S.plan || !S.ready) {
      S.plan = plan; S.ready = false; S.screen = 'plan'; resetPlanState(); render();
      await store.use(['root', 'p/' + plan]);
      if (turn !== routing) return;
      if (!store.docs.has('plans/' + plan)) {
        S.plan = null;
        toast(S.static && !spaceInfo() ? 'There is no such event on this device. If it is in a shared plan, open the invitation link you were sent first.' : 'That event does not exist.', null, null, S.static && !spaceInfo());
        location.hash = '#/'; return;
      }
      S.ready = true;
    }
    S.q = ''; S.confirm = null;
    if (parts[1] === 'go') { S.view = 'overview'; S.arg = ''; render(); goTo(parts[2] || '', parts.slice(3).join('/'), true); return; }
    if (parts[1] === 'list') { S.view = 'overview'; S.arg = ''; render(); openInList(parts.slice(2).join('/'), true); return; }      // an item from the Lists of every event, opened where it can be changed
    S.view = parts[1] || 'overview'; S.arg = parts.slice(2).join('/');
    if (!S.jump) S.jump = '@top';
    render();
  } catch (e) {
    if (turn !== routing) return;
    const me = await api('api/me').catch(() => null);
    if (me && me.role === 'none') { S.role = 'none'; S.why = me.why || S.why; S.screen = 'login'; } else { S.screen = 'failed'; S.failed = (e && e.message) || ''; }
    S.plan = null; S.ready = false; render();
  }
}
/* The shared plan went out of reach or came back, turned out to be view-only, or stopped taking this device's key. */
function spaceSays(st) {
  if (st.denied) { S.role = 'none'; S.screen = 'login'; S.why = st.denied.message || ''; S.plan = null; S.ready = false; render(); return; }
  if (S.role === 'none') return;
  S.offline = !!st.offline; S.until = st.until || 0; S.since = st.since || 0; S.why = st.why || ''; S.readonly = !!st.readonly; S.checked = !!st.checked;
  S.role = st.offline || st.readonly ? 'view' : 'edit';
  render();
}
async function boot() {
  const early = () => { if (/^#join=/.test(location.hash)) location.reload(); };      // an invitation pasted into the address bar while one of the screens below is up
  window.addEventListener('hashchange', early);
  if (STATIC && navigator.serviceWorker) {               // keeps the app's own files, so the page still opens with no connection or a poor one; first, so no update is missed
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) toast('A newer version of the app is ready.', () => location.reload(), 'Reload', true); });
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  S.me = kept.get('app.me', '');
  const th = kept.get('app.theme');
  if (th) document.documentElement.dataset.theme = th;
  let said = tab.get('app.flash', '');      // a message left for after the page started again
  tab.drop('app.flash');
  const inv = await takeInvite().catch(() => null);      // arriving through an invitation: remember the shared plan it names
  const tell = () => { if (said) toast(said, null, null, /not|No connection/.test(said)); said = ''; };
  if (inv && inv.ask) { S.static = true; S.app = (document.querySelector('meta[name="apple-mobile-web-app-title"]') || {}).content || ''; arrived(inv); tell(); return; }      // asked first: another plan, or a link that only looks
  let me;
  try { me = await api('api/me'); } catch (e) { S.screen = 'failed'; S.failed = (e && e.message) || ''; render(); tell(); return; }
  S.app = me.app; S.role = me.role; S.locked = me.locked; S.static = !!me.static; S.space = me.space || ''; S.why = me.why || ''; S.offline = !!me.offline; S.until = me.until || 0; S.since = me.since || 0; S.readonly = !!me.readonly; S.checked = !!me.checked;
  if (me.role === 'none') { S.screen = 'login'; render(); tell(); if (inv && (inv.bad || inv.dead || inv.unknown)) arrived(inv); return; }
  window.removeEventListener('hashchange', early);
  window.addEventListener('hashchange', route);
  store.on(ev => { if (ev.gone && S.plan && S.ready && ev.gone === 'p/' + S.plan) { toast('This was deleted.'); location.hash = '#/'; } });
  let idle = 0;
  document.addEventListener('visibilitychange', () => { clearTimeout(idle); if (document.visibilityState === 'hidden') idle = setTimeout(() => store.pause(), store.idleMs); else store.resume(); });
  if (S.static) {
    onSpace(spaceSays);
    window.addEventListener('beforeunload', ev => { if (store.busy) { ev.preventDefault(); ev.returnValue = ''; } });      // here a save takes seconds: leaving in the middle of one would drop it
    document.getElementById('q').addEventListener('input', ev => { const t = ev.target; if (/join=/.test(t.value)) pasteInvite(t.value).then(r => { if (r) { t.value = ''; arrived(r); } }); });      // an invitation pasted into the search box
    if (spaceInfo()) ownEvents().then(l => { S.own = l; if (l.length && S.screen === 'home' && store.loaded) render(); });      // events made on this device before it joined
  }
  window.app = { store, S };
  await route();
  if (inv && (inv.bad || inv.dead || inv.unknown)) arrived(inv);
  tell();
}
boot();
