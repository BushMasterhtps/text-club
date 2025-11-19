# Customer Service Notification Options
## How to Notify Customer Service Agents When Requests Are Resolved

**Date:** November 2025  
**Purpose:** Evaluate options for notifying customer service agents when their submitted requests are completed

---

## The Problem

**Current Flow:**
1. Customer service agent submits request (via Microsoft Form → Trello)
2. Portal agent works request
3. Portal agent resolves request
4. **How does customer service agent know it's done and see the response?**

**Requirements:**
- Customer service agent needs to know request is resolved
- Customer service agent needs to see resolution details/response
- Should be reliable and easy to access

---

## Option 1: In-Portal "My Requests" Section (Recommended Primary)

### How It Works
- Customer service agents have portal accounts (or can access portal)
- New section: "My Requests" shows all requests they submitted
- Real-time status updates (Pending → In Progress → Resolved)
- Click to view full resolution details
- Notification badge when new resolution

### Implementation
```typescript
// API Endpoint
GET /api/trello/my-requests
// Returns all requests where requestedByEmail = currentUser.email

// UI Component
"My Requests" section in portal:
- List view: Order Number, Customer, Status, Resolved Date
- Detail view: Full request + resolution details
- Badge notification when resolved
```

### Pros
- ✅ **Always Available:** Accessible anytime in portal
- ✅ **Full Details:** See complete resolution, notes, who resolved it
- ✅ **No External Dependencies:** Works entirely within portal
- ✅ **Real-Time:** Updates immediately when resolved
- ✅ **Searchable:** Can filter/sort by status, date, order number
- ✅ **No Additional Setup:** Uses existing portal infrastructure
- ✅ **Free:** No additional costs

### Cons
- ❌ **Requires Portal Access:** Customer service agents need portal accounts
- ❌ **Must Check Portal:** Not push notification (unless we add badge)
- ⚠️ **Learning Curve:** Agents need to know where to look

### Best For
- Primary notification method
- Agents who regularly use portal
- When you want full control and no external dependencies

---

## Option 2: Email Notification

### How It Works
- When request is resolved, send email to `requestedByEmail`
- Email includes:
  - Order number
  - Customer info
  - Resolution status
  - Resolution notes
  - Link to view in portal (optional)

### Implementation
```typescript
// When request resolved
await sendEmail({
  to: trelloRequest.requestedByEmail,
  subject: `Request Resolved: ${orderNumber}`,
  html: `
    <h2>Your Customer Service Request Has Been Resolved</h2>
    <p><strong>Order Number:</strong> ${orderNumber}</p>
    <p><strong>Customer:</strong> ${customerName}</p>
    <p><strong>Status:</strong> ${disposition}</p>
    <p><strong>Resolution Notes:</strong></p>
    <p>${resolutionNotes}</p>
    <p><strong>Resolved By:</strong> ${resolvedByName}</p>
    <p><strong>Resolved At:</strong> ${resolvedAt}</p>
    <p><a href="${portalUrl}/trello/my-requests">View in Portal</a></p>
  `
});
```

### Email Service Options

**Option A: SMTP (Simple)**
- Use existing email server (Office 365, Gmail, etc.)
- Send via SMTP
- Requires: SMTP credentials

**Option B: SendGrid (Recommended)**
- Email service provider
- Reliable delivery
- Good for transactional emails
- Free tier: 100 emails/day
- Paid: ~$15/month for 40k emails

**Option C: AWS SES**
- Amazon's email service
- Very reliable
- Pay per email (~$0.10 per 1000 emails)
- Good for high volume

**Option D: Resend**
- Modern email API
- Developer-friendly
- Free tier: 100 emails/day
- Paid: $20/month for 50k emails

### Pros
- ✅ **Universal:** Everyone has email
- ✅ **Push Notification:** Agent gets email immediately
- ✅ **No Portal Access Needed:** Works even if agent doesn't use portal
- ✅ **Familiar:** Everyone knows how to use email
- ✅ **Searchable:** Agents can search email history
- ✅ **Reliable:** Email is well-established technology

### Cons
- ❌ **Can Get Lost:** Emails can go to spam or get buried
- ❌ **Limited Details:** Email body has limited space
- ❌ **No Real-Time Updates:** Must refresh email
- ❌ **Additional Service:** Need email service setup
- ⚠️ **Cost:** May have costs depending on volume

### Best For
- Backup notification method
- Agents who don't regularly check portal
- When you want push notification
- High-volume scenarios (with proper email service)

