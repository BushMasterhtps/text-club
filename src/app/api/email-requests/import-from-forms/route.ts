import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { 
  getSharePointSite, 
  findExcelFile, 
  readExcelData, 
  parseEmailRequestData, 
  filterEmailRequestData 
} from '@/lib/microsoft-graph';

export async function POST() {
  try {
    // Check if Microsoft Graph is configured
    if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
      return NextResponse.json({
        success: false,
        error: 'Microsoft Graph API not configured. Please set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET environment variables.',
        results: {
          imported: 0,
          skipped: 0,
          errors: 1,
          totalProcessed: 0,
          message: "Microsoft Graph API not configured"
        }
      });
    }

    // SharePoint configuration
    const SHAREPOINT_SITE_URL = process.env.SHAREPOINT_SITE_URL || '/sites/GCCCustomerAccounts';
    const EXCEL_FILE_NAME = process.env.EXCEL_FILE_NAME || 'Email Requests 1.xlsx';
    const WORKSHEET_NAME = process.env.WORKSHEET_NAME || 'Email Requests';

    console.log('📧 Starting Microsoft Forms import...');

    // Get SharePoint site information
    const { siteId, driveId } = await getSharePointSite(SHAREPOINT_SITE_URL);
    console.log(`📍 SharePoint Site ID: ${siteId}, Drive ID: ${driveId}`);

    // Find the Excel file
    const excelFileId = await findExcelFile(siteId, driveId, EXCEL_FILE_NAME);
    if (!excelFileId) {
      throw new Error(`Excel file "${EXCEL_FILE_NAME}" not found in SharePoint`);
    }
    console.log(`📊 Excel File ID: ${excelFileId}`);

    // Read Excel data
    const excelData = await readExcelData(siteId, driveId, excelFileId, WORKSHEET_NAME);
    console.log(`📋 Read ${excelData.length} rows from Excel`);

    // Parse and filter data
    const parsedData = parseEmailRequestData(excelData);
    const filteredData = filterEmailRequestData(parsedData);
    console.log(`🔍 Filtered to ${filteredData.length} rows (9/6/2025 onwards)`);

    // Get existing tasks to avoid duplicates
    const existingTasks = await prisma.task.findMany({
      where: { taskType: 'EMAIL_REQUESTS' },
      select: { salesforceCaseNumber: true, emailRequestFor: true, details: true }
    });

    const existingKeys = new Set(
      existingTasks.map(task => 
        `${task.salesforceCaseNumber || ''}-${task.emailRequestFor || ''}-${task.details || ''}`
      )
    );

    // Create import session
    const importSession = await prisma.importSession.create({
      data: {
        source: 'EMAIL_REQUESTS',
        fileName: EXCEL_FILE_NAME,
        importedBy: 'microsoft-forms',
        totalRows: filteredData.length,
        imported: 0,
        duplicates: 0,
        filtered: 0,
        errors: 0,
      },
    });

    const results = {
      imported: 0,
      skipped: 0,
      errors: 0,
      totalProcessed: filteredData.length,
      message: `Successfully processed ${filteredData.length} rows from Microsoft Forms`
    };

    // Process each row
    for (const row of filteredData) {
      try {
        // Create unique key for duplicate detection
        const uniqueKey = `${row.salesforceCaseNumber || ''}-${row.emailRequestFor || ''}-${row.details || ''}`;
        
        if (existingKeys.has(uniqueKey)) {
          results.skipped++;
          continue;
        }

        // Parse completion time
        let completionTime: Date | null = null;
        if (row.completionTime) {
          try {
            completionTime = new Date(row.completionTime);
            if (isNaN(completionTime.getTime())) {
              completionTime = null;
            }
          } catch {
            completionTime = null;
          }
        }

        // Create task
        await prisma.task.create({
          data: {
            taskType: 'EMAIL_REQUESTS',
            status: 'PENDING',
            completionTime,
            salesforceCaseNumber: row.salesforceCaseNumber || null,
            emailRequestFor: row.emailRequestFor || null,
            details: row.details || null,
            email: row.email || null,
            text: row.name || null, // Using name field for text
            brand: 'Email Request',
          },
        });

        results.imported++;
        existingKeys.add(uniqueKey); // Add to existing keys to prevent duplicates in same import

      } catch (error) {
        console.error(`Error processing row ${row.rowNumber}:`, error);
        results.errors++;
      }
    }

    // Update import session
    await prisma.importSession.update({
      where: { id: importSession.id },
      data: {
        imported: results.imported,
        duplicates: results.skipped,
        filtered: 0,
        errors: results.errors,
      },
    });

    console.log(`✅ Import completed: ${results.imported} imported, ${results.skipped} skipped, ${results.errors} errors`);

    return NextResponse.json({
      success: true,
      results
    });

  } catch (error) {
    console.error('Error importing from Microsoft Forms:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to import from Microsoft Forms',
        results: {
          imported: 0,
          skipped: 0,
          errors: 1,
          totalProcessed: 0,
          message: "Import failed"
        }
      },
      { status: 500 }
    );
  }
}
