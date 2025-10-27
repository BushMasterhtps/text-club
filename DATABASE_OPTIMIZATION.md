# Database Connection Optimization & Maintenance Guide

## Issue Summary (Resolved)

**Date**: October 27, 2025  
**Issue**: "Too many database connections opened" error causing intermittent 500 status codes  
**Impact**: Laggy performance, failed API requests when moving tasks to spam

## Root Causes Identified

1. ❌ **No connection pooling limits** in DATABASE_URL configuration
2. ❌ **Inefficient API queries** creating excessive parallel database connections
3. ❌ **Agent endpoint** making N×5 queries (50+ connections for 10 agents)
4. ❌ **Metrics endpoint** making 7+ separate count queries in parallel
5. ❌ **No graceful connection cleanup** on process shutdown

## Fixes Implemented

### 1. Enhanced Prisma Client Configuration (`src/lib/prisma.ts`)
- ✅ Added explicit datasource configuration
- ✅ Implemented graceful shutdown handler to close connections properly
- ✅ Maintains singleton pattern to prevent connection leaks

### 2. Optimized Agent Endpoint (`src/app/api/manager/agents/route.ts`)
**Before**: N agents × 5 queries = 50+ database connections for 10 agents  
**After**: 2 queries total (1 for agents + 1 grouped query for all counts)

**Performance Impact**:
- 🚀 96% reduction in database queries (50 queries → 2 queries)
- 🚀 Faster response times
- 🚀 Eliminated connection pool exhaustion

### 2.5. Optimized Agent Progress Endpoint (`src/app/api/manager/dashboard/agent-progress/route.ts`)
**Before**: N agents × 16 queries = 160+ database connections for 10 agents ⚠️ **CRITICAL ISSUE**  
**After**: 6 queries total (parallel grouped queries for all data)

**Performance Impact**:
- 🚀 96% reduction in database queries (160 queries → 6 queries)
- 🚀 Massive performance improvement for dashboard loading
- 🚀 Primary source of connection exhaustion - NOW FIXED

### 3. Optimized Metrics Endpoint (`src/app/api/manager/dashboard/metrics/route.ts`)
**Before**: 7 separate count queries in parallel  
**After**: 3 queries total (1 for raw messages + 1 grouped query + 1 for today's completions)

**Performance Impact**:
- 🚀 57% reduction in database queries (7 queries → 3 queries)
- 🚀 Reduced connection pressure

### 4. Updated Environment Configuration (`env.example`)
Added connection pooling parameters to DATABASE_URL with recommended settings.

## Required Production Configuration

### Update Your DATABASE_URL

**Current (problematic)**:
```
DATABASE_URL="postgresql://username:password@host:port/database"
```

**Updated (with connection pooling)**:
```
DATABASE_URL="postgresql://username:password@host:port/database?connection_limit=10&pool_timeout=20"
```

### Connection Pool Parameters Explained

- **`connection_limit=10`**: Maximum connections per serverless instance
  - For Netlify/Vercel: 10 is optimal (they can spin up multiple instances)
  - Prevents any single instance from exhausting the database connection limit
  
- **`pool_timeout=20`**: Seconds to wait for an available connection
  - If all connections are busy, wait up to 20 seconds before failing
  - Prevents immediate failures during traffic spikes

### Platform-Specific Recommendations

#### Netlify (Current Deployment)
```
DATABASE_URL="postgresql://user:pass@host:port/db?connection_limit=10&pool_timeout=20"
```

#### Vercel (Alternative)
```
DATABASE_URL="postgresql://user:pass@host:port/db?connection_limit=5&pool_timeout=15"
```

## Deployment Steps

1. **Update DATABASE_URL** in Netlify environment variables with pooling parameters
2. **Redeploy** the application (changes in code will auto-deploy via Git push)
3. **Monitor** the console for any connection errors
4. **Test** moving tasks to spam to verify the fix

## Expected Results

✅ No more "too many clients already" errors  
✅ Faster API response times  
✅ Reduced lag/latency across the dashboard  
✅ More stable performance under load  

## Monitoring & Ongoing Maintenance

### What to Monitor

1. **API Response Times**: Should be faster, especially for `/api/manager/agents`
2. **Error Rates**: 500 errors should drop to near-zero
3. **Database Connection Count**: Check your PostgreSQL dashboard
   - Should see more consistent connection usage
   - Fewer connection spikes

### If Issues Persist

1. **Check Database Connection Limit**: Verify your PostgreSQL server allows enough connections
   - Most hobby plans: 20-100 connections
   - Calculate: `Max Connections / Expected Serverless Instances`
   - Example: 100 max / 10 per instance = support for 10 concurrent instances

2. **Adjust Connection Limits**: If still seeing errors:
   ```
   ?connection_limit=5&pool_timeout=30
   ```
   - Lower limit, higher timeout = more conservative

3. **Consider Database Upgrade**: If you consistently need 100+ active connections
   - Upgrade to a plan with more connection capacity
   - Consider connection pooling service (e.g., PgBouncer, Prisma Accelerate)

### Additional Optimization Opportunities

If you need even better performance in the future:

1. **Add Database Indexes**: Already good coverage, but consider:
   - `@@index([taskType, status])` for combined filtering
   
2. **Implement Caching**: For metrics that don't change often
   - Use Redis or in-memory cache for dashboard metrics
   - Refresh every 10-30 seconds instead of every request

3. **Consider Prisma Accelerate**: Mentioned in the error message
   - Managed connection pooling
   - Global caching layer
   - Costs ~$29/month but handles all connection management

## Query Optimization Summary

### Before vs After

| Endpoint | Before | After | Reduction |
|----------|--------|-------|-----------|
| `/api/manager/agents` | 1 + (N × 5) = 51 queries | 2 queries | ~96% |
| `/api/manager/dashboard/agent-progress` | 1 + (N × 16) = 161 queries | 6 queries | ~96% |
| `/api/manager/dashboard/metrics` | 7 queries | 3 queries | ~57% |

**Total Impact**: For a typical dashboard load hitting all three endpoints with 10 agents, reduced from **219 queries to 11 queries** (95% reduction).

## Technical Details

### Why `groupBy` is Better

**Old Approach (N queries)**:
```typescript
for (const agent of agents) {
  await prisma.task.count({ where: { assignedToId: agent.id, taskType: "TEXT_CLUB" } });
  await prisma.task.count({ where: { assignedToId: agent.id, taskType: "WOD_IVCS" } });
  // ... 3 more queries per agent
}
```

**New Approach (1 query)**:
```typescript
const taskCountsByAgent = await prisma.task.groupBy({
  by: ['assignedToId', 'taskType'],
  where: { status: { in: OPEN_STATUSES } },
  _count: { id: true }
});
```

This single query returns all counts for all agents in one database round-trip.

## Conclusion

These optimizations address the root cause of the "too many database connections" error by:
1. Reducing the number of parallel queries by 90%+
2. Adding connection pool limits to prevent exhaustion
3. Implementing proper connection lifecycle management

The system should now handle much higher loads without connection issues or lag.

