import { isFeatureEnabled, log, SELF_HEALING_CONFIG } from './config';

/**
 * Retry a function with exponential backoff
 * Prevents overwhelming failing services while giving them time to recover
 * 
 * Safety: If retry is disabled, just runs the function once
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  // If retry is disabled, just run once
  if (!isFeatureEnabled('retry')) {
    return fn();
  }

  const {
    maxRetries = SELF_HEALING_CONFIG.retry.maxRetries,
    initialDelay = SELF_HEALING_CONFIG.retry.initialDelay,
    maxDelay = SELF_HEALING_CONFIG.retry.maxDelay,
    onRetry,
  } = options;

  let lastError: Error;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      attempt++;

      // Don't retry on client errors (4xx) - these won't be fixed by retrying
      if (error instanceof Error) {
        const statusMatch = error.message.match(/HTTP (\d{3})/);
        if (statusMatch && parseInt(statusMatch[1]) >= 400 && parseInt(statusMatch[1]) < 500) {
          log('warn', `Client error (${statusMatch[1]}), not retrying`);
          throw error; // Don't retry client errors
        }
      }

      // Log retry attempt
      log('info', `Retry attempt ${attempt}/${maxRetries} after ${initialDelay * Math.pow(2, attempt - 1)}ms`);
      if (onRetry) {
        onRetry(attempt, lastError);
      }

      // Wait before retrying (exponential backoff: 1s, 2s, 4s, 8s)
      if (attempt < maxRetries) {
        const delay = Math.min(
          initialDelay * Math.pow(2, attempt - 1),
          maxDelay
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  log('error', `All ${maxRetries} retry attempts failed`);
  throw lastError!;
}

