# Trello Requests - Teams Direct Message Solution
## Send Individual DMs to Agents (Not Channel Notifications)

**Date:** November 2025  
**Goal:** Send direct messages to individual agents when their request is resolved

---

## The Solution: Microsoft Graph API

**To send direct messages in Teams, you need:**
- Microsoft Graph API access
- Azure App Registration
- OAuth 2.0 authentication
- Agent's Teams user ID or email

**This requires IT permissions, but it's the only way to send DMs.**

---

## What You Need from IT

### Required: Azure App Registration

**IT Needs to:**
1. Create Azure App Registration in Azure Portal
2. Grant API permissions:
   - `Chat.ReadWrite` (to send messages)
   - `User.Read` (to look up users)
3. Generate Client ID and Client Secret
4. Set up OAuth redirect URI

**Time Required:** 30-60 minutes (one-time setup)

**Who Can Do It:**
- Azure Administrator
- IT Administrator
- Microsoft 365 Admin

---

## Alternative: Teams Bot (Easier Setup)

**Teams Bot can send DMs without full Graph API setup:**

### How Teams Bot Works

1. **Register Bot in Teams:**
   - Create bot in Azure Bot Framework
   - Register with Teams
   - Get bot ID

2. **Bot Sends DMs:**
   - Bot can send direct messages to users
   - Uses bot framework (simpler than Graph API)
   - Still requires some Azure setup

**Pros:**
- ✅ Simpler than full Graph API
- ✅ Can send DMs
- ✅ Less permissions needed

**Cons:**
- ⚠️ Still requires Azure setup
- ⚠️ Still needs IT help

---

## What IT Needs to Set Up

### Option 1: Microsoft Graph API (Full Control)

**Azure App Registration:**
1. Go to Azure Portal → App Registrations → New Registration
2. Name: "Portal Teams Integration"
3. Supported account types: "Accounts in this organizational directory only"
4. Redirect URI: `https://your-portal.netlify.app/api/auth/callback`

**API Permissions:**
- `Chat.ReadWrite` - Send chat messages
- `User.Read` - Read user profiles
- `ChatMessage.Send` - Send messages

**Authentication:**
- Client ID (from app registration)
- Client Secret (generate new secret)
- Tenant ID (your organization ID)

**OAuth Flow:**
- Authorization code flow
- Store refresh token securely
- Use refresh token to get access tokens

### Option 2: Teams Bot (Simpler)

**Azure Bot Framework:**
1. Create Bot in Azure Portal
2. Register with Microsoft Teams
3. Get Bot ID and Password
4. Configure messaging endpoint

**Bot Can:**
- Send direct messages to users
- Receive messages (optional)
- Simpler than Graph API

---

## Implementation with Graph API

### Step 1: Get Access Token

```typescript
// OAuth 2.0 flow to get access token
async function getAccessToken() {
  const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials' // Or 'refresh_token' if you have one
    })
  });
  
  const data = await response.json();
  return data.access_token;
}
```

### Step 2: Find User's Teams ID

```typescript
// Get user's Teams ID from email
async function getTeamsUserId(email: string, accessToken: string) {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${email}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  const user = await response.json();
  return user.id; // This is the Teams user ID
}
```

### Step 3: Create Chat (One-on-One)

```typescript
// Create one-on-one chat with user
async function createChat(userId: string, botId: string, accessToken: string) {
  const response = await fetch(
    'https://graph.microsoft.com/v1.0/chats',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chatType: 'oneOnOne',
        members: [
          {
            '@odata.type': '#microsoft.graph.aadUserConversationMember',
            roles: ['owner'],
            'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${botId}')`
          },
          {
            '@odata.type': '#microsoft.graph.aadUserConversationMember',
            roles: ['owner'],
            'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${userId}')`
          }
        ]
      })
    }
  );
  
  const chat = await response.json();
  return chat.id;
}
```

### Step 4: Send Message

```typescript
// Send message in chat
async function sendDirectMessage(
  chatId: string, 
  message: string, 
  accessToken: string
) {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/chats/${chatId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        body: {
          contentType: 'html',
          content: message
        }
      })
    }
  );
  
  return response.json();
}
```

### Complete Flow

```typescript
// When request resolved
export async function sendTeamsDM(trelloRequest: TrelloRequest) {
  try {
    // 1. Get access token
    const accessToken = await getAccessToken();
    
    // 2. Get user's Teams ID from email
    const userId = await getTeamsUserId(
      trelloRequest.requestedByEmail, 
      accessToken
    );
    
    // 3. Create or get existing chat
    const chatId = await getOrCreateChat(userId, botId, accessToken);
    
    // 4. Build message
    const message = buildTeamsMessageCard(trelloRequest);
    
    // 5. Send message
    await sendDirectMessage(chatId, message, accessToken);
    
  } catch (error) {
    console.error('Failed to send Teams DM:', error);
    // Fallback: send to channel or email
  }
}
```

---

## Implementation with Teams Bot (Simpler)

### Bot Setup

