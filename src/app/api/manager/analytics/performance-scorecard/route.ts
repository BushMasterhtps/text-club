import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Performance Scorecard API
 * Calculates agent performance scores, rankings, and tiers based on historical data
 * 
 * Query params:
 * - dateStart: ISO date string (e.g., "2025-10-01")
 * - dateEnd: ISO date string (e.g., "2025-10-31")
 * - agentId: Optional - for detailed drill-down
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const dateStartStr = url.searchParams.get("dateStart");
    const dateEndStr = url.searchParams.get("dateEnd");
    const agentId = url.searchParams.get("agentId");

    // Default to last 30 days if no dates provided
    const now = new Date();
    const defaultEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const defaultStart = new Date(defaultEnd);
    defaultStart.setDate(defaultStart.getDate() - 30);
    defaultStart.setHours(0, 0, 0, 0);

    const dateEnd = dateEndStr ? new Date(dateEndStr) : defaultEnd;
    const dateStart = dateStartStr ? new Date(dateStartStr) : defaultStart;

    // Set end of day for dateEnd
    dateEnd.setHours(23, 59, 59, 999);
    // Set start of day for dateStart
    dateStart.setHours(0, 0, 0, 0);

    const daysDiff = Math.ceil((dateEnd.getTime() - dateStart.getTime()) / (1000 * 60 * 60 * 24));

    // Get all completed tasks in the date range
    const completedTasks = await prisma.task.findMany({
      where: {
        status: "COMPLETED",
        endTime: {
          gte: dateStart,
          lte: dateEnd
        }
      },
      select: {
        id: true,
        assignedToId: true,
        taskType: true,
        durationSec: true,
        endTime: true,
        createdAt: true,
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Calculate targets based on actual workload during this period
    const targets = calculateDynamicTargets(completedTasks, dateStart, dateEnd);

    // Get unique agents who completed tasks in this period
    const agentIds = Array.from(new Set(completedTasks.map(t => t.assignedToId).filter(Boolean))) as string[];
    
    if (agentIds.length === 0) {
      return NextResponse.json({
        success: true,
        period: { start: dateStart.toISOString(), end: dateEnd.toISOString(), days: daysDiff },
        targets,
        agents: [],
        message: "No completed tasks found in this period"
      });
    }

    // Calculate scorecard for each agent
    const agentScores = await Promise.all(
      agentIds.map(async (agentId) => {
        const agentTasks = completedTasks.filter(t => t.assignedToId === agentId);
        const agent = agentTasks[0]?.assignedTo;
        
        if (!agent) return null;

        return calculateAgentScore(agent, agentTasks, targets, dateStart, dateEnd);
      })
    );

    // Filter out nulls and sort by overall score descending
    const validScores = agentScores.filter(Boolean) as AgentScorecard[];
    validScores.sort((a, b) => b.overallScore - a.overallScore);

    // Assign ranks and tiers
    const rankedAgents = validScores.map((agent, index) => {
      const rank = index + 1;
      const percentile = ((validScores.length - rank) / validScores.length) * 100;
      
      // Assign tier based on percentile and score
      let tier: string;
      let tierBadge: string;
      
      if (percentile >= 90 || agent.overallScore >= 120) {
        tier = "Elite";
        tierBadge = "🔥";
      } else if (percentile >= 75 || agent.overallScore >= 100) {
        tier = "High Performer";
        tierBadge = "⭐";
      } else if (percentile >= 50 || agent.overallScore >= 80) {
        tier = "On Track";
        tierBadge = "✅";
      } else {
        tier = "Needs Support";
        tierBadge = "⚠️";
      }

      return {
        ...agent,
        rank,
        percentile: Math.round(percentile),
        tier,
        tierBadge
      };
    });

    // If specific agent requested, include detailed breakdown
    if (agentId) {
      const agentData = rankedAgents.find(a => a.id === agentId);
      if (agentData) {
        const detailedBreakdown = await calculateDetailedBreakdown(
          agentId,
          completedTasks.filter(t => t.assignedToId === agentId),
          dateStart,
          dateEnd
        );
        return NextResponse.json({
          success: true,
          period: { start: dateStart.toISOString(), end: dateEnd.toISOString(), days: daysDiff },
          targets,
          agent: { ...agentData, ...detailedBreakdown }
        });
      }
    }

    return NextResponse.json({
      success: true,
      period: { start: dateStart.toISOString(), end: dateEnd.toISOString(), days: daysDiff },
      targets,
      agents: rankedAgents
    });

  } catch (error) {
    console.error("Error generating performance scorecard:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to generate scorecard",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Helper Types
// ============================================================================

interface TaskData {
  id: string;
  assignedToId: string | null;
  taskType: string;
  durationSec: number | null;
  endTime: Date;
  createdAt: Date;
  assignedTo?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
}

interface DynamicTargets {
  TEXT_CLUB: { dailyTasks: number; handleTimeSec: number };
  WOD_IVCS: { dailyTasks: number; handleTimeSec: number };
  EMAIL_REQUESTS: { dailyTasks: number; handleTimeSec: number };
  HOLDS: { dailyTasks: number; handleTimeSec: number };
  STANDALONE_REFUNDS: { dailyTasks: number; handleTimeSec: number };
}

interface AgentScorecard {
  id: string;
  name: string;
  email: string;
  overallScore: number;
  volumeScore: number;
  speedScore: number;
  daysWorked: number;
  tasksCompleted: number;
  dailyAvg: number;
  avgHandleTimeSec: number;
  totalTimeSec: number;
  breakdown: {
    TEXT_CLUB: { count: number; avgSec: number; totalSec: number };
    WOD_IVCS: { count: number; avgSec: number; totalSec: number };
    EMAIL_REQUESTS: { count: number; avgSec: number; totalSec: number };
    HOLDS: { count: number; avgSec: number; totalSec: number };
    STANDALONE_REFUNDS: { count: number; avgSec: number; totalSec: number };
  };
}

// ============================================================================
// Target Calculation (Smart, Data-Driven)
// ============================================================================

function calculateDynamicTargets(tasks: TaskData[], dateStart: Date, dateEnd: Date): DynamicTargets {
  // Group tasks by day to calculate daily targets
  const tasksByDay = new Map<string, TaskData[]>();
  
  for (const task of tasks) {
    if (!task.endTime) continue;
    const dateKey = task.endTime.toISOString().split('T')[0];
    if (!tasksByDay.has(dateKey)) {
      tasksByDay.set(dateKey, []);
    }
    tasksByDay.get(dateKey)!.push(task);
  }

  const taskTypes = ["TEXT_CLUB", "WOD_IVCS", "EMAIL_REQUESTS", "HOLDS", "STANDALONE_REFUNDS"];
  const targets: any = {};

  for (const taskType of taskTypes) {
    const typeTasks = tasks.filter(t => t.taskType === taskType && t.durationSec);
    
    if (typeTasks.length === 0) {
      targets[taskType] = { dailyTasks: 0, handleTimeSec: 0 };
      continue;
    }

    // Calculate daily task target: avg tasks available per active agent per day
    const dailyVolumes: number[] = [];
    
    for (const [_, dayTasks] of tasksByDay) {
      const dayTypeTasks = dayTasks.filter(t => t.taskType === taskType);
      const activeAgents = new Set(dayTypeTasks.map(t => t.assignedToId).filter(Boolean)).size;
      
      if (activeAgents > 0) {
        dailyVolumes.push(dayTypeTasks.length / activeAgents);
      }
    }
    
    const avgDailyTarget = dailyVolumes.length > 0 
      ? dailyVolumes.reduce((a, b) => a + b, 0) / dailyVolumes.length 
      : 0;

    // Calculate handle time target: median of top 25% performers
    const agentAvgTimes = new Map<string, number[]>();
    
    for (const task of typeTasks) {
      if (!task.assignedToId || !task.durationSec) continue;
      if (!agentAvgTimes.has(task.assignedToId)) {
        agentAvgTimes.set(task.assignedToId, []);
      }
      agentAvgTimes.get(task.assignedToId)!.push(task.durationSec);
    }
    
    // Get avg handle time per agent
    const agentAvgs = Array.from(agentAvgTimes.entries()).map(([agentId, times]) => {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      return avg;
    }).sort((a, b) => a - b); // Sort ascending (fastest first)
    
    // Top quartile benchmark (25th percentile = fastest 25%)
    const topQuartileIndex = Math.floor(agentAvgs.length * 0.25);
    const targetHandleTime = agentAvgs.length > 0 
      ? (agentAvgs[topQuartileIndex] || agentAvgs[0]) 
      : 0;

    targets[taskType] = {
      dailyTasks: Math.round(avgDailyTarget * 10) / 10, // Round to 1 decimal
      handleTimeSec: Math.round(targetHandleTime)
    };
  }

  return targets as DynamicTargets;
}

// ============================================================================
// Agent Score Calculation
// ============================================================================

function calculateAgentScore(
  agent: { id: string; name: string | null; email: string },
  tasks: TaskData[],
  targets: DynamicTargets,
  dateStart: Date,
  dateEnd: Date
): AgentScorecard {
  // Calculate days worked (days where agent completed at least one task)
  const workedDates = new Set(
    tasks.map(t => t.endTime.toISOString().split('T')[0])
  );
  const daysWorked = workedDates.size;

  // Total tasks completed
  const tasksCompleted = tasks.length;
  
  // Daily average (tasks per worked day, not calendar day)
  const dailyAvg = daysWorked > 0 ? tasksCompleted / daysWorked : 0;

  // Overall avg handle time
  const tasksWithDuration = tasks.filter(t => t.durationSec);
  const avgHandleTimeSec = tasksWithDuration.length > 0
    ? tasksWithDuration.reduce((sum, t) => sum + (t.durationSec || 0), 0) / tasksWithDuration.length
    : 0;
  
  // Total time spent
  const totalTimeSec = tasks.reduce((sum, t) => sum + (t.durationSec || 0), 0);

  // Breakdown by task type
  const breakdown: any = {};
  const taskTypes = ["TEXT_CLUB", "WOD_IVCS", "EMAIL_REQUESTS", "HOLDS", "STANDALONE_REFUNDS"];
  
  for (const taskType of taskTypes) {
    const typeTasks = tasks.filter(t => t.taskType === taskType);
    const typeTasksWithDuration = typeTasks.filter(t => t.durationSec);
    
    breakdown[taskType] = {
      count: typeTasks.length,
      avgSec: typeTasksWithDuration.length > 0 
        ? typeTasksWithDuration.reduce((sum, t) => sum + (t.durationSec || 0), 0) / typeTasksWithDuration.length
        : 0,
      totalSec: typeTasks.reduce((sum, t) => sum + (t.durationSec || 0), 0)
    };
  }

  // Calculate Volume Score (60% weight)
  // Compare daily avg vs target for each task type
  let volumeScore = 0;
  let volumeWeight = 0;
  
  for (const taskType of taskTypes) {
    const typeCount = breakdown[taskType].count;
    if (typeCount === 0) continue;
    
    const typeDailyAvg = typeCount / Math.max(daysWorked, 1);
    const target = (targets as any)[taskType]?.dailyTasks || 0;
    
    if (target > 0) {
      const typeScore = (typeDailyAvg / target) * 100;
      volumeScore += typeScore * typeCount; // Weight by task count
      volumeWeight += typeCount;
    }
  }
  
  volumeScore = volumeWeight > 0 ? volumeScore / volumeWeight : 100;

  // Calculate Speed Score (40% weight)
  // Compare avg handle time vs target (lower is better, so invert)
  let speedScore = 0;
  let speedWeight = 0;
  
  for (const taskType of taskTypes) {
    const typeAvgSec = breakdown[taskType].avgSec;
    const typeCount = breakdown[taskType].count;
    if (typeCount === 0 || typeAvgSec === 0) continue;
    
    const targetSec = (targets as any)[taskType]?.handleTimeSec || 0;
    
    if (targetSec > 0) {
      // Invert: if agent is faster, score is higher
      const typeScore = (targetSec / typeAvgSec) * 100;
      speedScore += typeScore * typeCount; // Weight by task count
      speedWeight += typeCount;
    }
  }
  
  speedScore = speedWeight > 0 ? speedScore / speedWeight : 100;

  // Overall Score: 60% Volume + 40% Speed
  const overallScore = Math.round((volumeScore * 0.6) + (speedScore * 0.4));

  return {
    id: agent.id,
    name: agent.name || agent.email,
    email: agent.email,
    overallScore,
    volumeScore: Math.round(volumeScore),
    speedScore: Math.round(speedScore),
    daysWorked,
    tasksCompleted,
    dailyAvg: Math.round(dailyAvg * 10) / 10,
    avgHandleTimeSec: Math.round(avgHandleTimeSec),
    totalTimeSec: Math.round(totalTimeSec),
    breakdown
  };
}

// ============================================================================
// Detailed Breakdown (for drill-down view)
// ============================================================================

async function calculateDetailedBreakdown(
  agentId: string,
  tasks: TaskData[],
  dateStart: Date,
  dateEnd: Date
) {
  // Days worked (distinct dates where agent completed tasks)
  const workedDates = new Set(
    tasks.map(t => t.endTime.toISOString().split('T')[0])
  );
  const daysWorked = workedDates.size;
  
  // Calculate total calendar days
  const totalDays = Math.ceil((dateEnd.getTime() - dateStart.getTime()) / (1000 * 60 * 60 * 24));
  const daysOff = totalDays - daysWorked;
  const attendanceRate = Math.round((daysWorked / totalDays) * 100);

  // Daily performance (tasks per day)
  const dailyPerformance = new Map<string, number>();
  for (const task of tasks) {
    const dateKey = task.endTime.toISOString().split('T')[0];
    dailyPerformance.set(dateKey, (dailyPerformance.get(dateKey) || 0) + 1);
  }

  const dailyTasks = Array.from(dailyPerformance.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Peak productivity hours (hour of day analysis)
  const hourlyPerformance = new Map<number, number>();
  for (const task of tasks) {
    const hour = task.endTime.getHours();
    hourlyPerformance.set(hour, (hourlyPerformance.get(hour) || 0) + 1);
  }

  const peakHours = Array.from(hourlyPerformance.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5); // Top 5 hours

  // Handle time distribution
  const handleTimeBuckets = {
    under2min: 0,
    twoToThree: 0,
    threeToFive: 0,
    overFive: 0
  };

  for (const task of tasks) {
    if (!task.durationSec) continue;
    const minutes = task.durationSec / 60;
    
    if (minutes < 2) handleTimeBuckets.under2min++;
    else if (minutes < 3) handleTimeBuckets.twoToThree++;
    else if (minutes < 5) handleTimeBuckets.threeToFive++;
    else handleTimeBuckets.overFive++;
  }

  const totalWithDuration = Object.values(handleTimeBuckets).reduce((a, b) => a + b, 0);
  const distribution = {
    under2min: totalWithDuration > 0 ? Math.round((handleTimeBuckets.under2min / totalWithDuration) * 100) : 0,
    twoToThree: totalWithDuration > 0 ? Math.round((handleTimeBuckets.twoToThree / totalWithDuration) * 100) : 0,
    threeToFive: totalWithDuration > 0 ? Math.round((handleTimeBuckets.threeToFive / totalWithDuration) * 100) : 0,
    overFive: totalWithDuration > 0 ? Math.round((handleTimeBuckets.overFive / totalWithDuration) * 100) : 0
  };

  return {
    workSchedule: {
      daysWorked,
      daysOff,
      totalDays,
      attendanceRate
    },
    dailyPerformance: dailyTasks,
    peakHours,
    handleTimeDistribution: distribution
  };
}

// ============================================================================
// Format Helpers
// ============================================================================

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}m ${secs}s`;
}

