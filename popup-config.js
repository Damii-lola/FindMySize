/**
 * How a store's popup looks — defined once, used twice.
 *
 * A store customises its popup in the dashboard. What it picks is saved on the chart
 * (`size_charts.popup`), and this module is what turns that saved object into pixels,
 * in both places that draw the popup:
 *
 *   - the popup on the store's own page (size.js / main.js, `?embed=1`), and
 *   - the dashboard's preview, which is that same popup in a frame.
 *
 * Because both call applyPopupConfig(), the preview cannot drift from what a shopper
 * sees. (Before this, the preview was styled by one set of rules and the popup by none:
 * the saved settings were never read by the popup at all.)
 *
 * The saved object is data a store controls, so everything that comes out of it is
 * checked: colours must be hex, numbers are clamped, text is plain text and is set
 * with textContent, and the font is a choice from a list rather than a CSS string.
 * Nothing from the saved object is ever put into the page as markup.
 */

export const POPUP_VERSION = 2;

/**
 * The typefaces on offer. A list, not a text box: a font a store typed would need to be
 * loaded. Only the first is bundled; the rest are the best faces each device already has
 * (a stack falls back safely), so nothing here costs the shopper a download.
 */
export const FONTS = {
  default: {
    label: 'FindMySize',
    display: '"Fraunces Variable", "Fraunces", Georgia, "Times New Roman", serif',
    body: '"Instrument Sans Variable", "Instrument Sans", ui-sans-serif, system-ui, sans-serif',
  },
  serif: { label: 'Classic serif', display: 'Georgia, "Times New Roman", serif', body: 'Georgia, "Times New Roman", serif' },
  system: {
    label: 'System',
    display: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    body: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
  clean: {
    label: 'Clean sans',
    display: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    body: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  editorial: {
    label: 'Editorial serif',
    display: 'Charter, "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
    body: 'Charter, "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
  },
  didone: {
    label: 'Fashion didone',
    display: 'Didot, "Bodoni 72", "Bodoni MT", "Playfair Display", "Times New Roman", serif',
    body: 'Didot, "Bodoni 72", "Bodoni MT", "Playfair Display", "Times New Roman", serif',
  },
  humanist: {
    label: 'Humanist sans',
    display: '"Gill Sans", "Gill Sans MT", Optima, Candara, "Trebuchet MS", "Segoe UI", sans-serif',
    body: '"Gill Sans", "Gill Sans MT", Optima, Candara, "Trebuchet MS", "Segoe UI", sans-serif',
  },
  geometric: {
    label: 'Geometric sans',
    display: '"Avenir Next", Avenir, Futura, "Century Gothic", "Trebuchet MS", system-ui, sans-serif',
    body: '"Avenir Next", Avenir, Futura, "Century Gothic", "Trebuchet MS", system-ui, sans-serif',
  },
  rounded: {
    label: 'Soft rounded',
    display: 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", Nunito, "Varela Round", system-ui, sans-serif',
    body: 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", Nunito, "Varela Round", system-ui, sans-serif',
  },
  condensed: {
    label: 'Bold condensed',
    display: '"Arial Narrow", "Helvetica Neue Condensed", "Roboto Condensed", "Franklin Gothic Medium", "Arial Nova Condensed", Impact, sans-serif',
    body: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
  mono: {
    label: 'Monospace',
    display: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
    body: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  },
};

/**
 * Every choice a store can make from a list: [value, label]. The first entry of each
 * is not necessarily the default (DEFAULTS is) — the order is the order a person sees.
 * The checks in normalizePopup() read the values from here, so a choice that is not on
 * the list can never reach the page, and the editor and the validator cannot disagree.
 */
export const CHOICES = {
  bgStyle: [['solid', 'Solid'], ['gradient', 'Gradient'], ['mesh', 'Mesh'], ['aurora', 'Aurora'], ['spotlight', 'Spotlight']],
  glowPos: [['top', 'Top'], ['center', 'Centre'], ['bottom', 'Bottom'], ['corner', 'Corner']],
  pattern: [['none', 'None'], ['dots', 'Dots'], ['grid', 'Grid'], ['diagonal', 'Lines'], ['grain', 'Grain']],
  headingStyle: [['normal', 'Upright'], ['italic', 'Italic']],
  headingCase: [['normal', 'Normal'], ['upper', 'CAPS']],
  align: [['left', 'Left'], ['center', 'Centred']],
  density: [['compact', 'Compact'], ['cozy', 'Cosy'], ['roomy', 'Roomy']],
  surface: [['outline', 'Outline'], ['filled', 'Filled'], ['glass', 'Glass'], ['soft', 'Soft'], ['flat', 'Minimal']],
  dropzone: [['dashed', 'Dashed'], ['solid', 'Solid'], ['dotted', 'Dotted'], ['none', 'None']],
  cardCorners: [['match', 'Match'], ['square', 'Square'], ['soft', 'Soft'], ['round', 'Round']],
  cardShadow: [['default', 'Default'], ['none', 'None'], ['soft', 'Soft'], ['lifted', 'Lifted']],
  accentEdge: [['left', 'Left bar'], ['top', 'Top bar'], ['full', 'Outline'], ['none', 'None']],
  ctaStyle: [['gradient', 'Gradient'], ['solid', 'Solid'], ['outline', 'Outline'], ['soft', 'Soft tint']],
  ctaCase: [['normal', 'Normal'], ['upper', 'CAPS']],
  motion: [['full', 'Animated'], ['off', 'Still']],
  icon: [['camera', 'Camera'], ['scan', 'Scan'], ['person', 'Person'], ['ruler', 'Ruler'], ['tshirt', 'T-shirt'], ['hanger', 'Hanger'], ['sparkle', 'Sparkle'], ['none', 'None']],
  verdictStyle: [['glow', 'Glow'], ['solid', 'Solid'], ['outline', 'Outline'], ['minimal', 'Minimal']],
  sizeColor: [['text', 'Text'], ['accent', 'Accent']],
  placement: [['center', 'Centre'], ['right', 'Right drawer'], ['left', 'Left drawer'], ['bottom', 'Bottom sheet']],
  width: [['compact', 'Compact'], ['standard', 'Standard'], ['wide', 'Wide']],
  animation: [['rise', 'Rise'], ['fade', 'Fade'], ['zoom', 'Zoom'], ['slide', 'Slide'], ['none', 'None']],
  borderStyle: [['subtle', 'Subtle'], ['none', 'None'], ['accent', 'Accent'], ['strong', 'Strong']],
  shadow: [['deep', 'Deep'], ['soft', 'Soft'], ['glow', 'Accent glow'], ['none', 'None']],
  closeStyle: [['dark', 'Dark'], ['light', 'Light'], ['accent', 'Accent'], ['minimal', 'Minimal']],
  buttonStyle: [['default', 'Default'], ['flat', 'Flat'], ['gradient', 'Gradient'], ['outline', 'Outline'], ['soft', 'Soft tint']],
  buttonSize: [['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']],
  buttonShadow: [['default', 'Default'], ['none', 'None'], ['soft', 'Soft'], ['strong', 'Strong'], ['glow', 'Glow']],
  buttonHover: [['bright', 'Brighten'], ['lift', 'Lift'], ['grow', 'Grow'], ['none', 'None']],
  buttonAttention: [['none', 'None'], ['pulse', 'Pulse'], ['bounce', 'Bounce'], ['wiggle', 'Wiggle']],
  buttonIconPos: [['left', 'Before'], ['right', 'After']],
  buttonFont: [['system', 'System'], ['clean', 'Clean sans'], ['geometric', 'Geometric'], ['humanist', 'Humanist'], ['rounded', 'Rounded'], ['editorial', 'Editorial serif'], ['didone', 'Didone'], ['condensed', 'Condensed'], ['mono', 'Monospace']],
};

const valuesOf = (key) => CHOICES[key].map(([value]) => value);

/**
 * What the popup is when a store has chosen nothing: the same card the standalone
 * /size page shows. Every value here is also the value the stylesheet falls back to,
 * so a default config changes nothing on the page.
 *
 * Every key added after the first release is optional in what is stored: a design
 * saved before it existed simply gets this default, so no saved popup changes look.
 */
export const DEFAULTS = Object.freeze({
  v: POPUP_VERSION,
  theme: Object.freeze({
    background: '#221a15',
    background2: '#2a211c',
    text: '#f5e9d6',
    accent: '#f0521f',
    accent2: '#ff8a5c',
    font: 'default',
    radius: 28,
    scale: 1,
    bgStyle: 'solid',
    // background
    gradientAngle: 145,
    glow: 28,
    glowPos: 'top',
    pattern: 'none',
    patternStrength: 10,
    // type
    headingFont: 'auto',
    headingWeight: 400,
    headingStyle: 'normal',
    headingCase: 'normal',
    headingTracking: -2,
    headingSize: 1,
    // layout
    align: 'left',
    density: 'cozy',
    // surfaces
    surface: 'outline',
    borderWidth: 1,
    dropzone: 'dashed',
    cardCorners: 'match',
    cardShadow: 'default',
    accentEdge: 'left',
    // the popup's own buttons
    ctaStyle: 'gradient',
    ctaRadius: 12,
    ctaCase: 'normal',
    motion: 'full',
  }),
  // The floating button on the store's page. Its default look is the one it has always had.
  button: Object.freeze({
    label: 'Find My Size',
    bg: '#ff6a4a',
    textColor: '#ffffff',
    radius: 13,
    side: 'right',
    float: true,
    style: 'default',
    size: 'md',
    weight: 650,
    shadow: 'default',
    icon: 'camera',
    iconPos: 'left',
    upper: false,
    hover: 'bright',
    attention: 'none',
    edgeX: 18,
    edgeY: 18,
    font: 'system',
    compact: false,
    delay: 0,
  }),
  record: Object.freeze({
    badge: '',
    headline: 'Record a 360\u00b0 turn',
    instruction:
      'Record or upload a video of yourself turning one full circle. The video lets us calculate your best clothing size.',
    showInstruction: true,
    recordLabel: 'Click to Record',
    recordHint: '360\u00b0 \u00b7 hold still \u00b7 max 30 seconds',
    icon: 'camera',
    iconSize: 84,
    privacy: true,
    privacyTitle: 'Nothing is saved.',
    privacyText:
      'Your video never leaves your phone. Four still frames are sent, measured, then deleted \u2014 not the clip, not a frame, not a number.',
    promises: true,
  }),
  results: Object.freeze({
    kicker: 'Your measurements',
    title: 'Read from your video',
    sizeLabel: 'Your size',
    note: '',
    linkLabel: '',
    linkUrl: '',
    sizeScale: 1,
    sizeColor: 'text',
    verdictStyle: 'glow',
  }),
  // The box the popup opens in, on the store's page (drawn by embed.js).
  window: Object.freeze({
    placement: 'center',
    width: 'standard',
    animation: 'rise',
    overlayColor: '#06070a',
    overlayDim: 74,
    overlayBlur: 6,
    borderStyle: 'subtle',
    shadow: 'deep',
    closeStyle: 'dark',
    closeOutside: true,
  }),
});

const LIMITS = {
  radius: [0, 40],
  scale: [0.85, 1.25],
  buttonRadius: [0, 32],
  gradientAngle: [0, 360],
  glow: [0, 60],
  patternStrength: [3, 30],
  headingWeight: [300, 800],
  headingTracking: [-5, 20],
  headingSize: [0.8, 1.4],
  borderWidth: [0, 3],
  ctaRadius: [0, 30],
  iconSize: [48, 120],
  sizeScale: [0.7, 1.6],
  buttonWeight: [500, 800],
  edge: [8, 72],
  delay: [0, 30],
  overlayDim: [0, 95],
  overlayBlur: [0, 20],
};

/* ---------- colour ---------- */

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** "#abc" / "#AABBCC" -> "#aabbcc"; anything else (rgba(), names, junk) -> null. */
export function hex6(value) {
  if (typeof value !== 'string') return null;
  const m = HEX.exec(value.trim());
  if (!m) return null;
  const h = m[1].toLowerCase();
  return `#${h.length === 3 ? h.split('').map((c) => c + c).join('') : h}`;
}

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

/** `a` moved toward `b` by `t` (0 = a, 1 = b). */
export function mix(a, b, t) {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

export function luminance(hex) {
  const c = toRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Dark ink or white, whichever reads better on `bg`. */
export function readableOn(bg) {
  return contrast('#191411', bg) >= contrast('#ffffff', bg) ? '#191411' : '#ffffff';
}

/* ---------- validation ---------- */

const num = (value, [lo, hi], fallback) => {
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

const colour = (value, fallback) => hex6(value) || fallback;

/** A value from a fixed list, or the fallback. Nothing a store typed is ever "close enough". */
const pick = (value, key, fallback) => (valuesOf(key).includes(value) ? value : fallback);

/** Plain text, trimmed and capped. Empty means "use the default", not "show nothing". */
function text(value, max, fallback) {
  if (typeof value !== 'string') return fallback;
  // eslint-disable-next-line no-control-regex
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return clean || fallback;
}

/** An https address, or nothing. A link a store typed must never be javascript: or data:. */
export function safeUrl(value) {
  if (typeof value !== 'string') return '';
  const raw = value.trim().slice(0, 300);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
const round = (n, places = 2) => Number(n.toFixed(places));

/**
 * Whatever is stored -> a complete, safe config.
 *
 * Version 1 (the old customiser's) was never read by any popup, so apart from the
 * button's own settings, which did reach stores through the snippet, nothing of it
 * carries over: its values described a different design.
 *
 * Version 2 has grown by adding optional keys. A design saved earlier has none of them
 * and gets the defaults, which draw exactly what that design always drew.
 */
export function normalizePopup(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const current = src.v === POPUP_VERSION;
  const t = (current && src.theme) || {};
  const b = (current ? src.button : legacyButton(src.fabButton)) || {};
  const r = (current && src.record) || {};
  const s = (current && src.results) || {};
  const w = (current && src.window) || {};
  const D = DEFAULTS;

  return {
    v: POPUP_VERSION,
    theme: {
      background: colour(t.background, D.theme.background),
      background2: colour(t.background2, D.theme.background2),
      text: colour(t.text, D.theme.text),
      accent: colour(t.accent, D.theme.accent),
      accent2: colour(t.accent2, D.theme.accent2),
      font: Object.prototype.hasOwnProperty.call(FONTS, t.font) ? t.font : D.theme.font,
      radius: num(t.radius, LIMITS.radius, D.theme.radius),
      scale: num(t.scale, LIMITS.scale, D.theme.scale),
      bgStyle: pick(t.bgStyle, 'bgStyle', D.theme.bgStyle),
      gradientAngle: Math.round(num(t.gradientAngle, LIMITS.gradientAngle, D.theme.gradientAngle)),
      glow: Math.round(num(t.glow, LIMITS.glow, D.theme.glow)),
      glowPos: pick(t.glowPos, 'glowPos', D.theme.glowPos),
      pattern: pick(t.pattern, 'pattern', D.theme.pattern),
      patternStrength: Math.round(num(t.patternStrength, LIMITS.patternStrength, D.theme.patternStrength)),
      headingFont: t.headingFont === 'auto' || Object.prototype.hasOwnProperty.call(FONTS, t.headingFont) ? t.headingFont : D.theme.headingFont,
      headingWeight: Math.round(num(t.headingWeight, LIMITS.headingWeight, D.theme.headingWeight) / 100) * 100,
      headingStyle: pick(t.headingStyle, 'headingStyle', D.theme.headingStyle),
      headingCase: pick(t.headingCase, 'headingCase', D.theme.headingCase),
      headingTracking: Math.round(num(t.headingTracking, LIMITS.headingTracking, D.theme.headingTracking)),
      headingSize: round(num(t.headingSize, LIMITS.headingSize, D.theme.headingSize)),
      align: pick(t.align, 'align', D.theme.align),
      density: pick(t.density, 'density', D.theme.density),
      surface: pick(t.surface, 'surface', D.theme.surface),
      borderWidth: Math.round(num(t.borderWidth, LIMITS.borderWidth, D.theme.borderWidth)),
      dropzone: pick(t.dropzone, 'dropzone', D.theme.dropzone),
      cardCorners: pick(t.cardCorners, 'cardCorners', D.theme.cardCorners),
      cardShadow: pick(t.cardShadow, 'cardShadow', D.theme.cardShadow),
      accentEdge: pick(t.accentEdge, 'accentEdge', D.theme.accentEdge),
      ctaStyle: pick(t.ctaStyle, 'ctaStyle', D.theme.ctaStyle),
      ctaRadius: Math.round(num(t.ctaRadius, LIMITS.ctaRadius, D.theme.ctaRadius)),
      ctaCase: pick(t.ctaCase, 'ctaCase', D.theme.ctaCase),
      motion: pick(t.motion, 'motion', D.theme.motion),
    },
    button: {
      label: text(b.label, 28, D.button.label),
      bg: colour(b.bg, D.button.bg),
      textColor: colour(b.textColor, D.button.textColor),
      radius: num(b.radius, LIMITS.buttonRadius, D.button.radius),
      side: b.side === 'left' ? 'left' : 'right',
      float: b.float !== false,
      style: pick(b.style, 'buttonStyle', D.button.style),
      size: pick(b.size, 'buttonSize', D.button.size),
      weight: Math.round(num(b.weight, LIMITS.buttonWeight, D.button.weight) / 50) * 50,
      shadow: pick(b.shadow, 'buttonShadow', D.button.shadow),
      icon: pick(b.icon, 'icon', D.button.icon),
      iconPos: pick(b.iconPos, 'buttonIconPos', D.button.iconPos),
      upper: bool(b.upper, D.button.upper),
      hover: pick(b.hover, 'buttonHover', D.button.hover),
      attention: pick(b.attention, 'buttonAttention', D.button.attention),
      edgeX: Math.round(num(b.edgeX, LIMITS.edge, D.button.edgeX)),
      edgeY: Math.round(num(b.edgeY, LIMITS.edge, D.button.edgeY)),
      font: pick(b.font, 'buttonFont', D.button.font),
      compact: bool(b.compact, D.button.compact),
      delay: Math.round(num(b.delay, LIMITS.delay, D.button.delay)),
    },
    record: {
      badge: text(r.badge, 28, D.record.badge),
      headline: text(r.headline, 60, D.record.headline),
      instruction: text(r.instruction, 260, D.record.instruction),
      showInstruction: bool(r.showInstruction, D.record.showInstruction),
      recordLabel: text(r.recordLabel, 30, D.record.recordLabel),
      recordHint: text(r.recordHint, 60, D.record.recordHint),
      icon: pick(r.icon, 'icon', D.record.icon),
      iconSize: Math.round(num(r.iconSize, LIMITS.iconSize, D.record.iconSize)),
      privacy: bool(r.privacy, D.record.privacy),
      privacyTitle: text(r.privacyTitle, 40, D.record.privacyTitle),
      privacyText: text(r.privacyText, 200, D.record.privacyText),
      promises: r.promises !== false,
    },
    results: {
      kicker: text(s.kicker, 40, D.results.kicker),
      title: text(s.title, 60, D.results.title),
      sizeLabel: text(s.sizeLabel, 30, D.results.sizeLabel),
      note: text(s.note, 120, D.results.note),
      linkLabel: text(s.linkLabel, 40, D.results.linkLabel),
      linkUrl: safeUrl(s.linkUrl),
      sizeScale: round(num(s.sizeScale, LIMITS.sizeScale, D.results.sizeScale)),
      sizeColor: pick(s.sizeColor, 'sizeColor', D.results.sizeColor),
      verdictStyle: pick(s.verdictStyle, 'verdictStyle', D.results.verdictStyle),
    },
    window: {
      placement: pick(w.placement, 'placement', D.window.placement),
      width: pick(w.width, 'width', D.window.width),
      animation: pick(w.animation, 'animation', D.window.animation),
      overlayColor: colour(w.overlayColor, D.window.overlayColor),
      overlayDim: Math.round(num(w.overlayDim, LIMITS.overlayDim, D.window.overlayDim)),
      overlayBlur: Math.round(num(w.overlayBlur, LIMITS.overlayBlur, D.window.overlayBlur)),
      borderStyle: pick(w.borderStyle, 'borderStyle', D.window.borderStyle),
      shadow: pick(w.shadow, 'shadow', D.window.shadow),
      closeStyle: pick(w.closeStyle, 'closeStyle', D.window.closeStyle),
      closeOutside: bool(w.closeOutside, D.window.closeOutside),
    },
  };
}

/** The old button settings were in rem; the new ones are px. */
function legacyButton(old) {
  if (!old || typeof old !== 'object') return {};
  return {
    label: old.label,
    bg: old.bg,
    textColor: old.textColor,
    radius: typeof old.radius === 'number' ? old.radius * 16 : undefined,
    float: old.float,
  };
}

/** True when nothing differs from the defaults. */
export function isDefault(cfg) {
  return JSON.stringify(normalizePopup(cfg)) === JSON.stringify(normalizePopup({}));
}

/* ---------- from settings to CSS ---------- */

/**
 * The colours the popup is really drawn with. Text is checked against the background
 * (a store that picks a pale background and leaves the text pale would otherwise ship
 * a popup nobody can read), and the card's inner colours are worked out from the two.
 */
export function effectiveColours(cfg) {
  const { background, accent } = cfg.theme;
  let ink = cfg.theme.text;
  const corrected = contrast(ink, background) < 4.5;
  if (corrected) ink = readableOn(background);
  return { background, text: ink, accent, corrected };
}

/** [r, g, b] of a #rrggbb colour. */
export const toRgbTriplet = (hex) => toRgb(hex);

const rgba = (hex, alpha) => `rgb(${toRgb(hex).join(' ')} / ${alpha})`;

/** The icons a store can put on the record card and on its button: 24x24, drawn with a stroke. */
export const ICON_PATHS = {
  camera: ['M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1-1.6A2 2 0 0 1 10.4 3.5h3.2a2 2 0 0 1 1.7 1L16.3 6h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z', 'M12 8.6a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z'],
  scan: ['M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8', 'M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8', 'M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16', 'M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16', 'M12 8.4a1.7 1.7 0 1 0 0 .01', 'M9 17v-2.2a3 3 0 0 1 6 0V17'],
  person: ['M12 4.5a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4z', 'M5.5 20c.6-3.8 3.2-6 6.5-6s5.9 2.2 6.5 6'],
  ruler: ['M4.4 15.3 15.3 4.4l4.3 4.3L8.7 19.6z', 'M8.3 11.7l2 2', 'M10.9 9.1l1.5 1.5', 'M13.4 6.6l2 2'],
  tshirt: ['M8.6 4 4 6.6l1.9 3.8 2.1-1V20h8V9.4l2.1 1L20 6.6 15.4 4c-.5 1.3-1.9 2.2-3.4 2.2S9.1 5.3 8.6 4z'],
  hanger: ['M12 9.2V8a2 2 0 1 1 2 2l-2 .8', 'M12 10.8 3.7 16.4a1 1 0 0 0 .6 1.8h15.4a1 1 0 0 0 .6-1.8z'],
  sparkle: ['M12 3.6l1.9 5 5 1.9-5 1.9-1.9 5-1.9-5-5-1.9 5-1.9z', 'M18.6 16.2l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z'],
};

const MESH_AT = ['20% 10%', '80% 80%'];
const GLOW_AT = {
  top: ['90% 55%', '50% 0%'],
  center: ['75% 60%', '50% 45%'],
  bottom: ['90% 55%', '50% 100%'],
  corner: ['80% 60%', '100% 0%'],
};

/** A grain tile in the text colour, as a data: image (the popup's CSP allows data: images). */
function grainImage(ink, strength) {
  const [r, g, b] = toRgb(ink).map((v) => round(v / 255, 3));
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 1.3 -.15'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='${round(Math.min(1, strength * 4.5), 2)}'/></svg>`;
  return `url("data:image/svg+xml,${svg.replace(/</g, '%3C').replace(/>/g, '%3E')}")`;
}

/** Everything the card's ground is made of, top layer first. Only hex colours and numbers go in. */
function groundLayers(t, c) {
  const D = DEFAULTS.theme;
  const { background, text: ink, accent } = c;
  const bg2 = t.background2 || background;
  const accent2 = t.accent2;
  const layers = [];

  // texture, over everything
  const a = t.patternStrength / 100;
  if (t.pattern === 'dots') layers.push(`radial-gradient(${rgba(ink, a)} 1px, transparent 1.5px) 0 0 / 18px 18px`);
  else if (t.pattern === 'grid') layers.push(`linear-gradient(${rgba(ink, a * 0.8)} 1px, transparent 1px) 0 0 / 28px 28px`, `linear-gradient(90deg, ${rgba(ink, a * 0.8)} 1px, transparent 1px) 0 0 / 28px 28px`);
  else if (t.pattern === 'diagonal') layers.push(`repeating-linear-gradient(45deg, ${rgba(ink, a * 0.7)} 0 1px, transparent 1px 14px)`);
  else if (t.pattern === 'grain') layers.push(grainImage(ink, a));

  // the accent's glow
  if (t.glow > 0) {
    const [size, at] = GLOW_AT[t.glowPos] || GLOW_AT.top;
    layers.push(`radial-gradient(${size} at ${at}, color-mix(in srgb, ${accent} ${t.glow}%, transparent), transparent 70%)`);
  }

  // the ground itself
  if (t.bgStyle === 'gradient') layers.push(`linear-gradient(${t.gradientAngle}deg, ${background} 0%, ${bg2} 100%)`);
  else if (t.bgStyle === 'mesh') {
    layers.push(
      `radial-gradient(ellipse at ${MESH_AT[0]}, ${mix(background, bg2, 0.4)} 0%, transparent 50%)`,
      `radial-gradient(ellipse at ${MESH_AT[1]}, ${mix(bg2, background, 0.3)} 0%, transparent 45%)`,
      background,
    );
  } else if (t.bgStyle === 'aurora') {
    layers.push(
      `radial-gradient(60% 50% at 10% 0%, ${rgba(accent, 0.38)}, transparent 70%)`,
      `radial-gradient(55% 45% at 95% 25%, ${rgba(accent2 === D.accent2 ? mix(accent, '#ffffff', 0.28) : accent2, 0.3)}, transparent 70%)`,
      `radial-gradient(70% 50% at 40% 105%, ${rgba(bg2 === D.background2 ? accent : bg2, 0.26)}, transparent 70%)`,
      background,
    );
  } else if (t.bgStyle === 'spotlight') layers.push(`radial-gradient(circle at 50% 30%, ${mix(background, accent, 0.22)} 0%, ${background} 68%)`);
  else layers.push(background);

  return layers;
}

const H = 'html.embed body.app';
const list = (...selectors) => selectors.map((s) => `${H} ${s}`).join(',');
const rule = (selector, decls) => (decls.length ? `${selector}{${decls.join(';')}}\n` : '');

/** Only what differs from the defaults is written: a default popup gets no overrides at all. */
export function popupCss(rawCfg) {
  const cfg = normalizePopup(rawCfg);
  const D = DEFAULTS.theme;
  const t = cfg.theme;
  const { background, text: ink, accent } = effectiveColours(cfg);
  const colours = { background, text: ink, accent };
  const body = [];
  const root = [];
  let css = '';

  const style = t.bgStyle;
  const explicitGround = t.glow !== D.glow || t.glowPos !== D.glowPos || t.pattern !== D.pattern || style === 'aurora' || style === 'spotlight';
  const ground = groundLayers(t, colours);
  // for a plain ground the old way: one variable, one colour or one gradient
  const simpleGround = ground.join(', ');
  const nonDefaultGround = background !== D.background || ink !== D.text || style !== 'solid';

  if (nonDefaultGround) {
    const rgb = toRgb(ink).join(' ');
    const solidBg = style === 'solid' || style === 'aurora' || style === 'spotlight' ? background : null;
    // --bg is what panels of numbers sit on: a gradient is fine for gradient/mesh, plain for the rest
    const bgVar = solidBg || (explicitGround ? ground[ground.length - 1] : simpleGround);
    body.push(
      `--pu-bg:${explicitGround ? background : (solidBg || simpleGround)}`, `--bg:${bgVar}`,
      `--panel:${mix(background, ink, 0.08)}`,
      `--pu-text:${ink}`, `--text:${ink}`,
      `--pu-muted:${mix(ink, background, 0.32)}`, `--muted:${mix(ink, background, 0.38)}`,
      `--faint:${mix(ink, background, 0.6)}`,
      `--line:rgb(${rgb} / 0.12)`, `--line-2:rgb(${rgb} / 0.2)`,
      `--glass:${rgb}`,
      `color-scheme:${luminance(background) > 0.4 ? 'light' : 'dark'}`,
    );
  }
  if (accent !== D.accent || t.accent2 !== D.accent2) {
    const lighter = t.accent2 !== D.accent2 ? t.accent2 : mix(accent, '#ffffff', 0.28);
    body.push(`--pu-accent:${accent}`, `--accent:${accent}`, `--pu-accent-2:${lighter}`, `--accent-2:${lighter}`, `--on-accent:${readableOn(accent)}`);
  }
  if (t.radius !== D.radius) body.push(`--pu-radius:${t.radius}px`, `--radius:${Math.round(t.radius * 0.64)}px`);

  // type: the body face, and the face of the big words, which can differ
  const bodyKey = t.font;
  const displayKey = t.headingFont === 'auto' ? t.font : t.headingFont;
  if (bodyKey !== D.font) body.push(`--pu-body:${FONTS[bodyKey].body}`);
  if (displayKey !== D.font) body.push(`--pu-display:${FONTS[displayKey].display}`);
  if (t.scale !== D.scale) root.push(`--pu-scale:${t.scale}`);

  if (bodyKey !== D.font) {
    css += `${H}, ${H} button, ${H} input{font-family:${FONTS[bodyKey].body}}\n`;
  }
  const bigWords = list('.result-title', '.verdict-size', '.measure-value', '.intro h1', '.cam-cta');
  if (displayKey !== D.font) css += `${bigWords}{font-family:${FONTS[displayKey].display}}\n`;

  const headings = list('.intro h1', '.cam-cta', '.result-title', '.verdict-size');
  const headingDecls = [];
  if (t.headingWeight !== D.headingWeight) headingDecls.push(`font-weight:${t.headingWeight}`);
  if (t.headingStyle !== D.headingStyle) headingDecls.push('font-style:italic');
  if (t.headingCase !== D.headingCase) headingDecls.push('text-transform:uppercase');
  if (t.headingTracking !== D.headingTracking) headingDecls.push(`letter-spacing:${round(t.headingTracking / 100)}em`);
  css += rule(headings, headingDecls);

  if (t.headingSize !== D.headingSize) {
    const k = t.headingSize;
    css += rule(list('.intro h1'), [`font-size:calc(1.95rem * ${k})`]);
    css += rule(list('.cam-cta'), [`font-size:calc(1.7rem * ${k})`]);
    css += rule(list('.result-title'), [`font-size:calc(clamp(1.6rem, 6vw, 2.05rem) * ${k})`]);
  }

  // the page's heading is a white-to-grey wash in the stylesheet; on any other colours it follows the text
  if (background !== D.background || ink !== D.text) {
    css += rule(list('.result-title'), ['background:none', `-webkit-text-fill-color:${ink}`, `color:${ink}`]);
  }

  // the ground
  if (explicitGround) css += rule(list('.stage'), [`background:${ground.join(', ')}`]);

  // layout
  if (t.align === 'center') {
    css += rule(list('.intro'), ['text-align:center', 'align-items:center', 'padding:0 2.3rem']);
    css += rule(list('.result-head'), ['align-items:center', 'text-align:center']);
    css += rule(list('.card-foot'), ['justify-content:center']);
  }
  if (t.density === 'compact') css += rule(list('.stage'), ['padding:1.1rem 0.9rem', 'gap:0.7rem']);
  if (t.density === 'roomy') css += rule(list('.stage'), ['padding:2.1rem 1.4rem', 'gap:1.45rem']);

  // surfaces: the cards the popup is made of
  const cards = list('.open-camera', '.privacy', '.group', '.estimate');
  const filled = mix(background, ink, 0.07);
  const hairline = `color-mix(in srgb, ${ink} 16%, transparent)`;
  if (t.surface === 'filled') css += rule(cards, [`background:${filled}`, 'border-color:transparent']);
  else if (t.surface === 'soft') css += rule(cards, [`background:${filled}`, 'border-color:transparent', 'box-shadow:0 0.7rem 1.8rem -1.1rem rgba(0,0,0,0.55)']);
  else if (t.surface === 'glass') css += rule(cards, [`background:color-mix(in srgb, ${ink} 6%, transparent)`, '-webkit-backdrop-filter:blur(12px)', 'backdrop-filter:blur(12px)', `border-color:color-mix(in srgb, ${ink} 22%, transparent)`]);
  else if (t.surface === 'flat') css += rule(cards, ['background:transparent', 'box-shadow:none', `border-color:${hairline}`]);
  if (t.surface === 'filled') css += rule(`${list('.open-camera')}:hover`, [`background:${mix(background, ink, 0.12)}`]);
  if (t.surface === 'flat') css += rule(`${list('.open-camera')}:hover`, [`background:color-mix(in srgb, ${ink} 6%, transparent)`]);

  if (t.borderWidth !== D.borderWidth) css += rule(list('.open-camera', '.privacy', '.group', '.verdict'), [`border-width:${t.borderWidth}px`]);
  if (t.dropzone !== D.dropzone) css += rule(list('.open-camera'), [`border-style:${t.dropzone}`]);

  if (t.cardCorners !== D.cardCorners) {
    const px = { square: 0, soft: 10, round: 26 }[t.cardCorners];
    css += rule(list('.open-camera', '.privacy', '.group', '.verdict', '.estimate'), [`border-radius:${px}px`]);
    css += rule(list('.measure'), [`border-radius:${Math.round(px * 0.7)}px`]);
  }
  if (t.cardShadow !== D.cardShadow) {
    const shadow = { none: 'none', soft: '0 0.6rem 1.6rem -1rem rgba(0,0,0,0.45)', lifted: `0 1.2rem 2.4rem -1rem rgba(0,0,0,0.6), 0 0 0 1px ${hairline}` }[t.cardShadow];
    css += rule(list('.verdict', '.group', '.measure'), [`box-shadow:${shadow}`]);
  }

  // the note under the first screen's button: its edge in the accent colour, where the store wants it
  const bw = t.borderWidth;
  if (t.accentEdge === 'left' && (t.borderWidth !== D.borderWidth || t.surface !== D.surface)) {
    css += rule(list('.privacy'), [`border-left:3px solid ${accent}`]);
  } else if (t.accentEdge === 'top') {
    css += rule(list('.privacy'), [`border-left:${bw}px solid ${hairline}`, `border-top:3px solid ${accent}`]);
  } else if (t.accentEdge === 'none') {
    css += rule(list('.privacy'), [`border-left:${bw}px solid ${hairline}`]);
  } else if (t.accentEdge === 'full') {
    css += rule(list('.privacy'), [`border:${Math.max(1, bw)}px solid ${accent}`]);
  }

  // the popup's own buttons
  const primary = list('.btn-primary');
  const onAccent = readableOn(accent);
  const accent2 = t.accent2 !== D.accent2 ? t.accent2 : mix(accent, '#ffffff', 0.28);
  if (t.ctaStyle === 'solid') css += rule(primary, [`background:${accent}`, `color:${onAccent}`, 'box-shadow:none']);
  else if (t.ctaStyle === 'outline') {
    css += rule(primary, ['background:transparent', `color:${accent2}`, `border:1.5px solid ${accent}`, 'box-shadow:none']);
    css += rule(`${primary}:hover`, [`background:color-mix(in srgb, ${accent} 16%, transparent)`, 'box-shadow:none']);
  } else if (t.ctaStyle === 'soft') {
    css += rule(primary, [`background:color-mix(in srgb, ${accent} 20%, transparent)`, `color:${accent2}`, 'box-shadow:none']);
  } else if (accent !== D.accent) {
    css += rule(primary, [`color:${onAccent}`]);
  }
  const buttons = list('.btn-primary', '.btn-ghost', '.btn-secondary', '.capture-btn');
  if (t.ctaRadius !== D.ctaRadius) css += rule(buttons, [`border-radius:${t.ctaRadius}px`]);
  if (t.ctaCase !== D.ctaCase) css += rule(buttons, ['text-transform:uppercase', 'letter-spacing:0.06em']);

  if (t.motion === 'off') css += `${H} *,${H} *::before,${H} *::after{animation:none !important;transition:none !important}\n`;

  // the first screen
  const r = cfg.record;
  const d = DEFAULTS.record;
  if (r.iconSize !== d.iconSize) {
    const size = round((r.iconSize / 84) * 5.2);
    css += rule(list('.cam-icon'), [`width:${size}rem`, `height:${size}rem`, `padding:${round(size * 0.279)}rem`]);
  }
  if (r.icon === 'none') css += rule(list('.cam-icon'), ['display:none']);
  if (!r.privacy) css += rule(list('.privacy'), ['display:none']);
  if (!r.showInstruction) css += rule(list('.intro .lead'), ['display:none']);
  if (r.badge) {
    css += rule(list('.pu-badge'), [
      'align-self:flex-start', 'display:inline-flex', 'align-items:center', 'width:fit-content', 'padding:0.3rem 0.75rem',
      `border:1px solid color-mix(in srgb, ${accent} 50%, transparent)`, 'border-radius:999px',
      `background:color-mix(in srgb, ${accent} 16%, transparent)`, `color:${accent2}`,
      'font-size:0.72rem', 'font-weight:700', 'letter-spacing:0.14em', 'text-transform:uppercase',
    ]);
    if (t.align === 'center') css += rule(list('.pu-badge'), ['align-self:center']);
  }

  // the results screen
  const s = cfg.results;
  const sd = DEFAULTS.results;
  if (s.note || s.linkLabel) {
    const hidden = (cls) => `${list('#verdict[hidden] ~ ' + cls, '#verdict.verdict-none ~ ' + cls)}{display:none}\n`;
    if (s.note) {
      css += rule(list('.pu-note'), ['margin:0', 'text-align:center', 'font-size:0.9rem', 'line-height:1.5', `color:${mix(ink, background, 0.32)}`]);
      css += hidden('.pu-note');
    }
    if (s.linkLabel && s.linkUrl) {
      css += rule(list('.pu-link'), ['align-self:center', `color:${accent2}`, 'font-weight:600', 'font-size:0.92rem', 'text-decoration:underline', 'text-underline-offset:3px']);
      css += hidden('.pu-link');
    }
  }
  if (s.sizeScale !== sd.sizeScale) css += rule(list('.verdict-size'), [`font-size:${round(3.4 * s.sizeScale)}rem`]);
  if (s.sizeColor === 'accent') css += rule(list('.verdict-size'), [`color:${accent2}`]);
  if (s.verdictStyle === 'solid') css += rule(list('.verdict'), [`background:color-mix(in srgb, ${accent} 16%, ${background})`, 'border-color:transparent', 'box-shadow:none']);
  else if (s.verdictStyle === 'outline') css += rule(list('.verdict'), ['background:transparent', `border:2px solid ${accent}`, 'box-shadow:none']);
  else if (s.verdictStyle === 'minimal') css += rule(list('.verdict'), ['background:transparent', 'border:0', 'box-shadow:none']);

  if (root.length) css += `html.embed{${root.join(';')}}\n`;
  if (body.length) css += `${H}{${body.join(';')}}\n`;
  return css;
}

/* ---------- applying ---------- */

const STYLE_ID = 'popup-theme';

function setText(doc, selector, value) {
  const el = doc.querySelector(selector);
  if (el && el.textContent !== value) el.textContent = value;
}

/** The size label main.js writes into the verdict card; read from here so it can follow the config. */
export function popupText(win = window) {
  return (win.__puText && typeof win.__puText === 'object') ? win.__puText : {};
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Swap the picture on the record card. The stylesheet's own camera is kept and put back. */
function syncIcon(doc, icon) {
  const svg = doc.querySelector('.cam-icon');
  if (!svg) return;
  if (!svg.__puCamera) svg.__puCamera = [...svg.childNodes].map((n) => n.cloneNode(true));
  if (icon === 'camera' || icon === 'none') {
    if (svg.getAttribute('data-icon') !== 'camera') svg.replaceChildren(...svg.__puCamera.map((n) => n.cloneNode(true)));
    svg.setAttribute('data-icon', 'camera');
    return;
  }
  const paths = icon === 'camera' ? null : ICON_PATHS[icon];
  if (!paths || svg.getAttribute('data-icon') === icon) return;
  svg.replaceChildren(...paths.map((d) => {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    return path;
  }));
  svg.setAttribute('data-icon', icon);
}

/** A line of plain text that exists only while the store has written one. */
function syncLine(doc, className, anchor, value, make = 'p') {
  let el = doc.querySelector(`.${className}`);
  if (!value) { if (el) el.remove(); return null; }
  if (!el) {
    el = doc.createElement(make);
    el.className = className;
  }
  if (anchor && el.parentNode !== anchor.parentNode) anchor.parentNode.insertBefore(el, anchor.nextSibling);
  if (el.textContent !== value) el.textContent = value;
  return el;
}

/**
 * Draw the popup the way `rawCfg` says. Safe to call again with a new object: that is
 * how the dashboard's preview updates as a store drags a slider.
 */
export function applyPopupConfig(rawCfg, doc = document) {
  const cfg = normalizePopup(rawCfg);
  const win = doc.defaultView || window;

  let style = doc.getElementById(STYLE_ID);
  if (!style) {
    style = doc.createElement('style');
    style.id = STYLE_ID;
    (doc.head || doc.documentElement).appendChild(style);
  }
  style.textContent = popupCss(cfg);

  setText(doc, '.intro h1', cfg.record.headline);
  setText(doc, '.intro .lead', cfg.record.instruction);
  setText(doc, '.cam-cta', cfg.record.recordLabel);
  setText(doc, '.cam-hint', cfg.record.recordHint);
  setText(doc, '.privacy-line', cfg.record.privacyTitle);
  setText(doc, '.privacy-sub', cfg.record.privacyText);
  const promises = doc.querySelector('.card-foot');
  if (promises) promises.setAttribute('data-off', String(!cfg.record.promises));
  setText(doc, '.result-kicker', cfg.results.kicker);
  setText(doc, '#result-title', cfg.results.title);

  syncIcon(doc, cfg.record.icon);

  // a small badge over the headline
  const intro = doc.querySelector('.intro');
  if (intro) {
    let badge = intro.querySelector('.pu-badge');
    if (!cfg.record.badge) badge?.remove();
    else {
      if (!badge) {
        badge = doc.createElement('span');
        badge.className = 'pu-badge';
        intro.insertBefore(badge, intro.firstChild);
      }
      if (badge.textContent !== cfg.record.badge) badge.textContent = cfg.record.badge;
    }
  }

  // a line, and a link, under the size
  const verdict = doc.getElementById('verdict');
  if (verdict) {
    const note = syncLine(doc, 'pu-note', verdict, cfg.results.note);
    const link = syncLine(doc, 'pu-link', note || verdict, cfg.results.linkUrl && cfg.results.linkLabel ? cfg.results.linkLabel : '', 'a');
    if (link) {
      link.setAttribute('href', cfg.results.linkUrl);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  }

  // "Your size" is written by the scanner each time a result arrives, so it reads the
  // label from here; and if a result is already on screen it is updated now.
  win.__puText = { sizeLabel: cfg.results.sizeLabel };
  const eyebrow = doc.getElementById('verdict-eyebrow');
  if (eyebrow && !doc.getElementById('verdict')?.classList.contains('verdict-none') && eyebrow.textContent) {
    eyebrow.textContent = cfg.results.sizeLabel;
  }

  // The frame the store's page draws around us follows the card's corners, colour and the
  // window settings (how it opens, how it is dimmed behind).
  const { background } = effectiveColours(cfg);
  try {
    win.parent?.postMessage({ source: '3dg', type: 'frame', background, radius: cfg.theme.radius, accent: cfg.theme.accent, window: cfg.window }, '*');
  } catch { /* not in a frame */ }

  return cfg;
}

/**
 * The button's settings as attributes on the store's script tag, and only the ones that
 * differ from the defaults: a store that changes nothing pastes the shortest tag there is.
 * Values are plain text from the store, so they are escaped before they go into a tag.
 */
export function buttonAttributes(raw) {
  const b = normalizePopup(raw).button;
  const d = DEFAULTS.button;
  const out = {};
  if (b.label !== d.label) out['data-label'] = b.label;
  if (b.bg !== d.bg) out['data-color'] = b.bg;
  if (b.textColor !== d.textColor) out['data-text-color'] = b.textColor;
  if (b.radius !== d.radius) out['data-radius'] = String(b.radius);
  if (b.side !== d.side) out['data-side'] = b.side;
  if (!b.float) out['data-float'] = '0';
  if (b.style !== d.style) out['data-style'] = b.style;
  if (b.size !== d.size) out['data-size'] = b.size;
  if (b.weight !== d.weight) out['data-weight'] = String(b.weight);
  if (b.shadow !== d.shadow) out['data-shadow'] = b.shadow;
  if (b.icon !== d.icon) out['data-icon'] = b.icon;
  if (b.iconPos !== d.iconPos) out['data-icon-pos'] = b.iconPos;
  if (b.upper !== d.upper) out['data-upper'] = '1';
  if (b.hover !== d.hover) out['data-hover'] = b.hover;
  if (b.attention !== d.attention) out['data-attention'] = b.attention;
  if (b.edgeX !== d.edgeX) out['data-edge-x'] = String(b.edgeX);
  if (b.edgeY !== d.edgeY) out['data-edge-y'] = String(b.edgeY);
  if (b.font !== d.font) out['data-font'] = b.font;
  if (b.compact !== d.compact) out['data-compact'] = '1';
  if (b.delay !== d.delay) out['data-delay'] = String(b.delay);
  return out;
}

const escapeAttr = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** `data-label="Fit me" data-color="#2563eb"` (with a leading space, or nothing). */
export function buttonAttributeString(raw) {
  return Object.entries(buttonAttributes(raw)).map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
}

/* ---------- the AI's answer -> this popup's settings ---------- */

/** Pick the typeface on offer that the site's own most resembles. */
export function fontFromGuess(guess) {
  const g = String(guess || '').toLowerCase();
  if (/serif|georgia|times|garamond|playfair|merri|lora|didot|bodoni/.test(g) && !/sans/.test(g)) return 'serif';
  if (/helvetica|arial|inter\b|roboto|open sans|lato|montserrat/.test(g)) return 'clean';
  if (/system|segoe|sf pro|apple/.test(g)) return 'system';
  return 'default';
}

/**
 * Same pairing the Look presets use. Clean is a light ground with a dark accent.
 * Plum is a dark ground with a bright accent. The wash only shows when those differ.
 * We force the separation so the radial gradient is always clearly visible.
 */
function fitContrast(_background, _text, accent) {
  const brand = accent || '#f0521f';
  const light = luminance(brand) > 0.42;
  if (light) {
    // Clean style: light ground, dark accent (wash is a visible soft shadow at the top)
    const darkened = mix(brand, '#161616', 0.62);
    const accentFinal = contrast(darkened, '#ffffff') < 4 ? '#161616' : darkened;
    return { background: '#ffffff', text: '#161616', accent: accentFinal };
  }
  // Plum style: dark ground, bright accent (wash is a visible coloured glow at the top)
  const brightened = mix(brand, '#ffffff', 0.38);
  const bg = mix(brand, '#120e12', 0.68);
  const accentFinal = contrast(brightened, bg) < 3.5 ? mix(brand, '#ffffff', 0.55) : brightened;
  return { background: bg, text: '#f4efe6', accent: accentFinal };
}

/** Apply a site's brand the same way a Look preset is applied. */
export function fromAnalysis(c, found) {
  const accent = hex6(found.primaryColor) || hex6(found.accentColor) || hex6(found.backgroundColor);
  const fitted = fitContrast(null, null, accent);
  Object.assign(c.theme, fitted);
  c.button.bg = fitted.accent;
  c.button.textColor = readableOn(fitted.accent);
  if (found.fontFamily) c.theme.font = fontFromGuess(found.fontFamily);
  return c;
}

/* ---------- design codes ---------- */

const DESIGN_PREFIX = 'fms1.';

/** The whole look as one copyable code. */
export function encodeDesign(raw) {
  const cfg = normalizePopup(raw);
  const json = JSON.stringify(cfg);
  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return DESIGN_PREFIX + b64;
}

/** A design code back into a full, safe config. Throws if the code is not ours. */
export function decodeDesign(code) {
  const raw = String(code || '').trim();
  if (!raw.startsWith(DESIGN_PREFIX)) throw new Error('That is not a design code.');
  const b64 = raw.slice(DESIGN_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  let json;
  try { json = decodeURIComponent(escape(atob(pad))); }
  catch { throw new Error('That design code could not be read.'); }
  let parsed;
  try { parsed = JSON.parse(json); }
  catch { throw new Error('That design code could not be read.'); }
  if (!parsed || typeof parsed !== 'object') throw new Error('That design code could not be read.');
  return normalizePopup(parsed);
}

/* ---------- one-click looks ---------- */

/**
 * Whole looks: colours, type, surfaces, the button and the window the popup opens in.
 * Choosing one starts from the defaults, so nothing is left over from the look before it.
 * Only what differs from the defaults needs naming.
 */
export const PRESETS = [
  { name: 'FindMySize', theme: {} },
  { name: 'Midnight', theme: { background: '#10151f', text: '#e8edf7', accent: '#4f8cff', accent2: '#8db4ff' } },
  { name: 'Paper', theme: { background: '#f6efe3', text: '#191411', accent: '#d8431a', accent2: '#e8643c' } },
  { name: 'Forest', theme: { background: '#10201a', text: '#e6f0e8', accent: '#3fbf86', accent2: '#7fe0b4' } },
  { name: 'Plum', theme: { background: '#1d1423', text: '#f1e8f5', accent: '#c26bff', accent2: '#dca4ff' } },
  { name: 'Clean', theme: { background: '#ffffff', text: '#161616', accent: '#161616', accent2: '#4a4a4a', ctaStyle: 'solid' } },
  {
    name: 'Editorial',
    theme: {
      background: '#f4efe6', text: '#1b1a17', accent: '#8c2f1b', accent2: '#b5452c', font: 'editorial', headingStyle: 'italic', radius: 2,
      cardCorners: 'square', surface: 'flat', dropzone: 'solid', align: 'center', density: 'roomy', glow: 0, accentEdge: 'top',
      ctaStyle: 'solid', ctaRadius: 0,
    },
    button: { radius: 0, style: 'flat', upper: true, weight: 600, font: 'editorial', shadow: 'soft' },
    window: { animation: 'fade', overlayColor: '#1b1a17', overlayDim: 55, overlayBlur: 0, borderStyle: 'none', shadow: 'soft' },
  },
  {
    name: 'Noir',
    theme: {
      background: '#0b0b0c', text: '#f3efe6', accent: '#c9a24b', accent2: '#e2c27a', font: 'didone', headingCase: 'upper', headingTracking: 6,
      radius: 0, cardCorners: 'square', surface: 'flat', dropzone: 'solid', align: 'center', glow: 14, accentEdge: 'none',
      ctaStyle: 'outline', ctaRadius: 0, ctaCase: 'upper',
    },
    button: { radius: 0, style: 'flat', upper: true, font: 'didone', shadow: 'none' },
    window: { overlayDim: 85, overlayBlur: 10, borderStyle: 'accent', closeStyle: 'minimal' },
  },
  {
    name: 'Sport',
    theme: {
      background: '#0d0f0c', text: '#f2f5ea', accent: '#c6ff3d', accent2: '#e3ff8f', font: 'clean', headingFont: 'condensed', headingCase: 'upper',
      headingWeight: 800, headingTracking: 2, radius: 10, cardCorners: 'square', pattern: 'grid', patternStrength: 8, glow: 20, glowPos: 'corner',
      dropzone: 'solid', borderWidth: 2, ctaStyle: 'solid', ctaRadius: 4, ctaCase: 'upper',
    },
    button: { radius: 4, style: 'flat', upper: true, weight: 800, font: 'condensed', attention: 'pulse' },
    window: { placement: 'right', animation: 'slide', overlayDim: 60, borderStyle: 'accent', shadow: 'glow' },
  },
  {
    name: 'Soft',
    theme: {
      background: '#fff3ef', background2: '#ffe3ea', text: '#4a2e2e', accent: '#f26b8a', accent2: '#f79db2', bgStyle: 'gradient', gradientAngle: 160,
      font: 'rounded', radius: 36, cardCorners: 'round', surface: 'soft', dropzone: 'dotted', glow: 22, align: 'center', density: 'roomy',
      accentEdge: 'none', ctaStyle: 'solid', ctaRadius: 30,
    },
    button: { radius: 32, style: 'flat', size: 'lg', font: 'rounded', shadow: 'soft', attention: 'bounce' },
    window: { placement: 'bottom', animation: 'slide', overlayColor: '#4a2e2e', overlayDim: 45, overlayBlur: 4, borderStyle: 'none', shadow: 'soft', closeStyle: 'light' },
  },
  {
    name: 'Ocean',
    theme: {
      background: '#06233a', background2: '#0c4a6e', text: '#e6f4ff', accent: '#38bdf8', accent2: '#7dd3fc', bgStyle: 'gradient', gradientAngle: 160,
      glow: 18, font: 'geometric', surface: 'glass', cardCorners: 'soft',
    },
    button: { style: 'gradient', font: 'geometric', shadow: 'glow' },
    window: { overlayColor: '#031321', overlayBlur: 8, borderStyle: 'accent', shadow: 'glow' },
  },
  {
    name: 'Sunset',
    theme: {
      background: '#1a0f1f', background2: '#3a1030', text: '#fff1e8', accent: '#ff7a45', accent2: '#ffb067', bgStyle: 'aurora', glow: 0,
      surface: 'glass', cardCorners: 'round',
    },
    button: { style: 'gradient', shadow: 'glow', attention: 'pulse' },
    window: { overlayColor: '#12060f', overlayDim: 80, overlayBlur: 10, shadow: 'glow' },
  },
  {
    name: 'Mono',
    theme: {
      background: '#ffffff', text: '#0a0a0a', accent: '#0a0a0a', accent2: '#444444', font: 'mono', headingCase: 'upper', headingTracking: 2, radius: 0,
      cardCorners: 'square', borderWidth: 2, glow: 0, pattern: 'dots', patternStrength: 8, accentEdge: 'full', ctaStyle: 'solid', ctaRadius: 0,
    },
    button: { radius: 0, style: 'flat', upper: true, font: 'mono', size: 'sm', shadow: 'none' },
    window: { animation: 'zoom', overlayDim: 80, borderStyle: 'strong', shadow: 'soft' },
  },
  {
    name: 'Linen',
    theme: {
      background: '#efe9df', text: '#2a2620', accent: '#4d6a4a', accent2: '#7b9a77', font: 'humanist', radius: 20, cardCorners: 'soft', surface: 'filled',
      glow: 0, pattern: 'grain', patternStrength: 12, accentEdge: 'none', ctaStyle: 'solid', ctaRadius: 14,
    },
    button: { radius: 14, style: 'flat', font: 'humanist', shadow: 'soft' },
    window: { animation: 'fade', overlayColor: '#2a2620', overlayDim: 55, overlayBlur: 2, borderStyle: 'none', shadow: 'soft' },
  },
  {
    name: 'Slate',
    theme: {
      background: '#1f2937', text: '#f3f4f6', accent: '#f59e0b', accent2: '#fbbf24', font: 'system', radius: 16, pattern: 'dots', patternStrength: 8,
      glow: 14, ctaStyle: 'solid', ctaRadius: 10,
    },
    button: { radius: 10, style: 'flat', font: 'system' },
    window: { animation: 'zoom' },
  },
];

/** Start a config from a look: its colours and type, and the button's and window's style. What the store wrote stays. */
export function applyPreset(cfg, preset) {
  const keep = ['label', 'side', 'float', 'edgeX', 'edgeY', 'delay', 'compact', 'icon', 'iconPos'];
  const kept = Object.fromEntries(keep.map((k) => [k, cfg.button[k]]));
  cfg.theme = { ...DEFAULTS.theme, ...preset.theme };
  const accent = cfg.theme.accent;
  cfg.button = { ...DEFAULTS.button, bg: accent, textColor: readableOn(accent), ...preset.button, ...kept };
  cfg.window = { ...DEFAULTS.window, ...preset.window };
  return cfg;
}
