// src/app/api/manager/agents/route.ts
import { NextResponse } from "next/server";
import { PrismaClient, type $Enums } from "@prisma/client";

const prisma = new PrismaClient();

// Which statuses count as "open"
const OPEN_STATUSES: $Enums.TaskStatus[] = [
  "PENDING",
  "IN_PROGRESS",
  "ASSISTANCE_REQUIRED",
];

export async function GET() {
  try {
    const agents = await prisma.user.findMany({
      // Include both AGENT and MANAGER_AGENT roles for assignment
      where: { role: { in: ["AGENT", "MANAGER_AGENT"] } },
      select: { id: true, email: true, name: true, isLive: true, lastSeen: true },
      orderBy: { createdAt: "asc" },
    });

    const withCounts = await Promise.all(
      agents.map(async (a) => {
        const openCount = await prisma.task.count({
          where: { assignedToId: a.id, status: { in: OPEN_STATUSES } },
        });
        return {
          id: a.id,
          email: a.email,
          name: a.name ?? a.email,
          openCount,
          isLive: a.isLive ?? false,
          lastSeen: a.lastSeen ?? null,
        };
      })
    );

    return NextResponse.json({ success: true, agents: withCounts });
  } catch (err) {
    console.error("agents GET error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load agents" },
      { status: 500 }
    );
  }
}