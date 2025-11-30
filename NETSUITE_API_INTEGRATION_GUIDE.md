# NetSuite API Integration Guide for WOD/IVCS Reports

## Overview

This guide explains how to set up automated API integration between NetSuite and your text-club application to replace manual CSV downloads for the 3 WOD/IVCS reports.

## Current Process

You currently manually download 3 NetSuite reports daily:
1. **INVALID_CASH_SALE** - "GH | Pending - Invalid Cash Sale Results"
2. **ORDERS_NOT_DOWNLOADING** - "GH | Orders Not Downloading to WMS (Public)"
3. **SO_VS_WEB_DIFFERENCE** - "GHM | SO vs Web Order Difference (Small Differences)"

## NetSuite API Setup Steps

### Step 1: Enable Token-Based Authentication (TBA)

Since you have **Support Administrator** role, you have the necessary permissions.

1. **Find Enable Features - Try these methods in order:**
   
   **Method A: Use NetSuite Search (EASIEST - Try this first!)**
   - Click the **Search bar** at the top of NetSuite (next to the NetSuite logo)
   - Type: `Enable Features`
   - Click on the result that appears (should say something like "Enable Features (Administrator)")
   - This should take you directly to the page
   
   **Method B: Through Company Setup Overview**
   - In Setup Manager, click on **"Company Setup Overview"** (visible in your main content area)
   - Look for a link to "Enable Features" or "Features" on that page
   - Click it to navigate to Enable Features
   
   **Method C: Direct Search for Token-Based Authentication**
   - Use the search bar and type: `Token-Based Authentication`
   - This might take you directly to the feature or show you where to enable it
   
   **Method D: Check if it's under "Other Setup"**
   - In your Setup dropdown, hover over **"Other Setup"** (it has a `>` arrow)
   - See if "Enable Features" appears in that submenu
   
2. **Once you're on the Enable Features page:**
   - You should see a page with tabs or sections for different feature categories
   - Look for the **"SuiteCloud"** tab or section
   - Find the checkbox for **"Token-Based Authentication"**
   - Check the box to enable it
   - Click **"Save"** at the bottom of the page
   
   **If you still can't find it:** Token-Based Authentication might already be enabled, or your account might need it enabled by an account administrator. Try proceeding to Step 2 (Create Integration Record) - if you can create an integration with Token-Based Authentication option, it's already enabled.

2. **Create Integration Record**
   - Navigate to: `Setup → Integrations → New Integration`
   - Fill in:
     - **Name**: `Text Club WOD/IVCS Integration` (or similar)
     - **State**: `ENABLED`
     - **Token-Based Authentication**: Check this box
     - **Token ID**: NetSuite will generate this (save it!)
     - **Token Secret**: NetSuite will generate this (save it securely!)
   - **Note**: You'll need to copy the Token ID and Token Secret - you can't view the secret again!

3. **Set Permissions**
   - Click on the integration record
   - Go to **Access** tab
   - Add role: **Support Administrator** (or create a custom role with minimal permissions)
   - Grant permissions:
     - **Saved Searches**: Full Access (to read the saved searches)
     - **Reports**: Full Access (if using reports instead of saved searches)

### Step 2: Create Saved Searches (Recommended Approach)

**Why Saved Searches?**
- More reliable than reports for API access
- Can be accessed via REST API
- Easier to filter and customize
- Better performance

For each of the 3 reports, create a Saved Search:

#### 1. INVALID_CASH_SALE Saved Search

1. Navigate to: `Reports → Saved Searches → New`
2. **Criteria**:
   - Match the criteria from your existing "GH | Pending - Invalid Cash Sale Results" report
   - Typically includes: Status = Pending, Type = Invalid Cash Sale, etc.
3. **Results** (Columns to include):
   - **Brand** (or equivalent field)
   - **Email**
   - **Document Number** (Tran ID)
   - **Warehouse Edge Status**
   - **Amount**
   - **Web total Difference** (or equivalent)
   - **Name** (Customer Name)
   - **Date** (Transaction Date)
