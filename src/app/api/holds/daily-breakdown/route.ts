import { NextRequest, NextResponse } from 'next/server';
import { TaskType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { apiAuthDeniedResponse, requireManagerApiAuth } from '@/lib/auth';
import { logRouteTiming } from '@/lib/route-timing-log';
import {
  aggregateSessionSummary,
  aggregateSessionsByAgent,
  aggregateSessionsByDisposition,
  aggregateSessionsByQueueMovement,
  filterSessionsForDay,
  mapSessionDetails,
  type HoldsActivitySession,
} from '@/lib/holds-daily-activity';
import {
  addPacificCalendarDays,
  enumeratePacificYmdRange,
  formatYmdPacific,
  getPacificReportingDayRangeUtc,
  nextPacificYmd,
  pacificYmdToUtcDayEndForActivity,
  pacificYmdToUtcStart,
} from '@/lib/holds-pacific-calendar';

/** Parsed holdsQueueHistory JSON entries (best-effort). */
type HoldsQueueHistoryEntry = {
  enteredAt?: string | Date | null;
  exitedAt?: string | Date | null;
  queue?: string | null;
};

function queueHistoryEntries(raw: unknown): HoldsQueueHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is HoldsQueueHistoryEntry =>
      typeof e === 'object' && e !== null && 'enteredAt' in e
  ) as HoldsQueueHistoryEntry[];
}

type TaskEodListRow = {
  id: string;
  orderNumber: string | null;
  customerEmail: string | null;
  status: string;
  disposition: string | null;
  holdsStatus: string | null;
  agentName: string;
  createdAt: Date;
  endTime: Date | null;
};

type LegacyActivitySummary = {
  legacyCompletedTaskCount: number;
  legacyNewTaskCount: number;
  legacyRolloverTaskCount: number;
  legacyPendingAtEodCount: number;
  hasLegacyActivity: boolean;
  hasWorkSessionActivity: boolean;
  dataCoverageNote: string;
};

function buildLegacyActivitySummary(params: {
  legacyCompleted: number;
  legacyNew: number;
  legacyRollover: number;
  legacyPendingEod: number;
  sessionTotal: number;
}): LegacyActivitySummary {
  const {
    legacyCompleted,
    legacyNew,
    legacyRollover,
    legacyPendingEod,
    sessionTotal,
  } = params;
  const hasWorkSessionActivity = sessionTotal > 0;
  const hasLegacyActivity =
    legacyNew > 0 || legacyCompleted > 0 || legacyRollover > 0 || legacyPendingEod > 0;

  let dataCoverageNote =
    'Completed actions are counted by full Pacific calendar day. The end-of-day queue snapshot still uses a 5 PM local cutoff for inventory.';
  if (!hasWorkSessionActivity && hasLegacyActivity) {
    dataCoverageNote =
      'No detailed completed actions for this day or range. Showing imported and completed-order totals and end-of-day snapshot where available.';
  } else if (hasWorkSessionActivity && hasLegacyActivity) {
    dataCoverageNote =
      'Completed actions are shown together with import, completed-order, and end-of-day snapshot figures for context.';
  } else if (!hasWorkSessionActivity && !hasLegacyActivity) {
    dataCoverageNote = 'No activity found for this date range.';
  }

  return {
    legacyCompletedTaskCount: legacyCompleted,
    legacyNewTaskCount: legacyNew,
    legacyRolloverTaskCount: legacyRollover,
    legacyPendingAtEodCount: legacyPendingEod,
    hasLegacyActivity,
    hasWorkSessionActivity,
    dataCoverageNote,
  };
}

/**
 * API for Holds Daily Activity: completed actions by Pacific calendar day, plus end-of-day queue snapshot and import/completed-order totals.
 */

