# Spam Preview/Capture Errors and N+1 Query Issues - Analysis

## Issues Identified

### 1. Spam Preview HTTP 500 Error
**Symptom:** Preview spam fails with HTTP 500 after initial successful capture  
**Root Cause:**
- Line 154-168: Calls `getImprovedSpamScore()` individually for each message (up to 200)
- Each call makes a separate database query to `SpamLearning` table
- With 1830 messages, even checking 200 causes 200+ queries
- This causes timeout or connection pool exhaustion

**Why it works after refresh:**
- After capture, many messages are moved to `SPAM_REVIEW` status
- Fewer `READY` messages remain, so fewer queries needed
- But the N+1 pattern still exists

### 2. Spam Capture "Inactivity Timeout"
**Symptom:** Capture spam times out but self-heal reports it  
**Root Cause:**
- Processing 1000 messages with 533 rules = 533,000 rule checks
- Even with batching, this is CPU-intensive
- Netlify has a 10-second timeout for serverless functions
- Self-healing wrapper catches the timeout but doesn't report to Sentry

### 3. Sentry Not Catching Errors
**Symptom:** Errors appear in console but not in Sentry  
**Root Cause:**
- `withSelfHealing` wrapper doesn't capture exceptions to Sentry
- Errors are logged to console but not sent to Sentry
- Need to add `Sentry.captureException()` in error handlers

### 4. N+1 Query - `/api/manager/analytics/sprint-history`
**Pattern Size:** 7  
**Repeating Spans:** 6  
**Root Cause:**
- Line 38-79: Makes separate `findMany` query for each sprint number
- If there are 6 sprints, that's 6 separate queries
- Should batch fetch all sprints in one query

### 5. Slow DB Query - `/api/agent/personal-scorecard`
**Duration Impact:** 39% (1.56s/4.01s)  
**Root Cause:**
- Still fetching ALL completed tasks without date filtering
- With large datasets, this query becomes slow
- The previous "fix" only reordered conditions but didn't add date limits

## Fixes Required

1. **Spam Preview:** Batch fetch learning data instead of individual queries
2. **Spam Capture:** Add timeout handling and better error reporting
3. **Sentry Integration:** Add `Sentry.captureException()` to error handlers
4. **Sprint History:** Batch fetch all sprints in one query
5. **Personal Scorecard:** Add date range limits or pagination for large datasets

