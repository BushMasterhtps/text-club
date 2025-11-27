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
      // Sentry is already initialized, nothing to do
      if (process.env.NODE_ENV === 'development') {
        console.log('[SentryInit] Sentry already initialized');
      }
      return;
    }

    // If not initialized, try to load the config file
    // This will execute the Sentry.init() call in sentry.client.config.ts
    import('../../../sentry.client.config')
      .then(() => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[SentryInit] Client config loaded successfully');
        }
        
        // Verify initialization after a short delay
        setTimeout(() => {
          const newClient = Sentry.getClient();
          if (!newClient && process.env.NODE_ENV === 'development') {
            console.warn('[SentryInit] Sentry still not initialized after loading config');
          }
        }, 100);
      })
      .catch((err) => {
        console.warn('[SentryInit] Failed to load client config:', err);
      });
  }, []);

  return null; // This component doesn't render anything
}

