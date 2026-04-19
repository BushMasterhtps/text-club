import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeAgentTargetEmail } from "@/lib/auth";
import { getAgentReportingDayBoundsUtc } from "@/lib/agent-reporting-day-bounds";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    const gate = await authorizeAgentTargetEmail(req, email);
    if (!gate.ok) return gate.response;

    // Find the user by email
    const user = await prisma.user.findUnique({
      where: { email: gate.targetEmail },
      select: { id: true, isLive: true }
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    if (!user.isLive) {
      return NextResponse.json({ success: false, error: "User account is paused" }, { status: 403 });
    }

    const dateParam = searchParams.get("date"); // YYYY-MM-DD or omit for today (PST fixed UTC−8, same as stats)
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

    // Get completed tasks for today (including unassigned completed tasks, e.g., "Unable to Resolve" for Holds)
    const tasks = await prisma.task.findMany({
      where: {
        OR: [
          {
            assignedToId: user.id,
            status: "COMPLETED",
            endTime: {
              gte: startUtc,
              lt: endExclusiveUtc,
            }
          },
          {
            completedBy: user.id,
            status: "COMPLETED",
            endTime: {
              gte: startUtc,
              lt: endExclusiveUtc,
            }
          }
        ]
      },
      select: {
        id: true,
        brand: true,
        phone: true,
        text: true,
        status: true,
        taskType: true,
        startTime: true,
        endTime: true,
        durationSec: true,
        disposition: true,
        createdAt: true,
        updatedAt: true,
        rawMessage: {
          select: {
            brand: true,
            phone: true,
            text: true
          }
        }
      },
      orderBy: {
        endTime: "desc"
      }
    });

    // Transform tasks to include brand/phone/text from rawMessage if not set on task
    const transformedTasks = tasks.map(task => ({
      ...task,
      brand: task.brand || task.rawMessage?.brand || "Unknown",
      phone: task.phone || task.rawMessage?.phone || "",
      text: task.text || task.rawMessage?.text || "",
      rawMessage: undefined // Remove from response
    }));

    return NextResponse.json({ 
      success: true, 
      tasks: transformedTasks 
    });
  } catch (err: any) {
    console.error("Error fetching completed tasks:", err);
    return NextResponse.json({ 
      success: false, 
      error: err?.message || "Failed to fetch completed tasks" 
    }, { status: 500 });
  }
}
