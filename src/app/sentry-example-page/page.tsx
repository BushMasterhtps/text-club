'use client';

import { useState, useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function SentryExamplePage() {
  const [errorTriggered, setErrorTriggered] = useState(false);
  const [errorSent, setErrorSent] = useState(false);
  const [logSent, setLogSent] = useState(false);
  const [sentryStatus, setSentryStatus] = useState<any>(null);

  // Check Sentry status on mount
  useEffect(() => {
    const checkSentry = () => {
      const status = {
        sentryLoaded: typeof Sentry !== 'undefined',
        hasCaptureException: typeof Sentry?.captureException === 'function',
        hasInit: typeof Sentry?.init === 'function',
        // Check if DSN is set (it should be embedded in the bundle)
        dsnSet: typeof window !== 'undefined' && (window as any).__SENTRY_DSN__ ? true : 'unknown'
      };
      setSentryStatus(status);
      console.log('[Sentry Status Check]', status);
    };
    checkSentry();
  }, []);

  const triggerTestError = () => {
    setErrorTriggered(true);
    
    // Check if Sentry is loaded
    console.log('[Test] Checking Sentry...', {
      sentryExists: typeof Sentry !== 'undefined',
      hasCaptureException: typeof Sentry?.captureException === 'function',
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ? 'SET' : 'NOT SET',
      dsnLength: process.env.NEXT_PUBLIC_SENTRY_DSN?.length
    });
    
    try {
      // This will trigger a Sentry error
      // @ts-ignore - Intentionally calling undefined function
      myUndefinedFunction();
    } catch (error) {
      console.log('[Test] Error caught:', error);
      
      // Explicitly capture the error with Sentry
      if (typeof Sentry !== 'undefined' && Sentry.captureException) {
        console.log('[Test] Calling Sentry.captureException...');
        Sentry.captureException(error);
        setErrorSent(true);
        console.log('[Test] Sentry.captureException called');
      } else {
        console.error('[Test] Sentry is not available!');
      }
      
      // Re-throw to show in console
      throw error;
    }
  };

  const triggerTestLog = () => {
    console.log('[Test] Attempting to send Sentry log...', {
      sentryExists: typeof Sentry !== 'undefined',
      hasLogger: typeof Sentry?.logger !== 'undefined',
      loggerInfo: typeof Sentry?.logger?.info === 'function'
    });

    if (typeof Sentry !== 'undefined' && Sentry.logger && Sentry.logger.info) {
      try {
        // Send a test log to Sentry with a unique message
        const uniqueId = Date.now();
        const logMessage = `User triggered test log - ${uniqueId}`;
        
        Sentry.logger.info(logMessage, { 
          log_source: 'sentry_test',
          timestamp: new Date().toISOString(),
          page: 'sentry-example-page',
          test_id: uniqueId,
          test_type: 'manual_trigger'
        });
        
        setLogSent(true);
        console.log('[Test] Sentry log sent successfully', {
          message: logMessage,
          test_id: uniqueId
        });
      } catch (error) {
        console.error('[Test] Error sending Sentry log:', error);
      }
    } else {
      console.error('[Test] Sentry logger is not available!', {
        sentry: typeof Sentry,
        logger: typeof Sentry?.logger,
        loggerInfo: typeof Sentry?.logger?.info
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-8 border border-white/20">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">
            🧪 Sentry Test Page
          </h1>
          <p className="text-white/70 text-lg">
            Click the button below to trigger a test error and verify Sentry is working
          </p>
        </div>

        {/* Sentry Status Check */}
        {sentryStatus && (
          <div className={`mb-6 p-4 rounded-lg border ${
            sentryStatus.sentryLoaded && sentryStatus.hasCaptureException
              ? 'bg-green-500/20 border-green-500/50'
              : 'bg-red-500/20 border-red-500/50'
          }`}>
            <h3 className="text-lg font-semibold text-white mb-2">Sentry Status:</h3>
            <ul className="space-y-1 text-sm">
              <li className={sentryStatus.sentryLoaded ? 'text-green-400' : 'text-red-400'}>
                {sentryStatus.sentryLoaded ? '✅' : '❌'} Sentry SDK Loaded: {sentryStatus.sentryLoaded ? 'Yes' : 'No'}
              </li>
              <li className={sentryStatus.hasCaptureException ? 'text-green-400' : 'text-red-400'}>
                {sentryStatus.hasCaptureException ? '✅' : '❌'} captureException Available: {sentryStatus.hasCaptureException ? 'Yes' : 'No'}
              </li>
              <li className="text-white/70">
                DSN Status: {sentryStatus.dsnSet === true ? '✅ Set' : sentryStatus.dsnSet === false ? '❌ Not Set' : '⚠️ Unknown'}
              </li>
            </ul>
            {!sentryStatus.sentryLoaded && (
              <p className="text-red-400 text-xs mt-2">
                ⚠️ Sentry is not loaded. Check browser console for errors. The DSN might not be embedded in the build.
              </p>
            )}
          </div>
        )}

        <div className="bg-white/5 rounded-lg p-6 mb-6 border border-white/10">
          <h2 className="text-xl font-semibold text-white mb-4">What This Does:</h2>
          <ul className="space-y-2 text-white/80">
            <li>✅ Triggers a test error that Sentry will capture</li>
            <li>✅ Verifies your Sentry configuration is working</li>
            <li>✅ Creates a test issue in your Sentry dashboard</li>
            <li>✅ Records a Session Replay (if configured)</li>
          </ul>
        </div>

        <div className="text-center space-y-4">
          <div>
            <button
              onClick={triggerTestError}
              disabled={errorTriggered}
              className="px-8 py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105 disabled:transform-none"
            >
              {errorTriggered ? '✅ Error Triggered!' : '🚨 Trigger Test Error'}
            </button>
          </div>
          
          <div className="text-white/60 text-sm">OR</div>
          
          <div className="space-y-2">
            <button
              onClick={triggerTestLog}
              disabled={logSent}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105 disabled:transform-none"
            >
              {logSent ? '✅ Test Log Sent!' : '📝 Trigger Test Log (Client)'}
            </button>
            <p className="text-white/60 text-xs">
              This sends a log from the browser
            </p>
            
            <button
              onClick={async () => {
                try {
                  const response = await fetch('/api/test-sentry-log');
                  const data = await response.json();
                  if (data.success) {
                    setLogSent(true);
                    console.log('[Test] Server-side log sent:', data);
                    alert(`✅ Server-side log sent!\n\nTest ID: ${data.testId}\n\nCheck Sentry Logs page in 10-30 seconds.`);
                  } else {
                    console.error('[Test] Failed to send server log:', data);
                    alert('❌ Failed to send server log. Check console for details.');
                  }
                } catch (error) {
                  console.error('[Test] Error calling server log endpoint:', error);
                  alert('❌ Error sending server log. Check console for details.');
                }
              }}
              disabled={logSent}
              className="px-8 py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105 disabled:transform-none"
            >
              {logSent ? '✅ Server Log Sent!' : '🖥️ Trigger Test Log (Server)'}
            </button>
            <p className="text-white/60 text-xs">
              This sends a log from the server (recommended for unlocking Logs UI)
            </p>
          </div>

          {errorTriggered && (
            <div className="mt-6 p-4 bg-green-500/20 border border-green-500/50 rounded-lg">
              <p className="text-green-400 font-semibold">
                ✅ Error triggered! Check your Sentry dashboard to see the issue.
              </p>
              {errorSent && (
                <p className="text-green-300 text-sm mt-2">
                  ✅ Error explicitly captured by Sentry.captureException()
                </p>
              )}
              <p className="text-white/70 text-sm mt-2">
                Go to: <a href="https://selftaughtorg.sentry.io/issues/" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">selftaughtorg.sentry.io/issues/</a>
              </p>
              <div className="mt-4 p-3 bg-yellow-500/20 border border-yellow-500/50 rounded text-yellow-300 text-sm">
                <p className="font-semibold mb-1">Troubleshooting:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Check browser console Network tab for requests to sentry.io</li>
                  <li>Verify NEXT_PUBLIC_SENTRY_DSN is set in Netlify environment variables</li>
                  <li>Wait 10-30 seconds for Sentry to process the error</li>
                  <li>Refresh the Sentry dashboard</li>
                </ul>
              </div>
            </div>
          )}

          {logSent && (
            <div className="mt-6 p-4 bg-blue-500/20 border border-blue-500/50 rounded-lg">
              <p className="text-blue-400 font-semibold">
                ✅ Test log sent! Check your Sentry Logs page to see it.
              </p>
              <p className="text-white/70 text-sm mt-2">
                <strong>How to find your log:</strong>
              </p>
              <ol className="list-decimal list-inside text-white/70 text-sm mt-2 space-y-1">
                <li>Go to: <a href="https://selftaughtorg.sentry.io/organizations/selftaughtorg/explore/logs/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline font-semibold">Sentry Logs Page</a></li>
                <li>In the search bar at the top, type: <code className="bg-black/30 px-1 rounded text-yellow-300">log_source:sentry_test</code></li>
                <li>OR search for: <code className="bg-black/30 px-1 rounded text-yellow-300">"User triggered test log"</code></li>
                <li>Make sure the time filter is set to <strong>"24H"</strong> or <strong>"1H"</strong> (not just "24H")</li>
                <li>Wait 10-30 seconds and refresh the page if needed</li>
              </ol>
              <div className="mt-3 p-2 bg-yellow-500/20 border border-yellow-500/50 rounded text-yellow-300 text-xs">
                <p className="font-semibold mb-1">⚠️ If you don't see it:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Check the browser console Network tab for requests to <code>sentry.io</code></li>
                  <li>Make sure you're on the <strong>"Logs"</strong> page (not "Issues")</li>
                  <li>Try clicking the search bar and pressing Enter to refresh results</li>
                  <li>Check that the project filter shows <strong>"javascript-nextjs"</strong></li>
                </ul>
              </div>
              <p className="text-white/70 text-xs mt-3">
                Direct link: <a href="https://selftaughtorg.sentry.io/organizations/selftaughtorg/explore/logs/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">selftaughtorg.sentry.io/explore/logs/</a>
              </p>
            </div>
          )}

          <div className="mt-8 text-white/60 text-sm">
            <p>After triggering the error:</p>
            <ol className="list-decimal list-inside space-y-1 mt-2">
              <li>Go to your Sentry dashboard</li>
              <li>Look for a new issue with "myUndefinedFunction"</li>
              <li>Click on it to see the error details</li>
              <li>Check if Session Replay is available (if configured)</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

