/* Offline support for the Climate Vulnerability and Resilience Assessment Toolkit.
   Everything the site needs is stored on the phone at install, including the fonts,
   so it opens and works with no signal. A new version replaces the old one on the next visit online.
   The toolkit text (content.json) is only ever stored if it is complete: a security filter or captive
   portal can return an empty or substitute page, and that must never replace the real text. */
var VERSION = "c05ee4e55c";
var CACHE = "toolkit-" + VERSION;
var CORE = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];
var FONT_CSS = "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Open+Sans:ital,wght@0,400;0,600;0,700;1,400&display=swap";
var MIN_CONTENT = 100000;

function validContent(res) {
  if (!res || !res.ok) return Promise.resolve(null);
  return res.clone().text().then(function (t) {
    if (t.length < MIN_CONTENT) return null;
    try { var d = JSON.parse(t); return Array.isArray(d) && d.length > 100 ? res : null; } catch (e) { return null; }
  }).catch(function () { return null; });
}
function freshContent() {
  return fetch("content.json", { cache: "no-store" }).then(validContent).catch(function () { return null; });
}

function cacheFonts(cache) {
  return fetch(FONT_CSS, { mode: "cors" }).then(function (res) {
    if (!res.ok) return;
    var copy = res.clone();
    return res.text().then(function (css) {
      var urls = (css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g) || []).map(function (u) { return u.slice(4, -1); });
      return Promise.all([cache.put(FONT_CSS, copy)].concat(urls.map(function (u) {
        return fetch(u, { mode: "cors" }).then(function (r) { if (r.ok) return cache.put(u, r); }).catch(function () {});
      })));
    });
  }).catch(function () {});
}

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.addAll(CORE)
      .then(function () { return freshContent(); })
      .then(function (good) { if (good) return cache.put("content.json", good); })
      .then(function () { return cacheFonts(cache); });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf("toolkit-") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // Toolkit text: fresh complete copy when online, stored copy otherwise; never store a bad copy
  if (url.origin === self.location.origin && /\/content\.json$/.test(url.pathname)) {
    e.respondWith(freshContent().then(function (good) {
      if (good) { var copy = good.clone(); caches.open(CACHE).then(function (c) { c.put("content.json", copy); }); return good; }
      return caches.match("content.json").then(function (hit) { return hit || fetch(req); });
    }));
    return;
  }
  // Page loads: the stored page, so the site opens offline
  if (req.mode === "navigate") {
    e.respondWith(caches.match("index.html").then(function (hit) {
      var net = fetch(req).then(function (res) { if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put("index.html", copy); }); } return res; }).catch(function () { return null; });
      return hit || net.then(function (r) { return r || caches.match("index.html"); });
    }));
    return;
  }
  // Fonts and our other files: stored copy first, refreshed in the background when online
  if (url.origin === self.location.origin || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.match(req, { ignoreSearch: url.origin === self.location.origin }).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === "opaque")) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    }));
  }
});
