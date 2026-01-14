# Option 3 Implementation Plan: Enhanced Task Counts & Pending Tasks Filter

## Overview
This plan implements Option 3 to solve the confusion between "assigned but not started" vs "unassigned" tasks without adding a new database status. We'll use the existing `assignedToId` field combined with `status` to differentiate these states.

---

## Core Logic Definitions

### Task States (using existing fields):
1. **Unassigned**: `assignedToId IS NULL AND status = 'PENDING'` (or `RawMessage.status = 'READY'`)
2. **Assigned (Not Started)**: `assignedToId IS NOT NULL AND status = 'PENDING'`
3. **In Progress**: `status = 'IN_PROGRESS'`
4. **Completed**: `status = 'COMPLETED'`

### Display Logic:
- **"Pending Tasks" Section**: Show ONLY unassigned tasks (`assignedToId IS NULL`)
- **Agent Counts**: Show separate counts for:
  - "Assigned (Not Started)": Tasks assigned but not yet started
  - "In Progress": Tasks actively being worked on
  - "Assigned" (total): Sum of both (for backward compatibility)

---

## Implementation Steps

### Phase 1: Backend API Updates

#### 1.1 Update `/api/manager/dashboard/agent-progress/route.ts`
**Purpose**: Add "assignedNotStarted" count alongside existing counts

**Changes**:
- Add new `groupBy` query for `PENDING` tasks with `assignedToId IS NOT NULL`
- Create `assignedNotStartedMap` similar to `inProgressMap`
- Update response to include:
  ```typescript
  {
    assigned,              // Total assigned (backward compat)
    assignedNotStarted,    // NEW: PENDING with assignedToId
    inProgress,           // Existing: IN_PROGRESS
    completedToday,       // Existing
    taskTypeBreakdown: {
      textClub: {
        assigned,              // Total
        assignedNotStarted,    // NEW
        inProgress,           // Existing
        completedToday        // Existing
      },
      // ... same for other task types
    }
  }
  ```

**Key Logic**:
```typescript
// NEW: Group assigned but not started tasks
prisma.task.groupBy({
  by: ['assignedToId', 'taskType'],
  where: {
    assignedToId: { not: null },
    status: "PENDING"  // Only PENDING, not IN_PROGRESS
  },
  _count: { id: true }
})
```

**Backward Compatibility**: Keep `assigned` field as sum of `assignedNotStarted + inProgress` for any code that depends on it.

---

#### 1.2 Update `/api/manager/tasks/route.ts`
**Purpose**: Filter "Pending Tasks" to show only unassigned tasks

**Changes**:
- Modify the `"pending"` case in `statusWhere` to exclude assigned tasks:
  ```typescript
  case "pending":
    return {
      OR: [
        { status: "READY" as any }, // Raw messages (always unassigned)
        {
          AND: [
            { status: "PROMOTED" as any },
            { tasks: { some: { 
              status: "PENDING" as any,
              assignedToId: null,  // NEW: Only unassigned tasks
              taskType: taskType as any
            } } },
          ],
        },
      ],
    };
  ```

**Important**: This change affects what managers see in "Pending Tasks". Previously it showed all PENDING tasks (assigned + unassigned). Now it will only show unassigned.

**Alternative Approach**: Add a new status filter `"pending_unassigned"` and keep `"pending"` as-is for backward compatibility. But this adds complexity.

**Decision**: We'll update `"pending"` to mean "unassigned pending" since that's what managers need to see for assignment purposes.

---

#### 1.3 Update `/api/manager/dashboard/metrics/route.ts` (Optional)
**Purpose**: Update "Pending" count in overview to reflect only unassigned tasks

**Changes**:
- Modify `pendingTasks` calculation to only count unassigned:
  ```typescript
  const pendingTasks = await prisma.task.count({
    where: {
      taskType: "TEXT_CLUB",
      status: "PENDING",
      assignedToId: null  // NEW: Only unassigned
    }
  });
  ```

**Note**: This affects the overview metrics. The "Pending" count will now only show unassigned tasks, which is more accurate for managers.

---

### Phase 2: Frontend UI Updates

#### 2.1 Update `AgentProgressSection` in `src/app/manager/page.tsx`
**Purpose**: Display new "Assigned (Not Started)" count in the table

**Changes**:
- Update TypeScript interface `AgentProgress` to include `assignedNotStarted`
- Add new table column: "Assigned (Not Started)" between "Assigned" and "In Progress"
- Update table header:
  ```typescript
  <th className="px-3 py-2 w-28">Assigned</th>
  <th className="px-3 py-2 w-32">Not Started</th>  // NEW
  <th className="px-3 py-2 w-32">In Progress</th>
  ```
- Update table body to show:
  ```typescript
  <td><Badge tone="muted">{r.assigned}</Badge></td>
  <td><Badge tone="info">{r.assignedNotStarted}</Badge></td>  // NEW
  <td><Badge tone="warning">{r.inProgress}</Badge></td>
  ```
