// src/app/api/manager/tasks/assign/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ---- request body shapes ----------------------------------------------------

type AssignByIds = { ids: string[]; agentId: string };
type AssignRawMessages = { rawMessageIds: string[]; agentId: string };
type RoundRobin = { roundRobin: true; agents: string[]; perAgent?: number };
type Body = AssignByIds | AssignRawMessages | RoundRobin | Record<string, unknown>;

// What we select for agents in this endpoint
type AgentRow = { id: string; email: string; maxOpen: number | null };

// ---- handler ----------------------------------------------------------------

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    // ──────────────────────────────────────────────────────────────────────────
    // Mode A: assign explicit task IDs to a single agent
    // ──────────────────────────────────────────────────────────────────────────
    if (Array.isArray((body as any).ids) && typeof (body as any).agentId === "string") {
      const ids = (body as any).ids as string[];
      const agentId = (body as any).agentId as string;

      if (ids.length === 0) {
        return NextResponse.json({ success: false, error: "No task ids." }, { status: 400 });
      }

      const agent = await prisma.user.findUnique({
        where: { id: agentId },
        select: { id: true },
      });
      if (!agent) {
        return NextResponse.json({ success: false, error: "Agent not found." }, { status: 400 });
      }

      // Write each update inside one transaction (no leaking tx outside)
      // Use updateMany with conditions to avoid race conditions
      const updateResult = await prisma.task.updateMany({
        where: { 
          id: { in: ids },
          assignedToId: null, // Only update unassigned tasks
          status: "PENDING"   // Only update pending tasks
        },
        data: {
          assignedToId: agent.id,
          status: "PENDING", // Keep as PENDING until agent clicks Start
          // Don't set startTime yet - agent will set it when they click Start
        },
      });

      if (updateResult.count === 0) {
        return NextResponse.json({ 
          success: false, 
          error: "No tasks were available for assignment. They may have been assigned to another agent or changed status." 
        }, { status: 400 });
      }

      if (updateResult.count < ids.length) {
        // Some tasks couldn't be assigned (race condition)
        return NextResponse.json({ 
          success: true, 
          assigned: { [agentId]: ids },
          warning: `${updateResult.count} of ${ids.length} tasks were assigned. Some may have been assigned to another agent.`
        });
      }

      return NextResponse.json({ success: true, assigned: { [agentId]: ids } });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Mode A2: assign raw message IDs to a single agent (promote and assign)
    // ──────────────────────────────────────────────────────────────────────────
    if (Array.isArray((body as any).rawMessageIds) && typeof (body as any).agentId === "string") {
      const rawMessageIds = (body as any).rawMessageIds as string[];
      const agentId = (body as any).agentId as string;

      if (rawMessageIds.length === 0) {
        return NextResponse.json({ success: false, error: "No raw message ids." }, { status: 400 });
      }

      const agent = await prisma.user.findUnique({
        where: { id: agentId },
        select: { id: true },
      });
      if (!agent) {
        return NextResponse.json({ success: false, error: "Agent not found." }, { status: 400 });
      }

      // Promote raw messages to tasks and assign them in one transaction
      const result = await prisma.$transaction(async (tx) => {
        // Load RAW rows that are still READY
        const raws = await tx.rawMessage.findMany({
          where: { id: { in: rawMessageIds }, status: "READY" },
          select: { id: true, phone: true, email: true, text: true, brand: true, createdAt: true },
        });

        if (raws.length === 0) {
          throw new Error("No raw messages available for promotion");
        }

        // Create Tasks with status IN_PROGRESS and assign to agent
        const createdTasks = [];
        for (const r of raws) {
          const task = await tx.task.create({
            data: {
              phone: r.phone ?? null,
              email: r.email ?? null,
              text: r.text ?? null,
              brand: r.brand ?? null,
              rawMessageId: r.id, // ensure linkage so UI queries can find it
              status: "IN_PROGRESS", // Tasks are IN_PROGRESS when assigned
              assignedToId: agent.id,
              startTime: new Date(),
              createdAt: r.createdAt,
            },
          });
          createdTasks.push(task);
        }

        // Mark raws as PROMOTED
        await tx.rawMessage.updateMany({
          where: { id: { in: raws.map((r) => r.id) } },
          data: { status: "PROMOTED" },
        });

        return createdTasks;
      });

      return NextResponse.json({ 
        success: true, 
        assigned: { [agentId]: result.map(t => t.id) },
        promoted: result.length
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Mode B: round-robin oldest unassigned PENDING tasks across given agents
    // body = { roundRobin: true, agents: string[] /* emails */, perAgent?: number }
    // ──────────────────────────────────────────────────────────────────────────
    if ((body as any).roundRobin === true) {
      const emails: string[] = Array.isArray((body as any).agents)
        ? ((body as any).agents as string[]).filter(Boolean)
        : [];
      const perAgent: number = Math.max(1, Math.min(200, Number((body as any).perAgent ?? 50)));

      if (emails.length === 0) {
        return NextResponse.json({ success: false, error: "No agents selected." }, { status: 400 });
      }

      const agents: AgentRow[] = await prisma.user.findMany({
        where: { email: { in: emails } },
        select: { id: true, email: true, maxOpen: true },
      });

      if (agents.length === 0) {
        return NextResponse.json({ success: false, error: "Agents not found." }, { status: 400 });
      }

      // how many open items each agent currently has
      const openCounts: Record<string, number> = Object.fromEntries(
        await Promise.all(
          agents.map(async (a: AgentRow) => {
            const count = await prisma.task.count({
              where: {
                assignedToId: a.id,
                status: { in: ["IN_PROGRESS", "ASSISTANCE_REQUIRED"] },
              },
            });
            return [a.id, count] as const;
          })
        )
      ) as Record<string, number>;

      // per-agent capacity for this run (respect maxOpen)
      const capacity: Record<string, number> = {};
      for (const a of agents) {
        const alreadyOpen = openCounts[a.id] ?? 0;
        const maxOpen = (a.maxOpen ?? 200);
        // how many we can give them right now (also clamp to perAgent)
        capacity[a.id] = Math.max(0, Math.min(perAgent, Math.max(0, maxOpen - alreadyOpen)));
      }

      const totalNeed = Object.values(capacity).reduce((s, n) => s + n, 0);
      if (totalNeed === 0) {
        return NextResponse.json({ success: true, assigned: {} });
      }

      // pull oldest unassigned PENDING tasks
      const tasks: { id: string }[] = await prisma.task.findMany({
        where: { assignedToId: null, status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: totalNeed,
        select: { id: true },
      });
      if (tasks.length === 0) {
        return NextResponse.json({ success: true, assigned: {} });
      }

      // distribute round-robin among the agent ids
      const agentIds: string[] = agents.map((a: AgentRow) => a.id);
      const remaining: Record<string, number> = { ...capacity };
      let i = 0;
      const plan: { taskId: string; agentId: string }[] = [];

      for (const t of tasks) {
        let attempts = 0;
        while (attempts < agentIds.length) {
          const aId = agentIds[i % agentIds.length];
          i++;
          attempts++;
          if ((remaining[aId] ?? 0) > 0) {
            plan.push({ taskId: t.id, agentId: aId });
            remaining[aId]--;
            break;
          }
        }
      }

      if (plan.length === 0) {
        return NextResponse.json({ success: true, assigned: {} });
      }

      // For round-robin with multiple agents, we need to handle each agent separately
      // to avoid race conditions and ensure proper distribution
      const results: Record<string, string[]> = {};
      
      for (const agent of agents) {
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
            status: "PENDING", // Keep as PENDING so agent can click Start
            // Don't set startTime yet - agent will set it when they click Start
          },
        });
        
        if (updateResult.count > 0) {
          results[agent.email] = taskIds;
        }
      }

      // response shape: email -> taskIds[]
      const assigned: Record<string, string[]> = results;

      return NextResponse.json({ success: true, assigned });
    }

    return NextResponse.json({ success: false, error: "Invalid payload." }, { status: 400 });
  } catch (err: any) {
    console.error("assign POST failed:", err);
    
    // Provide more specific error messages for common issues
    let errorMessage = "Assign failed.";
    if (err?.code === 'P2025') {
      errorMessage = "One or more tasks were not found or are no longer available for assignment.";
    } else if (err?.code === 'P2002') {
      errorMessage = "Database constraint violation - please try again.";
    } else if (err?.message) {
      errorMessage = err.message;
    }
    
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
