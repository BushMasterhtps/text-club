'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

/**
 * Client component to ensure Sentry client config is loaded
 * This is a fallback - normally @sentry/nextjs auto-loads sentry.client.config.ts,
 * but we want to explicitly ensure it's loaded and initialized
 */
export default function SentryInit() {
  useEffect(() => {
    // Check if Sentry is already initialized
    const client = Sentry.getClient();
    
    if (client) {
      console.log('[SentryInit] Sentry already initialized', {
        dsn: client.getDsn()?.toString(),
        enabled: client.getOptions().enabled
      });
      return;
    }

    // If not initialized, try to load the config file
    // This will execute the Sentry.init() call in sentry.client.config.ts
    import('../../../sentry.client.config')
      .then(() => {
        console.log('[SentryInit] Client config loaded successfully');
        
        // Verify initialization after a short delay
        setTimeout(() => {
          const newClient = Sentry.getClient();
          if (newClient) {
            console.log('[SentryInit] Sentry initialized after loading config', {
              dsn: newClient.getDsn()?.toString(),
              enabled: newClient.getOptions().enabled
            });
          } else {
            console.warn('[SentryInit] Sentry still not initialized after loading config');
            console.warn('[SentryInit] DSN available:', !!process.env.NEXT_PUBLIC_SENTRY_DSN);
          }
        }, 100);
      })
      .catch((err) => {
        console.warn('[SentryInit] Failed to load client config:', err);
      });
  }, []);

  return null; // This component doesn't render anything
}

