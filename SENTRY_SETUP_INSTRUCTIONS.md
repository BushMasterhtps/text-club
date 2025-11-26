# Sentry Setup - Next Steps

## ✅ What's Been Done

1. ✅ Installed `@sentry/nextjs` package
2. ✅ Created Sentry configuration files:
   - `sentry.client.config.ts` - Client-side error tracking
   - `sentry.server.config.ts` - Server-side error tracking
   - `sentry.edge.config.ts` - Edge runtime error tracking
   - `src/instrumentation.ts` - Next.js instrumentation
3. ✅ Updated `next.config.ts` to wrap with Sentry

## 🔧 What You Need to Do

### Step 1: Get Your Sentry DSN

1. Go to your Sentry dashboard: https://selftaughtorg.sentry.io
2. Navigate to: **Settings → Projects → Your Project → Client Keys (DSN)**
3. Copy your DSN (it looks like: `https://xxxxx@xxxxx.ingest.sentry.io/xxxxx`)

### Step 2: Add Environment Variables to Netlify

Add these to your **Netlify Environment Variables**:

```bash
# Sentry Configuration (REQUIRED)
NEXT_PUBLIC_SENTRY_DSN=https://f9e78ebbd407e308d5c1bb1d2e0137d3@o4510433531592704.ingest.us.sentry.io/4510433620393984
SENTRY_DSN=https://f9e78ebbd407e308d5c1bb1d2e0137d3@o4510433531592704.ingest.us.sentry.io/4510433620393984

# Sentry Source Maps (OPTIONAL - for better error debugging)
SENTRY_ORG=your-org-slug-here
SENTRY_PROJECT=your-project-slug-here
SENTRY_AUTH_TOKEN=your-auth-token-here
```

**Where to add:**
1. Go to Netlify Dashboard
2. Select your site
3. Go to **Site Settings → Environment Variables**
4. Click **Add a variable** for each variable above

**How to get SENTRY_ORG and SENTRY_PROJECT:**
1. Go to your Sentry dashboard
2. Look at the URL: `https://selftaughtorg.sentry.io/projects/your-project-name/`
3. `SENTRY_ORG` = the org slug (e.g., `selftaughtorg`)
4. `SENTRY_PROJECT` = the project slug (check your project settings)

**How to get SENTRY_AUTH_TOKEN (optional, for source maps):**
1. Sentry Dashboard → Settings → Account → Auth Tokens
2. Create New Token
3. Scopes: `project:releases`, `org:read`, `project:read`
4. Copy the token and add as `SENTRY_AUTH_TOKEN`

**Note:** The DSN is already provided above - just copy/paste those two lines!

### Step 3: Test Sentry (After Deployment)

After you deploy, test that Sentry is working:

1. **Option A:** Visit `/sentry-example-page` if it exists
2. **Option B:** Add a test error in your code:
   ```typescript
   // In any API route or component
   throw new Error("Test Sentry error");
   ```
3. Check your Sentry dashboard - you should see the error appear!

---

## 📊 What Sentry Will Track

- ✅ Unhandled exceptions (client & server)
- ✅ API route errors
- ✅ Database errors
- ✅ Performance issues
- ✅ User sessions (with Session Replay)

---

## 🔒 Security Features

The configuration includes:
- ✅ Filters out sensitive data (cookies, auth headers)
- ✅ Only sends errors in production (not development)
- ✅ Masks all text in session replays
- ✅ Blocks all media in session replays

---

## ⚠️ Important Notes

1. **Don't commit DSN to Git** - Use environment variables only
2. **Test in production** - Sentry is disabled in development by default
3. **Monitor after deployment** - Check Sentry dashboard after 3:30 PM PST deployment

---

## 🎯 After Deployment

1. Monitor Sentry dashboard for any errors
2. Set up alerts (Sentry Dashboard → Alerts)
3. Configure Slack/Email notifications (optional)

---

**Status:** ✅ Sentry code is ready, just need to add DSN to environment variables!