- Update task breakdown tooltip to show both counts

**Visual Design**:
- "Assigned" (total): Muted badge (gray)
- "Not Started": Info badge (blue) - indicates waiting for agent action
- "In Progress": Warning badge (orange/yellow) - indicates active work

---

#### 2.2 Update `PendingTasksSection.tsx`
**Purpose**: Add visual indicators to show assignment status

**Changes**:
- Add badge/indicator in the "Assigned" column:
  - If `assignedToId IS NULL`: Show "Unassigned" badge (red/orange)
  - If `assignedToId IS NOT NULL`: Show "Assigned to [Agent Name]" with a subtle indicator
- Update the table to make assignment status more obvious:
  ```typescript
  <td className="px-3 py-2">
    {task.assignedTo ? (
      <div>
        <Badge tone="info">Assigned to {task.assignedTo.name}</Badge>
        <div className="text-xs text-white/50 mt-1">Waiting for agent to start</div>
      </div>
    ) : (
      <Badge tone="warning">Unassigned</Badge>
    )}
  </td>
  ```

**Note**: Since we're filtering "Pending Tasks" to only show unassigned, this column should mostly show "Unassigned" badges. But we keep it for edge cases and clarity.

---

#### 2.3 Update Task Breakdown Display
**Purpose**: Show detailed counts in the task breakdown tooltip/popover

**Changes**:
- Update the task breakdown in `AgentProgressSection` to show:
  ```
  Text: 42 total (36 not started, 6 in progress)
  WOD: 10 total (8 not started, 2 in progress)
  ```
- Or use a more compact format:
  ```
  Text: 36⏸️ 6▶️
  ```
  Where ⏸️ = not started, ▶️ = in progress

---

### Phase 3: Edge Cases & Testing

#### 3.1 Edge Cases to Handle

**Case 1: Task Reassignment**
- When a task is unassigned, it should appear in "Pending Tasks" again
- When a task is reassigned, it should disappear from "Pending Tasks"
- **Solution**: The `assignedToId IS NULL` filter handles this automatically

**Case 2: Task Status Transitions**
- When agent starts a task: `PENDING` → `IN_PROGRESS`
  - Should move from "Assigned (Not Started)" to "In Progress" count
  - Should disappear from "Pending Tasks" (already filtered out)
- **Solution**: Status change is handled by existing logic, counts update automatically

**Case 3: Multiple Task Types**
- Ensure all task types (TEXT_CLUB, WOD_IVCS, EMAIL_REQUESTS, etc.) are handled
- **Solution**: The `groupBy` queries already group by `taskType`, so all types are covered

**Case 4: RawMessages vs Tasks**
- RawMessages in `READY` status should still appear in "Pending Tasks"
- **Solution**: The `OR` clause in the query handles this: `{ status: "READY" }` OR `{ tasks: { some: { status: "PENDING", assignedToId: null } } }`

**Case 5: Backward Compatibility**
- Any code that reads `assigned` field should still work
- **Solution**: Keep `assigned = assignedNotStarted + inProgress` for compatibility

---

#### 3.2 Testing Checklist

**Backend API Tests**:
- [ ] `/api/manager/dashboard/agent-progress` returns `assignedNotStarted` field
- [ ] `assignedNotStarted` count is correct (PENDING with assignedToId)
- [ ] `inProgress` count is correct (IN_PROGRESS)
- [ ] `assigned` = `assignedNotStarted + inProgress` (backward compat)
- [ ] Task breakdown includes `assignedNotStarted` for all task types

**Pending Tasks API Tests**:
- [ ] `/api/manager/tasks?status=pending` only returns unassigned tasks
- [ ] Assigned tasks (PENDING with assignedToId) do NOT appear
- [ ] RawMessages (READY) still appear
- [ ] Unassigned tasks (PENDING with assignedToId = null) appear

**UI Tests**:
- [ ] Agent Progress table shows "Assigned (Not Started)" column
- [ ] Counts are accurate and update in real-time
- [ ] Task breakdown shows both counts
- [ ] "Pending Tasks" section only shows unassigned tasks
- [ ] Visual indicators are clear and intuitive

**Integration Tests**:
- [ ] Assigning a task removes it from "Pending Tasks"
- [ ] Unassigning a task adds it back to "Pending Tasks"
- [ ] Starting a task moves it from "Not Started" to "In Progress"
- [ ] All task types work correctly (TEXT_CLUB, WOD_IVCS, EMAIL_REQUESTS, etc.)

---

## Potential Issues & Mitigations

### Issue 1: Breaking Change in "Pending Tasks" Filter
**Problem**: If any code depends on "Pending Tasks" showing all PENDING tasks (assigned + unassigned), this change will break it.

**Mitigation**:
- Search codebase for usages of `status=pending` in manager portal
- Verify all usages expect unassigned-only behavior
- If needed, add a new filter `status=pending_all` for backward compatibility

