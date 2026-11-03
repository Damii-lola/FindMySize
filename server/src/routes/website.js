import { Router } from 'express';
import { HttpError, ah } from '../lib/errors.js';

export const websiteRoutes = Router();

const HEX = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;

function toHex(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h.toLowerCase()}`;
}

function rgbToHex(r, g, b) {
  const n = (v) => Math.max(0, Math.min(255, Number(v) | 0));
  return `#${[n(r), n(g), n(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function parseColor(raw) {
  const hex = toHex(raw);
  if (hex) return hex;
  const rgb = String(raw || '').match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  return rgb ? rgbToHex(rgb[1], rgb[2], rgb[3]) : null;
}

function hsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

function isGeneric(hex) {
  const { s, l } = hsl(hex);
  return s < 0.08 || l > 0.96 || l < 0.04;
}

function collect(text, bag) {
  if (!text) return;
  for (const m of text.matchAll(HEX)) {
    const hex = toHex(`#${m[1]}`);
    if (hex) bag.set(hex, (bag.get(hex) || 0) + 1);
  }
  for (const m of text.matchAll(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/gi)) {
    const hex = rgbToHex(m[1], m[2], m[3]);
    bag.set(hex, (bag.get(hex) || 0) + 1);
  }
}

function named(html, key) {
  const re = new RegExp(`--${key}[^:]*:\\s*([^;}{]+)`, 'i');
  const hit = html.match(re)?.[1];
  return hit ? parseColor(hit) : null;
}

async function readPage(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FindMySize/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!r.ok) throw new HttpError(400, `That site answered ${r.status}`);
    const type = r.headers.get('content-type') || '';
    if (!/html|xml|text/i.test(type) && type) throw new HttpError(400, 'That address is not a web page');
    return await r.text();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, 'Could not open that site. Check the address and try again.');
  } finally {
    clearTimeout(timer);
  }
}

/** Read a store's homepage and pull colours the popup can copy. */
websiteRoutes.get('/analyze', (_req, res) => {
  res.json({ ok: true, method: 'POST', hint: 'Send a POST with { url: "https://your-store.com" }.' });
});

websiteRoutes.post('/analyze', ah(async (req, res) => {
  const url = String(req.body?.url || '').trim();
  if (!/^https?:\/\//i.test(url)) throw new HttpError(400, 'Enter a full address, starting with https://');

  const html = await readPage(url);
  const bag = new Map();
  collect(html, bag);

  const sheets = [...html.matchAll(/<link[^>]+rel=["'][^"']*stylesheet[^"']*["'][^>]*>/gi)]
    .map((m) => m[0].match(/href=["']([^"']+)/i)?.[1])
    .filter(Boolean)
    .slice(0, 2);
  for (const href of sheets) {
    try {
      const abs = new URL(href, url).href;
      if (!/^https?:/i.test(abs)) continue;
      const css = await readPage(abs);
      collect(css, bag);
    } catch { /* a blocked stylesheet is not a failure */ }
  }

  const ranked = [...bag.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
  const brand = ranked.find((h) => !isGeneric(h));
  const light = ranked.find((h) => hsl(h).l > 0.85);
  const dark = ranked.find((h) => hsl(h).l < 0.25);
  const accent = named(html, 'primary|brand|accent') || brand || ranked[0];
  const background = named(html, 'background|bg|surface') || light || '#f7f4ef';
  const text = named(html, 'text|foreground|ink') || dark || '#191411';

  if (!accent && !brand) throw new HttpError(400, 'Could not read colours from that site. Set them by hand.');

  const font = html.match(/font-family\s*:\s*([^;}{]+)/i)?.[1]?.split(',')[0]?.replace(/['"]/g, '').trim() || '';

  res.json({
    primaryColor: accent || brand,
    accentColor: brand || accent,
    backgroundColor: background,
    textColor: text,
    fontFamily: font,
    borderRadius: 1,
  });
}));