export async function GET(request: NextRequest) {
  const route = 'GET /api/holds/daily-breakdown';
  const startedAt = Date.now();
  let rowCount = 0;
  let userEmail: string | null = null;
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);
  userEmail = auth.userEmail;

  try {
    const { searchParams } = new URL(request.url);

    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const specificDate = searchParams.get('date');

    const now = new Date();
    let startYmd: string;
    let endYmd: string;

    if (specificDate) {
      startYmd = specificDate;
      endYmd = specificDate;
    } else if (startDateParam && endDateParam) {
      startYmd = startDateParam;
      endYmd = endDateParam;
    } else {
      endYmd = formatYmdPacific(now);
      startYmd = addPacificCalendarDays(endYmd, -30);
    }

    const includeTaskDetails = searchParams.get('includeTasks') === 'true';

    const { gte: sessionRangeGte, lt: sessionRangeLt } = getPacificReportingDayRangeUtc(
      startYmd,
      endYmd
    );
    const rangeStartUtc = sessionRangeGte;
    const rangeEndUtc = sessionRangeLt;
    
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
        },
        completedByUser: {
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
    rowCount = allTasks.length;

    const dailyBreakdowns: Record<string, unknown>[] = [];

    const holdsSessionsInRange = await prisma.taskWorkSession.findMany({
      where: {
        taskType: TaskType.HOLDS,
        countsTowardProductivity: true,
        endedAt: {
          gte: sessionRangeGte,
          lt: sessionRangeLt,
        },
      },
      include: {
        agent: { select: { id: true, name: true, email: true } },
        task: { select: { holdsOrderNumber: true, holdsCustomerEmail: true } },
      },
    });

    const mappedSessions: HoldsActivitySession[] = holdsSessionsInRange.map((r) => ({
      id: r.id,
      taskId: r.taskId,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      durationSec: r.durationSec,
      fromQueue: r.fromQueue,
      toQueue: r.toQueue,
      disposition: r.disposition,
      outcomeType: r.outcomeType,
      isFinalResolution: r.isFinalResolution,
      agentId: r.agentId,
      agentName: r.agent?.name ?? null,
      agentEmail: r.agent?.email ?? null,
      orderNumber: r.task?.holdsOrderNumber ?? null,
      customerEmail: r.task?.holdsCustomerEmail ?? null,
    }));

    rowCount = allTasks.length + holdsSessionsInRange.length;

    const todayYmd = formatYmdPacific(now);
    const dayYmds = enumeratePacificYmdRange(startYmd, endYmd).filter((ymd) => ymd <= todayYmd);

    for (const ymd of dayYmds) {
      const calendarDayStart = pacificYmdToUtcStart(ymd);
      const calendarDayEndExclusive = pacificYmdToUtcStart(nextPacificYmd(ymd));
      const eodInventoryCutoff = pacificYmdToUtcDayEndForActivity(ymd, now);

      // Tasks created during this Pacific calendar day (legacy row counts; full midnight–midnight)
      const newTasks = allTasks.filter(t => {
        const created = new Date(t.createdAt);
        return created >= calendarDayStart && created < calendarDayEndExclusive;
      });
      
      // Tasks completed during this Pacific calendar day (legacy; by endTime)
      const completedTasks = allTasks.filter(t => {
        if (!t.endTime) return false;
        const completed = new Date(t.endTime);
        return completed >= calendarDayStart && completed < calendarDayEndExclusive;
      });

      // Calculate queue counts at end of day (5 PM local)
      // For each task, determine its queue status at end of day
      const queueCountsAtEndOfDay: Record<string, number> = {};
      const tasksInQueueAtEndOfDay: Record<string, TaskEodListRow[]> = {};
      
      // Use ALL tasks that existed at end of day
      // A task "existed" if it was created before end of day
      // We don't filter by completion time - we want to see the CURRENT queue state for all tasks that existed on that day
      const allTasksForDay = allTasks.filter(t => {
        const created = new Date(t.createdAt);
        return created < eodInventoryCutoff;
      });
      
      allTasksForDay.forEach(task => {
        // For Daily Breakdown EOD snapshot, determine the queue at end of day
        // For today (if before 5 PM PST), use current status
        // For any past date, reconstruct from queue history to get accurate EOD state
        let queueAtEndOfDay = task.holdsStatus || 'Unknown';
        
        // Check if this is a past date (EOD has already passed)
        const isPastDate = eodInventoryCutoff < now;
        
        // For past dates, reconstruct queue from history to get accurate EOD snapshot
        if (isPastDate) {
          const history = queueHistoryEntries(task.holdsQueueHistory);
          if (history.length > 0) {
            const activeAtEndOfDay = history.filter((entry) => {
              if (!entry.enteredAt) return false;
              const entered = new Date(entry.enteredAt);
              if (entered > eodInventoryCutoff) return false;

              if (entry.exitedAt) {
                const exited = new Date(entry.exitedAt);
                return exited >= eodInventoryCutoff;
              }

              return true;
            });

            if (activeAtEndOfDay.length > 0) {
              const sorted = activeAtEndOfDay.sort((a, b) => {
                const ae = a.enteredAt ? new Date(a.enteredAt).getTime() : 0;
                const be = b.enteredAt ? new Date(b.enteredAt).getTime() : 0;
                return be - ae;
              });
              queueAtEndOfDay = sorted[0].queue || task.holdsStatus || 'Unknown';
            }
          }
        }
        // For recent dates, use current status (already set above)
        
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
            holdsStatus: task.holdsStatus ?? null,
            agentName: task.completedByUser?.name || task.assignedTo?.name || 'Unassigned',
            createdAt: task.createdAt,
            endTime: task.endTime
          });
        }
      });
      
      
      // Calculate rollover tasks: tasks in "Agent Research" queue at end of day
      // Use the same queue counts we calculated above (which already uses historical reconstruction for old dates)
      const rolloverCount = queueCountsAtEndOfDay['Agent Research'] || 
                           queueCountsAtEndOfDay['agent research'] || 
                           queueCountsAtEndOfDay['AGENT RESEARCH'] || 0;
      
      // For task details, filter tasks that were in Agent Research at EOD
      const rolloverTasks = includeTaskDetails ? allTasksForDay.filter(task => {
        // Determine queue at end of day (same logic as in main loop)
        let queueAtEndOfDay = task.holdsStatus || 'Unknown';
        
        const isPastDate = eodInventoryCutoff < now;
        
        if (isPastDate) {
          const hist = queueHistoryEntries(task.holdsQueueHistory);
          if (hist.length > 0) {
            const activeAtEndOfDay = hist.filter((entry) => {
              if (!entry.enteredAt) return false;
              const entered = new Date(entry.enteredAt);
              if (entered > eodInventoryCutoff) return false;

              if (entry.exitedAt) {
                const exited = new Date(entry.exitedAt);
                return exited >= eodInventoryCutoff;
              }

              return true;
            });

            if (activeAtEndOfDay.length > 0) {
              const sorted = activeAtEndOfDay.sort((a, b) => {
                const ae = a.enteredAt ? new Date(a.enteredAt).getTime() : 0;
                const be = b.enteredAt ? new Date(b.enteredAt).getTime() : 0;
                return be - ae;
              });
              queueAtEndOfDay = sorted[0].queue || task.holdsStatus || 'Unknown';
            }
          }
        }

        return queueAtEndOfDay === 'Agent Research' || 
               queueAtEndOfDay === 'agent research' || 
               queueAtEndOfDay === 'AGENT RESEARCH';
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

      const daySessions = filterSessionsForDay(
        mappedSessions,
        calendarDayStart,
        calendarDayEndExclusive
      );
      const sessionSummary = aggregateSessionSummary(daySessions);
      const sessionsByAgent = aggregateSessionsByAgent(daySessions);
      const sessionsByQueueMovement = aggregateSessionsByQueueMovement(daySessions);
      const sessionsByDisposition = aggregateSessionsByDisposition(daySessions);
      const sessionDetails = includeTaskDetails ? mapSessionDetails(daySessions) : undefined;

      const legacyActivitySummary = buildLegacyActivitySummary({
        legacyCompleted: completedTasks.length,
        legacyNew: newTasks.length,
        legacyRollover: rolloverCount,
        legacyPendingEod: pendingCount,
        sessionTotal: sessionSummary.totalSessions,
      });

      const breakdown = {
        date: ymd,
        dayStart: calendarDayStart.toISOString(),
        dayEnd: eodInventoryCutoff.toISOString(),
        queueCountsAtEndOfDay,
        totalPendingAtEndOfDay: pendingCount,
        newTasksCount: newTasks.length,
        completedTasksCount: completedTasks.length,
        rolloverTasksCount: rolloverCount,
        sessionSummary,
        sessionsByAgent,
        sessionsByQueueMovement,
        sessionsByDisposition,
        legacyActivitySummary,
        ...(sessionDetails !== undefined && { sessionDetails }),
        ...(includeTaskDetails && {
          newTasks: newTasks.map(t => ({
            id: t.id,
            orderNumber: t.holdsOrderNumber,
            customerEmail: t.holdsCustomerEmail,
            status: t.status,
            disposition: t.disposition,
            holdsStatus: t.holdsStatus ?? null,
            agentName: t.completedByUser?.name || t.assignedTo?.name || 'Unassigned',
            createdAt: t.createdAt,
            endTime: t.endTime
          })),
          completedTasks: completedTasks.map(t => ({
            id: t.id,
            orderNumber: t.holdsOrderNumber,
            customerEmail: t.holdsCustomerEmail,
            status: t.status,
            disposition: t.disposition,
            holdsStatus: t.holdsStatus ?? null,
            agentName: t.completedByUser?.name || t.assignedTo?.name || 'Unassigned',
            createdAt: t.createdAt,
            endTime: t.endTime
          })),
          rolloverTasks: rolloverTasks.map(t => ({
            id: t.id,
            orderNumber: t.holdsOrderNumber,
            customerEmail: t.holdsCustomerEmail,
            status: t.status,
            disposition: t.disposition,
            holdsStatus: t.holdsStatus ?? null,
            agentName: t.completedByUser?.name || t.assignedTo?.name || 'Unassigned',
            createdAt: t.createdAt,
            endTime: t.endTime,
            queueHistory: t.holdsQueueHistory,
            queueAtEndOfDay: (() => {
              let queue = t.holdsStatus || 'Unknown';
              const qh = queueHistoryEntries(t.holdsQueueHistory);
              if (qh.length > 0) {
                const activeAtEndOfDay = qh.filter((entry) => {
                  if (!entry.enteredAt) return false;
                  const entered = new Date(entry.enteredAt);
                  if (entered > eodInventoryCutoff) return false;
                  if (entry.exitedAt) {
                    const exited = new Date(entry.exitedAt);
                    return exited >= eodInventoryCutoff;
                  }
                  return true;
                });
                if (activeAtEndOfDay.length > 0) {
                  const sorted = activeAtEndOfDay.sort((a, b) => {
                    const ae = a.enteredAt ? new Date(a.enteredAt).getTime() : 0;
                    const be = b.enteredAt ? new Date(b.enteredAt).getTime() : 0;
                    return be - ae;
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
    }

    const rangeSessionSummary = aggregateSessionSummary(mappedSessions);
    const rangeSessionsByAgent = aggregateSessionsByAgent(mappedSessions);
    const rangeSessionsByQueueMovement = aggregateSessionsByQueueMovement(mappedSessions);
    const rangeSessionsByDisposition = aggregateSessionsByDisposition(mappedSessions);

    let sumLegacyCompleted = 0;
    let sumLegacyNew = 0;
    let sumLegacyRollover = 0;
    for (const b of dailyBreakdowns) {
      const la = b.legacyActivitySummary as LegacyActivitySummary | undefined;
      if (la) {
        sumLegacyCompleted += la.legacyCompletedTaskCount;
        sumLegacyNew += la.legacyNewTaskCount;
        sumLegacyRollover += la.legacyRolloverTaskCount;
      }
    }
    const rangeLegacyActivitySummary = buildLegacyActivitySummary({
      legacyCompleted: sumLegacyCompleted,
      legacyNew: sumLegacyNew,
      legacyRollover: sumLegacyRollover,
      legacyPendingEod: 0,
      sessionTotal: rangeSessionSummary.totalSessions,
    });
    const rangeNote =
      rangeLegacyActivitySummary.hasWorkSessionActivity || rangeLegacyActivitySummary.hasLegacyActivity
        ? `${rangeLegacyActivitySummary.dataCoverageNote} End-of-day pending (Customer Contact + Escalated) is per calendar day in the By Day table, not summed across the range.`
        : rangeLegacyActivitySummary.dataCoverageNote;

    return NextResponse.json({
      success: true,
      data: {
        breakdowns: dailyBreakdowns,
        rangeSessionSummary,
        rangeSessionsByAgent,
        rangeSessionsByQueueMovement,
        rangeSessionsByDisposition,
        rangeLegacyActivitySummary: {
          ...rangeLegacyActivitySummary,
          dataCoverageNote: rangeNote,
        },
        summary: {
          totalDays: dailyBreakdowns.length,
          dateRange: {
            start: rangeStartUtc.toISOString(),
            end: rangeEndUtc.toISOString()
          },
          pacificDateRange: { start: startYmd, end: endYmd },
          legacyTaskRowMetricsNote:
            'newTasksCount, completedTasksCount, rolloverTasksCount, and related task arrays are legacy Task/EOD snapshot fields. Productivity actions use sessionSummary and TaskWorkSession (endedAt in America/Los_Angeles day window, HOLDS, countsTowardProductivity).'
        }
      }
    });
    
  } catch (error) {
    console.error('Error fetching daily breakdown:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch daily breakdown' },
      { status: 500 }
    );
  } finally {
    logRouteTiming({
      route,
      durationMs: Date.now() - startedAt,
      rowCount,
      email: userEmail,
    });
  }
}

