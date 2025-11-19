# Trello Requests - Private Queue System Plan
## Customer Service Request Management (No Shared Board)

**Date:** November 2025  
**Purpose:** Build request management system with private agent queues and customer service notifications

---

## Key Requirements

1. ✅ **No Shared Board:** Agents don't see what others are working on
2. ✅ **Automatic Assignment:** Round-robin to agents toggled on for Trello requests
3. ✅ **Private Queues:** Agents only see their own assigned requests
4. ✅ **Customer Service Notifications:** Notify original requester when completed
5. ✅ **Custom Dispositions:** Move to follow-up (like Yotpo system)

---

## Architecture Overview

```
Customer Service Agent Fills Form
    ↓
Request Created in Portal
    ↓
Automatic Round-Robin Assignment
    ↓
Assigned to Agent (Private Queue)
    ↓
Agent Works Request (Sees Only Their Tasks)
    ↓
Agent Resolves with Disposition
    ↓
Notification Sent to Original Requester
    ↓
Original Requester Views Resolution
```

**Key Principle:** Each agent has their own private queue - no visibility into others' work.

---

## Database Schema

### Update Task Model

```prisma
model Task {
  // ... existing fields ...
  taskType         TaskType  // Add TRELLO_REQUEST to enum
  
  // Standard task fields (reuse existing)
  status           TaskStatus  // PENDING, IN_PROGRESS, COMPLETED, etc.
  assignedToId     String?
  assignedTo       User?       @relation(...)
  disposition      String?     // "Resolved", "Follow-up - [reason]", etc.
  notes            String?     @db.Text  // Resolution notes
  
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
  
  // Requester Info (Customer Service Agent)
  requestedByEmail  String?  // Email of customer service agent who submitted
  requestedByName   String?
  requestedByUserId String?  // User ID if they have portal account
  
  // Resolution Tracking
  resolutionNotes   String?  @db.Text
  resolvedAt        DateTime?
  resolvedBy        String?  // User ID who resolved it
  resolvedByName    String?
  
  // Notification Tracking
  notificationSent  Boolean  @default(false)
  notificationSentAt DateTime?
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  @@index([requestedByEmail])
  @@index([requestType])
}
```

**Note:** Reuse existing Task model - no need for kanban-specific fields!

---

## Implementation Phases

### Phase 1: Form Submission & Auto-Assignment (Week 1)

**Tasks:**
1. **Database Schema**
   - Add `TRELLO_REQUEST` to TaskType enum
   - Create `TrelloRequest` model
   - Run migration

2. **Form Component**
   - Create form in portal (similar to Yotpo)
   - Fields:
     - Request Type (dropdown): Order Cancellation, Refund, Other
     - Order Number (text, required)
     - Customer Email (email, required)
     - Customer Name (text, optional)
     - Reason/Description (textarea, required)
     - Priority (dropdown): Normal, High, Urgent
   - Store requester info (who submitted the form)

3. **API Endpoint: `/api/trello/submit`**
   - Create Task with `taskType: TRELLO_REQUEST`
   - Create TrelloRequest record
   - Store requester email/name
   - **Automatic Assignment:**
     - Get all agents with Trello specialization enabled
     - Get their current TRELLO_REQUEST task counts
     - Round-robin assign to agent with least workload
     - Set task status to IN_PROGRESS
     - Set assignedToId

4. **Form Location**
   - New section in portal: "Submit Customer Service Request"
   - Accessible to customer service agents
   - Or create separate form page

**Deliverable:** Form creates request and auto-assigns to agent

---

### Phase 2: Agent Private Queue (Week 2)

**Tasks:**
1. **Agent Portal View**
   - New section: "Customer Service Requests"
   - Show only tasks assigned to logged-in agent
   - Filter by status: Pending, In Progress, Completed
   - Similar to existing task views (Text Club, Yotpo, etc.)

2. **Task List View**
   - Display: Order Number, Customer, Request Type, Priority, Status
   - Sort by: Created Date, Priority
   - Filter by: Status, Request Type, Priority
   - Click to view details

3. **Task Detail View**
   - Full request details
   - Requester info (who submitted it)
   - Resolution form:
     - Disposition dropdown
     - Resolution notes
     - "Complete Request" button

4. **No Shared Visibility**
   - Agents cannot see other agents' requests
   - Manager can see all requests (for oversight)
   - Each agent has private queue

