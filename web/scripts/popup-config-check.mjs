/**
 * The popup's settings: what is accepted, what is refused, and what a default popup
 * costs (nothing). Run with `npm run check`.
 */
import assert from 'node:assert/strict';
import { applyPopupConfig, applyPreset, decodeDesign, encodeDesign, CHOICES, PRESETS, safeUrl, buttonAttributes, buttonAttributeString, contrast, DEFAULTS, effectiveColours, fontFromGuess, fromAnalysis, hex6, isDefault, normalizePopup, popupCss, readableOn } from '../src/popup-config.js';

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log('ok -', name); };

test('nothing chosen is the default popup, and costs no CSS at all', () => {
  assert.deepEqual(normalizePopup(undefined), normalizePopup({}));
  assert.deepEqual(normalizePopup(null), normalizePopup('junk'));
  assert.equal(popupCss({}), '');
  assert.equal(isDefault({}), true);
  assert.equal(isDefault({ v: 2, theme: { accent: '#2563eb' } }), false);
});

test('colours must be hex; anything else falls back instead of reaching the page', () => {
  assert.equal(hex6('#ABC'), '#aabbcc');
  assert.equal(hex6(' #F0521F '), '#f0521f');
  for (const bad of ['red', 'rgb(1,2,3)', 'url(x)', '#12', '#gggggg', '#ff0000;}body{display:none', 42, null, undefined]) assert.equal(hex6(bad), null, String(bad));
  const cfg = normalizePopup({ v: 2, theme: { accent: 'url(javascript:alert(1))', background: '#00000;}', text: 'red' } });
  assert.equal(cfg.theme.accent, DEFAULTS.theme.accent);
  assert.equal(cfg.theme.background, DEFAULTS.theme.background);
  assert.equal(cfg.theme.text, DEFAULTS.theme.text);
});

