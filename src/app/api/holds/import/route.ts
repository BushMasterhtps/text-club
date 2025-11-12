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
    
    // Parse CSV - detect if it has headers or not
    let records;
    try {
      // First, try parsing with headers
      records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    console.log(`🚧 Importing ${records.length} holds records`);
    
    // Debug: Log available columns from first record
    if (records.length > 0) {
        console.log('📋 CSV Headers detected:', Object.keys(records[0]));
        console.log('📋 First record sample:', records[0]);
      }
    } catch (parseError) {
      // If parsing with headers fails, try without headers
      console.log('Parsing without headers...');
      records = parse(csvText, {
        columns: false,
        skip_empty_lines: true,
        trim: true,
      });
    }

    const results = {
      imported: 0,
      updated: 0,
      errors: 0,
      duplicates: 0,
      totalRows: records.length,
      errorDetails: [] as any[],
      duplicateDetails: [] as any[],
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
        // Parse fields - try multiple column name variations
        // The CSV parser uses the FIRST ROW as headers, so we need to handle various possible header names
        
        // Get all keys from the record to understand the structure
        const keys = Object.keys(record);
        
        // Column B: Order Date (2nd column, index 1)
        const orderDate = parseDate(
          record[keys[1]] || record['B'] || record['Order Date'] || record['order_date'] || 
          record['OrderDate'] || record['Date Added'] || ''
        );
        
        // Column C: Order Number (3rd column, index 2)
        const orderNumber = (
          record[keys[2]] || record['C'] || record['Order Number'] || record['order_number'] || 
          record['OrderNumber'] || ''
        ).toString().trim() || null;
        
        // Column D: Customer Email (4th column, index 3)
        const customerEmail = (
          record[keys[3]] || record['D'] || record['Customer Email'] || record['customer_email'] || 
          record['Email'] || record['email'] || ''
        ).toString().trim() || null;
        
        // Column E: Priority (5th column, index 4)
        const priorityRaw = record[keys[4]] || record['E'] || record['Priority'] || record['priority'] || '4';
        const priority = parseInt(priorityRaw.toString()) || 4;
        
        // Column F: Days in System (6th column, index 5)
        const daysInSystemRaw = record[keys[5]] || record['F'] || record['Days in System'] || record['days_in_system'] || '0';
        const daysInSystem = parseInt(daysInSystemRaw.toString()) || 0;
        
        // Debug log for first few records
        if (index < 3) {
          console.log(`Row ${index + 1}:`, {
            orderDate: orderDate?.toISOString().split('T')[0] || 'NULL',
            orderNumber: orderNumber || 'NULL',
            customerEmail: customerEmail || 'NULL',
            priority,
            daysInSystem
          });
        }
        
        // Skip rows with no order number (invalid data)
        if (!orderNumber) {
          console.warn(`Skipping row ${index + 1}: No order number provided`);
          results.errors++;
          results.errorDetails.push({
            row: index + 1,
            reason: 'No order number',
            data: record
          });
          continue;
        }
        
        // Generate customer name from email if not provided
        const customerName = customerEmail ? customerEmail.split('@')[0] : `Customer-${orderNumber || 'Unknown'}`;

        // Check for existing task by order number (DUPLICATE DETECTION)
        const existingTask = await prisma.task.findFirst({
            where: {
              taskType: 'HOLDS',
              holdsOrderNumber: orderNumber,
            },
          select: {
            id: true,
            status: true,
            holdsStatus: true,
            disposition: true,
            assignedTo: {
              select: {
                name: true,
                email: true
              }
            }
          }
          });

        // Calculate aging from order date (4+ days = escalated)
        const currentDate = new Date();
        const daysSinceOrder = orderDate ? Math.floor((currentDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
        
        // Determine initial queue based on age
        let initialQueue = 'Agent Research'; // Default starting queue
        if (daysSinceOrder >= 4) {
          initialQueue = 'Escalated Call 4+ Day'; // 4+ days = escalated
        }

        if (existingTask) {
          // DUPLICATE FOUND
          results.duplicates++;
          results.duplicateDetails.push({
            row: index + 1,
            orderNumber,
            customerEmail,
            existingTaskId: existingTask.id,
            existingStatus: existingTask.status,
            existingQueue: existingTask.holdsStatus,
            existingDisposition: existingTask.disposition,
            assignedTo: existingTask.assignedTo?.name || 'Unassigned'
          });
          console.log(`Duplicate found: Order ${orderNumber} already exists (${existingTask.status})`);
        } else {
          // Create new task
          // Initialize queue history timeline
          const queueHistory = [{
            queue: initialQueue,
            enteredAt: new Date().toISOString(),
            exitedAt: null,
            movedBy: 'System (CSV Import)',
            daysSinceOrder: daysSinceOrder
          }];

          const taskData = {
            taskType: 'HOLDS' as const,
            status: 'PENDING' as const,
            holdsOrderDate: orderDate,
            holdsOrderNumber: orderNumber,
            holdsCustomerEmail: customerEmail,
            holdsPriority: priority,
            holdsDaysInSystem: daysInSystem,
            holdsStatus: initialQueue,
            holdsQueueHistory: queueHistory,
            text: `Holds - ${customerName}`,
            brand: 'Holds', // Default brand for holds
          };

          await prisma.task.create({
            data: taskData,
          });
          results.imported++;
          console.log(`✅ Created holds task: ${orderNumber} → ${initialQueue} queue (${daysSinceOrder} days old)`);
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
        duplicates: results.duplicates,
        filtered: 0,
        errors: results.errors,
        duplicateDetails: results.duplicateDetails.length > 0 ? results.duplicateDetails : null,
      },
    });

    console.log(`✅ Holds import completed: ${results.imported} imported, ${results.duplicates} duplicates skipped, ${results.errors} errors`);

    return NextResponse.json({
      success: true,
      message: `Import completed: ${results.imported} imported, ${results.duplicates} duplicates skipped, ${results.errors} errors`,
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
