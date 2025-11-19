# Trello Requests - Teams Notification Solution
## No Portal Accounts, No Paid Services, No IT Permissions Needed

**Date:** November 2025  
**Purpose:** Solution that works without portal accounts, email services, or IT permissions

---

## The Challenge

- ❌ Too many customer service agents for portal accounts
- ❌ Password management nightmare
- ❌ Email requires paid service
- ⚠️ Teams needs IT permissions (maybe)

## The Solution: Teams Webhook (No IT Permissions Needed!)

**Key Insight:** Creating a Teams webhook doesn't require IT permissions! Anyone with access to a Teams channel can create one.

---

## Solution Overview

### Primary: Teams Webhook Notification
- Customer service agent submits request via form
- Portal agent resolves request
- **Teams webhook sends notification to Teams channel**
- Customer service agent sees notification in Teams
- Click link to view resolution details (public view, no login)

### Secondary: Public Resolution View
- Public URL where customer service agents can view resolutions
- No login required - just enter email address
- Shows all requests submitted by that email
- Works as backup if Teams notification fails

---

## Implementation: Teams Webhook (No IT Permissions!)

### How Teams Webhooks Work

**Anyone can create a webhook:**
1. Go to Teams channel
2. Click "..." → "Connectors"
3. Search for "Incoming Webhook"
4. Configure webhook
5. Copy webhook URL
6. Done! No IT needed.

**No Permissions Required:**
- You just need access to the Teams channel
- No admin rights needed
- No IT approval needed
- Takes 2 minutes to set up

### Setup Steps

1. **Create Webhook in Teams:**
   - Go to your Teams channel
   - Click "..." (channel options)
   - Click "Connectors"
   - Search for "Incoming Webhook"
   - Click "Configure"
   - Give it a name (e.g., "Customer Service Requests")
   - Click "Create"
   - **Copy the webhook URL**

2. **Add to Portal:**
   - Add webhook URL to Netlify environment variables
   - `TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/...`

3. **Done!**
   - No IT permissions needed
   - No additional setup
   - Works immediately

### Notification Format

When request is resolved, send Teams message:

```typescript
// When portal agent resolves request
const teamsMessage = {
  "@type": "MessageCard",
  "@context": "https://schema.org/extensions",
  "summary": "Request Resolved",
  "themeColor": "0078D4",
  "title": "✅ Customer Service Request Resolved",
  "sections": [{
    "activityTitle": `Order: ${orderNumber}`,
    "activitySubtitle": `Customer: ${customerName}`,
    "facts": [
      {
        "name": "Request Type:",
        "value": requestType
      },
      {
        "name": "Status:",
        "value": disposition
      },
      {
        "name": "Resolved By:",
        "value": resolvedByName
      },
      {
        "name": "Resolved At:",
        "value": resolvedAt
      }
    ],
    "text": `**Resolution Notes:**\n${resolutionNotes}`
  }],
  "potentialAction": [{
    "@type": "OpenUri",
    "name": "View Full Details",
    "targets": [{
      "os": "default",
      "uri": `${portalUrl}/trello/resolution/${requestId}?email=${encodeURIComponent(requestedByEmail)}`
    }]
  }]
};

// Send to Teams
await fetch(process.env.TEAMS_WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(teamsMessage)
});
```

### What Customer Service Agent Sees

**In Teams Channel:**
```
┌─────────────────────────────────────────┐
│ ✅ Customer Service Request Resolved    │
├─────────────────────────────────────────┤
│ Order: ORD-134519981                    │
│ Customer: John Doe                      │
│                                         │
│ Request Type: Order Cancellation        │
│ Status: Resolved                         │
│ Resolved By: Agent Name                 │
│ Resolved At: Nov 18, 2025 3:30 PM      │
│                                         │
│ Resolution Notes:                       │
│ Order cancelled and refunded. Customer   │
│ notified via email.                     │
│                                         │
│ [View Full Details] ← Clickable link    │
└─────────────────────────────────────────┘
```

**When They Click "View Full Details":**
- Opens public page (no login required)
- Shows full resolution details
- Shows all their submitted requests

