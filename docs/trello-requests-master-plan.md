# Trello Requests - Master Implementation Plan
## Customer Service Request Management System

**Date:** November 2025  
**Status:** Planning Phase - Ready for Implementation  
**Last Updated:** November 2025

---

## Executive Summary

Build a customer service request management system integrated into the portal that:
- Allows customer service agents to submit requests via form
- Automatically assigns requests to portal agents (round-robin)
- Portal agents work requests in private queues (no shared board)
- Notifies customer service agents when requests are resolved
- Tracks all requests and resolutions

**Key Decision:** Direct Messages (DMs) in Teams for notifications (requires IT approval for Microsoft Graph API)

---

## System Requirements

### Core Features

1. ✅ **Form Submission**
   - Customer service agents submit requests via portal form
   - Fields: Request Type, Order Number, Customer Email, Customer Name, Reason, Priority
   - Stores requester info (email, name)

2. ✅ **Automatic Assignment**
   - Round-robin assignment to agents with Trello specialization enabled
   - Even distribution based on current workload
   - No shared board - agents only see their own assigned requests

3. ✅ **Private Agent Queues**
   - Each agent sees only their assigned requests
   - No visibility into other agents' work
   - Prevents competition, ensures privacy

4. ✅ **Custom Dispositions**
   - Similar to Yotpo system
   - Options: Resolved, Follow-up (various reasons), Cannot Resolve
   - Some dispositions require notes
   - Follow-up moves to follow-up queue

5. ✅ **Customer Service Notifications**
   - **Primary:** Teams Direct Messages (requires IT approval)
   - **Fallback:** Email via SMTP (if IT says no)
   - Direct notification to specific agent (not all 250+ agents)

6. ✅ **Resolution Visibility**
   - Customer service agents can view resolution details
   - Public view (no portal account needed)
   - Shows all requests submitted by that agent

---

## Database Schema

### Task Model (Update Existing)

```prisma
model Task {
  // ... existing fields ...
  taskType         TaskType  // Add TRELLO_REQUEST to enum
  status           TaskStatus  // PENDING, IN_PROGRESS, COMPLETED
  assignedToId     String?
  assignedTo       User?
  disposition      String?     // "Resolved", "Follow-up - [reason]", etc.
  notes            String?     @db.Text  // Resolution notes
  // ... rest of existing fields ...
}
```

### TrelloRequest Model (New)

```prisma
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
  priority          String?  // "normal", "high", "urgent"
  
  // Requester Info (Customer Service Agent)
  requestedByEmail  String?  // Email of agent who submitted
  requestedByName   String?  // Name of agent who submitted
  requestedByUserId String?  // User ID if they have portal account
  
  // Resolution Tracking
  resolutionNotes   String?  @db.Text
  resolvedAt        DateTime?
  resolvedBy        String?  // User ID who resolved it
  resolvedByName    String?
  
  // Notification Tracking
  notificationSent  Boolean  @default(false)
  notificationSentAt DateTime?
  notificationToken String?  // Unique token for public view access
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  @@index([requestedByEmail])
  @@index([requestType])
  @@index([notificationToken])
}
```

---

## Implementation Phases

### Phase 1: Form Submission & Auto-Assignment (Week 1)

**Tasks:**
1. Database schema updates
   - Add `TRELLO_REQUEST` to TaskType enum
   - Create `TrelloRequest` model
   - Run migration

2. Form component
   - Create form in portal (similar to Yotpo)
   - Fields: Request Type, Order Number, Customer Email, Customer Name, Reason, Priority
   - Form validation
   - Store requester info (email, name from form or session)

3. API endpoint: `/api/trello/submit`
   - Create Task with `taskType: TRELLO_REQUEST`
   - Create TrelloRequest record
   - **Automatic Assignment:**
     - Get agents with Trello specialization enabled
     - Get their current TRELLO_REQUEST task counts
     - Round-robin assign to agent with least workload
     - Set task status to IN_PROGRESS
     - Set assignedToId

**Deliverable:** Form creates request and auto-assigns to agent

---

### Phase 2: Agent Private Queue (Week 2)

**Tasks:**
1. Agent specialization
   - Add "Trello Requests" toggle in Settings
   - Update agent specialization logic
   - Add to workload API

2. Agent portal view
   - New section: "Customer Service Requests"
   - Show only tasks assigned to logged-in agent
   - Filter by status: Pending, In Progress, Completed
   - Similar to existing task views (Text Club, Yotpo)

3. Task list view
   - Display: Order Number, Customer, Request Type, Priority, Status
   - Sort by: Created Date, Priority
   - Filter by: Status, Request Type, Priority

4. Task detail view
   - Full request details
   - Requester info (who submitted it)
   - Resolution form

**Deliverable:** Agents see only their assigned requests

---

### Phase 3: Custom Dispositions & Follow-up (Week 3)

