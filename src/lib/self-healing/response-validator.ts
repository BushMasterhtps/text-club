import { isFeatureEnabled, log } from './config';

/**
 * Validates API responses and handles errors gracefully
 * Prevents JSON parsing errors and ensures valid responses
 * 
 * Safety: If validation disabled, uses standard response.json() (backward compatible)
 */
export async function validateAndParseResponse(
  response: Response,
  options: {
    expectedContentType?: string;
    fallbackError?: string;
  } = {}
): Promise<any> {
  // If validation disabled, use standard parsing (backward compatible)
  if (!isFeatureEnabled('responseValidation')) {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  const { expectedContentType = 'application/json', fallbackError = 'Service temporarily unavailable' } = options;

  // Check if response is OK
  if (!response.ok) {
    // Try to extract error message from response
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      // Valid JSON error response
      try {
        const errorData = await response.json();
        log('warn', `API error (${response.status}): ${errorData.error || errorData.message || fallbackError}`);
        return {
          success: false,
          error: errorData.error || errorData.message || fallbackError,
          status: response.status,
          retryAfter: errorData.retryAfter || 2,
        };
      } catch (e) {
        // JSON parse failed even though content-type says JSON
        log('error', 'Failed to parse JSON error response:', e);
        return {
          success: false,
          error: fallbackError,
          status: response.status,
          retryAfter: 2,
        };
      }
    } else {
      // HTML error page or other non-JSON response
      log('warn', `Non-JSON response received (${contentType}), extracting error`);
      const text = await response.text();
      
      // Try to extract error from HTML
      const errorMatch = text.match(/<title>(.*?)<\/title>/i) || 
                        text.match(/<h1>(.*?)<\/h1>/i) ||
                        text.match(/Error:?\s*(.*?)(?:\n|<)/i);
      
      const extractedError = errorMatch ? errorMatch[1].trim() : fallbackError;
      
      return {
        success: false,
        error: extractedError,
        status: response.status,
        retryAfter: 2,
        originalResponse: text.substring(0, 200), // First 200 chars for debugging
      };
    }
  }

  // Response is OK, parse JSON
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    log('warn', `Expected JSON but got ${contentType}`);
    return {
      success: false,
      error: 'Invalid response format',
      status: response.status,
    };
  }

  try {
    return await response.json();
  } catch (error) {
    log('error', 'JSON parse error:', error);
    return {
      success: false,
      error: 'Failed to parse response',
      status: response.status,
    };
  }
}