**Deliverable:** Agents see only their assigned requests

---

### Phase 3: Custom Dispositions & Follow-up (Week 3)

**Tasks:**
1. **Disposition System (Like Yotpo)**
   - Create disposition options:
     - "Resolved"
     - "Follow-up - Order Unlock Needed"
     - "Follow-up - Customer Contact Required"
     - "Follow-up - Other" (with note required)
     - "Cannot Resolve" (with note required)

2. **Follow-up Queue**
   - When disposition is "Follow-up - ...", task moves to follow-up status
   - Create follow-up queue view for managers
   - Agents can see their own follow-up tasks
   - Can reassign or resolve later

3. **Disposition Logic**
   - Similar to Yotpo disposition system
   - Some dispositions require notes
   - Some move to follow-up automatically
   - Store disposition in Task.disposition field

4. **Follow-up Management**
   - Manager can view all follow-up requests
   - Can reassign to different agent
   - Can mark as resolved when follow-up complete

**Deliverable:** Custom dispositions working, follow-up queue functional

---

### Phase 4: Customer Service Notifications (Week 4)

**Tasks:**
1. **Notification System Design**
   - When request is resolved, notify original requester
   - Options:
     - **Option A:** In-portal notification (recommended)
     - **Option B:** Email notification
     - **Option C:** Teams notification
     - **Option D:** All of the above

2. **"My Requests" Section for Customer Service**
   - New section in portal (or separate view)
   - Shows all requests submitted by logged-in customer service agent
   - Status: Pending, In Progress, Resolved, Follow-up
   - Click to view resolution details

3. **Resolution Details View**
   - Show full request details
   - Show resolution notes
   - Show who resolved it
   - Show when resolved
   - Show disposition

4. **Notification Implementation**
   - **In-Portal:**
     - Badge notification when request resolved
     - "My Requests" section shows status
     - Click to view resolution
   
   - **Email (Optional):**
     - Send email to requestedByEmail
     - Include resolution details
     - Link to portal to view full details
   
   - **Teams (Optional):**
     - Send Teams message/notification
     - Include resolution summary
     - Link to portal

5. **API Endpoint: `/api/trello/my-requests`**
   - Get all requests submitted by logged-in user
   - Include resolution details
   - Filter by status
   - Return formatted data

**Deliverable:** Customer service agents notified and can view resolutions

---

### Phase 5: Manager Dashboard & Analytics (Week 5)

**Tasks:**
1. **Manager Dashboard**
   - Overview stats: Total requests, Pending, In Progress, Resolved
   - Request queue (all requests, not just assigned)
   - Assignment interface (manual override if needed)
   - Follow-up queue view

2. **Assignment Management**
   - View all unassigned requests
   - Manual assignment option
   - Reassignment capability
   - Workload view per agent

3. **Analytics**
   - Request type breakdown
   - Resolution time tracking
   - Agent performance metrics
   - Disposition distribution
   - Follow-up rate

4. **Integration with Existing Analytics**
   - Add to overall portal metrics
   - Include in agent workload calculations
   - Add to performance tracking

**Deliverable:** Complete manager dashboard and analytics

---

### Phase 6: Polish & Testing (Week 6)

**Tasks:**
1. **UI/UX Polish**
   - Consistent styling with other task types
   - Loading states
   - Error handling
   - Success confirmations
   - Form validation

2. **Testing**
   - End-to-end testing
   - User acceptance testing
   - Performance testing
   - Notification testing

3. **Documentation**
   - User guide for customer service agents
   - User guide for portal agents
   - Manager guide

4. **Bug Fixes**
   - Fix any issues found
   - Optimize performance
   - Final polish

**Deliverable:** Production-ready system

---

## Detailed Implementation

### Form Submission Flow

```typescript
// Customer Service Agent fills form
POST /api/trello/submit
{
  requestType: "Order Cancellation",
  orderNumber: "ORD-134519981",
  customerEmail: "customer@example.com",
  customerName: "John Doe",
  reason: "Customer called to cancel, order is locked",
  priority: "High"
}

// Backend logic:
1. Create Task with taskType: TRELLO_REQUEST, status: PENDING
2. Create TrelloRequest record with requester info
3. Get agents with Trello specialization enabled
4. Get their current TRELLO_REQUEST task counts
5. Find agent with least workload
6. Assign task: assignedToId = agent.id, status = IN_PROGRESS
7. Return success with task ID
```