---

## Option 3: Microsoft Teams Notification

### How It Works
- Send notification to Teams channel or direct message
- Teams message card with resolution details
- Clickable link to view in portal

### Implementation Options

**Option A: Teams Webhook (Easiest)**
```typescript
// Send to Teams channel via webhook
POST to Teams webhook URL:
{
  "@type": "MessageCard",
  "title": "✅ Request Resolved",
  "sections": [{
    "activityTitle": `Order: ${orderNumber}`,
    "facts": [{
      "name": "Customer:",
      "value": customerName
    }, {
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

**Option B: Microsoft Graph API (More Control)**
- Send direct message to specific user
- More complex setup (OAuth, Azure App)
- Better for targeted notifications

### Pros
- ✅ **Real-Time:** Push notification in Teams
- ✅ **Familiar:** Your team already uses Teams
- ✅ **Visible:** Hard to miss in Teams
- ✅ **Clickable:** Link directly to portal
- ✅ **You Already Use This:** You mentioned Teams workflow cards work

### Cons
- ❌ **Channel Spam:** If sent to channel, can clutter
- ❌ **Setup Required:** Need webhook or Graph API access
- ❌ **Teams Only:** Only works for Teams users
- ⚠️ **Limited Details:** Message cards have character limits

### Best For
- Teams-heavy organizations
- When you want push notifications
- Complement to in-portal notifications
- You already have Teams workflow setup

---

## Option 4: Microsoft Forms Response (If Using Forms)

### How It Works
- If customer service agents submit via Microsoft Form
- Form can send response email when form is "completed"
- Portal updates form response with resolution details

### Implementation
- Requires Microsoft Forms API or Power Automate
- Portal updates form response
- Form sends notification to original submitter

### Pros
- ✅ **Integrated:** Works with existing Forms workflow
- ✅ **Familiar:** Agents already use Forms

### Cons
- ❌ **Complex:** Requires Forms API or Power Automate
- ❌ **Limited:** Forms responses have limitations
- ❌ **Not Ideal:** Better to move to portal form

### Best For
- If you must keep Microsoft Forms
- Temporary solution during migration

---

## Option 5: Hybrid Approach (Recommended)

### Combination of Multiple Methods

**Primary: In-Portal "My Requests"**
- Always available
- Full details
- Searchable history

**Secondary: Email Notification**
- Push notification
- Works even if agent doesn't check portal
- Backup method

**Optional: Teams Notification**
- Real-time push
- Good for urgent requests
- Complements other methods

### Implementation
```typescript
// When request resolved
async function notifyRequester(trelloRequest) {
  // 1. Update portal (always)
  // Resolution already stored in database
  // "My Requests" section automatically shows it
  
  // 2. Send email (if email provided)
  if (trelloRequest.requestedByEmail) {
    await sendEmail({
      to: trelloRequest.requestedByEmail,
      subject: `Request Resolved: ${trelloRequest.orderNumber}`,
      body: `...resolution details...`
    });
  }
  
  // 3. Send Teams notification (if webhook configured)
  if (process.env.TEAMS_WEBHOOK_URL) {
    await sendTeamsNotification({
      webhook: process.env.TEAMS_WEBHOOK_URL,
      message: `...resolution details...`
    });
  }
}
```

### Pros
- ✅ **Redundant:** Multiple ways to get notified
- ✅ **Flexible:** Agents can choose their preferred method
- ✅ **Reliable:** If one fails, others work
- ✅ **Comprehensive:** Covers all use cases

### Cons
- ⚠️ **More Setup:** Need to configure multiple services
- ⚠️ **Potential Spam:** Multiple notifications per resolution

---

## Comparison Table

| Option | Setup Complexity | Cost | Reliability | Push Notification | Full Details | Best For |
|--------|------------------|------|-------------|-------------------|--------------|----------|
| **In-Portal** | Low | Free | High | Badge only | ✅ Full | Primary method |
| **Email** | Medium | Low/Free | High | ✅ Yes | Limited | Backup/universal |
| **Teams** | Medium | Free | High | ✅ Yes | Limited | Teams users |
| **Forms Response** | High | Free | Medium | ✅ Yes | Limited | If using Forms |
| **Hybrid** | Medium-High | Low | Very High | ✅ Yes | ✅ Full | Recommended |

---

## Recommendation: Hybrid Approach

### Primary: In-Portal "My Requests"
- Build "My Requests" section in portal
- Shows all submitted requests with status
- Full resolution details
- Notification badge when resolved
- **Why:** Always available, full details, no external dependencies

### Secondary: Email Notification
- Send email when request resolved
- Include resolution summary
- Link to portal for full details
- **Why:** Push notification, works for everyone, backup method

### Optional: Teams Notification
- Send Teams message if webhook configured
- Quick summary with link
- **Why:** Real-time push, you already use Teams

---

## Implementation Details

### In-Portal "My Requests" (Required)

**Database Query:**
```typescript
// Get all requests submitted by current user
const requests = await prisma.trelloRequest.findMany({
  where: {
    requestedByEmail: currentUser.email
    // OR requestedByUserId: currentUser.id
  },
  include: {
    task: {
      include: {
        assignedTo: { select: { name: true, email: true } }
      }
    }
  },
  orderBy: { createdAt: 'desc' }
});
```

**UI Component:**
- List view with status badges
- Filter by status (All, Pending, In Progress, Resolved, Follow-up)
- Click to view full details
- Badge notification count

### Email Notification (Recommended)

**Setup Required:**
- Choose email service (SendGrid, Resend, AWS SES, or SMTP)
- Configure credentials
- Add to environment variables

**Implementation:**
```typescript
// When request resolved
if (trelloRequest.requestedByEmail) {
  await sendEmail({
    to: trelloRequest.requestedByEmail,
    subject: `✅ Request Resolved: ${orderNumber}`,
    html: emailTemplate(resolutionDetails)
  });
}
```

### Teams Notification (Optional)

**Setup Required:**
- Create Teams webhook in channel
- Add webhook URL to environment variables

**Implementation:**
```typescript
// When request resolved
if (process.env.TEAMS_WEBHOOK_URL) {
  await fetch(process.env.TEAMS_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(teamsMessageCard)
  });
}
```

---

## Cost Analysis

### In-Portal
- **Cost:** Free (uses existing infrastructure)
- **Setup:** Minimal (just build UI)

### Email
- **SMTP:** Free (if using existing email server)
- **SendGrid:** Free tier (100/day) or $15/month
- **Resend:** Free tier (100/day) or $20/month
- **AWS SES:** ~$0.10 per 1000 emails

### Teams
- **Cost:** Free (webhook is free)
- **Setup:** 5 minutes (create webhook)

**Estimated Monthly Cost:** $0-20 depending on email volume

---

## Decision Matrix

### Choose In-Portal If:
- ✅ Customer service agents have portal access
- ✅ You want full control
- ✅ You want zero additional costs
- ✅ You want full resolution details

### Add Email If:
- ✅ You want push notifications
- ✅ Some agents don't check portal regularly
- ✅ You want backup notification method
- ✅ You want universal coverage

### Add Teams If:
- ✅ Your team heavily uses Teams
- ✅ You want real-time push notifications
- ✅ You already have Teams workflow setup
- ✅ You want quick visibility

---

## Next Steps

1. **Decide on Approach:**
   - In-portal only?
   - In-portal + Email?
   - In-portal + Email + Teams? (Recommended)

2. **If Email:**
   - Choose email service (SendGrid, Resend, SMTP)
   - Get credentials
   - Test email sending

3. **If Teams:**
   - Create Teams webhook
   - Get webhook URL
   - Test webhook

4. **Implementation:**
   - Build "My Requests" section (always)
   - Add email notification (if chosen)
   - Add Teams notification (if chosen)

---

## Questions to Answer

1. **Do customer service agents have portal accounts?**
   - If yes: In-portal is perfect
   - If no: Email/Teams becomes more important

2. **How often do customer service agents check portal?**
   - If regularly: In-portal is sufficient
   - If rarely: Need email/Teams push

3. **Do you want push notifications?**
   - If yes: Add email or Teams
   - If no: In-portal with badge is enough

4. **What's your email volume?**
   - Low (<100/day): Free tier works
   - High (>100/day): Need paid service

5. **Do you already use Teams for notifications?**
   - If yes: Teams integration makes sense
   - If no: Email might be simpler

---

## My Recommendation

**Start with: In-Portal "My Requests" + Email Notification**

**Why:**
- In-portal gives full details and history
- Email gives push notification and backup
- Covers all use cases
- Reasonable setup complexity
- Low cost (free or ~$15/month)

**Add Teams later if needed:**
- Easy to add after initial implementation
- Good complement to email
- You already use Teams

---

**Ready to implement?** Let me know which approach you prefer and I can start building!

