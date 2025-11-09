import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Raw Tasks Export API
 * Downloads CSV of raw task data filtered by agent, date range, task type, and disposition
 */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agentId');
    const taskType = searchParams.get('taskType');
    const disposition = searchParams.get('disposition');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    console.log('📥 Raw Tasks Export Request:', { agentId, taskType, disposition, startDate, endDate });

    if (!agentId || !taskType) {
      console.error('❌ Missing required parameters:', { agentId, taskType });
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Get agent info for filename
    const agent = await prisma.user.findUnique({
      where: { id: agentId },
      select: { name: true }
    });

    if (!agent) {
      console.error('❌ Agent not found:', agentId);
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    console.log('✅ Agent found:', agent.name);

    let csvData = '';
    const agentName = agent.name.replace(/\s+/g, '_');
    const dateStr = startDate && endDate ? `${startDate}_to_${endDate}` : 'all_time';
    
    console.log('📁 Preparing export for:', { agentName, taskType, dateStr });
    
    // Handle Trello separately (no task records, only trelloCompletions)
    if (taskType === 'TRELLO') {
      const trelloCompletions = await prisma.trelloCompletion.findMany({
        where: {
          userId: agentId,
          ...(startDate && endDate ? {
            date: {
              gte: new Date(startDate + 'T00:00:00Z'),
              lte: new Date(endDate + 'T23:59:59Z')
            }
          } : {})
        },
        orderBy: { date: 'asc' }
      });

      // CSV Header for Trello
      csvData = 'Date,Cards Completed,Note\n';

      console.log(`✅ Found ${trelloCompletions.length} Trello completions`);

      // CSV Rows
      for (const completion of trelloCompletions) {
        const date = completion.date.toISOString().split('T')[0];
        const note = (completion.note || '').replace(/"/g, '""'); // Escape quotes
        csvData += `"${date}","${completion.cardsCount}","${note}"\n`;
      }

      const filename = `Trello_${agentName}_${dateStr}.csv`;
      console.log(`📥 Downloading: ${filename}`);

      return new NextResponse(csvData, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    }

    // Handle portal tasks (TEXT_CLUB, WOD_IVCS, EMAIL_REQUESTS, YOTPO, HOLDS, etc.)
    console.log('🔍 Querying portal tasks with filters:', {
      assignedToId: agentId,
      taskType,
      status: 'COMPLETED',
      disposition: disposition || 'all',
      dateRange: startDate && endDate ? `${startDate} to ${endDate}` : 'all time'
    });

    const tasks = await prisma.task.findMany({
      where: {
        assignedToId: agentId, // Use the foreign key field, not the relation
        taskType: taskType,
        status: 'COMPLETED',
        ...(disposition ? { disposition } : {}),
        ...(startDate && endDate ? {
          endTime: {
            gte: new Date(startDate + 'T00:00:00Z'),
            lte: new Date(endDate + 'T23:59:59Z')
          }
        } : {
          endTime: { not: null }
        })
      },
      orderBy: { endTime: 'asc' },
      select: {
        id: true,
        taskType: true,
        status: true,
        disposition: true,
        // Basic fields
        text: true, // Customer message/request
        phone: true,
        email: true,
        brand: true,
        customerName: true,
        // Timing
        startTime: true,
        endTime: true,
        durationSec: true,
        createdAt: true,
        // Common fields
        sfCaseNumber: true,
        sfOrderNumber: true,
        assistanceNotes: true,
        // WOD/IVCS fields
        wodIvcsSource: true,
        documentNumber: true,
        purchaseDate: true,
        // Email Request fields
        emailRequestFor: true,
        details: true,
        salesforceCaseNumber: true,
        completionTime: true,
        // Standalone Refunds fields
        salesOrderId: true,
        orderDate: true,
        amountToBeRefunded: true,
        refundReason: true,
        paymentMethod: true,
        // Holds fields
        holdsOrderDate: true,
        holdsOrderNumber: true,
        holdsCustomerEmail: true,
        holdsPriority: true,
        holdsDaysInSystem: true,
        holdsStatus: true,
        // Yotpo fields
        yotpoDateSubmitted: true,
        yotpoPrOrYotpo: true,
        yotpoCustomerName: true,
        yotpoEmail: true,
        yotpoOrderDate: true,
        yotpoProduct: true,
        yotpoIssueTopic: true,
        yotpoReviewDate: true,
        yotpoReview: true,
        yotpoSfOrderLink: true,
      }
    });

    console.log(`✅ Found ${tasks.length} tasks`);

    // CSV Header (comprehensive for all task types)
    csvData = 'Task ID,Task Type,Disposition,Customer Name,Phone,Email,Brand,Customer Message,SF Case Number,SF Order Number,Start Time,End Time,Duration (seconds),Created Date,Purchase Date,Order Date,Holds Order Date,Yotpo Order Date,Holds Order Number,Holds Customer Email,Holds Priority,Holds Days In System,Holds Status,Yotpo Date Submitted,Yotpo PR/Yotpo,Yotpo Customer Name,Yotpo Email,Yotpo Product,Yotpo Issue Topic,Yotpo Review Date,Yotpo Review,Yotpo SF Order Link,Email Request For,Details,Assistance Notes,Payment Method,Refund Reason,Amount To Be Refunded\n';

    // CSV Rows
    for (const task of tasks) {
      const startTime = task.startTime ? task.startTime.toISOString() : '';
      const endTime = task.endTime ? task.endTime.toISOString() : '';
      const duration = task.durationSec || (task.startTime && task.endTime 
        ? Math.floor((task.endTime.getTime() - task.startTime.getTime()) / 1000)
        : 0);
      const createdAt = task.createdAt.toISOString();
      
      // Date formatting helper
      const formatDate = (date: any) => date ? new Date(date).toISOString().split('T')[0] : '';

      // Escape fields that might contain commas or quotes
      const escape = (val: any) => {
        if (val === null || val === undefined) return '';
        const str = String(val).replace(/"/g, '""'); // Escape quotes
        return `"${str}"`;
      };

      csvData += [
        escape(task.id),
        escape(task.taskType),
        escape(task.disposition || ''),
        escape(task.customerName || ''),
        escape(task.phone || ''),
        escape(task.email || ''),
        escape(task.brand || ''),
        escape(task.text || ''),
        escape(task.sfCaseNumber || ''),
        escape(task.sfOrderNumber || ''),
        escape(startTime),
        escape(endTime),
        escape(duration),
        escape(createdAt),
        escape(formatDate(task.purchaseDate)),
        escape(formatDate(task.orderDate)),
        escape(formatDate(task.holdsOrderDate)),
        escape(formatDate(task.yotpoOrderDate)),
        escape(task.holdsOrderNumber || ''),
        escape(task.holdsCustomerEmail || ''),
        escape(task.holdsPriority || ''),
        escape(task.holdsDaysInSystem || ''),
        escape(task.holdsStatus || ''),
        escape(formatDate(task.yotpoDateSubmitted)),
        escape(task.yotpoPrOrYotpo || ''),
        escape(task.yotpoCustomerName || ''),
        escape(task.yotpoEmail || ''),
        escape(task.yotpoProduct || ''),
        escape(task.yotpoIssueTopic || ''),
        escape(formatDate(task.yotpoReviewDate)),
        escape(task.yotpoReview || ''),
        escape(task.yotpoSfOrderLink || ''),
        escape(task.emailRequestFor || ''),
        escape(task.details || ''),
        escape(task.assistanceNotes || ''),
        escape(task.paymentMethod || ''),
        escape(task.refundReason || ''),
        escape(task.amountToBeRefunded?.toString() || '')
      ].join(',') + '\n';
    }

    const taskTypeName = taskType.replace('_', '-');
    const dispositionStr = disposition ? `_${disposition.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
    const filename = `${taskTypeName}${dispositionStr}_${agentName}_${dateStr}.csv`;

    console.log(`📥 Downloading: ${filename} (${tasks.length} tasks, ${csvData.length} bytes)`);

    return new NextResponse(csvData, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });

  } catch (error) {
    console.error('❌ Error exporting raw tasks:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error details:', errorMessage);
    return NextResponse.json(
      { 
        error: 'Failed to export data',
        details: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

