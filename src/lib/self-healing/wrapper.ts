import { retryWithBackoff } from './retry';
import { circuitBreakers, CircuitBreaker } from './circuit-breaker';
import { isFeatureEnabled } from './config';
import * as Sentry from '@sentry/nextjs';

/**
 * Wraps API route handlers with self-healing
 * If self-healing is disabled, just runs the function normally
 * 
 * Safety: This is a non-breaking wrapper - existing code stays the same
 */
export async function withSelfHealing<T>(
  fn: () => Promise<T>,
  options: {
    service?: 'database' | 'assistance-api' | 'spam-capture';
    useRetry?: boolean;
    useCircuitBreaker?: boolean;
  } = {}
): Promise<T> {
  const { service = 'database', useRetry = true, useCircuitBreaker = true } = options;

  // If self-healing disabled globally, just run the function
  if (!isFeatureEnabled('enabled')) {
    return fn();
  }

  // Wrap with circuit breaker if enabled
  if (useCircuitBreaker && isFeatureEnabled('circuitBreaker')) {
    const circuitBreaker = circuitBreakers[service] || circuitBreakers.database;
    return circuitBreaker.execute(async () => {
      // Wrap with retry if enabled
      if (useRetry && isFeatureEnabled('retry')) {
        try {
          return await retryWithBackoff(fn, {
            maxRetries: undefined, // Use config defaults
            initialDelay: undefined,
          });
        } catch (error) {
          // Capture to Sentry before rethrowing
          Sentry.captureException(error, {
            tags: { service, selfHealing: 'retry-failed' },
            extra: { useRetry: true, useCircuitBreaker: true }
          });
          throw error;
        }
      }
      try {
        return await fn();
      } catch (error) {
        // Capture to Sentry before rethrowing
        Sentry.captureException(error, {
          tags: { service, selfHealing: 'circuit-breaker' },
          extra: { useRetry: false, useCircuitBreaker: true }
        });
        throw error;
      }
    });
  }

  // Just retry if circuit breaker disabled
  if (useRetry && isFeatureEnabled('retry')) {
    try {
      return await retryWithBackoff(fn, {
        maxRetries: undefined, // Use config defaults
        initialDelay: undefined,
      });
    } catch (error) {
      // Capture to Sentry before rethrowing
      Sentry.captureException(error, {
        tags: { service, selfHealing: 'retry-failed' },
        extra: { useRetry: true, useCircuitBreaker: false }
      });
      throw error;
    }
  }

  // No self-healing, just run (backward compatible) but still capture errors
  try {
    return await fn();
  } catch (error) {
    // Capture to Sentry before rethrowing
    Sentry.captureException(error, {
      tags: { service, selfHealing: 'none' },
      extra: { useRetry: false, useCircuitBreaker: false }
    });
    throw error;
  }
}

