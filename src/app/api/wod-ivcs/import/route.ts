import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parse } from "csv-parse/sync";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const source = formData.get("source") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!source || !["INVALID_CASH_SALE", "ORDERS_NOT_DOWNLOADING", "SO_VS_WEB_DIFFERENCE"].includes(source)) {
      return NextResponse.json({ error: "Invalid source specified" }, { status: 400 });
    }

    const csvText = await file.text();
    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    console.log(`📥 Importing ${records.length} records from ${source}`);

    // Process in smaller batches to avoid timeout
    const BATCH_SIZE = 50;
    const batches = [];
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      batches.push(records.slice(i, i + BATCH_SIZE));
    }

    const results = {
      imported: 0,
      duplicates: 0,
      errors: 0,
      filtered: 0,
      duplicateDetails: [] as any[],
      errorDetails: [] as any[],
    };

    // Create import session record
    const importSession = await prisma.importSession.create({
      data: {
        source: source,
        fileName: file.name,
        importedBy: 'system', // TODO: Get from auth
        totalRows: records.length,
        imported: 0,
        duplicates: 0,
        filtered: 0,
        errors: 0,
      },
    });

    // Process each batch
    for (const [batchIndex, batch] of batches.entries()) {
      console.log(`📦 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} records)`);
      
      for (const [index, record] of batch.entries()) {
        const globalIndex = batchIndex * BATCH_SIZE + index;
      try {
        // Create a hash key for duplicate detection
        const hashKey = createHashKey(record, source);
        
        // Check for duplicates based on source-specific unique identifiers
        let existingTask = null;
        
        if (source === "INVALID_CASH_SALE") {
          existingTask = await prisma.task.findFirst({
            where: {
              taskType: "WOD_IVCS",
              wodIvcsSource: "INVALID_CASH_SALE",
              documentNumber: record["Document Number"],
            },
          });
        } else if (source === "ORDERS_NOT_DOWNLOADING") {
          existingTask = await prisma.task.findFirst({
            where: {
              taskType: "WOD_IVCS",
              wodIvcsSource: "ORDERS_NOT_DOWNLOADING",
              webOrder: record["Web Order"],
            },
          });
        } else if (source === "SO_VS_WEB_DIFFERENCE") {
          existingTask = await prisma.task.findFirst({
            where: {
              taskType: "WOD_IVCS",
              wodIvcsSource: "SO_VS_WEB_DIFFERENCE",
              webOrder: record["Web Order"],
            },
          });
        }

        if (existingTask) {
          results.duplicates++;
          results.duplicateDetails.push({
            row: index + 1,
            record: record,
            existingTaskId: existingTask.id,
            age: Math.floor((Date.now() - existingTask.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
          });

          // Store duplicate information in ImportDuplicate table
          await prisma.importDuplicate.create({
            data: {
              importSessionId: importSession.id,
              rowNumber: index + 1,
              documentNumber: record["Document Number"] || null,
              webOrder: record["Web Order"] || null,
              customerName: record["Customer"] || record["Customer Name"] || "Unknown",
              source: source,
              originalTaskId: existingTask.id,
              originalCreatedAt: existingTask.createdAt,
              originalCompletedAt: existingTask.endTime,
              originalDisposition: existingTask.disposition,
              originalCompletedBy: existingTask.assignedTo?.name || null,
              ageInDays: Math.floor((Date.now() - existingTask.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
            },
          });

          continue;
        }

        // Create new task
        const taskData = buildTaskData(record, source);
        
        // Skip if taskData is null (filtered out)
        if (taskData === null) {
          results.filtered++;
          continue;
        }
        
        await prisma.task.create({
          data: taskData,
        });

        results.imported++;
      } catch (error) {
        console.error(`Error processing row ${globalIndex + 1}:`, error);
        results.errors++;
        results.errorDetails.push({
          row: globalIndex + 1,
          record: record,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    
    // Update progress after each batch
    await prisma.importSession.update({
      where: { id: importSession.id },
      data: {
        imported: results.imported,
        duplicates: results.duplicates,
        filtered: results.filtered,
        errors: results.errors,
      },
    });
  }

    // Update import session with final results
    await prisma.importSession.update({
      where: { id: importSession.id },
      data: {
        imported: results.imported,
        duplicates: results.duplicates,
        filtered: results.filtered,
        errors: results.errors,
        duplicateDetails: results.duplicateDetails,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Import completed: ${results.imported} imported, ${results.duplicates} duplicates, ${results.errors} errors`,
      results,
    });

  } catch (error) {
    console.error("CSV import error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to import CSV" },
      { status: 500 }
    );
  }
}

function parseDate(dateString: string | undefined): Date | null {
  if (!dateString || dateString.trim() === '') {
    return null;
  }
  
  try {
    const date = new Date(dateString);
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.warn(`Invalid date string: "${dateString}"`);
      return null;
    }
    return date;
  } catch (error) {
    console.warn(`Error parsing date "${dateString}":`, error);
    return null;
  }
}

function createHashKey(record: any, source: string): string {
  // Create a unique hash based on key fields
  const keyFields = {
    INVALID_CASH_SALE: ["Document Number", "Email", "Amount"],
    ORDERS_NOT_DOWNLOADING: ["Web Order", "Name", "NS vs Web Discrepancy"],
    SO_VS_WEB_DIFFERENCE: ["Web Order", "Customer", "Purchase Date"],
  };

  const fields = keyFields[source as keyof typeof keyFields] || [];
  const key = fields.map(field => record[field] || "").join("|");
  return Buffer.from(key).toString("base64");
}

function buildTaskData(record: any, source: string) {
  const baseData = {
    taskType: "WOD_IVCS" as const,
    wodIvcsSource: source as any,
    status: "PENDING" as const,
  };

  switch (source) {
    case "INVALID_CASH_SALE":
      return {
        ...baseData,
        brand: record["Brand"] || null,
        email: record["Email"] || null,
        documentNumber: record["Document Number"] || null,
        warehouseEdgeStatus: record["Warehouse Edge Status"] || null,
        amount: record["Amount"] ? parseFloat(record["Amount"]) : null,
        webOrderDifference: record["Web total Difference"] ? parseFloat(record["Web total Difference"]) : null,
        customerName: record["Name"] || null, // Add customerName for consistency
        purchaseDate: parseDate(record["Date"]),
        text: `Invalid Cash Sale - ${record["Name"] || "Unknown"}`,
      };

    case "ORDERS_NOT_DOWNLOADING":
      // Filter out rows with $0.00 in NS vs Web Discrepancy
      const discrepancy = record["NS vs Web Discrepancy"] ? parseFloat(record["NS vs Web Discrepancy"]) : 0;
      if (discrepancy === 0) {
        return null; // Skip this row
      }
      
      return {
        ...baseData,
        brand: record["Brand"] || null,
        documentNumber: record["Web Order"] || null, // Map Web Order to documentNumber for display
        webOrder: record["Web Order"] || null,
        webOrderSubtotal: record["Web Order Subtotal"] ? parseFloat(record["Web Order Subtotal"]) : null,
        webOrderTotal: record["Web Order Total"] ? parseFloat(record["Web Order Total"]) : null,
        amount: record["Web Order Total"] ? parseFloat(record["Web Order Total"]) : null, // Map Web Order Total to amount for display
        webOrderDifference: discrepancy, // Map NS vs Web Discrepancy to webOrderDifference for display
        nsVsWebDiscrepancy: discrepancy,
        customerName: record["Name"] || null,
        purchaseDate: parseDate(record["Date"]),
        text: `Order Not Downloading - ${record["Name"] || "Unknown"}`,
      };

    case "SO_VS_WEB_DIFFERENCE":
      return {
        ...baseData,
        documentNumber: record["Web Order"] || null, // Map Web Order to documentNumber for display
        webOrder: record["Web Order"] || null,
        customerName: record["Customer"] || null,
        amount: record["Web Total"] ? parseFloat(record["Web Total"]) : null, // Map Web Total to amount for display
        webOrderDifference: record["Web vs NS Difference (ABS)"] ? parseFloat(record["Web vs NS Difference (ABS)"]) : null, // Map difference for display
        netSuiteTotal: record["NetSuite Total"] ? parseFloat(record["NetSuite Total"]) : null,
        webTotal: record["Web Total"] ? parseFloat(record["Web Total"]) : null,
        webVsNsDifference: record["Web vs NS Difference (ABS)"] ? parseFloat(record["Web vs NS Difference (ABS)"]) : null,
        shippingCountry: record["Shipping Country"] || null,
        shippingState: record["Shipping State/Province"] || null,
        purchaseDate: parseDate(record["Purchase Date"]),
        text: `SO vs Web Difference - ${record["Customer"] || "Unknown"}`,
      };

    default:
      throw new Error(`Unknown source: ${source}`);
  }
}
// Force new deployment - Mon Sep  8 00:34:57 PDT 2025
// Cache cleared and server restarted - Mon Sep  8 00:45:00 PDT 2025
// Prisma client regenerated - Mon Sep  8 00:50:00 PDT 2025
// NUCLEAR FIX: Added postinstall script to force Prisma generation - Mon Sep  8 00:55:00 PDT 2025
// ULTIMATE FIX: Enhanced postinstall script with echo - Mon Sep  8 01:00:00 PDT 2025
// FINAL FIX: Fixed next.config.js warnings and enhanced build script - Mon Sep  8 01:05:00 PDT 2025
// RAILWAY NUCLEAR FIX: Force complete Prisma client rebuild - Mon Sep 8 02:20:00 PDT 2025
