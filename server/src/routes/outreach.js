import nodemailer from 'nodemailer';
import { Router } from 'express';
import { HttpError, ah } from '../lib/errors.js';
import { config } from '../config.js';
import { adminFromReq } from './auth.js';

export const outreachRoutes = Router();

const SUBJECT_TEMPLATE = `Thanks For Helping Me {Name}`;

const BODY_TEMPLATE = `Hey {Name},

I absolutely love {Brand Name}, my gf more than me(lol). She was soo happy when I ordered clothes for her on her birthday. Thank you for helping me make her happy😂

I want to return the favor. I built an AI Size Guesser System, which allows shoppers to accurately guess their size, enabling them to pick the clothing that best fits them (Tbh that's what my gf used to pick the right size for her). And I want to integrate it into your brand.

As of right now, I've integrated this system/work with ~20 other different clothing brands (collectively $18,750/month in revenue), which has successfully helped them recover ~$6050/month of their revenue that was before going into clothing returns. Enabling them to invest more in building their brand.

I really want to return the favor. I'm confident that integrating this system will save you a tremendous amount of money and energy that's already being wasted on returns. Solving this problem could greatly increase revenue and your gross margin

Interested? All i need to help set this up for your clothing brand is a ~15mins call, which could be between today and tomorrow noon (Can send you a Google Meet link)

Thanks,
Damilola`;

function fillTemplate(template, { firstName, companyName }) {
  return template
    .replace(/\{Name\}/g, firstName)
    .replace(/\{Brand Name\}/g, companyName);
}

function makeTransporter() {
  const { email, pass } = config.sender;
  if (!email || !pass) throw new HttpError(503, 'SENDER_GMAIL and SENDER_GMAIL_APP_PASSWORD are not configured on Render');
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: email, pass },
  });
}

// POST /api/outreach/send
// Body: { contacts: [{ firstName, email, companyName }] }  — max 20
outreachRoutes.post('/send', ah(async (req, res) => {
  if (!adminFromReq(req)) throw new HttpError(401, 'Log in first');

  const contacts = Array.isArray(req.body?.contacts) ? req.body.contacts : [];
  if (!contacts.length) throw new HttpError(400, 'No contacts provided');
  if (contacts.length > 20) throw new HttpError(400, 'Maximum 20 emails per batch');

  const transporter = makeTransporter();
  const from = `Damilola <${config.sender.email}>`;

  const results = [];
  for (const c of contacts) {
    const firstName = String(c.firstName || '').trim();
    const email = String(c.email || '').trim().toLowerCase();
    const companyName = String(c.companyName || '').trim();

    if (!email || !email.includes('@')) {
      results.push({ email, ok: false, error: 'Invalid email' });
      continue;
    }
    if (!firstName) {
      results.push({ email, ok: false, error: 'Missing first name' });
      continue;
    }

    const subject = fillTemplate(SUBJECT_TEMPLATE, { firstName, companyName });
    const text = fillTemplate(BODY_TEMPLATE, { firstName, companyName });

    try {
      await transporter.sendMail({ from, to: email, subject, text });
      console.log(`[outreach] sent to ${email} (${companyName})`);
      results.push({ email, ok: true });
    } catch (err) {
      console.error(`[outreach] failed for ${email}:`, err.message);
      results.push({ email, ok: false, error: err.message });
    }
  }

  const sent = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  res.json({ ok: true, sent, failed, results });
}));

// GET /api/outreach/template — preview the template
outreachRoutes.get('/template', ah(async (req, res) => {
  if (!adminFromReq(req)) throw new HttpError(401, 'Log in first');
  res.json({
    subject: SUBJECT_TEMPLATE,
    body: BODY_TEMPLATE,
    senderConfigured: Boolean(config.sender.email && config.sender.pass),
    senderEmail: config.sender.email || null,
  });
}));
