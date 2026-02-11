# Netlify + Database Troubleshooting

If login returns **"Internal server error"** and **data doesn’t load** for logged-in users, the app on Netlify usually can’t reach the database.

## 1. Check health endpoint (after deploying)

Open in a browser (or run `curl`):

**https://thunderous-crisp-50ad13.netlify.app/api/health**

- **`{ "ok": true }`** → DB is reachable; if login still fails, the problem is elsewhere.
- **`{ "ok": false, "reason": "database", "message": "DATABASE_URL not configured" }`** → `DATABASE_URL` is missing in Netlify.
- **`{ "ok": false, "reason": "database", "message": "Database unreachable" }`** → `DATABASE_URL` is set but the DB is not reachable (wrong URL, SSL, or network).

## 2. Set DATABASE_URL in Netlify

1. Netlify dashboard → your site → **Site configuration** → **Environment variables**.
2. Add (or fix) **`DATABASE_URL`** for **Production** (and other scopes if you use them).
3. Use the **exact** connection string that works locally (e.g. from `.env` or Railway).
4. **Save** and trigger a **new deploy** (e.g. “Trigger deploy” or push a commit) so the new value is used.

## 3. Use a pooled URL for serverless (if your provider has one)

Netlify runs **serverless functions**. Many Postgres hosts give two URLs:

- **Direct** – one connection per process; can exhaust connections under load.
- **Pooled** – for serverless (e.g. “Connection pooling” / “Pooler” in Railway, Supabase, etc.).

If you have a **pooled** URL, use that as `DATABASE_URL` on Netlify.

**Railway:** Variables → use the URL that uses the **pooler** (often different port or host), not the direct Postgres URL.

**Supabase:** Use the “Transaction” or “Session” pooler URL from Project Settings → Database.

## 4. SSL

If the DB requires SSL, the URL may need `?sslmode=require` at the end (syntax can vary by provider).

## 5. After changing DATABASE_URL

Redeploy the site, then:

1. Open **/api/health** again and confirm `ok: true`.
2. Try login again.
3. If it still fails, check **Netlify → Deploys → Functions / Logs** for the real error (e.g. “Login error: …”).
