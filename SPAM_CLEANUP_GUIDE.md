# Spam Review Queue Cleanup Guide

## Problem

After the initial spam capture bug (substring matching), your spam review queue has old messages from before 10/29/2025 that shouldn't be there.

**Manual review would be tedious** → Use the bulk cleanup utility instead!

---

## Solution: Bulk Restore Utility

I've created an API endpoint that can automatically restore old messages from your spam review queue.

### Endpoint: `/api/manager/spam/bulk-restore-old`

---

## Step-by-Step Instructions

### Step 1: Check How Many Old Messages You Have

**GET Request** - Preview what would be affected:
```
GET https://thunderous-crisp-50ad13.netlify.app/api/manager/spam/bulk-restore-old?beforeDate=2025-10-29
```

**What it returns**:
```json
{
  "success": true,
  "count": 450,
  "message": "Found 450 old messages in spam review (before 2025-10-29)",
  "sample": [
    {
      "createdAt": "2025-09-08T10:30:00.000Z",
      "text": "Can I use this code?",
      "brand": "GundryMD",
      "matchedPatterns": ["cod"]
    }
    // ... 4 more samples
  ]
}
```

---

### Step 2: Preview What Would Be Restored (Dry Run)

**POST Request** - Safe preview mode (default):
```
POST https://thunderous-crisp-50ad13.netlify.app/api/manager/spam/bulk-restore-old?beforeDate=2025-10-29
```

Or explicitly:
```
POST https://thunderous-crisp-50ad13.netlify.app/api/manager/spam/bulk-restore-old?beforeDate=2025-10-29&dryRun=true
```

**What it returns**:
```json
{
  "success": true,
  "message": "DRY RUN: Found 450 messages that would be restored",
  "count": 450,
  "dryRun": true,
  "preview": [...], // First 10 messages
  "instruction": "To actually restore these messages, add ?dryRun=false to the URL"
}
```

**This is SAFE** - it doesn't make any changes, just shows you what would happen.

---

### Step 3: Actually Restore the Messages

**POST Request** - Execute the cleanup:
```
POST https://thunderous-crisp-50ad13.netlify.app/api/manager/spam/bulk-restore-old?beforeDate=2025-10-29&dryRun=false
```

**What it returns**:
```json
{
  "success": true,
  "message": "Successfully restored 450 messages from spam review",
  "count": 450,
  "dryRun": false,
  "beforeDate": "2025-10-29",
  "oldestRestored": "2025-09-08T10:30:00.000Z",
  "newestRestored": "2025-10-28T23:59:00.000Z"
}
```

**This actually restores** the messages:
- Changes status from `SPAM_REVIEW` back to `READY`
- Clears the matched patterns
- Messages return to your normal pending queue

---

## How to Execute (Using Browser or Terminal)

### Option 1: Using Browser DevTools Console

1. Open your dashboard: `https://thunderous-crisp-50ad13.netlify.app/manager`
2. Open DevTools (F12) → Console tab
3. Run this JavaScript:

```javascript
// Step 1: Check count
fetch('/api/manager/spam/bulk-restore-old?beforeDate=2025-10-29')
  .then(r => r.json())
  .then(data => console.log('Count:', data));

// Step 2: Preview (dry run)
fetch('/api/manager/spam/bulk-restore-old?beforeDate=2025-10-29', { method: 'POST' })
  .then(r => r.json())
  .then(data => console.log('Preview:', data));

// Step 3: Actually restore (only after reviewing preview!)
fetch('/api/manager/spam/bulk-restore-old?beforeDate=2025-10-29&dryRun=false', { method: 'POST' })
  .then(r => r.json())
  .then(data => console.log('Restored:', data));
```

### Option 2: Using cURL (Terminal)

```bash
# Step 1: Check count
curl "https://thunderous-crisp-50ad13.netlify.app/api/manager/spam/bulk-restore-old?beforeDate=2025-10-29"

# Step 2: Preview
curl -X POST "https://thunderous-crisp-50ad13.netlify.app/api/manager/spam/bulk-restore-old?beforeDate=2025-10-29"

# Step 3: Actually restore
curl -X POST "https://thunderous-crisp-50ad13.netlify.app/api/manager/spam/bulk-restore-old?beforeDate=2025-10-29&dryRun=false"
```

### Option 3: Using Postman/Insomnia

1. Create a POST request
2. URL: `https://thunderous-crisp-50ad13.netlify.app/api/manager/spam/bulk-restore-old`
3. Add query parameters:
   - `beforeDate`: `2025-10-29`
   - `dryRun`: `false` (for actual restore)
4. Send request

---

## What Date Should I Use?

Based on your report, use **`2025-10-29`** since you said:
> "Our actual queue had stuff oldest from 10/29/2025"

This will restore anything **older than** October 29, 2025.

If you want to be more conservative:
- Use `2025-10-15` to only restore messages older than October 15
- Use `2025-10-01` to only restore messages older than October 1

---

## Safety Features

1. ✅ **Dry run by default** - Won't make changes unless you explicitly set `dryRun=false`
2. ✅ **Preview mode** - Shows you exactly what will be affected before you commit
3. ✅ **Count check** - GET endpoint lets you see the count before doing anything
4. ✅ **Reversible** - Messages go back to `READY` status, they're not deleted

---

## What Happens to Restored Messages?

**Status change**: `SPAM_REVIEW` → `READY`  
**Matched patterns**: Cleared  
**Result**: Messages return to your normal pending queue

They'll show up in your regular task queue, and:
- ✅ Future spam captures will use the **new word-boundary matching**
- ✅ They won't be falsely captured again
- ✅ You can process them normally

---

## Example Workflow

```bash
# 1. Check what you have
curl "https://thunderous-crisp-50ad13.netlify.app/api/manager/spam/bulk-restore-old?beforeDate=2025-10-29"
# Response: "Found 450 old messages..."

# 2. Preview the restoration (safe, no changes)
curl -X POST "https://thunderous-crisp-50ad13.netlify.app/api/manager/spam/bulk-restore-old?beforeDate=2025-10-29"
# Response: "DRY RUN: Found 450 messages that would be restored..."
# Review the preview data to make sure it looks correct

# 3. Actually restore them
curl -X POST "https://thunderous-crisp-50ad13.netlify.app/api/manager/spam/bulk-restore-old?beforeDate=2025-10-29&dryRun=false"
# Response: "Successfully restored 450 messages from spam review"

# 4. Verify in your dashboard
# Check your spam review queue - old messages should be gone
# Check your pending queue - they should appear there
```

---

## Troubleshooting

### "No spam messages found before [date]"
- ✅ Good! Means you don't have any old messages to clean up
- Or you might need to adjust your date

### "Failed to restore messages"
- Check the error details in the response
- Verify you have database permissions
- Check the date format (must be YYYY-MM-DD)

### Messages restored but still showing in spam review
- Hard refresh your browser (Cmd+Shift+R / Ctrl+Shift+F5)
- Wait a few seconds for the database to update
- Check the API response - it should show `success: true`

---

## After Cleanup

Once you've restored the old messages:

1. ✅ Your spam review queue will only have recent, legitimate spam
2. ✅ Future spam captures will use word-boundary matching (no false positives)
3. ✅ Old messages are back in pending queue for normal processing
4. ✅ System is clean and working correctly

---

## Need Help?

If you run into any issues:
1. Check the API response for error messages
2. Verify your date format (YYYY-MM-DD)
3. Make sure you're using POST for restoration
4. Try the dry run first to see what would happen

