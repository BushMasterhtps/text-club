# Trello Requests - Identified Notifications Solution
## How Agents Know Which Notification Is Theirs

**Date:** November 2025  
**Problem:** 250+ agents, all get notifications, can't tell which one is theirs

---

## The Real Problem

- ✅ Agents are okay with others seeing requests (not a privacy issue)
- ❌ Problem: Generic notifications - agent doesn't know which one is theirs
- ❌ Problem: Multiple notifications = confusion
- ❌ Problem: "Which generic link do I click?"

**Solution:** Include identifying information in Teams notification so agent knows it's theirs.

---

## Solution: Named Notifications in Teams

### How It Works

**Include Agent's Name in Teams Message:**
```
"Daniel Murcia - Your request for ORD-134519981 has been resolved. [View]"
```

**Why This Works:**
- ✅ Agent sees their name → knows it's for them
- ✅ Other agents see it but ignore it (not their name)
- ✅ Agent clicks their notification
- ✅ No confusion

### Implementation

```typescript
// When request resolved
const teamsMessage = {
  "@type": "MessageCard",
  "summary": "Request Resolved",
  "themeColor": "0078D4",
  "title": `✅ ${requestedByName} - Your Request Has Been Resolved`,
  "sections": [{
    "activityTitle": `Order: ${orderNumber}`,
    "activitySubtitle": `Customer: ${customerName}`,
    "facts": [
      { "name": "Request Type:", "value": requestType },
      { "name": "Status:", "value": disposition },
      { "name": "Resolved By:", "value": resolvedByName }
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

await sendTeamsWebhook(teamsMessage);
```

**What Agent Sees in Teams:**
```
┌─────────────────────────────────────────┐
│ ✅ Daniel Murcia - Your Request Has     │
│    Been Resolved                        │
├─────────────────────────────────────────┤
│ Order: ORD-134519981                    │
│ Customer: John Doe                      │
│                                         │
│ Request Type: Order Cancellation        │
│ Status: Resolved                         │
│ Resolved By: Agent Name                 │
│                                         │
│ Resolution Notes:                       │
│ Order cancelled and refunded. Customer   │
│ notified via email.                     │
│                                         │
│ [View Full Details]                     │
└─────────────────────────────────────────┘
```

**Daniel sees his name → knows it's for him!**

---

## Alternative: Use @Mentions

### How It Works

**Mention the Agent in Teams:**
```
"@Daniel Murcia - Your request for ORD-134519981 has been resolved. [View]"
```

**Why This Works:**
- ✅ Agent gets @mention notification (Teams highlights it)
- ✅ Agent sees their name mentioned
- ✅ Other agents don't get @mention (no notification for them)
- ✅ Clear identification

### Implementation

```typescript
const teamsMessage = {
  "@type": "MessageCard",
  "title": `✅ @${requestedByName} - Your Request Has Been Resolved`,
  "sections": [{
    "text": `@${requestedByName} - Your request for order ${orderNumber} has been resolved.`
  }],
  // ... rest of message
};
```

**Note:** @mentions in Teams webhooks work if you format it correctly, but may require the agent's Teams user ID. Let's test this.

---

## Best Solution: Name + Order Number

### Recommended Format

**Teams Message:**
```
"Daniel Murcia - Your request for ORD-134519981 has been resolved. [View Details]"
```

**Why This Is Best:**
1. **Name identifies the agent** → "Daniel Murcia" = Daniel knows it's his
2. **Order number for reference** → Daniel remembers which order he submitted
3. **Clear call-to-action** → "View Details" button
4. **Other agents see it but ignore** → Not their name, not relevant to them

### Full Implementation