**Tasks:**
1. Disposition system (like Yotpo)
   - Create disposition options:
     - "Resolved"
     - "Follow-up - Order Unlock Needed"
     - "Follow-up - Customer Contact Required"
     - "Follow-up - Other" (note required)
     - "Cannot Resolve" (note required)

2. Follow-up queue
   - When disposition is "Follow-up - ...", task moves to follow-up status
   - Create follow-up queue view for managers
   - Agents can see their own follow-up tasks

3. Resolution logic
   - Update Task: status = COMPLETED, disposition, notes, endTime
   - Update TrelloRequest: resolutionNotes, resolvedBy, resolvedAt
   - If follow-up: set follow-up flag

**Deliverable:** Custom dispositions working, follow-up queue functional

---

### Phase 4: Customer Service Notifications (Week 4)

**Tasks:**
1. **Primary: Teams Direct Messages (Requires IT Approval)**
   - Request IT to set up Microsoft Graph API or Teams Bot
   - Get Azure App Registration credentials
   - Implement DM sending:
     - Get access token (OAuth)
     - Get user's Teams ID from email
     - Create or get chat
     - Send direct message
   - Include resolution details in message
   - Include link to public view

2. **Fallback: Email via SMTP (If IT Says No)**
   - Use Office 365 SMTP (if available)
   - Send email directly to agent
   - Include resolution details
   - Include link to public view

3. Public view
   - Route: `/trello/my-requests?email=agent@example.com`
   - No login required - just email lookup
   - Shows all requests for that email
   - Highlights newest resolution
   - Click to view full details

4. Notification tracking
   - Mark notification as sent
   - Store notification timestamp
   - Handle notification failures

**Deliverable:** Customer service agents receive direct notifications

---

### Phase 5: Manager Dashboard & Analytics (Week 5)

**Tasks:**
1. Manager dashboard
   - Overview stats: Total requests, Pending, In Progress, Resolved
   - Request queue (all requests, not just assigned)
   - Assignment interface (manual override if needed)
   - Follow-up queue view

2. Analytics
   - Request type breakdown
   - Resolution time tracking
   - Agent performance metrics
   - Disposition distribution
   - Follow-up rate

3. Integration with existing analytics
   - Add to overall portal metrics
   - Include in agent workload calculations
   - Add to performance tracking

**Deliverable:** Complete manager dashboard and analytics

---

### Phase 6: Polish & Testing (Week 6)

**Tasks:**
1. UI/UX polish
   - Consistent styling with other task types
   - Loading states
   - Error handling
   - Success confirmations
   - Form validation

2. Testing
   - End-to-end testing
   - User acceptance testing
   - Performance testing
   - Notification testing

3. Documentation
   - User guide for customer service agents
   - User guide for portal agents
   - Manager guide

4. Bug fixes
   - Fix any issues found
   - Optimize performance
   - Final polish

**Deliverable:** Production-ready system

---

## Notification System Details

### Primary: Teams Direct Messages

**Requirements:**
- Microsoft Graph API OR Teams Bot
- Azure App Registration (IT needs to set up)
- OAuth 2.0 authentication
- Agent's Teams user ID or email

**What IT Needs to Set Up:**
1. Azure App Registration
   - App Name: "Portal Teams Integration"
   - API Permissions: `Chat.ReadWrite`, `User.Read`
   - Client ID and Client Secret
   - Tenant ID

2. OAuth Configuration
   - Redirect URI: `https://your-portal.netlify.app/api/auth/callback`
   - Grant type: Client Credentials or Authorization Code

**Implementation:**
- Get access token via OAuth
- Get user's Teams ID from email
- Create or get existing chat
- Send direct message with resolution details
- Include link to public view

**Timeline:** 4 weeks (including IT setup)

---

### Fallback: Email via SMTP

**If IT Says No to Teams DMs:**

**Requirements:**
- Office 365 SMTP access (or other SMTP)
- SMTP credentials

**Implementation:**
```typescript
// Send email directly to agent
await sendEmail({
  to: trelloRequest.requestedByEmail,
  subject: `✅ Request Resolved: ${orderNumber}`,
  html: emailTemplate(trelloRequest)
});
```

**Pros:**
- ✅ Direct to agent's email
- ✅ Free (if you have O365)
- ✅ No IT permissions needed (if you have email access)
- ✅ Works immediately

**Timeline:** 2-3 weeks (no IT setup needed)

---

### Public View (Always Available)

**Route:** `/trello/my-requests?email=agent@example.com`

**Features:**
- No login required
- Email lookup (email acts as password)
- Shows all requests for that email
- Highlights newest resolution
- Click to view full details

**Security:**
- Only shows requests for that email address
- No sensitive data exposed
- Could add token-based access if needed

---

## IT Request Template

**Subject: Azure App Registration for Teams Direct Messages**

"Hi IT Team,

We need to set up Microsoft Graph API access to send direct messages in Teams for our customer service request system.

**What we need:**
1. Azure App Registration with:
   - App Name: "Portal Teams Integration"
   - API Permissions:
     - `Chat.ReadWrite` (to send messages)
     - `User.Read` (to look up users)
   - Client ID and Client Secret
   - Tenant ID

