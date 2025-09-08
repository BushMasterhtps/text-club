import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const comparePeriod = searchParams.get('comparePeriod') || 'previous';

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Start date and end date are required' }, { status: 400 });
    }

    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');

    // Calculate comparison period dates
    let comparisonStart: Date;
    let comparisonEnd: Date;
    const periodLength = end.getTime() - start.getTime();

    if (comparePeriod === 'previous') {
      comparisonEnd = new Date(start.getTime() - 1);
      comparisonStart = new Date(comparisonEnd.getTime() - periodLength);
    } else if (comparePeriod === 'same-last-year') {
      comparisonStart = new Date(start.getFullYear() - 1, start.getMonth(), start.getDate());
      comparisonEnd = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate());
    } else {
      // No comparison
      comparisonStart = new Date(0);
      comparisonEnd = new Date(0);
    }

    // Get current period data
    const currentPeriodTasks = await prisma.task.findMany({
      where: {
        taskType: 'EMAIL_REQUESTS',
        createdAt: {
          gte: start,
          lte: end
        }
      },
      select: {
        id: true,
        status: true,
        disposition: true,
        startTime: true,
        endTime: true,
        durationSec: true,
        createdAt: true,
        salesforceCaseNumber: true,
        emailRequestFor: true,
        details: true,
        assignedTo: {
          select: {
            email: true,
            name: true
          }
        }
      }
    });

    // Get comparison period data
    const comparisonPeriodTasks = await prisma.task.findMany({
      where: {
        taskType: 'EMAIL_REQUESTS',
        createdAt: {
          gte: comparisonStart,
          lte: comparisonEnd
        }
      },
      select: {
        id: true,
        status: true,
        disposition: true,
        startTime: true,
        endTime: true,
        durationSec: true,
        createdAt: true
      }
    });

    // Calculate summary metrics
    const completedTasks = currentPeriodTasks.filter(task => task.status === 'COMPLETED');
    const unableToCompleteTasks = currentPeriodTasks.filter(task => 
      task.disposition && task.disposition.toLowerCase().includes('unable')
    );

    const totalCompleted = completedTasks.length;
    const unableToComplete = unableToCompleteTasks.length;
    const totalTasks = currentPeriodTasks.length;
    const completionRate = totalTasks > 0 ? (totalCompleted / totalTasks) * 100 : 0;

    // Calculate average duration
    const tasksWithDuration = completedTasks.filter(task => task.durationSec && task.durationSec > 0);
    const avgDuration = tasksWithDuration.length > 0 
      ? tasksWithDuration.reduce((sum, task) => sum + (task.durationSec || 0), 0) / tasksWithDuration.length / 60
      : 0;

    // Calculate comparison metrics
    const comparisonCompleted = comparisonPeriodTasks.filter(task => task.status === 'COMPLETED').length;
    const comparisonUnable = comparisonPeriodTasks.filter(task => 
      task.disposition && task.disposition.toLowerCase().includes('unable')
    ).length;
    const comparisonTotal = comparisonPeriodTasks.length;
    const comparisonCompletionRate = comparisonTotal > 0 ? (comparisonCompleted / comparisonTotal) * 100 : 0;

    const comparisonTasksWithDuration = comparisonPeriodTasks.filter(task => 
      task.status === 'COMPLETED' && task.durationSec && task.durationSec > 0
    );
    const comparisonAvgDuration = comparisonTasksWithDuration.length > 0 
      ? comparisonTasksWithDuration.reduce((sum, task) => sum + (task.durationSec || 0), 0) / comparisonTasksWithDuration.length / 60
      : 0;

    // Calculate trends
    const completedChange = totalCompleted - comparisonCompleted;
    const completionRateChange = completionRate - comparisonCompletionRate;
    const durationChange = avgDuration - comparisonAvgDuration;
    const unableChange = unableToComplete - comparisonUnable;

    // Generate monthly trend data
    const trendData = generateMonthlyTrendData(currentPeriodTasks, comparisonPeriodTasks, start, end);

    // Generate disposition breakdown
    const dispositionData = generateDispositionBreakdown(currentPeriodTasks);

    // Prepare email details for table
    const emailDetails = currentPeriodTasks.map(task => ({
      taskId: task.id,
      sfOrderNumber: task.salesforceCaseNumber || 'N/A',
      email: task.assignedTo?.email || 'Unassigned',
      disposition: task.disposition || 'Pending',
      notes: task.details || '',
      createdAt: task.createdAt,
      duration: task.durationSec ? Math.round(task.durationSec / 60) : null,
      startTime: task.startTime,
      endTime: task.endTime
    }));

    const analytics = {
      summary: {
        totalCompleted,
        completionRate,
        avgDuration: Math.round(avgDuration),
        unableToComplete,
        completedTrend: {
          change: completedChange,
          percentage: comparisonCompleted > 0 ? (completedChange / comparisonCompleted) * 100 : 0
        },
        completionRateTrend: {
          change: completionRateChange,
          percentage: comparisonCompletionRate > 0 ? (completionRateChange / comparisonCompletionRate) * 100 : 0
        },
        durationTrend: {
          change: durationChange,
          percentage: comparisonAvgDuration > 0 ? (durationChange / comparisonAvgDuration) * 100 : 0
        },
        unableTrend: {
          change: unableChange,
          percentage: comparisonUnable > 0 ? (unableChange / comparisonUnable) * 100 : 0
        }
      },
      comparison: {
        completedChange,
        completionRateChange,
        durationChange
      },
      charts: {
        trend: trendData,
        dispositions: dispositionData
      },
      emailDetails
    };

    return NextResponse.json({ success: true, analytics });

  } catch (error) {
    console.error('Error fetching email requests analytics:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics data' }, { status: 500 });
  }
}

