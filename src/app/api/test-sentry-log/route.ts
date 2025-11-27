import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

/**
 * API endpoint to test Sentry Logs from server-side
 * This helps unlock the Sentry Logs UI which may require server-side logs
 */
export async function GET(request: NextRequest) {
  try {
    // Check if Sentry is initialized
    const client = Sentry.getClient();
    const isInitialized = !!client;
    
    // Send a test log from the server
    const uniqueId = Date.now();
    const logMessage = `Server-side test log - ${uniqueId}`;
    
    console.log('[Sentry Log Test] Attempting to send log...', {
      isInitialized,
      hasLogger: typeof Sentry.logger !== 'undefined',
      hasLoggerInfo: typeof Sentry.logger?.info === 'function',
      dsn: process.env.SENTRY_DSN ? 'SET' : 'NOT SET',
      nodeEnv: process.env.NODE_ENV
    });
    
    // Try multiple ways to send the log
    if (Sentry.logger && Sentry.logger.info) {
      Sentry.logger.info(logMessage, {
        log_source: 'sentry_test',
        timestamp: new Date().toISOString(),
        source: 'server_api',
        test_id: uniqueId,
        test_type: 'server_side_trigger',
        endpoint: '/api/test-sentry-log'
      });
      console.log('[Sentry Log Test] Log sent via logger.info');
    }
    
    // Also try captureMessage as a fallback
    Sentry.captureMessage(`Test log message - ${uniqueId}`, {
      level: 'info',
      tags: {
        log_source: 'sentry_test',
        test_id: uniqueId.toString()
      },
      extra: {
        timestamp: new Date().toISOString(),
        source: 'server_api',
        test_type: 'server_side_trigger'
      }
    });
    console.log('[Sentry Log Test] Message also sent via captureMessage');

    return NextResponse.json({
      success: true,
      message: 'Test log sent successfully from server',
      logMessage,
      testId: uniqueId,
      sentryInitialized: isInitialized,
      nodeEnv: process.env.NODE_ENV,
      instructions: [
        '1. Go to Sentry Logs page (or Issues page as fallback)',
        '2. Wait 10-30 seconds for the log to appear',
        '3. Search for: log_source:sentry_test',
        '4. Or search for: "Server-side test log"',
        '5. If Logs page is still locked, check Issues page - logs might appear there'
      ]
    });
  } catch (error) {
    console.error('[Sentry Log Test] Error sending Sentry log:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}

