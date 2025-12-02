import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * API for Agent Work Breakdown by Queue
 * Tracks agent work across all queue stages, not just final completion
 * 
 * This endpoint addresses the issue where tasks move through multiple queues
 * (Agent Research → Customer Contact → Escalated Call 4+ Day → Completed)
 * and we need to count work done by agents in each queue, not just final completion.
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const agentId = searchParams.get('agentId'); // Optional: filter by specific agent

    // Build date filter - we'll use this to filter queue history entries
    let dateStart: Date | null = null;
    let dateEnd: Date | null = null;
    if (startDate && endDate) {
      const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
      
      // Start of day in PST = 8:00 AM UTC (PST is UTC-8)
      dateStart = new Date(Date.UTC(startYear, startMonth - 1, startDay, 8, 0, 0, 0));
      // End of day in PST = 7:59:59.999 AM UTC next day
      dateEnd = new Date(Date.UTC(endYear, endMonth - 1, endDay + 1, 7, 59, 59, 999));
    }

    // Query ALL completed Holds tasks - we'll parse queue history to find all work done
    // We need to get all tasks, not just those with final endTime in range,
    // because work might have been done in the date range even if final completion was later
    const where: any = {
      taskType: 'HOLDS',
      status: 'COMPLETED',
      holdsQueueHistory: { not: null } // Must have queue history
    };

    // If agent filter is specified, we'll filter in memory after parsing queue history
    // (since we need to look at all queue entries, not just final completedBy)

    // Get a broader set of tasks - we'll filter by date range in memory using queue history
    const tasks = await prisma.task.findMany({
      where,
      select: {
        id: true,
        holdsOrderNumber: true,
        holdsOrderAmount: true,
        holdsStatus: true, // Final queue when completed
        holdsQueueHistory: true,
        disposition: true,
        endTime: true,
        durationSec: true,
        completedBy: true,
        completedByUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        // Also get all task history to help identify which agent did work in each queue
        history: {
          select: {
            id: true,
            actorId: true,
            action: true,
            createdAt: true,
            prevStatus: true,
            newStatus: true
          },
          orderBy: {
            createdAt: 'asc'
          }
        }
      },
      orderBy: {
        endTime: 'desc'
      }
    });

    // First, collect all unique agent IDs we'll need to look up
    const agentIdsToLookup = new Set<string>();
    
    // Pre-populate with completedBy agents from tasks
    for (const task of tasks) {
      if (task.completedBy && task.completedByUser) {
        agentIdsToLookup.add(task.completedBy);
      }
      // Also collect from task history
      if (task.history && Array.isArray(task.history)) {
        for (const hist of task.history) {
          if (hist.actorId) {
            agentIdsToLookup.add(hist.actorId);
          }
        }
      }
    }

    // Batch fetch all agent info
    const agentUsers = await prisma.user.findMany({
      where: {
        id: { in: Array.from(agentIdsToLookup) }
      },
      select: {
        id: true,
        name: true,
        email: true
      }
    });

    // Create a map of agent IDs to agent info for quick lookup
    const agentInfoMap = new Map<string, { id: string; name: string; email: string }>();
    for (const agent of agentUsers) {
      agentInfoMap.set(agent.id, agent);
    }

    // Build agent work breakdown
    // Key: agentId-queue (e.g., "agent123-Agent Research")
    const agentWorkMap = new Map<string, {
      agentId: string;
      agentName: string;
      agentEmail: string;
      queue: string;
      count: number;
      totalAmount: number;
      totalDuration: number;
      dispositions: Record<string, { count: number; amount: number }>;
    }>();

    for (const task of tasks) {
      if (!task.holdsQueueHistory || !Array.isArray(task.holdsQueueHistory)) continue;

      const queueHistory = task.holdsQueueHistory as Array<any>;
      const amount = task.holdsOrderAmount ? Number(task.holdsOrderAmount) : 0;
      const disp = task.disposition || 'Unknown';

      // Parse queue history to find ALL work done (not just final completion)
      // Each queue entry with an exitedAt represents work completed in that queue
      for (let i = 0; i < queueHistory.length; i++) {
        const entry = queueHistory[i];
        if (!entry.queue || !entry.enteredAt) continue;

        // Only count entries where work was completed (has exitedAt)
        // This represents an agent completing work in this queue
        if (!entry.exitedAt) {
          // Still in this queue - hasn't been completed yet, skip
          continue;
        }

        const enteredAt = new Date(entry.enteredAt);
        const exitedAt = new Date(entry.exitedAt);
        
        // If date filter is set, check if this work was done in the date range
        if (dateStart && dateEnd) {
          // Work is in range if exitedAt (when work was completed) falls within the range
          const workInRange = 
            (exitedAt >= dateStart && exitedAt <= dateEnd) ||
            (enteredAt <= dateStart && exitedAt >= dateEnd); // Work spans the entire range
          
          if (!workInRange) continue;
        }

        // Identify the agent who completed work in this queue
        // Strategy:
        // 1. If this is the last queue entry, use completedBy (final completion)
        // 2. For intermediate entries, we need to infer from task history
        //    - Look for task history entries around the exitedAt time
        //    - Find the agent who completed the task (action = "COMPLETED" or status change)
        let workAgentId: string | null = null;
        let workAgentName: string | null = null;
        let workAgentEmail: string | null = null;

        if (i === queueHistory.length - 1) {
          // Last queue entry - use completedBy (this is the final completion)
          if (task.completedBy && task.completedByUser) {
            workAgentId = task.completedBy;
            workAgentName = task.completedByUser.name;
            workAgentEmail = task.completedByUser.email;
          }
        } else {
          // Intermediate queue entry - try to find agent from task history
          // Look for history entries around the time this queue was exited
          if (task.history && Array.isArray(task.history)) {
            // Find history entry closest to when this queue was exited
            const relevantHistory = task.history
              .filter((h: any) => {
                const histTime = new Date(h.createdAt);
                // History entry should be within 10 minutes of queue exit (more lenient)
                const timeDiff = Math.abs(histTime.getTime() - exitedAt.getTime());
                return timeDiff < 10 * 60 * 1000; // 10 minutes
              })
              .sort((a: any, b: any) => {
                const aTime = Math.abs(new Date(a.createdAt).getTime() - exitedAt.getTime());
                const bTime = Math.abs(new Date(b.createdAt).getTime() - exitedAt.getTime());
                return aTime - bTime;
              });

            if (relevantHistory.length > 0 && relevantHistory[0].actorId) {
              workAgentId = relevantHistory[0].actorId;
            }
          }

          // Fallback: If we can't find from history, use completedBy as a last resort
          // This isn't perfect but better than losing the data entirely
          // Note: This might attribute intermediate work to the final agent, but it's better than nothing
          if (!workAgentId && task.completedBy && task.completedByUser) {
            // Only use this fallback if the exit time is close to the final endTime
            // (suggests it might be the same agent)
            if (task.endTime) {
              const endTime = new Date(task.endTime);
              const timeDiff = Math.abs(endTime.getTime() - exitedAt.getTime());
              // If exit was within 1 hour of final completion, use completedBy
              if (timeDiff < 60 * 60 * 1000) {
                workAgentId = task.completedBy;
                workAgentName = task.completedByUser.name;
                workAgentEmail = task.completedByUser.email;
              }
            }
          }

          // If we still can't identify the agent, skip this entry
          // (Better to skip than attribute incorrectly)
          if (!workAgentId) {
            continue;
          }
        }

        if (!workAgentId) continue;

        // Look up agent info
        const agentInfo = agentInfoMap.get(workAgentId);
        if (!agentInfo) {
          continue; // Agent not found, skip
        }
        workAgentName = agentInfo.name;
        workAgentEmail = agentInfo.email;

        // Apply agent filter if specified
        if (agentId && agentId !== 'all' && workAgentId !== agentId) {
          continue;
        }

        const queue = entry.queue;
        const key = `${workAgentId}-${queue}`;
        
        if (!agentWorkMap.has(key)) {
          agentWorkMap.set(key, {
            agentId: workAgentId,
            agentName: workAgentName!,
            agentEmail: workAgentEmail!,
            queue,
            count: 0,
            totalAmount: 0,
            totalDuration: 0,
            dispositions: {}
          });
        }

        const work = agentWorkMap.get(key)!;
        work.count++;
        work.totalAmount += amount;
        
        // Calculate duration for this queue entry
        const queueDuration = Math.round((exitedAt.getTime() - enteredAt.getTime()) / 1000);
        work.totalDuration += queueDuration;
        
        // Track disposition from this queue entry (if available) or final disposition
        const entryDisp = entry.disposition || disp;
        if (!work.dispositions[entryDisp]) {
          work.dispositions[entryDisp] = { count: 0, amount: 0 };
        }
        work.dispositions[entryDisp].count++;
        work.dispositions[entryDisp].amount += amount;
      }
    }

    // Convert map to array and group by agent
    const agentWorkArray = Array.from(agentWorkMap.values());
    
    // Group by agent for easier frontend consumption
    const agentBreakdown = new Map<string, {
      agentId: string;
      agentName: string;
      agentEmail: string;
      queues: Array<{
        queue: string;
        count: number;
        totalAmount: number;
        avgDuration: number;
        dispositions: Record<string, { count: number; amount: number }>;
      }>;
      totalCount: number;
      totalAmount: number;
      totalDuration: number;
      avgResolutionTime: number;
    }>();

    for (const work of agentWorkArray) {
      if (!agentBreakdown.has(work.agentId)) {
        agentBreakdown.set(work.agentId, {
          agentId: work.agentId,
          agentName: work.agentName,
          agentEmail: work.agentEmail,
          queues: [],
          totalCount: 0,
          totalAmount: 0,
          totalDuration: 0
        });
      }

      const agent = agentBreakdown.get(work.agentId)!;
      agent.queues.push({
        queue: work.queue,
        count: work.count,
        totalAmount: work.totalAmount,
        avgDuration: work.count > 0 ? work.totalDuration / work.count : 0,
        dispositions: work.dispositions
      });
      
      agent.totalCount += work.count;
      agent.totalAmount += work.totalAmount;
      agent.totalDuration += work.totalDuration;
    }

    // Calculate averages and format response
    const agents = Array.from(agentBreakdown.values()).map(agent => ({
      ...agent,
      avgResolutionTime: agent.totalCount > 0 ? agent.totalDuration / agent.totalCount : 0
    })).sort((a, b) => b.totalCount - a.totalCount);

    // Calculate summary stats
    const summary = {
      totalTasks: tasks.length,
      totalAgents: agents.length,
      totalAmount: agents.reduce((sum, a) => sum + a.totalAmount, 0),
      totalCount: agents.reduce((sum, a) => sum + a.totalCount, 0)
    };

    return NextResponse.json({
      success: true,
      data: {
        agents,
        summary
      }
    });

  } catch (error) {
    console.error('Error fetching agent work breakdown:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch agent work breakdown' },
      { status: 500 }
    );
  }
}

