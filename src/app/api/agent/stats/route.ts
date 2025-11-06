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
    let dateStart: Date;
    let dateEnd: Date;
    
    if (dateParam) {
      // Parse the date as PST time
      const [year, month, day] = dateParam.split('-').map(Number);
      if (isNaN(year) || isNaN(month) || isNaN(day)) {
        return NextResponse.json({ success: false, error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 });
      }
      
      // Create date in PST: Nov 5 00:00 PST = Nov 5 08:00 UTC
      const pstOffset = 8 * 60 * 60 * 1000; // 8 hours in milliseconds
      dateStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) + pstOffset);
      dateEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) + pstOffset);
    } else {
      // Use today in PST timezone
      const now = new Date();
      const pstOffset = 8 * 60 * 60 * 1000; // 8 hours in milliseconds
      const nowPST = new Date(now.getTime() + pstOffset);
      const year = nowPST.getUTCFullYear();
      const month = nowPST.getUTCMonth();
      const day = nowPST.getUTCDate();
      
      dateStart = new Date(Date.UTC(year, month, day, 0, 0, 0, 0) + pstOffset);
      dateEnd = new Date(Date.UTC(year, month, day, 23, 59, 59, 999) + pstOffset);
    }
    
    // Get all tasks for this user (including sent-back tasks that are no longer assigned)
    const tasks = await prisma.task.findMany({
      where: { 
        OR: [
          { assignedToId: user.id },
          { sentBackBy: user.id } // Include tasks sent back by this user
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
        sentBackAt: true
      }
    });

    // Calculate stats
    const assigned = tasks.filter(t => 
      ["PENDING", "IN_PROGRESS", "ASSISTANCE_REQUIRED"].includes(t.status)
    ).length;
    
    const completed = tasks.filter(t => {
      // Count as completed if:
      // 1. Status is COMPLETED (normal completion)
      // 2. Status is PENDING but has sentBackBy (sent back tasks that still count as work done)
      if (!t.endTime) return false;
      const endTime = new Date(t.endTime);
      const isCompleted = t.status === "COMPLETED";
      const isSentBack = t.status === "PENDING" && t.sentBackBy; // Sent back tasks still count as work
      return (isCompleted || isSentBack) && endTime >= dateStart && endTime < dateEnd;
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
          if (end >= utcDateStart && end < utcDateEnd) {
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
