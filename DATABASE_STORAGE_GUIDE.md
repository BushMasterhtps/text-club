# Railway Database Storage & Raw Data Access Guide

## 📊 Checking Database Storage

### Method 1: Using the Storage Check Script (Recommended)

Run the storage check script to get comprehensive database statistics:

```bash
node scripts/check-railway-database-storage.js
```

This will show you:
- ✅ Total database size
- ✅ Size of each table (sorted by size)
- ✅ Row counts per table
- ✅ Index sizes
- ✅ Active connections
- ✅ Storage usage percentage

**Example Output:**
```
📊 Railway Database Storage & Statistics

💾 DATABASE STORAGE
📦 Total Database Size: 245.32 MB

📋 TABLE SIZES
1. Task                       125.45 MB
2. RawMessage                  89.23 MB
3. TaskHistory                 12.34 MB
...

📊 ROW COUNTS
1. Task                    125,432 rows
2. RawMessage               89,123 rows
...
```

### Method 2: Railway Dashboard

1. Go to [Railway Dashboard](https://railway.app)
2. Click on your **PostgreSQL** service
3. Navigate to the **Metrics** tab
4. You'll see:
   - **Storage Usage** (current size)
   - **Storage Limit** (your plan's limit)
   - **Connection Count**
   - **Query Performance**

### Method 3: Direct SQL Query

You can also query directly using Prisma:

```typescript
// Get database size
const dbSize = await prisma.$queryRaw`
  SELECT pg_size_pretty(pg_database_size(current_database())) as size
`;

// Get table sizes
const tableSizes = await prisma.$queryRaw`
  SELECT 
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
`;
```

---

## 🔍 Viewing Raw Data

### Method 1: Prisma Studio (Easiest - Visual Interface)

**Prisma Studio** provides a beautiful web UI to browse and edit your database:

```bash
# Make sure DATABASE_URL is set to Railway
export DATABASE_URL="your-railway-database-url"

# Or use the Railway connection string directly
DATABASE_URL="postgresql://postgres:OUYdvdsKqOUGwpTWTUUniqINJdjqIBdy@interchange.proxy.rlwy.net:43835/railway" npx prisma studio
```

**Or create a script for convenience:**

```bash
# Create: scripts/open-prisma-studio.sh
#!/bin/bash
export DATABASE_URL="postgresql://postgres:OUYdvdsKqOUGwpTWTUUniqINJdjqIBdy@interchange.proxy.rlwy.net:43835/railway"
npx prisma studio
```

**Features:**
- ✅ Browse all tables visually
- ✅ Filter and search data
- ✅ Edit records directly
- ✅ View relationships between tables
- ✅ Export data to CSV

**Access:** Opens at `http://localhost:5555` by default

### Method 2: Railway CLI (Terminal Access)

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Connect to database shell
railway connect postgres
```

This gives you a PostgreSQL shell where you can run SQL queries directly:

```sql
-- View all tables
\dt

-- View table structure
\d "Task"

-- Query data
SELECT * FROM "Task" LIMIT 10;

-- Check storage
SELECT pg_size_pretty(pg_database_size(current_database()));
```

### Method 3: API Endpoint (Programmatic Access)

You already have a debug endpoint at `/api/debug/database` that shows:
- Database connection info
- User count
- Task count
- Sample data

**Access it:**
```bash
# Local
curl http://localhost:3000/api/debug/database

# Production (if enabled)
curl https://your-app.netlify.app/api/debug/database
```

### Method 4: Custom Scripts

You can create custom scripts to query specific data:

```javascript
// scripts/view-raw-data.js
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function viewData() {
  // Get recent tasks
  const recentTasks = await prisma.task.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: {
      assignedTo: true,
      rawMessage: true
    }
  });
  
  console.log(JSON.stringify(recentTasks, null, 2));
  
  await prisma.$disconnect();
}

viewData();
```

---

## 📈 Understanding Storage Limits

### Railway Free Tier
- **Storage:** 1 GB (1,024 MB)
- **Connections:** 100 concurrent connections
- **Backups:** Daily automated backups (7-day retention)

### Monitoring Usage
- Check the storage script output for current usage percentage
- Railway dashboard shows real-time metrics
- Set up alerts in Railway dashboard for storage warnings

### If You're Approaching Limits

1. **Archive Old Data:**
   ```sql
   -- Example: Archive tasks older than 1 year
   DELETE FROM "Task" 
   WHERE "createdAt" < NOW() - INTERVAL '1 year'
   AND "status" = 'COMPLETED';
   ```

2. **Clean Up Duplicates:**
   - Use the duplicate detection system
   - Remove spam/archived messages

3. **Optimize Indexes:**
   - Review index usage
   - Remove unused indexes

4. **Upgrade Plan:**
   - Railway Pro: $20/month (8 GB storage)
   - Railway Team: Custom pricing

---

## 🔐 Security Notes

⚠️ **Important:** 
- Never commit database credentials to git
- Use environment variables for `DATABASE_URL`
- Railway connection strings contain passwords - keep them secure
- Prisma Studio should only be run locally, not in production

---

## 🚀 Quick Commands Reference

```bash
# Check storage
node scripts/check-railway-database-storage.js

# Open Prisma Studio
DATABASE_URL="your-url" npx prisma studio

# Connect via Railway CLI
railway connect postgres

# Run custom query script
node scripts/view-raw-data.js

# Check database connection
curl http://localhost:3000/api/debug/database
```

---

## 📚 Additional Resources

- [Railway Documentation](https://docs.railway.app)
- [Prisma Studio Docs](https://www.prisma.io/studio)
- [PostgreSQL Size Functions](https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADMIN-DBSIZE)






