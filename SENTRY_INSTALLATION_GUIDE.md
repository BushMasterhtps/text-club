# Sentry Installation Guide for Next.js

## 🎯 Quick Setup Steps

### Step 1: Install Sentry Package

```bash
npm install @sentry/nextjs
```

### Step 2: Initialize Sentry

Run the Sentry wizard (recommended):

```bash
npx @sentry/wizard@latest -i nextjs
```

**OR** manually configure (see below)

---

## 📋 Manual Configuration (If Wizard Doesn't Work)

### Step 1: Install Package

```bash
npm install @sentry/nextjs
```

### Step 2: Create Sentry Configuration

Create `sentry.client.config.ts` in project root:

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  // Set tracesSampleRate to 1.0 to capture 100% of transactions
  tracesSampleRate: 1.0,
  
  // Set sample rate for profiling
  profilesSampleRate: 1.0,
  
  // Environment
  environment: process.env.NODE_ENV || "production",
  
  // Only send errors in production (or set to true for all environments)
  enabled: process.env.NODE_ENV === "production",
  
  // Filter out sensitive data
  beforeSend(event, hint) {
    // Don't send errors in development
    if (process.env.NODE_ENV === "development") {
      return null;
    }
    return event;
  },
});
```

Create `sentry.server.config.ts`:

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  
  tracesSampleRate: 1.0,
  
  environment: process.env.NODE_ENV || "production",
  
  enabled: process.env.NODE_ENV === "production",
});
```

Create `sentry.edge.config.ts`:

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  
  tracesSampleRate: 1.0,
  
  environment: process.env.NODE_ENV || "production",
});
```

### Step 3: Update `next.config.js`

Add Sentry plugin:

```javascript
const { withSentryConfig } = require("@sentry/nextjs");

// Your existing Next.js config
const nextConfig = {
  // ... your existing config
};

// Wrap with Sentry
module.exports = withSentryConfig(
  nextConfig,
  {
    // Sentry options
    silent: true,
    org: "your-org-slug", // Get from Sentry dashboard
    project: "your-project-slug", // Get from Sentry dashboard
    
    // Upload source maps
    widenClientFileUpload: true,
    hideSourceMaps: true,
    disableLogger: true,
  },
  {
    // Sentry webpack plugin options
    dryRun: process.env.NODE_ENV === "development",
  }
);
```

### Step 4: Add Environment Variables

Add to `.env` (and Netlify environment variables):

```bash
# Sentry Configuration
NEXT_PUBLIC_SENTRY_DSN=your-dsn-here
SENTRY_DSN=your-dsn-here
SENTRY_ORG=your-org-slug
SENTRY_PROJECT=your-project-slug
SENTRY_AUTH_TOKEN=your-auth-token
```

**Where to find these:**
- **DSN**: Sentry Dashboard → Settings → Projects → Your Project → Client Keys (DSN)
- **Org/Project**: In your Sentry URL: `https://your-org.sentry.io/projects/your-project/`
- **Auth Token**: Sentry Dashboard → Settings → Account → Auth Tokens → Create New Token

### Step 5: Update API Routes (Optional - For Better Error Tracking)

Wrap API routes with Sentry:

```typescript
import * as Sentry from "@sentry/nextjs";

export async function GET(request: NextRequest) {
  try {
    // Your code here
  } catch (error) {
    // Sentry will automatically capture errors
    Sentry.captureException(error);
    throw error;
  }
}
```

---

## 🚀 Quick Start (Recommended)

**Easiest way - use the wizard:**

1. Get your DSN from Sentry dashboard
2. Run: `npx @sentry/wizard@latest -i nextjs`
3. Follow the prompts
4. Add DSN to environment variables
5. Deploy!

---

## ✅ Verification

After installation:

1. **Test Error Capture:**
   - Add a test error in your code
   - Check Sentry dashboard for the error

2. **Check Integration:**
   - Sentry Dashboard → Issues → Should see test error
   - Sentry Dashboard → Performance → Should see transactions

---

## 📊 What Sentry Will Track

- ✅ Unhandled exceptions
- ✅ API route errors
- ✅ Client-side errors
- ✅ Performance issues
- ✅ Database query errors (if configured)

---

## 🔧 Configuration Tips

### Filter Sensitive Data

```typescript
beforeSend(event, hint) {
  // Remove sensitive data
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers?.authorization;
  }
  return event;
}
```

### Set Up Alerts

1. Go to Sentry Dashboard → Alerts
2. Create alert rules:
   - Error rate > 10 errors/minute
   - New issue detected
   - Performance degradation

### Set Up Slack/Email Notifications

1. Sentry Dashboard → Settings → Integrations
2. Connect Slack or Email
3. Configure notification rules

---

## 🎯 Next Steps After Installation

1. ✅ Install Sentry package
2. ✅ Run wizard or configure manually
3. ✅ Add environment variables
4. ✅ Test error capture
5. ✅ Set up alerts
6. ✅ Monitor after Holds fix deployment

---

**Need help?** Let me know if you run into any issues during installation!

