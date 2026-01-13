# Holds Assignment Improvement - Implementation Plan

## 🎯 Requirements Summary

### **Priority Rules:**
1. ✅ **Never worked tasks** always have priority
2. ✅ **Re-work tasks** are just as important **after 24 hours** from last completion
3. ✅ **Recently worked** (<24h) should be deprioritized

### **Visual Indicators:**
1. ✅ **Badges**: Never worked, Re-work, Recently worked (<24h), Last agent
2. ✅ **Colors**: Green (never worked), Yellow/Orange/Red (re-work by recency)
3. ✅ **Sorting**: Default to "Never Worked First"
4. ✅ **Filtering**: Show only never worked, hide recently worked (<2h)

### **Re-work Definition:**
- Task was completed (`completedBy` is not null)
- AND returned to the **same queue** (current `holdsStatus` appears in `holdsQueueHistory` before the last entry)

### **Timer Reset:**
- Reset `durationSec` to `null` when task is unassigned after completion (`shouldUnassign = true`)

### **Backfill:**
- Existing tasks should show correct badges/indicators based on their history

---

## 🔒 Data Safety Strategy

### **Non-Breaking Changes:**
1. ✅ All new fields are computed/derived - **NO schema changes**
2. ✅ All existing queries continue to work
3. ✅ UI changes are additive - existing functionality preserved
4. ✅ Backfill is **read-only analysis** - doesn't modify existing data

### **Backfill Approach:**
- Calculate work metadata from existing `completedBy`, `completedAt`, and `holdsQueueHistory`
- No data modification needed - just compute on-the-fly
- For tasks missing `completedBy` but have history, infer from `holdsQueueHistory`

### **Testing Strategy:**
1. Test in development first
2. Test with production data dump locally
3. Deploy to Netlify for production testing
4. Monitor for errors, data loss, or operational issues

---

## 📋 Implementation Steps

### **Phase 1: API Updates (Backend)**

#### **Step 1.1: Add Work Metadata Calculation Function**

**File**: `src/lib/holds-work-metadata.ts` (NEW FILE)

**Purpose**: Centralized function to calculate work metadata for any task

**Function**: `calculateWorkMetadata(task)`

**Returns**:
```typescript
{
  hasBeenWorked: boolean;           // completedBy !== null OR history shows completion
  isRework: boolean;                // completed AND returned to same queue
  recentlyWorked: boolean;          // completedAt < 24h ago
  lastWorkedAt: Date | null;        // from completedAt OR last completion in history
  lastWorkedBy: string | null;      // from completedBy OR last agent in history
  lastWorkedByName: string | null;  // agent name (requires user lookup)
  workAttempts: number;             // count of completions in history
  hoursSinceLastWork: number | null; // hours since last completion
}
```

**Logic**:
1. Check `completedBy` and `completedAt` (primary source)
2. If missing, infer from `holdsQueueHistory`:
   - Look for entries with `movedBy` containing "Agent"
   - Find disposition entries (indicates completion)
3. Re-work detection:
   - Check if current `holdsStatus` appears in history before the last entry
   - OR check if last entry shows same queue as current
4. Recently worked: `completedAt` is within last 24 hours

#### **Step 1.2: Update `/api/holds/queues` Endpoint**

**File**: `src/app/api/holds/queues/route.ts`

**Changes**:
1. Import `calculateWorkMetadata` function
2. Import `prisma.user` for agent name lookups
3. After fetching tasks, calculate work metadata for each
4. Add work metadata to response:
   ```typescript
   {
     ...task,
     workMetadata: {
       hasBeenWorked: boolean,
       isRework: boolean,
       recentlyWorked: boolean,
       lastWorkedAt: string | null,
       lastWorkedBy: string | null,
       lastWorkedByName: string | null,
       workAttempts: number,
       hoursSinceLastWork: number | null
     }
   }
   ```
5. Add sorting logic:
   - Default: Never worked first, then by `holdsOrderDate`
   - Optional sort params: `sortBy=neverWorkedFirst|oldestFirst|recentlyWorkedLast`
6. Add filtering logic:
   - Optional filter params: `filter=neverWorked|reworked|workedToday`

**Safety**:
- ✅ Existing queries unchanged
- ✅ New fields are additive
- ✅ Backwards compatible

#### **Step 1.3: Update `/api/holds/assign` Endpoint**

