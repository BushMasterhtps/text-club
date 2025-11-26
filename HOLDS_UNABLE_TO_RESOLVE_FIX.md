# Holds "Unable to Resolve" Completion Tracking Issue

## 🔍 Issue Summary

**Problem:** Tasks marked with "Unable to Resolve" disposition are not being counted in agent completion stats, even though they should count as completed work.

**Example:** Magaly completed 27 tasks and 1 "Unable to Resolve" task this morning. The dashboard shows 27 completed, but should show 28.

---

## 📋 Root Cause Analysis

### What Happens When "Unable to Resolve" is Selected

When an agent selects "Unable to Resolve" for a Holds task, the system:

1. ✅ Sets `status = "COMPLETED"` (correct - task is complete for the agent)
2. ✅ Sets `disposition = "Unable to Resolve"` (correct)
3. ✅ Sets `assignedToId = null` (unassigns the task so it can be reassigned to another queue)
4. ✅ Updates `holdsStatus` to move it to the appropriate queue (Customer Contact or Escalated Call 4+ Day)

**The Problem:**
- The completion stats query in `/api/agent/completion-stats/route.ts` only looks for:
  ```typescript
  {
    assignedToId: user.id,
    status: 'COMPLETED',
    endTime: { ... }
  }
  ```
- Since `assignedToId` is set to `null` when "Unable to Resolve" is selected, the task doesn't match this query!
- Unlike WOD/IVCS tasks which use `sentBackBy` to track who completed them, Holds tasks don't have this mechanism.

### Code Location

**File:** `src/app/api/agent/tasks/[id]/complete/route.ts`

```typescript
// Lines 104-116
} else if (disposition === "Unable to Resolve") {
  // Handle "Unable to Resolve" based on current queue
  if (task.holdsStatus === "Escalated Call 4+ Day") {
    newStatus = "COMPLETED"; // Task is complete for THIS agent (counts towards their stats)
    newHoldsQueue = "Escalated Call 4+ Day";
    shouldUnassign = true; // Remove from agent's queue so it can be reassigned
  } else {
    // From other queues: Move to Customer Contact queue
    newStatus = "COMPLETED"; // Task is complete for THIS agent (counts towards their stats)
    newHoldsQueue = "Customer Contact";
    shouldUnassign = true; // Remove from agent's queue so it can be reassigned
  }
}
```

**File:** `src/app/api/agent/completion-stats/route.ts`

```typescript
// Lines 60-85 - This query doesn't find unassigned completed tasks
const completionStats = await prisma.task.groupBy({
  by: ['taskType'],
  where: {
    OR: [
      {
        assignedToId: user.id,  // ❌ This won't match if assignedToId is null!
        status: 'COMPLETED',
        endTime: { ... }
      },
      {
        sentBackBy: user.id,  // This only works for WOD/IVCS, not Holds
        status: 'PENDING',
        endTime: { ... }
      }
    ]
  },
  ...
});
```

---

## ✅ Verification Steps

Before making changes, I've created a verification script to check the live database:

**Script:** `check-holds-unable-to-resolve.js`

This script will:
1. Find Magaly's user record
2. Check all Holds tasks completed today
3. Identify tasks with "Unable to Resolve" disposition
4. Check if they're being counted in completion stats
5. Show the discrepancy

**To run the verification:**
```bash
node check-holds-unable-to-resolve.js
```

---

## 🛠️ Solution Options

### Option 1: Track Completed By (Recommended) ⭐

Add a `completedBy` field to track who completed the task, similar to `sentBackBy` for WOD/IVCS.

**Pros:**
- Clean, explicit tracking
- Works for all dispositions that unassign tasks
- Consistent with existing `sentBackBy` pattern

**Cons:**
- Requires database migration
- Need to update completion logic

**Implementation:**
1. Add `completedBy` field to Task model
2. Set `completedBy = user.id` when "Unable to Resolve" is selected
3. Update completion stats query to include `completedBy = user.id`

---

### Option 2: Use Queue History to Track Completion

Use the existing `holdsQueueHistory` to identify who completed the task.

**Pros:**
- No schema changes needed
- Uses existing data structure

**Cons:**
- More complex query logic
- Relies on queue history format
- Less explicit than dedicated field

**Implementation:**
1. Ensure queue history includes agent ID when task is completed
2. Update completion stats query to check queue history

---

### Option 3: Don't Unassign on "Unable to Resolve"

Keep the task assigned to the agent even after "Unable to Resolve" is selected.

**Pros:**
- Simplest fix - no query changes needed
- Task stays in agent's completion count

**Cons:**
- Task remains in agent's assigned list
- May cause confusion in queue management
- Doesn't solve the root issue

---

## 🎯 Recommended Solution: Option 1 (Track Completed By)

### Implementation Plan

#### Step 1: Database Migration

Add `completedBy` field to Task model:

```prisma
// prisma/schema.prisma
model Task {
  // ... existing fields ...
  completedBy   String?  // Track who completed the task (for unassigned completions)
  completedAt   DateTime? // When the task was completed by this agent
}
```

