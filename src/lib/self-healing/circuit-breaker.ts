import { isFeatureEnabled, log, SELF_HEALING_CONFIG } from './config';

/**
 * Circuit Breaker Pattern
 * Prevents cascading failures by temporarily disabling failing services
 * 
 * Safety: If circuit breaker is disabled, just runs the function normally
 */
export class CircuitBreaker {
  private failures: number = 0;
  private successes: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private lastFailureTime: number = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly name: string;
  private readonly enabled: boolean;

  constructor(
    name: string,
    options: {
      failureThreshold?: number; // Open circuit after this many failures
      resetTimeout?: number; // Try again after this many ms
    } = {}
  ) {
    this.name = name;
    this.enabled = isFeatureEnabled('circuitBreaker');
    this.failureThreshold = options.failureThreshold || SELF_HEALING_CONFIG.circuitBreaker.failureThreshold;
    this.resetTimeout = options.resetTimeout || SELF_HEALING_CONFIG.circuitBreaker.resetTimeout;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // If circuit breaker disabled, just run the function
    if (!this.enabled) {
      return fn();
    }

    // Check if circuit should be reset
    if (this.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure > this.resetTimeout) {
        log('info', `Circuit breaker ${this.name} moving to HALF_OPEN`);
        this.state = 'HALF_OPEN';
        this.successes = 0;
      } else {
        // Circuit is still open, return cached data or error
        const error = new Error(`Circuit breaker ${this.name} is OPEN. Service unavailable.`);
        log('warn', `Circuit breaker ${this.name} is OPEN, blocking request`);
        throw error;
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      // If we succeed in half-open state, close the circuit
      log('info', `Circuit breaker ${this.name} CLOSED (recovered)`);
      this.state = 'CLOSED';
    }
    this.successes++;
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      if (this.state !== 'OPEN') {
        log('warn', `Circuit breaker ${this.name} OPENED (${this.failures} failures)`);
        this.state = 'OPEN';
      }
    }
  }

  getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    return this.state;
  }

  getStats() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      failureRate: this.failures / (this.failures + this.successes) || 0,
      enabled: this.enabled,
    };
  }
}

// Global circuit breakers for different services
export const circuitBreakers = {
  database: new CircuitBreaker('database', { failureThreshold: 5, resetTimeout: 30000 }),
  assistanceAPI: new CircuitBreaker('assistance-api', { failureThreshold: 3, resetTimeout: 20000 }),
  spamCapture: new CircuitBreaker('spam-capture', { failureThreshold: 3, resetTimeout: 10000 }),
};

