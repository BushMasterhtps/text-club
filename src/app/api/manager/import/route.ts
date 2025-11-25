export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { parse } from "csv-parse/sync";
import crypto from "crypto";

const prisma = new PrismaClient();

/* ------------ helpers (mirror your Apps Script semantics) ------------ */
function normText(s: unknown) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
function parseDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  const d = new Date(String(v ?? "").replace("T", " "));
  return isNaN(d.getTime()) ? null : d;
}
function stripUS1(phone: unknown) {
  let s = String(phone ?? "").replace(/[^\d+]/g, "");
  if (/^\+1\d{10}$/.test(s)) return s.slice(2);
  if (/^1\d{10}$/.test(s)) return s.slice(1);
  const digits = s.replace(/\D/g, "");
  if (/^\d{10}$/.test(digits)) return digits;
  return String(phone ?? "");
}
function brandFromFilename(name: string) {
  // EXACT MATCH TO SCRIPT: Include all brand aliases
  const aliases: Record<string, string> = {
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
function buildKey(toPhone: string, when: Date | null, text: string, brand: string) {
  const t = when ? when.getTime() : NaN;
  if (!toPhone || isNaN(t) || !text) return "";
  return [String(toPhone).trim(), t, normText(text), normText(brand)].join("||");
}

/** Optional counts for a small “Import Summary” widget */
export async function GET() {
  try {
    const ready = await prisma.rawMessage.count({ where: { status: "READY" } });
    const spam = await prisma.rawMessage.count({ where: { status: "SPAM_REVIEW" } });
    const promoted = await prisma.rawMessage.count({ where: { status: "PROMOTED" } });
    return NextResponse.json({ success: true, counts: { ready, spam, promoted } });
  } catch (err) {
    console.error("import GET error:", err);
    return NextResponse.json({ success: false, error: "Failed to load counts" }, { status: 500 });
  }
}

/**
 * POST /api/manager/import
 * Accepts one or multiple CSVs via form-data (field name "files" or "file")
 */
export async function POST(req: Request) {
  try {
    console.log("Import API called");
    const form = await req.formData();
    console.log("Form data received");

    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    const single = form.get("file");
    if (files.length === 0 && single instanceof File) files.push(single);

    console.log(`Processing ${files.length} files`);

    if (files.length === 0) {
      console.log("No files provided");
      return NextResponse.json({ success: false, error: "No CSV files provided" }, { status: 400 });
    }

    const perFileResults: Array<{
      fileName: string;
      brand: string;
      inserted: number;
      skippedExisting: number;
      totalRows: number;
      importBatchId: string;
    }> = [];

    for (const file of files) {
      console.log(`Processing file: ${file.name}, size: ${file.size} bytes`);
      
      // Check file size (Netlify has limits, but we'll process anyway and let it timeout if needed)
      // For very large files, recommend using the script instead
      const buf = Buffer.from(await file.arrayBuffer());
      const csv = buf.toString("utf8");
      console.log(`File ${file.name} content length: ${csv.length} characters`);
      
      const rows = parse(csv, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Array<Record<string, string>>;
      
      console.log(`File ${file.name} parsed into ${rows.length} rows`);
      
      // Warn if file is very large (but still process it)
      if (rows.length > 5000) {
        console.warn(`⚠️  Large file detected (${rows.length} rows). This may timeout. Consider using the import script for files this large.`);
      }

      if (!rows.length) {
        perFileResults.push({
          fileName: file.name,
          brand: brandFromFilename(file.name),
          inserted: 0,
          skippedExisting: 0,
          totalRows: 0,
          importBatchId: "(none)",
        });
        continue;
      }

      const brand = brandFromFilename(file.name);

      // One ImportBatch per uploaded file
      const batch = await prisma.importBatch.create({
        data: {
          sourceName: file.name,
          rowCount: 0,
        },
      });

      // Flexible column access
      const headers = Object.keys(rows[0] ?? {});
      const colIndex: Record<string, number> = {};
      headers.forEach((h, i) => (colIndex[h.trim().toLowerCase()] = i));
      const H = (...aliases: string[]) => {
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

      // Build candidates + key list (EXACT MATCH TO SCRIPT LOGIC)
      const candidates: Array<{
        importBatchId: string;
        receivedAt: Date;
        phone: string;
        email: string;
        brand: string;
        text: string;
        source: string;
        hashKey: string;
        status: "READY";
      }> = [];
      const keys: string[] = [];
      let errors = 0;
      const errorDetails: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] as Record<string, string>;
        
        // Skip TOTAL rows (EXACT MATCH TO SCRIPT LOGIC)
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

        // EXACT MATCH TO SCRIPT: Generate SHA1 hash of the key for duplicate detection
        const hashKey = crypto.createHash("sha1").update(key).digest("hex");

        candidates.push({
          importBatchId: batch.id,
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
      
      if (errors > 0) {
        console.warn(`File ${file.name}: ${errors} rows had errors (see errorDetails)`);
      }

      // De-dupe: bulk lookup existing hashKeys (EXACT MATCH TO SCRIPT LOGIC)
      // This ensures duplicates are detected across ALL existing records, not just within this import
      const existing = await prisma.rawMessage.findMany({
        where: { hashKey: { in: keys } },
        select: { hashKey: true },
      });
      const existingSet = new Set(existing.map((e: { hashKey: string }) => e.hashKey));
      const toInsert = candidates.filter((c) => !existingSet.has(c.hashKey));

      let inserted = 0;
      let skippedExisting = candidates.length - toInsert.length;
      
      console.log(`File ${file.name}: ${toInsert.length} new records, ${skippedExisting} duplicates detected`);
      
      if (toInsert.length) {
        // Insert new records in batches (using script's approach for better large file handling)
        // For large files, use smaller batches to avoid timeout
        const BATCH_SIZE = rows.length > 5000 ? 50 : 100;
        const totalBatches = Math.ceil(toInsert.length / BATCH_SIZE);
        
        for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
          const batchChunk = toInsert.slice(i, i + BATCH_SIZE);
          const batchNum = Math.floor(i / BATCH_SIZE) + 1;
          
          // Log progress for large files (every 10 batches or on last batch)
          if (rows.length > 5000 && (batchNum % 10 === 0 || batchNum === totalBatches)) {
            console.log(`File ${file.name}: Processing batch ${batchNum}/${totalBatches} (${Math.min(i + BATCH_SIZE, toInsert.length)}/${toInsert.length} records)`);
          }
          
          try {
            const result = await prisma.rawMessage.createMany({
              data: batchChunk,
              skipDuplicates: true // Safeguard against race conditions
            });
            inserted += result.count;
          } catch (error) {
            // If batch insert fails, fall back to individual inserts (EXACT MATCH TO SCRIPT LOGIC)
            console.log(`Batch insert failed for batch ${batchNum}, falling back to individual inserts...`);
            for (const record of batchChunk) {
              try {
                await prisma.rawMessage.create({ data: record });
                inserted++;
              } catch (individualError) {
                // Handle duplicate constraint errors (EXACT MATCH TO SCRIPT LOGIC)
                if (individualError instanceof Error && individualError.message.includes('Unique constraint failed on the fields: (`hashKey`)')) {
                  // Duplicate detected during insert - count as skipped, not error
                  skippedExisting++;
                } else {
                  console.error(`Error inserting record:`, individualError);
                  throw individualError;
                }
              }
            }
          }
        }
        
        console.log(`File ${file.name}: ${inserted} inserted, ${skippedExisting} skipped (duplicates)`);
      }

      await prisma.importBatch.update({
        where: { id: batch.id },
        data: { rowCount: inserted },
      });

      perFileResults.push({
        fileName: file.name,
        brand,
        inserted,
        skippedExisting: skippedExisting,
        totalRows: rows.length,
        importBatchId: batch.id,
      });
    }

    return NextResponse.json({ success: true, results: perFileResults });
  } catch (err) {
    console.error("CSV import failed:", err);
    console.error("Error details:", {
      name: err instanceof Error ? err.name : 'Unknown',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    });
    return NextResponse.json({ 
      success: false, 
      error: "Failed to import CSV",
      details: err instanceof Error ? err.message : String(err)
    }, { status: 500 });
  }
}