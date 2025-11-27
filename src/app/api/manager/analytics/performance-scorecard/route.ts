import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTaskWeight, getAllWeights, WEIGHT_SUMMARY } from "@/lib/task-weights";

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

    // Parse dates with PST timezone boundaries (matching Agent Status API)
    // PST = UTC - 8 hours, so PST day boundaries are:
    // Start: 8:00 AM UTC on the given date (12:00 AM PST)
    // End: 7:59 AM UTC on the next day (11:59 PM PST)
    const parsePSTDate = (dateStr: string) => {
      const [year, month, day] = dateStr.split('-').map(Number);
      return { year, month: month - 1, day }; // month is 0-indexed
    };

    let dateStart: Date;
    let dateEnd: Date;

    if (dateStartStr && dateEndStr) {
      // Parse provided dates as PST days
      const startParts = parsePSTDate(dateStartStr);
      const endParts = parsePSTDate(dateEndStr);
      dateStart = new Date(Date.UTC(startParts.year, startParts.month, startParts.day, 8, 0, 0, 0));
      dateEnd = new Date(Date.UTC(endParts.year, endParts.month, endParts.day + 1, 7, 59, 59, 999));
    } else {
      // Default to last 30 days in PST
      const now = new Date();
      const pstOffset = -8 * 60 * 60 * 1000; // PST = UTC - 8 hours
      const nowPST = new Date(now.getTime() + pstOffset);
      const year = nowPST.getUTCFullYear();
      const month = nowPST.getUTCMonth();
      const day = nowPST.getUTCDate();
      
      // End: 7:59 AM UTC on next day (11:59 PM PST today)
      dateEnd = new Date(Date.UTC(year, month, day + 1, 7, 59, 59, 999));
      // Start: 8:00 AM UTC 30 days ago (12:00 AM PST 30 days ago)
      dateStart = new Date(Date.UTC(year, month, day - 29, 8, 0, 0, 0)); // -29 because we include today
    }

    const daysDiff = Math.ceil((dateEnd.getTime() - dateStart.getTime()) / (1000 * 60 * 60 * 24));

    // Get all completed tasks in the date range
    // Include both assignedToId and completedBy to catch all completions (especially for Holds)
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
        completedBy: true, // Include completedBy for Holds tasks that were unassigned
        taskType: true,
        disposition: true, // Added for weighted scoring
        durationSec: true,
        endTime: true,
        createdAt: true,
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
      }
    });

    // Calculate targets based on actual workload during this period
    const targets = calculateDynamicTargets(completedTasks, dateStart, dateEnd);

    // Get unique agents who completed tasks in this period
    // Include both assignedToId and completedBy to catch all agents
    const agentIdsFromAssigned = completedTasks.map(t => t.assignedToId).filter(Boolean) as string[];
    const agentIdsFromCompletedBy = completedTasks.map(t => t.completedBy).filter(Boolean) as string[];
    const agentIds = Array.from(new Set([...agentIdsFromAssigned, ...agentIdsFromCompletedBy])) as string[];
    
    if (allUniqueAgentIds.length === 0) {
      return NextResponse.json({
        success: true,
        period: { start: dateStart.toISOString(), end: dateEnd.toISOString(), days: daysDiff },
        targets,
        agents: [],
        message: "No completed tasks found in this period"
      });
    }

    // Get Trello completions for this period
    const trelloCompletions = await prisma.trelloCompletion.findMany({
      where: {
        date: {
          gte: dateStart,
          lte: dateEnd
        }
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Group Trello completions by agent
    const trelloByAgent = trelloCompletions.reduce((acc, tc) => {
      if (!acc[tc.agentId]) {
        acc[tc.agentId] = 0;
      }
      acc[tc.agentId] += tc.cardsCount;
      return acc;
    }, {} as Record<string, number>);

    // Also get dates where agents did Trello work (for days worked calculation)
    // Only count days with 15+ Trello requests as "days worked" to filter out misdated imports
    const TRELLO_DAY_THRESHOLD = 15; // Minimum Trello requests to count as a full work day
    const trelloDates = trelloCompletions.reduce((acc, tc) => {
      // Only count days with 15+ Trello requests as work days
      if (tc.cardsCount >= TRELLO_DAY_THRESHOLD) {
        if (!acc[tc.agentId]) {
          acc[tc.agentId] = new Set();
        }
        acc[tc.agentId].add(tc.date.toISOString().split('T')[0]);
      }
      return acc;
    }, {} as Record<string, Set<string>>);

    // Combine portal agents with Trello-only agents
    const allAgentIds = Array.from(new Set([
      ...allUniqueAgentIds,
      ...Object.keys(trelloByAgent)
    ]));
    
    console.log(`[Performance Scorecard] Total agent IDs (including Trello): ${allAgentIds.length}`);

    // Fetch all agent data upfront to filter out Holds-only agents
    const agentsWithTypes = await prisma.user.findMany({
      where: {
        id: { in: allAgentIds }
      },
      select: {
        id: true,
        agentTypes: true
      }
    });

    // Create a map of Holds-only agents for quick lookup
    // An agent is "Holds-only" if their agentTypes array contains ONLY "HOLDS" (case-sensitive)
    // IMPORTANT: Empty agentTypes arrays default to TEXT_CLUB (legacy agents), so they are NOT Holds-only
    const holdsOnlyAgentIds = new Set(
      agentsWithTypes
        .filter(agent => {
          // Must have agentTypes array
          if (!agent.agentTypes || !Array.isArray(agent.agentTypes)) {
            // Empty/null agentTypes = legacy agent = TEXT_CLUB, NOT Holds-only
            return false;
          }
          // Empty array = legacy agent = TEXT_CLUB, NOT Holds-only
          if (agent.agentTypes.length === 0) {
            return false;
          }
          // Must have exactly 1 type
          if (agent.agentTypes.length !== 1) {
            return false;
          }
          // That type must be "HOLDS" (case-sensitive match)
          const isHoldsOnly = agent.agentTypes[0] === 'HOLDS';
          
          // Debug logging for Holds-only agents
          if (isHoldsOnly) {
            console.log(`[Performance Scorecard] Found Holds-only agent: ${agent.id}, agentTypes:`, agent.agentTypes);
          }
          
          return isHoldsOnly;
        })
        .map(agent => agent.id)
    );
    
    // Debug: Log all agents and their types
    console.log(`[Performance Scorecard] Total agents with types: ${agentsWithTypes.length}`);
    console.log(`[Performance Scorecard] Holds-only agents found: ${holdsOnlyAgentIds.size}`);
    agentsWithTypes.forEach(agent => {
      console.log(`[Performance Scorecard] Agent ${agent.id}: agentTypes =`, agent.agentTypes || 'null/undefined');
    });

    // Filter out Holds-only agents from the list
    const filteredAgentIds = allAgentIds.filter(agentId => !holdsOnlyAgentIds.has(agentId));

    // Calculate scorecard for each agent (Holds-only agents already filtered out)
    const agentScores = await Promise.all(
      filteredAgentIds.map(async (agentId) => {
        // Include tasks where agent is assigned OR where agent completed it (for Holds unassigning dispos)
        const agentTasks = completedTasks.filter(t => 
          t.assignedToId === agentId || t.completedBy === agentId
        );
        
        // ADDITIONAL CHECK: If agent only completed Holds tasks (and no Trello), exclude them
        // This catches cases where agentTypes might be empty/incorrect but they only work on Holds
        const taskTypes = new Set(agentTasks.map(t => t.taskType));
        const hasOnlyHoldsTasks = taskTypes.size === 1 && taskTypes.has('HOLDS') && !trelloByAgent[agentId];
        
        // Also check if agent is in the holdsOnlyAgentIds set (double-check)
        if (holdsOnlyAgentIds.has(agentId)) {
          console.log(`[Performance Scorecard] Excluding agent ${agentId}: Found in holdsOnlyAgentIds set`);
          return null; // Skip Holds-only agents
        }
        
        if (hasOnlyHoldsTasks) {
          console.log(`[Performance Scorecard] Excluding agent ${agentId}: Only completed Holds tasks (no other task types, no Trello)`);
          return null; // Skip agents who only did Holds work
        }
        
        // Try to get agent from assigned tasks first
        let agent = agentTasks.find(t => t.assignedToId === agentId)?.assignedTo;
        
        // If not found, try from completedBy
        if (!agent) {
          agent = agentTasks.find(t => t.completedBy === agentId)?.completedByUser;
        }
        
        // If agent has no portal tasks, fetch from Trello completion
        if (!agent && trelloByAgent[agentId]) {
          const trelloEntry = trelloCompletions.find(tc => tc.agentId === agentId);
          agent = trelloEntry?.agent;
        }
        
        if (!agent) return null;

        const trelloCount = trelloByAgent[agentId] || 0;
        const trelloWorkDates = trelloDates[agentId] || new Set();
        return calculateAgentScore(agent, agentTasks, targets, dateStart, dateEnd, trelloCount, trelloWorkDates);
      })
    );

    // Filter out nulls and separate eligible vs ineligible agents
    const validScores = agentScores.filter(Boolean) as AgentScorecard[];
    
    console.log(`[Performance Scorecard] Valid scores after filtering nulls: ${validScores.length}`);
    
    // Filter out Holds-only agents (similar to how seniors are filtered in sprint-rankings)
    // This is a double-check to ensure Holds-only agents are excluded even if they somehow got through
    const nonHoldsAgents = validScores.filter(agent => {
      // Check if this agent is in the holdsOnlyAgentIds set
      if (holdsOnlyAgentIds.has(agent.id)) {
        console.log(`[Performance Scorecard] Removing Holds-only agent from validScores: ${agent.id} (${agent.name || agent.email})`);
        return false; // Exclude Holds-only agents
      }
      return true; // Include all other agents
    });
    
    console.log(`[Performance Scorecard] Non-Holds agents after filter: ${nonHoldsAgents.length} (removed ${validScores.length - nonHoldsAgents.length})`);
    
    const eligibleAgents = nonHoldsAgents.filter(a => a.isEligible);
    const ineligibleAgents = nonHoldsAgents.filter(a => !a.isEligible);
    
    // Sort eligible agents by overall score descending
    eligibleAgents.sort((a, b) => b.overallScore - a.overallScore);

    // Assign ranks and tiers to eligible agents only
    const rankedAgents = eligibleAgents.map((agent, index) => {
      const rank = index + 1;
      const percentile = ((eligibleAgents.length - rank) / eligibleAgents.length) * 100;
      
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

    // Add ineligible agents at the end with special tier
    const ineligibleRanked = ineligibleAgents.map((agent) => ({
      ...agent,
      rank: null,
      percentile: 0,
      tier: "Insufficient Data",
      tierBadge: "📊"
    }));

    // Combine: eligible agents first (ranked), then ineligible
    let allAgents = [...rankedAgents, ...ineligibleRanked];

    // FINAL SAFETY CHECK: Filter out any Holds-only agents that somehow got through
    // Fetch agentTypes for all agents in the final list to ensure none are Holds-only
    const finalAgentIds = allAgents.map(a => a.id);
    const finalAgentTypesCheck = await prisma.user.findMany({
      where: { id: { in: finalAgentIds } },
      select: { id: true, email: true, name: true, agentTypes: true }
    });

    const finalHoldsOnlySet = new Set(
      finalAgentTypesCheck
        .filter(agent => {
          if (!agent.agentTypes || !Array.isArray(agent.agentTypes) || agent.agentTypes.length === 0) {
            return false; // Empty = TEXT_CLUB, not Holds-only
          }
          const isHoldsOnly = agent.agentTypes.length === 1 && agent.agentTypes[0] === 'HOLDS';
          
          // Debug logging
          if (isHoldsOnly) {
            console.log(`[Performance Scorecard] FINAL CHECK: Removing Holds-only agent: ${agent.email} (${agent.name}), agentTypes:`, agent.agentTypes);
          }
          
          return isHoldsOnly;
        })
        .map(agent => agent.id)
    );

    // Debug: Log what we're filtering
    console.log(`[Performance Scorecard] Final check: ${allAgents.length} agents before filter, ${finalHoldsOnlySet.size} Holds-only to remove`);

    // Remove any Holds-only agents from the final list
    const beforeCount = allAgents.length;
    allAgents = allAgents.filter(agent => !finalHoldsOnlySet.has(agent.id));
    const afterCount = allAgents.length;
    
    console.log(`[Performance Scorecard] Final filter: ${beforeCount} -> ${afterCount} agents (removed ${beforeCount - afterCount})`);

    // Recalculate eligible/ineligible counts after final filter
    const finalEligibleCount = allAgents.filter(a => a.rank !== null).length;
    const finalIneligibleCount = allAgents.filter(a => a.rank === null).length;

    // If specific agent requested, include detailed breakdown
    if (agentId) {
      const agentData = allAgents.find(a => a.id === agentId);
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
      agents: allAgents,
      eligibleCount: finalEligibleCount,
      ineligibleCount: finalIneligibleCount,
      weightIndex: {
        summary: WEIGHT_SUMMARY,
        dispositions: getAllWeights()
      }
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
  disposition: string | null; // Added for weighted scoring
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
  YOTPO: { dailyTasks: number; handleTimeSec: number };
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
  weightedPoints: number; // NEW: Total weighted points
  weightedDailyAvg: number; // NEW: Weighted points per day
  avgHandleTimeSec: number;
  totalTimeSec: number;
  breakdown: {
    TEXT_CLUB: { count: number; avgSec: number; totalSec: number; weightedPoints: number };
    WOD_IVCS: { count: number; avgSec: number; totalSec: number; weightedPoints: number };
    EMAIL_REQUESTS: { count: number; avgSec: number; totalSec: number; weightedPoints: number };
    YOTPO: { count: number; avgSec: number; totalSec: number; weightedPoints: number };
    HOLDS: { count: number; avgSec: number; totalSec: number; weightedPoints: number };
    STANDALONE_REFUNDS: { count: number; avgSec: number; totalSec: number; weightedPoints: number };
    TRELLO: { count: number; avgSec: number; totalSec: number; weightedPoints: number };
  };
  isEligible: boolean;
  minimumTasks: number;
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

  const taskTypes = ["TEXT_CLUB", "WOD_IVCS", "EMAIL_REQUESTS", "YOTPO", "HOLDS", "STANDALONE_REFUNDS"];
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
  dateEnd: Date,
  trelloCount: number = 0,
  trelloWorkDates: Set<string> = new Set()
): AgentScorecard {
  // Calculate days worked (days where agent completed at least one task - Portal OR Trello)
  const portalWorkedDates = new Set(
    tasks.map(t => t.endTime.toISOString().split('T')[0])
  );
  
  // Combine portal and Trello work dates
  const allWorkedDates = new Set([...portalWorkedDates, ...trelloWorkDates]);
  const daysWorked = allWorkedDates.size;

  // Total tasks completed (Portal + Trello)
  const portalTasksCompleted = tasks.length;
  const tasksCompleted = portalTasksCompleted + trelloCount;
  
  // Daily average (tasks per worked day, not calendar day)
  const dailyAvg = daysWorked > 0 ? tasksCompleted / daysWorked : 0;

  // Overall avg handle time
  const tasksWithDuration = tasks.filter(t => t.durationSec);
  const avgHandleTimeSec = tasksWithDuration.length > 0
    ? tasksWithDuration.reduce((sum, t) => sum + (t.durationSec || 0), 0) / tasksWithDuration.length
    : 0;
  
  // Total time spent
  const totalTimeSec = tasks.reduce((sum, t) => sum + (t.durationSec || 0), 0);

  // Breakdown by task type (including Trello) WITH WEIGHTED POINTS
  const breakdown: any = {};
  const taskTypes = ["TEXT_CLUB", "WOD_IVCS", "EMAIL_REQUESTS", "YOTPO", "HOLDS", "STANDALONE_REFUNDS"];
  
  let totalWeightedPoints = 0; // Track total weighted points across all tasks
  
  for (const taskType of taskTypes) {
    const typeTasks = tasks.filter(t => t.taskType === taskType);
    const typeTasksWithDuration = typeTasks.filter(t => t.durationSec);
    
    // Calculate weighted points for this task type
    const weightedPoints = typeTasks.reduce((sum, t) => {
      const weight = getTaskWeight(t.taskType, t.disposition);
      return sum + weight;
    }, 0);
    
    totalWeightedPoints += weightedPoints;
    
    breakdown[taskType] = {
      count: typeTasks.length,
      avgSec: typeTasksWithDuration.length > 0 
        ? typeTasksWithDuration.reduce((sum, t) => sum + (t.durationSec || 0), 0) / typeTasksWithDuration.length
        : 0,
      totalSec: typeTasks.reduce((sum, t) => sum + (t.durationSec || 0), 0),
      weightedPoints: Math.round(weightedPoints * 100) / 100 // Round to 2 decimals
    };
  }
  
  // Add Trello as a separate category
  const trelloWeightedPoints = trelloCount * getTaskWeight("TRELLO"); // Dynamic weight from task-weights.ts
  totalWeightedPoints += trelloWeightedPoints;
  
  breakdown.TRELLO = {
    count: trelloCount,
    avgSec: 0, // No handle time tracking for Trello
    totalSec: 0,
    weightedPoints: Math.round(trelloWeightedPoints * 100) / 100
  };
  
  // Calculate weighted daily average
  const weightedDailyAvg = daysWorked > 0 ? totalWeightedPoints / daysWorked : 0;

  // Minimum task threshold for ranking eligibility
  const MINIMUM_TASKS_FOR_RANKING = 20;
  const isEligible = tasksCompleted >= MINIMUM_TASKS_FOR_RANKING;

  // Calculate Volume Score (100% weight - pure productivity)
  // Use RAW daily average as the score (will be percentile-ranked later)
  // This ensures agents with higher daily averages rank higher, period.
  const volumeScore = Math.round(dailyAvg); // Raw daily average (not percentage)

  // Calculate Speed Score (informational only - NOT used in overall score)
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
  // Cap speed score at 150% to prevent spam-task skew
  speedScore = Math.min(speedScore, 150);

  // Overall Score: 100% Volume (Speed shown for info only)
  const overallScore = Math.round(volumeScore);

  return {
    id: agent.id,
    name: agent.name || agent.email,
    email: agent.email,
    overallScore,
    volumeScore: Math.round(volumeScore),
    speedScore: Math.round(speedScore),
    daysWorked,
    tasksCompleted,
    portalTasksCompleted,
    trelloCardsCompleted: trelloCount,
    dailyAvg: Math.round(dailyAvg * 10) / 10,
    weightedPoints: Math.round(totalWeightedPoints * 100) / 100, // NEW: Total weighted points
    weightedDailyAvg: Math.round(weightedDailyAvg * 100) / 100, // NEW: Weighted points per day
    avgHandleTimeSec: Math.round(avgHandleTimeSec),
    totalTimeSec: Math.round(totalTimeSec),
    breakdown,
    isEligible,
    minimumTasks: MINIMUM_TASKS_FOR_RANKING
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

  // Peak productivity hours (hour of day analysis in PST)
  const hourlyPerformance = new Map<number, number>();
  const dailyPerformanceDetailed = new Map<string, number>();
  
  for (const task of tasks) {
    // Get date in PST timezone for daily breakdown
    const pstDate = new Date(task.endTime.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const dateKey = pstDate.toISOString().split('T')[0];
    dailyPerformanceDetailed.set(dateKey, (dailyPerformanceDetailed.get(dateKey) || 0) + 1);
    
    // Get hour in PST timezone for hourly breakdown
    const pstHour = pstDate.getHours();
    hourlyPerformance.set(pstHour, (hourlyPerformance.get(pstHour) || 0) + 1);
  }

  // Use hourly breakdown only for single-day periods, daily for multi-day
  const isSingleDay = totalDays <= 1;
  
  const peakHours = isSingleDay 
    ? Array.from(hourlyPerformance.entries())
        .map(([hour, count]) => ({ hour, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5) // Top 5 hours
    : []; // For multi-day, we'll use daily performance instead
  
  const dailyBreakdown = !isSingleDay
    ? Array.from(dailyPerformanceDetailed.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10) // Top 10 days
    : [];

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
    topDays: dailyBreakdown, // Top performing days (for multi-day periods)
    handleTimeDistribution: distribution,
    isSingleDay
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

