import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSelfHealing } from "@/lib/self-healing/wrapper";
import { authorizeAgentTargetEmail } from "@/lib/auth";
import { getAgentReportingDayBoundsUtc } from "@/lib/agent-reporting-day-bounds";
import { TaskType } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    const date = searchParams.get("date");

    const gate = await authorizeAgentTargetEmail(request, email);
    if (!gate.ok) return gate.response;

    // Get user
    const user = await prisma.user.findFirst({
      where: { email: gate.targetEmail },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    if (!user.isActive) {
      return NextResponse.json({ success: false, error: "User account is paused" }, { status: 403 });
    }

    let startUtc: Date;
    let endExclusiveUtc: Date;
    try {
      ({ startUtc, endExclusiveUtc } = getAgentReportingDayBoundsUtc(date));
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid date format. Use YYYY-MM-DD" },
        { status: 400 }
      );
    }

    const nonHoldsTaskWhereToday = {
      AND: [
        { taskType: { not: TaskType.HOLDS } },
        {
          OR: [
            {
              assignedToId: user.id,
              status: "COMPLETED" as const,
              endTime: {
                gte: startUtc,
                lt: endExclusiveUtc,
              },
            },
            {
              sentBackBy: user.id,
              status: "PENDING" as const,
              endTime: {
                gte: startUtc,
                lt: endExclusiveUtc,
              },
            },
            {
              completedBy: user.id,
              status: "COMPLETED" as const,
              endTime: {
                gte: startUtc,
                lt: endExclusiveUtc,
              },
            },
          ],
        },
      ],
    };

    const nonHoldsTaskWhereLifetime = {
      AND: [
        { taskType: { not: TaskType.HOLDS } },
        {
          OR: [
            {
              assignedToId: user.id,
              status: "COMPLETED" as const,
            },
            {
              sentBackBy: user.id,
              status: "PENDING" as const,
            },
            {
              completedBy: user.id,
              status: "COMPLETED" as const,
            },
          ],
        },
      ],
    };

    const holdsSessionWhereToday = {
      taskType: TaskType.HOLDS,
      agentId: user.id,
      countsTowardProductivity: true,
      endedAt: {
        gte: startUtc,
        lt: endExclusiveUtc,
      },
    };

    const holdsSessionWhereLifetime = {
      taskType: TaskType.HOLDS,
      agentId: user.id,
      countsTowardProductivity: true,
    };

    const [completionStats, holdsTodayCount, totalStats, holdsLifetimeCount] = await withSelfHealing(
      () =>
        Promise.all([
          prisma.task.groupBy({
            by: ["taskType"],
            where: nonHoldsTaskWhereToday,
            _count: { id: true },
          }),
          prisma.taskWorkSession.count({ where: holdsSessionWhereToday }),
          prisma.task.groupBy({
            by: ["taskType"],
            where: nonHoldsTaskWhereLifetime,
            _count: { id: true },
          }),
          prisma.taskWorkSession.count({ where: holdsSessionWhereLifetime }),
        ]),
      { service: "database", useRetry: true, useCircuitBreaker: true }
    );

    // Format the response
    const taskTypes = ["TEXT_CLUB", "WOD_IVCS", "EMAIL_REQUESTS", "YOTPO", "HOLDS", "STANDALONE_REFUNDS"];
    const stats = {
      today: {} as Record<string, number>,
      total: {} as Record<string, number>,
    };

    taskTypes.forEach((taskType) => {
      stats.today[taskType] = 0;
      stats.total[taskType] = 0;
    });

    completionStats.forEach((stat) => {
      stats.today[stat.taskType] = stat._count.id;
    });

    totalStats.forEach((stat) => {
      stats.total[stat.taskType] = stat._count.id;
    });

    stats.today.HOLDS = holdsTodayCount;
    stats.total.HOLDS = holdsLifetimeCount;

    return NextResponse.json({
      success: true,
      stats,
      date: date || new Date().toISOString().split("T")[0],
    });
  } catch (error: unknown) {
    console.error("Error fetching completion stats:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch completion stats",
      },
      { status: 500 }
    );
  }
}
