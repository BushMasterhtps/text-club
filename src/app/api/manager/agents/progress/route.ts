import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TaskStatus } from "@prisma/client";

export async function GET() {
  try {
    // Pull agents we know about
    const agents = await prisma.user.findMany({
      where: { role: "AGENT" },
      select: { id: true, name: true, email: true, lastSeen: true },
      orderBy: { name: "asc" },
    });

    if (agents.length === 0) {
      return NextResponse.json({ success: true, items: [] });
    }

    // Counts by assigned agent & status
    const counts = await prisma.task.groupBy({
      by: ["assignedToId", "status"],
      _count: { _all: true },
      where: { assignedToId: { not: null } },
    });

    // Completed-today counts (UTC day; adjust later if needed)
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const completedToday = await prisma.task.groupBy({
      by: ["assignedToId"],
      _count: { _all: true },
      where: {
        assignedToId: { not: null },
        status: TaskStatus.COMPLETED,
        updatedAt: { gte: startOfDay },
      },
    });

    const completedMap = new Map<string, number>();
    for (const row of completedToday) {
      if (!row.assignedToId) continue;
      completedMap.set(row.assignedToId, (completedMap.get(row.assignedToId) || 0) + row._count._all);
    }

    // Flatten counts into per-agent buckets
    const byAgent = new Map<string, { assigned: number; inProgress: number; completedToday: number }>();
    for (const a of agents) {
      byAgent.set(a.id, { assigned: 0, inProgress: 0, completedToday: completedMap.get(a.id) || 0 });
    }
    for (const c of counts) {
      const id = c.assignedToId;
      if (!id) continue;
      const entry = byAgent.get(id);
      if (!entry) continue;
      if (c.status === TaskStatus.IN_PROGRESS) entry.inProgress += c._count._all;
      else entry.assigned += c._count._all;
    }

    const items = agents.map((a) => {
      const row = byAgent.get(a.id)!;
      return {
        name: a.name ?? a.email,
        assigned: row.assigned,
        inProgress: row.inProgress,
        completedToday: row.completedToday,
        lastActivity: a.lastSeen ? a.lastSeen.toISOString() : null,
      };
    });

    return NextResponse.json({ success: true, items });
  } catch (err: any) {
    console.error("GET /api/manager/agents/progress failed:", err?.message || err, err?.stack);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to load agent progress" },
      { status: 500 },
    );
  }
}