function generateMonthlyTrendData(currentTasks: any[], comparisonTasks: any[], start: Date, end: Date) {
  const labels: string[] = [];
  const completed: number[] = [];
  const unable: number[] = [];
  const previousCompleted: number[] = [];
  const previousUnable: number[] = [];

  // Generate daily data points
  const current = new Date(start);
  while (current <= end) {
    const dayStart = new Date(current);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(current);
    dayEnd.setHours(23, 59, 59, 999);

    // Current period data
    const dayTasks = currentTasks.filter(task => 
      task.createdAt >= dayStart && task.createdAt <= dayEnd
    );
    const dayCompleted = dayTasks.filter(task => task.status === 'COMPLETED').length;
    const dayUnable = dayTasks.filter(task => 
      task.disposition && task.disposition.toLowerCase().includes('unable')
    ).length;

    // Comparison period data (same day of week, previous period)
    const comparisonDayStart = new Date(dayStart);
    comparisonDayStart.setDate(comparisonDayStart.getDate() - 7); // Previous week
    const comparisonDayEnd = new Date(dayEnd);
    comparisonDayEnd.setDate(comparisonDayEnd.getDate() - 7);

    const comparisonDayTasks = comparisonTasks.filter(task => 
      task.createdAt >= comparisonDayStart && task.createdAt <= comparisonDayEnd
    );
    const comparisonDayCompleted = comparisonDayTasks.filter(task => task.status === 'COMPLETED').length;
    const comparisonDayUnable = comparisonDayTasks.filter(task => 
      task.disposition && task.disposition.toLowerCase().includes('unable')
    ).length;

    labels.push(current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    completed.push(dayCompleted);
    unable.push(dayUnable);
    previousCompleted.push(comparisonDayCompleted);
    previousUnable.push(comparisonDayUnable);

    current.setDate(current.getDate() + 1);
  }

  return {
    labels,
    completed,
    unable,
    previousCompleted,
    previousUnable
  };
}

function generateDispositionBreakdown(tasks: any[]) {
  const dispositionCounts: { [key: string]: number } = {};

  tasks.forEach(task => {
    const disposition = task.disposition || 'Pending';
    dispositionCounts[disposition] = (dispositionCounts[disposition] || 0) + 1;
  });

  const labels = Object.keys(dispositionCounts);
  const data = Object.values(dispositionCounts);

  return {
    labels,
    data
  };
}
