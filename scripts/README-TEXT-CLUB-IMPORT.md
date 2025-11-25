# Text Club CSV Import Script

## Overview

This script imports Text Club CSV files directly into the database, bypassing API timeouts. It's designed for large imports (especially files with 5,000+ rows) that would otherwise timeout via the web API.

## Usage

```bash
# Import single file
node scripts/import-text-club-csv.js "GundryMD 2.csv"

# Import multiple files
node scripts/import-text-club-csv.js "GundryMD 2.csv" "UPN 1.csv" "DrMarty 1.csv"

# Import all files in a directory (using shell expansion)
node scripts/import-text-club-csv.js *.csv
```

## Requirements

1. **Environment Variables**: The script uses `DATABASE_URL` from your `.env` file
2. **Node.js Dependencies**: Requires `@prisma/client`, `csv-parse/sync`, and `dotenv`
3. **Database Access**: Must have write access to the Railway PostgreSQL database

## CSV Format

The script expects CSV files with the following columns (case-insensitive):
- `PHONE` or `FROM` - Customer phone number
- `EMAIL` - Customer email (optional)
- `TO_PHONE` or `TO` or `SHORT CODE` - Destination phone number
- `TEXT` or `MESSAGE` or `BODY` - Message content
- `DATE` or `MESSAGE DATE` or `RECEIVED` - Timestamp

## Features

- ✅ **Direct Database Import**: Bypasses API timeouts completely
- ✅ **Automatic Deduplication**: Uses hash keys to prevent duplicate imports
- ✅ **Batch Processing**: Processes in batches of 100 for efficiency
- ✅ **Progress Reporting**: Shows progress for large files
- ✅ **Detailed Error Reporting**: Lists which files failed and why
- ✅ **Brand Detection**: Automatically detects brand from filename

## Output

The script provides:
- Per-file breakdown (inserted, duplicates, errors)
- Summary statistics (total inserted, skipped, errors)
- List of failed files with reasons
- Success confirmation: "X out of Y files successfully imported"

## Example Output

```
🚀 Starting Text Club CSV Import
📁 Processing 12 file(s)...

📂 Processing: GundryMD 2.csv
   Brand: GundryMD
   Rows in file: 7607
   Valid candidates: 7605
   New records: 7605, Duplicates: 0
   Progress: 100/7605 processed
   Progress: 200/7605 processed
   ...
   ✅ 7605 inserted, 0 duplicates, 0 errors

============================================================
📊 IMPORT SUMMARY
============================================================

✅ Successfully imported: 12 out of 12 files
📥 Total messages inserted: 8600
🔄 Total duplicates skipped: 25
❌ Total errors: 2

📋 Per-file breakdown:
   ✅ GundryMD 2.csv (GundryMD): 7605 inserted, 0 duplicates, 0 errors
   ✅ UPN 1.csv (UPN): 164 inserted, 0 duplicates, 0 errors
   ...

✅ Import completed!
```

## When to Use This Script

- **Large files** (5,000+ rows)
- **Multiple files** at once
- **Scheduled imports** (can be run via cron)
- **API timeout issues**

## When to Use the Web API

- **Small files** (< 1,000 rows)
- **Single file** imports
- **Interactive imports** via the UI

## Troubleshooting

### "File not found"
- Check the file path is correct
- Use quotes around file paths with spaces

### "Missing required columns"
- Ensure CSV has TO_PHONE, TEXT, and DATE columns
- Column names are case-insensitive

### "Database connection error"
- Verify `DATABASE_URL` is set in `.env`
- Check database is accessible from your network

### "No records inserted"
- Check CSV format matches expected structure
- Verify data rows (not just headers)
- Check for "TOTAL" rows that are automatically skipped

