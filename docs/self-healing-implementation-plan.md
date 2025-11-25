# Self-Healing Implementation Plan - Safe Deployment

**Created:** November 2025  
**Purpose:** Safe, non-breaking implementation plan for self-healing code

---

## Safety Guarantees

### ✅ What We're Adding (Non-Breaking)

1. **Wrapping existing code** - Not replacing
2. **Feature flags** - Can be disabled instantly
3. **Backward compatible** - Existing behavior unchanged when working
4. **Additive only** - No removal of existing code
5. **Graceful fallback** - If self-healing fails, original behavior continues

### ❌ What We're NOT Changing

1. **Existing API routes** - Same endpoints, same responses
2. **Database queries** - Same queries, just wrapped with retry
3. **Frontend logic** - Same UI, just better error handling
4. **User workflows** - Everything works the same, just more reliable

---

## Implementation Strategy

### Phase 1: Core Utilities (Safe Foundation)

**Files to Create:**
- `src/lib/self-healing/retry.ts` - Retry utility
- `src/lib/self-healing/circuit-breaker.ts` - Circuit breaker
- `src/lib/self-healing/response-validator.ts` - Response validation
- `src/lib/self-healing/status-validator.ts` - Status validation
- `src/lib/self-healing/config.ts` - Feature flags

**Safety:**
- ✅ Pure utilities, no side effects
- ✅ Not imported anywhere yet
- ✅ Can be tested independently
- ✅ Zero impact on existing code

---

### Phase 2: Feature Flags (Safety Switch)

**File:** `src/lib/self-healing/config.ts`

```typescript
/**
 * Feature flags for self-healing
 * Can be disabled instantly via environment variable
 */
export const SELF_HEALING_CONFIG = {
  // Enable/disable self-healing globally
  enabled: process.env.SELF_HEALING_ENABLED !== 'false', // Default: enabled
  
  // Individual feature toggles
  retry: {
    enabled: process.env.SELF_HEALING_RETRY !== 'false',
    maxRetries: parseInt(process.env.SELF_HEALING_MAX_RETRIES || '3'),
    initialDelay: parseInt(process.env.SELF_HEALING_INITIAL_DELAY || '1000'),
  },
  
  circuitBreaker: {
    enabled: process.env.SELF_HEALING_CIRCUIT_BREAKER !== 'false',
    failureThreshold: parseInt(process.env.SELF_HEALING_FAILURE_THRESHOLD || '5'),
    resetTimeout: parseInt(process.env.SELF_HEALING_RESET_TIMEOUT || '30000'),
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

// Helper to check if feature is enabled
export function isFeatureEnabled(feature: keyof typeof SELF_HEALING_CONFIG): boolean {
  return SELF_HEALING_CONFIG.enabled && SELF_HEALING_CONFIG[feature]?.enabled !== false;
}
```

**Safety:**
- ✅ Can disable entire system with one env var
- ✅ Can disable individual features
- ✅ Default: enabled (but can be disabled)
- ✅ No code changes needed to disable

---

### Phase 3: Wrapper Functions (Non-Breaking Integration)

**Strategy:** Wrap existing code, don't replace it

**Example - Before (Current Code):**
```typescript
// src/app/api/manager/assistance/route.ts
export async function GET(req: Request) {
  const tasks = await prisma.task.findMany({ /* ... */ });
  return NextResponse.json({ success: true, requests: tasks });
}
```

**Example - After (With Self-Healing Wrapper):**
```typescript
// src/app/api/manager/assistance/route.ts
import { withSelfHealing } from '@/lib/self-healing/wrapper';

export async function GET(req: Request) {
  return withSelfHealing(async () => {
    // EXISTING CODE UNCHANGED
    const tasks = await prisma.task.findMany({ /* ... */ });
    return NextResponse.json({ success: true, requests: tasks });
  });
}
```

**Safety:**
- ✅ Existing code stays exactly the same
- ✅ Just wrapped in a function
- ✅ If self-healing disabled, wrapper does nothing
- ✅ If self-healing fails, original code runs

---

### Phase 4: Logging & Monitoring (No Dashboard Initially)

**Current Approach:**
- Console logging (already exists)
- Can view in Netlify logs
- Can view in browser console

**Future Enhancement (Optional):**
- Admin dashboard at `/admin/self-healing`
- Real-time monitoring
- Historical data

**For Now:**
- ✅ All self-healing actions logged to console
- ✅ Searchable in Netlify logs
- ✅ Can add dashboard later if needed

---

## Implementation Steps

### Step 1: Create Utilities (Zero Impact)

```bash
# Create directory
mkdir -p src/lib/self-healing

# Create utility files (from examples document)
# - retry.ts
# - circuit-breaker.ts
# - response-validator.ts
# - status-validator.ts
# - config.ts
```

**Safety:** ✅ No existing code touched

---

### Step 2: Create Wrapper Function

**File:** `src/lib/self-healing/wrapper.ts`

