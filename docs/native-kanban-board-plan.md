# Native Kanban Board System Plan
## Build Trello-Like System Directly in Portal

**Date:** November 2025  
**Purpose:** Build a native kanban board system in the portal instead of integrating with Trello

---

## Why Build Native Instead of Trello Integration?

### Advantages
- ✅ **No External Dependencies:** No Trello API, no sync issues, no rate limits
- ✅ **Full Control:** Complete customization of UI/UX
- ✅ **Faster Development:** No API integration complexity
- ✅ **Better Integration:** Seamless with existing portal features
- ✅ **Single Source of Truth:** All data in your database
- ✅ **No Additional Costs:** No Trello subscription needed
- ✅ **Better Performance:** Direct database queries, no API calls
- ✅ **Custom Features:** Add features Trello doesn't have

### What We'll Build
- Kanban board interface (drag-and-drop)
- Multiple lists/queues (To Do, In Progress, Done, Follow-up)
- Card details view (like Trello card modal)
- Comments/activity feed
- Assignment system
- All existing portal features (analytics, notifications, etc.)

---

## Architecture Overview

```
Portal Form Submission
    ↓
Create Task (TRELLO_REQUEST type)
    ↓
Store in Database (with list/queue assignment)
    ↓
Display on Kanban Board
    ↓
Agent Works Request (moves between lists)
    ↓
Resolution Stored in Database
    ↓
Original Requester Views in "My Requests"
```

**Key Difference:** Everything stays in the portal - no external sync needed!

---

## Database Schema

### Update Existing Task Model

```prisma
model Task {
  // ... existing fields ...
  taskType         TaskType  // Add TRELLO_REQUEST to enum
  
  // Kanban Board Fields
  trelloRequest    TrelloRequest?  // Link to request details
  kanbanList       String?  // "to_do", "in_progress", "done", "follow_up"
  kanbanPosition   Int?    // Position within list (for drag-and-drop ordering)
  priority         String?  // "normal", "high", "urgent"
  
  // ... rest of existing fields ...
}

model TrelloRequest {
  id                String   @id @default(cuid())
  taskId            String   @unique
  task              Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  
  // Request Details
  requestType       String?  // "Order Cancellation", "Refund", etc.
  orderNumber       String?
  customerEmail     String?
  customerName      String?
  reason            String?  @db.Text
  
  // Requester Info
  requestedByEmail  String?
  requestedByName   String?
  requestedByUserId String?
  
  // Resolution Tracking
  resolutionStatus  String?  // "pending", "in_progress", "resolved", "follow_up"
  resolutionNotes   String?  @db.Text
  resolvedAt        DateTime?
  resolvedBy        String?
  resolvedByName    String?
  
  // Comments/Activity
  comments          Json?    // Array: [{ author, text, timestamp, userId }]
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  @@index([requestedByEmail])
  @@index([resolutionStatus])
  @@index([requestType])
}
```

**Key Points:**
- `kanbanList` field on Task model stores which list/queue the task is in
- `kanbanPosition` for drag-and-drop ordering
- All data in your database - no external system

---

## Implementation Phases

### Phase 1: Foundation & Form (Week 1)

**Tasks:**
1. Database schema
   - Add `TRELLO_REQUEST` to TaskType enum
   - Add `kanbanList` and `kanbanPosition` to Task model
   - Create `TrelloRequest` model
   - Run migration

2. Form submission
   - Create form component (same as Trello plan)
   - Fields: Request Type, Order Number, Customer Email, Customer Name, Reason, Priority
   - API endpoint: `POST /api/trello/submit`
   - Creates Task with `kanbanList: "to_do"`

3. Basic task storage
   - Store request details in TrelloRequest table
   - Link to Task
   - Set initial kanban list to "to_do"

**Deliverable:** Form creates tasks in database, ready for kanban board

---

### Phase 2: Kanban Board UI (Week 2)

**Tasks:**
1. Kanban board component
   - React component with columns (lists)
   - Lists: "To Do", "In Progress", "Done", "Follow-up"
   - Display tasks as cards in each list
   - Card shows: Order Number, Customer, Request Type, Priority

2. Drag-and-drop functionality
   - Use library like `@dnd-kit/core` or `react-beautiful-dnd`
   - Allow dragging cards between lists
   - Update `kanbanList` and `kanbanPosition` on drop
   - API endpoint: `PUT /api/trello/tasks/[id]/move`

3. Card styling
   - Color-coded by priority (Normal=Gray, High=Yellow, Urgent=Red)
   - Status indicators
   - Assigned agent badge
   - Hover effects