4. **Save** as: `GH | Pending - Invalid Cash Sale Results API`
5. **Note the Internal ID** (you'll need this for the API call)

#### 2. ORDERS_NOT_DOWNLOADING Saved Search

1. Create similar saved search matching "GH | Orders Not Downloading to WMS (Public)"
2. **Important**: Include filter for `NS vs Web Discrepancy != $0.00` (to match your current filtering)
3. **Results** should include:
   - **Brand**
   - **Email**
   - **Document Number**
   - **Web Order**
   - **NS vs Web Discrepancy**
   - **NetSuite Total**
   - **Web Total**
   - **Web vs NS Difference**
   - **Shipping Country**
   - **Shipping State**
   - **Customer Name**
   - **Date**
4. **Save** as: `GH | Orders Not Downloading to WMS API`
5. **Note the Internal ID**

#### 3. SO_VS_WEB_DIFFERENCE Saved Search

1. Create saved search matching "GHM | SO vs Web Order Difference (Small Differences)"
2. **Results** should include:
   - **Brand**
   - **Email**
   - **Document Number**
   - **Web Order**
   - **NS vs Web Discrepancy**
   - **NetSuite Total**
   - **Web Total**
   - **Web vs NS Difference**
   - **Shipping Country**
   - **Shipping State**
   - **Customer Name**
   - **Date**
3. **Save** as: `GHM | SO vs Web Order Difference API`
4. **Note the Internal ID**

### Step 3: Get Your Account ID

1. Navigate to: `Setup → Company → Company Information`
2. Find your **Account ID** (usually in the format: `4450354` - from your URL)
3. Save this - you'll need it for API authentication

### Step 4: Test API Access

You can test the API using curl or Postman before integrating into your application.

**Authentication Endpoint:**
```
POST https://4450354.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token
```

**Headers:**
```
Content-Type: application/x-www-form-urlencoded
```

**Body (URL-encoded):**
```
grant_type=client_credentials
client_id=<YOUR_TOKEN_ID>
client_secret=<YOUR_TOKEN_SECRET>
```

**Response:**
```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Get Saved Search Results:**
```
GET https://4450354.suitetalk.api.netsuite.com/services/rest/record/v1/savedsearch/<SAVED_SEARCH_INTERNAL_ID>
```

**Headers:**
```
Authorization: Bearer <ACCESS_TOKEN>
Prefer: transient
```

## Implementation Options

### Option 1: Scheduled Netlify Function (Recommended)

Create a scheduled function that runs daily to fetch data from NetSuite and import it.

**Pros:**
- Fully automated
- No manual intervention needed
- Can run on a schedule (daily, hourly, etc.)

**Cons:**
- Requires Netlify scheduled functions (paid plan feature)
- Or use external cron service (cron-job.org, etc.)

### Option 2: Manual Trigger Button

Add a button in your WOD/IVCS dashboard that triggers the API fetch.

**Pros:**
- Simple to implement
- You control when it runs
- No additional costs

**Cons:**
- Still requires manual action
- But faster than downloading CSV

### Option 3: Hybrid Approach

Keep CSV import as fallback, add API import as primary method.

**Pros:**
- Best of both worlds
- Can fall back to CSV if API fails

**Cons:**
- More code to maintain

## Required Environment Variables

Add these to your Netlify environment variables:

```
NETSUITE_ACCOUNT_ID=4450354
NETSUITE_TOKEN_ID=<your_token_id>
NETSUITE_TOKEN_SECRET=<your_token_secret>
NETSUITE_SAVED_SEARCH_INVALID_CASH_SALE=<internal_id>
NETSUITE_SAVED_SEARCH_ORDERS_NOT_DOWNLOADING=<internal_id>
NETSUITE_SAVED_SEARCH_SO_VS_WEB_DIFFERENCE=<internal_id>
```

## Next Steps

1. **Set up Token-Based Authentication** in NetSuite (Step 1)
2. **Create Saved Searches** for each report (Step 2)
3. **Test API access** using curl/Postman (Step 4)
4. **Decide on implementation approach** (Option 1, 2, or 3)
5. **I can help implement** the API integration code once you have the credentials

## Important Notes

- **Token Secret**: Save it securely - you can't view it again in NetSuite!
- **Internal IDs**: Save the Internal IDs of your saved searches
- **Permissions**: Make sure your integration has access to the saved searches
- **Rate Limits**: NetSuite has API rate limits - batch your requests if needed
- **Data Format**: The API returns JSON, but your current code expects CSV - we'll need to convert

## Questions to Answer Before Implementation

1. **Which approach do you prefer?** (Scheduled, Manual Button, or Hybrid)
2. **What time should it run?** (If scheduled - e.g., daily at 8 AM PST)
3. **Do you want email notifications?** (On success/failure)
4. **Should it replace or supplement CSV import?** (Replace completely or keep as backup)

Let me know once you've completed the NetSuite setup steps, and I can help implement the integration code!

