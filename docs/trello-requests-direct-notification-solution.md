# Trello Requests - Direct Notification Solution
## Notify Only the Specific Agent (Not All 250+ Agents)

**Date:** November 2025  
**Problem:** 250+ customer service agents - can't notify everyone in channel

---

## The Problem

- ❌ Teams channel webhook notifies ALL 250+ agents
- ❌ Hard to find your own notification
- ❌ Privacy concerns (everyone sees all notifications)
- ❌ Need to notify ONLY the agent who submitted the request

---

## Solution Options

### Option 1: Token-Based Links (Recommended - No IT Permissions)

**How It Works:**
1. Generate unique token when request is created
2. Store token with request
3. Send Teams notification with unique token in link
4. Only that token can access that specific request
5. Agent clicks link, sees only their request

**Implementation:**
```typescript
// When request created
const uniqueToken = generateUniqueToken(); // e.g., "abc123xyz789"
await prisma.trelloRequest.create({
  data: {
    // ... request data ...
    notificationToken: uniqueToken
  }
});

// When resolved, send Teams notification
const teamsMessage = {
  "@type": "MessageCard",
  "title": "✅ Your Request Has Been Resolved",
  "sections": [{
    "activityTitle": `Order: ${orderNumber}`,
    "text": `Your request has been resolved. Click below to view details.`
  }],
  "potentialAction": [{
    "@type": "OpenUri",
    "name": "View Your Resolution",
    "targets": [{
      "uri": `${portalUrl}/trello/resolution?token=${uniqueToken}`
    }]
  }]
};

// Send to Teams channel (but only agent with token can view)
await sendTeamsWebhook(teamsMessage);
```

**Public View with Token:**
```typescript
// /trello/resolution?token=abc123xyz789
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  
  if (!token) {
    return showError('Token required');
  }
  
  // Find request by token
  const trelloRequest = await prisma.trelloRequest.findFirst({
    where: { notificationToken: token },
    include: { task: { include: { assignedTo: true } } }
  });
  
  if (!trelloRequest) {
    return showError('Invalid token');
  }
  
  // Show resolution details
  return showResolution(trelloRequest);
}
```

**Pros:**
- ✅ No IT permissions needed (just Teams webhook)
- ✅ Privacy: Only agent with token can view
- ✅ Simple: Token acts as password
- ✅ No portal accounts needed
- ✅ Works with existing Teams webhook

**Cons:**
- ⚠️ Still sends to channel (but only token holder can view details)
- ⚠️ Agent needs to recognize their notification

**Best For:** Quick solution, no IT dependencies

---

### Option 2: Microsoft Graph API Direct Messages (Requires IT)

**How It Works:**
1. Use Microsoft Graph API to send direct message
2. Message goes directly to agent's Teams inbox
3. Only that agent sees it
4. No channel spam

**Implementation:**
```typescript
// Requires: Azure App Registration, OAuth token
const graphClient = new Client({
  authProvider: {
    getAccessToken: async () => {
      // OAuth flow to get token
      return accessToken;
    }
  }
});

// Send direct message
await graphClient
  .api(`/users/${agentEmail}/chats`)
  .post({
    chatType: 'oneOnOne',
    members: [
      { '@odata.type': '#microsoft.graph.aadUserConversationMember', id: botId },
      { '@odata.type': '#microsoft.graph.aadUserConversationMember', id: agentUserId }
    ]
  });

await graphClient
  .api(`/chats/${chatId}/messages`)
  .post({
    body: {
      contentType: 'html',
      content: teamsMessageCard
    }
  });
```

**Pros:**
- ✅ Direct message (only agent sees it)
- ✅ No channel spam
- ✅ Professional
- ✅ Privacy guaranteed

**Cons:**
- ❌ Requires IT permissions (Azure App Registration)
- ❌ More complex setup
- ❌ OAuth token management
- ❌ Need to map emails to Teams user IDs

**Best For:** If you can get IT approval

---

### Option 3: Email (But You Don't Want Paid Service)

**Free Email Options:**

**Option A: SMTP (If You Have Email Server)**
- Use existing Office 365/Gmail SMTP
- Free if you already have email
- Send direct email to agent

**Option B: Resend Free Tier**
- 100 emails/day free
- Might be enough if not all requests resolve daily
- $20/month if you exceed

