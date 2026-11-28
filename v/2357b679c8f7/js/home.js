/* The screens outside any one event: passcode, the list of events, starting a new one, the templates to start from, the app's own settings, and About. */
import { $, esc, S, X, views, acts, changes, submits, plural, pct, toast, render, store, appName, progress, head, moreMenu, askDel, refused } from './core.js';
import { api } from './store.js';
import { kept, tab } from './device.js';
import { spaceInfo, readInvite, inviteLink, connectSpace, pasteInvite, acceptInvite, leaveSpace, keyFault, dataRepo, checkKey, bringHere } from './remote.js';
import { newPlan, slug, uniqueKey, isDate } from './model.js';
import { events, templates, known } from './all.js';
import { whenText } from './stats.js';

const edit = () => S.role === 'edit';
views.boot = () => '';
views.loading = () => '<p class="empty">Loading…</p>';
views.failed = () => '<p class="empty">' + esc(S.failed || 'The server could not be reached.') + '</p><p><button type="button" class="btn" data-act="reload">Try again</button></p>';
const loginSays = () => S.ui.loginErr ? '<p class="bad" role="alert" id="login-err" style="max-width:56ch">' + esc(S.ui.loginErr) + '</p>' : '';      // said in the form itself, where it is looked for
views.login = () => {
  if (!S.static) return '<h2>' + esc(appName()) + '</h2><form class="add" data-act="login" style="max-width:22.5rem;margin-top:0.875rem"><input id="code" type="password" placeholder="Passcode" aria-label="Passcode" autocomplete="current-password"><button class="btn pri" type="submit">Open</button></form>' + loginSays();
  const s = spaceInfo();      // on the edition with no server, the way in is an invitation to a shared plan, and this screen means the one this device holds has stopped working
  return '<h2>' + esc(appName()) + '</h2><p style="max-width:56ch">' + esc(S.why || 'This invitation has stopped working.') + '</p>' +
    '<p class="muted" style="max-width:56ch">Ask the person who invited you for a new link, and paste it here.' + (s ? '</p><p class="muted" style="max-width:56ch">If the plan is yours, make a new key and paste it here instead: ' + keySteps(s.repo, false) + ' Then send everyone a new invitation link from Settings, Sharing.' : '') + '</p>' +
    '<form class="add" data-act="login" style="max-width:32.5rem"><input id="code" placeholder="Invitation link" aria-label="Invitation link, or a new key" autocomplete="off"><button class="btn pri" type="submit">Open</button></form>' + loginSays() +
    '<p style="margin-top:1.125rem"><button type="button" class="btn" data-act="logout">Use this device on its own instead</button></p>';
};
views.home = () => (S.q ? views['~find'] : views['~' + S.hv] || views['~events'])();
submits.login = () => {
  const code = $('#code').value.trim(), say = m => { S.ui.loginErr = m; render(); };
  if (S.static && /join=/.test(code)) {                  // an invitation goes the way every invitation goes: checked, and asked about first where it would replace something
    pasteInvite(code).then(r => { const why = r && inviteTrouble(r); if (why) say(why); else arrived(r); }, () => say('That invitation could not be checked. Try again.'));
    return false;
  }
  api('api/login', { method: 'POST', body: { code } }).then(r => { if (r && r.newKey) later('The new key is in place. Everyone else needs a new invitation link: Settings, Sharing, Copy an invitation link.'); location.reload(); }, e => say((e && e.message) || 'That passcode is not right.'));
  return false;
};
acts.logout = () => { api('api/logout', { method: 'POST', body: {} }).then(() => location.reload(), e => refused(e, 'Not signed out')); return false; };
acts.reload = () => { location.reload(); return false; };

