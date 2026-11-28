/* Keeps the app's own files, one whole version at a time, so the page opens at once with no connection or a poor one, and never from a mix of
   two versions. tools/build-site.mjs writes the version and its files in below, and puts the code itself in a folder named after the version,
   so no copy of an older file, in the browser or on the way, can stand in for a newer one. When the site changes this file changes with it: the
   new version is fetched whole in the background, takes over once every file is here, and the open page offers to reload.
   Only this site's files pass through here: calls to the shared space go straight out. */
const VERSION = "d777341108df", FILES = ["icon-180.png","icon-192.png","icon-32.png","icon-512.png","icon.svg","manifest.webmanifest","templates/10-weekend.json","templates/20-wedding.json","templates/30-party.json","templates/40-conference.json","templates/50-trip.json","templates/index.json","v/d777341108df/app.css","v/d777341108df/index.html","v/d777341108df/js/all.js","v/d777341108df/js/boards.js","v/d777341108df/js/core.js","v/d777341108df/js/device.js","v/d777341108df/js/first.js","v/d777341108df/js/history.js","v/d777341108df/js/home.js","v/d777341108df/js/main.js","v/d777341108df/js/model.js","v/d777341108df/js/plan.js","v/d777341108df/js/print.js","v/d777341108df/js/remote.js","v/d777341108df/js/rules.js","v/d777341108df/js/settings.js","v/d777341108df/js/stats.js","v/d777341108df/js/store.js","v/d777341108df/js/tables.js"], PAGE = "v/d777341108df/index.html";             // filled in by the build; left empty, everything comes from the network as usual
const SCOPE = 'app:' + self.registration.scope + ':', KEEP = SCOPE + VERSION;      // every copy of the app on this address keeps its own: they share one cache storage
const here = url => new URL(url, self.registration.scope).href;
self.addEventListener('install', ev => ev.waitUntil((FILES.length ? caches.open(KEEP).then(c => c.addAll(FILES.map(f => new Request(here(f), { cache: 'reload' })))) : Promise.resolve()).then(() => self.skipWaiting())));
self.addEventListener('activate', ev => ev.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== KEEP && (k.startsWith(SCOPE) || /^app-(files-1|[0-9a-f]{12})$/.test(k))).map(k => caches.delete(k)))).then(() => self.clients.claim())));      // this copy's older versions (and the names earlier builds used)
self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (!FILES.length || req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const key = req.mode === 'navigate' ? here(PAGE) : req;   // the page itself, at whatever address it was opened (the part after # never reaches here)
  ev.respondWith(caches.open(KEEP).then(c => c.match(key, { ignoreSearch: true })).then(hit => hit || fetch(req)).catch(() => fetch(req)));
});
