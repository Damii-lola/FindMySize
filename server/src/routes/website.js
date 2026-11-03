import { Router } from 'express';
import { HttpError, ah } from '../lib/errors.js';

export const websiteRoutes = Router();

const hex = (v) => {
  const m = String(v || '').match(/#([0-9a-fA-F]{3,8})/);
  return m ? `#${m[1]}` : null;
};

/** Read a store's homepage and pull colours the popup can copy. */
websiteRoutes.post('/analyze', ah(async (req, res) => {
  const url = String(req.body?.url || '').trim();
  if (!/^https?:\/\//i.test(url)) throw new HttpError(400, 'Enter a full address, starting with https://');

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  let html = '';
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: { 'User-Agent': 'FindMySize/1.0' },
      redirect: 'follow',
    });
    if (!r.ok) throw new HttpError(400, `That site answered ${r.status}`);
    html = await r.text();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, 'Could not open that site. Check the address and try again.');
  } finally {
    clearTimeout(timer);
  }

  const theme = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)/i)?.[1]
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i)?.[1];
  const bg = html.match(/background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8})/i)?.[1];
  const color = html.match(/(?:^|[;{\s])color\s*:\s*(#[0-9a-fA-F]{3,8})/i)?.[1];
  const font = html.match(/font-family\s*:\s*([^;}{]+)/i)?.[1]?.split(',')[0]?.replace(/['"]/g, '').trim();

  res.json({
    primaryColor: hex(theme) || hex(color) || '#f0521f',
    accentColor: hex(theme) || '#f0521f',
    backgroundColor: hex(bg) || '#f5e9d6',
    textColor: hex(color) || '#191411',
    fontFamily: font || '',
    borderRadius: 1,
  });
}));
