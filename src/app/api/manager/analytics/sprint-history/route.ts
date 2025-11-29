import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { formatSprintPeriod, getSprintDates, getCurrentSprint } from '@/lib/sprint-utils';

/**
 * Sprint History API
 * Returns list of past sprints with winners and summary stats
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 20);
    
    const currentSprintNum = getCurrentSprint().number;

    // Get all sprints from database (most recent first)
    const dbSprints = await prisma.sprintRanking.groupBy({
      by: ['sprintNumber'],
      orderBy: {
        sprintNumber: 'desc'
      },
      take: limit
    });

    const dbSprintNumbers = new Set(dbSprints.map(s => s.sprintNumber));
    
    // Include all sprints from #1 to current (to show Sprint #1 even if not saved yet)
    const allSprintNumbers: number[] = [];
    for (let i = currentSprintNum; i >= 1 && allSprintNumbers.length < limit; i--) {
      allSprintNumbers.push(i);
    }
    
    // Use all sprint numbers (database + current range)
    const sprintNumbers = Array.from(new Set([...allSprintNumbers, ...dbSprintNumbers])).sort((a, b) => b - a).slice(0, limit);

    // FIXED: Batch fetch all sprint rankings in one query instead of N queries
    // Fetch all rankings for all sprints at once
    const allRankings = await prisma.sprintRanking.findMany({
      where: {
        sprintNumber: { in: sprintNumbers },
        isSenior: false // Exclude seniors from competitive view
      },
      orderBy: [
        { sprintNumber: 'desc' },
        { rankByPtsPerDay: 'asc' }
      ]
    });

    // Group rankings by sprint number
    const rankingsBySprint = new Map<number, typeof allRankings>();
    for (const ranking of allRankings) {
      if (!rankingsBySprint.has(ranking.sprintNumber)) {
        rankingsBySprint.set(ranking.sprintNumber, []);
      }
      rankingsBySprint.get(ranking.sprintNumber)!.push(ranking);
    }

    // Process each sprint using pre-fetched data
    const sprintHistory = sprintNumbers.map((sprintNum) => {
      const { start, end } = getSprintDates(sprintNum);
      const rankings = rankingsBySprint.get(sprintNum) || [];

      const champion = rankings.find(r => r.isChampion);
      const topThree = rankings.filter(r => r.isTopThree).slice(0, 3);

      return {
        sprintNumber: sprintNum,
        period: formatSprintPeriod(sprintNum),
        start: start.toISOString(),
        end: end.toISOString(),
        isCurrent: sprintNum === currentSprintNum,
        champion: champion ? {
          name: champion.agentName,
          email: champion.agentEmail,
          ptsPerDay: champion.ptsPerDay,
          tasksPerDay: champion.tasksPerDay,
          totalPoints: champion.weightedPoints,
          daysWorked: champion.daysWorked
        } : null,
        topThree: topThree.map(r => ({
          rank: r.rankByPtsPerDay,
          name: r.agentName,
          email: r.agentEmail,
          ptsPerDay: r.ptsPerDay,
          tier: r.tier
        })),
        totalParticipants: rankings.length
      };
    });

    return NextResponse.json({
      success: true,
      history: sprintHistory,
      currentSprintNumber: currentSprintNum
    });

  } catch (error) {
    console.error('Sprint History API Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to load sprint history'
    }, { status: 500 });
  }
}