**File**: `src/app/api/holds/assign/route.ts`

**Changes**:
1. Import `calculateWorkMetadata` function
2. Calculate work metadata for tasks in GET response
3. Add work metadata to task objects in response

**Safety**:
- ✅ Only adds fields, doesn't change existing logic
- ✅ Assignment logic unchanged

#### **Step 1.4: Update Timer Reset Logic**

**File**: `src/app/api/agent/tasks/[id]/complete/route.ts`

**Changes**:
1. When `shouldUnassign = true` for Holds tasks:
   - Set `durationSec = null` (reset timer)
   - Keep `completedBy` and `completedAt` intact (for tracking)

**Location**: Around line 176-177, in the Holds-specific updates section

**Code**:
```typescript
...(task.taskType === "HOLDS" && {
  holdsStatus: newHoldsQueue,
  holdsQueueHistory: newQueueHistory,
  holdsOrderAmount: orderAmount ? parseFloat(orderAmount) : null,
  holdsNotes: dispositionNote || null,
  completedBy: user.id,
  completedAt: new Date(),
  // Reset timer when unassigning (task goes back to queue)
  ...(shouldUnassign && {
    durationSec: null,
    startTime: null // Also reset start time if needed
  })
}),
```

**Safety**:
- ✅ Only affects Holds tasks
- ✅ Only resets when unassigning
- ✅ Preserves `completedBy`/`completedAt` for tracking

---

### **Phase 2: UI Updates (Frontend)**

#### **Step 2.1: Create Work Metadata Badge Component**

**File**: `src/app/_components/WorkMetadataBadge.tsx` (NEW FILE)

**Purpose**: Reusable badge component for work status

**Props**:
```typescript
{
  hasBeenWorked: boolean;
  isRework: boolean;
  recentlyWorked: boolean;
  lastWorkedByName?: string | null;
  hoursSinceLastWork?: number | null;
}
```

**Badges**:
- 🆕 "Never Worked" (green) - `!hasBeenWorked`
- 🔄 "Re-work" (yellow/orange) - `isRework`
- ⏱️ "Recently Worked" (orange) - `recentlyWorked` (<24h)
- 👤 "Last: [Agent Name]" (gray) - `lastWorkedByName`

**Visual Design**:
- Small badges (text-xs)
- Color-coded backgrounds
- Icons for quick recognition

#### **Step 2.2: Update AssemblyLineQueues Component**

**File**: `src/app/holds/_components/AssemblyLineQueues.tsx`

**Changes**:
1. Import `WorkMetadataBadge` component
2. Add sorting dropdown:
   - "Never Worked First" (default)
   - "Oldest First"
   - "Recently Worked Last"
3. Add filter checkboxes:
   - ✅ "Show only never worked"
   - ✅ "Hide worked in last 2 hours"
4. Update task card rendering:
   - Add `WorkMetadataBadge` component
   - Add color coding based on work status:
     - Green border: Never worked
     - Yellow border: Re-work, >24h ago
     - Orange border: Re-work, <24h ago
     - Red border: Re-work, <2h ago (too recent)
5. Add sorting logic based on selected option
6. Add filtering logic based on checkboxes

**Task Card Updates**:
```tsx
<div className={`
  p-3 rounded-lg border transition-all
  ${!task.workMetadata?.hasBeenWorked 
    ? 'bg-green-900/10 border-green-500/30'  // Never worked
    : task.workMetadata?.recentlyWorked
    ? 'bg-red-900/10 border-red-500/30'       // Recently worked
    : task.workMetadata?.isRework
    ? 'bg-yellow-900/10 border-yellow-500/30' // Re-work
    : 'bg-white/5 border-white/10'            // Default
  }
`}>
  {/* Existing task info */}
  <WorkMetadataBadge {...task.workMetadata} />
  {/* Rest of task card */}
</div>
```

**Safety**:
- ✅ Existing functionality preserved
- ✅ New features are optional/additional
- ✅ Backwards compatible if `workMetadata` is missing

#### **Step 2.3: Update AgentAssignmentSection Component**

**File**: `src/app/holds/_components/AgentAssignmentSection.tsx`

**Changes**:
1. Add `WorkMetadataBadge` component
2. Add sorting dropdown (same as AssemblyLineQueues)
3. Add color coding to task cards
4. Sort tasks: Never worked first by default

**Safety**:
- ✅ Only visual changes
- ✅ Assignment logic unchanged

