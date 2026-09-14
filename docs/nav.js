/**
 * CRYPTO TERMINAL — Navbar Includer
 * Injects ./navbar.html into a placeholder div#navbar-root on each page.
 * No external deps, no build step, works on GitHub Pages.
 * Fallback: if fetch fails, shows a basic inline navbar so nav never disappears.
 */
(function () {
  var placeholder = document.getElementById('navbar-root');
  if (!placeholder) {
    placeholder = document.createElement('div');
    placeholder.id = 'navbar-root';
    (document.body || document.documentElement).prepend(placeholder);
  }

  // Inline fallback navbar (always available — no JS required)
  var fallback =
    '<nav class="navbar-root" id="cryptoNav">'
    + '<div class="nav-container">'
    + '<a href="index.html" class="nav-brand">CRYPTO TERMINAL</a>'
    + '<a href="index.html" class="nav-link">🏠 หน้าแรก</a>'
    + '<a href="dipbuy.html" class="nav-link">Dip-Buy DCA</a>'
    + '<a href="entry.html" class="nav-link">🎯 Entry</a>'
    + '<a href="scan.html" class="nav-link">Market Scan</a>'
    + '<a href="trend.html" class="nav-link">Trend Rider</a>'
    + '<a href="top100.html" class="nav-link">Top 100</a>'
    + '<a href="fav.html" class="nav-link">⭐ โปรด</a>'
    + '<a href="liqwatch.html" class="nav-link">Liquidation Radar</a>'
    + '<a href="radar.html" class="nav-link">Radar</a>'
    + '<a href="accum.html" class="nav-link">📊 Accum</a>'
    + '</div></nav>';

  // Highlight current page
  function highlight() {
    try {
      var page = (location.pathname.split('/').pop() || 'index.html');
      var links = document.querySelectorAll('.nav-link');
      links.forEach(function (a) {
        var h = a.getAttribute('href').split('/').pop();
        a.classList.toggle('active', h === page);
      });
    } catch (e) {}
  }

  // Try fetching navbar.html; fall back immediately
  fetch('./navbar.html', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.text() : Promise.reject(r); })
    .then(function (html) {
      placeholder.innerHTML = html;
      highlight();
    })
    .catch(function () {
      placeholder.innerHTML = fallback;
      highlight();
    });
})();
