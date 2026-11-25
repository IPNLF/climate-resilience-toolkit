/* Offline support for the Climate Vulnerability and Resilience Assessment Toolkit.
   Everything the site needs is stored on the phone at install, including the fonts,
   so it opens and works with no signal. A new version replaces the old one on the next visit online. */
var VERSION = "69d2cfbe21";
var CACHE = "toolkit-" + VERSION;
var CORE = ["./", "index.html", "content.json", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];
var FONT_CSS = "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Open+Sans:ital,wght@0,400;0,600;0,700;1,400&display=swap";

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
    return cache.addAll(CORE).then(function () { return cacheFonts(cache); });
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
  // Page loads: the stored page, so the site opens offline
  if (req.mode === "navigate") {
    e.respondWith(caches.match("index.html").then(function (hit) {
      var net = fetch(req).then(function (res) { if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put("index.html", copy); }); } return res; }).catch(function () { return null; });
      return hit || net.then(function (r) { return r || caches.match("index.html"); });
    }));
    return;
  }
  // Fonts and our own files: stored copy first, refreshed in the background when online
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
