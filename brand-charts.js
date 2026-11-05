document.addEventListener('DOMContentLoaded', function () {
  var form = document.getElementById('chart-form');
  var nameInput = document.getElementById('chart-name');
  var brandInput = document.getElementById('chart-brand');
  var brandList = document.getElementById('brand-list');
  var list = document.getElementById('dash-list');
  var free = document.getElementById('free-tier');
  var KEY = 'fms-brands';

  if (localStorage.getItem('fms-admin') && free) free.hidden = true;

  function brands() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function saveBrands(map) { localStorage.setItem(KEY, JSON.stringify(map)); }
  function known() {
    var set = {};
    Object.values(brands()).forEach(function (b) { if (b) set[b] = true; });
    return Object.keys(set).sort();
  }
  function fillList() {
    if (!brandList) return;
    brandList.innerHTML = '';
    known().forEach(function (b) {
      var opt = document.createElement('option');
      opt.value = b;
      brandList.appendChild(opt);
    });
  }
  fillList();

  var orig = window.fetch;
  window.fetch = function (url, opts) {
    opts = opts || {};
    var href = typeof url === 'string' ? url : (url && url.url) || '';
    if (href.indexOf('/api/charts') !== -1 && String(opts.method || '').toUpperCase() === 'POST' && opts.body) {
      try {
        var body = JSON.parse(opts.body);
        var brand = (brandInput && brandInput.value || '').trim();
        if (brand) body.brand = brand;
        opts.body = JSON.stringify(body);
      } catch (e) {}
    }
    return orig.call(this, url, opts);
  };

  if (form) form.addEventListener('submit', function () {
    var brand = (brandInput && brandInput.value || '').trim();
    var name = (nameInput && nameInput.value || '').trim();
    if (brand && name) {
      var map = brands();
      map[name.toLowerCase()] = brand;
      saveBrands(map);
      fillList();
    }
  }, true);

  function group() {
    if (!list) return;
    var cards = Array.from(list.querySelectorAll(':scope > :not(.brand-group)'));
    if (!cards.length) return;
    var map = brands();
    var groups = {};
    cards.forEach(function (card) {
      var title = (card.querySelector('h3, .chart-name, strong') || {}).textContent || '';
      var brand = map[title.trim().toLowerCase()] || 'Ungrouped';
      (groups[brand] = groups[brand] || []).push(card);
    });
    if (Object.keys(groups).length === 1 && groups.Ungrouped && !known().length) return;
    var frag = document.createDocumentFragment();
    Object.keys(groups).sort().forEach(function (brand) {
      var details = document.createElement('details');
      details.className = 'brand-group';
      details.open = true;
      var summary = document.createElement('summary');
      summary.textContent = brand + ' · ' + groups[brand].length;
      details.appendChild(summary);
      groups[brand].forEach(function (card) { details.appendChild(card); });
      frag.appendChild(details);
    });
    list.innerHTML = '';
    list.appendChild(frag);
  }
  if (list) new MutationObserver(function () { group(); }).observe(list, { childList: true });
  setTimeout(group, 600);
  setTimeout(group, 1500);
});
