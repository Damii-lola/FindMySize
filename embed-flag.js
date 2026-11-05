/* Marks the page as the store popup before anything is painted, and applies the
   brand's design before the card is shown so the default look never flashes. */
if (new URLSearchParams(location.search).get('embed') === '1') {
  var root = document.documentElement;
  root.classList.add('embed');
  if (/[?&]g=/.test(location.search) && !/[?&]preview=/.test(location.search)) {
    root.classList.add('pu-pending');
    var code = new URLSearchParams(location.search).get('g');
    if (code) {
      fetch('https://findmysize.onrender.com/api/charts/code/' + encodeURIComponent(code))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (chart) {
          var popup = chart && chart.popup;
          if (popup && typeof popup === 'object') {
            var theme = popup.theme || {};
            var style = document.getElementById('fms-brand-look') || document.createElement('style');
            style.id = 'fms-brand-look';
            var bg = theme.background || '#221a15';
            var text = theme.text || '#f5e9d6';
            var accent = theme.accent || '#f0521f';
            var radius = theme.radius != null ? theme.radius : 28;
            style.textContent = ':root{--pu-bg:' + bg + ';--pu-text:' + text + ';--pu-accent:' + accent + ';--pu-radius:' + radius + 'px}'
              + 'html.embed body.app .stage{background:' + bg + ';color:' + text + ';border-radius:' + radius + 'px}';
            document.head.appendChild(style);
          }
          if (chart && chart.active === false) {
            root.classList.remove('pu-pending');
            document.addEventListener('DOMContentLoaded', function () {
              var stage = document.querySelector('.stage') || document.body;
              stage.innerHTML = '<p style="padding:24px;text-align:center;font-weight:650">This size finder is not active yet.</p>';
            });
            return;
          }
          root.classList.remove('pu-pending');
        })
        .catch(function () { root.classList.remove('pu-pending'); });
    } else {
      root.classList.remove('pu-pending');
    }
  }
}
