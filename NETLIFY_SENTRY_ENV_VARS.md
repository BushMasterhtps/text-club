# Netlify Environment Variables for Sentry

## Quick Copy-Paste for Netlify

Copy these environment variables to your Netlify dashboard:

### Required Variables (Copy These Now)

```
NEXT_PUBLIC_SENTRY_DSN=https://f9e78ebbd407e308d5c1bb1d2e0137d3@o4510433531592704.ingest.us.sentry.io/4510433620393984
```

```
SENTRY_DSN=https://f9e78ebbd407e308d5c1bb1d2e0137d3@o4510433531592704.ingest.us.sentry.io/4510433620393984
```

### Optional Variables (For Source Maps - Better Error Debugging)

These are optional but recommended for better error tracking:

```
SENTRY_ORG=your-org-slug
```

```
SENTRY_PROJECT=your-project-slug
```

```
SENTRY_AUTH_TOKEN=your-auth-token
```

---

## How to Add to Netlify

1. **Go to Netlify Dashboard**
   - https://app.netlify.com

2. **Select Your Site**
   - Find "text-club" or your site name

3. **Go to Site Settings**
   - Click on your site → **Site Settings** (left sidebar)

4. **Environment Variables**
   - Click **Environment Variables** in the left sidebar
   - Click **Add a variable**

5. **Add Each Variable**
   - **Key:** `NEXT_PUBLIC_SENTRY_DSN`
   - **Value:** `https://f9e78ebbd407e308d5c1bb1d2e0137d3@o4510433531592704.ingest.us.sentry.io/4510433620393984`
   - Click **Save**
   
   - Repeat for `SENTRY_DSN` with the same value

6. **Redeploy**
   - After adding variables, trigger a new deploy
   - Or wait for the next automatic deploy

---

## Testing After Deployment

Once deployed with Sentry configured:

1. **Check Sentry Dashboard**
   - Go to: https://selftaughtorg.sentry.io
   - You should see your project

2. **Trigger a Test Error** (optional)
   - Add this temporarily to any API route:
   ```typescript
   throw new Error("Test Sentry error");
   ```
   - Check Sentry dashboard - you should see the error!

3. **Remove Test Error** after confirming it works

---

## Status

✅ **Code is ready** - Sentry is fully configured  
⏳ **Waiting for:** Environment variables in Netlify  
🚀 **After adding vars:** Redeploy and Sentry will start tracking errors!

