document.addEventListener('DOMContentLoaded', function () {
  var form = document.getElementById('chart-form');
  var nameInput = document.getElementById('chart-name');
  var brandInput = document.getElementById('chart-brand');
  var brandList = document.getElementById('brand-list');
  var list = document.getElementById('dash-list');
  var free = document.getElementById('free-tier');
  var search = document.getElementById('chart-search');
  var KEY = 'fms-brands';

  if (!document.getElementById('brand-style')) {
    var style = document.createElement('style');
    style.id = 'brand-style';
    style.textContent = [
      '.brand-group{margin:0 0 14px;border:1px solid rgba(34,26,21,.12);border-radius:18px;background:#fffaf3;overflow:hidden}',
      '.brand-group summary{list-style:none;cursor:pointer;padding:18px 22px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:22px;font-weight:700;letter-spacing:-.02em}',
      '.brand-group summary::-webkit-details-marker{display:none}',
      '.brand-group summary:before{content:"";width:10px;height:10px;border-right:2px solid #221a15;border-bottom:2px solid #221a15;transform:rotate(-45deg);margin-right:14px;transition:transform .2s}',
      '.brand-group[open] summary:before{transform:rotate(45deg)}',
      '.brand-count{font-size:13px;font-weight:650;color:#6b5b4e;background:#f5e9d6;border-radius:999px;padding:4px 10px}',
      '.brand-group .charts,.brand-group > :not(summary){padding:0 12px 12px}'
    ].join('');
    document.head.appendChild(style);
  }

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
    if (!list || list.dataset.grouping === '1') return;
    var cards = Array.from(list.querySelectorAll(':scope > :not(.brand-group)'));
    if (!cards.length) return;
    list.dataset.grouping = '1';
    var map = brands();
    var groups = {};
    cards.forEach(function (card) {
      var title = (card.querySelector('h3, .chart-name, strong') || {}).textContent || '';
      var brand = map[title.trim().toLowerCase()] || 'Ungrouped';
      (groups[brand] = groups[brand] || []).push(card);
    });
    var query = (search && search.value || '').trim().toLowerCase();
    var frag = document.createDocumentFragment();
    Object.keys(groups).sort().forEach(function (brand) {
      if (query && brand.toLowerCase().indexOf(query) === -1) return;
      var details = document.createElement('details');
      details.className = 'brand-group';
      var summary = document.createElement('summary');
      summary.innerHTML = '<span>' + brand + '</span><span class="brand-count">' + groups[brand].length + '</span>';
      details.appendChild(summary);
      groups[brand].forEach(function (card) { details.appendChild(card); });
      frag.appendChild(details);
    });
    list.innerHTML = '';
    list.appendChild(frag);
    list.dataset.grouping = '0';
  }

  if (list) new MutationObserver(function () {
    if (list.dataset.grouping === '1') return;
    if (list.querySelector(':scope > :not(.brand-group)')) group();
  }).observe(list, { childList: true });
  if (search) {
    search.placeholder = 'Search brands';
    search.addEventListener('input', group);
  }
  setTimeout(group, 600);
  setTimeout(group, 1500);
});
