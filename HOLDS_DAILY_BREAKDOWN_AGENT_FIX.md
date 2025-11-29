# Holds Daily Breakdown - Agent Display Fix

## Problem

The Daily Breakdown Report was showing "Unassigned" for "Unable to Resolve" tasks, even though the agent who completed them was being tracked correctly. The Resolved Orders and Resolved Orders with Comments reports were correctly showing the agent.

## Root Cause

The Daily Breakdown Report was only using `assignedTo` to determine the agent name:
```typescript
agentName: task.assignedTo?.name || 'Unassigned'
```

However, for "Unable to Resolve" tasks (and other unassigning dispositions), the task gets unassigned (`assignedTo = null`) when completed, but the agent who completed it is tracked in `completedBy` (via the `completedByUser` relation).

## Solution

Updated the Daily Breakdown Report to match the logic used in the Resolved Orders reports:
```typescript
// Use completedBy if available (for unassigned completions like "Unable to Resolve"), otherwise use assignedTo
agentName: task.completedByUser?.name || task.assignedTo?.name || 'Unassigned'
```

## Changes Made

1. **Added `completedByUser` to query select** (line 122-128):
   - Added the `completedByUser` relation to the Prisma query so we have access to the agent who completed the task

2. **Updated all `agentName` assignments** (4 locations):
   - `tasksInQueueAtEndOfDay` mapping (line 272)
   - `newTasks` mapping (line 369)
   - `completedTasks` mapping (line 379)
   - `rolloverTasks` mapping (line 389)

## Result

Now the Daily Breakdown Report will correctly show:
- The agent who completed "Unable to Resolve" tasks (from `completedByUser`)
- The agent assigned to other tasks (from `assignedTo`)
- "Unassigned" only when neither is available

This matches the behavior of the Resolved Orders and Resolved Orders with Comments reports, ensuring consistency across all Holds Analytics reports.

## Testing

- [ ] Verify "Unable to Resolve" tasks show the correct agent in Daily Breakdown
- [ ] Verify other completed tasks still show correct agent
- [ ] Verify unassigned tasks show "Unassigned"
- [ ] Compare with Resolved Orders report to ensure consistency

