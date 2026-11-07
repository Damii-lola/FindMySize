/**
 * "Preview & Customise Popup": the editor a store uses to style its popup.
 *
 * What it edits is the settings object defined in popup-config.js, and what it shows
 * is the real thing: the three screens are the real pages in frames (the store page
 * with the real button; the popup's record screen; its results screen), each told the
 * draft settings as they change and drawing them with the same code a shopper's popup
 * uses. So there is no second, approximate copy of the popup to keep in step.
 *
 * Nothing is saved until "Save"; closing with unsaved changes asks first.
 */
import {
  applyPreset, buttonAttributeString, CHOICES, DEFAULTS, decodeDesign, effectiveColours, encodeDesign, FONTS, hex6, ICON_PATHS,
  normalizePopup, PRESETS, readableOn, toRgbTriplet,
} from './popup-config.js';

const PHASES = [
  { id: 0, label: 'Button', hint: 'On your product page' },
  { id: 1, label: 'Record', hint: 'The first screen' },
  { id: 2, label: 'Results', hint: 'After the scan' },
];

/* ---------- tiny DOM helpers ---------- */

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) if (child) node.append(child);
  return node;
}

const SVG = 'http://www.w3.org/2000/svg';
function iconSvg(name) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ICON_PATHS[name] || []) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

let uid = 0;
const nextId = () => `pe-${(uid += 1)}`;

/** The controls the newer options need. Added once, so the page's own stylesheet is untouched. */
const EXTRA_CSS = `
.pe-icons{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.pe-icon{display:grid;justify-items:center;gap:3px;padding:9px 2px 7px;border:1px solid var(--line-strong);border-radius:10px;background:var(--paper);color:var(--ink);font:inherit;font-size:.66rem;font-weight:600;cursor:pointer;transition:transform .15s}
.pe-icon:hover{transform:translateY(-1px)}
.pe-icon svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.pe-icon[aria-pressed="true"]{background:var(--ink);color:var(--cream);border-color:var(--ink)}
.pe-subhead{margin:6px 0 -6px;font-size:.68rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--muted-strong)}
.pe-section-count{margin-left:8px;padding:1px 7px;border-radius:999px;background:rgb(var(--orange-rgb,240 82 31)/.14);color:var(--orange-text);font-size:.68rem;font-weight:700}
.pe-preset{min-height:64px;align-content:space-between}
.pe-preset-name{font-size:.78rem;line-height:1.1}
.pe-preset-dots{display:flex;gap:4px}
.pe-preset-dots i{width:12px;height:12px;border-radius:50%;background:var(--ac);box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}
.pe-preset-dots i:first-child{background:var(--fg)}
.pe-preset[aria-pressed="true"]{outline:2px solid var(--orange);outline-offset:2px}
.pe-search{margin:0 0 10px}
.pe-stage[data-drawer="true"]{padding:0}
`;

function ensureExtraStyles() {
  if (document.getElementById('pe-extra-style')) return;
  const style = document.createElement('style');
  style.id = 'pe-extra-style';
  style.textContent = EXTRA_CSS;
  document.head.append(style);
}

/* ---------- the editor ---------- */

/**
 * @param {object}   options
 * @param {object}   options.chart      the garment being customised ({ code, name, popup, ... })
 * @param {string}   options.siteUrl    the site's own base URL, ending in "/"
 * @param {(popup: object) => Promise<void>} options.onSave   stores the settings; throws to refuse
 * @param {(message: string, kind?: string) => void} options.toast
 */
