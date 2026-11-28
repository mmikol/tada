/* What this device keeps: `kept` lasts between visits (localStorage), `tab` until the tab is closed (sessionStorage).
   A browser may refuse either one (private browsing, storage full or turned off). Then nothing is kept, a read gives its fallback,
   and the app carries on as on a first visit. That refusal is handled here once, so no other module needs its own try. */
export const guard = (fn, fallback) => { try { return fn(); } catch (e) { return fallback; } };
const shelf = area => {
  const get = (k, fallback = null) => guard(() => window[area].getItem(k) ?? fallback, fallback);
  const json = (k, fallback) => guard(() => JSON.parse(window[area].getItem(k)) ?? fallback, fallback);
  return {
    get, json,
    list: k => { const a = json(k, []); return Array.isArray(a) ? a : []; },
    set: (k, v) => guard(() => { window[area].setItem(k, String(v)); return true; }, false),
    drop: (...ks) => guard(() => { for (const k of ks) window[area].removeItem(k); }),
  };
};
export const kept = shelf('localStorage'), tab = shelf('sessionStorage');
