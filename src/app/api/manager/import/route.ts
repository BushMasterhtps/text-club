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
  const aliases: Record<string, string> = {
    gundrymd: "GundryMD",
    drmarty: "DrMarty",
    "dr-marty": "DrMarty",
    ultimatepetnutrition: "DrMarty",
    activatedyou: "ActivatedYou",
    activatedu: "ActivatedYou",
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

      // Build candidates + key list
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

      for (const row of rows as Array<Record<string, string>>) {
        if (iToPh < 0 || iText < 0 || iDate < 0) continue;

        const toPhone = String(row[headers[iToPh]] ?? "").trim();
        const text = String(row[headers[iText]] ?? "").trim();
        const when = parseDate(row[headers[iDate]]);
        const key = buildKey(toPhone, when, text, brand);
        if (!key) continue;

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

      // De-dupe: bulk lookup existing hashKeys
      const existing = await prisma.rawMessage.findMany({
        where: { hashKey: { in: keys } },
        select: { hashKey: true },
      });
      const existingSet = new Set(existing.map((e: { hashKey: string }) => e.hashKey));
      const toInsert = candidates.filter((c) => !existingSet.has(c.hashKey));

      let inserted = 0;
      let skippedExisting = candidates.length - toInsert.length;
      
      if (toInsert.length) {
        // Insert new records in batches for speed
        const batchSize = 100; // Insert in batches of 100
        for (let i = 0; i < toInsert.length; i += batchSize) {
          const batch = toInsert.slice(i, i + batchSize);
            try {
              const result = await prisma.rawMessage.createMany({
                data: batch,
                skipDuplicates: true // This will skip any duplicates that might have been created between our check and insert
              });
              inserted += result.count;
            } catch (error) {
              // If batch insert fails, fall back to individual inserts for this batch
              console.log(`Batch insert failed, falling back to individual inserts for batch ${i}-${i + batchSize}`);
              for (const record of batch) {
                try {
                  await prisma.rawMessage.create({ data: record });
                  inserted++;
                } catch (individualError) {
                  if (individualError instanceof Error && individualError.message.includes('Unique constraint failed on the fields: (`hashKey`)')) {
                    skippedExisting++;
                  } else {
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