export function openPopupEditor({ chart, siteUrl, onSave, toast }) {
  ensureExtraStyles();
  const opener = document.activeElement;
  let cfg = normalizePopup(chart.popup);
  let savedJson = JSON.stringify(cfg);
  let phase = 1;
  let busy = false;
  let lastPreset = '';
  const frames = new Map(); // phase -> { iframe, ready }
  const openState = new Map(); // section title -> open, so a rebuild does not close what you were using

  /* ---- shell ---- */
  const root = el('div', { class: 'pe', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Customise the popup for ${chart.name}` });
  const tabs = el('div', { class: 'pe-tabs', role: 'tablist', 'aria-label': 'Screens' });
  const saveButton = el('button', { class: 'btn btn--primary btn--small', type: 'button', text: 'Save' });
  const closeButton = el('button', { class: 'btn btn--ghost btn--small', type: 'button', text: 'Close' });
  const status = el('span', { class: 'pe-status', role: 'status', 'aria-live': 'polite' });
  const side = el('div', { class: 'pe-side' });
  const stage = el('div', { class: 'pe-stage' });
  const shopBox = el('div', { class: 'pe-shop' });
  const popupBox = el('div', { class: 'pe-popup' });
  stage.append(shopBox, popupBox);

  root.append(
    el('div', { class: 'pe-bar' },
      el('h2', { class: 'pe-title' }, el('small', { text: 'Customise popup' }), chart.name),
      tabs,
      el('div', { class: 'pe-actions' }, status, closeButton, saveButton)),
    el('div', { class: 'pe-body' }, side, stage),
  );

  /* ---- state ---- */
  const isDirty = () => JSON.stringify(cfg) !== savedJson;

  // The "hard to read" note under the colours: one element, kept up to date as colours change.
  const contrastNote = el('p', { class: 'pe-note', hidden: true });
  function updateContrastNote() {
    const eff = effectiveColours(cfg);
    contrastNote.hidden = !eff.corrected;
    if (eff.corrected) {
      contrastNote.replaceChildren('That text colour is hard to read on this background, so the popup uses ', el('b', { text: eff.text }), ' instead.');
    }
  }

  /** The window the popup opens in, as far as a picture can show it: where, how wide, edged, shadowed, dimmed. */
  function paintWindow() {
    const w = cfg.window;
    const r = cfg.theme.radius;
    const { background } = effectiveColours(cfg);
    const [ar, ag, ab] = toRgbTriplet(cfg.theme.accent);
    popupBox.style.setProperty('--pe-bg', background);
    popupBox.style.setProperty('--pe-radius', `${r}px`);
    const width = { compact: 384, standard: 440, wide: 528 }[w.width];
    const drawer = w.placement === 'right' || w.placement === 'left';
    const sheet = w.placement === 'bottom';
    popupBox.style.width = `min(${width}px, 100%)`;
    popupBox.style.height = drawer ? '100%' : sheet ? 'min(700px, 92%)' : '';
    popupBox.style.borderRadius = w.placement === 'right' ? `${r}px 0 0 ${r}px` : w.placement === 'left' ? `0 ${r}px ${r}px 0` : sheet ? `${r}px ${r}px 0 0` : '';
    const ring = { none: '0 0 0 1px transparent', subtle: '0 0 0 1px rgba(255,255,255,0.14)', accent: `0 0 0 1px rgba(${ar},${ag},${ab},0.6)`, strong: '0 0 0 2px rgba(255,255,255,0.4)' }[w.borderStyle];
    const drop = {
      none: 'none', soft: '0 20px 50px -20px rgba(0,0,0,0.45)', deep: '0 40px 90px -30px rgba(0,0,0,0.65)',
      glow: `0 0 70px rgba(${ar},${ag},${ab},0.4), 0 30px 80px -30px rgba(0,0,0,0.6)`,
    }[w.shadow];
    popupBox.style.boxShadow = drop === 'none' ? ring : `${ring}, ${drop}`;
    stage.dataset.drawer = String(drawer);
    stage.style.justifyItems = w.placement === 'right' ? 'end' : w.placement === 'left' ? 'start' : 'center';
    stage.style.alignItems = drawer ? 'stretch' : sheet ? 'end' : 'center';
    if (sheet) stage.style.paddingBottom = '0';
    else stage.style.paddingBottom = '';
    if (phase === 0) {
      stage.style.background = '';
    } else {
      const [or, og, ob] = toRgbTriplet(w.overlayColor);
      const dim = `rgba(${or},${og},${ob},${w.overlayDim / 100})`;
      stage.style.background = `linear-gradient(${dim}, ${dim}), radial-gradient(circle at 1px 1px, rgba(25,20,17,0.12) 1px, transparent 0) 0 0 / 22px 22px, var(--cream-deep)`;
    }
  }

  function refreshChrome() {
    const dirty = isDirty();
    saveButton.disabled = busy || !dirty;
    status.textContent = dirty ? 'Unsaved changes' : '';
    paintWindow();
  }

  function activeFrame() {
    return frames.get(phase);
  }

  let queued = false;
  function push() {
    refreshChrome();
    updateContrastNote();
    if (queued) return;
    queued = true;
    // One message per frame, however fast a slider is dragged.
    requestAnimationFrame(() => {
      queued = false;
      const frame = activeFrame();
      if (frame && frame.ready && frame.iframe.contentWindow) {
        frame.iframe.contentWindow.postMessage({ source: '3dg-preview', type: 'config', config: cfg }, location.origin);
      }
    });
  }

  /** Any control: change the draft, then redraw. `rebuild` re-renders the controls (when one control affects another). */
  function edit(change, { rebuild = false } = {}) {
    change(cfg);
    cfg = normalizePopup(cfg);
    push();
    if (rebuild) renderControls();
  }

  /* ---- controls ---- */
  function field(label, control, hint) {
    const id = nextId();
    const labelEl = el('label', { class: 'pe-label', for: id, text: label });
    control.id = id;
    return el('div', { class: 'pe-field' }, labelEl, control, hint ? el('p', { class: 'pe-hint', text: hint }) : null);
  }

  function textInput(get, set, { max = 60, multiline = false, placeholder = '' } = {}) {
    const node = el(multiline ? 'textarea' : 'input', { class: 'pe-input', maxlength: max, placeholder, rows: multiline ? 4 : undefined, type: multiline ? undefined : 'text' });
    node.value = get();
    node.addEventListener('input', () => edit((c) => set(c, node.value)));
    // an emptied box means "the default", so show the default again once the field is left
    node.addEventListener('blur', () => { node.value = get(); });
    return node;
  }

  function colourInput(get, set, { label }) {
    const picker = el('input', { class: 'pe-swatch', type: 'color', 'aria-label': `${label} colour` });
    const hexBox = el('input', { class: 'pe-input pe-hex', type: 'text', maxlength: 7, spellcheck: 'false', 'aria-label': `${label} as a hex code` });
    const sync = () => { picker.value = get(); hexBox.value = get(); };
    sync();
    picker.addEventListener('input', () => { hexBox.value = picker.value; edit((c) => set(c, picker.value)); });
    hexBox.addEventListener('input', () => {
      const value = hex6(hexBox.value.startsWith('#') ? hexBox.value : `#${hexBox.value}`);
      if (value) { picker.value = value; edit((c) => set(c, value)); }
    });
    hexBox.addEventListener('blur', sync);
    const wrap = el('div', { class: 'pe-colour' }, picker, hexBox);
    // the label's "for" targets the first control
    Object.defineProperty(wrap, 'id', { set: (v) => { picker.id = v; }, get: () => picker.id });
    return wrap;
  }

  function rangeInput(get, set, { min, max, step, format, rebuild = false }) {
    const output = el('output', { class: 'pe-out' });
    const input = el('input', { class: 'pe-range', type: 'range', min, max, step });
    const show = () => { output.textContent = format(get()); };
    input.value = get();
    show();
    input.addEventListener('input', () => { edit((c) => set(c, Number(input.value)), { rebuild: false }); show(); });
    if (rebuild) input.addEventListener('change', () => renderControls());
    const wrap = el('div', { class: 'pe-rangewrap' }, input, output);
    Object.defineProperty(wrap, 'id', { set: (v) => { input.id = v; }, get: () => input.id });
    return wrap;
  }

  function selectInput(get, set, options, { rebuild = false } = {}) {
    const node = el('select', { class: 'pe-input pe-select' }, options.map(([value, text]) => el('option', { value, text })));
    node.value = get();
    node.addEventListener('change', () => edit((c) => set(c, node.value), { rebuild }));
    return node;
  }

  function segmented(get, set, options, label, { rebuild = false } = {}) {
    const group = el('div', { class: 'pe-seg', role: 'group', 'aria-label': label });
    const paint = () => group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === String(get()))));
    for (const [value, text] of options) {
      group.append(el('button', { type: 'button', 'data-value': value, text, onclick: () => { edit((c) => set(c, value), { rebuild }); paint(); } }));
    }
    paint();
    Object.defineProperty(group, 'id', { set: () => {}, get: () => '' });
    return group;
  }

  function iconPicker(get, set, label) {
    const group = el('div', { class: 'pe-icons', role: 'group', 'aria-label': label });
    const paint = () => group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === get())));
    for (const [value, text] of CHOICES.icon) {
      const face = value === 'none' ? el('span', { text: '\u2205', 'aria-hidden': 'true' }) : iconSvg(value);
      group.append(el('button', { class: 'pe-icon', type: 'button', 'data-value': value, title: text, onclick: () => { edit((c) => set(c, value)); paint(); } }, face, el('span', { text })));
    }
    paint();
    Object.defineProperty(group, 'id', { set: () => {}, get: () => '' });
    return group;
  }

  function toggle(get, set, label, hint, { rebuild = false } = {}) {
    const id = nextId();
    const input = el('input', { type: 'checkbox', id });
    input.checked = get();
    input.addEventListener('change', () => edit((c) => set(c, input.checked), { rebuild }));
    return el('div', { class: 'pe-field pe-toggle' },
      el('div', {}, el('label', { class: 'pe-label pe-label--plain', for: id, text: label }), hint ? el('p', { class: 'pe-hint', text: hint }) : null),
      el('label', { class: 'pe-switch' }, input, el('span', { class: 'pe-switch-track' })));
  }

  /** A collapsible group of controls. It stays open or shut across rebuilds, and says how many of its settings are not the default. */
  function section(title, body, { open = true, resetLabel, onReset, changed = 0 } = {}) {
    const summary = el('summary', {}, el('span', { text: title }));
    if (changed > 0) summary.querySelector('span').append(el('span', { class: 'pe-section-count', text: String(changed), title: `${changed} changed` }));
    if (onReset) {
      summary.append(el('button', {
        class: 'pe-reset', type: 'button', text: resetLabel || 'Reset',
        onclick: (event) => { event.preventDefault(); event.stopPropagation(); onReset(); },
      }));
    }
    const details = el('details', { class: 'pe-section' }, summary, el('div', { class: 'pe-section-body' }, body));
    details.open = openState.has(title) ? openState.get(title) : open;
    details.addEventListener('toggle', () => openState.set(title, details.open));
    return details;
  }

  /** How many of `keys` in `group` differ from the defaults. */
  const diff = (group, keys) => keys.filter((k) => JSON.stringify(cfg[group][k]) !== JSON.stringify(DEFAULTS[group][k])).length;

  /* ---- the controls for each screen ---- */
  const percent = (v) => `${Math.round(v * 100)}%`;
  const pixels = (v) => `${Math.round(v)} px`;
  const fontOptions = Object.entries(FONTS).map(([key, f]) => [key, f.label]);

  function buttonControls() {
    const b = () => cfg.button;
    const floating = b().float;
    return [
      section('Words & icon', [
        field('Button text', textInput(() => b().label, (c, v) => { c.button.label = v; }, { max: 28 })),
        field('Icon', iconPicker(() => b().icon, (c, v) => { c.button.icon = v; }, 'Button icon')),
        field('Icon sits', segmented(() => b().iconPos, (c, v) => { c.button.iconPos = v; }, CHOICES.buttonIconPos, 'Icon position')),
        toggle(() => b().upper, (c, v) => { c.button.upper = v; }, 'CAPITAL LETTERS'),
        toggle(() => b().compact, (c, v) => { c.button.compact = v; }, 'Icon only on phones', 'Saves room on small screens. Needs an icon.'),
      ], { changed: diff('button', ['label', 'icon', 'iconPos', 'upper', 'compact']) }),
      section('Colour & style', [
        field('Button colour', colourInput(() => b().bg, (c, v) => { c.button.bg = v; }, { label: 'Button' })),
        field('Text colour', colourInput(() => b().textColor, (c, v) => { c.button.textColor = v; }, { label: 'Button text' }), 'Outline and soft styles draw the text in the button colour.'),
        field('Style', selectInput(() => b().style, (c, v) => { c.button.style = v; }, CHOICES.buttonStyle)),
        field('Shadow', selectInput(() => b().shadow, (c, v) => { c.button.shadow = v; }, CHOICES.buttonShadow)),
      ], { changed: diff('button', ['bg', 'textColor', 'style', 'shadow']) }),
      section('Shape & size', [
        field('Corners', rangeInput(() => b().radius, (c, v) => { c.button.radius = v; }, { min: 0, max: 32, step: 1, format: (v) => (v >= 30 ? 'Pill' : pixels(v)) })),
        field('Size', segmented(() => b().size, (c, v) => { c.button.size = v; }, CHOICES.buttonSize, 'Size')),
        field('Text weight', rangeInput(() => b().weight, (c, v) => { c.button.weight = v; }, { min: 500, max: 800, step: 50, format: (v) => `${Math.round(v)}` })),
        field('Typeface', selectInput(() => b().font, (c, v) => { c.button.font = v; }, CHOICES.buttonFont), 'Uses a face the shopper\u2019s device already has.'),
      ], { open: false, changed: diff('button', ['radius', 'size', 'weight', 'font']) }),
      section('Position & motion', [
        field('Where it sits', segmented(() => (b().float ? b().side : 'inline'), (c, v) => {
          if (v === 'inline') c.button.float = false;
          else { c.button.float = true; c.button.side = v; }
        }, [['right', 'Bottom right'], ['left', 'Bottom left'], ['inline', 'In the page']], 'Position', { rebuild: true }),
        'Bottom corners float above the page; "In the page" puts it where you paste the code.'),
        floating ? field('Distance from the side', rangeInput(() => b().edgeX, (c, v) => { c.button.edgeX = v; }, { min: 8, max: 72, step: 2, format: pixels })) : null,
        floating ? field('Distance from the bottom', rangeInput(() => b().edgeY, (c, v) => { c.button.edgeY = v; }, { min: 8, max: 72, step: 2, format: pixels })) : null,
        field('On hover', selectInput(() => b().hover, (c, v) => { c.button.hover = v; }, CHOICES.buttonHover)),
        field('Catch the eye', selectInput(() => b().attention, (c, v) => { c.button.attention = v; }, CHOICES.buttonAttention), 'A gentle repeat that stops when the shopper hovers. Off for anyone who prefers reduced motion.'),
        field('Appears after', rangeInput(() => b().delay, (c, v) => { c.button.delay = v; }, { min: 0, max: 30, step: 1, format: (v) => (v === 0 ? 'At once' : `${Math.round(v)} s`) })),
      ], { open: false, changed: diff('button', ['side', 'float', 'edgeX', 'edgeY', 'hover', 'attention', 'delay']) }),
    ];
  }

  function recordControls() {
    const r = () => cfg.record;
    return [
      section('Words', [
        field('Small badge', textInput(() => r().badge, (c, v) => { c.record.badge = v; }, { max: 28, placeholder: 'e.g. Free fitting' }), 'A small pill above the headline. Leave empty for none.'),
        field('Headline', textInput(() => r().headline, (c, v) => { c.record.headline = v; }, { max: 60 })),
        toggle(() => r().showInstruction, (c, v) => { c.record.showInstruction = v; }, 'Show the instruction', null, { rebuild: true }),
        r().showInstruction ? field('Instruction', textInput(() => r().instruction, (c, v) => { c.record.instruction = v; }, { max: 260, multiline: true })) : null,
        field('Record button', textInput(() => r().recordLabel, (c, v) => { c.record.recordLabel = v; }, { max: 30 })),
        field('Small print under it', textInput(() => r().recordHint, (c, v) => { c.record.recordHint = v; }, { max: 60 })),
      ], { changed: diff('record', ['badge', 'headline', 'showInstruction', 'instruction', 'recordLabel', 'recordHint']) }),
      section('The camera card', [
        field('Picture', iconPicker(() => r().icon, (c, v) => { c.record.icon = v; }, 'Record picture')),
        field('Picture size', rangeInput(() => r().iconSize, (c, v) => { c.record.iconSize = v; }, { min: 48, max: 120, step: 2, format: pixels })),
        field('Card edge', segmented(() => cfg.theme.dropzone, (c, v) => { c.theme.dropzone = v; }, CHOICES.dropzone, 'Card edge')),
      ], { open: false, changed: diff('record', ['icon', 'iconSize']) + diff('theme', ['dropzone']) }),
      section('The privacy note', [
        toggle(() => r().privacy, (c, v) => { c.record.privacy = v; }, 'Show the note', null, { rebuild: true }),
        r().privacy ? field('Title', textInput(() => r().privacyTitle, (c, v) => { c.record.privacyTitle = v; }, { max: 40 })) : null,
        r().privacy ? field('Text', textInput(() => r().privacyText, (c, v) => { c.record.privacyText = v; }, { max: 200, multiline: true })) : null,
        r().privacy ? field('Highlight', selectInput(() => cfg.theme.accentEdge, (c, v) => { c.theme.accentEdge = v; }, CHOICES.accentEdge)) : null,
        toggle(() => r().promises, (c, v) => { c.record.promises = v; }, 'Show the two promises', '\u201cMeasured on your device\u201d and \u201cFrames deleted after reading\u201d, under the note.'),
      ], { open: false, changed: diff('record', ['privacy', 'privacyTitle', 'privacyText', 'promises']) + diff('theme', ['accentEdge']) }),
    ];
  }

  function resultsControls() {
    const s = () => cfg.results;
    return [
      section('Words', [
        field('Small heading', textInput(() => s().kicker, (c, v) => { c.results.kicker = v; }, { max: 40 })),
        field('Title', textInput(() => s().title, (c, v) => { c.results.title = v; }, { max: 60 })),
        field('Label above the size', textInput(() => s().sizeLabel, (c, v) => { c.results.sizeLabel = v; }, { max: 30 }), 'The numbers shown here are samples; shoppers see their own.'),
        field('Line under the size', textInput(() => s().note, (c, v) => { c.results.note = v; }, { max: 120, placeholder: 'e.g. Free exchanges within 14 days' }), 'Shown only when a size is found. Leave empty for none.'),
        field('Link text', textInput(() => s().linkLabel, (c, v) => { c.results.linkLabel = v; }, { max: 40, placeholder: 'e.g. See the full size guide' })),
        field('Link address', textInput(() => s().linkUrl, (c, v) => { c.results.linkUrl = v; }, { max: 300, placeholder: 'https://\u2026' }), 'Must start with https://. Opens in a new tab. It shows once both the text and the address are filled in.'),
      ], { changed: diff('results', ['kicker', 'title', 'sizeLabel', 'note', 'linkLabel', 'linkUrl']) }),
      section('The size', [
        field('Style', selectInput(() => s().verdictStyle, (c, v) => { c.results.verdictStyle = v; }, CHOICES.verdictStyle)),
        field('Size of the size', rangeInput(() => s().sizeScale, (c, v) => { c.results.sizeScale = v; }, { min: 0.7, max: 1.6, step: 0.05, format: percent })),
        field('Colour', segmented(() => s().sizeColor, (c, v) => { c.results.sizeColor = v; }, CHOICES.sizeColor, 'Size colour')),
      ], { open: false, changed: diff('results', ['verdictStyle', 'sizeScale', 'sizeColor']) }),
    ];
  }

  function presetControls() {
    const grid = el('div', { class: 'pe-presets', role: 'group', 'aria-label': 'Starting points' },
      PRESETS.map((preset) => {
        const t = { ...DEFAULTS.theme, ...preset.theme };
        const face = t.headingFont !== 'auto' ? t.headingFont : t.font;
        const family = face !== 'default' ? FONTS[face].display : '';
        const tile = el('button', {
          class: 'pe-preset', type: 'button', title: `${preset.name}: colours, type, shapes, button and window`,
          'aria-pressed': String(lastPreset === preset.name),
          style: `--bg:${t.background};--fg:${t.text};--ac:${t.accent}${family ? `;font-family:${family}` : ''}`,
          onclick: () => { lastPreset = preset.name; edit((c) => applyPreset(c, preset), { rebuild: true }); },
        }, el('span', { class: 'pe-preset-dots' }, el('i'), el('i')), el('span', { class: 'pe-preset-name', text: preset.name }));
        return tile;
      }));
    return [grid, el('p', { class: 'pe-hint', text: 'A look sets colours, type, shapes, the button and the window together. Your own words and the button\u2019s text and position stay.' })];
  }

  function colourControls() {
    return [
      field('Background', colourInput(() => cfg.theme.background, (c, v) => { c.theme.background = v; }, { label: 'Background' })),
      field('Background 2', colourInput(() => cfg.theme.background2, (c, v) => { c.theme.background2 = v; }, { label: 'Background 2' }), 'The second colour of gradient, mesh and aurora backgrounds.'),
      field('Text', colourInput(() => cfg.theme.text, (c, v) => { c.theme.text = v; }, { label: 'Text' })),
      contrastNote,
      field('Accent', colourInput(() => cfg.theme.accent, (c, v) => {
        c.theme.accent = v;
        c.button.bg = v;
        c.button.textColor = readableOn(v);
      }, { label: 'Accent' }), 'Icons, rules and highlights. The button uses this colour too.'),
      field('Accent 2', colourInput(() => cfg.theme.accent2, (c, v) => { c.theme.accent2 = v; }, { label: 'Accent 2' }), 'The lighter partner of the accent: small headings, links and glows.'),
    ];
  }

  function backgroundControls() {
    const t = () => cfg.theme;
    const style = t().bgStyle;
    return [
      field('Style', selectInput(() => t().bgStyle, (c, v) => { c.theme.bgStyle = v; }, CHOICES.bgStyle, { rebuild: true })),
      style === 'gradient' ? field('Angle', rangeInput(() => t().gradientAngle, (c, v) => { c.theme.gradientAngle = v; }, { min: 0, max: 360, step: 5, format: (v) => `${Math.round(v)}\u00b0` })) : null,
      field('Accent glow', rangeInput(() => t().glow, (c, v) => { c.theme.glow = v; }, { min: 0, max: 60, step: 1, format: (v) => (v === 0 ? 'Off' : `${Math.round(v)}%`), rebuild: true }), 'A soft pool of the accent colour on the card.'),
      t().glow > 0 ? field('Glow sits', segmented(() => t().glowPos, (c, v) => { c.theme.glowPos = v; }, CHOICES.glowPos, 'Glow position')) : null,
      field('Texture', selectInput(() => t().pattern, (c, v) => { c.theme.pattern = v; }, CHOICES.pattern, { rebuild: true })),
      t().pattern !== 'none' ? field('Texture strength', rangeInput(() => t().patternStrength, (c, v) => { c.theme.patternStrength = v; }, { min: 3, max: 30, step: 1, format: (v) => `${Math.round(v)}%` })) : null,
    ];
  }

  function typeControls() {
    const t = () => cfg.theme;
    return [
      field('Body typeface', selectInput(() => t().font, (c, v) => { c.theme.font = v; }, fontOptions), 'Fonts other than FindMySize use a face the shopper\u2019s device already has, so nothing extra is downloaded.'),
      field('Headline typeface', selectInput(() => t().headingFont, (c, v) => { c.theme.headingFont = v; }, [['auto', 'Same as body'], ...fontOptions])),
      field('Headline weight', rangeInput(() => t().headingWeight, (c, v) => { c.theme.headingWeight = v; }, { min: 300, max: 800, step: 100, format: (v) => `${Math.round(v)}` })),
      field('Headline style', segmented(() => t().headingStyle, (c, v) => { c.theme.headingStyle = v; }, CHOICES.headingStyle, 'Headline style')),
      field('Headline case', segmented(() => t().headingCase, (c, v) => { c.theme.headingCase = v; }, CHOICES.headingCase, 'Headline case')),
      field('Letter spacing', rangeInput(() => t().headingTracking, (c, v) => { c.theme.headingTracking = v; }, { min: -5, max: 20, step: 1, format: (v) => (v === 0 ? 'Normal' : `${v > 0 ? '+' : ''}${Math.round(v)}`) })),
      field('Headline size', rangeInput(() => t().headingSize, (c, v) => { c.theme.headingSize = v; }, { min: 0.8, max: 1.4, step: 0.05, format: percent })),
      field('Text size', rangeInput(() => t().scale, (c, v) => { c.theme.scale = v; }, { min: 0.85, max: 1.25, step: 0.05, format: percent })),
    ];
  }

  function surfaceControls() {
    const t = () => cfg.theme;
    return [
      field('Popup corners', rangeInput(() => t().radius, (c, v) => { c.theme.radius = v; }, { min: 0, max: 40, step: 1, format: pixels })),
      field('Card corners', segmented(() => t().cardCorners, (c, v) => { c.theme.cardCorners = v; }, CHOICES.cardCorners, 'Card corners'), '\u201cMatch\u201d follows the popup\u2019s corners.'),
      field('Card look', selectInput(() => t().surface, (c, v) => { c.theme.surface = v; }, CHOICES.surface)),
      field('Line thickness', rangeInput(() => t().borderWidth, (c, v) => { c.theme.borderWidth = v; }, { min: 0, max: 3, step: 1, format: (v) => (v === 0 ? 'None' : pixels(v)) })),
      field('Shadow', segmented(() => t().cardShadow, (c, v) => { c.theme.cardShadow = v; }, CHOICES.cardShadow, 'Card shadow')),
      field('Text alignment', segmented(() => t().align, (c, v) => { c.theme.align = v; }, CHOICES.align, 'Alignment')),
      field('Spacing', segmented(() => t().density, (c, v) => { c.theme.density = v; }, CHOICES.density, 'Spacing')),
    ];
  }

  function ctaControls() {
    const t = () => cfg.theme;
    return [
      field('Button style', selectInput(() => t().ctaStyle, (c, v) => { c.theme.ctaStyle = v; }, CHOICES.ctaStyle), 'The buttons inside the popup, such as \u201cAnalyze my size\u201d.'),
      field('Button corners', rangeInput(() => t().ctaRadius, (c, v) => { c.theme.ctaRadius = v; }, { min: 0, max: 30, step: 1, format: (v) => (v >= 28 ? 'Pill' : pixels(v)) })),
      field('Button text', segmented(() => t().ctaCase, (c, v) => { c.theme.ctaCase = v; }, CHOICES.ctaCase, 'Button text case')),
      field('Motion', segmented(() => t().motion, (c, v) => { c.theme.motion = v; }, CHOICES.motion, 'Motion'), 'Still removes every animation inside the popup.'),
    ];
  }

  function windowControls() {
    const w = () => cfg.window;
    return [
      el('p', { class: 'pe-hint', text: 'The box the popup opens in on your product page. The preview shows where it sits, its width, edge, shadow and dimming; blur and the opening animation show on your live site.' }),
      field('Opens as', segmented(() => w().placement, (c, v) => { c.window.placement = v; }, [['center', 'Centre'], ['right', 'Right'], ['left', 'Left'], ['bottom', 'Bottom']], 'Placement'), 'Right and left are full-height drawers; bottom is a sheet.'),
      field('Width', segmented(() => w().width, (c, v) => { c.window.width = v; }, CHOICES.width, 'Width')),
      field('Opening animation', selectInput(() => w().animation, (c, v) => { c.window.animation = v; }, CHOICES.animation)),
      field('Dim colour', colourInput(() => w().overlayColor, (c, v) => { c.window.overlayColor = v; }, { label: 'Dim' })),
      field('Dim amount', rangeInput(() => w().overlayDim, (c, v) => { c.window.overlayDim = v; }, { min: 0, max: 95, step: 1, format: (v) => `${Math.round(v)}%` })),
      field('Blur behind', rangeInput(() => w().overlayBlur, (c, v) => { c.window.overlayBlur = v; }, { min: 0, max: 20, step: 1, format: (v) => (v === 0 ? 'None' : pixels(v)) })),
      field('Edge', selectInput(() => w().borderStyle, (c, v) => { c.window.borderStyle = v; }, CHOICES.borderStyle)),
      field('Shadow', selectInput(() => w().shadow, (c, v) => { c.window.shadow = v; }, CHOICES.shadow)),
      field('Close button', selectInput(() => w().closeStyle, (c, v) => { c.window.closeStyle = v; }, CHOICES.closeStyle)),
      toggle(() => w().closeOutside, (c, v) => { c.window.closeOutside = v; }, 'Close when tapping outside'),
    ];
  }

  function designCodeControls() {
    const out = el('textarea', {
      class: 'pe-input', rows: 3, readonly: 'true',
      placeholder: 'Generate a code to copy this look.',
      'aria-label': 'Design code',
    });
    const gen = el('button', { class: 'btn btn--primary btn--small', type: 'button', text: 'Generate design code' });
    gen.addEventListener('click', async () => {
      const code = encodeDesign(cfg);
      out.value = code;
      try {
        await navigator.clipboard.writeText(code);
        toast('Design code copied.', 'ok');
      } catch {
        out.focus();
        out.select();
        toast('Design code ready — copy it from the box.', 'ok');
      }
    });

    const input = el('textarea', {
      class: 'pe-input', rows: 3,
      placeholder: 'Paste a design code here.',
      'aria-label': 'Enter design code',
    });
    const apply = el('button', { class: 'btn btn--ghost btn--small', type: 'button', text: 'Apply design code' });
    apply.addEventListener('click', () => {
      try {
        const next = decodeDesign(input.value);
        edit((c) => {
          c.theme = next.theme;
          c.button = next.button;
          c.record = next.record;
          c.results = next.results;
          c.window = next.window;
        }, { rebuild: true });
        toast('Design applied. The popup now matches that code.', 'ok');
      } catch (err) {
        toast(err.message || 'That design code could not be read.', 'error');
      }
    });

    return [
      field('This popup’s code', out, 'Copies the whole look — colours, type, button, window, and the words on every screen.'),
      el('div', { class: 'pe-row' }, gen),
      field('Use another popup’s code', input, 'Paste a code from another chart. Everything here becomes that design.'),
      el('div', { class: 'pe-row' }, apply),
    ];
  }

  const THEME_KEYS = {
    colours: ['background', 'background2', 'text', 'accent', 'accent2'],
    background: ['bgStyle', 'gradientAngle', 'glow', 'glowPos', 'pattern', 'patternStrength'],
    type: ['font', 'headingFont', 'headingWeight', 'headingStyle', 'headingCase', 'headingTracking', 'headingSize', 'scale'],
    surfaces: ['radius', 'cardCorners', 'surface', 'borderWidth', 'cardShadow', 'align', 'density'],
    cta: ['ctaStyle', 'ctaRadius', 'ctaCase', 'motion'],
  };
  const resetTheme = (keys) => () => edit((c) => { for (const k of keys) c.theme[k] = DEFAULTS.theme[k]; }, { rebuild: true });

  function renderControls() {
    updateContrastNote();
    const scroll = side.scrollTop;
    const phaseSections = phase === 0 ? buttonControls() : phase === 1 ? recordControls() : resultsControls();
    const phaseReset = () => {
      edit((c) => {
        if (phase === 0) c.button = { ...DEFAULTS.button, bg: c.button.bg, textColor: c.button.textColor };
        if (phase === 1) c.record = { ...DEFAULTS.record };
        if (phase === 2) c.results = { ...DEFAULTS.results };
      }, { rebuild: true });
    };
    side.replaceChildren(
      el('p', { class: 'pe-phase-hint', text: `${PHASES[phase].label} \u2014 ${PHASES[phase].hint}` }),
      ...phaseSections,
      el('p', { class: 'pe-subhead', text: 'Look of the whole popup' }),
      section('Looks', presetControls(), { open: true }),
      section('Colours', colourControls(), { open: false, onReset: resetTheme(THEME_KEYS.colours), changed: diff('theme', THEME_KEYS.colours) }),
      section('Background', backgroundControls(), { open: false, onReset: resetTheme(THEME_KEYS.background), changed: diff('theme', THEME_KEYS.background) }),
      section('Type', typeControls(), { open: false, onReset: resetTheme(THEME_KEYS.type), changed: diff('theme', THEME_KEYS.type) }),
      section('Shapes & spacing', surfaceControls(), { open: false, onReset: resetTheme(THEME_KEYS.surfaces), changed: diff('theme', THEME_KEYS.surfaces) }),
      section('Buttons & motion', ctaControls(), { open: false, onReset: resetTheme(THEME_KEYS.cta), changed: diff('theme', THEME_KEYS.cta) }),
      el('p', { class: 'pe-subhead', text: 'Where it opens' }),
      section('Popup window', windowControls(), {
        open: false, changed: diff('window', Object.keys(DEFAULTS.window)),
        onReset: () => edit((c) => { c.window = { ...DEFAULTS.window }; }, { rebuild: true }),
      }),
      section('Design code', designCodeControls(), { open: false }),
    );
    // the phase's own sections reset together, from a link on the first of them
    const first = side.querySelector('.pe-section > summary');
    if (first && !first.querySelector('.pe-reset')) {
      first.append(el('button', { class: 'pe-reset', type: 'button', text: 'Reset screen', onclick: (event) => { event.preventDefault(); event.stopPropagation(); phaseReset(); } }));
    }
    side.scrollTop = scroll;
  }

  /* ---- the preview frames ---- */
  function frameUrl(p) {
    const code = encodeURIComponent(chart.code);
    if (p === 0) return `${siteUrl}shop/`;
    return `${siteUrl}size/?g=${code}&embed=1&preview=${p === 1 ? 'record' : 'results'}`;
  }

  function showPhase(next) {
    phase = next;
    tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(Number(b.dataset.phase) === phase)));
    shopBox.hidden = phase !== 0;
    popupBox.hidden = phase === 0;
    stage.dataset.phase = String(phase);
    for (const [p, frame] of frames) frame.iframe.hidden = p !== phase;

    if (!frames.has(phase)) {
      const iframe = el('iframe', { class: 'pe-frame', title: `${PHASES[phase].label} preview`, loading: 'eager', src: frameUrl(phase) });
      frames.set(phase, { iframe, ready: false });
      (phase === 0 ? shopBox : popupBox).append(iframe);
    }
    renderControls();
    push();
  }

  // A frame says it is ready once its page has started; only then is it sent the draft.
  function onMessage(event) {
    if (event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.source !== '3dg-preview' || data.type !== 'ready') return;
    for (const frame of frames.values()) {
      if (frame.iframe.contentWindow === event.source) {
        frame.ready = true;
        if (frame === activeFrame()) push();
        else frame.iframe.contentWindow.postMessage({ source: '3dg-preview', type: 'config', config: cfg }, location.origin);
      }
    }
  }

  /* ---- save, close ---- */
  async function save() {
    if (busy || !isDirty()) return;
    busy = true;
    saveButton.textContent = 'Saving…';
    refreshChrome();
    try {
      const before = buttonAttributeString(JSON.parse(savedJson));
      await onSave(cfg);
      savedJson = JSON.stringify(cfg);
      const after = buttonAttributeString(cfg);
      toast(before !== after ? 'Saved. The button changed, so copy the updated popup code from the card.' : 'Popup saved.', 'ok');
    } catch (err) {
      toast(err.message || 'Could not save.', 'error');
    } finally {
      busy = false;
      saveButton.textContent = 'Save';
      refreshChrome();
    }
  }

  function close() {
    if (isDirty() && !window.confirm('Close without saving your changes?')) return;
    window.removeEventListener('message', onMessage);
    document.removeEventListener('keydown', onKey, true);
    root.remove();
    document.body.style.overflow = '';
    if (opener && typeof opener.focus === 'function') opener.focus();
  }

  function onKey(event) {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save(); }
  }

  /* ---- go ---- */
  for (const p of PHASES) {
    tabs.append(el('button', {
      class: 'pe-tab', type: 'button', role: 'tab', 'data-phase': p.id, text: `${p.id + 1}  ${p.label}`,
      onclick: () => showPhase(p.id),
    }));
  }
  saveButton.addEventListener('click', save);
  closeButton.addEventListener('click', close);
  window.addEventListener('message', onMessage);
  document.addEventListener('keydown', onKey, true);

  document.body.append(root);
  document.body.style.overflow = 'hidden';
  showPhase(0);
  closeButton.focus();
}