---

## Backup: Public Resolution View

### Public URL (No Login Required)

**URL Format:**
```
https://your-portal.com/trello/resolution/[requestId]?email=customer-service@example.com
```

**How It Works:**
1. Customer service agent receives Teams notification
2. Clicks "View Full Details" link
3. Opens public page
4. **No login required** - just shows resolution
5. Can also manually visit: `/trello/my-requests?email=their-email`
6. Enter email address to see all their requests

### Implementation

```typescript
// Public route: /trello/my-requests
// No authentication required
// Just email lookup

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  
  if (!email) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 });
  }
  
  // Get all requests for this email
  const requests = await prisma.trelloRequest.findMany({
    where: {
      requestedByEmail: email
    },
    include: {
      task: {
        include: {
          assignedTo: { select: { name: true } }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
  
  return NextResponse.json({ requests });
}
```

### Public View UI

```
┌─────────────────────────────────────────┐
│  Your Customer Service Requests         │
├─────────────────────────────────────────┤
│  Enter your email to view requests:     │
│  [customer-service@example.com] [View]  │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ ✅ ORD-134519981 (Resolved)       │ │
│  │ Customer: John Doe                │ │
│  │ Resolved: Nov 18, 3:30 PM         │ │
│  │ [View Details]                    │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ ⏳ ORD-134520000 (In Progress)     │ │
│  │ Customer: Jane Smith               │ │
│  │ Submitted: Nov 18, 2:00 PM        │ │
│  └───────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Security:**
- Only shows requests for that email address
- No sensitive data exposed
- Email acts as "password" (simple but effective)
- Could add email verification if needed (optional)

---

## Complete Flow

### 1. Request Submission
```
Customer Service Agent
    ↓
Fills Form in Portal (or separate form page)
    ↓
Request Created
    ↓
Auto-Assigned to Portal Agent
```

### 2. Resolution
```
Portal Agent
    ↓
Works Request
    ↓
Resolves with Disposition & Notes
    ↓
Resolution Stored in Database
```

### 3. Notification
```
System
    ↓
Sends Teams Webhook Notification
    ↓
Customer Service Agent Sees in Teams
    ↓
Clicks "View Full Details"
    ↓
Opens Public Page (No Login)
    ↓
