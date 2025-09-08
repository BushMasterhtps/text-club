import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    // Get current date boundaries for "today"
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    // Get pending tasks (READY RawMessages + PENDING Tasks) - TEXT CLUB ONLY
    const [pendingRawMessages, pendingTasks] = await Promise.all([
      prisma.rawMessage.count({
        where: { status: "READY" }
      }),
      prisma.task.count({
        where: { 
          status: "PENDING",
          taskType: "TEXT_CLUB" // Only Text Club tasks
        }
      })
    ]);

    // Get spam review count - TEXT CLUB ONLY
    const spamReview = await prisma.task.count({
      where: { 
        status: "SPAM_REVIEW",
        taskType: "TEXT_CLUB" // Only Text Club tasks
      }
    });

    // Get completed today count - TEXT CLUB ONLY
    const completedToday = await prisma.task.count({
      where: {
        status: "COMPLETED",
        taskType: "TEXT_CLUB", // Only Text Club tasks
        endTime: {
          gte: startOfToday,
          lt: endOfToday
        }
      }
    });

    // Get total completed count (all-time) - TEXT CLUB ONLY
    const totalCompleted = await prisma.task.count({
      where: { 
        status: "COMPLETED",
        taskType: "TEXT_CLUB" // Only Text Club tasks
      }
    });

    // Get in progress count - TEXT CLUB ONLY
    const inProgress = await prisma.task.count({
      where: { 
        status: "IN_PROGRESS",
        taskType: "TEXT_CLUB" // Only Text Club tasks
      }
    });

    // Get assistance required count - TEXT CLUB ONLY
    const assistanceRequired = await prisma.task.count({
      where: { 
        status: "ASSISTANCE_REQUIRED",
        taskType: "TEXT_CLUB" // Only Text Club tasks
      }
    });

    const totalPending = pendingRawMessages + pendingTasks; // Count both raw messages and pending tasks
    const totalAll = totalPending + spamReview + totalCompleted + inProgress + assistanceRequired;
    const pctDone = totalAll > 0 ? Math.round((totalCompleted / totalAll) * 100) : 0;

    return NextResponse.json({
      success: true,
      metrics: {
        pending: totalPending,
        pendingRawMessages, // Include raw message count separately
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
