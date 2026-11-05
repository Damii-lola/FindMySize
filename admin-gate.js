(function () {
  var KEY = 'fms-admin';
  function token() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }

  // Attach the admin token to API calls so chart writes are allowed.
  var orig = window.fetch;
  window.fetch = function (url, opts) {
    opts = opts || {};
    var href = typeof url === 'string' ? url : (url && url.url) || '';
    if (href.indexOf('findmysize.onrender.com') !== -1 && token()) {
      var headers = new Headers(opts.headers || {});
      if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token());
      opts.headers = headers;
    }
    return orig.call(this, url, opts);
  };

  function loggedIn() { return Boolean(token()); }

  function paintNav() {
    var settings = document.getElementById('nav-account-settings');
    var login = document.getElementById('nav-account-in');
    var out = document.getElementById('nav-account-out');
    var name = document.getElementById('nav-account-name');
    var note = document.getElementById('nav-account-note');
    if (settings) settings.hidden = true;
    if (login) {
      login.textContent = 'Log in';
      login.href = '/FindMySize/auth/';
      login.hidden = loggedIn();
    }
    if (out) {
      out.hidden = !loggedIn();
      out.textContent = 'Log out';
      out.onclick = function () {
        clear();
        location.href = '/FindMySize/auth/';
      };
    }
    if (loggedIn()) {
      if (name) name.textContent = 'Account';
      if (note) note.textContent = 'Signed in';
    }
  }

  function gate() {
    var embed = new URLSearchParams(location.search).get('embed') === '1';
    var path = location.pathname;
    var needsLogin = !embed && (path === '/FindMySize/' || path === '/FindMySize/index.html' || /\/dashboard\/?$/.test(path) || /\/settings\/?$/.test(path));
    if (/\/settings\/?$/.test(path)) {
      location.replace('/FindMySize/dashboard/');
      return;
    }
    if (needsLogin && !loggedIn()) {
      location.replace('/FindMySize/auth/');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { paintNav(); gate(); });
  } else {
    paintNav();
    gate();
  }
  // Nav script may paint after us; paint again shortly.
  setTimeout(paintNav, 400);
  setTimeout(paintNav, 1200);
  // Guest scan/chart prompts are gone.
  var free = document.getElementById('free-scans');
  if (free) {
    var card = free.closest('section') || free.closest('div');
    if (card) card.hidden = true;
  }
})();
