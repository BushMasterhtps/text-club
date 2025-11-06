import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTaskWeight } from "@/lib/task-weights";
import { getCurrentSprint } from "@/lib/sprint-utils";

// Minimum thresholds
const MINIMUM_TASKS_FOR_RANKING = 20;
const MINIMUM_DAYS_FOR_SPRINT = 3;

/**
 * GET /api/agent/personal-scorecard
 * Returns the logged-in agent's personal scorecard with rankings and daily comparison
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json({
        success: false,
        error: "Email is required"
      }, { status: 400 });
    }

    // Get current date boundaries (today in PST)
    // Server runs in UTC, but users are in PST (UTC-8)
    // PST is 8 hours BEHIND UTC, so we SUBTRACT 8 hours
    const now = new Date();
    const pstOffset = -8 * 60 * 60 * 1000; // PST = UTC - 8 hours
    const nowPST = new Date(now.getTime() + pstOffset); // Subtract 8 hours
    
    const year = nowPST.getUTCFullYear();
    const month = nowPST.getUTCMonth();
    const day = nowPST.getUTCDate();
    
    // Today in PST: Nov 6 00:00 PST = Nov 6 08:00 UTC
    // We create UTC times that represent PST midnight
    const todayStart = new Date(Date.UTC(year, month, day, 8, 0, 0, 0)); // 8 AM UTC = 12 AM PST
    const todayEnd = new Date(Date.UTC(year, month, day + 1, 7, 59, 59, 999)); // Next day 7:59 AM UTC = 11:59 PM PST
    
    // Get current sprint info
    const currentSprint = getCurrentSprint();

    // First, find the current user (agent/manager requesting scorecard) - MUST BE BEFORE LOOP!
    const currentUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      }
    });

    if (!currentUser) {
      return NextResponse.json({
        success: false,
        error: "User not found"
      }, { status: 404 });
    }

    // Find LAST WORKED DAY (not just yesterday - agent might not have worked yesterday!)
    // Look back up to 7 days to find their most recent working day
    let lastWorkedStart: Date | null = null;
    let lastWorkedEnd: Date | null = null;
    
    for (let daysBack = 1; daysBack <= 7; daysBack++) {
      const checkStart = new Date(Date.UTC(year, month, day - daysBack, 8, 0, 0, 0)); // 8 AM UTC = 12 AM PST
      const checkEnd = new Date(Date.UTC(year, month, day - daysBack + 1, 7, 59, 59, 999)); // Next day 7:59 AM UTC = 11:59 PM PST
      
      // Check if agent completed any tasks on this day
      const hasTasksOnDay = await prisma.task.count({
        where: {
          status: "COMPLETED",
          assignedToId: currentUser.id,
          endTime: {
            gte: checkStart,
            lte: checkEnd
          }
        }
      });
      
      if (hasTasksOnDay > 0) {
        lastWorkedStart = checkStart;
        lastWorkedEnd = checkEnd;
        break; // Found it!
      }
    }

    // Fetch ALL agents for ranking purposes (include managers for comparison)
    const allUsers = await prisma.user.findMany({
      where: {
        role: { in: ["AGENT", "MANAGER_AGENT", "MANAGER"] }
      },
      select: {
        id: true,
        name: true,
        email: true
      }
    });

    // Ensure current user is in the list (in case they have a different role or were missed)
    if (!allUsers.find(u => u.id === currentUser.id)) {
      allUsers.push({
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email
      });
    }

    // Senior agents (excluded from competitive rankings)
    const seniorEmails = [
      "daniel.murcia@goldencustomercare.com",
      "lisa.marin@goldencustomercare.com",
      "genesis.saravia@goldencustomercare.com",
      "carson.lund@goldencustomercare.com"
    ];

    // Fetch all tasks (for lifetime and current sprint)
    const allTasks = await prisma.task.findMany({
      where: {
        status: "COMPLETED",
        assignedToId: { not: null },
        endTime: { not: null }
      },
      select: {
        id: true,
        assignedToId: true,
        endTime: true,
        startTime: true,
        taskType: true,
        disposition: true
      }
    });

    // Fetch Trello data
    const allTrello = await prisma.trelloCompletion.findMany({
      select: {
        agentId: true,
        date: true,
        cardsCount: true,
        agent: {
          select: {
            email: true
          }
        }
      }
    });

    // Build agent scorecards for ALL agents (lifetime and current sprint)
    const buildAgentScorecard = (userId: string, userEmail: string, userName: string, startDate: Date | null, endDate: Date | null) => {
      // Filter tasks by date range if provided
      const tasks = allTasks.filter(t => {
        if (t.assignedToId !== userId) return false;
        if (!t.endTime) return false;
        if (startDate && t.endTime < startDate) return false;
        if (endDate && t.endTime > endDate) return false;
        return true;
      });

      const trello = allTrello.filter(t => {
        if (t.agent.email !== userEmail) return false;
        if (!t.date) return false;
        if (startDate && t.date < startDate) return false;
        if (endDate && t.date > endDate) return false;
        return true;
      });

      const tasksCompleted = tasks.length;
      const trelloCompleted = trello.reduce((sum, t) => sum + t.cardsCount, 0);
      const totalCompleted = tasksCompleted + trelloCompleted;

      // Calculate weighted points
      let totalWeightedPoints = 0;
      let totalTimeSec = 0;
      const breakdown: Record<string, any> = {};

      for (const task of tasks) {
        const weight = getTaskWeight(task.taskType, task.disposition);
        totalWeightedPoints += weight;

        if (task.startTime && task.endTime) {
          const durationSec = Math.floor((new Date(task.endTime).getTime() - new Date(task.startTime).getTime()) / 1000);
          totalTimeSec += durationSec;
        }

        if (!breakdown[task.taskType]) {
          breakdown[task.taskType] = { count: 0, weightedPoints: 0, totalSec: 0 };
        }
        breakdown[task.taskType].count++;
        breakdown[task.taskType].weightedPoints += weight;
        if (task.startTime && task.endTime) {
          breakdown[task.taskType].totalSec += Math.floor((new Date(task.endTime).getTime() - new Date(task.startTime).getTime()) / 1000);
        }
      }

      // Add Trello to breakdown
      if (trelloCompleted > 0) {
        breakdown['TRELLO'] = {
          count: trelloCompleted,
          weightedPoints: trelloCompleted * 5.0,
          totalSec: 0
        };
        totalWeightedPoints += trelloCompleted * 5.0;
      }

      // Calculate days worked
      const portalWorkedDates = new Set(tasks.map(t => t.endTime!.toISOString().split('T')[0]));
      const trelloWorkDates = new Set(trello.map(t => t.date.toISOString().split('T')[0]));
      const allWorkDates = new Set([...portalWorkedDates, ...trelloWorkDates]);
      const daysWorked = allWorkDates.size;

      const tasksPerDay = daysWorked > 0 ? totalCompleted / daysWorked : 0;
      const weightedDailyAvg = daysWorked > 0 ? totalWeightedPoints / daysWorked : 0;
      const avgHandleTimeSec = tasksCompleted > 0 ? Math.floor(totalTimeSec / tasksCompleted) : 0;

      // Calculate active hours from task completion times
      const activeHours = totalTimeSec / 3600; // Convert seconds to hours
      const ptsPerActiveHour = activeHours > 0 ? totalWeightedPoints / activeHours : 0;
      const tasksPerActiveHour = activeHours > 0 ? totalCompleted / activeHours : 0;

      // Calculate hourly breakdown (PST timezone) for tasks completed today/this period
      const hourlyBreakdown: Record<number, { count: number; points: number }> = {};
      
      for (const task of tasks) {
        if (!task.endTime) continue;
        
        // Convert UTC to PST (UTC-8)
        const pstOffset = 8 * 60 * 60 * 1000;
        const endTimePST = new Date(task.endTime.getTime() + pstOffset);
        const hour = endTimePST.getUTCHours(); // Get PST hour (0-23)
        
        if (!hourlyBreakdown[hour]) {
          hourlyBreakdown[hour] = { count: 0, points: 0 };
        }
        
        hourlyBreakdown[hour].count++;
        hourlyBreakdown[hour].points += getTaskWeight(task.taskType, task.disposition);
      }

      // Calculate idle time if we have task timestamps
      let estimatedIdleHours = 0;
      if (tasks.length > 1 && daysWorked > 0) {
        // Sort tasks by end time
        const sortedTasks = [...tasks].sort((a, b) => 
          new Date(a.endTime!).getTime() - new Date(b.endTime!).getTime()
        );
        
        // Calculate gaps between tasks (assuming 8-hour workday)
        const assumedShiftHours = 8;
        const totalShiftTime = daysWorked * assumedShiftHours * 3600; // seconds
        estimatedIdleHours = (totalShiftTime - totalTimeSec) / 3600;
        
        // Cap at reasonable bounds (can't be negative, max 50% of shift)
        estimatedIdleHours = Math.max(0, Math.min(estimatedIdleHours, daysWorked * 4));
      }

      return {
        id: userId,
        name: userName,
        email: userEmail,
        tasksCompleted,
        trelloCompleted,
        totalCompleted,
        daysWorked,
        tasksPerDay,
        weightedPoints: totalWeightedPoints,
        weightedDailyAvg,
        avgHandleTimeSec,
        totalTimeSec,
        activeHours,
        ptsPerActiveHour,
        tasksPerActiveHour,
        estimatedIdleHours, // NEW: Idle time analysis
        hourlyBreakdown, // NEW: Tasks per hour (PST)
        breakdown,
        hybridScore: 0, // Will be calculated after normalization
        rankByTasksPerDay: 0,
        rankByPtsPerDay: 0,
        rankByPtsPerHour: 0,
        rankByHybrid: 0,
        tier: '',
        percentile: 0,
        isSenior: seniorEmails.includes(userEmail),
        qualified: false
      };
    };

    // Build lifetime scorecards
    const lifetimeScorecards = allUsers.map(u => buildAgentScorecard(u.id, u.email, u.name, null, null));

    // Build current sprint scorecards
    const sprintScorecards = allUsers.map(u => buildAgentScorecard(u.id, u.email, u.name, currentSprint.start, currentSprint.end));

    // Build today scorecards
    const todayScorecards = allUsers.map(u => buildAgentScorecard(u.id, u.email, u.name, todayStart, todayEnd));

    // Build last worked day scorecards (null if no last worked day found)
    const lastWorkedScorecards = lastWorkedStart && lastWorkedEnd 
      ? allUsers.map(u => buildAgentScorecard(u.id, u.email, u.name, lastWorkedStart, lastWorkedEnd))
      : todayScorecards; // Fallback to today if no previous work found

    // Rank and calculate hybrid scores for each set
    const rankAndNormalize = (scorecards: any[], minTasks: number, minDays: number) => {
      // Separate agents into competitive, seniors, and unqualified
      const competitive = scorecards.filter(a => !a.isSenior && (
        minDays > 0 ? a.daysWorked >= minDays : a.totalCompleted >= minTasks
      ));
      const seniors = scorecards.filter(a => a.isSenior);
      const unqualified = scorecards.filter(a => !a.isSenior && (
        minDays > 0 ? a.daysWorked < minDays : a.totalCompleted < minTasks
      ));

      if (competitive.length === 0) return { competitive: [], seniors, unqualified, teamAverages: {} };

      // Mark qualified
      competitive.forEach(a => a.qualified = true);

      // Calculate hybrid scores
      const maxTasksPerDay = Math.max(...competitive.map(a => a.tasksPerDay));
      const maxPtsPerDay = Math.max(...competitive.map(a => a.weightedDailyAvg));

      for (const agent of competitive) {
        const volumeScore = (agent.tasksPerDay / maxTasksPerDay) * 100;
        const complexityScore = (agent.weightedDailyAvg / maxPtsPerDay) * 100;
        agent.hybridScore = (volumeScore * 0.30) + (complexityScore * 0.70);
      }

      // Rank by hybrid
      competitive.sort((a, b) => b.hybridScore - a.hybridScore);
      competitive.forEach((agent, index) => {
        agent.rankByHybrid = index + 1;
        
        // Assign tier
        const percentile = 100 - ((index / competitive.length) * 100);
        agent.percentile = Math.round(percentile);

        if (percentile >= 90) agent.tier = "Elite";
        else if (percentile >= 75) agent.tier = "High Performer";
        else if (percentile >= 50) agent.tier = "Solid Contributor";
        else if (percentile >= 25) agent.tier = "Developing";
        else agent.tier = "Needs Support";
      });

      // Rank by tasks/day
      const byTasks = [...competitive].sort((a, b) => b.tasksPerDay - a.tasksPerDay);
      byTasks.forEach((agent, index) => {
        const original = competitive.find(a => a.id === agent.id);
        if (original) original.rankByTasksPerDay = index + 1;
      });

      // Rank by pts/day
      const byPts = [...competitive].sort((a, b) => b.weightedDailyAvg - a.weightedDailyAvg);
      byPts.forEach((agent, index) => {
        const original = competitive.find(a => a.id === agent.id);
        if (original) original.rankByPtsPerDay = index + 1;
      });

      // Rank by pts/hour (efficiency - NEW!)
      const byPtsPerHour = [...competitive].sort((a, b) => b.ptsPerActiveHour - a.ptsPerActiveHour);
      byPtsPerHour.forEach((agent, index) => {
        const original = competitive.find(a => a.id === agent.id);
        if (original) original.rankByPtsPerHour = index + 1;
      });

      // Calculate team averages
      const teamAverages = {
        tasksPerDay: competitive.reduce((sum, a) => sum + a.tasksPerDay, 0) / competitive.length,
        ptsPerDay: competitive.reduce((sum, a) => sum + a.weightedDailyAvg, 0) / competitive.length,
        ptsPerHour: competitive.reduce((sum, a) => sum + a.ptsPerActiveHour, 0) / competitive.length,
        activeHours: competitive.reduce((sum, a) => sum + a.activeHours, 0) / competitive.length,
        avgHandleTimeSec: competitive.reduce((sum, a) => sum + a.avgHandleTimeSec, 0) / competitive.length,
        hybridScore: competitive.reduce((sum, a) => sum + a.hybridScore, 0) / competitive.length
      };

      return { competitive, seniors, unqualified, teamAverages };
    };

    const lifetimeRanked = rankAndNormalize(lifetimeScorecards, MINIMUM_TASKS_FOR_RANKING, 0);
    const sprintRanked = rankAndNormalize(sprintScorecards, 0, MINIMUM_DAYS_FOR_SPRINT);
    const todayRanked = rankAndNormalize(todayScorecards, 0, 0); // No minimum for daily
    const lastWorkedRanked = rankAndNormalize(lastWorkedScorecards, 0, 0);

    // Find the logged-in agent's data (check competitive, seniors, AND unqualified)
    const findAgent = (ranked: any) => {
      return [...ranked.competitive, ...ranked.seniors, ...(ranked.unqualified || [])].find(a => a.email === email);
    };

    const myLifetime = findAgent(lifetimeRanked);
    const mySprint = findAgent(sprintRanked);
    const myToday = findAgent(todayRanked);
    const myLastWorked = findAgent(lastWorkedRanked);

    // This should never happen now since we ensure the user is in allUsers
    if (!myLifetime) {
      console.error("Agent not found in rankings:", email);
      return NextResponse.json({
        success: false,
        error: "Agent data not found. You may need to complete some tasks first."
      }, { status: 404 });
    }

    // Calculate daily comparison (today vs last worked day)
    const dailyComparison = {
      tasksChange: myToday && myLastWorked ? myToday.totalCompleted - myLastWorked.totalCompleted : 0,
      ptsChange: myToday && myLastWorked ? myToday.weightedPoints - myLastWorked.weightedPoints : 0,
      timeChange: myToday && myLastWorked ? myToday.avgHandleTimeSec - myLastWorked.avgHandleTimeSec : 0,
      lastWorkedDate: lastWorkedStart ? lastWorkedStart.toISOString().split('T')[0] : null
    };

    // Find next rank agent (for gap analysis)
    const getNextRankAgent = (ranked: any, myAgent: any) => {
      if (!myAgent || !myAgent.qualified) return null;
      const myRank = myAgent.rankByHybrid;
      if (myRank === 1) return null; // Already #1
      return ranked.competitive.find((a: any) => a.rankByHybrid === myRank - 1);
    };

    const nextRankLifetime = getNextRankAgent(lifetimeRanked, myLifetime);
    const nextRankSprint = getNextRankAgent(sprintRanked, mySprint);

    return NextResponse.json({
      success: true,
      agent: {
        name: myLifetime.name,
        email: myLifetime.email,
        isSenior: myLifetime.isSenior
      },
      currentSprint: {
        number: currentSprint.number,
        period: `${currentSprint.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${currentSprint.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        daysElapsed: currentSprint.daysElapsed,
        daysRemaining: currentSprint.daysRemaining
      },
      lifetime: {
        my: myLifetime,
        teamAverages: lifetimeRanked.teamAverages,
        totalCompetitors: lifetimeRanked.competitive.length,
        nextRankAgent: nextRankLifetime
      },
      sprint: {
        my: mySprint,
        teamAverages: sprintRanked.teamAverages,
        totalCompetitors: sprintRanked.competitive.length,
        nextRankAgent: nextRankSprint
      },
      today: {
        my: myToday,
        teamAverages: todayRanked.teamAverages
      },
      lastWorked: {
        my: myLastWorked,
        teamAverages: lastWorkedRanked.teamAverages,
        date: dailyComparison.lastWorkedDate
      },
      dailyComparison
    });

  } catch (error) {
    console.error('Personal Scorecard API Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch personal scorecard'
    }, { status: 500 });
  }
}

