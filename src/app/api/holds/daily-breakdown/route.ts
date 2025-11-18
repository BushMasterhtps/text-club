import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * API for Daily Breakdown of Holds Tasks
 * Calculates end of day snapshots (5 PM PST) and shows:
 * - Queue counts at end of day
 * - Tasks completed that day
 * - Tasks that rolled over (moved between queues but not completed)
 * - New tasks added that day
 */

// Helper to get 5 PM PST for a given date
function getEndOfDayPST(date: Date): Date {
  const pstDate = new Date(date);
  pstDate.setUTCHours(17, 0, 0, 0); // 5 PM PST = 17:00 UTC (PST is UTC-8, but we want 5 PM local)
  // Actually, PST is UTC-8, so 5 PM PST = 1 AM UTC next day
  // Let's adjust: 5 PM PST = 17:00 PST = 17:00 + 8 = 01:00 UTC next day
  // But for simplicity, let's use 5 PM in the date's timezone
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  return new Date(Date.UTC(year, month, day, 1, 0, 0, 0)); // 5 PM PST = 1 AM UTC next day
}

// Helper to get start of day PST (midnight PST)
function getStartOfDayPST(date: Date): Date {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  // Midnight PST = 8 AM UTC (PST is UTC-8)
  return new Date(Date.UTC(year, month, day, 8, 0, 0, 0));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Get date range (default to last 30 days if not provided)
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const specificDate = searchParams.get('date'); // For viewing a specific day
    
    let startDate: Date;
    let endDate: Date;
    
    if (specificDate) {
      // View specific date
      const date = new Date(specificDate);
      startDate = getStartOfDayPST(date);
      endDate = getEndOfDayPST(date);
    } else if (startDateParam && endDateParam) {
      startDate = getStartOfDayPST(new Date(startDateParam));
      endDate = getEndOfDayPST(new Date(endDateParam));
    } else {
      // Default to last 30 days
      endDate = getEndOfDayPST(new Date());
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 30);
      startDate = getStartOfDayPST(startDate);
    }
    
    const includeTaskDetails = searchParams.get('includeTasks') === 'true';
    
    // Get all Holds tasks that existed during this period
    const allTasks = await prisma.task.findMany({
      where: {
        taskType: 'HOLDS',
        createdAt: {
          lte: endDate
        }
      },
      select: {
        id: true,
        holdsOrderNumber: true,
        holdsCustomerEmail: true,
        holdsStatus: true,
        holdsQueueHistory: true,
        status: true,
        disposition: true,
        createdAt: true,
        endTime: true,
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    // Generate daily breakdowns
    const dailyBreakdowns: any[] = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const dayStart = getStartOfDayPST(currentDate);
      const dayEnd = getEndOfDayPST(currentDate);
      const nextDayStart = new Date(dayStart);
      nextDayStart.setDate(nextDayStart.getDate() + 1);
      
      // Tasks that existed at start of day (created before day start)
      const tasksAtStart = allTasks.filter(t => 
        new Date(t.createdAt) < dayStart
      );
      
      // Tasks created during this day
      const newTasks = allTasks.filter(t => {
        const created = new Date(t.createdAt);
        return created >= dayStart && created < dayEnd;
      });
      
      // Tasks completed during this day
      const completedTasks = allTasks.filter(t => {
        if (!t.endTime) return false;
        const completed = new Date(t.endTime);
        return completed >= dayStart && completed < dayEnd;
      });
      
      // Calculate queue counts at end of day (5 PM PST)
      // For each task, determine its queue status at end of day
      const queueCountsAtEndOfDay: Record<string, number> = {};
      const tasksInQueueAtEndOfDay: Record<string, any[]> = {};
      
      // Combine tasks at start and new tasks to get all tasks that existed during the day
      const allTasksForDay = [...tasksAtStart, ...newTasks];
      
      allTasksForDay.forEach(task => {
        // Skip if task was completed before end of day
        if (task.endTime && new Date(task.endTime) < dayEnd) {
          return;
        }
        
        // Determine queue at end of day based on queue history
        let queueAtEndOfDay = task.holdsStatus || 'Unknown';
        
        if (task.holdsQueueHistory && Array.isArray(task.holdsQueueHistory)) {
          // Find the last queue entry before or at end of day
          const relevantHistory = task.holdsQueueHistory
            .filter((entry: any) => {
              if (!entry.enteredAt) return false;
              const entered = new Date(entry.enteredAt);
              return entered <= dayEnd;
            })
            .sort((a: any, b: any) => {
              // Sort by enteredAt to get chronological order
              return new Date(a.enteredAt).getTime() - new Date(b.enteredAt).getTime();
            });
          
          if (relevantHistory.length > 0) {
            const lastEntry = relevantHistory[relevantHistory.length - 1];
            // Check if task exited this queue before end of day
            if (lastEntry.exitedAt) {
              const exited = new Date(lastEntry.exitedAt);
              if (exited < dayEnd) {
                // Task moved to another queue, find the next queue entry
                const nextEntry = task.holdsQueueHistory.find((entry: any) => {
                  if (!entry.enteredAt) return false;
                  const entered = new Date(entry.enteredAt);
                  return entered > exited && entered <= dayEnd;
                });
                if (nextEntry) {
                  queueAtEndOfDay = nextEntry.queue || 'Unknown';
                } else {
                  // Task exited but no new queue entry found - use current status
                  queueAtEndOfDay = task.holdsStatus || 'Unknown';
                }
              } else {
                // Task was still in this queue at end of day
                queueAtEndOfDay = lastEntry.queue || 'Unknown';
              }
            } else {
              // Task never exited this queue, so it's still in it at end of day
              queueAtEndOfDay = lastEntry.queue || 'Unknown';
            }
          }
        }
        
        // Count the task in its queue at end of day
        queueCountsAtEndOfDay[queueAtEndOfDay] = (queueCountsAtEndOfDay[queueAtEndOfDay] || 0) + 1;
        
        if (includeTaskDetails) {
          if (!tasksInQueueAtEndOfDay[queueAtEndOfDay]) {
            tasksInQueueAtEndOfDay[queueAtEndOfDay] = [];
          }
          tasksInQueueAtEndOfDay[queueAtEndOfDay].push({
            id: task.id,
            orderNumber: task.holdsOrderNumber,
            customerEmail: task.holdsCustomerEmail,
            status: task.status,
            disposition: task.disposition,
            agentName: task.assignedTo?.name || 'Unassigned',
            createdAt: task.createdAt,
            endTime: task.endTime
          });
        }
      });
      
      
      // Calculate rollover tasks (moved between queues but not completed)
      const rolloverTasks = allTasks.filter(task => {
        // Task existed at start of day
        if (new Date(task.createdAt) >= dayStart) return false;
        // Task wasn't completed during this day
        if (task.endTime && new Date(task.endTime) >= dayStart && new Date(task.endTime) < dayEnd) return false;
        // Task has queue history showing movement during this day
        if (!task.holdsQueueHistory || !Array.isArray(task.holdsQueueHistory)) return false;
        
        const movementsToday = task.holdsQueueHistory.filter((entry: any) => {
          if (!entry.enteredAt) return false;
          const entered = new Date(entry.enteredAt);
          return entered >= dayStart && entered < dayEnd;
        });
        
        return movementsToday.length > 0;
      });
      
      const breakdown = {
        date: currentDate.toISOString().split('T')[0],
        dayStart: dayStart.toISOString(),
        dayEnd: dayEnd.toISOString(),
        queueCountsAtEndOfDay,
        totalPendingAtEndOfDay: Object.values(queueCountsAtEndOfDay).reduce((sum, count) => sum + count, 0),
        newTasksCount: newTasks.length,
        completedTasksCount: completedTasks.length,
        rolloverTasksCount: rolloverTasks.length,
        ...(includeTaskDetails && {
          newTasks: newTasks.map(t => ({
            id: t.id,
            orderNumber: t.holdsOrderNumber,
            customerEmail: t.holdsCustomerEmail,
            status: t.status,
            disposition: t.disposition,
            agentName: t.assignedTo?.name || 'Unassigned',
            createdAt: t.createdAt,
            endTime: t.endTime
          })),
          completedTasks: completedTasks.map(t => ({
            id: t.id,
            orderNumber: t.holdsOrderNumber,
            customerEmail: t.holdsCustomerEmail,
            status: t.status,
            disposition: t.disposition,
            agentName: t.assignedTo?.name || 'Unassigned',
            createdAt: t.createdAt,
            endTime: t.endTime
          })),
          rolloverTasks: rolloverTasks.map(t => ({
            id: t.id,
            orderNumber: t.holdsOrderNumber,
            customerEmail: t.holdsCustomerEmail,
            status: t.status,
            disposition: t.disposition,
            agentName: t.assignedTo?.name || 'Unassigned',
            createdAt: t.createdAt,
            endTime: t.endTime,
            queueHistory: t.holdsQueueHistory
          })),
          tasksInQueueAtEndOfDay
        })
      };
      
      dailyBreakdowns.push(breakdown);
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return NextResponse.json({
      success: true,
      data: {
        breakdowns: dailyBreakdowns,
        summary: {
          totalDays: dailyBreakdowns.length,
          dateRange: {
            start: startDate.toISOString(),
            end: endDate.toISOString()
          }
        }
      }
    });
    
  } catch (error) {
    console.error('Error fetching daily breakdown:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch daily breakdown' },
      { status: 500 }
    );
  }
}

