/**
 * Feature flags for self-healing
 * Can be disabled instantly via environment variable
 * 
 * Safety: If disabled, all self-healing code does nothing
 */
export const SELF_HEALING_CONFIG = {
  // Enable/disable self-healing globally
  // Set SELF_HEALING_ENABLED=false in Netlify to disable
  enabled: process.env.SELF_HEALING_ENABLED !== 'false', // Default: enabled
  
  // Individual feature toggles
  retry: {
    enabled: process.env.SELF_HEALING_RETRY !== 'false',
    maxRetries: parseInt(process.env.SELF_HEALING_MAX_RETRIES || '3', 10),
    initialDelay: parseInt(process.env.SELF_HEALING_INITIAL_DELAY || '1000', 10),
    maxDelay: parseInt(process.env.SELF_HEALING_MAX_DELAY || '8000', 10),
  },
  
  circuitBreaker: {
    enabled: process.env.SELF_HEALING_CIRCUIT_BREAKER !== 'false',
    failureThreshold: parseInt(process.env.SELF_HEALING_FAILURE_THRESHOLD || '5', 10),
    resetTimeout: parseInt(process.env.SELF_HEALING_RESET_TIMEOUT || '30000', 10),
  },
  
  statusValidation: {
    enabled: process.env.SELF_HEALING_STATUS_VALIDATION !== 'false',
  },
  
  responseValidation: {
    enabled: process.env.SELF_HEALING_RESPONSE_VALIDATION !== 'false',
  },
  
  logging: {
    enabled: process.env.SELF_HEALING_LOGGING !== 'false',
    level: process.env.SELF_HEALING_LOG_LEVEL || 'info', // 'info' | 'warn' | 'error'
  },
};

/**
 * Helper to check if feature is enabled
 * Safety: Always returns false if global self-healing is disabled
 */
export function isFeatureEnabled(feature: keyof typeof SELF_HEALING_CONFIG): boolean {
  if (!SELF_HEALING_CONFIG.enabled) {
    return false; // Global disable overrides everything
  }
  
  const featureConfig = SELF_HEALING_CONFIG[feature];
  if (typeof featureConfig === 'object' && 'enabled' in featureConfig) {
    return featureConfig.enabled !== false;
  }
  
  return true; // Default to enabled if not specified
}

/**
 * Safe logger - only logs if logging is enabled
 */
export function log(level: 'info' | 'warn' | 'error', message: string, ...args: any[]): void {
  if (!isFeatureEnabled('logging')) {
    return; // Logging disabled
  }
  
  const configLevel = SELF_HEALING_CONFIG.logging.level;
  const levels: Record<string, number> = { error: 0, warn: 1, info: 2 };
  
  if (levels[level] <= levels[configLevel]) {
    console[level](`[SELF-HEAL] ${message}`, ...args);
  }
}

