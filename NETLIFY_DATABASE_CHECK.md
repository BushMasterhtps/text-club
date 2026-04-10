# Netlify + Database Troubleshooting

If login returns **"Internal server error"** and **data doesn't load** for logged-in users, the app on Netlify usually can't reach the database.

## 1. Check health endpoint (after deploying)

Open in a browser (or run `curl`):

**https://thunderous-crisp-50ad13.netlify.app/api/health**

- **`{ "ok": true }`** → DB is reachable; if login still fails, the problem is elsewhere.
- **`{ "ok": false, "reason": "database", "message": "DATABASE_URL not configured" }`** → `DATABASE_URL` is missing in Netlify.
- **`{ "ok": false, "reason": "database", "message": "Database unreachable" }`** → `DATABASE_URL` is set but the DB is not reachable (wrong URL, SSL, or network).

## 2. Railway: get the URL Netlify can use

Your app runs on **Netlify** but the database is on **Railway**. Netlify can only use a **public** connection string (not Railway's internal one).

1. In **Railway**, open the project that has your **Postgres** database (often a separate service from "text-club", e.g. "Postgres" or "MySQL/Postgres").
2. Click the **Postgres** service (the database), not the "text-club" app service.
3. Go to the **Variables** tab (or **Connect** / **Data**).
4. Find **`DATABASE_URL`** or **`POSTGRES_URL`** (or "Public URL"). Railway may show:
   - **Private URL** – only works from other Railway services. **Do not use this in Netlify.**
   - **Public URL** – host like `*.railway.app` or `*.proxy.rlwy.net`. **Use this in Netlify.**
5. If you only see one URL, check that the host is **not** `localhost` or something like `postgres.railway.internal` (that's internal-only). For Netlify you need a host that's reachable from the internet (e.g. `containers-us-west-123.railway.app` or `roundhouse.proxy.rlwy.net`).
6. Copy the **full** connection string (starts with `postgresql://`). If Railway requires SSL, add **`?sslmode=require`** at the end.

## 3. Set DATABASE_URL in Netlify

1. Netlify dashboard → your site → **Site configuration** → **Environment variables**.
2. Add or edit **`DATABASE_URL`** for **Production**.
3. Paste the **public** Railway URL you copied (with `?sslmode=require` at the end if needed).
4. **Save** and trigger a **new deploy** (e.g. "Trigger deploy" or push a commit) so the new value is used.

## 4. Use a pooled URL for serverless (if your provider has one)

Netlify runs **serverless functions**. Many Postgres hosts give two URLs:

- **Direct** – one connection per process; can exhaust connections under load.
- **Pooled** – for serverless (e.g. "Connection pooling" / "Pooler" in Railway, Supabase, etc.).

If you have a **pooled** URL, use that as `DATABASE_URL` on Netlify.

**Railway:** In the Postgres service, use the **public** URL. If Railway shows a "Pooler" or "Connection pool" option for external/serverless use, prefer that to reduce connection limits.

**Supabase:** Use the "Transaction" or "Session" pooler URL from Project Settings → Database.

## 5. SSL

If the DB requires SSL, the URL may need `?sslmode=require` at the end (syntax can vary by provider).

## 6. After changing DATABASE_URL

Redeploy the site, then:

1. Open **/api/health** again and confirm `ok: true`.
2. Try login again.
3. If it still fails, check **Netlify → Deploys → Functions / Logs** for the real error.

---

## 7. Railway: "Database unreachable" / Sentry Prisma errors

If Sentry shows **Can't reach database server at interchange.proxy.rlwy.net:43835** and `/api/health` returns `Database unreachable`, the URL is correct but the connection is blocked or failing. Do the following on **Railway**:

### A. Enable Public Networking (required for Netlify)

1. In Railway, open the project and click the **Postgres** service (the database, not "text-club").
2. Go to **Settings** (or the service's configuration).
3. Find **Networking** or **Public Networking**.
4. **Enable public networking** (e.g. "Generate domain" or "Expose publicly") so the database accepts connections from the internet. Without this, only other Railway services can connect.
5. After enabling, Railway may show a new **public** URL. If so, copy that URL and set it as `DATABASE_URL` in Netlify (with `?sslmode=require` at the end if you use SSL).

### B. Try without SSL

If the connection still fails, the proxy might be failing during SSL handshake. In Netlify, **edit** `DATABASE_URL` and **remove** `?sslmode=require` so the value is only the base URL (e.g. `postgresql://postgres:PASSWORD@interchange.proxy.rlwy.net:43835/railway`). Save, trigger a new deploy, then check `/api/health` again.

### C. Confirm Postgres is running

In Railway, open the **Postgres** service and check that it's **Running** (not Paused). Free-tier databases can pause after inactivity; resume or wake the service if needed.
