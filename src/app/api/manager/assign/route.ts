// src/app/api/manager/assign/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TaskStatus } from "@prisma/client";

type PostBody = {
  agents?: string[];     // array of agent emails selected in the UI (legacy)
  agentIds?: string[];   // array of agent IDs selected in the UI (new)
  perAgent?: number;     // cap per agent for this run
  perAgentCap?: number;  // cap per agent for this run (new)
  taskType?: string;     // filter by task type (new)
};

type AgentLite = { id: string; email: string; name: string | null };
type PlanEntry = { taskId: string; agentId: string };

// Utility to format a display label for the summary map
const labelFor = (a: AgentLite): string => a.name?.trim() || a.email;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PostBody | null;
    
    // Handle both legacy (emails) and new (agentIds) formats
    let agentIds: string[] = [];
    if (body?.agentIds && Array.isArray(body.agentIds)) {
      agentIds = body.agentIds;
    } else if (body?.agents && Array.isArray(body.agents)) {
      // Legacy: resolve emails to IDs
      const emails = Array.from(
        new Set((body.agents).map((e) => e.trim()).filter(Boolean))
      );
      const agents = await prisma.user.findMany({
        where: { email: { in: emails } },
        select: { id: true },
      });
      agentIds = agents.map(a => a.id);
    }

    // Per-agent cap sanity (hard-cap 200 per your UI copy)
    const perAgent = Math.max(1, Math.min(Number(body?.perAgentCap ?? body?.perAgent ?? 0) || 0, 200));

    if (agentIds.length === 0 || perAgent <= 0) {
      return NextResponse.json({ success: true, assigned: {} as Record<string, string[]> });
    }

    // Resolve agents by ID (id + name/email for label)
    const agents = await prisma.user.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, email: true, name: true },
    });

    if (agents.length === 0) {
      return NextResponse.json({ success: true, assigned: {} as Record<string, string[]> });
    }

    // Build a stable round-robin order
    const agentOrder: AgentLite[] = agents.map((a) => ({
      id: a.id,
      email: a.email,
      name: a.name ?? null,
    }));

    // Pull candidate tasks: only PENDING, unassigned, oldest first
    const totalNeed = agentOrder.length * perAgent;
    const whereClause: any = {
      status: TaskStatus.PENDING,
      assignedToId: null,
    };
    
    // Filter by task type if specified
    if (body?.taskType) {
      whereClause.taskType = body.taskType;
    }
    
    const candidates = await prisma.task.findMany({
      where: whereClause,
      orderBy: [{ createdAt: "asc" }],
      take: totalNeed,
      select: { id: true },
    });

    if (candidates.length === 0) {
      return NextResponse.json({ success: true, assigned: {} as Record<string, string[]> });
    }

    // Round-robin plan
    const plan: PlanEntry[] = [];
    const assignedCounts = new Map<string, number>(
      agentOrder.map((a) => [a.id, 0])
    );

    let cursor = 0;
    for (const t of candidates) {
      // try to place this task on someone under cap
      let placed = false;
      for (let attempts = 0; attempts < agentOrder.length; attempts++) {
        const target = agentOrder[cursor];
        const current = assignedCounts.get(target.id)!;
        if (current < perAgent) {
          plan.push({ taskId: t.id, agentId: target.id });
          assignedCounts.set(target.id, current + 1);
          placed = true;
          cursor = (cursor + 1) % agentOrder.length;
          break;
        }
        cursor = (cursor + 1) % agentOrder.length;
      }
      if (!placed) break; // everyone is at cap
    }

    if (plan.length === 0) {
      return NextResponse.json({ success: true, assigned: {} as Record<string, string[]> });
    }

    // Persist: set assignedToId + set to IN_PROGRESS when assigned
    // Use updateMany for better performance with large batches
    const results: Record<string, string[]> = {};
    
    for (const agent of agentOrder) {
      const agentTasks = plan.filter(p => p.agentId === agent.id);
      if (agentTasks.length === 0) continue;
      
      const taskIds = agentTasks.map(p => p.taskId);
      const updateResult = await prisma.task.updateMany({
        where: { 
          id: { in: taskIds },
          assignedToId: null, // Only update unassigned tasks
          status: "PENDING"   // Only update pending tasks
        },
        data: { 
          assignedToId: agent.id,
          status: TaskStatus.IN_PROGRESS, // Assigned tasks = IN_PROGRESS
          // Clear any previous task data when assigning
          startTime: null,
          endTime: null,
          durationSec: null,
          disposition: null,
          assistanceNotes: null,
          managerResponse: null,
        },
      });
      
      if (updateResult.count > 0) {
        results[agent.email] = taskIds;
      }
    }

    // Build response map: { "Name or Email": [taskId, ...], ... }
    const idToLabel = new Map<string, string>(
      agentOrder.map((a) => [a.id, labelFor(a)])
    );
    const assignedMap: Record<string, string[]> = {};

    for (const [email, taskIds] of Object.entries(results)) {
      const agent = agentOrder.find(a => a.email === email);
      if (agent) {
        const label = idToLabel.get(agent.id) || agent.email;
        assignedMap[label] = taskIds;
      }
    }

    return NextResponse.json({ success: true, assigned: assignedMap });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Assign failed.";
    console.error("assign POST failed:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    // Optional: in a Lambda/edge style environment you typically
    // let the client be re-used; if you want to disconnect here, you can:
    // await prisma.$disconnect();
  }
}