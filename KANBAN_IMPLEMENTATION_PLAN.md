# Kanban Board Implementation Plan - Agent Portal

## Overview
Add Kanban (Trello/Jira-style) view to Agent Portal with stable ordering, optimistic updates, and no task jumping.

---

## Phase 1: MVP (Must Ship First)

### Core Features
1. **Kanban View Toggle**
   - Header toggle: "List View" / "Kanban View"
   - Full-width Kanban (breaks out of max-width container)
   - Desktop-first, tablet-friendly

2. **Four Columns**
   - To Do (PENDING)
   - In Progress (IN_PROGRESS)
   - Assistance Request (ASSISTANCE_REQUIRED + RESOLVED)
   - Completed (COMPLETED, filtered by selected date)

3. **Stable Ordering**
   - Tasks stay in place unless:
     - User moves them (Phase 2)
     - User changes sort
     - Status changes (moves columns)
   - Background updates merge without reordering
   - Derived ordering keys:
     - To Do: `createdAt` or `assignedAt`
     - In Progress: `startTime`
     - Assistance: `assistanceRequestedAt` / `resolvedAt`
     - Completed: `completedAt`

4. **Zustand Store**
   - Normalized task map keyed by `taskId`
   - Derive columns from status + ordering
   - Merge-only polling updates

5. **Task Detail Drawer**
   - Right-side drawer (520px, clamp 420-600px)
   - Same content as TaskCard + timestamps + manager response
   - Auto-close on Complete, keep open on Assistance

6. **Blur Until Started**
   - All task types in To Do column
   - Blur: phone, email, customer name, text content, address/order details
   - Visible: Task ID, brand, task type, created time, non-sensitive tags
   - "Locked until started" indicator

7. **Optimistic Updates**
   - Start Task: immediate UI update, move to In Progress, unblur
   - Request Assistance: immediate UI update, move to Assistance, lock card
   - Complete Task: immediate UI update, move to Completed, close drawer
   - Rollback on failure with toast + retry

8. **Assistance Request Flow**
   - Status: ASSISTANCE_REQUIRED → RESOLVED (when manager responds)
   - Visual: Red tint when blocked, green tint when resolved
   - Auto-actionable when resolved (no Resume button needed)

9. **Completed Column**
   - Shows tasks completed on selected date by current agent
   - Read-only (no dragging back)
   - Clears and reloads when date changes

10. **Polling**
    - 5 seconds interval
    - Merge-only updates (no reordering)
    - Update fields without changing position unless status changes

---

## Phase 2: Enhanced Features

1. **Drag & Drop**
   - @dnd-kit library
   - Disable drag for Completed
   - Validation rules per column
   - Toast feedback on invalid drops

2. **Search & Jump**
   - Header search: "Find task... Task ID / phone / email"
   - Search across all columns
   - On result click: scroll + highlight + open drawer

3. **Collapsible Scorecard**
   - Collapse/expand to maximize Kanban space

---

## Phase 3: Performance & Polish

1. **Virtualization**
   - react-window or react-virtuoso
   - Enable when column exceeds 60-75 cards
   - Compatible with drawer and drag/drop

2. **Position Persistence** (if needed)
   - Add `columnOrder` / `position` to DB
   - Only if drag/drop needs to "stick"

---

## Technical Architecture

### State Management
- **Zustand Store**: `useTaskStore`
  - `tasks: Map<taskId, Task>`
  - `getTasksByStatus(status): Task[]`
  - `updateTask(taskId, updates)`
  - `mergeTasks(newTasks)`

### Component Structure
```
AgentPage
├── ViewToggle (List / Kanban)
├── KanbanBoard (new)
│   ├── KanbanColumn (x4)
│   │   ├── ColumnHeader
│   │   ├── TaskCard (virtualized if needed)
│   │   └── EmptyState
│   └── TaskDetailDrawer
└── ListView (existing, kept intact)
```

### Key Files to Create
1. `src/stores/useTaskStore.ts` - Zustand store
2. `src/app/agent/_components/KanbanBoard.tsx` - Main Kanban component
3. `src/app/agent/_components/KanbanColumn.tsx` - Column component
4. `src/app/agent/_components/KanbanCard.tsx` - Card component
5. `src/app/agent/_components/TaskDetailDrawer.tsx` - Drawer component
6. `src/lib/task-ordering.ts` - Ordering utilities

### Key Files to Modify
1. `src/app/agent/page.tsx` - Add view toggle, integrate Kanban
2. `src/app/api/agent/tasks/route.ts` - Ensure RESOLVED status support

---

## Status Mapping

| Backend Status | Kanban Column | Notes |
|----------------|---------------|-------|
| PENDING | To Do | Blurred until started |
| IN_PROGRESS | In Progress | Full details visible |
| ASSISTANCE_REQUIRED | Assistance Request | Locked, red tint |
| RESOLVED | Assistance Request | Unlocked, green tint, actionable |
| COMPLETED | Completed | Read-only, date-filtered |

---

## Ordering Keys (Derived, No DB Changes)

- **To Do**: `createdAt` or `assignedAt` (oldest first by default)
- **In Progress**: `startTime` (oldest first by default)
- **Assistance Request**: `assistanceRequestedAt` (oldest first), then `resolvedAt` for resolved
- **Completed**: `completedAt` (oldest first by default)

---

## Test Data Strategy

For local testing without database:
- Create mock task generator
- Generate 50-100 test tasks with various statuses
- Include all task types (Text Club, WOD/IVCS, Email, Yotpo, Holds)
- Include assistance requests (some resolved, some pending)
- Include completed tasks for different dates

---

## Implementation Order

1. **Setup Zustand store** with normalized task map
2. **Create KanbanBoard component** with 4 columns
3. **Create KanbanCard component** with blur logic
4. **Create TaskDetailDrawer** component
5. **Integrate optimistic updates** (start, assist, complete)
6. **Add polling merge logic** (no reordering)
7. **Add view toggle** in header
8. **Add test data** for local testing
9. **Style and polish** (animations, empty states, skeletons)

---

## Success Criteria

- No task jumping when polling updates
- Tasks stay in same position unless status changes
- Optimistic updates feel instant
- Drawer opens/closes smoothly
- Blur works correctly for all task types
- Assistance flow locks/unlocks correctly
- Completed column filters by date correctly
- Full-width layout uses desktop space
- Performance smooth with 200 tasks

---

**Status**: Ready to implement Phase 1 MVP