1. **Create Bot in Azure:**
   - Azure Portal → Create Resource → "Azure Bot"
   - Choose "Multi Tenant" or "Single Tenant"
   - Get Bot ID and Password

2. **Register with Teams:**
   - Teams Admin Center → Apps → Upload custom app
   - Or use Bot Framework

3. **Configure Messaging:**
   - Set messaging endpoint
   - Enable direct messages

### Bot Sends DM

```typescript
// Using Bot Framework SDK
import { BotFrameworkAdapter } from 'botbuilder';

const adapter = new BotFrameworkAdapter({
  appId: process.env.BOT_APP_ID,
  appPassword: process.env.BOT_APP_PASSWORD
});

// Send proactive message
await adapter.createConversationAsync(
  { serviceUrl: userServiceUrl },
  async (context) => {
    await context.sendActivity(message);
  }
);
```

**Simpler but still requires Azure setup.**

---

## What You Need to Ask IT

### Request Template

**Subject: Azure App Registration for Teams Direct Messages**

"Hi IT Team,

We need to set up Microsoft Graph API access to send direct messages in Teams for our customer service request system. 

**What we need:**
1. Azure App Registration with the following:
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

Please let me know if you can help with this setup or if you have questions.

Thanks!"

---

## Comparison: Graph API vs Bot

| Feature | Graph API | Teams Bot |
|---------|-----------|-----------|
| **Setup Complexity** | Medium-High | Medium |
| **IT Permissions** | Required | Required |
| **Can Send DMs** | ✅ Yes | ✅ Yes |
| **Flexibility** | High | Medium |
| **Maintenance** | Low | Low |
| **Best For** | Full control | Simpler setup |

---

## Fallback Options (If IT Says No)

### Option 1: Email (Free SMTP)

**If you have Office 365:**
- Use SMTP to send emails
- Direct email to agent
- No additional cost
- Works immediately

**Implementation:**
```typescript
// Use Office 365 SMTP
const transporter = nodemailer.createTransport({
  host: 'smtp.office365.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER, // Your O365 email
    pass: process.env.SMTP_PASS  // Your O365 password
  }
});

await transporter.sendMail({
  from: 'noreply@yourcompany.com',
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

**Cons:**
- ⚠️ Email instead of Teams
- ⚠️ Can get lost in inbox

### Option 2: Teams Channel with @Mentions

**If Graph API is not available:**
- Send to channel but @mention the agent
- Agent gets @mention notification
- Still in channel but agent is notified

**Implementation:**
```typescript
// Format: @Agent Name
const teamsMessage = {
  "title": `✅ @${agentName} - Your Request Has Been Resolved`,
  "sections": [{
    "text": `@${agentName} - Your request for ${orderNumber} has been resolved.`
  }]
};
```

**Pros:**
- ✅ Agent gets @mention notification
- ✅ No IT permissions needed (just webhook)
- ✅ Works with existing setup

**Cons:**
- ⚠️ Still in channel (but agent is notified)
- ⚠️ Other agents can see it

---

## Recommended Approach

### Step 1: Ask IT for Graph API or Bot Setup

**Request:**
- Azure App Registration OR Teams Bot
- Explain the use case (250+ agents, need DMs)
- Show the benefits (no channel spam, clear notifications)

### Step 2: If IT Approves

**Implement:**
- Graph API or Bot for DMs
- Direct messages to agents
- Clean, private notifications

### Step 3: If IT Says No

**Fallback:**
- Use Office 365 SMTP for emails
- Direct email to agent
- Still works, just email instead of Teams

---

## Implementation Timeline

### With IT Approval (Graph API/Bot)

**Week 1:** IT sets up Azure App/Bot  
**Week 2:** Implement DM sending  
**Week 3:** Testing  
**Week 4:** Deploy  

**Total: 4 weeks (including IT setup)**

### Without IT (Email Fallback)

**Week 1:** Set up SMTP  
**Week 2:** Implement email sending  
**Week 3:** Testing  
**Week 4:** Deploy  

**Total: 4 weeks (no IT needed)**

---

## Next Steps

1. **Ask IT:**
   - Request Azure App Registration or Teams Bot
   - Explain use case and benefits
   - Provide setup requirements

2. **If Approved:**
   - Get credentials from IT
   - Implement Graph API or Bot
   - Test DM sending

3. **If Not Approved:**
   - Use email fallback (SMTP)
   - Still direct to agent
   - Works without IT

---

## Summary

**To send Teams DMs, you need:**
- ✅ Microsoft Graph API OR Teams Bot
- ✅ Azure App Registration (IT needs to set up)
- ✅ OAuth 2.0 authentication
- ⚠️ **Requires IT permissions**

**If IT says no:**
- ✅ Use email (SMTP) - direct to agent
- ✅ Or use @mentions in channel - agent gets notified

**Best approach:**
1. Ask IT for Graph API/Bot setup
2. If approved → implement DMs
3. If not → use email fallback

---

**Ready to ask IT?** I can help draft the request or implement the email fallback if needed!

