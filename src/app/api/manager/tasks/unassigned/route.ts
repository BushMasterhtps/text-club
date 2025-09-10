// src/app/api/manager/tasks/unassigned/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200);
    const taskType = url.searchParams.get("taskType");
    
    console.log(`[DEBUG] GET /api/manager/tasks/unassigned called with limit=${limit}, taskType=${taskType}`);
    
    // Build where clause with optional task type filter
    const whereClause: any = {
      assignedToId: null,
      status: "PENDING",
    };
    
    if (taskType) {
      whereClause.taskType = taskType;
    }
    
    // First, try to find existing unassigned PENDING tasks
    let tasks = await prisma.task.findMany({
      where: whereClause,
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { id: true },
    });
    
    console.log(`[DEBUG] Found ${tasks.length} existing unassigned PENDING tasks`);
    
    // If we don't have enough tasks, look for READY RawMessages that can be promoted
    if (tasks.length < limit) {
      const remainingNeeded = limit - tasks.length;
      console.log(`[DEBUG] Need ${remainingNeeded} more tasks, looking for READY RawMessages`);
      
      const readyRawMessages = await prisma.rawMessage.findMany({
        where: {
          status: "READY",
        },
        orderBy: { createdAt: "asc" },
        take: remainingNeeded,
        select: { id: true },
      });
      
      console.log(`[DEBUG] Found ${readyRawMessages.length} READY RawMessages`);
      
      // Return both existing tasks and ready raw messages
      return NextResponse.json({ 
        success: true, 
        taskIds: tasks.map(t => t.id),
        rawMessageIds: readyRawMessages.map(r => r.id),
        count: tasks.length + readyRawMessages.length,
        needsPromotion: readyRawMessages.length > 0
      });
    }
    
    return NextResponse.json({ 
      success: true, 
      taskIds: tasks.map(t => t.id),
      rawMessageIds: [],
      count: tasks.length,
      needsPromotion: false
    });
  } catch (error) {
    console.error("[DEBUG] Error in GET /api/manager/tasks/unassigned:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Failed to fetch unassigned tasks" 
    }, { status: 500 });
  }
}
