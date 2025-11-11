import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parse } from 'csv-parse/sync';

/**
 * Yotpo CSV Import API
 * 
 * Expected CSV Columns:
 * A - Date Submitted
 * B - PRs or Yotpo?
 * C - Customer Name
 * D - Email
 * E - Order Date
 * F - Product
 * G - Issue Topic
 * H - Review Date
 * I - Review
 * J - SF Order Referenced (link)
 * 
 * Duplicate Detection: Email (D) + Product (F) + Review Date (H)
 */

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

    console.log(`⭐ Importing ${records.length} Yotpo records`);
    
    // Debug: Log available columns from first record
    if (records.length > 0) {
      console.log('📋 Available columns:', Object.keys(records[0]));
    }

    const results = {
      imported: 0,
      duplicates: 0,
      errors: 0,
      totalRows: records.length,
      errorDetails: [] as any[],
      duplicateDetails: [] as any[],
    };

    // Create import session record
    const importSession = await prisma.importSession.create({
      data: {
        source: 'YOTPO',
        fileName: file.name,
        importedBy: 'system', // TODO: Get from auth session
        taskType: 'YOTPO',
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
        // Parse dates with 2-digit year fix
        const parseDate = (dateStr: string | undefined, fieldName: string): Date | null => {
          if (!dateStr) return null;
          
          const trimmed = dateStr.trim();
          if (!trimmed) return null;
          
          try {
            // Try MM/DD/YY format (2-digit year) - MOST COMMON
            const twoDigitMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
            if (twoDigitMatch) {
              const month = parseInt(twoDigitMatch[1]);
              const day = parseInt(twoDigitMatch[2]);
              let year = parseInt(twoDigitMatch[3]);
              
              // Convert 2-digit year to 4-digit
              // Years 00-50 = 2000-2050, Years 51-99 = 1951-1999
              if (year <= 50) {
                year += 2000;
              } else {
                year += 1900;
              }
              
              const result = new Date(year, month - 1, day);
              if (index < 3) {
                console.log(`✓ ${fieldName}: "${trimmed}" → ${result.toLocaleDateString()} (year ${year})`);
              }
              return result;
            }
            
            // Try MM/DD/YYYY format (4-digit year)
            const fourDigitMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (fourDigitMatch) {
              const month = parseInt(fourDigitMatch[1]);
              const day = parseInt(fourDigitMatch[2]);
              const year = parseInt(fourDigitMatch[3]);
              const result = new Date(year, month - 1, day);
              if (index < 3) {
                console.log(`✓ ${fieldName}: "${trimmed}" → ${result.toLocaleDateString()}`);
              }
              return result;
            }
            
            // Fallback: Try standard parsing but fix 2-digit years
            const date = new Date(trimmed);
            if (!isNaN(date.getTime())) {
              // If year is before 2000, likely a 2-digit year parsing issue
              if (date.getFullYear() < 2000) {
                const currentYear = new Date().getFullYear();
                const century = Math.floor(currentYear / 100) * 100; // 2000
                const correctedYear = century + (date.getFullYear() % 100);
                const corrected = new Date(correctedYear, date.getMonth(), date.getDate());
                console.warn(`⚠️ ${fieldName}: "${trimmed}" parsed as ${date.getFullYear()}, corrected to ${correctedYear}`);
                return corrected;
              }
              return date;
            }
            
            console.warn(`❌ ${fieldName}: Could not parse "${trimmed}"`);
            return null;
          } catch (error) {
            console.error(`❌ ${fieldName}: Parse error for "${trimmed}":`, error);
            return null;
          }
        };

        const dateSubmitted = parseDate(record['Date Submitted'], 'Date Submitted');
        const orderDate = parseDate(record['Order Date'], 'Order Date');
        const reviewDate = parseDate(record['Review Date'], 'Review Date');

        const email = record['Email']?.trim() || null;
        const product = record['Product']?.trim() || null;
        const customerName = record['Customer Name']?.trim() || null;

        // Check for duplicates: Email + Product + Review Date
        if (email && product && reviewDate) {
          const existing = await prisma.task.findFirst({
            where: {
              taskType: 'YOTPO',
              yotpoEmail: email,
              yotpoProduct: product,
              yotpoReviewDate: reviewDate
            }
          });

          if (existing) {
            results.duplicates++;
            results.duplicateDetails.push({
              row: index + 1,
              email,
              product,
              reviewDate: reviewDate.toISOString(),
              originalTaskId: existing.id,
              originalCreatedAt: existing.createdAt
            });
            continue; // Skip this duplicate
          }
        }

        // Create Yotpo task
        const taskData = {
          taskType: 'YOTPO' as const,
          status: 'PENDING' as const,
          brand: 'Yotpo',
          
          // Map CSV columns to Yotpo fields
          yotpoDateSubmitted: dateSubmitted,
          yotpoPrOrYotpo: record['PRs or Yotpo?']?.trim() || null,
          yotpoCustomerName: customerName,
          yotpoEmail: email,
          yotpoOrderDate: orderDate,
          yotpoProduct: product,
          yotpoIssueTopic: record['Issue Topic']?.trim() || null,
          yotpoReviewDate: reviewDate,
          yotpoReview: record['Review']?.trim() || null,
          yotpoSfOrderLink: record['SF Order Referenced (link)']?.trim() || null,
          yotpoImportSource: 'CSV', // Track import source
          
          // For agent portal display
          text: customerName || email || 'Yotpo Request',
          email: email,
        };

        await prisma.task.create({
          data: taskData,
        });

        results.imported++;

        if (index < 3) {
          console.log(`✓ Row ${index + 1} imported:`, {
            customer: customerName,
            email,
            product,
            issueTopic: record['Issue Topic']
          });
        }

      } catch (error) {
        console.error(`❌ Error processing row ${index + 1}:`, error);
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
        duplicates: results.duplicates,
        filtered: 0,
        errors: results.errors,
        duplicateDetails: results.duplicateDetails.length > 0 ? results.duplicateDetails : null,
      },
    });

    console.log(`\n✅ Yotpo Import Complete:`);
    console.log(`   Imported: ${results.imported}`);
    console.log(`   Duplicates: ${results.duplicates}`);
    console.log(`   Errors: ${results.errors}`);

    return NextResponse.json({
      success: true,
      message: `Import completed: ${results.imported} imported, ${results.duplicates} duplicates skipped, ${results.errors} errors`,
      results: {
        imported: results.imported,
        duplicates: results.duplicates,
        errors: results.errors,
        totalRows: results.totalRows,
        errorDetails: results.errorDetails,
        duplicateDetails: results.duplicateDetails,
      },
    });

  } catch (error) {
    console.error("Yotpo CSV import error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to import CSV" 
      },
      { status: 500 }
    );
  }
}

