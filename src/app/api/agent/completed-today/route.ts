import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeAgentTargetEmail } from "@/lib/auth";
import { getAgentReportingDayBoundsUtc } from "@/lib/agent-reporting-day-bounds";
import { logRouteTiming } from "@/lib/route-timing-log";
import { TaskType } from "@prisma/client";

const taskSelectForCompletedList = {
  id: true,
  brand: true,
  phone: true,
  text: true,
  status: true,
  taskType: true,
  assignedToId: true,
  startTime: true,
  endTime: true,
  durationSec: true,
  disposition: true,
  createdAt: true,
  updatedAt: true,
  holdsStatus: true,
  holdsOrderNumber: true,
  holdsCustomerEmail: true,
  customerName: true,
  rawMessage: {
    select: {
      brand: true,
      phone: true,
      text: true,
    },
  },
} as const;

export async function GET(req: NextRequest) {
  const route = "GET /api/agent/completed-today";
  const startedAt = Date.now();
  let rowCount: number | undefined = undefined;
  let userEmail: string | null = null;

  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    const gate = await authorizeAgentTargetEmail(req, email);
    if (!gate.ok) return gate.response;

    userEmail = gate.targetEmail;

    const user = await prisma.user.findUnique({
      where: { email: gate.targetEmail },
      select: { id: true, isActive: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    if (!user.isActive) {
      return NextResponse.json({ success: false, error: "User account is paused" }, { status: 403 });
    }

    const dateParam = searchParams.get("date");
    let startUtc: Date;
    let endExclusiveUtc: Date;
    try {
      ({ startUtc, endExclusiveUtc } = getAgentReportingDayBoundsUtc(dateParam));
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid date format. Use YYYY-MM-DD" },
        { status: 400 }
      );
    }

    const [tasks, holdsSessions] = await Promise.all([
      prisma.task.findMany({
        where: {
          AND: [
            { taskType: { not: TaskType.HOLDS } },
            {
              OR: [
                {
                  assignedToId: user.id,
                  status: "COMPLETED",
                  endTime: {
                    gte: startUtc,
                    lt: endExclusiveUtc,
                  },
                },
                {
                  completedBy: user.id,
                  status: "COMPLETED",
                  endTime: {
                    gte: startUtc,
                    lt: endExclusiveUtc,
                  },
                },
              ],
            },
          ],
        },
        select: taskSelectForCompletedList,
        orderBy: { endTime: "desc" },
      }),
      prisma.taskWorkSession.findMany({
        where: {
          taskType: TaskType.HOLDS,
          agentId: user.id,
          countsTowardProductivity: true,
          endedAt: {
            gte: startUtc,
            lt: endExclusiveUtc,
          },
        },
        include: {
          task: { select: taskSelectForCompletedList },
        },
        orderBy: { endedAt: "desc" },
      }),
    ]);

    const transformTaskRow = (task: (typeof tasks)[0]) => ({
      ...task,
      brand: task.brand || task.rawMessage?.brand || "Unknown",
      phone: task.phone || task.rawMessage?.phone || "",
      text: task.text || task.rawMessage?.text || "",
      rawMessage: undefined,
      completionSource: "TASK" as const,
    });

    const taskRows = tasks.map(transformTaskRow);

    const sessionRows = holdsSessions.map((session) => {
      const t = session.task;
      const brand = t.brand || t.rawMessage?.brand || "Unknown";
      const phone = t.phone || t.rawMessage?.phone || "";
      const text = t.text || t.rawMessage?.text || "";
      return {
        ...t,
        brand,
        phone,
        text,
        rawMessage: undefined,
        id: `session:${session.id}`,
        taskId: session.taskId,
        workSessionId: session.id,
        completionSource: "TASK_WORK_SESSION" as const,
        startTime:
          session.startedAt != null ? session.startedAt.toISOString() : undefined,
        endTime: session.endedAt.toISOString(),
        durationSec: session.durationSec ?? undefined,
        disposition: session.disposition ?? undefined,
        status: "COMPLETED" as const,
        assignedToId: t.assignedToId || "",
        holdsFromQueue: session.fromQueue ?? undefined,
        holdsToQueue: session.toQueue ?? undefined,
        outcomeType: session.outcomeType,
        isFinalResolution: session.isFinalResolution,
        holdsStatus: session.toQueue ?? t.holdsStatus ?? undefined,
      };
    });

    const transformedTasks = [...taskRows, ...sessionRows].sort((a, b) => {
      const aT = a.endTime ? new Date(a.endTime).getTime() : 0;
      const bT = b.endTime ? new Date(b.endTime).getTime() : 0;
      return bT - aT;
    });

    rowCount = transformedTasks.length;

    return NextResponse.json({
      success: true,
      tasks: transformedTasks,
    });
  } catch (err: unknown) {
    console.error("Error fetching completed tasks:", err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to fetch completed tasks",
    }, { status: 500 });
  } finally {
    logRouteTiming({
      route,
      durationMs: Date.now() - startedAt,
      rowCount,
      email: userEmail,
    });
  }
}
