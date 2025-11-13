// src/app/api/manager/agents/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { $Enums } from "@prisma/client";

// Which statuses count as "open"
const OPEN_STATUSES: $Enums.TaskStatus[] = [
  "PENDING",
  "IN_PROGRESS",
  "ASSISTANCE_REQUIRED",
];

export async function GET(request: Request) {
  try {
    // Get filter parameter (e.g., ?filter=TEXT_CLUB or ?filter=HOLDS)
    const url = new URL(request.url);
    const filter = url.searchParams.get('filter');
    
    // Build where clause
    const where: any = {
      role: { in: ["AGENT", "MANAGER_AGENT"] }
    };
    
    // Filter by agent type if specified
    if (filter === 'TEXT_CLUB') {
      // TEXT_CLUB: agents who have TEXT_CLUB in agentTypes OR have empty agentTypes (legacy agents)
      where.OR = [
        { agentTypes: { has: 'TEXT_CLUB' } },
        { agentTypes: { isEmpty: true } } // Legacy agents default to TEXT_CLUB
      ];
    } else if (filter === 'HOLDS') {
      // HOLDS: only agents with HOLDS in agentTypes
      where.agentTypes = { has: 'HOLDS' };
    }
    // No filter = return all agents (used by some dashboards)
    
    // Fetch agents and their task counts in parallel using optimized queries
    const [agents, taskCountsByAgent] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { id: true, email: true, name: true, isLive: true, lastSeen: true, agentTypes: true },
        orderBy: { createdAt: "asc" },
      }),
      // Single query to get all task counts grouped by agent and task type
      prisma.task.groupBy({
        by: ['assignedToId', 'taskType'],
        where: {
          assignedToId: { not: null },
          status: { in: OPEN_STATUSES }
        },
        _count: {
          id: true
        }
      })
    ]);

    // Build a map of agent task counts for fast lookup
    const taskCountMap = new Map<string, Map<string, number>>();
    
    for (const group of taskCountsByAgent) {
      if (!group.assignedToId) continue;
      
      if (!taskCountMap.has(group.assignedToId)) {
        taskCountMap.set(group.assignedToId, new Map());
      }
      
      const agentMap = taskCountMap.get(group.assignedToId)!;
      agentMap.set(group.taskType, group._count.id);
    }

    // Map agents with their counts (no additional database queries)
    const withCounts = agents.map((a) => {
      const agentCounts = taskCountMap.get(a.id);
      
      const emailRequestCount = agentCounts?.get('EMAIL_REQUESTS') ?? 0;
      const textClubCount = agentCounts?.get('TEXT_CLUB') ?? 0;
      const wodIvcsCount = agentCounts?.get('WOD_IVCS') ?? 0;
      const refundCount = agentCounts?.get('STANDALONE_REFUNDS') ?? 0;
      const yotpoCount = agentCounts?.get('YOTPO') ?? 0;
      const holdsCount = agentCounts?.get('HOLDS') ?? 0;
      const openCount = emailRequestCount + textClubCount + wodIvcsCount + refundCount + yotpoCount + holdsCount;

      return {
        id: a.id,
        email: a.email,
        name: a.name ?? a.email,
        openCount,
        emailRequestCount,
        textClubCount,
        wodIvcsCount,
        refundCount,
        yotpoCount,
        holdsCount,
        isLive: a.isLive ?? false,
        lastSeen: a.lastSeen ?? null,
        agentTypes: a.agentTypes ?? [],
      };
    });

    return NextResponse.json({ success: true, agents: withCounts });
  } catch (err) {
    console.error("agents GET error:", err);
    console.error("Error details:", {
      message: err instanceof Error ? err.message : 'Unknown error',
      stack: err instanceof Error ? err.stack : undefined,
      name: err instanceof Error ? err.name : undefined
    });
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to load agents",
        details: err instanceof Error ? err.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}