Run migration:
```bash
npx prisma migrate dev --name add_completed_by_tracking
```

#### Step 2: Update Completion Logic

**File:** `src/app/api/agent/tasks/[id]/complete/route.ts`

Update the task completion to set `completedBy` when unassigning:

```typescript
// Around line 159-182
const updatedTask = await prisma.task.update({
  where: { id },
  data: {
    status: isSendBack ? "PENDING" : (task.taskType === "HOLDS" ? newStatus : "COMPLETED"),
    endTime: new Date(),
    durationSec,
    disposition,
    sfCaseNumber: sfCaseNumber || null,
    assignedToId: isSendBack ? null : (task.taskType === "HOLDS" && shouldUnassign ? null : task.assignedToId),
    // Add completedBy tracking for Holds tasks that are unassigned
    ...(task.taskType === "HOLDS" && shouldUnassign && newStatus === "COMPLETED" ? {
      completedBy: user.id,
      completedAt: new Date()
    } : {}),
    updatedAt: new Date(),
    // ... rest of updates
  }
});
```

#### Step 3: Update Completion Stats Query

**File:** `src/app/api/agent/completion-stats/route.ts`

Update the query to include `completedBy`:

```typescript
// Lines 60-85
const completionStats = await prisma.task.groupBy({
  by: ['taskType'],
  where: {
    OR: [
      {
        assignedToId: user.id,
        status: 'COMPLETED',
        endTime: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      {
        sentBackBy: user.id,
        status: 'PENDING',
        endTime: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      // NEW: Include tasks completed by this user but now unassigned
      {
        completedBy: user.id,
        status: 'COMPLETED',
        endTime: {
          gte: startOfDay,
          lte: endOfDay
        }
      }
    ]
  },
  _count: {
    id: true
  }
});
```

#### Step 4: Update Analytics Queries

Update all analytics endpoints that calculate completed work to include `completedBy`:

1. **`/api/holds/analytics/route.ts`** - `getAgentPerformance()` function
2. **`/api/manager/dashboard/completed-work/route.ts`** - Completed work query
3. Any other endpoints that count completed Holds tasks

---

## 📊 Affected Dispositions

This fix will also apply to other dispositions that unassign tasks:

- ✅ "Unable to Resolve" (all queues)
- ✅ "In Communication" (Customer Contact queue)
- ✅ "International Order - Unable to Call/ Sent Email"
- ✅ "Duplicate" (moves to Duplicates queue)

All of these should count as completed work for the agent.

---

## 🧪 Testing Checklist

After implementation:

- [ ] Verify "Unable to Resolve" tasks are counted in agent completion stats
- [ ] Verify "In Communication" tasks are counted
- [ ] Verify "International Order" tasks are counted
- [ ] Verify "Duplicate" tasks are counted
- [ ] Check agent portal dashboard shows correct count
- [ ] Check analytics/completed work shows correct count
- [ ] Verify tasks are still properly unassigned and moved to correct queues
- [ ] Test with multiple agents to ensure no cross-contamination
- [ ] Verify historical data (tasks completed before fix)

---

## 🔄 Migration Strategy

1. **Deploy database migration** (adds `completedBy` and `completedAt` fields)
2. **Deploy code changes** (updates completion logic and queries)
3. **Backfill existing data** (optional - set `completedBy` for existing unassigned completed tasks)

**Backfill Script** (optional):
```typescript
// For tasks that are COMPLETED, unassigned, and have "Unable to Resolve" disposition
// We can try to infer who completed them from queue history or leave as null
// (only new completions will have completedBy set)
```

---

## 📝 Files to Modify

1. `prisma/schema.prisma` - Add `completedBy` and `completedAt` fields
2. `src/app/api/agent/tasks/[id]/complete/route.ts` - Set `completedBy` on completion
3. `src/app/api/agent/completion-stats/route.ts` - Include `completedBy` in query
4. `src/app/api/holds/analytics/route.ts` - Update `getAgentPerformance()`
5. `src/app/api/manager/dashboard/completed-work/route.ts` - Update completed work query
6. Any other analytics endpoints that count completed Holds tasks

---

## ⚠️ Important Notes

- **No Breaking Changes:** This is an additive change. Existing functionality remains the same.
- **Backward Compatible:** Tasks completed before this fix won't have `completedBy` set, but they'll still be counted if they're currently assigned.
- **Database Impact:** Minimal - just adding two nullable fields.
- **Performance:** Negligible - just adding one more OR condition to existing queries.

---

## 🚀 Next Steps

1. **Verify the issue** using `check-holds-unable-to-resolve.js` script
2. **Review this plan** and confirm approach
3. **Create database migration** for `completedBy` field
4. **Update completion logic** to set `completedBy`
5. **Update all queries** to include `completedBy`
6. **Test thoroughly** with multiple agents and dispositions
7. **Deploy to production**

---

**Status:** Ready for implementation after verification  
**Risk Level:** Low (additive changes, no breaking changes)  
**Estimated Time:** 2-3 hours (including testing)

