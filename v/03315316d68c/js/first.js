/* Runs before anything else is fetched. This device's size and side-list width are put in place before the page is drawn, so it never jumps. */
(function () {
  function kept(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }      // a browser that keeps nothing gets the usual sizes
  var ui = Number(kept('app.ui')), w = Number(kept('app.sideW')), r = document.documentElement.style;
  if (ui >= 0.75 && ui <= 1.5) r.setProperty('--ui', String(ui));
  if (w >= 120 && w <= 900) r.setProperty('--side-w', w + 'px');
})();
/* An invitation's key is taken out of the address bar at once and kept in this tab only, until the app picks it up. */
(function () {
  var m = /^#join=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (!m || !document.querySelector('meta[name="planner-backend"][content="static"]')) return;
  try { sessionStorage.setItem('app.join', m[1]); } catch (e) { return; }      // nowhere to keep it: the app reads it from the address instead
  try { history.replaceState(null, '', location.pathname + location.search + '#/'); } catch (e) { location.hash = '#/'; }
})();
