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
  function designs() { try { return JSON.parse(localStorage.getItem('fms-brand-popup') || '{}'); } catch (e) { return {}; } }

  var sb = null;
  function supabase() {
    if (sb) return Promise.resolve(sb);
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
      s.onload = function () {
        fetch('https://findmysize.onrender.com/api/public-config').then(function (r) { return r.json(); }).then(function (cfg) {
          sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
          resolve(sb);
        });
      };
      document.head.appendChild(s);
    });
  }
  function saveBrandDesign(brand, popup, codes) {
    saveDesign(brand, popup);
    supabase().then(function (client) {
      codes.forEach(function (code) {
        client.from('size_charts').update({ popup: popup }).eq('code', code).then(function () {});
      });
    });
  }
  function saveDesign(brand, popup) {
    var map = designs();
    map[brand.toLowerCase()] = popup;
    localStorage.setItem('fms-brand-popup', JSON.stringify(map));
  }
  function saveBrands(map) { localStorage.setItem(KEY, JSON.stringify(map)); syncToServer(); }
  function known() {
    var set = {};
    Object.values(brands()).forEach(function (b) { if (b) set[b] = true; });
    return Object.keys(set).sort();
  }
  function fillList() {
    var box = document.getElementById('brand-suggest');
    if (!box) return;
    var q = (brandInput && brandInput.value || '').trim().toLowerCase();
    var items = known().filter(function (b) { return !q || b.toLowerCase().indexOf(q) !== -1; });
    box.innerHTML = '';
    if (!items.length) { box.hidden = true; return; }
    items.forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = b;
      btn.style.cssText = 'display:block;width:100%;text-align:left;padding:8px 12px;border:0;background:#fff;font:inherit;cursor:pointer';
      btn.addEventListener('mousedown', function (e) {
        e.preventDefault();
        brandInput.value = b;
        box.hidden = true;
      });
      box.appendChild(btn);
    });
    box.hidden = false;
  }
  if (brandInput && brandList) {
    var box = document.createElement('div');
    box.id = 'brand-suggest';
    box.hidden = true;
    box.style.cssText = 'position:absolute;z-index:20;background:#fff;border:1px solid rgba(34,26,21,.16);border-radius:12px;margin-top:4px;max-height:180px;overflow:auto;width:100%';
    brandInput.parentElement.style.position = 'relative';
    brandInput.parentElement.appendChild(box);
    brandInput.addEventListener('focus', fillList);
    brandInput.addEventListener('input', fillList);
    brandInput.addEventListener('blur', function () { setTimeout(function () { box.hidden = true; }, 150); });
  }

  var orig = window.fetch;
  window.fetch = function (url, opts) {
    opts = opts || {};
    var href = typeof url === 'string' ? url : (url && url.url) || '';
    var method = String(opts.method || 'GET').toUpperCase();
    if (href.indexOf('findmysize.onrender.com/api/') !== -1 || href.indexOf('/api/') === 0) {
      var token = localStorage.getItem('fms-admin');
      if (token) {
        opts.headers = Object.assign({}, opts.headers || {}, { Authorization: 'Bearer ' + token });
      }
    }
    if (href.indexOf('/api/charts') !== -1 && (method === 'POST' || method === 'PATCH') && opts.body) {
      try {
        var body = typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body;
        var brand = (brandInput && brandInput.value || '').trim();
        if (brand) {
          body.brand = brand;
          var existing = designs()[brand.toLowerCase()];
          if (existing && !body.popup) body.popup = existing;
        }
        opts.body = JSON.stringify(body);
        var designBrand = window.__fmsBrand || brand;
        if (designBrand && body.popup) {
          saveBrandDesign(designBrand, body.popup, (function () { return Array.from(document.querySelectorAll('.brand-group')).filter(function (g) { return ((g.querySelector('.brand-name') || {}).textContent || '') === designBrand; }).flatMap(function (g) { return Array.from(g.querySelectorAll('.chart-card')).map(function (c) { return c.dataset.code; }); }); })());
          var codes = Array.from(document.querySelectorAll('.brand-group')).filter(function (g) {
            return ((g.querySelector('.brand-name') || {}).textContent || '') === designBrand;
          }).flatMap(function (g) {
            return Array.from(g.querySelectorAll('.chart-card')).map(function (c) { return c.dataset.code; });
          }).filter(Boolean);
          orig.call(this, 'https://findmysize.onrender.com/api/charts/brand-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('fms-admin') || '') },
            body: JSON.stringify({ brand: designBrand, popup: body.popup, codes: codes }),
          }).then(function () {
            codes.forEach(function (code) {
              orig.call(this, 'https://findmysize.onrender.com/api/charts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('fms-admin') || '') },
                body: JSON.stringify({ code: code, popup: body.popup, brand: designBrand }),
              }).catch(function () {});
            }, this);
            document.querySelectorAll('.brand-group').forEach(function (g) {
              if (((g.querySelector('.brand-name') || {}).textContent || '') !== designBrand) return;
              g.querySelectorAll('.chart-card').forEach(function (card) {
                var box = card.querySelector('.chart-snippet-box');
                if (!box || !card.dataset.code) return;
                box.value = '<script src="https://damii-lola.github.io/FindMySize/embed.js" data-chart="' + card.dataset.code + '"><\/script>';
              });
            });
          }).catch(function () {});
        }
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
      var design = designs()[brand.toLowerCase()];
      var activated = activations()[brand.toLowerCase()];
      // Apply design more reliably: poll for the new card then push popup
      var tries = 0;
      var timer = setInterval(function () {
        tries += 1;
        var card = Array.from(document.querySelectorAll('.chart-card')).find(function (c) {
          return ((c.querySelector('h3, .chart-name, strong') || {}).textContent || '').trim().toLowerCase() === name.toLowerCase();
        });
        var code = card && card.dataset.code;
        if (code || tries > 8) {
          clearInterval(timer);
          if (code && design) {
            fetch('https://findmysize.onrender.com/api/charts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('fms-admin') || '') },
              body: JSON.stringify({ code: code, popup: design, brand: brand }),
            }).catch(function () {});
            // Also sync via brand-sync so all charts of the brand stay consistent
            fetch('https://findmysize.onrender.com/api/charts/brand-sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('fms-admin') || '') },
              body: JSON.stringify({ brand: brand, popup: design, codes: [code] }),
            }).catch(function () {});
          }
          if (code && activated) {
            fetch('https://findmysize.onrender.com/api/pay/brand-toggle', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('fms-admin') || '') },
              body: JSON.stringify({ brand: brand, active: true, code: '15691569', codes: [code] }),
            }).catch(function () {});
          }
        }
      }, 400);
      setTimeout(function () { if (brandInput) brandInput.value = ''; }, 300);
    }
  }, true);

  function group() {
    if (!list || list.dataset.grouping === '1') return;
    var cards = Array.from(list.querySelectorAll(':scope > :not(.brand-group)'));
    if (!cards.length) cards = Array.from(list.querySelectorAll('.brand-group > :not(summary):not(.brand-actions)'));
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
      summary.innerHTML = '<div class="brand-row"><span class="brand-mark">' + brand.slice(0,1).toUpperCase() + '</span><div class="brand-copy"><p class="brand-kicker">Brand</p><p class="brand-name">' + brand + '</p><p class="brand-meta">' + n + (n === 1 ? ' garment' : ' garments') + '</p></div><span class="brand-chev"></span></div>';
      details.appendChild(summary);
      var actions = document.createElement('div');
      actions.className = 'brand-actions';
      actions.innerHTML = '<button type="button" class="brand-primary" data-customise>Preview & Customise Popup</button><button type="button" class="brand-ghost" data-delete-brand>Delete brand</button>';
      details.appendChild(actions);
      actions.addEventListener('click', function (e) { e.stopPropagation(); });
      var customise = actions.querySelector('[data-customise]');
      customise.addEventListener('click', function () {
        window.__fmsBrand = brand;
        var btn = details.querySelector('[data-act="preview"]');
        if (btn) btn.click();
        setTimeout(function () {
          var title = document.querySelector('.pe-title');
          if (title) title.lastChild.textContent = brand;
        }, 200);
      });
      actions.querySelector('[data-delete-brand]').addEventListener('click', async function () {
        var n = groups[brand].length;
        if (!confirm('Delete ' + brand + ' and its ' + n + (n === 1 ? ' chart' : ' charts') + '? This cannot be undone.')) return;
        var codes = Array.from(details.querySelectorAll('.chart-card')).map(function (c) { return c.dataset.code; }).filter(Boolean);
        for (var i = 0; i < codes.length; i++) {
          await fetch('https://findmysize.onrender.com/api/charts/code/' + encodeURIComponent(codes[i]), {
            method: 'DELETE',
            headers: { Authorization: 'Bearer ' + (localStorage.getItem('fms-admin') || '') },
          }).catch(function () {});
        }
        var map = brands();
        Object.keys(map).forEach(function (name) { if (map[name] === brand) delete map[name]; });
        saveBrands(map);
        details.remove();
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
            body: JSON.stringify({
            brand: brand, active: on, code: code,
            codes: Array.from(details.querySelectorAll('.chart-card')).map(function (c) { return c.dataset.code; }).filter(Boolean),
          }),
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
    applyDesigns();
  }
  function applyDesigns() {
    var map = designs();
    document.querySelectorAll('.brand-group').forEach(function (g) {
      var brand = ((g.querySelector('.brand-name') || {}).textContent || '').toLowerCase();
      var popup = map[brand];
      if (!popup) return;
      g.querySelectorAll('.chart-card').forEach(function (card) {
        var box = card.querySelector('.chart-snippet-box');
        if (!box || !card.dataset.code) return;
        box.value = '<script src="https://damii-lola.github.io/FindMySize/embed.js" data-chart="' + card.dataset.code + '"><\/script>';
      });
    });
  }

  if (list) new MutationObserver(function () {
    if (list.dataset.grouping === '1') return;
    if (list.querySelector(':scope > :not(.brand-group)')) group();
  }).observe(list, { childList: true });
  if (search) {
    search.placeholder = 'Search brands';
    search.addEventListener('input', group);
  }
  function stamp() {
    var map = brands();
    var items = [];
    document.querySelectorAll('.chart-card').forEach(function (card) {
      var name = ((card.querySelector('h3, .chart-name, strong') || {}).textContent || '').trim().toLowerCase();
      var brand = map[name];
      if (brand && card.dataset.code) items.push({ brand: brand, code: card.dataset.code });
    });
    if (!items.length) return;
    fetch('https://findmysize.onrender.com/api/charts/brand-stamp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('fms-admin') || '') },
      body: JSON.stringify({ items: items }),
    }).catch(function () {});
  }
  function syncActive() {
    var on = activations();
    document.querySelectorAll('.brand-group').forEach(function (g) {
      var brand = (g.querySelector('.brand-name') || {}).textContent || '';
      if (!on[brand.toLowerCase()]) return;
      var codes = Array.from(g.querySelectorAll('.chart-card')).map(function (c) { return c.dataset.code; }).filter(Boolean);
      fetch('https://findmysize.onrender.com/api/pay/brand-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('fms-admin') || '') },
        body: JSON.stringify({ brand: brand, active: true, code: '15691569', codes: codes }),
      }).catch(function () {});
    });
  }

  function syncToServer() {
    var token = localStorage.getItem('fms-admin');
    if (!token) return;
    fetch('https://findmysize.onrender.com/api/pay/brands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ brands: brands(), activations: activations(), designs: designs() }),
    }).catch(function () {});
  }
  function loadAccount() {
    var token = localStorage.getItem('fms-admin');
    if (!token) return;
    fetch('https://findmysize.onrender.com/api/pay/brands', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return;
        if (data.brands && Object.keys(data.brands).length) localStorage.setItem(KEY, JSON.stringify(data.brands));
        if (data.activations && Object.keys(data.activations).length) localStorage.setItem('fms-brand-active', JSON.stringify(data.activations));
        if (data.designs && Object.keys(data.designs).length) localStorage.setItem('fms-brand-popup', JSON.stringify(data.designs));
        group();
      }).catch(function () {});
    fetch('https://findmysize.onrender.com/api/charts/all', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !Array.isArray(data.charts)) return;
        // stamp brands from server if needed
      }).catch(function () {});
  }
  loadAccount();
  setInterval(stamp, 30000);
  setInterval(syncActive, 30000);
  setInterval(syncToServer, 60000);
});