Views Resolution Details
```

---

## Implementation Details

### Teams Webhook Setup (2 Minutes)

1. **In Teams:**
   - Channel → "..." → "Connectors"
   - "Incoming Webhook" → "Configure"
   - Name it → "Create"
   - **Copy URL**

2. **In Netlify:**
   - Environment Variables
   - Add: `TEAMS_WEBHOOK_URL=your-webhook-url`

3. **In Code:**
   - When request resolved, send webhook
   - Include resolution details
   - Include link to public view

**That's it!** No IT permissions needed.

### Public View Setup

1. **Create Public Route:**
   - `/trello/my-requests` (public, no auth)
   - Email lookup
   - Show requests for that email

2. **Create Detail Route:**
   - `/trello/resolution/[id]` (public, no auth)
   - Email verification (optional)
   - Show full resolution details

3. **UI:**
   - Simple email input
   - List of requests
   - Click to view details

---

## Advantages of This Approach

### Teams Webhook
- ✅ **No IT Permissions:** Anyone can create webhook
- ✅ **Free:** No cost
- ✅ **Real-Time:** Push notification
- ✅ **Familiar:** Your team uses Teams
- ✅ **Visible:** Hard to miss
- ✅ **Clickable:** Direct link to details

### Public View
- ✅ **No Portal Accounts:** No password management
- ✅ **No Login Required:** Just email lookup
- ✅ **Always Available:** Can bookmark URL
- ✅ **Simple:** Easy to use
- ✅ **Backup:** Works if Teams notification fails

### Combined
- ✅ **Redundant:** Two ways to access
- ✅ **Flexible:** Teams for notification, public view for details
- ✅ **No Additional Costs:** Everything free
- ✅ **No IT Dependencies:** You can set up yourself

---

## What You Need

### Teams Webhook
- ✅ Access to Teams channel (you have this)
- ✅ 2 minutes to create webhook (you can do this)
- ✅ Webhook URL (you'll get this)

### Public View
- ✅ Public route in portal (I'll build this)
- ✅ Email lookup (simple database query)
- ✅ UI component (I'll build this)

### No Additional Services Needed
- ❌ No email service
- ❌ No portal accounts for customer service
- ❌ No IT permissions
- ❌ No paid services

---

## Security Considerations

### Public View Security

**Option 1: Email as "Password" (Simple)**
- Just email lookup
- Anyone with email can view
- Good enough for internal use

**Option 2: Email Verification (More Secure)**
- Send verification code to email
- Enter code to view
- More secure but more steps

**Option 3: Token-Based (Most Secure)**
- Generate unique token per request
- Include token in Teams notification link
- Token acts as password
- Most secure, still no login

**Recommendation:** Start with Option 1 (email lookup), upgrade to Option 3 (token-based) if needed.

---

## Code Implementation

### Teams Webhook Sender

```typescript
// When request resolved
export async function sendTeamsNotification(trelloRequest: TrelloRequest) {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  
  if (!webhookUrl) {
    console.warn('Teams webhook URL not configured');
    return;
  }
  
  const message = {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    "summary": "Request Resolved",
    "themeColor": "0078D4",
    "title": "✅ Customer Service Request Resolved",
    "sections": [{
      "activityTitle": `Order: ${trelloRequest.orderNumber}`,
      "activitySubtitle": `Customer: ${trelloRequest.customerName}`,
      "facts": [
        { "name": "Request Type:", "value": trelloRequest.requestType },
        { "name": "Status:", "value": trelloRequest.task.disposition },
        { "name": "Resolved By:", "value": trelloRequest.resolvedByName },
        { "name": "Resolved At:", "value": formatDate(trelloRequest.resolvedAt) }
      ],
      "text": `**Resolution Notes:**\n${trelloRequest.resolutionNotes}`
    }],
    "potentialAction": [{
      "@type": "OpenUri",
      "name": "View Full Details",
      "targets": [{
        "os": "default",
        "uri": `${process.env.PORTAL_URL}/trello/resolution/${trelloRequest.id}?email=${encodeURIComponent(trelloRequest.requestedByEmail)}`
      }]
    }]
  };
  
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });
  } catch (error) {
    console.error('Failed to send Teams notification:', error);
  }
}
```

### Public View Route

```typescript
// app/trello/my-requests/route.ts (PUBLIC, no auth)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  
  if (!email) {
    // Show email input form
    return NextResponse.json({ 
      needsEmail: true,
      message: 'Enter your email to view requests'
    });
  }
  
  // Get requests for this email
  const requests = await prisma.trelloRequest.findMany({
    where: { requestedByEmail: email },
    include: {
      task: {
        include: {
          assignedTo: { select: { name: true, email: true } }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
  
  return NextResponse.json({ requests });
}
```

---

## Timeline

**Week 1:** Form + Auto-Assignment  
**Week 2:** Private Queue + Resolution  
**Week 3:** Teams Webhook Integration  
**Week 4:** Public View  
**Week 5:** Testing & Polish  

**Total: 5 weeks** (slightly faster since no email service setup)

---

## Next Steps

1. **Test Teams Webhook:**
   - Create webhook in Teams channel (2 minutes)
   - Get webhook URL
   - Test with sample message

2. **Confirm Approach:**
   - Teams webhook for notifications
   - Public view for details
   - No portal accounts needed

3. **Start Development:**
   - Build form submission
   - Build resolution flow
   - Add Teams webhook
   - Build public view

---

## Summary

**Solution:**
- ✅ Teams webhook (no IT permissions needed - you can create it)
- ✅ Public view (no login required - just email lookup)
- ✅ No portal accounts for customer service
- ✅ No paid services
- ✅ No IT dependencies

**What You Need:**
- Access to Teams channel (you have this)
- 2 minutes to create webhook (you can do this)
- I'll build the rest

**Ready to proceed?** This solves all your concerns!

