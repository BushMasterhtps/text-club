# Self-Healing Integration Plan

**Created:** November 2025  
**Purpose:** Prioritized plan for integrating self-healing into remaining endpoints

---

## Current Status

### ✅ Already Integrated:
1. **Spam Capture** - Status validation (prevents invalid transitions)

---

## Priority Integration List

### Priority 1: Critical APIs (Had Errors Today)

#### 1. Assistance API ⚠️ **HIGHEST PRIORITY**
- **File:** `src/app/api/manager/assistance/route.ts`
- **Issue:** Had 500 errors today, JSON parsing errors
- **Integration:** Add retry + circuit breaker + response validation
- **Impact:** Prevents crashes when database connection issues occur

#### 2. Frontend Assistance Request Loading
- **File:** `src/app/manager/page.tsx` (loadAssistanceRequests function)
- **Issue:** JSON parsing errors when API returns HTML
- **Integration:** Add response validation
- **Impact:** Prevents frontend crashes

#### 3. Spam Capture Frontend
- **File:** `src/app/manager/page.tsx` (doCapture function)
- **Issue:** JSON parsing errors on timeout
- **Integration:** Add response validation
- **Impact:** Better error messages, no crashes

---

### Priority 2: High-Traffic APIs (Connection Pool Risk)

#### 4. Agent Progress Endpoint
- **File:** `src/app/api/manager/dashboard/agent-progress/route.ts`
- **Issue:** Was making 160+ queries (now fixed, but add safety)
- **Integration:** Add retry + circuit breaker
- **Impact:** Prevents connection pool exhaustion

#### 5. Metrics Endpoint
- **File:** `src/app/api/manager/dashboard/metrics/route.ts`
- **Issue:** Multiple queries, connection pool risk
- **Integration:** Add retry + circuit breaker
- **Impact:** Prevents connection issues

#### 6. Agents Endpoint
- **File:** `src/app/api/manager/agents/route.ts`
- **Issue:** Was making 50+ queries (now fixed, but add safety)
- **Integration:** Add retry + circuit breaker
- **Impact:** Prevents connection issues

---

### Priority 3: Other Critical Endpoints

#### 7. Task Assignment Endpoints
- **Files:** Various assignment routes
- **Integration:** Add retry for database operations
- **Impact:** Prevents failed assignments

#### 8. Task Completion Endpoints
- **Files:** Task completion routes
- **Integration:** Add status validation + retry
- **Impact:** Prevents invalid status changes

---

## Implementation Order

### Phase 1: Critical (Today)
1. ✅ Spam Capture - Status validation (DONE)
2. 🔄 Assistance API - Retry + circuit breaker
3. 🔄 Frontend Assistance Loading - Response validation

### Phase 2: High-Traffic (Next)
4. Agent Progress - Retry + circuit breaker
5. Metrics - Retry + circuit breaker
6. Agents - Retry + circuit breaker

### Phase 3: Other (Later)
7. Task Assignment - Retry
8. Task Completion - Status validation + retry

---

**Document Version:** 1.0  
**Last Updated:** November 2025

