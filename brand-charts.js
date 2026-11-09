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
      /* ---- the brand groups ---- */
      '.brand-group{margin:0 0 14px;border:1px solid rgba(34,26,21,.1);border-radius:22px;background:var(--paper,#fff);box-shadow:0 10px 30px -22px rgba(34,26,21,.4);overflow:hidden;transition:border-color .2s,box-shadow .2s}',
      '.brand-group:hover{border-color:rgba(34,26,21,.2);box-shadow:0 16px 38px -22px rgba(34,26,21,.5)}',
      '.brand-group[open]{border-color:rgba(240,82,31,.35)}',
      '.brand-group summary{list-style:none;cursor:pointer;padding:0;display:block;border-radius:22px}',
      '.brand-group summary::-webkit-details-marker{display:none}',
      '.brand-group summary:focus-visible{outline:2px solid var(--orange,#f0521f);outline-offset:-3px}',
      '.brand-row{display:flex;align-items:center;gap:16px;padding:18px 20px;transition:background .15s}',
      '.brand-group summary:hover .brand-row{background:rgba(34,26,21,.025)}',
      '.brand-group[open] > summary .brand-row{border-bottom:1px solid rgba(34,26,21,.08)}',
      '.brand-mark{width:46px;height:46px;border-radius:15px;background:#221a15;color:#fff;display:grid;place-items:center;font-weight:700;font-size:18px;flex:none;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18),0 8px 16px -10px rgba(0,0,0,.5)}',
      '.brand-copy{flex:1;min-width:0}',
      '.brand-kicker{margin:0 0 2px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--orange,#f0521f);font-weight:700}',
      '.brand-name{margin:0;font-size:25px;line-height:1.1;font-weight:650;letter-spacing:-.03em;color:var(--ink-2,#221a15);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:color .15s}',
      '.brand-group summary:hover .brand-name{color:var(--orange-text,#a9330a)}',
      '.brand-meta{margin:5px 0 0;font-size:13px;color:var(--muted-strong,#6b5b4e);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.brand-tags{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 0}',
      '.brand-tags:empty{display:none}',
      '.brand-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;background:rgba(34,26,21,.06);color:var(--ink-soft,#3b3028);font-size:11px;font-weight:650;letter-spacing:.02em}',
      '.brand-chip:before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.55}',
      '.brand-chip--on{background:#e7f6ee;color:#157347}',
      '.brand-chev{width:32px;height:32px;border-radius:999px;border:1px solid rgba(34,26,21,.14);display:grid;place-items:center;flex:none;transition:transform .25s cubic-bezier(.22,1,.36,1),background .15s,border-color .15s}',
      '.brand-group summary:hover .brand-chev{background:#fff;border-color:rgba(34,26,21,.28)}',
      '.brand-chev:before{content:"";width:7px;height:7px;border-right:1.7px solid #221a15;border-bottom:1.7px solid #221a15;transform:rotate(45deg) translate(-1px,-1px)}',
      '.brand-group[open] .brand-chev{transform:rotate(180deg);background:var(--orange,#f0521f);border-color:var(--orange,#f0521f)}',
      '.brand-group[open] .brand-chev:before{border-color:#fff}',
      '.brand-group > :not(summary){margin:0 14px 14px;border-radius:16px}',
      '.brand-group[open] > :not(summary){animation:brand-in .26s cubic-bezier(.22,1,.36,1) both}',
      '.brand-group[open] > :nth-child(3){animation-delay:.04s}.brand-group[open] > :nth-child(4){animation-delay:.08s}.brand-group[open] > :nth-child(5){animation-delay:.12s}',
      '@keyframes brand-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}',
      '.brand-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:14px 20px 4px;margin:0!important}',
      '.brand-actions input{padding:8px 12px;border-radius:999px;border:1px solid rgba(34,26,21,.16);font:inherit}',
      '.brand-actions button{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:9px 16px;font:inherit;font-size:14px;font-weight:650;cursor:pointer;transition:transform .15s,background .15s,box-shadow .15s,color .15s,border-color .15s}',
      '.brand-actions button:hover{transform:translateY(-1px)}',
      '.brand-actions button:focus-visible{outline:2px solid var(--orange,#f0521f);outline-offset:2px}',
      '.brand-actions svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}',
      '.brand-on{background:#e7f6ee;color:#157347}',
      '.brand-off{background:#fff4e8;color:#9a4d12}',
      '.brand-primary{background:var(--orange,#f0521f);color:#fff;border:0;box-shadow:0 10px 20px -12px rgba(240,82,31,.9)}',
      '.brand-primary:hover{box-shadow:0 14px 24px -12px rgba(240,82,31,.95)}',
      '.brand-ghost{background:transparent;color:var(--ink-soft,#3b3028);border:1px solid rgba(34,26,21,.16)}',
      '.brand-ghost[data-delete-brand]:hover{background:#fdecec;color:#b42318;border-color:#f3b6b0}',
      '.brand-group [data-act="preview"]{display:none}',
      /* ---- the brand field and its menu ---- */
      '.brand-combo{position:relative;display:block}',
      '.brand-combo input{width:100%;box-sizing:border-box;padding-right:78px!important}',
      '.brand-combo[data-open="true"] input{border-color:var(--orange,#f0521f)!important;box-shadow:0 0 0 4px rgba(240,82,31,.14)!important}',
      '.brand-combo-btns{position:absolute;top:50%;right:8px;transform:translateY(-50%);display:flex;align-items:center;gap:2px}',
      '.brand-combo-btns button{width:28px;height:28px;border:0;border-radius:999px;background:transparent;color:var(--muted-strong,#6b5b4e);display:grid;place-items:center;cursor:pointer;padding:0;transition:background .12s,color .12s,transform .2s}',
      '.brand-combo-btns button:hover{background:rgba(34,26,21,.08);color:#221a15}',
      '.brand-combo-btns button:focus-visible{outline:2px solid var(--orange,#f0521f)}',
      '.brand-combo-btns svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
      '.brand-clear{display:none!important}',
      '.brand-combo[data-has="true"] .brand-clear{display:grid!important}',
      '.brand-combo[data-open="true"] .brand-toggle svg{transform:rotate(180deg)}',
      '.brand-toggle svg{transition:transform .2s}',
      '.brand-menu{position:absolute;left:0;right:0;top:calc(100% + 8px);z-index:60;background:var(--paper,#fff);border:1px solid rgba(34,26,21,.12);border-radius:18px;max-height:290px;overflow:auto;padding:6px;box-shadow:0 22px 50px -18px rgba(34,26,21,.45),0 2px 6px rgba(34,26,21,.06);animation:brand-pop .16s cubic-bezier(.22,1,.36,1);transform-origin:top center;overscroll-behavior:contain}',
      '@keyframes brand-pop{from{opacity:0;transform:translateY(-6px) scale(.985)}to{opacity:1;transform:none}}',
      '.brand-menu[hidden]{display:none}',
      '.brand-menu-head{margin:4px 10px 6px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted-strong,#6b5b4e)}',
      '.brand-opt{display:flex;align-items:center;gap:12px;padding:9px 10px;border-radius:12px;cursor:pointer;color:var(--ink-2,#221a15);font-weight:550;transition:background .1s}',
      '.brand-opt[aria-selected="true"]{background:#f5efe6}',
      '.brand-opt-mark{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;color:#fff;font-size:13px;font-weight:700;flex:none}',
      '.brand-opt-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.brand-opt-name mark{background:rgba(240,82,31,.18);color:inherit;border-radius:4px;padding:0 1px}',
      '.brand-opt-count{font-size:12px;font-weight:600;color:var(--muted-strong,#6b5b4e);flex:none}',
      '.brand-opt--new{border:1px dashed rgba(240,82,31,.45);margin-bottom:4px;background:rgba(240,82,31,.05)}',
      '.brand-opt--new[aria-selected="true"]{background:rgba(240,82,31,.12)}',
      '.brand-opt--new .brand-opt-mark{background:var(--orange,#f0521f)!important}',
      '.brand-opt-hint{font-size:11px;font-weight:700;color:var(--orange-text,#a9330a);letter-spacing:.06em;text-transform:uppercase;flex:none}',
      '.brand-empty{padding:18px 14px;text-align:center;font-size:13.5px;line-height:1.5;color:var(--muted-strong,#6b5b4e)}',
      '.fms-notice{position:relative;margin:0 0 18px;padding:16px 46px 16px 18px;border:1px solid rgba(180,35,24,.3);border-radius:16px;background:#fdecec;color:#7a1d14;font-size:14px;line-height:1.5}',
      '.fms-notice p{margin:0}',
      '.fms-notice code{display:block;margin:10px 0 0;padding:10px 12px;border-radius:10px;background:rgba(34,26,21,.9);color:#f5e9d6;font:12.5px/1.5 ui-monospace,Menlo,Consolas,monospace;overflow-x:auto;white-space:pre}',
      '.fms-notice-close{position:absolute;top:10px;right:10px;width:28px;height:28px;border:0;border-radius:999px;background:transparent;color:inherit;font-size:20px;line-height:1;cursor:pointer}',
      '.fms-notice-close:hover{background:rgba(0,0,0,.08)}',
      '@media (max-width:520px){.brand-row{padding:15px 14px;gap:12px}.brand-name{font-size:21px}.brand-mark{width:40px;height:40px;border-radius:13px}.brand-actions{padding:12px 14px 2px}.brand-actions button{flex:1 1 auto;justify-content:center}}',
      '@media (prefers-reduced-motion:reduce){.brand-menu,.brand-group[open] > :not(summary){animation:none}.brand-chev,.brand-actions button{transition:none}}'
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
  /* A colour for a brand, the same every time it is seen: the menu and the group header agree. */
  function brandColour(name) {
    var h = 0;
    for (var i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) % 360;
    return 'hsl(' + h + ' 42% 36%)';
  }
  /* What the server last returned for the library (null until it has). The device's own record of
     brands ("fms-brands") only fills in garments the server has no brand for; it is never the count. */
  var live = null;
  function brandOf(chart) {
    return String((chart && chart.brand) || '').trim() || brands()[String((chart && chart.name) || '').toLowerCase()] || '';
  }
  function counts() {
    var c = {};
    if (live) {
      live.forEach(function (chart) { var b = brandOf(chart); if (b) c[b] = (c[b] || 0) + 1; });
    } else {
      Object.values(brands()).forEach(function (b) { if (b) c[b] = (c[b] || 0) + 1; });
    }
    return c;
  }
  /* The server is the source of truth: a brand it stored for a garment replaces what this device remembered. */
  function adopt(charts) {
    live = charts;
    var map = brands();
    var changed = false;
    charts.forEach(function (chart) {
      var b = String((chart && chart.brand) || '').trim();
      var k = String((chart && chart.name) || '').toLowerCase();
      if (b && k && map[k] !== b) { map[k] = b; changed = true; }
    });
    if (changed) localStorage.setItem(KEY, JSON.stringify(map));
    fillList();
    showBrandCount();
  }
  /* The "Brands" tile counts the brands of the garments actually in the library (a brand kept only in the
     account's record, with the column missing, would otherwise read 0 next to a visible brand group). */
  function showBrandCount() {
    var tile = document.getElementById('stat-brands');
    if (tile && live && live.length) tile.textContent = String(Object.keys(counts()).length);
  }
  function svgIcon(paths, extra) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    paths.forEach(function (d) {
      var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      s.appendChild(p);
    });
    if (extra) s.setAttribute('class', extra);
    return s;
  }

  var menuApi = { refresh: function () {} };
  function fillList() { menuApi.refresh(); }

  if (brandInput) {
    var combo = document.createElement('div');
    combo.className = 'brand-combo';
    brandInput.parentNode.insertBefore(combo, brandInput);
    combo.appendChild(brandInput);

    var buttons = document.createElement('div');
    buttons.className = 'brand-combo-btns';
    var clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'brand-clear';
    clearBtn.setAttribute('aria-label', 'Clear brand');
    clearBtn.appendChild(svgIcon(['M6 6l12 12', 'M18 6 6 18']));
    var toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'brand-toggle';
    toggleBtn.setAttribute('aria-label', 'Show all brands');
    toggleBtn.tabIndex = -1;
    toggleBtn.appendChild(svgIcon(['M6 9l6 6 6-6']));
    buttons.appendChild(clearBtn);
    buttons.appendChild(toggleBtn);
    combo.appendChild(buttons);

    var box = document.createElement('div');
    box.id = 'brand-suggest';
    box.className = 'brand-menu';
    box.setAttribute('role', 'listbox');
    box.setAttribute('aria-label', 'Brands');
    box.hidden = true;
    combo.appendChild(box);

    brandInput.setAttribute('role', 'combobox');
    brandInput.setAttribute('aria-autocomplete', 'list');
    brandInput.setAttribute('aria-haspopup', 'listbox');
    brandInput.setAttribute('aria-controls', 'brand-suggest');
    brandInput.setAttribute('aria-expanded', 'false');

    var rows = [];     // [{ name, isNew }]
    var current = -1;
    var showAll = false;

    function isOpen() { return !box.hidden; }
    function syncState() {
      combo.dataset.open = String(isOpen());
      combo.dataset.has = String(!!brandInput.value);
      brandInput.setAttribute('aria-expanded', String(isOpen()));
    }
    function close() {
      box.hidden = true;
      current = -1;
      showAll = false;
      brandInput.removeAttribute('aria-activedescendant');
      syncState();
    }
    function highlight(node, text, q) {
      var at = q ? text.toLowerCase().indexOf(q) : -1;
      if (at < 0) { node.textContent = text; return; }
      node.appendChild(document.createTextNode(text.slice(0, at)));
      var mark = document.createElement('mark');
      mark.textContent = text.slice(at, at + q.length);
      node.appendChild(mark);
      node.appendChild(document.createTextNode(text.slice(at + q.length)));
    }
    function choose(name) {
      brandInput.value = name;
      close();
      brandInput.focus();
    }
    function setCurrent(index, scroll) {
      var opts = box.querySelectorAll('.brand-opt');
      if (!opts.length) { current = -1; return; }
      current = (index + opts.length) % opts.length;
      opts.forEach(function (o, i) { o.setAttribute('aria-selected', String(i === current)); });
      brandInput.setAttribute('aria-activedescendant', opts[current].id);
      if (scroll) opts[current].scrollIntoView({ block: 'nearest' });
    }
    function render() {
      var typed = (brandInput.value || '').trim();
      var q = typed.toLowerCase();
      var all = known();
      var items = all.filter(function (b) { return showAll || !q || b.toLowerCase().indexOf(q) !== -1; });
      var exact = all.some(function (b) { return b.toLowerCase() === q; });
      var n = counts();
      rows = [];
      box.textContent = '';
      if (typed && !exact) rows.push({ name: typed, isNew: true });
      items.forEach(function (b) { rows.push({ name: b, isNew: false }); });

      if (items.length) {
        var head = document.createElement('div');
        head.className = 'brand-menu-head';
        head.textContent = q && !showAll ? 'Matching brands' : 'Your brands';
        if (typed && !exact) box.appendChild(optNode(0));
        box.appendChild(head);
      } else if (typed && !exact) {
        box.appendChild(optNode(0));
      }
      var start = typed && !exact ? 1 : 0;
      items.forEach(function (b, i) { box.appendChild(optNode(start + i)); });
      if (!rows.length) {
        var empty = document.createElement('div');
        empty.className = 'brand-empty';
        empty.textContent = 'No brands yet. Type a name above to create your first one.';
        box.appendChild(empty);
      }

      function optNode(index) {
        var row = rows[index];
        var opt = document.createElement('div');
        opt.className = 'brand-opt' + (row.isNew ? ' brand-opt--new' : '');
        opt.id = 'brand-opt-' + index;
        opt.setAttribute('role', 'option');
        opt.setAttribute('aria-selected', 'false');
        var mark = document.createElement('span');
        mark.className = 'brand-opt-mark';
        mark.setAttribute('aria-hidden', 'true');
        mark.style.background = brandColour(row.name);
        mark.textContent = row.isNew ? '+' : row.name.slice(0, 1).toUpperCase();
        var label = document.createElement('span');
        label.className = 'brand-opt-name';
        if (row.isNew) label.textContent = 'Create \u201c' + row.name + '\u201d';
        else highlight(label, row.name, showAll ? '' : q);
        opt.appendChild(mark);
        opt.appendChild(label);
        var side = document.createElement('span');
        side.className = row.isNew ? 'brand-opt-hint' : 'brand-opt-count';
        side.textContent = row.isNew ? 'New brand' : (n[row.name] || 0) + ((n[row.name] || 0) === 1 ? ' garment' : ' garments');
        opt.appendChild(side);
        // mousedown, not click: the field must keep its focus while a choice is made
        opt.addEventListener('mousedown', function (e) { e.preventDefault(); choose(row.name); });
        opt.addEventListener('mousemove', function () { if (current !== index) setCurrent(index, false); });
        return opt;
      }
      box.hidden = false;
      // nothing is chosen until the person moves: Enter then submits the form as usual
      current = -1;
      syncState();
    }
    menuApi.refresh = function () { if (isOpen()) render(); else syncState(); };

    brandInput.addEventListener('focus', function () { render(); });
    brandInput.addEventListener('click', function () { if (!isOpen()) render(); });
    brandInput.addEventListener('input', function () { showAll = false; render(); });
    brandInput.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!isOpen()) render();
        setCurrent(current < 0 ? (e.key === 'ArrowDown' ? 0 : -1) : current + (e.key === 'ArrowDown' ? 1 : -1), true);
      } else if (e.key === 'Enter' && isOpen() && current >= 0 && rows[current]) {
        e.preventDefault();
        choose(rows[current].name);
      } else if (e.key === 'Escape' && isOpen()) {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === 'Tab') {
        close();
      }
    });
    combo.addEventListener('focusout', function (e) {
      if (!combo.contains(e.relatedTarget)) setTimeout(function () { if (!combo.contains(document.activeElement)) close(); }, 0);
    });
    [clearBtn, toggleBtn].forEach(function (b) { b.addEventListener('mousedown', function (e) { e.preventDefault(); }); });
    clearBtn.addEventListener('click', function () { brandInput.value = ''; brandInput.focus(); render(); });
    toggleBtn.addEventListener('click', function () {
      if (isOpen()) { close(); return; }
      showAll = true;
      brandInput.focus();
      render();
    });
    syncState();
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
    var sent = orig.call(this, url, opts);
    if (/\/api\/charts\/?$/.test(href.split('?')[0]) && method === 'POST') {
      sent.then(function (r) {
        r.clone().json().then(function (json) {
          heed(json);
          if (r.ok) syncToServer();   // the brand reaches the server with the garment, not a minute later
        }).catch(function () {});
      }, function () {});
    }
    return sent;
  };

  if (form) form.addEventListener('submit', function () {
    var brand = (brandInput && brandInput.value || '').trim();
    var name = (nameInput && nameInput.value || '').trim();
    if (brand && name) {
      var map = brands();
      map[name.toLowerCase()] = brand;
      saveBrands(map);
      fillList();
      setTimeout(syncToServer, 500);
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
      setTimeout(function () { if (brandInput) brandInput.value = ''; fillList(); }, 300);
    }
  }, true);

  function group() {
    if (!list || list.dataset.grouping === '1') return;
    var cards = Array.from(list.querySelectorAll(':scope > :not(.brand-group):not(.list-empty)'));   // the empty-state message is not a garment
    if (!cards.length) cards = Array.from(list.querySelectorAll('.brand-group > :not(summary):not(.brand-actions):not(.list-empty)'));
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
      var hasDesign = !!designs()[brand.toLowerCase()];
      var titles = groups[brand].map(function (c) { return ((c.querySelector('h3, .chart-name, strong') || {}).textContent || '').trim(); }).filter(Boolean);
      var row = document.createElement('div');
      row.className = 'brand-row';
      var mark = document.createElement('span');
      mark.className = 'brand-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.style.background = brandColour(brand);
      mark.textContent = brand.slice(0, 1).toUpperCase();
      var copy = document.createElement('div');
      copy.className = 'brand-copy';
      var kicker = document.createElement('p');
      kicker.className = 'brand-kicker';
      kicker.textContent = 'Brand';
      var nameEl = document.createElement('p');
      nameEl.className = 'brand-name';
      nameEl.textContent = brand;
      nameEl.title = brand;
      var meta = document.createElement('p');
      meta.className = 'brand-meta';
      meta.textContent = n + (n === 1 ? ' garment' : ' garments') + (titles.length ? ' \u00b7 ' + titles.slice(0, 3).join(', ') + (titles.length > 3 ? ' +' + (titles.length - 3) + ' more' : '') : '');
      var tags = document.createElement('div');
      tags.className = 'brand-tags';
      if (hasDesign) { var t1 = document.createElement('span'); t1.className = 'brand-chip'; t1.textContent = 'Custom popup'; tags.appendChild(t1); }
      if (active) { var t2 = document.createElement('span'); t2.className = 'brand-chip brand-chip--on'; t2.textContent = 'Active'; tags.appendChild(t2); }
      copy.appendChild(kicker); copy.appendChild(nameEl); copy.appendChild(meta); copy.appendChild(tags);
      var chev = document.createElement('span');
      chev.className = 'brand-chev';
      chev.setAttribute('aria-hidden', 'true');
      row.appendChild(mark); row.appendChild(copy); row.appendChild(chev);
      summary.appendChild(row);
      details.appendChild(summary);
      var actions = document.createElement('div');
      actions.className = 'brand-actions';
      var customiseBtn = document.createElement('button');
      customiseBtn.type = 'button';
      customiseBtn.className = 'brand-primary';
      customiseBtn.setAttribute('data-customise', '');
      customiseBtn.appendChild(svgIcon(['M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.5-1.9-.3-1 .3-2.1 1.4-2.1H17a4 4 0 0 0 4-4c0-5-4-10-9-10z', 'M7.5 11.5h.01', 'M10 7.5h.01', 'M14.5 7.5h.01']));
      customiseBtn.appendChild(document.createTextNode('Preview & Customise Popup'));
      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'brand-ghost';
      deleteBtn.setAttribute('data-delete-brand', '');
      deleteBtn.appendChild(svgIcon(['M4 7h16', 'M9 7V4.5h6V7', 'M6.5 7l.8 12.5h9.4L17.5 7', 'M10 11v5', 'M14 11v5']));
      deleteBtn.appendChild(document.createTextNode('Delete brand'));
      actions.appendChild(customiseBtn);
      actions.appendChild(deleteBtn);
      details.appendChild(actions);
      actions.addEventListener('click', function (e) { e.stopPropagation(); });
      var customise = actions.querySelector('[data-customise]');
      customise.addEventListener('click', function () {
        window.__fmsBrand = brand;
        var btn = details.querySelector('[data-act="preview"]');
        if (btn) btn.click();
        setTimeout(function () {
          var title = document.querySelector('.pe-title');
          if (title && title.lastChild) title.lastChild.textContent = brand;
        }, 200);
      });
      actions.querySelector('[data-delete-brand]').addEventListener('click', async function () {
        var n = groups[brand].length;
        if (!confirm('Delete ' + brand + ' and its ' + n + (n === 1 ? ' chart' : ' charts') + '? This cannot be undone.')) return;
        var codes = Array.from(details.querySelectorAll('.chart-card')).map(function (c) { return c.dataset.code; }).filter(Boolean);
        // Delete every chart on the server
        for (var i = 0; i < codes.length; i++) {
          await fetch('https://findmysize.onrender.com/api/charts/code/' + encodeURIComponent(codes[i]), {
            method: 'DELETE',
            headers: { Authorization: 'Bearer ' + (localStorage.getItem('fms-admin') || '') },
          }).catch(function () {});
        }
        // Charts are server-backed; do not persist device-local chart copies.
        try { localStorage.removeItem('fms_charts_local'); } catch (e) {}
        var map = brands();
        Object.keys(map).forEach(function (name) { if (map[name] === brand) delete map[name]; });
        saveBrands(map);
        details.remove();
        // Force a clean reload of the list so nothing leftover shows as Ungrouped
        setTimeout(function () { location.reload(); }, 400);
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

  // Listen for a signal from the Vite dashboard bundle instead of a MutationObserver
  // (the observer caused a race: it fired mid-render and wiped cards before they finished).
  window.addEventListener('fms:list-rendered', function (e) {
    var detail = e && e.detail;
    if (detail && Array.isArray(detail.charts)) adopt(detail.charts);
    if (!list || list.dataset.grouping === '1') return;
    if (list.querySelector(':scope > :not(.brand-group):not(.list-empty)')) group();
  });
  // If the dashboard drew the list before this script started, it left the charts for us.
  if (Array.isArray(window.__fmsCharts)) adopt(window.__fmsCharts);
  if (list && list.querySelector(':scope > :not(.brand-group):not(.list-empty)')) group();
  if (search) {
    search.placeholder = 'Search brands';
    search.addEventListener('input', group);
  }
  /* Whoever is signed in: the admin login, else the account's own session (kept by the sign-in library under
     an sb-...-auth-token key), else the older dev token. Brands used to need the admin login, so for an
     ordinary account they could only ever live in this browser. */
  function authToken() {
    var admin = localStorage.getItem('fms-admin');
    if (admin) return admin;
    try {
      for (var i = 0; i < localStorage.length; i += 1) {
        var key = localStorage.key(i);
        if (/^sb-.*-auth-token$/.test(key)) {
          var session = JSON.parse(localStorage.getItem(key) || 'null');
          if (session && session.access_token) return session.access_token;
        }
      }
    } catch (e) { /* unreadable: fall through */ }
    return localStorage.getItem('fms_token') || '';
  }

  var API = 'https://findmysize.onrender.com';
  var told = {};
  var NOTICES = {
    memory: { text: 'The server is not connected to Supabase, so garments are only held in its memory and will be lost when it restarts. On Render, check SUPABASE_URL and SUPABASE_SECRET_KEY.' },
    'no-brand-column': {
      text: 'Your database has no brand column on size_charts, so a garment\u2019s brand cannot be stored with it. Run this once in Supabase \u2192 SQL editor:',
      sql: "alter table public.size_charts add column if not exists brand text not null default '';",
    },
    'no-brand-meta-table': { text: 'Your database is missing the brand_meta table, so your brand settings cannot be saved to your account. In Supabase \u2192 SQL editor, run the \u201cBrands\u201d section at the end of supabase.sql in your repository.' },
    'no-popup-column': { text: 'Your database has no popup column on size_charts, so popup designs cannot be saved with garments. Run the popup lines in supabase.sql (Supabase \u2192 SQL editor).' },
  };
  /* Say what is wrong, once, above the library, in words the owner can act on. */
  function notice(kind, detail) {
    if (told[kind] || !list || !list.parentNode) return;
    told[kind] = true;
    var info = NOTICES[kind] || { text: 'Your brands could not be saved to the server' + (detail ? ' (' + detail + ')' : '') + '. They are kept on this device for now.' };
    var box = document.createElement('div');
    box.className = 'fms-notice';
    box.setAttribute('role', 'alert');
    var text = document.createElement('p');
    text.textContent = info.text;
    box.appendChild(text);
    if (info.sql) {
      var code = document.createElement('code');
      code.textContent = info.sql;
      box.appendChild(code);
    }
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'fms-notice-close';
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '\u00d7';
    close.addEventListener('click', function () { box.remove(); });
    box.appendChild(close);
    list.parentNode.insertBefore(box, list);
  }
  /* What the server says about a request: anything in `warnings` is shown. */
  function heed(json) {
    if (json && Array.isArray(json.warnings)) json.warnings.forEach(function (w) { notice(w); });
    return json;
  }
  /* A call to the server as whoever is signed in. Resolves to the reply, or null (after saying why). */
  function api(path, options) {
    var token = authToken();
    if (!token) return Promise.resolve(null);
    var opts = Object.assign({}, options || {});
    opts.headers = Object.assign({ Authorization: 'Bearer ' + token }, opts.headers || {});
    return orig.call(window, API + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (json) {
        if (!r.ok) { notice('sync-failed', (json && json.error) || 'HTTP ' + r.status); return null; }
        return heed(json);
      });
    }, function () { notice('sync-failed', 'the server could not be reached'); return null; });
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
    api('/api/charts/brand-stamp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: items }) });
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
    return api('/api/pay/brands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brands: brands(), activations: activations(), designs: designs() }),
    });
  }
  function loadAccount() {
    return api('/api/pay/brands').then(function (data) {
      if (!data) return;
      var local = brands();
      var server = data.brands || {};
      // The server's record wins where the two disagree; what only this device knows is kept...
      localStorage.setItem(KEY, JSON.stringify(Object.assign({}, local, server)));
      if (data.activations && Object.keys(data.activations).length) localStorage.setItem('fms-brand-active', JSON.stringify(data.activations));
      if (data.designs && Object.keys(data.designs).length) localStorage.setItem('fms-brand-popup', JSON.stringify(data.designs));
      group();
      fillList();
      showBrandCount();
      // ...and sent up now, so it is on the server (and on every other device) rather than only here.
      if (Object.keys(local).some(function (k) { return server[k] !== local[k]; })) syncToServer();
    });
  }
  loadAccount();
  setInterval(stamp, 30000);
  setInterval(syncActive, 30000);
  setInterval(syncToServer, 60000);
});