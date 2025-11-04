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
        const parseDate = (dateStr: string | undefined): Date | null => {
          if (!dateStr) return null;
          try {
            // Handle MM/DD/YY format (2-digit year)
            const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
            if (match) {
              const month = parseInt(match[1]);
              const day = parseInt(match[2]);
              let year = parseInt(match[3]);
              
              // Convert 2-digit year to 4-digit (25 → 2025, 69 → 2069 or 1969?)
              // Assume years 00-50 are 2000-2050, 51-99 are 1951-1999
              if (year <= 50) {
                year += 2000;
              } else {
                year += 1900;
              }
              
              return new Date(year, month - 1, day);
            }
            
            // Try standard date parsing
            const date = new Date(dateStr);
            
            // Check if date is unreasonably old (before 2020)
            if (!isNaN(date.getTime())) {
              if (date.getFullYear() < 2020) {
                console.warn(`Suspicious old date: ${dateStr} → ${date.toISOString()}`);
              }
              return date;
            }
            
            return null;
          } catch {
            return null;
          }
        };

        const dateSubmitted = parseDate(record['Date Submitted']);
        const orderDate = parseDate(record['Order Date']);
        const reviewDate = parseDate(record['Review Date']);

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

