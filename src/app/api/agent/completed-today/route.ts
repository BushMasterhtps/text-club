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
      select: { id: true, isLive: true }
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    if (!user.isLive) {
      return NextResponse.json({ success: false, error: "User account is paused" }, { status: 403 });
    }

    // Get date boundaries - support date parameter for historical dates
    const dateParam = searchParams.get('date'); // Format: YYYY-MM-DD
    let startOfDay: Date;
    let endOfDay: Date;
    
    if (dateParam) {
      // Parse provided date
      const [year, month, day] = dateParam.split('-').map(Number);
      startOfDay = new Date(year, month - 1, day);
      endOfDay = new Date(year, month - 1, day + 1);
    } else {
      // Default to today
      const now = new Date();
      startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    }

    // Get completed tasks for today (including unassigned completed tasks, e.g., "Unable to Resolve" for Holds)
    const tasks = await prisma.task.findMany({
      where: {
        OR: [
          {
            assignedToId: user.id,
            status: "COMPLETED",
            endTime: {
              gte: startOfDay,
              lt: endOfDay
            }
          },
          {
            completedBy: user.id,
            status: "COMPLETED",
            endTime: {
              gte: startOfDay,
              lt: endOfDay
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
