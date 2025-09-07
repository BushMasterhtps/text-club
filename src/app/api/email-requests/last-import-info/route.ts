import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Get the most recent EMAIL_REQUESTS task to determine last import info
    const lastTask = await prisma.task.findFirst({
      where: {
        taskType: 'EMAIL_REQUESTS'
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        createdAt: true,
        salesforceCaseNumber: true,
        emailRequestFor: true
      }
    });

    // Get total count of EMAIL_REQUESTS tasks
    const totalImported = await prisma.task.count({
      where: {
        taskType: 'EMAIL_REQUESTS'
      }
    });

    const data = {
      lastImportTime: lastTask?.createdAt || null,
      lastRowNumber: totalImported, // This would be more sophisticated in a real implementation
      totalImported,
      lastTaskInfo: lastTask ? {
        salesforceCaseNumber: lastTask.salesforceCaseNumber,
        emailRequestFor: lastTask.emailRequestFor
      } : null
    };

    return NextResponse.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Error fetching last import info:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch last import info' },
      { status: 500 }
    );
  }
}