test('the CSS that comes out can never contain what a store typed', () => {
  const css = popupCss({ v: 2, theme: { accent: '#2563eb', font: 'comic sans; } body { display:none', radius: 99999, scale: -5 }, record: { headline: '</style><script>x</script>' } });
  assert.ok(!/script|<|display:none|comic/i.test(css), css);
  assert.match(css, /--pu-accent:#2563eb/);
  assert.match(css, /--pu-radius:40px/);               // clamped
  assert.match(css, /--pu-scale:0\.85/);               // clamped
});

test('numbers are clamped, text is capped, an empty text means the default', () => {
  const cfg = normalizePopup({ v: 2, theme: { radius: -3, scale: 9 }, button: { radius: 500 }, record: { headline: 'x'.repeat(500), instruction: '   ', recordLabel: 42 } });
  assert.equal(cfg.theme.radius, 0);
  assert.equal(cfg.theme.scale, 1.25);
  assert.equal(cfg.button.radius, 32);
  assert.equal(cfg.record.headline.length, 60);
  assert.equal(cfg.record.instruction, DEFAULTS.record.instruction);
  assert.equal(cfg.record.recordLabel, DEFAULTS.record.recordLabel);
});

test('text that cannot be read on the background is corrected, and the CSS uses the corrected text', () => {
  const cfg = normalizePopup({ v: 2, theme: { background: '#f6efe3', text: '#f5e9d6' } });
  const eff = effectiveColours(cfg);
  assert.equal(eff.corrected, true);
  assert.ok(contrast(eff.text, eff.background) >= 4.5);
  assert.match(popupCss(cfg), new RegExp(`--pu-text:${eff.text}`));
  assert.equal(effectiveColours(normalizePopup({})).corrected, false);
});

test('a light background turns the inner glass dark and tells the browser', () => {
  const css = popupCss({ v: 2, theme: { background: '#ffffff', text: '#191411' } });
  assert.match(css, /color-scheme:light/);
  assert.match(css, /--glass:25 20 17/);
  assert.match(popupCss({ v: 2, theme: { background: '#101010' } }), /color-scheme:dark/);
});

test('readableOn picks the ink that contrasts', () => {
  assert.equal(readableOn('#ffffff'), '#191411');
  assert.equal(readableOn('#101010'), '#ffffff');
  assert.equal(readableOn('#f0521f'), '#191411');
});

test('the old (v1) settings never reached a popup, so only the button carries over', () => {
  const old = { global: { primaryColor: '#123456', backgroundColor: '#000000' }, phase1: { headline: { text: 'Find your size' } }, fabButton: { label: 'Fit me', bg: '#2563eb', radius: 1, float: false } };
  const cfg = normalizePopup(old);
  assert.equal(cfg.theme.accent, DEFAULTS.theme.accent);
  assert.equal(cfg.record.headline, DEFAULTS.record.headline);
  assert.equal(cfg.button.label, 'Fit me');
  assert.equal(cfg.button.bg, '#2563eb');
  assert.equal(cfg.button.radius, 16);                  // 1rem -> 16px
  assert.equal(cfg.button.float, false);
});

test('applying writes the style and the words, as text, and tells the frame', () => {
  const calls = [];
  const els = {
    '.intro h1': { textContent: '' }, '.intro .lead': { textContent: '' }, '.cam-cta': { textContent: '' }, '.cam-hint': { textContent: '' },
    '.card-foot': { setAttribute: (k, v) => calls.push([k, v]) }, '.result-kicker': { textContent: '' }, '#result-title': { textContent: '' },
  };
  const style = { id: '', textContent: '' };
  const doc = {
    defaultView: { parent: { postMessage: (m) => calls.push(['frame', m]) } },
    head: { appendChild: () => {} },
    getElementById: (id) => (id === 'popup-theme' ? style : null),
    createElement: () => style,
    querySelector: (sel) => els[sel] || null,
  };
  applyPopupConfig({ v: 2, theme: { accent: '#2563eb', radius: 12 }, record: { headline: '<b>Hi</b>', promises: false } }, doc);
  assert.match(style.textContent, /--pu-accent:#2563eb/);
  assert.equal(els['.intro h1'].textContent, '<b>Hi</b>');           // text, never markup
  assert.deepEqual(calls.find((c) => c[0] === 'data-off'), ['data-off', 'true']);
  const frame = calls.find((c) => c[0] === 'frame')[1];
  assert.equal(frame.type, 'frame');
  assert.equal(frame.radius, 12);
  assert.equal(doc.defaultView.__puText.sizeLabel, 'Your size');
});

test('the snippet carries only what differs, and escapes what a store typed', () => {
  assert.equal(buttonAttributeString({}), '');
  assert.deepEqual(buttonAttributes({ v: 2, button: { label: 'Fit me', bg: '#2563eb', side: 'left', float: false, radius: 20 } }),
    { 'data-label': 'Fit me', 'data-color': '#2563eb', 'data-radius': '20', 'data-side': 'left', 'data-float': '0' });
  const tag = buttonAttributeString({ v: 2, button: { label: 'Say "hi" <b>&' } });
  assert.equal(tag, ' data-label="Say &quot;hi&quot; &lt;b&gt;&amp;"');
  assert.ok(!/"\s*<|<b>/.test(tag));
});

test('the AI answer becomes settings, and unusable parts are left alone', () => {
  const c = normalizePopup({});
  fromAnalysis(c, { primaryColor: '#2563eb', backgroundColor: '#ffffff', fontFamily: 'Georgia, serif' });
  assert.ok(hex6(c.theme.accent) && contrast(c.theme.accent, c.theme.background) >= 3.5);   // fitted so it can be read
  assert.equal(c.theme.font, 'serif');
  assert.equal(c.button.bg, c.theme.accent);
  assert.equal(c.button.textColor, readableOn(c.theme.accent));
  const d = normalizePopup({});
  fromAnalysis(d, { primaryColor: 'blue', backgroundColor: 'url(x)', borderRadius: 'big' });
  assert.ok(hex6(d.theme.accent) && hex6(d.theme.background));   // junk in, a valid colour out
  assert.equal(fontFromGuess('Inter, sans-serif'), 'clean');
  assert.equal(fontFromGuess('Playfair Display'), 'serif');
  assert.equal(fontFromGuess('Comic Neue'), 'default');
});

/* ---------- the options added later ---------- */

const EVERYTHING = {
  v: 2,
  theme: { bgStyle: 'aurora', gradientAngle: 90, glow: 40, glowPos: 'corner', pattern: 'grain', patternStrength: 20, font: 'editorial', headingFont: 'didone',
    headingWeight: 700, headingStyle: 'italic', headingCase: 'upper', headingTracking: 8, headingSize: 1.2, align: 'center', density: 'roomy', surface: 'glass',
    borderWidth: 2, dropzone: 'dotted', cardCorners: 'round', cardShadow: 'lifted', accentEdge: 'full', ctaStyle: 'outline', ctaRadius: 4, ctaCase: 'upper', motion: 'off' },
  button: { style: 'gradient', size: 'lg', weight: 800, shadow: 'glow', icon: 'ruler', iconPos: 'right', upper: true, hover: 'lift', attention: 'pulse', edgeX: 30, edgeY: 40, font: 'didone', compact: true, delay: 5 },
  record: { badge: 'Aso Oke', icon: 'tshirt', iconSize: 100, privacy: false, privacyTitle: 'Private', privacyText: 'Stays on your phone.', showInstruction: false },
  results: { note: 'Free exchanges', linkLabel: 'Size guide', linkUrl: 'https://example.com/guide', sizeScale: 1.3, sizeColor: 'accent', verdictStyle: 'outline' },
  window: { placement: 'right', width: 'wide', animation: 'zoom', overlayColor: '#112233', overlayDim: 50, overlayBlur: 12, borderStyle: 'accent', shadow: 'glow', closeStyle: 'light', closeOutside: false },
};

test('a design saved before the new options existed is unchanged: same CSS, same snippet', () => {
  const old = { v: 2, theme: { background: '#10151f', text: '#e8edf7', accent: '#4f8cff', radius: 20, font: 'serif' }, button: { label: 'Fit me', bg: '#4f8cff' }, record: { headline: 'Hi' } };
  const cfg = normalizePopup(old);
  assert.equal(cfg.theme.glow, 28);
  assert.equal(cfg.window.placement, 'center');
  assert.ok(!/background:/.test(popupCss(old).split('\n').filter((l) => l.includes('.stage')).join('')));   // the old way: variables only
  assert.equal(buttonAttributeString(old), ' data-label="Fit me" data-color="#4f8cff"');
});

test('every new option survives a round trip, and a design code carries all of them', () => {
  const cfg = normalizePopup(EVERYTHING);
  for (const [group, values] of Object.entries(EVERYTHING)) {
    if (group === 'v') continue;
    for (const [k, v] of Object.entries(values)) assert.deepEqual(cfg[group][k], v, `${group}.${k}`);
  }
  assert.deepEqual(decodeDesign(encodeDesign(EVERYTHING)), cfg);
});

test('anything not on a list, or out of range, falls back or is clamped', () => {
  const junk = normalizePopup({ v: 2,
    theme: { bgStyle: 'url(x)', pattern: '}body{', surface: 7, glow: 999, headingWeight: 12345, headingSize: -1, headingFont: 'comic', borderWidth: 99, motion: {} },
    button: { style: '</style>', size: 'huge', weight: 5, edgeX: 9999, delay: -3, icon: 'evil.svg', font: 'x;y' },
    record: { icon: '../x', iconSize: 1, badge: 'y'.repeat(200) }, results: { sizeScale: 50, verdictStyle: null },
    window: { placement: 'top', overlayDim: 500, overlayColor: 'red', overlayBlur: 'lots', shadow: 'x' } });
  const D = DEFAULTS;
  assert.equal(junk.theme.bgStyle, D.theme.bgStyle);
  assert.equal(junk.theme.pattern, 'none');
  assert.equal(junk.theme.glow, 60);
  assert.equal(junk.theme.headingWeight, 800);
  assert.equal(junk.theme.headingSize, 0.8);
  assert.equal(junk.theme.headingFont, 'auto');
  assert.equal(junk.theme.borderWidth, 3);
  assert.equal(junk.button.size, 'md');
  assert.equal(junk.button.weight, 500);
  assert.equal(junk.button.edgeX, 72);
  assert.equal(junk.button.delay, 0);
  assert.equal(junk.button.icon, 'camera');
  assert.equal(junk.record.icon, 'camera');
  assert.equal(junk.record.iconSize, 48);
  assert.equal(junk.record.badge.length, 28);
  assert.equal(junk.results.sizeScale, 1.6);
  assert.equal(junk.window.placement, 'center');
  assert.equal(junk.window.overlayDim, 95);
  assert.equal(junk.window.overlayColor, D.window.overlayColor);
});

test('links must be https; nothing else can be a link in the popup', () => {
  assert.equal(safeUrl('https://shop.example.com/size guide'), 'https://shop.example.com/size%20guide');
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'http://example.com', '//example.com', 'example.com', '', 5, null, 'https://']) assert.equal(safeUrl(bad), '', String(bad));
  assert.equal(normalizePopup({ v: 2, results: { linkUrl: 'javascript:alert(1)', linkLabel: 'x' } }).results.linkUrl, '');
});

test('the CSS for every option is made only of lists, numbers and hex colours', () => {
  const css = popupCss(EVERYTHING);
  assert.ok(css.length > 1500);
  const scannable = css.replace(/url\("data:image\/svg\+xml,[^"]*"\)/g, '');   // our own grain tile
  assert.ok(!/<|javascript|expression|@import|\burl\(/i.test(scannable), scannable);
  // no braces or semicolons smuggled into a value: every rule is selector{decl;decl}
  for (const line of css.split('\n').filter(Boolean)) assert.equal((line.match(/\{/g) || []).length, (line.match(/\}/g) || []).length, line);
  // a valid colour must not be able to carry a second declaration
  const sneaky = popupCss({ v: 2, theme: { accent: '#fff;background:red', background: '#000};body{x:y', overlayColor: 'x' }, window: { overlayColor: '#fff;x:y' } });
  assert.ok(!/red|x:y/.test(sneaky), sneaky);
});

test('the new options each write what they say, and the old default writes none of it', () => {
  assert.equal(popupCss({}), '');
  assert.match(popupCss({ v: 2, theme: { align: 'center' } }), /text-align:center/);
  assert.match(popupCss({ v: 2, theme: { headingCase: 'upper', headingStyle: 'italic', headingWeight: 700 } }), /text-transform:uppercase;font-style:italic|font-weight:700/);
  assert.match(popupCss({ v: 2, theme: { pattern: 'grid' } }), /linear-gradient/);
  assert.match(popupCss({ v: 2, theme: { pattern: 'grain' } }), /data:image\/svg\+xml/);
  assert.match(popupCss({ v: 2, theme: { glow: 0 } }), /\.stage\{background:#221a15\}/);
  assert.match(popupCss({ v: 2, theme: { bgStyle: 'gradient', gradientAngle: 200 } }), /linear-gradient\(200deg/);
  assert.match(popupCss({ v: 2, theme: { motion: 'off' } }), /animation:none !important/);
  assert.match(popupCss({ v: 2, record: { privacy: false } }), /\.privacy\{display:none\}/);
  assert.match(popupCss({ v: 2, results: { sizeScale: 1.5 } }), /\.verdict-size\{font-size:5\.1rem\}/);
  assert.match(popupCss({ v: 2, record: { badge: 'New' } }), /\.pu-badge/);
  assert.ok(!/pu-badge/.test(popupCss({ v: 2, theme: { align: 'center' } })));
  assert.match(popupCss({ v: 2, theme: { accent: '#ffd400' } }), /\.btn-primary\{color:#191411\}/);   // dark ink on a light accent
});

test('every look is readable, and every list holds what the defaults use', () => {
  for (const preset of PRESETS) {
    const cfg = applyPreset(normalizePopup({}), preset);
    const full = normalizePopup(cfg);
    assert.deepEqual(full.theme.accent, cfg.theme.accent, preset.name);          // nothing in a look is refused
    assert.deepEqual(normalizePopup({ v: 2, ...cfg }).theme, full.theme, preset.name);
    assert.ok(contrast(cfg.theme.text, cfg.theme.background) >= 4.5, `${preset.name} text`);
    assert.ok(contrast(cfg.theme.accent, cfg.theme.background) >= 2.2 || cfg.theme.ctaStyle === 'solid', `${preset.name} accent`);
    assert.ok(contrast(cfg.button.textColor, cfg.button.bg) >= 3, `${preset.name} button`);
    assert.ok(popupCss(cfg) !== undefined);
  }
  const keyFor = { bgStyle: ['theme', 'bgStyle'], glowPos: ['theme', 'glowPos'], pattern: ['theme', 'pattern'], surface: ['theme', 'surface'], placement: ['window', 'placement'], animation: ['window', 'animation'], shadow: ['window', 'shadow'], borderStyle: ['window', 'borderStyle'], closeStyle: ['window', 'closeStyle'], buttonStyle: ['button', 'style'] };
  for (const [list, [group, key]] of Object.entries(keyFor)) assert.ok(CHOICES[list].some(([v]) => v === DEFAULTS[group][key]), `${list} lacks its default`);
});

test('applying a look keeps what the store wrote and drops what the last look added', () => {
  const cfg = normalizePopup({ v: 2, button: { label: 'Fit me', side: 'left', icon: 'ruler' } });
  applyPreset(cfg, PRESETS.find((p) => p.name === 'Editorial'));
  assert.equal(cfg.button.label, 'Fit me');
  assert.equal(cfg.button.side, 'left');
  assert.equal(cfg.button.icon, 'ruler');
  assert.equal(cfg.button.upper, true);
  assert.equal(cfg.theme.headingStyle, 'italic');
  applyPreset(cfg, PRESETS.find((p) => p.name === 'Midnight'));
  assert.equal(cfg.theme.headingStyle, 'normal');
  assert.equal(cfg.button.upper, false);
  assert.equal(cfg.window.animation, 'rise');
});

test('the snippet carries each new button setting, and only those that differ', () => {
  const attrs = buttonAttributes(EVERYTHING);
  for (const k of ['data-style', 'data-size', 'data-weight', 'data-shadow', 'data-icon', 'data-icon-pos', 'data-upper', 'data-hover', 'data-attention', 'data-edge-x', 'data-edge-y', 'data-font', 'data-compact', 'data-delay']) assert.ok(k in attrs, k);
  assert.deepEqual(buttonAttributes({ v: 2, button: { size: 'md', icon: 'camera', weight: 650 } }), {});
});

console.log(`\n${passed} passed`);
