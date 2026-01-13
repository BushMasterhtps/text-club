import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TaskStatus } from '@prisma/client';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const taskId = params.id;
    const body = await request.json();
    const { agentId } = body;

    if (!taskId || !agentId) {
      return NextResponse.json({
        success: false,
        error: 'Task ID and Agent ID are required',
      }, { status: 400 });
    }

    // Find the task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { 
        id: true, 
        assignedToId: true, 
        status: true,
        taskType: true 
      },
    });

    if (!task) {
      return NextResponse.json({
        success: false,
        error: 'Task not found',
      }, { status: 404 });
    }

    // Verify the agent exists
    const agent = await prisma.user.findUnique({
      where: { id: agentId },
      select: { id: true, name: true, email: true },
    });

    if (!agent) {
      return NextResponse.json({
        success: false,
        error: 'Agent not found',
      }, { status: 404 });
    }

    // Update the task assignment (this will automatically unassign from previous agent)
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        assignedToId: agentId,
        // Status logic: PENDING when assigned (agent must click Start to begin)
        status: TaskStatus.PENDING,
        // Clear any previous task data when reassigning
        startTime: null,
        endTime: null,
        durationSec: null,
        disposition: null,
        assistanceNotes: null,
        managerResponse: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Task assigned to ${agent.name}`,
      task: {
        id: updatedTask.id,
        assignedToId: updatedTask.assignedToId,
        status: updatedTask.status,
        taskType: updatedTask.taskType,
      },
    });
  } catch (error) {
    console.error('Error assigning task:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to assign task',
    }, { status: 500 });
  }
}
