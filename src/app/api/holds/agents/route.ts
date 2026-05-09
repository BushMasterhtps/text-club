import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TaskType } from '@prisma/client';
import { apiAuthDeniedResponse, requireManagerApiAuth } from '@/lib/auth';
import { NextResponseJsonSafe } from '@/lib/safe-json-response';
import { eligibleAgentsWhereForTaskType } from '@/lib/agent-specialization';

const ROUTE = 'GET /api/holds/agents';

export async function GET(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  console.info('[holds/agents]', JSON.stringify({ phase: 'route-start', route: ROUTE }));

  try {
    const agents = await prisma.user.findMany({
      where: eligibleAgentsWhereForTaskType('HOLDS'),
      select: {
        id: true,
        email: true,
        name: true,
        isLive: true,
        lastSeen: true,
        agentTypes: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    const agentIds = agents.map((a) => a.id);
    const taskCounts =
      agentIds.length === 0
        ? []
        : await prisma.task.groupBy({
            by: ['assignedToId'],
            where: {
              assignedToId: { in: agentIds },
              taskType: TaskType.HOLDS,
              status: { in: ['PENDING', 'IN_PROGRESS', 'ASSISTANCE_REQUIRED'] },
            },
            _count: {
              id: true,
            },
          });

    const countMap = new Map<string, number>();
    taskCounts.forEach(({ assignedToId, _count }) => {
      if (assignedToId) countMap.set(assignedToId, _count.id);
    });

    const agentsWithCounts = agents.map((agent) => ({
      ...agent,
      holdsCount: countMap.get(agent.id) || 0,
    }));

    console.info('[holds/agents]', JSON.stringify({ phase: 'success', route: ROUTE, count: agentsWithCounts.length }));

    return NextResponseJsonSafe({
      success: true,
      agents: agentsWithCounts,
    });
  } catch (error: unknown) {
    console.error(
      '[holds/agents]',
      JSON.stringify({
        phase: 'error',
        route: ROUTE,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    /** Empty list keeps dashboard usable if agentTypes migration not yet applied */
    return NextResponseJsonSafe(
      {
        success: true,
        agents: [],
        degraded: true,
        degradedReason: error instanceof Error ? error.message : 'unknown',
      },
      { status: 200 },
    );
  }
}
