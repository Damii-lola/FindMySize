import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, missingConfig } from './config.js';
import { HttpError } from './lib/errors.js';
import { supabaseConfigured } from './lib/supabase.js';
import { bodyScan } from './routes/body-scan.js';
import { authRoutes } from './routes/auth.js';
import { payRoutes, meRoutes, usageRoutes, chartRoutes } from './routes/account.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, '../../web/dist');

const app = express();
app.set('trust proxy', 1);
app.set('strict routing', true);
app.disable('x-powered-by');

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));
const pagesOrigin = 'https://damii-lola.github.io';
app.use(cors({
  origin(origin, cb) {
    if (!origin || config.corsOrigins.includes('*') || config.corsOrigins.includes(origin) || origin === pagesOrigin) return cb(null, true);
    cb(new HttpError(403, `Origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Device-Id', 'X-Selar-Secret', 'X-Webhook-Secret'],
  maxAge: 86400,
}));
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'findmysize',
    supabase: supabaseConfigured(),
    selar: Boolean(config.selarCheckoutUrl),
    missing: missingConfig(),
  });
});

app.get('/api/public-config', (_req, res) => {
  res.json({
    selarCheckoutUrl: config.selarCheckoutUrl || '',
    supabase: supabaseConfigured(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/pay', payRoutes);
app.post('/api/webhooks/selar', (req, res, next) => {
  req.url = '/webhook';
  payRoutes(req, res, next);
});
app.use('/api/me', meRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/charts', chartRoutes);
app.use('/api/body-scan', bodyScan);

for (const page of ['size', 'dashboard', 'settings', 'auth', 'register', 'registered']) {
  app.get(`/${page}`, (_req, res) => res.redirect(301, `/${page}/`));
}
app.get('/login', (_req, res) => res.redirect(301, '/auth/'));
// Home is the size page
app.get('/', (_req, res) => res.redirect(302, '/size/'));
app.get('/register', (_req, res) => res.redirect(301, '/register/'));
app.get('/registered', (_req, res) => res.redirect(301, '/registered/'));
app.get('/pay', (_req, res) => res.redirect(301, '/register/'));
app.get('/paid', (_req, res) => res.redirect(301, '/registered/'));

app.use(express.static(webRoot, { extensions: ['html'] }));
app.get('/', (_req, res) => res.sendFile(join(webRoot, 'index.html')));

app.use((_req, _res, next) => next(new HttpError(404, 'Not found')));

app.use((err, req, res, _next) => {
  let status = err.status || 500;
  let message = err.message || 'Internal error';
  if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large. Trim the clip and try again.' : err.message;
  }
  if (status >= 500) console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  const hide = status >= 500 && config.env === 'production' && !err.expose;
  res.status(status).json({ error: hide ? 'Internal error' : message });
});

const server = app.listen(config.port, '0.0.0.0', () => {
  const missing = missingConfig();
  console.log(`FindMySize listening on :${config.port}`);
  if (missing.length) console.warn(`missing env: ${missing.join(', ')}`);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8000).unref();
  });
}
