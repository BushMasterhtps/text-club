import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { 
  getCurrentSprint, 
  getSprintDates, 
  formatSprintPeriod,
  isSeniorAgent 
} from '@/lib/sprint-utils';
import { getTaskWeight, getAllWeights, WEIGHT_SUMMARY } from '@/lib/task-weights';

const SPRINT_DURATION_DAYS = 14;

/**
 * Sprint Rankings API
 * Calculates and returns rankings for all 4 systems:
 * 1. Task/Day (Volume)
 * 2. Lifetime Weighted Points
 * 3. 2-Week Sprint Points
 * 4. Hybrid 30/70
 */

const MINIMUM_TASKS_FOR_RANKING = 20; // Lifetime minimum
const MINIMUM_DAYS_FOR_SPRINT = 3; // Must work 3 days in sprint to qualify

interface AgentScorecard {
  id: string;
  name: string;
  email: string;
  
  // Performance
  tasksCompleted: number;
  trelloCompleted: number;
  totalCompleted: number;
  daysWorked: number;
  
  // Scores
  weightedPoints: number;
  weightedDailyAvg: number;
  tasksPerDay: number;
  hybridScore: number;
  
  // Rankings
  rankByPtsPerDay: number;
  rankByTasksPerDay: number;
  rankByHybrid: number;
  lifetimeRank: number;
  
  // Metadata
  tier: string;
  percentile: number;
  avgHandleTimeSec: number;
  totalTimeSec: number;
  
  // Flags
  isSenior: boolean;
  isChampion: boolean;
  isTopThree: boolean;
  qualified: boolean;
}

