import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    
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
    
    const completed = tasks.filter(t => t.status === "COMPLETED").length;
    
    const assistanceSent = tasks.filter(t => 
      t.status === "ASSISTANCE_REQUIRED" && t.assistanceNotes
    ).length;

    // Calculate average duration from completed tasks
    let totalDuration = 0;
    let durationCount = 0;
    
    tasks.forEach(task => {
      if (task.status === "COMPLETED" && task.startTime && task.endTime) {
        const start = new Date(task.startTime);
        const end = new Date(task.endTime);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          const mins = Math.round((end.getTime() - start.getTime()) / 60000);
          totalDuration += mins;
          durationCount++;
        }
      }
    });

    const avgDuration = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;
    const today = new Date();

    const stats = {
      assigned,
      completed,
      avgDuration,
      assistanceSent,
      lastUpdate: today.toLocaleDateString()
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