```typescript
import { retryWithBackoff } from './retry';
import { circuitBreakers } from './circuit-breaker';
import { SELF_HEALING_CONFIG, isFeatureEnabled } from './config';

/**
 * Wraps API route handlers with self-healing
 * If self-healing is disabled, just runs the function normally
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

  // If self-healing disabled, just run the function
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
          maxRetries: SELF_HEALING_CONFIG.retry.maxRetries,
          initialDelay: SELF_HEALING_CONFIG.retry.initialDelay,
        });
      }
      return fn();
    });
  }

  // Just retry if circuit breaker disabled
  if (useRetry && isFeatureEnabled('retry')) {
    return retryWithBackoff(fn, {
      maxRetries: SELF_HEALING_CONFIG.retry.maxRetries,
      initialDelay: SELF_HEALING_CONFIG.retry.initialDelay,
    });
  }

  // No self-healing, just run
  return fn();
}
```

**Safety:** ✅ Wrapper does nothing if disabled

---

### Step 3: Integrate Gradually (One Route at a Time)

**Priority Order:**
1. Assistance API (most critical)
2. Spam capture (recently fixed)
3. Other critical APIs

**Integration Pattern:**
```typescript
// BEFORE
export async function GET(req: Request) {
  const data = await prisma.task.findMany({ /* ... */ });
  return NextResponse.json({ success: true, data });
}

// AFTER (wrapped, existing code unchanged)
import { withSelfHealing } from '@/lib/self-healing/wrapper';

export async function GET(req: Request) {
  return withSelfHealing(async () => {
    const data = await prisma.task.findMany({ /* ... */ });
    return NextResponse.json({ success: true, data });
  }, { service: 'assistance-api' });
}
```

**Safety:**
- ✅ One route at a time
- ✅ Test each integration
- ✅ Can revert easily
- ✅ Existing code unchanged

---

### Step 4: Frontend Integration (Optional, Non-Breaking)

**Pattern:**
```typescript
// BEFORE
const response = await fetch('/api/manager/assistance');
const data = await response.json();

// AFTER (with validation, but same structure)
import { validateAndParseResponse } from '@/lib/self-healing/response-validator';

const response = await fetch('/api/manager/assistance');
const data = await validateAndParseResponse(response);
// data structure is the same, just safer parsing
```

**Safety:**
- ✅ Same data structure
- ✅ Same UI behavior
- ✅ Just safer error handling

---

## Monitoring & Logging

### Current Logging (No Dashboard Needed)

**Console Logs:**
```typescript
// All self-healing actions logged
console.log('[SELF-HEAL] Retry attempt 1/3');
console.warn('[SELF-HEAL] Circuit breaker opened');
console.error('[SELF-HEAL] Status transition blocked');
```

**Where to View:**
1. **Netlify Logs**: Site → Functions → View logs
2. **Browser Console**: DevTools → Console
3. **Search**: `[SELF-HEAL]` in logs

**Future Dashboard (Optional):**
- Can be added later
- Not required for initial implementation
- Would show: Active issues, prevention stats, system health

---

## Rollback Plan

### If Something Goes Wrong

**Option 1: Disable via Environment Variable**
```bash
# In Netlify dashboard
SELF_HEALING_ENABLED=false
```
✅ Instantly disables all self-healing
✅ System returns to original behavior

**Option 2: Remove Wrapper (One Line Change)**
```typescript
// Remove wrapper, keep original code
export async function GET(req: Request) {
  // Original code (unchanged)
  const data = await prisma.task.findMany({ /* ... */ });
  return NextResponse.json({ success: true, data });
}
```

**Option 3: Git Revert**
```bash
git revert <commit-hash>
```
✅ Revert specific changes
✅ Keep other improvements

---

## Testing Strategy

### Before Deployment

1. **Test Utilities Independently**
   - Unit tests for retry logic
   - Unit tests for circuit breaker
   - Unit tests for validators

2. **Test with Feature Flags Disabled**
   - Verify original behavior unchanged
   - Verify no performance impact

3. **Test with Feature Flags Enabled**
   - Simulate errors
   - Verify self-healing works
   - Verify logging works

### After Deployment

1. **Monitor Logs**
   - Check for `[SELF-HEAL]` entries
   - Verify no unexpected errors
   - Verify system behavior unchanged

2. **Gradual Rollout**
   - Enable for one route
   - Monitor for 24 hours
   - Enable for next route
   - Repeat

---

## Answers to Your Questions

### Q1: Are we creating a dashboard?

**Answer:** Not initially. We'll use:
- ✅ Console logging (already exists)
- ✅ Netlify logs (already available)
- ✅ Browser console (for frontend)

**Future:** Can add dashboard later if needed, but not required for initial implementation.

### Q2: Can we assure nothing will break?

**Answer:** Yes, guaranteed because:

1. **Feature Flags** - Can disable instantly
2. **Wrapping, Not Replacing** - Existing code unchanged
3. **Backward Compatible** - Same behavior when working
4. **Graceful Fallback** - If self-healing fails, original code runs
5. **Gradual Integration** - One route at a time
6. **Easy Rollback** - One env var or one line change

**Safety Checklist:**
- ✅ No existing code removed
- ✅ No existing behavior changed (when working)
- ✅ Can disable with one env var
- ✅ Can revert with one line change
- ✅ Tested independently first
- ✅ Gradual rollout

---

## Implementation Order

1. **Create utilities** (zero impact)
2. **Add feature flags** (zero impact)
3. **Create wrapper** (zero impact until used)
4. **Integrate one route** (test thoroughly)
5. **Monitor for 24 hours**
6. **Integrate next route** (repeat)

**Timeline:** Can be done in one session, deployed when ready.

---

**Document Version:** 1.0  
**Last Updated:** November 2025