2. OAuth 2.0 configuration:
   - Redirect URI: `https://our-portal.netlify.app/api/auth/callback`
   - Grant type: Client Credentials or Authorization Code

**Purpose:**
- Send direct messages to customer service agents when their requests are resolved
- Only the specific agent receives the notification (not all 250+ agents)
- Improves notification clarity and reduces channel spam

**Timeline:**
- One-time setup: 30-60 minutes
- Ongoing: No maintenance needed

**Alternative:**
- If Graph API is too complex, we can use Teams Bot Framework instead (simpler setup)
- Or we can use email fallback (SMTP) if Teams DMs are not possible

Please let me know if you can help with this setup or if you have questions.

Thanks!"

---

## Key Decisions Made

1. ✅ **No Shared Board:** Agents work in private queues (no kanban board)
2. ✅ **Automatic Assignment:** Round-robin to agents with Trello specialization
3. ✅ **Direct Messages:** Teams DMs for notifications (not channel)
4. ✅ **No Portal Accounts:** Customer service agents don't need portal accounts
5. ✅ **Public View:** Email lookup for viewing resolutions
6. ✅ **Custom Dispositions:** Like Yotpo system with follow-up options
7. ✅ **Email Fallback:** If IT says no to Teams DMs, use email

---

## Timeline Summary

| Phase | Duration | Key Deliverable |
|-------|----------|-----------------|
| Phase 1: Form & Auto-Assignment | 1 week | Form creates request, auto-assigns |
| Phase 2: Private Queue | 1 week | Agents see only their requests |
| Phase 3: Dispositions | 1 week | Custom dispositions, follow-up queue |
| Phase 4: Notifications | 1 week | Teams DMs or email fallback |
| Phase 5: Manager Dashboard | 1 week | Analytics and management tools |
| Phase 6: Polish & Testing | 1 week | Production-ready system |
| **Total** | **6 weeks** | **Complete system** |

**Note:** Phase 4 may take longer if waiting for IT approval (add 1-2 weeks for IT setup)

---

## Technical Requirements

### Database
- PostgreSQL (Railway) - already set up
- Prisma migrations
- New models: `TrelloRequest`

### API Endpoints Needed
```
POST   /api/trello/submit              - Submit new request
GET    /api/trello/requests            - Get agent's assigned requests
PUT    /api/trello/requests/[id]       - Update request
PUT    /api/trello/requests/[id]/complete - Complete request
GET    /api/trello/my-requests         - Get customer service agent's requests (public)
GET    /api/trello/resolution/[id]     - Get resolution details (public)
POST   /api/trello/notify              - Send notification (internal)
```

### Environment Variables
```env
# Teams (if using DMs)
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...
AZURE_TENANT_ID=...

# Email (if using SMTP fallback)
SMTP_HOST=smtp.office365.com
SMTP_USER=...
SMTP_PASS=...

# Portal
PORTAL_URL=https://your-portal.netlify.app
```

---

## Related Documents

1. `trello-requests-private-queue-plan.md` - Initial plan with private queues
2. `customer-service-notification-options.md` - Notification options analysis
3. `trello-requests-teams-notification-plan.md` - Teams webhook approach
4. `trello-requests-direct-notification-solution.md` - Direct notification solutions
5. `trello-requests-teams-dm-solution.md` - Teams DM implementation details

---

## Next Steps (When Ready)

1. **Get IT Approval:**
   - Request Azure App Registration for Teams DMs
   - Or confirm email SMTP access for fallback

2. **Start Development:**
   - Phase 1: Form submission and auto-assignment
   - Phase 2: Private agent queues
   - Phase 3: Custom dispositions

3. **Set Up Notifications:**
   - If IT approves: Implement Teams DMs
   - If not: Implement email fallback

4. **Testing:**
   - End-to-end testing
   - User acceptance testing
   - Notification testing

---

## Questions to Answer Before Starting

1. **Request Types:**
   - What are all possible request types? (Order Cancellation, Refund, etc.)
   - Are there different workflows per type?

2. **Dispositions:**
   - Confirm disposition options
   - Which ones require notes?
   - What triggers follow-up?

3. **Priority Levels:**
   - Normal, High, Urgent - or different?
   - How does priority affect assignment?

4. **Notification Preference:**
   - Teams DMs (requires IT) or Email (fallback)?
   - What information should be in notification?

5. **Form Location:**
   - Where should customer service agents access the form?
   - Separate page or section in portal?

---

## Status

**Current Status:** Planning Complete - Ready for Implementation

**Blockers:**
- IT approval needed for Teams DMs (or confirm email SMTP access)

**Ready to Start:**
- Phase 1 can begin immediately (form + auto-assignment)
- Phase 4 depends on IT approval (notifications)

---

**Document Version:** 1.0  
**Last Updated:** November 2025  
**Next Review:** When ready to begin implementation

