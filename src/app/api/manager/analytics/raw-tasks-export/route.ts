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
      assignedTo: agentId,
      taskType,
      status: 'COMPLETED',
      disposition: disposition || 'all',
      dateRange: startDate && endDate ? `${startDate} to ${endDate}` : 'all time'
    });

    const tasks = await prisma.task.findMany({
      where: {
        assignedTo: agentId,
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
        incomingMessage: true,
        customerName: true,
        customerPhone: true,
        customerEmail: true,
        orderNumber: true,
        orderDate: true,
        startTime: true,
        endTime: true,
        sfCaseNumber: true,
        createdAt: true,
        // Task-type specific fields
        productName: true, // YOTPO
        issueTopic: true, // YOTPO
        reviewText: true, // YOTPO
        reviewDate: true, // YOTPO
        prOrYotpo: true, // YOTPO
        priority: true, // HOLDS
        daysInSystem: true, // HOLDS
      }
    });

    console.log(`✅ Found ${tasks.length} tasks`);

    // CSV Header (comprehensive for all task types)
    csvData = 'Task ID,Task Type,Disposition,Customer Name,Phone,Email,Order Number,Order Date,Created Date,Start Time,End Time,Duration (seconds),SF Case Number,Incoming Message,Product,Issue Topic,Review Text,Review Date,PR/Yotpo,Priority,Days In System\n';

    // CSV Rows
    for (const task of tasks) {
      const startTime = task.startTime ? task.startTime.toISOString() : '';
      const endTime = task.endTime ? task.endTime.toISOString() : '';
      const duration = task.startTime && task.endTime 
        ? Math.floor((task.endTime.getTime() - task.startTime.getTime()) / 1000)
        : 0;
      const createdAt = task.createdAt.toISOString();
      const orderDate = task.orderDate ? task.orderDate.toISOString().split('T')[0] : '';
      const reviewDate = task.reviewDate ? task.reviewDate.toISOString().split('T')[0] : '';

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
        escape(task.customerPhone || ''),
        escape(task.customerEmail || ''),
        escape(task.orderNumber || ''),
        escape(orderDate),
        escape(createdAt),
        escape(startTime),
        escape(endTime),
        escape(duration),
        escape(task.sfCaseNumber || ''),
        escape(task.incomingMessage || ''),
        escape(task.productName || ''),
        escape(task.issueTopic || ''),
        escape(task.reviewText || ''),
        escape(reviewDate),
        escape(task.prOrYotpo || ''),
        escape(task.priority || ''),
        escape(task.daysInSystem || '')
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