/* ---------- invitations, on the edition with no server ---------- */
const later = msg => tab.set('app.flash', msg);      // said once the page has started again
/* What is wrong with an invitation, in words, or '' when it was taken (or needs a question answered first). */
function inviteTrouble(r) {
  if (r.bad) return 'That invitation link is not complete. Ask for it to be sent again.';
  if (r.dead) return 'GitHub does not accept the key in that invitation, so nothing was changed. Ask for a new link.';
  if (r.unknown) return 'No connection, so that invitation could not be checked. It is kept, and tried again when the page is opened with a connection.';
  if (r.address) return 'That is the address of an event, not an invitation. An invitation link comes from Settings, Sharing, on a device that is in the plan.';
  return '';
}
/* What became of an invitation, wherever the link came from. True when there was one. */
export function arrived(r) {
  if (!r) return false;
  const why = inviteTrouble(r);
  if (why) toast(why, r.unknown ? () => location.reload() : null, r.unknown ? 'Try again' : null, true);
  else if (r.ask) { S.ask = r; S.screen = 'switch'; S.plan = null; S.ready = false; render(); }
  else location.reload();
  return true;
}
views.switch = () => S.ask.weaker
  ? '<h2>Keep editing on this device?</h2><p style="max-width:56ch">This device can change the shared plan <b>' + esc(S.ask.now) + '</b>. The link you opened is for the same plan, but it only lets you look. Use it only if this device should stop changing the plan.</p>' +
    '<div class="tools"><button type="button" class="btn pri" data-act="switch-no">Keep editing</button><button type="button" class="btn" data-act="switch-yes">Use the link that only looks</button></div>'
  : '<h2>Open a different shared plan?</h2><p style="max-width:56ch">This device is in the shared plan <b>' + esc(S.ask.now) + '</b>. The link you opened is for another one, <b>' + esc(S.ask.ask) + '</b>. Switching makes this device forget the first, and the copy of it kept here.</p>' +
    '<div class="tools"><button type="button" class="btn pri" data-act="switch-no">Stay in ' + esc(S.ask.now) + '</button><button type="button" class="btn" data-act="switch-yes">Switch</button></div>';
acts['switch-no'] = () => { location.reload(); return false; };
acts['switch-yes'] = (d, t) => {
  if (S.ui.switching) return false;                      // one tap is enough: a second would find the invitation already being checked
  S.ui.switching = true; t.disabled = true; t.textContent = 'Checking…';
  acceptInvite().then(w => {
    if (w === 'gone') return;
    if (w === 'dead') later('GitHub does not accept the key in that invitation, so this device stays as it was.');
    else if (w === 'unknown') later('No connection, so that invitation could not be checked. This device stays as it was for now; the link is kept and asked about again.');
    location.reload();
  });
  return false;
};
const joinForm = id => '<form class="add" data-act="space-join" data-in="' + id + '" style="max-width:35rem;margin-top:0"><input id="' + id + '" placeholder="Paste an invitation link" aria-label="Invitation link" autocomplete="off"><button class="btn" type="submit">Open</button></form>';
submits['space-join'] = d => { pasteInvite($('#' + (d.in || 'sp-invite')).value).then(r => { if (!arrived(r)) toast('That is not an invitation link.'); }); return false; };
/* On the list of events: which plan this is, and for a device with nothing on it the way into a shared one. Events made on this device before it
   joined are not in the shared plan; they are said to be here, with the way to bring them in. */
function where() {
  if (!S.static) return '';
  const s = spaceInfo();
  if (s) {
    const apart = store.loaded ? (S.own || []).filter(e => !X.plans.some(p => p.carried === e.mark)) : [];      // compared with the shared list only once it is here
    return '<p class="muted where">Shared plan: ' + esc(s.repo) + (S.why ? '<br>' + esc(S.why) : '') + '</p>' +
      (apart.length && edit() ? '<p class="muted where">' + esc(plural(apart.length, 'event') + ' made on this device before it joined ' + (apart.length === 1 ? 'is' : 'are') + ' kept here, outside the shared plan: ' + apart.map(e => e.name).join(', ') + '.') +
        ' <button type="button" class="btn sm" data-act="bring-own">Bring ' + (apart.length === 1 ? 'it' : 'them') + ' in</button></p>' : '');
  }
  return '<p class="muted where">These events are kept on this device only.' + (X.events.length ? '' : ' Were you sent an invitation? Paste the link here to open the shared plan.') + '</p>' + (X.events.length ? '' : joinForm('ev-invite'));
}
acts['bring-own'] = (d, t) => {
  if (S.ui.bringing) return false;                       // a second tap while the first is copying would copy them twice
  S.ui.bringing = true; t.disabled = true;
  toast('Copying…');
  bringHere(m => toast(m)).finally(() => { S.ui.bringing = false; }).then(r => toast(r.n ? plural(r.n, 'event') + ' brought into the shared plan.' + (r.missed ? ' ' + plural(r.missed, 'photo') + ' could not be sent; add ' + (r.missed === 1 ? 'it' : 'them') + ' again from the row.' : '') : 'Nothing needed bringing.', null, null, !!r.missed),
    e => toast('Not brought in (' + ((e && e.message) || 'error') + ').', null, null, true));
  return false;
};

