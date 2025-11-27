// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

// Log DSN status at initialization time
if (typeof window !== 'undefined') {
  console.log('[Sentry Init] DSN Status:', {
    hasDsn: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
    dsnLength: process.env.NEXT_PUBLIC_SENTRY_DSN?.length,
    dsnPreview: process.env.NEXT_PUBLIC_SENTRY_DSN?.substring(0, 20) + '...'
  });
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: true, // Enable debug mode to see Sentry initialization and event sending

  // Only send errors in production (or set to true for all environments)
  // TEMPORARILY: Enable for all environments to test
  enabled: true,

  replaysOnErrorSampleRate: 1.0,

  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // You can remove this option if you're not planning to use the Sentry Session Replay feature:
  integrations: [
    Sentry.replayIntegration({
      // Additional Replay configuration goes in here, for example:
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Filter out sensitive data
  beforeSend(event, hint) {
    // Log to console for debugging
    console.log('[Sentry] beforeSend called', {
      hasDsn: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
      dsnLength: process.env.NEXT_PUBLIC_SENTRY_DSN?.length,
      eventType: event.type,
      error: event.exception?.values?.[0]?.value,
      environment: process.env.NODE_ENV
    });
    
    // TEMPORARILY: Allow all errors through for testing
    // Don't filter out any errors - we want to see if they're being sent
    console.log('[Sentry] Allowing event through (testing mode)');
    
    // Remove sensitive data from request
    if (event.request) {
      delete event.request.cookies;
      if (event.request.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
    }
    
    console.log('[Sentry] Returning event to be sent');
    return event;
  },
});