### Agent Private Queue

**Agent Portal View:**
- Section: "Customer Service Requests"
- Shows: `WHERE taskType = 'TRELLO_REQUEST' AND assignedToId = currentUserId`
- Similar to existing task views
- No visibility into other agents' requests

**Task Detail View:**
- Request details (form data)
- Requester info
- Resolution form:
  - Disposition dropdown
  - Notes textarea
  - "Complete Request" button

### Disposition System

**Disposition Options:**
```typescript
const dispositions = [
  {
    value: "resolved",
    label: "Resolved",
    requiresNote: false,
    movesToFollowUp: false
  },
  {
    value: "follow_up_order_unlock",
    label: "Follow-up - Order Unlock Needed",
    requiresNote: true,
    movesToFollowUp: true
  },
  {
    value: "follow_up_customer_contact",
    label: "Follow-up - Customer Contact Required",
    requiresNote: true,
    movesToFollowUp: true
  },
  {
    value: "follow_up_other",
    label: "Follow-up - Other",
    requiresNote: true, // Note required
    movesToFollowUp: true
  },
  {
    value: "cannot_resolve",
    label: "Cannot Resolve",
    requiresNote: true, // Note required
    movesToFollowUp: false
  }
];
```

**When Agent Completes Request:**
```typescript
PUT /api/trello/tasks/[id]/complete
{
  disposition: "resolved",
  notes: "Order cancelled and refunded. Customer notified.",
  followUpReason: null // Only if disposition is follow-up
}

// Backend:
1. Update Task: status = COMPLETED, disposition, notes, endTime
2. Update TrelloRequest: resolutionNotes, resolvedBy, resolvedAt
3. If disposition is follow-up: set follow-up flag
4. Trigger notification to original requester
5. Return success
```

### Notification System

**Option 1: In-Portal (Recommended Primary)**

**"My Requests" Section:**
- Shows all requests submitted by customer service agent
- Status badges: Pending, In Progress, Resolved, Follow-up
- Click to view full details including resolution
- Notification badge when new resolution

**Implementation:**
```typescript
GET /api/trello/my-requests
// Returns all requests where requestedByEmail = currentUser.email
// Includes resolution details if resolved

Response: {
  requests: [{
    id: "...",
    orderNumber: "ORD-134519981",
    customerEmail: "customer@example.com",
    requestType: "Order Cancellation",
    status: "resolved",
    resolutionNotes: "Order cancelled and refunded",
    resolvedBy: "Agent Name",
    resolvedAt: "2025-11-18T...",
    disposition: "resolved"
  }]
}
```

**Option 2: Email Notification (Optional)**

```typescript
// When request resolved
await sendEmail({
  to: trelloRequest.requestedByEmail,
  subject: `Request Resolved: ${orderNumber}`,
  body: `
    Your customer service request has been resolved:
    
    Order Number: ${orderNumber}
    Customer: ${customerName}
    Status: ${disposition}
    
    Resolution Notes:
    ${resolutionNotes}
    
    View in Portal: [link]
  `
});
```

**Option 3: Teams Notification (Optional)**

```typescript
// Send Teams message to customer service agent
POST to Teams webhook:
{
  "@type": "MessageCard",
  "title": "✅ Request Resolved",
  "sections": [{
    "activityTitle": `Order: ${orderNumber}`,
    "facts": [{
      "name": "Status:",
      "value": disposition
    }],
    "text": resolutionNotes
  }],
  "potentialAction": [{
    "@type": "OpenUri",
    "name": "View in Portal",
    "targets": [{ "uri": portalUrl }]
  }]
}
```

**Recommended:** In-portal as primary, email as backup, Teams as optional.

---

## UI/UX Design

### Customer Service Agent Form

```
┌─────────────────────────────────────┐
│  Submit Customer Service Request     │
├─────────────────────────────────────┤
│  Request Type: [Order Cancellation▼]│
│  Order Number: [ORD-________]       │
│  Customer Email: [________@__.__]   │
│  Customer Name: [________] (optional)│
│  Reason/Description:                 │
│  [________________________________]  │
│  [________________________________]  │
│  Priority: [Normal ▼]               │
│                                       │
│  [Submit Request]                    │
└─────────────────────────────────────┘
```

### Portal Agent Private Queue

