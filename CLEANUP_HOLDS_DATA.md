# Holds Test Data Cleanup

## ⚠️ WARNING
This is a **destructive operation** that will permanently delete:
- **ALL** Holds tasks from all workflow queues (Agent Research, Customer Contact, Escalated Call, Completed, Duplicates)
- **ALL** Holds import sessions (duplicate history)
- **ALL** related TaskHistory and AssistanceRequests for Holds tasks

**This cannot be undone!** Only run this when you're ready to clear test data before production.

## How to Run

### Option 1: Using cURL (Recommended)

After your deployment is live, run this command:

```bash
curl -X POST https://your-netlify-url.netlify.app/api/holds/cleanup-test-data
```

### Option 2: Using the browser

Navigate to your deployed site and go to:
```
https://your-netlify-url.netlify.app/api/holds/cleanup-test-data
```

Then use the browser's developer console to make a POST request:
```javascript
fetch('/api/holds/cleanup-test-data', { method: 'POST' })
  .then(res => res.json())
  .then(data => console.log(data));
```

### Option 3: Using a REST client (Postman, Insomnia, etc.)

1. Set method to: **POST**
2. URL: `https://your-netlify-url.netlify.app/api/holds/cleanup-test-data`
3. Send the request

## Expected Response

If successful, you'll get:
```json
{
  "success": true,
  "message": "Holds test data cleanup completed successfully",
  "summary": {
    "tasksDeleted": 123,
    "importSessionsDeleted": 5,
    "historyDeleted": 50,
    "assistanceRequestsDeleted": 3,
    "totalDeleted": 181
  }
}
```

## What Gets Deleted

1. **All Holds Tasks** - Tasks in all workflow queues:
   - Agent Research
   - Customer Contact
   - Escalated Call 4+ Day
   - Completed
   - Duplicates

2. **All Holds Import Sessions** - This includes:
   - Import history
   - Duplicate detection history
   - All duplicate reference records (cascade delete)

3. **Related Records**:
   - TaskHistory entries for Holds tasks
   - AssistanceRequests for Holds tasks

## Notes

- Only affects `taskType = 'HOLDS'` records
- Other task types (Text Club, WOD/IVCS, Email Requests, Yotpo) are **NOT** affected
- This operation is idempotent (safe to run multiple times)
- The deletion order is safe and avoids foreign key constraint issues

