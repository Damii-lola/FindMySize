document.addEventListener('DOMContentLoaded', function () {
  var form = document.getElementById('chart-form');
  var nameInput = document.getElementById('chart-name');
  var list = document.getElementById('dash-list');
  if (!form || !nameInput) return;

  var brandField = document.createElement('label');
  brandField.innerHTML = 'Brand<input id="chart-brand" type="text" maxlength="60" placeholder="e.g. Zara" />';
  nameInput.parentNode.insertBefore(brandField, nameInput.parentNode);

  var BRANDS = 'fms-brands';
  function brands() { try { return JSON.parse(localStorage.getItem(BRANDS) || '{}'); } catch (e) { return {}; } }
  function saveBrands(map) { localStorage.setItem(BRANDS, JSON.stringify(map)); }

  var origFetch = window.fetch;
  window.fetch = function (url, opts) {
    opts = opts || {};
    var href = typeof url === 'string' ? url : (url && url.url) || '';
    if (href.indexOf('/api/charts') !== -1 && opts.method === 'POST' && opts.body) {
      try {
        var body = JSON.parse(opts.body);
        var brand = (document.getElementById('chart-brand').value || '').trim();
        if (brand) body.brand = brand;
        opts.body = JSON.stringify(body);
      } catch (e) {}
    }
    return origFetch.call(this, url, opts);
  };

  form.addEventListener('submit', function () {
    var brand = (document.getElementById('chart-brand').value || '').trim();
    var name = (nameInput.value || '').trim();
    if (brand && name) {
      var map = brands();
      map[name.toLowerCase()] = brand;
      saveBrands(map);
    }
  }, true);

  function group() {
    if (!list) return;
    var cards = Array.from(list.children).filter(function (el) { return !el.classList.contains('brand-group'); });
    if (!cards.length) return;
    var map = brands();
    var groups = {};
    cards.forEach(function (card) {
      var title = (card.querySelector('h3, .chart-name, strong') || {}).textContent || '';
      var brand = map[title.trim().toLowerCase()] || 'Ungrouped';
      (groups[brand] = groups[brand] || []).push(card);
    });
    if (Object.keys(groups).length === 1 && groups.Ungrouped) return;
    list.innerHTML = '';
    Object.keys(groups).sort().forEach(function (brand) {
      var details = document.createElement('details');
      details.className = 'brand-group';
      details.open = true;
      var summary = document.createElement('summary');
      summary.textContent = brand + ' (' + groups[brand].length + ')';
      details.appendChild(summary);
      groups[brand].forEach(function (card) { details.appendChild(card); });
      list.appendChild(details);
    });
  }

  if (list) new MutationObserver(group).observe(list, { childList: true });
  setTimeout(group, 800);
});
