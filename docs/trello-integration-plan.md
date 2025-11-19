# Trello Integration Plan
## Customer Service Request Management System

**Date:** November 2025  
**Purpose:** Integrate Trello request management into the portal system with two-way sync and agent notifications

---

## Current State Analysis

### Current Workflow
1. **Request Submission:** Customer service agents fill out Microsoft Form
2. **Trello Card Creation:** Form submissions create cards in Trello board
3. **Work Processing:** Team works requests in Trello (95% are order cancellations)
4. **External Contact:** Reach out to fulfillment admin to unlock orders in Salesforce
5. **Resolution:** Refund and close orders, add comments in Trello
6. **Follow-up:** Some tickets moved to follow-up queues

### Current Problems
- ⚠️ Agents can see outcome but must check Trello board (not ideal UX)
- ✅ Agents get Teams notification (workflow card) - **KEEP THIS**
- ✅ Agents get email notification - **KEEP THIS**
- ❌ Competitive environment (everyone sees who's working on what)
- ❌ No even distribution of work
- ❌ No tracking/analytics in portal
- ❌ Resolution details not visible in portal (must check Trello)

---

## Proposed Solution

### Architecture Overview

```
Portal Form Submission
    ↓
Portal Task Created (TRELLO_REQUEST type)
    ↓
Trello Card Created (via Trello API)
    ↓
Even Distribution Assignment (round-robin)
    ↓
Agent Works Request in Portal
    ↓
Update Trello Card (status, comments)
    ↓
Notify Original Requester (Teams/Email)
```

**Key Principles:**
1. **Portal as Primary Interface:** Agents work requests in portal
2. **Trello as Secondary Sync:** Trello cards sync for visibility/backup
3. **Even Distribution:** Round-robin assignment prevents competition
4. **Two-Way Sync:** Portal updates reflect in Trello, Trello updates sync to portal
5. **Resolution Visibility:** Original requester sees resolution in portal (no need to check Trello)
6. **Keep Existing Notifications:** Maintain Teams workflow cards and email notifications

---

## Technical Implementation

### Phase 1: Database Schema & Task Type

#### New Task Type
Add `TRELLO_REQUEST` to existing `TaskType` enum in Prisma schema.

#### Database Schema Updates

```prisma
model TrelloRequest {
  id                String   @id @default(cuid())
  taskId            String   @unique
  task              Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  
  // Trello Integration
  trelloCardId      String?  @unique // Trello card ID (e.g., "64a1b2c3d4e5f6g7h8i9j0")
  trelloBoardId     String?  // Trello board ID
  trelloListId      String?  // Current list ID (To Do, Done, Follow-up, etc.)
  
  // Request Details
  requestType       String?  // "Order Cancellation", "Refund", etc.
  orderNumber       String?
  customerEmail     String?
  customerName      String?
  reason            String?  @db.Text
  
  // Requester Info (for notifications)
  requestedByEmail  String?  // Email of agent who submitted request
  requestedByName   String?
  requestedByUserId String?  // User ID if they have portal account
  
  // Resolution Tracking
  resolutionStatus  String?  // "pending", "in_progress", "resolved", "follow_up"
  resolutionNotes   String?  @db.Text
  resolvedAt        DateTime?
  resolvedBy        String?  // User ID who resolved it
  resolvedByName    String?  // Name of agent who resolved it
  
  // Comments/Activity (synced from Trello or added in portal)
  comments          Json?    // Array of comments: [{ author, text, timestamp, source: "portal" | "trello" }]
  
  // Sync Tracking
  lastSyncedToTrello DateTime?
  lastSyncedFromTrello DateTime? // When we last pulled updates from Trello
  syncStatus        String?  // "synced", "pending", "error"
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  @@index([trelloCardId])
  @@index([requestedByEmail])
  @@index([resolutionStatus])
}

// Update Task model to include TrelloRequest relation
model Task {
  // ... existing fields ...
  trelloRequest     TrelloRequest?
  taskType         TaskType  // Add TRELLO_REQUEST to enum
}
```

---

### Phase 2: Form Submission System

#### Custom Form in Portal (Similar to Yotpo)

**Form Fields:**
- **Request Type** (dropdown): Order Cancellation, Refund, Other
- **Order Number** (text, required)
- **Customer Email** (email, required)
- **Customer Name** (text, optional)
- **Reason/Description** (textarea, required)
- **Priority** (dropdown): Normal, High, Urgent

**Form Location:** New section in portal (similar to Yotpo submissions)

**Form Submission Flow:**
1. Agent fills out form in portal
2. Form creates `Task` with `taskType: TRELLO_REQUEST`
3. Form creates `TrelloRequest` record linked to task
4. API creates Trello card via Trello API
5. Task assigned via round-robin (if auto-assign enabled)
6. Original requester stored for notifications

#### API Endpoint: `/api/trello/submit`

```typescript
POST /api/trello/submit
Body: {
  requestType: "Order Cancellation",
  orderNumber: "ORD-134519981",
  customerEmail: "customer@example.com",
  customerName: "John Doe",
  reason: "Customer called to cancel, order is locked",
  priority: "High"
}

Response: {
  success: true,
  taskId: "clx...",
  trelloCardId: "64a1b2c3...",
  trelloCardUrl: "https://trello.com/c/..."
}
```

---

### Phase 3: Trello API Integration

#### Trello API Setup

**Required Credentials:**
- Trello API Key (from Trello account settings)
- Trello API Token (OAuth token)
- Board ID (from Trello board URL)
- List IDs (To Do, Done, Follow-up lists)

**Trello API Endpoints Needed:**
- `POST /1/cards` - Create card
- `PUT /1/cards/{id}` - Update card
- `POST /1/cards/{id}/actions/comments` - Add comment
- `PUT /1/cards/{id}/idList` - Move card to different list
- `GET /1/cards/{id}` - Get card details

#### Trello Card Creation

When form is submitted:
```typescript
// Create Trello card
const card = await trelloAPI.post('/1/cards', {
  name: `[${requestType}] ${orderNumber} - ${customerName}`,
  desc: `Order: ${orderNumber}\nCustomer: ${customerEmail}\nReason: ${reason}\n\nSubmitted by: ${requesterName}`,
  idList: trelloListIds.toDo, // "To Do" list
  idLabels: [], // Optional: priority labels
  due: null, // Optional: due date
});
```

#### Trello Card Updates

When task status changes in portal:
- **In Progress:** Move card to "In Progress" list (if exists) or add label
- **Resolved:** Move card to "Done" list, add resolution comment
- **Follow-up:** Move card to "Follow up" list, add follow-up reason

---

### Phase 4: Even Distribution Assignment

#### Round-Robin Assignment Logic

Use existing assignment pattern from other task types:

```typescript
// Similar to /api/manager/assign/route.ts
1. Get all agents with TRELLO_REQUEST specialization enabled
2. Get their current TRELLO_REQUEST task counts
3. Calculate capacity per agent (maxOpen - currentOpen)
4. Fetch unassigned TRELLO_REQUEST tasks (oldest first)
5. Distribute round-robin based on capacity
6. Assign tasks to agents
```

#### Agent Specialization

Add `TRELLO_REQUEST` to agent specializations in Settings:
- Agents can toggle "Trello Requests" on/off
- Only agents with this enabled receive assignments
- Workload shows Trello request count

#### Assignment UI

Similar to existing "Assign Tasks" sections:
- Show agents with Trello specialization
- Display current Trello request workload
- Manual assignment option
- Auto-assignment with per-agent cap

---

### Phase 5: Task Management Interface

#### Agent Portal View

**Task List:**
- Show all assigned Trello requests
- Display: Order Number, Customer, Request Type, Priority, Status
- Filter by: Status, Request Type, Priority
- Sort by: Created Date, Priority

**Task Detail View:**
- Request details (form data)
- Trello card link (open in Trello)
- Resolution form:
  - Status dropdown: Resolved, Follow-up, Cannot Resolve
  - Resolution notes (textarea)
  - Attach files (optional)
- Action buttons:
  - "Mark Resolved"
  - "Move to Follow-up"
  - "Request Assistance"

#### Manager Dashboard View

**Trello Requests Section:**
- Overview stats (pending, in progress, resolved today)
- Request queue (similar to other task types)
- Assignment interface
- Analytics (request types, resolution times, etc.)

---

### Phase 6: Two-Way Sync (CRITICAL for Agent Visibility)

#### Portal → Trello Sync

**When task is updated in portal:**
1. Update Trello card status (move to appropriate list)
2. Add comment to Trello card with resolution details
3. Update card description if needed
4. Store resolution in portal database (for original requester to view)
5. Log sync status

**Sync Triggers:**
- Task status changes (PENDING → IN_PROGRESS → COMPLETED)
- Resolution notes added
- Task moved to follow-up
- Priority changed

#### Trello → Portal Sync (REQUIRED for Agent Visibility)

**This is CRITICAL - agents need to see resolutions in portal!**

**Two Approaches:**

**Approach 1: Store Resolution in Portal (Recommended)**
- When agent resolves request in portal, we:
  1. Store resolution details in `TrelloRequest.resolutionNotes`
  2. Store resolution status in `TrelloRequest.resolutionStatus`
  3. Store who resolved it in `TrelloRequest.resolvedBy`
  4. Store when resolved in `TrelloRequest.resolvedAt`
  5. Sync to Trello (add comment, move card)
- Original requester views resolution in portal's "My Requests" section
- No need to check Trello - everything is in portal

**Approach 2: Sync Comments from Trello (For Direct Trello Updates)**
- If someone adds a comment directly in Trello (not through portal):
  - Use Trello webhooks to detect card updates
  - OR poll Trello API periodically (every 2-5 minutes)
  - Sync new comments to portal database
  - Store in `TrelloRequest.comments` array

**Recommended: Hybrid Approach**
- Primary: Store resolution in portal when resolved through portal
- Secondary: Sync comments from Trello if someone updates directly in Trello
- This ensures agents always see the resolution, whether it was done in portal or Trello

---

### Phase 7: Notification System

#### Notification Options

**Option A: Microsoft Teams Integration (Recommended)**

**Requirements:**
- Microsoft Teams App/Webhook
- Teams webhook URL for your team channel
- OR Microsoft Graph API access

**Implementation:**
```typescript
// When request is resolved
POST to Teams webhook:
{
  "@type": "MessageCard",
  "summary": "Trello Request Resolved",
  "themeColor": "0078D4",
  "sections": [{
    "activityTitle": "Your request has been resolved",
    "facts": [{
      "name": "Order Number:",
      "value": "ORD-134519981"
    }, {
      "name": "Status:",
      "value": "Resolved - Order cancelled and refunded"
    }],
    "text": resolutionNotes
  }]
}
```

**Option B: Email Notification**

**Implementation:**
```typescript
// Send email to requestedByEmail
const email = await sendEmail({
  to: trelloRequest.requestedByEmail,
  subject: `Trello Request Resolved: ${orderNumber}`,
  body: `
    Your Trello request has been resolved:
    
    Order Number: ${orderNumber}
    Customer: ${customerName}
    Status: ${resolutionStatus}
    
    Resolution Notes:
    ${resolutionNotes}
    
    View in Portal: [link]
  `
});
```

**Option C: In-Portal Notification**

**Implementation:**
- Create notification system in portal
- Show notification badge when request is resolved
- Agent can view all their submitted requests and status

#### Recommended Approach: Hybrid

1. **In-Portal Notification** (always available)
   - Notification badge
   - "My Requests" section showing all submitted requests
   - Status updates visible immediately

2. **Teams Notification** (if Teams webhook available)
   - Real-time notification in Teams channel
   - Clickable link to portal

3. **Email Fallback** (if Teams not available)
   - Email notification as backup

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
**Deliverables:**
- Database schema (TrelloRequest model)
- Form submission UI
- Basic Trello API integration (create cards)
- Task creation in portal

**Resources:**
- Development: 20-25 hours
- Testing: 4-6 hours

---

### Phase 2: Assignment System (Week 2)
**Deliverables:**
- Agent specialization for Trello requests
- Round-robin assignment logic
- Assignment UI in manager dashboard
- Task list in agent portal

**Resources:**
- Development: 15-20 hours
- Testing: 3-4 hours

---

### Phase 3: Task Management (Week 3)
**Deliverables:**
- Task detail view
- Resolution form
- Status updates
- Follow-up queue support

**Resources:**
- Development: 20-25 hours
- Testing: 4-6 hours

---

### Phase 4: Trello Sync (Week 4)
**Deliverables:**
- Portal → Trello sync (status, comments)
- Sync error handling
- Sync status tracking
- Manual sync trigger

**Resources:**
- Development: 15-20 hours
- Testing: 4-6 hours

---

### Phase 5: Notifications (Week 5)
**Deliverables:**
- In-portal notification system
- Teams webhook integration (if available)
- Email notification fallback
- "My Requests" view for agents

**Resources:**
- Development: 20-25 hours
- Testing: 4-6 hours

---

### Phase 6: Analytics & Polish (Week 6)
**Deliverables:**
- Analytics dashboard
- Request type breakdown
- Resolution time tracking
- Integration with existing analytics

**Resources:**
- Development: 15-20 hours
- Testing: 3-4 hours

---

## Total Timeline: 6 Weeks

**Total Development Hours:** 105-135 hours  
**Total Testing Hours:** 22-32 hours

---

## Technical Requirements

### Trello API Access

**Required:**
- Trello account with API access
- API Key and Token
- Board ID and List IDs
- Webhook setup (optional, for Trello → Portal sync)

**How to Get:**
1. Go to https://trello.com/app-key
2. Copy API Key
3. Generate Token (with board read/write permissions)
4. Get Board ID from board URL: `trello.com/b/{BOARD_ID}/...`
5. Get List IDs via API: `GET /1/boards/{boardId}/lists`

### Microsoft Teams Integration

**Option 1: Teams Webhook (Easiest)**
- Create webhook in Teams channel
- Use webhook URL for notifications
- No authentication needed
- Limited customization

**Option 2: Microsoft Graph API (More Control)**
- Requires Azure App Registration
- OAuth 2.0 authentication
- Can send direct messages
- More setup required

**Recommendation:** Start with Teams webhook, upgrade to Graph API if needed.

### Environment Variables

```env
# Trello API
TRELLO_API_KEY=your_api_key
TRELLO_API_TOKEN=your_token
TRELLO_BOARD_ID=your_board_id
TRELLO_LIST_ID_TO_DO=your_list_id
TRELLO_LIST_ID_DONE=your_list_id
TRELLO_LIST_ID_FOLLOW_UP=your_list_id

# Teams (if using)
TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/...

# Email (if using)
SMTP_HOST=smtp.example.com
SMTP_USER=...
SMTP_PASS=...
```

---

## Notification System Details

### Recommended: In-Portal + Teams Hybrid

#### In-Portal Notification System

**New Section: "My Requests"**
- Shows all requests submitted by logged-in agent
- Status: Pending, In Progress, Resolved, Follow-up
- Click to view full details including resolution
- Notification badge when status changes
- Shows all comments/activity (from portal and Trello)

**Implementation:**
```typescript
// New API endpoint
GET /api/trello/my-requests
Response: {
  requests: [{
    id: "...",
    orderNumber: "ORD-134519981",
    customerEmail: "customer@example.com",
    requestType: "Order Cancellation",
    status: "resolved",
    resolutionStatus: "resolved",
    resolutionNotes: "Order cancelled and refunded. Customer notified.",
    resolvedBy: "Agent Name",
    resolvedAt: "2025-11-18T...",
    comments: [
      {
        author: "Agent Name",
        text: "Order cancelled and refunded",
        timestamp: "2025-11-18T...",
        source: "portal"
      },
      {
        author: "Another Agent",
        text: "Refund details emailed to buyer",
        timestamp: "2025-11-18T...",
        source: "trello" // Synced from Trello
      }
    ],
    trelloCardUrl: "https://trello.com/c/..." // Link to view in Trello if needed
  }]
}
```

**UI Design:**
- List view: Order Number, Customer, Request Type, Status, Resolved Date
- Detail view: Full request details, resolution notes, all comments/activity
- Status badges: Color-coded (Pending=Yellow, In Progress=Blue, Resolved=Green, Follow-up=Orange)
- Filter/Sort: By status, date, request type

#### Teams Webhook Integration

**Setup:**
1. In Teams channel, click "..." → "Connectors"
2. Search for "Incoming Webhook"
3. Configure webhook
4. Copy webhook URL
5. Add to environment variables

**Notification Format:**
```typescript
// When request resolved
const teamsMessage = {
  "@type": "MessageCard",
  "@context": "https://schema.org/extensions",
  "summary": "Trello Request Resolved",
  "themeColor": "0078D4",
  "title": "✅ Your Trello Request Has Been Resolved",
  "sections": [{
    "activityTitle": `Order: ${orderNumber}`,
    "activitySubtitle": `Customer: ${customerName}`,
    "facts": [{
      "name": "Request Type:",
      "value": requestType
    }, {
      "name": "Resolved By:",
      "value": resolvedByName
    }, {
      "name": "Resolution:",
      "value": resolutionStatus
    }],
    "text": resolutionNotes || "No additional notes."
  }],
  "potentialAction": [{
    "@type": "OpenUri",
    "name": "View in Portal",
    "targets": [{
      "os": "default",
      "uri": `${portalUrl}/trello/requests/${taskId}`
    }]
  }]
};

await fetch(TEAMS_WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(teamsMessage)
});
```

---

## Comparison: Portal vs Trello-Only

| Feature | Portal Integration | Trello-Only |
|---------|-------------------|-------------|
| **Even Distribution** | ✅ Automatic round-robin | ❌ Manual, competitive |
| **Agent Notifications** | ✅ Multiple channels | ❌ Must check Trello |
| **Analytics** | ✅ Full tracking | ❌ Limited |
| **Workload Visibility** | ✅ Per-agent breakdown | ❌ Everyone sees all |
| **Integration** | ✅ Unified with other tasks | ❌ Separate system |
| **Assignment Control** | ✅ Manager-controlled | ❌ First-come-first-served |

---

## Risk Assessment

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Trello API rate limits | Medium | Implement caching, batch updates |
| Trello API changes | Low | Version API calls, monitor updates |
| Sync failures | Medium | Retry logic, manual sync option |
| Teams webhook unavailable | Low | Email fallback, in-portal notifications |

### Business Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| User adoption | Medium | Training, gradual rollout |
| Notification spam | Low | Smart notification rules |
| Data accuracy | Low | Comprehensive testing |

---

## Success Metrics

### Technical Metrics
- **Sync Success Rate:** > 99% successful Trello syncs
- **Notification Delivery:** > 95% notifications delivered
- **API Reliability:** > 99.5% successful API calls

### Business Metrics
- **Agent Adoption:** 80%+ of requests submitted via portal within 30 days
- **Resolution Time:** Track and improve average resolution time
- **User Satisfaction:** Positive feedback from customer service team
- **Work Distribution:** Even distribution across agents (no competition)

---

## Next Steps

### Immediate Actions

1. **Get Trello API Credentials**
   - [ ] Obtain API Key and Token
   - [ ] Get Board ID and List IDs
   - [ ] Test API access

2. **Set Up Teams Webhook (Optional)**
   - [ ] Create webhook in Teams channel
   - [ ] Test webhook with sample message
   - [ ] Get webhook URL

3. **Define Requirements**
   - [ ] Confirm form fields
   - [ ] Confirm request types
   - [ ] Confirm notification preferences
   - [ ] Confirm follow-up queue structure

4. **Development Planning**
   - [ ] Review implementation phases
   - [ ] Allocate development resources
   - [ ] Set target go-live date

---

## Questions to Answer

1. **Notification Preference:**
   - Teams webhook, email, or both?
   - Should notifications be immediate or batched?

2. **Request Types:**
   - What are all possible request types?
   - Are there different workflows per type?

3. **Follow-up Queues:**
   - How many follow-up queues?
   - What triggers a move to follow-up?

4. **Trello Integration:**
   - Keep Trello as backup/visibility?
   - Or fully migrate to portal?

5. **Assignment:**
   - Auto-assign immediately on submission?
   - Or manual assignment by manager?

---

## Conclusion

This Trello integration will:
- ✅ Eliminate competitive environment with even distribution
- ✅ Provide agent notifications when requests are resolved
- ✅ Integrate seamlessly with existing portal system
- ✅ Provide analytics and tracking
- ✅ Maintain Trello sync for visibility/backup

**Recommended Approach:**
- Start with Phase 1-3 (foundation, assignment, task management)
- Add notifications in Phase 5
- Use in-portal notifications as primary, Teams as secondary

**Timeline:** 6 weeks for full implementation, or 3-4 weeks for MVP (without notifications)

---

**Document Version:** 1.0  
**Last Updated:** November 2025

