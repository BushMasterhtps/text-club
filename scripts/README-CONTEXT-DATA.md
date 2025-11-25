# Getting Context Data for Presentation

This script connects to your **Railway PostgreSQL database** to gather real production data for your presentation's CONTEXT slide.

## ⚠️ Important: Connect to Railway Database

The script **must** connect to Railway, not your local database. Make sure you're using the Railway `DATABASE_URL`.

## How to Run:

### Option 1: Set DATABASE_URL when running (Recommended)
```bash
DATABASE_URL="your-railway-connection-string" node scripts/get-context-data.js
```

### Option 2: Use .env.local file
1. Create `.env.local` file in project root
2. Add your Railway DATABASE_URL:
   ```
   DATABASE_URL="postgresql://user:password@your-railway-host.railway.app:port/database"
   ```
3. Run the script:
   ```bash
   node scripts/get-context-data.js
   ```

## Getting Your Railway DATABASE_URL:

1. Go to [Railway Dashboard](https://railway.app)
2. Select your PostgreSQL database project
3. Go to the "Variables" tab
4. Copy the `DATABASE_URL` value
5. It should look like: `postgresql://postgres:password@containers-us-west-xxx.railway.app:5432/railway`

## What the Script Outputs:

- **People Affected**: Number of agents and managers
- **System Scale**: Total tasks processed, completed tasks
- **System Age**: When the system launched, days/weeks since launch
- **Estimation Guide**: How to calculate hours/week saved, cost of fragmentation

## Example Output:

```
=== CONTEXT DATA FOR PRESENTATION ===

PEOPLE AFFECTED:
  • Total Users: X
  • Agents: X
  • Managers: X

SYSTEM SCALE:
  • Total Tasks Processed: X,XXX
  • Completed Tasks: X,XXX
  • System Launch: MM/DD/YYYY
  • Days Since Launch: XX
  • Weeks Since Launch: XX
```

Use this data in your presentation's CONTEXT slide!

