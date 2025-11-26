import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    const dateParam = searchParams.get('date'); // Optional date parameter (YYYY-MM-DD format)
    
    if (!email) {
      return NextResponse.json({ success: false, error: "Email parameter required" }, { status: 400 });
    }

    // Find the user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    // Calculate date range in PST timezone
    // Server runs in UTC, but users are in PST (UTC-8)
    // PST is 8 hours BEHIND UTC, so we SUBTRACT 8 hours
    let dateStart: Date;
    let dateEnd: Date;
    
    if (dateParam) {
      // Parse the date as PST time
      const [year, month, day] = dateParam.split('-').map(Number);
      if (isNaN(year) || isNaN(month) || isNaN(day)) {
        return NextResponse.json({ success: false, error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 });
      }
      
      // Create date in PST: Nov 5 00:00 PST = Nov 5 08:00 UTC
      dateStart = new Date(Date.UTC(year, month - 1, day, 8, 0, 0, 0)); // 8 AM UTC = 12 AM PST
      dateEnd = new Date(Date.UTC(year, month - 1, day + 1, 7, 59, 59, 999)); // Next day 7:59 AM UTC = 11:59 PM PST
    } else {
      // Use today in PST timezone
      const now = new Date();
      const pstOffset = -8 * 60 * 60 * 1000; // PST = UTC - 8 hours
      const nowPST = new Date(now.getTime() + pstOffset);
      const year = nowPST.getUTCFullYear();
      const month = nowPST.getUTCMonth();
      const day = nowPST.getUTCDate();
      
      dateStart = new Date(Date.UTC(year, month, day, 8, 0, 0, 0)); // 8 AM UTC = 12 AM PST
      dateEnd = new Date(Date.UTC(year, month, day + 1, 7, 59, 59, 999)); // Next day 7:59 AM UTC = 11:59 PM PST
    }
    
    // Get all tasks for this user (including sent-back tasks and completed tasks that are no longer assigned)
    const tasks = await prisma.task.findMany({
      where: { 
        OR: [
          { assignedToId: user.id },
          { sentBackBy: user.id }, // Include tasks sent back by this user
          { completedBy: user.id } // Include tasks completed by this user but now unassigned (e.g., "Unable to Resolve" for Holds)
        ]
      },
      select: {
        status: true,
        startTime: true,
        endTime: true,
        durationSec: true,
        assistanceNotes: true,
        createdAt: true,
        sentBackBy: true,
        sentBackAt: true,
        completedBy: true,
        completedAt: true
      }
    });

    // Calculate stats
    // Assigned = tasks currently in agent's queue (NOT sent back tasks!)
    const assigned = tasks.filter(t => {
      const isInQueue = ["PENDING", "IN_PROGRESS", "ASSISTANCE_REQUIRED"].includes(t.status);
      const wasSentBack = t.sentBackBy !== null; // Task was sent back, no longer "assigned"
      
      // Only count as assigned if it's in queue AND wasn't sent back
      return isInQueue && !wasSentBack;
    }).length;
    
    const completed = tasks.filter(t => {
      // Count as completed if:
      // 1. Status is COMPLETED (normal completion)
      // 2. Status is PENDING but has sentBackBy (sent back tasks that still count as work done)
      // 3. Status is COMPLETED and has completedBy (unassigned completed tasks, e.g., "Unable to Resolve" for Holds)
      if (!t.endTime && !t.completedAt) return false;
      const endTime = t.endTime ? new Date(t.endTime) : (t.completedAt ? new Date(t.completedAt) : null);
      if (!endTime) return false;
      const isCompleted = t.status === "COMPLETED";
      const isSentBack = t.status === "PENDING" && t.sentBackBy; // Sent back tasks still count as work
      const isCompletedByUser = t.status === "COMPLETED" && t.completedBy === user.id; // Unassigned completed tasks
      return (isCompleted || isSentBack || isCompletedByUser) && endTime >= dateStart && endTime < dateEnd;
    }).length;
    
    const assistanceSent = tasks.filter(t => 
      t.status === "ASSISTANCE_REQUIRED" && t.assistanceNotes
    ).length;

    // Calculate average duration from completed tasks for the selected date
    let totalDuration = 0;
    let durationCount = 0;
    
    tasks.forEach(task => {
      if (task.status === "COMPLETED" && task.startTime && task.endTime) {
        const start = new Date(task.startTime);
        const end = new Date(task.endTime);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          // Only include tasks completed on the selected date
          if (end >= dateStart && end < dateEnd) {
            const mins = Math.round((end.getTime() - start.getTime()) / 60000);
            totalDuration += mins;
            durationCount++;
          }
        }
      }
    });

    const avgDuration = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;

    const stats = {
      assigned,
      completed,
      avgDuration,
      assistanceSent,
      lastUpdate: dateStart.toLocaleDateString()
    };

    return NextResponse.json({ 
      success: true, 
      stats 
    });
  } catch (err: any) {
    console.error("Error fetching agent stats:", err);
    return NextResponse.json({ 
      success: false, 
      error: err?.message || "Failed to fetch stats" 
    }, { status: 500 });
  }
}
