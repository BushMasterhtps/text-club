import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateFinancialImpact } from "@/lib/wod-ivcs-disposition-impact";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const agentFilter = searchParams.get('agentFilter');
    const dispositionFilter = searchParams.get('dispositionFilter');

    // Parse dates with proper timezone handling
    let dateStart: Date;
    let dateEnd: Date;
    
    if (startDate && endDate) {
      // Parse dates as local timezone
      const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
      
      if (isNaN(startYear) || isNaN(startMonth) || isNaN(startDay) || 
          isNaN(endYear) || isNaN(endMonth) || isNaN(endDay)) {
        return NextResponse.json({ success: false, error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 });
      }
      
      dateStart = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
      dateEnd = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);
    } else {
      // Default to today
      const today = new Date();
      dateStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      dateEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    }

    // Convert to UTC for database queries to avoid timezone issues
    const utcDateStart = new Date(dateStart.getTime() - dateStart.getTimezoneOffset() * 60000);
    const utcDateEnd = new Date(dateEnd.getTime() - dateEnd.getTimezoneOffset() * 60000);

    // Build where clause for WOD/IVCS tasks
    const where: any = {
      taskType: "WOD_IVCS",
      OR: [
        { status: "COMPLETED" },
        { 
          status: "PENDING",
          sentBackBy: { not: null },
          endTime: { not: null }
        }
      ],
      endTime: {
        gte: utcDateStart,
        lte: utcDateEnd
      }
    };

    // Apply agent filter
    if (agentFilter && agentFilter !== 'all') {
      where.OR = [
        { assignedToId: agentFilter },
        { sentBackBy: agentFilter }
      ];
    }

    // Apply disposition filter
    if (dispositionFilter && dispositionFilter !== 'all') {
      where.disposition = dispositionFilter;
    }

    // Get ALL completed tasks without pagination limits
    const completedTasks = await prisma.task.findMany({
      where,
      select: {
        id: true,
        endTime: true,
        durationSec: true,
        disposition: true,
        assignedTo: {
          select: {
            name: true,
            email: true
          }
        },
        sentBackByUser: {
          select: {
            name: true,
            email: true
          }
        },
        wodIvcsSource: true,
        documentNumber: true,
        webOrder: true,
        customerName: true,
        amount: true,
        webOrderDifference: true,
        purchaseDate: true,
        sentBackBy: true,
        brand: true
      },
      orderBy: { endTime: "desc" }
      // No take/skip limits - get ALL data
    });

    // Format completed work data for CSV with financial impact
    const csvData = completedTasks.map(task => {
      const amount = task.amount ? Number(task.amount) : 0;
      const { savedAmount, lostAmount, netAmount } = calculateFinancialImpact(task.disposition, amount);
      
      return {
        'Task ID': task.id,
        'Completed Date': task.endTime ? new Date(task.endTime).toLocaleDateString() : 'N/A',
        'Duration': task.durationSec ? `${Math.floor(task.durationSec / 60)}:${(task.durationSec % 60).toString().padStart(2, '0')}` : 'N/A',
        'Disposition': task.disposition || 'Unknown',
        'Agent': (task.assignedTo?.name || task.sentBackByUser?.name) || 'Unassigned',
        'Source': task.wodIvcsSource || 'Unknown',
        'Brand': task.brand || 'Unknown',
        'Document Number': task.documentNumber || 'N/A',
        'Web Order': task.webOrder || 'N/A',
        'Customer': task.customerName || 'N/A',
        'Amount': task.amount ? Number(task.amount).toFixed(2) : '0.00',
        'Amount Saved': savedAmount.toFixed(2),
        'Amount Lost': lostAmount.toFixed(2),
        'Net Amount': netAmount.toFixed(2),
        'Difference': task.webOrderDifference ? Number(task.webOrderDifference).toFixed(2) : '0.00',
        'Order Date': task.purchaseDate ? new Date(task.purchaseDate).toLocaleDateString() : 'N/A'
      };
    });

    // Convert to CSV format
    if (csvData.length === 0) {
      return NextResponse.json({ success: false, error: "No data found for the selected criteria" }, { status: 404 });
    }

    const headers = Object.keys(csvData[0]);
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => 
        headers.map(header => {
          const value = row[header as keyof typeof row];
          // Escape quotes and wrap in quotes
          return `"${String(value).replace(/"/g, '""')}"`;
        }).join(',')
      )
    ].join('\n');

    // Return CSV content
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="wod-ivcs-analytics-${startDate}-to-${endDate}.csv"`
      }
    });

  } catch (error) {
    console.error('WOD/IVCS Analytics Export API Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to export analytics data'
    }, { status: 500 });
  }
}
