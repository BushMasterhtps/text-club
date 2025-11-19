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
    // PST is UTC-8, so to get PST time from UTC, we subtract 8 hours
    // But JavaScript Date is in UTC, so we need to check UTC time
    // 5 PM PST = 1 AM UTC next day
    // So if current UTC time is before 1 AM UTC on the next day, it's before 5 PM PST today
    
    const tomorrow5PM = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 1, 0, 0, 0));
    
    // If current time is before 5 PM PST today, use current time
    if (now < tomorrow5PM) {
      return now; // Use current time for "end of day" if it's before 5 PM PST
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
    
    // Get ALL Holds tasks - we need all tasks to accurately count what's in each queue at end of day
    // Tasks in queues might have been created days/weeks ago, so we can't filter by creation date
    const allTasks = await prisma.task.findMany({
      where: {
        taskType: 'HOLDS'
        // No date filtering - we need ALL tasks to determine queue counts at end of day
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
      
      // Use ALL tasks that existed at end of day
      // A task "existed" if it was created before end of day AND wasn't completed before start of day
      const allTasksForDay = allTasks.filter(t => {
        const created = new Date(t.createdAt);
        // Task must have been created before end of day
        if (created >= dayEnd) return false;
        
        // If task was completed, it must have been completed after start of day (or not completed at all)
        if (t.endTime) {
          const completed = new Date(t.endTime);
          // If completed before start of day, it didn't exist during this day
          if (completed < dayStart) return false;
        }
        
        return true; // Task existed during this day
      });
      
      allTasksForDay.forEach(task => {
        // Skip if task was completed before end of day
        if (task.endTime) {
          const completed = new Date(task.endTime);
          if (completed < dayEnd) {
            return; // Task was completed before end of day, don't count in queue
          }
        }
        
        // For end-of-day snapshot, use the current holdsStatus
        // This is the most reliable approach: if a task wasn't completed before end of day,
        // its current queue status is what it was at end of day (or close enough for reporting purposes)
        // Queue history parsing is complex and unreliable - current status is more accurate
        let queueAtEndOfDay = task.holdsStatus || 'Unknown';
        
        // Only try to use queue history for very old historical dates where current status might have changed
        // For recent dates (within last 7 days), current status is reliable
        const daysAgo = Math.floor((todayCalendar.getTime() - currentCalendarDate.getTime()) / (1000 * 60 * 60 * 24));
        const isOldHistoricalDate = daysAgo > 7;
        
        if (isOldHistoricalDate && task.holdsQueueHistory && Array.isArray(task.holdsQueueHistory) && task.holdsQueueHistory.length > 0) {
          // For old dates, try to reconstruct from history
          const activeAtEndOfDay = task.holdsQueueHistory.filter((entry: any) => {
            if (!entry.enteredAt) return false;
            const entered = new Date(entry.enteredAt);
            if (entered > dayEnd) return false;
            
            if (entry.exitedAt) {
              const exited = new Date(entry.exitedAt);
              return exited >= dayEnd;
            }
            
            return true;
          });
          
          if (activeAtEndOfDay.length > 0) {
            const sorted = activeAtEndOfDay.sort((a: any, b: any) => {
              return new Date(b.enteredAt).getTime() - new Date(a.enteredAt).getTime();
            });
            queueAtEndOfDay = sorted[0].queue || task.holdsStatus || 'Unknown';
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
      
      
      // Calculate rollover tasks: tasks in "Agent Research" queue at end of day
      const rolloverCount = queueCountsAtEndOfDay['Agent Research'] || 0;
      const rolloverTasks = includeTaskDetails ? allTasksForDay.filter(task => {
        // Skip if task was completed before end of day
        if (task.endTime) {
          const completed = new Date(task.endTime);
          if (completed < dayEnd) return false;
        }
        
        // Determine queue at end of day (same logic as above)
        let queueAtEndOfDay = task.holdsStatus || 'Unknown';
        
        if (task.holdsQueueHistory && Array.isArray(task.holdsQueueHistory) && task.holdsQueueHistory.length > 0) {
          const activeAtEndOfDay = task.holdsQueueHistory.filter((entry: any) => {
            if (!entry.enteredAt) return false;
            const entered = new Date(entry.enteredAt);
            if (entered > dayEnd) return false;
            
            if (entry.exitedAt) {
              const exited = new Date(entry.exitedAt);
              return exited >= dayEnd;
            }
            
            return true;
          });
          
          if (activeAtEndOfDay.length > 0) {
            const sorted = activeAtEndOfDay.sort((a: any, b: any) => {
              return new Date(b.enteredAt).getTime() - new Date(a.enteredAt).getTime();
            });
            queueAtEndOfDay = sorted[0].queue || task.holdsStatus || 'Unknown';
          }
        }
        
        return queueAtEndOfDay === 'Agent Research';
      }) : [];
      
      // Calculate pending: tasks in "Customer Contact" + "Escalated Call 4+ Day" queues at end of day
      // Check all possible queue name variations
      const customerContactCount = queueCountsAtEndOfDay['Customer Contact'] || 
                                   queueCountsAtEndOfDay['customer contact'] || 
                                   queueCountsAtEndOfDay['CUSTOMER CONTACT'] || 0;
      const escalatedCallCount = queueCountsAtEndOfDay['Escalated Call 4+ Day'] || 
                                 queueCountsAtEndOfDay['escalated call 4+ day'] || 
                                 queueCountsAtEndOfDay['ESCALATED CALL 4+ DAY'] || 0;
      const pendingCount = customerContactCount + escalatedCallCount;
      
      // Debug logging - always log for troubleshooting
      console.log('Daily Breakdown - Queue Counts:', {
        date: currentCalendarDate.toISOString().split('T')[0],
        dayEnd: dayEnd.toISOString(),
        totalTasksForDay: allTasksForDay.length,
        tasksCompletedBeforeEOD: allTasksForDay.filter(t => {
          if (!t.endTime) return false;
          return new Date(t.endTime) < dayEnd;
        }).length,
        queueCountsAtEndOfDay,
        customerContactCount,
        escalatedCallCount,
        pendingCount,
        allQueueKeys: Object.keys(queueCountsAtEndOfDay),
        sampleTaskStatuses: allTasksForDay.slice(0, 5).map(t => ({
          id: t.id,
          holdsStatus: t.holdsStatus,
          status: t.status,
          endTime: t.endTime,
          hasQueueHistory: !!t.holdsQueueHistory
        }))
      });
      
      const breakdown = {
        date: currentCalendarDate.toISOString().split('T')[0],
        dayStart: dayStart.toISOString(),
        dayEnd: dayEnd.toISOString(),
        queueCountsAtEndOfDay,
        totalPendingAtEndOfDay: pendingCount,
        newTasksCount: newTasks.length,
        completedTasksCount: completedTasks.length,
        rolloverTasksCount: rolloverCount,
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
            queueHistory: t.holdsQueueHistory,
            queueAtEndOfDay: (() => {
              let queue = t.holdsStatus || 'Unknown';
              if (t.holdsQueueHistory && Array.isArray(t.holdsQueueHistory) && t.holdsQueueHistory.length > 0) {
                const dayStart = getStartOfDayPST(currentCalendarDate);
                const dayEnd = getEndOfDayPST(currentCalendarDate, true);
                const activeAtEndOfDay = t.holdsQueueHistory.filter((entry: any) => {
                  if (!entry.enteredAt) return false;
                  const entered = new Date(entry.enteredAt);
                  if (entered > dayEnd) return false;
                  if (entry.exitedAt) {
                    const exited = new Date(entry.exitedAt);
                    return exited >= dayEnd;
                  }
                  return true;
                });
                if (activeAtEndOfDay.length > 0) {
                  const sorted = activeAtEndOfDay.sort((a: any, b: any) => {
                    return new Date(b.enteredAt).getTime() - new Date(a.enteredAt).getTime();
                  });
                  queue = sorted[0].queue || t.holdsStatus || 'Unknown';
                }
              }
              return queue;
            })()
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

