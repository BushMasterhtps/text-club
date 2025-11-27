'use client';

import { useState, useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function SentryExamplePage() {
  const [errorTriggered, setErrorTriggered] = useState(false);
  const [errorSent, setErrorSent] = useState(false);
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

        <div className="text-center">
          <button
            onClick={triggerTestError}
            disabled={errorTriggered}
            className="px-8 py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105 disabled:transform-none"
          >
            {errorTriggered ? '✅ Error Triggered!' : '🚨 Trigger Test Error'}
          </button>

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

