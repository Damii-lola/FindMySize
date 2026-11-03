# FindMySize

Body-scan sizing for clothing brands. The scanner is the home page. Payment is a private link, not in the nav.

## Pages
- `/` — size scanner
- `/dashboard/` — body size charts (chest that wears the garment, not the garment laid flat)
- `/settings/` — only from the user icon, after login
- `/login/` — email, password, email code, and an activation code the first time (or again after cancel)
- `/pay/` — unlinked. Signup, email code, then Selar
- `/paid/` — shows the activation code after Selar redirects here

## Free device limits
- 3 scans on `/`
- 1 size chart
- 10 popup scans on that chart, then it turns off

An active subscription removes the limits until it is canceled or `paid_until` passes.

## Run
`npm start` (listens on `PORT`, default 8080).

## Render env
`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SELAR_CHECKOUT_URL`, `SELAR_WEBHOOK_SECRET`, plus a vision provider: `MISTRAL_API_KEY` or `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Without a vision key, uploads cannot be measured. The PointNet file is `server/models/pointnet.onnx` and only fills gaps when its output is a real centimetre measurement.

## Supabase
Paste [supabase.sql](supabase.sql) in the SQL editor. Turn on email OTP (Auth → Email) and keep `{{ .Token }}` in the email template.

## Selar
- Success URL: `https://findmysize.onrender.com/paid/`
- Webhook: `POST https://findmysize.onrender.com/api/webhooks/selar`
- Header `x-selar-secret` (or `x-webhook-secret`) set to `SELAR_WEBHOOK_SECRET`
- Body must include the buyer email (`email`, `customer_email`, `buyer_email`, or `customer.email`)

The webhook issues an activation code. It does not turn the account on. The buyer enters that code once, on login.
