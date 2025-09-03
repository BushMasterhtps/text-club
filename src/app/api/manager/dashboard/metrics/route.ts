import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    // Get current date boundaries for "today"
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    // Get pending tasks (READY RawMessages + PENDING Tasks)
    const [pendingRawMessages, pendingTasks] = await Promise.all([
      prisma.rawMessage.count({
        where: { status: "READY" }
      }),
      prisma.task.count({
        where: { status: "PENDING" }
      })
    ]);

    // Get spam review count
    const spamReview = await prisma.task.count({
      where: { status: "SPAM_REVIEW" }
    });

    // Get completed today count
    const completedToday = await prisma.task.count({
      where: {
        status: "COMPLETED",
        endTime: {
          gte: startOfToday,
          lt: endOfToday
        }
      }
    });

    // Get total completed count (all-time)
    const totalCompleted = await prisma.task.count({
      where: { status: "COMPLETED" }
    });

    // Get in progress count
    const inProgress = await prisma.task.count({
      where: { status: "IN_PROGRESS" }
    });

    // Get assistance required count
    const assistanceRequired = await prisma.task.count({
      where: { status: "ASSISTANCE_REQUIRED" }
    });

    const totalPending = pendingRawMessages + pendingTasks;
    const totalAll = totalPending + spamReview + totalCompleted + inProgress + assistanceRequired;
    const pctDone = totalAll > 0 ? Math.round((totalCompleted / totalAll) * 100) : 0;

    return NextResponse.json({
      success: true,
      metrics: {
        pending: totalPending,
        spamReview,
        completedToday,
        totalCompleted,
        inProgress,
        assistanceRequired,
        totalAll,
        pctDone
      }
    });

  } catch (error) {
    console.error("Error fetching dashboard metrics:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch dashboard metrics" },
      { status: 500 }
    );
  }
}