---

### **Phase 3: Backfill & Data Analysis**

#### **Step 3.1: Create Backfill Analysis Script**

**File**: `scripts/analyze-holds-work-metadata.js` (NEW FILE)

**Purpose**: Analyze existing tasks and report work metadata status

**What it does**:
1. Fetch all Holds tasks
2. Calculate work metadata for each
3. Generate report:
   - Count of never worked tasks
   - Count of re-work tasks
   - Count of recently worked tasks
   - Tasks missing `completedBy` but have history
   - Tasks with inconsistent data

**Output**:
- Console report
- Optional CSV export for analysis

**Safety**:
- ✅ READ-ONLY - no data modification
- ✅ Analysis only - can run safely in production

#### **Step 3.2: Verify Data Completeness**

**What to check**:
1. All tasks with `holdsQueueHistory` entries should have correct `completedBy`/`completedAt`
2. Tasks without `completedBy` but have history - can we infer from history?
3. Tasks in queues - are they correctly identified as never worked vs re-work?

---

## 🧪 Testing Checklist

### **Pre-Deployment Testing:**

1. ✅ **Unit Tests**:
   - `calculateWorkMetadata` function with various scenarios
   - Re-work detection logic
   - Recently worked calculation

2. ✅ **Integration Tests**:
   - `/api/holds/queues` returns work metadata
   - `/api/holds/assign` returns work metadata
   - Timer reset when unassigning

3. ✅ **UI Tests**:
   - Badges display correctly
   - Sorting works (never worked first)
   - Filtering works (show only never worked)
   - Color coding works

4. ✅ **Data Safety Tests**:
   - Existing tasks still display correctly
   - No data loss
   - No breaking changes to agent portal
   - Assignment still works

### **Post-Deployment Testing (Production):**

1. ✅ Verify badges appear correctly
2. ✅ Verify sorting works (never worked first)
3. ✅ Verify filtering works
4. ✅ Verify timer reset when task goes back to queue
5. ✅ Verify no operational issues (agent portal works)
6. ✅ Verify no data loss
7. ✅ Test with real backlog

---

## 🚀 Deployment Plan

### **Step 1: Development**
1. Create all new files
2. Update existing files
3. Test locally with sample data

### **Step 2: Local Production Data Test**
1. Run backfill analysis script with production data dump
2. Verify calculations are correct
3. Test UI with real data structure

### **Step 3: Netlify Deployment**
1. Commit all changes
2. Push to main branch
3. Netlify auto-deploys
4. Monitor deployment logs

### **Step 4: Production Testing**
1. Verify badges appear correctly
2. Verify sorting/filtering works
3. Test assignment flow
4. Verify timer reset works
5. Monitor for errors

### **Step 5: Rollback Plan** (if needed)
- All changes are additive/non-breaking
- Can revert if issues arise
- No data loss risk

---

## 📊 Expected Results

### **Before:**
- Tasks in "Escalated Call 4+ Day" all look identical
- Managers have to expand journey to see if worked on
- Hard to prioritize assignment

### **After:**
- 🆕 Never worked tasks clearly marked with green badge
- 🔄 Re-work tasks clearly marked with yellow/orange badge
- ⏱️ Recently worked tasks marked (<24h)
- 👤 Last agent name visible
- Sorting prioritizes never worked tasks
- Filtering allows focus on never worked tasks
- Timer resets when task goes back to queue

---

## ❓ Open Questions

1. **Color Scheme**: 
   - Green = never worked ✅
   - Yellow = re-work >24h ✅
   - Orange = re-work <24h ✅
   - Red = re-work <2h ✅
   - **Does this work?**

2. **Assignment Prevention**:
   - Should we prevent assignment of tasks worked <2h ago?
   - Or just warn/filter them?

3. **Work Attempt Counter**:
   - Should we show "Attempts: 2" in badge?
   - Or keep it simple with just badges?

4. **Agent Name Lookup**:
   - For tasks without `completedBy`, infer from `holdsQueueHistory`?
   - Or show "Unknown Agent"?

---

## 🔄 Next Steps

1. **Review this plan** with team
2. **Answer open questions** above
3. **Start implementation** (Phase 1: API Updates)
4. **Test thoroughly** before deployment
5. **Deploy to Netlify** for production testing

---

**Status**: 🟡 Ready for implementation after review