4. List management
   - Show task count per list
   - Empty state messages
   - Loading states

**Deliverable:** Functional kanban board with drag-and-drop

---

### Phase 3: Card Detail View (Week 3)

**Tasks:**
1. Card modal/detail view
   - Click card to open detail view
   - Show full request details
   - Request info: Order Number, Customer, Request Type, Reason
   - Requester info: Who submitted, when

2. Comments/activity feed
   - Display all comments
   - Add new comment
   - Show author, timestamp
   - Activity log (moved to list, assigned, resolved)

3. Resolution form
   - Status dropdown
   - Resolution notes textarea
   - "Mark Resolved" button
   - "Move to Follow-up" button

4. Assignment
   - Show assigned agent
   - Change assignment dropdown
   - Unassign option

**Deliverable:** Full card detail view with comments and resolution

---

### Phase 4: Assignment System (Week 4)

**Tasks:**
1. Agent specialization
   - Add "Trello Requests" toggle in Settings
   - Update workload API to include Trello requests

2. Round-robin assignment
   - Same logic as other task types
   - Assign from "To Do" list
   - Update `assignedToId` and move to "In Progress"

3. Manager dashboard
   - "Assign Trello Requests" section
   - Show agents with specialization
   - Display workload
   - Bulk assignment

4. Auto-assignment option
   - Toggle for auto-assign on submission
   - Assigns to agent with least workload

**Deliverable:** Even distribution assignment working

---

### Phase 5: Notifications & "My Requests" (Week 5)

**Tasks:**
1. "My Requests" section
   - Show all requests submitted by logged-in agent
   - List view with status
   - Click to view details

2. Resolution visibility
   - Show resolution notes
   - Show who resolved it
   - Show when resolved
   - Show all comments/activity

3. In-portal notifications
   - Badge when request resolved
   - Notification in "My Requests"
   - Status updates

4. Keep existing notifications
   - Teams workflow cards (if you want to keep)
   - Email notifications (if you want to keep)
   - Or replace with portal-only notifications

**Deliverable:** Agents see all their requests and resolutions

---

### Phase 6: Analytics & Polish (Week 6)

**Tasks:**
1. Analytics dashboard
   - Request type breakdown
   - Resolution time tracking
   - Agent performance
   - List distribution (how many in each list)

2. Advanced features
   - Filter by request type
   - Filter by priority
   - Search functionality
   - Bulk actions

3. UI/UX polish
   - Animations
   - Loading states
   - Error handling
   - Success messages

4. Testing & optimization
   - Performance testing
   - User acceptance testing
   - Bug fixes

**Deliverable:** Production-ready kanban board system

---

## Technical Implementation Details

### Kanban Board Component Structure

```typescript
// KanbanBoard.tsx
- KanbanBoard (main container)
  - KanbanList (for each list: To Do, In Progress, Done, Follow-up)
    - KanbanCard (for each task)
      - CardHeader (Order Number, Priority)
      - CardBody (Customer, Request Type)
      - CardFooter (Assigned Agent, Status)
```

### Drag-and-Drop Implementation

**Option 1: @dnd-kit/core (Recommended)**
- Modern, accessible
- Good performance
- Easy to customize

**Option 2: react-beautiful-dnd**
- Popular, well-documented
- Slightly older but stable

### API Endpoints Needed

```
POST   /api/trello/submit              - Submit new request
GET    /api/trello/board               - Get all tasks for kanban board
PUT    /api/trello/tasks/[id]/move     - Move task to different list
PUT    /api/trello/tasks/[id]/assign   - Assign task to agent
POST   /api/trello/tasks/[id]/comment  - Add comment
PUT    /api/trello/tasks/[id]/resolve  - Mark as resolved
GET    /api/trello/my-requests         - Get agent's submitted requests
```

### List/Queue Management

**Default Lists:**
- "To Do" - New requests
- "In Progress" - Assigned and being worked
- "Done" - Resolved requests
- "Follow-up" - Needs follow-up

**Customization:**
- Can add more lists if needed
- Can rename lists
- Can hide lists (archive)

---

## Comparison: Native vs Trello Integration

| Feature | Native Kanban | Trello Integration |
|--------|---------------|-------------------|
| **Development Time** | 6 weeks | 6 weeks (but more complex) |
| **External Dependencies** | None | Trello API |
| **Sync Issues** | None (single source) | Possible sync conflicts |
| **Customization** | Full control | Limited by Trello |
| **Performance** | Fast (direct DB) | Slower (API calls) |
| **Cost** | Free | Free (but dependent) |
| **Maintenance** | You control | Dependent on Trello |
| **Features** | Add anything | Limited to Trello API |

