document.addEventListener('DOMContentLoaded', function () {
  var btn = document.getElementById('copy-btn');
  var display = document.getElementById('code-display');
  if (!btn || !display) return;

  btn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    var code = (display.textContent || '').trim();
    if (!code || code === 'Loading…' || code === 'Code not ready yet') return;

    function done() {
      var old = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = old; }, 1500);
    }

    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = code;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); }
      catch (err) { btn.textContent = 'Select and copy'; }
      document.body.removeChild(ta);
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(code).then(done).catch(fallback);
    } else {
      fallback();
    }
  }, true);
});