**Option C: AWS SES**
- Very cheap (~$0.10 per 1000 emails)
- Free tier: 62,000 emails/month free (first year)
- Then ~$0.10 per 1000

**Implementation:**
```typescript
// Send direct email
await sendEmail({
  to: trelloRequest.requestedByEmail,
  subject: `✅ Request Resolved: ${orderNumber}`,
  html: `
    <h2>Your Request Has Been Resolved</h2>
    <p>Order: ${orderNumber}</p>
    <p>Resolution: ${resolutionNotes}</p>
    <p><a href="${portalUrl}/trello/resolution?token=${token}">View Full Details</a></p>
  `
});
```

**Pros:**
- ✅ Direct to agent's email
- ✅ No channel spam
- ✅ Familiar (everyone checks email)
- ✅ Can be free (SMTP or free tiers)

**Cons:**
- ⚠️ Might need email service setup
- ⚠️ Can get lost in inbox

**Best For:** If you have SMTP access or can use free tier

---

### Option 4: Hybrid - Teams Channel + Token + Email Lookup

**How It Works:**
1. Send Teams notification to channel (but generic message)
2. Include unique token in link
3. Agent clicks link, enters email to verify
4. System matches email + token
5. Shows resolution

**Or Better:**
1. Send Teams notification with token
2. Public view: `/trello/my-requests?email=agent@example.com`
3. Agent enters email, sees all their requests
4. Token in Teams link is just for quick access

**Implementation:**
```typescript
// Teams notification (generic, doesn't reveal details)
const teamsMessage = {
  "title": "✅ A Request You Submitted Has Been Resolved",
  "sections": [{
    "text": "Click below to view your resolved requests."
  }],
  "potentialAction": [{
    "@type": "OpenUri",
    "name": "View My Requests",
    "targets": [{
      "uri": `${portalUrl}/trello/my-requests?email=${encodeURIComponent(requestedByEmail)}`
    }]
  }]
};

// Public view shows all requests for that email
// Agent can see which one was just resolved (newest, or marked as "new")
```

**Pros:**
- ✅ Works with Teams webhook (no IT permissions)
- ✅ Privacy: Only agent with email can view
- ✅ Agent sees all their requests in one place
- ✅ No channel spam (generic message)

**Cons:**
- ⚠️ Still sends to channel (but generic message)
- ⚠️ Agent needs to click and enter email

**Best For:** Best balance of simplicity and privacy

---

## Recommended Solution: Option 4 (Hybrid)

### How It Works

