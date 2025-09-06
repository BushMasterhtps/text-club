import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const taskId = params.id;
    
    // Find the task by ID or rawMessageId
    const task = await prisma.task.findFirst({
      where: {
        OR: [
          { id: taskId },
          { rawMessageId: taskId }
        ]
      }
    });
    
    if (!task) {
      return NextResponse.json({ 
        success: false, 
        error: "Task not found" 
      }, { status: 404 });
    }
    
    // Unassign the task (set assignedToId to null and status to PENDING)
    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: {
        assignedToId: null,
        status: "PENDING",
        startTime: null,
        endTime: null,
        durationSec: null,
        disposition: null,
        assistanceNotes: null,
        managerResponse: null,
      }
    });
    
    return NextResponse.json({ 
      success: true, 
      task: updatedTask 
    });
    
  } catch (error) {
    console.error("Error unassigning task:", error);
    return NextResponse.json(
      { success: false, error: "Failed to unassign task" },
      { status: 500 }
    );
  }
}
