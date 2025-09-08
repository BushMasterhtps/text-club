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

        // Get task type breakdowns
        const [emailRequestCount, textClubCount, wodIvcsCount, refundCount] = await Promise.all([
          prisma.task.count({
            where: { assignedToId: a.id, status: { in: OPEN_STATUSES }, taskType: "EMAIL_REQUESTS" },
          }),
          prisma.task.count({
            where: { assignedToId: a.id, status: { in: OPEN_STATUSES }, taskType: "TEXT_CLUB" },
          }),
          prisma.task.count({
            where: { assignedToId: a.id, status: { in: OPEN_STATUSES }, taskType: "WOD_IVCS" },
          }),
          prisma.task.count({
            where: { assignedToId: a.id, status: { in: OPEN_STATUSES }, taskType: "STANDALONE_REFUNDS" },
          }),
        ]);

        return {
          id: a.id,
          email: a.email,
          name: a.name ?? a.email,
          openCount,
          emailRequestCount,
          textClubCount,
          wodIvcsCount,
          refundCount,
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