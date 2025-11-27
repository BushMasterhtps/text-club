import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

/**
 * API endpoint to test Sentry Logs from server-side
 * This helps unlock the Sentry Logs UI which may require server-side logs
 */
export async function GET(request: NextRequest) {
  try {
    // Send a test log from the server
    const uniqueId = Date.now();
    const logMessage = `Server-side test log - ${uniqueId}`;
    
    Sentry.logger.info(logMessage, {
      log_source: 'sentry_test',
      timestamp: new Date().toISOString(),
      source: 'server_api',
      test_id: uniqueId,
      test_type: 'server_side_trigger',
      endpoint: '/api/test-sentry-log'
    });

    return NextResponse.json({
      success: true,
      message: 'Test log sent successfully from server',
      logMessage,
      testId: uniqueId,
      instructions: [
        '1. Go to Sentry Logs page',
        '2. Wait 10-30 seconds for the log to appear',
        '3. Search for: log_source:sentry_test',
        '4. Or search for: "Server-side test log"'
      ]
    });
  } catch (error) {
    console.error('Error sending Sentry log:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