/* ---------- starting something new ---------- */
/* The form for a new event (or, with kind "template", a new template): a name, what to start from, and for an event its days. */
function startForm(kind) {
  const tpl = kind === 'template', pick = S.ui.from || 'blank';      // a new event starts blank unless a template was chosen
  const opt = (v, label, days) => '<option value="' + esc(v) + '"' + (days != null ? ' data-days="' + (Number(days) || 0) + '"' : '') + (v === pick ? ' selected' : '') + '>' + esc(label) + '</option>';
  const days = Number((X.templates.find(t => 't:' + t.id === pick) || {}).days) || 1;
  return '<form class="ed newev" data-act="new-plan" data-kind="' + (tpl ? 'template' : '') + '"><label class="wide2" for="np-name">Name<input id="np-name" placeholder="' + (tpl ? 'What the template is for' : 'What the event is called') + '" autocomplete="off" required></label>' +
    '<label for="np-tpl">Start from<select id="np-tpl" data-act="np-from">' + (X.templates.length ? '<optgroup label="A template">' + X.templates.map(t => opt('t:' + t.id, t.name, t.days)).join('') + '</optgroup>' : '') + '<optgroup label="Nothing">' + opt('blank', 'Blank', 1) + '</optgroup>' +
    (X.events.length ? '<optgroup label="The same setup as">' + X.events.map(p => opt('p:' + p.id, p.name)).join('') + '</optgroup>' : '') + '</select></label>' +
    (tpl ? '' : '<label for="np-first">First day<input id="np-first" type="date"></label>') + '<label for="np-days">Days<input id="np-days" type="number" min="' + (tpl ? 0 : 1) + '" max="31" value="' + days + '"></label>' +
    '<div class="wide row"><button class="btn pri" type="submit">Create</button><button type="button" class="btn" data-act="ui" data-k="newev">Cancel</button></div></form>';
}
changes['np-from'] = (d, t) => { const o = t.selectedOptions[0], n = o && o.dataset.days; if (n) $('#np-days').value = n; return false; };      // a template suggests how many days it was made for
const send = pack => api('api/plans/import', { method: 'POST', body: pack, say: m => toast(m) }).then(r => {
  S.ui.newev = false; location.hash = '#/' + r.id;
  if (r.missed) setTimeout(() => toast(plural(r.missed, 'photo') + ' in that file could not be brought in. Add ' + (r.missed === 1 ? 'it' : 'them') + ' again from the row.', null, null, true), 800);
}, e => refused(e, 'Not created'));
const docsOf = id => api('api/docs?lean=1&scope=' + encodeURIComponent('p/' + id)).then(r => { const pre = 'p/' + id + '/', m = new Map(r.docs.map(d => [d.path.slice(pre.length), d.data])); return m; });
submits['new-plan'] = (d) => {
  const tpl = d.kind === 'template', name = $('#np-name').value.trim(), from = $('#np-tpl').value, first = tpl ? '' : $('#np-first').value, days = Math.max(tpl ? 0 : 1, Math.min(31, Number($('#np-days').value) || 0));
  if (!name) return false;
  const id = uniqueKey((tpl ? 'tpl-' : '') + (slug(name) || 'event'), X.plans.map(p => p.id)), base = { id, name, first, days, kind: tpl ? 'template' : '' };
  if (from === 'blank') send(newPlan(base));
  else docsOf(from.slice(2)).then(m => {
    const whole = from[0] === 't';                         // a template comes with everything in it; another event lends only its setup
    const rows = whole ? [...m].filter(([p]) => /^(entries|items|rows|handouts|decisions)\//.test(p)).map(([path, data]) => ({ path, data })) : [];
    return send(newPlan(Object.assign(base, { config: m.get('meta/config'), people: whole ? m.get('meta/people') : null, docs: rows, from: from.slice(2) })));
  }, e => toast((e && e.message) || 'error'));
  return false;
};
document.addEventListener('change', ev => {
  if (ev.target.id !== 'imp-pack') return;
  const f = ev.target.files && ev.target.files[0];
  if (f) f.text().then(t => { const pack = JSON.parse(t); if (!pack || !pack.plan || !Array.isArray(pack.docs)) throw new Error('That file is not an exported event.'); return send(pack); }).catch(e => toast(e instanceof SyntaxError || !(e && e.message) ? 'That file could not be read.' : e.message));
});
const importBtn = label => '<label class="btn file" for="imp-pack">' + label + '<input type="file" id="imp-pack" accept=".json,application/json"></label>';

/* ---------- events ---------- */
views['~events'] = () => {
  const evs = events() || [], stats = new Map(evs.map(ix => [ix.id, ix.stats])), word = new Map(evs.map(ix => [ix.id, ix.w.done])), at = new Map(evs.map((ix, i) => [ix.id, i]));      // soonest first, once their dates are known
  const list = X.events.slice().sort((a, b) => (at.has(a.id) ? at.get(a.id) : 1e9) - (at.has(b.id) ? at.get(b.id) : 1e9));
  let h = head('Events', { actions: edit() ? '<button type="button" class="btn pri new" data-act="ui" data-k="newev" aria-expanded="' + !!S.ui.newev + '">New event</button>' + moreMenu(importBtn('Import an event (.json)')) : '' }) + where();
  if (edit() && S.ui.newev) h += startForm('');
  h += '<div class="cards home">';
  for (const p of list) {
    const s = stats.get(p.id);
    h += '<a class="card" href="#/' + esc(p.id) + '"><b>' + esc(p.name) + '</b><span class="th">' + esc(p.dates || '') + '</span>' +
      (s ? progress(s.done, s.doing, s.rows, p.name, word.get(p.id)) + '<small class="num">' + (s.rows ? pct(s.done, s.rows) + '% ' + esc(word.get(p.id)) : 'Nothing in it yet') + '</small><small class="num">' + esc(whenText(s) || '') + '</small>' : '<span></span><small></small><small></small>') + '</a>';
  }
  h += '</div>' + (list.length ? '' : '<p class="empty">No events yet.' + (edit() ? ' Start one from a template, or blank.' : '') + '</p>');
  return h;
};

/* ---------- templates ---------- */
views['~templates'] = () => {
  const all = templates(), by = new Map((all || []).map(ix => [ix.id, ix]));
  let h = head('Templates', { actions: edit() ? '<button type="button" class="btn pri new" data-act="ui" data-k="newev" aria-expanded="' + !!S.ui.newev + '">New template</button>' + moreMenu(importBtn('Import a template (.json)') + '<button type="button" class="btn" data-act="tpl-restore">Restore the starter templates</button>') : '' }) +
    '<p class="muted hint">New events start as a copy of one. Save any event as a template from its Settings.</p>';
  if (edit() && S.ui.newev) h += startForm('template');
  h += '<div class="box">';
  for (const t of X.templates) {
    const ix = by.get(t.id), c = ix && ix.cfg, bits = c ? [plural((c.sections || []).filter(s => s.kind === 'day').length, 'day'), (c.tables || []).map(x => x.name).join(', '), ix.stats.rows ? plural(ix.stats.rows, 'starting row') : 'no starting rows'].filter(Boolean) : [];
    h += '<div class="rr"><div class="who"><a class="lnk" href="#/' + esc(t.id) + '">' + esc(t.name) + '</a><span class="ctx">' + esc(t.note || '') + '</span><span class="ctx">' + esc(bits.join(', ')) + '</span></div><div class="ctl">' +
      (edit() ? (S.confirm === 'tpl-' + t.id ? askDel('Delete this template?', ' data-act="tpl-del-yes" data-id="' + esc(t.id) + '"')
        : '<button type="button" class="btn sm" data-act="tpl-use" data-id="' + esc(t.id) + '">New event from this</button><a class="btn sm" href="#/' + esc(t.id) + '">Open</a><button type="button" class="btn sm danger" data-act="tpl-del" data-id="' + esc(t.id) + '">Delete</button>') : '') + '</div></div>';
  }
  return h + (X.templates.length ? '' : '<p class="empty">No templates.</p>') + '</div>';
};
acts['tpl-use'] = d => { S.ui.newev = true; S.ui.from = 't:' + d.id; location.hash = '#/'; return false; };
acts['tpl-del'] = d => { S.confirm = 'tpl-' + d.id; };
acts['tpl-del-yes'] = d => { S.confirm = null; api('api/plans/' + d.id, { method: 'DELETE' }).then(() => toast('Template deleted.'), e => refused(e, 'Not deleted')); };
acts['tpl-restore'] = () => { api('api/templates/restore', { method: 'POST', body: {} }).then(r => toast(r.added ? plural(r.added, 'template') + ' restored.' : 'The starter templates are all here already.'), e => refused(e, 'Not restored')); return false; };

/* ---------- the app's own settings ---------- */
export const deviceBox = () => '<div class="box"><div class="pad"><div class="ed" style="margin-top:0.5rem"><label for="me">Your name, shown in History<input id="me" data-act="me" value="' + esc(S.me) + '" autocomplete="name"></label>' +
  '<label for="theme">Colours<select id="theme" data-act="theme">' + [['', 'Match this device'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => '<option value="' + v + '"' + (theme() === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
  '<label for="ui-size">Size of text and controls<select id="ui-size" data-act="ui-size">' + SIZES.map(([v, l]) => '<option value="' + v + '"' + (uiSize() === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label></div></div></div>';
/* Everything is measured in one size, so this one choice scales the whole page on this device. It grows with the window as well. */
const SIZES = [['0.875', 'Smaller'], ['1', 'Usual'], ['1.125', 'Larger'], ['1.25', 'Largest']];
const uiSize = () => { const v = kept.get('app.ui', '1'); return SIZES.some(x => x[0] === v) ? v : '1'; };
changes['ui-size'] = (d, t) => { const v = SIZES.some(x => x[0] === t.value) ? t.value : '1'; if (v === '1') kept.drop('app.ui'); else kept.set('app.ui', v); if (v === '1') document.documentElement.style.removeProperty('--ui'); else document.documentElement.style.setProperty('--ui', v); return false; };
const theme = () => kept.get('app.theme', '');
/* About: what the app is, and where this device keeps its plan. The name is a setting; the letters of TA-DA are spelled out only while it is called that. */
views['~about'] = () => {
  const name = appName(), tada = name.replace(/[^a-z]/gi, '').toUpperCase() === 'TADA', s = S.static ? spaceInfo() : null;
  const version = (/\/v\/([0-9a-f]{12})\//.exec(import.meta.url) || [])[1] || '';
  const where = !S.static ? 'On the server this app runs on, for everyone who opens it.' : s ? 'In the shared plan ' + s.repo + ', a private GitHub repository. Everyone with an invitation link sees the same plan.' : 'In this browser only, until a shared plan is set up in Settings.';
  return '<div class="about"><img src="icon.svg" alt="" width="64" height="64"><h2>' + esc(name) + '</h2>' +
    (tada ? '<p class="acro"><span><b>T</b>asks</span> <span><b>A</b>ssignments</span> <span><b>D</b>ates</span> <span><b>A</b>ttendees</span></p>' : '') +
    '<p>Plan an event together: what happens when, who leads each part, what to buy and bring, who is coming and where they sleep. When it is all done: ta-da.</p>' +
    '<h3>Your plan is kept</h3><p>' + esc(where) + '</p>' +
    '<p class="muted num">' + [version && 'Version ' + esc(version), tada ? 'Formerly Muster' : ''].filter(Boolean).join('<br>') + '</p></div>';
};
views['~settings'] = () => {
  let h = '<h2>Settings</h2><h3>This app</h3><div class="box"><div class="pad"><div class="ed" style="margin-top:0.5rem"><label class="wide2" for="app-name">App name<input id="app-name" data-act="app-name" value="' + esc(appName()) + '" maxlength="60"' + (edit() ? '' : ' disabled') + '></label></div></div></div>' +
    '<p class="muted">Wording, currency, clock and views are set in each event’s own Settings.</p>' +
    sharing() + '<h3>This device</h3>' + deviceBox();
  if (S.locked) h += '<p style="margin-top:1.375rem"><button type="button" class="btn" data-act="logout">Lock</button></p>';
  return h;
};
/* Where the plan is kept, on the edition that runs with no server: in this browser only, or in a shared space that others join by invitation. */
/* GitHub's form for a new key, filled in as far as GitHub allows: a name, what it is for, how long it lasts and what it may do. Which repository
   it opens cannot be filled in, so the steps say it. It lasts until two weeks after the last day of any event here (three months when no event has dates). */
function keyForm(repo, look) {
  const last = (known() || []).flatMap(ix => (ix.secs || []).map(s => s.date)).filter(isDate).sort().pop(), ahead = last ? Math.ceil((Date.parse(last + 'T00:00:00Z') - Date.now()) / 864e5) + 14 : 0;
  const days = Math.max(90, Math.min(366, ahead));      // at least three months, longer for an event further off; GitHub's form lets the owner change it
  const q = { name: Array.from(appName() + (look ? ' (look only)' : '')).slice(0, 40).join(''), description: (repo ? 'Opens the shared plan ' + repo : 'Opens a shared plan') + (look ? ', to look at only' : ''), expires_in: String(days), contents: look ? 'read' : 'write' };
  if (repo) q.target_name = repo.split('/')[0];
  return 'github.com/settings/personal-access-tokens/new?' + Object.entries(q).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
}
const ext = (href, text) => '<a class="lnk" href="https://' + esc(href) + '" target="_blank" rel="noopener">' + esc(text || href) + '</a>';
const keySteps = (repo, look) => 'Open ' + ext(keyForm(repo, look), 'GitHub’s form for a new key') + '. It comes with a name, an expiry date and the permission it needs (Contents, <b>' + (look ? 'Read-only' : 'Read and write') + '</b>) filled in. ' +
  'Under Repository access choose <b>Only select repositories</b> and pick ' + (repo ? '<b>' + esc(repo) + '</b>' : 'the plan’s repository') + ', and nothing else: not All repositories. Press Generate token and copy the key; GitHub shows it only once.';
function sharing() {
  if (!S.static) return '';
  const s = spaceInfo();
  if (s) return '<h3>Sharing</h3><p style="max-width:66ch">This device works in the shared plan <b>' + esc(s.repo) + '</b>, a private GitHub repository. Everyone with an invitation link sees the same plan, and a change reaches the others within a few seconds.</p>' +
    '<div class="tools"><button type="button" class="btn pri" data-act="space-copy">Copy an invitation link</button><button type="button" class="btn" data-act="ui" data-k="spother" aria-expanded="' + !!S.ui.spother + '">A link that only looks</button><button type="button" class="btn" data-act="ui" data-k="spkey" aria-expanded="' + !!S.ui.spkey + '">Replace the key</button>' +
    (S.confirm === 'space' ? '' : '<button type="button" class="btn" data-act="space-leave">Leave on this device</button>') + '</div>' +
    (S.confirm === 'space' ? '<p style="max-width:66ch"><span class="bad">Leave the shared plan on this device?</span> The plan stays where it is and the others can still open it. This device forgets the key and the copy of the plan kept here, so copy an invitation link first if you want to come back.</p>' +
      '<div class="tools"><button type="button" class="btn danger" data-act="space-leave">Leave</button><button type="button" class="btn" data-act="cancel-confirm">Stay</button></div>' : '') +
    (S.ui.invite ? '<p class="muted" style="max-width:66ch">Send this privately. ' + esc(S.ui.inviteSays || 'Anyone who opens it can read and change the plan.') + '</p><div class="ed"><label class="wide" for="sp-link">Invitation link<textarea id="sp-link" class="line" rows="1" readonly>' + esc(S.ui.invite) + '</textarea></label></div>' : '') +
    (S.ui.spother ? '<p class="muted" style="max-width:66ch">For people who should see the plan but not change it, make a second key: ' + keySteps(s.repo, true) + ' Enter it here for a link of its own. ' +
      'To see what that link shows, open it in a private window or on another device: opened here, it would offer to replace this device’s key.</p>' +
      '<form class="add" data-act="space-other" style="max-width:35rem;margin-top:0"><input id="sp-other" type="password" placeholder="github_pat_" aria-label="Another key for this repository" autocomplete="off"><button class="btn" type="submit">Make its link</button></form>' : '') +
    (S.ui.spkey ? '<p class="muted" style="max-width:66ch">When the key runs out, or after you delete it on GitHub, make a new one: ' + keySteps(s.repo, false) + ' Enter it here, then send everyone a new invitation link: the old links carry the old key.</p>' +
      '<form class="add" data-act="space-key" style="max-width:35rem;margin-top:0"><input id="sp-newkey" type="password" placeholder="github_pat_" aria-label="New key" autocomplete="off"><button class="btn" type="submit">Save</button></form>' : '') +
    '<p class="muted" style="max-width:66ch">Every invitation link carries a key: the plan’s own, or one made for a link that only looks. GitHub stops taking a key on the date it was made to run out, so give it one after the event. To stop sharing, delete the keys at ' + ext('github.com/settings/personal-access-tokens') + ' (the plan’s own, and any made for links that only look); a device keeps its copy of the plan until it next connects. To let people back in, make a new key and paste it here under Replace the key (or, once the old one has stopped working, on the screen the app then opens with), and send new links.</p>';
  const mine = X.events.length, made = dataRepo();
  return '<h3>Sharing</h3><p style="max-width:66ch">Your events are kept on this device only. To plan with others, open an invitation link, or set up a shared plan.</p>' +
    joinForm('sp-invite') +
    '<div class="tools"><button type="button" class="btn" data-act="ui" data-k="spnew" aria-expanded="' + !!S.ui.spnew + '">Set up a shared plan</button></div>' +
    (S.ui.spnew ? '<div class="box"><div class="pad"><p style="max-width:70ch;margin:0.625rem 0 0">A shared plan lives in a private GitHub repository, and a key opens it. Both are made on GitHub, signed in to your account.</p>' +
      '<ol class="steps"><li>' + (made ? 'The private repository <b>' + esc(made) + '</b> was made for this when the site was published, so this step is done. (Any other empty private repository works too: make one at ' + ext('github.com/new') + '.)'
        : 'Open ' + ext('github.com/new') + '. Give the repository a name, choose <b>Private</b>, and press Create repository. Leave it empty.') + '</li>' +
      '<li>' + keySteps(made, false) + '</li>' +
      '<li>Enter both here and press Connect. Then copy an invitation link from this page and send it, privately, to each person.</li></ol>' +
      '<form class="ed" data-act="space-new"><label for="sp-repo">Repository<input id="sp-repo" placeholder="your-name/plan-data" value="' + esc(made) + '" autocomplete="off" required></label><label for="sp-token">Key<input id="sp-token" type="password" placeholder="github_pat_" autocomplete="off" required></label>' +
      (mine ? '<label class="chk wide" for="sp-carry"><input type="checkbox" id="sp-carry" checked> Bring the ' + (mine === 1 ? 'event' : mine + ' events') + ' on this device into it</label>' : '') +
      '<div class="wide row"><button class="btn pri" type="submit"' + (S.ui.spbusy ? ' disabled' : '') + '>Connect</button></div>' +
      '<p class="wide ' + (S.ui.sperr ? 'bad' : 'muted') + '" id="sp-say" role="status" style="margin:0">' + esc(S.ui.sperr || S.ui.spsay || '') + '</p></form></div></div>' : '');
}
const missedSay = n => n ? ' ' + plural(n, 'photo') + ' could not be sent; add ' + (n === 1 ? 'it' : 'them') + ' again from the row.' : '';
submits['space-new'] = () => {
  if (S.ui.spbusy) return false;
  const raw = $('#sp-repo').value.trim(), token = $('#sp-token').value.trim(), box = $('#sp-carry'), carry = !!(box && box.checked);
  const inv = readInvite(raw) ? raw : readInvite(token) ? token : '';
  if (inv) { pasteInvite(inv).then(arrived); return false; }      // an invitation pasted into these boxes is taken as one
  const repo = raw.replace(/^(https?:\/\/)?(www\.)?github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '');
  const say = m => { S.ui.spsay = m; const n = $('#sp-say'); if (n) { n.textContent = m; n.className = 'wide muted'; } };
  S.ui.spbusy = true; S.ui.sperr = ''; S.ui.spsay = 'Connecting…'; render();
  connectSpace({ repo, token }, carry, say).then(r => { later('Connected.' + (carry ? ' ' + (r.n ? plural(r.n, 'event') + ' came along.' : 'Nothing needed bringing.') : '') + missedSay(r.missed) + ' Copy an invitation link under Settings to bring people in.'); location.reload(); },
    e => { S.ui.spbusy = false; S.ui.spsay = ''; S.ui.sperr = 'Not connected. ' + ((e && e.message) || 'Something went wrong.'); render(); });
  return false;
};
submits['space-other'] = () => {
  const s = spaceInfo(), token = $('#sp-other').value.trim(), bad = keyFault(token);
  if (bad) { toast(bad, null, null, true); return false; }
  if (token === s.token) { toast('That is the key this device uses. Copy an invitation link for it instead.'); return false; }
  toast('Checking that key…');
  checkKey({ repo: s.repo, token }).then(k => {         // a link is made only for a key that opens this plan and nothing more, and says what it lets people do
    if (!k.ok) { toast('No link made. ' + k.why, null, null, true); return; }
    S.ui.invite = inviteLink({ repo: s.repo, token }); S.ui.spother = false;
    S.ui.inviteSays = k.edits === 'yes' ? 'Anyone who opens it can read and change the plan.' : k.edits === 'no' ? 'Anyone who opens it can look at the plan, but not change it.' : 'Whether it lets people change the plan could not be told just now.';
    render(); toast('The link for that key is below. Send it privately.');
  });
  return false;
};
submits['space-key'] = () => {
  const s = spaceInfo(), token = $('#sp-newkey').value.trim(), bad = keyFault(token);
  if (bad) { toast(bad, null, null, true); return false; }
  toast('Checking the new key…');
  connectSpace({ repo: s.repo, token }, false).then(() => { later('The new key is in place. Send everyone a new invitation link: the old links carry the old key.'); location.reload(); }, e => toast('Not changed. ' + ((e && e.message) || 'Something went wrong.'), null, null, true));
  return false;
};
acts['space-copy'] = () => {
  const link = S.ui.invite = inviteLink(spaceInfo());
  S.ui.inviteSays = S.readonly ? 'Anyone who opens it can look at the plan, but not change it.' : S.offline && !S.checked ? 'Anyone who opens it can do what this device’s key allows.' : 'Anyone who opens it can read and change the plan.';
  (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => toast('Invitation link copied. Send it privately.'), () => toast('Select the link and copy it.'));
};
acts['space-leave'] = () => { if (S.confirm !== 'space') { S.confirm = 'space'; return; } leaveSpace().then(() => location.reload()); return false; };
changes['app-name'] = (d, t) => {
  const name = t.value.trim().slice(0, 60);
  if (!name) { t.value = appName(); return false; }
  const b = store.batch();
  b.set('app/settings', Object.assign({}, store.docs.get('app/settings'), { name }));
  b.commit().then(() => { toast('The app is now called ' + name); render(); }, e => { toast('Not saved (' + ((e && e.message) || 'error') + ').'); render(); });
};
changes.me = (d, t) => { S.me = t.value.trim(); kept.set('app.me', S.me); return false; };
changes.theme = (d, t) => { kept.set('app.theme', t.value); if (t.value) document.documentElement.dataset.theme = t.value; else delete document.documentElement.dataset.theme; return false; };
