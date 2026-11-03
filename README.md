# FindMySize

Personal size recommendation tool. Brands get set up by you; they activate via Selar and use the dashboard.

## Structure
- `/` — size scanner (home)
- `/dashboard/` — size charts
- `/settings/` — under user icon when logged in
- `/pay/` — signup + OTP + Selar (unlinked from nav)
- `/login/` — email/password + OTP + activation code (first time only)

## Anonymous limits (device ID)
- 3 size scans
- 1 size chart
- 10 popup uses

## Placeholders
Fill these in when you set up the new services:
- `server/src/index.js` — SUPABASE_URL, SUPABASE_KEY, SELAR_SECRET
- `web/src/pay.js` — SELAR_URL
- Supabase auth for email OTP

## Deploy
- Web: GitHub Pages or Render static
- API: Render
