import { retryWithBackoff } from './retry';
import { circuitBreakers, CircuitBreaker } from './circuit-breaker';
import { isFeatureEnabled } from './config';

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
        return retryWithBackoff(fn, {
          maxRetries: undefined, // Use config defaults
          initialDelay: undefined,
        });
      }
      return fn();
    });
  }

  // Just retry if circuit breaker disabled
  if (useRetry && isFeatureEnabled('retry')) {
    return retryWithBackoff(fn, {
      maxRetries: undefined, // Use config defaults
      initialDelay: undefined,
    });
  }

  // No self-healing, just run (backward compatible)
  return fn();
}