```
┌─────────────────────────────────────┐
│  Customer Service Requests (3)        │
├─────────────────────────────────────┤
│  Filter: [All Status ▼] [All Type ▼]│
│                                       │
│  ┌───────────────────────────────┐  │
│  │ ORD-134519981                 │  │
│  │ Customer: John Doe            │  │
│  │ Type: Order Cancellation      │  │
│  │ Priority: High                │  │
│  │ Status: In Progress            │  │
│  │ [View Details]                 │  │
│  └───────────────────────────────┘  │
│                                       │
│  ┌───────────────────────────────┐  │
│  │ ORD-134520000                 │  │
│  │ ...                            │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

### Task Detail View (Portal Agent)

```
┌─────────────────────────────────────┐
│  Customer Service Request    [X]     │
├─────────────────────────────────────┤
│  Order Number: ORD-134519981         │
│  Customer: John Doe                  │
│  Customer Email: john@example.com    │
│  Request Type: Order Cancellation    │
│  Priority: High                      │
│                                       │
│  Reason:                              │
│  Customer called to cancel, order     │
│  is locked in Salesforce.            │
│                                       │
│  Submitted by: Customer Service Agent │
│  Submitted: Nov 18, 2025 3:04 PM     │
│                                       │
│  ─────────────────────────────────   │
│  Resolution                          │
│  ─────────────────────────────────   │
│  Disposition: [Resolved ▼]           │
│  Resolution Notes:                   │
│  [________________________________]  │
│  [________________________________]  │
│                                       │
│  [Complete Request]                 │
└─────────────────────────────────────┘
```

### "My Requests" View (Customer Service Agent)

```
┌─────────────────────────────────────┐
│  My Requests (5)                     │
├─────────────────────────────────────┤
│  Filter: [All Status ▼]              │
│                                       │
│  ┌───────────────────────────────┐  │
│  │ ✅ ORD-134519981 (Resolved)    │  │
│  │ Customer: John Doe            │  │
│  │ Resolved: Nov 18, 3:30 PM     │  │
│  │ [View Resolution]             │  │
│  └───────────────────────────────┘  │
│                                       │
│  ┌───────────────────────────────┐  │
│  │ ⏳ ORD-134520000 (In Progress)│  │
│  │ Customer: Jane Smith          │  │
│  │ Submitted: Nov 18, 2:00 PM     │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

---

## Comparison: Private Queue vs Shared Board

| Feature | Private Queue (This Plan) | Shared Kanban Board |
|---------|---------------------------|---------------------|
| **Agent Visibility** | Only their own tasks | See all tasks |
| **Competition** | None (even distribution) | Possible competition |
| **Privacy** | Full privacy | Public visibility |
| **Assignment** | Automatic round-robin | Manual or auto |
| **Workload** | Even distribution | May be uneven |
| **Focus** | Agents focus on their work | Agents see others' work |

---

## Timeline: 6 Weeks

**Week 1:** Form Submission & Auto-Assignment  
**Week 2:** Agent Private Queue  
**Week 3:** Custom Dispositions & Follow-up  
**Week 4:** Customer Service Notifications  
**Week 5:** Manager Dashboard & Analytics  
**Week 6:** Polish & Testing

**Total Development:** 105-135 hours  
**Total Testing:** 22-32 hours

---

## Key Features Summary

1. ✅ **Form Submission:** Customer service agents submit requests via portal form
2. ✅ **Automatic Assignment:** Round-robin to agents with Trello specialization enabled
3. ✅ **Private Queues:** Agents only see their own assigned requests
4. ✅ **Custom Dispositions:** Like Yotpo, with follow-up options
5. ✅ **Customer Service Notifications:** Original requester sees resolution in portal
6. ✅ **No Shared Board:** No visibility into others' work
7. ✅ **Even Distribution:** Fair workload distribution

---

## Next Steps

1. **Confirm Requirements:**
   - Form fields (Request Type, Order Number, etc.)
   - Disposition options
   - Notification preferences (in-portal, email, Teams?)

2. **Start Development:**
   - Phase 1: Form + Auto-assignment
   - Phase 2: Private queue view
   - Phase 3: Dispositions
   - Phase 4: Notifications

3. **Testing:**
   - Test form submission
   - Test auto-assignment
   - Test resolution flow
   - Test notifications

---

**Ready to build?** This approach gives you exactly what you need:
- No shared visibility (private queues)
- Automatic fair distribution
- Customer service notifications
- Custom dispositions like Yotpo

Let me know if you want to start with Phase 1!

