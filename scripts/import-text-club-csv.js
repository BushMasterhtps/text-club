#!/usr/bin/env node

/**
 * Direct CSV import script for Text Club messages
 * Bypasses API timeouts by importing directly into the database
 * 
 * Usage:
 *   node scripts/import-text-club-csv.js file1.csv file2.csv file3.csv ...
 *   node scripts/import-text-club-csv.js "path/to/*.csv"
 * 
 * This script:
 * - Processes multiple CSV files
 * - Imports directly to database (no API timeout)
 * - Provides detailed success/failure reporting
 * - Handles duplicates automatically
 * - Shows progress for large files
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const crypto = require('crypto');

// Use Railway's DATABASE_URL (production)
// If DATABASE_URL is not set or points to local, use Railway production URL
const dbUrl = process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1')
  ? process.env.DATABASE_URL
  : 'postgresql://postgres:OUYdvdsKqOUGwpTWTUUniqINJdjqIBdy@interchange.proxy.rlwy.net:43835/railway';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: dbUrl
    }
  }
});

// Helper functions (mirror API logic)
function normText(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(v) {
  if (v instanceof Date) return v;
  const d = new Date(String(v ?? "").replace("T", " "));
  return isNaN(d.getTime()) ? null : d;
}

function stripUS1(phone) {
  let s = String(phone ?? "").replace(/[^\d+]/g, "");
  if (/^\+1\d{10}$/.test(s)) return s.slice(2);
  if (/^1\d{10}$/.test(s)) return s.slice(1);
  const digits = s.replace(/\D/g, "");
  if (/^\d{10}$/.test(digits)) return digits;
  return String(phone ?? "");
}

function brandFromFilename(name) {
  const aliases = {
    gundrymd: "GundryMD",
    drmarty: "DrMarty",
    "dr-marty": "DrMarty",
    ultimatepetnutrition: "DrMarty",
    activatedyou: "ActivatedYou",
    activatedu: "ActivatedYou",
    upn: "UPN",
    ultimatpetnutrition: "UPN",
    terramare: "TerraMare",
    roundhouseprovisions: "RoundHouseProvisions",
    powerlife: "PowerLife",
    nucific: "Nucific",
    lonewolfranch: "LoneWolfRanch",
    kintsugihair: "KintsugiHair",
    badlandsranch: "BadlandsRanch",
    bhmd: "BHMD"
  };
  const base = String(name || "").split(".")[0];
  const first = (base.split(/[\s_\-]+/)[0] || "").toLowerCase();
  return aliases[first] || (first ? first[0].toUpperCase() + first.slice(1) : "Unknown");
}

// EXACT MATCH TO API: Builds unique key from toPhone, timestamp, normalized text, and normalized brand
function buildKey(toPhone, when, text, brand) {
  const t = when ? when.getTime() : NaN;
  if (!toPhone || isNaN(t) || !text) return "";
  return [String(toPhone).trim(), t, normText(text), normText(brand)].join("||");
}

async function importCSVFile(filePath) {
  const fileName = path.basename(filePath);
  const brand = brandFromFilename(fileName);
  
  console.log(`\n📂 Processing: ${fileName}`);
  console.log(`   Brand: ${brand}`);
  
  try {
    // Read and parse CSV
    const csvText = fs.readFileSync(filePath, 'utf8');
    const rows = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    
    console.log(`   Rows in file: ${rows.length}`);
    
    if (rows.length === 0) {
      return {
        fileName,
        brand,
        inserted: 0,
        skippedExisting: 0,
        totalRows: 0,
        errors: 0,
        errorDetails: ['File is empty or has no valid rows']
      };
    }
    
    // Get headers and build column index
    const headers = Object.keys(rows[0] ?? {});
    const colIndex = {};
    headers.forEach((h, i) => (colIndex[h.trim().toLowerCase()] = i));
    
    const H = (...aliases) => {
      for (const a of aliases) {
        const k = a.trim().toLowerCase();
        if (k in colIndex) return colIndex[k];
      }
      return -1;
    };
    
    const iPhone = H("phone", "subscriber phone", "from phone", "from");
    const iEmail = H("email", "subscriber email", "from email", "email address");
    const iToPh = H("to_phone", "to phone", "short code", "number", "to");
    const iText = H("text", "message", "body", "sms text", "content");
    const iDate = H("date", "message date", "received", "received at", "time", "timestamp");
    
    // Build candidates
    const candidates = [];
    const keys = [];
    let errors = 0;
    const errorDetails = [];
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      // Skip TOTAL rows
      if (row[headers[0]]?.toUpperCase() === 'TOTAL' || 
          row[headers[0]]?.toUpperCase() === '-') {
        continue;
      }
      
      if (iToPh < 0 || iText < 0 || iDate < 0) {
        errors++;
        errorDetails.push(`Row ${i + 2}: Missing required columns (TO_PHONE, TEXT, or DATE)`);
        continue;
      }
      
      const toPhone = String(row[headers[iToPh]] ?? "").trim();
      const text = String(row[headers[iText]] ?? "").trim();
      const when = parseDate(row[headers[iDate]]);
      const key = buildKey(toPhone, when, text, brand);
      
      if (!key) {
        errors++;
        errorDetails.push(`Row ${i + 2}: Invalid data (missing toPhone, date, or text)`);
        continue;
      }
      
      // EXACT MATCH TO API: Generate SHA1 hash of the key for duplicate detection
      const hashKey = crypto.createHash("sha1").update(key).digest("hex");
      
      candidates.push({
        importBatchId: null, // Will be set after batch creation
        receivedAt: when ?? new Date(),
        phone: stripUS1(iPhone >= 0 ? row[headers[iPhone]] : ""),
        email: String(iEmail >= 0 ? row[headers[iEmail]] : "").trim(),
        brand,
        text,
        source: "csv",
        hashKey,
        status: "READY",
      });
      keys.push(hashKey);
    }
    
    console.log(`   Valid candidates: ${candidates.length}`);
    
    if (candidates.length === 0) {
      return {
        fileName,
        brand,
        inserted: 0,
        skippedExisting: 0,
        totalRows: rows.length,
        errors,
        errorDetails
      };
    }
    
    // Create import batch
    const batch = await prisma.importBatch.create({
      data: {
        sourceName: fileName,
        rowCount: 0,
      },
    });
    
    // Update candidates with batch ID
    candidates.forEach(c => c.importBatchId = batch.id);
    
    // De-dupe: bulk lookup existing hashKeys (EXACT MATCH TO API LOGIC)
    // This ensures duplicates are detected across ALL existing records, not just within this import
    const existing = await prisma.rawMessage.findMany({
      where: { hashKey: { in: keys } },
      select: { hashKey: true },
    });
    const existingSet = new Set(existing.map(e => e.hashKey));
    const toInsert = candidates.filter(c => !existingSet.has(c.hashKey));
    
    const skippedExisting = candidates.length - toInsert.length;
    console.log(`   New records: ${toInsert.length}, Duplicates: ${skippedExisting}`);
    
    // Insert in batches (EXACT MATCH TO API LOGIC)
    // Uses skipDuplicates: true as a safety net for race conditions
    const BATCH_SIZE = 100;
    let inserted = 0;
    
    if (toInsert.length > 0) {
      for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const batch = toInsert.slice(i, i + BATCH_SIZE);
        try {
          const result = await prisma.rawMessage.createMany({
            data: batch,
            skipDuplicates: true // Safety net: skips duplicates created between check and insert
          });
          inserted += result.count;
          if ((i / BATCH_SIZE + 1) % 10 === 0 || i + BATCH_SIZE >= toInsert.length) {
            console.log(`   Progress: ${Math.min(i + BATCH_SIZE, toInsert.length)}/${toInsert.length} processed`);
          }
        } catch (error) {
          // If batch insert fails, fall back to individual inserts (EXACT MATCH TO API LOGIC)
          console.error(`   ⚠️  Batch insert failed, falling back to individual inserts...`);
          for (const record of batch) {
            try {
              await prisma.rawMessage.create({ data: record });
              inserted++;
            } catch (individualError) {
              // Handle duplicate constraint errors (EXACT MATCH TO API LOGIC)
              if (individualError.message && individualError.message.includes('Unique constraint failed on the fields: (`hashKey`)')) {
                // Duplicate detected during insert - count as skipped, not error
                skippedExisting++;
              } else {
                errors++;
                errorDetails.push(`Row ${i + 2}: ${individualError.message}`);
              }
            }
          }
        }
      }
    }
    
    // Update import batch
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { rowCount: inserted },
    });
    
    return {
      fileName,
      brand,
      inserted,
      skippedExisting,
      totalRows: rows.length,
      errors,
      errorDetails: errorDetails.slice(0, 10) // Limit error details
    };
    
  } catch (error) {
    return {
      fileName,
      brand,
      inserted: 0,
      skippedExisting: 0,
      totalRows: 0,
      errors: 1,
      errorDetails: [error.message || String(error)]
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node scripts/import-text-club-csv.js <csv-file-1> [csv-file-2] [csv-file-3] ...');
    console.log('\nExample:');
    console.log('  node scripts/import-text-club-csv.js "GundryMD 2.csv" "UPN 1.csv" "DrMarty 1.csv"');
    console.log('\nThis script imports Text Club CSV files directly into the database,');
    console.log('bypassing API timeouts for large files.');
    process.exit(1);
  }
  
  console.log('🚀 Starting Text Club CSV Import');
  console.log(`📁 Processing ${args.length} file(s)...\n`);
  
  const results = [];
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const failedFiles = [];
  
  // Process each file
  for (const filePath of args) {
    if (!fs.existsSync(filePath)) {
      console.log(`❌ File not found: ${filePath}`);
      failedFiles.push({
        fileName: filePath,
        reason: 'File not found'
      });
      continue;
    }
    
    const result = await importCSVFile(filePath);
    results.push(result);
    
    totalInserted += result.inserted;
    totalSkipped += result.skippedExisting;
    totalErrors += result.errors;
    
    if (result.errors > 0 || result.inserted === 0) {
      failedFiles.push({
        fileName: result.fileName,
        reason: result.errorDetails[0] || 'No records inserted'
      });
    }
    
    console.log(`   ✅ ${result.inserted} inserted, ${result.skippedExisting} duplicates, ${result.errors} errors`);
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 IMPORT SUMMARY');
  console.log('='.repeat(60));
  console.log(`\n✅ Successfully imported: ${results.length - failedFiles.length} out of ${results.length} files`);
  console.log(`📥 Total messages inserted: ${totalInserted}`);
  console.log(`🔄 Total duplicates skipped: ${totalSkipped}`);
  console.log(`❌ Total errors: ${totalErrors}`);
  
  if (failedFiles.length > 0) {
    console.log(`\n❌ Failed Files (${failedFiles.length}):`);
    failedFiles.forEach(f => {
      console.log(`   - ${f.fileName}: ${f.reason}`);
    });
  }
  
  console.log('\n📋 Per-file breakdown:');
  results.forEach(r => {
    const status = r.errors > 0 || r.inserted === 0 ? '❌' : '✅';
    console.log(`   ${status} ${r.fileName} (${r.brand}): ${r.inserted} inserted, ${r.skippedExisting} duplicates, ${r.errors} errors`);
  });
  
  console.log('\n✅ Import completed!');
  
  await prisma.$disconnect();
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

