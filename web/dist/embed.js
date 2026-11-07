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
 * data-float  "0" places the button in the page where the tag is, instead of
 *             pinning it to a bottom corner.
 *
 * The button's look is normally chosen in the dashboard (Preview & Customise Popup) and
 * arrives with the chart. The same choices can be written on the tag; the dashboard's
 * wins when both are present:
 *   data-color, data-text-color, data-radius, data-side
 *   data-style     default | flat | gradient | outline | soft
 *   data-size      sm | md | lg
 *   data-weight    500 .. 800
 *   data-shadow    default | none | soft | strong | glow
 *   data-icon      camera | scan | person | ruler | tshirt | hanger | sparkle | none
 *   data-icon-pos  left | right
 *   data-upper     "1" for CAPITALS
 *   data-hover     bright | lift | grow | none
 *   data-attention none | pulse | bounce | wiggle
 *   data-edge-x, data-edge-y   distance from the screen's edges, in px
 *   data-font      system | clean | geometric | humanist | rounded | editorial | didone | condensed | mono
 *   data-compact   "1" shows only the icon on phones
 *   data-delay     seconds to wait before the button appears
 *
 * Everything that comes from outside this file (the tag, the dashboard's saved design,
 * the popup's own frame) is checked here against fixed lists and ranges before it is
 * used: colours must be hex, choices must be on the list, text is set as text.
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

  /* ---------- checking what comes in ---------- */

  function hex(value) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value == null ? '' : value).trim());
    if (!m) return '';
    var h = m[1].toLowerCase();
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    return '#' + h;
  }
  function rgbOf(color) {
    return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
  }
  function rgba(color, alpha) {
    var c = rgbOf(color);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')';
  }
  function mixHex(a, b, t) {
    var x = rgbOf(a), y = rgbOf(b);
    return '#' + [0, 1, 2].map(function (i) {
      var v = Math.round(x[i] + (y[i] - x[i]) * t);
      return (v < 16 ? '0' : '') + Math.max(0, Math.min(255, v)).toString(16);
    }).join('');
  }
  function luminance(color) {
    var c = rgbOf(color).map(function (v) {
      var s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function readableOn(color) { return luminance(color) > 0.42 ? '#191411' : '#ffffff'; }
  function pick(value, list) { return list.indexOf(value) >= 0 ? value : undefined; }
  function num(value, lo, hi) {
    if (value === '' || value == null || typeof value === 'boolean') return undefined;
    var n = typeof value === 'number' ? value : parseFloat(value);
    return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : undefined;
  }
  function flag(value) {
    if (value === true || value === '1' || value === 'true') return true;
    if (value === false || value === '0' || value === 'false') return false;
    return undefined;
  }

  var ENUM = {
    style: ['default', 'flat', 'gradient', 'outline', 'soft'],
    size: ['sm', 'md', 'lg'],
    shadow: ['default', 'none', 'soft', 'strong', 'glow'],
    icon: ['camera', 'scan', 'person', 'ruler', 'tshirt', 'hanger', 'sparkle', 'none'],
    iconPos: ['left', 'right'],
    hover: ['bright', 'lift', 'grow', 'none'],
    attention: ['none', 'pulse', 'bounce', 'wiggle'],
    placement: ['center', 'right', 'left', 'bottom'],
    width: ['compact', 'standard', 'wide'],
    animation: ['rise', 'fade', 'zoom', 'slide', 'none'],
    borderStyle: ['subtle', 'none', 'accent', 'strong'],
    panelShadow: ['deep', 'soft', 'glow', 'none'],
    closeStyle: ['dark', 'light', 'accent', 'minimal'],
  };

  // Faces a device already has; each is a stack, so a missing one falls back safely.
  var FONT = {
    system: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
    clean: '"Helvetica Neue",Helvetica,Arial,sans-serif',
    geometric: '"Avenir Next",Avenir,Futura,"Century Gothic","Trebuchet MS",system-ui,sans-serif',
    humanist: '"Gill Sans","Gill Sans MT",Optima,Candara,"Trebuchet MS","Segoe UI",sans-serif',
    rounded: 'ui-rounded,"SF Pro Rounded","Hiragino Maru Gothic ProN",Nunito,"Varela Round",system-ui,sans-serif',
    editorial: 'Charter,"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif',
    didone: 'Didot,"Bodoni 72","Bodoni MT","Playfair Display","Times New Roman",serif',
    condensed: '"Arial Narrow","Helvetica Neue Condensed","Roboto Condensed","Franklin Gothic Medium",Impact,sans-serif',
    mono: 'ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace',
  };

  /** The button's choices, from a tag's attributes or from a saved design. Only valid keys are present. */
  function buttonSpec(src, fromTag) {
    var out = {};
    if (!src) return out;
    function set(key, value) { if (value !== undefined) out[key] = value; }
    var label = typeof src.label === 'string' ? src.label.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) : '';
    if (label) out.label = label;
    set('bg', hex(fromTag ? src.color : src.bg) || undefined);
    set('textColor', hex(src.textColor) || undefined);
    set('radius', num(src.radius, 0, 32));
    set('side', src.side === 'left' ? 'left' : (src.side === 'right' ? 'right' : undefined));
    set('float', flag(src.float));
    set('style', pick(src.style, ENUM.style));
    set('size', pick(src.size, ENUM.size));
    set('weight', num(src.weight, 500, 800));
    set('shadow', pick(src.shadow, ENUM.shadow));
    set('icon', pick(src.icon, ENUM.icon));
    set('iconPos', pick(src.iconPos, ENUM.iconPos));
    set('upper', flag(src.upper));
    set('hover', pick(src.hover, ENUM.hover));
    set('attention', pick(src.attention, ENUM.attention));
    set('edgeX', num(src.edgeX, 8, 72));
    set('edgeY', num(src.edgeY, 8, 72));
    set('font', FONT[src.font] ? src.font : undefined);
    set('compact', flag(src.compact));
    set('delay', num(src.delay, 0, 30));
    return out;
  }

  /** The window's choices, from a saved design or from the popup's frame. */
  function windowSpec(src) {
    var out = {};
    if (!src || typeof src !== 'object') return out;
    function set(key, value) { if (value !== undefined) out[key] = value; }
    set('placement', pick(src.placement, ENUM.placement));
    set('width', pick(src.width, ENUM.width));
    set('animation', pick(src.animation, ENUM.animation));
    set('overlayColor', hex(src.overlayColor) || undefined);
    set('overlayDim', num(src.overlayDim, 0, 95));
    set('overlayBlur', num(src.overlayBlur, 0, 20));
    set('borderStyle', pick(src.borderStyle, ENUM.borderStyle));
    set('shadow', pick(src.shadow, ENUM.panelShadow));
    set('closeStyle', pick(src.closeStyle, ENUM.closeStyle));
    set('closeOutside', flag(src.closeOutside));
    return out;
  }

  var BUTTON_DEFAULTS = {
    label: 'Find My Size', bg: '', textColor: '', radius: undefined, side: 'right', float: true, style: 'default', size: 'md', weight: 650,
    shadow: 'default', icon: 'camera', iconPos: 'left', upper: false, hover: 'bright', attention: 'none', edgeX: 18, edgeY: 18, font: 'system',
    compact: false, delay: 0,
  };
  var WINDOW_DEFAULTS = {
    placement: 'center', width: 'standard', animation: 'rise', overlayColor: '#06070a', overlayDim: 74, overlayBlur: 6, borderStyle: 'subtle',
    shadow: 'deep', closeStyle: 'dark', closeOutside: true,
  };

  function shadowFor(color) {
    var c = hex(color);
    return c ? rgba(c, 0.28) : 'rgba(0,0,0,.25)';
  }

  /* ---------- the stylesheet ---------- */

  var STYLE_ID = 'threeDG-embed-style';
  var CSS = [
    // overlay and panel
    '.threeDG-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:1rem;background:var(--threeDG-overlay,rgba(6,7,10,.74));-webkit-backdrop-filter:blur(var(--threeDG-blur,6px));backdrop-filter:blur(var(--threeDG-blur,6px));animation:threeDG-fade .2s ease-out}',
    '.threeDG-panel{position:relative;width:min(var(--threeDG-width,27.5rem),100%);height:min(48rem,94vh);display:flex;flex-direction:column;overflow:hidden;border:var(--threeDG-border,1px solid rgba(255,255,255,.14));border-radius:var(--threeDG-panel-radius,1.75rem);background:var(--threeDG-panel-bg,#221a15);box-shadow:var(--threeDG-panel-shadow,0 2.5rem 6rem rgba(0,0,0,.65));animation:threeDG-rise .3s cubic-bezier(.22,1,.36,1)}',
    '.threeDG-panel:focus{outline:none}',
    '.threeDG-frame{flex:1;min-height:0;width:100%;display:block;border:0;background:var(--threeDG-panel-bg,#221a15)}',
    // how it opens
    '.threeDG-an-fade .threeDG-panel{animation:threeDG-fade .3s ease-out}',
    '.threeDG-an-zoom .threeDG-panel{animation:threeDG-zoom .32s cubic-bezier(.22,1,.36,1)}',
    '.threeDG-an-none .threeDG-panel,.threeDG-an-none.threeDG-overlay{animation:none}',
    '.threeDG-an-slide .threeDG-panel{animation:threeDG-up .34s cubic-bezier(.22,1,.36,1)}',
    '.threeDG-an-slide.threeDG-p-right .threeDG-panel{animation-name:threeDG-from-right}',
    '.threeDG-an-slide.threeDG-p-left .threeDG-panel{animation-name:threeDG-from-left}',
    '.threeDG-an-slide.threeDG-p-bottom .threeDG-panel{animation-name:threeDG-from-bottom}',
    // where it opens
    '.threeDG-p-right.threeDG-overlay{justify-content:flex-end;align-items:stretch;padding:0}',
    '.threeDG-p-left.threeDG-overlay{justify-content:flex-start;align-items:stretch;padding:0}',
    '.threeDG-p-right .threeDG-panel,.threeDG-p-left .threeDG-panel{height:100%;max-height:none}',
    '.threeDG-p-right .threeDG-panel{border-radius:var(--threeDG-panel-radius,1.75rem) 0 0 var(--threeDG-panel-radius,1.75rem)}',
    '.threeDG-p-left .threeDG-panel{border-radius:0 var(--threeDG-panel-radius,1.75rem) var(--threeDG-panel-radius,1.75rem) 0}',
    '.threeDG-p-bottom.threeDG-overlay{align-items:flex-end;padding:0}',
    '.threeDG-p-bottom .threeDG-panel{height:min(46rem,92vh);border-radius:var(--threeDG-panel-radius,1.75rem) var(--threeDG-panel-radius,1.75rem) 0 0}',
    // the close button
    '.threeDG-close{position:absolute;top:.55rem;right:.55rem;z-index:2;width:2.15rem;height:2.15rem;display:flex;align-items:center;justify-content:center;padding:0;border:1px solid rgba(255,255,255,.16);border-radius:.7rem;background:rgba(12,13,17,.86);color:#eef0f4;font:400 1.2rem/1 system-ui,sans-serif;cursor:pointer}',
    '.threeDG-close:hover{background:rgba(255,255,255,.14);color:#fff}',
    '.threeDG-cl-light .threeDG-close{background:rgba(255,255,255,.92);border-color:rgba(0,0,0,.1);color:#161616}',
    '.threeDG-cl-light .threeDG-close:hover{background:#fff;color:#000}',
    '.threeDG-cl-accent .threeDG-close{background:var(--threeDG-close-bg,#f0521f);border-color:transparent;color:var(--threeDG-close-fg,#fff)}',
    '.threeDG-cl-accent .threeDG-close:hover{filter:brightness(1.08);background:var(--threeDG-close-bg,#f0521f);color:var(--threeDG-close-fg,#fff)}',
    '.threeDG-cl-minimal .threeDG-close{background:transparent;border-color:transparent;color:inherit;opacity:.7;mix-blend-mode:difference;color:#fff}',
    '.threeDG-cl-minimal .threeDG-close:hover{background:transparent;opacity:1}',
    // the button
    '.threeDG-button{display:inline-flex;align-items:center;gap:var(--threeDG-gap,.5rem);padding:var(--threeDG-pad,.72rem 1.1rem);border:var(--threeDG-line,0);border-radius:var(--threeDG-radius,.8rem);background:var(--threeDG-accent,linear-gradient(180deg,#ff6a4a,#f04a29));color:var(--threeDG-text,#fff);font:var(--threeDG-weight,650) var(--threeDG-size,.95rem)/1.2 var(--threeDG-font,system-ui,-apple-system,"Segoe UI",sans-serif);letter-spacing:-.01em;cursor:pointer;box-shadow:0 .5rem 1.4rem var(--threeDG-shadow,rgba(240,74,41,.28));transition:transform .18s ease,filter .18s ease,box-shadow .18s ease}',
    '.threeDG-button:hover{filter:brightness(1.06)}',
    '.threeDG-button svg{width:1.05em;height:1.05em;flex:0 0 auto}',
    '.threeDG-sz-sm{--threeDG-size:.82rem;--threeDG-pad:.5rem .85rem;--threeDG-gap:.4rem}',
    '.threeDG-sz-lg{--threeDG-size:1.1rem;--threeDG-pad:.95rem 1.5rem;--threeDG-gap:.6rem}',
    '.threeDG-upper{text-transform:uppercase;letter-spacing:.06em}',
    '.threeDG-iconr{flex-direction:row-reverse}',
    '.threeDG-h-lift:hover{filter:none;transform:translateY(-3px)}',
    '.threeDG-h-grow:hover{filter:none;transform:scale(1.07)}',
    '.threeDG-h-none:hover{filter:none}',
    '.threeDG-a-pulse{animation:threeDG-pulse 2.4s ease-in-out infinite}',
    '.threeDG-a-bounce{animation:threeDG-bounce 2.2s ease-in-out infinite}',
    '.threeDG-a-wiggle{animation:threeDG-wiggle 3s ease-in-out infinite}',
    '.threeDG-button:hover{animation-play-state:paused}',
    '@keyframes threeDG-fade{from{opacity:0}to{opacity:1}}',
    '@keyframes threeDG-rise{from{opacity:0;transform:translateY(.8rem) scale(.985)}to{opacity:1;transform:none}}',
    '@keyframes threeDG-zoom{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}',
    '@keyframes threeDG-up{from{opacity:0;transform:translateY(2rem)}to{opacity:1;transform:none}}',
    '@keyframes threeDG-from-right{from{transform:translateX(100%)}to{transform:none}}',
    '@keyframes threeDG-from-left{from{transform:translateX(-100%)}to{transform:none}}',
    '@keyframes threeDG-from-bottom{from{transform:translateY(100%)}to{transform:none}}',
    '@keyframes threeDG-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}',
    '@keyframes threeDG-bounce{0%,60%,100%{transform:translateY(0)}20%{transform:translateY(-9px)}40%{transform:translateY(-3px)}}',
    '@keyframes threeDG-wiggle{0%,86%,100%{transform:rotate(0)}90%{transform:rotate(-4deg)}94%{transform:rotate(4deg)}98%{transform:rotate(-2deg)}}',
    '@media (max-width:520px){.threeDG-overlay{padding:.6rem}.threeDG-panel{width:100%;height:92%;border-radius:1.25rem}.threeDG-p-right.threeDG-overlay,.threeDG-p-left.threeDG-overlay,.threeDG-p-bottom.threeDG-overlay{padding:0}.threeDG-p-right .threeDG-panel,.threeDG-p-left .threeDG-panel{height:100%;border-radius:0}.threeDG-p-bottom .threeDG-panel{height:92%;border-radius:1.25rem 1.25rem 0 0}.threeDG-compact span{display:none}.threeDG-compact{padding:.72rem}}',
    '@media (prefers-reduced-motion:reduce){.threeDG-overlay,.threeDG-panel{animation:none!important}.threeDG-button{animation:none!important;transition:none}}',
    '.threeDG-float{position:fixed;right:var(--threeDG-edge-x,1.1rem);bottom:var(--threeDG-edge-y,1.1rem);z-index:2147482000}',
    '.threeDG-float.threeDG-left{left:var(--threeDG-edge-x,1.1rem);right:auto}',
    '.threeDG-float .threeDG-button{box-shadow:0 .7rem 2rem rgba(0,0,0,.35),0 .5rem 1.4rem var(--threeDG-shadow,rgba(240,74,41,.3))}',
  ].join('');

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  /* ---------- the button ---------- */

  var ICON_FILLED_CAMERA = 'M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1-1.6A2 2 0 0 1 10.4 3.5h3.2a2 2 0 0 1 1.7 1L16.3 6h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5zM12 8.6a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z';
  var ICON_STROKE = {
    scan: ['M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8', 'M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8', 'M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16', 'M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16', 'M12 8.4a1.7 1.7 0 1 0 0 .01', 'M9 17v-2.2a3 3 0 0 1 6 0V17'],
    person: ['M12 4.5a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4z', 'M5.5 20c.6-3.8 3.2-6 6.5-6s5.9 2.2 6.5 6'],
    ruler: ['M4.4 15.3 15.3 4.4l4.3 4.3L8.7 19.6z', 'M8.3 11.7l2 2', 'M10.9 9.1l1.5 1.5', 'M13.4 6.6l2 2'],
    tshirt: ['M8.6 4 4 6.6l1.9 3.8 2.1-1V20h8V9.4l2.1 1L20 6.6 15.4 4c-.5 1.3-1.9 2.2-3.4 2.2S9.1 5.3 8.6 4z'],
    hanger: ['M12 9.2V8a2 2 0 1 1 2 2l-2 .8', 'M12 10.8 3.7 16.4a1 1 0 0 0 .6 1.8h15.4a1 1 0 0 0 .6-1.8z'],
    sparkle: ['M12 3.6l1.9 5 5 1.9-5 1.9-1.9 5-1.9-5-5-1.9 5-1.9z', 'M18.6 16.2l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z'],
  };
  var NS = 'http://www.w3.org/2000/svg';

  function makeIcon(name) {
    if (name === 'none') return null;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    if (name === 'camera' || !ICON_STROKE[name]) {
      var path = document.createElementNS(NS, 'path');
      path.setAttribute('d', ICON_FILLED_CAMERA);
      path.setAttribute('fill', 'currentColor');
      svg.appendChild(path);
      return svg;
    }
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.9');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    ICON_STROKE[name].forEach(function (d) {
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    return svg;
  }

  function assign(target) {
    for (var i = 1; i < arguments.length; i += 1) {
      var src = arguments[i];
      if (!src) continue;
      Object.keys(src).forEach(function (k) { target[k] = src[k]; });   // also reads a tag's dataset
    }
    return target;
  }

  /** Draw the button from a (checked) set of choices. Safe to call again with a new set. */
  function paint(button, spec) {
    var s = assign({}, BUTTON_DEFAULTS, spec);
    var bg = s.bg || '';
    var accent = bg || '#ff6a4a';
    var st = button.style;

    // the face
    var background = '';
    var color = '';
    var line = '';
    if (s.style === 'flat') background = accent;
    else if (s.style === 'gradient') background = 'linear-gradient(180deg,' + mixHex(accent, '#ffffff', 0.22) + ',' + accent + ')';
    else if (s.style === 'outline') { background = 'transparent'; color = accent; line = '2px solid ' + accent; }
    else if (s.style === 'soft') { background = rgba(accent, 0.16); color = accent; line = '1px solid ' + rgba(accent, 0.35); }
    else if (bg) background = bg;   // "default": a chosen colour is flat, no colour is the built-in gradient
    st.setProperty('--threeDG-accent', background || '');
    if (!background) st.removeProperty('--threeDG-accent');
    st.setProperty('--threeDG-line', line || '0');
    var text = color || s.textColor || '';
    if (text) st.setProperty('--threeDG-text', text); else st.removeProperty('--threeDG-text');
    if (s.style === 'default' && !s.textColor && bg) st.setProperty('--threeDG-text', readableOn(bg) === '#191411' ? '#191411' : '#ffffff');
    if (s.radius != null) st.setProperty('--threeDG-radius', s.radius + 'px'); else st.removeProperty('--threeDG-radius');
    st.setProperty('--threeDG-weight', String(Math.round(s.weight / 50) * 50));
    if (s.font && FONT[s.font] && s.font !== 'system') st.setProperty('--threeDG-font', FONT[s.font]); else st.removeProperty('--threeDG-font');

    // the shadow
    var tint = shadowFor(accent);
    st.setProperty('--threeDG-shadow', tint);
    var shadows = {
      none: 'none',
      soft: '0 .35rem 1rem rgba(0,0,0,.18)',
      strong: '0 .9rem 2.2rem rgba(0,0,0,.4)',
      glow: '0 0 0 .25rem ' + rgba(accent, 0.18) + ',0 .5rem 2rem ' + rgba(accent, 0.55),
    };
    if (shadows[s.shadow] !== undefined) st.setProperty('box-shadow', shadows[s.shadow], 'important');
    else st.removeProperty('box-shadow');

    // the shape
    var classes = ['threeDG-button', 'threeDG-sz-' + s.size, 'threeDG-h-' + s.hover];
    if (s.attention !== 'none') classes.push('threeDG-a-' + s.attention);
    if (s.upper) classes.push('threeDG-upper');
    if (s.iconPos === 'right') classes.push('threeDG-iconr');
    if (s.compact && s.icon !== 'none') classes.push('threeDG-compact');
    button.className = classes.join(' ');

    // the words and the picture
    var label = button.querySelector('span') || document.createElement('span');
    if (label.textContent !== s.label) label.textContent = s.label;
    var existing = button.querySelector('svg');
    if (existing && existing.getAttribute('data-icon') !== s.icon) { existing.remove(); existing = null; }
    if (!existing && s.icon !== 'none') {
      var icon = makeIcon(s.icon);
      if (icon) { icon.setAttribute('data-icon', s.icon); button.insertBefore(icon, button.firstChild); }
    }
    if (!label.parentNode) button.appendChild(label);
    button.setAttribute('aria-label', s.label);
    return s;
  }

  /* ---------- the window ---------- */

  var overlay = null;
  var panelEl = null;
  var opener = null;
  var bodyOverflow = null;
  var scrollY = 0;
  var currentWindow = assign({}, WINDOW_DEFAULTS);
  var windowAccent = '';

  function applyWindow(win, accent) {
    if (accent) windowAccent = accent;
    currentWindow = assign({}, currentWindow, win);
    if (!overlay || !panelEl) return;
    var w = currentWindow;
    var a = windowAccent || '#f0521f';
    overlay.className = 'threeDG-overlay threeDG-p-' + w.placement + ' threeDG-an-' + w.animation + ' threeDG-cl-' + w.closeStyle;
    overlay.style.setProperty('--threeDG-overlay', rgba(w.overlayColor, Math.round(w.overlayDim) / 100));
    overlay.style.setProperty('--threeDG-blur', Math.round(w.overlayBlur) + 'px');
    var width = { compact: '24rem', standard: '27.5rem', wide: '33rem' }[w.width];
    panelEl.style.setProperty('--threeDG-width', width);
    var borders = { none: '1px solid transparent', subtle: '1px solid rgba(255,255,255,.14)', accent: '1px solid ' + rgba(a, 0.6), strong: '2px solid rgba(255,255,255,.4)' };
    panelEl.style.setProperty('--threeDG-border', borders[w.borderStyle]);
    var shadows = {
      none: 'none',
      soft: '0 1rem 2.5rem rgba(0,0,0,.35)',
      deep: '0 2.5rem 6rem rgba(0,0,0,.65)',
      glow: '0 0 0 1px ' + rgba(a, 0.35) + ',0 0 4rem ' + rgba(a, 0.4) + ',0 2rem 5rem rgba(0,0,0,.6)',
    };
    panelEl.style.setProperty('--threeDG-panel-shadow', shadows[w.shadow]);
    overlay.style.setProperty('--threeDG-close-bg', a);
    overlay.style.setProperty('--threeDG-close-fg', readableOn(a));
  }

  function onKey(event) {
    if (event.key === 'Escape') close();
  }

  /* ---------- the chart's saved design ---------- */

  var designs = {};   // code -> chart, once it has arrived
  var pending = {};   // code -> the request in flight

  function loadChart(code) {
    if (designs[code]) return Promise.resolve(designs[code]);
    if (pending[code]) return pending[code];
    pending[code] = fetch('https://findmysize.onrender.com/api/charts/code/' + encodeURIComponent(code))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (chart) { if (chart) designs[code] = chart; return chart; })
      .catch(function () { return null; })
      .then(function (chart) { delete pending[code]; return chart; });
    return pending[code];
  }

  function designOf(chart) {
    var popup = chart && chart.popup && typeof chart.popup === 'object' ? chart.popup : {};
    var theme = popup.theme && typeof popup.theme === 'object' ? popup.theme : {};
    return {
      button: buttonSpec(popup.button, false),
      window: windowSpec(popup.window),
      background: hex(theme.background),
      accent: hex(theme.accent),
      radius: num(theme.radius, 0, 40),
    };
  }

  function useDesign(chart) {
    var d = designOf(chart);
    if (panelEl) {
      if (d.background) panelEl.style.setProperty('--threeDG-panel-bg', d.background);
      if (d.radius !== undefined) panelEl.style.setProperty('--threeDG-panel-radius', d.radius + 'px');
    }
    applyWindow(d.window, d.accent);
  }

  function open(opts) {
    var code = (opts && opts.code) || '';
    if (!code) return;
    if (designs[code]) {
      openNow(opts);
      useDesign(designs[code]);
      loadChart(code);
      return;
    }
    // The design is on its way: give it a moment, so the window opens the way it was designed
    // (a drawer should not first appear as a centred box). A slow server does not hold the shopper up.
    var done = false;
    function go() {
      if (done) return;
      done = true;
      openNow(opts);
      if (designs[code]) useDesign(designs[code]);
      else loadChart(code).then(function (chart) { if (chart && overlay) useDesign(chart); });
    }
    loadChart(code).then(go);
    setTimeout(go, 450);
  }

  function openNow(opts) {
    var code = (opts && opts.code) || '';
    close();
    ensureStyles();

    // Use explicit data-base if given, otherwise fall back to Render when served from GitHub Pages.
    var base = (opts && opts.base) || siteRoot();
    if (/github\.io/.test(base) && !(opts && opts.base)) {
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
      if (event.target === overlay && currentWindow.closeOutside !== false) close();
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    applyWindow({}, '');
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
    currentWindow = assign({}, WINDOW_DEFAULTS);
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
      applyWindow(windowSpec(data.window), hex(data.accent));
    }
  });

  /* ---------- mounting ---------- */

  /**
   * Put the button on the page. `opts` is a button's choices plus `code`, `name`, `base`,
   * `float` and `side`; `opts.preview` draws it without making it open anything and without
   * the delay (the dashboard's preview uses that).
   */
  function mount(target, opts) {
    ensureStyles();
    opts = opts || {};
    var spec = buttonSpec(opts, !opts.fromDesign);
    var button = document.createElement('button');
    button.type = 'button';
    if (opts.name) button.title = opts.name;
    var current = paint(button, spec);
    if (!opts.preview) button.addEventListener('click', function () { open(opts); });

    var mountedAt = Date.now();
    var wrap = null;
    var shown = !(current.delay > 0) || opts.preview;
    function reveal() { shown = true; (wrap || button).style.display = ''; }
    function place(s) {
      if (!wrap) return;
      wrap.style.setProperty('--threeDG-edge-x', s.edgeX + 'px');
      wrap.style.setProperty('--threeDG-edge-y', s.edgeY + 'px');
      wrap.className = 'threeDG-float' + (s.side === 'left' ? ' threeDG-left' : '');
    }
    button.__threeDG = {
      update: function (next) {
        var merged = assign({}, spec, buttonSpec(next, false));
        var s = paint(button, merged);
        place(s);
        if (!opts.preview && !shown) {
          var wait = Math.max(0, s.delay * 1000 - (Date.now() - mountedAt));
          if (wait === 0) reveal();
        }
        return s;
      },
    };

    var inline;
    if (target) {
      target.replaceChildren(button);
      inline = true;
    } else {
      var parent = script && script.parentNode;
      var inHead = !parent || parent === document.head || parent.nodeName === 'HEAD';
      if (current.float || inHead) {
        wrap = document.createElement('div');
        wrap.appendChild(button);
        place(current);
        (document.body || document.documentElement).appendChild(wrap);
      } else {
        parent.insertBefore(button, script.nextSibling);
      }
    }
    if (!shown) {
      (wrap || button).style.display = 'none';
      setTimeout(function () { if (!shown) reveal(); }, current.delay * 1000);
    }
    return button;
  }

  window.ThreeDG = { open: open, close: close, mount: mount };

  function autoMount() {
    if (!script) return;
    var spec = script.dataset || {};
    var code = spec.chart || spec.code || '';
    if (!code) return;

    // MOUNT THE BUTTON IMMEDIATELY — don't wait for the fetch.
    var btn = mount(null, assign({}, spec, {
      code: code,
      name: spec.name || '',
      label: spec.label || 'Find My Size',
      float: spec.float !== '0' && spec.float !== 'false',
      side: spec.side === 'left' ? 'left' : 'right',
      base: spec.base || '',
    }));

    // Then fetch chart design in the background and apply it when ready.
    loadChart(code).then(function (chart) {
      if (!chart) return;
      var d = designOf(chart);
      if (btn.__threeDG) btn.__threeDG.update(d.button);
    });
  }
  if (document.body) autoMount();
  else document.addEventListener('DOMContentLoaded', autoMount, { once: true });
})();
