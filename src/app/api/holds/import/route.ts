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

    console.log(`🚧 Importing ${records.length} holds records`);
    
    // Debug: Log available columns from first record
    if (records.length > 0) {
      console.log('📋 Available columns:', Object.keys(records[0]));
    }

    const results = {
      imported: 0,
      updated: 0,
      errors: 0,
      totalRows: records.length,
      errorDetails: [] as any[],
    };

    // Create import session record
    const importSession = await prisma.importSession.create({
      data: {
        source: 'HOLDS_CSV',
        fileName: file.name,
        importedBy: 'system', // TODO: Get from auth
        taskType: 'HOLDS',
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
        // Parse order date (Column A)
        const orderDate = parseDate(record['Order Date'] || record['A'] || record['order_date']);
        
        // Parse order number (Column B)
        const orderNumber = record['Order Number'] || record['B'] || record['order_number'] || null;
        
        // Parse customer email (Column C)
        const customerEmail = record['Customer Email'] || record['C'] || record['customer_email'] || null;
        
        // Parse priority (Column D - values 4-5)
        const priority = parseInt(record['Priority'] || record['D'] || record['priority'] || '4');
        
        // Parse days in system (Column E - calculated field)
        const daysInSystem = parseInt(record['Days in System'] || record['E'] || record['days_in_system'] || '0');
        
        // Generate customer name from email if not provided
        const customerName = customerEmail ? customerEmail.split('@')[0] : `Customer-${orderNumber || 'Unknown'}`;

        // Check for existing task by order number
        let existingTask = null;
        if (orderNumber) {
          existingTask = await prisma.task.findFirst({
            where: {
              taskType: 'HOLDS',
              holdsOrderNumber: orderNumber,
            },
          });
        }

        // Calculate 5-day aging from order date
        const currentDate = new Date();
        const daysSinceOrder = orderDate ? Math.floor((currentDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
        
        // Determine initial status based on age and priority
        let initialStatus = 'Agent Research'; // Default starting status
        if (daysSinceOrder >= 5) {
          initialStatus = 'Escalated Call'; // 5+ days = escalated
        } else if (daysSinceOrder >= 2) {
          initialStatus = 'Customer Contact'; // 2+ days = customer contact
        }

        if (existingTask) {
          // Update existing task
          await prisma.task.update({
            where: { id: existingTask.id },
            data: {
              holdsOrderDate: orderDate,
              holdsPriority: priority,
              holdsDaysInSystem: daysInSystem,
              holdsStatus: initialStatus,
              holdsCustomerEmail: customerEmail,
              holdsOrderNumber: orderNumber,
              // Update text to show it was updated
              text: `Holds - ${customerName} (Updated)`,
              // Keep track of update
              updatedAt: new Date(),
            },
          });
          results.updated++;
        } else {
          // Create new task
          const taskData = {
            taskType: 'HOLDS' as const,
            status: 'PENDING' as const,
            holdsOrderDate: orderDate,
            holdsPriority: priority,
            holdsDaysInSystem: daysInSystem,
            holdsStatus: initialStatus,
            holdsCustomerEmail: customerEmail,
            holdsOrderNumber: orderNumber,
            text: `Holds - ${customerName}`,
            brand: 'Holds', // Default brand for holds
          };

          await prisma.task.create({
            data: taskData,
          });
          results.imported++;
        }
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
        duplicates: results.updated, // Count updates as "duplicates" for reporting
        filtered: 0,
        errors: results.errors,
      },
    });

    console.log(`✅ Holds import completed: ${results.imported} imported, ${results.updated} updated, ${results.errors} errors`);

    return NextResponse.json({
      success: true,
      message: `Import completed: ${results.imported} imported, ${results.updated} updated, ${results.errors} errors`,
      results,
    });

  } catch (error) {
    console.error("Holds CSV import error:", error);
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
    // Handle various date formats
    let date: Date;
    
    // Try parsing as-is first
    date = new Date(dateString);
    
    // If that fails, try common formats
    if (isNaN(date.getTime())) {
      // Try MM/DD/YYYY format
      const parts = dateString.split('/');
      if (parts.length === 3) {
        date = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
      }
    }
    
    // If still invalid, try YYYY-MM-DD format
    if (isNaN(date.getTime())) {
      date = new Date(dateString.replace(/(\d{4})-(\d{2})-(\d{2})/, '$1-$2-$3'));
    }
    
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