---

## UI/UX Design

### Kanban Board Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Trello Requests - Kanban Board                              │
├──────────────┬──────────────┬──────────────┬──────────────┤
│  To Do (5)   │ In Progress  │  Done (12)   │ Follow-up (2)│
│              │    (3)       │              │              │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ [Card]       │ [Card]       │ [Card]       │ [Card]       │
│ ORD-123      │ ORD-456      │ ORD-789      │ ORD-101      │
│ Customer:    │ Customer:    │ Customer:    │ Customer:    │
│ John Doe     │ Jane Smith   │ Bob Jones    │ Alice Brown  │
│ [High]       │ [Normal]     │ [Resolved]   │ [Follow-up] │
│              │              │              │              │
│ [Card]       │ [Card]       │ [Card]       │              │
│ ...          │ ...          │ ...          │              │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

### Card Detail Modal

```
┌─────────────────────────────────────┐
│  Order Cancellation Request    [X]   │
├─────────────────────────────────────┤
│  Order Number: ORD-134519981         │
│  Customer: John Doe                  │
│  Customer Email: john@example.com    │
│  Request Type: Order Cancellation    │
│  Priority: High                      │
│  Status: In Progress                  │
│  Assigned To: Agent Name             │
│                                       │
│  Reason:                             │
│  Customer called to cancel, order     │
│  is locked in Salesforce.             │
│                                       │
│  Submitted by: Requester Name         │
│  Submitted: Nov 18, 2025 3:04 PM     │
│                                       │
│  ─────────────────────────────────   │
│  Comments & Activity                 │
│  ─────────────────────────────────   │
│  [Agent Name] - Nov 18, 3:15 PM      │
│  Contacted fulfillment admin to       │
│  unlock order.                       │
│                                       │
│  [Add Comment...]                    │
│                                       │
│  ─────────────────────────────────   │
│  Resolution                          │
│  ─────────────────────────────────   │
│  [Status: Resolved ▼]                │
│  [Resolution Notes...]              │
│  [Mark Resolved] [Move to Follow-up] │
└─────────────────────────────────────┘
```

---

## Migration Strategy (If You Have Existing Trello Data)

**Option 1: Fresh Start**
- Start new system from scratch
- Old Trello board remains for reference
- New requests go to portal

**Option 2: Import Existing Cards**
- Export Trello cards (via API or CSV)
- Import into portal database
- Map to new kanban lists

**Recommendation:** Fresh start is cleaner, but can import if needed

---

## Advantages of Native System

1. **No API Limits:** No rate limiting concerns
2. **Faster:** Direct database queries vs API calls
3. **More Reliable:** No external service dependencies
4. **Better Integration:** Works seamlessly with existing portal features
5. **Custom Features:** Can add features Trello doesn't have:
   - Auto-assignment rules
   - Custom workflows
   - Integration with other task types
   - Advanced analytics
   - Custom notifications

6. **Cost:** No additional subscriptions
7. **Control:** Full control over data and features

---

## Timeline: 6 Weeks (Same as Trello Integration)

**Week 1:** Foundation & Form  
**Week 2:** Kanban Board UI  
**Week 3:** Card Detail View  
**Week 4:** Assignment System  
**Week 5:** Notifications & "My Requests"  
**Week 6:** Analytics & Polish

**Total Development:** 105-135 hours  
**Total Testing:** 22-32 hours

---

## Next Steps

1. **Decision:** Confirm you want native kanban board (not Trello integration)
2. **Requirements:** Confirm list names, request types, priorities
3. **Start Development:** Begin with Phase 1 (database + form)

---

## Questions to Answer

1. **List Names:** Keep "To Do", "In Progress", "Done", "Follow-up" or customize?
2. **Request Types:** What are all the types? (Order Cancellation, Refund, etc.)
3. **Priorities:** Normal, High, Urgent - or different?
4. **Notifications:** Keep Teams/email or portal-only?
5. **Existing Data:** Import from Trello or fresh start?

---

## Recommendation

**Build Native Kanban Board** - It's:
- Simpler (no external API)
- Faster to develop (no sync complexity)
- More reliable (no external dependencies)
- More flexible (full customization)
- Better integrated (seamless with portal)

The only advantage of Trello integration is if you need to keep Trello as a backup/visibility tool, but you can achieve the same with a native system.

---

**Ready to start?** This approach is actually cleaner and more maintainable than Trello integration!

