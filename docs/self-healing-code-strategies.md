# Self-Healing Code Strategies for Text Club Portal

**Created:** December 2024  
**Purpose:** Document self-healing code patterns and strategies to prevent bugs and system failures

---

## Table of Contents

1. [Overview](#overview)
2. [Core Principles](#core-principles)
3. [Implementation Strategies](#implementation-strategies)
4. [Specific Use Cases](#specific-use-cases)
5. [Monitoring and Alerts](#monitoring-and-alerts)
6. [Implementation Roadmap](#implementation-roadmap)

---

## Overview

Self-healing code is software that can automatically detect, diagnose, and recover from errors without human intervention. For the Text Club Portal, this means:

- **Automatic retry** for transient failures
- **Connection pool management** to prevent database exhaustion
- **Data validation** to prevent invalid state transitions
- **Graceful degradation** when services are unavailable
- **Auto-recovery** from common error conditions

---

## Core Principles

### 1. Fail Fast, Recover Fast
- Detect errors immediately
- Attempt automatic recovery before alerting users
- Provide fallback mechanisms

### 2. Idempotency
- Operations should be safe to retry
- Multiple executions produce the same result
- Critical for API endpoints and database operations

### 3. Circuit Breaker Pattern
- Temporarily disable failing services
- Prevent cascading failures
- Auto-resume when service recovers

### 4. Graceful Degradation
- System continues operating with reduced functionality
- Partial results are better than complete failure
- User experience remains acceptable

---

## Implementation Strategies

### 1. Automatic Retry with Exponential Backoff

**Use Case:** API calls, database queries, external service calls

**Implementation:**
```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on certain errors (4xx client errors)
      if (error instanceof Error && error.message.includes('400')) {
        throw error;
      }
      
      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError!;
}
```

**Benefits:**
- Handles transient network issues
- Reduces false error reports
- Improves user experience

---

### 2. Database Connection Pool Management

**Use Case:** Prevent "too many clients already" errors

**Current Issue:** Multiple PrismaClient instances created connection pool exhaustion

**Solution:**
```typescript
// ✅ GOOD: Shared singleton
import { prisma } from "@/lib/prisma";

// ❌ BAD: Multiple instances
const prisma = new PrismaClient();
```

**Additional Safeguards:**
```typescript
// In src/lib/prisma.ts
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    // Connection pool settings
    connection_limit: 10,
    pool_timeout: 20,
  });

// Graceful shutdown
if (process.env.NODE_ENV === 'production') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect();
  });
}
```

---

### 3. Status Transition Validation

**Use Case:** Prevent invalid state changes (e.g., PROMOTED → SPAM_REVIEW)

**Implementation:**
```typescript
// Validate status transitions
const ALLOWED_TRANSITIONS: Record<RawStatus, RawStatus[]> = {
  READY: [RawStatus.SPAM_REVIEW, RawStatus.PROMOTED],
  PROMOTED: [], // Cannot transition from PROMOTED
  SPAM_REVIEW: [RawStatus.READY, RawStatus.SPAM_ARCHIVED],
  SPAM_ARCHIVED: [], // Terminal state
};

function canTransition(from: RawStatus, to: RawStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

// Use in updates
async function updateStatus(id: string, newStatus: RawStatus) {
  const current = await prisma.rawMessage.findUnique({
    where: { id },
    select: { status: true }
  });
  
  if (!current || !canTransition(current.status, newStatus)) {
    throw new Error(`Invalid status transition: ${current?.status} → ${newStatus}`);
  }
  
  return prisma.rawMessage.update({
    where: { id },
    data: { status: newStatus }
  });
}
```

---

### 4. Batch Processing with Progress Tracking

**Use Case:** Large operations (spam capture, imports, bulk updates)

**Implementation:**
```typescript
async function processBatch<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  batchSize: number = 100,
  onProgress?: (processed: number, total: number) => void
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    // Process batch with concurrency limit
    const CONCURRENT = 10;
    for (let j = 0; j < batch.length; j += CONCURRENT) {
      const chunk = batch.slice(j, j + CONCURRENT);
      await Promise.all(chunk.map(processor));
    }
    
    // Report progress
    if (onProgress) {
      onProgress(Math.min(i + batchSize, items.length), items.length);
    }
  }
}
```

**Benefits:**
- Prevents timeouts
- Shows progress to users
- Limits resource usage

---

### 5. Health Checks and Auto-Recovery

**Use Case:** Database connection monitoring, service health

**Implementation:**
```typescript
async function healthCheck(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
}

// Auto-recovery on connection loss
async function withAutoRecovery<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Check health before operation
      if (!(await healthCheck())) {
        // Attempt reconnection
        await prisma.$disconnect();
        await prisma.$connect();
      }
      
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts - 1) throw error;
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  
  throw new Error('Max attempts reached');
}
```

---

### 6. Error Boundary and Fallback UI

**Use Case:** React component errors, API failures

**Implementation:**
```typescript
// Error boundary component
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    // Log to monitoring service
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <div className="error-fallback">
          <h2>Something went wrong</h2>
          <button onClick={() => window.location.reload()}>
            Reload Page
          </button>
        </div>
      );
    }
    
    return this.props.children;
  }
}
```

---

### 7. Data Validation and Auto-Correction

**Use Case:** Invalid data states, orphaned records

**Implementation:**
```typescript
// Auto-cleanup orphaned tasks
async function cleanupOrphanedTasks() {
  // Find tasks with invalid rawMessageId
  const orphaned = await prisma.task.findMany({
    where: {
      rawMessageId: { not: null },
      rawMessage: null, // Raw message doesn't exist
    },
    select: { id: true }
  });
  
  if (orphaned.length > 0) {
    console.log(`Cleaning up ${orphaned.length} orphaned tasks`);
    await prisma.task.deleteMany({
      where: { id: { in: orphaned.map(t => t.id) } }
    });
  }
}

// Run periodically (e.g., daily)
setInterval(cleanupOrphanedTasks, 24 * 60 * 60 * 1000);
```

---

## Specific Use Cases

### Use Case 1: Spam Capture Button

**Problem:** Timeout errors, connection pool exhaustion

**Solution:**
- ✅ Process 100 items at a time (not all at once)
- ✅ Show progress: "Captured 100 / X (total in queue)"
- ✅ Only scan READY messages (not PROMOTED)
- ✅ Batch updates with concurrency limits
- ✅ Proper error handling with user feedback

**Status:** ✅ Implemented

---

### Use Case 2: Database Connection Pool

**Problem:** "Too many clients already" errors

**Solution:**
- ✅ Use shared PrismaClient singleton
- ✅ Remove all `new PrismaClient()` instances
- ✅ Add connection pool configuration
- ✅ Graceful shutdown on process exit

**Status:** ✅ Implemented

---

### Use Case 3: API Timeout Protection

**Problem:** Large operations exceed Netlify function timeout

**Solution:**
- ✅ Batch processing (100 items per batch)
- ✅ Progress tracking
- ✅ Early return on completion
- ✅ Background job pattern for very large operations

**Status:** ✅ Implemented for spam capture

---

### Use Case 4: Invalid Status Transitions

**Problem:** PROMOTED messages moved to SPAM_REVIEW

**Solution:**
- ✅ Only scan READY messages in capture endpoint
- ✅ Validate status before updates
- ✅ Use `updateMany` with status filter to prevent race conditions

**Status:** ✅ Implemented

---

## Monitoring and Alerts

### 1. Error Logging

```typescript
function logError(error: Error, context: Record<string, any>) {
  console.error('Error:', {
    message: error.message,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString(),
  });
  
  // Send to monitoring service (e.g., Sentry, LogRocket)
  // if (process.env.NODE_ENV === 'production') {
  //   monitoringService.captureException(error, { extra: context });
  // }
}
```

### 2. Performance Monitoring

```typescript
async function withTiming<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    console.log(`[${name}] Completed in ${duration}ms`);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`[${name}] Failed after ${duration}ms:`, error);
    throw error;
  }
}
```

### 3. Health Check Endpoint

```typescript
// src/app/api/health/route.ts
export async function GET() {
  const checks = {
    database: await checkDatabase(),
    timestamp: new Date().toISOString(),
  };
  
  const healthy = Object.values(checks).every(v => v === true);
  
  return NextResponse.json(checks, {
    status: healthy ? 200 : 503
  });
}
```

---

## Implementation Roadmap

### Phase 1: Critical Fixes (✅ Completed)
- [x] Fix database connection pool exhaustion
- [x] Fix spam capture to only scan READY messages
- [x] Add progress tracking for spam capture
- [x] Add proper error handling

### Phase 2: Core Self-Healing (Next)
- [ ] Implement retry with exponential backoff for API calls
- [ ] Add status transition validation
- [ ] Implement health check endpoint
- [ ] Add error boundary to React components

### Phase 3: Advanced Features
- [ ] Circuit breaker pattern for external services
- [ ] Auto-cleanup of orphaned records
- [ ] Performance monitoring and alerting
- [ ] Graceful degradation for non-critical features

### Phase 4: Monitoring and Observability
- [ ] Error tracking service integration
- [ ] Performance metrics dashboard
- [ ] Automated alerting for critical errors
- [ ] Daily health reports

---

## Best Practices

1. **Always use the shared PrismaClient** - Never create new instances
2. **Validate before updating** - Check current state before transitions
3. **Batch large operations** - Process in chunks to prevent timeouts
4. **Handle errors gracefully** - Provide user feedback, don't crash silently
5. **Log everything** - Include context for debugging
6. **Test error scenarios** - Simulate failures to ensure recovery works
7. **Monitor in production** - Track errors and performance metrics

---

## Conclusion

Self-healing code reduces manual intervention, improves reliability, and provides better user experience. Start with critical fixes (connection pooling, error handling), then gradually add more sophisticated patterns (retry logic, circuit breakers, auto-recovery).

**Key Takeaways:**
- ✅ Fix connection pool issues (use singleton)
- ✅ Fix spam capture (only READY, batch processing)
- ✅ Add error handling and progress tracking
- 🔄 Next: Add retry logic and validation
- 🔄 Future: Advanced monitoring and auto-recovery

---

**Document Version:** 1.0  
**Last Updated:** December 2024  
**Maintained By:** Development Team

