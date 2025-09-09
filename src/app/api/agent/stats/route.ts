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

    // Calculate date range - use provided date or default to today
    let targetDate: Date;
    if (dateParam) {
      // Parse the date in local timezone, not UTC
      const [year, month, day] = dateParam.split('-').map(Number);
      targetDate = new Date(year, month - 1, day); // month is 0-indexed
      if (isNaN(targetDate.getTime())) {
        return NextResponse.json({ success: false, error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 });
      }
    } else {
      targetDate = new Date();
    }
    
    // Use local timezone for date calculations
    const dateStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const dateEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1);
    
    // Get all tasks for this user
    const tasks = await prisma.task.findMany({
      where: { assignedToId: user.id },
      select: {
        status: true,
        startTime: true,
        endTime: true,
        durationSec: true,
        assistanceNotes: true,
        createdAt: true
      }
    });

    // Calculate stats
    const assigned = tasks.filter(t => 
      ["PENDING", "IN_PROGRESS", "ASSISTANCE_REQUIRED"].includes(t.status)
    ).length;
    
    const completed = tasks.filter(t => {
      if (t.status !== "COMPLETED" || !t.endTime) return false;
      const endTime = new Date(t.endTime);
      return endTime >= dateStart && endTime < dateEnd;
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
      lastUpdate: targetDate.toLocaleDateString()
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
