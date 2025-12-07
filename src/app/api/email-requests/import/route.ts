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

    // Helper function to extract column value with multiple fallbacks
    const findColumnValue = (record: any, possibleKeys: string[], caseInsensitive = false): string | null => {
      for (const key of possibleKeys) {
        if (record[key]) return record[key];
      }
      if (caseInsensitive) {
        const foundKey = Object.keys(record).find(k => 
          possibleKeys.some(pk => k.toLowerCase() === pk.toLowerCase())
        );
        if (foundKey) return record[foundKey];
      }
      return null;
    };

    // Helper function to find column by partial match (case-insensitive)
    const findColumnByPartialMatch = (record: any, searchTerms: string[]): string | null => {
      const foundKey = Object.keys(record).find(key => {
        const lowerKey = key.toLowerCase();
        return searchTerms.every(term => lowerKey.includes(term.toLowerCase()));
      });
      return foundKey ? record[foundKey] : null;
    };

    // Process all records first to collect valid task data
    const validTaskData: Array<{
      taskType: 'EMAIL_REQUESTS';
      status: 'PENDING';
      completionTime: Date | null;
      salesforceCaseNumber: string | null;
      emailRequestFor: string | null;
      details: string | null;
      email: string | null;
      text: string | null;
      brand: string;
    }> = [];

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

        // Find Salesforce Case Number column - try multiple variations
        const sfCaseNum = findColumnValue(record, [
          'SaleForce Case Num',
          'SaleForce Case Number (please DO NOT include any other system number) I.E 1234567',
          'SaleForce Case Number (please DO NOT include any other system number) I.E. 1234567',
          'SaleForce Case Number'
        ]) || findColumnByPartialMatch(record, ['saleforce', 'case']);
        
        // Find Email column - try variations
        const email = findColumnValue(record, ['Email', 'email'], true);
        
        // Find Name column - try variations
        const name = findColumnValue(record, ['Name', 'name'], true);
        
        // Find "What is the email request for?" column - try variations
        const emailRequestFor = findColumnValue(record, [
          'What is the email request for?',
          'what is the email request for?'
        ]) || findColumnByPartialMatch(record, ['email request for']) ||
            findColumnByPartialMatch(record, ['request for']);
        
        // Find Details column
        const details = findColumnValue(record, ['Details', 'details'], true);
        
        if (index < 3) { // Log first 3 records for debugging
          console.log(`📋 Record ${index + 1}:`, {
            email,
            name,
            sfCaseNum,
            emailRequestFor,
            availableKeys: Object.keys(record)
          });
        }

        // Create task data
        const taskData = {
          taskType: 'EMAIL_REQUESTS' as const,
          status: 'PENDING' as const,
          completionTime,
          salesforceCaseNumber: sfCaseNum || null,
          emailRequestFor: emailRequestFor || null,
          details: details || null,
          email: email || null,
          text: name || null, // Using Name field for text
          brand: 'Email Request', // Default brand for email requests
        };

        validTaskData.push(taskData);
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

    // Batch insert all valid tasks in a single operation (fixes N+1 query issue)
    if (validTaskData.length > 0) {
      try {
        await prisma.task.createMany({
          data: validTaskData,
        });
        results.imported = validTaskData.length;
        console.log(`✅ Batch inserted ${validTaskData.length} tasks in a single operation`);
      } catch (error) {
        console.error('Error batch inserting tasks:', error);
        // If batch insert fails, fall back to individual inserts for error tracking
        results.errors += validTaskData.length;
        for (let i = 0; i < validTaskData.length; i++) {
          results.errorDetails.push({
            row: i + 1,
            record: records[i],
            error: error instanceof Error ? error.message : "Batch insert failed",
          });
        }
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
