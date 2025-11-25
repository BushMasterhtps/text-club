# Self-Healing Code: Implementation Examples

**Created:** November 2025  
**Purpose:** Practical code examples showing how self-healing strategies would be implemented

---

## Table of Contents

1. [Core Self-Healing Utilities](#core-self-healing-utilities)
2. [API Error Handling with Retry](#api-error-handling-with-retry)
3. [Circuit Breaker Pattern](#circuit-breaker-pattern)
4. [Response Validation Layer](#response-validation-layer)
5. [Connection Pool Monitor](#connection-pool-monitor)
6. [Status Transition Validation](#status-transition-validation)
7. [Integration Examples](#integration-examples)

---

## Core Self-Healing Utilities

### 1. Retry with Exponential Backoff

**File:** `src/lib/self-healing/retry.ts`

```typescript
/**
 * Retry a function with exponential backoff
 * Prevents overwhelming failing services while giving them time to recover
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
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 8000,
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
          throw error; // Don't retry client errors
        }
      }

      // Log retry attempt
      if (onRetry) {
        onRetry(attempt, lastError);
      }

      console.log(`[SELF-HEAL] Retry attempt ${attempt}/${maxRetries} after ${initialDelay * Math.pow(2, attempt - 1)}ms`);

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

  throw lastError!;
}
```

**Usage Example:**
```typescript
import { retryWithBackoff } from '@/lib/self-healing/retry';

// In your API route
const data = await retryWithBackoff(
  async () => {
    return await prisma.rawMessage.findMany({ /* ... */ });
  },
  {
    maxRetries: 3,
    initialDelay: 1000,
    onRetry: (attempt, error) => {
      console.log(`[SELF-HEAL] Database query retry ${attempt}: ${error.message}`);
    }
  }
);
```

---

### 2. Circuit Breaker Pattern

**File:** `src/lib/self-healing/circuit-breaker.ts`

```typescript
/**
 * Circuit Breaker Pattern
 * Prevents cascading failures by temporarily disabling failing services
 */
export class CircuitBreaker {
  private failures: number = 0;
  private successes: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private lastFailureTime: number = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly name: string;

  constructor(
    name: string,
    options: {
      failureThreshold?: number; // Open circuit after this many failures
      resetTimeout?: number; // Try again after this many ms
    } = {}
  ) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000; // 30 seconds
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should be reset
    if (this.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure > this.resetTimeout) {
        console.log(`[SELF-HEAL] Circuit breaker ${this.name} moving to HALF_OPEN`);
        this.state = 'HALF_OPEN';
        this.successes = 0;
      } else {
        // Circuit is still open, return cached data or error
        throw new Error(`Circuit breaker ${this.name} is OPEN. Service unavailable.`);
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
      console.log(`[SELF-HEAL] Circuit breaker ${this.name} CLOSED (recovered)`);
      this.state = 'CLOSED';
    }
    this.successes++;
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      if (this.state !== 'OPEN') {
        console.log(`[SELF-HEAL] Circuit breaker ${this.name} OPENED (${this.failures} failures)`);
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
    };
  }
}

// Global circuit breakers for different services
export const circuitBreakers = {
  database: new CircuitBreaker('database', { failureThreshold: 5, resetTimeout: 30000 }),
  assistanceAPI: new CircuitBreaker('assistance-api', { failureThreshold: 3, resetTimeout: 20000 }),
  spamCapture: new CircuitBreaker('spam-capture', { failureThreshold: 3, resetTimeout: 10000 }),
};
```

**Usage Example:**
```typescript
import { circuitBreakers } from '@/lib/self-healing/circuit-breaker';

// In your API route
export async function GET(req: Request) {
  try {
    return await circuitBreakers.database.execute(async () => {
      // Your database operations
      return await prisma.rawMessage.findMany({ /* ... */ });
    });
  } catch (error) {
    if (error.message.includes('Circuit breaker')) {
      // Circuit is open, return cached data or graceful error
      return NextResponse.json({
        success: false,
        error: 'Service temporarily unavailable',
        retryAfter: 30,
        cached: true,
      }, { status: 503 });
    }
    throw error;
  }
}
```

---

### 3. Response Validation Layer

**File:** `src/lib/self-healing/response-validator.ts`

```typescript
/**
 * Validates API responses and handles errors gracefully
 * Prevents JSON parsing errors and ensures valid responses
 */
export async function validateAndParseResponse(
  response: Response,
  options: {
    expectedContentType?: string;
    fallbackError?: string;
  } = {}
): Promise<any> {
  const { expectedContentType = 'application/json', fallbackError = 'Service temporarily unavailable' } = options;

  // Check if response is OK
  if (!response.ok) {
    // Try to extract error message from response
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      // Valid JSON error response
      try {
        const errorData = await response.json();
        return {
          success: false,
          error: errorData.error || errorData.message || fallbackError,
          status: response.status,
          retryAfter: errorData.retryAfter || 2,
        };
      } catch (e) {
        // JSON parse failed even though content-type says JSON
        console.error('[SELF-HEAL] Failed to parse JSON error response:', e);
        return {
          success: false,
          error: fallbackError,
          status: response.status,
          retryAfter: 2,
        };
      }
    } else {
      // HTML error page or other non-JSON response
      console.warn(`[SELF-HEAL] Non-JSON response received (${contentType}), extracting error`);
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
    console.warn(`[SELF-HEAL] Expected JSON but got ${contentType}`);
    return {
      success: false,
      error: 'Invalid response format',
      status: response.status,
    };
  }

  try {
    return await response.json();
  } catch (error) {
    console.error('[SELF-HEAL] JSON parse error:', error);
    return {
      success: false,
      error: 'Failed to parse response',
      status: response.status,
    };
  }
}
```

**Usage Example:**
```typescript
import { validateAndParseResponse } from '@/lib/self-healing/response-validator';

// In your frontend API call
async function fetchAssistanceRequests() {
  try {
    const response = await fetch('/api/manager/assistance', { cache: 'no-store' });
    
    // Use validator instead of direct response.json()
    const data = await validateAndParseResponse(response);
    
    if (data.success) {
      setAssistanceRequests(data.requests);
    } else {
      // Handle error gracefully
      console.warn('[SELF-HEAL] API error:', data.error);
      if (data.retryAfter) {
        // Auto-retry after delay
        setTimeout(() => fetchAssistanceRequests(), data.retryAfter * 1000);
      }
    }
  } catch (error) {
    console.error('[SELF-HEAL] Fetch error:', error);
    // Show user-friendly error
    setError('Unable to load assistance requests. Retrying...');
  }
}
```

---

### 4. Connection Pool Monitor

**File:** `src/lib/self-healing/connection-pool-monitor.ts`

```typescript
import { prisma } from '@/lib/prisma';

/**
 * Monitors database connection pool usage
 * Prevents exhaustion by throttling requests when pool is near capacity
 */
export class ConnectionPoolMonitor {
  private static instance: ConnectionPoolMonitor;
  private currentConnections: number = 0;
  private maxConnections: number = 100;
  private warningThreshold: number = 85; // 85%
  private criticalThreshold: number = 92; // 92%
  private checkInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.startMonitoring();
  }

  static getInstance(): ConnectionPoolMonitor {
    if (!ConnectionPoolMonitor.instance) {
      ConnectionPoolMonitor.instance = new ConnectionPoolMonitor();
    }
    return ConnectionPoolMonitor.instance;
  }

  private async startMonitoring(): Promise<void> {
    // Check connection pool every 5 seconds
    this.checkInterval = setInterval(async () => {
      await this.checkPoolStatus();
    }, 5000);
  }

  private async checkPoolStatus(): Promise<void> {
    try {
      // Query database for current connection count
      const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) as count 
        FROM pg_stat_activity 
        WHERE datname = current_database()
      `;
      
      this.currentConnections = Number(result[0]?.count || 0);
      const usagePercent = (this.currentConnections / this.maxConnections) * 100;

      if (usagePercent >= this.criticalThreshold) {
        console.error(`[SELF-HEAL] CRITICAL: Connection pool at ${usagePercent.toFixed(1)}% (${this.currentConnections}/${this.maxConnections})`);
        this.activateEmergencyMeasures();
      } else if (usagePercent >= this.warningThreshold) {
        console.warn(`[SELF-HEAL] WARNING: Connection pool at ${usagePercent.toFixed(1)}% (${this.currentConnections}/${this.maxConnections})`);
        this.activateWarningMeasures();
      }
    } catch (error) {
      console.error('[SELF-HEAL] Failed to check connection pool:', error);
    }
  }

  private activateWarningMeasures(): void {
    // Throttle non-critical operations
    // This would integrate with your circuit breakers
    console.log('[SELF-HEAL] Activating warning measures: Throttling non-critical operations');
  }

  private activateEmergencyMeasures(): void {
    // Pause all non-essential operations
    console.log('[SELF-HEAL] Activating emergency measures: Pausing non-essential operations');
  }

  getCurrentUsage(): { current: number; max: number; percent: number } {
    return {
      current: this.currentConnections,
      max: this.maxConnections,
      percent: (this.currentConnections / this.maxConnections) * 100,
    };
  }

  canAcceptConnection(): boolean {
    return this.currentConnections < this.maxConnections * 0.9; // Leave 10% buffer
  }

  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

// Export singleton instance
export const connectionPoolMonitor = ConnectionPoolMonitor.getInstance();
```

**Usage Example:**
```typescript
import { connectionPoolMonitor } from '@/lib/self-healing/connection-pool-monitor';

// Before making database query
if (!connectionPoolMonitor.canAcceptConnection()) {
  console.warn('[SELF-HEAL] Connection pool near capacity, queuing request');
  // Queue request or return cached data
  return getCachedData();
}

// Proceed with query
const data = await prisma.rawMessage.findMany({ /* ... */ });
```

---

### 5. Status Transition Validation

**File:** `src/lib/self-healing/status-validator.ts`

```typescript
import { RawStatus } from '@prisma/client';

/**
 * Validates status transitions to prevent invalid state changes
 * This is the validation layer that prevents bugs from causing data corruption
 */
export const ALLOWED_TRANSITIONS: Record<RawStatus, RawStatus[]> = {
  READY: [RawStatus.SPAM_REVIEW, RawStatus.PROMOTED],
  PROMOTED: [], // Terminal state - cannot transition from PROMOTED
  SPAM_REVIEW: [RawStatus.READY, RawStatus.SPAM_ARCHIVED],
  SPAM_ARCHIVED: [], // Terminal state
};

export function canTransition(from: RawStatus, to: RawStatus): boolean {
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

export function validateStatusTransition(
  currentStatus: RawStatus,
  newStatus: RawStatus,
  context?: string
): { valid: boolean; error?: string } {
  if (currentStatus === newStatus) {
    return { valid: true }; // No change is always valid
  }

  if (!canTransition(currentStatus, newStatus)) {
    const error = `Invalid status transition: ${currentStatus} → ${newStatus}${context ? ` (${context})` : ''}`;
    console.error(`[SELF-HEAL] ${error}`);
    return {
      valid: false,
      error,
    };
  }

  return { valid: true };
}
```

**Usage Example:**
```typescript
import { validateStatusTransition } from '@/lib/self-healing/status-validator';
import { RawStatus } from '@prisma/client';

// In your spam capture endpoint
export async function POST() {
  // ... find messages to update ...
  
  for (const rm of batch) {
    if (hits.length) {
      // Validate transition before updating
      const validation = validateStatusTransition(
        rm.status,
        RawStatus.SPAM_REVIEW,
        'spam capture'
      );

      if (!validation.valid) {
        console.warn(`[SELF-HEAL] Skipping message ${rm.id}: ${validation.error}`);
        continue; // Skip invalid transitions
      }

      // Safe to update
      await prisma.rawMessage.update({
        where: { id: rm.id },
        data: {
          status: RawStatus.SPAM_REVIEW,
          previewMatches: hits,
        },
      });
    }
  }
}
```

---

## Integration Examples

### Example 1: Assistance API with Full Self-Healing

**File:** `src/app/api/manager/assistance/route.ts` (Enhanced)

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { retryWithBackoff } from "@/lib/self-healing/retry";
import { circuitBreakers } from "@/lib/self-healing/circuit-breaker";
import { connectionPoolMonitor } from "@/lib/self-healing/connection-pool-monitor";

export async function GET(req: Request) {
  try {
    console.log("🔍 [Assistance API] Loading assistance requests...");

    // Check connection pool before proceeding
    if (!connectionPoolMonitor.canAcceptConnection()) {
      const usage = connectionPoolMonitor.getCurrentUsage();
      console.warn(`[SELF-HEAL] Connection pool at ${usage.percent.toFixed(1)}%, returning cached data`);
      
      // Return cached data or graceful error
      return NextResponse.json({
        success: false,
        error: 'Service temporarily unavailable',
        retryAfter: 5,
        cached: true,
      }, { status: 503 });
    }

    // Execute with circuit breaker and retry
    const tasks = await circuitBreakers.assistanceAPI.execute(async () => {
      return await retryWithBackoff(
        async () => {
          return await prisma.task.findMany({
            where: {
              assistanceNotes: { not: null },
              assignedToId: { not: null },
              OR: [
                { status: "ASSISTANCE_REQUIRED" },
                { 
                  status: "IN_PROGRESS", 
                  managerResponse: { not: null }
                }
              ]
            },
            // ... rest of query ...
          });
        },
        {
          maxRetries: 3,
          initialDelay: 1000,
          onRetry: (attempt, error) => {
            console.log(`[SELF-HEAL] Assistance API retry ${attempt}: ${error.message}`);
          }
        }
      );
    });

    console.log("🔍 [Assistance API] Found", tasks.length, "tasks");

    // Transform and return data
    const requests = tasks.map(task => {
      // ... transformation logic ...
    });

    return NextResponse.json({
      success: true,
      requests
    });

  } catch (error: any) {
    console.error("🔍 [Assistance API] Error:", error);

    // Handle circuit breaker errors
    if (error.message.includes('Circuit breaker')) {
      return NextResponse.json({
        success: false,
        error: 'Service temporarily unavailable',
        retryAfter: 30,
        details: 'Circuit breaker is open',
      }, { status: 503 });
    }

    // Handle other errors
    return NextResponse.json({
      success: false,
      error: error?.message || "Failed to fetch assistance requests",
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}
```

---

### Example 2: Frontend API Call with Self-Healing

**File:** `src/app/manager/page.tsx` (Enhanced)

```typescript
import { validateAndParseResponse } from '@/lib/self-healing/response-validator';
import { retryWithBackoff } from '@/lib/self-healing/retry';

async function loadAssistanceRequests() {
  try {
    console.log("🔍 [Manager] Loading assistance requests...");

    // Use retry with backoff for the fetch
    const data = await retryWithBackoff(
      async () => {
        const response = await fetch("/api/manager/assistance", { 
          cache: "no-store",
          // Add timeout
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });

        // Use validator to handle all response types
        return await validateAndParseResponse(response, {
          fallbackError: 'Unable to load assistance requests',
        });
      },
      {
        maxRetries: 3,
        initialDelay: 1000,
        onRetry: (attempt, error) => {
          console.log(`[SELF-HEAL] Assistance request retry ${attempt}: ${error.message}`);
          // Update UI to show retrying
          setCaptureMsg(`Loading... (retry ${attempt}/3)`);
        }
      }
    );

    if (data.success) {
      // Filter and process requests
      const filteredRequests = (data.requests || []).filter(
        (req: any) => req.taskType !== 'HOLDS'
      );
      
      setAssistanceRequests(filteredRequests);
      setCaptureMsg(null); // Clear any loading messages
    } else {
      // Handle error gracefully
      if (data.retryAfter) {
        // Auto-retry after delay
        console.log(`[SELF-HEAL] Auto-retrying in ${data.retryAfter} seconds`);
        setTimeout(() => {
          loadAssistanceRequests();
        }, data.retryAfter * 1000);
      } else {
        setCaptureMsg(data.error || 'Failed to load assistance requests');
      }
    }

  } catch (error: any) {
    console.error("🔍 [Manager] Error loading assistance requests:", error);
    
    // User-friendly error message
    setCaptureMsg('Unable to load assistance requests. Please try again.');
    
    // Auto-retry after 5 seconds
    setTimeout(() => {
      loadAssistanceRequests();
    }, 5000);
  }
}
```

---

### Example 3: Spam Capture with Self-Healing

**File:** `src/app/api/manager/spam/capture/route.ts` (Enhanced)

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RawStatus } from "@prisma/client";
import { validateStatusTransition } from "@/lib/self-healing/status-validator";
import { retryWithBackoff } from "@/lib/self-healing/retry";
import { circuitBreakers } from "@/lib/self-healing/circuit-breaker";

export async function POST() {
  try {
    // Load rules with retry
    const rules = await retryWithBackoff(
      async () => {
        return await prisma.spamRule.findMany({
          where: { enabled: true },
          select: { id: true, pattern: true, patternNorm: true, mode: true, brand: true },
        });
      },
      { maxRetries: 2, initialDelay: 500 }
    );

    // Get total count with circuit breaker
    const totalReady = await circuitBreakers.database.execute(async () => {
      return await prisma.rawMessage.count({
        where: { status: RawStatus.READY }
      });
    });

    // Process batch (100 items)
    const BATCH_SIZE = 100;
    const batch = await prisma.rawMessage.findMany({
      where: { status: RawStatus.READY },
      select: { id: true, brand: true, text: true, status: true },
      orderBy: { createdAt: "desc" },
      take: BATCH_SIZE,
    });

    if (batch.length === 0) {
      return NextResponse.json({ 
        success: true, 
        updatedCount: 0,
        totalInQueue: totalReady,
        remainingInQueue: totalReady
      });
    }

    // Process and validate
    let updatedCount = 0;
    const updates: Array<{ id: string; hits: string[] }> = [];

    for (const rm of batch) {
      const hits: string[] = [];
      for (const r of rules) {
        if (ruleMatchesText(r, rm.brand, rm.text)) hits.push(r.pattern);
      }
      
      if (hits.length) {
        // Validate transition before adding to updates
        const validation = validateStatusTransition(
          rm.status,
          RawStatus.SPAM_REVIEW,
          'spam capture'
        );

        if (validation.valid) {
          updates.push({ id: rm.id, hits });
        } else {
          console.warn(`[SELF-HEAL] Skipping ${rm.id}: ${validation.error}`);
        }
      }
    }

    // Batch update with retry
    if (updates.length > 0) {
      const CONCURRENT_UPDATES = 10;
      for (let i = 0; i < updates.length; i += CONCURRENT_UPDATES) {
        const chunk = updates.slice(i, i + CONCURRENT_UPDATES);
        
        await Promise.all(
          chunk.map(async ({ id, hits }) => {
            try {
              // Use updateMany with status filter for safety
              const result = await prisma.rawMessage.updateMany({
                where: { 
                  id,
                  status: RawStatus.READY  // Only update if still READY
                },
                data: {
                  status: RawStatus.SPAM_REVIEW,
                  previewMatches: hits,
                },
              });
              return result.count;
            } catch (error) {
              console.error(`[SELF-HEAL] Error updating ${id}:`, error);
              return 0;
            }
          })
        );
        
        // Count successful updates
        const successful = await Promise.all(
          chunk.map(async ({ id }) => {
            const msg = await prisma.rawMessage.findUnique({
              where: { id },
              select: { status: true }
            });
            return msg?.status === RawStatus.SPAM_REVIEW ? 1 : 0;
          })
        );
        updatedCount += successful.reduce((sum, count) => sum + count, 0);
      }
    }

    const remainingInQueue = Math.max(0, totalReady - updatedCount);

    return NextResponse.json({ 
      success: true, 
      updatedCount,
      totalInQueue: totalReady,
      remainingInQueue,
      processed: batch.length
    });

  } catch (error: any) {
    console.error("[SELF-HEAL] Spam capture error:", error);
    
    // Check if it's a circuit breaker error
    if (error.message.includes('Circuit breaker')) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Service temporarily unavailable',
          retryAfter: 30,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { 
        success: false, 
        error: error?.message || "Failed to capture spam",
        details: error?.stack 
      },
      { status: 500 }
    );
  }
}
```

---

## Summary

These code examples show:

1. **Retry Logic**: Automatic retry with exponential backoff
2. **Circuit Breaker**: Prevents cascading failures
3. **Response Validation**: Handles all response types gracefully
4. **Connection Pool Monitoring**: Prevents exhaustion
5. **Status Validation**: Prevents invalid state transitions

**Key Benefits:**
- ✅ Prevents crashes from API errors
- ✅ Automatic recovery from transient failures
- ✅ User-friendly error messages
- ✅ Data integrity maintained
- ✅ System continues operating even when parts fail

**Next Steps:**
1. Create the utility files in `src/lib/self-healing/`
2. Integrate into existing API routes
3. Add monitoring dashboard
4. Test with simulated failures

---

**Document Version:** 1.0  
**Last Updated:** November 2025