```typescript
// When request resolved
export async function sendTeamsNotification(trelloRequest: TrelloRequest) {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  
  if (!webhookUrl) {
    console.warn('Teams webhook URL not configured');
    return;
  }
  
  // Format agent name (first name + last name initial, or full name)
  const agentName = trelloRequest.requestedByName || 
                   trelloRequest.requestedByEmail?.split('@')[0] || 
                   'Agent';
  
  const teamsMessage = {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    "summary": "Request Resolved",
    "themeColor": "0078D4",
    "title": `✅ ${agentName} - Your Request Has Been Resolved`,
    "sections": [{
      "activityTitle": `Order: ${trelloRequest.orderNumber}`,
      "activitySubtitle": `Customer: ${trelloRequest.customerName}`,
      "facts": [
        {
          "name": "Request Type:",
          "value": trelloRequest.requestType || "N/A"
        },
        {
          "name": "Status:",
          "value": trelloRequest.task.disposition || "Resolved"
        },
        {
          "name": "Resolved By:",
          "value": trelloRequest.resolvedByName || "Portal Agent"
        },
        {
          "name": "Resolved At:",
          "value": formatDate(trelloRequest.resolvedAt)
        }
      ],
      "text": `**Resolution Notes:**\n${trelloRequest.resolutionNotes || "No additional notes."}`
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
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(teamsMessage)
    });
    
    if (!response.ok) {
      console.error('Teams webhook failed:', await response.text());
    }
  } catch (error) {
    console.error('Failed to send Teams notification:', error);
  }
}
```

---

## What This Looks Like in Teams

### Scenario: 3 Requests Resolved

**Teams Channel Shows:**
```
┌─────────────────────────────────────────┐
│ ✅ Daniel Murcia - Your Request Has     │
│    Been Resolved                        │
│ Order: ORD-134519981                    │
│ [View Full Details]                     │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ ✅ Sarah Johnson - Your Request Has     │
│    Been Resolved                        │
│ Order: ORD-134520000                    │
│ [View Full Details]                     │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ ✅ Mike Smith - Your Request Has Been   │
│    Resolved                             │
│ Order: ORD-134520100                    │
│ [View Full Details]                     │
└─────────────────────────────────────────┘
```

**Daniel sees:**
- "Daniel Murcia" → "That's me!"
- Clicks his notification
- Views his resolution

**Sarah sees:**
- "Sarah Johnson" → "That's me!"
- Clicks her notification
- Views her resolution

**Other agents:**
- See notifications but ignore (not their name)
- Can see what's happening (transparency)
- Not confused (clear names)

---

## Additional: Highlighting/Filtering

### Option: Add Emoji or Color by Agent

**Different color per agent (optional):**
```typescript
// Use agent's email hash to generate consistent color
const colors = ['0078D4', '28A745', 'FFC107', 'DC3545', '6F42C1'];
const colorIndex = hashEmail(trelloRequest.requestedByEmail) % colors.length;
const themeColor = colors[colorIndex];
```

**Or use agent initial:**
```typescript
const initial = agentName.charAt(0).toUpperCase();
const title = `✅ [${initial}] ${agentName} - Your Request Has Been Resolved`;
```

**Makes it even easier to spot your notification!**

---

## Public View (Backup)

**Still include public view for agents who miss Teams notification:**

```typescript
// /trello/my-requests?email=daniel.murcia@goldencustomercare.com
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  
  if (!email) {
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
  
  return showRequestsList(requests);
}
```

**Agent can:**
- Click from Teams notification (primary)
- Or manually visit: `/trello/my-requests?email=their-email` (backup)
- See all their requests in one place

---

## Summary

### Solution: Named Notifications

**Teams Message Format:**
```
"✅ [Agent Name] - Your Request Has Been Resolved
Order: ORD-123456
[View Full Details]"
```

**Why This Works:**
- ✅ Agent sees their name → knows it's theirs
- ✅ Order number for reference
- ✅ Clear identification
- ✅ Other agents can see but ignore
- ✅ No confusion
- ✅ No IT permissions needed (just Teams webhook)

**Implementation:**
1. Include `requestedByName` in Teams message title
2. Include order number for reference
3. Include full details in message body
4. Link to public view for full details
5. Public view shows all requests for that email

---

## Next Steps

1. **Confirm Approach:**
   - Named notifications in Teams? (Recommended)
   - Include agent name + order number?

2. **Test Teams Webhook:**
   - Create webhook
   - Test with sample message including name
   - Confirm format works

3. **Start Development:**
   - Build form (capture agent name)
   - Build resolution flow
   - Add Teams notification with name
   - Build public view

---

**This solves the problem!** Agent sees their name → knows which notification is theirs → clicks it → views resolution.

Ready to proceed with this approach?