**Risk Level**: Medium
**Action**: Search and verify before deploying

---

### Issue 2: Performance Impact
**Problem**: Adding another `groupBy` query might slow down the agent-progress endpoint.

**Mitigation**:
- The new query is similar to existing ones, so performance impact should be minimal
- All queries run in parallel with `Promise.all()`
- Monitor query performance after deployment

**Risk Level**: Low
**Action**: Monitor performance metrics

---

### Issue 3: UI Clutter
**Problem**: Adding another column might make the table too wide or cluttered.

**Mitigation**:
- Use compact badges and tooltips
- Consider making "Assigned" column show a tooltip with breakdown
- Or combine "Assigned" and "Not Started" into one column with sub-counts

**Risk Level**: Low
**Action**: Test UI on different screen sizes, adjust if needed

---

### Issue 4: Confusion with Terminology
**Problem**: "Assigned (Not Started)" might be confusing to managers.

**Mitigation**:
- Use clear labels: "Assigned (Not Started)" or "Waiting to Start"
- Add tooltips explaining the difference
- Consider icons: ⏸️ for "Not Started", ▶️ for "In Progress"

**Risk Level**: Low
**Action**: Get manager feedback, adjust labels if needed

---

## Rollout Plan

### Step 1: Backend Changes (Non-Breaking)
1. Update `/api/manager/dashboard/agent-progress/route.ts`
   - Add `assignedNotStarted` query and mapping
   - Keep `assigned` field for backward compatibility
   - Test API response

2. Update `/api/manager/tasks/route.ts`
   - Modify `"pending"` filter to exclude assigned tasks
   - Test that only unassigned tasks are returned

3. Deploy backend changes
   - Monitor for errors
   - Verify API responses are correct

### Step 2: Frontend Changes
1. Update TypeScript interfaces
   - Add `assignedNotStarted` to `AgentProgress` interface

2. Update `AgentProgressSection` component
   - Add new column
   - Update display logic

3. Update `PendingTasksSection` component
   - Add visual indicators
   - Verify filtering works

4. Test UI thoroughly
   - All task types
   - All edge cases
   - Different screen sizes

### Step 3: Deployment
1. Deploy to staging/test environment
2. Have managers test the new UI
3. Gather feedback
4. Make adjustments if needed
5. Deploy to production

---

## Success Criteria

✅ Managers can clearly see:
- How many tasks are unassigned (in "Pending Tasks")
- How many tasks each agent has assigned but not started
- How many tasks each agent has in progress

✅ Counts are accurate and update in real-time

✅ No breaking changes to existing functionality

✅ Performance is acceptable (no significant slowdown)

✅ UI is clear and intuitive

---

## Rollback Plan

If issues arise, we can rollback by:
1. Reverting the `"pending"` filter change in `/api/manager/tasks/route.ts`
2. Removing the `assignedNotStarted` field from the API response (keeping it as optional)
3. Removing the new UI column (it will just show 0 if field is missing)

**Note**: Since we're keeping backward compatibility (`assigned` field still exists), the rollback should be smooth.

---

## Future Enhancements (Post-Implementation)

1. **Filter Toggle**: Add a toggle in "Pending Tasks" to show "All Pending" vs "Unassigned Only"
2. **Bulk Actions**: Add bulk action to assign all visible unassigned tasks
3. **Sorting**: Allow sorting by assignment status in "Pending Tasks"
4. **Notifications**: Alert managers when agents have many "Not Started" tasks
5. **Analytics**: Track time between assignment and start (to identify bottlenecks)

---

## Files to Modify

### Backend (3 files):
1. `src/app/api/manager/dashboard/agent-progress/route.ts`
2. `src/app/api/manager/tasks/route.ts`
3. `src/app/api/manager/dashboard/metrics/route.ts` (optional)

### Frontend (2 files):
1. `src/app/manager/page.tsx` (AgentProgressSection)
2. `src/app/manager/_components/PendingTasksSection.tsx`

### TypeScript Interfaces (1 file):
1. `src/app/manager/page.tsx` (AgentProgress interface)

**Total**: ~6 files to modify

---

## Estimated Time
- Backend changes: 2-3 hours
- Frontend changes: 2-3 hours
- Testing & debugging: 2-3 hours
- **Total**: 6-9 hours

---

## Questions to Resolve Before Implementation

1. **Terminology**: Do we want "Assigned (Not Started)" or "Waiting to Start" or "Not Started"?
2. **UI Layout**: Should "Assigned" and "Not Started" be separate columns or combined?
3. **Metrics**: Should we update the overview metrics to show only unassigned pending?
4. **Other Dashboards**: Do WOD/IVCS, Email Requests, Yotpo dashboards need the same changes?

---

## Conclusion

This plan provides a clear, low-risk path to solving the task assignment visibility problem without adding a new database status. The changes are minimal, backward-compatible, and focused on improving manager visibility into task distribution.
