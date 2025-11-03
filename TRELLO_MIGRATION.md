# Trello Import System - Database Migration Required

## ⚠️ IMPORTANT: Run This After Deployment

After this deployment goes live, you need to create the `TrelloCompletion` table in your production database.

---

## 🗄️ **Migration SQL** (Run in Railway/Production DB)

```sql
-- Create TrelloCompletion table
CREATE TABLE "TrelloCompletion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "date" TIMESTAMP(3) NOT NULL,
  "agentId" TEXT NOT NULL,
  "cardsCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  
  CONSTRAINT "TrelloCompletion_agent_fkey" 
    FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create unique constraint (one entry per agent per day)
CREATE UNIQUE INDEX "TrelloCompletion_date_agentId_key" ON "TrelloCompletion"("date", "agentId");

-- Create indexes for performance
CREATE INDEX "TrelloCompletion_date_idx" ON "TrelloCompletion"("date");
CREATE INDEX "TrelloCompletion_agentId_idx" ON "TrelloCompletion"("agentId");
```

---

## ✅ **How to Run**

### **Option 1: Railway Dashboard** (Recommended)
1. Go to Railway → Your Project → PostgreSQL
2. Click "Query" tab
3. Paste the SQL above
4. Click "Run"
5. Verify: Should see "CREATE TABLE" success message

### **Option 2: Command Line** (If you have direct DB access)
```bash
# Set your production DATABASE_URL
export DATABASE_URL="your-production-database-url"

# Run Prisma migration
npx prisma migrate deploy
```

---

## 🧪 **Verify Migration Worked**

After running the migration:

1. **Go to Settings → Trello Imports**
2. **Add a test entry**:
   - Date: Yesterday
   - Agent: Any agent
   - Cards: 10
   - Click "Add Entry"
3. **Should see**: "✓ Added 10 Trello cards for [Agent] on [Date]"
4. **Check Performance Scorecard**: Agent's total should include the 10 Trello cards

If you see any errors like "Table doesn't exist", the migration didn't run. Check Railway logs.

---

## 📊 **What This Enables**

Once migrated:
- ✅ Import Trello card completions from Power BI
- ✅ Trello counts included in Performance Scorecard rankings
- ✅ Fair credit for all work (Portal + Trello)
- ✅ Daily import workflow
- ✅ Delete/update entries if mistakes

---

## 🚨 **If Migration Fails**

Contact me and I'll help troubleshoot. Common issues:
- Missing DATABASE_URL
- Wrong database permissions
- Table name conflicts (unlikely)

