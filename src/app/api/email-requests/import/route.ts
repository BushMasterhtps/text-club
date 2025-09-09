import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parse } from 'csv-parse/sync';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ 
        success: false, 
        error: 'No file provided' 
      }, { status: 400 });
    }

    const csvText = await file.text();
    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    console.log(`📧 Importing ${records.length} email request records`);
    
    // Debug: Log available columns from first record
    if (records.length > 0) {
      console.log('📋 Available columns:', Object.keys(records[0]));
    }

    const results = {
      imported: 0,
      errors: 0,
      totalRows: records.length,
      errorDetails: [] as any[],
    };

    // Create import session record
    const importSession = await prisma.importSession.create({
      data: {
        source: 'EMAIL_REQUESTS',
        fileName: file.name,
        importedBy: 'system', // TODO: Get from auth
        taskType: 'EMAIL_REQUESTS', // Set task type for filtering
        totalRows: records.length,
        imported: 0,
        duplicates: 0,
        filtered: 0,
        errors: 0,
      },
    });

    // Process each record
    for (const [index, record] of records.entries()) {
      try {
        // Parse completion time
        let completionTime: Date | null = null;
        if (record['Completion time']) {
          try {
            completionTime = new Date(record['Completion time']);
            if (isNaN(completionTime.getTime())) {
              completionTime = null;
            }
          } catch {
            completionTime = null;
          }
        }

        // Debug: Log SalesForce Case Number mapping
        const sfCaseNum = record['SaleForce Case Num'] || 
                         record['SaleForce Case Number (please DO NOT include any other system number) I.E 1234567'] || 
                         record['SaleForce Case Number (please DO NOT include any other system number) I.E. 1234567'] || 
                         null;
        
        if (index < 3) { // Log first 3 records for debugging
          console.log(`📋 Record ${index + 1} - SF Case Number:`, sfCaseNum);
        }

        // Create task data
        const taskData = {
          taskType: 'EMAIL_REQUESTS' as const,
          status: 'PENDING' as const,
          completionTime,
          salesforceCaseNumber: sfCaseNum,
          emailRequestFor: record['What is the email request for?'] || null,
          details: record['Details'] || null,
          // Map other fields as needed
          email: record['Email'] || null,
          text: record['Name'] || null, // Using Name field for text
          brand: 'Email Request', // Default brand for email requests
        };

        await prisma.task.create({
          data: taskData,
        });

        results.imported++;
      } catch (error) {
        console.error(`Error processing row ${index + 1}:`, error);
        results.errors++;
        results.errorDetails.push({
          row: index + 1,
          record: record,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Update import session with final results
    await prisma.importSession.update({
      where: { id: importSession.id },
      data: {
        imported: results.imported,
        duplicates: 0, // No duplicates for email requests
        filtered: 0, // No filtering for email requests
        errors: results.errors,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Import completed: ${results.imported} imported, ${results.errors} errors`,
      results,
    });

  } catch (error) {
    console.error("Email requests CSV import error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to import CSV" },
      { status: 500 }
    );
  }
}
// Force new deployment - Mon Sep  8 00:35:07 PDT 2025
// Cache cleared and server restarted - Mon Sep  8 00:45:00 PDT 2025
// Prisma client regenerated - Mon Sep  8 00:50:00 PDT 2025
// NUCLEAR FIX: Added postinstall script to force Prisma generation - Mon Sep  8 00:55:00 PDT 2025
// ULTIMATE FIX: Enhanced postinstall script with echo - Mon Sep  8 01:00:00 PDT 2025
// FINAL FIX: Fixed next.config.js warnings and enhanced build script - Mon Sep  8 01:05:00 PDT 2025
// RAILWAY NUCLEAR FIX: Force complete Prisma client rebuild - Mon Sep 8 02:20:00 PDT 2025
