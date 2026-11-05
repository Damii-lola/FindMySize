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
      '.brand-group{margin:0 0 16px;border:1px solid rgba(34,26,21,.1);border-radius:22px;background:#fff;box-shadow:0 10px 30px -22px rgba(34,26,21,.4);overflow:hidden}',
      '.brand-group summary{list-style:none;cursor:pointer;padding:0;display:block}',
      '.brand-group summary::-webkit-details-marker{display:none}',
      '.brand-row{display:flex;align-items:center;gap:16px;padding:20px 22px}',
      '.brand-mark{width:44px;height:44px;border-radius:14px;background:#221a15;color:#f5e9d6;display:grid;place-items:center;font-weight:700;font-size:16px;flex:none}',
      '.brand-copy{flex:1;min-width:0}',
      '.brand-kicker{margin:0 0 2px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#f0521f;font-weight:700}',
      '.brand-name{margin:0;font-size:26px;line-height:1.1;font-weight:650;letter-spacing:-.03em;color:#221a15}',
      '.brand-meta{margin:4px 0 0;font-size:13px;color:#6b5b4e}',
      '.brand-chev{width:28px;height:28px;border-radius:999px;border:1px solid rgba(34,26,21,.12);display:grid;place-items:center;flex:none;transition:transform .2s}',
      '.brand-chev:before{content:"";width:7px;height:7px;border-right:1.5px solid #221a15;border-bottom:1.5px solid #221a15;transform:rotate(45deg) translate(-1px,-1px)}',
      '.brand-group[open] .brand-chev{transform:rotate(180deg)}',
      '.brand-group > :not(summary){margin:0 14px 14px;border-radius:16px}','.brand-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:0 22px 16px}','.brand-actions input{padding:8px 12px;border-radius:999px;border:1px solid rgba(34,26,21,.16);font:inherit}','.brand-actions button{border-radius:999px;padding:8px 14px;font:inherit;font-weight:650;cursor:pointer}','.brand-on{background:#e7f6ee;color:#157347}','.brand-off{background:#fff4e8;color:#9a4d12}','.brand-primary{background:#f0521f;color:#fff;border:0}','.brand-ghost{background:#fff;border:1px solid rgba(34,26,21,.16)}','.brand-group [data-act="preview"]{display:none}'
    ].join('');
    document.head.appendChild(style);
  }

  if (localStorage.getItem('fms-admin') && free) free.hidden = true;

  function brands() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function activations() { try { return JSON.parse(localStorage.getItem('fms-brand-active') || '{}'); } catch (e) { return {}; } }
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
      var n = groups[brand].length;
      var active = activations()[brand.toLowerCase()];
      summary.innerHTML = '<div class="brand-row"><span class="brand-mark">' + brand.slice(0,1).toUpperCase() + '</span><div class="brand-copy"><p class="brand-kicker">Brand</p><p class="brand-name">' + brand + '</p><p class="brand-meta">' + n + (n === 1 ? ' garment' : ' garments') + '</p></div><span class="brand-status ' + (active ? 'brand-on' : 'brand-off') + '" data-status style="border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700;cursor:pointer">' + (active ? 'Activated' : 'Not activated') + '</span><span class="brand-chev"></span></div>';
      details.appendChild(summary);
      var actions = document.createElement('div');
      actions.className = 'brand-actions';
      actions.innerHTML = '<input placeholder="Activation code" data-code /><button type="button" class="brand-ghost" data-activate>' + (active ? 'Deactivate' : 'Activate') + '</button><button type="button" class="brand-primary" data-customise>Preview & Customise Popup</button>';
      details.appendChild(actions);
      actions.addEventListener('click', function (e) { e.stopPropagation(); });
      var customise = actions.querySelector('[data-customise]');
      customise.addEventListener('click', function () {
        var btn = details.querySelector('[data-act="preview"]');
        if (btn) btn.click();
      });
      var activate = actions.querySelector('[data-activate]');
      if (activate) activate.addEventListener('click', async function () {
        var code = (actions.querySelector('[data-code]').value || '').trim();
        if (code !== '15691569') { alert('Wrong code'); return; }
        activate.disabled = true;
        var on = !activations()[brand.toLowerCase()];
        try {
          var res = await fetch('https://findmysize.onrender.com/api/pay/brand-toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('fms-admin') || '') },
            body: JSON.stringify({ brand: brand, active: on, code: code }),
          });
          var data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Could not update');
          var map = activations();
          if (on) map[brand.toLowerCase()] = code;
          else delete map[brand.toLowerCase()];
          localStorage.setItem('fms-brand-active', JSON.stringify(map));
          group();
        } catch (err) { alert(err.message); activate.disabled = false; }
      });
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
