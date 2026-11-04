import { Router } from 'express';
import { ah, HttpError } from '../lib/errors.js';
import { runModel, cloudflareConfigured } from '../lib/cloudflare.js';

export const chatRoutes = Router();

const MODEL = '@cf/meta/llama-3.1-8b-instruct';

const SYSTEM = `You are the FindMySize help assistant on the FindMySize website.
Answer only about FindMySize. Be brief, clear, and practical. Under 90 words.

What FindMySize is:
- Clothing brands add a size chart in the dashboard.
- They paste one embed snippet on a product page. A "Find My Size" button appears.
- A shopper records a short 360° video on their phone. The tool reads body measurements and recommends a size from that chart.
- The video is deleted after measuring. Nothing is stored. No app to install. No shopper account.

Free on a device (no account):
- 1 size chart
- 3 scans on the Size page
- 5 popup uses on that chart
- These limits reset per device (a new phone or browser starts fresh).

Paid:
- One price per store for unlimited charts, unlimited scans, and unlimited popup uses.
- Register, confirm email, pay on Selar, then log in with the email code and the activation code from payment.

How to use it:
1. Dashboard: type the garment name, sizes, and measurements (Chest/Bust decides the size). Save and get the link.
2. Copy the popup code and paste it on the product page.
3. Preview & Customise Popup: colours, type, button, and the words on each screen. Design codes copy a whole look to another chart.
4. Shopper opens the button, records a slow turn, sees measurements and a recommended size.

Site pages: Home, Sizing (/size/), Dashboard, Pricing, Register, Login (/auth/).
If you do not know something, say so and point them to the dashboard or pricing page.`;

chatRoutes.post('/', ah(async (req, res) => {
  if (!cloudflareConfigured()) throw new HttpError(503, 'AI chat is not configured.');
  const question = String(req.body?.question || '').trim().slice(0, 500);
  if (!question) throw new HttpError(400, 'Ask a question first.');
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-6) : [];
  const messages = [
    { role: 'system', content: SYSTEM },
    ...history
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content.slice(0, 500) })),
    { role: 'user', content: question },
  ];
  const result = await runModel(MODEL, { messages }, { timeoutMs: 25_000 });
  const reply = String(result?.response || result?.result?.response || '').trim();
  if (!reply) throw new HttpError(502, 'The AI did not answer.');
  res.json({ reply });
}));
