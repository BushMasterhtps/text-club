# Sentry Not Capturing Errors - Troubleshooting Guide

## Issue: Error triggered but not appearing in Sentry

### Possible Causes:

1. **DSN Not Set in Production**
   - Check Netlify environment variables
   - Verify `NEXT_PUBLIC_SENTRY_DSN` is set correctly

2. **Sentry Not Initialized**
   - Check browser console for Sentry initialization errors
   - Look for "Sentry" logs in console

3. **Error Being Filtered**
   - Check `beforeSend` function in `sentry.client.config.ts`
   - Verify it's not returning `null` for your error

4. **Network Issues**
   - Check browser Network tab for requests to `sentry.io`
   - Look for failed requests or CORS errors

---

## Quick Checks:

### 1. Verify DSN is Set
```bash
# In Netlify Dashboard → Environment Variables
# Should have:
NEXT_PUBLIC_SENTRY_DSN=https://f9e78ebbd407e308d5c1bb1d2e0137d3@o4510433531592704.ingest.us.sentry.io/4510433620393984
```

### 2. Check Browser Console
- Open browser DevTools (F12)
- Go to Console tab
- Look for Sentry initialization messages
- Look for any errors related to Sentry

### 3. Check Network Tab
- Open browser DevTools (F12)
- Go to Network tab
- Filter by "sentry" or "ingest"
- Trigger the error again
- Look for POST requests to `sentry.io`
- Check if requests are successful (200 status) or failing

### 4. Enable Debug Mode (Temporarily)
In `sentry.client.config.ts`, change:
```typescript
debug: true, // Temporarily enable to see Sentry logs
```

Then check browser console for Sentry initialization messages.

---

## Testing Steps:

1. **Check if Sentry is loaded:**
   - Open browser console
   - Type: `window.Sentry` or `Sentry`
   - Should return an object (Sentry SDK)

2. **Manually test Sentry:**
   - Open browser console
   - Type: `Sentry.captureException(new Error('Test error'))`
   - Check Network tab for request to Sentry
   - Check Sentry dashboard for new error

3. **Check environment:**
   - Verify you're on production URL (not localhost)
   - Check `NODE_ENV` is set to "production" in Netlify

---

## Common Fixes:

### Fix 1: DSN Not Set
- Go to Netlify → Environment Variables
- Add `NEXT_PUBLIC_SENTRY_DSN` with your DSN
- Redeploy

### Fix 2: Sentry Disabled
- Check `enabled: true` in `sentry.client.config.ts`
- Or remove the `enabled` check entirely

### Fix 3: Error Being Filtered
- Check `beforeSend` function
- Make sure it's not returning `null` for test errors
- Temporarily remove `beforeSend` to test

---

## Next Steps:

1. Check browser console for Sentry logs
2. Check Network tab for Sentry requests
3. Verify DSN is set in Netlify
4. Try manual capture: `Sentry.captureException(new Error('Test'))`
5. Check Sentry dashboard after 10-30 seconds

