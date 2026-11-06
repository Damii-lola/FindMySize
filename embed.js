/**
 * 3dGarments — the size finder a store drops onto its own product page.
 *
 * Usage:
 *   <script src="https://damii-lola.github.io/FindMySize/embed.js"
 *           data-chart="a1b2c3d4e5f6" data-label="Find my size"></script>
 *
 * Or with your own button:
 *   <button onclick="ThreeDG.open({ code: 'a1b2c3d4e5f6', name: 'Oxford Shirt' })">
 *     Find my size
 *   </button>
 *
 * data-chart  the code from the dashboard. Required. `data-code` works too.
 * data-label  the button text. Default "Find my size".
 * data-name   the garment's name, for the button's title. Optional.
 * data-base   the site root, if this script is served from somewhere else.
 *             Example: data-base="https://findmysize.onrender.com/"
 * data-float  "1" pins the button to the bottom-right corner instead of
 *             placing it in the page where the tag is.
 */
(function () {
  'use strict';

  var script = document.currentScript || document.querySelector('script[src*="embed.js"]');

  function siteRoot() {
    try { return new URL('./', script.src).href; } catch (e) { return '/'; }
  }
  function siteOrigin() {
    try { return new URL('./', script.src).origin; } catch (e) { return location.origin; }
  }

  function shadowFor(color) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color).trim());
    if (!m) return 'rgba(0,0,0,.25)';
    var hex = m[1];
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var r = parseInt(hex.slice(0, 2), 16);
    var g = parseInt(hex.slice(2, 4), 16);
    var b = parseInt(hex.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',.28)';
  }

  var STYLE_ID = 'threeDG-embed-style';
  var CSS = [
    '.threeDG-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(6,7,10,.74);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:threeDG-fade .2s ease-out}',
    '.threeDG-panel{position:relative;width:min(27.5rem,100%);height:min(48rem,94vh);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.14);border-radius:var(--threeDG-panel-radius,1.75rem);background:var(--threeDG-panel-bg,#221a15);box-shadow:0 2.5rem 6rem rgba(0,0,0,.65);animation:threeDG-rise .3s cubic-bezier(.22,1,.36,1)}',
    '.threeDG-panel:focus{outline:none}',
    '.threeDG-frame{flex:1;min-height:0;width:100%;display:block;border:0;background:var(--threeDG-panel-bg,#221a15)}',
    '.threeDG-close{position:absolute;top:.55rem;right:.55rem;z-index:2;width:2.15rem;height:2.15rem;display:flex;align-items:center;justify-content:center;padding:0;border:1px solid rgba(255,255,255,.16);border-radius:.7rem;background:rgba(12,13,17,.86);color:#eef0f4;font:400 1.2rem/1 system-ui,sans-serif;cursor:pointer}',
    '.threeDG-close:hover{background:rgba(255,255,255,.14);color:#fff}',
    '.threeDG-button{display:inline-flex;align-items:center;gap:.5rem;padding:.72rem 1.1rem;border:0;border-radius:var(--threeDG-radius,.8rem);background:var(--threeDG-accent,linear-gradient(180deg,#ff6a4a,#f04a29));color:var(--threeDG-text,#fff);font:650 .95rem/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:-.01em;cursor:pointer;box-shadow:0 .5rem 1.4rem var(--threeDG-shadow,rgba(240,74,41,.28))}',
    '.threeDG-button:hover{filter:brightness(1.06)}',
    '.threeDG-button svg{width:1.05rem;height:1.05rem;flex:0 0 auto}',
    '@keyframes threeDG-fade{from{opacity:0}to{opacity:1}}',
    '@keyframes threeDG-rise{from{opacity:0;transform:translateY(.8rem) scale(.985)}to{opacity:1;transform:none}}',
    '@media (max-width:520px){.threeDG-overlay{padding:.6rem}.threeDG-panel{width:100%;height:92%;border-radius:1.25rem}}',
    '@media (prefers-reduced-motion:reduce){.threeDG-overlay,.threeDG-panel{animation:none}}',
    '.threeDG-float{position:fixed;right:1.1rem;bottom:1.1rem;z-index:2147482000}',
    '.threeDG-float.threeDG-left{left:1.1rem;right:auto}',
    '.threeDG-float .threeDG-button{box-shadow:0 .7rem 2rem rgba(0,0,0,.35),0 .5rem 1.4rem var(--threeDG-shadow,rgba(240,74,41,.3))}',
  ].join('');

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  var overlay = null;
  var panelEl = null;
  var opener = null;
  var bodyOverflow = null;
  var scrollY = 0;

  function onKey(event) {
    if (event.key === 'Escape') close();
  }

  function open(opts) {
    var code = (opts && opts.code) || '';
    if (!code) return;
    var known = ready[code];
    openNow(opts);
    if (known && known.popup && known.popup.button) applyDesign(known.popup.button);
    if (known && known.popup && known.popup.theme && panelEl) panelEl.style.background = known.popup.theme.background || '';
    fetch('https://findmysize.onrender.com/api/charts/code/' + encodeURIComponent(code))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (chart) {
        if (!chart) return;
        var btn = chart.popup && chart.popup.button;
        if (btn) applyDesign(btn);
      })
      .catch(function () {});
  }

  function applyDesign(btn) {
    var button = document.querySelector('.threeDG-button');
    if (!button || !btn) return;
    if (btn.bg) {
      button.style.setProperty('--threeDG-accent', btn.bg);
      button.style.setProperty('--threeDG-shadow', shadowFor(btn.bg));
    }
    if (btn.textColor) button.style.setProperty('--threeDG-text', btn.textColor);
    if (btn.radius != null) button.style.setProperty('--threeDG-radius', btn.radius + 'px');
    if (btn.label) {
      var label = button.querySelector('span');
      if (label) label.textContent = btn.label;
    }
  }

  function openNow(opts) {
    var code = (opts && opts.code) || '';
    close();
    ensureStyles();

    // Use explicit data-base if given, otherwise fall back to Render when served from GitHub Pages.
    var base = (opts && opts.base) || siteRoot();
    if (/github\.io/.test(base) && !opts.base) {
      base = 'https://findmysize.onrender.com/';
    }

    opener = document.activeElement;

    overlay = document.createElement('div');
    overlay.className = 'threeDG-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', (opts && opts.name ? opts.name + ': ' : '') + 'Find your size');

    var panel = document.createElement('div');
    panel.className = 'threeDG-panel';
    panel.tabIndex = -1;
    panelEl = panel;

    var frame = document.createElement('iframe');
    frame.className = 'threeDG-frame';
    frame.title = 'Find your size';
    frame.setAttribute('allow', 'camera; fullscreen');
    frame.setAttribute('allowfullscreen', '');
    frame.src = base + 'size/?g=' + encodeURIComponent(code) + '&embed=1';

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'threeDG-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', close);

    panel.appendChild(frame);
    panel.appendChild(closeBtn);
    overlay.appendChild(panel);

    scrollY = window.scrollY || 0;
    bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    overlay.addEventListener('pointerdown', function (event) {
      if (event.target === overlay) close();
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    panel.focus();
  }

  function close() {
    if (!overlay) return;
    document.removeEventListener('keydown', onKey, true);
    document.body.style.overflow = bodyOverflow == null ? '' : bodyOverflow;
    bodyOverflow = null;
    overlay.remove();
    overlay = null;
    panelEl = null;
    try { window.scrollTo(0, scrollY); } catch (e) { /* ignore */ }
    if (opener && opener.focus) { try { opener.focus(); } catch (e) { /* ignore */ } }
    opener = null;
  }

  window.addEventListener('message', function (event) {
    if (!overlay || event.origin !== siteOrigin()) return;
    var data = event.data;
    if (data && data.source === '3dg' && data.type === 'close') close();
    if (data && data.source === '3dg' && data.type === 'frame' && panelEl) {
      if (/^#[0-9a-f]{6}$/i.test(data.background || '')) panelEl.style.setProperty('--threeDG-panel-bg', data.background);
      var radius = Number(data.radius);
      if (isFinite(radius)) panelEl.style.setProperty('--threeDG-panel-radius', Math.max(0, Math.min(40, radius)) + 'px');
    }
  });

  var CAMERA = 'M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1-1.6A2 2 0 0 1 10.4 3.5h3.2a2 2 0 0 1 1.7 1L16.3 6h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5zM12 8.6a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z';

  function mount(target, opts) {
    ensureStyles();
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'threeDG-button';
    if (opts && opts.name) button.title = opts.name;
    if (opts && opts.color) {
      button.style.setProperty('--threeDG-accent', opts.color);
      button.style.setProperty('--threeDG-shadow', shadowFor(opts.color));
    }
    if (opts && opts.textColor) button.style.setProperty('--threeDG-text', opts.textColor);
    var radius = opts && opts.radius !== '' && opts.radius != null ? Number(opts.radius) : NaN;
    if (isFinite(radius)) button.style.setProperty('--threeDG-radius', Math.max(0, Math.min(32, radius)) + 'px');
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', CAMERA);
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    var label = document.createElement('span');
    label.textContent = (opts && opts.label) || 'Find My Size';
    button.appendChild(svg);
    button.appendChild(label);
    button.addEventListener('click', function () { open(opts); });

    if (target) {
      target.replaceChildren(button);
      return button;
    }

    var parent = script && script.parentNode;
    var inHead = !parent || parent === document.head || parent.nodeName === 'HEAD';
    if ((opts && opts.float) || inHead) {
      var wrap = document.createElement('div');
      wrap.className = 'threeDG-float' + (opts && opts.side === 'left' ? ' threeDG-left' : '');
      wrap.appendChild(button);
      (document.body || document.documentElement).appendChild(wrap);
    } else {
      parent.insertBefore(button, script.nextSibling);
    }
    return button;
  }

  window.ThreeDG = { open: open, close: close, mount: mount };

  var ready = {};
  function autoMount() {
    if (!script) return;
    var spec = script.dataset || {};
    var code = spec.chart || spec.code || '';
    if (!code) return;

    // MOUNT THE BUTTON IMMEDIATELY — don't wait for the fetch.
    var btn = mount(null, {
      code: code,
      name: spec.name || '',
      label: spec.label || 'Find My Size',
      color: spec.color || '',
      textColor: spec.textColor || '',
      radius: spec.radius || '',
      side: spec.side === 'left' ? 'left' : 'right',
      float: spec.float !== '0' && spec.float !== 'false',
      base: spec.base || '',
    });

    // Then fetch chart design in the background and apply it when ready.
    fetch('https://findmysize.onrender.com/api/charts/code/' + encodeURIComponent(code))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (chart) {
        if (chart) ready[code] = chart;
        var dBtn = (chart && chart.popup && chart.popup.button) || {};
        if (dBtn.bg) {
          btn.style.setProperty('--threeDG-accent', dBtn.bg);
          btn.style.setProperty('--threeDG-shadow', shadowFor(dBtn.bg));
        }
        if (dBtn.textColor) btn.style.setProperty('--threeDG-text', dBtn.textColor);
        if (dBtn.radius != null) btn.style.setProperty('--threeDG-radius', dBtn.radius + 'px');
        if (dBtn.label) {
          var label = btn.querySelector('span');
          if (label) label.textContent = dBtn.label;
        }
      })
      .catch(function () {});
  }
  if (document.body) autoMount();
  else document.addEventListener('DOMContentLoaded', autoMount, { once: true });
})();
