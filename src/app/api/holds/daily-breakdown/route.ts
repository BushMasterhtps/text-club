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

// Helper to get end of day (5 PM PST) for a given date
// If the date is today and it's before 5 PM PST, use current time
// Otherwise, use 5 PM PST for that date
// PST is UTC-8, so 5 PM PST = 17:00 PST = 17:00 + 8 = 01:00 UTC next day
function getEndOfDayPST(date: Date, useCurrentTimeIfToday: boolean = true): Date {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  // Check if this is today
  const isToday = today.getTime() === targetDate.getTime();
  
  if (isToday && useCurrentTimeIfToday) {
    // For today, check if it's before 5 PM PST
    // Get current time and convert to PST
    const pstOffset = -8 * 60 * 60 * 1000; // PST offset in milliseconds
    const nowPST = new Date(now.getTime() + pstOffset);
    const hourPST = nowPST.getUTCHours();
    const minutePST = nowPST.getUTCMinutes();
    
    // If it's before 5 PM PST (17:00), use current time
    if (hourPST < 17 || (hourPST === 17 && minutePST === 0)) {
      return now; // Use current time for "end of day" if it's before 5 PM
    }
  }
  
  // Otherwise, use 5 PM PST for that date
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  // 5 PM PST = 1 AM UTC next day
  const nextDay = new Date(Date.UTC(year, month, day + 1, 1, 0, 0, 0));
  return nextDay;
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
      const date = new Date(specificDate + 'T00:00:00');
      startDate = getStartOfDayPST(date);
      endDate = getEndOfDayPST(date);
    } else if (startDateParam && endDateParam) {
      // If start and end are the same, only show that one day
      if (startDateParam === endDateParam) {
        const date = new Date(startDateParam + 'T00:00:00');
        startDate = getStartOfDayPST(date);
        endDate = getEndOfDayPST(date);
      } else {
        startDate = getStartOfDayPST(new Date(startDateParam + 'T00:00:00'));
        endDate = getEndOfDayPST(new Date(endDateParam + 'T00:00:00'));
      }
    } else {
      // Default to last 30 days
      const today = new Date();
      endDate = getEndOfDayPST(today);
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 30);
      startDate = getStartOfDayPST(startDate);
    }
    
    const includeTaskDetails = searchParams.get('includeTasks') === 'true';
    
    // Get all Holds tasks - we'll filter by date in the calculation logic
    // This ensures we capture all tasks that existed during the period
    // For now, get all tasks created before the end date to ensure we don't miss any
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
    
    // Use calendar dates for iteration (not UTC dates)
    let startCalendarDate: Date;
    let endCalendarDate: Date;
    
    if (specificDate) {
      startCalendarDate = new Date(specificDate + 'T00:00:00');
      endCalendarDate = new Date(specificDate + 'T00:00:00');
    } else if (startDateParam && endDateParam) {
      startCalendarDate = new Date(startDateParam + 'T00:00:00');
      endCalendarDate = new Date(endDateParam + 'T00:00:00');
    } else {
      const today = new Date();
      endCalendarDate = new Date(today);
      startCalendarDate = new Date(today);
      startCalendarDate.setDate(startCalendarDate.getDate() - 30);
    }
    
    // Debug: Log what we're working with
    console.log('Daily Breakdown API:', {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      startCalendarDate: startCalendarDate.toISOString(),
      endCalendarDate: endCalendarDate.toISOString(),
      totalTasks: allTasks.length,
      dateRange: `${startDateParam || 'default'} to ${endDateParam || 'default'}`
    });
    
    const currentCalendarDate = new Date(startCalendarDate);
    
    // Get current date in PST for comparison
    const now = new Date();
    const todayPST = new Date(now.getTime() - (8 * 60 * 60 * 1000)); // Convert to PST
    const todayCalendar = new Date(todayPST.getFullYear(), todayPST.getMonth(), todayPST.getDate());
    
    while (currentCalendarDate <= endCalendarDate) {
      // Check if this date is in the future
      const isFutureDate = currentCalendarDate > todayCalendar;
      
      // Skip future dates - don't calculate data for dates that haven't happened yet
      if (isFutureDate) {
        currentCalendarDate.setDate(currentCalendarDate.getDate() + 1);
        continue;
      }
      
      const dayStart = getStartOfDayPST(currentCalendarDate);
      const dayEnd = getEndOfDayPST(currentCalendarDate, true); // Use current time if today
      const nextDayStart = new Date(dayStart);
      nextDayStart.setDate(nextDayStart.getDate() + 1);
      
      // Tasks that existed at start of day (created before day start)
      const tasksAtStart = allTasks.filter(t => {
        const created = new Date(t.createdAt);
        return created < dayStart;
      });
      
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
      
      // Debug logging for first day
      if (currentCalendarDate.getTime() === startCalendarDate.getTime()) {
        console.log('First day calculation:', {
          date: currentCalendarDate.toISOString().split('T')[0],
          dayStart: dayStart.toISOString(),
          dayEnd: dayEnd.toISOString(),
          totalTasks: allTasks.length,
          tasksAtStart: tasksAtStart.length,
          newTasks: newTasks.length,
          completedTasks: completedTasks.length
        });
      }
      
      // Calculate queue counts at end of day (5 PM PST)
      // For each task, determine its queue status at end of day
      const queueCountsAtEndOfDay: Record<string, number> = {};
      const tasksInQueueAtEndOfDay: Record<string, any[]> = {};
      
      // Combine tasks at start and new tasks to get all tasks that existed during the day
      const allTasksForDay = [...tasksAtStart, ...newTasks];
      
      // Also include tasks that were created before end date but might not be in tasksAtStart
      // This ensures we capture all tasks that existed at any point during the day
      const additionalTasks = allTasks.filter(t => {
        const created = new Date(t.createdAt);
        // Task was created before end of day but not already counted
        return created < dayEnd && !allTasksForDay.find(at => at.id === t.id);
      });
      allTasksForDay.push(...additionalTasks);
      
      allTasksForDay.forEach(task => {
        // Skip if task was completed before end of day
        if (task.endTime) {
          const completed = new Date(task.endTime);
          if (completed < dayEnd) {
            return; // Task was completed before end of day, don't count in queue
          }
        }
        
        // Determine queue at end of day based on queue history
        // For simplicity, use current holdsStatus if task wasn't completed
        // This is more reliable than trying to parse complex queue history
        let queueAtEndOfDay = task.holdsStatus || 'Unknown';
        
        // If task has queue history, try to determine queue at end of day
        if (task.holdsQueueHistory && Array.isArray(task.holdsQueueHistory) && task.holdsQueueHistory.length > 0) {
          // Find entries that were active at end of day
          const activeAtEndOfDay = task.holdsQueueHistory.filter((entry: any) => {
            if (!entry.enteredAt) return false;
            const entered = new Date(entry.enteredAt);
            if (entered > dayEnd) return false; // Entry after end of day
            
            // If entry has exit time, check if it exited before end of day
            if (entry.exitedAt) {
              const exited = new Date(entry.exitedAt);
              return exited >= dayEnd; // Still in queue at end of day
            }
            
            // No exit time means still in queue
            return true;
          });
          
          if (activeAtEndOfDay.length > 0) {
            // Use the most recent entry that was active at end of day
            const sorted = activeAtEndOfDay.sort((a: any, b: any) => {
              return new Date(b.enteredAt).getTime() - new Date(a.enteredAt).getTime();
            });
            queueAtEndOfDay = sorted[0].queue || task.holdsStatus || 'Unknown';
          }
          // If no active entries found, fall back to current status
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
        date: currentCalendarDate.toISOString().split('T')[0],
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
      
      // Move to next calendar day
      currentCalendarDate.setDate(currentCalendarDate.getDate() + 1);
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

