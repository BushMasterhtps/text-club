import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const comparePeriod = searchParams.get('comparePeriod') || 'none';

    // Parse dates
    const start = startDate ? new Date(startDate + 'T00:00:00') : new Date();
    const end = endDate ? new Date(endDate + 'T23:59:59') : new Date();
    
    // Calculate comparison period dates
    let comparisonStart = new Date(0);
    let comparisonEnd = new Date(0);
    
    if (comparePeriod === 'previous') {
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      comparisonEnd = new Date(start.getTime() - 1);
      comparisonStart = new Date(comparisonEnd.getTime() - (daysDiff * 24 * 60 * 60 * 1000));
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

    // Calculate KPIs for current period
    const currentCompleted = currentPeriodTasks.filter(task => task.status === 'COMPLETED').length;
    const currentUnableToComplete = currentPeriodTasks.filter(task => task.status === 'UNABLE_TO_COMPLETE').length;
    const currentTotal = currentPeriodTasks.length;
    const currentCompletionRate = currentTotal > 0 ? (currentCompleted / currentTotal) * 100 : 0;
    
    // Calculate average duration for completed tasks
    const completedTasks = currentPeriodTasks.filter(task => task.status === 'COMPLETED' && task.durationSec);
    const avgDuration = completedTasks.length > 0 
      ? completedTasks.reduce((sum, task) => sum + (task.durationSec || 0), 0) / completedTasks.length 
      : 0;

    // Calculate comparison KPIs
    const comparisonCompleted = comparisonPeriodTasks.filter(task => task.status === 'COMPLETED').length;
    const comparisonTotal = comparisonPeriodTasks.length;
    const comparisonCompletionRate = comparisonTotal > 0 ? (comparisonCompleted / comparisonTotal) * 100 : 0;
    
    const comparisonCompletedTasks = comparisonPeriodTasks.filter(task => task.status === 'COMPLETED' && task.durationSec);
    const comparisonAvgDuration = comparisonCompletedTasks.length > 0 
      ? comparisonCompletedTasks.reduce((sum, task) => sum + (task.durationSec || 0), 0) / comparisonCompletedTasks.length 
      : 0;

    // Calculate trends
    const completedVsPrevious = comparisonTotal > 0 ? ((currentCompleted - comparisonCompleted) / comparisonCompleted) * 100 : 0;
    const completionRateChange = comparisonCompletionRate > 0 ? currentCompletionRate - comparisonCompletionRate : 0;
    const durationChange = comparisonAvgDuration > 0 ? ((avgDuration - comparisonAvgDuration) / comparisonAvgDuration) * 100 : 0;

    // Generate monthly trends data
    const monthlyTrends = [];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    for (let i = 0; i < 12; i++) {
      const monthStart = new Date(start.getFullYear(), i, 1);
      const monthEnd = new Date(start.getFullYear(), i + 1, 0, 23, 59, 59);
      
      const monthTasks = currentPeriodTasks.filter(task => 
        task.createdAt >= monthStart && task.createdAt <= monthEnd
      );
      
      monthlyTrends.push({
        month: months[i],
        completed: monthTasks.filter(task => task.status === 'COMPLETED').length,
        unableToComplete: monthTasks.filter(task => task.status === 'UNABLE_TO_COMPLETE').length
      });
    }

    // Generate disposition breakdown
    const dispositionBreakdown = {
      labels: ['Completed', 'Unable to Complete', 'Pending'],
      data: [
        currentCompleted,
        currentUnableToComplete,
        currentTotal - currentCompleted - currentUnableToComplete
      ]
    };

    // Generate unable to complete breakdown
    const unableToCompleteBreakdown = currentPeriodTasks
      .filter(task => task.status === 'UNABLE_TO_COMPLETE')
      .reduce((acc, task) => {
        const disposition = task.disposition || 'Unknown';
        acc[disposition] = (acc[disposition] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    // Prepare email details for export
    const emailDetails = currentPeriodTasks.map(task => ({
      id: task.id,
      status: task.status,
      disposition: task.disposition,
      emailRequestFor: task.emailRequestFor,
      details: task.details,
      salesforceCaseNumber: task.salesforceCaseNumber,
      assignedTo: task.assignedTo?.name || 'Unassigned',
      createdAt: task.createdAt,
      completedAt: task.endTime,
      duration: task.durationSec ? Math.round(task.durationSec / 60) : null // Convert to minutes
    }));

    // Generate trend data for charts
    const trendData = {
      labels: monthlyTrends.map(t => t.month),
      completed: monthlyTrends.map(t => t.completed),
      unable: monthlyTrends.map(t => t.unableToComplete),
      previousCompleted: [], // Will be populated if comparison period has data
      previousUnable: [] // Will be populated if comparison period has data
    };

    // Generate previous period trend data if comparison period is valid
    if (comparePeriod === 'previous' && comparisonStart.getTime() > 0) {
      const previousMonthlyTrends = [];
      for (let i = 0; i < 12; i++) {
        const monthStart = new Date(comparisonStart.getFullYear(), i, 1);
        const monthEnd = new Date(comparisonStart.getFullYear(), i + 1, 0, 23, 59, 59);
        
        const monthTasks = comparisonPeriodTasks.filter(task => 
          task.createdAt >= monthStart && task.createdAt <= monthEnd
        );
        
        previousMonthlyTrends.push({
          month: months[i],
          completed: monthTasks.filter(task => task.status === 'COMPLETED').length,
          unableToComplete: monthTasks.filter(task => task.status === 'UNABLE_TO_COMPLETE').length
        });
      }
      
      trendData.previousCompleted = previousMonthlyTrends.map(t => t.completed);
      trendData.previousUnable = previousMonthlyTrends.map(t => t.unableToComplete);
    }

    const analytics = {
      summary: {
        totalCompleted: currentCompleted,
        completionRate: Math.round(currentCompletionRate * 100) / 100,
        avgDuration: Math.round(avgDuration / 60), // Convert to minutes
        unableToComplete: currentUnableToComplete,
        completedTrend: { 
          change: currentCompleted - comparisonCompleted, 
          percentage: completedVsPrevious 
        },
        completionRateTrend: { 
          change: currentCompletionRate - comparisonCompletionRate, 
          percentage: completionRateChange 
        },
        durationTrend: { 
          change: avgDuration - comparisonAvgDuration, 
          percentage: durationChange 
        },
        unableTrend: { 
          change: currentUnableToComplete - (comparisonPeriodTasks.filter(task => task.status === 'UNABLE_TO_COMPLETE').length), 
          percentage: 0 // Calculate if needed
        }
      },
      comparison: {
        completedChange: Math.round(completedVsPrevious * 100) / 100,
        completionRateChange: Math.round(completionRateChange * 100) / 100,
        durationChange: Math.round(durationChange * 100) / 100
      },
      charts: {
        trend: trendData,
        dispositions: dispositionBreakdown
      },
      emailDetails: emailDetails.map(task => ({
        taskId: task.id,
        sfOrderNumber: task.salesforceCaseNumber || '',
        email: task.assignedTo || '',
        disposition: task.disposition || '',
        notes: task.details || '',
        createdAt: task.createdAt.toISOString(),
        duration: task.duration,
        startTime: null, // Not available in current data
        endTime: task.completedAt?.toISOString() || null
      }))
    };

    return NextResponse.json({ success: true, analytics });
  } catch (error) {
    console.error('Error fetching email requests analytics:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
