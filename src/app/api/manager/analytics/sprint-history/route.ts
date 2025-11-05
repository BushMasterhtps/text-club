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
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    
    const currentSprintNum = getCurrentSprint().number;

    // Get all sprints from database (most recent first)
    const sprints = await prisma.sprintRanking.groupBy({
      by: ['sprintNumber'],
      orderBy: {
        sprintNumber: 'desc'
      },
      take: limit
    });

    const sprintNumbers = sprints.map(s => s.sprintNumber);

    // Get detailed results for each sprint
    const sprintHistory = await Promise.all(
      sprintNumbers.map(async (sprintNum) => {
        const { start, end } = getSprintDates(sprintNum);

        // Get all rankings for this sprint
        const rankings = await prisma.sprintRanking.findMany({
          where: {
            sprintNumber: sprintNum,
            isSenior: false // Exclude seniors from competitive view
          },
          orderBy: {
            rankByPtsPerDay: 'asc'
          }
        });

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
      })
    );

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