function calculateTier(percentile: number): string {
  if (percentile >= 90) return 'Elite';
  if (percentile >= 75) return 'High Performer';
  if (percentile >= 50) return 'Solid Contributor';
  if (percentile >= 25) return 'Developing';
  return 'Needs Improvement';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'current'; // 'current', 'lifetime', 'sprint-{number}', or 'custom'
    
    // Custom date range support
    const customStart = searchParams.get('startDate');
    const customEnd = searchParams.get('endDate');
    
    let sprintStart: Date;
    let sprintEnd: Date;
    let isCurrentSprint = false;
    let sprintNumber = 0;

    if (mode === 'custom' && customStart && customEnd) {
      // Use custom date range (dates come from PST date picker, need to convert to UTC)
      // PST midnight = 8 AM UTC
      const [startYear, startMonth, startDay] = customStart.split('-').map(Number);
      const [endYear, endMonth, endDay] = customEnd.split('-').map(Number);
      
      sprintStart = new Date(Date.UTC(startYear, startMonth - 1, startDay, 8, 0, 0, 0)); // PST midnight = 8 AM UTC
      sprintEnd = new Date(Date.UTC(endYear, endMonth - 1, endDay + 1, 7, 59, 59, 999)); // PST 11:59 PM = next day 7:59 AM UTC
      isCurrentSprint = false;
      sprintNumber = 0; // Custom ranges don't have sprint numbers
    } else if (mode === 'lifetime') {
      // Lifetime mode - use all time
      sprintStart = new Date('2020-01-01T00:00:00.000Z');
      sprintEnd = new Date();
      isCurrentSprint = false;
      sprintNumber = 0;
    } else {
      // Sprint mode (current or specific sprint number)
      sprintNumber = mode.startsWith('sprint-') 
        ? parseInt(mode.split('-')[1]) 
        : getCurrentSprint().number;
      
      const dates = getSprintDates(sprintNumber);
      sprintStart = dates.start;
      sprintEnd = dates.end;
      isCurrentSprint = sprintNumber === getCurrentSprint().number;
    }

    // Get all agents (including seniors for tracking, but excluding Holds-only agents)
    const allAgents = await prisma.user.findMany({
      where: {
        role: { in: ['AGENT', 'MANAGER_AGENT'] },
        isLive: true
      },
      select: { id: true, name: true, email: true, agentTypes: true }
    });
    
    // Filter out Holds-only agents (agents who ONLY have HOLDS in agentTypes)
    const holdsOnlyAgentIds = new Set(
      allAgents
        .filter(agent => 
          agent.agentTypes && 
          Array.isArray(agent.agentTypes) && 
          agent.agentTypes.length === 1 && 
          agent.agentTypes[0] === 'HOLDS'
        )
        .map(agent => agent.id)
    );
    
    console.log(`[Sprint Rankings] Total agents: ${allAgents.length}, Holds-only agents: ${holdsOnlyAgentIds.size}`);
    
    // Filter out Holds-only agents
    const filteredAgents = allAgents.filter(agent => !holdsOnlyAgentIds.has(agent.id));
    
    console.log(`[Sprint Rankings] Filtered agents (excluding Holds-only): ${filteredAgents.length}`);

    const agentScorecards: AgentScorecard[] = [];

    for (const agent of filteredAgents) {
      const isSenior = isSeniorAgent(agent.email);

      // Get portal tasks completed in sprint (or lifetime)
      const portalTasks = await prisma.task.findMany({
        where: {
          assignedToId: agent.id,
          status: 'COMPLETED',
          endTime: mode === 'lifetime' 
            ? { not: null } 
            : { gte: sprintStart, lte: sprintEnd },
          disposition: { not: null },
          durationSec: { not: null }
        },
        select: {
          disposition: true,
          durationSec: true,
          endTime: true,
          taskType: true
        }
      });

      // Get Trello completions in sprint (or lifetime)
      // Handle 1-day lag: Only count Trello up to yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(23, 59, 59, 999);

      const trelloEndDate = isCurrentSprint && mode !== 'lifetime'
        ? (yesterday < sprintEnd ? yesterday : sprintEnd)
        : (mode === 'lifetime' ? yesterday : sprintEnd);

      const trelloCompletions = await prisma.trelloCompletion.findMany({
        where: {
          agentId: agent.id,
          date: mode === 'lifetime'
            ? { lte: trelloEndDate }
            : { gte: sprintStart, lte: trelloEndDate }
        },
        select: {
          cardsCount: true,
          date: true
        }
      });

      const trelloCount = trelloCompletions.reduce((sum, t) => sum + t.cardsCount, 0);
      // Only count days with 15+ Trello requests as "days worked" to filter out misdated imports
      const TRELLO_DAY_THRESHOLD = 15; // Minimum Trello requests to count as a full work day
      const trelloWorkDates = new Set(
        trelloCompletions
          .filter(t => t.cardsCount >= TRELLO_DAY_THRESHOLD)
          .map(t => t.date.toISOString().split('T')[0])
      );

      // Calculate weighted points and task type breakdown
      let totalWeightedPoints = 0;
      let totalHandleTimeSec = 0;
      const breakdown: Record<string, { 
        count: number; 
        weightedPoints: number; 
        avgSec: number; 
        totalSec: number;
        dispositions?: Array<{
          disposition: string;
          count: number;
          points: number;
          avgTime: string;
          totalSec: number;
        }>;
      }> = {};
      
      // Track dispositions per task type
      const dispositionTracker: Record<string, Record<string, { count: number; points: number; totalSec: number }>> = {};
      
      // NEW: Hourly and daily productivity tracking
      const hourlyBreakdown: Record<number, { count: number; points: number }> = {};
      const dailyBreakdown: Record<string, { count: number; points: number; activeHours: number }> = {};

      for (const task of portalTasks) {
        const weight = getTaskWeight(task.taskType, task.disposition);
        totalWeightedPoints += weight;
        totalHandleTimeSec += task.durationSec || 0;

        // Track breakdown by task type
        if (!breakdown[task.taskType]) {
          breakdown[task.taskType] = { count: 0,  weightedPoints: 0, avgSec: 0, totalSec: 0 };
        }
        breakdown[task.taskType].count++;
        breakdown[task.taskType].weightedPoints += weight;
        breakdown[task.taskType].totalSec += task.durationSec || 0;
        
        // Track disposition within task type
        if (task.disposition) {
          if (!dispositionTracker[task.taskType]) {
            dispositionTracker[task.taskType] = {};
          }
          if (!dispositionTracker[task.taskType][task.disposition]) {
            dispositionTracker[task.taskType][task.disposition] = { count: 0, points: 0, totalSec: 0 };
          }
          dispositionTracker[task.taskType][task.disposition].count++;
          dispositionTracker[task.taskType][task.disposition].points += weight;
          dispositionTracker[task.taskType][task.disposition].totalSec += task.durationSec || 0;
        }
        
        // NEW: Track hourly and daily productivity (PST timezone)
        if (task.endTime) {
          const pstOffset = -8 * 60 * 60 * 1000; // PST = UTC - 8
          const endTimePST = new Date(task.endTime.getTime() + pstOffset);
          const hour = endTimePST.getUTCHours(); // 0-23
          const dayKey = endTimePST.toISOString().split('T')[0]; // YYYY-MM-DD
          
          // Hourly breakdown
          if (!hourlyBreakdown[hour]) {
            hourlyBreakdown[hour] = { count: 0, points: 0 };
          }
          hourlyBreakdown[hour].count++;
          hourlyBreakdown[hour].points += weight;
          
          // Daily breakdown
          if (!dailyBreakdown[dayKey]) {
            dailyBreakdown[dayKey] = { count: 0, points: 0, activeHours: 0 };
          }
          dailyBreakdown[dayKey].count++;
          dailyBreakdown[dayKey].points += weight;
          if (task.durationSec) {
            dailyBreakdown[dayKey].activeHours += task.durationSec / 3600;
          }
        }
      }

      // Calculate averages for each task type
      for (const taskType in breakdown) {
        if (breakdown[taskType].count > 0) {
          breakdown[taskType].avgSec = Math.round(breakdown[taskType].totalSec / breakdown[taskType].count);
        }
      }
      
      // Add disposition details to breakdown
      for (const taskType in dispositionTracker) {
        const dispositions = Object.entries(dispositionTracker[taskType]).map(([disposition, data]) => {
          const avgSec = data.count > 0 ? Math.round(data.totalSec / data.count) : 0;
          const minutes = Math.floor(avgSec / 60);
          const seconds = avgSec % 60;
          const avgTime = `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
          
          return {
            disposition,
            count: data.count,
            points: Math.round(data.points * 100) / 100,
            avgTime,
            totalSec: data.totalSec
          };
        });
        
        // Sort by count descending
        dispositions.sort((a, b) => b.count - a.count);
        
        if (breakdown[taskType]) {
          breakdown[taskType].dispositions = dispositions;
        }
      }

      // Add Trello points (using dynamic weight from task-weights.ts)
      const trelloWeight = getTaskWeight("TRELLO");
      totalWeightedPoints += trelloCount * trelloWeight;
      if (trelloCount > 0) {
        breakdown.TRELLO = {
          count: trelloCount,
          weightedPoints: trelloCount * trelloWeight,
          avgSec: 0, // No handle time for Trello
          totalSec: 0
        };
      }

      // Calculate days worked
      const portalWorkDates = new Set(
        portalTasks
          .filter(t => t.endTime)
          .map(t => t.endTime!.toISOString().split('T')[0])
      );

      const allWorkDates = new Set([...portalWorkDates, ...trelloWorkDates]);
      const daysWorked = allWorkDates.size;

      // Calculate metrics
      const totalCompleted = portalTasks.length + trelloCount;
      const avgHandleTimeSec = portalTasks.length > 0 
        ? Math.round(totalHandleTimeSec / portalTasks.length) 
        : 0;

      // Skip if no work done
      if (totalCompleted === 0 || daysWorked === 0) continue;

      const weightedDailyAvg = totalWeightedPoints / daysWorked;
      const tasksPerDay = totalCompleted / daysWorked;

      // Calculate active hours from task completion times (NEW for efficiency rankings)
      const activeHours = totalHandleTimeSec / 3600; // Convert seconds to hours
      const ptsPerActiveHour = activeHours > 0 ? totalWeightedPoints / activeHours : 0;
      const tasksPerActiveHour = activeHours > 0 ? totalCompleted / activeHours : 0;

      agentScorecards.push({
        id: agent.id,
        name: agent.name || agent.email,
        email: agent.email,
        tasksCompleted: portalTasks.length,
        trelloCompleted: trelloCount,
        totalCompleted,
        totalTasks: totalCompleted, // Alias for frontend compatibility
        daysWorked,
        weightedPoints: totalWeightedPoints,
        weightedDailyAvg,
        tasksPerDay,
        activeHours, // NEW
        ptsPerActiveHour, // NEW
        tasksPerActiveHour, // NEW
        hybridScore: 0, // Will calculate after normalization
        rankByPtsPerDay: 0,
        rankByTasksPerDay: 0,
        rankByPtsPerHour: 0, // NEW: Efficiency ranking
        rankByHybrid: 0,
        lifetimeRank: 0,
        tier: '',
        percentile: 0,
        avgHandleTimeSec,
        totalTimeSec: totalHandleTimeSec,
        breakdown, // Add task type breakdown
        hourlyBreakdown, // NEW: Hourly productivity
        dailyBreakdown, // NEW: Daily productivity
        isSenior,
        isChampion: false,
        isTopThree: false,
        qualified: mode === 'lifetime' 
          ? totalCompleted >= MINIMUM_TASKS_FOR_RANKING
          : mode === 'custom'
            ? totalCompleted >= 1 // Custom ranges: Just need 1 task
            : daysWorked >= MINIMUM_DAYS_FOR_SPRINT // Sprint mode: Need 3 days
      });
    }

    // Separate competitive agents from seniors
    const competitiveAgents = agentScorecards.filter(a => !a.isSenior && a.qualified);
    const seniorAgents = agentScorecards.filter(a => a.isSenior);
    const unqualified = agentScorecards.filter(a => !a.isSenior && !a.qualified);

    // Calculate team averages for comparison
    const teamAverages = {
      tasksPerDay: 0,
      ptsPerDay: 0,
      ptsPerHour: 0, // NEW
      activeHours: 0, // NEW
      avgHandleTimeSec: 0,
      hybridScore: 0
    };

    if (competitiveAgents.length > 0) {
      teamAverages.tasksPerDay = competitiveAgents.reduce((sum, a) => sum + a.tasksPerDay, 0) / competitiveAgents.length;
      teamAverages.ptsPerDay = competitiveAgents.reduce((sum, a) => sum + a.weightedDailyAvg, 0) / competitiveAgents.length;
      teamAverages.ptsPerHour = competitiveAgents.reduce((sum, a) => sum + a.ptsPerActiveHour, 0) / competitiveAgents.length;
      teamAverages.activeHours = competitiveAgents.reduce((sum, a) => sum + a.activeHours, 0) / competitiveAgents.length;
      teamAverages.avgHandleTimeSec = competitiveAgents.reduce((sum, a) => sum + a.avgHandleTimeSec, 0) / competitiveAgents.length;
    }

    // Calculate hybrid scores (30% volume + 70% complexity)
    // Normalize both metrics to 0-100 scale before combining
    if (competitiveAgents.length > 0) {
      const maxTasksPerDay = Math.max(...competitiveAgents.map(a => a.tasksPerDay));
      const maxPtsPerDay = Math.max(...competitiveAgents.map(a => a.weightedDailyAvg));

      for (const agent of competitiveAgents) {
        const volumeScore = (agent.tasksPerDay / maxTasksPerDay) * 100;
        const complexityScore = (agent.weightedDailyAvg / maxPtsPerDay) * 100;
        
        agent.hybridScore = (volumeScore * 0.30) + (complexityScore * 0.70);
      }

      // Calculate team average hybrid score
      teamAverages.hybridScore = competitiveAgents.reduce((sum, a) => sum + a.hybridScore, 0) / competitiveAgents.length;
    }

    // RANK BY WEIGHTED POINTS/DAY
    competitiveAgents.sort((a, b) => b.weightedDailyAvg - a.weightedDailyAvg);
    competitiveAgents.forEach((agent, index) => {
      agent.rankByPtsPerDay = index + 1;
      agent.percentile = Math.round(((competitiveAgents.length - index) / competitiveAgents.length) * 100);
      agent.tier = calculateTier(agent.percentile);
    });

    // RANK BY TASKS/DAY  
    const tasksSorted = [...competitiveAgents].sort((a, b) => b.tasksPerDay - a.tasksPerDay);
    tasksSorted.forEach((agent, index) => {
      const original = competitiveAgents.find(a => a.id === agent.id)!;
      original.rankByTasksPerDay = index + 1;
    });

    // RANK BY PTS/HOUR (Efficiency - NEW!)
    const efficiencySorted = [...competitiveAgents].sort((a, b) => b.ptsPerActiveHour - a.ptsPerActiveHour);
    efficiencySorted.forEach((agent, index) => {
      const original = competitiveAgents.find(a => a.id === agent.id)!;
      original.rankByPtsPerHour = index + 1;
    });

    // RANK BY HYBRID SCORE
    const hybridSorted = [...competitiveAgents].sort((a, b) => b.hybridScore - a.hybridScore);
    hybridSorted.forEach((agent, index) => {
      const original = competitiveAgents.find(a => a.id === agent.id)!;
      original.rankByHybrid = index + 1;
    });

    // LIFETIME RANKING (separate calculation if not in lifetime mode)
    if (mode !== 'lifetime') {
      // For sprint view, we need to recalculate lifetime rankings separately
      // For now, use ptsPerDay rank as lifetime rank
      // TODO: Could optimize by caching lifetime rankings
      competitiveAgents.forEach(agent => {
        agent.lifetimeRank = agent.rankByPtsPerDay; // Placeholder
      });
    } else {
      competitiveAgents.forEach(agent => {
        agent.lifetimeRank = agent.rankByPtsPerDay;
      });
    }

    // Mark champions and top 3 (for sprint mode)
    if (mode !== 'lifetime' && competitiveAgents.length > 0) {
      const champion = competitiveAgents.find(a => a.rankByPtsPerDay === 1);
      if (champion) {
        champion.isChampion = true;
        champion.isTopThree = true;
      }

      const top3 = competitiveAgents.filter(a => a.rankByPtsPerDay <= 3);
      top3.forEach(a => a.isTopThree = true);
    }

    // If this is the current sprint AND it just ended, save to database
    if (isCurrentSprint && new Date() > sprintEnd) {
      // Sprint just ended - archive results
      await saveSprintResults(sprintNumber, [...competitiveAgents, ...seniorAgents]);
    }

    // For display, return the PST dates that were originally selected (not UTC query boundaries)
    let displayStart = sprintStart.toISOString();
    let displayEnd = sprintEnd.toISOString();
    
    if (mode === 'custom' && customStart && customEnd) {
      // Return the original PST dates for display
      displayStart = customStart + 'T00:00:00.000Z';
      displayEnd = customEnd + 'T23:59:59.999Z';
    }
    
    return NextResponse.json({
      success: true,
      mode: mode === 'custom' ? 'custom' : mode === 'lifetime' ? 'lifetime' : 'sprint',
      dateRange: {
        start: displayStart,
        end: displayEnd,
        isCustom: mode === 'custom',
        isLifetime: mode === 'lifetime'
      },
      sprint: sprintNumber > 0 ? {
        number: sprintNumber,
        start: sprintStart.toISOString(),
        end: sprintEnd.toISOString(),
        period: formatSprintPeriod(sprintNumber),
        isCurrent: isCurrentSprint,
        daysElapsed: isCurrentSprint ? getCurrentSprint().daysElapsed : SPRINT_DURATION_DAYS,
        daysRemaining: isCurrentSprint ? getCurrentSprint().daysRemaining : 0
      } : null,
      rankings: {
        competitive: competitiveAgents,
        seniors: seniorAgents,
        unqualified
      },
      teamAverages,
      weightIndex: {
        summary: WEIGHT_SUMMARY,
        dispositions: getAllWeights()
      }
    });

  } catch (error) {
    console.error('Sprint Rankings API Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to calculate sprint rankings'
    }, { status: 500 });
  }
}

/**
 * Save sprint results to database for permanent history
 */
async function saveSprintResults(sprintNumber: number, agents: AgentScorecard[]) {
  try {
    const { start, end } = getSprintDates(sprintNumber);

    // Upsert results for each agent
    for (const agent of agents) {
      await prisma.sprintRanking.upsert({
        where: {
          sprintNumber_agentId: {
            sprintNumber,
            agentId: agent.id
          }
        },
        update: {
          // Update in case we recalculate
          tasksCompleted: agent.tasksCompleted,
          trelloCompleted: agent.trelloCompleted,
          totalCompleted: agent.totalCompleted,
          daysWorked: agent.daysWorked,
          weightedPoints: agent.weightedPoints,
          ptsPerDay: agent.weightedDailyAvg,
          tasksPerDay: agent.tasksPerDay,
          hybridScore: agent.hybridScore,
          rankByPtsPerDay: agent.rankByPtsPerDay,
          rankByTasksPerDay: agent.rankByTasksPerDay,
          rankByHybrid: agent.rankByHybrid,
          tier: agent.tier,
          percentile: agent.percentile,
          isChampion: agent.isChampion,
          isTopThree: agent.isTopThree,
          isSenior: agent.isSenior,
          avgHandleTimeSec: agent.avgHandleTimeSec,
          totalTimeSec: agent.totalTimeSec,
          updatedAt: new Date()
        },
        create: {
          id: `sprint-${sprintNumber}-${agent.id}`,
          sprintNumber,
          sprintStart: start,
          sprintEnd: end,
          agentId: agent.id,
          agentName: agent.name,
          agentEmail: agent.email,
          tasksCompleted: agent.tasksCompleted,
          trelloCompleted: agent.trelloCompleted,
          totalCompleted: agent.totalCompleted,
          daysWorked: agent.daysWorked,
          weightedPoints: agent.weightedPoints,
          ptsPerDay: agent.weightedDailyAvg,
          tasksPerDay: agent.tasksPerDay,
          hybridScore: agent.hybridScore,
          rankByPtsPerDay: agent.rankByPtsPerDay,
          rankByTasksPerDay: agent.rankByTasksPerDay,
          rankByHybrid: agent.rankByHybrid,
          tier: agent.tier,
          percentile: agent.percentile,
          isChampion: agent.isChampion,
          isTopThree: agent.isTopThree,
          isSenior: agent.isSenior,
          avgHandleTimeSec: agent.avgHandleTimeSec,
          totalTimeSec: agent.totalTimeSec
        }
      });
    }

    console.log(`✅ Saved sprint ${sprintNumber} results for ${agents.length} agents`);
  } catch (error) {
    console.error(`Failed to save sprint ${sprintNumber} results:`, error);
  }
}

