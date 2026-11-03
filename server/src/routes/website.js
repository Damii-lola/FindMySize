import { Router } from 'express';
import { HttpError, ah } from '../lib/errors.js';

export const websiteRoutes = Router();

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
  return s < 0.06 || l > 0.97 || l < 0.03;
}

function collect(text, bag) {
  if (!text) return;
  for (const m of text.matchAll(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g)) {
    const hex = toHex(`#${m[1]}`);
    if (hex) bag.set(hex, (bag.get(hex) || 0) + 1);
  }
  for (const m of text.matchAll(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/gi)) {
    const hex = rgbToHex(m[1], m[2], m[3]);
    bag.set(hex, (bag.get(hex) || 0) + 1);
  }
}

function named(html, key) {
  const re = new RegExp(`--(?:${key})[^:]*:\\s*([^;}{]+)`, 'i');
  const hit = html.match(re)?.[1];
  return hit ? parseColor(hit) : null;
}

async function read(url, accept = 'text/html') {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: accept,
      },
    });
    if (!r.ok) return '';
    return await r.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

websiteRoutes.get('/analyze', (_req, res) => {
  res.json({ ok: true, method: 'POST', hint: 'Send a POST with { url: "https://your-store.com" }.' });
});

websiteRoutes.post('/analyze', ah(async (req, res) => {
  let url = String(req.body?.url || '').trim();
  if (!url) throw new HttpError(400, 'Enter your homepage address.');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  const html = await read(url);
  if (!html) throw new HttpError(400, 'Could not open that site. Check the address and try again.');

  const bag = new Map();
  collect(html, bag);

  const sheets = [...html.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]*>/gi)]
    .filter((m) => /stylesheet|\.css/i.test(m[0]))
    .map((m) => m[1])
    .slice(0, 3);
  for (const href of sheets) {
    try {
      const abs = new URL(href, url).href;
      if (/^https?:/i.test(abs)) collect(await read(abs, 'text/css'), bag);
    } catch { /* ignore a blocked sheet */ }
  }

  const ranked = [...bag.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
  const brand = ranked.find((h) => !isGeneric(h)) || ranked[0];
  const light = ranked.find((h) => hsl(h).l > 0.82) || '#f7f4ef';
  const dark = ranked.find((h) => hsl(h).l < 0.28) || '#191411';
  const theme = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)/i)?.[1]
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i)?.[1];
  const accent = parseColor(theme) || named(html, 'primary|brand|accent') || brand;
  const background = named(html, 'background|bg|surface') || light;
  const text = named(html, 'text|foreground|ink') || dark;
  const font = html.match(/font-family\s*:\s*([^;}{]+)/i)?.[1]?.split(',')[0]?.replace(/['"]/g, '').trim() || '';

  if (!accent) throw new HttpError(400, 'Could not read colours from that site. Set them by hand.');

  res.json({
    primaryColor: accent,
    accentColor: brand || accent,
    backgroundColor: background,
    textColor: text,
    fontFamily: font,
    borderRadius: 1,
  });
}));
