import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { formatSprintPeriod, getSprintDates, getCurrentSprint } from '@/lib/sprint-utils';
import { apiAuthDeniedResponse, requireStaffApiAuth } from "@/lib/auth";
import { Prisma } from '@prisma/client';
import { NextResponseJsonSafe } from '@/lib/safe-json-response';

/**
 * Sprint History API
 * Returns list of past sprints with winners and summary stats
 */

export async function GET(request: NextRequest) {
  const auth = await requireStaffApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);
  try {
    console.info('[sprint-history]', JSON.stringify({ phase: 'route-start' }));
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 20);
    
    const currentSprintNum = getCurrentSprint().number;

    // Get all sprints from database (most recent first)
    let dbSprints: Array<{ sprintNumber: number }> = [];
    try {
      console.info('[sprint-history]', JSON.stringify({ phase: 'prisma-query-start:groupBy' }));
      dbSprints = await prisma.sprintRanking.groupBy({
        by: ['sprintNumber'],
        orderBy: {
          sprintNumber: 'desc'
        },
        take: limit
      });
      console.info('[sprint-history]', JSON.stringify({ phase: 'prisma-success:groupBy', count: dbSprints.length }));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2021') {
        console.warn('[sprint-history]', JSON.stringify({ phase: 'missing-table', prismaCode: e.code, meta: e.meta }));
        dbSprints = [];
      } else {
        throw e;
      }
    }

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
    let allRankings: any[] = [];
    try {
      console.info('[sprint-history]', JSON.stringify({ phase: 'prisma-query-start:findMany' }));
      allRankings = await prisma.sprintRanking.findMany({
        where: {
          sprintNumber: { in: sprintNumbers },
          isSenior: false // Exclude seniors from competitive view
        },
        orderBy: [
          { sprintNumber: 'desc' },
          { rankByPtsPerDay: 'asc' }
        ]
      });
      console.info('[sprint-history]', JSON.stringify({ phase: 'prisma-success:findMany', count: allRankings.length }));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2021') {
        console.warn('[sprint-history]', JSON.stringify({ phase: 'missing-table-findMany', prismaCode: e.code, meta: e.meta }));
        allRankings = [];
      } else {
        throw e;
      }
    }

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

    console.info('[sprint-history]', JSON.stringify({ phase: 'response-serialize' }));
    return NextResponseJsonSafe({
      success: true,
      history: sprintHistory,
      currentSprintNumber: currentSprintNum
    });

  } catch (error) {
    console.error('[sprint-history]', JSON.stringify({ phase: 'catch', message: error instanceof Error ? error.message : String(error) }));
    // Fail-soft: keep dashboards usable.
    return NextResponseJsonSafe({
      success: true,
      history: [],
      currentSprintNumber: getCurrentSprint().number,
      degraded: true,
      message: 'Sprint history unavailable (missing SprintRanking table or query error)'
    }, { status: 200 });
  }
}

