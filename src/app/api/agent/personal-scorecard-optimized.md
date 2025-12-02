# Permanent Fix for Slow DB Query in Personal Scorecard

## Root Cause
The endpoint fetches ALL completed tasks from the last 3 years (potentially hundreds of thousands of rows), then processes them in memory. Even with indexes, this is inefficient.

## Solution: Use Database Aggregations
Instead of fetching all tasks and processing in memory, use SQL aggregations to get counts and sums directly from the database.

## Implementation Options

### Option 1: Prisma `groupBy` (Recommended)
Use Prisma's `groupBy` to aggregate at the database level:
- Much faster (database does the work)
- Less memory usage
- Still type-safe

### Option 2: Raw SQL Aggregations
Use `prisma.$queryRaw` for maximum performance:
- Full control over query
- Can optimize exactly for our use case
- Slightly less type-safe

### Option 3: Hybrid Approach
- Use aggregations for counts/sums
- Only fetch individual tasks when needed (e.g., for breakdowns)
- Cache results for 5-15 minutes

## Recommended: Option 1 + Caching
1. Replace `findMany` with `groupBy` for aggregations
2. Add Redis/in-memory caching (5-15 min TTL)
3. Keep current structure but optimize data fetching