1. **Request Resolved:**
   - Generate notification (but don't include sensitive details in Teams)
   - Send generic Teams message: "A request you submitted has been resolved"
   - Link goes to: `/trello/my-requests?email=agent@example.com`

2. **Agent Clicks Link:**
   - Opens public view
   - Shows all their requests
   - Newest/resolved one is highlighted
   - Click to view full resolution

3. **Privacy:**
   - Teams message is generic (doesn't reveal order number, customer, etc.)
   - Only agent with that email can view their requests
   - Email acts as password

### Teams Notification (Generic)

```typescript
const teamsMessage = {
  "@type": "MessageCard",
  "summary": "Request Resolved",
  "themeColor": "0078D4",
  "title": "✅ A Request You Submitted Has Been Resolved",
  "sections": [{
    "text": "One of your customer service requests has been resolved. Click below to view details."
  }],
  "potentialAction": [{
    "@type": "OpenUri",
    "name": "View My Requests",
    "targets": [{
      "os": "default",
      "uri": `${portalUrl}/trello/my-requests?email=${encodeURIComponent(requestedByEmail)}`
    }]
  }]
};
```

**What Agent Sees in Teams:**
```
┌─────────────────────────────────────────┐
│ ✅ A Request You Submitted Has Been     │
│    Resolved                             │
├─────────────────────────────────────────┤
│ One of your customer service requests   │
│ has been resolved. Click below to view  │
│ details.                                │
│                                         │
│ [View My Requests] ← Clickable          │
└─────────────────────────────────────────┘
```

**Generic = Privacy:** No order numbers, customer names, or details in Teams message.

### Public View

```typescript
// /trello/my-requests?email=agent@example.com
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  
  if (!email) {
    // Show email input form
    return showEmailInput();
  }
  
  // Get all requests for this email
  const requests = await prisma.trelloRequest.findMany({
    where: { requestedByEmail: email },
    include: {
      task: {
        include: {
          assignedTo: { select: { name: true } }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
  
  // Mark newest resolved one as "new" (if resolved in last hour)
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  
  requests.forEach(req => {
    if (req.resolvedAt && req.resolvedAt > oneHourAgo) {
      req.isNewResolution = true;
    }
  });
  
  return showRequestsList(requests);
}
```

**What Agent Sees:**
```
┌─────────────────────────────────────────┐
│  Your Customer Service Requests         │
├─────────────────────────────────────────┤
│  Email: agent@example.com               │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ 🆕 ✅ ORD-134519981 (Resolved)    │ │ ← New!
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

**"New" Badge:** Highlights the most recently resolved request.

---

## Alternative: Token-Only (Even More Private)

### How It Works

1. **Generate Unique Token:**
   - When request created: `notificationToken = generateUniqueToken()`
   - Store with request

2. **Teams Notification:**
   - Generic message (no details)
   - Link includes token: `/trello/resolution?token=abc123xyz789`

3. **Public View:**
   - Token required to view
   - Only that specific request
   - No email needed (token is the password)

**Implementation:**
```typescript
// Generate token when request created
const token = crypto.randomBytes(32).toString('hex'); // e.g., "a1b2c3d4e5f6..."

// Store with request
await prisma.trelloRequest.create({
  data: {
    // ... request data ...
    notificationToken: token
  }
});

// Teams notification
const teamsMessage = {
  "title": "✅ A Request You Submitted Has Been Resolved",
  "sections": [{
    "text": "Click below to view the resolution details."
  }],
  "potentialAction": [{
    "@type": "OpenUri",
    "name": "View Resolution",
    "targets": [{
      "uri": `${portalUrl}/trello/resolution?token=${token}`
    }]
  }]
};

// Public view with token
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  
  if (!token) {
    return showError('Token required');
  }
  
  const trelloRequest = await prisma.trelloRequest.findFirst({
    where: { notificationToken: token },
    include: { task: { include: { assignedTo: true } } }
  });
  
  if (!trelloRequest) {
    return showError('Invalid or expired token');
  }
  
  return showResolution(trelloRequest);
}
```

**Pros:**
- ✅ Most private (token-only access)
- ✅ No email needed
- ✅ One request per token
- ✅ Works with Teams webhook

**Cons:**
- ⚠️ Agent needs to click link from Teams (can't bookmark)
- ⚠️ Token is long/ugly in URL

**Best For:** Maximum privacy

---

## Comparison

| Solution | Privacy | IT Permissions | Complexity | Best For |
|----------|---------|----------------|------------|----------|
| **Token + Email Lookup** | High | None | Low | Recommended |
| **Token Only** | Very High | None | Low | Maximum privacy |
| **Graph API Direct Message** | Perfect | Required | High | If IT approves |
| **Email Direct** | Perfect | None (if SMTP) | Medium | If email available |

---

## My Recommendation: Token + Email Lookup

### Why This Works Best

1. **Privacy:**
   - Teams message is generic (no sensitive details)
   - Only agent with email can view their requests
   - Email acts as password

2. **No IT Permissions:**
   - Just Teams webhook (you can create)
   - No Azure App needed
   - No OAuth setup

3. **User Experience:**
   - Agent sees all their requests in one place
   - New resolution is highlighted
   - Can bookmark the page with their email

4. **Flexibility:**
   - Agent can view anytime (not just from Teams link)
   - Can share link with email (if needed)
   - Works as backup if Teams notification fails

### Implementation

**Teams Notification (Generic):**
```
✅ A Request You Submitted Has Been Resolved
Click below to view your requests.
[View My Requests] → /trello/my-requests?email=agent@example.com
```

**Public View:**
- Shows all requests for that email
- Highlights newest resolution
- Click to view full details

---

## Next Steps

1. **Confirm Approach:**
   - Token + Email Lookup? (Recommended)
   - Or Token Only? (More private)

2. **Test Teams Webhook:**
   - Create webhook in Teams
   - Test with sample message
   - Confirm it works

3. **Start Development:**
   - Build form submission
   - Build resolution flow
   - Add Teams notification (generic)
   - Build public view with email lookup

---

**Ready to proceed?** This solves the 250+ agent problem while keeping it simple and private!

